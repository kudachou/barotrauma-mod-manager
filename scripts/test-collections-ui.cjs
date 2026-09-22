/**
 * 「游戏当前应用」的两种看法：紧凑列表 / 大卡片。
 *
 * 用**隔离的假游戏目录**（自己造一个 config_player.xml，里面指向两个假 mod），
 * 所以不需要动真实游戏目录就能让总览页有内容 —— 真实 config_player.xml 一个字节都不碰。
 */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.disableHardwareAcceleration();

const TMP = path.join(ROOT, 'tmp-collections-ui');
fs.rmSync(TMP, { recursive: true, force: true });

const USERDATA = path.join(TMP, 'userdata');
const GAME = path.join(TMP, 'game');
const LOCAL = path.join(GAME, 'LocalMods');
const MODLISTS = path.join(GAME, 'ModLists');
const CFG = path.join(GAME, 'config_player.xml');
const WS = path.join(TMP, 'steam', 'workshop', 'content', '602960');
const INST = path.join(GAME, 'WorkshopMods', 'Installed');

app.setName('bmm-collections-ui-test');
app.setPath('userData', USERDATA);

const fl = (name, version, extra = '', swid = null) =>
  `<?xml version="1.0" encoding="utf-8"?>\n<contentpackage name="${name}" ` +
  (swid ? `steamworkshopid="${swid}" ` : '') +
  `modversion="${version}"${extra} />\n`;

function writeMod(root, folder, files) {
  const dir = path.join(root, folder);
  fs.mkdirSync(dir, { recursive: true });
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body, 'utf8');
  }
}

