/**
 * 浏览创意工坊：`IPublishedFileService/QueryFiles/v1`。
 *
 * 这是**官方唯一能真正"浏览/搜索"工坊的接口**（老的 `ISteamRemoteStorage/GetPublishedFileDetails`
 * 只能按 id 查，搜不了 —— 隔壁 BaroBaro 的"浏览"就是拿一个写死的 id 数组去查详情，
 * 搜索框只是在已取回的列表上做本地字符串过滤）。
 *
 * ## 实测（2026-09-16，appid 602960，用用户自己的 key）
 *
 * ```
 *   query_type=12（按订阅数）      total=82890   第一名 LuaCsForBarotrauma（686,618 订阅）
 *   query_type=3 （按趋势）        total=82890   偏最近上传的
 *   query_type=11 + search_text    total=1075    （搜 "lua"）
 *   requiredtags[0]=Total conversion  total=1149  标签筛选要数组写法，普通字符串会被忽略
 *   numperpage=101               实际只回 100 条 → 每页上限 100，翻页用 page
 *   totalonly=true               只回 {"total":82890}
 * ```
 *
 * 三个坑：
 *  1. **必须带 key**，不带是 403 —— 所以没配 key 时界面得明确提示去"设置"里填。
 *  2. **必须显式带 `return_metadata=true`**，否则订阅数/收藏/标签/预览图全是 undefined。
 *  3. 连发请求会被掐（ECONNRESET），所以要限速 + 退避重试。
 */
const { request } = require('./steam');

const APPID = 602960;
const ENDPOINT = 'https://api.steampowered.com/IPublishedFileService/QueryFiles/v1/';
/** 每页上限就是 100，写大了 Steam 也只给 100 */
const MAX_PER_PAGE = 100;
/** 标签筛选最多同时选几个（多个是 AND 关系，选太多容易筛到空） */
const MAX_TAGS = 3;

/**
 * 排序方式 → Steam 的 query_type。
 *
 * 这几个值是**把 0~24 全试一遍、按返回结果的排序方向反推出来的**（2026-09-16 实测）：
 *   12 订阅降序            → LuaCsForBarotrauma 686,617 订阅排第一
 *    0 评分/口碑（非简单数值排序）→ 也是 LuaCs 第一，但第二三名和订阅榜不同
 *    3 趋势（偏最近活跃）
 *   21 **更新时间降序**     → 这个才是"最近更新"，一开始漏了它
 *    1 创建时间降序        → "最新发布"
 * 其余值要么没数据（2/8/15/16/20 total=0），要么只是上面某个的别名。
 */
const SORTS = {
  popular: 12,
  top: 0,
  trend: 3,
  updated: 21,
  newest: 1
};

