/**
 * 主进程提示语的英文对照表（**过渡方案**）。
 *
 * ## 为什么是"对照表"而不是错误码
 *
 * `electron/services/*` 里约 40 条面向用户的提示是**中文硬编码**，经 IPC 抛到渲染层后
 * 直接进 toast。要正确做多语言，应该让主进程返回**错误码 + 参数**，由渲染层 `t()` 翻译。
 *
 * 但那会动 40 处 throw/return，而且 `scripts/test-backend.cjs` 的 306 项断言里有很多
 * **直接比对中文串**（改了就得同步改测试），风险和改动面都不小。所以先用这张表兜住：
 * 不改主进程、不动测试，纯渲染层把已知的中文提示翻成英文。
 *
 * 代价与边界（诚实说明）：
 *   - 主进程**新增**提示语必须同步加进这张表，否则英文界面下会漏出中文；
 *   - 表里没有的（例如底层 Node 的英文报错）原样透传 —— 那本来就是英文。
 *
 * 等主进程改成错误码之后，这个文件应当整体删掉。
 */
import { getLang } from '../i18n';

/** 完全匹配的中文提示 → 英文 */
const EXACT: Record<string, string> = {
  // ---- 参数校验 / 非法输入 ----
  '非法的 mod 名称': 'Invalid mod name',
  '非法的快照 id': 'Invalid snapshot id',
  '非法路径': 'Invalid path',
  '非法链接': 'Invalid link',
  '请填写新文件夹名称': 'Please enter a name for the new folder',
  '名称不能包含 \\ / : * ? " < > |': 'The name cannot contain \\ / : * ? " < > |',
  '缺少 mod 名称': 'Missing mod name',
  '缺少 mod 标识': 'Missing mod identifier',
  '内容是空的': 'The content is empty',

  // ---- 前置条件 ----
  '还没设置游戏根目录，请先到「设置」里指定':
    'The game folder is not set yet — specify it in Settings first',
  '没有配置游戏安装目录（installedWorkshopDir）':
    'The game install folder (installedWorkshopDir) is not configured',
  '已有备份任务在进行中': 'A backup task is already running',
  '已有同步任务在进行中': 'A sync task is already running',
  '快照不存在或已被删除': 'The snapshot does not exist or has been deleted',
  '没有 API Key': 'No API key configured',

  // ---- 合集导入 / 导出 ----
  '不是合集文件': 'Not a collection file',
  '这个合集文件里没有 mod 条目': 'This collection file has no mod entries',
  '这个合集文件里没有可用的 mod 条目': 'This collection file has no usable mod entries',
  '这个合集里没有 mod 条目': 'This collection has no mod entries',
  '看起来是 JSON，但解析失败': 'It looks like JSON but could not be parsed',
  '这个 JSON 不是潜渊症 Mod 管理器导出的合集':
    'This JSON was not exported by Barotrauma Mod Manager',
  '没从这段文字里认出任何工坊 id（需要 5~20 位数字）':
    'No Workshop id was recognised in this text (5–20 digits required)',

  // ---- 同步到游戏 ----
  '拿不到这个 mod 的更新时间（.acf 里没有记录），无法写入 installtime —— 跳过，避免每次都白复制一份':
    'Cannot read this mod’s update time (not recorded in the .acf), so installtime cannot be written — skipping to avoid copying the same files again every time',
  '文件被占用（游戏正在运行，且这个 mod 里的 dll 已被加载）—— 关掉游戏后重试':
    'File in use (the game is running and this mod’s DLL is loaded) — close the game and try again',
  '游戏还没安装这个 mod': 'The game has not installed this mod yet',
  '目标文件夹名重复': 'Target folder name already exists',

  // ---- 路径 / 配置文件 ----
  '找不到 config_player.xml': 'config_player.xml not found',
  'config_player.xml 里没有 <contentpackages> 段':
    'config_player.xml has no <contentpackages> section',
  '路径为空': 'Empty path',
  '路径不存在': 'Path does not exist',
  '只能打开文件夹': 'Only folders can be opened',
  '找不到 steam.exe，也无法交给系统处理':
    'steam.exe was not found and the system could not handle it either',
  '找不到 Steam 的 appworkshop_*.acf': 'Steam’s appworkshop_*.acf was not found',
  'appworkshop 里没有工坊条目': 'No Workshop items recorded in appworkshop',

  // ---- 网络 ----
  '请求超时': 'Request timed out',
  '请求工坊页面超时': 'Timed out fetching the Workshop page',
  '请求太频繁，被 Steam 限流了，稍等一下再试':
    'Too many requests — Steam is rate-limiting us. Wait a moment and try again',
  'Steam API Key 无效或没有权限':
    'The Steam Web API key is invalid or does not have permission',
  '请求 Steam API 失败': 'Steam API request failed',
  '连不上 Steam —— 国内通常需要开加速器/代理。确认浏览器能打开 steamcommunity.com 之后再试':
    'Cannot reach Steam — in mainland China an accelerator/proxy is usually required. Make sure your browser can open steamcommunity.com, then try again',
  '连不上 Steam —— 确认加速器/代理开着':
    'Cannot reach Steam — make sure your accelerator/proxy is running',
  '连不上翻译服务（国内可能需要加速器）':
    'Cannot reach the translation service (an accelerator may be required in mainland China)',
  '翻译服务没有返回内容': 'The translation service returned nothing',
  '免费翻译额度用完了，过一会儿再试':
    'The free translation quota is used up — try again later',

  // ---- 变体门控（工坊版关掉的功能被调用时主进程抛的） ----
  '创意工坊版不提供这个功能（它需要 Steam Web API Key）':
    'The Workshop edition does not provide this feature — it requires a Steam Web API key',

  // ---- 工坊版自更新 ----
  '还没检测到工坊目录（先在设置里确认游戏路径）':
    'Workshop folder not detected yet — check the game folder in Settings first',
  '工坊里没有找到本程序的条目（可能还没订阅）':
    'This program’s Workshop item was not found (you may not be subscribed)',
  '版本号无法比较': 'Version numbers cannot be compared',
  '已是最新': 'Already up to date'
};

