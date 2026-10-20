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
const { openWorkshopInSteam, ID_RE, assertWorkshopId } = require('./openinsteam');
const { getMedia: getWorkshopMedia } = require('./workshoppage');
const { translateText, normalizeTarget } = require('./translate');
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
const { checkForWorkshopUpdate, applyWorkshopUpdate } = require('./workshopupdate');
const { copyDir } = require('./fsutil');
const {
  getRelations,
  setRelations,
  removeRelations
} = require('./relations');
const { getNames, setCustomName, removeCustomName } = require('./names');
const {
  readWorkshopAcf,
  installTimeOf,
  readChecks,
  checksStale,
  refreshChecks,
  isDelisted
} = require('./workshopsync');
const { getApiKey, setApiKey } = require('./apikey');
const { features, DISABLED_REASON } = require('./variant');
const { setUiLang, uiLang, mt } = require('./uilang');
const {
  listSnapshots,
  snapshotSummary,
  createSnapshot,
  restoreSnapshot,
  deleteSnapshot,
  localModFootprint,
  deleteLocalModFiles,
  assertModDir,
  planWorkshopBackup,
  runWorkshopBackup
} = require('./backup');
const {
  fetchDetails,
  getWorkshopDetails,
  steamLangCode,
  downloadPreview,
  cachedPreview,
  missFresh,
  writeMiss,
  createQueue,
  prewarmApiHosts,
  loadApiHostPref
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

/**
 * 当前变体提供哪些功能（和渲染层 src/features.ts 同源）。
 * 主进程用它做 IPC 守卫：界面藏起来只是不给入口，通道还在，边界必须落在这一侧。
 */
const FEATURES = features();

/**
 * 这个变体有没有"工坊下架检查"。
 * 创意工坊版没有：它依赖 Steam Web API Key（没 Key 时只能抓网页，分不清"已下架"和"设为私有"，不可靠）。
 */
const delistedCheck = FEATURES.delistedCheck;

const COVER_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'];

/**
 * ---- 渲染层参数的边界 ----
 *
 * 下面这些 handler 的参数全部来自渲染层。渲染层本身是可信的，但它是**唯一**能让外部内容
 * （工坊描述、导入的合集文件、mod 里的 XML）影响到主进程的地方，所以凡是"参数会被拼进
 * 文件路径"的 handler，边界校验必须落在主进程这一侧 —— preload 只是转发，拦不住任何东西。
 */

/** 参数必须是纯数字工坊 id，并返回规范化后的字符串（拼路径/拼 URL 前先过这里） */
function numId(v, what) {
  return assertWorkshopId(v, what);
}

/** 解析成绝对路径，并确认它落在 root 之内（不是 root 本身） */
function insideDir(root, unsafe, what) {
  const base = path.resolve(String(root || '.'));
  const p = path.resolve(base, String(unsafe == null ? '' : unsafe));
  if (p === base || !p.startsWith(base + path.sep)) throw new Error(`非法的${what}`);
  return p;
}

function safeKey(key) {
  return String(key || '').replace(/[\\/:*?"<>|]/g, '_');
}

function coverDir() {
  return path.join(userDataDir(), 'covers');
}

/**
 * 给系统文件对话框用的默认目录：存在、而且确实是个目录才返回，否则返回 undefined
 * （让 Electron 自己决定，别把一个不存在的路径塞进去 —— 那样对话框会退到别处甚至报错）。
 */
function dirIfExists(p) {
  const s = String(p || '').trim();
  if (!s) return undefined;
  try {
    return fs.statSync(s).isDirectory() ? s : undefined;
  } catch {
    return undefined;
  }
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
  /** 用户自定义的显示名（names.json），key 和 categories/relations 一致 */
  const customNames = getNames(userDataDir());

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
    /*
     * 自定义显示名：`name` 是**界面显示用**的（有自定义名就用它），
     * 真名留在 `realName` —— 存档匹配（存档里记的是 contentpackage 名）、
     * 关键词自动分类都还得按真名来，否则改个名字就丢标签、存档也对不上合集。
     */
    m.realName = m.name;
    const custom = customNames[key];
    m.name = custom || m.realName;
    m.nameCustom = !!custom;
    // 被删掉的标签不能继续出现在关键词自动分类里
    m.autoCategories = autoCategorize(m.realName).filter((c) => !removed.includes(c));
    /*
     * 封面：**手动设的优先**，其次才是工坊缓存下来的预览图。
     *
     * 以前工坊 mod 这一行只查 cachedPreview，于是「给工坊 mod 设了封面，一刷新就没了」
     * （用户评论里反馈的"链接完刷新就消失了"就是这个）。本地 mod 走的是 findCover，
     * 所以只有工坊 mod 会中招 —— 而大家装的绝大多数是工坊 mod。
     */
    const pickedCover = findCover(key);
    m.coverManual = !!pickedCover;
    m.preview =
      pickedCover || (m.source === 'workshop' ? cachedPreview(m.id, previewDir) : null);
    m.usedIn = usedIn.get(key) || [];
    // 工坊 mod：条目本身还在不在；本地 mod：它对应的工坊来源还在不在
    const entry = m.source === 'workshop' ? checks[m.id] : checks[m.steamworkshopid];
    /*
     * 创意工坊版没有"下架检查"（它依赖 Web API Key），所以直接恒为 false：
     * 徽章、筛选、「只备份已下架的」那几处 UI 也都由 features.delistedCheck 关掉了，
     * 这里保持一致，免得数据里冒出一个界面不解释的状态。
     */
    m.delisted = delistedCheck ? isDelisted(checks, m.source === 'workshop' ? m.id : m.steamworkshopid) : false;
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
    checksStale: delistedCheck ? checksStale(checks, checkIds) : false,
    /** 已核实为下架的数量 */
    checksDelisted: delistedCheck ? checkValues.filter((c) => c && c.exists === false).length : 0,
    /** 没能核实的数量（Steam 挡住时会有） */
    checksUnknown: delistedCheck ? checkValues.filter((c) => c && c.exists === null).length : 0,
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
  /*
   * 启动时：
   *   1. 读回上次记录的"哪个 API 域名坏了"（否则重启后第一个请求又要白等一次超时）；
   *   2. 并行探一次两个域名，把先答上来的记为偏好。
   * 都不阻塞启动、失败也无所谓 —— 正常请求流程有自己的回退。
   */
  loadApiHostPref(userDataDir());
  prewarmApiHosts();

  /* -------------------------------- 设置 -------------------------------- */

  /*
   * 渲染层把当前界面语言告诉主进程。
   * 只有一类文案绕不过主进程：**原生文件/文件夹对话框的标题与筛选器名**（见 services/uilang.js）。
   * 业务错误提示不走这里（那部分要改成错误码，见 src/i18n/mainMessages.ts）。
   */
  ipcMain.handle('app:setUiLang', (_e, lang) => {
    setUiLang(lang);
    return uiLang();
  });

  ipcMain.handle('settings:get', () => getSettings());
  ipcMain.handle('settings:save', (_e, s) => {
    saveSettings(s);
    return scanAll();
  });

  /** 重新自动检测目录（只返回结果，不写入设置） */
  ipcMain.handle('paths:detect', () => redetect());

  ipcMain.handle('dialog:pickFolder', async (_e, title) => {
    const r = await dialog.showOpenDialog({
      title: title || mt('选择文件夹', 'Select a folder'),
      properties: ['openDirectory']
    });
    return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
  });

  ipcMain.handle('dialog:pickFile', async (_e, title, filters) => {
    const r = await dialog.showOpenDialog({
      title: title || mt('选择文件', 'Select a file'),
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
      title: mt('导出合集', 'Export collection'),
      defaultPath: suggestFileName(name, fmt),
      filters: [
        {
          name:
            fmt === 'xml'
              ? mt('游戏合集文件', 'Game collection file')
              : fmt === 'json'
                ? 'JSON'
                : mt('文本', 'Text'),
          extensions: [fmt]
        },
        { name: mt('全部文件', 'All files'), extensions: ['*'] }
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
    // id 会拼成 <userData>\previews\<id>.<ext> / <id>.miss，非数字直接丢掉
    // （不能抛错：ids 是一整批，一个坏值不该让整批封面失败）
    const list = (Array.isArray(ids) ? ids : []).map(String).filter((x) => ID_RE.test(x));

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

  ipcMain.handle('workshop:details', (_e, id, force) => {
    // 这条走 IPublishedFileService，需要 Key ⇒ 创意工坊版关掉
    if (!FEATURES.browseWorkshop) throw new Error(DISABLED_REASON);
    return getWorkshopDetails(numId(id), path.join(userDataDir(), 'workshop'), {
      force: !!force,
      // 配了 key 才能拿本地化描述（老接口永远只给基础语言）——
      // 语言**跟随界面**：英文界面要英文描述，中文界面要中文描述。
      // 以前写死简中，于是英文用户看到中文描述、还被当成"已经是你的语言"。
      apiKey: getApiKey(userDataDir()),
      language: steamLangCode(uiLang())
    });
  });

  /**
   * 把描述机器翻译成**当前界面语言**（作者没提供该语言版本时的兜底）。
   *
   * 目标语言优先取渲染层传来的界面语言（它最权威：用户可能刚切过），
   * 拿不到时退回主进程记录的 `uiLang()`。英文用户拿到英文译文，中文用户拿到中文。
   */
  ipcMain.handle('translate:text', (_e, text, lang) =>
    translateText(text, {
      target: normalizeTarget(lang || uiLang()),
      cacheDir: path.join(userDataDir(), 'translations')
    })
  );

  /** 联网刷新「工坊条目还在不在」的缓存（作者下架后就查不到了） */
  ipcMain.handle('workshop:refreshChecks', () => {
    if (!FEATURES.delistedCheck) throw new Error(DISABLED_REASON);
    return refreshChecks(userDataDir(), collectCheckIds(getSettings()), {
      apiKey: getApiKey(userDataDir())
    });
  });

  /* ---------------------- Steam Web API Key ---------------------- */

  ipcMain.handle('steam:getApiKey', () => {
    if (!FEATURES.apiKey) return '';
    return getApiKey(userDataDir());
  });
  ipcMain.handle('steam:setApiKey', (_e, key) => {
    if (!FEATURES.apiKey) throw new Error(DISABLED_REASON);
    return setApiKey(userDataDir(), key);
  });

  /**
   * 设置本地封面。
   * @param sourceId mod 的 key（workshop:123 / local:文件夹名）
   * @param imagePath 直接给图片路径（调用方已经选好了）；不给就弹系统对话框
   * @param modDir mod 自己的文件夹。对话框默认停在这里 —— 以前没给 defaultPath，
   *   系统会落在「文档」里，用户得自己翻回 mod 文件夹（用户反馈过）。
   */
  ipcMain.handle('cover:set', async (_e, sourceId, imagePath, modDir) => {
    const key = String(sourceId || '');
    if (!key) return null;

    let src = imagePath ? String(imagePath) : null;
    if (!src) {
      const r = await dialog.showOpenDialog({
        title: mt('选择封面图片', 'Choose a cover image'),
        defaultPath: dirIfExists(modDir),
        properties: ['openFile'],
        filters: [
          { name: mt('图片', 'Images'), extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }
        ]
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

  /**
   * 恢复默认封面：删掉手动设的那张图。
   *
   * 返回两样东西给界面用：
   *   removed —— 到底删掉了没有（没设过就是 false，按钮本来也不该显示）
   *   preview —— 删掉之后应该显示哪张。工坊 mod 有官方预览缓存就用它，
   *              本地 mod 没有"官方图"这回事，回落到 null（界面显示占位色块）。
   * 界面拿到 preview 直接换上，不用再自己猜或等下一次扫描。
   */
  ipcMain.handle('cover:clear', (_e, sourceId) => {
    const key = String(sourceId || '');
    if (!key) return { removed: false, preview: null };

    let removed = false;
    for (const ext of COVER_EXTS) {
      const old = path.join(coverDir(), safeKey(key) + ext);
      if (fs.existsSync(old)) {
        fs.unlinkSync(old);
        removed = true;
      }
    }

    const wsId = key.startsWith('workshop:') ? key.slice('workshop:'.length) : '';
    const preview = wsId ? cachedPreview(wsId, path.join(userDataDir(), 'previews')) : null;
    return { removed, preview };
  });

  /* -------------------------------- 分类 -------------------------------- */

  ipcMain.handle('categories:get', () => getCategories());
  ipcMain.handle('categories:setMod', (_e, key, tags) => setModCategories(key, tags));
  ipcMain.handle('categories:save', (_e, data) => saveCategories(data));
  ipcMain.handle('categories:addCustom', (_e, name) => addCustomCategory(name));
  ipcMain.handle('categories:deleteTag', (_e, name) => deleteCategory(name));

  /* ------------------------------ 关联 mod ------------------------------ */

  ipcMain.handle('relations:set', (_e, key, keys) => setRelations(userDataDir(), key, keys));

  /* --------------------------- 自定义显示名 --------------------------- */

  // 只影响界面上显示的名字；文件、文件夹、合集条目一个字节都不动
  ipcMain.handle('mod:setName', (_e, key, name) => setCustomName(userDataDir(), key, name));
  ipcMain.handle('mod:clearName', (_e, key) => removeCustomName(userDataDir(), key));

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
    // 这两个参数会被拼成路径，紧接着 rmSync 递归删除 —— 边界必须在这里卡死
    const localDir = insideDir(s.localModsDir, localId, '本地 mod 名称');
    const srcDir = insideDir(s.workshopModsDir, numId(workshopId, '工坊 id'), '工坊 mod 名称');
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
    const srcDir = insideDir(s.workshopModsDir, numId(workshopId, '工坊 id'), '工坊 mod 名称');
    const name = String(newName || '').trim();
    if (!name) throw new Error('请填写新文件夹名称');
    if (/[\\/:*?"<>|]/.test(name)) throw new Error('名称不能包含 \\ / : * ? " < > |');
    if (!fs.existsSync(srcDir)) throw new Error(`创意工坊 mod 文件夹不存在：${srcDir}`);

    const destDir = insideDir(s.localModsDir, name, '新文件夹名称');
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

  /*
   * 自更新只在完整版注册。
   * 创意工坊版的更新走另一条路：用户订阅我们的工坊条目 → Steam 把新版下载进
   * workshop\content\602960\<id>\ → 程序启动时比较那份里的版本号，提示重装。
   * 两条通道同时开会让版本号漂移，所以工坊版直接把 electron-updater 关掉。
   */
  if (FEATURES.autoUpdater) registerUpdaterIpc(ipcMain);

  /* ------------------------- 工坊版：检测工坊里的新版 ------------------------- */
  /*
   * 创意工坊版的自更新：Steam 把新版下载进 workshop\content\602960\<条目 id>\，
   * 但不会覆盖已经装到桌面/用户目录的那份，所以需要自己升级。
   * 纯本地文件读取：不联网、不需要 Web API Key。
   * 完整版也注册这个通道（返回找到/没找到），但界面不会显示 —— 它走 electron-updater。
   */
  ipcMain.handle('updater:workshopCheck', () => {
    const s = getSettings();
    const contentDir = s.workshopModsDir || '';
    return checkForWorkshopUpdate(contentDir, app.getVersion());
  });

  /*
   * 一键升级：运行工坊条目里的安装包（`--updated --force-run`），覆盖已装的程序。
   *
   * 先让 IPC 把结果回给渲染层（界面要显示"正在更新"），再延时退出。
   * 退出这一步其实不是必需的 —— NSIS 的升级分支会处理正在运行的实例 ——
   * 但主动退更干净，也避免安装过程中界面还开着。
   */
  ipcMain.handle('updater:workshopApply', () => {
    const s = getSettings();
    const r = checkForWorkshopUpdate(s.workshopModsDir || '', app.getVersion());
    if (!r.newer || !r.dir) return { ok: false, reason: '没有可用的更新' };

    const applied = applyWorkshopUpdate({ itemDir: r.dir, version: r.workshopVersion });
    if (applied.ok) {
      // 给渲染层一点时间把"正在更新"显示出来
      setTimeout(() => app.quit(), 900);
    }
    return applied;
  });

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
    assertModDir(s, modName);
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

  ipcMain.handle('localmod:footprint', (_e, modName) => {
    const s = getSettings();
    assertModDir(s, modName);
    return localModFootprint(s, modName);
  });

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

  ipcMain.handle('backup:start', async (event, scope) => {
    if (backupRunning) throw new Error('已有备份任务在进行中');
    const s = getSettings();
    const sender = event.sender;

    backupRunning = true;
    backupCancelled = false;
    try {
      const plan = measure(sender, scope);
      // 必须 await：否则 finally 会在复制开始前就把 running 标志清掉，
      // 界面又能发起第二个任务，同时两个任务抢同一个目录。
      return await runWorkshopBackup(s, plan, {
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

  ipcMain.handle('installsync:start', async (event) => {
    if (syncRunning) throw new Error('已有同步任务在进行中');
    const s = getSettings();
    const sender = event.sender;
    syncRunning = true;
    syncCancelled = false;
    try {
      const plan = planInstallSync(s, { checks: readChecks(userDataDir()) });
      // 同 backup:start：不 await 的话 finally 会提前清标志，界面能并发发起第二次同步
      return await runInstallSync(s, plan.items, {
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

  /*
   * 只允许"打开目录"。
   * shell.openPath 在 Windows 上对 .exe / .lnk 是**直接执行**，等于把渲染层参数变成
   * 任意程序启动；界面上真正需要它打开的都是文件夹（mod 目录、存档目录、备份目录）。
   * 文件走 openExternal 或各自的详情入口。
   */
  ipcMain.handle('shell:openPath', async (_e, p) => {
    if (!p) return '路径为空';
    const target = path.resolve(String(p));
    let st = null;
    try {
      st = fs.statSync(target);
    } catch {
      return '路径不存在';
    }
    if (!st.isDirectory()) return '只能打开文件夹';
    const err = await shell.openPath(target);
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
    openWorkshopInSteam(getSettings(), numId(id), {
      openExternal: (u) => {
        shell.openExternal(u).catch(() => {});
      }
    })
  );

  /* ---------------------------- 浏览创意工坊 ---------------------------- */
  /*
   * 下面这些都要 Steam Web API Key，创意工坊版整块关掉。
   * 守卫放在主进程（而不是只隐藏界面）：界面藏起来只是不给入口，IPC 通道还在，
   * 直接调用仍会跑到这里 —— 边界必须落在主进程这一侧。
   */

  ipcMain.handle('workshop:browse', (_e, params) => {
    if (!FEATURES.browseWorkshop) throw new Error(DISABLED_REASON);
    return browseWorkshop(params || {}, { key: getApiKey(userDataDir()) });
  });

  /** 分类标签：从接口结果里统计出来，不硬编码 */
  ipcMain.handle('workshop:browseTags', () => {
    if (!FEATURES.browseWorkshop) throw new Error(DISABLED_REASON);
    return browseWorkshopTags({ key: getApiKey(userDataDir()) });
  });

  /** 浏览页详情：工坊条目页面里的封面与截图（截图那个接口不给，只能读页面） */
  ipcMain.handle('workshop:media', (_e, id, force) => {
    // 只服务于「浏览工坊」页 ⇒ 工坊版一并关掉
    if (!FEATURES.browseWorkshop) throw new Error(DISABLED_REASON);
    return getWorkshopMedia(numId(id), {
      cacheDir: path.join(userDataDir(), 'workshop-pages'),
      force: !!force
    });
  });
}

module.exports = { registerIpc, scanAll, app };
