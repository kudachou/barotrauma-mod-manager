const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { ipcMain, dialog, shell, app } = require('electron');

const { getSettings, saveSettings, backupDir, userDataDir, redetect } = require('./settings');
const {
  scanDir,
  attachCounterparts,
  stripBom,
  statusOf
} = require('./mods');
const {
  parseModlistFile,
  listModlists,
  getModlist,
  saveModlist,
  deleteModlist,
  addModToModlist,
  removeModFromModlist,
  xmlEscape
} = require('./modlists');
const { applyToGame, readAppliedPackages } = require('./config');
const { listSaves } = require('./saves');
const { installStatus, pendingSyncOf, planInstallSync, runInstallSync } = require('./installsync');
const { browse: browseWorkshop, browseTags: browseWorkshopTags } = require('./workshopbrowse');
const { openWorkshopInSteam } = require('./openinsteam');
const { getMedia: getWorkshopMedia } = require('./workshoppage');
const { translateToChinese } = require('./translate');
const {
  buildText: buildShareText,
  buildJson: buildShareJson,
  buildXml: buildShareXml,
  parseShared,
  fillNames,
  suggestFileName,
  uniqueFileName
} = require('./share');
const { registerUpdaterIpc } = require('./updater');
const { copyDir } = require('./fsutil');
const {
  getRelations,
  setRelations,
  removeRelations
} = require('./relations');
const {
  readWorkshopAcf,
  installTimeOf,
  readChecks,
  checksStale,
  refreshChecks,
  isDelisted
} = require('./workshopsync');
const { getApiKey, setApiKey } = require('./apikey');
const {
  listSnapshots,
  snapshotSummary,
  createSnapshot,
  restoreSnapshot,
  deleteSnapshot,
  localModFootprint,
  deleteLocalModFiles,
  planWorkshopBackup,
  runWorkshopBackup
} = require('./backup');
const {
  fetchDetails,
  getWorkshopDetails,
  downloadPreview,
  cachedPreview,
  missFresh,
  writeMiss,
  createQueue
} = require('./steam');
const {
  autoCategorize,
  getCategories,
  setModCategories,
  saveCategories,
  addCustomCategory,
  deleteCategory
} = require('./categories');

const previewQueue = createQueue(5, 150);
const previewInflight = new Set();

const COVER_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'];

