/**
 * 在 **Steam 客户端**里打开工坊页面（而不是浏览器里的网页版）。
 *
 * ## 实测结论（2026-09-16，本机 Steam 在运行、`steam://` 协议已注册）
 *
 * - `steam://url/CommunityFilePage/<id>` **确实有效**：把它直接交给 `steam.exe` 之后，
 *   Steam 内置浏览器的缓存目录（`%LOCALAPPDATA%\Steam\htmlcache\...\Cache_Data`）立刻多出
 *   页面文件，说明客户端去加载那个工坊页面了 —— 在客户端里点「订阅」比网页版顺手。
 * - **走 ShellExecute 不可靠**：`Start-Process <steam://…>` 在本机（沙箱下）没有任何反应；
 *   `steam.exe -- <steam://…>` 才有反应。Electron 的 `shell.openExternal` 走的正是 ShellExecute，
 *   所以这里优先**自己找到 steam.exe 直接调用**，找不到才退回 `shell.openExternal`。
 * - 再不行就由调用方退回网页版 —— 三条路都堵死才叫失败。
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { steamRootCandidates } = require('./detect');

/** 工坊 id 只允许纯数字，避免拿外部字符串拼出奇怪的 steam:// 命令 */
const ID_RE = /^\d{1,20}$/;

function steamWorkshopUrl(id) {
  const s = String(id == null ? '' : id).trim();
  if (!ID_RE.test(s)) throw new Error(`非法的工坊 id：${id}`);
  return `steam://url/CommunityFilePage/${s}`;
}

/**
 * steam.exe 可能在哪。游戏目录优先反推（最贴合当前这台机器），
 * 再退回 detect.js 里那套常见 Steam 安装位置。
 */
function steamExeCandidates(settings) {
  const out = [];
  const game = (settings && settings.gameDir) || '';
  if (game) {
    // <steam>\steamapps\common\Barotrauma → <steam>\steam.exe
    out.push(path.join(path.dirname(path.dirname(path.dirname(game))), 'steam.exe'));
  }
  for (const root of steamRootCandidates()) out.push(path.join(root, 'steam.exe'));
  return out.filter((p, i) => p && out.indexOf(p) === i);
}

function findSteamExe(settings) {
  for (const p of steamExeCandidates(settings)) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* 无权限的盘直接跳过 */
    }
  }
  return null;
}

/**
 * 打开工坊页面。
 * @returns {{ok:boolean, via:'steam.exe'|'shell'|null, url:string, exe?:string, error?:string}}
 */
function openWorkshopInSteam(settings, id, deps = {}) {
  const url = steamWorkshopUrl(id);
  const findExe = deps.findExe || findSteamExe;
  const exe = findExe(settings);

  if (exe) {
    try {
      // detached + stdio ignore：不占住管理器，Steam 已经在跑时会自己把命令转过去
      const child = spawn(exe, ['--', url], { detached: true, stdio: 'ignore' });
      child.on('error', () => {
        /* 极端情况（路径失效/被杀软拦）只影响这一次，不影响管理器本身 */
      });
      child.unref();
      return { ok: true, via: 'steam.exe', exe, url };
    } catch {
      /* 落到 shell 那条路 */
    }
  }

  if (typeof deps.openExternal === 'function') {
    try {
      deps.openExternal(url);
      return { ok: true, via: 'shell', url };
    } catch (e) {
      return { ok: false, via: null, url, error: String((e && e.message) || e) };
    }
  }
  return { ok: false, via: null, url, error: '找不到 steam.exe，也无法交给系统处理' };
}

module.exports = {
  steamWorkshopUrl,
  steamExeCandidates,
  findSteamExe,
  openWorkshopInSteam
};
