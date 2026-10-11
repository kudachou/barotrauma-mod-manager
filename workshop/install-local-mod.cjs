/**
 * 把管理器包装成一个**本地 mod** 放进游戏的 LocalMods，供工坊上传使用。
 *
 * ## 为什么需要这一步
 *
 * 潜渊症的工坊上传只列出「本地已存在的内容包」—— 你不能凭空上传一个不在
 * `LocalMods` / `WorkshopMods\Installed` 里的东西。所以上传前必须让我们的包
 * 以本地 mod 的形式存在。
 *
 * ## 为什么不用现成的本地 mod 改造
 *
 * 曾经打算直接改 `LocalMods\dead space坏死组织抗性天赋`（用户指的那个），但它的
 * `filelist.xml` 带着 `steamworkshopid="3470517907"` —— 那是**已发布的工坊条目**。
 * 就地改造会：清掉它的源文件（天赋 XML / 中英文本 / 封面），并丢掉那个 id 的关联，
 * 以后没法再从本地更新该条目。所以改为**新建一个目录**。
 *
 * ## 用法
 *
 *   node workshop/install-local-mod.cjs "D:\steam\steamapps\common\Barotrauma\LocalMods"
 *
 * 选项：
 *   --name <文件夹名>   默认 BarotraumaModManager
 *   --force             目标目录已有"非本次写入"的文件时也继续（会先删掉它们）
 *   --dry-run           只报告会做什么，不落盘
 *
 * 路径必须显式传：这个脚本会**写游戏目录**，不猜任何路径。它也只写这一个目录。
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SRC = __dirname;
const RELEASE = path.join(ROOT, 'release-ws');

/* ------------------------------ 参数 ------------------------------ */

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const positional = argv.filter((a) => !a.startsWith('--'));

function flagValue(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
}

const localModsDir = positional[0];
const folderName = flagValue('--name', 'BarotraumaModManager');
const dryRun = flags.has('--dry-run');
const force = flags.has('--force');

if (!localModsDir) {
  console.error('用法: node workshop/install-local-mod.cjs "<LocalMods 目录>" [--name <文件夹名>] [--force] [--dry-run]');
  console.error('例如: node workshop/install-local-mod.cjs "D:\\steam\\steamapps\\common\\Barotrauma\\LocalMods"');
  process.exit(2);
}
if (!fs.existsSync(localModsDir) || !fs.statSync(localModsDir).isDirectory()) {
  console.error(`❌ 不是有效目录：${localModsDir}`);
  process.exit(2);
}
// 明显指错的保护：路径必须以 LocalMods 结尾（避免手滑传到游戏根目录或磁盘根）
if (path.basename(path.resolve(localModsDir)).toLowerCase() !== 'localmods') {
  console.error(`❌ 路径最后一级必须是 LocalMods，收到的是 "${path.basename(path.resolve(localModsDir))}"`);
  console.error('   这是防止手滑把包写到游戏根目录或磁盘根的护栏。');
  process.exit(2);
}

/* ------------------------------ 前置校验 ------------------------------ */

const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const filelist = fs.readFileSync(path.join(SRC, 'filelist.xml'), 'utf8');
const marker = JSON.parse(fs.readFileSync(path.join(SRC, 'bmm-app.json'), 'utf8'));
const pub = JSON.parse(fs.readFileSync(path.join(SRC, 'publication.json'), 'utf8'));

/** 我们自己已发布的条目 id（首次上传前是空占位） */
const ourId = pub.id && /^\d+$/.test(String(pub.id)) ? String(pub.id) : null;
/**
 * 认得出"这是我们自己的旧条目"的 id 集合：当前 id + `previous_ids`。
 * 用途：允许把游戏目录里的 filelist.xml 从废弃的旧 id 改成新 id，
 * 同时**不影响**护栏拦住真正属于别人的条目。
 */
const knownIds = new Set(
  [ourId, ...(Array.isArray(pub.previous_ids) ? pub.previous_ids : [])]
    .filter(Boolean)
    .map(String)
);

const problems = [];

/*
 * steamworkshopid 的规则（详见 make-item-folder.cjs 同一段注释）：
 *   - 已发布 ⇒ 必须带**我们自己的** id，这样上传是"更新"而不是"新建"
 *   - 未发布 ⇒ 不能带 id，否则会去覆盖别人的条目
 */
const flId = (filelist.match(/steamworkshopid\s*=\s*"([^"]*)"/i) || [])[1];
if (ourId && flId !== ourId) {
  problems.push(`条目已发布（id=${ourId}），但 filelist.xml 没带上它 —— 上传会新建条目而不是更新`);
}
if (!ourId && flId) {
  problems.push(`还没发布，但 filelist.xml 带了 steamworkshopid=${flId} —— 会覆盖不属于我们的条目`);
}
if (!/corepackage\s*=\s*"false"/i.test(filelist)) {
  problems.push('filelist.xml 必须是 corepackage="False"（否则玩家误启用会真的当 mod 加载）');
}
if (/<Item\s/i.test(filelist)) {
  problems.push('filelist.xml 不应声明任何 <Item>（这是工具，不是内容包）');
}
if (marker.app !== 'barotrauma-mod-manager') {
  problems.push(`bmm-app.json 的 app=${marker.app}，程序认的是 barotrauma-mod-manager`);
}
if (marker.version !== version) {
  problems.push(`bmm-app.json 的 version=${marker.version}，package.json 是 ${version}`);
}

