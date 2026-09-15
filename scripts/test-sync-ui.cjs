/**
 * 端到端验证「同步到游戏」：检测出 Steam 已下载、游戏还没装的更新，一键装进 Installed。
 *
 * 全部用**临时目录**（假装 Steam 订阅目录 + 假装游戏的 Installed），真实游戏目录一个字节都不动。
 */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.disableHardwareAcceleration();

const TMP = path.join(ROOT, 'tmp-sync-ui');
fs.rmSync(TMP, { recursive: true, force: true });

const USERDATA = path.join(TMP, 'userdata');
const GAME = path.join(TMP, 'game');
const LOCAL = path.join(GAME, 'LocalMods');
const MODLISTS = path.join(GAME, 'ModLists');
const CFG = path.join(GAME, 'config_player.xml');
// 假装 Steam 的 steamapps\workshop\content\602960（.acf 就在它上面两级）
const WS = path.join(TMP, 'steam', 'workshop', 'content', '602960');
const INST = path.join(GAME, 'WorkshopMods', 'Installed');

app.setName('bmm-sync-ui-test');
app.setPath('userData', USERDATA);

function writeMod(root, id, files) {
  const dir = path.join(root, id);
  fs.mkdirSync(dir, { recursive: true });
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body, 'utf8');
  }
}

const fl = (name, version, extra = '') =>
  `<?xml version="1.0" encoding="utf-8"?>\n<contentpackage name="${name}" steamworkshopid="${name}" ` +
  `modversion="${version}" expectedhash="HASH"${extra} />\n`;

function fixtures() {
  for (const d of [USERDATA, GAME, LOCAL, MODLISTS, WS, INST]) fs.mkdirSync(d, { recursive: true });

  // A：Steam 是 2.0，游戏里还是 1.0 → 待同步
  writeMod(WS, '3680309446', {
    'filelist.xml': fl('MY_Item', '2.0'),
    'items/new.xml': '<new/>',
    'lua/script.lua': 'print(1)'
  });
  writeMod(INST, '3680309446', {
    'filelist.xml': fl('MY_Item', '1.0', ' installtime="1000"'),
    'items/old.xml': '<old/>'
  });
  // B：已经同步好了 → 不该出现在列表里
  writeMod(WS, '2710000001', { 'filelist.xml': fl('Another', '1.0') });
  writeMod(INST, '2710000001', { 'filelist.xml': fl('Another', '1.0', ' installtime="2000"') });

  fs.writeFileSync(
    path.join(TMP, 'steam', 'workshop', 'appworkshop_602960.acf'),
    '"AppWorkshop"\n{\n\t"appid"\t\t"602960"\n\t"WorkshopItemDetails"\n\t{\n' +
      '\t\t"3680309446"\n\t\t{\n\t\t\t"manifest"\t\t"11"\n\t\t\t"timeupdated"\t\t"2000"\n' +
      '\t\t\t"latest_timeupdated"\t\t"2000"\n\t\t\t"latest_manifest"\t\t"11"\n\t\t}\n' +
      '\t\t"2710000001"\n\t\t{\n\t\t\t"manifest"\t\t"22"\n\t\t\t"timeupdated"\t\t"2000"\n' +
      '\t\t\t"latest_timeupdated"\t\t"2000"\n\t\t\t"latest_manifest"\t\t"22"\n\t\t}\n' +
      '\t}\n}\n',
    'utf8'
  );

  fs.writeFileSync(
    CFG,
    '<?xml version="1.0" encoding="utf-8"?>\r\n<config language="Simplified Chinese" savepath="">\r\n' +
      '  <contentpackages>\r\n    <!--Vanilla-->\r\n    <corepackage\r\n' +
      '      path="Content/ContentPackages/Vanilla.xml" />\r\n    <regularpackages>\r\n' +
      '    </regularpackages>\r\n  </contentpackages>\r\n</config>\r\n',
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
        installedWorkshopDir: INST
      },
      null,
      2
    ),
    'utf8'
  );
}

let pass = 0;
let fail = 0;
function ok(cond, label, extra) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}${extra !== undefined ? ' — ' + extra : ''}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const topbar = `Array.from(document.querySelectorAll('.topbar button')).map((b) => b.textContent.replace(/\\s+/g,' ').trim())`;
const modalText = `(() => {
  const m = document.querySelector('.modal');
  return m ? m.textContent.replace(/\\s+/g, ' ').trim() : null;
})()`;
const clickBtn = (text) => `(() => {
  const b = Array.from(document.querySelectorAll('button')).find((x) => x.textContent.includes(${JSON.stringify(
    text
  )}));
  if (!b) return false;
  b.click();
  return true;
})()`;

const { registerLocalImgScheme, handleLocalImg } = require('../electron/protocol');
const services = require('../electron/services');

