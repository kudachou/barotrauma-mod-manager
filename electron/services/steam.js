// 用 let：测试要用 __withHttps 临时替换它（见文件末尾），验证"换域名重试"的真实行为
let https = require('node:https');
const zlib = require('node:zlib');
const fs = require('node:fs');
const path = require('node:path');
const {
  API_HOSTS,
  hostForAttempt,
  remember,
  isApiUrl,
  currentPref,
  pickTimeout,
  noteTiming
} = require('./steamapi');

const UA = 'BarotraumaModManager/0.1';

/**
 * 已确认可用的域名 → 用它时给正常超时。
 * 还没确认过的域名（首选项或正在探测的那个）→ 只给这么长。
 *
 * 为什么需要后者：`api.steampowered.com` 在本机**不是稳定坏，而是时好时坏** ——
 * 顺利时 388~850ms，闹脾气时要 11~20 秒才响应。只做"失败了再换域名"是不够的：
 * 每次撞上它闹脾气就是一次漫长等待（用户看到的现象是"很慢、有时候要重试"）。
 * 给短超时之后：超过 4 秒就说明这个域名当下不对劲，马上换备用域名（平时 1~2 秒），
 * 而不是把 20 秒耗在它身上。
 */
const PROBE_TIMEOUT_MS = 4000;

/**
 * 已经知道哪个域名能用、却在回头试「另一个」域名时，只给这么长。
 * 那种探测只是"万一主域名恢复了"，不该让用户为它等下去。
 */
const STALE_HOST_TIMEOUT_MS = 2500;

/**
 * 两个域名都探测失败后，最后那次收尾尝试的超时。
 * 双慢的时候（实测某一轮 5 个请求全挂），只有探测超时是不够的：
 * 多给一次宽松的机会，慢但能响应的请求就有救。
 */
const FINAL_TRY_TIMEOUT_MS = 15000;

/**
 * 负面缓存只用于「接口明确回答这个条目没有封面」这种确定性结论。
 * 网络错误 / 被限流是暂时的，绝不写负面缓存。
 */
const MISS_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const EXTS = ['jpg', 'png', 'gif', 'webp'];
/** 一次接口请求最多带多少个 id */
const API_BATCH = 50;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {string} urlStr
 * @param {object} opts
 * @param {number} attempt      第几次尝试（决定用哪个域名）
 * @param {number} hostSwitches 已经换过几次域名（决定还能不能再换）
 * @param {number|null} forceTimeout 强制超时（收尾那次用宽松值），null = 按策略算
 */