const exeName = `barotrauma-mod-manager-workshop-setup-${version}.exe`;
const exePath = path.join(RELEASE, exeName);
if (!fs.existsSync(exePath)) {
  problems.push(`找不到安装包：release-ws/${exeName}（先跑 pnpm run pack:workshop）`);
}

/* ------------------------------ 目标目录护栏 ------------------------------ */

const target = path.join(localModsDir, folderName);

/** 本次要放进去的文件（相对路径 → 源路径） */
const payload = [
  ['filelist.xml', path.join(SRC, 'filelist.xml')],
  ['bmm-app.json', path.join(SRC, 'bmm-app.json')],
  [exeName, exePath],
  // 两个语言的描述都引用同一个 ASCII 文件名，所以只需要一个脚本
  ['setup.cmd', path.join(SRC, 'setup.cmd')]
];

/*
 * 封面与截图也要放进内容包**根目录**。
 *
 * 为什么：游戏的上传界面只能从内容包文件夹里挑文件，
 * 放外面就选不到（预览图会在界面上看着像"没得选"）。
 * 放根目录而不是子目录，是因为不确定上传界面的图片选择器能不能进子目录 ——
 * 根目录两种情况都能用。
 *
 * 这些是内容包未声明的多余文件，游戏加载时会忽略（同 exe 与 .cmd 的道理）。
 */
for (const f of ['cover.zh.png', 'cover.en.png']) {
  const p = path.join(SRC, 'cover', f);
  if (fs.existsSync(p)) payload.push([f, p]);
}
const SHOT_DIR = path.join(SRC, 'screenshots');
if (fs.existsSync(SHOT_DIR)) {
  for (const f of fs.readdirSync(SHOT_DIR).filter((x) => x.endsWith('.png')).sort()) {
    payload.push([f, path.join(SHOT_DIR, f)]);
  }
}

if (fs.existsSync(target)) {
  const existingFilelist = path.join(target, 'filelist.xml');
  if (fs.existsSync(existingFilelist)) {
    const t = fs.readFileSync(existingFilelist, 'utf8');
    const id = (t.match(/steamworkshopid\s*=\s*"([^"]*)"/i) || [])[1];
    /*
     * 目标目录是**已发布的 mod** 时必须拒绝覆盖（会清掉源文件并丢掉工坊关联）。
     * 但如果是**我们自己的**条目（当前 id，或记录在 previous_ids 里的旧 id），
     * 那正是要更新的对象 —— 尤其"把旧 id 改成新 id"这一步需要放行。
     */
    if (id && !knownIds.has(id)) {
      problems.push(
        `目标目录 ${folderName} 是**别人的已发布工坊条目**（steamworkshopid=${id}）。\n` +
          '     覆盖它会清掉源文件并丢掉工坊关联。换个 --name，或先自己确认要放弃那个条目。'
      );
    } else if (id && id !== ourId) {
      console.log(`   注意：目标里的旧 id ${id} 将被改写成当前 id ${ourId}（previous_ids 已记录）`);
    }
  }
  const want = new Set(payload.map(([n]) => n));
  const stray = fs.readdirSync(target).filter((f) => !want.has(f));
  if (stray.length && !force) {
    problems.push(
      `目标目录已存在且含本次不会写入的文件：${stray.join('、')}\n` +
        '     加 --force 才会删掉它们。'
    );
  }
}

if (problems.length) {
  console.error('❌ 不能安装：');
  for (const p of problems) console.error('   - ' + p);
  process.exit(1);
}

/* ------------------------------ 落盘 ------------------------------ */

if (dryRun) {
  console.log(`[dry-run] 会把 ${payload.length} 个文件写入：\n  ${target}`);
  for (const [n] of payload) console.log('   - ' + n);
  process.exit(0);
}

fs.mkdirSync(target, { recursive: true });
// 清掉目标里我们不需要的东西（只在通过护栏之后）
const want = new Set(payload.map(([n]) => n));
for (const f of fs.readdirSync(target)) {
  if (!want.has(f)) {
    console.log(`   删除多余额外文件 ${f}`);
    fs.rmSync(path.join(target, f), { recursive: true, force: true });
  }
}
for (const [name, from] of payload) {
  fs.copyFileSync(from, path.join(target, name));
}

console.log(`✅ 已安装本地 mod → ${target}\n`);
for (const f of fs.readdirSync(target).sort()) {
  const st = fs.statSync(path.join(target, f));
  console.log(`   ${(st.size / 1048576).toFixed(2).padStart(7)} MB  ${f}`);
}

console.log('\n下一步：打开游戏，在工坊上传界面里选这个内容包（名字取自 filelist.xml 的 name）。');
if (ourId) {
  console.log(`   filelist.xml 带了 steamworkshopid=${ourId} ⇒ 上传会**更新那个条目**，不会新建。`);
} else {
  console.log('   还没有 steamworkshopid ⇒ 上传会**新建条目**。');
  console.log('   上传成功后游戏会把 id 写回本地 filelist.xml：把它抄进 workshop/filelist.xml');
  console.log('   和 publication.json，否则下次上传又会新建一个条目。');
}
console.log(`   本次安装包：${exeName}`);
