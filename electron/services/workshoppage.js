/**
 * 工坊条目页面里的图片（封面 + 截图画廊）。
 *
 * 为什么不用 API：`ISteamRemoteStorage/GetPublishedFileDetails` 只给一张 `preview_url`，
 * 没有截图。截图只在**页面 HTML** 里，而且好消息是**不用跑 JS** —— 页面把全尺寸 URL
 * （`?imw=5000&imh=5000&…&letterbox=false`）和中尺寸缩略图（`imw=637&imh=358`）
 * 都直接写在 HTML 里了（2026-09-16 实测 LuaCsForBarotrauma 的页面，23 个图片 URL）。
 *
 * 所以做法是：把页面里所有 `images.steamusercontent.com/ugc/<数字>/<哈希>/` 的基础地址
 * 抽出来去重，再按需要拼上尺寸参数 —— 这样与页面用的哪种缩略图无关。
 */
const fs = require('node:fs');
const path = require('node:path');
const { fetchText } = require('./workshopsync');

/** 图片基础地址：images.steamusercontent.com/ugc/<数字>/<哈希>/ */
const UGC_RE = /https:\/\/images\.steamusercontent\.com\/ugc\/\d+\/[0-9A-Fa-f]+\//g;

/** 页面自己用的两种尺寸（照着抄，保证参数一定被接受） */
const DISPLAY_PARAMS = '?imw=637&imh=358&ima=fit&impolicy=Letterbox&imcolor=%23000000&letterbox=true';
const FULL_PARAMS = '?imw=5000&imh=5000&ima=fit&impolicy=Letterbox&imcolor=%23000000&letterbox=false';

/**
 * 从页面 HTML 里抽出图片。纯函数，方便离线自检。
 * @returns {{cover:string|null, screenshots:{thumb:string, full:string}[]}}
 */
function extractMedia(html) {
  const text = String(html || '');
  const bases = [];
  for (const m of text.matchAll(UGC_RE)) {
    const base = m[0];
    if (!bases.includes(base)) bases.push(base);
  }
  const shots = bases.map((b) => ({ thumb: b + DISPLAY_PARAMS, full: b + FULL_PARAMS }));
  return {
    // 第一张就是封面（页面主图在画廊最前面；没有画廊时它也至少有一张）
    cover: shots.length ? shots[0].full : null,
    screenshots: shots
  };
}

/** 页面里有没有「找不到这个条目」的痕迹（下架/私有） */
function looksMissing(html) {
  const t = String(html || '');
  return /<title>\s*Steam (社区|Community) ?::? ?错误/i.test(t) || /There was a problem accessing the item/i.test(t);
}

/**
 * 取一个条目的图片，带缓存（默认 7 天）。
 * 网络失败时退回旧缓存；完全没有就返回空列表（界面显示占位图即可，不要报错吓人）。
 */
async function getMedia(id, options = {}) {
  const key = String(id || '').trim();
  if (!/^\d{1,20}$/.test(key)) throw new Error(`非法的工坊 id：${id}`);

  const cacheDir = options.cacheDir || null;
  const file = cacheDir ? path.join(cacheDir, `${key}.json`) : null;
  const readCache = () => {
    if (!file) return null;
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return null;
    }
  };

  const cached = readCache();
  const fresh = cached && Date.now() - (cached.fetchedAt || 0) < 7 * 24 * 60 * 60 * 1000;
  if (fresh && !options.force) return cached;

  const fetchImpl = options.fetchText || fetchText;
  let html;
  try {
    html = await fetchImpl(`https://steamcommunity.com/sharedfiles/filedetails/?id=${key}`, 25000);
  } catch (e) {
    if (cached) return cached;
    return {
      id: key,
      cover: null,
      screenshots: [],
      missing: false,
      error: String((e && e.message) || e),
      fetchedAt: Date.now()
    };
  }

  const media = extractMedia(html);
  const out = { id: key, ...media, missing: looksMissing(html), error: null, fetchedAt: Date.now() };
  if (file && media.screenshots.length) {
    try {
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(out), 'utf8');
    } catch {
      /* 写不进缓存不影响本次返回 */
    }
  }
  return out;
}

module.exports = { extractMedia, looksMissing, getMedia, DISPLAY_PARAMS, FULL_PARAMS };
