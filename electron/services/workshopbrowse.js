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

/**
 * 排序方式 → Steam 的 query_type。
 * 只放实测确认过的值，不猜。
 */
const SORTS = {
  /** 订阅数最多（最"热门"） */
  popular: 12,
  /** 趋势（偏最近上传/活跃） */
  trend: 3,
  /** 最新发布 */
  newest: 1
};

const SORT_LABELS = {
  popular: '最热门（按订阅数）',
  trend: '趋势',
  newest: '最新发布'
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 两次请求之间至少隔这么久，免得被 Steam 掐 */
let lastAt = 0;
const MIN_GAP_MS = 400;

/**
 * 组装 QueryFiles 的 URL。单独拆出来是为了能在自检里断言参数（不联网）。
 */
function buildQueryUrl(params, key) {
  const sort = SORTS[params && params.sort] ? params.sort : 'popular';
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
  if (params && params.tag) q.set('requiredtags[0]', String(params.tag));
  if (params && params.days) q.set('days', String(Math.max(1, Number(params.days) || 1)));

  return { url: `${ENDPOINT}?${q.toString()}`, sort, search, page, numPerPage };
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
  const getJson =
    deps.getJson ||
    (async (url) => {
      const gap = Date.now() - lastAt;
      if (gap < MIN_GAP_MS) await sleep(MIN_GAP_MS - gap);
      lastAt = Date.now();
      const res = await request(url, {
        headers: { Accept: 'application/json' },
        // 这是交互式页面：宁可早点失败让用户点「重试」，也别让人对着转圈等一分钟
        timeoutMs: 8000,
        retries: 1
      });
      return JSON.parse(res.buf.toString('utf8'));
    });

  let json;
  try {
    json = await getJson(built.url);
  } catch (e) {
    const msg = String((e && e.message) || e);
    // 带上可操作的说法，而不是把 ECONNRESET / 请求超时 直接甩给用户。
    // 注意：国内不开加速器时 api.steampowered.com 基本连不上，超时是常态、不是 bug。
    const friendly = /HTTP 403/.test(msg)
      ? 'Steam 拒绝了这个 API Key（可能填错了，或者 Key 已失效）'
      : /HTTP 429/.test(msg)
        ? '请求太频繁，被 Steam 限流了，稍等一下再试'
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
    items: list.map(normalizeItem).filter((x) => x.id)
  };
}

module.exports = {
  browse,
  buildQueryUrl,
  normalizeItem,
  SORTS,
  SORT_LABELS,
  MAX_PER_PAGE,
  APPID
};
