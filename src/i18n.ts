/**
 * 界面多语言（i18n）。
 *
 * ## 设计取舍
 *
 * **不引第三方库**：本项目的界面文案集中在少量组件里，引 react-i18next 会让
 * 主进程/渲染层都多一个运行时依赖（我们还刻意保持"除了 electron-updater 没有运行时依赖"）。
 * 这里用一个纯函数 `t()` + 几张表就够了。
 *
 * ## 文案表怎么组织
 *
 * 基础部分（外壳 / Mod 库 / 卡片 / 更新横幅）在本文件里；其余按画面拆成 `src/i18n/*.ts`
 * 片段，在这里汇总。拆开是为了让翻译工作能按画面并行、各写各的文件不冲突。
 * 各片段的约定见 `src/i18n/settings.ts` 的注释。
 *
 * ## 语言是怎么生效的
 *
 * `t()` 读的是**模块级**的当前语言，不是 React state —— 这样组件里直接
 * `import { t } from '../i18n'` 就能用，不用层层传 context/props。
 * 代价是切换语言时组件不会自动重渲染，所以 App 在根节点上挂一个 `key={lang}`：
 * 语言一变，整棵子树重挂，所有 `t()` 重新求值。切换语言是低频操作，代价可以接受。
 *
 * ## 范围
 *
 * 覆盖渲染层全部界面 + 窗口标题 + 内置分类显示名。
 * **主进程抛出的报错/提示仍是中文**（见 HANDOVER 待办：要改成错误码再由这边翻译）。
 */
import { settingsZh, settingsEn } from './i18n/settings';
import { modalsZh, modalsEn } from './i18n/modals';
import { collectionsZh, collectionsEn } from './i18n/collections';
import { savesZh, savesEn } from './i18n/saves';
import { browseZh, browseEn } from './i18n/browse';
import { browseDetailZh, browseDetailEn } from './i18n/browseDetail';

export type Lang = 'zh' | 'en';

export const LANGS: { code: Lang; label: string }[] = [
  { code: 'zh', label: '中文' },
  { code: 'en', label: 'English' }
];

