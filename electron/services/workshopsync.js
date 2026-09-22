const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { API_HOSTS, hostForAttempt, hasNextHost, remember, isApiUrl } = require('./steamapi');

const { stripBom } = require('./mods');
const { fetchDetails } = require('./steam');

/**
 * 工坊状态相关的两件事。
 *
 * 1) 读 Steam 的 `appworkshop_*.acf`（readWorkshopAcf / installTimeOf）
 *    每个条目记着 timeupdated（本地已下载版本）和 latest_timeupdated（最新可用版本）。
 *    游戏把 timeupdated 原样写进 Installed 的 filelist.xml 当 installtime ——
 *    对着 100 个真实 mod 验证过，100/100 吻合。
 *
 * 2) 检查「这个工坊条目还在不在」（refreshChecks / isDelisted）
 *    作者下架之后，本地文件看不出任何区别（.acf 记录和正常 mod 一模一样），只能联网核实。
 *    结果缓存在 `userData/workshop-checks.json`，扫描时读缓存、不联网。
 *
 *    有 Steam Web API Key 时走官方 `IPublishedFileService/GetDetails`（准确且快，105 条约 1 秒）；
 *    没有就退回抓工坊网页 —— 那种只能得出「工坊上看不到」，
 *    因为网页分不清「已下架」和「作者设为私有」（实测真的会把私有条目误判成下架）。
 *
 * 注：「把工坊更新同步进游戏」的功能在 installsync.js 里，不在这个文件。
 *     历史上这里曾经删过一次那个功能，理由是「游戏在 Steam 下载完 1 秒内就自己复制进 Installed，
 *     中间态不存在」—— **那个结论是错的**：它测的是**新订阅**，而**已有 mod 的更新**
 *     会一直等玩家在游戏里按更新键（实测等了 4 天）。详见 installsync.js 顶部的实测记录。
 */

/** 找到 `steamapps/workshop/appworkshop_<appid>.acf` */
function acfPath(workshopModsDir) {
  const dir = String(workshopModsDir || '');
  if (!dir) return null;

  // 常规结构：<steam>/steamapps/workshop/content/<appid>
  const appid = path.basename(dir);
  const workshopRoot = path.resolve(dir, '..', '..');
  const direct = path.join(workshopRoot, `appworkshop_${appid}.acf`);
  if (fs.existsSync(direct)) return direct;

  // 兜底：逐层往上找任意 appworkshop_*.acf
  let cur = workshopRoot;
  for (let i = 0; i < 3; i++) {
    try {
      const hit = fs.readdirSync(cur).find((f) => /^appworkshop_\d+\.acf$/i.test(f));
      if (hit) return path.join(cur, hit);
    } catch {
      /* 读不到就继续往上 */
    }
    const up = path.dirname(cur);
    if (up === cur) break;
    cur = up;
  }
  return null;
}

/** 解析 .acf 里的 WorkshopItemDetails 段（Valve KeyValues，这里只需扁平的那层） */
function parseDetails(text) {
  const start = text.indexOf('"WorkshopItemDetails"');
  if (start < 0) return {};

  const body = text.slice(start);
  const out = {};
  const re = /"(\d{5,})"\s*\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(body))) {
    const id = m[1];
    const get = (k) => {
      const mm = m[2].match(new RegExp(`"${k}"\\s*"([^"]*)"`));
      return mm ? mm[1] : null;
    };
    const num = (k) => {
      const v = Number(get(k));
      return Number.isFinite(v) && v > 0 ? v : null;
    };
    out[id] = {
      /** 本地已下载/已安装版本的时间戳 */
      timeUpdated: num('timeupdated'),
      /** 最新可用版本的时间戳 */
      latestTimeUpdated: num('latest_timeupdated'),
      manifest: get('manifest'),
      latestManifest: get('latest_manifest')
    };
  }
  return out;
}

function readWorkshopAcf(workshopModsDir) {
  const p = acfPath(workshopModsDir);
  if (!p) {
    return { available: false, path: null, items: {}, reason: '找不到 Steam 的 appworkshop_*.acf' };
  }
  try {
    const items = parseDetails(fs.readFileSync(p, 'utf8'));
    return {
      available: true,
      path: p,
      items,
      reason: Object.keys(items).length ? null : 'appworkshop 里没有工坊条目'
    };
  } catch (e) {
    return { available: false, path: p, items: {}, reason: String((e && e.message) || e) };
  }
}

