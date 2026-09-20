/**
 * 「把 Steam 已下载的工坊更新同步进游戏」。
 *
 * ## 为什么这个功能是真的需要的（2026-09-16 用一次真实更新验证过）
 *
 * `MY_Item`（id 3680309446）的实测：
 *
 * ```
 *                         modversion   内容时间            installtime
 *   Steam 订阅目录          1.111      9/15 19:48         （无）
 *   游戏 Installed          1.110      9/13 17:07         1789125745 (9/11 19:22)
 *   .acf: timeupdated == latest_timeupdated == 1789472317 (9/15 19:38)  ← Steam 已下载完最新版
 * ```
 *
 * 也就是说「Steam 已经下载好、但游戏还没装」这个中间态**确实存在**，而且持续了 4 天，
 * 因为游戏要玩家自己在 mod 列表里按「更新」。按下之后（Steam 自己的日志）：
 *
 * ```
 * [00:54:49] AppID 602960 Workshop update changed : Running Update,Downloading,Staging,
 * [00:54:49] Downloading 959 chunks for depot 602960 (6830006565699137265)
 * [00:55:04] starting commit from "…/workshop/downloads/602960" to "…/workshop/content/602960"
 *            : 980 updated, 0 moved, 0 deleted files
 * ```
 *
 * 即那个按键会先让 **Steam 把整个包重下一遍**（59 MB、15 秒），提交完 1 秒后游戏才把文件
 * 复制进 `Installed` 并写上 `installtime`。所以管理器直接做「复制 + 写 installtime」这一步，
 * 效果与游戏一致，还省掉 Steam 那次多余的整包重下。
 *
 * ## 判定依据（实测 101 个 mod 精准命中）
 *
 * ```
 * Installed\<id>\filelist.xml 的 installtime  !=  .acf 里该 id 的 timeupdated   → 待安装
 * （filelist.xml 不存在 → 游戏压根没装过 → 也算待安装）
 * ```
 *
 * `.acf` 里没有该 id 时（缓存丢了）退回按 `modversion` 比较，不敢漏也不敢乱判。
 *
 * ## 写入方式
 *
 * 刻意模仿游戏：**整份复制**（而不是只覆盖变化的文件 —— 更新也可能删文件），
 * 再把 `installtime` 写进 filelist.xml。为了不出现「复制到一半」的残缺目录，
 * 先复制到同盘的临时目录，成功了再改名换过去；失败就把旧的改回来。
 */
const fs = require('node:fs');
const path = require('node:path');
const { copyDir, dirStats, rmrf } = require('./fsutil');
const { scanDir, stripBom } = require('./mods');
const { readWorkshopAcf, installTimeOf, isDelisted } = require('./workshopsync');

const BOM = '\uFEFF';

/** 只接受纯数字 id，防止 id 里带 .. 跑到目录外面去 */
function assertSafeId(id) {
  if (!/^\d+$/.test(String(id || ''))) throw new Error(`非法的工坊 id：${id}`);
}

function readInstalledVersion(dir) {
  try {
    const txt = stripBom(fs.readFileSync(path.join(dir, 'filelist.xml'), 'utf8'));
    const m = txt.match(/<contentpackage\b[^>]*>/i);
    const v = m && m[0].match(/\bmodversion\s*=\s*"([^"]*)"/i);
    return v ? v[1] : null;
  } catch {
    return null;
  }
}

/**
 * 单个工坊 mod 的安装状态。刻意不读文件清单（便宜），给扫描用。
 * @returns {{pending:boolean, reason:string|null, installedTime:number|null, targetTime:number|null, installedVersion:string|null}}
 */
function installStatus(settings, acf, mod) {
  const instDir = path.join(settings.installedWorkshopDir || '', mod.id);
  const installedTime = installTimeOf(instDir);
  const installedVersion = readInstalledVersion(instDir);
  const entry = (acf && acf.items && acf.items[mod.id]) || null;
  const targetTime = entry ? entry.timeUpdated : null;

  if (installedTime === null && installedVersion === null) {
    return { pending: true, reason: 'not-installed', installedTime: null, targetTime, installedVersion: null };
  }
  if (targetTime && installedTime !== targetTime) {
    return { pending: true, reason: 'outdated', installedTime, targetTime, installedVersion };
  }
  if (!targetTime) {
    // .acf 里没有它 —— 用版本号兜底，只敢在明确不同的时候判为待安装
    const diff = !!mod.modVersion && !!installedVersion && mod.modVersion !== installedVersion;
    return {
      pending: diff,
      reason: diff ? 'version-differs' : null,
      installedTime,
      targetTime,
      installedVersion
    };
  }
  return { pending: false, reason: null, installedTime, targetTime, installedVersion };
}

