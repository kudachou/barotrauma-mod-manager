const fs = require('node:fs');
const path = require('node:path');

const { copyDir, dirStats, sanitizeName, uniqueName, stamp, parseStamp, rmrf, rmrfStrict } = require('./fsutil');
const { scanDir, stripBom } = require('./mods');
const { xmlEscape } = require('./modlists');
const { readWorkshopAcf, installTimeOf, isDelisted } = require('./workshopsync');

/**
 * 快照与备份
 *
 * 快照根目录放在 LocalMods 的**同级**：改名/复制都在同一个盘，快，而且不会被游戏当成 mod 扫到。
 * 结构：
 *   <LocalMods 同级>\ModManagerBackups\<mod 文件夹名>\<YYYYMMDD-HHMMSS>\
 *   <LocalMods 同级>\ModManagerBackups\<mod 文件夹名>\.labels.json   （可选备注）
 */

const SNAPSHOT_ROOT_NAME = 'ModManagerBackups';

/**
 * 把 mod 名解析成绝对路径，并确保它**就是 LocalMods 的直接子目录**。
 *
 * modName 来自界面（也可能来自用户导入的合集），直接用 path.join 拼会有两个坑：
 *   - `..` 之类相对段能跑到 LocalMods 外面去（path.join 会照常规范化，不会报错）；
 *   - 空串 / `.` 会解析成 LocalMods 自己，接着被 rmrf 就是整个本地 mod 库没了。
 *
 * 比较时用 `resolve` 之后的绝对路径，且必须带上 path.sep 再比前缀 —— 只看裸 startsWith
 * 会把 `...\LocalMods-evil` 这种"前缀相同的兄弟目录"也放进来，等于没校验。
 *
 * @param {{localModsDir?: string}} settings
 * @param {unknown} modName
 * @returns {string} 校验通过的绝对路径
 */
function assertModDir(settings, modName) {
  const root = path.resolve(settings.localModsDir || '.');
  const folder = path.resolve(root, String(modName == null ? '' : modName));
  if (folder === root || !folder.startsWith(root + path.sep)) {
    throw new Error('非法的 mod 名称');
  }
  return folder;
}

/**
 * 校验快照 id。id 会拼进快照目录下的路径，允许的形态只有本项目自己生成的那两种：
 * `YYYYMMDD-HHMMSS` 与加了随机后缀 / 回滚后缀的 `YYYYMMDD-HHMMSS-xxxx`。
 * @param {unknown} id
 * @returns {string}
 */
function assertSnapshotId(id) {
  const s = String(id == null ? '' : id).trim();
  if (!/^\d{8}-\d{6}(-[a-z0-9]{1,8})?$/.test(s)) throw new Error('非法的快照 id');
  return s;
}

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
  const src = assertModDir(settings, modName);
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
  const snapPath = path.join(dir, assertSnapshotId(id));
  if (!fs.existsSync(snapPath)) throw new Error('快照不存在或已被删除');

  const dest = assertModDir(settings, modName);

  const tmp = path.join(dir, `.tmp-${stamp()}-${Math.random().toString(36).slice(2, 6)}`);
  let hasCurrent = false;
  if (keepCurrent && fs.existsSync(dest)) {
    fs.mkdirSync(dir, { recursive: true });
    copyDir(dest, tmp);
    hasCurrent = true;
  }

  /*
   * rmrf 之后就处于"用户当前的 mod 已经没了"的窗口期：这一步再失败，
   * 必须把刚才那一份临时副本放回去，否则用户既没有新版本、也没有旧版本。
   * （这是本项目里唯一允许先删后拷的地方，所以回滚是硬要求，不是可选项。）
   *
   * 删除用严格版：吞掉删除失败的异常就等于"以为删干净了、其实在旧文件上覆盖"，
   * 那样既得不到干净的新版本，也不会走到下面的回滚分支。
   */
  rmrfStrict(dest);
  try {
    copyDir(snapPath, dest);
  } catch (e) {
    if (hasCurrent) {
      try {
        rmrf(dest);
        copyDir(tmp, dest);
      } catch {
        /* 还原也失败：下面的错误里会说明原始原因，临时副本仍在 dir 里可人工抢救 */
      }
    }
    throw e;
  }

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
  // 先按格式白名单校验 id，再解析绝对路径确认没跑出快照目录 —— 只比裸 startsWith 不够：
  // `...\ModManagerBackups\Foo` 与 `...\ModManagerBackups\Foo-evil` 前缀相同却不是一个目录。
  const safeId = assertSnapshotId(id);
  const root = path.resolve(dir);
  const target = path.resolve(root, safeId);
  if (target === root || !target.startsWith(root + path.sep)) throw new Error('非法路径');
  rmrf(target);
  const labels = readLabels(dir);
  delete labels[safeId];
  writeLabels(dir, labels);
  return { ok: true };
}

/** 某个本地 mod 占用的空间（mod 本体 + 它的所有快照） */
function localModFootprint(settings, modName) {
  const folder = assertModDir(settings, modName);
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
  const folder = assertModDir(settings, modName);
  // 不存在就别假装删成功了：以前会返回"已释放 0 字节"，界面看起来像删掉了
  if (!fs.existsSync(folder)) throw new Error(`本地 mod 不存在：${String(modName)}`);
  const before = localModFootprint(settings, modName);
  rmrf(folder);
  rmrf(modSnapshotDir(settings, modName));
  return { freedBytes: before.totalBytes, snapshotCount: before.snapshotCount, files: before };
}

