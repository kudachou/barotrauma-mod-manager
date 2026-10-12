/**
 * 「浏览工坊」主界面的文案片段（BrowseView）。
 *
 * 只有**完整版**会渲染这个界面（工坊版没有浏览工坊功能），
 * 所以这段是最晚才翻的 —— 完整版的语言切换就等它。
 *
 * 约定见 docs/HANDOVER.md §1.6：zh 的值必须是原文（只抽字符串，不改文案），
 * `browseEn` 的 key 必须与 `browseZh` 完全一致（由类型强制，tsc 会拦住漏翻）。
 *
 * 说明几处**拆开的 key**（`...1` / `...2` / `...Pre` / `...Post`）：原文里中文被
 * `<b>` / `<code>` / `<br>` 夹着，为了让中英两边都读得通，按标签边界切成几段。
 */
export const browseZh = {
  // ------------------------------ 排序 ------------------------------
  /* 模块级常量里不能调 `t()`，所以这里只存 key（见 §1.6 规则 3） */
  'browse.sortPopular': '最热门',
  'browse.sortTrend': '趋势',
  'browse.sortUpdated': '最近更新',
  'browse.sortNewest': '最新发布',
  'browse.sortTop': '口碑最好',
  'browse.sortSearchTip': '搜索时由 Steam 的相关度排序决定',

  /* 大数字统一用 `common.countWan`（收敛到基础表，别在这里再存一份） */

  // ------------------------------ 分类标签 ------------------------------
  'browse.maxTags': '最多同时选 {n} 个分类',
  'browse.maxTagsHint': '多个分类是「同时满足」的关系，选太多会筛不到东西',
  'browse.clearTagFilterTip': '不按分类筛',
  'browse.allCategories': '全部分类',
  'browse.tagCountTip': '{n} 个热门条目带这个分类',
  'browse.selectedTags': '已选 {n}/{max}（同时满足）',
  'browse.tagsLoadFailed': '分类没读到：{error}',

  // ------------------------------ 打开 Steam / 工坊页面（toast） ------------------------------
  'browse.cannotOpenSteam': '打不开 Steam',
  'browse.openedInSteam': '已在 Steam 客户端里打开',
  'browse.openedInSteamHint':
    '在 Steam 里点「订阅」，下载完成后回到本管理器点顶栏「同步到游戏」即可装进游戏',
  'browse.steamFallbackWeb': '没能打开 Steam 客户端，已改用网页版',
  'browse.openPageFailed': '打不开工坊页面',
  'browse.openedInBrowser': '已用浏览器打开工坊页面',
  'browse.openedInBrowserHint': '在那个页面上点「订阅」也一样有效',

  // ------------------------------ 工具栏 ------------------------------
  'browse.searchPlaceholder': '搜索工坊 mod（按标题/描述）…',
  'browse.search': '搜索',
  'browse.totalLine': '共 {total} 个 · 第 {page} / {pages} 页',
  'browse.loadingShort': '读取中…',
  'browse.searchingPre': '正在搜索「',
  'browse.searchingPost': '」',
  'browse.clear': '清除',

  // ------------------------------ 需要 API Key ------------------------------
  'browse.needKeyTitle': '这个功能需要 Steam Web API Key',
  'browse.needKeyBody1': '「浏览创意工坊」用的是官方查询接口 ',
  /* 逗号后那个空格是原文里 JSX 换行折叠出来的，保留它中文界面才不会变样 */
  'browse.needKeyBody2': '， 不带 key 会被 Steam 拒绝（403）。',
  'browse.needKeyBody3': '去 ',
  'browse.needKeyBody4':
    ' 免费申请一个（域名随便填 localhost）， 填到「设置」里的 Steam Web API Key 就能用了。',
  'browse.needKeyBody5':
    '另外这个页面要能访问 Steam（国内一般需要开加速器），不然会一直「连不上 Steam」。',
  'browse.goSettingsForKey': '去设置里填 Key',

  // ------------------------------ 读取失败 / 空状态 ------------------------------
  'browse.loadFailedTitle': '没读到工坊数据',
  'browse.loadingWorkshop': '正在读取创意工坊…',
  'browse.noSearchResults': '没搜到符合条件的 mod',
  'browse.noResults': '没有结果',

  // ------------------------------ 卡片 ------------------------------
  'browse.ownedTip': '你的 mod 库里已经有这个条目了',
  'browse.owned': '已有',
  'browse.notSubscribedTip': '还没订阅',
  'browse.notSubscribed': '未订阅',
  'browse.subscriptionsTip': '订阅数',
  'browse.favoritedTip': '收藏数',
  'browse.updatedTip': '最后更新',
  'browse.viewDetailsTip': '看描述与截图',
  'browse.details': '详情',
  'browse.openInSteamTip': '在 Steam 客户端里打开这个条目 —— 直接在客户端里点「订阅」',
  'browse.openInSteam': '在 Steam 里打开',
  'browse.openWebTip': '用浏览器打开网页版的工坊页面',
  'browse.openWeb': '网页版',

  // ------------------------------ 翻页 ------------------------------
  'browse.prevPage': '上一页',
  'browse.pageLine': '第 {page} 页 / 共 {pages} 页',
  'browse.nextPage': '下一页',

  // ------------------------------ 页脚说明 ------------------------------
  'browse.note1': '点卡片看',
  'browse.descriptionAndScreenshots': '描述与截图',
  'browse.note2': '；订阅走 Steam 自己：点「',
  'browse.note3':
    '」→ 在 Steam 客户端里点「订阅」（按钮换成「网页版」就用浏览器打开，效果一样）→ 下载完成后回到本管理器，点顶栏的「同步到游戏」把新装的 mod 同步进游戏（本页刻意不做下载，免得引入 SteamCMD 依赖）。',
  'browse.note4': '本页的数据都来自 Steam 官方接口/页面，所以',
  'browse.mustReachSteam': '必须能访问 Steam',
  'browse.note5': '—— 国内一般要先开加速器/代理，否则会一直「连不上 Steam」。'
} as const;

