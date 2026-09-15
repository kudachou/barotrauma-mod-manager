/**
 * 合集的**导入 / 导出**（联机时把整套 mod 配置发给朋友）。
 *
 * 三种导出形态各有用途：
 *
 * | 形态 | 谁能用 | 说明 |
 * | --- | --- | --- |
 * | `.xml` | **不需要本管理器** | 就是游戏自己的 `ModLists\*.xml`，丢进 `ModLists` 文件夹即可 |
 * | `.json` | 用本管理器的朋友 | 带名字/版本/工坊链接，信息最全（未订阅的 mod 也留着名字） |
 * | 文本 | 贴聊天里 | 每个工坊 mod 一行、带工坊链接，朋友点开就能订阅 |
 *
 * 导入接受这三种（文件或粘贴的文本）。工坊 id 用 `id=数字` 或独立的数字串识别，
 * 所以哪怕朋友只是把一串 id 粘过来也能用。
 */
const fs = require('node:fs');
const path = require('node:path');
const { parseModlistText, serializeModlist } = require('./modlists');
const { fetchDetails } = require('./steam');

const FORMAT = 'bmm-modlist';
const FORMAT_VERSION = 1;

const workshopUrl = (id) => `https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`;

/** 导出的文本（贴聊天用）：每个工坊 mod 一行，带链接 */
function buildText(name, entries, meta = {}) {
  const list = (entries || []).filter(Boolean);
  const ws = list.filter((e) => e.type === 'workshop' && e.id);
  const local = list.filter((e) => e.type === 'local' && e.name);
  const lines = [];
  lines.push(`【潜渊症合集】${name}`);
  if (meta.note) lines.push(meta.note);
  lines.push(`共 ${list.length} 个 mod（工坊 ${ws.length} 个 · 本地 ${local.length} 个）`);
  lines.push('');
  if (ws.length) {
    lines.push('—— 工坊 mod（点链接进工坊页面订阅；用潜渊症 Mod 管理器可以直接导入本文件）——');
    for (const e of ws) lines.push(`${e.id}  ${e.name || ''}`.trimEnd() + `  ${workshopUrl(e.id)}`);
    lines.push('');
  }
  if (local.length) {
    lines.push('—— 本地 mod（不在工坊上，需要对方自己拷给你）——');
    for (const e of local) lines.push(String(e.name));
  }
  return lines.join('\n').trimEnd() + '\n';
}

/** 导出的 JSON（用本管理器的朋友导入时信息最全） */
function buildJson(name, entries, meta = {}) {
  const list = (entries || []).filter(Boolean).map((e) =>
    e.type === 'workshop'
      ? { type: 'workshop', id: String(e.id || ''), name: e.name || null, url: e.id ? workshopUrl(e.id) : null }
      : { type: 'local', name: e.name || null }
  );
  return JSON.stringify(
    {
      format: FORMAT,
      version: FORMAT_VERSION,
      name,
      note: meta.note || null,
      exportedAt: new Date().toISOString(),
      game: 'Barotrauma',
      count: list.length,
      entries: list
    },
    null,
    2
  );
}

/** 导出的 XML：就是游戏原生格式，朋友不装本管理器也能用 */
function buildXml(name, entries) {
  return serializeModlist(name, entries);
}

/**
 * 解析要导入的内容（自动认出 XML / JSON / 纯文本粘贴）。
 * @returns {{format:'xml'|'json'|'text', name:string, entries:Array, note:string|null}}
 */