function request(urlStr, opts = {}, attempt = 0, hostSwitches = 0, forceTimeout = null) {
  const {
    method = 'GET',
    headers = {},
    body = null,
    timeoutMs = 20000,
    retries = 2,
    delayMs = null
  } = opts;
  const pref = currentPref();
  /*
   * 重试时**换一个 API 域名**。
   * 实测某些网络环境（开着加速器也只代理了 steamcommunity）下 api.steampowered.com
   * 稳定 503 / 超时，而 Steam 的另一个入口 community.steam-api.com 0.9 秒就返回 ——
   * 见 steamapi.js 里的实测表格。图片 CDN、工坊页面这类非 API 地址不受影响。
   */
  const url = hostForAttempt(urlStr, attempt);
  const u = new URL(url);
  const apiUrl = isApiUrl(urlStr);
  /*
   * 超时策略（只对 **API 请求** 生效：图片下载几 MB，本来就慢，不能拿探测超时去卡它）：
   *   已知可用域名却在回头试另一个 → 短（只是"万一它恢复了"）
   *   还没被证实健康的域名         → 中等（探测；超时说明它当下不对劲，换域名）
   *   已证实健康的域名             → 正常
   */
  const effectiveTimeout =
    forceTimeout != null
      ? forceTimeout
      : apiUrl
        ? pickTimeout({
            host: u.hostname,
            pref,
            normalMs: timeoutMs,
            probeMs: PROBE_TIMEOUT_MS,
            staleMs: STALE_HOST_TIMEOUT_MS
          })
        : timeoutMs;

  /*
   * 超时用真实计时器竞速（见下面 timer 的注释）。
   * 计时器要能被"换域名重试"提前清掉，否则旧计时器会在新请求进行到一半时把 Promise 结掉。
   * 注意：**不要**去重新赋值 resolve/reject —— again() 是在 Promise 里定义的闭包，
   * 重写外层同名变量会让它捕获到旧的引用，换域名逻辑会整体失效（这个坑踩过一次）。
   */
  let timer = null;
  const clear = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const h = { 'User-Agent': UA, ...headers };
    if (body) h['Content-Length'] = Buffer.byteLength(body);

    const again = () => {
      clear(); // 换域名/退避重试之前先撤掉本次的超时
      /*
       * ① 还有另一个域名没试过 → 换过去（短超时，见 pickTimeout）
       */
      if (hostSwitches + 1 < API_HOSTS.length) {
        resolve(request(urlStr, { ...opts, delayMs: 250 }, attempt + 1, hostSwitches + 1, null));
        return;
      }
      /*
       * ② 两个域名都探测过了（都是短超时）→ 最后来一次**宽松超时**的收尾尝试。
       *
       * 这一段是为"两个域名同时抽风"准备的：只有 4 秒探测超时的话，双慢 = 双失败，
       * 用户看到的就是"打不开、要重试"（实测某一轮 5 个请求全挂）。
       * 多给一次机会，慢但能响应的请求就有救；真连不上那只能失败 —— 那是网络的事，不是代码的。
       */
      if (hostSwitches < API_HOSTS.length) {
        resolve(
          request(
            urlStr,
            { ...opts, delayMs: 0 },
            attempt + 1,
            hostSwitches + 1,
            Math.max(timeoutMs, FINAL_TRY_TIMEOUT_MS)
          )
        );
        return;
      }
      /*
       * ③ 收尾也失败了 → 按次数退避重试（只在非 API 请求上会走到，API 请求到这里就老实失败）
       */
      const wait = delayMs == null ? 800 * (attempt + 1) : delayMs;
      sleep(wait).then(
        () => resolve(request(urlStr, opts, attempt + 1, hostSwitches, null)),
        reject
      );
    };

    const req = https.request(
      { hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method, headers: h },
      (res) => {
        const code = res.statusCode || 0;

        // 限流 / 服务端抖动：退避重试
        if ((code === 429 || code >= 500) && attempt < retries) {
          res.resume();
          again();
          return;
        }

        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          clear();
          if (code < 200 || code >= 300) {
            reject(new Error('HTTP ' + code));
            return;
          }
          // 这个域名能用 → 记住它，后续请求直接走它（否则每次都要先等主域名超时）
          remember(u.hostname);
          // 只有"这次成功得够快"才算健康；慢响应不记，下次仍用短超时探测它
          noteTiming(u.hostname, Date.now() - startedAt);
          let buf = Buffer.concat(chunks);
          const enc = res.headers['content-encoding'];
          try {
            if (enc === 'gzip') buf = zlib.gunzipSync(buf);
            else if (enc === 'deflate') buf = zlib.inflateSync(buf);
            else if (enc === 'br') buf = zlib.brotliDecompressSync(buf);
          } catch {
            /* 解压失败就用原始内容 */
          }
          resolve({ buf, headers: res.headers });
        });
        res.on('error', (e) => {
          clear();
          reject(e);
        });
      }
    );
    req.on('error', (e) => {
      // 网络抖动（实测被 Steam 掐连接会出现 ECONNRESET）也退避重试一次，别直接判失败
      const code = String((e && (e.code || e.message)) || '');
      if (attempt < retries && /ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|socket hang up|请求超时/i.test(code)) {
        again();
        return;
      }
      clear();
      reject(e);
    });
    /*
     * 用真实计时器做超时，而不是只靠 req.setTimeout：
     * 被墙的域名是「TCP 连得上、但服务端不响应」，这种半开状态在 socket 建立**之前**
     * req.setTimeout 不一定会触发（实测等到系统自己 reset 要 11~21 秒）。
     * 这里显式竞速，超时后 destroy 掉连接并往上抛「请求超时」，让上层换域名重试。
     */
    timer = setTimeout(() => {
      req.destroy(new Error('请求超时'));
    }, effectiveTimeout);
    if (body) req.write(body);
    req.end();
  });
}

