const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const { detectPaths } = require('./detect');

/** Electron 的 app.getPath 没有 'localAppData'，只能靠环境变量（带回退） */
function localAppDataDir() {
  return process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local');
}

let detected = null;
let cache = null;

/** 自动检测各目录并缓存结果 */
function redetect() {
  detected = detectPaths({ localAppData: localAppDataDir() });
  return detected;
}

function defaults() {
  return detected || redetect();
}

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function getSettings() {
  if (cache) return cache;
  const d = defaults();
  try {
    const saved = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
    cache = { ...d, ...saved };
  } catch {
    // 首次运行：直接用自动检测的结果，检测不到的就是空（界面上让用户自己填）
    cache = { ...d };
  }
  return cache;
}

function saveSettings(s) {
  cache = { ...defaults(), ...(s || {}) };
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(cache, null, 2), 'utf8');
  return cache;
}

/**
 * 备份目录放在 LocalMods 的**同级**（同一个盘，改名是瞬时的，不占额外空间、也不会被游戏当成 mod 扫描到）。
 */
function backupDir(settings) {
  const s = settings || getSettings();
  const parent = s.localModsDir ? path.dirname(s.localModsDir) : s.gameDir || '.';
  return path.join(parent, 'ModManagerBackups');
}

function userDataDir() {
  return app.getPath('userData');
}

module.exports = {
  getSettings,
  saveSettings,
  backupDir,
  userDataDir,
  localAppDataDir,
  redetect,
  defaults
};
