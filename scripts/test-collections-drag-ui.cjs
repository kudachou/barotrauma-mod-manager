/**
 * 合集页「拖拽排序 + 分类标签」的端到端自检。
 *
 * 用户反馈两件事：
 *   1. 拖住一条 mod 上下排序时，鼠标滚轮滚不动列表 —— 想拖到屏幕外的位置只能先松手、
 *      滚一下、再重新拖一遍；
 *   2. 合集页里看不到 mod 的分类标签，整理起来没依据。
 *
 * 关键点：这轮**必须用真实输入事件**（mouseDown / mouseMove / mouseWheel / keyDown）。
 * 用 `dispatchEvent(new WheelEvent(...))` 那种合成事件是测不出来的 —— 不可信事件不会触发
 * 浏览器默认行为，滚不动是必然结果，测出来的"通过"是假的。同理，能不能拖动也只能靠
 * 真实的按下 + 移动来判断。
 */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const ROOT = path.join(__dirname, '..');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.disableHardwareAcceleration();

/*
 * 每次跑都用一个**新的**临时目录（放在系统临时目录里，不往仓库里拉屎）。
 *
 * 原来这里是「固定目录 + 先 rmSync 删干净」，问题在于：上一次跑如果被强行中断，
 * Chromium 的 GPU 缓存（userdata\DawnGraphiteCache\data_0）可能还被系统锁着，
 * 下一次启动时的 rmSync 就会抛 EPERM —— 而它是在模块顶层、没人接，于是弹一个
 * 「主进程崩溃」的错误框。跑自检不该把用户的屏幕糊满弹窗，所以改成唯一目录：
 * 删不掉就不删，反正不会撞上。
 */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bmm-drag-ui-'));

const USERDATA = path.join(TMP, 'userdata');
const GAME = path.join(TMP, 'game');
const LOCAL = path.join(GAME, 'LocalMods');
const MODLISTS = path.join(GAME, 'ModLists');
const CFG = path.join(GAME, 'config_player.xml');
const WS = path.join(TMP, 'steam', 'workshop', 'content', '602960');
const INST = path.join(GAME, 'WorkshopMods', 'Installed');

const N = 24; // 够多，列表必须能滚
const LIST_NAME = '拖拽测试';

app.setName('bmm-collections-drag-ui-test');
app.setPath('userData', USERDATA);

const fl = (name, version, swid) =>
  `<?xml version="1.0" encoding="utf-8"?>\n<contentpackage name="${name}" ` +
  `steamworkshopid="${swid}" modversion="${version}" />\n`;

/** 名字里带分类关键词，这样 autoCategories 有东西可显示 */
function modName(i) {
  const kind = ['潜艇', '武器包', '生物包', '医疗包'][i % 4];
  return `测试${kind}${String(i + 1).padStart(2, '0')}`;
}
const modId = (i) => `66100000${String(i + 1).padStart(2, '0')}`;

