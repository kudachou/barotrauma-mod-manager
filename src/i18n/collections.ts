/**
 * 合集页的文案。
 * 约定见 `src/i18n/settings.ts` 的注释；这里用 `collections.` 前缀。
 */
export const collectionsZh = {
  // ------------------------------ 左侧合集列表 ------------------------------
  'collections.allTitle': '全部合集',
  'collections.newTip': '新建合集',
  'collections.importTip': '从文件或朋友发来的文字导入合集',
  'collections.namePlaceholder': '合集名称…',
  'collections.create': '创建',
  'collections.noCollections': '还没有合集',

  // ------------------------------ 游戏当前应用（虚拟条目 + 只读视图） ------------------------------
  'collections.appliedRowTip': '读自 config_player.xml，即游戏现在真正加载的 mod',
  'collections.appliedPageTitle': '游戏当前应用',
  'collections.appliedBadge': '当前应用',
  'collections.modCount': '{n} 个 mod',
  'collections.configUnreadable': '读不到配置',
  'collections.missingCount': '{n} 个缺失',
  'collections.viewToggleTip': '换个看法：紧凑列表 / 大卡片',
  'collections.viewList': '列表',
  'collections.viewCard': '大卡片',
  'collections.appliedUnavailableTitle': '读不到游戏当前配置',
  'collections.appliedPathHint': '请到「设置」里确认 config_player.xml 的路径',
  'collections.appliedVanillaTitle': '游戏当前只加载了原版内容',
  'collections.appliedVanillaHint': '在任意合集里点「应用到游戏」，这里就会显示实际生效的 mod',
  'collections.appliedHint':
    '这是游戏现在真正加载的 mod，按加载顺序排列（读自 config_player.xml）。这里是只读的，要改请回到对应合集里改完再应用。',

  // ------------------------------ 编辑器：头部与工具栏 ------------------------------
  'collections.unsaved': '未保存',
  'collections.missingTip': '有 mod 在当前目录中找不到',
  'collections.exportTip': '导出这个合集（.xml 连没装本管理器的人也能用）',
  'collections.exportBtn': '导出',
  'collections.deleteTip': '删除该合集',
  'collections.revertBtn': '还原',
  'collections.revertTip': '丢掉没保存的改动，回到上次保存的样子',
  'collections.revertedTitle': '已还原',
  'collections.revertedBody': '没保存的改动丢掉了，这个合集回到上次保存时的样子',
  'collections.revertFailed': '还原失败',
  'collections.discardTitle': '已丢弃未保存的改动',
  'collections.discardBody': '切换到别的合集之前，刚才那个合集按上次保存的内容还原了',
  'collections.applyBtn': '应用到游戏',

  // ------------------------------ 编辑器：条目列表 ------------------------------
  'collections.dragHint': '拖拽调整顺序（顺序即加载顺序，越靠下越后加载）',
  'collections.onlyMissingTip': '只看本机还没有的 mod —— 每个都能点『去订阅』打开工坊页面',
  'collections.onlyMissing': '只看未订阅 {n}',
  'collections.emptyTitle': '合集是空的',
  'collections.emptyHint': '从右侧列表点击添加 mod',
  'collections.missingHintA': '{n} 个 mod 本机还没有（没订阅 / 没下载 / 本地文件夹不在）。点每行的「',
  'collections.subscribe': '去订阅',
  'collections.missingHintB': '」打开工坊页面订阅，下好后回到顶栏点「同步到游戏」装进游戏。',
  'collections.subscribeTip': '在 Steam 里打开这个 mod 的工坊页面去订阅',
  'collections.removeTip': '移除',
  'collections.versionUnknown': '版本未知',
  'collections.notFound': '未找到',

  // ------------------------------ 右侧挑选列表 ------------------------------
  'collections.pickerPlaceholder': '搜索并添加到合集…',

  // ------------------------------ 空态：没选中合集 ------------------------------
  'collections.selectTitle': '选择左侧的一个合集',
  'collections.selectHint': '或点击 + 新建一个合集 / 点 ⤓ 导入朋友发来的合集',

  // ------------------------------ 提示条 / Toast ------------------------------
  'collections.openedInSteam': '已在 Steam 里打开',
  'collections.openedInSteamHint': '订阅并下载完成后，回到这里点顶栏「同步到游戏」',
  'collections.openedInBrowser': '已用浏览器打开工坊页面',
  'collections.openedInBrowserHint': '订阅后回到这里点顶栏「同步到游戏」',
  'collections.openWorkshopFailed': '打不开工坊页面',
  'collections.saveFailed': '保存合集失败',
  'collections.createFailed': '创建合集失败',
  'collections.deleted': '已删除合集',
  'collections.deleteFailed': '删除失败',
  'collections.applyFailed': '应用失败',
  'collections.appliedTitle': '已应用到游戏',
  'collections.appliedUnchanged': '游戏里的配置本来就是这个合集，没有改动文件{prune}',
  'collections.appliedBackup': '原配置已备份为 {name}（每次应用覆盖同一个）{prune}',
  'collections.appliedNextLaunch': '下次启动游戏即生效',
  'collections.applyMissingTitle': '已应用，但有 {n} 个 mod 游戏还没安装',
  'collections.applyMissingBody': '{head}{etc} —— 启动游戏后会自动安装，本次已照常写入{prune}',
  'collections.etc': ' 等',
  /* 列表分隔符统一用 common.listSeparator */
  'collections.pruneNote': '，并清理了 {n} 个旧备份'
} as const;

