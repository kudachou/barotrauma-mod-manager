/**
 * 把工坊描述机器翻译成**当前界面语言**（给作者没提供该语言版本的条目兜底）。
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
 * 超得更快），所以按**字节**切块、逐块翻译再拼接；结果按"文本 + 目标语言"哈希缓存。
 *
 * ## 源语言必须用 `Autodetect`
 *
 * 2026-10-12 实测（`scripts/tmp-probe-mymemory.cjs`）：
 *
 * | langpair | 结果 |
 * | --- | --- |
 * | `Autodetect|en`（中文源） | ✅ 正常翻译 |
 * | `zh-CN|en`（中文源） | ✅ 正常 |
 * | `en|en` | ❌ HTTP 200 但 `responseStatus=403`，正文是 `PLEASE SELECT TWO DISTINCT LANGUAGES` |
 * | `Autodetect|zh-CN`（俄文源） | ✅ 正常 |
 *
 * 原来写死 `en|zh-CN`：① 俄文/日文描述会被当成英文（源语言猜错）；② 一旦目标语言变成 en
 * 就成了 `en|en`，MyMemory 会返回那句报错**当成译文**。所以源固定 `Autodetect`，
 * 并把 `PLEASE SELECT TWO DISTINCT LANGUAGES` 加进"这不是译文"的守卫。
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { request } = require('./steam');

/** 免费接口单请求上限 500 字节，留点余量 */
const MAX_CHUNK_BYTES = 450;
const ENDPOINT = 'https://api.mymemory.translated.net/get';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 支持的目标语言（= 界面语言）。只做中英两种界面，所以只有这两个 */
const TARGETS = ['zh-CN', 'en'];

/** 把界面语言（'zh' | 'en' | 其它）归一成 MyMemory 的 target 码 */
function normalizeTarget(lang) {
  return String(lang || '').toLowerCase().startsWith('en') ? 'en' : 'zh-CN';
}

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

/**
 * 缓存文件名。
 *
 * ⚠️ **必须把目标语言算进 key**：否则英文界面会拿到中文界面缓存的译文（或反过来）——
 * 用户点"翻译成英文"，结果弹出一段中文。
 *
 * 中文目标的文件名保持原样（`<hash>.json`），这样**升级不会让已有缓存失效**；
 * 英文目标用 `<hash>.en.json`。
 */
function cacheFile(dir, text, target = 'zh-CN') {
  const h = crypto.createHash('sha1').update(String(text)).digest('hex').slice(0, 16);
  return path.join(dir, target === 'en' ? `${h}.en.json` : `${h}.json`);
}

/** MyMemory 请求 URL（源语言固定 Autodetect，理由见文件头） */
function mymemoryUrl(chunk, target) {
  return `${ENDPOINT}?langpair=${encodeURIComponent(`Autodetect|${target}`)}&q=${encodeURIComponent(chunk)}`;
}

/**
 * 把文本翻成目标语言（默认中文）。
 *
 * @param {string} text
 * @param {object} deps { target, cacheDir, onProgress, translateChunk } —— 后两个可注入，方便离线自检
 * @returns {Promise<{ok:boolean, text:string, cached?:boolean, error?:string, chunks?:number}>}
 */
async function translateText(text, deps = {}) {
  const target = TARGETS.includes(deps.target) ? deps.target : 'zh-CN';
  const src = String(text || '');
  if (!src.trim()) return { ok: true, text: '', chunks: 0 };

  const cacheDir = deps.cacheDir || null;
  const file = cacheDir ? cacheFile(cacheDir, src, target) : null;
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
      const res = await request(mymemoryUrl(chunk, target), {
        headers: { Accept: 'application/json' },
        timeoutMs: 20000,
        retries: 1
      });
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
      // MyMemory 超配额时返回的是一段警告文本，不是译文 —— 得认出来，别当成翻译结果。
      // `PLEASE SELECT TWO DISTINCT LANGUAGES` 是源=目标（例如 en|en）时的报错，
      // 曾经会因为写死 `en|zh-CN` 而恰好在这一版变成真问题。
      if (/MYMEMORY WARNING|QUOTA|QUERY LENGTH LIMIT|TWO DISTINCT LANGUAGES/i.test(t)) {
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
      fs.writeFileSync(
        file,
        JSON.stringify({ text: out, chunks: chunks.length, target, at: Date.now() }),
        'utf8'
      );
    } catch {
      /* 写不进缓存不影响本次返回 */
    }
  }
  if (typeof deps.onProgress === 'function') deps.onProgress(chunks.length, chunks.length);
  return { ok: true, text: out, chunks: chunks.length };
}

/** 兼容旧名字：翻成中文（等价于 `translateText(text, { target: 'zh-CN' })`） */
function translateToChinese(text, deps = {}) {
  return translateText(text, { ...deps, target: 'zh-CN' });
}

module.exports = {
  translateText,
  translateToChinese,
  normalizeTarget,
  cacheFile,
  mymemoryUrl,
  chunkByBytes,
  looksChinese,
  chineseRatio,
  TARGETS,
  MAX_CHUNK_BYTES
};
