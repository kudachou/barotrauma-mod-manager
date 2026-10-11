/**
 * 生成**创意工坊条目用的截图**（Mod 库 / 合集 / 存档 / 设置）。
 *
 * 与 `scripts/shots.cjs` 的区别：
 *   - `shots.cjs` 用内置**示例数据**生成 README 截图，并且默认拦截封面图（版权考虑）；
 *   - 这个脚本用**真实数据**（你的 mod、你的标签），封面**照常显示** —— 工坊条目里
 *     展示真实界面才有说服力（用户明确要求允许出现第三方封面）。
 *
 * ## 为什么不直接跑真实 userData
 *
 * 要切语言，程序会把语言写进 localStorage。为了**不污染你真实配置**，这里复制一份
 * userData 到 `tmp-shot-ud/`：只复制需要的那几样（previews 封面缓存 + 几个 json），
 * 不复制 `Local Storage`（这样没有存过语言 ⇒ 每次都按 --lang 自动检测，结果确定）。
 *
 * 用法：
 *   $env:BMM_SHOT_LANG='zh'; pnpm exec electron scripts/shots-workshop.cjs
 *   $env:BMM_SHOT_LANG='en'; pnpm exec electron scripts/shots-workshop.cjs
 *
 * 前置：dist 要用**工坊变体**构建（`$env:BMM_VARIANT='workshop'; pnpm run build`）。
 */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..');
const LANG = process.env.BMM_SHOT_LANG === 'zh' ? 'zh' : 'en';
const OUT = path.join(ROOT, 'workshop', 'screenshots');

// 受限环境下需要的开关
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.disableHardwareAcceleration();
/*
 * 决定首屏语言：临时 userData 里没有存过 bmm.lang，所以 detectLang() 会读 navigator.language，
 * 而它跟着这个开关走。于是 zh → 'zh-CN' → 中文界面；en → 'en-US' → 英文界面。
 */
app.commandLine.appendSwitch('lang', LANG === 'zh' ? 'zh-CN' : 'en-US');

/* ---------------------------- 临时 userData ---------------------------- */

const REAL_UD = path.join(process.env.APPDATA || '', '潜渊症Mod管理器');
/*
 * 临时 userData **按语言分开**。
 *
 * 为什么不能共用：程序"首次启动按系统语言检测并落盘"（见 src/i18n.ts loadSavedLang）。
 * 共用一个目录的话，第一轮以 zh 跑完就把 bmm.lang=zh 存进了 localStorage，
 * 第二轮即使 navigator.language=en-US 也会直接复用 zh —— 英文截图会悄悄变成中文。
 * （第一次共用目录时就踩到了：英文那轮侧栏还是「Mod 库/合集/存档/设置」。）
 */
const TMP_UD = path.join(ROOT, `tmp-shot-ud-${LANG}`);

/** 真实配置里需要带过来的东西：封面缓存 + 分类/设置等小文件（**不含** Local Storage） */
const SEED_FILES = [
  'settings.json',
  'categories.json',
  'relations.json',
  'workshop-checks.json',
  'steam-api-host.json'
];
const SEED_DIRS = ['previews', 'workshop', 'workshop-pages', 'translations'];

function seedUserData() {
  if (fs.existsSync(path.join(TMP_UD, 'settings.json'))) {
    console.log('[shots-workshop] 复用已有临时 userData');
    return;
  }
  console.log('[shots-workshop] 从真实 userData 播种临时副本（不含缓存与 Local Storage）');
  fs.mkdirSync(TMP_UD, { recursive: true });
  for (const f of SEED_FILES) {
    const src = path.join(REAL_UD, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(TMP_UD, f));
  }
  for (const d of SEED_DIRS) {
    const src = path.join(REAL_UD, d);
    if (fs.existsSync(src)) {
      fs.cpSync(src, path.join(TMP_UD, d), { recursive: true });
      console.log(`   已复制 ${d}/`);
    }
  }
}

seedUserData();
app.setName('bmm-shots-workshop');
app.setPath('userData', TMP_UD);