export const browseEn: Record<keyof typeof browseZh, string> = {
  // ------------------------------ Sort ------------------------------
  'browse.sortPopular': 'Most popular',
  'browse.sortTrend': 'Trending',
  'browse.sortUpdated': 'Recently updated',
  'browse.sortNewest': 'Newest',
  'browse.sortTop': 'Top rated',
  'browse.sortSearchTip': 'While searching, Steam sorts the results by relevance',

  // ------------------------------ Tags ------------------------------
  'browse.maxTags': 'You can pick at most {n} tags',
  'browse.maxTagsHint': 'Multiple tags are combined with AND, so picking too many filters everything out',
  'browse.clearTagFilterTip': 'Do not filter by tag',
  'browse.allCategories': 'All tags',
  'browse.tagCountTip': '{n} popular items have this tag',
  'browse.selectedTags': 'Selected {n}/{max} (all must match)',
  'browse.tagsLoadFailed': 'Could not read the tags: {error}',

  // ------------------------------ Opening Steam / the Workshop page (toasts) ------------------------------
  'browse.cannotOpenSteam': 'Could not open Steam',
  'browse.openedInSteam': 'Opened in the Steam client',
  'browse.openedInSteamHint':
    'Click "Subscribe" in Steam, then come back here and click "Sync to game" in the top bar once the download finishes',
  'browse.steamFallbackWeb': 'Could not open the Steam client — using the web page instead',
  'browse.openPageFailed': 'Could not open the Workshop page',
  'browse.openedInBrowser': 'Opened the Workshop page in your browser',
  'browse.openedInBrowserHint': 'Clicking "Subscribe" on that page works just as well',

  // ------------------------------ Toolbar ------------------------------
  'browse.searchPlaceholder': 'Search Workshop mods (by title / description)…',
  'browse.search': 'Search',
  'browse.totalLine': '{total} items · page {page} / {pages}',
  'browse.loadingShort': 'Loading…',
  'browse.searchingPre': 'Searching for "',
  'browse.searchingPost': '"',
  'browse.clear': 'Clear',

  // ------------------------------ API key required ------------------------------
  'browse.needKeyTitle': 'This feature needs a Steam Web API key',
  'browse.needKeyBody1': '"Browse Workshop" uses the official query API ',
  'browse.needKeyBody2': ', and Steam rejects requests without a key (403).',
  'browse.needKeyBody3': 'Get one for free at ',
  'browse.needKeyBody4':
    ' (any domain works — just use localhost), paste it into the Steam Web API Key field in Settings, and you are set.',
  'browse.needKeyBody5':
    'This page also has to reach Steam (in mainland China an accelerator is usually required), otherwise it keeps saying "Cannot reach Steam".',
  'browse.goSettingsForKey': 'Add a key in Settings',

  // ------------------------------ Load failure / empty states ------------------------------
  'browse.loadFailedTitle': 'Could not load Workshop data',
  'browse.loadingWorkshop': 'Reading the Workshop…',
  'browse.noSearchResults': 'No mods match your search',
  'browse.noResults': 'No results',

  // ------------------------------ Cards ------------------------------
  'browse.ownedTip': 'This item is already in your mod library',
  'browse.owned': 'Owned',
  'browse.notSubscribedTip': 'Not subscribed yet',
  'browse.notSubscribed': 'Not subscribed',
  'browse.subscriptionsTip': 'Subscriptions',
  'browse.favoritedTip': 'Favorites',
  'browse.updatedTip': 'Last updated',
  'browse.viewDetailsTip': 'See the description and screenshots',
  'browse.details': 'Details',
  'browse.openInSteamTip': 'Open this item in the Steam client — then just click "Subscribe" there',
  'browse.openInSteam': 'Open in Steam',
  'browse.openWebTip': 'Open the Workshop page in your browser',
  'browse.openWeb': 'Web page',

  // ------------------------------ Paging ------------------------------
  'browse.prevPage': 'Previous',
  'browse.pageLine': 'Page {page} of {pages}',
  'browse.nextPage': 'Next',

  // ------------------------------ Footer note ------------------------------
  'browse.note1': 'Click a card for ',
  'browse.descriptionAndScreenshots': 'description and screenshots',
  'browse.note2': '; subscribing goes through Steam itself: click "',
  'browse.note3':
    '" → click "Subscribe" in the Steam client (if the button says "Web page", the browser works just as well) → come back here once the download finishes and click "Sync to game" in the top bar to install the new mods (this page deliberately downloads nothing, to avoid a SteamCMD dependency).',
  'browse.note4': 'Everything on this page comes from official Steam APIs and pages, so ',
  'browse.mustReachSteam': 'Steam must be reachable',
  'browse.note5':
    ' — in mainland China you usually need an accelerator/proxy first, otherwise it keeps saying "Cannot reach Steam".'
};
