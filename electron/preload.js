const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('api', {
  // settings
  getSettings: () => invoke('settings:get'),
  saveSettings: (s) => invoke('settings:save', s),
  pickFolder: (title) => invoke('dialog:pickFolder', title),
  pickFile: (title, filters) => invoke('dialog:pickFile', title, filters),
  pathExists: (p) => invoke('fs:exists', p),
  detectPaths: () => invoke('paths:detect'),

  // scan
  scan: () => invoke('scan'),

  // modlists
  getModlist: (fileName) => invoke('modlist:get', fileName),
  saveModlist: (fileName, name, entries) => invoke('modlist:save', fileName, name, entries),
  deleteModlist: (fileName) => invoke('modlist:delete', fileName),
  addModToModlist: (fileName, name, entry) => invoke('modlist:addMod', fileName, name, entry),
  removeModFromModlist: (fileName, entry) => invoke('modlist:removeMod', fileName, entry),
  applyModlist: (name, entries) => invoke('modlist:apply', name, entries),

  // 存档：读出每个存档当时启用了哪些 mod
  listSaves: () => invoke('saves:list'),

  // previews
  fetchPreviews: (ids) => invoke('previews:fetch', ids),
  onPreviewReady: (cb) => {
    ipcRenderer.on('previews:ready', (_e, payload) => cb(payload));
  },

  // 工坊详情（描述 / 标签 / 热度）
  getWorkshopDetails: (id, force) => invoke('workshop:details', id, force),

  // 刷新「工坊条目还在不在」的缓存
  refreshWorkshopChecks: () => invoke('workshop:refreshChecks'),

  // Steam Web API Key（有就走官方接口检查下架状态）
  getSteamApiKey: () => invoke('steam:getApiKey'),
  setSteamApiKey: (key) => invoke('steam:setApiKey', key),

  // covers (local mod manual cover)
  setLocalCover: (sourceId, imagePath) => invoke('cover:set', sourceId, imagePath),

  // categories
  getCategories: () => invoke('categories:get'),
  setModCategories: (sourceId, tags) => invoke('categories:setMod', sourceId, tags),
  saveCategories: (data) => invoke('categories:save', data),
  addCustomCategory: (name) => invoke('categories:addCustom', name),
  deleteCategory: (name) => invoke('categories:deleteTag', name),

  // 关联 mod（前置需求）
  setRelations: (key, keys) => invoke('relations:set', key, keys),

  // version compare actions
  getVersionDiff: (localId) => invoke('compare:diff', localId),
  overwriteLocalWithWorkshop: (localId, workshopId) => invoke('compare:overwrite', localId, workshopId),
  copyWorkshopToLocal: (workshopId, newName) => invoke('compare:copyToLocal', workshopId, newName),

  // 启动游戏
  launchGame: () => invoke('game:launch'),

  // 快照 / 回滚（本地 mod 的历史版本）
  listSnapshots: (modName) => invoke('snapshot:list', modName),
  createSnapshot: (modName) => invoke('snapshot:create', modName),
  restoreSnapshot: (modName, id) => invoke('snapshot:restore', modName, id),
  deleteSnapshot: (modName, id) => invoke('snapshot:delete', modName, id),

  // 删除本地 mod（连它的历史快照一起删）
  localModFootprint: (modName) => invoke('localmod:footprint', modName),
  deleteLocalMod: (modName, removeFromModlists) =>
    invoke('localmod:delete', modName, removeFromModlists),

  // 一键备份所有工坊 mod 到 LocalMods（scope='delisted' 时只备份已下架的）
  planWorkshopBackup: (scope) => invoke('backup:plan', scope),
  startWorkshopBackup: (scope) => invoke('backup:start', scope),
  cancelWorkshopBackup: () => invoke('backup:cancel'),
  onBackupProgress: (cb) => {
    ipcRenderer.on('backup:progress', (_e, progress) => cb(progress));
  },

  // 更新
  updaterStatus: () => invoke('updater:status'),
  updaterCheck: () => invoke('updater:check'),
  updaterDownload: () => invoke('updater:download'),
  updaterInstall: () => invoke('updater:install'),
  onUpdaterEvent: (cb) => {
    ipcRenderer.on('updater:event', (_e, state) => cb(state));
  },

  // misc
  openPath: (p) => invoke('shell:openPath', p),
  openModFolder: (p) => invoke('shell:openPath', p),
  openExternal: (url) => invoke('shell:openExternal', url),
  getWorkshopPage: (id) => invoke('shell:openExternal', `https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`)
});
