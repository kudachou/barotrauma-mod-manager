/**
 * 工坊版的自更新检测。
 *
 * ## 为什么要做成这样
 *
 * 创意工坊版**不用 electron-updater**（两条更新通道同时开会让版本号漂移）。
 * Steam 工坊本身就是分发渠道：用户订阅我们的工坊条目后，Steam 会把新版下载进
 * `steamapps\workshop\content\602960\<条目id>\`。但程序是从桌面（安装包装的）运行的，
 * **Steam 不会覆盖已经拷出去的那份**，所以需要"检测到新版 → 提示重装"。
 *
 * ## 怎么认出"哪一条是我们自己"
 *
 * 不硬编码条目 id（条目还没建、id 以后可能会变、用户也可能还没订阅）。
 * 改成**标记文件**：我们的工坊条目里放一个 `bmm-app.json`：
 *
 *     { "app": "barotrauma-mod-manager", "variant": "workshop", "version": "0.4.2" }
 *
 * 扫工坊内容目录的一级子目录，谁有这个文件谁就是我们自己。用户没订阅时自然扫不到，
 * 不会误报。整个过程**只读本地文件、不联网、不需要 Web API Key**。
 *
 * ## 版本比较
 *
 * 复用 mods.js 的 compareVersions（分段数字比较，非数字退回字符串）——
 * 和 mod 版本对比用的是同一套，不会出现两处判断不一致。
 */
const fs = require('node:fs');
const path = require('node:path');
const { compareVersions } = require('./mods');

/** 我们的标记文件名 */
const MARKER = 'bmm-app.json';
/** 标记文件里的 app 字段值，防止别人的标记文件被误认 */
const APP_ID = 'barotrauma-mod-manager';

/**
 * 读一个工坊条目目录里的标记文件。
 * @returns {{version:string, variant:string|null}|null}
 */
function readMarker(dir) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, MARKER), 'utf8'));
    if (!raw || raw.app !== APP_ID) return null;
    const version = String(raw.version || '').trim();
    if (!version) return null;
    return { version, variant: raw.variant ? String(raw.variant) : null };
  } catch {
    return null;
  }
}

/**
 * 在工坊内容目录里找我们自己的条目。
 * @param {string} workshopContentDir `<steam>\steamapps\workshop\content\602960`
 * @returns {{found:boolean, id:string|null, dir:string|null, version:string|null, variant:string|null, scanned:number}}
 */
function findPublishedApp(workshopContentDir) {
  const out = { found: false, id: null, dir: null, version: null, variant: null, scanned: 0 };
  if (!workshopContentDir) return out;

  let entries;
  try {
    entries = fs.readdirSync(workshopContentDir, { withFileTypes: true });
  } catch {
    return out; // 目录不存在 / 没权限：当成没订阅，不报错
  }

  for (const e of entries) {
    if (!e.isDirectory()) continue;
    // 工坊条目目录名就是纯数字 id，顺便校验一下，免得扫到奇怪的东西
    if (!/^\d+$/.test(e.name)) continue;
    out.scanned++;
    const dir = path.join(workshopContentDir, e.name);
    const marker = readMarker(dir);
    if (marker) {
      out.found = true;
      out.id = e.name;
      out.dir = dir;
      out.version = marker.version;
      out.variant = marker.variant;
      return out; // 认出一个就够了（我们只发一个条目）
    }
  }
  return out;
}

/**
 * 启动时调一次：工坊里下载的那份是不是比当前运行的更新？
 *
 * @param {string} workshopContentDir
 * @param {string} currentVersion 当前运行的版本（app.getVersion()）
 * @returns {{checked:boolean, found:boolean, id:string|null, dir:string|null,
 *            workshopVersion:string|null, currentVersion:string, newer:boolean, reason?:string}}
 */
function checkForWorkshopUpdate(workshopContentDir, currentVersion) {
  const cur = String(currentVersion || '').trim();
  const base = { checked: true, found: false, id: null, dir: null, workshopVersion: null, currentVersion: cur, newer: false };

  if (!workshopContentDir) {
    return { ...base, checked: false, reason: '还没检测到工坊目录（先在设置里确认游戏路径）' };
  }
  const hit = findPublishedApp(workshopContentDir);
  if (!hit.found) {
    // 没订阅（或条目里还没放标记文件）——这不是错误，界面上不提示
    return { ...base, reason: '工坊里没有找到本程序的条目（可能还没订阅）' };
  }

  const cmp = compareVersions(hit.version, cur);
  // compareVersions 返回 null 表示认不出来（版本号格式怪）；这时不提示，避免误导
  const newer = cmp != null && cmp > 0;

  return {
    checked: true,
    found: true,
    id: hit.id,
    dir: hit.dir,
    workshopVersion: hit.version,
    currentVersion: cur,
    newer,
    reason: newer ? null : cmp == null ? '版本号无法比较' : '已是最新'
  };
}

module.exports = { MARKER, APP_ID, readMarker, findPublishedApp, checkForWorkshopUpdate };
