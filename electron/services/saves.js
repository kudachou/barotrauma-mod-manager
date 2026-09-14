/**
 * 存档（.save）：读出「这个存档当时启用了哪些 mod」。
 *
 * 用真实存档验证过的事实：
 *  - 存档是 **gzip** 压缩的；解压后开头有一小段 UTF-16LE 的文件名（"gamesession.xml"），
 *    之后才是 UTF-8 的 XML。所以要先找 `<?xml` 把前缀切掉。
 *  - 根元素 `<Gamesession>` 上带 `selectedcontentpackagenames="Vanilla|modA|modB|…"`，
 *    就是当时启用的内容包**按加载顺序**排的名字（跟 modlist 里条目对应的 mod 的
 *    contentpackage 名一致 —— 也就是 filelist.xml 根元素的 name）。
 *  - 还带 `savetime`（unix 秒）、`submarine`（潜艇名）、`version`（游戏版本）、`ismultiplayer`。
 *  - 老的 1.11.5 存档也有这些字段，不用特判。
 *
 * 位置：单机存档直接放在存档目录下，多人在 `<存档目录>/Multiplayer/`。
 * 存档目录 = config_player.xml 的 `savepath`；为空时是默认的
 * `%LOCALAPPDATA%\Daedalic Entertainment GmbH\Barotrauma`。
 *
 * 注意：存档里只有**名字**，没有 id、没有路径。所以「按存档启用」只能按名字找 mod，
 * 同名时优先工坊版；找不到的（作者删了 / 改过名）只能如实报出来。
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { stripBom } = require('./mods');
const { parseModlistFile } = require('./modlists');

const GAME_FOLDER = 'Barotrauma';

/**
 * 刻意不 require('./settings')：那个模块会 require('electron')，一旦依赖它，
 * 这个模块就没法在纯 Node 下自检了（跟 detect.js 一样的考虑）。
 */
function localAppData() {
  return (
    process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local')
  );
}

/** 名字比较用的归一化：全角→半角、去首尾空格、忽略大小写 */
function normName(s) {
  return String(s == null ? '' : s)
    .normalize('NFKC')
    .trim()
    .toLowerCase();
}

function decodeXmlEntities(s) {
  return String(s == null ? '' : s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

/* ------------------------------- 存档目录 ------------------------------- */

/** config_player.xml 里的 savepath（空字符串表示用默认位置） */
function savePathSetting(settings) {
  const cfg = settings && settings.configPlayerPath;
  if (!cfg || !fs.existsSync(cfg)) return '';
  try {
    const raw = stripBom(fs.readFileSync(cfg, 'utf8'));
    const tag = raw.match(/<config\b[^>]*>/i);
    const m = tag && tag[0].match(/(?:^|\s)savepath\s*=\s*"([^"]*)"/i);
    return m && m[1] ? m[1].trim() : '';
  } catch {
    return '';
  }
}

/** 可能的存档目录，按可信度排序 */
function saveDirCandidates(settings) {
  const out = [];
  const sp = savePathSetting(settings);
  if (sp) {
    const abs = path.isAbsolute(sp) ? sp : path.resolve((settings && settings.gameDir) || '', sp);
    out.push(abs);
  }
  out.push(path.join(localAppData(), 'Daedalic Entertainment GmbH', GAME_FOLDER));
  const installed = settings && settings.installedWorkshopDir;
  if (installed) {
    // …/<Barotrauma>/WorkshopMods/Installed → …/<Barotrauma>
    out.push(path.dirname(path.dirname(installed)));
  }
  return out.filter((p, i) => p && out.indexOf(p) === i);
}

/**
 * 实际使用的存档目录。
 *
 * 用户显式设了 `savepath` 就**以它为准**（哪怕目录还不存在）—— 不能因为那个目录暂时
 * 不存在就悄悄回退到别处，否则界面会显示成"没有存档"，人会以为存档丢了。
 * 只有默认位置才做存在性回退。
 */
function saveDirOf(settings) {
  const sp = savePathSetting(settings);
  if (sp) {
    return path.isAbsolute(sp) ? sp : path.resolve((settings && settings.gameDir) || '', sp);
  }
  const list = saveDirCandidates(settings);
  return list.find((p) => fs.existsSync(p)) || list[0] || '';
}

/* -------------------------------- 解析 -------------------------------- */

/** 解析一个 .save：返回 null 表示不是能认的存档 */
function parseSave(filePath) {
  let buf;
  try {
    buf = fs.readFileSync(filePath);
  } catch {
    return null;
  }
  let xml;
  try {
    xml = zlib.gunzipSync(buf).toString('utf8');
  } catch {
    // 极少数情况（或被人手动改过）：当成未压缩的 XML 再试一次
    xml = buf.toString('utf8');
  }
  const x = xml.indexOf('<?xml');
  if (x > 0) xml = xml.slice(x);

  const tag = xml.match(/<Gamesession\b[^>]*>/i);
  if (!tag) return null;

  const attr = (n) => {
    const m = tag[0].match(new RegExp(`(?:^|\\s)${n}\\s*=\\s*"([^"]*)"`, 'i'));
    return m ? decodeXmlEntities(m[1]) : null;
  };

  const names = (attr('selectedcontentpackagenames') || '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
  // 第一个永远是内置的 Vanilla，不算 mod
  const mods = names.filter((n) => normName(n) !== 'vanilla');

  const st = Number(attr('savetime') || 0);
  let mtime = 0;
  try {
    mtime = fs.statSync(filePath).mtimeMs;
  } catch {
    /* 忽略 */
  }

  return {
    submarine: attr('submarine') || null,
    gameVersion: attr('version') || null,
    isMultiplayer: String(attr('ismultiplayer') || '').toLowerCase() === 'true',
    saveTime: st > 0 ? st * 1000 : Math.round(mtime),
    mods
  };
}

/** 扫描一个目录下的 *.save */
function listSavesInDir(dir, source) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    if (!e.isFile() || !/\.save$/i.test(e.name)) continue;
    const full = path.join(dir, e.name);
    const parsed = parseSave(full);
    if (!parsed) continue; // 不是能认的存档就别列出来（比如被截断的文件）
    let size = 0;
    try {
      size = e.isFile() ? fs.statSync(full).size : 0;
    } catch {
      /* 忽略 */
    }
    out.push({
      file: e.name,
      path: full,
      name: e.name.replace(/\.save$/i, ''),
      source,
      size,
      ...parsed
    });
  }
  return out;
}

