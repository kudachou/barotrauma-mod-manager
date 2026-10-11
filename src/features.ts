/**
 * 界面侧的变体开关。
 *
 * 和主进程的 `electron/services/variant.js` 是**同一套判断**，只是取值方式不同：
 * 主进程读落盘标记/环境变量，界面这边由 vite 在构建期把 `BMM_VARIANT` 钉进 bundle。
 * 两边都指向同一个环境变量，所以不会出现"主进程禁了、界面还显示"的漂移。
 *
 * 用法：`import { features } from '../features'; if (!features.delistedCheck) return null;`
 */
const VARIANT: 'full' | 'workshop' =
  import.meta.env.BMM_VARIANT === 'workshop' ? 'workshop' : 'full';

const isWorkshopBuild = VARIANT === 'workshop';

export const features = {
  /** 变体名，调试用 */
  variant: VARIANT,

  /**
   * 浏览工坊（搜索 / 排序 / 分类 / 详情 / 截图画廊）。
   * 它需要 `IPublishedFileService`，也就是需要用户自己的 Web API Key ⇒ 工坊版关掉。
   */
  browseWorkshop: !isWorkshopBuild,

  /**
   * 工坊下架检查（「已下架」徽章、筛选、「只备份已下架的」）。
   * 同样依赖 Web API Key（没 Key 时只能抓网页，分不清"已下架"和"私有"，不可靠）⇒ 工坊版整块去掉。
   */
  delistedCheck: !isWorkshopBuild,

  /** Steam Web API Key 的设置入口 */
  apiKey: !isWorkshopBuild,

  /**
   * electron-updater 自更新。
   * 工坊版关掉：它的更新走"工坊把新版下载进来 → 程序检测到版本号变了 → 提示重装"，
   * 两条通道同时开会让版本号漂移。
   */
  autoUpdater: !isWorkshopBuild,

  /**
   * 界面语言切换（中 / 英）。
   *
   * 目前**只在创意工坊版**提供：它要面向国际用户上架。
   *
   * 完整版为什么先锁中文：渲染层界面**已经全部翻完**（含窗口标题、分类显示名），
   * 但还有两处没翻，放开会让用户看到中英混排：
   *   1. `BrowseView` / `BrowseDetailModal`（浏览工坊整块，工坊版不渲染所以没翻）；
   *   2. 主进程提示语的覆盖仍是"对照表"方案（`src/i18n/mainMessages.ts`），
   *      主进程新增提示语若忘了加表就会漏中文。
   * 这两件事做完再把这里改成 `true`。
   */
  languageSwitch: isWorkshopBuild
} as const;

export type Features = typeof features;