/**
 * 这个 mod 算不算「有待同步的更新」。
 *
 * 有一种状态**不能**算：**已下架 + 游戏里从没装过**。
 * 用户真实数据里的例子：`3156077899`（官方接口确认 exists=false）——
 * Steam 缓存里还留着内容、`.acf` 里 timeupdated == latest_timeupdated（根本没更新过），
 * 而游戏从来没装过它：因为条目都没了，游戏当然装不了。
 * 那不是"忘了同步"，是**下架残留**，该走「备份工坊 mod」存成本地 mod 那条路。
 * 所以这里把它排除掉，单列出来告诉用户，而不是混进"待同步"里让人白点一下。
 *
 * 注意只排除 `not-installed` 这一种：已经装在游戏里的 mod 就算来源下架了，
 * 只要 Steam 那份确实更新过，同步过去仍然是对的。
 */
function pendingSyncOf(settings, acf, checks, mod) {
  const st = installStatus(settings, acf, mod);
  if (!st.pending) return st;
  if (st.reason === 'not-installed' && isDelisted(checks, mod.id)) {
    return { ...st, pending: false, delistedNotInstalled: true };
  }
  return st;
}

/**
 * 找出所有「Steam 已下载、游戏还没装」的 mod。
 * @param {boolean} withBytes 是否统计体积（统计要遍历整个 mod 目录，列表展示时才需要）
 * @param {object}  checks    下架检查缓存（readChecks 的结果），用来排除下架残留
 */
function planInstallSync(settings, options = {}) {
  const { withBytes = true, onStep, checks = {} } = options;
  const steamRoot = settings.workshopModsDir || '';
  const instRoot = settings.installedWorkshopDir || '';
  const acf = readWorkshopAcf(steamRoot);

  const mods = scanDir('workshop', steamRoot);
  const items = [];
  const skippedDelisted = [];
  let done = 0;
  for (const m of mods) {
    done++;
    if (onStep && done % 10 === 0) onStep(done, mods.length, m.name);
    if (!instRoot) continue;
    if (!fs.existsSync(path.join(steamRoot, m.id, 'filelist.xml'))) continue;
    const st = pendingSyncOf(settings, acf, checks, m);
    if (st.delistedNotInstalled) {
      skippedDelisted.push({ id: m.id, name: m.name, steamVersion: m.modVersion });
      continue;
    }
    if (!st.pending) continue;
    const item = {
      id: m.id,
      name: m.name,
      reason: st.reason,
      steamVersion: m.modVersion,
      installedVersion: st.installedVersion,
      installedTime: st.installedTime,
      targetTime: st.targetTime,
      bytes: 0,
      files: 0
    };
    if (withBytes) {
      const s = dirStats(path.join(steamRoot, m.id));
      item.bytes = s.bytes;
      item.files = s.files;
    }
    items.push(item);
  }
  items.sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh'));
  skippedDelisted.sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh'));
  return {
    items,
    count: items.length,
    totalBytes: items.reduce((s, i) => s + i.bytes, 0),
    totalFiles: items.reduce((s, i) => s + i.files, 0),
    /** 已下架、游戏里没装的：不是"待同步"，界面上单独说明 */
    skippedDelisted,
    acfAvailable: acf.available,
    acfReason: acf.reason || null,
    workshopDir: steamRoot,
    installedDir: instRoot
  };
}

/**
 * 把 installtime 写进 filelist.xml（游戏自己也是解析后重写这个属性）。
 * 只动这一个属性，其它内容逐字节保留。
 */
