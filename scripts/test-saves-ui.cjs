/**
 * 端到端验证「存档」页：能看出每个存档启用了哪些 mod、哪个合集能覆盖它、两个动作能落盘。
 *
 * 全部用**临时存档目录 + 隔离 userData**，真实的存档和 config_player.xml 一个字节都不会动。
 */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const zlib = require('node:zlib');

const ROOT = path.join(__dirname, '..');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.disableHardwareAcceleration();

const TMP = path.join(ROOT, 'tmp-saves-ui');
fs.rmSync(TMP, { recursive: true, force: true });

const USERDATA = path.join(TMP, 'userdata');
const GAME = path.join(TMP, 'game');
const LOCAL = path.join(GAME, 'LocalMods');
const WS = path.join(GAME, 'workshop');
const INSTALLED = path.join(GAME, 'Installed');
const MODLISTS = path.join(GAME, 'ModLists');
const SAVES = path.join(GAME, 'saves');
const CFG = path.join(GAME, 'config_player.xml');

app.setName('bmm-saves-ui-test');
app.setPath('userData', USERDATA);

const { listModlists, getModlist } = require('../electron/services/modlists');

function writeMod(dir, folder, body) {
  fs.mkdirSync(path.join(dir, folder), { recursive: true });
  fs.writeFileSync(path.join(dir, folder, 'filelist.xml'), body, 'utf8');
}

/** 造一个跟真实存档同构的 .save（gzip + UTF-16LE 前缀 + XML） */
function writeSave(dir, file, names, attrs = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const a = {
    savetime: '1789363813',
    submarine: 'Helena-海伦娜-无模组自行大改',
    version: '1.13.4.0',
    ismultiplayer: 'false',
    ...attrs
  };
  const xml =
    '<?xml version="1.0" encoding="utf-8"?>\n' +
    `<Gamesession ${Object.entries(a)
      .map(([k, v]) => `${k}="${v}"`)
      .join(' ')} selectedcontentpackagenames="${names.join('|')}">\n` +
    '</Gamesession>\n';
  const body = Buffer.concat([Buffer.from('gamesession.xml', 'utf16le'), Buffer.from(xml, 'utf8')]);
  fs.writeFileSync(path.join(dir, file), zlib.gzipSync(body));
}