/** 基础文案（外壳 / Mod 库 / 卡片 / 更新横幅）的中文原文 */
const baseZh = {
  // ------------------------------ 通用 ------------------------------
  'app.title': '潜渊症 Mod 管理器',
  /** 列表分隔符：中文用顿号，英文用逗号。别在组件里写死 ',' */
  'common.listSeparator': '、',
  // ------------------------------ toast（渲染层自己发的） ------------------------------
  'toast.scanFailed': '读取 mod 目录失败',
  'toast.launching': '正在启动游戏',
  'toast.launchingViaSteam': '找不到游戏 exe，已交给 Steam 启动',
  'toast.launchFailed': '启动游戏失败',
  'toast.addToCollectionFailed': '加入合集失败',
  'toast.removeFromCollectionFailed': '移出合集失败',
  'toast.addedToCollection': '已加入合集「{name}」',
  'toast.addedToCollectionWith': '已加入合集「{name}」（含 {n} 个关联 mod）',
  'toast.removedFromCollection': '已从合集「{name}」移出',
  'toast.relationsSaveFailed': '保存关联失败',
  'toast.tagCreateFailed': '新建标签失败',
  'toast.tagCreated': '已新建标签「{name}」',
  'toast.tagDeleteFailed': '删除标签失败',
  'toast.tagDeleted': '已删除标签「{name}」',
  'toast.tagDeletedAffected': '已从 {n} 个 mod 上移除（重新输入同名标签即可恢复）',
  'toast.tagDeletedHint': '重新输入同名标签即可恢复',
  // ------------------------------ toast：下架检查（完整版才有这条链路） ------------------------------
  'toast.apiKeyUnusable': 'API Key 不可用，已退回网页检查',
  'toast.delistedFound': '发现 {n} 个 mod 已被工坊下架',
  'toast.delistedFoundHint': '点工具栏「已下架」查看',
  'toast.checkIncomplete': '下架检查没能全部完成',
  'toast.checkUnknownPage': '有 {n} 个条目没查到（成人内容需要登录才能看）—— 在设置里填个 Steam API Key 就能可靠检查',
  'toast.apiKeyUnusableShort': 'API Key 不可用',
  'toast.fellBackToPage': '{err}（已退回网页检查）',
  'toast.checkDoneNothing': '检查完成，没有发现被下架的 mod',
  'toast.checkUnknownShort': '另有 {n} 个条目没能核实（成人内容需登录）—— 填个 Steam API Key 就能可靠检查',
  'toast.modeApiKey': '通过官方 API 检查',
  'toast.modePage': '通过工坊网页检查',
  'toast.checkFailed': '下架检查失败',
  // ------------------------------ toast：API Key / 更新 / 设置 ------------------------------
  'toast.apiKeySaved': '已保存 API Key',
  'toast.apiKeyCleared': '已清空 API Key',
  'toast.apiKeySavedHint': '下次检查会走官方接口',
  'toast.apiKeyClearedHint': '将退回抓网页的方式',
  'toast.saveFailed': '保存失败',
  'toast.updateCheckFailed': '检查更新失败',
  'toast.updateDownloadFailed': '下载更新失败',
  'toast.updateInstallFailed': '启动安装失败',
  // ------------------------------ 预览模式提示条 ------------------------------
  'mock.barPre': '当前是',
  'mock.barBold': '外观预览模式',
  'mock.barPost':
    '：显示的是内置示例数据（内容取自你真实的 mod 目录），不会读写你的磁盘。启动 Electron 客户端后即为真实数据。',
  // ------------------------------ 完整版自更新横幅 ------------------------------
  'updateBar.available': '发现新版本 v{next}（当前 v{cur}）',
  'updateBar.availableHint': '下载完会自动重启安装，不用再手动下载。',
  'updateBar.downloading': '正在下载 v{next}… {percent}%',
  'updateBar.downloaded': 'v{next} 已下载完成',
  'updateBar.downloadedHint': '点「立即重启安装」完成更新，程序会自动重启。',
  'updateBar.download': '下载更新',
  'updateBar.later': '稍后',
  'updateBar.installNow': '立即重启安装',
  'common.all': '全部',
  'common.cancel': '取消',
  'common.close': '关闭',
  'common.save': '保存',
  'common.retry': '重试',
  'common.refresh': '刷新',
  'common.loading': '加载中…',
  'common.uncategorized': '未分类',
  /**
   * 订阅数之类的大数字：中文「万」，英文按千位 k。
   * 调用处同时传 n（值）与 k（千位值），见 `src/ui.ts` 的 `fmtCount()`。
   */
  'common.countWan': '{n} 万',

  // ------------------------------ 侧栏 ------------------------------
  'nav.library': 'Mod 库',
  'nav.browse': '浏览工坊',
  'nav.collections': '合集',
  'nav.saves': '存档',
  'nav.settings': '设置',
  'sidebar.brandTitle': '潜渊症 Mod',
  'sidebar.brandSub': 'BAROTRAUMA MANAGER',
  'sidebar.mockBadge': '预览',
  'sidebar.mockMode': '外观预览模式',
  'sidebar.liveMode': '已连接游戏目录',
  'sidebar.mockHint': '当前显示示例数据，未读写你的磁盘',
  'sidebar.liveHint': '数据来自你的本地 mod 目录',

  // ------------------------------ 页面标题 ------------------------------
  'page.library.title': 'Mod 库',
  'page.library.sub': '浏览本地与创意工坊 mod，查看版本对比与分类',
  'page.browse.title': '浏览工坊',
  'page.browse.sub': '搜索创意工坊上的 mod，打开页面订阅后回到这里同步进游戏',
  'page.collections.title': '合集',
  'page.collections.sub': '编排 mod 加载顺序，一键应用到游戏',
  'page.saves.title': '存档',
  'page.saves.sub': '查看每个存档当时启用了哪些 mod，找到能用它实现该存档的合集',
  'page.settings.title': '设置',
  'page.settings.sub': '目录、语言与更新',

  // ------------------------------ 顶栏 ------------------------------
  'top.syncToGame': '同步到游戏',
  'top.syncToGameTip': 'Steam 已经下载好了 {n} 个 mod 的更新，但游戏还没装 —— 点这里同步进去',
  'top.backupWorkshop': '备份工坊 mod',
  'top.backupWorkshopTip': '把所有创意工坊 mod 复制一份到 LocalMods',
  'top.rescan': '重新扫描',
  'top.launchGame': '启动游戏',

  // ------------------------------ Mod 库 ------------------------------
  'library.searchPlaceholder': '搜索 mod 名称 / 工坊 ID…',
  'library.source.all': '全部',
  'library.source.local': '本地',
  'library.source.workshop': '工坊',
  'library.hasUpdate': '有更新',
  'library.hasUpdateTip': '只看创意工坊有更新的本地 mod',
  'library.delisted': '已下架',
  'library.invisible': '工坊不可见',
  'library.delistedTip': '只看已被作者从创意工坊下架的 mod —— 工坊上再也下不到了，建议备份到本地',
  'library.invisibleTip':
    '只看工坊上匿名看不到的 mod —— 可能是已下架，也可能是作者（或你自己）设成了私有。在设置里填个 Steam API Key 就能准确区分',
  'library.backupThese': '一键备份这些',
  'library.backupTheseTip': '把这些已下架的 mod 复制进 LocalMods，之后不依赖工坊和 Steam',
  'library.sort.nameAsc': '名称 A → Z',
  'library.sort.nameDesc': '名称 Z → A',
  'library.sort.versionDesc': '版本 高 → 低',
  'library.sort.mtime': '最近修改',
  'library.resultCount': '{shown} / {total} 个 mod',
  'library.uncategorizedTip': '只看还没有任何标签的 mod —— 新订阅的 mod 通常都在这里',
  'library.empty': '没有匹配的 mod',
  'library.emptyHint': '试试清空搜索或切换筛选条件',

  // ------------------------------ 卡片 ------------------------------
  'card.source.workshop': '工坊',
  'card.source.local': '本地',
  'card.same': '本地=工坊',
  'card.workshopNewer': '工坊有更新',
  'card.localNewer': '本地已改版',
  'card.backedUp': '已备份到本地',
  'card.delisted': '工坊已下架',
  'card.delistedBackedUp': '已下架 · 已备份',
  'card.delistedPendingBackup': '已下架 · 待备份',
  'card.invisible': '工坊不可见',
  'card.different': '版本不同',
  'card.installPending': '待同步到游戏',
  'card.installPendingTip':
    'Steam 已经下载好了这个更新（{state}），但游戏要你在 mod 列表里按更新键才会装。点顶部「同步到游戏」可以直接装好',
  'card.installStateOld': '游戏里装的还是 v{version}',
  'card.installStateNone': '游戏里还没装过',
  'card.onlyInstalled': '仅剩游戏副本',
  'card.onlyInstalledTip': 'Steam 订阅目录里已经没有它，只剩游戏里这份副本',
  'card.usedInCount': '{n} 个合集',
  'card.usedInTip': '已用于：{list}',
  'card.delistedTipInvisible':
    '工坊上匿名看不到这个条目 —— 可能是已下架，也可能是作者（或你自己）把它设成了私有。填一个 Steam API Key 就能准确区分',
  'card.delistedTipLocal': '这个本地 mod 对应的工坊原版已被作者下架（本地副本本来就是安全的）',
  'card.delistedTipBackedUp': '已确认从工坊下架，但 LocalMods 里已经有一份备份了 —— 已经安全',
  'card.delistedTipNeedBackup': '已确认从工坊下架，而 LocalMods 里还没有备份 —— 建议马上备份',

  // ------------------------------ 更新提示 ------------------------------
  'updater.workshopTitle': '工坊已更新到 v{version}',
  'updater.workshopBody':
    '（当前运行 v{current}）升级包已经在工坊目录里了，点一下就会自动升级并重启，不用手动换文件。',
  'updater.workshopApplyNow': '立即升级',
  'updater.workshopApplyingShort': '正在升级…',
  'updater.workshopApplying': '正在升级，程序马上会关闭，装完自动重开新版…',
  'updater.workshopApplyFailed': '升级没能启动',
  'updater.workshopNoInstaller': '工坊条目里没找到可用的升级包（可能还没下载完），稍后重启程序再试。',
  'updater.showPath': '看下载位置',
  'updater.hidePath': '收起',
  'updater.dismiss': '这次不提示',

  /*
   * `settings.*` 的文案**不在这里** —— 按要求全部归 `src/i18n/settings.ts`
   *（§1.6 的片段约定：前缀即归属）。语言选择器的那几条也在那边。
   */
} as const;

