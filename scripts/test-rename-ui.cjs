/**
 * 「自定义 mod 显示名」的端到端自检。
 *
 * 要求：
 *   1. 能给 mod 起一个自己看得懂的名字（界面到处都显示它）；
 *   2. 能一键「恢复默认名字」；
 *   3. 只改显示名 —— mod 文件夹、filelist.xml、合集条目都不许动；
 *   4. 改名不能连累别的东西：**关键词自动分类**要按真名算（存档匹配也是，那条在存档案里覆盖）。
 * 第 4 点最容易踩：真名藏着不用 realName 记下来，改个名字标签就没了。
 */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.disableHardwareAcceleration();

const { freshDir } = require('./_tmpdir.cjs');
const TMP = freshDir(path.join(ROOT, 'tmp-rename-ui'));

const USERDATA = path.join(TMP, 'userdata');
const GAME = path.join(TMP, 'game');
const LOCAL = path.join(GAME, 'LocalMods');
const MODLISTS = path.join(GAME, 'ModLists');
const CFG = path.join(GAME, 'config_player.xml');
const WS = path.join(TMP, 'steam', 'workshop', 'content', '602960');
const INST = path.join(GAME, 'WorkshopMods', 'Installed');

/** 名字里带「武器」：自动分类应该是 武器/装备（改名之后也得还在） */
const LOCAL_MOD = '武器测试mod';
const LOCAL_FOLDER = '武器测试mod';
const WS_ID = '6610000888';
const WS_NAME = '工坊改名测试';

app.setName('bmm-rename-ui-test');
app.setPath('userData', USERDATA);

function writeMod(root, folder, body) {
  const dir = path.join(root, folder);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'filelist.xml'), body, 'utf8');
}

