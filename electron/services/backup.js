const fs = require('node:fs');
const path = require('node:path');

const { copyDir, dirStats, sanitizeName, uniqueName, stamp, parseStamp, rmrf } = require('./fsutil');
const { scanDir, stripBom } = require('./mods');
const { xmlEscape } = require('./modlists');

/**
 * 快照与备份
 *
 * 快照根目录放在 LocalMods 的**同级**：改名/复制都在同一个盘，快，而且不会被游戏当成 mod 扫到。
 * 结构：
 *   <LocalMods 同级>\ModManagerBackups\<mod 文件夹名>\<YYYYMMDD-HHMMSS>\
 *   <LocalMods 同级>\ModManagerBackups\<mod 文件夹名>\.labels.json   （可选备注）
 */

const SNAPSHOT_ROOT_NAME = 'ModManagerBackups';

function snapshotRoot(settings) {
  const parent = settings.localModsDir
    ? path.dirname(settings.localModsDir)
    : settings.gameDir || '.';
  return path.join(parent, SNAPSHOT_ROOT_NAME);
}

function modSnapshotDir(settings, modName) {
  return path.join(snapshotRoot(settings), sanitizeName(modName));
}

function readLabels(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, '.labels.json'), 'utf8'));
  } catch {
    return {};
  }
}

function writeLabels(dir, labels) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '.labels.json'), JSON.stringify(labels, null, 2), 'utf8');
  } catch {
    /* 忽略 */
  }
}

/**
 * 每个本地 mod 只保留这么多个快照。
 * 1 = 只留最近一份「改动前的状态」，既够回滚又不占地方。
 * 想多留几份历史就把这个数字改大即可（界面会自动多列几条）。
 */
const MAX_SNAPSHOTS = 1;

function isSnapshotDir(name) {
  return !name.startsWith('.') && !!parseStamp(name);
}

/** 列出某个本地 mod 的所有快照（新的在前） */
function listSnapshots(settings, modName) {
  const dir = modSnapshotDir(settings, modName);
  if (!fs.existsSync(dir)) return [];

  const labels = readLabels(dir);
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || !isSnapshotDir(e.name)) continue;
    const p = path.join(dir, e.name);
    const { bytes, files } = dirStats(p);
    out.push({
      id: e.name,
      at: parseStamp(e.name) || 0,
      bytes,
      files,
      label: labels[e.name] || null
    });
  }
  out.sort((a, b) => b.id.localeCompare(a.id));
  return out;
}

/** 只保留最新的 keep 份，其余删掉；返回删掉的份数 */
function pruneSnapshots(settings, modName, keep = MAX_SNAPSHOTS) {
  const list = listSnapshots(settings, modName);
  if (list.length <= keep) return 0;

  const dir = modSnapshotDir(settings, modName);
  const labels = readLabels(dir);
  let removed = 0;
  for (const snap of list.slice(keep)) {
    rmrf(path.join(dir, snap.id));
    delete labels[snap.id];
    removed++;
  }
  writeLabels(dir, labels);
  return removed;
}

function snapshotSummary(settings, modName) {
  const list = listSnapshots(settings, modName);
  return {
    count: list.length,
    bytes: list.reduce((s, x) => s + x.bytes, 0),
    latestAt: list.length ? list[0].at : null
  };
}

/** 给本地 mod 的当前状态打一个快照（只保留最新 MAX_SNAPSHOTS 份） */
function createSnapshot(settings, modName, opts = {}) {
  const src = path.join(settings.localModsDir, modName);
  if (!fs.existsSync(src)) throw new Error(`本地 mod 文件夹不存在：${src}`);

  const root = modSnapshotDir(settings, modName);
  fs.mkdirSync(root, { recursive: true });

  let id = stamp();
  if (fs.existsSync(path.join(root, id))) {
    id = `${id}-${Math.random().toString(36).slice(2, 6)}`;
  }
  const dest = path.join(root, id);
  copyDir(src, dest);

  if (opts.label) {
    const labels = readLabels(root);
    labels[id] = opts.label;
    writeLabels(root, labels);
  }

  // 先建好新的再删旧的：万一中途失败，至少还留着一份能回滚
  pruneSnapshots(settings, modName, opts.keep == null ? MAX_SNAPSHOTS : opts.keep);

  const { bytes, files } = dirStats(dest);
  return { id, at: parseStamp(id) || Date.now(), bytes, files, label: opts.label || null };
}

