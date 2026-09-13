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
    { configPlayerPath: cfgPath, installedWorkshopDir: installedRoot, localModsDir: localRoot },
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
  ok(after.includes('LocalMods/我的自改版/filelist.xml'), '本地 mod 路径正确（正斜杠）');
  ok(after.includes('Vanilla.xml'), 'corepackage 仍为 Vanilla');
  ok(after.includes('keymapping'), '其它设置段仍在');
  ok(!after.includes('old/filelist.xml'), '旧的包列表已被替换');

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
} catch (e) {
  console.log('\nEXCEPTION: ' + (e && e.stack ? e.stack : e));
  failures++;
}

fs.rmSync(TMP, { recursive: true, force: true });
console.log(failures ? `\n=== ${failures} 项失败 ===` : '\n=== 全部通过 ===');
process.exit(failures ? 1 : 0);