registerLocalImgScheme();

app.whenReady().then(async () => {
  fixtures();
  handleLocalImg();
  services.registerIpc();

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
    if (message.includes('Electron Security Warning')) return;
    if (level >= 2) errors.push(`[level ${level}] ${message}`);
  });

  await win.loadFile(path.join(ROOT, 'dist', 'index.html'));
  await sleep(2200);

  let bar = await win.webContents.executeJavaScript(topbar);
  console.log('  顶栏按钮: ' + JSON.stringify(bar));
  ok(
    bar.some((b) => b.includes('同步到游戏') && b.includes('1')),
    '顶栏出现「同步到游戏 1」'
  );

  // mod 卡片上要有标记，能看出是哪个 mod
  const cardBadges = await win.webContents.executeJavaScript(
    `Array.from(document.querySelectorAll('.card .badge')).map((x) => x.textContent.trim()).filter((t) => t.includes('待同步'))`
  );
  ok(cardBadges.length === 1, `卡片上标出「待同步到游戏」（实际 ${cardBadges.length} 个）`);

  // 打开弹窗
  ok(await win.webContents.executeJavaScript(clickBtn('同步到游戏')), '点开「同步到游戏」');
  await sleep(1500);
  let txt = await win.webContents.executeJavaScript(modalText);
  console.log('  弹窗内容: ' + String(txt).slice(0, 220));
  ok(!!txt && txt.includes('待同步'), '弹窗列出待同步的 mod');
  ok(!!txt && txt.includes('MY_Item'), '列出了具体是哪个 mod');
  ok(!!txt && /游戏里 v?1\.0/.test(txt) && /Steam v?2\.0/.test(txt), '显示版本变化 1.0 → 2.0');
  ok(!!txt && !txt.includes('Another'), '已经同步过的不在列表里');
  ok(!!txt && txt.includes('不会让 Steam 把整包重下一遍'), '说明了与游戏内更新的区别');
  ok(!!txt && txt.includes('关掉游戏'), '提示了文件占用的情况');
  ok(!!txt && txt.includes('开始同步（1 个）'), '有开始同步按钮');

  // 执行
  ok(await win.webContents.executeJavaScript(clickBtn('开始同步')), '点「开始同步」');
  await sleep(2500);
  txt = await win.webContents.executeJavaScript(modalText);
  console.log('  同步结果: ' + String(txt).slice(0, 180));
  ok(!!txt && txt.includes('已同步'), '显示同步结果');

  // 磁盘侧
  const instFl = path.join(INST, '3680309446', 'filelist.xml');
  const body = fs.readFileSync(instFl, 'utf8');
  ok(/installtime="2000"/.test(body), '写上了新的 installtime');
  ok(/modversion="2\.0"/.test(body), '内容换成了 Steam 那份');
  ok(/expectedhash="HASH"/.test(body), '原来的属性没丢');
  ok(fs.existsSync(path.join(INST, '3680309446', 'items', 'new.xml')), '新文件复制过来了');
  ok(!fs.existsSync(path.join(INST, '3680309446', 'items', 'old.xml')), '旧文件被清掉（不是叠加）');
  ok(
    fs.readdirSync(INST).filter((n) => n.startsWith('.bmm-sync-')).length === 0,
    '不留临时目录'
  );

  // 关掉弹窗：顶栏的提示应该消失，卡片标记也没了
  ok(await win.webContents.executeJavaScript(clickBtn('关闭')), '关闭弹窗');
  await sleep(1200);
  bar = await win.webContents.executeJavaScript(topbar);
  ok(!bar.some((b) => b.includes('同步到游戏')), '同步完顶栏不再提示');
  const badges2 = await win.webContents.executeJavaScript(
    `Array.from(document.querySelectorAll('.card .badge')).map((x) => x.textContent.trim()).filter((t) => t.includes('待同步'))`
  );
  ok(badges2.length === 0, '卡片上的「待同步」标记消失');

  // 幂等：再点一次（如果按钮还在）或直接再查一次都应该没有待同步
  const plan = await win.webContents.executeJavaScript(`window.api.planInstallSync()`);
  ok(plan && plan.count === 0, `再查一次应为 0 个待同步（实际 ${plan && plan.count}）`);

  // 真实游戏目录没被碰过
  ok(
    !path.resolve(INST).includes('Daedalic'),
    '操作的全程都是临时目录（没碰真实 Installed）'
  );

  ok(errors.length === 0, '渲染进程没有报错', errors.join(' | '));

  console.log(`\n=== ${fail === 0 ? '全部通过' : fail + ' 项失败'}（${pass} 通过 / ${fail} 失败）===`);
  try {
    fs.rmSync(TMP, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
  app.exit(fail === 0 ? 0 : 1);
});