/* -------------------------- 与合集做「完全一致」比较 -------------------------- */

/** contentpackage 名 → mod（同名时优先工坊版：存档是按工坊订阅玩的） */
function buildNameIndex(mods) {
  const byName = new Map();
  for (const m of mods || []) {
    const k = normName(m.name);
    if (!k) continue;
    const cur = byName.get(k);
    if (!cur || (cur.source !== 'workshop' && m.source === 'workshop')) byName.set(k, m);
  }
  return byName;
}

/**
 * 把每个合集折算成一组 contentpackage 名，好跟存档里那串名字比。
 *
 * 合集条目存的是「工坊 id」或「本地文件夹名」，不是 contentpackage 名 ——
 * 必须靠当前装着的 mod 反查。查不到（mod 被删了）就只能退回条目里存的名字。
 */
function modlistNameSets(dir, mods) {
  const byId = new Map();
  const byFolder = new Map();
  for (const m of mods || []) {
    if (m.source === 'workshop') byId.set(String(m.id), m);
    else byFolder.set(String(m.id), m);
  }

  let files;
  try {
    files = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const out = [];
  for (const f of files) {
    if (!f.isFile() || !/\.xml$/i.test(f.name)) continue;
    let ml;
    try {
      ml = parseModlistFile(path.join(dir, f.name));
    } catch {
      continue;
    }
    const names = new Set();
    const entries = [];
    for (const e of ml.entries) {
      let real = null;
      if (e.type === 'workshop') {
        const m = byId.get(String(e.id));
        real = m ? m.name : e.name;
      } else {
        const m = byFolder.get(String(e.name));
        real = m ? m.name : e.name;
      }
      const key = normName(real);
      if (!key) continue;
      names.add(key);
      // label 用 mod 的真名（跟合集页显示的一致）；查不到 mod 时 real 就是条目里存的名字
      entries.push({ label: real, key });
    }
    out.push({ fileName: ml.fileName, name: ml.name, names, entries });
  }
  return out;
}

/* -------------------------------- 对外 -------------------------------- */

/**
 * 列出所有存档，附带「对应哪个合集」和每个 mod 能不能在当前装着的 mod 里找到。
 *
 * @param {object} settings 当前设置
 * @param {Array}  mods     已扫描到的 mod（installedWorkshopDir 里的也算）
 */
function listSaves(settings, mods) {
  const base = saveDirOf(settings);
  const dirs = [
    { dir: base, source: 'single' },
    { dir: path.join(base, 'Multiplayer'), source: 'multi' }
  ];

  const saves = [];
  for (const d of dirs) saves.push(...listSavesInDir(d.dir, d.source));
  saves.sort((a, b) => (b.saveTime || 0) - (a.saveTime || 0));

  const byName = buildNameIndex(mods);
  const sets = modlistNameSets((settings && settings.modListsDir) || '', mods);

  for (const s of saves) {
    const set = new Set();
    s.mods = s.mods.map((n) => {
      set.add(normName(n));
      const m = byName.get(normName(n));
      return {
        name: n,
        // 只带界面需要的字段，别把整个 mod 对象塞进 IPC
        mod: m ? { source: m.source, id: m.id, name: m.name } : null
      };
    });
    set.delete('');
    s.missingCount = s.mods.filter((x) => !x.mod).length;

    // 「完全一致」：两边集合相等
    const exact = sets.find((l) => l.names.size === set.size && [...set].every((n) => l.names.has(n)));
    s.match = exact ? { fileName: exact.fileName, name: exact.name } : null;

    // 「完全覆盖」：存档的 mod 全在合集里（合集另有若干个）。
    // 这是最实用的关系 —— 存档**不记录**纯客户端型内容包（LuaCs 框架、UI、QoL 这些），
    // 所以"能覆盖存档的合集"才是真正能拿来实现该存档的那一个。按"多出来的最少"排序。
    let covers = [];
    if (!exact) {
      covers = sets
        .filter((l) => l.names.size > set.size && [...set].every((n) => l.names.has(n)))
        .map((l) => {
          const extra = [];
          for (const e of l.entries) {
            if (set.has(e.key)) continue;
            if (!extra.includes(e.label)) extra.push(e.label);
          }
          return { fileName: l.fileName, name: l.name, extra };
        })
        .sort((a, b) => a.extra.length - b.extra.length || a.name.localeCompare(b.name, 'zh'));
    }
    s.covers = covers.slice(0, 3);
    s.coversTotal = covers.length;
  }

  return {
    saveDir: base,
    dirs: dirs.map((d) => ({ ...d, exists: fs.existsSync(d.dir) })),
    modlistCount: sets.length,
    saves
  };
}

module.exports = {
  saveDirOf,
  savePathSetting,
  parseSave,
  listSaves,
  normName
};