/* ------------------------------- 工具 ------------------------------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

async function shot(win, page) {
  const img = await win.webContents.capturePage();
  fs.mkdirSync(OUT, { recursive: true });
  const p = path.join(OUT, `${LANG}-${page}.png`);
  fs.writeFileSync(p, img.toPNG());
  console.log(`  已保存 ${path.relative(ROOT, p)}  (${(fs.statSync(p).size / 1024).toFixed(0)} KB)`);
}

/** 侧栏导航标签（工坊版没有「浏览工坊」那一项） */
const NAV = {
  library: ['Mod 库', 'Mod Library'],
  collections: ['合集', 'Collections'],
  saves: ['存档', 'Saves'],
  settings: ['设置', 'Settings']
};

const goNav = (key) => `(() => {
  const names = ${JSON.stringify(NAV[key])};
  const el = Array.from(document.querySelectorAll('.nav-item'))
    .find((x) => names.some((n) => x.textContent.trim().startsWith(n)));
  if (!el) return false;
  el.click();
  return true;
})()`;

/** 点某个分类芯片（分类名是数据主键，两种语言下都保持中文，所以直接用中文找） */
const clickChip = (name) => `(() => {
  const el = Array.from(document.querySelectorAll('.chips-row .tag-toggle'))
    .find((x) => x.textContent.trim().startsWith(${JSON.stringify(name)}));
  if (!el) return false;
  el.click();
  return true;
})()`;

/** 等卡片封面加载完（否则截图里会是占位色块） */
async function waitCovers(win) {
  let stat = { total: 0, loaded: 0 };
  for (let i = 0; i < 30; i++) {
    stat = await win.webContents.executeJavaScript(`(() => {
      const imgs = Array.from(document.querySelectorAll('.card-cover img'));
      return { total: imgs.length, loaded: imgs.filter((x) => x.complete && x.naturalWidth > 0).length };
    })()`);
    if (stat.total > 0 && stat.loaded >= stat.total) break;
    await sleep(400);
  }
  console.log(`  封面 ${stat.loaded}/${stat.total} 已加载`);
}

/* ------------------------------- 主流程 ------------------------------- */

const { registerLocalImgScheme, handleLocalImg } = require('../electron/protocol');
const services = require('../electron/services');

registerLocalImgScheme();