/* --------------------------- 工坊 mod 备份 --------------------------- */

/**
 * 挑一份用来备份的工坊内容。
 *
 * 默认用游戏实际加载的那份（Installed），但如果工坊已经有更新、而游戏还没同步过去，
 * 那份就是旧的 —— 这时必须改用 Steam 订阅目录，否则会备份到过期内容。
 * 判断依据是 Steam .acf 里的 latest_timeupdated 与游戏写的 installtime 之比。
 */
function pickWorkshopSource(settings, id, acf) {
  const inst = settings.installedWorkshopDir
    ? path.join(settings.installedWorkshopDir, id)
    : null;
  const steam = settings.workshopModsDir ? path.join(settings.workshopModsDir, id) : null;
  const okInst = inst && fs.existsSync(path.join(inst, 'filelist.xml'));
  const okSteam = steam && fs.existsSync(path.join(steam, 'filelist.xml'));

  if (okInst && okSteam) {
    const entry = acf && acf.items ? acf.items[id] : null;
    const latest = entry && (entry.latestTimeUpdated || entry.timeUpdated);
    const installed = installTimeOf(inst);
    if (latest && installed && latest > installed) return steam;
    return inst;
  }
  if (okInst) return inst;
  if (okSteam) return steam;
  return null;
}

/**
 * 规划一次「把所有工坊 mod 备份到 LocalMods」：
 * 已经存在本地副本的（靠 steamworkshopid 认）会原地更新，并先留快照；
 * 其余按 mod 名新建文件夹。
 */
function planWorkshopBackup(settings, hooks = {}, options = {}) {
  const { onStep = () => {} } = hooks;
  const { onlyDelisted = false, checks = {} } = options;

  /*
   * 来源集合 = Steam 订阅目录 ∪ 游戏 Installed。
   * 已下架的 mod 可能只剩其中一边有副本（甚至只剩 Installed），少扫一边就会漏掉 ——
   * 而恰恰是这些"工坊上已经没了"的 mod 最需要备份。
   */
  const byId = new Map();
  for (const m of scanDir('workshop', settings.installedWorkshopDir)) byId.set(m.id, m);
  for (const m of scanDir('workshop', settings.workshopModsDir)) byId.set(m.id, m);
  const workshop = Array.from(byId.values()).filter(
    (m) => !onlyDelisted || isDelisted(checks, m.id)
  );
  const local = scanDir('local', settings.localModsDir);
  const acf = readWorkshopAcf(settings.workshopModsDir);

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

    const source = pickWorkshopSource(settings, w.id, acf);
    if (!source) {
      skipped.push({ id: w.id, name: w.name || w.id, reason: '游戏还没安装这个 mod' });
      continue;
    }

    const existingFolder = existingByWsId.get(w.id) || null;

    /*
     * 「只备份已下架的」默认跳过已经备份过的。
     * 本地副本已经在，说明这个 mod 早就救下来了；再复制一次只会覆盖掉
     * 用户自己改过的东西（这些 mod 恰恰经常被自改）。
     */
    if (onlyDelisted && existingFolder) {
      skipped.push({
        id: w.id,
        name: w.name || w.id,
        reason: `已备份到本地（${existingFolder}），跳过以免覆盖你改过的副本`
      });
      continue;
    }

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
      existing: !!existingFolder,
      // 已下架：工坊上已经没有这个条目了
      delisted: isDelisted(checks, w.id),
      // 仅剩游戏里的副本（Steam 订阅目录里已经没有）
      installedOnly: !fs.existsSync(path.join(settings.workshopModsDir || '', w.id, 'filelist.xml'))
    });
  }

  return { items, skipped, totalBytes, totalFiles, updateCount, newCount };
}

/** 让出事件循环：同步循环里没有 await，取消标志永远没机会被置位（IPC 消息进不来） */
const yieldToLoop = () => new Promise((r) => setImmediate(r));

/** 执行备份。长任务，调用方负责用事件汇报进度。 */
async function runWorkshopBackup(settings, plan, hooks = {}) {
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
      const dest = assertModDir(settings, item.folder);

      let snap = null;
      if (fs.existsSync(dest)) {
        // 覆盖前先留快照 —— 这就是「回滚旧版本」的来源
        snap = createSnapshot(settings, item.folder, { label: '备份更新前' });
        snapshotted++;
      }

      /*
       * 覆盖是"先删后拷"，中途失败会留下半个 mod。既然上面刚做了快照，
       * 这里就必须用上它：删/拷任一失败都把快照还原回去，别把用户的本地版弄丢。
       */
      try {
        if (fs.existsSync(dest)) rmrfStrict(dest);
        copyDir(item.source, dest);
      } catch (e) {
        if (snap) {
          try {
            restoreSnapshot(settings, item.folder, snap.id, { keepCurrent: false });
          } catch {
            /* 还原失败：快照还在磁盘上，界面上仍能手动回滚 */
          }
        }
        throw e;
      }

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
    // 每个 mod 之间让出一次，backup:cancel 才有机会被处理（否则界面按钮是死的）
    await yieldToLoop();
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
  assertModDir,
  assertSnapshotId,
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
