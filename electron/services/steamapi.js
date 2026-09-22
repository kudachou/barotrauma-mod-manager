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
 * 最近失败的域名 → 记下时间，短时间内不再作为首选去试它。
 *
 * 为什么必须记"失败"而不只记"成功"：实测 `api.steampowered.com` 在本机是**稳定**不可用
 *（要 21 秒才 ECONNRESET），而 `community.steam-api.com` 一直好用（1.6~5.4 秒）。
 * 只记成功的话，每个请求仍会先去试那个坏域名：冷启动第一次 = 12 秒超时 + 备用 1~4 秒
 * = **14~17 秒**，用户看到的就是"打开要十几秒、有时候直接失败"。
 *
 * 失败记录会**落盘**（见 loadPref/savePref）：否则每次重启应用，第一个请求又要白等一次。
 */
const failedUntil = new Map();
const FAIL_COOLDOWN_MS = 30 * 60 * 1000;

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

/** 这个域名最近失败过、还在冷却期吗 */
function isFailed(host) {
  const at = failedUntil.get(host);
  if (!at) return false;
  if (Date.now() - at > FAIL_COOLDOWN_MS) {
    failedUntil.delete(host); // 冷却过了，给它一次机会
    return false;
  }
  return true;
}

/** 记下这次请求的结果：成功 → 清掉失败记录；失败 → 进冷却 */
function noteResult(host, ok) {
  if (!API_HOSTS.includes(host)) return;
  if (ok) failedUntil.delete(host);
  else failedUntil.set(host, Date.now());
}

/* --------------------------- 失败记录的落盘 --------------------------- */
/*
 * 不落盘的话，每次重启应用第一个请求都要先在坏域名上白等一次（实测 14~17 秒）。
 * 落盘内容很小（就两个域名各自的时间戳），失败无所谓 —— 那只是少一次优化机会。
 */
let storeDir = null;

function prefFile() {
  return storeDir ? require('node:path').join(storeDir, 'steam-api-host.json') : null;
}

/** 启动时调一次：读回上次的失败记录 */
function loadPref(dir) {
  storeDir = dir || null;
  const f = prefFile();
  if (!f) return;
  try {
    const raw = JSON.parse(require('node:fs').readFileSync(f, 'utf8'));
    for (const [host, at] of Object.entries(raw.failed || {})) {
      if (API_HOSTS.includes(host) && typeof at === 'number') failedUntil.set(host, at);
    }
  } catch {
    /* 首次运行 / 文件坏了：当作没有记录 */
  }
}

/** 把失败记录写回磁盘 */
function savePref() {
  const f = prefFile();
  if (!f) return;
  try {
    require('node:fs').mkdirSync(storeDir, { recursive: true });
    require('node:fs').writeFileSync(
      f,
      JSON.stringify({ failed: Object.fromEntries(failedUntil) }, null, 2),
      'utf8'
    );
  } catch {
    /* 写不进去就算了，只是下次重启少一点优化 */
  }
}

/** 记下"这个域名这次正常返回了，耗时 ms"。慢响应不记为健康，见上面 healthy 的说明 */
function noteTiming(host, ms, fastMs = 1500) {
  if (!API_HOSTS.includes(host)) return;
  if (ms <= fastMs) healthy.add(host);
  else healthy.delete(host);
}

/** 尝试顺序：已知可用的 → 没失败过的 → （全坏时）最早失败的那个 */
function candidateOrder() {
  const pref = currentPref();
  const order = [];
  if (pref) order.push(pref);
  for (const h of API_HOSTS) {
    if (order.includes(h)) continue;
    if (isFailed(h)) continue;
    order.push(h);
  }
  if (order.length) return order;
  /*
   * 所有域名都在冷却里 —— 不能就这么返回空（那会让每个请求都直接失败，
   * 而且一旦两个都被记成"坏"，30 分钟冷却期内全都跑不了）。
   * 挑**最早失败**的那个再给一次机会：它最可能已经恢复。
   */
  return API_HOSTS.slice().sort((a, b) => (failedUntil.get(a) || 0) - (failedUntil.get(b) || 0));
}