export const collectionsEn: Record<keyof typeof collectionsZh, string> = {
  'collections.allTitle': 'All collections',
  'collections.newTip': 'New collection',
  'collections.importTip': 'Import a collection from a file or from text a friend sent you',
  'collections.namePlaceholder': 'Collection name…',
  'collections.create': 'Create',
  'collections.noCollections': 'No collections yet',

  'collections.appliedRowTip': 'Read from config_player.xml — the mods the game actually loads right now',
  'collections.appliedPageTitle': 'Currently applied in game',
  'collections.appliedBadge': 'currently applied',
  'collections.modCount': '{n} mod(s)',
  'collections.configUnreadable': 'Config unreadable',
  'collections.missingCount': '{n} missing',
  'collections.viewToggleTip': 'Switch view: compact list / large cards',
  'collections.viewList': 'List',
  'collections.viewCard': 'Cards',
  'collections.appliedUnavailableTitle': "Could not read the game's current config",
  'collections.appliedPathHint': 'Check the path to config_player.xml in Settings',
  'collections.appliedVanillaTitle': 'The game currently loads vanilla content only',
  'collections.appliedVanillaHint':
    'Click "Apply to game" in any collection and the mods actually in effect will appear here',
  'collections.appliedHint':
    'These are the mods the game really loads right now, in load order (read from config_player.xml). This view is read-only — to change something, edit the collection and apply it again.',

  'collections.unsaved': 'Unsaved',
  'collections.missingTip': 'Some mods cannot be found in the current folders',
  'collections.exportTip':
    'Export this collection (the .xml also works for people who do not have this manager installed)',
  'collections.exportBtn': 'Export',
  'collections.deleteTip': 'Delete this collection',
  'collections.revertBtn': 'Revert',
  'collections.revertTip': 'Drop unsaved changes and go back to the last saved version',
  'collections.revertedTitle': 'Reverted',
  'collections.revertedBody': 'Unsaved changes were dropped; this collection is back to its last saved version',
  'collections.revertFailed': 'Could not revert',
  'collections.discardTitle': 'Unsaved changes discarded',
  'collections.discardBody':
    'The collection you were editing was restored to its last saved version before switching',
  'collections.applyBtn': 'Apply to game',

  'collections.dragHint': 'Drag to reorder (the order is the load order — entries further down load later)',
  'collections.onlyMissingTip':
    'Only show mods you do not have locally — each one has a "Subscribe" button that opens its Workshop page',
  'collections.onlyMissing': 'Only missing {n}',
  'collections.emptyTitle': 'This collection is empty',
  'collections.emptyHint': 'Click mods in the list on the right to add them',
  'collections.missingHintA':
    '{n} mod(s) are not on this machine yet (not subscribed / not downloaded / local folder missing). Click "',
  'collections.subscribe': 'Subscribe',
  'collections.missingHintB':
    '" on each row to open its Workshop page and subscribe; once downloaded, go back to the top bar and click "Sync to game" to install it.',
  'collections.subscribeTip': "Open this mod's Workshop page in Steam to subscribe",
  'collections.removeTip': 'Remove',
  'collections.versionUnknown': 'Unknown version',
  'collections.notFound': 'Not found',

  'collections.pickerPlaceholder': 'Search and add to a collection…',

  'collections.selectTitle': 'Select a collection on the left',
  'collections.selectHint': 'Or click + to create a collection / click ⤓ to import one a friend sent you',

  'collections.openedInSteam': 'Opened in Steam',
  'collections.openedInSteamHint':
    'Once it is subscribed and downloaded, come back here and click "Sync to game" in the top bar',
  'collections.openedInBrowser': 'Opened the Workshop page in your browser',
  'collections.openedInBrowserHint': 'After subscribing, come back here and click "Sync to game" in the top bar',
  'collections.openWorkshopFailed': 'Could not open the Workshop page',
  'collections.saveFailed': 'Failed to save the collection',
  'collections.createFailed': 'Failed to create the collection',
  'collections.deleted': 'Collection deleted',
  'collections.deleteFailed': 'Delete failed',
  'collections.applyFailed': 'Failed to apply',
  'collections.appliedTitle': 'Applied to game',
  'collections.appliedUnchanged': 'The game config already matched this collection, so no files were changed{prune}',
  'collections.appliedBackup': 'The previous config was backed up as {name} (overwritten on every apply){prune}',
  'collections.appliedNextLaunch': 'Takes effect the next time you start the game',
  'collections.applyMissingTitle': 'Applied, but {n} mod(s) are not installed in the game yet',
  'collections.applyMissingBody':
    '{head}{etc} — the game will install them automatically on launch; the config was written as usual{prune}',
  'collections.etc': ' etc.',
  'collections.pruneNote': ', and cleaned up {n} old backup(s)'
};