function parseShared(raw, fallbackName) {
  const text = String(raw == null ? '' : raw);
  if (!text.trim()) throw new Error('内容是空的');

  // 1) 游戏原生的合集 XML
  if (/<mods\b/i.test(text)) {
    const ml = parseModlistText(text, fallbackName);
    if (!ml.entries.length) throw new Error('这个合集文件里没有 mod 条目');
    return { format: 'xml', name: ml.name, entries: ml.entries, note: null };
  }

  // 2) 本管理器导出的 JSON
  if (/^\s*[{[]/.test(text)) {
    let j = null;
    try {
      j = JSON.parse(text);
    } catch {
      throw new Error('看起来是 JSON，但解析失败');
    }
    if (!j || j.format !== FORMAT || !Array.isArray(j.entries)) {
      throw new Error('这个 JSON 不是潜渊症 Mod 管理器导出的合集');
    }
    const entries = j.entries
      .map((e) =>
        e && e.type === 'workshop' && e.id
          ? { type: 'workshop', id: String(e.id), name: e.name || null }
          : e && e.type === 'local' && e.name
            ? { type: 'local', name: String(e.name) }
            : null
      )
      .filter(Boolean);
    if (!entries.length) throw new Error('这个合集里没有 mod 条目');
    return { format: 'json', name: j.name || fallbackName || '导入的合集', entries, note: j.note || null };
  }

  // 3) 纯文本：从每行里挖 id（id=123 / 123 开头 / 链接里的 id=123），顺手把名字也捞出来
  const entries = [];
  const seen = new Set();
  for (const line0 of text.split(/\r?\n/)) {
    const line = line0.trim();
    if (!line) continue;
    let id = null;
    let name = null;

    const urlM = line.match(/[?&]id=(\d{5,20})/i);
    const kvM = line.match(/\bid\s*[=:]\s*(\d{5,20})/i);
    const bareM = line.match(/^(\d{5,20})\b/);
    if (kvM) id = kvM[1];
    else if (urlM) id = urlM[1];
    else if (bareM) id = bareM[1];
    else continue;

    if (seen.has(id)) continue;
    seen.add(id);

    // 名字：去掉 id、链接和常见前缀之后剩下的那截
    name =
      line
        .replace(/https?:\/\/\S+/gi, '')
        .replace(new RegExp(`\\bid\\s*[=:]\\s*${id}`, 'i'), '')
        .replace(new RegExp(`^\\s*${id}\\b`), '')
        .replace(/^[\s\-—–:：|、,.]+/, '')
        .replace(/[\s\-—–:：|、,.]+$/, '')
        .trim() || null;
    if (name && /^[\d\s]+$/.test(name)) name = null;
    entries.push({ type: 'workshop', id, name });
  }
  if (!entries.length) throw new Error('没从这段文字里认出任何工坊 id（需要 5~20 位数字）');
  return { format: 'text', name: fallbackName || '导入的合集', entries, note: null };
}

/** 给认不出名字的工坊条目补上标题（尽力而为，失败就留空） */
async function fillNames(entries, deps = {}) {
  const need = (entries || []).filter((e) => e.type === 'workshop' && e.id && !e.name);
  if (!need.length) return entries;
  const fetchImpl = deps.fetchDetails || fetchDetails;
  try {
    const map = await fetchImpl(need.map((e) => e.id));
    for (const e of need) {
      const d = map.get(String(e.id));
      if (d && d.title) e.name = d.title;
    }
  } catch {
    /* 名字只是显示用，拿不到就留空（界面会显示 #id） */
  }
  return entries;
}

/** 导出的默认文件名（去掉路径非法字符） */
function suggestFileName(name, ext) {
  const base =
    String(name || '合集')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim() || '合集';
  return `${base}.${ext}`;
}

/** 导入时避免覆盖已有合集：foo.xml 已存在就变成 foo (2).xml */
function uniqueFileName(dir, fileName) {
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  let candidate = fileName;
  for (let i = 2; fs.existsSync(path.join(dir, candidate)) && i < 1000; i++) {
    candidate = `${base} (${i})${ext}`;
  }
  return candidate;
}

module.exports = {
  buildText,
  buildJson,
  buildXml,
  parseShared,
  fillNames,
  suggestFileName,
  uniqueFileName,
  workshopUrl,
  FORMAT,
  FORMAT_VERSION
};
