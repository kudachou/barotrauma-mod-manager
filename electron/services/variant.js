/**
 * 构建变体判定。
 *
 * 目前有两种：
 *   `full`     —— 完整版：浏览工坊、工坊下架检查、Steam Web API Key、electron-updater 都在
 *   `workshop` —— 创意工坊版：**不索取 Web API Key**，去掉浏览工坊与下架检查，
 *                 自更新改走"工坊下载进来那份的版本号 → 提示重装"
 *
 * ## 为什么不能只读环境变量
 *
 * `BMM_VARIANT` 是**构建期**变量（打包时注入）。打完包运行 exe 时它早就不在环境里了，
 * 所以 electron-builder 会把 `app-variant.json` 放进 resources/ 作为落盘标记；
 * 开发时（`pnpm dev` / `electron .`）没有那个文件，就读环境变量。
 *
 * 判定**故意写成"只有明确是 workshop 才算 workshop"**：标记文件缺失、损坏、读不到，
 * 都退回完整版。宁可多给一个功能，也不要因为一个读不到的文件把功能误藏起来。
 */
const fs = require('node:fs');
const path = require('node:path');

const VARIANTS = ['full', 'workshop'];
const DEFAULT_VARIANT = 'full';

/** 打包后由 electron-builder 放进 resources/ 的标记文件 */
const MARKER_NAME = 'app-variant.json';

let cached = null;

/** 标记文件可能在哪：打包后是 resources/，开发时是仓库根 */
function markerCandidates() {
  const out = [];
  if (process.resourcesPath) out.push(path.join(process.resourcesPath, MARKER_NAME));
  out.push(path.join(__dirname, '..', '..', MARKER_NAME));
  return out;
}

function readMarker() {
  for (const p of markerCandidates()) {
    try {
      const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (raw && VARIANTS.includes(raw.variant)) return raw.variant;
    } catch {
      /* 没有 / 读不动就试下一个 */
    }
  }
  return null;
}

/** 当前变体：'full' | 'workshop' */
function variant() {
  if (cached) return cached;
  const fromMarker = readMarker();
  if (fromMarker) {
    cached = fromMarker;
    return cached;
  }
  const fromEnv = String(process.env.BMM_VARIANT || '').trim();
  cached = VARIANTS.includes(fromEnv) ? fromEnv : DEFAULT_VARIANT;
  return cached;
}

/** 是不是创意工坊版 */
function isWorkshopBuild() {
  return variant() === 'workshop';
}

/**
 * 各变体提供哪些功能。
 *
 * **必须和渲染层的 `src/features.ts` 保持一致**（那边由 vite 构建期注入同一套判断）。
 * 主进程用这份表做 IPC 守卫，界面用那份表隐藏入口；两边同源，才不会出现
 * "主进程禁了、界面还显示"或者反过来的漂移。
 */
function features() {
  const full = !isWorkshopBuild();
  return {
    variant: variant(),
    /** 浏览工坊：需要 IPublishedFileService ⇒ 需要 Web API Key */
    browseWorkshop: full,
    /** 工坊下架检查：同样需要 Key；没 Key 时抓网页分不清"已下架"和"私有"，不可靠 */
    delistedCheck: full,
    /** Steam Web API Key 的设置入口 */
    apiKey: full,
    /** electron-updater 自更新：工坊版改走"工坊检测 → 提示重装" */
    autoUpdater: full
  };
}

/** 哪些功能在这个变体里被关掉了（给 IPC 守卫和界面共用同一份说明） */
const DISABLED_REASON = '创意工坊版不提供这个功能（它需要 Steam Web API Key）';

/** 仅供测试：清掉缓存，便于在一个进程里验多个变体 */
function __reset() {
  cached = null;
}

module.exports = {
  VARIANTS,
  DEFAULT_VARIANT,
  MARKER_NAME,
  variant,
  isWorkshopBuild,
  features,
  DISABLED_REASON,
  __reset
};