function fixtures() {
  for (const d of [USERDATA, GAME, LOCAL, MODLISTS, WS, INST]) fs.mkdirSync(d, { recursive: true });

  writeMod(
    LOCAL,
    LOCAL_FOLDER,
    '<?xml version="1.0" encoding="utf-8"?>\n<contentpackage name="武器测试mod" modversion="1.0" />\n'
  );
  writeMod(
    WS,
    WS_ID,
    `<?xml version="1.0" encoding="utf-8"?>\n<contentpackage name="${WS_NAME}" steamworkshopid="${WS_ID}" modversion="2.0" />\n`
  );

  fs.writeFileSync(
    CFG,
    '<?xml version="1.0" encoding="utf-8"?>\r\n<config language="Simplified Chinese" savepath="">\r\n' +
      '  <contentpackages>\r\n    <corepackage path="Content/ContentPackages/Vanilla.xml" />\r\n' +
      '    <regularpackages>\r\n    </regularpackages>\r\n  </contentpackages>\r\n</config>\r\n',
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
    width: 1400,
    height: 900,
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

  const js = (expr) => win.webContents.executeJavaScript(expr);

  const openCard = async (name) => {
    const opened = await js(`(() => {
      const card = Array.from(document.querySelectorAll('.card')).find(
        (c) => (c.querySelector('.card-name') || {}).textContent === ${JSON.stringify(name)}
      );
      if (!card) return null;
      card.click();
      return (card.querySelector('.card-name') || {}).textContent;
    })()`);
    await sleep(900);
    return opened;
  };

  const closeModal = async () => {
    // 注意要用「直接子元素」：头部里现在还有改名铅笔（也是 .btn.icon），
    // 用 .modal-head button.btn.icon 会先命中铅笔，把弹窗切进改名状态
    await js(`(() => {
      const b = document.querySelector('.modal .modal-head > button.btn.icon');
      if (b) b.click();
    })()`);
    await sleep(400);
  };

  /** 标题行里那个"改名"铅笔按钮（靠 title 文案认，比下标稳） */
  const pencilBtn = `Array.from(document.querySelectorAll('.modal .modal-head button')).find((x) => (x.title || '').includes('只改这里显示的名字'))`;
  const resetBtn = `Array.from(document.querySelectorAll('.modal .modal-head button')).find((x) => x.textContent.includes('恢复默认名字'))`;

  /** 往受控 input 里填字（React 需要走原生 setter + input 事件） */
  const typeName = async (text) => {
    await js(`(() => {
      const el = document.querySelector('.modal-head input.input');
      if (!el) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, ${JSON.stringify(text)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await sleep(250);
  };

  const clickSaveName = async () => {
    const clicked = await js(`(() => {
      const b = Array.from(document.querySelectorAll('.modal .modal-head button')).find((x) => x.disabled === false && (x.title || '').includes('保存'));
      if (!b) return false;
      b.click();
      return true;
    })()`);
    await sleep(1000);
    return clicked;
  };

  const scanMod = (source, id) =>
    js(`window.api.scan().then((d) => {
      const m = d.mods.find((x) => x.source === ${JSON.stringify(source)} && x.id === ${JSON.stringify(id)});
      return m ? { name: m.name, realName: m.realName, nameCustom: !!m.nameCustom, autoCategories: m.autoCategories } : null;
    })`);

  /* ------------------------- 1. 本地 mod 改名字 ------------------------- */
  console.log('\n[1] 本地 mod：改名之后界面到处都显示新名字');

  await js(`(() => {
    const s = Array.from(document.querySelectorAll('.nav-item')).find((x) => x.textContent.includes('Mod 库'));
    if (s) s.click();
  })()`);
  await sleep(800);

  const opened = await openCard(LOCAL_MOD);
  ok(opened === LOCAL_MOD, '点开了本地 mod 的详情弹窗', opened);
  ok(!(await js(`!!${resetBtn}`)), '没改过名时没有「恢复默认名字」按钮');
  ok(await js(`!!${pencilBtn}`), '标题旁边有改名的铅笔按钮');

  await js(`${pencilBtn}.click()`);
  await sleep(400);
  const draft = await js(`(() => {
    const el = document.querySelector('.modal-head input.input');
    return el ? el.value : null;
  })()`);
  ok(draft === LOCAL_MOD, '点铅笔之后输入框里是当前名字', draft);

  await typeName('我的主力武器');
  ok(await clickSaveName(), '填完能点保存');

  const renamed = await js(`(() => ({
    title: (document.querySelector('.modal .modal-title') || {}).textContent || null,
    hasReset: !!${resetBtn},
    badges: Array.from(document.querySelectorAll('.modal .modal-head .badge')).map((x) => x.textContent.trim()),
    toasts: Array.from(document.querySelectorAll('.toast .t-title')).map((x) => x.textContent.trim())
  }))()`);
  console.log('  改名后: ' + JSON.stringify(renamed));
  ok(renamed.title === '我的主力武器', '弹窗标题变成新名字', renamed.title);
  ok(renamed.hasReset, '改过名之后多出「恢复默认名字」按钮');
  ok(
    renamed.badges.some((b) => b.includes('原名') && b.includes(LOCAL_MOD)),
    '标签里标出了原名，免得以后认不出这是哪个 mod',
    renamed.badges
  );
  ok(renamed.toasts.some((x) => x.includes('名字已改')), '提示了一句「名字已改」', renamed.toasts);

  const namesFile = path.join(USERDATA, 'names.json');
  const stored = fs.existsSync(namesFile) ? JSON.parse(fs.readFileSync(namesFile, 'utf8')) : {};
  ok(stored[`local:${LOCAL_FOLDER}`] === '我的主力武器', '写进了 names.json（key 是 local:文件夹名）', stored);

  // 列表页的卡片也跟着变（改名之后做过一次扫描）
  const cardNames = await js(`Array.from(document.querySelectorAll('.card .card-name')).map((x) => x.textContent.trim())`);
  ok(
    cardNames.includes('我的主力武器') && !cardNames.includes(LOCAL_MOD),
    'Mod 库卡片上显示的是新名字',
    cardNames
  );

  /* --------------- 2. 改名不能连累真名相关的东西（自动分类） --------------- */
  console.log('\n[2] 真名还在：自动分类按真名算，不被改名影响');

  const scanned = await scanMod('local', LOCAL_FOLDER);
  console.log('  扫描结果: ' + JSON.stringify(scanned));
  ok(!!scanned && scanned.name === '我的主力武器', '扫描出来的显示名是新名字', scanned);
  ok(!!scanned && scanned.realName === LOCAL_MOD, '真名仍留在 realName 里', scanned && scanned.realName);
  ok(!!scanned && scanned.nameCustom === true, '标出了「这个名字是自定义的」');
  ok(
    !!scanned && scanned.autoCategories.includes('武器/装备'),
    '关键词自动分类仍按真名算（改名后没丢「武器/装备」）',
    scanned && scanned.autoCategories
  );

  const localFolderStill = fs.existsSync(path.join(LOCAL, LOCAL_FOLDER, 'filelist.xml'));
  const folderList = fs.readdirSync(LOCAL);
  ok(
    localFolderStill && folderList.length === 1 && folderList[0] === LOCAL_FOLDER,
    'mod 文件夹名一个字节都没动（还是原来的文件夹）',
    folderList
  );
  const filelistBody = fs.readFileSync(path.join(LOCAL, LOCAL_FOLDER, 'filelist.xml'), 'utf8');
  ok(filelistBody.includes(`name="${LOCAL_MOD}"`), 'filelist.xml 里作者写的名字也没被改');

  /* ------------------------ 3. 恢复默认名字 ------------------------ */
  console.log('\n[3] 恢复默认名字');

  await js(`${resetBtn}.click()`);
  await sleep(1000);
  const restored = await js(`(() => ({
    title: (document.querySelector('.modal .modal-title') || {}).textContent || null,
    hasReset: !!${resetBtn},
    toasts: Array.from(document.querySelectorAll('.toast .t-title')).map((x) => x.textContent.trim())
  }))()`);
  ok(restored.title === LOCAL_MOD, '标题回到 mod 自己的名字', restored.title);
  ok(!restored.hasReset, '「恢复默认名字」按钮自己收起来了');
  ok(restored.toasts.some((x) => x.includes('恢复默认名字')), '提示了一句已恢复', restored.toasts);

  const storedAfter = fs.existsSync(namesFile) ? JSON.parse(fs.readFileSync(namesFile, 'utf8')) : {};
  ok(!storedAfter[`local:${LOCAL_FOLDER}`], 'names.json 里那条被删掉了（不是只在界面上改回来）', storedAfter);

  const backScan = await scanMod('local', LOCAL_FOLDER);
  ok(
    !!backScan && backScan.name === LOCAL_MOD && backScan.nameCustom === false,
    '再扫一次：名字回到真名，也不再是「自定义」',
    backScan
  );

  /* ------------------- 4. Esc 取消 / 空名字不让存 ------------------- */
  console.log('\n[4] 取消与空名字');

  await js(`${pencilBtn}.click()`);
  await sleep(300);
  await typeName('这个名字不要保存');
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await sleep(500);
  const afterEsc = await js(`(() => ({
    title: (document.querySelector('.modal .modal-title') || {}).textContent || null,
    editing: !!document.querySelector('.modal-head input.input')
  }))()`);
  ok(!afterEsc.editing, 'Esc 之后输入框收起来了');
  ok(afterEsc.title === LOCAL_MOD, 'Esc 取消不会改名字', afterEsc.title);

  await js(`${pencilBtn}.click()`);
  await sleep(300);
  await typeName('   ');
  const saveDisabled = await js(`(() => {
    const b = Array.from(document.querySelectorAll('.modal .modal-head button')).find((x) => (x.title || '').includes('保存'));
    return b ? b.disabled : null;
  })()`);
  ok(saveDisabled === true, '名字留空时保存按钮是灰的（不会存出一个空名字）', saveDisabled);
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await sleep(300);

  /* ------------------------- 5. 工坊 mod 也能改 ------------------------- */
  console.log('\n[5] 工坊 mod 改名');

  await closeModal();
  const openedWs = await openCard(WS_NAME);
  ok(openedWs === WS_NAME, '点开工坊 mod 的详情', openedWs);
  await js(`${pencilBtn}.click()`);
  await sleep(300);
  await typeName('工坊版改名');
  ok(await clickSaveName(), '工坊 mod 也能保存新名字');

  const wsScan = await scanMod('workshop', WS_ID);
  ok(
    !!wsScan && wsScan.name === '工坊版改名' && wsScan.realName === WS_NAME && wsScan.nameCustom === true,
    '扫描结果：显示名改了、真名还在',
    wsScan
  );
  const wsStored = JSON.parse(fs.readFileSync(namesFile, 'utf8'));
  ok(wsStored[`workshop:${WS_ID}`] === '工坊版改名', '工坊 mod 的自定义名也写进了 names.json', wsStored);

  // 收尾：恢复掉，别把状态留给下一套测试
  await js(`${resetBtn}.click()`);
  await sleep(700);
  ok(!JSON.parse(fs.readFileSync(namesFile, 'utf8'))[`workshop:${WS_ID}`], '恢复之后 names.json 里那条没了');

  /* --------------------------- 6. 收尾 --------------------------- */
  await closeModal();
  ok(errors.length === 0, '渲染进程没有报错', errors.join(' | '));

  const img = await win.webContents.capturePage();
  fs.mkdirSync(path.join(ROOT, 'shots'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'shots', '35-rename-mod.png'), img.toPNG());

  console.log(`\n=== ${fail === 0 ? '全部通过' : fail + ' 项失败'}（${pass} 通过 / ${fail} 失败）===`);
  try {
    fs.rmSync(TMP, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
  app.exit(fail === 0 ? 0 : 1);
}).catch((e) => {
  /*
   * 自检脚本自己中途抛异常时，一定要**退出**。
   * 不接这个 catch 的话，Electron 会停在"窗口还在、但什么都不会再发生"的状态，
   * 外面看就是"卡住不动"，比报错还难查（这次开发时就踩到了）。
   */
  console.log('  FAIL  自检脚本中途抛异常：' + String((e && e.stack) || e));
  app.exit(1);
});
