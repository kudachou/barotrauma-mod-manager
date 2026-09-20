/**
 * 端到端验证「本地 mod 与工坊 mod 的互操作」—— 也就是**会真的删/改用户 mod 目录**的那几条通道。
 *
 * 覆盖：
 *   compare:overwrite    用创意工坊版覆盖本地版（覆盖前先存快照、能回滚）
 *   compare:copyToLocal  把创意工坊 mod 复制成一个新的本地 mod
 *   localmod:delete      删除本地 mod（连快照一起，可选从合集里摘掉引用）
 *   snapshot:list/delete 快照的列出与删除
 *
 * 这些通道以前一条测试都没有，而它们是全仓库最容易造成数据丢失的地方
 *（先删后拷、rmrf、路径拼接），所以断言分成两类：
 *   1) 正常路径真的做对了事；
 *   2) 非法参数（.. / 绝对路径 / 非数字 id）**必须报错且一个字节都不改** ——
 *      这一类是回归防护，防的是"参数校验被顺手删掉"。
 *
 * 全部用**临时目录**，真实游戏目录一个字节都不动。
 */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.disableHardwareAcceleration();

const TMP = path.join(ROOT, 'tmp-compare-ui');
fs.rmSync(TMP, { recursive: true, force: true });

const USERDATA = path.join(TMP, 'userdata');
const GAME = path.join(TMP, 'game');
const LOCAL = path.join(GAME, 'LocalMods');
const MODLISTS = path.join(GAME, 'ModLists');
const CFG = path.join(GAME, 'config_player.xml');
const WS = path.join(TMP, 'steam', 'workshop', 'content', '602960');
const INST = path.join(GAME, 'WorkshopMods', 'Installed');
/** LocalMods 同级的备份根（快照就放这里） */
const BACKUPS = path.join(GAME, 'ModManagerBackups');
/** 故意放在 LocalMods 外面：用来证明 rmrf 跑不出去 */
const OUTSIDE = path.join(GAME, 'DO_NOT_DELETE');

app.setName('bmm-compare-ui-test');
app.setPath('userData', USERDATA);

function writeMod(root, folder, files) {
  const dir = path.join(root, folder);
  fs.mkdirSync(dir, { recursive: true });
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body, 'utf8');
  }
}

/**
 * 生成 filelist.xml。
 * 注意 steamworkshopid 必须是**工坊文件夹名（纯数字 id）**：attachCounterparts()
 * 就是靠 local 的 steamworkshopid 去精确匹配工坊目录名的，写成 mod 显示名会配不上。
 */
const fl = (name, version, extra = '', swid = null) =>
  `<?xml version="1.0" encoding="utf-8"?>\n<contentpackage name="${name}" ` +
  (swid ? `steamworkshopid="${swid}" ` : '') +
  `modversion="${version}" expectedhash="HASH"${extra} />\n`;

function listFiles(dir) {
  const out = [];
  for (const rel of KNOWN_FILES) {
    if (fs.existsSync(path.join(dir, rel))) out.push(rel);
  }
  return out.sort();
}
/** 测试夹具里会出现（或曾经出现）的文件，逐个 Test-Path 比递归遍历更好排查 */
const KNOWN_FILES = [
  'filelist.xml',
  'items/local.xml',
  'items/ws.xml',
  'items/old.xml',
  'items/new.xml',
  'keep.txt'
];

