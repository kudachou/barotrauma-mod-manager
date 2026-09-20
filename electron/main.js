const { app, BrowserWindow, session, shell } = require('electron');
const path = require('node:path');
const services = require('./services');
const { registerLocalImgScheme, handleLocalImg } = require('./protocol');
const { CSP_PROD } = require('./csp');

let mainWindow = null;

registerLocalImgScheme();

/** 只有开发服务器和本地 dist 允许被导航到，别的一律拦掉 */
function isAllowedNavigation(url) {
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl && url.startsWith(devUrl)) return true;
  return url.startsWith('file://');
}

/**
 * 生产环境用的 CSP 在 ./csp.js 里（单独一个模块，方便测试引用同一份字符串）。
 * 开发服务器要 eval 和内联脚本做 HMR，注了会白屏，所以只在打包版生效。
 */
function applyCsp() {
  if (process.env.VITE_DEV_SERVER_URL) return;
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP_PROD]
      }
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1420,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#080e1a',
    title: '潜渊症 Mod 管理器',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      /*
       * 打开渲染层沙箱。preload 只用了 ipcRenderer/contextBridge，不需要 Node 能力，
       * 开沙箱不影响功能，但能挡住"渲染层被注入后直接拿 Node"这条路
       *（window.api 里有一堆读写/删除文件的通道，泄漏出去的代价很大）。
       */
      sandbox: true
    }
  });

  /*
   * 窗口不能被导航走、也不能弹新窗口。
   * preload 会注入到该窗口加载的**任何**页面，一旦被导航到外部页面，
   * 那个页面就能凭 window.api 调主进程的读写/删除通道。
   */
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // 界面里的外链走 shell.openExternal，由系统浏览器打开
    if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url)) event.preventDefault();
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) mainWindow.loadURL(devUrl);
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  handleLocalImg();
  services.registerIpc();
  applyCsp();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
