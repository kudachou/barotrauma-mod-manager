/**
 * 「工坊条目详情」弹窗的文案片段（BrowseDetailModal）。
 *
 * 只有**完整版**会渲染它（工坊版没有浏览工坊功能）。
 * 与 browse.ts 分开，是为了让两个界面的翻译能并行进行、各写各的文件。
 *
 * 约定见 docs/HANDOVER.md §1.6。
 *
 * 刻意**没有**抽走的几处中文：
 *   - 条目标题 / 作者名 / 描述正文 / 标签（工坊条目的用户数据，永远不翻）；
 *   - `humanSize()` 里的 KB / MB / GB（单位符号，中英一致）。
 * 另有两条文案复用已有 key，不在这里重复定义：
 *   - 关闭按钮 → `common.close`（所有弹窗共用同一个 key）；
 *   - 订阅数等大数字 → `common.countWan`（中文「万」/ 英文 k，调用处同时传 n 与 k）。
 */
export const browseDetailZh = {
  // ------------------------------ 头部 / 加载 ------------------------------
  'browseDetail.updated': '更新 {date}',
  'browseDetail.size': '体积 {size}',
  'browseDetail.loading': '正在读取工坊数据…',
  'browseDetail.missing': '工坊页面上看不到这个条目了（可能已下架或被作者设为私有）。',

  // ------------------------------ 封面 / 截图 ------------------------------
  'browseDetail.noPreview': '没有预览图',
  'browseDetail.shotIndex': '第 {n} 张',

  // ------------------------------ 热度 / 封禁 ------------------------------
  /** 数字先过 `fmtCount()`，再填进来 */
  'browseDetail.subscriptions': '👍 订阅 {n}',
  'browseDetail.favorited': '★ 收藏 {n}',
  'browseDetail.views': '👁 浏览 {n}',
  'browseDetail.created': '创建 {date}',
  'browseDetail.banned': '这个条目在工坊上被标记为封禁：{reason}',
  'browseDetail.bannedNoReason': '（无原因）',

  // ------------------------------ 描述区 ------------------------------
  /*
   * 这几个 key 的语义是「描述已经是**当前界面语言**」——`t()` 只会取当前语言那一份，
   * 所以中文界面下它们说的就是中文（值不用改）；英文界的值见下方 en 片段。
   */
  'browseDetail.wsDescription': '创意工坊描述',
  'browseDetail.authorZhTip': '作者提供了中文描述，直接用他的（不是机翻）',
  'browseDetail.authorZh': '中文（作者提供）',
  'browseDetail.descIsZh': '描述本身是中文',
  'browseDetail.onlyOriginalTip': '作者没提供中文描述 —— 可以用机器翻译先看个大概',
  'browseDetail.onlyOriginal': '只有原文',
  'browseDetail.reading': '读取中…',
  'browseDetail.noDescription': '这个条目没有描述，或者没能读到。',
  'browseDetail.reload': '重新读取',

  // ------------------------------ 机器翻译 ------------------------------
  'browseDetail.translate': '翻译成中文',
  'browseDetail.translateTip':
    '用免费翻译接口（MyMemory）把整段描述翻成中文；结果会缓存，同一个 mod 只翻一次',
  'browseDetail.translating': '正在翻译…',
  'browseDetail.translatingLong': '正在分块翻译，长描述要十几秒…',
  'browseDetail.showOriginal': '看原文',
  'browseDetail.showTranslation': '看译文',
  'browseDetail.mtNote': '机器翻译（MyMemory），专有名词可能不准',
  /** toast 版：中间可以插「，{n} 段」（`browseDetail.mtChunks`），没分段时传空串 */
  'browseDetail.mtToast': '机器翻译（MyMemory）{chunks} —— 专有名词可能不准',
  'browseDetail.mtChunks': '，{n} 段',

  // ------------------------------ 底部按钮 ------------------------------
  'browseDetail.openInSteam': '在 Steam 里打开',
  'browseDetail.openInBrowser': '网页版',

  // ------------------------------ 提示条（toast） ------------------------------
  'browseDetail.translated': '已翻译成中文',
  'browseDetail.translatedCached': '用的是上次的翻译结果',
  'browseDetail.translateFailed': '翻译没成功',
  'browseDetail.translateNoContent': '翻译服务没有返回内容',
  'browseDetail.translateError': '翻译失败',
  'browseDetail.linkOpenFailed': '打不开链接',
  'browseDetail.reloadFailed': '重新读取失败'
} as const;