function safeKey(key) {
  return String(key || '').replace(/[\\/:*?"<>|]/g, '_');
}

function coverDir() {
  return path.join(userDataDir(), 'covers');
}

function findCover(key) {
  const safe = safeKey(key);
  for (const ext of COVER_EXTS) {
    const p = path.join(coverDir(), safe + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/* copyDir / dirStats 等文件工具在 fsutil.js */

/** 读一次合集目录：同时得到摘要列表和「mod → 所属合集」映射 */
function readAllModlists(dir, appliedKeys) {
  let files;
  try {
    files = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return { summaries: [], usedIn: new Map() };
  }
  const summaries = [];
  const usedIn = new Map();
  const appliedSet = new Set(appliedKeys || []);
  const hasApplied = appliedSet.size > 0;

  for (const f of files) {
    if (!f.isFile() || !/\.xml$/i.test(f.name)) continue;
    let ml;
    try {
      ml = parseModlistFile(path.join(dir, f.name));
    } catch {
      continue;
    }

    const keys = ml.entries.map((e) =>
      e.type === 'workshop' ? `workshop:${e.id}` : `local:${e.name}`
    );
    // 内容和当前游戏生效的一致就标记出来（按集合比较，顺序不参与）
    const matchesApplied =
      hasApplied && keys.length === appliedSet.size && keys.every((k) => appliedSet.has(k));

    summaries.push({
      fileName: ml.fileName,
      name: ml.name,
      count: ml.entries.length,
      matchesApplied
    });

    for (const e of ml.entries) {
      const key = e.type === 'workshop' ? `workshop:${e.id}` : `local:${e.name}`;
      const arr = usedIn.get(key) || [];
      if (!arr.includes(ml.name)) arr.push(ml.name);
      usedIn.set(key, arr);
    }
  }

  summaries.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  return { summaries, usedIn };
}

/** 需要检查「工坊条目还在不在」的所有 ID */
function collectCheckIds(s) {
  const ids = new Set();
  for (const m of scanDir('workshop', s.workshopModsDir)) ids.add(m.id);
  for (const m of scanDir('workshop', s.installedWorkshopDir)) ids.add(m.id);
  for (const m of scanDir('local', s.localModsDir)) {
    if (m.steamworkshopid) ids.add(m.steamworkshopid);
  }
  return Array.from(ids);
}

function scanAll() {
  const s = getSettings();
  const warnings = [];

  if (!fs.existsSync(s.localModsDir)) warnings.push(`本地 mod 目录不存在：${s.localModsDir}`);
  if (!fs.existsSync(s.workshopModsDir)) warnings.push(`创意工坊 mod 目录不存在：${s.workshopModsDir}`);
  if (!fs.existsSync(s.modListsDir)) warnings.push(`合集目录不存在：${s.modListsDir}`);
  if (!fs.existsSync(s.configPlayerPath)) warnings.push(`找不到配置文件：${s.configPlayerPath}`);

  const local = scanDir('local', s.localModsDir);
  const workshop = scanDir('workshop', s.workshopModsDir);
  // 游戏 Installed 里有、但 Steam 订阅目录里已经没有的副本（作者下架后残留的）
  const installedOnly = scanDir('workshop', s.installedWorkshopDir).filter(
    (m) => !workshop.some((w) => w.id === m.id)
  );
  for (const m of installedOnly) m.installedOnly = true;
  attachCounterparts(local, [...workshop, ...installedOnly], s.installedWorkshopDir);

  const cats = getCategories();
  const removed = cats.removed || [];
  const previewDir = path.join(userDataDir(), 'previews');

  // 当前游戏实际生效的 mod：从 config_player.xml 的 <contentpackages> 反推
  const appliedRaw = readAppliedPackages(s);
  const appliedKeys = [];
  const appliedMissing = [];
  if (appliedRaw.available) {
    for (const e of appliedRaw.entries) {
      if (e.type === 'workshop') appliedKeys.push(`workshop:${e.id}`);
      else if (e.type === 'local') appliedKeys.push(`local:${e.name}`);
      else appliedMissing.push(e.path);
    }
  }

  const { summaries, usedIn } = readAllModlists(s.modListsDir, appliedKeys);

  // 下架状态读缓存（不联网）；联网刷新是单独的 IPC，由界面按需触发
  const checks = readChecks(userDataDir());

  const mods = [...workshop, ...installedOnly, ...local];
  // 哪些工坊 mod 已经有一份对应的本地副本（= 已经备份过了）
  const localWsIds = new Set(local.map((m) => m.steamworkshopid).filter(Boolean));
  // 「Steam 已下载、游戏还没装」的检测：需要 .acf 里的 timeupdated 对 Installed 的 installtime。
  // 只读小文件，比扫 mod 目录便宜得多，所以放进扫描里，界面才能随时显示数量。
  const acfForInstall = fs.existsSync(s.workshopModsDir) ? readWorkshopAcf(s.workshopModsDir) : null;
  let installPendingCount = 0;
  for (const m of mods) {
    const key = `${m.source}:${m.id}`;
    m.categories = Array.isArray(cats.mods[key]) ? [...cats.mods[key]] : [];
    // 被删掉的标签不能继续出现在关键词自动分类里
    m.autoCategories = autoCategorize(m.name).filter((c) => !removed.includes(c));
    m.preview =
      m.source === 'workshop' ? cachedPreview(m.id, previewDir) : findCover(key);
    m.usedIn = usedIn.get(key) || [];
    // 工坊 mod：条目本身还在不在；本地 mod：它对应的工坊来源还在不在
    const entry = m.source === 'workshop' ? checks[m.id] : checks[m.steamworkshopid];
    m.delisted = isDelisted(checks, m.source === 'workshop' ? m.id : m.steamworkshopid);
    // 判定依据：'apikey' = 官方接口确认下架；'page-invisible' = 抓网页只知道「工坊上看不到」，
    // 也可能只是作者把它设成了私有（实测这种误判真的会发生）
    m.delistedHow = m.delisted && entry ? entry.how || null : null;
    // 工坊 mod：本地是否已经有一份备份（有的话就不算"有风险"）
    m.backedUpLocally = m.source === 'workshop' ? localWsIds.has(m.id) : true;
    // 工坊 mod：Steam 那份已经下载了、但游戏 Installed 里还是旧的（或压根没装）
    m.installPending = false;
    m.installInstalledVersion = null;
    if (m.source === 'workshop' && !m.installedOnly && acfForInstall) {
      const st = pendingSyncOf(s, acfForInstall, checks, m);
      m.installPending = st.pending;
      m.installInstalledVersion = st.installedVersion;
      if (st.pending) installPendingCount++;
    }
  }

  // 生效列表里有、但当前目录找不到的（被删了或者没装）
  const knownKeys = new Set(mods.map((m) => `${m.source}:${m.id}`));
  for (const k of appliedKeys) {
    if (knownKeys.has(k)) continue;
    appliedMissing.push(k.startsWith('workshop:') ? `#${k.slice('workshop:'.length)}` : k.slice('local:'.length));
  }

  const applied = {
    available: appliedRaw.available,
    reason: appliedRaw.reason || null,
    keys: appliedKeys,
    missing: appliedMissing
  };

  const checkValues = Object.values(checks);
  const checkIds = [
    ...workshop.map((m) => m.id),
    ...installedOnly.map((m) => m.id),
    ...local.map((m) => m.steamworkshopid).filter(Boolean)
  ];

  return {
    mods,
    modlists: summaries,
    categories: cats,
    settings: s,
    warnings,
    applied,
    relations: getRelations(userDataDir()),
    // 缓存太旧就让界面去刷一次（不阻塞扫描）
    checksStale: checksStale(checks, checkIds),
    /** 已核实为下架的数量 */
    checksDelisted: checkValues.filter((c) => c && c.exists === false).length,
    /** 没能核实的数量（Steam 挡住时会有） */
    checksUnknown: checkValues.filter((c) => c && c.exists === null).length,
    /** 检查方式：有 API Key 走官方接口，没有就抓网页 */
    checksMode: getApiKey(userDataDir()) ? 'apikey' : 'page',
    checksCheckedAt: checkValues.reduce((max, c) => Math.max(max, (c && c.checkedAt) || 0), 0),
    /** Steam 已下载、游戏还没装的工坊 mod 个数（详情在 installsync:plan 里） */
    installPendingCount
  };
}

function send(sender, channel, payload) {
  try {
    if (sender && !sender.isDestroyed()) sender.send(channel, payload);
  } catch {
    /* 窗口已关闭 */
  }
}

function registerIpc() {
  /* -------------------------------- 设置 -------------------------------- */

  ipcMain.handle('settings:get', () => getSettings());
  ipcMain.handle('settings:save', (_e, s) => {
    saveSettings(s);
    return scanAll();
  });

  /** 重新自动检测目录（只返回结果，不写入设置） */
  ipcMain.handle('paths:detect', () => redetect());

  ipcMain.handle('dialog:pickFolder', async (_e, title) => {
    const r = await dialog.showOpenDialog({
      title: title || '选择文件夹',
      properties: ['openDirectory']
    });
    return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
  });

  ipcMain.handle('dialog:pickFile', async (_e, title, filters) => {
    const r = await dialog.showOpenDialog({
      title: title || '选择文件',
      properties: ['openFile'],
      filters: Array.isArray(filters) && filters.length ? filters : undefined
    });
    return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
  });

  ipcMain.handle('fs:exists', (_e, p) => {
    try {
      return !!p && fs.existsSync(String(p));
    } catch {
      return false;
    }
  });

  /* -------------------------------- 扫描 -------------------------------- */

  ipcMain.handle('scan', () => scanAll());

  /* ------------------------------- 合集 -------------------------------- */

  ipcMain.handle('modlist:get', (_e, fileName) => {
    const s = getSettings();
    return getModlist(s.modListsDir, fileName);
  });

  ipcMain.handle('modlist:save', (_e, fileName, name, entries) => {
    const s = getSettings();
    saveModlist(s.modListsDir, fileName, name, entries);
    return true;
  });

  ipcMain.handle('modlist:delete', (_e, fileName) => {
    const s = getSettings();
    deleteModlist(s.modListsDir, fileName);
    return true;
  });

  ipcMain.handle('modlist:addMod', (_e, fileName, name, entry) => {
    const s = getSettings();
    addModToModlist(s.modListsDir, fileName, name, entry);
    return true;
  });

  ipcMain.handle('modlist:removeMod', (_e, fileName, entry) => {
    const s = getSettings();
    removeModFromModlist(s.modListsDir, fileName, entry);
    return true;
  });

  /* ------------------------- 合集导入 / 导出 ------------------------- */

  /** 导出：弹出保存对话框并写文件；format = 'xml' | 'json' | 'text' */
  ipcMain.handle('modlist:exportFile', async (_e, name, entries, format, note) => {
    const fmt = format === 'json' ? 'json' : format === 'text' ? 'txt' : 'xml';
    const content =
      format === 'json'
        ? buildShareJson(name, entries, { note })
        : format === 'text'
          ? buildShareText(name, entries, { note })
          : buildShareXml(name, entries);
    const r = await dialog.showSaveDialog({
      title: '导出合集',
      defaultPath: suggestFileName(name, fmt),
      filters: [
        { name: fmt === 'xml' ? '游戏合集文件' : fmt === 'json' ? 'JSON' : '文本', extensions: [fmt] },
        { name: '全部文件', extensions: ['*'] }
      ]
    });
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    fs.writeFileSync(r.filePath, content, 'utf8');
    return { ok: true, path: r.filePath, bytes: Buffer.byteLength(content, 'utf8') };
  });

  /** 导出成文本（界面拿去复制到剪贴板，贴聊天里用） */
  ipcMain.handle('modlist:exportText', (_e, name, entries, note) =>
    buildShareText(name, entries, { note })
  );

  /** 导入预览：解析文件或粘贴的文本，先给用户看清楚再决定 */
  ipcMain.handle('modlist:previewImport', async (_e, payload) => {
    const p = payload || {};
    let raw = p.text;
    let fallback = null;
    if (p.path) {
      const file = String(p.path);
      if (!fs.existsSync(file)) throw new Error(`文件不存在：${file}`);
      raw = fs.readFileSync(file, 'utf8');
      fallback = path.basename(file, path.extname(file));
    }
    const parsed = parseShared(raw, fallback);
    // 认不出名字的工坊条目补一下标题（界面要显示给用户看）
    await fillNames(parsed.entries);

    // 顺便告诉界面：哪些是本机还没有的（未订阅 / 未下载 / 本地 mod 缺失）
    const s = getSettings();
    const known = new Set();
    for (const m of scanDir('workshop', s.workshopModsDir)) known.add(`workshop:${m.id}`);
    for (const m of scanDir('workshop', s.installedWorkshopDir)) known.add(`workshop:${m.id}`);
    for (const m of scanDir('local', s.localModsDir)) known.add(`local:${m.id}`);
    const missing = parsed.entries
      .map((e) => (e.type === 'workshop' ? `workshop:${e.id}` : `local:${e.name}`))
      .filter((k) => !known.has(k));

    return {
      format: parsed.format,
      name: parsed.name,
      note: parsed.note,
      entries: parsed.entries,
      count: parsed.entries.length,
      missingCount: missing.length,
      /** 本机没有的条目（界面用来列"未订阅"清单） */
      missing: parsed.entries.filter((e, i) => {
        const k = e.type === 'workshop' ? `workshop:${e.id}` : `local:${e.name}`;
        return missing.includes(k);
      })
    };
  });

  /** 真正导入：写进 ModLists（重名自动加序号），可选立刻应用到游戏 */
  ipcMain.handle('modlist:import', async (_e, payload) => {
    const p = payload || {};
    const parsed =
      p.entries && Array.isArray(p.entries)
        ? { name: p.name || '导入的合集', entries: p.entries, format: 'direct' }
        : parseShared(p.text || (p.path ? fs.readFileSync(String(p.path), 'utf8') : ''), p.name);
    const s = getSettings();
    const wanted = suggestFileName(p.name || parsed.name, 'xml');
    const fileName = uniqueFileName(s.modListsDir, wanted);
    saveModlist(s.modListsDir, fileName, (p.name || parsed.name || '导入的合集').trim(), parsed.entries);

    let applied = null;
    if (p.apply) {
      applied = applyToGame(s, parsed.entries);
    }
    return {
      ok: true,
      fileName,
      name: (p.name || parsed.name || '导入的合集').trim(),
      count: parsed.entries.length,
      applied
    };
  });

  ipcMain.handle('modlist:apply', (_e, name, entries) => {
    void name;
    const s = getSettings();
    const r = applyToGame(s, entries);
    return {
      ok: true,
      backup: r.backup,
      backupName: r.backupName,
      changed: r.changed,
      missing: r.missing,
      count: r.count,
      prunedBackups: r.prunedBackups || []
    };
  });

  /* -------------------------------- 存档 -------------------------------- */

  /**
   * 列存档。刻意**不放进 scan** —— 解析每个存档都要 gunzip 几百 KB，
   * 没必要每次扫描 mod 目录都做一遍；存档页打开时才读。
   */
  ipcMain.handle('saves:list', () => {
    const s = getSettings();
    const mods = [
      ...scanDir('workshop', s.workshopModsDir),
      ...scanDir('workshop', s.installedWorkshopDir),
      ...scanDir('local', s.localModsDir)
    ];
    return listSaves(s, mods);
  });

  /* ------------------------------- 封面 -------------------------------- */

  ipcMain.handle('previews:fetch', async (event, ids) => {
    const dir = path.join(userDataDir(), 'previews');
    const sender = event.sender;
    const list = (Array.isArray(ids) ? ids : []).map(String).filter(Boolean);

    const need = [];
    let cachedCount = 0;
    for (const id of list) {
      if (previewInflight.has(id)) continue;
      const hit = cachedPreview(id, dir);
      if (hit) {
        send(sender, 'previews:ready', { id, localPath: hit });
        cachedCount++;
        continue;
      }
      if (missFresh(id, dir)) continue; // 已知该 mod 没有封面，不必再问
      need.push(id);
    }
    if (need.length === 0) return { queued: 0, cached: cachedCount };

    for (const id of need) previewInflight.add(id);

    // 先用公开接口批量取封面地址（103 个只需 3 次请求），再并发下载
    fetchDetails(need)
      .then((map) => {
        for (const id of need) {
          const d = map.get(id);
          if (!d || d.result !== 1 || !d.previewUrl) {
            // 接口有明确答复才算「确定性没有封面」；整批请求失败时 map 里没有这个 id
            if (d) writeMiss(id, dir);
            send(sender, 'previews:ready', { id, localPath: null });
            previewInflight.delete(id);
            continue;
          }
          previewQueue(() => downloadPreview(id, d.previewUrl, dir))
            .then((p) => send(sender, 'previews:ready', { id, localPath: p || null }))
            .catch(() => send(sender, 'previews:ready', { id, localPath: null }))
            .finally(() => previewInflight.delete(id));
        }
      })
      .catch(() => {
        for (const id of need) {
          send(sender, 'previews:ready', { id, localPath: null });
          previewInflight.delete(id);
        }
      });

    return { queued: need.length, cached: cachedCount };
  });

  /* ------------------------------ 工坊详情 ------------------------------ */

  ipcMain.handle('workshop:details', (_e, id, force) =>
    getWorkshopDetails(id, path.join(userDataDir(), 'workshop'), {
      force: !!force,
      // 配了 key 就拿**本地化（中文）**描述 —— 老接口永远只给英文，这就是
      // 「管理器显示英文、Steam 显示中文」的原因
      apiKey: getApiKey(userDataDir())
    })
  );

  /** 把描述翻译成中文（作者没提供中文版时的兜底） */
  ipcMain.handle('translate:text', (_e, text) =>
    translateToChinese(text, { cacheDir: path.join(userDataDir(), 'translations') })
  );

  /** 联网刷新「工坊条目还在不在」的缓存（作者下架后就查不到了） */
  ipcMain.handle('workshop:refreshChecks', () =>
    refreshChecks(userDataDir(), collectCheckIds(getSettings()), {
      apiKey: getApiKey(userDataDir())
    })
  );

  /* ---------------------- Steam Web API Key ---------------------- */

  ipcMain.handle('steam:getApiKey', () => getApiKey(userDataDir()));
  ipcMain.handle('steam:setApiKey', (_e, key) => setApiKey(userDataDir(), key));

  ipcMain.handle('cover:set', async (_e, sourceId, imagePath) => {    const key = String(sourceId || '');
    if (!key) return null;

    let src = imagePath ? String(imagePath) : null;
    if (!src) {
      const r = await dialog.showOpenDialog({
        title: '选择封面图片',
        properties: ['openFile'],
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }]
      });
      if (r.canceled || !r.filePaths.length) return null;
      src = r.filePaths[0];
    }
    if (!fs.existsSync(src)) throw new Error(`图片不存在：${src}`);

    fs.mkdirSync(coverDir(), { recursive: true });
    const safe = safeKey(key);
    for (const ext of COVER_EXTS) {
      const old = path.join(coverDir(), safe + ext);
      if (fs.existsSync(old)) fs.unlinkSync(old);
    }
    let ext = path.extname(src).toLowerCase();
    if (!COVER_EXTS.includes(ext)) ext = '.png';
    const dest = path.join(coverDir(), safe + ext);
    fs.copyFileSync(src, dest);
    return dest;
  });

  /* -------------------------------- 分类 -------------------------------- */

  ipcMain.handle('categories:get', () => getCategories());
  ipcMain.handle('categories:setMod', (_e, key, tags) => setModCategories(key, tags));
  ipcMain.handle('categories:save', (_e, data) => saveCategories(data));
  ipcMain.handle('categories:addCustom', (_e, name) => addCustomCategory(name));
  ipcMain.handle('categories:deleteTag', (_e, name) => deleteCategory(name));

  /* ------------------------------ 关联 mod ------------------------------ */

  ipcMain.handle('relations:set', (_e, key, keys) => setRelations(userDataDir(), key, keys));

  /* ---------------------------- 版本对比动作 ---------------------------- */

  ipcMain.handle('compare:diff', (_e, localId) => {
    const s = getSettings();
    const local = scanDir('local', s.localModsDir).find((m) => m.id === localId);
    if (!local) return null;
    const workshop = scanDir('workshop', s.workshopModsDir);
    attachCounterparts([local], workshop, s.installedWorkshopDir);
    void statusOf;
    return { local, workshop: local.counterpart };
  });

  /** 用创意工坊版覆盖本地版：先把本地状态存成快照（可回滚），再复制工坊版进来 */
  ipcMain.handle('compare:overwrite', (_e, localId, workshopId) => {
    const s = getSettings();
    const localDir = path.join(s.localModsDir, localId);
    const srcDir = path.join(s.workshopModsDir, workshopId);
    if (!fs.existsSync(localDir)) throw new Error(`本地 mod 文件夹不存在：${localDir}`);
    if (!fs.existsSync(srcDir)) throw new Error(`创意工坊 mod 文件夹不存在：${srcDir}`);

    const snap = createSnapshot(s, localId, { label: '覆盖前的本地版本' });
    try {
      fs.rmSync(localDir, { recursive: true, force: true });
      copyDir(srcDir, localDir);
    } catch (e) {
      // 失败就用刚存的快照还原回去，别把用户的本地版弄丢
      try {
        restoreSnapshot(s, localId, snap.id, { keepCurrent: false });
      } catch {
        /* 忽略 */
      }
      throw e;
    }
    return { ok: true, snapshotId: snap.id };
  });

  /** 把创意工坊 mod 复制成新的本地 mod */
  ipcMain.handle('compare:copyToLocal', (_e, workshopId, newName) => {
    const s = getSettings();
    const srcDir = path.join(s.workshopModsDir, workshopId);
    const name = String(newName || '').trim();
    if (!name) throw new Error('请填写新文件夹名称');
    if (/[\\/:*?"<>|]/.test(name)) throw new Error('名称不能包含 \\ / : * ? " < > |');
    if (!fs.existsSync(srcDir)) throw new Error(`创意工坊 mod 文件夹不存在：${srcDir}`);

    const destDir = path.join(s.localModsDir, name);
    if (fs.existsSync(destDir)) throw new Error(`本地已存在同名文件夹：${destDir}`);

    copyDir(srcDir, destDir);

    // 让 filelist.xml 的 name 与新文件夹名一致（合集里的 <Local name> 才能解析到）
    const fl = path.join(destDir, 'filelist.xml');
    if (fs.existsSync(fl)) {
      const raw = stripBom(fs.readFileSync(fl, 'utf8'));
      const next = raw.replace(/<contentpackage\b[^>]*>/i, (tag) =>
        tag.replace(/\bname\s*=\s*"[^"]*"/i, `name="${xmlEscape(name)}"`)
      );
      fs.writeFileSync(fl, next, 'utf8');
    }
    return { ok: true, newFolder: destDir };
  });

  /* -------------------------------- 更新 -------------------------------- */

  registerUpdaterIpc(ipcMain);

  /* ------------------------------- 启动游戏 ------------------------------- */

  ipcMain.handle('game:launch', async () => {
    const s = getSettings();
    if (!s.gameDir) throw new Error('还没设置游戏根目录，请先到「设置」里指定');

    const exe = path.join(s.gameDir, 'Barotrauma.exe');
    if (fs.existsSync(exe)) {
      const child = spawn(exe, [], { detached: true, stdio: 'ignore', cwd: s.gameDir });
      child.unref();
      return { ok: true, via: 'exe' };
    }
    // 找不到 exe 就交给 Steam 启动（潜渊症 AppID = 602960）
    await shell.openExternal('steam://rungameid/602960');
    return { ok: true, via: 'steam' };
  });

  /* ------------------------------- 快照 ------------------------------- */

  ipcMain.handle('snapshot:list', (_e, modName) => {
    const s = getSettings();
    return { items: listSnapshots(s, modName), summary: snapshotSummary(s, modName) };
  });

  ipcMain.handle('snapshot:create', (_e, modName) => {
    const s = getSettings();
    return createSnapshot(s, modName, { label: '手动创建' });
  });

  ipcMain.handle('snapshot:restore', (_e, modName, id) => {
    const s = getSettings();
    return restoreSnapshot(s, modName, id);
  });

  ipcMain.handle('snapshot:delete', (_e, modName, id) => {
    const s = getSettings();
    return deleteSnapshot(s, modName, id);
  });

  /* ---------------------------- 删除本地 mod ---------------------------- */

  ipcMain.handle('localmod:footprint', (_e, modName) =>
    localModFootprint(getSettings(), String(modName || ''))
  );

  /** 一键删除本地 mod：mod 文件夹 + 它的历史快照（可选同时从合集里摘掉引用） */
  ipcMain.handle('localmod:delete', (_e, modName, removeFromModlists) => {
    const s = getSettings();
    const name = String(modName || '');
    if (!name) throw new Error('缺少 mod 名称');

    const removedFromModlists = [];
    if (removeFromModlists) {
      const { summaries } = readAllModlists(s.modListsDir);
      for (const sum of summaries) {
        try {
          const full = getModlist(s.modListsDir, sum.fileName);
          if (!full || !full.entries.some((e) => e.type === 'local' && e.name === name)) continue;
          removeModFromModlist(s.modListsDir, sum.fileName, { type: 'local', name });
          removedFromModlists.push(sum.name);
        } catch {
          /* 单个合集出错不影响其它的 */
        }
      }
    }

    const r = deleteLocalModFiles(s, name);
    // 顺手清掉它的关联关系，免得留下指向已删 mod 的死链
    removeRelations(userDataDir(), `local:${name}`);
    return { ...r, removedFromModlists };
  });

  /* --------------------------- 工坊 mod 一键备份 --------------------------- */

  let backupRunning = false;
  let backupCancelled = false;

  /** scope='delisted' 时只备份「工坊上已经下架」的那些 */
  const measure = (sender, scope) =>
    planWorkshopBackup(
      getSettings(),
      {
        onStep: (done, total, current) =>
          send(sender, 'backup:progress', { phase: 'planning', done, total, current })
      },
      { onlyDelisted: scope === 'delisted', checks: readChecks(userDataDir()) }
    );

  /** 只算不复制：给出数量与总体积，让用户决定要不要执行 */
  ipcMain.handle('backup:plan', (event, scope) => measure(event.sender, scope));

  ipcMain.handle('backup:start', (event, scope) => {
    if (backupRunning) throw new Error('已有备份任务在进行中');
    const s = getSettings();
    const sender = event.sender;

    backupRunning = true;
    backupCancelled = false;
    try {
      const plan = measure(sender, scope);
      return runWorkshopBackup(s, plan, {
        onProgress: (p) => send(sender, 'backup:progress', p),
        isCancelled: () => backupCancelled
      });
    } finally {
      backupRunning = false;
    }
  });

  ipcMain.handle('backup:cancel', () => {
    backupCancelled = true;
    return true;
  });

  /* ------------------- 把 Steam 已下载的工坊更新同步进游戏 ------------------- */

  let syncRunning = false;
  let syncCancelled = false;

  /** 只查不写：列出「Steam 已下载、游戏还没装」的 mod 及体积 */
  ipcMain.handle('installsync:plan', (event) =>
    planInstallSync(getSettings(), {
      checks: readChecks(userDataDir()),
      onStep: (done, total, current) =>
        send(event.sender, 'installsync:progress', { phase: 'planning', done, total, current })
    })
  );

  ipcMain.handle('installsync:start', (event) => {
    if (syncRunning) throw new Error('已有同步任务在进行中');
    const s = getSettings();
    const sender = event.sender;
    syncRunning = true;
    syncCancelled = false;
    try {
      const plan = planInstallSync(s, { checks: readChecks(userDataDir()) });
      return runInstallSync(s, plan.items, {
        onProgress: (p) => send(sender, 'installsync:progress', p),
        isCancelled: () => syncCancelled
      });
    } finally {
      syncRunning = false;
    }
  });

  ipcMain.handle('installsync:cancel', () => {
    syncCancelled = true;
    return true;
  });

  /* -------------------------------- 杂项 -------------------------------- */

  ipcMain.handle('shell:openPath', async (_e, p) => {
    if (!p) return '路径为空';
    const err = await shell.openPath(String(p));
    return err || null;
  });

  ipcMain.handle('shell:openExternal', async (_e, url) => {
    const u = String(url || '');
    if (!/^https?:\/\//i.test(u)) throw new Error('非法链接');
    await shell.openExternal(u);
    return true;
  });

  /** 在 Steam 客户端里打开工坊页面（网页版由界面自己用 openExternal 保底） */
  ipcMain.handle('shell:openWorkshopInSteam', (_e, id) =>
    openWorkshopInSteam(getSettings(), id, {
      openExternal: (u) => {
        shell.openExternal(u).catch(() => {});
      }
    })
  );

  /* ---------------------------- 浏览创意工坊 ---------------------------- */

  ipcMain.handle('workshop:browse', (_e, params) =>
    browseWorkshop(params || {}, { key: getApiKey(userDataDir()) })
  );

  /** 分类标签：从接口结果里统计出来，不硬编码 */
  ipcMain.handle('workshop:browseTags', () =>
    browseWorkshopTags({ key: getApiKey(userDataDir()) })
  );

  /** 浏览页详情：工坊条目页面里的封面与截图（截图那个接口不给，只能读页面） */
  ipcMain.handle('workshop:media', (_e, id, force) =>
    getWorkshopMedia(id, { cacheDir: path.join(userDataDir(), 'workshop-pages'), force: !!force })
  );
}

module.exports = { registerIpc, scanAll, app };