function cachedPreview(id, cacheDir) {
  for (const ext of EXTS) {
    const p = path.join(cacheDir, `${id}.${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function missFresh(id, cacheDir) {
  try {
    return Date.now() - fs.statSync(path.join(cacheDir, `${id}.miss`)).mtimeMs < MISS_TTL_MS;
  } catch {
    return false;
  }
}

function writeMiss(id, cacheDir) {
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, `${id}.miss`), String(Date.now()));
  } catch {
    /* 忽略 */
  }
}

/**
 * 用 Steam 公开接口批量取条目信息（不需要 API Key）。
 * 返回 Map<id, {...}>。
 * 请求整体失败时返回的 Map 里就没有对应 id —— 调用方据此区分「暂时失败」与「确实没有封面」。
 *
 * withDescription=true 时会一并取回工坊描述（每条可能有几千字，批量拉会明显变大，按需开启）。
 */
async function fetchDetails(ids, options = {}) {
  const { withDescription = false } = options;
  const out = new Map();
  const list = Array.from(new Set((ids || []).map(String).filter(Boolean)));

  for (let i = 0; i < list.length; i += API_BATCH) {
    const chunk = list.slice(i, i + API_BATCH);
    const body =
      `itemcount=${chunk.length}&` +
      chunk.map((id, k) => `publishedfileids[${k}]=${encodeURIComponent(id)}`).join('&');

    let json;
    try {
      const res = await request('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      });
      json = JSON.parse(res.buf.toString('utf8'));
    } catch {
      continue; // 这一批拿不到就跳过，不写负面缓存
    }

    const details = (json && json.response && json.response.publishedfiledetails) || [];
    for (const d of details) {
      const base = {
        result: d.result,
        title: d.title || null,
        previewUrl: d.preview_url || null,
        timeUpdated: d.time_updated || null,
        fileSize: d.file_size || null,
        // 这些本来就在返回里，顺手带上：分类、热度、状态
        tags: Array.isArray(d.tags) ? d.tags.map((t) => t && t.tag).filter(Boolean) : [],
        timeCreated: d.time_created || null,
        subscriptions: Number(d.subscriptions) || 0,
        favorited: Number(d.favorited) || 0,
        views: Number(d.views) || 0,
        banned: d.banned === 1 || d.banned === true,
        banReason: d.ban_reason || null
      };
      if (withDescription) base.description = d.description || null;
      out.set(String(d.publishedfileid), base);
    }
  }
  return out;
}

/**
 * 用 `IPublishedFileService/GetDetails` 取**本地化**的标题与描述。
 *
 * 为什么需要它：老接口 `ISteamRemoteStorage/GetPublishedFileDetails` **没有 language 参数**，
 * 永远返回作者写的基础语言（基本是英文）；而玩家在 Steam 客户端/页面里看到的是本地化版本。
 * 这就是「管理器显示英文、Steam 显示中文」的原因。
 *
 * 实测（2026-09-16，language=6 简体中文）：
 * ```
 *   Soundproof Walls 2.0   默认 7493 字/0 中文   →  简中 3341 字/1920 中文
 *   Press R to Reload      默认 3445 字/0 中文   →  简中 1986 字/572 中文（标题也变成「按R换弹」）
 *   Barotraumatic          默认 5526 字/0 中文   →  简中 3189 字/1659 中文
 * ```
 * 没有中文版的条目会退回基础语言（LuaCs 就是），所以可以放心优先用它。
 * 代价：这个接口要 key（没 key 直接 403），没配 key 时只能退回老接口。
 */
async function fetchLocalizedDetails(ids, options = {}) {
  const { key, language = 6 } = options;
  const out = new Map();
  const list = Array.from(new Set((ids || []).map(String).filter(Boolean)));
  if (!key) return out;

  for (let i = 0; i < list.length; i += API_BATCH) {
    const chunk = list.slice(i, i + API_BATCH);
    const qs =
      `key=${encodeURIComponent(key)}&language=${encodeURIComponent(language)}` +
      chunk.map((id, k) => `&publishedfileids[${k}]=${encodeURIComponent(id)}`).join('');
    let json;
    try {
      const res = await request(
        `https://api.steampowered.com/IPublishedFileService/GetDetails/v1/?${qs}`,
        { headers: { Accept: 'application/json' } }
      );
      json = JSON.parse(res.buf.toString('utf8'));
    } catch {
      continue; // 这一批拿不到就跳过，交给调用方退回老接口
    }
    const details = (json && json.response && json.response.publishedfiledetails) || [];
    for (const d of details) {
      if (!d || !d.publishedfileid) continue;
      out.set(String(d.publishedfileid), {
        result: d.result,
        title: d.title || null,
        previewUrl: d.preview_url || null,
        timeUpdated: d.time_updated || null,
        fileSize: d.file_size || null,
        tags: Array.isArray(d.tags) ? d.tags.map((t) => t && t.tag).filter(Boolean) : [],
        timeCreated: d.time_created || null,
        subscriptions: Number(d.subscriptions) || 0,
        favorited: Number(d.favorited) || 0,
        views: Number(d.views) || 0,
        banned: d.banned === 1 || d.banned === true,
        banReason: d.ban_reason || null,
        description: d.file_description || d.description || null,
        /** 标记一下：这份是本地化过的（界面上可以据此说明） */
        localized: true
      });
    }
  }
  return out;
}

