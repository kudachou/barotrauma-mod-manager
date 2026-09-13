const fs = require('node:fs');
const path = require('node:path');

function stripBom(s) {
  return s && s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/** 读取标签里的属性，支持单/双引号，且不会把 gameversion 误匹配成 version */
function attr(tag, name) {
  const re = new RegExp(
    '(?:^|[\\s])' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')',
    'i'
  );
  const m = tag.match(re);
  if (!m) return null;
  return m[1] !== undefined ? m[1] : m[2];
}

/** 解析 mod 根目录下的 filelist.xml */
function parseFilelist(filePath) {
  const raw = stripBom(fs.readFileSync(filePath, 'utf8'));
  const m = raw.match(/<contentpackage\b[^>]*>/i);
  if (!m) return null;
  const tag = m[0];
  return {
    name: attr(tag, 'name'),
    modVersion: attr(tag, 'modversion') || attr(tag, 'version'),
    gameVersion: attr(tag, 'gameversion'),
    steamworkshopid: attr(tag, 'steamworkshopid'),
    expectedhash: attr(tag, 'expectedhash'),
    corepackage: String(attr(tag, 'corepackage') || '').toLowerCase() === 'true'
  };
}

/** 扫描一个 mod 目录（本地或创意工坊） */
function scanDir(source, dir) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const d of entries) {
    if (!d.isDirectory()) continue;
    const folder = d.name;
    const modDir = path.join(dir, folder);
    const filelist = path.join(modDir, 'filelist.xml');
    let info = null;
    if (fs.existsSync(filelist)) {
      try {
        info = parseFilelist(filelist);
      } catch {
        info = null;
      }
    }
    let mtime = null;
    try {
      mtime = fs.statSync(modDir).mtimeMs;
    } catch {
      mtime = null;
    }

    out.push({
      source,
      id: folder,
      folder,
      name: (info && info.name) || folder,
      modVersion: (info && info.modVersion) || null,
      gameVersion: (info && info.gameVersion) || null,
      steamworkshopid: (info && info.steamworkshopid) || null,
      expectedhash: (info && info.expectedhash) || null,
      corepackage: !!(info && info.corepackage),
      /** filelist.xml 绝对路径；没有 filelist 时仍给出预期路径，便于排查 */
      path: filelist,
      counterpart: null,
      categories: [],
      autoCategories: [],
      preview: null,
      mtime,
      usedIn: []
    });
  }
  return out;
}

/**
 * 版本号比较（分段数字，非数字则退回字符串比较）。
 * 段数少的一方按 0 补齐，所以 "2.0" 与 "2.0.0" 视为相同 ——
 * 否则同一版本会被误报成「工坊有更新」。
 */
function compareVersions(a, b) {
  const sa = String(a == null ? '' : a).trim();
  const sb = String(b == null ? '' : b).trim();
  if (!sa || !sb) return null;
  if (sa === sb) return 0;

  const pa = sa.split('.');
  const pb = sb.split('.');
  const len = Math.max(pa.length, pb.length);

  for (let i = 0; i < len; i++) {
    const xa = pa[i] === undefined ? '0' : pa[i];
    const xb = pb[i] === undefined ? '0' : pb[i];
    if (/^\d+$/.test(xa) && /^\d+$/.test(xb)) {
      const d = Number(xa) - Number(xb);
      if (d !== 0) return d < 0 ? -1 : 1;
    } else {
      const c = xa.localeCompare(xb, undefined, { numeric: true });
      if (c !== 0) return c < 0 ? -1 : 1;
    }
  }
  return 0;
}

function statusOf(localVersion, workshopVersion) {
  const c = compareVersions(localVersion, workshopVersion);
  if (c === null) return 'different';
  if (c === 0) return 'same';
  return c < 0 ? 'older' : 'newer';
}

/** 给本地 mod 挂上创意工坊对应版本（靠 filelist.xml 里的 steamworkshopid 精确匹配） */
function attachCounterparts(localMods, workshopMods, installedWorkshopDir) {
  const byId = new Map();
  for (const w of workshopMods) byId.set(w.id, w);

  for (const m of localMods) {
    if (!m.steamworkshopid) continue;
    const w = byId.get(m.steamworkshopid);
    if (!w) continue;
    m.counterpart = {
      id: w.id,
      name: w.name,
      version: w.modVersion,
      status: statusOf(m.modVersion, w.modVersion),
      installed: fs.existsSync(path.join(installedWorkshopDir || '', w.id, 'filelist.xml'))
    };
  }
}

module.exports = {
  stripBom,
  attr,
  parseFilelist,
  scanDir,
  compareVersions,
  statusOf,
  attachCounterparts
};
