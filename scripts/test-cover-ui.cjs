/**
 * 「设置封面」的端到端自检。
 *
 * 用户反馈：mod 库里点「设置封面」，系统文件对话框落在**文档**文件夹里，
 * 而不是这个 mod 自己的文件夹 —— 想用 mod 文件夹里的图还得自己翻回去。
 * 原因是主进程 `cover:set` 弹对话框时没给 `defaultPath`，Windows 就用上次用过的位置。
 *
 * 原生对话框没法自动化点，所以这里的做法是：**在测试里把 `dialog.showOpenDialog` 换掉**，
 * 记下真实代码传给它的参数（重点看 defaultPath），再返回一张我们指定的图片。
 * 这样测的是"真正弹对话框的那段代码"，而不是复制一份逻辑自己验自己。
 */
const { app, BrowserWindow, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.disableHardwareAcceleration();

const { freshDir } = require('./_tmpdir.cjs');
const TMP = freshDir(path.join(ROOT, 'tmp-cover-ui'));

const USERDATA = path.join(TMP, 'userdata');
const GAME = path.join(TMP, 'game');
const LOCAL = path.join(GAME, 'LocalMods');
const MODLISTS = path.join(GAME, 'ModLists');
const CFG = path.join(GAME, 'config_player.xml');
const WS = path.join(TMP, 'steam', 'workshop', 'content', '602960');
const INST = path.join(GAME, 'WorkshopMods', 'Installed');

const LOCAL_MOD = '我的封面测试mod';
const WS_ID = '6610000999';

app.setName('bmm-cover-ui-test');
app.setPath('userData', USERDATA);

/** 1x1 PNG，够当作一张能被复制的图片 */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PzWvWQAAAABJRU5ErkJggg==',
  'base64'
);