function fixtures() {
  for (const d of [USERDATA, GAME, LOCAL, MODLISTS, WS, INST, OUTSIDE]) {
    fs.mkdirSync(d, { recursive: true });
  }
  // 站在 LocalMods 外、但名字以 LocalMods 开头的兄弟目录：裸 startsWith 校验会漏掉它
  fs.writeFileSync(path.join(OUTSIDE, 'keep.txt'), 'must survive', 'utf8');

  /* --- 工坊 mod（Steam 订阅目录） --- */
  writeMod(WS, '5550000001', {
    'filelist.xml': fl('CoolWorkshopMod', '2.0', '', '5550000001'),
    'items/ws.xml': '<ws/>'
  });

  /* --- 本地 mod：会被覆盖的那个（steamworkshopid 指向上面那个工坊条目） --- */
  writeMod(LOCAL, '我的本地版', {
    'filelist.xml': fl('CoolWorkshopMod', '1.0', '', '5550000001'),
    'items/local.xml': '<local/>'
  });

  /* --- 本地 mod：只会被删除的那个 --- */
  writeMod(LOCAL, '待删除的mod', {
    'filelist.xml': fl('ToDelete', '1.0')
  });

  /* --- 合集：删本地 mod 时要能把它从合集里摘掉 --- */
  fs.writeFileSync(
    path.join(MODLISTS, '测试合集.xml'),
    '<?xml version="1.0" encoding="utf-8"?>\n<mods name="测试合集">\n  <Vanilla />\n' +
      '  <Local name="待删除的mod" />\n  <Local name="我的本地版" />\n</mods>\n',
    'utf8'
  );

  fs.writeFileSync(
    CFG,
    '<?xml version="1.0" encoding="utf-8"?>\r\n<config language="Simplified Chinese" savepath="">\r\n' +
      '  <contentpackages>\r\n    <regularpackages>\r\n    </regularpackages>\r\n  </contentpackages>\r\n</config>\r\n',
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
/** 真·超时计时器：注意不能复用上面的 sleep（那是 Promise 工厂，不是 setTimeout） */
const delay = (ms) => new Promise((r) => global.setTimeout(r, ms));

const { registerLocalImgScheme, handleLocalImg } = require('../electron/protocol');
const services = require('../electron/services');

registerLocalImgScheme();

app.whenReady().then(async () => {
  // 看门狗：挂住时不要把整个测试进程拖到超时，直接报出来
  const watchdog = setTimeout(() => {
    console.log('\n!!! 看门狗触发：测试卡住超过 90s，强制退出');
    console.log('pass=' + pass + ' fail=' + fail);
    app.exit(2);
  }, 90000);
  watchdog.unref?.();

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
  await sleep(2200);

  /** 调渲染层暴露的 API；返回 {ok, value, error}，不把异常抛到测试主体 */
  async function call(expr) {
    const label = String(expr).replace(/\s+/g, ' ').slice(0, 70);
    const started = Date.now();
    let res;
    try {
      res = await Promise.race([
        win.webContents.executeJavaScript(
          `(async () => { try { return { ok: true, value: await (${expr}) }; } ` +
            `catch (e) { return { ok: false, error: String((e && e.message) || e) }; } })()`
        ),
        delay(8000).then(() => ({ ok: false, error: 'TIMEOUT(8s)' }))
      ]);
    } catch (e) {
      res = { ok: false, error: 'EXEC_FAIL: ' + String((e && e.message) || e) };
    }
    const ms = Date.now() - started;
    console.log(`    [call ${ms}ms] ${label} -> ${res.ok ? 'ok' : res.error}`);
    return res;
  }

  const localDir = path.join(LOCAL, '我的本地版');
  const toDeleteDir = path.join(LOCAL, '待删除的mod');

  /* ============================ 1. compare:diff ============================ */
  console.log('\n[1] compare:diff 认得出对应的工坊版');

  const diff = await call(`window.api.getVersionDiff('我的本地版')`);
  ok(diff.ok, '能取到本地 mod 的版本对比', diff.error);
  console.log(
    '    diff = ' +
      JSON.stringify({
        local: diff.value && diff.value.local && { id: diff.value.local.id, swid: diff.value.local.steamworkshopid },
        workshop: diff.value && diff.value.workshop && { id: diff.value.workshop.id, swid: diff.value.workshop.steamworkshopid }
      })
  );
  ok(diff.ok && !!(diff.value && diff.value.workshop), '认出了对应的工坊 mod');
  ok(
    diff.ok && !!(diff.value && diff.value.workshop) && diff.value.workshop.id === '5550000001',
    '工坊 id 对得上'
  );

  /* ======================= 2. compare:overwrite 正常路径 ======================= */
  console.log('\n[2] compare:overwrite：覆盖前留快照，覆盖后能回滚');

  const beforeFiles = listFiles(localDir);
  ok(beforeFiles.includes('items/local.xml'), '覆盖前本地版有自己的 items/local.xml');

  const ow = await call(`window.api.overwriteLocalWithWorkshop('我的本地版', '5550000001')`);
  ok(ow.ok, '覆盖成功', ow.error);
  ok(!!ow.value && !!ow.value.snapshotId, '返回了快照 id（可回滚）');
  const snapId = (ow.value && ow.value.snapshotId) || '';
  // 后面还要用 snapshotId 拼路径；拿不到就给空串，让断言失败而不是抛异常打断整个测试
  const callWithSnap = (kind) =>
    kind === 'restore' ? `window.api.restoreSnapshot('我的本地版', '${snapId}')` : '';

  const afterFiles = listFiles(localDir);
  ok(afterFiles.includes('items/ws.xml'), '本地目录换成了工坊版的内容');
  ok(!afterFiles.includes('items/local.xml'), '原来的本地文件被清掉了（不是叠加）');

  const instFl = fs.readFileSync(path.join(localDir, 'filelist.xml'), 'utf8');
  ok(/modversion="2\.0"/.test(instFl), 'filelist.xml 是工坊版（modversion 2.0）');
  ok(fs.existsSync(path.join(LOCAL, '我的本地版')), '文件夹名没变（还是本地那个名字）');

  const snaps = await call(`window.api.listSnapshots('我的本地版')`);
  const snapItems = (snaps.value && snaps.value.items) || [];
  ok(snapItems.length === 1, '快照列表现为 1 份（实际 ' + snapItems.length + '）');
  ok(!!snapItems[0] && snapItems[0].id === snapId, '列出来的就是覆盖时存的那一份');
  ok(
    fs.existsSync(path.join(BACKUPS, '我的本地版', snapId, 'items', 'local.xml')),
    '快照里留着覆盖前的 items/local.xml（回滚就有东西可回）'
  );

  // 回滚
  const rs = await call(callWithSnap('restore'));
  ok(rs.ok, '回滚成功', rs.error);
  const rolledBack = listFiles(localDir);
  ok(rolledBack.includes('items/local.xml'), '回滚后本地文件回来了');
  ok(!rolledBack.includes('items/ws.xml'), '回滚后工坊文件没了');
  ok(/modversion="1\.0"/.test(fs.readFileSync(path.join(localDir, 'filelist.xml'), 'utf8')), '回滚后版本回到 1.0');

  /* ================== 3. compare:overwrite 非法参数必须什么都不改 ================== */
  console.log('\n[3] compare:overwrite：非法参数必须报错，且一个字节都不改');

  const snapshotBefore = listFiles(localDir).join(',');
  const outsideBefore = listFiles(OUTSIDE).join(',');

  const badCases = [
    [`window.api.overwriteLocalWithWorkshop('..', '5550000001')`, '..'],
    [`window.api.overwriteLocalWithWorkshop('../DO_NOT_DELETE', '5550000001')`, '../DO_NOT_DELETE'],
    // LocalMods 外面的绝对路径：不能因为"看起来像绝对路径"就放行
    [`window.api.overwriteLocalWithWorkshop('${OUTSIDE.replace(/\\/g, '\\\\')}', '5550000001')`, '绝对路径'],
    [`window.api.overwriteLocalWithWorkshop('我的本地版', '../5550000001')`, '工坊 id 带 ..'],
    [`window.api.overwriteLocalWithWorkshop('我的本地版', 'abc')`, '工坊 id 非数字']
  ];
  for (const [expr, label] of badCases) {
    const r = await call(expr);
    ok(!r.ok, `拒绝非法参数（${label}）`);
  }

  ok(
    listFiles(localDir).join(',') === snapshotBefore,
    '本地 mod 目录没被改动（非法参数不能造成任何删除）'
  );
  ok(
    fs.existsSync(path.join(OUTSIDE, 'keep.txt')) && listFiles(OUTSIDE).join(',') === outsideBefore,
    'LocalMods 外面的目录安然无恙（rmrf 跑不出去）'
  );

  // 来源不存在时要报错，并且不能把本地版删掉
  const owMissing = await call(`window.api.overwriteLocalWithWorkshop('我的本地版', '9999999999')`);
  ok(!owMissing.ok, '来源工坊 mod 不存在时报错');
  ok(listFiles(localDir).includes('items/local.xml'), '来源不存在时本地版没有被删（先检查再删）');

  /* ===================== 4. compare:copyToLocal ===================== */
  console.log('\n[4] compare:copyToLocal：把工坊 mod 复制成新的本地 mod');

  const cp = await call(`window.api.copyWorkshopToLocal('5550000001', '复制来的mod')`);
  ok(cp.ok, '复制成功', cp.error);
  const copiedDir = path.join(LOCAL, '复制来的mod');
  ok(fs.existsSync(path.join(copiedDir, 'filelist.xml')), '新本地 mod 建好了');
  ok(listFiles(copiedDir).includes('items/ws.xml'), '内容也复制过来了');
  ok(
    /name="复制来的mod"/.test(fs.readFileSync(path.join(copiedDir, 'filelist.xml'), 'utf8')),
    'filelist.xml 的 name 改成了新文件夹名（合集里的 <Local name> 才解析得到）'
  );

  const cpDup = await call(`window.api.copyWorkshopToLocal('5550000001', '复制来的mod')`);
  ok(!cpDup.ok, '同名已存在时报错而不是覆盖');

  for (const [expr, label] of [
    [`window.api.copyWorkshopToLocal('5550000001', 'a/b')`, '名字里有 /'],
    [`window.api.copyWorkshopToLocal('5550000001', '')`, '名字为空'],
    [`window.api.copyWorkshopToLocal('../5550000001', 'x')`, '工坊 id 带 ..']
  ]) {
    const r = await call(expr);
    ok(!r.ok, `拒绝非法参数（${label}）`);
  }
  ok(!fs.existsSync(path.join(LOCAL, 'x')), '非法参数没有留下任何目录');

  /* ===================== 5. snapshot:delete ===================== */
  console.log('\n[5] snapshot:delete：只删自己那份，且不许越界');

  // 先给「我的本地版」再做一个快照
  const snap2 = await call(`window.api.createSnapshot('我的本地版')`);
  ok(snap2.ok, '手动创建快照成功', snap2.error);
  const snapDir = path.join(BACKUPS, '我的本地版');
  ok(fs.existsSync(snapDir), '快照目录建好了');

  const delBad = await call(`window.api.deleteSnapshot('我的本地版', '../..')`);
  ok(!delBad.ok, '快照 id 带 .. 被拒绝');
  ok(fs.existsSync(snapDir), '被拒绝后快照目录还在');
  ok(fs.existsSync(path.join(OUTSIDE, 'keep.txt')), 'LocalMods 外面的目录依然在');

  const snap2Id = (snap2.value && snap2.value.id) || '';
  const delSnap = await call(`window.api.deleteSnapshot('我的本地版', '${snap2Id}')`);
  ok(delSnap.ok, '删除合法快照成功', delSnap.error);
  ok(
    !!snap2Id && !fs.existsSync(path.join(snapDir, snap2Id)),
    '那份快照真的被删了'
  );

  /* ===================== 6. localmod:delete ===================== */
  console.log('\n[6] localmod:delete：删 mod + 快照，并且能从合集里摘掉引用');

  // 先给它做个快照，验证删 mod 会连快照一起删
  const snap3 = await call(`window.api.createSnapshot('待删除的mod')`);
  ok(snap3.ok, '给待删除的 mod 建了快照', snap3.error);
  ok(fs.existsSync(path.join(BACKUPS, '待删除的mod')), '它的快照目录存在');

  const foot = await call(`window.api.localModFootprint('待删除的mod')`);
  ok(!!foot.value && foot.value.snapshotCount === 1, '占用统计里能看到 1 份快照');

  const delMod = await call(`window.api.deleteLocalMod('待删除的mod', true)`);
  ok(delMod.ok, '删除本地 mod 成功', delMod.error);
  ok(!fs.existsSync(toDeleteDir), 'mod 文件夹被删了');
  ok(!fs.existsSync(path.join(BACKUPS, '待删除的mod')), '它的历史快照也一并删了');
  const removedLists = (delMod.value && delMod.value.removedFromModlists) || [];
  ok(removedLists.includes('测试合集'), '报告了从哪个合集里摘掉了引用');
  const listXml = fs.readFileSync(path.join(MODLISTS, '测试合集.xml'), 'utf8');
  ok(!listXml.includes('待删除的mod'), '合集里的 <Local name="待删除的mod"> 被摘掉了');
  ok(listXml.includes('我的本地版'), '合集里别的条目没被误删');

  // 非法名字必须拒绝
  const outsideBefore2 = listFiles(OUTSIDE).join(',');
  for (const [expr, label] of [
    [`window.api.deleteLocalMod('..', false)`, '..'],
    [`window.api.deleteLocalMod('.', false)`, '.'],
    [`window.api.deleteLocalMod('', false)`, '空名字'],
    [`window.api.deleteLocalMod('../DO_NOT_DELETE', false)`, '../DO_NOT_DELETE']
  ]) {
    const r = await call(expr);
    ok(!r.ok, `deleteLocalMod 拒绝非法名字（${label}）`);
  }
  ok(fs.existsSync(path.join(OUTSIDE, 'keep.txt')), '非法删除名字没有波及 LocalMods 外面');
  ok(listFiles(OUTSIDE).join(',') === outsideBefore2, 'LocalMods 外面一个文件都没变');
  ok(fs.existsSync(localDir), '其它本地 mod 没被误删');

  // 删不存在的 mod 也要拒绝（而不是静默成功）
  // 「复制来的mod」此刻是一个真实存在的邻居：删一个相似名字不能把它带走
  const delNone = await call(`window.api.deleteLocalMod('复制来的modX', false)`);
  ok(!delNone.ok, '删不存在的 mod 会报错');
  ok(fs.existsSync(copiedDir), '删不存在的 mod 没有误伤同名前缀的邻居');

  /* ===================== 7. 界面没报错 ===================== */
  console.log('\n[7] 渲染进程');
  ok(errors.length === 0, '渲染进程没有报错', errors.join(' | '));

  console.log(`\n=== ${fail === 0 ? '全部通过' : fail + ' 项失败'}（${pass} 通过 / ${fail} 失败）===`);
  try {
    fs.rmSync(TMP, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
  app.exit(fail === 0 ? 0 : 1);
});