function fixtures() {
  for (const d of [USERDATA, GAME, LOCAL, MODLISTS, WS, INST]) fs.mkdirSync(d, { recursive: true });

  for (let i = 0; i < N; i++) {
    const dir = path.join(WS, modId(i));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'filelist.xml'), fl(modName(i), '1.0', modId(i)), 'utf8');
  }

  // config_player.xml：路径形状只用来判断"游戏当前应用"，这里不测那一块，给个空壳
  fs.writeFileSync(
    CFG,
    '<?xml version="1.0" encoding="utf-8"?>\r\n<config language="Simplified Chinese" savepath="">\r\n' +
      '  <contentpackages>\r\n' +
      '    <corepackage path="Content/ContentPackages/Vanilla.xml" />\r\n' +
      '    <regularpackages>\r\n' +
      '    </regularpackages>\r\n' +
      '  </contentpackages>\r\n</config>\r\n',
    'utf8'
  );

  // 要拖的那个合集：24 条，顺序就是 01..24
  const body = Array.from({ length: N }, (_, i) => `  <Workshop name="${modName(i)}" id="${modId(i)}" />`).join(
    '\n'
  );
  fs.writeFileSync(
    path.join(MODLISTS, `${LIST_NAME}.xml`),
    `<?xml version="1.0" encoding="utf-8"?>\n<mods name="${LIST_NAME}">\n  <Vanilla />\n${body}\n</mods>\n`,
    'utf8'
  );

  /*
   * 第二个合集：用来测「有未保存改动时切到别的合集」。
   * 期望行为是先把上一份没保存的改动还原掉、再切过来看这一份。
   */
  fs.writeFileSync(
    path.join(MODLISTS, '另一个合集.xml'),
    '<?xml version="1.0" encoding="utf-8"?>\n<mods name="另一个合集">\n  <Vanilla />\n' +
      `  <Workshop name="${modName(0)}" id="${modId(0)}" />\n` +
      `  <Workshop name="${modName(1)}" id="${modId(1)}" />\n` +
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
    console.log(`  FAIL  ${label}${extra !== undefined ? ' — ' + JSON.stringify(extra) : ''}`);
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
  await sleep(2500);

  const js = (expr) => win.webContents.executeJavaScript(expr);

  /* ---- 真实输入事件 ---- */
  const move = (x, y) =>
    win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(x), y: Math.round(y) });
  const down = (x, y) =>
    win.webContents.sendInputEvent({
      type: 'mouseDown',
      x: Math.round(x),
      y: Math.round(y),
      button: 'left',
      clickCount: 1
    });
  const up = (x, y) =>
    win.webContents.sendInputEvent({
      type: 'mouseUp',
      x: Math.round(x),
      y: Math.round(y),
      button: 'left',
      clickCount: 1
    });
  const wheel = (x, y, deltaY) =>
    win.webContents.sendInputEvent({
      type: 'mouseWheel',
      x: Math.round(x),
      y: Math.round(y),
      deltaX: 0,
      deltaY,
      canScroll: true
    });
  /** 按住不松地从 a 挪到 b，模拟人手拖动（一次大跳事件浏览器可能当成移动而不是拖动） */
  async function dragTo(ax, ay, bx, by, steps = 6) {
    for (let i = 1; i <= steps; i++) {
      move(ax + ((bx - ax) * i) / steps, ay + ((by - ay) * i) / steps);
      await sleep(30);
    }
  }

  /* ---------------------------- 1. 打开那个合集 ---------------------------- */
  console.log('\n[1] 打开合集页 → 选中 24 条的合集');

  await js(`(() => {
    const s = Array.from(document.querySelectorAll('.nav-item')).find((x) => x.textContent.includes('合集'));
    if (s) s.click();
    return !!s;
  })()`);
  await sleep(1200);

  const picked = await js(`(() => {
    const row = Array.from(document.querySelectorAll('.list-row')).find((x) =>
      x.textContent.includes(${JSON.stringify(LIST_NAME)})
    );
    if (!row) return null;
    row.click();
    return row.textContent.replace(/\\s+/g, ' ').trim();
  })()`);
  ok(!!picked, '左侧列表里找到并点开了那个合集', picked);
  await sleep(1200);

  const rows = await js(`document.querySelectorAll('.mod-rows.editable .mod-row[data-idx]').length`);
  ok(rows === N, `编辑器里渲染出 ${N} 条（实际 ${rows}）`);

  /* ------------------------- 2. 分类标签回来了 ------------------------- */
  console.log('\n[2] 每条 mod 都要能看见分类标签');

  const tagInfo = await js(`(() => {
    const rows = Array.from(document.querySelectorAll('.mod-rows.editable .mod-row[data-idx]'));
    const perRow = rows.map((r) => Array.from(r.querySelectorAll('.row-tags .tag')).map((x) => x.textContent.trim()));
    return { total: perRow.reduce((a, b) => a + b.length, 0), rowsWithTags: perRow.filter((x) => x.length).length,
             first: perRow[0], sample: perRow.slice(0, 6) };
  })()`);
  console.log('  标签统计: ' + JSON.stringify(tagInfo.sample));
  ok(tagInfo.rowsWithTags === N, `24 条都有标签行（实际 ${tagInfo.rowsWithTags} 条有）`);
  ok(tagInfo.total >= N, `标签总数 ≥ ${N}（实际 ${tagInfo.total}）`);
  ok(
    tagInfo.total > 0 && tagInfo.first.length > 0 && /潜艇|舰船/.test(tagInfo.first.join()),
    '第 1 条按关键词标成了「潜艇/舰船」',
    tagInfo.first
  );

  const allLabels = await js(
    `Array.from(document.querySelectorAll('.mod-rows.editable .row-tags .tag')).map((x) => x.textContent.trim())`
  );
  ok(
    allLabels.some((x) => x.includes('潜艇') || x.includes('舰船')) &&
      allLabels.some((x) => x.includes('武器')) &&
      allLabels.some((x) => x.includes('生物')),
    '四类关键词（潜艇 / 武器 / 生物）都标出来了',
    Array.from(new Set(allLabels))
  );

  const tagBox = await js(`(() => {
    const row = document.querySelector('.mod-rows.editable .mod-row[data-idx]');
    const name = row.querySelector('.row-name').getBoundingClientRect();
    const tags = row.querySelector('.row-tags').getBoundingClientRect();
    return { nameBottom: Math.round(name.bottom), tagsTop: Math.round(tags.top),
             tagsBottom: Math.round(tags.bottom), rowBottom: Math.round(row.getBoundingClientRect().bottom) };
  })()`);
  ok(
    tagBox.tagsTop >= tagBox.nameBottom - 1 && tagBox.tagsBottom <= tagBox.rowBottom + 1,
    '标签行排在名字下面、并且没有超出这一行',
    tagBox
  );

  /* --------------------- 3. 拖拽前的几何与初始状态 --------------------- */
  console.log('\n[3] 拖拽前的几何');

  const geom = await js(`(() => {
    const list = document.querySelector('.mod-rows.editable');
    const rows = Array.from(list.querySelectorAll('.mod-row[data-idx]'));
    const lr = list.getBoundingClientRect();
    const pick = (i) => { const b = rows[i].getBoundingClientRect(); return { cy: Math.round((b.top + b.bottom) / 2), left: Math.round(b.left) }; };
    return {
      list: { top: Math.round(lr.top), bottom: Math.round(lr.bottom), left: Math.round(lr.left), right: Math.round(lr.right), h: Math.round(lr.height) },
      row0: pick(0),
      scrollTop: Math.round(list.scrollTop),
      scrollHeight: list.scrollHeight,
      clientHeight: list.clientHeight,
      names: rows.map((r) => r.querySelector('.row-name').textContent.trim())
    };
  })()`);
  console.log(
    `  列表 ${geom.list.h}px 高，内容 ${geom.scrollHeight}px，可视 ${geom.clientHeight}px，行首 ${geom.row0.cy}`
  );
  ok(geom.scrollHeight > geom.clientHeight + 60, '列表内容比可视区高（否则滚轮测不出来）', {
    scrollHeight: geom.scrollHeight,
    clientHeight: geom.clientHeight
  });
  ok(geom.names.length === N && geom.names[0] !== geom.names[1], '拿到了 24 条的初始顺序');

  const wheelPoint = {
    x: geom.list.left + Math.round((geom.list.right - geom.list.left) * 0.5),
    y: geom.list.top + Math.round(geom.list.h * 0.5)
  };

  /* --------------- 4. 不拖拽时滚轮本来就能滚（对照） --------------- */
  console.log('\n[4] 对照：不拖拽时滚轮能滚');

  await wheel(wheelPoint.x, wheelPoint.y, -400);
  await sleep(400);
  const plainScroll = await js(`Math.round(document.querySelector('.mod-rows.editable').scrollTop)`);
  ok(plainScroll > 0, `不拖拽时滚轮能滚（scrollTop = ${plainScroll}）`, plainScroll);

  await js(`document.querySelector('.mod-rows.editable').scrollTop = 0`);
  await sleep(400);

  /* ------------- 5. 关键：拖拽进行中，滚轮还能不能滚 ------------- */
  console.log('\n[5] 关键：拖住一条的同时滚轮滚动');

  const dragStart = { x: geom.row0.left + 26, y: geom.row0.cy };
  // 拖拽开始前先把指针放到行上（真实鼠标也是先移过去再按下）
  move(dragStart.x, dragStart.y);
  await sleep(120);
  down(dragStart.x, dragStart.y);
  await sleep(150);
  await dragTo(dragStart.x, dragStart.y, dragStart.x, dragStart.y + 18, 4);
  await sleep(250);

  const midDrag = await js(`(() => {
    const list = document.querySelector('.mod-rows.editable');
    return { dragging: list.querySelectorAll('.mod-row.dragging').length,
             dropTarget: list.querySelectorAll('.mod-row.drop-target').length,
             scrollTop: Math.round(list.scrollTop) };
  })()`);
  ok(midDrag.dragging === 1, '按住并移动之后进入了拖拽态（有且只有 1 条 .dragging）', midDrag);

  const scrollBefore = midDrag.scrollTop;
  await wheel(wheelPoint.x, wheelPoint.y, -400);
  await sleep(500);
  const afterWheel = await js(`(() => {
    const list = document.querySelector('.mod-rows.editable');
    return { scrollTop: Math.round(list.scrollTop), dragging: list.querySelectorAll('.mod-row.dragging').length,
             dropTarget: list.querySelectorAll('.mod-row.drop-target').length };
  })()`);
  console.log(`  拖拽中滚轮：scrollTop ${scrollBefore} → ${afterWheel.scrollTop}`);
  ok(
    afterWheel.scrollTop > scrollBefore,
    `拖拽期间滚轮把列表滚动了（${scrollBefore} → ${afterWheel.scrollTop}）`,
    { before: scrollBefore, after: afterWheel.scrollTop }
  );
  ok(afterWheel.dragging === 1, '滚完之后拖拽还在继续（没有因为滚动中断）', afterWheel);

  /* --------------------- 6. 松手落在哪一条 --------------------- */
  console.log('\n[6] 滚到别处之后松手，条目要落在那一条上');

  const dropY = geom.list.top + Math.round(geom.list.h * 0.55);
  move(wheelPoint.x, dropY);
  await sleep(350);

  const targetIdx = await js(`(() => {
    const list = document.querySelector('.mod-rows.editable');
    const t = list.querySelector('.mod-row.drop-target');
    return t ? Number(t.dataset.idx) : null;
  })()`);
  ok(targetIdx !== null && targetIdx > 0, `指针下面有落点高亮（第 ${targetIdx} 条）`, targetIdx);

  const midShot = await win.webContents.capturePage();
  fs.mkdirSync(path.join(ROOT, 'shots'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'shots', '33-collections-drag-midscroll.png'), midShot.toPNG());

  // 原生拖拽自带幽灵图，改成自己实现之后要有等价物：不然列表一滚就不知道手里拿着哪条
  const ghost = await js(`(() => {
    const g = document.querySelector('.drag-ghost');
    if (!g) return null;
    const r = g.getBoundingClientRect();
    return { text: g.textContent.trim(), x: Math.round(r.left), y: Math.round(r.top),
             pe: getComputedStyle(g).pointerEvents };
  })()`);
  ok(!!ghost && ghost.text.includes(geom.names[0]), '拖拽时有个跟着指针的标签，写着正在拖的 mod', ghost);
  ok(!!ghost && ghost.x > 0 && ghost.y > 0, '标签确实定位在指针附近（不是缩在左上角）', ghost);
  ok(!!ghost && ghost.pe === 'none', '标签不吃鼠标事件（否则会挡住落点判断）', ghost);

  up(wheelPoint.x, dropY);
  await sleep(500);

  const afterDrop = await js(`(() => {
    const list = document.querySelector('.mod-rows.editable');
    const rows = Array.from(list.querySelectorAll('.mod-row[data-idx]'));
    return {
      dragging: list.querySelectorAll('.mod-row.dragging').length,
      ghost: document.querySelectorAll('.drag-ghost').length,
      names: rows.map((r) => r.querySelector('.row-name').textContent.trim()),
      idxs: rows.map((r) => Number(r.dataset.idx)),
      dirty: !!Array.from(document.querySelectorAll('.editor-head .badge')).find((b) => b.textContent.includes('未保存'))
    };
  })()`);
  ok(afterDrop.dragging === 0, '松手之后拖拽态清掉了');
  ok(afterDrop.ghost === 0, '松手之后跟着指针的标签也收掉了', afterDrop.ghost);
  ok(
    afterDrop.names.join('|') !== geom.names.join('|'),
    '顺序真的变了（不是只画了个高亮）',
    { before: geom.names.slice(0, 4), after: afterDrop.names.slice(0, 4) }
  );
  ok(
    afterDrop.names[targetIdx] === geom.names[0],
    `第 1 条被挪到了第 ${targetIdx} 条的位置上（那里现在是「${afterDrop.names[targetIdx]}」）`
  );
  ok(afterDrop.idxs.join(',') === Array.from({ length: N }, (_, i) => i).join(','), '落点编号仍然是 0..23，没有错位');
  ok(afterDrop.dirty, '标记成「未保存」了');

  /* ------------------- 7. 保存后写回文件里也是新顺序 ------------------- */
  console.log('\n[7] 保存到磁盘');

  await js(`(() => {
    const b = Array.from(document.querySelectorAll('.editor-head button')).find((x) => x.textContent.includes('保存'));
    if (b) b.click();
  })()`);
  await sleep(900);

  const xml = fs.readFileSync(path.join(MODLISTS, `${LIST_NAME}.xml`), 'utf8');
  const namesInFile = [...xml.matchAll(/<Workshop name="([^"]+)"/g)].map((m) => m[1]);
  console.log('  文件里的顺序: ' + namesInFile.slice(0, 6).join(' '));
  console.log('  界面上的顺序: ' + afterDrop.names.slice(0, 6).join(' '));
  ok(namesInFile.join('|') === afterDrop.names.join('|'), '磁盘上的合集顺序 = 界面上的顺序', {
    file: namesInFile.slice(0, 4),
    ui: afterDrop.names.slice(0, 4)
  });
  ok(namesInFile[targetIdx] === geom.names[0], '被拖的那条确实写到了新位置', {
    at: targetIdx,
    got: namesInFile[targetIdx],
    want: geom.names[0]
  });

  /* -------------- 8. 贴边自动滚动（不滚轮也能拖出屏幕） -------------- */
  console.log('\n[8] 拖到列表下边缘时自动往下滚');

  const geom2 = await js(`(() => {
    const list = document.querySelector('.mod-rows.editable');
    const rows = Array.from(list.querySelectorAll('.mod-row[data-idx]'));
    const lr = list.getBoundingClientRect();
    const b = rows[0].getBoundingClientRect();
    return { scrollTop: Math.round(list.scrollTop), bottom: Math.round(lr.bottom), left: Math.round(lr.left),
             cy: Math.round((b.top + b.bottom) / 2), x: Math.round(lr.left + 26) };
  })()`);
  const startY = typeof geom2.cy === 'number' ? geom2.cy : geom.row0.cy;
  move(geom2.x, startY);
  await sleep(120);
  down(geom2.x, startY);
  await sleep(150);
  await dragTo(geom2.x, startY, geom2.x, geom2.bottom - 10, 6);
  await sleep(900);
  const edgeScroll = await js(`Math.round(document.querySelector('.mod-rows.editable').scrollTop)`);
  console.log(`  贴边停留后 scrollTop: ${geom2.scrollTop} → ${edgeScroll}`);
  ok(edgeScroll > geom2.scrollTop, `贴在下边缘会自动往下滚（${geom2.scrollTop} → ${edgeScroll}）`, {
    before: geom2.scrollTop,
    after: edgeScroll
  });

  /* ------------------------ 9. Esc 取消拖拽 ------------------------ */
  console.log('\n[9] Esc 取消拖拽：不该改顺序');

  const beforeEsc = await js(
    `Array.from(document.querySelectorAll('.mod-rows.editable .row-name')).map((x) => x.textContent.trim())`
  );
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await sleep(400);
  const escState = await js(`(() => {
    const list = document.querySelector('.mod-rows.editable');
    return { dragging: list.querySelectorAll('.mod-row.dragging').length,
             names: Array.from(list.querySelectorAll('.row-name')).map((x) => x.textContent.trim()) };
  })()`);
  ok(escState.dragging === 0, 'Esc 之后拖拽态清掉了', escState);
  ok(escState.names.join('|') === beforeEsc.join('|'), 'Esc 之后顺序没被改');
  up(geom2.x, geom2.bottom - 10); // 补一个松手，免得留下按下的鼠标状态
  await sleep(200);

  /* ------------------ 10. 行里的按钮还能正常点 ------------------ */
  console.log('\n[10] 行里的按钮（删除）还能点 —— 拖拽别把点击吃掉');

  // 前面贴边自动滚动把列表滚下去了，先回到顶部，否则第一行在可视区外、点在了空处
  await js(`document.querySelector('.mod-rows.editable').scrollTop = 0`);
  await sleep(400);

  const countBefore = await js(`document.querySelectorAll('.mod-rows.editable .mod-row[data-idx]').length`);
  const trash = await js(`(() => {
    const row = document.querySelector('.mod-rows.editable .mod-row[data-idx]');
    const btn = row.querySelector('button');
    if (!btn) return null;
    const b = btn.getBoundingClientRect();
    return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };
  })()`);
  ok(!!trash, '第一行里有按钮');
  if (trash) {
    move(trash.x, trash.y);
    await sleep(100);
    down(trash.x, trash.y);
    await sleep(120);
    up(trash.x, trash.y);
    await sleep(700);
    const countAfter = await js(`document.querySelectorAll('.mod-rows.editable .mod-row[data-idx]').length`);
    ok(countAfter === countBefore - 1, `点删除按钮真的删掉了一条（${countBefore} → ${countAfter}）`, {
      before: countBefore,
      after: countAfter
    });
  }

  /* ------------------------- 11. 还原按钮 ------------------------- */
  console.log('\n[11] 改了没保存 → 点「还原」回到上次保存的样子');

  const revertBtn = await js(`(() => {
    const b = Array.from(document.querySelectorAll('.editor-head button')).find((x) =>
      x.title.includes('回到上次保存')
    );
    if (!b) return null;
    return { text: b.textContent.trim(), disabled: b.disabled,
             x: Math.round(b.getBoundingClientRect().left), y: Math.round(b.getBoundingClientRect().top),
             w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) };
  })()`);
  ok(!!revertBtn && revertBtn.text === '还原', '编辑器头部有「还原」按钮', revertBtn);
  ok(!!revertBtn && revertBtn.disabled === false, '有未保存改动时「还原」是可点的', revertBtn);

  const stateBeforeRevert = await js(`(() => {
    const list = document.querySelector('.mod-rows.editable');
    return { rows: list.querySelectorAll('.mod-row[data-idx]').length,
             dirty: !!Array.from(document.querySelectorAll('.editor-head .badge')).find((b) => b.textContent.includes('未保存')) };
  })()`);
  ok(stateBeforeRevert.rows === N - 1 && stateBeforeRevert.dirty, '还原之前：少了一条并且是未保存状态', stateBeforeRevert);

  await js(`(() => {
    const b = Array.from(document.querySelectorAll('.editor-head button')).find((x) =>
      x.title.includes('回到上次保存')
    );
    if (b) b.click();
  })()`);
  await sleep(700);

  const afterRevert = await js(`(() => {
    const list = document.querySelector('.mod-rows.editable');
    return {
      rows: list.querySelectorAll('.mod-row[data-idx]').length,
      names: Array.from(list.querySelectorAll('.row-name')).map((x) => x.textContent.trim()),
      dirty: !!Array.from(document.querySelectorAll('.editor-head .badge')).find((b) => b.textContent.includes('未保存')),
      revertDisabled: (() => {
        const b = Array.from(document.querySelectorAll('.editor-head button')).find((x) =>
          x.title.includes('回到上次保存')
        );
        return b ? b.disabled : null;
      })()
    };
  })()`);
  ok(afterRevert.rows === N, `还原之后条目数回到 ${N}（实际 ${afterRevert.rows}）`, afterRevert.rows);
  ok(afterRevert.names.join('|') === namesInFile.join('|'), '还原之后顺序 = 磁盘上保存的顺序', {
    ui: afterRevert.names.slice(0, 3),
    file: namesInFile.slice(0, 3)
  });
  ok(!afterRevert.dirty, '还原之后「未保存」标记没了');
  ok(afterRevert.revertDisabled === true, '没有改动时「还原」变成不可点', afterRevert.revertDisabled);

  /* ------------- 12. 有未保存改动时切换到别的合集：先还原再切 ------------- */
  console.log('\n[12] 未保存时切到别的合集：当前这份要还原，然后切过去');

  // 再改一次（删一条），制造未保存状态
  await js(`document.querySelector('.mod-rows.editable').scrollTop = 0`);
  await sleep(300);
  await js(`(() => {
    const row = document.querySelector('.mod-rows.editable .mod-row[data-idx]');
    const btn = row.querySelector('button');
    if (btn) btn.click();
  })()`);
  await sleep(500);
  const dirtyBeforeSwitch = await js(`(() => {
    const list = document.querySelector('.mod-rows.editable');
    return { rows: list.querySelectorAll('.mod-row[data-idx]').length,
             dirty: !!Array.from(document.querySelectorAll('.editor-head .badge')).find((b) => b.textContent.includes('未保存')),
             name: document.querySelector('.editor-head input.input').value };
  })()`);
  ok(dirtyBeforeSwitch.rows === N - 1 && dirtyBeforeSwitch.dirty, '切之前：少一条 + 未保存', dirtyBeforeSwitch);

  const clickedOther = await js(`(() => {
    const row = Array.from(document.querySelectorAll('.list-row')).find((x) =>
      x.textContent.includes('另一个合集')
    );
    if (!row) return false;
    row.click();
    return true;
  })()`);
  ok(clickedOther, '左侧列表里点得到另一个合集');
  await sleep(900);

  const afterSwitch = await js(`(() => {
    const list = document.querySelector('.mod-rows.editable');
    return {
      editorName: document.querySelector('.editor-head input.input').value,
      rows: list ? list.querySelectorAll('.mod-row[data-idx]').length : -1,
      names: list ? Array.from(list.querySelectorAll('.row-name')).map((x) => x.textContent.trim()) : [],
      dirty: !!Array.from(document.querySelectorAll('.editor-head .badge')).find((b) => b.textContent.includes('未保存')),
      discardToast: Array.from(document.querySelectorAll('.toast .t-title')).map((x) => x.textContent.trim()),
      activeRow: (() => {
        const a = document.querySelector('.list-row.active');
        return a ? a.textContent.replace(/\\s+/g, ' ').trim() : null;
      })()
    };
  })()`);
  console.log('  切换后: ' + JSON.stringify(afterSwitch));
  ok(afterSwitch.editorName === '另一个合集', '编辑器真的切到另一个合集了（以前会卡在旧合集上）', afterSwitch.editorName);
  ok(afterSwitch.rows === 2, `另一个合集有 2 条（实际 ${afterSwitch.rows}）`, afterSwitch.rows);
  ok(!afterSwitch.dirty, '切过去之后没有「未保存」标记');
  ok(
    afterSwitch.discardToast.some((x) => x.includes('丢弃')),
    '提示了一句「未保存的改动已丢弃」',
    afterSwitch.discardToast
  );
  ok(
    afterSwitch.activeRow && afterSwitch.activeRow.includes('另一个合集'),
    '左侧选中的就是另一个合集',
    afterSwitch.activeRow
  );

  // 原来那份合集在磁盘上没被改：还是 24 条 + 保存时的顺序
  const xmlAfterSwitch = fs.readFileSync(path.join(MODLISTS, `${LIST_NAME}.xml`), 'utf8');
  const namesAfterSwitch = [...xmlAfterSwitch.matchAll(/<Workshop name="([^"]+)"/g)].map((m) => m[1]);
  ok(namesAfterSwitch.length === N, `被丢下的合集在磁盘上仍是 ${N} 条（实际 ${namesAfterSwitch.length}）`, namesAfterSwitch.length);
  ok(namesAfterSwitch.join('|') === namesInFile.join('|'), '被丢下的合集在磁盘上顺序没变');

  // 切回去看：刚才那次删除确实被还原了（不是只在内存里丢掉）
  await js(`(() => {
    const row = Array.from(document.querySelectorAll('.list-row')).find((x) =>
      x.textContent.includes(${JSON.stringify(LIST_NAME)})
    );
    if (row) row.click();
  })()`);
  await sleep(900);
  const backAgain = await js(`(() => {
    const list = document.querySelector('.mod-rows.editable');
    return { name: document.querySelector('.editor-head input.input').value,
             rows: list.querySelectorAll('.mod-row[data-idx]').length,
             names: Array.from(list.querySelectorAll('.row-name')).map((x) => x.textContent.trim()) };
  })()`);
  ok(backAgain.name === LIST_NAME, '切回来还是原来那个合集', backAgain.name);
  ok(backAgain.rows === N, `切回来是 ${N} 条（那次删除被还原了，实际 ${backAgain.rows}）`, backAgain.rows);
  ok(backAgain.names.join('|') === namesInFile.join('|'), '切回来顺序和磁盘一致');

  /* --------------------- 13. 渲染进程无报错 + 截图 --------------------- */
  ok(errors.length === 0, '渲染进程没有报错', errors.join(' | '));

  const shotDir = path.join(ROOT, 'shots');
  fs.mkdirSync(shotDir, { recursive: true });
  // 回到顶部，截一张能看清标签的
  await js(`document.querySelector('.mod-rows.editable').scrollTop = 0`);
  await sleep(400);
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(shotDir, '32-collections-rows-tags.png'), img.toPNG());
  console.log('\n  截图: shots/32-collections-rows-tags.png');
  console.log('  截图: shots/33-collections-drag-midscroll.png');

  console.log(`\n=== ${fail === 0 ? '全部通过' : fail + ' 项失败'}（${pass} 通过 / ${fail} 失败）===`);
  try {
    fs.rmSync(TMP, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
  app.exit(fail === 0 ? 0 : 1);
});