/**
 * 回滚到某个快照。
 *
 * 因为只留 1 份，回滚时要做个「换位」：先把当前状态挪到临时目录，用快照覆盖本地文件夹，
 * 再把临时目录变成唯一的那份快照 —— 这样滚完之后还能滚回来（回滚本身可撤销）。
 */
function restoreSnapshot(settings, modName, id, opts = {}) {
  const keepCurrent = opts.keepCurrent !== false;
  const dir = modSnapshotDir(settings, modName);
  const snapPath = path.join(dir, String(id));
  if (!fs.existsSync(snapPath)) throw new Error('快照不存在或已被删除');

  const dest = path.join(settings.localModsDir, modName);

  const tmp = path.join(dir, `.tmp-${stamp()}-${Math.random().toString(36).slice(2, 6)}`);
  let hasCurrent = false;
  if (keepCurrent && fs.existsSync(dest)) {
    fs.mkdirSync(dir, { recursive: true });
    copyDir(dest, tmp);
    hasCurrent = true;
  }

  rmrf(dest);
  copyDir(snapPath, dest);

  let undoId = null;
  if (hasCurrent) {
    // 清掉所有旧快照（含刚用掉的那份），把临时目录顶上来当唯一快照
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory() && e.name !== path.basename(tmp)) rmrf(path.join(dir, e.name));
    }
    writeLabels(dir, {});
    undoId = stamp();
    if (fs.existsSync(path.join(dir, undoId))) undoId = `${undoId}-u`;
    fs.renameSync(tmp, path.join(dir, undoId));
    writeLabels(dir, { [undoId]: '回滚前自动保存' });
  } else {
    // 没有可保留的当前状态，就把用掉的快照删掉，避免留下过期内容
    rmrf(snapPath);
  }

  return { ok: true, undoId };
}

function deleteSnapshot(settings, modName, id) {
  const dir = modSnapshotDir(settings, modName);
  const target = path.join(dir, String(id));
  if (!target.startsWith(dir)) throw new Error('非法路径');
  rmrf(target);
  const labels = readLabels(dir);
  delete labels[id];
  writeLabels(dir, labels);
  return { ok: true };
}

/** 某个本地 mod 占用的空间（mod 本体 + 它的所有快照） */
function localModFootprint(settings, modName) {
  const folder = path.join(settings.localModsDir, modName);
  const modBytes = fs.existsSync(folder) ? dirStats(folder).bytes : 0;
  const snapshots = listSnapshots(settings, modName);
  const snapshotBytes = snapshots.reduce((s, x) => s + x.bytes, 0);
  return {
    exists: fs.existsSync(folder),
    modBytes,
    snapshotCount: snapshots.length,
    snapshotBytes,
    totalBytes: modBytes + snapshotBytes
  };
}

/** 删除一个本地 mod：mod 文件夹 + 它的全部历史快照 */
function deleteLocalModFiles(settings, modName) {
  const localRoot = path.resolve(settings.localModsDir || '.');
  const folder = path.resolve(localRoot, modName);
  // 只允许删 LocalMods 里的东西，防止名字里带 .. 之类的东西跑到外面去
  if (folder === localRoot || !folder.startsWith(localRoot + path.sep)) {
    throw new Error('非法的 mod 名称');
  }
  const before = localModFootprint(settings, modName);
  rmrf(folder);
  rmrf(modSnapshotDir(settings, modName));
  return { freedBytes: before.totalBytes, snapshotCount: before.snapshotCount, files: before };
}

/* --------------------------- 工坊 mod 备份 --------------------------- */

/** 优先用游戏实际加载的那份（Installed），没有就退回 Steam 订阅目录 */
function pickWorkshopSource(settings, id) {
  const candidates = [
    settings.installedWorkshopDir ? path.join(settings.installedWorkshopDir, id) : null,
    settings.workshopModsDir ? path.join(settings.workshopModsDir, id) : null
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(path.join(c, 'filelist.xml'))) return c;
  }
  return null;
}

/**
 * 规划一次「把所有工坊 mod 备份到 LocalMods」：
 * 已经存在本地副本的（靠 steamworkshopid 认）会原地更新，并先留快照；
 * 其余按 mod 名新建文件夹。
 */