export const browseDetailEn: Record<keyof typeof browseDetailZh, string> = {
  // ------------------------------ Header / loading ------------------------------
  'browseDetail.updated': 'Updated {date}',
  'browseDetail.size': 'Size {size}',
  'browseDetail.loading': 'Reading Workshop data…',
  'browseDetail.missing':
    'This item is no longer visible on the Workshop page (it may be delisted, or set to private by its author).',

  // ------------------------------ Cover / screenshots ------------------------------
  'browseDetail.noPreview': 'No preview image',
  'browseDetail.shotIndex': 'Screenshot {n}',

  // ------------------------------ Stats / ban ------------------------------
  'browseDetail.subscriptions': '👍 {n} subscriptions',
  'browseDetail.favorited': '★ {n} favorites',
  'browseDetail.views': '👁 {n} views',
  'browseDetail.created': 'Created {date}',
  'browseDetail.banned': 'This item is marked as banned on the Workshop: {reason}',
  'browseDetail.bannedNoReason': '(no reason given)',

  // ------------------------------ Description ------------------------------
  /*
   * 注意这几个 key 的语义是「描述已经是**当前界面语言**」，不是"中文"——
   * key 名（authorZh / descIsZh）是当初只有中文界面时留下的，值才是真语义。
   * 所以英文界面的值说的是 "your language / English"。
   */
  'browseDetail.wsDescription': 'Workshop description',
  'browseDetail.authorZhTip':
    'The author provided a description in your language — this is theirs, not machine translated',
  'browseDetail.authorZh': 'From the author',
  'browseDetail.descIsZh': 'Already in your language',
  'browseDetail.onlyOriginalTip':
    'The author left no description in your language — machine translation gives you the gist',
  'browseDetail.onlyOriginal': 'Original only',
  'browseDetail.reading': 'Reading…',
  'browseDetail.noDescription': 'This item has no description, or it could not be read.',
  'browseDetail.reload': 'Read again',

  // ------------------------------ Machine translation ------------------------------
  'browseDetail.translate': 'Translate to English',
  'browseDetail.translateTip':
    'Translate the whole description into English with the free MyMemory service; the result is cached, so each mod is translated only once',
  'browseDetail.translating': 'Translating…',
  'browseDetail.translatingLong':
    'Translating in chunks — a long description takes about ten seconds…',
  'browseDetail.showOriginal': 'Show original',
  'browseDetail.showTranslation': 'Show translation',
  'browseDetail.mtNote': 'Machine translated (MyMemory) — proper nouns may be inaccurate',
  'browseDetail.mtToast': 'Machine translated (MyMemory){chunks} — proper nouns may be inaccurate',
  'browseDetail.mtChunks': ', {n} chunks',

  // ------------------------------ Footer buttons ------------------------------
  'browseDetail.openInSteam': 'Open in Steam',
  'browseDetail.openInBrowser': 'Web page',

  // ------------------------------ Toasts ------------------------------
  'browseDetail.translated': 'Translated to English',
  'browseDetail.translatedCached': 'Reusing the previous translation',
  'browseDetail.translateFailed': 'Translation failed',
  'browseDetail.translateNoContent': 'The translation service returned nothing',
  'browseDetail.translateError': 'Translation error',
  'browseDetail.linkOpenFailed': 'Could not open the link',
  'browseDetail.reloadFailed': 'Could not read the item again'
};
