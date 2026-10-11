/**
 * 构建**完整版**安装包（`pnpm pack` 的加固版）。
 *
 * 和原来的 `vite build && electron-builder` 相比，多了两件必须做的事：
 *
 * 1. **显式指定临时目录**。环境里的 `TEMP` 被指到沙箱/会话自己的目录时，
 *    NSIS 打包会报 "Error writing temporary file. Make sure your temp folder is valid."
 *    并留下一个 0.1 MB 的残缺 exe（构建却"成功"返回）。
 * 2. **打完验产物清单**。electron-builder 曾把整个仓库打进 app.asar
 *    （shots\ 17MB、tmp-*-ui\ 12MB、docs\、src\ …），静默发生，退出码还是 0。
 *    详见 scripts/lib/verify-package.cjs。
 *
 * 用法：node scripts/build-full.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { verifyPackage, verifyUpdaterManifest } = require('./lib/verify-package.cjs');

const ROOT = path.join(__dirname, '..');
/** 构建期临时目录，放在工作区内（见上面第 1 条） */
const TMPDIR = path.join(ROOT, '.bmm-build-tmp');
/** 完整版的输出目录（和工坊版的 release-ws 分开，两条构建线互不干扰） */
const OUT = 'release';

function run(cmd, args, env) {
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, TEMP: TMPDIR, TMP: TMPDIR, ...env }
  });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} 失败（exit ${r.status}）`);
}

const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
console.log(`[build-full] 版本 ${version}（完整版）`);

try {
  fs.mkdirSync(TMPDIR, { recursive: true });

  /*
   * 完整版**必须**确保没有变体标记：它一旦存在，主进程会把自己当成创意工坊版，
   * 于是浏览工坊、API Key、自更新全都消失。这个文件平时不该存在（工坊版脚本会清），
   * 但构建中断之类的情况可能留下，所以这里主动兜一下。
   */
  const marker = path.join(ROOT, 'app-variant.json');
  if (fs.existsSync(marker)) {
    fs.rmSync(marker, { force: true });
    console.log('[build-full] 清掉了遗留的 app-variant.json（否则会被当成工坊版）');
  }

  // 不传 BMM_VARIANT：vite.config.ts 里默认就是 'full'
  run('npx', ['vite', 'build']);
  run('npx', ['electron-builder']);

  if (!verifyPackage(path.join(ROOT, OUT, 'win-unpacked', 'resources'), { expectVariant: 'full' })) {
    process.exitCode = 1;
  }

  /*
   * 再核一遍 latest.yml：它必须指向完整版自己的安装包。
   * 如果两条构建线共用输出目录，工坊版最后一次打包会把 latest.yml 改写成指向
   * `…-workshop-setup-….exe` —— 传上去用户就更新成工坊版了。
   * 判定逻辑放在共用模块里，和工坊版那条"不得存在"的断言同源。
   */
  if (!verifyUpdaterManifest(path.join(ROOT, OUT), { expect: 'full' })) {
    process.exitCode = 1;
  }
} catch (e) {
  console.error('[build-full] 出错：' + ((e && e.message) || e));
  process.exitCode = 1;
}