function planWorkshopBackup(settings, hooks = {}) {
  const { onStep = () => {} } = hooks;
  const workshop = scanDir('workshop', settings.workshopModsDir);
  const local = scanDir('local', settings.localModsDir);

  const existingByWsId = new Map();
  const takenNames = new Set();
  for (const m of local) {
    takenNames.add(m.folder.toLowerCase());
    if (m.steamworkshopid && !existingByWsId.has(m.steamworkshopid)) {
      existingByWsId.set(m.steamworkshopid, m.folder);
    }
  }

  const items = [];
  const skipped = [];
  const usedFolders = new Set();
  let totalBytes = 0;
  let totalFiles = 0;
  let updateCount = 0;
  let newCount = 0;

  for (let i = 0; i < workshop.length; i++) {
    const w = workshop[i];
    onStep(i + 1, workshop.length, w.name || w.id);

    const source = pickWorkshopSource(settings, w.id);
    if (!source) {
      skipped.push({ id: w.id, name: w.name || w.id, reason: '游戏还没安装这个 mod' });
      continue;
    }

    const existingFolder = existingByWsId.get(w.id) || null;
    let folder = existingFolder;
    if (folder) {
      updateCount++;
    } else {
      folder = uniqueName(w.name || w.id, takenNames);
      takenNames.add(folder.toLowerCase());
      newCount++;
    }

    const key = folder.toLowerCase();
    if (usedFolders.has(key)) {
      skipped.push({ id: w.id, name: w.name || w.id, reason: '目标文件夹名重复' });
      continue;
    }
    usedFolders.add(key);

    const { bytes, files } = dirStats(source);
    totalBytes += bytes;
    totalFiles += files;

    items.push({
      id: w.id,
      name: w.name || w.id,
      folder,
      source,
      bytes,
      files,
      existing: !!existingFolder
    });
  }

  return { items, skipped, totalBytes, totalFiles, updateCount, newCount };
}

/** 执行备份。长任务，调用方负责用事件汇报进度。 */
function runWorkshopBackup(settings, plan, hooks = {}) {
  const { onProgress = () => {}, isCancelled = () => false } = hooks;

  const errors = [];
  const doneFolders = [];
  let done = 0;
  let bytesDone = 0;
  let snapshotted = 0;

  const total = plan.items.length;

  for (const item of plan.items) {
    if (isCancelled()) break;

    onProgress({
      phase: 'copying',
      done,
      total,
      bytesDone,
      bytesTotal: plan.totalBytes,
      current: item.name,
      snapshotted,
      errors: errors.length
    });

    try {
      const dest = path.join(settings.localModsDir, item.folder);

      if (fs.existsSync(dest)) {
        // 覆盖前先留快照 —— 这就是「回滚旧版本」的来源
        createSnapshot(settings, item.folder, { label: '备份更新前' });
        snapshotted++;
        rmrf(dest);
      }

      copyDir(item.source, dest);

      // 让 filelist.xml 的 name 与文件夹名一致，合集里的 <Local name> 才解析得到
      const fl = path.join(dest, 'filelist.xml');
      if (fs.existsSync(fl)) {
        const raw = stripBom(fs.readFileSync(fl, 'utf8'));
        const next = raw.replace(/<contentpackage\b[^>]*>/i, (tag) =>
          tag.replace(/\bname\s*=\s*"[^"]*"/i, `name="${xmlEscape(item.folder)}"`)
        );
        fs.writeFileSync(fl, next, 'utf8');
      }

      bytesDone += item.bytes;
      doneFolders.push(item.folder);
    } catch (e) {
      errors.push({ name: item.name, id: item.id, message: String((e && e.message) || e) });
    }

    done++;
  }

  onProgress({
    phase: 'done',
    done,
    total,
    bytesDone,
    bytesTotal: plan.totalBytes,
    current: null,
    snapshotted,
    errors: errors.length
  });

  return { done, total, bytesDone, snapshotted, errors, folders: doneFolders, skipped: plan.skipped };
}

module.exports = {
  SNAPSHOT_ROOT_NAME,
  MAX_SNAPSHOTS,
  snapshotRoot,
  listSnapshots,
  snapshotSummary,
  pruneSnapshots,
  createSnapshot,
  restoreSnapshot,
  deleteSnapshot,
  localModFootprint,
  deleteLocalModFiles,
  planWorkshopBackup,
  runWorkshopBackup
};
