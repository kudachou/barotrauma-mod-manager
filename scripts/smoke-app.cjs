/**
 * 端到端自检：用真实主进程 + 真实 IPC + 真实目录 加载界面，
 * 验证读到的是真实数据（22 本地 + 103 工坊）、封面能联网抓取、无控制台报错。
 */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const services = require('../electron/services');
const { registerLocalImgScheme, handleLocalImg } = require('../electron/protocol');

// 用 electron 直接跑脚本时 app 名会退化成 "Electron"，需与真实应用（package.json 的
// productName）对齐，否则 userData 落在别处：封面缓存无法复用、也验证不到真实路径。
const pkg = require('../package.json');
app.setName(pkg.productName || pkg.name);

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.disableHardwareAcceleration();
registerLocalImgScheme();

const OUT = path.join(__dirname, '..', 'shots');
fs.mkdirSync(OUT, { recursive: true });

const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(win, name) {
  const img = await win.webContents.capturePage();
  const png = img.toPNG();
  fs.writeFileSync(path.join(OUT, name + '.png'), png);
  console.log(`saved ${name}.png ${png.length} bytes`);
}

const probe = `(() => ({
  hasApi: !!window.api,
  previewMode: !!document.querySelector('.warn-bar'),
  modePill: (document.querySelector('.mode-pill') || {}).textContent || null,
  cards: document.querySelectorAll('.card').length,
  localCards: document.querySelectorAll('.card .badge.src-local').length,
  workshopCards: document.querySelectorAll('.card .badge.src-workshop').length,
  covers: document.querySelectorAll('.card-cover img').length,
  placeholders: document.querySelectorAll('.card-cover .cover-ph').length,
  outdated: document.querySelectorAll('.card .badge.st-older').length,
  newer: document.querySelectorAll('.card .badge.st-newer').length,
  same: document.querySelectorAll('.card .badge.st-same').length,
  pageTitle: (document.querySelector('.page-title') || {}).textContent || null
}))()`;

app.whenReady().then(async () => {
  console.log('appName = ' + app.getName());
  console.log('userData = ' + app.getPath('userData'));
  handleLocalImg();
  services.registerIpc();

  const win = new BrowserWindow({
    width: 1420,
    height: 920,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
      contextIsolation: true,
      backgroundThrottling: false,
      offscreen: true
    }
  });

  win.webContents.on('console-message', (_e, level, message, _line, sourceId) => {
    if (level >= 2) errors.push(`[level ${level}] ${message} (${sourceId})`);
  });
  win.webContents.on('did-fail-load', (_e, code, desc, url) =>
    errors.push(`did-fail-load ${code} ${desc} ${url}`)
  );
  win.webContents.on('render-process-gone', (_e, d) =>
    errors.push(`render-gone ${JSON.stringify(d)}`)
  );

  await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  await sleep(2500);

  console.log('初始: ' + JSON.stringify(await win.webContents.executeJavaScript(probe)));

  // 等封面联网抓取（限流 4 并发 / 300ms 间隔）
  console.log('等待封面抓取…');
  let last = -1;
  for (let i = 0; i < 14; i++) {
    await sleep(2500);
    const n = await win.webContents.executeJavaScript(
      `document.querySelectorAll('.card-cover img').length`
    );
    if (n !== last) {
      console.log(`  已加载封面: ${n}`);
      last = n;
    }
  }
  console.log('抓取后: ' + JSON.stringify(await win.webContents.executeJavaScript(probe)));
  await shot(win, '10-real-library');
  await win.webContents.executeJavaScript(`window.scrollTo(0,0)`);

  // 滚到有封面的区域再截一张，确认 local-img 协议能显示真实图片
  await win.webContents.executeJavaScript(`document.querySelector('.lib-scroll').scrollTop = 900`);
  await sleep(500);
  await shot(win, '11-real-library-scrolled');

  // 合集页：真实合集（按文字点导航，别用下标 —— 导航项数量会变）
  await win.webContents.executeJavaScript(
    `Array.from(document.querySelectorAll('.nav-item')).find((x) => x.textContent.trim().startsWith('合集')).click()`
  );
  await sleep(1200);
  console.log(
    '合集页: ' +
      JSON.stringify(
        await win.webContents.executeJavaScript(`(() => ({
          rows: document.querySelectorAll('.list-row').length,
          names: Array.from(document.querySelectorAll('.list-row-name')).map((x) => x.textContent.trim()),
          modRows: document.querySelectorAll('.mod-row').length,
          missing: Array.from(document.querySelectorAll('.badge.st-different')).map((x) => x.textContent.trim()),
          header: (document.querySelector('.editor-head input') || {}).value || null
        }))()`)
      )
  );
  await shot(win, '12-real-collections');

  // 存档页：真实存档（只读；解析的是真实 .save，但一个字节都不改）
  await win.webContents.executeJavaScript(
    `Array.from(document.querySelectorAll('.nav-item')).find((x) => x.textContent.trim().startsWith('存档')).click()`
  );
  await sleep(2500);
  console.log(
    '存档页: ' +
      JSON.stringify(
        await win.webContents.executeJavaScript(`(() => ({
          rows: Array.from(document.querySelectorAll('.list-row')).map((r) =>
            r.textContent.replace(/\\s+/g, ' ').trim()
          ),
          saveDir: (document.querySelector('.list-foot') || {}).textContent || null,
          detailMods: document.querySelectorAll('.editor .mod-row').length,
          buttons: Array.from(document.querySelectorAll('.editor-head button')).map((b) => b.textContent.trim())
        }))()`)
      )
  );
  await shot(win, '21-real-saves');

  // 设置页：真实路径校验
  await win.webContents.executeJavaScript(
    `Array.from(document.querySelectorAll('.nav-item')).find((x) => x.textContent.trim().startsWith('设置')).click()`
  );
  await sleep(1400);
  console.log(
    '设置页: ' +
      JSON.stringify(
        await win.webContents.executeJavaScript(`(() => ({
          okPaths: document.querySelectorAll('.path-status.ok').length,
          badPaths: document.querySelectorAll('.path-status.bad').length,
          total: document.querySelectorAll('.path-row').length
        }))()`)
      )
  );
  await shot(win, '13-real-settings');

  console.log('ERRORS ' + JSON.stringify(errors, null, 1));
  app.exit(0);
});