/**
 * 取单个 mod 的工坊详情（描述 / 标签 / 热度），带本地缓存。
 * 缓存 7 天；网络失败时退回旧缓存，实在没有就返回 null。
 *
 * 配了 Steam Web API Key 时优先用 GetDetails 拿**本地化（中文）**描述；没配就退回老接口。
 */
async function getWorkshopDetails(id, cacheDir, options = {}) {
  const key = String(id || '').trim();
  if (!key) return null;
  const apiKey = options.apiKey ? String(options.apiKey) : '';
  const language = options.language == null ? 6 : options.language;

  const file = path.join(cacheDir, `${key}.json`);
  const readCache = () => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return null;
    }
  };

  const cached = readCache();
  const fresh = cached && Date.now() - (cached.fetchedAt || 0) < 7 * 24 * 60 * 60 * 1000;
  // 有 key 但缓存是「没本地化过」的那份 → 重新拉，否则会一直显示英文
  const cacheUsable = fresh && (!apiKey || cached.lang === language);
  if (cacheUsable && !options.force) return cached;

  try {
    let d = null;
    if (apiKey) {
      const map = await fetchLocalizedDetails([key], { key: apiKey, language });
      d = map.get(key) || null;
    }
    if (!d) {
      const map = await fetchDetails([key], { withDescription: true });
      d = map.get(key) || null;
    }
    if (!d) return cached; // 拿不到就退回旧缓存（可能为 null）
    const out = { id: key, ...d, lang: apiKey ? language : null, fetchedAt: Date.now() };
    // 写缓存单独 try：**写不进去也不能丢掉刚取到的新数据**
    // （之前整个 try 一起包着，缓存目录不可写时会静默退回旧缓存，问题很难查）
    try {
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(out), 'utf8');
    } catch {
      /* 忽略：本次照常返回新数据，下次再试写 */
    }
    return out;
  } catch {
    return cached;
  }
}

function extFromContentType(ct, url) {
  const t = String(ct || '').toLowerCase();
  if (t.includes('image/png')) return 'png';
  if (t.includes('image/webp')) return 'webp';
  if (t.includes('image/gif')) return 'gif';
  if (t.includes('image/jpeg') || t.includes('image/jpg')) return 'jpg';
  const em = String(url || '').match(/\.(png|jpe?g|gif|webp)(?:\?|$)/i);
  if (em) return em[1].toLowerCase().replace('jpeg', 'jpg');
  return 'jpg';
}

/** 下载封面到缓存目录，返回本地路径；失败返回 null（不写负面缓存） */
async function downloadPreview(id, previewUrl, cacheDir) {
  const hit = cachedPreview(id, cacheDir);
  if (hit) return hit;
  try {
    const res = await request(previewUrl);
    const ext = extFromContentType(res.headers['content-type'], previewUrl);
    fs.mkdirSync(cacheDir, { recursive: true });
    const out = path.join(cacheDir, `${id}.${ext}`);
    fs.writeFileSync(out, res.buf);
    try {
      fs.unlinkSync(path.join(cacheDir, `${id}.miss`));
    } catch {
      /* 忽略 */
    }
    return out;
  } catch {
    return null;
  }
}

/** 简单的并发限流队列 */
function createQueue(concurrency, delayMs) {
  const q = [];
  let active = 0;

  function pump() {
    if (active >= concurrency || q.length === 0) return;
    active++;
    const job = q.shift();
    Promise.resolve()
      .then(job.fn)
      .then(job.resolve, job.reject)
      .finally(() => {
        active--;
        setTimeout(pump, delayMs);
      });
  }

  return function push(fn) {
    return new Promise((resolve, reject) => {
      q.push({ fn, resolve, reject });
      pump();
    });
  };
}

/**
 * 仅供测试：临时把 https 换成假实现，跑完自动还原。
 * 用来验证"主域名失败时会改用备用域名"这条真实行为（而不是只测工具函数）。
 */
async function __withHttps(fake, fn) {
  const real = https;
  try {
    // eslint-disable-next-line no-global-assign
    https = fake;
    return await fn();
  } finally {
    // eslint-disable-next-line no-global-assign
    https = real;
  }
}

module.exports = {
  request,
  __withHttps,
  fetchDetails,
  fetchLocalizedDetails,
  getWorkshopDetails,
  downloadPreview,
  cachedPreview,
  missFresh,
  writeMiss,
  createQueue
};
