/**
 * 「合集分享」与「未订阅清单」的端到端自检。
 *
 * 用隔离的 userData + 临时游戏目录：不碰真实 ModLists，也不会真的打开 Steam
 * （「去订阅」只断言按钮在，不点它 —— 点了会真的拉起 Steam 客户端）。
 */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.disableHardwareAcceleration();

const TMP = path.join(ROOT, 'tmp-share-ui');
fs.rmSync(TMP, { recursive: true, force: true });
const USERDATA = path.join(TMP, 'userdata');
const GAME = path.join(TMP, 'game');
const LOCAL = path.join(GAME, 'LocalMods');
const WS = path.join(GAME, 'workshop');
const INST = path.join(GAME, 'Installed');
const MODLISTS = path.join(GAME, 'ModLists');
const CFG = path.join(GAME, 'config_player.xml');

app.setName('bmm-share-ui-test');
app.setPath('userData', USERDATA);

function writeMod(dir, folder, body) {
  fs.mkdirSync(path.join(dir, folder), { recursive: true });
  fs.writeFileSync(path.join(dir, folder, 'filelist.xml'), body, 'utf8');
}

function fixtures() {
  for (const d of [USERDATA, GAME, LOCAL, WS, INST, MODLISTS]) fs.mkdirSync(d, { recursive: true });

  // 本机有的：一个工坊 mod + 一个本地 mod
  writeMod(WS, '3343911734', '<contentpackage name="Smarter Bot AI" modversion="1.0" />');
  writeMod(INST, '3343911734', '<contentpackage name="Smarter Bot AI" modversion="1.0" installtime="1" />');
  writeMod(LOCAL, '我的自改版', '<contentpackage name="我的自改版" modversion="1.0" />');

  // 合集：1 个有的 + 2 个本机没有的工坊 mod
  fs.writeFileSync(
    path.join(MODLISTS, '联机用.xml'),
    '<?xml version="1.0" encoding="utf-8"?>\n<mods name="联机用">\n  <Vanilla />\n' +
      '  <Workshop name="Smarter Bot AI" id="3343911734" />\n' +
      '  <Workshop name="LuaCsForBarotrauma" id="2559634234" />\n' +
      '  <Workshop name="没订阅的mod" id="2683570256" />\n' +
      '</mods>\n',
    'utf8'
  );
  fs.writeFileSync(
    path.join(MODLISTS, '本地包.xml'),
    '<?xml version="1.0" encoding="utf-8"?>\n<mods name="本地包">\n  <Vanilla />\n  <Local name="我的自改版" />\n</mods>\n',
    'utf8'
  );

  fs.writeFileSync(
    CFG,
    '<?xml version="1.0" encoding="utf-8"?>\r\n<config savepath="">\r\n  <contentpackages>\r\n' +
      '    <corepackage path="Content/ContentPackages/Vanilla.xml" />\r\n' +
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
    console.log(`  FAIL  ${label}${extra !== undefined ? ' — ' + extra : ''}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

  // ---- 未订阅清单 ----
  await win.webContents.executeJavaScript(goNav('合集'));
  await sleep(1200);
  // 选中「联机用」
  await win.webContents.executeJavaScript(`(() => {
    const r = Array.from(document.querySelectorAll('.list-row')).find((x) => x.textContent.includes('联机用'));
    if (r) r.click();
    return !!r;
  })()`);
  await sleep(900);

  const panel = await win.webContents.executeJavaScript(`(() => {
    const ed = document.querySelector('.editor');
    return {
      filterChip: (Array.from(ed.querySelectorAll('.tag-toggle')).find((x) => x.textContent.includes('只看未订阅')) || {}).textContent || null,
      subscribeBtns: Array.from(ed.querySelectorAll('button')).filter((b) => b.textContent.trim() === '去订阅').length,
      modRows: ed.querySelectorAll('.mod-row').length,
      hint: (ed.querySelector('.hint') || {}).textContent || null
    };
  })()`);
  console.log('  编辑器: ' + JSON.stringify(panel));
  ok(/只看未订阅\s*2/.test(panel.filterChip || ''), '出现「只看未订阅 2」筛选', JSON.stringify(panel.filterChip));
  ok(panel.subscribeBtns === 2, `每个未订阅的 mod 都有「去订阅」按钮（实际 ${panel.subscribeBtns} 个）`);
  ok(panel.modRows === 3, `默认显示全部 3 行（实际 ${panel.modRows}）`);
  ok(/去订阅/.test(panel.hint || '') && /同步到游戏/.test(panel.hint || ''), '提示里说清了订阅完要回点「同步到游戏」');

  // 点筛选：只剩未订阅的两行
  await win.webContents.executeJavaScript(`(() => {
    const c = Array.from(document.querySelectorAll('.editor .tag-toggle')).find((x) => x.textContent.includes('只看未订阅'));
    if (c) c.click();
    return !!c;
  })()`);
  await sleep(500);
  const filtered = await win.webContents.executeJavaScript(
    `document.querySelectorAll('.editor .mod-row').length`
  );
  ok(filtered === 2, `开了筛选只显示 2 行（实际 ${filtered}）`);

  // ---- 导出文本（真 IPC） ----
  const exported = await win.webContents.executeJavaScript(
    `window.api.exportModlistText('联机用', [
       { type: 'workshop', id: '3343911734', name: 'Smarter Bot AI' },
       { type: 'local', name: '我的自改版' }
     ]).then((t) => t).catch((e) => 'ERR ' + String(e.message || e))`
  );
  ok(
    /shares?\/filedetails\/\?id=3343911734|sharedfiles\/filedetails\/\?id=3343911734/.test(exported),
    '导出的文本里带工坊链接',
    String(exported).slice(0, 120)
  );
  ok(/我的自改版/.test(exported), '本地 mod 也在导出文本里');

  // ---- 导入：先预览，再真的写进 ModLists ----
  const preview = await win.webContents.executeJavaScript(
    `window.api.previewImportModlist({ text: '3343911734 Smarter Bot AI\\nid=2559634234\\n2683570256' })
       .then((r) => JSON.stringify({ format: r.format, count: r.count, missing: r.missingCount, names: r.entries.map((e) => e.name) }))
       .catch((e) => 'ERR ' + String(e.message || e))`
  );
  console.log('  导入预览: ' + preview);
  const pv = JSON.parse(preview);
  ok(pv.format === 'text' && pv.count === 3, '从文字里认出 3 个工坊 id', preview);
  ok(pv.missing === 2, `其中 2 个本机没有（只有 3343911734 装了）— 实际 ${pv.missing}`);
  ok(
    pv.names[0] === 'Smarter Bot AI' && pv.names[1] === 'LuaCsForBarotrauma',
    '名字：本地已有的取本机名字，没有的从工坊接口补',
    JSON.stringify(pv.names)
  );

  const imported = await win.webContents.executeJavaScript(
    `window.api.importModlist({ entries: [
        { type: 'workshop', id: '3343911734', name: 'Smarter Bot AI' },
        { type: 'workshop', id: '2559634234', name: 'LuaCsForBarotrauma' }
      ], name: '朋友分享的合集' })
      .then((r) => JSON.stringify(r)).catch((e) => 'ERR ' + String(e.message || e))`
  );
  console.log('  导入结果: ' + imported);
  const imp = JSON.parse(imported);
  ok(imp.ok && fs.existsSync(path.join(MODLISTS, imp.fileName)), '导入后 ModLists 里真的有这个文件');
  const importedXml = fs.readFileSync(path.join(MODLISTS, imp.fileName), 'utf8');
  ok(
    /<Workshop name="Smarter Bot AI" id="3343911734" \/>/.test(importedXml) &&
      /<Workshop name="LuaCsForBarotrauma" id="2559634234" \/>/.test(importedXml),
    '导入的文件里条目写对了（游戏能直接用）'
  );

  // 同名再导一次不能覆盖已有的
  const again = await win.webContents.executeJavaScript(
    `window.api.importModlist({ entries: [{ type: 'workshop', id: '1', name: 'x' }], name: '朋友分享的合集' })
       .then((r) => r.fileName).catch((e) => 'ERR ' + String(e.message || e))`
  );
  ok(again !== imp.fileName && fs.existsSync(path.join(MODLISTS, again)), `重名导入自动改名，不覆盖（实际 ${again}）`);

  // 认不出内容的输入要报错，不能悄悄导入空合集
  const badImport = await win.webContents.executeJavaScript(
    `window.api.previewImportModlist({ text: '今天天气不错' }).then(() => 'NO-ERROR').catch((e) => String(e.message || e))`
  );
  ok(/没从这段文字里认出/.test(badImport), '认不出 id 时明确报错', String(badImport).slice(0, 100));

  ok(errors.length === 0, '渲染进程没有报错', errors.join(' | '));

  console.log(`\n=== ${fail === 0 ? '全部通过' : fail + ' 项失败'}（${pass} 通过 / ${fail} 失败）===`);
  try {
    fs.rmSync(TMP, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
  app.exit(fail === 0 ? 0 : 1);
});
