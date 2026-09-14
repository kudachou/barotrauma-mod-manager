const fs = require('node:fs');
const path = require('node:path');
const { stripBom } = require('./mods');

function toSlash(p) {
  return String(p).replace(/\\/g, '/');
}

function stamp(d) {
  const t = d || new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return (
    `${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}` +
    `-${p(t.getHours())}${p(t.getMinutes())}${p(t.getSeconds())}`
  );
}

function escapeAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 按游戏自己的写法生成 <contentpackages> 段（沿用原文件的换行风格与缩进） */
function buildContentPackagesBlock(packages, eol, indent) {
  const NL = eol || '\n';
  const I = indent == null ? '  ' : indent;
  const L = [
    `${I}<contentpackages>`,
    `${I}  <!--Vanilla-->`,
    `${I}  <corepackage`,
    `${I}    path="Content/ContentPackages/Vanilla.xml" />`,
    `${I}  <regularpackages>`
  ];
  for (const p of packages) {
    const comment = String(p.comment || '')
      .replace(/--+/g, '-')
      .replace(/[\r\n]+/g, ' ')
      .trim();
    if (comment) L.push(`${I}    <!--${comment}-->`);
    L.push(`${I}    <package`);
    L.push(`${I}      path="${escapeAttr(p.path)}" />`);
  }
  L.push(`${I}  </regularpackages>`);
  L.push(`${I}</contentpackages>`);
  return L.join(NL);
}

const BOM = '\uFEFF';

/**
 * 把合集应用到游戏：只替换 config_player.xml 里的 contentpackages 段，其余设置**逐字节**保留
 * （包括 BOM 和换行风格）。写之前先备份。
 */
function applyToGame(settings, entries) {
  const cfgPath = settings.configPlayerPath;
  if (!cfgPath || !fs.existsSync(cfgPath)) {
    throw new Error(`找不到 config_player.xml：${cfgPath || '(未设置)'}`);
  }

  const buf = fs.readFileSync(cfgPath);
  const hasBom = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  const raw = stripBom(buf.toString('utf8'));
  // 沿用原文件的行尾风格与 <contentpackages> 的缩进，保证区域外一个字节都不动
  const eol = /\r\n/.test(raw) ? '\r\n' : '\n';
  const indentMatch = raw.match(/([ \t]*)<contentpackages>/i);
  const indent = indentMatch ? indentMatch[1] : '  ';

  if (!/<contentpackages>[\s\S]*?<\/contentpackages>/i.test(raw)) {
    throw new Error('config_player.xml 里没有 <contentpackages> 段，已中止（未修改任何文件）');
  }

  const packages = [];
  const missing = [];
  for (const e of entries || []) {
    if (!e) continue;
    if (e.type === 'workshop') {
      if (!e.id) continue;
      const p = path.join(settings.installedWorkshopDir || '', e.id, 'filelist.xml');
      if (!fs.existsSync(p)) missing.push(e.name || `#${e.id}`);
      packages.push({ comment: e.name || `#${e.id}`, path: toSlash(p) });
    } else if (e.type === 'local') {
      if (!e.name) continue;
      const p = path.join(settings.localModsDir || '', e.name, 'filelist.xml');
      if (!fs.existsSync(p)) missing.push(e.name);
      packages.push({ comment: e.name, path: toSlash(p) });
    }
  }

  const block = buildContentPackagesBlock(packages, eol, indent);
  // 连同该行原有的缩进一起替换，避免生成块自带缩进造成重复缩进
  const replaced = raw.replace(/[ \t]*<contentpackages>[\s\S]*?<\/contentpackages>/i, block);
  const out = hasBom ? BOM + replaced : replaced;

  const backup = `${cfgPath}.bak-${stamp()}`;
  fs.copyFileSync(cfgPath, backup);
  fs.writeFileSync(cfgPath, out, 'utf8');

  return { backup, missing, count: packages.length };
}

/**
 * 读取 config_player.xml 里当前**实际生效**的 mod（<contentpackages> 段）。
 *
 * 游戏应用合集时会把路径解析成绝对路径写进去，所以这里从路径反推：
 *   …/WorkshopMods/Installed/<纯数字 id>/filelist.xml → 工坊 mod
 *   …/LocalMods/<文件夹名>/filelist.xml               → 本地 mod
 * 反推只看路径形状，不依赖用户配置的目录位置 —— 他把 LocalMods 挪到别处也照样认得出来。
 */
function readAppliedPackages(settings) {
  const cfgPath = settings && settings.configPlayerPath;
  if (!cfgPath || !fs.existsSync(cfgPath)) {
    return { available: false, entries: [], reason: '找不到 config_player.xml' };
  }

  let raw;
  try {
    raw = stripBom(fs.readFileSync(cfgPath, 'utf8'));
  } catch (e) {
    return { available: false, entries: [], reason: String((e && e.message) || e) };
  }

  const block = raw.match(/<contentpackages>[\s\S]*?<\/contentpackages>/i);
  if (!block) {
    return {
      available: false,
      entries: [],
      reason: 'config_player.xml 里没有 <contentpackages> 段'
    };
  }

  const entries = [];
  const re = /<package\b[^>]*\bpath\s*=\s*"([^"]*)"/gi;
  let m;
  while ((m = re.exec(block[0]))) {
    const p = toSlash(m[1]);
    const parts = p.split('/').filter(Boolean);
    const last = (parts[parts.length - 1] || '').toLowerCase();
    const parent = parts[parts.length - 2] || '';
    if (last === 'filelist.xml' && parent) {
      if (/^\d+$/.test(parent)) entries.push({ type: 'workshop', id: parent });
      else entries.push({ type: 'local', name: parent });
    } else {
      entries.push({ type: 'unknown', path: m[1] });
    }
  }

  return { available: true, entries, reason: null };
}

module.exports = {
  applyToGame,
  buildContentPackagesBlock,
  readAppliedPackages,
  toSlash,
  stamp
};
