/**
 * 设置页的文案。
 *
 * 这个文件（以及同目录的 modals/collections/saves）是**按画面拆分的片段**，
 * 由 `src/i18n.ts` 汇总进总目录。拆开的原因是：
 *   1. 一个画面一个文件，改动时不必在几百行的总表里翻找；
 *   2. 翻译工作可以按画面并行，各写各的文件、互不冲突。
 *
 * 约定：
 *   - key 用 `<画面>.<语义>` 前缀，这里是 `settings.`
 *   - **不要**在多个片段里定义同名 key（合并时后者会静默覆盖前者）
 *   - `zh` 是原文，`en` 必须覆盖同样的 key（类型会强制检查）
 */
export const settingsZh = {
  // ------------------------------ 界面语言 ------------------------------
  'settings.language': '界面语言',
  'settings.languageHint':
    '切换后立即生效，设置存在本机。创意工坊版面向国际用户，提供中英两种界面。',
  'settings.languageZh': '中文',
  'settings.languageEn': 'English',
  'settings.general': '常规',

  // ------------------------------ 目录设置 ------------------------------
  'settings.dirTitle': '目录设置',
  'settings.dirIntro':
    '首次运行会自动扫描常见 Steam 安装位置，检测不到时点「自动检测」或手动指定。路径只保存在本机，不会上传。',

  'settings.rowGameDirLabel': '游戏根目录',
  'settings.rowGameDirHint': '潜渊症安装目录，其余路径可据此推导',
  'settings.rowModListsLabel': '合集文件夹（ModLists）',
  'settings.rowModListsHint': '游戏内置的合集文件目录',
  'settings.rowLocalModsLabel': '本地 mod 文件夹（LocalMods）',
  'settings.rowLocalModsHint': '手动放入的 mod',
  'settings.rowWorkshopModsLabel': '创意工坊 mod 文件夹',
  'settings.rowWorkshopModsHint': 'Steam 订阅下载目录 …\\workshop\\content\\602960',
  'settings.rowConfigPlayerLabel': '游戏配置文件 config_player.xml',
  'settings.rowConfigPlayerHint': '「应用到游戏」会写回这里的 contentpackages 段（自动备份）',
  'settings.rowInstalledWorkshopLabel': '游戏已安装的工坊 mod 目录',
  'settings.rowInstalledWorkshopHint':
    '游戏实际加载工坊 mod 的位置（%LocalAppData%\\…\\WorkshopMods\\Installed）',

  'settings.pathExists': '路径存在',
  'settings.pathMissing': '路径不存在或未填写',
  'settings.pathUnverified': '未校验（预览模式）',

  'settings.browse': '浏览',
  'settings.saveSettings': '保存设置',
  'settings.saving': '保存中…',
  'settings.autoDetect': '自动检测',
  'settings.revert': '还原',
  'settings.pickFolderTitle': '选择{name}',
  'settings.pickFileTitle': '选择 config_player.xml',

  'settings.toastSaved': '设置已保存',
  'settings.toastSaveFailed': '保存设置失败',
  'settings.toastAutoFilled': '已自动填入 {n} 个路径',
  'settings.toastAutoFilledHint': '确认无误后点「保存设置」生效',
  'settings.toastAutoNoneTitle': '没能自动找到游戏目录',
  'settings.toastAutoNoneHint': '请手动指定；也可以用游戏根目录推出其余路径',
  'settings.toastAutoFailed': '自动检测失败',

  // ------------------------------ 关于「应用到游戏」 ------------------------------
  'settings.applyTitle': '关于「应用到游戏」',
  'settings.applyIntro': '应用合集时，程序会：',
  'settings.applyStep1': '1. 把合集里的工坊 mod 解析为',
  'settings.applyStep1End': '；',
  'settings.applyStep2': '2. 本地 mod 解析为',
  'settings.applyStep2End': '；',
  'settings.applyStep3': '3. 先备份',
  'settings.applyStep3Mid': '（带时间戳），再只替换其中的',
  'settings.applyStep3Tail': '段，其余设置原样保留。',

  // ------------------------------ 关于与更新 ------------------------------
  'settings.aboutTitle': '关于与更新',
  'settings.currentVersion': '当前版本',
  'settings.updateChecking': '正在检查更新…',
  'settings.updateAvailable': '发现新版本 v{version}',
  'settings.updateDownloading': '正在下载 v{version}…',
  'settings.updateDownloaded': 'v{version} 已下载，等待安装',
  'settings.updateUpToDate': '已是最新版本',
  'settings.updateError': '检查失败：{error}',
  'settings.updateUnknownError': '未知错误',
  'settings.updateUnsupported': '当前环境不支持自动更新',
  'settings.updateUnsupportedNote':
    '开发 / 预览模式下不可用。安装版会在启动时自动检查更新，并支持一键下载重启安装。',
  'settings.checkUpdate': '检查更新',
  'settings.checking': '检查中…',
  'settings.downloadVersion': '下载 v{version}',
  'settings.restartInstall': '立即重启安装',
  'settings.releaseNotes': '更新日志',

  // ------------------------------ 创意工坊下架检查 ------------------------------
  'settings.delistedTitle': '创意工坊下架检查',
  'settings.delistedIntro':
    '作者下架之后，本地文件看不出任何区别（Steam 的 .acf 记录和正常 mod 一模一样）， 只能联网核实。当前方式：',
  'settings.delistedModeApi': '官方 API（可靠）',
  'settings.delistedModePage': '抓工坊网页（尽力而为）',
  'settings.delistedStatDelisted': '已下架',
  'settings.delistedStatUnknown': '没能核实',
  'settings.delistedWarnPrefix': '不填 API Key 时只能抓工坊网页，而网页',
  'settings.delistedWarnBold': '分不清「已下架」和「私有」',
  'settings.delistedWarnSuffix':
    '—— 作者（或你自己）设成私有的条目，匿名访问同样是错误页。 所以那种结果只会标成「工坊不可见」，不敢断言已下架。 填个 Key 走官方接口就能准确区分，也更快。',
  'settings.apiKeyPlaceholder': '留空 = 用抓网页的方式',
  'settings.delistedApply': '去申请',
  'settings.apiKeyHintPrefix': '免费申请，域名随便填（比如 localhost）。Key 只存在本机的',
  'settings.apiKeyHintSuffix': '，不会上传到任何地方。',
  'settings.delistedLastCheck': '上次检查：',
  'settings.delistedNeverChecked': '还没查过',
  'settings.delistedUnknownNote': ' —— 没核实出来的既不会显示成「已下架」，也不会被当成正常',
  'settings.recheck': '重新检查'
} as const;

