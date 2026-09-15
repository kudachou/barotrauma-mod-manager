/**
 * 「浏览工坊」页的自检（beta）。
 *
 * 刻意不依赖"现场搜索结果"：只测两条**确定**的真实路径
 *   1) 没配 Steam Web API Key → 页面提示去设置里填，并且按钮真的能跳到设置页
 *   2) 配了一个无效 key → 真的去问 Steam，回来给出可操作的错误提示（不是 ECONNRESET 那种）
 * 数据网格本身用预览模式（shots.cjs）覆盖。
 */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.disableHardwareAcceleration();

const TMP = path.join(ROOT, 'tmp-browse-ui');
fs.rmSync(TMP, { recursive: true, force: true });
const USERDATA = path.join(TMP, 'userdata');
const GAME = path.join(TMP, 'game');

app.setName('bmm-browse-ui-test');
app.setPath('userData', USERDATA);

function fixtures() {
  for (const d of [USERDATA, GAME, path.join(GAME, 'LocalMods'), path.join(GAME, 'ModLists')]) {
    fs.mkdirSync(d, { recursive: true });
  }
  fs.writeFileSync(
    path.join(GAME, 'config_player.xml'),
    '<?xml version="1.0" encoding="utf-8"?>\n<config>\n  <contentpackages>\n' +
      '    <corepackage path="Content/ContentPackages/Vanilla.xml" />\n' +
      '    <regularpackages>\n    </regularpackages>\n  </contentpackages>\n</config>\n',
    'utf8'
  );
  fs.writeFileSync(
    path.join(USERDATA, 'settings.json'),
    JSON.stringify(
      {
        gameDir: GAME,
        modListsDir: path.join(GAME, 'ModLists'),
        localModsDir: path.join(GAME, 'LocalMods'),
        configPlayerPath: path.join(GAME, 'config_player.xml'),
        workshopModsDir: path.join(GAME, 'workshop'),
        installedWorkshopDir: path.join(GAME, 'Installed')
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
const pageText = `(document.querySelector('.content') || {}).textContent || ''`;
const title = `(document.querySelector('.page-title') || {}).textContent || ''`;
const goNav = (label) =>
  `Array.from(document.querySelectorAll('.nav-item')).find((x) => x.textContent.trim().startsWith(${JSON.stringify(
    label
  )})).click()`;

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
  await sleep(2000);

  // 导航里有这一项
  const navs = await win.webContents.executeJavaScript(
    `Array.from(document.querySelectorAll('.nav-item')).map((x) => x.textContent.trim())`
  );
  ok(navs.some((n) => n.startsWith('浏览工坊')), '侧边栏有「浏览工坊」入口', JSON.stringify(navs));

  // ---- 1) 没配 API Key ----
  await win.webContents.executeJavaScript(goNav('浏览工坊'));
  await sleep(2500);
  ok((await win.webContents.executeJavaScript(title)).includes('浏览工坊'), '进入了浏览工坊页');
  let txt = await win.webContents.executeJavaScript(pageText);
  console.log('  页面文本: ' + String(txt).replace(/\s+/g, ' ').slice(0, 160));
  ok(txt.includes('需要 Steam Web API Key'), '没配 key 时明确提示需要 API Key');
  ok(txt.includes('dev/apikey'), '告诉用户去哪申请');
  ok(txt.includes('去设置里填 Key'), '给出跳转设置的按钮');

  // 按钮真的能跳到设置页
  const jumped = await win.webContents.executeJavaScript(`(() => {
    const b = Array.from(document.querySelectorAll('button')).find((x) => x.textContent.includes('去设置里填 Key'));
    if (!b) return false;
    b.click();
    return true;
  })()`);
  await sleep(900);
  ok(jumped, '点了「去设置里填 Key」');
  ok((await win.webContents.executeJavaScript(title)).includes('设置'), '确实跳到了设置页');

  // ---- 2) 配一个无效 key：应该真的去问 Steam 并给出人话错误 ----
  fs.writeFileSync(
    path.join(USERDATA, 'steam-api-key.json'),
    JSON.stringify({ key: 'BOGUS_KEY_FOR_TEST' }),
    'utf8'
  );
  await win.webContents.executeJavaScript(goNav('浏览工坊'));
  await sleep(1000);
  // 重新进页面会重新拉；保险起见再点一次刷新
  await win.webContents.executeJavaScript(`(() => {
    const b = Array.from(document.querySelectorAll('button')).find((x) => x.textContent.includes('刷新'));
    if (b) b.click();
    return !!b;
  })()`);
  // 轮询等待结果（网络在沙箱里可能抖动，最多等 25 秒）
  txt = '';
  for (let i = 0; i < 25; i++) {
    await sleep(1000);
    txt = await win.webContents.executeJavaScript(pageText);
    if (!txt.includes('正在读取创意工坊')) break;
  }
  console.log('  无效 key 时: ' + String(txt).replace(/\s+/g, ' ').slice(0, 200));
  ok(
    !txt.includes('正在读取创意工坊'),
    '无效 key 时不会一直卡在「读取中」'
  );
  ok(
    txt.includes('没读到工坊数据') || txt.includes('没有结果') || txt.includes('未订阅'),
    '无效 key 时给出明确结果页（不是空白/卡住）'
  );
  ok(
    /API Key|连不上 Steam|限流/.test(txt),
    '错误信息是可操作的说明，而不是把 ECONNRESET 甩出来',
    String(txt).slice(0, 200)
  );

  // 非法 id 走真实 IPC：应该被拒（证明这条链路真的接上了，且不会乱开东西）
  // 卡片上的按钮（「在 Steam 里打开」/「网页版」）在有数据的预览模式里断言 —— 见 shots.cjs，
  // 这里走的是"key 无效"路径，页面上没有卡片。
  const badId = await win.webContents.executeJavaScript(
    `window.api.openWorkshopInSteam('abc/../evil').then(() => 'NO-ERROR').catch((e) => String(e.message || e))`
  );
  ok(/非法的工坊 id/.test(badId), '非法 id 被主进程拒绝（不让外部字符串拼 steam:// 命令）');

  ok(errors.length === 0, '渲染进程没有报错', errors.join(' | '));

  console.log(`\n=== ${fail === 0 ? '全部通过' : fail + ' 项失败'}（${pass} 通过 / ${fail} 失败）===`);
  try {
    fs.rmSync(TMP, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
  app.exit(fail === 0 ? 0 : 1);
});