/** 带变量的提示：正则捕获后重建 */
const PATTERNS: { re: RegExp; en: (m: RegExpMatchArray) => string }[] = [
  // ---- 路径不存在（主进程直接拼路径进消息里）----
  {
    re: /^本地 mod 文件夹不存在：(.+)$/,
    en: (m) => `The local mod folder does not exist: ${m[1]}`
  },
  {
    re: /^创意工坊 mod 文件夹不存在：(.+)$/,
    en: (m) => `The Workshop mod folder does not exist: ${m[1]}`
  },
  {
    re: /^本地 mod 目录不存在：(.+)$/,
    en: (m) => `The local mods folder does not exist: ${m[1]}`
  },
  {
    re: /^创意工坊 mod 目录不存在：(.+)$/,
    en: (m) => `The Workshop mods folder does not exist: ${m[1]}`
  },
  { re: /^合集目录不存在：(.+)$/, en: (m) => `The collections folder does not exist: ${m[1]}` },
  { re: /^图片不存在：(.+)$/, en: (m) => `The image does not exist: ${m[1]}` },
  {
    // 已备份到本地（C:\...\xxx），跳过以免覆盖你改过的副本
    re: /^已备份到本地（(.+)），跳过以免覆盖你改过的副本$/,
    en: (m) => `Already backed up locally (${m[1]}) — skipping so your edited copy is not overwritten`
  },
  { re: /^读取失败：(.+)$/, en: (m) => `Failed to load: ${m[1]}` },
  { re: /^读取分类失败：(.+)$/, en: (m) => `Failed to load categories: ${m[1]}` },
  { re: /^翻译失败：(.+)$/, en: (m) => `Translation failed: ${m[1]}` },
  {
    // 浏览工坊的 5xx 长提示（提到加速器只代理了 steamcommunity 的那段）
    re: /连不上 Steam。这种错常见于加速器只代理了 steamcommunity\.com/,
    en: () =>
      'Cannot reach Steam. This usually means your accelerator only proxies steamcommunity.com, not api.steampowered.com: the browser can open the Workshop but the manager talks to the Web API. The backup endpoint was tried as well and also failed — switch the accelerator to global/system proxy mode, or try again later'
  }
];

/**
 * 剥掉 Electron 给 IPC 报错加的包装。
 *
 * `ipcMain.handle` 里抛的错，到渲染层会变成
 *   `Error invoking remote method 'workshop:details': Error: 真正的消息`
 * 那个前缀对用户毫无意义（还暴露内部通道名），所以先脱掉再翻译。
 * 认不出包装就原样返回。
 */
function unwrapIpcError(s: string): string {
  const m = s.match(/^Error invoking remote method '[^']*':\s*Error:\s*([\s\S]*)$/);
  return m ? m[1].trim() : s;
}

/**
 * 把主进程来的提示翻成当前语言。
 * 认不出来就**原样返回** —— 多数认不出的是底层 Node 的英文报错，本来就是英文。
 */
export function translateMainMessage(msg: string | null | undefined): string {
  const raw = String(msg == null ? '' : msg);
  if (!raw) return raw;
  // 先脱包装：即使后面翻不出来，也别把 IPC 内部前缀甩给用户
  const s = unwrapIpcError(raw);
  if (getLang() !== 'en') return s;
  const trimmed = s.trim();
  const exact = EXACT[trimmed];
  if (exact) return exact;
  for (const p of PATTERNS) {
    const m = trimmed.match(p.re);
    if (m) return p.en(m);
  }
  return s;
}