/** 基础文案的英文 */
const baseEn: Record<keyof typeof baseZh, string> = {
  'app.title': 'Barotrauma Mod Manager',
  'common.listSeparator': ', ',
  'toast.scanFailed': 'Failed to read the mod folder',
  'toast.launching': 'Launching the game',
  'toast.launchingViaSteam': 'Game .exe not found — handing off to Steam',
  'toast.launchFailed': 'Failed to launch the game',
  'toast.addToCollectionFailed': 'Failed to add to the collection',
  'toast.removeFromCollectionFailed': 'Failed to remove from the collection',
  'toast.addedToCollection': 'Added to collection "{name}"',
  'toast.addedToCollectionWith': 'Added to collection "{name}" (with {n} related mods)',
  'toast.removedFromCollection': 'Removed from collection "{name}"',
  'toast.relationsSaveFailed': 'Failed to save dependencies',
  'toast.tagCreateFailed': 'Failed to create the tag',
  'toast.tagCreated': 'Created tag "{name}"',
  'toast.tagDeleteFailed': 'Failed to delete the tag',
  'toast.tagDeleted': 'Deleted tag "{name}"',
  'toast.tagDeletedAffected': 'Removed from {n} mods (type the same tag again to restore it)',
  'toast.tagDeletedHint': 'Type the same tag again to restore it',
  'toast.apiKeyUnusable': 'The API key is unusable — fell back to checking the Workshop pages',
  'toast.delistedFound': '{n} mod(s) have been delisted from the Workshop',
  'toast.delistedFoundHint': 'Click "Delisted" in the toolbar to see them',
  'toast.checkIncomplete': 'The delisting check could not finish',
  'toast.checkUnknownPage':
    '{n} item(s) could not be checked (adult content requires signing in) — add a Steam Web API key in Settings for a reliable check',
  'toast.apiKeyUnusableShort': 'The API key is unusable',
  'toast.fellBackToPage': '{err} (fell back to checking the Workshop pages)',
  'toast.checkDoneNothing': 'Check finished — no delisted mods found',
  'toast.checkUnknownShort':
    '{n} more item(s) could not be verified (adult content requires signing in) — add a Steam Web API key for a reliable check',
  'toast.modeApiKey': 'Checked via the official API',
  'toast.modePage': 'Checked via the Workshop pages',
  'toast.checkFailed': 'The delisting check failed',
  'toast.apiKeySaved': 'API key saved',
  'toast.apiKeyCleared': 'API key cleared',
  'toast.apiKeySavedHint': 'The next check will use the official API',
  'toast.apiKeyClearedHint': 'It will fall back to reading the Workshop pages',
  'toast.saveFailed': 'Failed to save',
  'toast.updateCheckFailed': 'Failed to check for updates',
  'toast.updateDownloadFailed': 'Failed to download the update',
  'toast.updateInstallFailed': 'Failed to start the installer',
  'mock.barPre': 'This is the ',
  'mock.barBold': 'appearance preview',
  'mock.barPost':
    ': it shows built-in sample data (taken from your real mod folder) and never reads or writes your disk. Launch the Electron client for real data.',
  'updateBar.available': 'New version v{next} available (currently v{cur})',
  'updateBar.availableHint': 'It will install automatically after downloading — no manual download needed.',
  'updateBar.downloading': 'Downloading v{next}… {percent}%',
  'updateBar.downloaded': 'v{next} downloaded',
  'updateBar.downloadedHint': 'Click "Restart and install" to finish; the app restarts automatically.',
  'updateBar.download': 'Download update',
  'updateBar.later': 'Later',
  'updateBar.installNow': 'Restart and install',
  'common.all': 'All',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.save': 'Save',
  'common.retry': 'Retry',
  'common.refresh': 'Refresh',
  'common.loading': 'Loading…',
  'common.uncategorized': 'Uncategorized',
  'common.countWan': '{k}k',

  'nav.library': 'Mod Library',
  'nav.browse': 'Browse Workshop',
  'nav.collections': 'Collections',
  'nav.saves': 'Saves',
  'nav.settings': 'Settings',
  'sidebar.brandTitle': 'Barotrauma Mod',
  'sidebar.brandSub': 'BAROTRAUMA MANAGER',
  'sidebar.mockBadge': 'PREVIEW',
  'sidebar.mockMode': 'Appearance preview',
  'sidebar.liveMode': 'Game folder connected',
  'sidebar.mockHint': 'Showing sample data — your disk is not read or written',
  'sidebar.liveHint': 'Data comes from your local mod folder',

  'page.library.title': 'Mod Library',
  'page.library.sub': 'Browse local and Workshop mods, compare versions and categories',
  'page.browse.title': 'Browse Workshop',
  'page.browse.sub': 'Search Workshop mods, subscribe on the item page, then sync them into the game',
  'page.collections.title': 'Collections',
  'page.collections.sub': 'Arrange the load order and apply it to the game in one click',
  'page.saves.title': 'Saves',
  'page.saves.sub': 'See which mods each save had enabled',
  'page.settings.title': 'Settings',
  'page.settings.sub': 'Paths, language and updates',

  'top.syncToGame': 'Sync to game',
  'top.syncToGameTip':
    'Steam has downloaded updates for {n} mod(s) but the game has not installed them yet — click to sync',
  'top.backupWorkshop': 'Back up Workshop mods',
  'top.backupWorkshopTip': 'Copy every Workshop mod into LocalMods',
  'top.rescan': 'Rescan',
  'top.launchGame': 'Launch game',

  'library.searchPlaceholder': 'Search mod name / Workshop ID…',
  'library.source.all': 'All',
  'library.source.local': 'Local',
  'library.source.workshop': 'Workshop',
  'library.hasUpdate': 'Updates',
  'library.hasUpdateTip': 'Only show local mods whose Workshop version is newer',
  'library.delisted': 'Delisted',
  'library.invisible': 'Hidden on Workshop',
  'library.delistedTip':
    'Only show mods the author removed from the Workshop — they can no longer be downloaded, so back them up locally',
  'library.invisibleTip':
    'Only show mods that are not publicly visible on the Workshop — they may be delisted, or set to private by the author (or by you). Add a Steam API key in Settings to tell these apart',
  'library.backupThese': 'Back up these',
  'library.backupTheseTip':
    'Copy these delisted mods into LocalMods so they no longer depend on the Workshop or Steam',
  'library.sort.nameAsc': 'Name A → Z',
  'library.sort.nameDesc': 'Name Z → A',
  'library.sort.versionDesc': 'Version high → low',
  'library.sort.mtime': 'Recently modified',
  'library.resultCount': '{shown} / {total} mods',
  'library.uncategorizedTip': 'Only show mods without any tag — newly subscribed mods usually land here',
  'library.empty': 'No matching mods',
  'library.emptyHint': 'Try clearing the search or switching filters',

  'card.source.workshop': 'Workshop',
  'card.source.local': 'Local',
  'card.same': 'local = Workshop',
  'card.workshopNewer': 'Workshop is newer',
  'card.localNewer': 'local edited',
  'card.backedUp': 'backed up locally',
  'card.delisted': 'delisted',
  'card.delistedBackedUp': 'delisted · backed up',
  'card.delistedPendingBackup': 'delisted · needs backup',
  'card.invisible': 'hidden on Workshop',
  'card.different': 'version differs',
  'card.installPending': 'pending sync',
  'card.installPendingTip':
    'Steam has downloaded this update ({state}), but the game only installs it when you press the update button in its mod list. Click "Sync to game" at the top to install it now',
  'card.installStateOld': 'the game still has v{version}',
  'card.installStateNone': 'never installed in the game',
  'card.onlyInstalled': 'game copy only',
  'card.onlyInstalledTip':
    'It is no longer in the Steam subscription folder — only this copy inside the game remains',
  'card.usedInCount': '{n} collection(s)',
  'card.usedInTip': 'Used in: {list}',
  'card.delistedTipInvisible':
    'This item is not publicly visible on the Workshop — it may be delisted, or set to private by the author (or by you). Add a Steam API key to tell these apart',
  'card.delistedTipLocal':
    'The Workshop original of this local mod was removed by its author (your local copy is safe)',
  'card.delistedTipBackedUp':
    'Confirmed removed from the Workshop, but a backup already exists in LocalMods — you are safe',
  'card.delistedTipNeedBackup':
    'Confirmed removed from the Workshop and there is no backup in LocalMods yet — back it up now',

  'updater.workshopTitle': 'Workshop updated to v{version}',
  'updater.workshopBody':
    '(currently running v{current}) The upgrade package is already in the Workshop folder — one click updates and restarts the app, no need to replace files by hand.',
  'updater.workshopApplyNow': 'Update now',
  'updater.workshopApplyingShort': 'Updating…',
  'updater.workshopApplying':
    'Updating — the app will close now and reopen the new version automatically…',
  'updater.workshopApplyFailed': 'Could not start the upgrade',
  'updater.workshopNoInstaller':
    'No usable upgrade package in the Workshop item yet (the download may still be running). Restart the app later and try again.',
  'updater.showPath': 'Show download location',
  'updater.hidePath': 'Hide',
  'updater.dismiss': 'Do not show again'
};