const SORT_LABELS = {
  popular: '最热门',
  top: '口碑最好',
  trend: '趋势',
  updated: '最近更新',
  newest: '最新发布'
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 两次请求之间至少隔这么久，免得被 Steam 掐 */
let lastAt = 0;
const MIN_GAP_MS = 400;

/**
 * 真正发请求：限速 + 短超时 + 一次重试。
 * 这是交互式页面：宁可早点失败让用户点「重试」，也别让人对着转圈等一分钟。
 */
async function defaultGetJson(url) {
  const gap = Date.now() - lastAt;
  if (gap < MIN_GAP_MS) await sleep(MIN_GAP_MS - gap);
  lastAt = Date.now();
  const res = await request(url, {
    headers: { Accept: 'application/json' },
    /*
     * 8 秒：正常请求 1~3 秒就回来了，等更久只说明这个域名/这个请求有问题
     *（实测某个排序+页大小的组合要 57 秒），早点失败让上层去试备用域名更好。
     */
    timeoutMs: 8000,
    retries: 1
  });
  return JSON.parse(res.buf.toString('utf8'));
}

/**
 * 组装 QueryFiles 的 URL。单独拆出来是为了能在自检里断言参数（不联网）。
 */
function buildQueryUrl(params, key) {
  // 注意别用 SORTS[x] 的真假来判有效 —— 「口碑最好」的 query_type 就是 0，是 falsy，
  // 那样写会把它当成无效值悄悄退回「最热门」。
  const wanted = params && params.sort;
  const sort = Object.prototype.hasOwnProperty.call(SORTS, String(wanted)) ? String(wanted) : 'popular';
  const search = String((params && params.search) || '').trim();
  const page = Math.max(1, Math.floor(Number((params && params.page) || 1)) || 1);
  const perRaw = Math.floor(Number((params && params.numPerPage) || 24)) || 24;
  const numPerPage = Math.min(MAX_PER_PAGE, Math.max(1, perRaw));

  const q = new URLSearchParams();
  q.set('key', key);
  q.set('appid', String(APPID));
  q.set('page', String(page));
  q.set('numperpage', String(numPerPage));
  // 有搜索词时只能走文本搜索（query_type=11），这是 Steam 的限制
  q.set('query_type', String(search ? 11 : SORTS[sort]));
  if (search) q.set('search_text', search);
  // 不带这个就没有订阅数/收藏/标签/预览图
  q.set('return_metadata', 'true');
  // 标签筛选必须是数组写法 requiredtags[0]=X（普通字符串会被 Steam 当没写）；
  // 多个标签是 **AND** 关系，所以最多让选 3 个，免得筛到空
  for (const [i, t] of normalizeTags(params && params.tags).entries()) {
    q.set(`requiredtags[${i}]`, t);
  }
  if (params && params.days) q.set('days', String(Math.max(1, Number(params.days) || 1)));

  return { url: `${ENDPOINT}?${q.toString()}`, sort, search, page, numPerPage, tags: normalizeTags(params && params.tags) };
}

/** 标签统一成去重、去空、最多 3 个的数组 */
function normalizeTags(tags) {
  const list = Array.isArray(tags) ? tags : tags ? [tags] : [];
  const out = [];
  for (const t of list) {
    const s = String(t == null ? '' : t).trim();
    if (s && !out.includes(s) && out.length < MAX_TAGS) out.push(s);
  }
  return out;
}

/** 把接口返回的一坨字段收敛成界面要用的几个 */
function normalizeItem(d) {
  const tags = Array.isArray(d.tags) ? d.tags.map((t) => t && t.tag).filter(Boolean) : [];
  return {
    id: String(d.publishedfileid || ''),
    title: String(d.title || '(无标题)'),
    previewUrl: String(d.preview_url || '').trim() || null,
    subscriptions: Number(d.subscriptions || 0),
    favorited: Number(d.favorited || 0),
    views: Number(d.views || 0),
    /** 秒 */
    timeUpdated: Number(d.time_updated || 0),
    fileSize: Number(d.file_size || 0),
    tags,
    /** 工坊页面地址（点「订阅」用的就是它） */
    pageUrl: `https://steamcommunity.com/sharedfiles/filedetails/?id=${d.publishedfileid}`
  };
}

/**
 * 查一页工坊条目。
 *
 * @param {object} params { sort, search, page, numPerPage, tag, days }
 * @param {object} deps   { key, getJson }
 *   - `key` 必须由调用方传入（index.js 从 userDataDir() 里读），这个模块不认识 userData 在哪
 *   - `getJson` 可注入，方便离线自检
 * @returns {Promise<object>} { needsKey } 或 { total, page, numPerPage, items, ... }
 */
async function browse(params, deps = {}) {
  const key = String((deps && deps.key) || '').trim();
  if (!key) {
    // 没 key 时 QueryFiles 直接 403，别让界面看到一个莫名其妙的报错
    return { needsKey: true, items: [], total: 0, page: 1, numPerPage: 0, error: null };
  }

  const built = buildQueryUrl(params, key);
  const getJson = deps.getJson || defaultGetJson;

  let json;
  try {
    json = await getJson(built.url);
  } catch (e) {
    const msg = String((e && e.message) || e);
    // 带上可操作的说法，而不是把 ECONNRESET / 请求超时 直接甩给用户。
    // 注意：国内不开加速器时 api.steampowered.com 基本连不上，超时是常态、不是 bug。
    // 5xx 单独说：那通常是加速器**只代理了 steamcommunity、没代理 API 域名** ——
    // 浏览器能打开工坊页但这里报 503 就是这种情形（详见 steamapi.js 的实测表格）。
    const friendly = /HTTP 403/.test(msg)
      ? 'Steam 拒绝了这个 API Key（可能填错了，或者 Key 已失效）'
      : /HTTP 429/.test(msg)
        ? '请求太频繁，被 Steam 限流了，稍等一下再试'
        : /HTTP 5\d\d/.test(msg)
          ? 'Steam 的 API 入口拒绝了请求（HTTP ' +
            (msg.match(/HTTP (\d+)/) || [])[1] +
            '）—— 连不上 Steam。' +
            '这种错常见于加速器只代理了 steamcommunity.com、没代理 api.steampowered.com：' +
            '浏览器能打开创意工坊，但管理器走的是 Web API。已自动试过备用入口仍失败，' +
            '把加速器切成全局/系统代理模式，或等一会儿再试'
          : /请求超时|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up|ECONNREFUSED|fetch failed/i.test(
                msg
              )
            ? '连不上 Steam —— 国内通常需要开加速器/代理。确认浏览器能打开 steamcommunity.com 之后再试'
            : `读取失败：${msg}`;
    return {
      needsKey: false,
      items: [],
      total: 0,
      page: built.page,
      numPerPage: built.numPerPage,
      error: friendly
    };
  }

  const r = (json && json.response) || {};
  const list = Array.isArray(r.publishedfiledetails) ? r.publishedfiledetails : [];
  return {
    needsKey: false,
    error: null,
    total: Number(r.total || 0),
    page: built.page,
    numPerPage: built.numPerPage,
    sort: built.sort,
    search: built.search,
    tags: built.tags,
    items: list.map(normalizeItem).filter((x) => x.id)
  };
}

/* ------------------------------ 分类标签 ------------------------------ */

/*
 * 工坊上到底有哪些分类标签？**不硬编码**：直接抓几页结果把标签统计出来。
 * 好处是以后 Steam 那边加/改标签，这里自动跟上；代价是每次要 3 个请求（缓存 6 小时）。
 * 实测（2026-09-16）统计出 23 个：Item / Submarine / Art / Total conversion / Item assembly /
 * Mission / Environment / Monster / Event set / Client-side / Equipment / QOL / Server-side /
 * Weapons / Gameplay mechanics / Medical / Language / Wreck / Game mode / Outpost /
 * Beacon station / Library / Ruin。
 */
const TAGS_TTL_MS = 6 * 60 * 60 * 1000;
const TAG_SCAN_SORTS = [12, 3, 1]; // 订阅榜 + 趋势 + 最新，覆盖面比只扫一个榜大
/**
 * 标签扫描每页取多少。
 *
 * **不要写 100**：实测 `numperpage=100` + 订阅榜（query_type=12）这一组合，
 * 同样 479KB 的响应要 **57 秒**才回来（其它排序、其它页大小都是 1~3 秒），
 * 于是标签页看起来就是"卡住/报连不上"。50 稳定在 1.3~2.4 秒，
 * 3 个榜 × 50 条 = 150 条样本，统计出来的标签完全够用。
 */
const TAG_SCAN_PER_PAGE = 50;

let tagCache = { at: 0, key: '', tags: [] };

async function browseTags(deps = {}) {
  const key = String((deps && deps.key) || '').trim();
  if (!key) return { needsKey: true, tags: [], error: null };

  const now = Date.now();
  if (deps.getJson === undefined && tagCache.tags.length && now - tagCache.at < TAGS_TTL_MS) {
    return { needsKey: false, tags: tagCache.tags, error: null, cached: true };
  }

  const getJson = deps.getJson || defaultGetJson;
  const counts = new Map();
  try {
    for (const t of TAG_SCAN_SORTS) {
      const built = buildQueryUrl({ sort: byQueryType(t), page: 1, numPerPage: TAG_SCAN_PER_PAGE }, key);
      const json = await getJson(built.url);
      const list = ((json && json.response) || {}).publishedfiledetails || [];
      for (const d of list) {
        for (const tag of d.tags || []) {
          const name = String((tag && tag.tag) || '').trim();
          if (name) counts.set(name, (counts.get(name) || 0) + 1);
        }
      }
    }
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (tagCache.tags.length) return { needsKey: false, tags: tagCache.tags, error: null, cached: true };
    return {
      needsKey: false,
      tags: [],
      error: /请求超时|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND/i.test(msg)
        ? '连不上 Steam —— 确认加速器/代理开着'
        : `读取分类失败：${msg}`
    };
  }

  const tags = [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

  if (tags.length) tagCache = { at: now, key, tags };
  return { needsKey: false, tags, error: null };
}

/** 由 query_type 反查排序名（扫描标签时用） */
function byQueryType(t) {
  for (const [name, v] of Object.entries(SORTS)) if (v === t) return name;
  return 'popular';
}

module.exports = {
  browse,
  browseTags,
  buildQueryUrl,
  normalizeItem,
  normalizeTags,
  SORTS,
  SORT_LABELS,
  MAX_PER_PAGE,
  MAX_TAGS,
  APPID
};