function fixtures() {
  for (const d of [USERDATA, GAME, LOCAL, MODLISTS, WS, INST]) fs.mkdirSync(d, { recursive: true });

  const localDir = path.join(LOCAL, LOCAL_MOD);
  fs.mkdirSync(localDir, { recursive: true });
  fs.writeFileSync(
    path.join(localDir, 'filelist.xml'),
    '<?xml version="1.0" encoding="utf-8"?>\n<contentpackage name="我的封面测试mod" modversion="1.0" />\n',
    'utf8'
  );
  // mod 文件夹里放一张图：这就是用户想直接选的那张
  fs.writeFileSync(path.join(localDir, '封面候选.png'), PNG);

  const wsDir = path.join(WS, WS_ID);
  fs.mkdirSync(wsDir, { recursive: true });
  fs.writeFileSync(
    path.join(wsDir, 'filelist.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<contentpackage name="工坊封面测试" steamworkshopid="${WS_ID}" modversion="2.0" />\n`,
    'utf8'
  );
  fs.writeFileSync(path.join(wsDir, 'preview.png'), PNG);

  // 工坊官方预览图缓存：设过手动封面之后点「恢复默认封面」，应该回落到这张
  fs.mkdirSync(path.join(USERDATA, 'previews'), { recursive: true });
  fs.writeFileSync(path.join(USERDATA, 'previews', `${WS_ID}.png`), PNG);

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
let skip = 0;
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

/* ------------------- 把系统文件对话框换成记录器 ------------------- */
const dialogCalls = [];
let pickPath = '';
dialog.showOpenDialog = async (...args) => {
  // 真实代码是 showOpenDialog(options)；Electron 也支持 (window, options)，两种都记
  const opts = args.length > 1 ? args[1] : args[0];
  dialogCalls.push(opts || {});
  return pickPath ? { canceled: false, filePaths: [pickPath] } : { canceled: true, filePaths: [] };
};

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

  const clickSetCover = async () => {
    const clicked = await js(`(() => {
      const b = Array.from(document.querySelectorAll('.modal .modal-foot button')).find((x) =>
        x.textContent.includes('设置封面')
      );
      if (!b) return false;
      b.click();
      return true;
    })()`);
    await sleep(900);
    return clicked;
  };

  const closeModal = async () => {
    // 「直接子元素」是关键：头部里还有改名铅笔（同样是 .btn.icon），
    // 不加 > 会先点到铅笔上，弹窗就切进改名状态了
    await js(`(() => {
      const b = document.querySelector('.modal .modal-head > button.btn.icon');
      if (b) b.click();
    })()`);
    await sleep(400);
  };

  /* -------------------------- 1. 本地 mod -------------------------- */
  console.log('\n[1] 本地 mod：对话框要停在 mod 自己的文件夹');

  await js(`(() => {
    const s = Array.from(document.querySelectorAll('.nav-item')).find((x) => x.textContent.includes('Mod 库'));
    if (s) s.click();
  })()`);
  await sleep(800);

  const openedLocal = await openCard(LOCAL_MOD);
  ok(openedLocal === LOCAL_MOD, '点开了本地 mod 的详情弹窗', openedLocal);

  const localDir = path.join(LOCAL, LOCAL_MOD);
  pickPath = path.join(localDir, '封面候选.png');
  dialogCalls.length = 0;
  const clicked = await clickSetCover();
  ok(clicked, '弹窗里有「设置封面」按钮并且点得到');
  ok(dialogCalls.length === 1, `点一次只弹一次对话框（实际 ${dialogCalls.length} 次）`, dialogCalls.length);

  const call = dialogCalls[0] || {};
  console.log('  对话框参数: ' + JSON.stringify({ defaultPath: call.defaultPath, properties: call.properties }));
  ok(call.defaultPath === localDir, '对话框默认目录 = 这个 mod 的文件夹（以前是「文档」）', {
    got: call.defaultPath,
    want: localDir
  });
  ok(
    Array.isArray(call.properties) && call.properties.includes('openFile'),
    '还是选单个文件（没有把模式改坏）',
    call.properties
  );
  const exts = (call.filters && call.filters[0] && call.filters[0].extensions) || [];
  ok(
    exts.includes('png') && exts.includes('jpg'),
    '图片类型过滤还在（png / jpg）',
    exts
  );

  // 选完之后封面真的落到了 userData/covers 里，弹窗缩略图也换成了新图
  const covers = fs.existsSync(path.join(USERDATA, 'covers'))
    ? fs.readdirSync(path.join(USERDATA, 'covers'))
    : [];
  ok(covers.length >= 1, `选中的图被复制进 covers 目录（${covers.join(', ')}）`, covers);

  const thumb = await js(`(() => {
    const img = document.querySelector('.modal .modal-head .row-thumb img');
    return img ? img.getAttribute('src') : null;
  })()`);
  ok(
    !!thumb && thumb.startsWith('local-img://') && decodeURIComponent(thumb).includes('covers'),
    '弹窗头部的封面缩略图换成了刚选的图',
    thumb
  );

  /* -------------- 2. mod 路径不对时不要塞垃圾进去 -------------- */
  console.log('\n[2] mod 文件夹不存在时的兜底');

  dialogCalls.length = 0;
  pickPath = path.join(localDir, '封面候选.png');
  const fallback = await js(`window.api.setLocalCover(
    ${JSON.stringify('local:' + LOCAL_MOD)},
    undefined,
    ${JSON.stringify('C:\\\\这个目录不存在\\\\filelist.xml')}
  )`);
  await sleep(400);
  ok(typeof fallback === 'string' && fallback.length > 0, '照样能选图并返回封面路径', fallback);
  ok(
    dialogCalls[0] && dialogCalls[0].defaultPath === undefined,
    '路径不存在时不把非法路径塞给对话框（交给系统自己决定）',
    dialogCalls[0] && dialogCalls[0].defaultPath
  );

  /* ------------------------- 3. 工坊 mod ------------------------- */
  console.log('\n[3] 工坊 mod：默认目录是工坊内容文件夹里的那一份');

  await closeModal();
  const openedWs = await openCard('工坊封面测试');
  ok(openedWs === '工坊封面测试', '点开了工坊 mod 的详情弹窗', openedWs);

  const wsDir = path.join(WS, WS_ID);
  pickPath = path.join(wsDir, 'preview.png');
  dialogCalls.length = 0;
  const clickedWs = await clickSetCover();
  ok(clickedWs, '工坊 mod 也有「设置封面」按钮');
  ok(
    dialogCalls[0] && dialogCalls[0].defaultPath === wsDir,
    '工坊 mod 的对话框默认目录 = 工坊内容里的 mod 文件夹',
    { got: dialogCalls[0] && dialogCalls[0].defaultPath, want: wsDir }
  );

  /* -------------- 4. 刷新之后封面还在不在（用户反馈：刷新就没了） -------------- */
  console.log('\n[4] 设完封面 → 重新扫描：封面必须还在');

  await closeModal();
  const coverage = await js(`window.api.scan().then((d) => {
    const pick = (source, id) => {
      const m = d.mods.find((x) => x.source === source && x.id === id);
      return m ? { preview: m.preview, coverManual: !!m.coverManual } : null;
    };
    return { local: pick('local', ${JSON.stringify(LOCAL_MOD)}), workshop: pick('workshop', ${JSON.stringify(WS_ID)}) };
  })`);
  console.log('  重新扫描后的 preview: ' + JSON.stringify(coverage));
  ok(
    !!coverage.local && /covers/.test(coverage.local.preview || ''),
    '本地 mod 刷新后仍然用手动设的封面',
    coverage.local
  );
  ok(
    !!coverage.workshop && /covers/.test(coverage.workshop.preview || ''),
    '工坊 mod 刷新后也仍然用手动设的封面（以前这里会被工坊预览顶掉）',
    coverage.workshop
  );
  ok(
    !!coverage.workshop && coverage.workshop.coverManual === true,
    '扫描结果会标出「这张封面是手动设的」（界面靠它决定要不要显示恢复按钮）',
    coverage.workshop
  );

  /* --------------------- 5. 恢复默认封面 --------------------- */
  console.log('\n[5] 恢复默认封面：删掉手动那张，回到自动找到的那张');

  const resetBtn = () =>
    `Array.from(document.querySelectorAll('.modal .modal-foot button')).find((x) => x.textContent.includes('恢复默认封面'))`;

  // ---- 工坊 mod：应该回到官方预览图（夹具的 preivews/<id>.png） ----
  await openCard('工坊封面测试');
  const resetInfo = await js(`(() => {
    const b = ${resetBtn()};
    return b ? { text: b.textContent.trim(), tip: b.title } : null;
  })()`);
  ok(!!resetInfo && resetInfo.text === '恢复默认封面', '设过封面的工坊 mod 有「恢复默认封面」按钮', resetInfo);
  ok(!!resetInfo && resetInfo.tip.includes('官方预览图'), '按钮的提示说明了会回到官方预览图', resetInfo && resetInfo.tip);

  await js(`(() => { const b = ${resetBtn()}; if (b) b.click(); })()`);
  await sleep(900);

  const afterResetWs = await js(`(() => {
    const img = document.querySelector('.modal .modal-head .row-thumb img');
    const ph = document.querySelector('.modal .modal-head .row-thumb .cover-ph');
    return {
      hasButton: !!${resetBtn()},
      thumb: img ? img.getAttribute('src') : null,
      placeholder: !!ph,
      toasts: Array.from(document.querySelectorAll('.toast .t-title')).map((x) => x.textContent.trim())
    };
  })()`);
  console.log('  恢复后: ' + JSON.stringify({ thumb: afterResetWs.thumb, ph: afterResetWs.placeholder }));
  ok(!afterResetWs.hasButton, '恢复之后按钮自己收起来了（因为已经没有手动封面）', afterResetWs.hasButton);
  ok(
    !!afterResetWs.thumb && decodeURIComponent(afterResetWs.thumb).includes('previews'),
    '工坊 mod 的封面换回了官方预览图',
    afterResetWs.thumb
  );
  ok(
    afterResetWs.toasts.some((x) => x.includes('恢复默认封面')),
    '提示了一句「已恢复默认封面」',
    afterResetWs.toasts
  );

  const coversLeft = fs.existsSync(path.join(USERDATA, 'covers'))
    ? fs.readdirSync(path.join(USERDATA, 'covers'))
    : [];
  ok(
    !coversLeft.some((f) => f.startsWith(`workshop_${WS_ID}`)),
    '手动封面文件被删掉了（不是只在界面上藏起来）',
    coversLeft
  );

  // ---- 本地 mod：没有"官方图"这回事，回到占位色块 ----
  await closeModal();
  await openCard(LOCAL_MOD);
  await js(`(() => { const b = ${resetBtn()}; if (b) b.click(); })()`);
  await sleep(900);
  const afterResetLocal = await js(`(() => ({
    hasButton: !!${resetBtn()},
    placeholder: !!document.querySelector('.modal .modal-head .row-thumb .cover-ph')
  }))()`);
  ok(!afterResetLocal.hasButton, '本地 mod 恢复之后按钮也收起来了');
  ok(afterResetLocal.placeholder, '本地 mod 恢复默认之后显示占位色块', afterResetLocal);

  const finalScan = await js(`window.api.scan().then((d) => {
    const m = d.mods.find((x) => x.source === 'workshop' && x.id === ${JSON.stringify(WS_ID)});
    return m ? { preview: m.preview, coverManual: !!m.coverManual } : null;
  })`);
  ok(
    !!finalScan && finalScan.coverManual === false && /previews/.test(finalScan.preview || ''),
    '再扫一次：工坊 mod 用的是官方预览图，而且不再是「手动封面」',
    finalScan
  );

  /* --------------------------- 6. 收尾 --------------------------- */
  await closeModal();
  ok(errors.length === 0, '渲染进程没有报错', errors.join(' | '));

  const img = await win.webContents.capturePage();
  fs.mkdirSync(path.join(ROOT, 'shots'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'shots', '34-cover-dialog-default-dir.png'), img.toPNG());

  const skipNote = skip ? `，跳过 ${skip} 条` : '';
  console.log(`\n=== ${fail === 0 ? '全部通过' : fail + ' 项失败'}（${pass} 通过 / ${fail} 失败${skipNote}）===`);
  try {
    fs.rmSync(TMP, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
  app.exit(fail === 0 ? 0 : 1);
}).catch((e) => {
  // 中途抛异常也要退出，别让外面看起来像"卡住了"
  console.log('  FAIL  自检脚本中途抛异常：' + String((e && e.stack) || e));
  app.exit(1);
});
