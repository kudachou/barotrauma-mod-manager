/**
 * 端到端验证「应用到游戏」：**点一次**，界面立刻显示「当前应用」。
 *
 * 起因：用户反馈合集页点「应用到游戏」后，界面看起来没变化，以为没生效就又点了一次
 * （实际上第一次就写进 config 了，只是界面没刷新）。这里的断言就是钉死这个行为：
 *   - 点之前：一个「当前应用」标记都没有
 *   - 点一次之后：立刻出现「当前应用」标记
 *   - 磁盘上只出现一个固定备份 config_player.xml.bak
 *
 * 全程用**隔离的 userData + 临时游戏目录**，真实 config_player.xml 一个字节都不会动。
 */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.disableHardwareAcceleration();

const TMP = path.join(ROOT, 'tmp-apply-ui');
fs.rmSync(TMP, { recursive: true, force: true });

const USERDATA = path.join(TMP, 'userdata');
const GAME = path.join(TMP, 'game');
const LOCAL = path.join(GAME, 'LocalMods');
const WS = path.join(GAME, 'workshop');
const INSTALLED = path.join(GAME, 'Installed');
const MODLISTS = path.join(GAME, 'ModLists');
const CFG = path.join(GAME, 'config_player.xml');

app.setName('bmm-apply-ui-test');
app.setPath('userData', USERDATA);

/* ------------------------------ 造临时环境 ------------------------------ */

function writeMod(dir, folder, body) {
  fs.mkdirSync(path.join(dir, folder), { recursive: true });
  fs.writeFileSync(path.join(dir, folder, 'filelist.xml'), body, 'utf8');
}

function fixtures() {
  for (const d of [USERDATA, GAME, LOCAL, WS, INSTALLED, MODLISTS]) fs.mkdirSync(d, { recursive: true });

  writeMod(LOCAL, '测试本地mod', '<contentpackage name="测试本地mod" modversion="1.0" />');
  writeMod(INSTALLED, '2559634234', '<contentpackage name="LuaCsForBarotrauma" modversion="1.0" />');

  // 带 BOM + CRLF，且当前应用的是**另一个** mod —— 这样「应用」一定会改变配置
  const BOM = '\uFEFF';
  fs.writeFileSync(
    CFG,
    BOM +
      '<?xml version="1.0" encoding="utf-8"?>\r\n' +
      '<config language="English" savepath="">\r\n' +
      '  <contentpackages>\r\n' +
      '    <!--Vanilla-->\r\n' +
      '    <corepackage\r\n' +
      '      path="Content/ContentPackages/Vanilla.xml" />\r\n' +
      '    <regularpackages>\r\n' +
      '      <package\r\n' +
      '        path="old/filelist.xml" />\r\n' +
      '    </regularpackages>\r\n' +
      '  </contentpackages>\r\n' +
      '</config>\r\n',
    'utf8'
  );

  fs.writeFileSync(
    path.join(MODLISTS, '我的测试合集.xml'),
    '<?xml version="1.0" encoding="utf-8"?>\n' +
      '<mods name="我的测试合集">\n' +
      '  <Vanilla />\n' +
      '  <Workshop name="LuaCsForBarotrauma" id="2559634234" />\n' +
      '  <Local name="测试本地mod" />\n' +
      '</mods>\n',
    'utf8'
  );

  fs.writeFileSync(
    path.join(USERDATA, 'settings.json'),
    JSON.stringify(
      {
        gameDir: GAME,
        modListsDir: MODLISTS,
        localModsDir: LOCAL,
        configPlayerPath: CFG,
        workshopModsDir: WS,
        installedWorkshopDir: INSTALLED
      },
      null,
      2
    ),
    'utf8'
  );
}

/* --------------------------------- 断言 --------------------------------- */

let pass = 0;
let fail = 0;
function ok(cond, label, extra) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}${extra ? ' — ' + extra : ''}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const APPLIED_BADGES = `Array.from(document.querySelectorAll('.badge.applied')).map((x) => x.textContent.trim())`;
const APPLIED_ROW = `(() => {
  const row = document.querySelector('.list-row.applied-row');
  return row ? row.textContent.replace(/\\s+/g, ' ').trim() : null;
})()`;

/* ---------------------------------- 主流程 ---------------------------------- */

const { registerLocalImgScheme, handleLocalImg } = require('../electron/protocol');
const services = require('../electron/services');

registerLocalImgScheme();

