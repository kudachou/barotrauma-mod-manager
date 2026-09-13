const https = require('node:https');
const zlib = require('node:zlib');
const fs = require('node:fs');
const path = require('node:path');

const UA = 'BarotraumaModManager/0.1';

/**
 * 负面缓存只用于「接口明确回答这个条目没有封面」这种确定性结论。
 * 网络错误 / 被限流是暂时的，绝不写负面缓存。
 */
const MISS_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const EXTS = ['jpg', 'png', 'gif', 'webp'];
/** 一次接口请求最多带多少个 id */
const API_BATCH = 50;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function request(urlStr, { method = 'GET', headers = {}, body = null } = {}, attempt = 0) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const h = { 'User-Agent': UA, ...headers };
    if (body) h['Content-Length'] = Buffer.byteLength(body);

    const req = https.request(
      { hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method, headers: h },
      (res) => {
        const code = res.statusCode || 0;

        // 限流 / 服务端抖动：退避重试
        if ((code === 429 || code >= 500) && attempt < 2) {
          res.resume();
          sleep(1000 * (attempt + 1)).then(
            () => resolve(request(urlStr, { method, headers, body }, attempt + 1)),
            reject
          );
          return;
        }

        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          if (code < 200 || code >= 300) {
            reject(new Error('HTTP ' + code));
            return;
          }
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
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('请求超时')));
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
 * 返回 Map<id, { result, title, previewUrl, timeUpdated, fileSize }>。
 * 请求整体失败时返回的 Map 里就没有对应 id —— 调用方据此区分「暂时失败」与「确实没有封面」。
 */
async function fetchDetails(ids) {
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
      out.set(String(d.publishedfileid), {
        result: d.result,
        title: d.title || null,
        previewUrl: d.preview_url || null,
        timeUpdated: d.time_updated || null,
        fileSize: d.file_size || null
      });
    }
  }
  return out;
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

module.exports = {
  fetchDetails,
  downloadPreview,
  cachedPreview,
  missFresh,
  writeMiss,
  createQueue
};