/*
 * 汇总：基础表 + 各画面片段。
 *
 * `as const` 是为了让 `keyof typeof zh` 保留字面量键 —— `t()` 的 key 类型由它推出，
 * 写错 key 会在 tsc 阶段报错，而不是运行时才发现。
 */
const zh = {
  ...baseZh,
  ...settingsZh,
  ...modalsZh,
  ...collectionsZh,
  ...savesZh,
  ...browseZh,
  ...browseDetailZh
} as const;

const en: Record<keyof typeof zh, string> = {
  ...baseEn,
  ...settingsEn,
  ...modalsEn,
  ...collectionsEn,
  ...savesEn,
  ...browseEn,
  ...browseDetailEn
};

/** 全部合法文案 key。组件里要声明"某个 key"类型的参数时用它，别手写字面量 union */
export type TKey = keyof typeof zh;

const CATALOGS: Record<Lang, Record<string, string>> = { zh, en };

/**
 * 语言存在 localStorage，不进 settings.json。
 * 理由：它只影响这台机器上的界面显示，跟游戏/目录配置无关；而且放在这里切换能**立即**生效，
 * 不用等 `scan()` 把 settings 再走一遍。项目里已有同样的先例（`bmm.collections.appliedView`）。
 */
export const LANG_STORAGE_KEY = 'bmm.lang';

