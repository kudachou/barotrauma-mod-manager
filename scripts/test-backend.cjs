/**
 * 后端自检
 *
 * 1~2、4~5 用**合成样本**在临时目录里跑，不依赖任何本机数据，任何人 clone 下来都能跑。
 * 第 3 节扫描真实游戏目录，属于可选集成测试：检测不到就跳过。
 *
 * 需要指定路径时可用环境变量：
 *   BMM_GAME_DIR       游戏根目录（如 …\steamapps\common\Barotrauma）
 *   BMM_WORKSHOP_DIR   创意工坊 mod 目录（如 …\workshop\content\602960）
 */
const fs = require('node:fs');
const path = require('node:path');

const mods = require('../electron/services/mods');
const modlists = require('../electron/services/modlists');
const config = require('../electron/services/config');
const steam = require('../electron/services/steam');
const { detectPaths } = require('../electron/services/detect');

let failures = 0;
function ok(cond, msg) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
}

const TMP = path.join(__dirname, '..', 'tmp-test');
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

function writeMod(root, folder, filelistXml) {
  const dir = path.join(root, folder);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'filelist.xml'), filelistXml, 'utf8');
  return dir;
}

try {
  /* ------------------- 1. filelist.xml 解析（合成样本） ------------------- */
  console.log('\n[1] filelist.xml 解析');

  const standard = writeMod(
    path.join(TMP, 'scan', 'workshop'),
    '1234567890',
    `<?xml version="1.0" encoding="utf-8"?>
<contentpackage name="测试模组" modversion="1.2.3" corepackage="False" steamworkshopid="1234567890" gameversion="1.13.4.0" expectedhash="ABCDEF">
  <Item file="%ModDir%/x.xml" />
</contentpackage>`
  );
  const p1 = mods.parseFilelist(path.join(standard, 'filelist.xml'));
  ok(p1.name === '测试模组', 'name 解析正确（含中文）');
  ok(p1.modVersion === '1.2.3', 'modversion 解析正确');
  // 这是曾经踩过的坑：属性匹配不能用子串，否则 version 会命中 gameversion
  ok(p1.modVersion !== p1.gameVersion, 'modversion 没有被 gameversion 误匹配');
  ok(p1.gameVersion === '1.13.4.0', 'gameversion 解析正确');
  ok(p1.steamworkshopid === '1234567890', 'steamworkshopid 解析正确');
  ok(p1.corepackage === false, 'corepackage="False" → false');
  ok(p1.expectedhash === 'ABCDEF', 'expectedhash 解析正确');

  const single = writeMod(
    path.join(TMP, 'scan', 'workshop'),
    'singlequote',
    `<contentpackage name='单引号模组' corepackage="true" />`
  );
  const p2 = mods.parseFilelist(path.join(single, 'filelist.xml'));
  ok(p2.name === '单引号模组', '支持单引号属性值');
  ok(p2.corepackage === true, 'corepackage="true" → true');
  ok(p2.modVersion === null, '缺少 modversion 时为 null');

  const legacy = writeMod(
    path.join(TMP, 'scan', 'workshop'),
    'legacy',
    `<contentpackage name="老版本格式" version="2.0" />`
  );
  const p3 = mods.parseFilelist(path.join(legacy, 'filelist.xml'));
  ok(p3.modVersion === '2.0', '兼容老格式的 version 属性');

  const bom = writeMod(
    path.join(TMP, 'scan', 'workshop'),
    'withbom',
    `\uFEFF<contentpackage name="带BOM" modversion="1.0" />`
  );
  ok(mods.parseFilelist(path.join(bom, 'filelist.xml')).name === '带BOM', '带 UTF-8 BOM 也能解析');

  /* ------------------------ 2. 版本比较与对比 ------------------------ */
  console.log('\n[2] 版本比较');
  const cv = mods.compareVersions;
  ok(cv('1.0.0', '1.0.1') === -1, '1.0.0 < 1.0.1');
  ok(cv('1.0.10', '1.0.9') === 1, '1.0.10 > 1.0.9（按数字比，不是字符串）');
  ok(cv('2.0', '2.0.0') === 0, '2.0 == 2.0.0');
  ok(cv('1.0', '1.0') === 0, '相同版本返回 0');
  ok(cv('1.0.1a', '1.0.1b') === -1, '非纯数字段回退字符串比较');
  ok(cv(null, '1.0') === null, '缺失版本返回 null');
  ok(mods.statusOf('1.0', '1.1') === 'older', "statusOf → older（工坊更新）");
  ok(mods.statusOf('2.0', '1.1') === 'newer', 'statusOf → newer（本地已改版）');
  ok(mods.statusOf('1.1', '1.1') === 'same', 'statusOf → same');

  const wsList = mods.scanDir('workshop', path.join(TMP, 'scan', 'workshop'));
  ok(wsList.length === 4, `scanDir 扫到 ${wsList.length} 个合成工坊 mod`);

  writeMod(
    path.join(TMP, 'scan', 'local'),
    '我的自改版',
    `<contentpackage name="我的自改版" modversion="1.2.2" steamworkshopid="1234567890" />`
  );
  const localMods = mods.scanDir('local', path.join(TMP, 'scan', 'local'));
  ok(localMods.length === 1, 'scanDir 扫到 1 个合成本地 mod');
  ok(localMods[0].modVersion === '1.2.2', '本地 mod 版本解析正确');
  mods.attachCounterparts(localMods, wsList, path.join(TMP, 'ScanInstalled'));
  ok(!!localMods[0].counterpart, '靠 steamworkshopid 匹配到了工坊对应版本');
  ok(localMods[0].counterpart.status === 'older', '本地 1.2.2 < 工坊 1.2.3 → older');
  ok(localMods[0].counterpart.installed === false, '工坊版未安装时 installed=false');

  /* --------------------- 3. 扫描真实目录（可选） --------------------- */
  console.log('\n[3] 扫描真实游戏目录（可选集成测试）');
  const detected = detectPaths({ localAppData: process.env.LOCALAPPDATA });
  const GAME = process.env.BMM_GAME_DIR || detected.gameDir;
  const WS = process.env.BMM_WORKSHOP_DIR || detected.workshopModsDir;

  if (!GAME || !WS) {
    console.log('  SKIP  未检测到潜渊症安装，跳过本节');
    console.log(`        gameDir=${GAME || '(未找到)'}  workshopModsDir=${WS || '(未找到)'}`);
    console.log('        可用 BMM_GAME_DIR / BMM_WORKSHOP_DIR 环境变量指定后重跑');
  } else {
    console.log(`  gameDir = ${GAME}`);
    console.log(`  workshopModsDir = ${WS}`);
    const realLocal = mods.scanDir('local', path.join(GAME, 'LocalMods'));
    const realWs = mods.scanDir('workshop', WS);
    console.log(`  本地 mod: ${realLocal.length} 个，工坊 mod: ${realWs.length} 个`);
    ok(Array.isArray(realLocal) && Array.isArray(realWs), '两个目录都能扫描（哪怕是空的）');

    mods.attachCounterparts(realLocal, realWs, detected.installedWorkshopDir);
    const matched = realLocal.filter((m) => m.counterpart);
    console.log(`  其中 ${matched.length} 个本地 mod 匹配到工坊版本`);
    ok(
      matched.every((m) => ['same', 'older', 'newer', 'different'].includes(m.counterpart.status)),
      '对比状态取值合法'
    );

    const realLists = modlists.listModlists(path.join(GAME, 'ModLists'));
    console.log(`  合集: ${realLists.length} 个${realLists.length ? ' — ' + realLists.map((l) => `${l.name}(${l.count})`).join('  ') : ''}`);
    ok(
      realLists.every((l) => l.entries === undefined && typeof l.count === 'number'),
      '合集摘要格式正确'
    );
  }

  /* ------------------- 4. 合集读写往返（临时目录） ------------------- */
  console.log('\n[4] 合集写入与往返');
  modlists.saveModlist(TMP, '测试合集.xml', '测试合集', [
    { type: 'workshop', name: 'LuaCsForBarotrauma', id: '2559634234' },
    { type: 'local', name: '我的自改版' }
  ]);
  console.log('  写回内容:\n' + fs.readFileSync(path.join(TMP, '测试合集.xml'), 'utf8').trim());
  const back = modlists.getModlist(TMP, '测试合集.xml');
  ok(back && back.name === '测试合集' && back.entries.length === 2, '中文合集名 / 条目往返正确');
  ok(back.entries[1].name === '我的自改版', '中文 mod 名往返正确');
  ok(back.entries[1].type === 'local' && back.entries[0].type === 'workshop', '类型往返正确');

  const added = modlists.addModToModlist(TMP, '测试合集.xml', '测试合集', {
    type: 'local',
    name: '另一个本地mod'
  });
  ok(added.entries.length === 3, '加入 mod 成功');
  const dup = modlists.addModToModlist(TMP, '测试合集.xml', '测试合集', {
    type: 'local',
    name: '另一个本地mod'
  });
  ok(dup.entries.length === 3, '重复加入会被去重');
  const removed = modlists.removeModFromModlist(TMP, '测试合集.xml', {
    type: 'workshop',
    id: '2559634234'
  });
  ok(removed.entries.length === 2, '移出 mod 成功');

  const auto = modlists.addModToModlist(TMP, '新建的合集.xml', '新建的合集', {
    type: 'local',
    name: '我的自改版'
  });
  ok(fs.existsSync(path.join(TMP, '新建的合集.xml')) && auto.entries.length === 1, '合集不存在时会自动创建');

  let blocked = false;
  try {
    modlists.getModlist(TMP, '..\\..\\config_player.xml');
  } catch {
    blocked = true;
  }
  ok(blocked, '目录穿越文件名被拒绝');

  /* ---------------- 5. 应用到 config_player.xml（合成配置） ---------------- */
  console.log('\n[5] 应用到 config_player.xml');

  const localRoot = path.join(TMP, 'apply', 'LocalMods');
  const wsRoot = path.join(TMP, 'apply', 'workshop');
  const installedRoot = path.join(TMP, 'apply', 'Installed');
  writeMod(localRoot, '我的自改版', `<contentpackage name="我的自改版" modversion="1.0" />`);
  writeMod(wsRoot, '2559634234', `<contentpackage name="LuaCsForBarotrauma" modversion="1.0" />`);
  writeMod(installedRoot, '2559634234', `<contentpackage name="LuaCsForBarotrauma" modversion="1.0" />`);

  // 刻意造一份带 BOM + CRLF + 其它设置段的配置，验证「区域外逐字节不变」
  const BOM = '\uFEFF';
  const cfgPath = path.join(TMP, 'apply', 'config_player.xml');
  fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
  const cfgBody =
    '<?xml version="1.0" encoding="utf-8"?>\r\n' +
    '<config language="English" savepath="">\r\n' +
    '  <graphicssettings width="1920" height="1080" />\r\n' +
    '  <contentpackages>\r\n' +
    '    <!--Vanilla-->\r\n' +
    '    <corepackage\r\n' +
    '      path="Content/ContentPackages/Vanilla.xml" />\r\n' +
    '    <regularpackages>\r\n' +
    '      <package\r\n' +
    '        path="old/filelist.xml" />\r\n' +
    '    </regularpackages>\r\n' +
    '  </contentpackages>\r\n' +
    '  <keymapping Select="PrimaryMouse" />\r\n' +
    '</config>\r\n';
  fs.writeFileSync(cfgPath, BOM + cfgBody, 'utf8');
  const before = fs.readFileSync(cfgPath, 'utf8');

  const r = config.applyToGame(
    {
      configPlayerPath: cfgPath,
      gameDir: path.join(TMP, 'apply'),
      installedWorkshopDir: installedRoot,
      localModsDir: localRoot
    },
    [
      { type: 'workshop', name: 'LuaCsForBarotrauma', id: '2559634234' },
      { type: 'workshop', name: '没装的mod', id: '999999999999' },
      { type: 'local', name: '我的自改版' }
    ]
  );
  const after = fs.readFileSync(cfgPath, 'utf8');

  console.log(`  备份文件: ${path.basename(r.backup)}`);
  console.log(`  未安装/缺失: ${JSON.stringify(r.missing)}`);
  ok(fs.existsSync(r.backup), '生成了 config 备份');
  ok(after.includes('Installed/2559634234/filelist.xml'), '工坊 mod 写成游戏实际使用的 Installed 路径');
  ok(
    after.includes('path="LocalMods/我的自改版/filelist.xml"'),
    '本地 mod 写成游戏自己的相对形式 LocalMods/<文件夹>/filelist.xml'
  );
  ok(
    !/path="[A-Za-z]:[^"]*LocalMods/.test(after),
    '本地 mod 不能写成绝对路径 —— 游戏按 LocalMods/ 前缀识别，绝对路径它认不出来'
  );
  ok(after.includes('Vanilla.xml'), 'corepackage 仍为 Vanilla');
  ok(after.includes('keymapping'), '其它设置段仍在');
  ok(!after.includes('old/filelist.xml'), '旧的包列表已被替换');

  // LocalMods 放在游戏目录外时退回绝对路径（那种情况游戏本来也找不到）
  const outside = path.join(TMP, 'elsewhere', 'LocalMods');
  writeMod(outside, '外面的mod', `<contentpackage name="外面的mod" modversion="1.0" />`);
  const outsidePath = config.localModPath(
    { gameDir: path.join(TMP, 'apply'), localModsDir: outside },
    '外面的mod'
  );
  ok(path.isAbsolute(outsidePath), 'LocalMods 在游戏目录外时退回绝对路径（而不是 ../..）');

  const splitOut = (s) => {
    const m = s.match(/^([\s\S]*?)<contentpackages>[\s\S]*?<\/contentpackages>([\s\S]*)$/i);
    return m ? [m[1], m[2]] : null;
  };
  const sb = splitOut(before);
  const sa = splitOut(after);
  ok(!!sb && !!sa, '两侧都能定位到 contentpackages 段');
  ok(sb && sa && sb[0] === sa[0], 'contentpackages 之前的内容逐字节未变');
  ok(sb && sa && sb[1] === sa[1], 'contentpackages 之后的内容逐字节未变');
  ok(before.charCodeAt(0) === 0xfeff && after.charCodeAt(0) === 0xfeff, 'UTF-8 BOM 被保留');
  ok(/\r\n/.test(after), 'CRLF 换行风格被保留');
  ok(r.missing.length === 1 && r.missing[0] === '没装的mod', '正确报告未安装的 mod');

  /* ---- 备份策略：只留一个、每次应用覆盖；顺手清理旧版堆下来的时间戳备份 ---- */
  const applyDir = path.dirname(cfgPath);
  const bakFixed = path.join(applyDir, 'config_player.xml.bak');
  const bakList = () =>
    fs.readdirSync(applyDir).filter((n) => n.startsWith('config_player.xml.bak'));
  const applySettings = {
    configPlayerPath: cfgPath,
    gameDir: path.join(TMP, 'apply'),
    installedWorkshopDir: installedRoot,
    localModsDir: localRoot
  };

  ok(r.changed === true, '内容变化时 changed=true');
  ok(r.backupName === 'config_player.xml.bak', '备份用固定文件名 config_player.xml.bak');
  ok(fs.existsSync(bakFixed), '固定备份文件已生成');
  ok(fs.readFileSync(bakFixed, 'utf8') === before, '备份内容 = 应用之前的配置');
  ok(bakList().length === 1, `首次应用后只有 1 个备份文件（实际 ${bakList().length}）`);

  // 造两个老版本留下的时间戳备份，外加一个不是我们格式的备份（不许误删）
  fs.writeFileSync(path.join(applyDir, 'config_player.xml.bak-20260101-010101'), 'old1', 'utf8');
  fs.writeFileSync(path.join(applyDir, 'config_player.xml.bak-20260102-020202'), 'old2', 'utf8');
  fs.writeFileSync(path.join(applyDir, 'config_player.xml.bak-mine'), 'keepme', 'utf8');

  // 第二次应用（内容不同）→ 覆盖同一个备份
  const bkApply2 = config.applyToGame(applySettings, [
    { type: 'workshop', name: 'LuaCsForBarotrauma', id: '2559634234' }
  ]);
  const cfgAfterR2 = fs.readFileSync(cfgPath, 'utf8');
  ok(
    bkApply2.prunedBackups.length === 2,
    `清理掉 2 个旧时间戳备份（实际 ${bkApply2.prunedBackups.length}）`
  );
  ok(
    !fs.existsSync(path.join(applyDir, 'config_player.xml.bak-20260101-010101')) &&
      !fs.existsSync(path.join(applyDir, 'config_player.xml.bak-20260102-020202')),
    '旧的时间戳备份文件被删除'
  );
  ok(fs.existsSync(path.join(applyDir, 'config_player.xml.bak-mine')), '不符合时间戳格式的备份不动');
  ok(fs.readFileSync(bakFixed, 'utf8') === after, '第二次应用覆盖固定备份（内容是上一次应用后的状态）');
  ok(
    bakList().sort().join(',') === 'config_player.xml.bak,config_player.xml.bak-mine',
    `备份没有累积（实际 ${bakList().sort().join(',')}）`
  );

  // 第三次应用：内容完全一样 → 不写文件、不碰备份
  const bkApply3 = config.applyToGame(applySettings, [
    { type: 'workshop', name: 'LuaCsForBarotrauma', id: '2559634234' }
  ]);
  ok(bkApply3.changed === false, '重复应用同一个合集时 changed=false');
  ok(bkApply3.backup === null, '没有改动就不动备份');
  ok(fs.readFileSync(bakFixed, 'utf8') === after, '备份没被"已应用之后"的状态冲掉');
  ok(fs.readFileSync(cfgPath, 'utf8') === cfgAfterR2, '重复应用后配置内容一字未动');

  // 缺少 contentpackages 段时必须中止且不写文件
  const badCfg = path.join(TMP, 'apply', 'bad.xml');
  const badBody = '<?xml version="1.0"?>\n<config />\n';
  fs.writeFileSync(badCfg, badBody, 'utf8');
  let threw = false;
  try {
    config.applyToGame({ configPlayerPath: badCfg, installedWorkshopDir: '', localModsDir: '' }, []);
  } catch {
    threw = true;
  }
  ok(threw, '缺少 contentpackages 段时抛错中止');
  ok(fs.readFileSync(badCfg, 'utf8') === badBody, '中止后原文件未被修改');

  let missingThrew = false;
  try {
    config.applyToGame({ configPlayerPath: path.join(TMP, '不存在.xml'), installedWorkshopDir: '', localModsDir: '' }, []);
  } catch {
    missingThrew = true;
  }
  ok(missingThrew, '配置文件不存在时抛错');

  /* ------------------------ 6. 模块导出检查 ------------------------ */
  console.log('\n[6] 模块导出检查');
  ok(
    typeof steam.fetchDetails === 'function' && typeof steam.downloadPreview === 'function',
    '封面服务导出 fetchDetails / downloadPreview'
  );
  ok(
    typeof mods.scanDir === 'function' && typeof mods.parseFilelist === 'function',
    'mods 导出 scanDir / parseFilelist'
  );
  ok(
    typeof modlists.saveModlist === 'function' && typeof modlists.getModlist === 'function',
    'modlists 导出 saveModlist / getModlist'
  );
  ok(typeof config.applyToGame === 'function', 'config 导出 applyToGame');
  ok(typeof detectPaths === 'function', 'detect 导出 detectPaths');

  /* ------------------ 7. 快照 / 回滚 / 工坊备份（合成样本） ------------------ */

  console.log('\n[7] 快照与回滚（每个 mod 只留 1 份）');

  const bk = require('../electron/services/backup');
  const bkRoot = path.join(TMP, 'bk');
  const bkSettings = {
    gameDir: bkRoot,
    localModsDir: path.join(bkRoot, 'LocalMods'),
    workshopModsDir: path.join(bkRoot, 'steam', '602960'),
    installedWorkshopDir: path.join(bkRoot, 'installed')
  };

  const localMod = path.join(bkSettings.localModsDir, '我的mod');
  const writeData = (v) => fs.writeFileSync(path.join(localMod, 'data.txt'), v, 'utf8');
  const readData = () => fs.readFileSync(path.join(localMod, 'data.txt'), 'utf8');

  fs.mkdirSync(localMod, { recursive: true });
  fs.writeFileSync(
    path.join(localMod, 'filelist.xml'),
    '<contentpackage name="我的mod" modversion="1.0" steamworkshopid="111" />',
    'utf8'
  );
  writeData('第一版');

  ok(bk.MAX_SNAPSHOTS === 1, `默认每个 mod 只保留 ${bk.MAX_SNAPSHOTS} 份快照`);
  ok(bk.snapshotRoot(bkSettings) === path.join(bkRoot, 'ModManagerBackups'), '快照根目录在 LocalMods 同级');
  ok(bk.listSnapshots(bkSettings, '我的mod').length === 0, '初始没有快照');

  // 真实用法：快照存的是「改动前」的样子
  const snap1 = bk.createSnapshot(bkSettings, '我的mod', { label: '改动前' });
  ok(!!snap1.id && snap1.files === 2, `创建快照成功（${snap1.files} 个文件）`);
  ok(bk.listSnapshots(bkSettings, '我的mod').length === 1, '创建后是 1 份');

  writeData('第二版');
  const snap2 = bk.createSnapshot(bkSettings, '我的mod', { label: '第二版改动前' });
  ok(snap2.id !== snap1.id, '同一秒内连续创建也不会撞 id');

  const list = bk.listSnapshots(bkSettings, '我的mod');
  ok(list.length === 1, `再创建后仍然只有 ${list.length} 份（旧的自动清掉，省空间）`);
  ok(list[0].id === snap2.id, '留下的是最新的那份');
  ok(list[0].label === '第二版改动前', '备注跟着最新那份');

  // 场景：快照=第一版，本地已被改成第二版 → 回滚应回到第一版
  bk.deleteSnapshot(bkSettings, '我的mod', snap2.id);
  const fresh = bk.createSnapshot(bkSettings, '我的mod', { label: '第二版' }); // 快照=第二版
  writeData('第三版'); // 本地被改坏
  const restored = bk.restoreSnapshot(bkSettings, '我的mod', fresh.id);
  ok(readData() === '第二版', '回滚后内容回到快照时的状态（第二版）');
  ok(!!restored.undoId, '回滚会返回一个「回滚前」快照 id');

  const afterList = bk.listSnapshots(bkSettings, '我的mod');
  ok(afterList.length === 1, '回滚后仍然只有 1 份快照（回滚前那份顶替上来）');
  ok(afterList[0].id === restored.undoId, '这份就是「回滚前」的状态');

  const rollBack = bk.restoreSnapshot(bkSettings, '我的mod', restored.undoId);
  ok(readData() === '第三版', '再回滚一次就回到第三版 —— 回滚本身可撤销');
  ok(!!rollBack.undoId, '第二次回滚同样可撤销');
  ok(bk.listSnapshots(bkSettings, '我的mod').length === 1, '无论滚多少次，始终只占 1 份快照');

  let guard = false;
  try {
    bk.createSnapshot(bkSettings, '不存在的mod');
  } catch {
    guard = true;
  }
  ok(guard, '给不存在的本地 mod 打快照会报错');

  console.log('\n[7b] 本地 mod 占用统计与一键删除');

  const fp = bk.localModFootprint(bkSettings, '我的mod');
  ok(fp.exists && fp.modBytes > 0, `算得出 mod 本体占用（${fp.modBytes} B）`);
  ok(fp.snapshotCount === 1 && fp.snapshotBytes > 0, `算得出快照占用（${fp.snapshotBytes} B）`);
  ok(fp.totalBytes === fp.modBytes + fp.snapshotBytes, '总体积 = 本体 + 快照');

  const del = bk.deleteLocalModFiles(bkSettings, '我的mod');
  ok(!fs.existsSync(localMod), 'mod 文件夹已删除');
  ok(
    !fs.existsSync(path.join(bk.snapshotRoot(bkSettings), '我的mod')),
    '它的历史快照目录也一并删除'
  );
  ok(
    del.freedBytes === fp.totalBytes && del.snapshotCount === 1,
    `返回释放信息（${del.freedBytes} B / ${del.snapshotCount} 份快照）`
  );

  let pathGuard = false;
  try {
    bk.deleteLocalModFiles(bkSettings, '..\\..\\config_player.xml');
  } catch {
    pathGuard = true;
  }
  ok(pathGuard, '拒绝删除 LocalMods 之外的路径');

  // 给下一节留一个本地 mod（用来验证「更新已有副本前留快照」）
  fs.mkdirSync(localMod, { recursive: true });
  fs.writeFileSync(
    path.join(localMod, 'filelist.xml'),
    '<contentpackage name="我的mod" modversion="1.0" steamworkshopid="111" />',
    'utf8'
  );
  writeData('第一版');

  console.log('\n[8] 一键备份工坊 mod 到本地');

  writeMod(
    path.join(bkSettings.workshopModsDir),
    '111',
    '<contentpackage name="工坊模组A" modversion="2.0" steamworkshopid="111" />'
  );
  writeMod(
    path.join(bkSettings.workshopModsDir),
    '222',
    '<contentpackage name="工坊模组B" modversion="1.0" steamworkshopid="222" />'
  );
  writeMod(
    path.join(bkSettings.installedWorkshopDir),
    '222',
    '<contentpackage name="工坊模组B" modversion="1.0" steamworkshopid="222" installed="true" />'
  );

  const plan = bk.planWorkshopBackup(bkSettings);
  console.log(
    `  计划: 共 ${plan.items.length} 个（新建 ${plan.newCount} / 更新 ${plan.updateCount}），` +
      `跳过 ${plan.skipped.length}，合计 ${(plan.totalBytes / 1024).toFixed(1)} KB`
  );
  ok(plan.items.length === 2, '两个工坊 mod 都进了计划');
  ok(plan.updateCount === 1, '已有本地副本的（按 steamworkshopid 认出）算作「更新」');
  ok(plan.newCount === 1, '其余算作「新建」');
  ok(plan.items.every((i) => i.folder && i.source), '每项都有目标文件夹和来源目录');

  const result = bk.runWorkshopBackup(bkSettings, plan);
  ok(result.done === 2 && result.errors.length === 0, `复制完成：${result.done} 个，0 错误`);
  ok(
    fs.existsSync(path.join(bkSettings.localModsDir, '我的mod', 'filelist.xml')),
    '原本地 mod 还在'
  );
  ok(
    fs.existsSync(path.join(bkSettings.localModsDir, '工坊模组B', 'filelist.xml')),
    '新建了「工坊模组B」的本地副本'
  );
  ok(result.snapshotted === 1, '覆盖已有本地副本前留了 1 份快照');

  const copiedFl = fs.readFileSync(
    path.join(bkSettings.localModsDir, '工坊模组B', 'filelist.xml'),
    'utf8'
  );
  ok(copiedFl.includes('name="工坊模组B"'), '复制后 filelist.xml 的 name 与文件夹名一致');
  ok(copiedFl.includes('installed="true"'), '优先使用了游戏实际加载的 Installed 版本');

  /* ------------------ 9. 关联 mod 与「游戏当前应用」 ------------------ */

  console.log('\n[9] 关联 mod 与「游戏当前应用」');

  const rel = require('../electron/services/relations');
  const relDir = path.join(TMP, 'rel');

  ok(Object.keys(rel.getRelations(relDir)).length === 0, '初始没有关联');
  ok(!fs.existsSync(relDir), '初始连文件都还没建');

  rel.setRelations(relDir, 'workshop:111', [
    'workshop:222',
    'local:某mod',
    'workshop:222',
    '',
    'workshop:111'
  ]);
  const r1 = rel.getRelations(relDir);
  ok(
    JSON.stringify(r1['workshop:111']) === JSON.stringify(['workshop:222', 'local:某mod']),
    '保存关联：去重 / 去空值 / 去指向自己'
  );
  ok(fs.existsSync(path.join(relDir, 'relations.json')), '关联写进了 relations.json');
  ok(rel.getRelations(relDir)['workshop:111'].length === 2, '重新读取（走磁盘）结果一致');

  rel.setRelations(relDir, 'local:某mod', ['workshop:222']);
  rel.removeRelations(relDir, 'workshop:222');
  const r2 = rel.getRelations(relDir);
  ok(
    JSON.stringify(r2['workshop:111']) === JSON.stringify(['local:某mod']),
    '某个 mod 被删后，别人指向它的关联被摘掉、其余保留'
  );
  ok(!r2['local:某mod'], '被删的那个 mod 自己的关联条目整条消失');

  rel.setRelations(relDir, 'workshop:111', []);
  ok(!rel.getRelations(relDir)['workshop:111'], '传空数组等于删掉这条关联');

  // 从 config_player.xml 反推「当前生效的 mod」
  const { readAppliedPackages } = require('../electron/services/config');
  const appliedDir = path.join(TMP, 'applied-cfg');
  fs.mkdirSync(appliedDir, { recursive: true });
  const appliedCfg = path.join(appliedDir, 'config_player.xml');
  fs.writeFileSync(
    appliedCfg,
    [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<config>',
      '  <contentpackages>',
      '    <!--Vanilla-->',
      '    <corepackage path="Content/ContentPackages/Vanilla.xml" />',
      '    <regularpackages>',
      '      <package path="C:/x/WorkshopMods/Installed/2559634234/filelist.xml" />',
      '      <package path="D:/steam/steamapps/common/Barotrauma/LocalMods/我的mod/filelist.xml" />',
      '    </regularpackages>',
      '  </contentpackages>',
      '</config>'
    ].join('\r\n'),
    'utf8'
  );

  const ap = readAppliedPackages({ configPlayerPath: appliedCfg });
  ok(ap.available, '读得到 config_player.xml');
  ok(ap.entries.length === 2, `解析出 ${ap.entries.length} 条（corepackage 不算在内）`);
  ok(
    ap.entries[0].type === 'workshop' && ap.entries[0].id === '2559634234',
    '纯数字目录名判为工坊 mod'
  );
  ok(
    ap.entries[1].type === 'local' && ap.entries[1].name === '我的mod',
    '非数字目录名判为本地 mod'
  );

  const apNone = readAppliedPackages({ configPlayerPath: path.join(appliedDir, 'nope.xml') });
  ok(!apNone.available && apNone.entries.length === 0, '配置文件不存在时安全返回而不是抛错');

  const cfgNoBlock = path.join(appliedDir, 'no-block.xml');
  fs.writeFileSync(cfgNoBlock, '<config><other /></config>', 'utf8');
  const apNoBlock = readAppliedPackages({ configPlayerPath: cfgNoBlock });
  ok(!apNoBlock.available && !!apNoBlock.reason, '没有 contentpackages 段时给出原因');


  /* ------------------ 10. 读 Steam 的工坊状态文件（.acf） ------------------ */

  console.log('\n[10] Steam 工坊状态文件（.acf）');

  const ws = require('../electron/services/workshopsync');
  const acfRoot = path.join(TMP, 'acf');
  const acfSteam = path.join(acfRoot, 'steam', 'workshop', 'content', '602960');
  const acfInst = path.join(acfRoot, 'inst', 'Installed');
  const T_OLD = 1700000000;
  const T_NEW = 1700100000;
  const A = '1111111111';

  const writeFl = (dir, name, id, ver) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'filelist.xml'),
      `<contentpackage name="${name}" modversion="${ver}" corepackage="False" ` +
        `steamworkshopid="${id}" gameversion="1.0" expectedhash="ABC">\n</contentpackage>`,
      'utf8'
    );
  };
  writeFl(path.join(acfSteam, A), '甲mod', A, '2.0');
  writeFl(path.join(acfInst, A), '甲mod', A, '1.0');

  const acfFile = path.join(acfRoot, 'steam', 'workshop', 'appworkshop_602960.acf');
  fs.writeFileSync(
    acfFile,
    [
      '"AppWorkshop"',
      '{',
      '\t"appid"\t\t"602960"',
      '\t"WorkshopItemDetails"',
      '\t{',
      `\t\t"${A}"\n\t\t{\n\t\t\t"manifest"\t\t"2"\n\t\t\t"timeupdated"\t\t"${T_NEW}"\n\t\t\t"latest_timeupdated"\t\t"${T_NEW}"\n\t\t}`,
      '\t}',
      '}'
    ].join('\n'),
    'utf8'
  );

  ok(ws.acfPath(acfSteam) === acfFile, '能从 workshop 目录推出 appworkshop_*.acf 的路径');

  const acfRead = ws.readWorkshopAcf(acfSteam);
  ok(acfRead.available, '.acf 读得到');
  ok(acfRead.items[A]?.timeUpdated === T_NEW, '读得出 timeupdated（Steam 本地那份的版本）');
  ok(acfRead.items[A]?.latestTimeUpdated === T_NEW, '读得出 latest_timeupdated（工坊最新版本）');

  const noAcf = ws.readWorkshopAcf(path.join(acfRoot, 'nowhere'));
  ok(!noAcf.available && !!noAcf.reason, '.acf 找不到时安全返回而不是抛错');

  // installtime：游戏复制进 Installed 时写的，用来判断游戏里那份是不是旧的
  const flA = path.join(acfInst, A, 'filelist.xml');
  fs.writeFileSync(
    flA,
    fs
      .readFileSync(flA, 'utf8')
      .replace(/<contentpackage\b([^>]*)>/, `<contentpackage$1 installtime="${T_OLD}">`),
    'utf8'
  );
  ok(ws.installTimeOf(path.join(acfInst, A)) === T_OLD, '读得出游戏写入的 installtime');
  ok(ws.installTimeOf(path.join(acfRoot, 'nowhere')) === null, '目录不存在时返回 null 而不是抛错');

  /* ------------------ 11. 下架标记与「只备份已下架的」 ------------------ */

  console.log('\n[11] 下架标记与「只备份已下架的」');

  const dChecks = {
    '1001': { v: ws.CHECKS_VERSION, exists: true, checkedAt: Date.now() },
    '1002': { v: ws.CHECKS_VERSION, exists: false, checkedAt: Date.now() }
  };
  ok(!ws.isDelisted(dChecks, '1001'), 'exists=true 不算下架');
  ok(ws.isDelisted(dChecks, '1002'), 'exists=false 算下架');
  ok(!ws.isDelisted(dChecks, '9999'), '没查过的 ID 不武断判成下架');
  ok(
    !ws.isDelisted({ x: { result: 9, checkedAt: Date.now() } }, 'x'),
    '只有 result=9 不足以判下架（成人内容也是 9）—— 必须网页核实过'
  );
  ok(ws.checksStale(dChecks, ['1001', '9999']), '有没查过的 ID → 缓存算脏');
  ok(!ws.checksStale(dChecks, ['1001', '1002']), '都查过且新鲜 → 不脏');
  ok(
    ws.checksStale({ x: { v: ws.CHECKS_VERSION, exists: true, checkedAt: Date.now() - 1000 } }, ['x'], 500),
    '超过 TTL 的检查结果算脏'
  );
  ok(
    ws.checksStale({ x: { result: 9, checkedAt: Date.now() } }, ['x']),
    '旧格式的缓存算脏（会强制重查一遍）'
  );
  ok(
    !ws.checksStale({ x: { v: ws.CHECKS_VERSION, exists: null, checkedAt: Date.now() } }, ['x']),
    '刚试过但没核实成的，短时间内不重试（别硬打 Steam）'
  );
  ok(
    !ws.isDelisted({ x: { v: ws.CHECKS_VERSION, exists: null, checkedAt: Date.now() } }, 'x'),
    'exists=null（没核实成）不算下架 —— 绝不当成「还在」之外的结论'
  );

  const dRoot = path.join(TMP, 'delist-bk');
  const dSteam = path.join(dRoot, 'steam', 'content', '602960');
  const dInst = path.join(dRoot, 'inst');
  const dLocal = path.join(dRoot, 'LocalMods');
  fs.mkdirSync(dLocal, { recursive: true });
  const dSet = {
    workshopModsDir: dSteam,
    installedWorkshopDir: dInst,
    localModsDir: dLocal
  };

  writeMod(dSteam, '5001', '<contentpackage name="正常mod" modversion="1.0" steamworkshopid="5001" />');
  writeMod(dSteam, '5002', '<contentpackage name="下架的A" modversion="1.0" steamworkshopid="5002" />');
  writeMod(dInst, '5002', '<contentpackage name="下架的A" modversion="1.0" steamworkshopid="5002" />');
  // 只剩 Installed 里那份（Steam 订阅目录里已经没有了）
  writeMod(dInst, '5003', '<contentpackage name="只剩副本" modversion="1.0" steamworkshopid="5003" />');

  const dMap = { '5001': { exists: true }, '5002': { exists: false }, '5003': { exists: false } };

  const dAll = bk.planWorkshopBackup(dSet, {}, { checks: dMap });
  ok(dAll.items.length === 3, `全量备份看到 ${dAll.items.length} 个（含只剩 Installed 的那个）`);
  ok(
    dAll.items.some((i) => i.id === '5003'),
    '只剩 Installed 的 mod 也被纳入备份 ← 修的就是这个漏洞'
  );

  const dOnly = bk.planWorkshopBackup(dSet, {}, { onlyDelisted: true, checks: dMap });
  ok(dOnly.items.length === 2, `只备份已下架的 → ${dOnly.items.length} 个`);
  ok(!dOnly.items.some((i) => i.id === '5001'), '正常的 mod 被排除在外');
  ok(dOnly.items.every((i) => i.delisted), '每一项都带 delisted 标记');
  const ghost = dOnly.items.find((i) => i.id === '5003');
  ok(ghost && ghost.installedOnly === true, '只剩 Installed 的那项标了 installedOnly');
  ok(ghost && ghost.source === path.join(dInst, '5003'), '它的复制来源指向 Installed');

  // 已经有本地备份的，不该再复制一遍（会覆盖用户自己改过的副本）
  writeMod(
    dLocal,
    'npc-local',
    '<contentpackage name="下架的A" modversion="1.0" steamworkshopid="5002" />'
  );
  const dSkip = bk.planWorkshopBackup(dSet, {}, { onlyDelisted: true, checks: dMap });
  ok(!dSkip.items.some((i) => i.id === '5002'), '已备份到本地的会从计划里剔除');
  ok(
    dSkip.skipped.some((s) => s.id === '5002' && /已备份/.test(s.reason)),
    '跳过的会带明确原因'
  );
  ok(dSkip.items.some((i) => i.id === '5003'), '还没备份的照常处理');

  /* --------------------- 12. 存档解析与「对应合集」判定 --------------------- */
  console.log('\n[12] 存档解析与「对应合集」判定');

  const sv = require('../electron/services/saves');
  const zlib = require('node:zlib');

  // 造一个跟真实存档同构的 .save：gzip 里面先有一段 UTF-16LE 文件名，再是 XML
  function writeSave(dir, file, names, attrs = {}) {
    fs.mkdirSync(dir, { recursive: true });
    const a = {
      savetime: '1789363813',
      submarine: '测试潜艇',
      version: '1.13.4.0',
      ismultiplayer: 'false',
      ...attrs
    };
    const xml =
      '<?xml version="1.0" encoding="utf-8"?>\n' +
      `<Gamesession ${Object.entries(a)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ')} selectedcontentpackagenames="${names.join('|')}">\n` +
      '  <ownedsubmarines><sub name="测试潜艇" /></ownedsubmarines>\n' +
      '</Gamesession>\n';
    // 前面那截 UTF-16LE 的 "gamesession.xml" 是真实存档的特征，解析必须能跳过它
    const prefix = Buffer.from('gamesession.xml', 'utf16le');
    const body = Buffer.concat([prefix, Buffer.from(xml, 'utf8')]);
    fs.writeFileSync(path.join(dir, file), zlib.gzipSync(body));
  }

  const svRoot = path.join(TMP, 'saves');
  const svSingle = svRoot;
  const svMulti = path.join(svRoot, 'Multiplayer');
  const svLocal = path.join(TMP, 'sv-mods', 'LocalMods');
  const svSteam = path.join(TMP, 'sv-mods', 'workshop');
  const svInst = path.join(TMP, 'sv-mods', 'Installed');
  const svLists = path.join(TMP, 'sv-mods', 'ModLists');

  const svMods = [];
  for (const [root, id, name] of [
    [svSteam, '70001', 'Amod'],
    [svSteam, '70002', 'Bmod'],
    [svSteam, '70003', 'Cmod'],
    [svInst, '70001', 'Amod'],
    [svInst, '70002', 'Bmod'],
    [svInst, '70003', 'Cmod']
  ]) {
    writeMod(root, id, `<contentpackage name="${name}" modversion="1.0" steamworkshopid="${id}" />`);
    svMods.push({ source: 'workshop', id, name });
  }
  // 本地 mod：文件夹名跟 contentpackage 名故意不一样，验证"要按真名比"
  writeMod(svLocal, 'my-folder', '<contentpackage name="Lmod" modversion="1.0" />');
  svMods.push({ source: 'local', id: 'my-folder', name: 'Lmod' });

  modlists.saveModlist(svLists, '全套.xml', '全套', [
    { type: 'workshop', name: 'Amod', id: '70001' },
    { type: 'workshop', name: 'Bmod', id: '70002' },
    { type: 'workshop', name: 'Cmod', id: '70003' },
    { type: 'local', name: 'my-folder' }
  ]);
  modlists.saveModlist(svLists, '只有A.xml', '只有A', [
    { type: 'workshop', name: 'Amod', id: '70001' }
  ]);

  writeSave(svSingle, '完全一致.save', ['Vanilla', 'Amod', 'Bmod', 'Cmod', 'Lmod']);
  writeSave(svSingle, '被覆盖.save', ['Vanilla', 'Amod', 'Bmod']);
  writeSave(svSingle, '没得覆盖.save', ['Vanilla', 'Amod', 'Bmod', 'Cmod', 'Lmod', 'Dmod']);
  writeSave(svMulti, '多人.save', ['Vanilla', 'Amod'], {
    ismultiplayer: 'true',
    submarine: 'Azimuth'
  });
  // 不是 gzip 的存档也要能读（当未压缩 XML 处理）
  fs.mkdirSync(svSingle, { recursive: true });
  fs.writeFileSync(
    path.join(svSingle, '未压缩.save'),
    '<?xml version="1.0" encoding="utf-8"?><Gamesession version="1.0" selectedcontentpackagenames="Vanilla|Amod" />',
    'utf8'
  );
  // 垃圾文件：列存档时应该被忽略
  fs.writeFileSync(path.join(svSingle, '坏掉的.save'), 'not a save', 'utf8');
  fs.writeFileSync(path.join(svSingle, '无关文件.txt'), 'x', 'utf8');

  const svSettings = {
    gameDir: path.join(TMP, 'sv-mods'),
    configPlayerPath: path.join(TMP, 'sv-mods', 'config_player.xml'),
    modListsDir: svLists,
    localModsDir: svLocal,
    workshopModsDir: svSteam,
    installedWorkshopDir: svInst
  };

  const one = sv.parseSave(path.join(svSingle, '完全一致.save'));
  ok(!!one, '能解析 gzip 存档（含 UTF-16LE 前缀）');
  ok(one && one.mods.length === 4 && one.mods[0] === 'Amod', '读出的 mod 列表正确且不含 Vanilla');
  ok(one && one.submarine === '测试潜艇', '读出潜艇名');
  ok(one && one.gameVersion === '1.13.4.0', '读出游戏版本');
  ok(one && one.saveTime === 1789363813000, 'savetime 转成毫秒');
  ok(one && one.isMultiplayer === false, 'ismultiplayer=false 解析正确');

  // 存档目录：savepath 为空 → 用默认位置（靠 LOCALAPPDATA 定位）
  const oldLocal = process.env.LOCALAPPDATA;
  process.env.LOCALAPPDATA = path.join(TMP, 'fake-local');
  fs.mkdirSync(path.join(TMP, 'fake-local', 'Daedalic Entertainment GmbH', 'Barotrauma'), {
    recursive: true
  });
  const defDir = sv.saveDirOf({ ...svSettings, configPlayerPath: '' });
  ok(
    defDir === path.join(TMP, 'fake-local', 'Daedalic Entertainment GmbH', 'Barotrauma'),
    'savepath 为空时用默认存档目录'
  );
  process.env.LOCALAPPDATA = oldLocal;

  // savepath 有值 → 以它为准，哪怕目录不存在也不许回退（否则会假装"没有存档"）
  fs.writeFileSync(
    svSettings.configPlayerPath,
    '<?xml version="1.0" encoding="utf-8"?>\n<config language="x" savepath="mySaves">\n' +
      '  <contentpackages><corepackage path="Content/ContentPackages/Vanilla.xml" /></contentpackages>\n</config>\n',
    'utf8'
  );
  ok(sv.savePathSetting(svSettings) === 'mySaves', '读得出 config 里的 savepath');
  ok(
    sv.saveDirOf(svSettings) === path.resolve(svSettings.gameDir, 'mySaves'),
    'savepath 是相对路径时按游戏目录解析'
  );
  ok(
    sv.saveDirOf(svSettings) !== path.join(oldLocal, 'Daedalic Entertainment GmbH', 'Barotrauma'),
    'savepath 指向不存在的目录时也不回退到默认位置'
  );
  fs.writeFileSync(
    svSettings.configPlayerPath,
    `<?xml version="1.0" encoding="utf-8"?>\n<config savepath="${svRoot}" />\n`,
    'utf8'
  );
  ok(sv.saveDirOf(svSettings) === svRoot, 'savepath 是绝对路径时直接用它');

  const r12 = sv.listSaves(svSettings, svMods);
  const byName = (n) => r12.saves.find((s) => s.name === n);
  ok(r12.saves.length === 5, `列出 5 个能认的存档（忽略坏文件和非 .save）— 实际 ${r12.saves.length}`);
  ok(
    !r12.saves.some((s) => s.name === '坏掉的'),
    '坏掉的 .save 不会被误列出来'
  );
  ok(!!byName('未压缩'), '未压缩的存档也能读');

  const exactSave = byName('完全一致');
  ok(!!exactSave && !!exactSave.match && exactSave.match.name === '全套', '完全一致时指出对应合集');
  ok(!!exactSave && exactSave.covers.length === 0, '已经完全一致就不再列「覆盖」的合集');

  const coverSave = byName('被覆盖');
  ok(coverSave && !coverSave.match, '只被覆盖时不算「完全一致」');
  ok(
    coverSave && coverSave.covers.length === 1 && coverSave.covers[0].name === '全套',
    '被覆盖时指出是哪个合集'
  );
  ok(
    coverSave && coverSave.covers[0].extra.join(',') === 'Cmod,Lmod',
    `列出合集里多出来的 mod，且用 mod 真名而不是文件夹名（实际 ${coverSave && coverSave.covers[0].extra.join(',')}）`
  );

  const noSave = byName('没得覆盖');
  ok(noSave && !noSave.match && noSave.covers.length === 0, '没有任何合集能覆盖时如实为空');
  ok(noSave && noSave.missingCount === 1, '数出「游戏里没有」的 mod 个数');
  ok(
    noSave && noSave.mods.find((m) => m.name === 'Dmod').mod === null,
    '找不到的 mod 标记为 null（界面靠它显示「游戏里没有」）'
  );
  ok(
    noSave && !!noSave.mods.find((m) => m.name === 'Lmod').mod,
    '本地 mod 按 contentpackage 真名（而不是文件夹名）匹配上'
  );

  const multiSave = byName('多人');
  ok(multiSave && multiSave.source === 'multi', 'Multiplayer 目录下的标为多人存档');
  ok(
    r12.saves.indexOf(byName('未压缩')) >= 0 && r12.saves[0].saveTime >= r12.saves[r12.saves.length - 1].saveTime,
    '按存档时间从新到旧排序'
  );

  /* -------- 13. 把 Steam 已下载的工坊更新同步进游戏（installsync） -------- */
  console.log('\n[13] 工坊更新同步到游戏');

  const isync = require('../electron/services/installsync');

  const syRoot = path.join(TMP, 'sync');
  const syWs = path.join(syRoot, 'ws', '602960'); // basename 就是 appid，.acf 放在上一层
  const syInst = path.join(syRoot, 'ws', 'Installed');
  const sySettings = { workshopModsDir: syWs, installedWorkshopDir: syInst };

  function writeTree(root, id, files) {
    const dir = path.join(root, id);
    fs.mkdirSync(dir, { recursive: true });
    for (const [rel, body] of Object.entries(files)) {
      const p = path.join(dir, rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, body, 'utf8');
    }
    return dir;
  }

  const flx = (name, version, extra = '') =>
    `<?xml version="1.0" encoding="utf-8"?>\n<contentpackage name="${name}" steamworkshopid="${name}" ` +
    `modversion="${version}" expectedhash="ABCD"${extra} />\n`;

  // 7001：Steam 有 2.0，Installed 还是 1.0（installtime 1000）→ 待同步
  writeTree(syWs, '70001', {
    'filelist.xml': flx('A', '2.0'),
    'items/a.xml': '<a/>',
    'items/b.xml': '<b/>'
  });
  writeTree(syInst, '70001', {
    'filelist.xml': flx('A', '1.0', ' installtime="1000"'),
    'items/a.xml': '<old/>',
    'items/gone.xml': '<stale/>'
  });
  // 7002：已同步（installtime == .acf 的 timeupdated 2000）→ 不进计划
  writeTree(syWs, '70002', { 'filelist.xml': flx('B', '1.5') });
  writeTree(syInst, '70002', { 'filelist.xml': flx('B', '1.5', ' installtime="2000"') });
  // 7003：Steam 有、Installed 压根没有 → 也算待安装
  writeTree(syWs, '70003', { 'filelist.xml': flx('C', '3.0'), 'c.xml': '<c/>' });
  // 7004：只剩 Installed（工坊那边没了）→ 没法同步，且不该进计划
  writeTree(syInst, '70004', { 'filelist.xml': flx('D', '1.0', ' installtime="500"') });
  // 7005：Steam 目录里没有 filelist.xml（下载残缺）→ 计划阶段就跳过
  fs.mkdirSync(path.join(syWs, '70005'), { recursive: true });

  fs.writeFileSync(
    // .acf 在 workshopModsDir 往上两级（真实布局：steamapps\workshop\appworkshop_602960.acf）
    path.join(syRoot, 'appworkshop_602960.acf'),
    '"AppWorkshop"\n{\n\t"appid"\t\t"602960"\n\t"WorkshopItemDetails"\n\t{\n' +
      '\t\t"70001"\n\t\t{\n\t\t\t"manifest"\t\t"11"\n\t\t\t"timeupdated"\t\t"2000"\n' +
      '\t\t\t"latest_timeupdated"\t\t"2000"\n\t\t\t"latest_manifest"\t\t"11"\n\t\t}\n' +
      '\t\t"70002"\n\t\t{\n\t\t\t"manifest"\t\t"22"\n\t\t\t"timeupdated"\t\t"2000"\n' +
      '\t\t\t"latest_timeupdated"\t\t"2000"\n\t\t\t"latest_manifest"\t\t"22"\n\t\t}\n' +
      '\t\t"70003"\n\t\t{\n\t\t\t"manifest"\t\t"33"\n\t\t\t"timeupdated"\t\t"3000"\n' +
      '\t\t\t"latest_timeupdated"\t\t"3000"\n\t\t\t"latest_manifest"\t\t"33"\n\t\t}\n' +
      '\t}\n}\n',
    'utf8'
  );

  const syPlan = isync.planInstallSync(sySettings);
  const syIds = syPlan.items.map((i) => i.id).sort();
  ok(syPlan.acfAvailable, '读得到 .acf');
  ok(syIds.join(',') === '70001,70003', `待同步的是 70001/70003（实际 ${syIds.join(',') || '（空）'}）`);
  const syP1 = syPlan.items.find((i) => i.id === '70001');
  ok(syP1 && syP1.reason === 'outdated', '70001 判为「有更新没装」');
  ok(syP1 && syP1.installedVersion === '1.0' && syP1.steamVersion === '2.0', '带上新旧版本号供界面显示');
  ok(syP1 && syP1.files === 3 && syP1.bytes > 0, `统计出文件数与体积（${syP1 && syP1.files} 个）`);
  const syP3 = syPlan.items.find((i) => i.id === '70003');
  ok(syP3 && syP3.reason === 'not-installed', '7003 判为「游戏里还没装过」');
  ok(!syIds.includes('70002'), '已经同步过的不进计划');
  ok(!syIds.includes('70004'), '只剩 Installed 的（工坊已没有来源）不进计划');
  ok(syPlan.totalBytes > 0, '给出总体积');

  /* 已下架 + 游戏里没装 ≠ 待同步（用户真实数据里的 3156077899 就是这个）
     Steam 缓存里还留着内容，但条目已经没了、游戏本来就不会装它，也不会有更新。
     这种要单列出来、指到「备份已下架的」那条路，而不是让人白点一次同步。
     用独立目录测，免得跟上面已经同步过的状态纠缠在一起。 */
  const dlWs = path.join(TMP, 'sync-delisted', '602960');
  const dlInst = path.join(TMP, 'sync-delisted', 'Installed');
  writeTree(dlWs, '91001', { 'filelist.xml': flx('G', '1.0'), 'g.xml': '<g/>' }); // 下架 + 没装过
  writeTree(dlWs, '91002', { 'filelist.xml': flx('H', '2.0') });
  writeTree(dlInst, '91002', { 'filelist.xml': flx('H', '1.0', ' installtime="100"') }); // 下架但装着旧版
  writeTree(dlWs, '91003', { 'filelist.xml': flx('I', '1.0') }); // 没装过，但没被判定下架
  fs.writeFileSync(
    path.join(TMP, 'sync-delisted', 'appworkshop_602960.acf'),
    '"AppWorkshop"\n{\n\t"WorkshopItemDetails"\n\t{\n' +
      '\t\t"91001"\n\t\t{\n\t\t\t"timeupdated"\t\t"2000"\n\t\t}\n' +
      '\t\t"91002"\n\t\t{\n\t\t\t"timeupdated"\t\t"2000"\n\t\t}\n' +
      '\t\t"91003"\n\t\t{\n\t\t\t"timeupdated"\t\t"2000"\n\t\t}\n' +
      '\t}\n}\n',
    'utf8'
  );
  const dlSettings = { workshopModsDir: dlWs, installedWorkshopDir: dlInst };
  const dlPlan = isync.planInstallSync(dlSettings, {
    checks: { '91001': { exists: false }, '91002': { exists: false }, '91003': { exists: true } }
  });
  const dlIds = dlPlan.items.map((i) => i.id).sort();
  ok(!dlIds.includes('91001'), '已下架且游戏里没装 → 不算「待同步」');
  ok(
    dlPlan.skippedDelisted.length === 1 && dlPlan.skippedDelisted[0].id === '91001',
    '但单列出来告诉用户（skippedDelisted）'
  );
  ok(
    dlIds.includes('91002'),
    '下架但游戏里装着旧版 → 仍然同步（不能一刀切把下架的全排除）'
  );
  ok(dlIds.includes('91003'), '只是没装过、并没有下架 → 照常算待同步');

  const syRun = isync.runInstallSync(sySettings, syPlan.items);
  ok(syRun.failed.length === 0, `没有失败项${syRun.failed.length ? '：' + JSON.stringify(syRun.failed) : ''}`);
  ok(syRun.synced.length === 2, '同步了 2 个');

  const inst1 = path.join(syInst, '70001');
  const txt1 = fs.readFileSync(path.join(inst1, 'filelist.xml'), 'utf8');
  ok(/installtime="2000"/.test(txt1), '游戏那份 filelist 写上了新的 installtime');
  ok(/modversion="2\.0"/.test(txt1), '内容换成了 Steam 那份（modversion 2.0）');
  ok(/expectedhash="ABCD"/.test(txt1), '其它属性没被动过');
  ok(fs.readFileSync(path.join(inst1, 'items/b.xml'), 'utf8') === '<b/>', '新增的文件复制过来了');
  ok(fs.readFileSync(path.join(inst1, 'items/a.xml'), 'utf8') === '<a/>', '旧文件被新版覆盖');
  ok(!fs.existsSync(path.join(inst1, 'items/gone.xml')), '新版本里已删除的文件被清掉了（不是叠加）');
  ok(fs.existsSync(path.join(syInst, '70003', 'filelist.xml')), '原本没装的 7003 也被装上了');
  ok(
    fs.readdirSync(syInst).filter((n) => n.startsWith('.bmm-sync-')).length === 0,
    '同步完不留临时/备份目录'
  );

  // 幂等：再规划一次应该什么都没了 —— 这条最关键，否则界面会一直提示"有更新"
  const syAgain = isync.planInstallSync(sySettings);
  ok(syAgain.count === 0, `同步完再查应为 0 个（实际 ${syAgain.count}）`);

  // BOM 与属性：writeInstallTime 不能破坏文件
  const bomPath = path.join(TMP, 'sync-bom.xml');
  fs.writeFileSync(bomPath, '\uFEFF<contentpackage name="X" modversion="1.0" expectedhash="E" />\n', 'utf8');
  isync.writeInstallTime(bomPath, 4242);
  const bomTxt = fs.readFileSync(bomPath, 'utf8');
  ok(bomTxt.charCodeAt(0) === 0xfeff, 'BOM 被保留');
  ok(/installtime="4242"/.test(bomTxt), '没有 installtime 时插进去');
  ok(/expectedhash="E"/.test(bomTxt), '原来的属性都还在');
  isync.writeInstallTime(bomPath, 5555);
  const bomTxt2 = fs.readFileSync(bomPath, 'utf8');
  ok(/installtime="5555"/.test(bomTxt2) && !/4242/.test(bomTxt2), '已有时覆盖而不是插第二个');
  ok((bomTxt2.match(/installtime=/g) || []).length === 1, '不会出现两个 installtime');

  // 失败项要如实报，并且不能破坏已有的安装
  const badSettings = { ...sySettings, workshopModsDir: path.join(syRoot, 'empty-ws') };
  fs.mkdirSync(path.join(badSettings.workshopModsDir, '90001'), { recursive: true });
  const badRun = isync.runInstallSync(badSettings, [{ id: '90001', name: '残缺', targetTime: 1 }]);
  ok(badRun.failed.length === 1, 'Steam 那份不完整时记为失败');
  ok(!fs.existsSync(path.join(syInst, '90001')), '失败时不会留下半成品目录');

  let badId = false;
  try {
    isync.syncOne(sySettings, { id: '../跑到外面', name: 'x', targetTime: 1 });
  } catch {
    badId = true;
  }
  ok(badId, '非法 id 被拒绝（防目录穿越）');

  // 没有 .acf 时退回按版本号比较：明确不同才算
  const noAcfWs = path.join(TMP, 'sync-noacf', '602960');
  const noAcfInst = path.join(TMP, 'sync-noacf', 'Installed');
  writeTree(noAcfWs, '80001', { 'filelist.xml': flx('E', '2.0') });
  writeTree(noAcfInst, '80001', { 'filelist.xml': flx('E', '1.0', ' installtime="100"') });
  writeTree(noAcfWs, '80002', { 'filelist.xml': flx('F', '1.0') });
  writeTree(noAcfInst, '80002', { 'filelist.xml': flx('F', '1.0', ' installtime="100"') });
  const noAcfPlan = isync.planInstallSync({ workshopModsDir: noAcfWs, installedWorkshopDir: noAcfInst });
  const noAcfIds = noAcfPlan.items.map((i) => i.id);
  ok(noAcfIds.includes('80001'), '.acf 丢了时：版本号不同 → 仍判为待同步');
  ok(!noAcfIds.includes('80002'), '.acf 丢了时：版本号相同 → 不乱判');
  ok(
    noAcfPlan.items.find((i) => i.id === '80001').reason === 'version-differs',
    '标注是按版本号兜底判出来的'
  );
} catch (e) {
  console.log('\nEXCEPTION: ' + (e && e.stack ? e.stack : e));
  failures++;
}

fs.rmSync(TMP, { recursive: true, force: true });
console.log(failures ? `\n=== ${failures} 项失败 ===` : '\n=== 全部通过 ===');
process.exit(failures ? 1 : 0);