app.whenReady().then(async () => {
  handleLocalImg();
  services.registerIpc();

  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
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
    if (level >= 2) errors.push(message);
  });

  await win.loadFile(path.join(ROOT, 'dist', 'index.html'));
  await sleep(2500);

  const js = (code) => win.webContents.executeJavaScript(code);
  const navNow = await js("Array.from(document.querySelectorAll('.nav-item')).map(x=>x.textContent.trim())");
  console.log(
    `[shots-workshop] 语言=${LANG}  navigator.language=${await js('navigator.language')}  bmm.lang=${await js("localStorage.getItem('bmm.lang')")}`
  );
  console.log('  侧栏: ' + JSON.stringify(navNow));
  /*
   * 断言界面语言和请求的一致 —— 否则会拍出一整套**错语言**的截图而毫无察觉
   *（共用临时目录时就这样过一次）。
   */
  const libraryLabel = LANG === 'zh' ? 'Mod 库' : 'Mod Library';
  if (!navNow.some((n) => n.startsWith(libraryLabel))) {
    console.error(`❌ 界面语言不是 ${LANG}（侧栏里找不到「${libraryLabel}」）—— 中止，别产出错语言的截图`);
    app.exit(1);
    return;
  }

  // ---- 1) Mod 库：按下「基础框架」标签（封面要的就是这一屏）----
  const chipOk = await js(clickChip('基础框架'));
  console.log(`  点击「基础框架」芯片: ${chipOk ? '成功' : '没找到（下面会出现全部 mod）'}`);
  await sleep(600);
  await waitCovers(win);
  console.log('  结果计数: ' + (await js("(document.querySelector('.result-count')||{}).textContent || ''")).trim());
  await shot(win, 'library-tag');

  // ---- 2) 合集 ----
  await js(goNav('collections'));
  await sleep(1200);
  await shot(win, 'collections');

  // ---- 3) 存档 ----
  await js(goNav('saves'));
  await sleep(1600);
  await shot(win, 'saves');

  // ---- 4) 设置 ----
  await js(goNav('settings'));
  await sleep(900);
  await shot(win, 'settings');

  /*
   * ---- 5) 分类标签：打开指定 mod 的详情弹窗 ----
   *
   * 用哪个 mod 是**指定**的：`Item IO Framework`（用户选定的展示对象）。
   * 找不到时才退回"挑标签最多的那张卡片"——随便开一个可能只有一两个标签，
   * 看不出这个功能；但如果指定名字不存在（比如以后改名/取消订阅），
   * 也不能让脚本产出一张空白图。
   *
   * （工坊版里"工坊描述"整块是隐藏的，所以弹窗较短，分类标签自然就在首屏 —— 不用滚动。）
   */
  await js(goNav('library'));
  await sleep(900);
  const TAGS_MOD = 'Item IO Framework';
  const tagShot = await js(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const wanted = ${JSON.stringify(TAGS_MOD)};
    const nameOf = (c) => ((c.querySelector('.card-name') || {}).textContent || '').trim();
    const cards = Array.from(document.querySelectorAll('.card'));

    const named = cards.find((c) => nameOf(c).toLowerCase() === wanted.toLowerCase());
    if (named) {
      named.click();
      await sleep(700);
      const modal = document.querySelector('.modal');
      const toggles = modal ? Array.from(modal.querySelectorAll('.tag-toggle')) : [];
      // 注意：`.tag-toggle` 是**全部可选标签**（每个 mod 都一样多），
      // `.tag-toggle.on` 才是这个 mod 实际挂上的标签 —— 别把前者当成"标签数"。
      return {
        name: nameOf(named),
        on: toggles.filter((x) => x.classList.contains('on')).length,
        all: toggles.length,
        exact: true
      };
    }

    // 兜底：挑"实际挂上标签最多"的
    let best = { on: -1, all: 0, name: null };
    for (const c of cards.slice(0, 8)) {
      const name = nameOf(c);
      c.click();
      await sleep(420);
      const modal = document.querySelector('.modal');
      const toggles = modal ? Array.from(modal.querySelectorAll('.tag-toggle')) : [];
      const on = toggles.filter((x) => x.classList.contains('on')).length;
      if (on > best.on) best = { on, all: toggles.length, name };
      const close = document.querySelector('.modal-head .btn.icon, .modal .btn.icon');
      if (close) close.click();
      await sleep(260);
    }
    const again = cards.find((x) => nameOf(x) === best.name);
    if (again) again.click();
    return { ...best, exact: false };
  })()`);
  console.log(
    `  分类标签弹窗：${tagShot.name}（已挂 ${tagShot.on} 个 / 可选 ${tagShot.all} 个）` +
      (tagShot.exact ? '' : `  ⚠️ 没找到指定的 ${TAGS_MOD}，已退回标签最多的那张`)
  );
  await sleep(700);
  await shot(win, 'tags');
  await js(`(() => {
    const close = document.querySelector('.modal-head .btn.icon, .modal .btn.icon');
    if (close) close.click();
    return !!close;
  })()`);
  await sleep(400);

  // ---- 6) 导出界面：合集页 → 导出按钮 → 合集分享弹窗 ----
  await js(goNav('collections'));
  await sleep(1000);
  const openedShare = await js(`(() => {
    const labels = ${JSON.stringify(['导出', 'Export'])};
    const btn = Array.from(document.querySelectorAll('button'))
      .find((b) => labels.includes(b.textContent.trim()));
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  console.log(`  导出弹窗: ${openedShare ? '已打开' : '没找到导出按钮'}`);
  await sleep(900);
  await shot(win, 'export');

  console.log('渲染层报错: ' + (errors.length ? errors.slice(0, 3).join(' | ') : '无'));
  app.exit(0);
});
