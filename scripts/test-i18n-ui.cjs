/**
 * 界面语言（i18n）自检。
 *
 * 覆盖两种变体，用同一套断言：
 *   - 创意工坊版：设置里有语言选择器，切到 English 后整个界面变英文，且**重启后记得住**
 *   - 完整版：没有语言选择器，即使 localStorage 里被人写进 'en' 也仍然锁死中文
 *     （原因见 src/features.ts 的 languageSwitch 注释：浏览工坊页未翻 + 主进程提示语走对照表）
 *
 * 具体测哪种，取决于 dist 是用哪个变体构建的。脚本自己探测：设置页里有没有语言面板。
 *
 * 前置：dist 必须已经构建过（工坊版用 `$env:BMM_VARIANT='workshop'; vite build`）。
 */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.disableHardwareAcceleration();

const TMP = path.join(ROOT, 'tmp-i18n-ui');
fs.rmSync(TMP, { recursive: true, force: true });
const USERDATA = path.join(TMP, 'userdata');
const GAME = path.join(TMP, 'game');

app.setName('bmm-i18n-ui-test');
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

/**
 * 防"自检在过期产物上通过"。
 *
 * 这个脚本加载的是**构建产物** `dist/index.html`，不是源码。改了 `src/` 却忘记重新构建时，
 * 它会在旧 bundle 上跑并给出通过结论 —— 既浪费时间又会误导（`docs/agents` 的 addendum 记过这条）。
 * 所以先比时间戳：任何源文件比 dist 新就直接失败。
 */
function assertDistFresh() {
  const distIndex = path.join(ROOT, 'dist', 'index.html');
  if (!fs.existsSync(distIndex)) {
    console.error('❌ dist/index.html 不存在 —— 请先构建（pnpm run build）');
    process.exit(1);
  }
  const distTime = fs.statSync(distIndex).mtimeMs;
  const newer = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx|css)$/.test(e.name) && fs.statSync(p).mtimeMs > distTime) {
        newer.push(path.relative(ROOT, p));
      }
    }
  };
  walk(path.join(ROOT, 'src'));
  for (const f of ['index.html', 'vite.config.ts']) {
    const p = path.join(ROOT, f);
    if (fs.existsSync(p) && fs.statSync(p).mtimeMs > distTime) newer.push(f);
  }
  if (newer.length) {
    console.error('❌ dist 已过期：以下源文件比 dist/index.html 新');
    for (const f of newer.slice(0, 10)) console.error('   ' + f);
    console.error('   先重新构建再跑这个自检，否则测的是旧代码。');
    process.exit(1);
  }
}

assertDistFresh();

const NAVS = `Array.from(document.querySelectorAll('.nav-item')).map((x) => x.textContent.trim())`;
const PAGE_TITLE = `(document.querySelector('.page-title') || {}).textContent || ''`;
/** 点侧栏里文字以某前缀开头的项 */
const goNav = (prefix) =>
  `Array.from(document.querySelectorAll('.nav-item')).find((x) => x.textContent.trim().startsWith(${JSON.stringify(
    prefix
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

  const js = (code) => win.webContents.executeJavaScript(code);

  // ---- 1) 默认语言 ----
  const navs0 = await js(NAVS);
  console.log('  默认导航: ' + JSON.stringify(navs0));
  const zhDefault = navs0.some((n) => n.startsWith('Mod 库'));
  const enDefault = navs0.some((n) => n.startsWith('Mod Library'));
  ok(zhDefault || enDefault, '侧栏渲染出了导航项', JSON.stringify(navs0));
  ok(!(zhDefault && enDefault), '不会中英混排');

  // ---- 2) 设置页里有没有语言选择器（= 这个 dist 是工坊版还是完整版）----
  await js(goNav(zhDefault ? '设置' : 'Settings'));
  await sleep(800);
  const settingsText = await js(`(document.querySelector('.settings') || {}).textContent || ''`);
  const hasSwitcher = settingsText.includes('界面语言') || settingsText.includes('Interface language');
  console.log(`  变体判定: ${hasSwitcher ? '创意工坊版（有语言选择器）' : '完整版（锁死中文）'}`);

  // ---- 3A) 工坊版：切到 English，界面应整体变英文 ----
  if (hasSwitcher) {
    const clicked = await js(`
      (() => {
        const b = Array.from(document.querySelectorAll('.settings .panel .seg button'))
          .find((x) => x.textContent.trim() === 'English');
        if (!b) return false;
        b.click();
        return true;
      })()
    `);
    ok(clicked, '设置里能找到并点击 English');
    await sleep(1200);

    const navsEn = await js(NAVS);
    console.log('  切换后导航: ' + JSON.stringify(navsEn));
    ok(navsEn.some((n) => n.startsWith('Mod Library')), '侧栏变成英文', JSON.stringify(navsEn));
    ok(!navsEn.some((n) => n.startsWith('Mod 库')), '中文项已消失（不是中英混排）');
    ok(
      !navsEn.some((n) => n.startsWith('浏览工坊')),
      '工坊版没有「Browse Workshop」之外的中文残留'
    );

    const titleEn = await js(PAGE_TITLE);
    ok(/[A-Za-z]/.test(titleEn) && !/[\u4e00-\u9fff]/.test(titleEn), '页面标题是英文', titleEn);

    const stored = await js(`localStorage.getItem('bmm.lang')`);
    ok(stored === 'en', '语言已写入 localStorage', String(stored));

    // ---- 4) 重载后记得住 ----
    await win.webContents.reload();
    await sleep(2200);
    const navsReload = await js(NAVS);
    ok(
      navsReload.some((n) => n.startsWith('Mod Library')),
      '重载后仍然是英文（设置记得住）',
      JSON.stringify(navsReload)
    );

    // 切回中文，确认双向可用
    await js(goNav('Settings'));
    await sleep(700);
    const back = await js(`
      (() => {
        const b = Array.from(document.querySelectorAll('.settings .panel .seg button'))
          .find((x) => x.textContent.trim() === '中文');
        if (!b) return false;
        b.click();
        return true;
      })()
    `);
    ok(back, '能切回中文');
    await sleep(1000);
    const navsZh = await js(NAVS);
    ok(navsZh.some((n) => n.startsWith('Mod 库')), '切回中文后侧栏恢复', JSON.stringify(navsZh));
  } else {
    // ---- 3B) 完整版：即使硬写 lang=en 也必须还是中文 ----
    await js(`localStorage.setItem('bmm.lang', 'en')`);
    await win.webContents.reload();
    await sleep(2200);
    const navs = await js(NAVS);
    console.log('  写入 en 之后导航: ' + JSON.stringify(navs));
    ok(navs.some((n) => n.startsWith('Mod 库')), '完整版锁死中文（忽略 localStorage 的 en）', JSON.stringify(navs));
    ok(
      !settingsText.toLowerCase().includes('interface language'),
      '完整版设置里没有语言选择器'
    );
  }

  // ---- 5) 没有渲染层报错 ----
  ok(errors.length === 0, '渲染层没有报错', errors.slice(0, 3).join(' | '));

  console.log('');
  if (fail === 0) console.log(`=== 全部通过（${pass} 通过 / 0 失败）===`);
  else console.log(`=== 有失败（${pass} 通过 / ${fail} 失败）===`);
  app.exit(fail === 0 ? 0 : 1);
});