export const settingsEn: Record<keyof typeof settingsZh, string> = {
  // ------------------------------ Interface language ------------------------------
  'settings.language': 'Interface language',
  'settings.languageHint':
    'Applies immediately and is stored locally. The Workshop edition ships both Chinese and English for an international audience.',
  'settings.languageZh': '中文',
  'settings.languageEn': 'English',
  'settings.general': 'General',

  // ------------------------------ Game folders ------------------------------
  'settings.dirTitle': 'Game folders',
  'settings.dirIntro':
    'On first run the app scans the usual Steam locations. If nothing is found, click "Auto-detect" or set the paths yourself. They are stored on this machine only and never uploaded.',

  'settings.rowGameDirLabel': 'Game root folder',
  'settings.rowGameDirHint': 'Where Barotrauma is installed; the other paths can be derived from it',
  'settings.rowModListsLabel': 'Collections folder (ModLists)',
  'settings.rowModListsHint': "The game's built-in collections folder",
  'settings.rowLocalModsLabel': 'Local mods folder (LocalMods)',
  'settings.rowLocalModsHint': 'Mods you dropped in by hand',
  'settings.rowWorkshopModsLabel': 'Workshop mods folder',
  'settings.rowWorkshopModsHint': 'Steam subscription download folder …\\workshop\\content\\602960',
  'settings.rowConfigPlayerLabel': 'Game config file config_player.xml',
  'settings.rowConfigPlayerHint':
    '"Apply to game" writes the contentpackages section back here (with an automatic backup)',
  'settings.rowInstalledWorkshopLabel': 'Workshop mods installed by the game',
  'settings.rowInstalledWorkshopHint':
    'Where the game actually loads Workshop mods from (%LocalAppData%\\…\\WorkshopMods\\Installed)',

  'settings.pathExists': 'Path exists',
  'settings.pathMissing': 'Path missing or not set',
  'settings.pathUnverified': 'Not checked (preview mode)',

  'settings.browse': 'Browse',
  'settings.saveSettings': 'Save settings',
  'settings.saving': 'Saving…',
  'settings.autoDetect': 'Auto-detect',
  'settings.revert': 'Revert',
  'settings.pickFolderTitle': 'Select {name}',
  'settings.pickFileTitle': 'Select config_player.xml',

  'settings.toastSaved': 'Settings saved',
  'settings.toastSaveFailed': 'Could not save settings',
  'settings.toastAutoFilled': 'Filled in {n} path(s) automatically',
  'settings.toastAutoFilledHint': 'Click "Save settings" once everything looks right',
  'settings.toastAutoNoneTitle': 'Could not find the game folder automatically',
  'settings.toastAutoNoneHint':
    'Set it by hand, or point at the game root folder and let the rest be derived from it',
  'settings.toastAutoFailed': 'Auto-detect failed',

  // ------------------------------ About "Apply to game" ------------------------------
  'settings.applyTitle': 'About "Apply to game"',
  'settings.applyIntro': 'When you apply a collection, the app:',
  'settings.applyStep1': '1. resolves the Workshop mods in it to',
  'settings.applyStep1End': ';',
  'settings.applyStep2': '2. resolves local mods to',
  'settings.applyStep2End': ';',
  'settings.applyStep3': '3. backs up',
  'settings.applyStep3Mid': '(with a timestamp) first, then replaces only the ', // 末尾空格：英文需要，中文原文没有
  'settings.applyStep3Tail': 'section inside it and leaves every other setting untouched.',

  // ------------------------------ About and updates ------------------------------
  'settings.aboutTitle': 'About & updates',
  'settings.currentVersion': 'Current version',
  'settings.updateChecking': 'Checking for updates…',
  'settings.updateAvailable': 'Version v{version} is available',
  'settings.updateDownloading': 'Downloading v{version}…',
  'settings.updateDownloaded': 'v{version} downloaded, ready to install',
  'settings.updateUpToDate': 'Up to date',
  'settings.updateError': 'Check failed: {error}',
  'settings.updateUnknownError': 'unknown error',
  'settings.updateUnsupported': 'Automatic updates are not supported in this environment',
  'settings.updateUnsupportedNote':
    'Not available in development / preview mode. The installed build checks for updates on startup and can download, restart and install in one click.',
  'settings.checkUpdate': 'Check for updates',
  'settings.checking': 'Checking…',
  'settings.downloadVersion': 'Download v{version}',
  'settings.restartInstall': 'Restart and install now',
  'settings.releaseNotes': 'Changelog',

  // ------------------------------ Workshop delisting check ------------------------------
  'settings.delistedTitle': 'Workshop delisting check',
  'settings.delistedIntro':
    'Once an author delists a mod, nothing on disk looks different (the .acf entries Steam keeps are identical to those of a normal mod), so it can only be checked online. Current method:',
  'settings.delistedModeApi': 'Official API (reliable)',
  'settings.delistedModePage': 'Scrape the Workshop web page (best effort)',
  'settings.delistedStatDelisted': 'Delisted',
  'settings.delistedStatUnknown': 'Could not verify',
  'settings.delistedWarnPrefix':
    'Without an API key the app can only scrape the Workshop web page, and the page',
  'settings.delistedWarnBold': 'cannot tell "delisted" apart from "private"',
  'settings.delistedWarnSuffix':
    '— items that the author (or you) set to private return an error page for anonymous visitors too. So those results are only marked "hidden on Workshop" and the app will not claim they were delisted. Entering a key and using the official API tells them apart reliably, and is faster too.',
  'settings.apiKeyPlaceholder': 'Leave empty to scrape the web page',
  'settings.delistedApply': 'Get a key',
  'settings.apiKeyHintPrefix':
    'Free to request, and the domain can be anything (for example localhost). The key is stored only on this machine in',
  'settings.apiKeyHintSuffix': ', and it is never uploaded anywhere.',
  // 注意：末尾的空格是给后面接的日期用的
  'settings.delistedLastCheck': 'Last check: ',
  'settings.delistedNeverChecked': 'never',
  'settings.delistedUnknownNote':
    ' — items that could not be verified are not shown as delisted, nor treated as normal',
  'settings.recheck': 'Check again'
};