function writeInstallTime(filePath, seconds) {
  const buf = fs.readFileSync(filePath);
  const hasBom = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  const txt = stripBom(buf.toString('utf8'));
  const tag = txt.match(/<contentpackage\b[^>]*>/i);
  if (!tag) throw new Error('filelist.xml 里没有 <contentpackage> 段');

  const value = String(seconds);
  let newTag;
  if (/\binstalltime\s*=\s*"/i.test(tag[0])) {
    newTag = tag[0].replace(/(\binstalltime\s*=\s*")[^"]*(")/i, `$1${value}$2`);
  } else if (/\bexpectedhash\s*=\s*"/i.test(tag[0])) {
    newTag = tag[0].replace(/(\s+)(expectedhash\s*=\s*")/i, ` installtime="${value}"$1$2`);
  } else {
    newTag = tag[0].replace(/\s*\/?>$/, (m) => ` installtime="${value}"${m}`);
  }
  const out = txt.replace(tag[0], newTag);
  fs.writeFileSync(filePath, hasBom ? BOM + out : out, 'utf8');
}

/** 让出事件循环：同步循环里没有 await，取消标志永远没机会被置位（IPC 消息进不来） */
const yieldToLoop = () => new Promise((r) => setImmediate(r));

/** 同步一个 mod：整份复制 + 写 installtime，用改名换目录，避免出现残缺状态 */
async function syncOne(settings, item) {
  assertSafeId(item.id);

  /*
   * 没有 targetTime 就没有可写的 installtime。
   * 这种情况下再复制一遍是**纯浪费**：拷贝完 installtime 仍然缺，下次计划照样判它待同步，
   * 用户每点一次同步就多复制几十 MB（.acf 里没有这个 id、走 version-differs 兜底时就是这样）。
   * 直接失败并说明原因，别报一个"同步成功"的假结果。
   */
  if (!item.targetTime) {
    throw new Error('拿不到这个 mod 的更新时间（.acf 里没有记录），无法写入 installtime —— 跳过，避免每次都白复制一份');
  }

  const steamDir = path.join(settings.workshopModsDir || '', String(item.id));
  const instRoot = settings.installedWorkshopDir || '';
  if (!instRoot) throw new Error('没有配置游戏安装目录（installedWorkshopDir）');
  if (!fs.existsSync(path.join(steamDir, 'filelist.xml'))) {
    throw new Error('Steam 订阅目录里没有这个 mod 的 filelist.xml');
  }

  const instDir = path.join(instRoot, String(item.id));
  const tmp = path.join(instRoot, `.bmm-sync-tmp-${item.id}`);
  const old = path.join(instRoot, `.bmm-sync-old-${item.id}`);
  fs.mkdirSync(instRoot, { recursive: true });
  rmrf(tmp);
  rmrf(old);

  try {
    copyDir(steamDir, tmp);
    writeInstallTime(path.join(tmp, 'filelist.xml'), item.targetTime);
    await yieldToLoop();

    const had = fs.existsSync(instDir);
    if (had) fs.renameSync(instDir, old);
    try {
      fs.renameSync(tmp, instDir);
    } catch (e) {
      if (had) {
        try {
          fs.renameSync(old, instDir); // 换不过去就把旧的放回来
        } catch {
          /* 放不回来就只能靠 .bmm-sync-old- 里那份手工恢复 */
        }
      }
      throw e;
    }
    rmrf(old);
    return item.targetTime;
  } catch (e) {
    rmrf(tmp);
    const msg = String((e && e.message) || e);
    if (/EBUSY|EPERM|EACCES|resource busy|being used by another process/i.test(msg)) {
      throw new Error(
        '文件被占用（游戏正在运行，且这个 mod 里的 dll 已被加载）—— 关掉游戏后重试'
      );
    }
    throw e;
  }
}

/**
 * 执行同步。
 * @param {object} settings
 * @param {Array} items planInstallSync 出来的条目（也可以只传一部分）
 * @param {{onProgress?:Function, isCancelled?:Function}} hooks
 */
async function runInstallSync(settings, items, hooks = {}) {
  const { onProgress = () => {}, isCancelled = () => false } = hooks;
  const list = Array.isArray(items) ? items : [];
  const synced = [];
  const failed = [];
  let bytes = 0;

  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (isCancelled()) return { synced, failed, bytes, cancelled: true };
    onProgress({ phase: 'syncing', done: i, total: list.length, current: item.name, id: item.id });
    try {
      const t = await syncOne(settings, item);
      bytes += item.bytes || 0;
      synced.push({ id: item.id, name: item.name, installTime: t });
    } catch (e) {
      failed.push({ id: item.id, name: item.name, error: String((e && e.message) || e) });
    }
    // 每个 mod 之间让出一次，backup:cancel / installsync:cancel 才有机会被处理
    await yieldToLoop();
  }
  onProgress({ phase: 'done', done: list.length, total: list.length, current: null });
  return { synced, failed, bytes, cancelled: false };
}

module.exports = {
  installStatus,
  pendingSyncOf,
  planInstallSync,
  runInstallSync,
  writeInstallTime,
  syncOne,
  readInstalledVersion
};
