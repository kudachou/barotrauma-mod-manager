/**
 * 工坊版的自更新检测与「一键升级」。
 *
 * ## 为什么要做成这样
 *
 * 创意工坊版**不用 electron-updater**（两条更新通道同时开会让版本号漂移）。
 * Steam 工坊本身就是分发渠道：用户订阅我们的工坊条目后，Steam 会把新版下载进
 * `steamapps\workshop\content\602960\<条目id>\`。但程序是从桌面（安装包装的）运行的，
 * **Steam 不会覆盖已经拷出去的那份**，所以需要自己处理升级。
 *
 * ## 升级怎么落地
 *
 * 工坊条目里本来就放着安装包（`barotrauma-mod-manager-workshop-setup-<版本>.exe`），
 * 于是"升级"= **运行那个安装包**，它会把已装的程序覆盖成新版。
 * 不需要联网、不需要再下载。
 *
 * 参数沿用 **electron-builder / electron-updater 那套约定**，不自己发明：
 *
 *     --updated      告诉 NSIS"这是一次升级"，走静默更新分支、跳过首次安装的界面
 *     --force-run    装完自动把程序重新打开
 *
 * 完整版就是这么做的（`electron/services/updater.js` 里 `quitAndInstall(false, true)`，
 * electron-updater 内部会带上这两个参数）。**好处是"关掉正在运行的实例"由安装包负责** ——
 * electron-builder 生成的 NSIS 里有相应的逻辑，不需要我们再想办法先退出自己，
 * 也就没有"程序还占着 exe、安装包覆盖不了"的竞态。
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
const { spawn } = require('node:child_process');
const { compareVersions } = require('./mods');

/** 我们的标记文件名 */
const MARKER = 'bmm-app.json';
/** 标记文件里的 app 字段值，防止别人的标记文件被误认 */
const APP_ID = 'barotrauma-mod-manager';
/** 安装包文件名（与 electron-builder.workshop.yml 的 artifactName 一致） */
const INSTALLER_RE = /^barotrauma-mod-manager-workshop-setup-(.+)\.exe$/i;

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
 *
 * 玩家订阅的条目里只有我们一条带 `bmm-app.json` 标记（那是我们私有的标记文件），
 * 所以取第一个命中的就够了 —— 不需要"哪条更新"之类的复杂判定。
 *
 * （发布者本机可能同时留着废弃条目的旧内容，Steam 不会自动清理；那种情况下
 * 按目录顺序可能命中旧的。这是**发布者才会遇到**的情形，手动删掉旧条目即可。）
 *
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
 *            workshopVersion:string|null, currentVersion:string, newer:boolean,
 *            installerAvailable?:boolean, reason?:string}}
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
    // 能不能"一键升级"取决于条目里有没有可用的安装包
    installerAvailable: newer ? !!findInstaller(hit.dir, hit.version) : false,
    reason: newer ? null : cmp == null ? '版本号无法比较' : '已是最新'
  };
}

/**
 * 在工坊条目目录里找我们的安装包。
 *
 * 优先精确匹配标记文件声明的版本；找不到就用第一个（这样"标记写了 0.4.3 但包名是 0.4.2"
 * 这种不一致时不会卡住不升级 —— 毕竟能装上比版本号严格对齐更重要）。
 *
 * @param {string} itemDir 工坊条目目录
 * @param {string|null} version bmm-app.json 里声明的版本
 * @returns {{path:string, version:string, size:number}|null}
 */
function findInstaller(itemDir, version) {
  let files;
  try {
    files = fs.readdirSync(itemDir).filter((f) => INSTALLER_RE.test(f));
  } catch {
    return null;
  }
  if (!files.length) return null;

  const verOf = (f) => f.match(INSTALLER_RE)[1];
  const pick = (version && files.find((f) => verOf(f) === version)) || files[0];
  const p = path.join(itemDir, pick);
  let size = 0;
  try {
    const st = fs.statSync(p);
    if (!st.isFile()) return null;
    size = st.size;
  } catch {
    return null;
  }
  // 残缺文件不当安装包：Steam 下到一半、或磁盘满留下的空壳都会走到这里。
  // 阈值取 1MB —— 我们的安装包 ~78MB，正常怎么也不会低于这个数。
  if (size < 1024 * 1024) return null;

  return { path: p, version: verOf(pick), size };
}

/** 防止连点触发两次升级（第二次会在安装包刚开始覆盖文件时又起一个进程） */
let applying = false;

/** 自检用：复位模块级状态 */
function __reset() {
  applying = false;
}

/**
 * 一键升级：运行工坊条目里的安装包，把已装的程序覆盖成新版。
 *
 * 参数与 electron-updater 的 `quitAndInstall` 一致（见文件头说明）：
 *   --updated      NSIS 走"升级"分支
 *   --force-run    装完自动重新打开
 *
 * 不加 `/S`：完整版也是非静默（`quitAndInstall(false, true)`）。
 * 保留安装包的进度界面反而更好——用户能看见"正在更新"，而不是窗口突然消失。
 *
 * ⚠️ 建议调用方拿到 `ok:true` 后尽快 `app.quit()`（见 index.js 的延时退出）。
 * 即使我们没来得及退出，NSIS 的升级分支也会处理掉正在运行的实例。
 *
 * @param {{itemDir:string, version:string|null}} opts
 * @returns {{ok:boolean, reason?:string, installer?:string, installerVersion?:string, args?:string[]}}
 */
function applyWorkshopUpdate({ itemDir, version }) {
  if (applying) return { ok: false, reason: '已经有一个升级在进行中' };

  const inst = findInstaller(itemDir, version);
  if (!inst) return { ok: false, reason: '工坊条目里没有可用的安装包' };

  const args = ['--updated', '--force-run'];

  try {
    const child = spawn(inst.path, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    });
    child.unref();
  } catch (e) {
    return { ok: false, reason: `无法启动安装程序：${e && e.message ? e.message : e}` };
  }

  applying = true;
  return { ok: true, installer: inst.path, installerVersion: inst.version, args };
}

module.exports = {
  MARKER,
  APP_ID,
  readMarker,
  findPublishedApp,
  checkForWorkshopUpdate,
  findInstaller,
  applyWorkshopUpdate,
  __reset
};
