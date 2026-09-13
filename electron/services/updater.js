const { app } = require('electron');

/**
 * 自动更新（仅打包后的安装版可用）。
 *
 * electron-updater 走 GitHub Releases：它会读取最新 release 里的 latest.yml，
 * 与 app.getVersion() 比较，然后下载对应的安装包。
 *
 * 开发模式下不加载 electron-updater（它需要一个已安装的应用），状态直接返回 dev。
 */

const STATE_IDLE = 'idle';

let autoUpdater = null;
let bound = false;

/** 订阅状态的渲染进程 */
const senders = new Set();

let state = {
  status: 'idle', // idle | checking | available | downloading | downloaded | up-to-date | error | unsupported
  supported: false,
  currentVersion: null,
  latestVersion: null,
  releaseNotes: null,
  releaseDate: null,
  progress: null,
  error: null,
  checkedAt: null
};

function isSupported() {
  return app.isPackaged;
}

function snapshot() {
  return { ...state, currentVersion: app.getVersion() };
}

function broadcast() {
  const s = snapshot();
  for (const wc of senders) {
    try {
      if (!wc.isDestroyed()) wc.send('updater:event', s);
    } catch {
      /* 窗口已关闭 */
    }
  }
}

function setState(patch) {
  state = { ...state, ...patch };
  broadcast();
  return snapshot();
}

/** releaseNotes 可能是字符串，也可能是 [{version, note}] */
function normalizeNotes(notes) {
  if (!notes) return null;
  if (typeof notes === 'string') return notes;
  if (Array.isArray(notes)) {
    return notes
      .map((n) => (n && n.note ? `${n.version ? n.version + '\n' : ''}${n.note}` : ''))
      .filter(Boolean)
      .join('\n\n');
  }
  return null;
}

function getAutoUpdater() {
  if (autoUpdater) return autoUpdater;
  // 延迟加载：开发模式下不碰它
  const { autoUpdater: u } = require('electron-updater');
  u.autoDownload = false; // 由用户决定何时下载
  u.autoInstallOnAppQuit = true; // 已下载的话，退出时自动装
  u.logger = null;
  autoUpdater = u;
  return u;
}

function bindEvents() {
  if (bound) return;
  bound = true;
  const u = getAutoUpdater();

  u.on('checking-for-update', () => setState({ status: 'checking', error: null }));

  u.on('update-available', (info) =>
    setState({
      status: 'available',
      error: null,
      latestVersion: info && info.version ? info.version : null,
      releaseNotes: normalizeNotes(info && info.releaseNotes),
      releaseDate: (info && info.releaseDate) || null,
      checkedAt: Date.now()
    })
  );

  u.on('update-not-available', (info) =>
    setState({
      status: 'up-to-date',
      error: null,
      latestVersion: (info && info.version) || app.getVersion(),
      checkedAt: Date.now()
    })
  );

  u.on('download-progress', (p) =>
    setState({
      status: 'downloading',
      error: null,
      progress: {
        percent: p && typeof p.percent === 'number' ? p.percent : 0,
        transferred: p ? p.transferred : 0,
        total: p ? p.total : 0,
        bytesPerSecond: p ? p.bytesPerSecond : 0
      }
    })
  );

  u.on('update-downloaded', (info) =>
    setState({
      status: 'downloaded',
      error: null,
      progress: null,
      latestVersion: (info && info.version) || state.latestVersion
    })
  );

  u.on('error', (e) =>
    setState({ status: 'error', error: String((e && e.message) || e), progress: null })
  );
}

async function check() {
  if (!isSupported()) {
    return setState({ status: 'unsupported', supported: false, error: null, checkedAt: Date.now() });
  }
  if (state.status === 'checking' || state.status === 'downloading') return snapshot();

  setState({ supported: true, status: 'checking', error: null });
  try {
    bindEvents();
    await getAutoUpdater().checkForUpdates();
  } catch (e) {
    setState({ status: 'error', error: String((e && e.message) || e) });
  }
  return snapshot();
}

async function download() {
  if (!isSupported()) return snapshot();
  if (state.status === 'downloading') return snapshot();

  setState({ status: 'downloading', error: null, progress: { percent: 0, transferred: 0, total: 0 } });
  try {
    bindEvents();
    await getAutoUpdater().downloadUpdate();
  } catch (e) {
    setState({ status: 'error', error: String((e && e.message) || e), progress: null });
  }
  return snapshot();
}

/** 退出并安装（相当于自动重启） */
function install() {
  if (!isSupported()) return false;
  bindEvents();
  // 让 IPC 先返回，再退出，避免渲染进程拿不到响应
  setTimeout(() => {
    try {
      getAutoUpdater().quitAndInstall(false, true);
    } catch {
      /* 交给 error 事件 */
    }
  }, 120);
  return true;
}

function registerUpdaterIpc(ipcMain) {
  ipcMain.handle('updater:status', (event) => {
    senders.add(event.sender);
    return setState({ supported: isSupported() });
  });
  ipcMain.handle('updater:check', (event) => {
    senders.add(event.sender);
    return check();
  });
  ipcMain.handle('updater:download', (event) => {
    senders.add(event.sender);
    return download();
  });
  ipcMain.handle('updater:install', () => install());
}

module.exports = { registerUpdaterIpc, check, snapshot, STATE_IDLE };
