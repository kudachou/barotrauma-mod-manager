/**
 * 构建**创意工坊版**安装包。
 *
 * 和 `pnpm pack`（完整版）的区别只有三点：
 *   1. 前端用 `BMM_VARIANT=workshop` 构建 —— 界面里浏览工坊/下架检查那些入口不会编进去；
 *   2. 往仓库根写一个 `app-variant.json`，由 electron-builder 放进 resources/，
 *      让打包后的主进程知道自己是工坊版（打包后读不到构建期环境变量）；
 *   3. 用 `electron-builder.workshop.yml` 覆盖 appId / 产品名 / 安装包文件名。
 *
 * 为什么单独写脚本而不是串 npm scripts：中间那步"写标记文件"需要**构建前就位**，
 * 且不论成功失败都要删掉（不能留在仓库里，否则完整版也会被误判成工坊版）。
 *
 * 用法：
 *   node scripts/build-workshop.cjs            # 构建前端 + 打包
 *   node scripts/build-workshop.cjs --no-pack  # 只构建前端 + 写标记（调试用，不删标记）
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { verifyPackage, verifyUpdaterManifest } = require('./lib/verify-package.cjs');

const ROOT = path.join(__dirname, '..');
const NO_PACK = process.argv.includes('--no-pack');
/** 注意：必须放在**仓库根**，electron-builder 的 extraResources.from 是相对项目根的 */
const MARKER = path.join(ROOT, 'app-variant.json');

/**
 * 构建期专用的临时目录（放在工作区内）。
 *
 * 为什么要显式指定：打包 NSIS 时实测报
 *   "Error writing temporary file. Make sure your temp folder is valid."
 * 原因是环境里的 `TEMP` 被指到沙箱自己的会话目录（`…\Temp\dsh-XXXXXX`）——那个目录
 * 只有当前进程能写，它 fork 出去的 makensis 写不进去，于是整包失败、只剩个 0.1 MB 的残骸。
 * 指到工作区内一个真实可写的目录就绕开了。
 */
const TMPDIR = path.join(ROOT, '.bmm-build-tmp');

/** 交给子进程的环境：临时目录必须是我们确认可写的那个 */
function buildEnv(extra) {
  return { TEMP: TMPDIR, TMP: TMPDIR, ...extra };
}

/**
 * 跑一个命令，失败就抛错。
 *
 * ⚠️ 这里**不能用 process.exit()**：那会跳过下面的 finally，标记文件就留在仓库里了
 *（踩过一次：app-variant.json 没被清掉，完整版会被误判成工坊版）。改成抛错，由外层统一处理。
 */
function run(cmd, args, env) {
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    // Windows 上 npx 是 .cmd，必须经 shell。只在 Windows 开，别处直接执行更安全
    shell: process.platform === 'win32',
    env: { ...process.env, ...buildEnv(env) }
  });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} 失败（exit ${r.status}）`);
  }
}

function writeMarker() {
  fs.writeFileSync(
    MARKER,
    JSON.stringify({ variant: 'workshop', note: '创意工坊版标记，由 scripts/build-workshop.cjs 生成' }, null, 2),
    'utf8'
  );
  console.log('[build-workshop] 已写变体标记 app-variant.json');
}

function removeMarker() {
  try {
    fs.rmSync(MARKER, { force: true });
  } catch {
    /* 删不掉就算了，下次构建会覆盖 */
  }
}

/**
 * 校验打包产物：实现放在共用模块 `scripts/lib/verify-package.cjs`
 * （那边的注释写了为什么必须有这一步 —— asar 曾把整个仓库、含 17 MB 界面截图都打进去）。
 * 完整版与工坊版共用同一套判断，避免两边标准不一致。
 */
function verify() {
  const okPkg = verifyPackage(path.join(ROOT, 'release-ws', 'win-unpacked', 'resources'), {
    expectVariant: 'workshop'
  });
  // 工坊版没有自更新 ⇒ 不该有 latest.yml（见 verifyUpdaterManifest 的注释：它会污染 Release）
  const okYml = verifyUpdaterManifest(path.join(ROOT, 'release-ws'), { expect: 'none' });
  return okPkg && okYml;
}

/**
 * 删掉工坊版输出里的 `latest.yml`。
 *
 * electron-builder 因为 package.json 配了 `publish` 就会写它，而两个构建写的**同名**。
 * 一个 Release 只能有一个 latest.yml，工坊版那份一旦被传上去，就会覆盖完整版的更新清单，
 * 把所有完整版用户"更新"成工坊版。工坊版又根本没有自更新（主进程不注册 updater IPC），
 * 所以这份文件对它毫无价值、只有风险 —— 直接删掉，并让 verify() 断言它不存在。
 */
function removeUpdaterManifest() {
  const f = path.join(ROOT, 'release-ws', 'latest.yml');
  if (!fs.existsSync(f)) return;
  fs.rmSync(f, { force: true });
  console.log('[build-workshop] 已删除 release-ws/latest.yml（工坊版无自更新，留着会覆盖完整版的更新清单）');
}

const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
/*
 * 版本号与完整版**共用**（刻意如此）：两条线同一个版本号、发到同一个 GitHub Release，
 * 只在安装包文件名上用 `workshop` 区分（见 electron-builder.workshop.yml 的 artifactName）。
 * 所以不要在工坊版这边引入独立的版本号来源 —— 那会让"同一版本两个编号"更难对账。
 */
console.log(`[build-workshop] 版本 ${version}（与完整版共用，靠文件名里的 workshop 区分）`);

try {
  // 0) 建好临时目录（NSIS 要往里写，见 TMPDIR 的注释）
  fs.mkdirSync(TMPDIR, { recursive: true });

  // 1) 前端：BMM_VARIANT=workshop 会把 features.browseWorkshop 等钉成 false
  run('npx', ['vite', 'build'], { BMM_VARIANT: 'workshop' });

  // 2) 变体标记：必须在 electron-builder 之前就位
  writeMarker();

  if (NO_PACK) {
    console.log('[build-workshop] --no-pack：已停在打包之前（标记文件保留，供调试）');
    process.exit(0);
  }

  // 3) 打包：用覆盖配置改 appId / 产品名 / 文件名
  run('npx', ['electron-builder', '--config', 'electron-builder.workshop.yml']);

  // 3.5) 去掉会污染 Release 的 latest.yml（见 removeUpdaterManifest 的注释）
  removeUpdaterManifest();

  // 4) 验产物：清单混入、"标记没进包"、latest.yml 混入都是**静默**失败，必须主动验
  if (!verify()) process.exitCode = 1;
} catch (e) {
  console.error('[build-workshop] 出错：' + ((e && e.message) || e));
  process.exitCode = 1;
} finally {
  /*
   * 标记文件不能留在仓库里：否则完整版的 electron-builder 也会把它打进 exe，
   * 完整版就会被误判成工坊版。
   * 用 finally 兜住 Ctrl-C / 异常 —— 中断时也不该留下它。
   */
  if (!NO_PACK) removeMarker();
}
