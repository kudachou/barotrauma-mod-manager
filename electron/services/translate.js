/**
 * 把工坊描述翻译成中文（给作者没提供中文版的条目兜底）。
 *
 * ## 为什么用 MyMemory
 *
 * 实测（2026-09-16，本机开着加速器）：
 *
 * | 端点 | 结果 |
 * | --- | --- |
 * | `translate.googleapis.com` / `translate.google.com` / `clients5.google.com` | 全部**请求超时** |
 * | `cn.bing.com/ttranslatev3`（非官方网页端点） | HTTP 200 但 `{"statusCode":205}`，试了 cookie + 4 种令牌组合都不行 |
 * | `api.mymemory.translated.net` | **可用** ✓ 无需 key |
 *
 * 所以默认走 MyMemory。它的限制是**每个请求 500 字节**（注意是字节不是字符，中文/表情会
 * 超得更快），所以按**字节**切块、逐块翻译再拼接；结果按文本哈希缓存，同一个描述只翻一次。
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { request } = require('./steam');

/** 免费接口单请求上限 500 字节，留点余量 */
const MAX_CHUNK_BYTES = 450;
const ENDPOINT = 'https://api.mymemory.translated.net/get';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 这段文本像不像中文（用来决定要不要给「翻译」按钮） */
function chineseRatio(text) {
  const s = String(text || '');
  if (!s.trim()) return 0;
  const cjk = (s.match(/[\u4e00-\u9fff]/g) || []).length;
  // 描述里混着 BBCode 和链接，所以按"每 100 个字符里有几个汉字"算更稳
  return cjk / Math.max(1, s.length);
}

function looksChinese(text, threshold = 0.06) {
  return chineseRatio(text) >= threshold;
}

/** 按字节切块（不能让一个多字节字符被切开） */
function chunkByBytes(text, maxBytes = MAX_CHUNK_BYTES) {
  const out = [];
  let cur = '';
  for (const ch of String(text || '')) {
    if (cur && Buffer.byteLength(cur + ch, 'utf8') > maxBytes) {
      out.push(cur);
      cur = ch;
    } else {
      cur += ch;
    }
  }
  if (cur) out.push(cur);
  return out;
}

function cacheFile(dir, text) {
  const h = crypto.createHash('sha1').update(String(text)).digest('hex').slice(0, 16);
  return path.join(dir, `${h}.json`);
}

/**
 * 翻译成中文。
 *
 * @param {string} text
 * @param {object} deps { cacheDir, onProgress, translateChunk } —— 后两个可注入，方便离线自检
 * @returns {Promise<{ok:boolean, text:string, cached?:boolean, error?:string, chunks?:number}>}
 */
async function translateToChinese(text, deps = {}) {
  const src = String(text || '');
  if (!src.trim()) return { ok: true, text: '', chunks: 0 };

  const cacheDir = deps.cacheDir || null;
  const file = cacheDir ? cacheFile(cacheDir, src) : null;
  if (file && !deps.force) {
    try {
      const hit = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (hit && typeof hit.text === 'string' && hit.text) {
        return { ok: true, text: hit.text, cached: true, chunks: hit.chunks || 0 };
      }
    } catch {
      /* 没缓存就照常翻 */
    }
  }

  const chunks = chunkByBytes(src);
  const translateChunk =
    deps.translateChunk ||
    (async (chunk) => {
      const res = await request(
        `${ENDPOINT}?langpair=en|zh-CN&q=${encodeURIComponent(chunk)}`,
        { headers: { Accept: 'application/json' }, timeoutMs: 20000, retries: 1 }
      );
      const j = JSON.parse(res.buf.toString('utf8'));
      return String((j && j.responseData && j.responseData.translatedText) || '');
    });

  const parts = [];
  for (const [i, c] of chunks.entries()) {
    if (typeof deps.onProgress === 'function') deps.onProgress(i, chunks.length);
    try {
      const t = String((await translateChunk(c)) || '');
      // 校验放在这里而不是默认请求函数里：不管译文从哪来，都要过同一道关
      if (!t.trim()) throw new Error('翻译服务没有返回内容');
      // MyMemory 超配额时返回的是一段警告文本，不是译文 —— 得认出来，别当成翻译结果
      if (/MYMEMORY WARNING|QUOTA|QUERY LENGTH LIMIT/i.test(t)) {
        throw new Error('免费翻译额度用完了，过一会儿再试');
      }
      parts.push(t);
    } catch (e) {
      const msg = String((e && e.message) || e);
      return {
        ok: false,
        text: parts.join(''),
        chunks: chunks.length,
        error: /超时|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(msg)
          ? '连不上翻译服务（国内可能需要加速器）'
          : msg.startsWith('免费翻译额度')
            ? msg
            : `翻译失败：${msg}`
      };
    }
    if (i < chunks.length - 1) await sleep(400); // 别把免费接口打急了
  }

  const out = parts.join('');
  if (file && out) {
    try {
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ text: out, chunks: chunks.length, at: Date.now() }), 'utf8');
    } catch {
      /* 写不进缓存不影响本次返回 */
    }
  }
  if (typeof deps.onProgress === 'function') deps.onProgress(chunks.length, chunks.length);
  return { ok: true, text: out, chunks: chunks.length };
}

module.exports = {
  translateToChinese,
  chunkByBytes,
  looksChinese,
  chineseRatio,
  MAX_CHUNK_BYTES
};
