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
const { applyToGame, stamp } = require('./config');
const { registerUpdaterIpc } = require('./updater');
const { copyDir } = require('./fsutil');
const {
  listSnapshots,
  snapshotSummary,
  createSnapshot,
  restoreSnapshot,
  deleteSnapshot,
  planWorkshopBackup,
  runWorkshopBackup
} = require('./backup');
const {
  fetchDetails,
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
function readAllModlists(dir) {
  let files;
  try {
    files = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return { summaries: [], usedIn: new Map() };
  }
  const summaries = [];
  const usedIn = new Map();

  for (const f of files) {
    if (!f.isFile() || !/\.xml$/i.test(f.name)) continue;
    let ml;
    try {
      ml = parseModlistFile(path.join(dir, f.name));
    } catch {
      continue;
    }
    summaries.push({ fileName: ml.fileName, name: ml.name, count: ml.entries.length });
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

function scanAll() {
  const s = getSettings();
  const warnings = [];

  if (!fs.existsSync(s.localModsDir)) warnings.push(`本地 mod 目录不存在：${s.localModsDir}`);
  if (!fs.existsSync(s.workshopModsDir)) warnings.push(`创意工坊 mod 目录不存在：${s.workshopModsDir}`);
  if (!fs.existsSync(s.modListsDir)) warnings.push(`合集目录不存在：${s.modListsDir}`);
  if (!fs.existsSync(s.configPlayerPath)) warnings.push(`找不到配置文件：${s.configPlayerPath}`);

  const local = scanDir('local', s.localModsDir);
  const workshop = scanDir('workshop', s.workshopModsDir);
  attachCounterparts(local, workshop, s.installedWorkshopDir);

  const cats = getCategories();
  const removed = cats.removed || [];
  const previewDir = path.join(userDataDir(), 'previews');
  const { summaries, usedIn } = readAllModlists(s.modListsDir);

  const mods = [...workshop, ...local];
  for (const m of mods) {
    const key = `${m.source}:${m.id}`;
    m.categories = Array.isArray(cats.mods[key]) ? [...cats.mods[key]] : [];
    // 被删掉的标签不能继续出现在关键词自动分类里
    m.autoCategories = autoCategorize(m.name).filter((c) => !removed.includes(c));
    m.preview =
      m.source === 'workshop' ? cachedPreview(m.id, previewDir) : findCover(key);
    m.usedIn = usedIn.get(key) || [];
  }

  return { mods, modlists: summaries, categories: cats, settings: s, warnings };
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

  ipcMain.handle('modlist:apply', (_e, name, entries) => {
    void name;
    const s = getSettings();
    const r = applyToGame(s, entries);
    return { ok: true, backup: r.backup, missing: r.missing, count: r.count };
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

  ipcMain.handle('cover:set', async (_e, sourceId, imagePath) => {
    const key = String(sourceId || '');
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

  /* --------------------------- 工坊 mod 一键备份 --------------------------- */

  let backupRunning = false;
  let backupCancelled = false;

  const measure = (sender) =>
    planWorkshopBackup(getSettings(), {
      onStep: (done, total, current) =>
        send(sender, 'backup:progress', { phase: 'planning', done, total, current })
    });

  /** 只算不复制：给出数量与总体积，让用户决定要不要执行 */
  ipcMain.handle('backup:plan', (event) => measure(event.sender));

  ipcMain.handle('backup:start', (event) => {
    if (backupRunning) throw new Error('已有备份任务在进行中');
    const s = getSettings();
    const sender = event.sender;

    backupRunning = true;
    backupCancelled = false;
    try {
      const plan = measure(sender);
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
}

module.exports = { registerIpc, scanAll, app };
