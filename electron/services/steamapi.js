/**
 * Steam Web API 的入口选择：主域名优先，**记住哪个能用**，失败自动换。
 *
 * ## 为什么需要这个
 *
 * 浏览工坊、详情、下架检查都走 `api.steampowered.com`。实测（2026-09-20，用户本机开着加速器）：
 *
 * | 域名 | 结果 |
 * | --- | --- |
 * | `api.steampowered.com` | **503**（Akamai 边缘 errors.edgesuite.net）/ 21 秒后 ECONNRESET |
 * | `community.steam-api.com` | **200，923ms**（同一批接口形状完全一致） |
 * | `steamcommunity.com` | 200（所以浏览器能打开工坊页） |
 * | `store.steampowered.com` | 200 |
 *
 * 也就是：**加速器只代理了 steamcommunity / store，没代理 API 域名** ——
 * 于是"浏览器打得开创意工坊、管理器却报 503"。这不是 key、UA 或 TLS 指纹的问题：
 * Node https 与 Chromium 网络栈、四种 User-Agent 分别试过，结果完全一样。
 *
 * ## 为什么要有"记住可用域名"
 *
 * 只做"失败后换域名"是不够的：主域名是**稳定**不可用，那么每次请求都要先白等一次超时。
 * 实测那一版：单次 browse 20.4 秒、分类标签（3 个请求）75 秒 —— 而备用域名本身只要 0.9 秒。
 * 所以这里会记住最近一次成功的域名，后续请求直接用它；主域名只是**首选**，不是必经之路。
 * 记住的偏好有有效期（默认 30 分钟），过期会重新试主域名，网络环境变了能自己恢复。
 */

/** 按优先级排列的 API 域名 */
const API_HOSTS = ['api.steampowered.com', 'community.steam-api.com'];

/** 偏好有效期：过了就重新试首选，避免网络环境变好后一直走备用 */
const PREF_TTL_MS = 45 * 60 * 1000;

/** 进程内记住的上次可用域名（跨会话的偏好由调用方传 pref 进来） */
let remembered = { host: null, at: 0 };

/**
 * 已经在实测里观察到"能正常工作"的域名。
 *
 * 和上面的 remembered 分开：remembered 是**首选顺序**，这里只表示"这个域名我亲眼见它正常返回过"。
 * 区别很重要 —— `api.steampowered.com` 在本机时好时坏（388ms ↔ 20s），
 * 如果只因为"记住过"就给它正常超时，那么它每次闹脾气用户都要等 20 秒。
 * 只有**这一次成功得够快**才把它记成健康；不健康就继续用短超时探测，
 * 撞上慢响应立刻换域名，而不是干等。
 */
const healthy = new Set();

/** 是否是 Steam Web API 的路径（/ISteamXxx、/IPublishedFileService 这类） */
function isApiPath(p) {
  return /^\/(?:ISteam|IPublishedFileService|ISteamRemoteStorage|ISteamUser|ISteamApps)/.test(
    String(p || '')
  );
}

/** 这个 URL 该不该参与换域名（图片 CDN、工坊页面都不参与） */
function isApiUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    return API_HOSTS.includes(u.hostname) || isApiPath(u.pathname);
  } catch {
    return false;
  }
}

/** 拿当前生效的偏好域名；过期或没有就返回 null */
function currentPref() {
  if (!remembered.host) return null;
  if (Date.now() - remembered.at > PREF_TTL_MS) return null;
  return remembered.host;
}

/** 记下这个域名能用 */
function remember(host) {
  // 传进来的可能是解析后的 IP（Node 的 opts.hostname 在已解析时会给 IP），只认已知域名
  if (API_HOSTS.includes(host)) remembered = { host, at: Date.now() };
}

/** 这个域名是不是"亲眼见它正常返回过" */
function isHealthy(host) {
  return healthy.has(host);
}

/** 记下"这个域名这次正常返回了，耗时 ms"。慢响应不记为健康，见上面 healthy 的说明 */
function noteTiming(host, ms, fastMs = 1500) {
  if (!API_HOSTS.includes(host)) return;
  if (ms <= fastMs) healthy.add(host);
  else healthy.delete(host);
}

/** 第 attempt 次尝试该用哪个域名：优先用记住的那个，否则按 API_HOSTS 顺序 */
function resolveHost(attempt = 0) {
  const pref = currentPref();
  const order = pref ? [pref, ...API_HOSTS.filter((h) => h !== pref)] : API_HOSTS.slice();
  return order[Math.min(attempt, order.length - 1)];
}

/**
 * 还有没有"另一个域名"可换。
 * @param {number} attempt 当前第几次尝试
 * @param {object} [opts]
 * @param {boolean} [opts.forSwitch] true = 问"还要不要换域名"（走完一轮就别再循环了）；
 *   false/省略 = 问"还能不能再试一次"（允许最后那次宽松超时的收尾尝试）
 */
function hasNextHost(attempt, opts = {}) {
  const pref = currentPref();
  const total = API_HOSTS.length;
  if (opts.forSwitch) return attempt + 1 < total;
  return attempt < total; // 收尾那次允许走到第 total 次
}

/**
 * 把 URL 换成第 attempt 次尝试应该用的域名。
 * 非 API 地址（图片 CDN、工坊页面）原样返回，不要乱改。
 */
function hostForAttempt(urlStr, attempt) {
  if (!isApiUrl(urlStr)) return urlStr;
  if (attempt <= 0 && !currentPref()) return urlStr;
  try {
    const u = new URL(urlStr);
    u.hostname = resolveHost(attempt);
    return u.toString();
  } catch {
    return urlStr;
  }
}

/** 仅供测试：清掉记住的偏好 */
function __resetPref() {
  remembered = { host: null, at: 0 };
  healthy.clear();
}

/**
 * 这次请求该给多长的超时。
 *
 * 规则（由调用方 steam.js 传入候选值）：
 *   1. 已知某个域名可用、却在回头试**另一个**域名 → 短（只是"万一它恢复了"）
 *   2. 正在用的域名**还没被证实健康** → 中等（探测：超时就说明它当下不对劲，换域名）
 *   3. 已被证实的健康域名 → 正常超时（慢网络也给它机会）
 */
function pickTimeout({ host, pref, normalMs, probeMs, staleMs }) {
  if (pref && pref !== host) return staleMs;
  if (!isHealthy(host)) return probeMs;
  return normalMs;
}

module.exports = {
  API_HOSTS,
  PREF_TTL_MS,
  isApiPath,
  isApiUrl,
  resolveHost,
  hasNextHost,
  hostForAttempt,
  remember,
  isHealthy,
  noteTiming,
  currentPref,
  pickTimeout,
  __resetPref
};