let current: Lang = 'zh';

/** 当前语言 */
export function getLang(): Lang {
  return current;
}

/**
 * 当前语言对应的 BCP-47 标签，给 `toLocaleString` / `toLocaleDateString` 用。
 *
 * 别在组件里硬编码 `'zh-CN'`：那样英文界面的日期还是中文格式
 *（例如 `2026/10/11 22:12:47` 而不是 `10/11/2026, 10:12:47 PM`）。
 */
export function localeTag(): string {
  return current === 'en' ? 'en-US' : 'zh-CN';
}

/** 设置当前语言（App 负责持久化与重渲染） */
export function setLang(lang: Lang): void {
  current = lang === 'en' ? 'en' : 'zh';
}

/**
 * 按系统语言决定首次使用的语言。
 *
 * 规则（刻意如此）：
 *   - **简体中文 / 繁体中文 → 简体中文**（我们只有一套中文界面，繁体用户看简体）
 *   - **其它任何语言 → 英文**
 *
 * 注意别写成只认 `zh-CN`：`zh-TW`/`zh-HK`/`zh-Hant` 也要落到中文，
 * 否则繁体用户会被丢到英文界面去。
 */
export function detectLang(): Lang {
  let l = '';
  try {
    l = String(navigator.language || '').toLowerCase();
  } catch {
    return 'zh';
  }
  // zh、zh-cn、zh-hans、zh-sg → 简体；zh-tw、zh-hk、zh-mo、zh-hant → 也是中文界面
  if (l === 'zh' || l.startsWith('zh-')) return 'zh';
  return 'en';
}