/** 第 attempt 次尝试该用哪个域名 */
function resolveHost(attempt = 0) {
  const order = candidateOrder();
  return order[Math.min(attempt, order.length - 1)];
}

/** 还有没有"另一个域名"可换 */
function hasNextHost(attempt) {
  return attempt + 1 < candidateCount();
}

/** 当前有几个候选域名（去掉了冷却中的；全都冷却时至少还有最早失败的那个） */
function candidateCount() {
  return candidateOrder().length;
}

/**
 * 把 URL 换成第 attempt 次尝试应该用的域名。
 * 非 API 地址（图片 CDN、工坊页面）原样返回，不要乱改。
 *
 * 注意**不要**在这里加"没有偏好就直接返回原 URL"的早退：那会把 candidateOrder()
 * （跳过已被记为坏的域名）整个绕过去 —— 表现为重启后每个请求又去打那个坏域名、
 * 每次都白等一次超时（这个坑踩过）。
 */
function hostForAttempt(urlStr, attempt) {
  if (!isApiUrl(urlStr)) return urlStr;
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
  failedUntil.clear();
  storeDir = null;
}

/**
 * 这次请求该给多长的超时。
 *
 * 规则（由调用方 steam.js 传入候选值）：
 *   1. 已知某个域名可用、却在回头试**另一个**域名 → 短（只是"万一它恢复了"）
 *   2. **备选**域名（API_HOSTS 里非首位的那个）→ 给宽一点。它是主域名失败后的唯一指望，
 *      而它自己正常时就要 0.9~3.2 秒，拿 4 秒探测超时去卡它会把它误判成"也挂了"。
 *   3. 首选/正在探测的域名 → 探测超时（超时就换域名，别让用户等）
 *   4. 已被证实的健康域名 → 正常超时
 */
function pickTimeout({ host, pref, normalMs, probeMs, staleMs, backupMs }) {
  if (pref && pref !== host) return staleMs;
  if (isHealthy(host)) return normalMs;
  // 非首位的都是"备选"
  if (host !== API_HOSTS[0]) return backupMs;
  return probeMs;
}

/**
 * 预探测：同时问两个域名"在不在"，谁先答上来就把它记为可用。
 *
 * 为什么需要：偏好只存在进程内存里，所以**每次冷启动的第一个请求**都要先按顺序探测——
 * 首选域名抽风时白等一次探测超时，用户打开浏览工坊就是"十几秒才出来"（实测 10.5 秒）。
 * 并行探测把"先等首选超时"这一步省掉：两个域名一起问，先答的那个直接当偏好。
 *
 * 刻意**不阻塞**任何调用方：探测失败就算了，正常请求流程有自己的回退。
 * 在 app 启动时调一次，等用户点开浏览工坊时偏好已经建立好了。
 */
let prewarmPromises = null;

function prewarmHttp(probe, timeoutMs = 2500) {
  if (prewarmPromises) return; // 已经探过
  prewarmPromises = API_HOSTS.map((host) =>
    probe(host, timeoutMs)
      .then((ok) => (ok ? host : null))
      .catch(() => null)
  );
  Promise.all(prewarmPromises).then((hosts) => {
    // 两个都答上来了就选先答的；只答一个就用那个
    const first = hosts.find((h) => h);
    if (first) remember(first);
  });
}

/** 仅供测试 */
function __resetPrewarm() {
  prewarmPromises = null;
}

module.exports = {
  API_HOSTS,
  PREF_TTL_MS,
  FAIL_COOLDOWN_MS,
  isApiPath,
  isApiUrl,
  resolveHost,
  hasNextHost,
  candidateCount,
  hostForAttempt,
  remember,
  isHealthy,
  isFailed,
  noteResult,
  noteTiming,
  currentPref,
  loadPref,
  savePref,
  prewarmHttp,
  __resetPref,
  __resetPrewarm
};
