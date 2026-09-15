const fs = require('node:fs');
const path = require('node:path');
const { stripBom } = require('./mods');

const HEADER = '<?xml version="1.0" encoding="utf-8"?>';

function xmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 反向：把实体还原（导入别人分享的合集时要读名字） */
function xmlUnescape(s) {
  return String(s == null ? '' : s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');
}

/** 只允许纯文件名，防目录穿越 */
function resolveFile(dir, fileName) {
  const name = String(fileName == null ? '' : fileName);
  if (!name || name !== path.basename(name) || /[\\/]/.test(name)) {
    throw new Error(`非法的合集文件名：${name}`);
  }
  return path.join(dir, name);
}

/** 从文本解析合集（导入外部文件 / 粘贴的内容时用，不经过磁盘） */
function parseModlistText(raw, fallbackName) {
  const text = stripBom(String(raw == null ? '' : raw));
  if (!/<mods\b/i.test(text)) throw new Error('不是合集文件');

  const nameM = text.match(/<mods\b[^>]*\bname\s*=\s*"([^"]*)"/i);
  const name = nameM ? xmlUnescape(nameM[1]) : fallbackName || '未命名';

  const entries = [];
  const re = /<(Vanilla|Workshop|Local)\b([^>]*?)(\/?)>/gi;
  let m;
  while ((m = re.exec(text))) {
    const kind = m[1].toLowerCase();
    if (kind === 'vanilla') continue; // Vanilla 固定置顶，不进入可编辑列表
    const attrs = m[2] || '';
    const g = (n) => {
      const r = attrs.match(new RegExp('(?:^|[\\s])' + n + '\\s*=\\s*"([^"]*)"', 'i'));
      return r ? xmlUnescape(r[1]) : null;
    };
    if (kind === 'workshop') entries.push({ type: 'workshop', name: g('name'), id: g('id') });
    else entries.push({ type: 'local', name: g('name') });
  }
  return { name, entries };
}

function parseModlistFile(filePath) {
  const ml = parseModlistText(
    fs.readFileSync(filePath, 'utf8'),
    path.basename(filePath, path.extname(filePath))
  );
  return { fileName: path.basename(filePath), name: ml.name, entries: ml.entries };
}

function serializeModlist(name, entries) {
  const lines = [HEADER, `<mods name="${xmlEscape(name)}">`, '  <Vanilla />'];
  for (const e of entries || []) {
    if (!e) continue;
    if (e.type === 'workshop' && e.id) {
      lines.push(`  <Workshop name="${xmlEscape(e.name || '')}" id="${xmlEscape(e.id)}" />`);
    } else if (e.type === 'local' && e.name) {
      lines.push(`  <Local name="${xmlEscape(e.name)}" />`);
    }
  }
  lines.push('</mods>');
  return lines.join('\n') + '\n';
}

function listModlists(dir) {
  let files;
  try {
    files = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const f of files) {
    if (!f.isFile() || !/\.xml$/i.test(f.name)) continue;
    try {
      const ml = parseModlistFile(path.join(dir, f.name));
      out.push({ fileName: ml.fileName, name: ml.name, count: ml.entries.length });
    } catch {
      // 跳过不是合集的 xml
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  return out;
}

function getModlist(dir, fileName) {
  const p = resolveFile(dir, fileName);
  if (!fs.existsSync(p)) return null;
  return parseModlistFile(p);
}

function saveModlist(dir, fileName, name, entries) {
  const p = resolveFile(dir, fileName);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, serializeModlist(name, entries), 'utf8');
  return { fileName: path.basename(p), name, entries };
}

function deleteModlist(dir, fileName) {
  const p = resolveFile(dir, fileName);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

function sameEntry(a, b) {
  if (!a || !b) return false;
  if (a.type === 'workshop') return b.type === 'workshop' && String(a.id) === String(b.id);
  return b.type === 'local' && a.name === b.name;
}

/** 加入 mod（合集不存在时自动创建） */
function addModToModlist(dir, fileName, name, entry) {
  const p = resolveFile(dir, fileName);
  let list;
  if (fs.existsSync(p)) {
    list = parseModlistFile(p);
  } else {
    list = { fileName: path.basename(p), name: name || path.basename(p, '.xml'), entries: [] };
  }
  if (!list.entries.some((e) => sameEntry(e, entry))) list.entries.push(entry);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, serializeModlist(list.name, list.entries), 'utf8');
  return list;
}

function removeModFromModlist(dir, fileName, entry) {
  const p = resolveFile(dir, fileName);
  if (!fs.existsSync(p)) return null;
  const list = parseModlistFile(p);
  list.entries = list.entries.filter((e) => !sameEntry(e, entry));
  fs.writeFileSync(p, serializeModlist(list.name, list.entries), 'utf8');
  return list;
}

module.exports = {
  listModlists,
  getModlist,
  saveModlist,
  deleteModlist,
  addModToModlist,
  removeModFromModlist,
  parseModlistFile,
  parseModlistText,
  serializeModlist,
  xmlEscape,
  xmlUnescape
};