function fixtures() {
  for (const d of [USERDATA, GAME, LOCAL, WS, INSTALLED, MODLISTS, SAVES]) {
    fs.mkdirSync(d, { recursive: true });
  }

  writeMod(LOCAL, 'my-folder', '<contentpackage name="Lmod" modversion="1.0" />');
  for (const [id, name] of [
    ['7001', 'Amod'],
    ['7002', 'Bmod'],
    ['7003', 'Cmod']
  ]) {
    const xml = `<contentpackage name="${name}" modversion="1.0" steamworkshopid="${id}" />`;
    writeMod(WS, id, xml);
    writeMod(INSTALLED, id, xml);
  }

  // 合集：全套（A/B/C/Lmod）、只有A（A）
  fs.writeFileSync(
    path.join(MODLISTS, '全套.xml'),
    '<?xml version="1.0" encoding="utf-8"?>\n<mods name="全套">\n  <Vanilla />\n' +
      '  <Workshop name="Amod" id="7001" />\n  <Workshop name="Bmod" id="7002" />\n' +
      '  <Workshop name="Cmod" id="7003" />\n  <Local name="my-folder" />\n</mods>\n',
    'utf8'
  );
  fs.writeFileSync(
    path.join(MODLISTS, '只有A.xml'),
    '<?xml version="1.0" encoding="utf-8"?>\n<mods name="只有A">\n  <Vanilla />\n' +
      '  <Workshop name="Amod" id="7001" />\n</mods>\n',
    'utf8'
  );

  writeSave(SAVES, '完全一致.save', ['Vanilla', 'Amod', 'Bmod', 'Cmod', 'Lmod']);
  writeSave(SAVES, '被覆盖.save', ['Vanilla', 'Amod', 'Bmod']);
  writeSave(SAVES, '没人覆盖.save', ['Vanilla', 'Amod', 'Bmod', 'Cmod', 'Lmod', 'Dmod']);
  writeSave(path.join(SAVES, 'Multiplayer'), '联机.save', ['Vanilla', 'Amod'], {
    ismultiplayer: 'true',
    submarine: 'Azimuth'
  });

  // savepath 指向临时存档目录，config 里同时要有 contentpackages（应用要用）
  fs.writeFileSync(
    CFG,
    '<?xml version="1.0" encoding="utf-8"?>\r\n' +
      `<config language="Simplified Chinese" savepath="${SAVES}">\r\n` +
      '  <contentpackages>\r\n' +
      '    <!--Vanilla-->\r\n' +
      '    <corepackage\r\n' +
      '      path="Content/ContentPackages/Vanilla.xml" />\r\n' +
      '    <regularpackages>\r\n' +
      '    </regularpackages>\r\n' +
      '  </contentpackages>\r\n' +
      '</config>\r\n',
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
        installedWorkshopDir: INSTALLED
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

const LIST = `Array.from(document.querySelectorAll('.list-row')).map((r) => r.textContent.replace(/\\s+/g,' ').trim())`;
const DETAIL = `(() => {
  const ed = document.querySelector('.editor');
  return ed ? ed.textContent.replace(/\\s+/g, ' ').trim() : null;
})()`;
const clickRow = (text) => `(() => {
  const r = Array.from(document.querySelectorAll('.list-row')).find((x) => x.textContent.includes(${JSON.stringify(
    text
  )}));
  if (!r) return false;
  r.click();
  return true;
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
  await sleep(1800);

  ok(app.getPath('userData') === USERDATA, '用的是隔离的 userData');

  // 切到「存档」页（第 3 个导航项）
  await win.webContents.executeJavaScript(
    `Array.from(document.querySelectorAll('.nav-item')).find((x) => x.textContent.trim().startsWith('存档')).click()`
  );
  await sleep(1600);

  const rows = await win.webContents.executeJavaScript(LIST);
  console.log('  存档列表: ' + JSON.stringify(rows, null, 1));
  ok(rows.length === 4, `列出 4 个存档（实际 ${rows.length}）`);
  ok(rows.some((r) => r.includes('完全一致')), '有存档标了「完全一致」');
  ok(rows.some((r) => r.includes('全套') && r.includes('覆盖')), '有存档标了「全套」覆盖');
  ok(rows.some((r) => r.includes('没有对应合集')), '没人覆盖的存档如实标出');
  ok(rows.some((r) => r.includes('多人')), '多人存档标了「多人」');
  const foot = await win.webContents.executeJavaScript(
    `(document.querySelector('.list-foot')||{}).textContent||''`
  );
  ok(foot.includes(SAVES), '底部显示的是临时存档目录（没碰真实存档）', foot);

  // ---- 完全一致的存档 ----
  ok(await win.webContents.executeJavaScript(clickRow('完全一致')), '点开「完全一致」存档');
  await sleep(600);
  let d = await win.webContents.executeJavaScript(DETAIL);
  ok(d.includes('完全一致') && d.includes('全套'), '详情里指出对应的合集是「全套」');
  ok(d.includes('应用「全套」'), '给出「应用「全套」」按钮');
  ok(d.includes('Amod') && d.includes('Bmod') && d.includes('Cmod') && d.includes('Lmod'), '按顺序列出存档记录的 mod');

  // ---- 被覆盖的存档 ----
  ok(await win.webContents.executeJavaScript(clickRow('被覆盖')), '点开「被覆盖」存档');
  await sleep(600);
  d = await win.webContents.executeJavaScript(DETAIL);
  ok(d.includes('完全覆盖'), '说明是「完全覆盖」而不是完全一致');
  ok(d.includes('Cmod') && d.includes('Lmod'), '把合集里多出来的 mod 列出来（Cmod / Lmod）');
  ok(d.includes('客户端'), '说明多出来的多半是客户端型 mod（存档不记录它们）');
  ok(!d.includes('应用「只有A」'), '只有部分重合的合集会明确列在下面而不是当主按钮');

  // ---- 存为新合集 ----
  const before = listModlists(MODLISTS).map((l) => l.fileName);
  ok(await win.webContents.executeJavaScript(clickBtn('存为新合集')), '点「存为新合集」');
  await sleep(1600);
  const after = listModlists(MODLISTS).map((l) => l.fileName);
  const created = after.find((f) => !before.includes(f));
  console.log(`  新建的合集: ${created}`);
  ok(created === '被覆盖.xml', `用存档名建了新合集（实际 ${created}）`);
  if (created) {
    const ml = getModlist(MODLISTS, created);
    ok(
      ml.entries.length === 2 && ml.entries[0].id === '7001' && ml.entries[1].id === '7002',
      `新合集内容 = 存档记录的 mod（实际 ${JSON.stringify(ml.entries)}）`
    );
  }

  // 再点一次：名字已被占用，必须另起一个名字，绝不能把刚建的合集覆盖掉
  ok(await win.webContents.executeJavaScript(clickBtn('存为新合集')), '再点一次「存为新合集」');
  await sleep(1600);
  const after2 = listModlists(MODLISTS).map((l) => l.fileName);
  const created2 = after2.find((f) => !after.includes(f));
  console.log(`  第二个合集: ${created2}`);
  ok(
    created2 === '被覆盖（存档）.xml',
    `名字被占用时自动改名，不覆盖已有合集（实际 ${created2}）`
  );
  ok(
    getModlist(MODLISTS, '被覆盖.xml').entries.length === 2,
    '原来那个合集没被改掉'
  );

  // ---- 按存档启用 ----
  ok(await win.webContents.executeJavaScript(clickBtn('按存档启用')), '点「按存档启用」');
  await sleep(2000);
  const cfg = fs.readFileSync(CFG, 'utf8');
  ok(cfg.includes('Installed/7001/filelist.xml'), '配置里写入了 Amod');
  ok(cfg.includes('Installed/7002/filelist.xml'), '配置里写入了 Bmod');
  ok(fs.existsSync(`${CFG}.bak`), '应用前照常备份');
  const baks = fs.readdirSync(GAME).filter((n) => n.startsWith('config_player.xml.bak'));
  ok(baks.length === 1, `备份仍然只有一个（实际 ${baks.length}）`);

  // ---- 没有人能覆盖的存档 ----
  ok(await win.webContents.executeJavaScript(clickRow('没人覆盖')), '点开没人覆盖的存档');
  await sleep(600);
  d = await win.webContents.executeJavaScript(DETAIL);
  ok(d.includes('没有任何合集能覆盖'), '如实说没有合集能覆盖');
  ok(d.includes('游戏里没有'), '把游戏里已经没有的 mod 标出来');

  ok(errors.length === 0, '渲染进程没有报错', errors.join(' | '));

  console.log(`\n=== ${fail === 0 ? '全部通过' : fail + ' 项失败'}（${pass} 通过 / ${fail} 失败）===`);
  try {
    fs.rmSync(TMP, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
  app.exit(fail === 0 ? 0 : 1);
});