/** 读游戏写进 Installed 的 installtime */
function installTimeOf(dir) {
  try {
    const txt = stripBom(fs.readFileSync(path.join(dir, 'filelist.xml'), 'utf8'));
    const m = txt.match(/\binstalltime\s*=\s*"(\d+)"/i);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

/*
 * 「这个工坊条目还在不在」的检查结果。
 *
 * 注意：**不能只看接口的 result**。ISteamRemoteStorage/GetPublishedFileDetails 对
 * 「条目已删除」和「成人内容（需要年龄验证）」都返回 result=9，
 * 实测 12 个被判下架的有 9 个其实是后者 —— 全部误报。
 *
 * 所以分两轮：
 *   1) 接口批量查：result=1 → 确定存在，直接下结论
 *   2) result≠1 的（多半是成人内容）用工坊网页定论：
 *      条目被删时页面标题是「Steam 社区 :: 错误」，否则只是年龄门/正常页
 *
 * 结果缓存下来，扫描时读缓存（不联网），需要时再刷新。
 */

const CHECKS_VERSION = 5;
const CHECKS_FILE = 'workshop-checks.json';
const CHECK_TTL_MS = 24 * 60 * 60 * 1000;
/** 上次没能核实（被限流）的，隔这么久再试，别每次启动都硬打 */
const CHECK_RETRY_MS = 10 * 60 * 1000;
/** 单次刷新最多用工坊网页核实多少个（避免长时间占用和触发限流） */
const MAX_PAGE_CHECKS = 30;

function checksFile(dir) {
  return path.join(String(dir || '.'), CHECKS_FILE);
}

function readChecks(dir) {
  try {
    const raw = JSON.parse(fs.readFileSync(checksFile(dir), 'utf8'));
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

function writeChecks(dir, map) {
  try {
    fs.mkdirSync(path.dirname(checksFile(dir)), { recursive: true });
    fs.writeFileSync(checksFile(dir), JSON.stringify(map, null, 2), 'utf8');
  } catch {
    /* 写不进去也不影响本次返回值 */
  }
  return map;
}

/** 已下架 = 明确核实过「条目不存在」 */
function isDelisted(checks, id) {
  const c = checks && checks[String(id)];
  return !!c && c.exists === false;
}

/** 有任何一个 id 没查过、版本旧了、或查得太久，就算脏 */
function checksStale(checks, ids, maxAgeMs = CHECK_TTL_MS) {
  const now = Date.now();
  for (const id of ids) {
    const c = checks && checks[String(id)];
    if (!c || c.v !== CHECKS_VERSION || !c.checkedAt) return true;
    // 上次没核实成（Steam 返回了通用页/登录页）→ 过一阵子再试；连续失败多次就退避得久一些
    if (c.exists === null || c.exists === undefined) {
      const wait = (c.tries || 1) >= 3 ? CHECK_TTL_MS : CHECK_RETRY_MS;
      if (now - c.checkedAt > wait) return true;
      continue;
    }
    if (now - c.checkedAt > maxAgeMs) return true;
  }
  return false;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fetchText(url, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          /*
           * UA 必须是这种「短」写法。实测：带上 Chrome/Safari 的完整 UA 时，
           * Steam 只返回一个约 300KB 的 JS 空壳页（标题统一是「Steam 创意工坊」），
           * 已删除的条目和正常条目长得一模一样，根本判不出来。
           */
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
        }
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const next = /^https?:/i.test(res.headers.location)
            ? res.headers.location
            : new URL(res.headers.location, url).toString();
          fetchText(next, timeout).then(resolve, reject);
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        /*
         * 必须监听响应流自己的 error：连接中途断开时 res 只会 emit 'error'，
         * 既不会 'end' 也不会触发 req 的 error —— 少了这一行，这个 Promise
         * 永远不会落地，await 它的下架检查会一直挂在那里。
         */
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    req.setTimeout(timeout, () => req.destroy(new Error('请求工坊页面超时')));
  });
}

/**
 * 带状态码的 GET（Steam API 要用状态码区分「Key 无效」）。
 *
 * 5xx / 连不上时会**换一个 Steam API 域名**再试（见 steamapi.js：某些网络环境下
 * api.steampowered.com 稳定 503，而 community.steam-api.com 0.9 秒就返回）。
 * 成功的域名会被记住，后续请求直接走它 —— 否则每次都要先白等一次主域名超时。
 * 401/403 这类"请求本身没问题、是 key 的问题"不换域名，直接交给调用方判断。
 */
async function httpGetStatus(url, timeout = 20000) {
  let lastErr = null;
  for (let attempt = 0; attempt < API_HOSTS.length; attempt++) {
    const target = hostForAttempt(url, attempt);
    const host = (() => {
      try {
        return new URL(target).hostname;
      } catch {
        return null;
      }
    })();
    try {
      const res = await new Promise((resolve, reject) => {
        const req = https.get(target, { headers: { Accept: 'application/json' } }, (r) => {
          const chunks = [];
          r.on('data', (c) => chunks.push(c));
          r.on('end', () =>
            resolve({ status: r.statusCode, body: Buffer.concat(chunks).toString('utf8') })
          );
          r.on('error', reject);
        });
        req.on('error', reject);
        req.setTimeout(timeout, () => req.destroy(new Error('请求 Steam API 超时')));
      });
      if (res.status === 401 || res.status === 403 || res.status < 500) {
        if (res.status === 200 && host && isApiUrl(url)) remember(host);
        return res;
      }
      lastErr = new Error('HTTP ' + res.status);
    } catch (e) {
      lastErr = e;
    }
    if (hasNextHost(attempt)) await sleep(250);
  }
  throw lastErr || new Error('请求 Steam API 失败');
}

/**
 * 用官方 Web API 查条目状态（需要用户自己申请 API Key）。
 *
 * 必须用 GET —— 用 POST 会返回 405。Key 无效时是 401，报错信息也很明确。
 *
 * 返回 Map<id, { exists, visibility }>：
 *   result=1  → 条目存在（visibility: 0=公开 1=私有 3=不公开列出）
 *   result=9  → 条目不存在（k_EResultNoMatch）
 *   result=15 → 无权访问（k_EResultAccessDenied，实际也等于没了）
 *   其它       → exists=null，说不清
 *
 * 实测（真 Key）：成人内容能正常返回，不需要抓网页。
 */
async function fetchExistsViaApi(ids, apiKey) {
  const key = String(apiKey || '').trim();
  if (!key) throw new Error('没有 API Key');

  const out = new Map();
  const list = Array.from(new Set((ids || []).map(String).filter(Boolean)));

  for (let i = 0; i < list.length; i += 100) {
    const chunk = list.slice(i, i + 100);
    const params = new URLSearchParams();
    params.set('key', key);
    params.set('includevotes', 'false');
    params.set('short_description', 'true');
    chunk.forEach((id, k) => params.append(`publishedfileids[${k}]`, id));

    const res = await httpGetStatus(
      `https://api.steampowered.com/IPublishedFileService/GetDetails/v1/?${params.toString()}`
    );
    if (res.status === 401 || res.status === 403) {
      const e = new Error('Steam API Key 无效或没有权限');
      e.code = 'BAD_KEY';
      throw e;
    }
    if (res.status !== 200) continue; // 这批跳过，保留旧值

    let json;
    try {
      json = JSON.parse(res.body);
    } catch {
      continue;
    }
    for (const d of (json.response && json.response.publishedfiledetails) || []) {
      const id = String(d.publishedfileid);
      const r = Number(d.result);
      const exists = r === 1 ? true : r === 9 || r === 15 ? false : null;
      out.set(id, {
        exists,
        visibility: typeof d.visibility === 'number' ? d.visibility : null,
        result: r,
        title: d.title || null
      });
    }
  }
  return out;
}

/**
 * 用工坊网页判断条目到底在不在。
 * 返回 true=在 / false=已下架 / null=认不出来（不下结论）。
 *
 * 三种页面：
 *   「Steam 社区 :: 错误」            → 条目被删了
 *   带 workshopItemTitle 的条目页      → 在
 *   带 Sign in + mature 的登录页      → 在（成人内容要登录才给看详情，但条目没删）
 *   其它（被限流时的通用壳页等）        → null，不下结论
 *
 * **认不出来绝不能当成「还在」** —— 否则被限流时所有已下架的 mod 都会被静默漏掉。
 */
async function checkExistsByPage(id) {
  const html = await fetchText(
    `https://steamcommunity.com/sharedfiles/filedetails/?id=${encodeURIComponent(id)}`
  );
  // 1) 明确的「不存在」
  if (/The item you specified does not exist|该物品不存在|指定的物品不存在/i.test(html)) return false;
  const title = (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || '';
  if (/::\s*(错误|Error)\s*$/i.test(title.trim())) return false;
  // 2) 真正的条目页
  if (/workshopItemTitle/i.test(html)) return true;
  // 3) 成人内容的登录页：Steam 要求登录才给看，但条目是存在的
  //    （被删掉的成人内容照样会给错误页 —— 3156077899 就是这么判出来的）
  if (/\bmature\b/i.test(html) && /sign in|登录/i.test(html)) return true;
  // 4) 认不出来
  return null;
}

/** 联网刷新检查结果。拿不到的条目保留旧记录，绝不写负面结论 */
async function refreshChecks(dir, ids, hooks = {}) {
  const { onProgress = () => {}, apiKey = '' } = hooks;
  const list = Array.from(new Set((ids || []).map(String).filter(Boolean)));
  const map = { ...readChecks(dir) };
  const now = Date.now();
  const uncertain = [];
  let apiKeyError = null;
  const mode = apiKey ? 'apikey' : 'page';

  /*
   * 有 API Key：**只用官方接口**，一次批量请求就能精确分类，不抓网页。
   *
   * 实测：官方接口对成人内容正常返回；而且能区分
   *   visibility=1（私有，只有作者可见）—— 那种在匿名网页上是「错误页」，
   *   抓网页会把用户自己上传的私有条目误判成「已下架」。
   *
   * 没有 Key：退回抓工坊网页。但网页分不清「已下架」和「私有」，
   * 所以结果只能标成「工坊上不可见」，不能断言已下架。
   */
  if (apiKey) {
    try {
      const viaApi = await fetchExistsViaApi(list, apiKey);
      for (const id of list) {
        const d = viaApi.get(id);
        if (!d) continue; // 接口没返回这个 id：保留旧值
        map[id] = {
          v: CHECKS_VERSION,
          exists: d.exists,
          visibility: d.visibility,
          result: d.result,
          title: d.title,
          checkedAt: now,
          how: 'apikey',
          tries: 0
        };
      }
    } catch (e) {
      apiKeyError = String((e && e.message) || e);
    }
    return { checks: writeChecks(dir, map), apiKeyError, mode };
  }

  // 没有 Key：老接口批量筛一遍，result=1 的直接确定，其余靠网页
  for (let i = 0; i < list.length; i += 50) {
    const chunk = list.slice(i, i + 50);
    let details;
    try {
      details = await fetchDetails(chunk);
    } catch {
      continue; // 这批失败就跳过，保留旧值
    }
    for (const id of chunk) {
      const d = details.get(String(id));
      if (!d) continue;
      if (Number(d.result) === 1) {
        map[id] = {
          v: CHECKS_VERSION,
          exists: true,
          visibility: null,
          result: 1,
          title: d.title || null,
          checkedAt: now,
          how: 'api',
          tries: 0
        };
      } else {
        uncertain.push(id);
      }
    }
  }

  /*
   * 逐个用网页定论。
   *
   * 注意：**拿不到就跳过、绝不提前停手**。之前写成「连续 5 次失败就 break」，
   * 结果排在后面的条目永远轮不到（实测 15 个里只查了 5 个，另外 10 个连记录都没有）。
   */
  let attempted = 0;
  const limit = Math.min(uncertain.length, MAX_PAGE_CHECKS);
  for (let i = 0; i < limit; i++) {
    const id = uncertain[i];
    attempted = i + 1;
    onProgress(i + 1, limit, id);
    let verdict = null;
    try {
      verdict = await checkExistsByPage(id);
    } catch {
      verdict = null; // 网络错误：记成未核实，下次再试
    }

    const prev = map[id];
    map[id] = {
      v: CHECKS_VERSION,
      exists: verdict,
      visibility: null,
      result: 9,
      title: null,
      checkedAt: Date.now(),
      // 网页说「不在」时不能断言是下架 —— 也可能只是作者设成了私有
      how: verdict === null ? 'unknown' : verdict ? 'page' : 'page-invisible',
      // 没核实成的累加次数，用于退避（别每次启动都白跑一遍）
      tries: verdict === null ? (prev && prev.tries ? prev.tries + 1 : 1) : 0
    };

    if (i < limit - 1) await sleep(1500);
  }

  /*
   * 没走到的条目：把「不是当前版本」的旧记录删掉。
   * 否则它们会留在缓存里冒充「已经核实过」—— 上一版逻辑写下的错误结论就是这么
   * 一直显示成「还在」的。删掉之后 checksStale 会认为它们还没查过，下次自然会重试。
   */
  for (const id of uncertain.slice(attempted)) {
    const old = map[id];
    if (old && old.v !== CHECKS_VERSION) delete map[id];
  }

  return { checks: writeChecks(dir, map), apiKeyError, mode };
}

module.exports = {
  acfPath,
  readWorkshopAcf,
  installTimeOf,
  readChecks,
  writeChecks,
  isDelisted,
  checksStale,
  refreshChecks,
  checkExistsByPage,
  fetchExistsViaApi,
  fetchText,
  CHECKS_VERSION,
  CHECK_TTL_MS
};