/** 把 {name} 占位符替换掉 */
function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/**
 * 取首次使用的语言，并**立刻记住**。
 *
 * 语义是"只在第一次检测系统语言"：第一次进来按系统语言定下来并存盘，
 * 以后就一直用它 —— 用户之后改了系统语言也不会被自动改掉（他可以在设置里自己换）。
 *
 * @param allowSwitch 变体是否提供语言切换；不允许时一律中文（完整版暂时如此）
 */
export function loadSavedLang(allowSwitch: boolean): Lang {
  if (!allowSwitch) return 'zh';
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === 'zh' || saved === 'en') return saved; // 已经定过，不再检测
  } catch {
    /* 隐私模式等读不到 localStorage：只能每次现算 */
    return detectLang();
  }
  const first = detectLang();
  persistLang(first); // 第一次检测的结果直接落盘
  return first;
}

/** 记住语言（失败也无所谓，只是下次启动回默认） */
export function persistLang(lang: Lang): void {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    /* 忽略 */
  }
}

/**
 * 取文案。
 * @param key 形如 'nav.library'；填错时直接返回 key 本身，方便一眼看出漏翻
 * @param vars 占位符，如 `{ n: 3 }` 对应文案里的 `{n}`
 */
export function t(key: TKey, vars?: Record<string, string | number>): string {
  const table = CATALOGS[current] || zh;
  // 英文表缺项时回退到中文原文，而不是显示 key
  const s = table[key] || zh[key] || String(key);
  return interpolate(s, vars);
}