app.whenReady().then(async () => {
  fixtures();
  handleLocalImg();
  services.registerIpc();

  console.log(`userData = ${app.getPath('userData')}`);
  ok(app.getPath('userData') === USERDATA, '用的是隔离的 userData', app.getPath('userData'));
  ok(
    !path.resolve(CFG).startsWith(path.resolve('D:/Steam')),
    '配置指向临时游戏目录（不是真实游戏目录）'
  );

  const errors = [];
  const win = new BrowserWindow({
    width: 1420,
    height: 920,
    show: false,
    webPreferences: {
      preload: path.join(ROOT, 'electron', 'preload.js'),
      contextIsolation: true,
      backgroundThrottling: false,
      offscreen: true
    }
  });
  win.webContents.on('console-message', (_e, level, message) => {
    // 未打包时 Electron 会警告没有 CSP（打包后就不出现），不是我们的问题
    if (message.includes('Electron Security Warning')) return;
    if (level >= 2) errors.push(`[level ${level}] ${message}`);
  });

  await win.loadFile(path.join(ROOT, 'dist', 'index.html'));
  await sleep(2000);

  // 切到合集页
  await win.webContents.executeJavaScript(
    `Array.from(document.querySelectorAll('.nav-item')).find((x) => x.textContent.includes('合集')).click()`
  );
  await sleep(1500);

  const before = await win.webContents.executeJavaScript(APPLIED_BADGES);
  const rowBefore = await win.webContents.executeJavaScript(APPLIED_ROW);
  console.log(`  点击前「当前应用」标记: ${JSON.stringify(before)}`);
  console.log(`  点击前当前应用的包: ${fs
    .readFileSync(CFG, 'utf8')
    .match(/path="([^"]*)"/g)
    .join(' , ')}`);
  ok(before.length === 0, '点击前没有任何「当前应用」标记（配置里是别的 mod）');
  ok(rowBefore !== null, '「游戏当前应用」那一行在');

  // 点一次「应用到游戏」
  const clicked = await win.webContents.executeJavaScript(`(() => {
    const b = Array.from(document.querySelectorAll('button')).find((x) => x.textContent.includes('应用到游戏'));
    if (!b) return false;
    b.click();
    return true;
  })()`);
  ok(clicked, '找到了「应用到游戏」按钮并点了一次');
  await sleep(2500);

  const after = await win.webContents.executeJavaScript(APPLIED_BADGES);
  const rowAfter = await win.webContents.executeJavaScript(APPLIED_ROW);
  console.log(`  点击后「当前应用」标记: ${JSON.stringify(after)}`);
  console.log(`  点击后那一行: ${JSON.stringify(rowAfter)}`);

  ok(after.length === 1, `点一次就出现 1 个「当前应用」标记（实际 ${after.length}）`);
  ok(after[0] === '当前应用', '标记文字就是「当前应用」');
  ok(
    typeof rowAfter === 'string' && /2/.test(rowAfter),
    '「游戏当前应用」显示应用后的 mod（应含 2 这个数量）',
    String(rowAfter)
  );

  // 磁盘侧：配置真的改了，且只有一个固定备份
  const cfgAfter = fs.readFileSync(CFG, 'utf8');
  ok(cfgAfter.includes('Installed/2559634234/filelist.xml'), '配置里写入了工坊 mod');
  ok(cfgAfter.includes('path="LocalMods/测试本地mod/filelist.xml"'), '配置里写入了本地 mod（相对形式）');
  ok(!cfgAfter.includes('old/filelist.xml'), '旧的 mod 已被替换');

  const baks = fs.readdirSync(GAME).filter((n) => n.startsWith('config_player.xml.bak'));
  console.log(`  备份文件: ${JSON.stringify(baks)}`);
  ok(baks.length === 1 && baks[0] === 'config_player.xml.bak', '只留下一个固定备份 config_player.xml.bak');
  ok(
    fs.readFileSync(path.join(GAME, 'config_player.xml.bak'), 'utf8').includes('old/filelist.xml'),
    '备份里是应用之前的那份配置'
  );

  ok(errors.length === 0, '渲染进程没有报错', errors.join(' | '));

  console.log(`\n=== ${fail === 0 ? '全部通过' : fail + ' 项失败'}（${pass} 通过 / ${fail} 失败）===`);

  // 收摊：删掉临时目录，别在仓库里留垃圾
  try {
    fs.rmSync(TMP, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
  app.exit(fail === 0 ? 0 : 1);
});