function fixtures() {
  for (const d of [USERDATA, GAME, LOCAL, MODLISTS, WS, INST]) fs.mkdirSync(d, { recursive: true });

  /*
   * 关键：至少给一个 mod 放一张**真实图片**当封面。
   *
   * 这一步不是装饰 —— 用占位色块（.cover-ph）时，封面没有天然尺寸，
   * 网格行高塌成几十像素的 bug 会被完全掩盖（同一个 .card 有 overflow:hidden，
   * 它在网格里对行高的最小贡献是 0）。真实图片才会把「卡片被压扁、文字被裁掉」暴露出来。
   * 素材优先从真实预览缓存里借一张；没有就自己造一个 1x1 的 PNG（也够触发尺寸计算）。
   */
  let coverBytes = null;
  try {
    const previews = path.join(process.env.APPDATA || '', '潜渊症Mod管理器', 'previews');
    if (fs.existsSync(previews)) {
      const f = fs.readdirSync(previews).find((n) => /\.(png|jpg|jpeg|webp|gif|bmp)$/i.test(n));
      if (f) coverBytes = fs.readFileSync(path.join(previews, f));
    }
  } catch {
    /* 借不到就自己造 */
  }
  const realCover = coverBytes || Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAGQAAABGCAYAAAAhe6noAAAAOklEQVR42u3OMQEAAAgDoJnc6BpjDyQgdWXm5wEECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBDwF3wXfAGZ6n0iAAAAAElFTkSuQmCC',
    'base64'
  );
  for (const d of [USERDATA, GAME, LOCAL, MODLISTS, WS, INST]) fs.mkdirSync(d, { recursive: true });
  // 先建目录再写图，保证下面 writeMod 之前文件已在
  fs.mkdirSync(path.join(WS, '6610000001'), { recursive: true });
  fs.writeFileSync(path.join(WS, '6610000001', 'cover.png'), realCover);

  /*
   * 名字刻意带上能触发自动分类的关键词（舰船 / 武器 / 生物），
   * 这样卡片上的分类标签才有东西可断言。
   */
  writeMod(WS, '6610000001', {
    'filelist.xml': fl('OnePiece潜艇', '1.2', '', '6610000001'),
    'cover.png': realCover
  });
  writeMod(WS, '6610000002', { 'filelist.xml': fl('DeepSea武器包', '2.0', '', '6610000002') });
  // 一个本地 mod
  writeMod(LOCAL, '我的本地mod', { 'filelist.xml': fl('我的怪物扩展', '3.1') });

  /*
   * 假 config_player.xml：contentpackages 里按顺序写三条，
   * readAppliedPackages 只看路径形状（工坊=纯数字父目录、本地=其它目录名）。
   */
  const inst = INST.split(path.sep).join('/');
  fs.writeFileSync(
    CFG,
    '<?xml version="1.0" encoding="utf-8"?>\r\n<config language="Simplified Chinese" savepath="">\r\n' +
      '  <contentpackages>\r\n' +
      '    <corepackage path="Content/ContentPackages/Vanilla.xml" />\r\n' +
      '    <regularpackages>\r\n' +
      `      <package path="${inst}/6610000001/filelist.xml" />\r\n` +
      `      <package path="${inst}/6610000002/filelist.xml" />\r\n` +
      '      <package path="LocalMods/我的本地mod/filelist.xml" />\r\n' +
      '    </regularpackages>\r\n' +
      '  </contentpackages>\r\n</config>\r\n',
    'utf8'
  );

  // 一个合集，让左侧列表有东西（否则会停在一个空态上）
  fs.writeFileSync(
    path.join(MODLISTS, '测试合集.xml'),
    '<?xml version="1.0" encoding="utf-8"?>\n<mods name="测试合集">\n  <Vanilla />\n' +
      '  <Workshop name="OnePieceMod" id="6610000001" />\n</mods>\n',
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

  const js = (expr) => win.webContents.executeJavaScript(expr);

  /* ------------------------- 1. 进入「游戏当前应用」 ------------------------- */
  console.log('\n[1] 打开合集页的「游戏当前应用」');

  await js(`(() => {
    const s = Array.from(document.querySelectorAll('.nav-item')).find((x) => x.textContent.includes('合集'));
    if (s) s.click();
    return !!s;
  })()`);
  await sleep(1200);

  const opened = await js(`(() => {
    const row = Array.from(document.querySelectorAll('.list-row')).find((x) =>
      x.textContent.includes('游戏当前应用')
    );
    if (!row) return false;
    row.click();
    return true;
  })()`);
  ok(opened, '左侧列表里有「游戏当前应用」并且点得开');
  await sleep(800);

  const head = await js(`(() => {
    const h = document.querySelector('.editor-head');
    return h ? h.textContent.replace(/\\s+/g, ' ').trim() : null;
  })()`);
  console.log('  编辑器标题栏: ' + String(head).slice(0, 120));
  ok(!!head && head.includes('游戏当前应用'), '进入了「游戏当前应用」');
  ok(!!head && head.includes('3 个 mod'), 'badge 显示 3 个 mod（2 工坊 + 1 本地）', head);

  // 假的 config 里三条都对得上，不该有"缺失"
  ok(!!head && !head.includes('缺失'), '没有误报缺失');

  /* ------------------------------ 2. 默认列表 ------------------------------ */
  console.log('\n[2] 默认是列表模式');

  const rows = await js(`document.querySelectorAll('.mod-rows .mod-row').length`);
  ok(rows === 3, `列表渲染出 3 行（实际 ${rows}）`);

  const indexes = await js(
    `Array.from(document.querySelectorAll('.mod-rows .row-index')).map((x) => x.textContent.trim())`
  );
  ok(
    JSON.stringify(indexes) === JSON.stringify(['1', '2', '3']),
    '左侧序号是 1/2/3（加载顺序）',
    JSON.stringify(indexes)
  );

  const names = await js(
    `Array.from(document.querySelectorAll('.mod-rows .row-name')).map((x) => x.textContent.trim())`
  );
  ok(
    names.some((n) => n.includes('OnePiece')) && names.some((n) => n.includes('武器')) && names.some((n) => n.includes('怪物')),
    '名字都对（含本地那个）',
    JSON.stringify(names)
  );

  const cardsDefault = await js(`document.querySelectorAll('.mod-cards .mod-tile').length`);
  ok(cardsDefault === 0, '列表模式下没有卡片容器');

  const segLabels = await js(
    `Array.from(document.querySelectorAll('.editor-head .seg button')).map((b) => b.textContent.trim())`
  );
  ok(
    JSON.stringify(segLabels) === JSON.stringify(['列表', '大卡片']),
    '标题栏有「列表 / 大卡片」切换',
    JSON.stringify(segLabels)
  );

  /* ------------------------------ 3. 切到大卡片 ------------------------------ */
  console.log('\n[3] 切到大卡片模式');

  const clickedCard = await js(`(() => {
    const b = Array.from(document.querySelectorAll('.editor-head .seg button')).find((x) =>
      x.textContent.includes('大卡片')
    );
    if (!b) return false;
    b.click();
    return true;
  })()`);
  ok(clickedCard, '点得到「大卡片」按钮');
  await sleep(500);

  const cards = await js(`document.querySelectorAll('.mod-cards .mod-tile').length`);
  ok(cards === 3, `大卡片渲染出 3 张（实际 ${cards}）`);

  const rowsAfter = await js(`document.querySelectorAll('.mod-rows .mod-row').length`);
  ok(rowsAfter === 0, '切到卡片后列表模式的行没了');

  const orderBadges = await js(
    `Array.from(document.querySelectorAll('.mod-cards .tile-order')).map((x) => x.textContent.trim())`
  );
  ok(
    JSON.stringify(orderBadges) === JSON.stringify(['1', '2', '3']),
    '卡片左上角有 1/2/3 顺序角标',
    JSON.stringify(orderBadges)
  );

  const cardNames = await js(
    `Array.from(document.querySelectorAll('.mod-cards .tile-name')).map((x) => x.textContent.trim())`
  );
  ok(
    cardNames.some((n) => n.includes('OnePiece')) && cardNames.some((n) => n.includes('怪物')),
    '卡片名字正确',
    JSON.stringify(cardNames)
  );

  const metaBadges = await js(
    `Array.from(document.querySelectorAll('.mod-cards .tile-sub .badge')).map((x) => x.textContent.trim())`
  );
  ok(
    metaBadges.some((t) => t.startsWith('v')),
    '卡片上有版本 badge',
    JSON.stringify(metaBadges)
  );

  const coverAspect = await js(`(() => {
    const c = document.querySelector('.mod-cards .mod-tile .tile-thumb');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  })()`);
  console.log('  缩略图尺寸: ' + JSON.stringify(coverAspect));
  ok(
    !!coverAspect && coverAspect.w >= 80 && coverAspect.h >= 80,
    '缩略图有实际尺寸（≥80px）',
    JSON.stringify(coverAspect)
  );

  /*
   * 回归防护 1：相邻卡片**不能叠在一起**。
   * 之前封面用 aspect-ratio 时网格行高算错，卡片直接压到下一张身上 ——
   * 只数"有几张卡片"是发现不了的，必须比较它们在屏幕上的实际位置。
   */
  const overlaps = await js(`(() => {
    const rects = Array.from(document.querySelectorAll('.mod-cards .mod-tile')).map((c) =>
      c.getBoundingClientRect()
    );
    let bad = 0;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        const hit = a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
        if (hit) bad++;
      }
    }
    return { bad, heights: rects.map((r) => Math.round(r.height)) };
  })()`);
  console.log('  卡片位置: ' + JSON.stringify(overlaps));
  ok(overlaps.bad === 0, `卡片之间没有重叠（实际重叠 ${overlaps.bad} 对）`, JSON.stringify(overlaps));

  /*
   * 回归防护 2：卡片必须**同时**装得下缩略图和文字区。
   * 同一个塌陷会让文字跑出卡片范围，所以按几何关系断言，而不是只数元素个数。
   */
  const layout = await js(`(() => {
    const card = document.querySelector('.mod-cards > .mod-tile');
    const thumb = card.querySelector('.tile-thumb');
    const body = card.querySelector('.tile-main');
    const name = card.querySelector('.tile-name');
    const r = (e) => { const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) }; };
    return { card: r(card), thumb: r(thumb), body: r(body), name: r(name),
             nameText: name.textContent.trim() };
  })()`);
  console.log('  卡片盒模型: ' + JSON.stringify(layout));
  ok(
    layout.card.h >= 80,
    `卡片高度足够（≥80px，实际 ${layout.card.h}px）—— 塌陷时这里会是几十像素`
  );
  ok(
    layout.thumb.h >= 80 && layout.body.h >= 40,
    `缩略图与文字区都有高度（缩略图 ${layout.thumb.h}px / 文字区 ${layout.body.h}px）`
  );
  ok(
    layout.body.bottom <= layout.card.bottom + 1 && layout.name.bottom <= layout.card.bottom + 1,
    '文字区完整地落在卡片内部'
  );
  ok(!!layout.nameText, '卡片上有 mod 名字文字内容');

  /* 不同窗口宽度下卡片到底多宽 —— 用户反馈"越来越窄"，这里把真实数字打出来 */
  console.log('\n[3b] 各种窗口宽度下的卡片尺寸');
  const measureAt = async (w, h) => {
    win.setContentSize(w, h);
    await sleep(600);
    return js(`(() => {
      const cards = document.querySelectorAll('.mod-cards .mod-tile');
      const covers = document.querySelectorAll('.mod-cards .tile-thumb');
      const grid = document.querySelector('.mod-cards');
      const widths = Array.from(covers).map((c) => Math.round(c.getBoundingClientRect().width));
      // 列数别读 gridTemplateColumns 的计算值（auto-fill 时会失真），直接数不同的 x 坐标
      const xs = Array.from(cards).map((c) => Math.round(c.getBoundingClientRect().left));
      const cols = new Set(xs).size;
      return { win: window.innerWidth, gridW: grid ? Math.round(grid.getBoundingClientRect().width) : 0,
               cols, cardW: widths.length ? widths[0] : 0, cards: cards.length };
    })()`);
  };
  console.log('  当前 devicePixelRatio = ' + (await js('window.devicePixelRatio')));
  const dump = await js(`(() => {
    const grid = document.querySelector('.mod-cards');
    const card = document.querySelector('.mod-cards > .mod-tile');
    const cs = grid ? getComputedStyle(grid) : null;
    return {
      gridW: grid ? Math.round(grid.getBoundingClientRect().width) : 0,
      colsRaw: cs ? cs.gridTemplateColumns : null,
      colsCount: cs ? cs.gridTemplateColumns.split(' ').length : 0,
      justifyItems: cs ? cs.justifyItems : null,
      display: cs ? cs.display : null,
      cardW: card ? Math.round(card.getBoundingClientRect().width) : 0,
      cardMaxW: card ? getComputedStyle(card).maxWidth : null,
      cardWcss: card ? getComputedStyle(card).width : null
    };
  })()`);
  console.log('  网格计算值: ' + JSON.stringify(dump));
  for (const [w, h] of [[1000, 700], [1200, 800], [1420, 920], [1600, 920], [1920, 1080]]) {
    const m = await measureAt(w, h);
    console.log(
      `    窗口 ${m.win}px → 网格 ${m.gridW}px，${m.cols} 列，每张 ${m.cardW}px（共 ${m.cards} 张）`
    );
  }
  // 回到默认尺寸，后面还要截图
  win.setContentSize(1420, 920);
  await sleep(600);

  // 卡片上要有分类标签（跟 Mod 库卡片一致）
  const cardTags = await js(
    `Array.from(document.querySelectorAll('.mod-cards .tile-meta .tag')).map((x) => x.textContent.trim())`
  );
  console.log('  卡片分类标签: ' + JSON.stringify(cardTags));
  ok(cardTags.length >= 3, `卡片上有分类标签（实际 ${cardTags.length} 个）`, JSON.stringify(cardTags));
  ok(
    cardTags.some((t) => t.includes('潜艇') || t.includes('舰')) &&
      cardTags.some((t) => t.includes('武器')) &&
      cardTags.some((t) => t.includes('生物')),
    '三个 mod 的分类都按关键词自动标出来了',
    JSON.stringify(cardTags)
  );

  const activeSeg = await js(`(() => {
    const b = document.querySelector('.editor-head .seg button.active');
    return b ? b.textContent.trim() : null;
  })()`);
  ok(activeSeg === '大卡片', '「大卡片」按钮处于选中态', activeSeg);

  /* ------------------------------ 4. 切回列表 ------------------------------ */
  console.log('\n[4] 切回列表');

  await js(`(() => {
    const b = Array.from(document.querySelectorAll('.editor-head .seg button')).find((x) =>
      x.textContent.includes('列表')
    );
    if (b) b.click();
  })()`);
  await sleep(500);

  const rowsBack = await js(`document.querySelectorAll('.mod-rows .mod-row').length`);
  ok(rowsBack === 3, `切回列表后又是 3 行（实际 ${rowsBack}）`);
  const cardsGone = await js(`document.querySelectorAll('.mod-cards .mod-tile').length`);
  ok(cardsGone === 0, '卡片容器已移除');

  /* --------------------------- 5. 记住选择（重挂载） --------------------------- */
  console.log('\n[5] 选择要记住：切到别的页面再回来');

  await js(`(() => {
    const b = Array.from(document.querySelectorAll('.editor-head .seg button')).find((x) =>
      x.textContent.includes('大卡片')
    );
    if (b) b.click();
  })()`);
  await sleep(400);

  const stored = await js(`window.localStorage.getItem('bmm.collections.appliedView')`);
  ok(stored === 'card', '选择被记进 localStorage', String(stored));

  // 切到 Mod 库再切回合集：组件会重新挂载，看是不是还记得
  await js(`(() => {
    const s = Array.from(document.querySelectorAll('.nav-item')).find((x) => x.textContent.includes('Mod 库'));
    if (s) s.click();
  })()`);
  await sleep(700);
  await js(`(() => {
    const s = Array.from(document.querySelectorAll('.nav-item')).find((x) => x.textContent.includes('合集'));
    if (s) s.click();
  })()`);
  await sleep(1000);
  await js(`(() => {
    const row = Array.from(document.querySelectorAll('.list-row')).find((x) =>
      x.textContent.includes('游戏当前应用')
    );
    if (row) row.click();
  })()`);
  await sleep(700);

  const cardsRemembered = await js(`document.querySelectorAll('.mod-cards .mod-tile').length`);
  ok(cardsRemembered === 3, `重新进来还是大卡片（实际 ${cardsRemembered} 张）`);
  const activeSeg2 = await js(`(() => {
    const b = document.querySelector('.editor-head .seg button.active');
    return b ? b.textContent.trim() : null;
  })()`);
  ok(activeSeg2 === '大卡片', '选中态也跟着恢复', activeSeg2);

  /* ------------------------------ 6. 只读与报错 ------------------------------ */
  console.log('\n[6] 这块仍然是只读的 + 渲染进程无报错');

  const hasDrag = await js(`document.querySelectorAll('.mod-cards .drag-handle, .mod-rows .drag-handle').length`);
  ok(hasDrag === 0, '两种模式下都没有拖拽手柄（只读）');

  const buttonsInCard = await js(
    `document.querySelectorAll('.mod-cards button, .mod-rows button').length`
  );
  ok(buttonsInCard === 0, '卡片/行里没有可点的操作按钮（只读）');

  ok(errors.length === 0, '渲染进程没有报错', errors.join(' | '));

  console.log('\n[6b] 盒模型诊断');
  const boxes = await js(`(() => {
    const pick = (sel) => {
      const e = document.querySelector(sel);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return { h: Math.round(r.height), w: Math.round(r.width), top: Math.round(r.top),
               display: cs.display, flex: cs.flex, minH: cs.minHeight, rows: cs.gridTemplateRows };
    };
    return {
      page: pick('.page-body') || pick('.main') || pick('main'),
      editor: pick('.editor'),
      editorBody: pick('.editor-body'),
      appliedBody: pick('.applied-body'),
      cards: pick('.mod-cards'),
      winH: window.innerHeight
    };
  })()`);
  console.log('  盒模型: ' + JSON.stringify(boxes, null, 1));

  /* --------------------------- 7. 留下截图供人眼复核 --------------------------- */
  const SHOTS = path.join(ROOT, 'shots');
  fs.mkdirSync(SHOTS, { recursive: true });
  const shot = async (name) => {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(SHOTS, name), img.toPNG());
    console.log(`  截图: shots/${name}`);
  };
  // 现在是卡片模式；先截卡片，再切列表截一张
  await js(`(() => {
    const b = Array.from(document.querySelectorAll('.editor-head .seg button')).find((x) =>
      x.textContent.includes('大卡片')
    );
    if (b) b.click();
  })()`);
  await sleep(600);
  await shot('30-collections-applied-cards.png');
  await js(`(() => {
    const b = Array.from(document.querySelectorAll('.editor-head .seg button')).find((x) =>
      x.textContent.includes('列表')
    );
    if (b) b.click();
  })()`);
  await sleep(600);
  await shot('31-collections-applied-list.png');

  console.log(`\n=== ${fail === 0 ? '全部通过' : fail + ' 项失败'}（${pass} 通过 / ${fail} 失败）===`);
  try {
    fs.rmSync(TMP, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
  app.exit(fail === 0 ? 0 : 1);
});
