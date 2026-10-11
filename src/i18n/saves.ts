/**
 * 存档页的文案。
 * 约定见 `src/i18n/settings.ts` 的注释；这里用 `saves.` 前缀。
 *
 * 注意：有几条文案是**句子的碎片**（原文里被 <b> 断开，或与数字拼在一起），
 * 它们的首尾空格是刻意的 —— 组件里这些 key 是相邻的 JSX 表达式，换行处的空白
 * 会被 JSX 丢掉，只能由文案自己带上空格，拼起来才是原来那句话。
 */
export const savesZh = {
  // ------------------------------ 页面骨架 ------------------------------
  'saves.title': '存档',
  'saves.noneFound': '没找到存档',
  'saves.loadingSaves': '正在读存档…',
  'saves.selectSave': '选择左侧的一个存档',
  'saves.readFromPre': '存档从 ',
  'saves.readFromBold': 'config_player.xml 的 savepath',
  'saves.readFromPost': ' 指定的目录读取',
  'saves.dirInParens': '（{dir}）',
  'saves.sentenceEnd': '。',
  'saves.reading': '读取中…',
  'saves.timeUnknown': '时间未知',

  // ------------------------------ 存档列表 ------------------------------
  'saves.singleSaves': '单机存档',
  'saves.multiSaves': '多人存档',
  'saves.singleplayer': '单机',
  'saves.multiplayer': '多人',
  'saves.modCount': '{n} 个 mod',
  'saves.missingInGame': '{n} 个游戏里没有',
  'saves.exactMatch': '完全一致',
  'saves.coversBadge': '「{name}」覆盖',
  'saves.noCollection': '没有对应合集',
  'saves.dirUnavailable': '（读不到存档目录）',

  // ------------------------------ 存档详情 ------------------------------
  'saves.saveTimeLabel': '存档时间 ',
  'saves.submarineLabel': '潜艇',
  'saves.gameVersionLabel': '游戏版本',
  'saves.modListHint':
    '下面是存档记录的内容包（按加载顺序）。「按存档启用」只会写入这些 —— 存档不记录 LuaCs 这类客户端 mod，需要的话请对照上面的覆盖合集补上。',

  // ------------------------------ 对应合集 ------------------------------
  'saves.exactMatchPre': '✅ 这个存档和合集「',
  'saves.exactMatchMid': '」',
  'saves.exactMatchBold': '完全一致',
  'saves.exactMatchPost': ' —— 直接点右上角「应用」即可。',
  'saves.coversPre': '◐ 合集「',
  'saves.coversMid': '」',
  'saves.coversBold': '完全覆盖',
  'saves.coversAfterBold': '了这个存档的',
  'saves.coversModCount': '{n} 个 mod（它另有 {extra} 个）：',
  'saves.extraHintPre': '多出来的这些多半是 ',
  'saves.extraHintBold': 'LuaCs 这类框架 / UI / QoL mod',
  'saves.extraHintMid': ' ——',
  'saves.extraHintBold2': '存档从不记录纯客户端型内容包',
  'saves.extraHintPost':
    '，所以它们不会出现在存档名单里。 用这个合集实现存档是最稳的：只多不少。',
  'saves.otherCovers': '另外还有 {n} 个合集也能覆盖它：',
  'saves.listExtraCount': '{name}（另有 {n} 个）',
  'saves.noCoverPre': '✗ 没有任何合集能覆盖它的全部 mod ——',
  'saves.someModsMissing': '其中 {n} 个 mod 游戏里已经没有了。',
  'saves.saveAsCollectionHint': '用「存为新合集」把这套配置保存下来吧。',

  // ------------------------------ 内容包列表 ------------------------------
  'saves.modMissingInGame': '游戏里没有这个 mod',

  // ------------------------------ 操作 ------------------------------
  'saves.applyCollectionTip': '应用这个合集（它包含存档需要的全部 mod）',
  'saves.applyCollection': '应用「{name}」',
  'saves.enableFromSave': '按存档启用',
  'saves.saveAsCollection': '存为新合集',

  // ------------------------------ 提示（toast） ------------------------------
  'saves.loadFailed': '读存档失败',
  'saves.listNotFound': '找不到这个合集',
  'saves.applied': '已应用「{name}」',
  'saves.backupNote': '原配置已备份为 {file}（每次应用覆盖同一个）',
  'saves.effectiveNextLaunch': '下次启动游戏即生效',
  'saves.prunedBackups': '，并清理了 {n} 个旧备份',
  'saves.applyFailed': '应用失败',
  'saves.cannotCreateList': '没法建合集',
  'saves.noModsForList': '这个存档记录的 mod 现在一个都找不到',
  'saves.skipNote': '；{n} 个游戏里已经没有了，没法写入：{names}',
  'saves.skipNoteMore': ' 等',
  'saves.enabledFromSave': '已按存档启用（合集「{name}」）',
  'saves.writtenMods': '{n} 个 mod 已写入',
  'saves.backupNoteShort': '，原配置已备份为 {file}',
  'saves.savedAsList': '已存为新合集「{name}」',
  'saves.enableFailed': '启用失败',
  'saves.createListFailed': '新建合集失败',

  // ------------------------------ 新建合集的命名 ------------------------------
  'saves.defaultListName': '存档',
  'saves.listNameDup': '{root}（存档）',
  'saves.listNameDupN': '{root}（存档 {n}）'
} as const;

export const savesEn: Record<keyof typeof savesZh, string> = {
  // ------------------------------ 页面骨架 ------------------------------
  'saves.title': 'Saves',
  'saves.noneFound': 'No saves found',
  'saves.loadingSaves': 'Reading saves…',
  'saves.selectSave': 'Select a save on the left',
  'saves.readFromPre': 'Saves are read from the folder that ',
  'saves.readFromBold': 'savepath in config_player.xml',
  'saves.readFromPost': ' points to',
  'saves.dirInParens': ' ({dir})',
  'saves.sentenceEnd': '.',
  'saves.reading': 'Reading…',
  'saves.timeUnknown': 'Time unknown',

  // ------------------------------ 存档列表 ------------------------------
  'saves.singleSaves': 'Single-player saves',
  'saves.multiSaves': 'Multiplayer saves',
  'saves.singleplayer': 'Single-player',
  'saves.multiplayer': 'Multiplayer',
  'saves.modCount': '{n} mod(s)',
  'saves.missingInGame': '{n} missing from the game',
  'saves.exactMatch': 'Exact match',
  'saves.coversBadge': 'Covered by "{name}"',
  'saves.noCollection': 'No collection matches',
  'saves.dirUnavailable': '(save folder unavailable)',

  // ------------------------------ 存档详情 ------------------------------
  'saves.saveTimeLabel': 'Save time ',
  'saves.submarineLabel': 'Submarine',
  'saves.gameVersionLabel': 'Game version',
  'saves.modListHint':
    'Below are the content packages recorded in the save, in load order. "Enable per save" writes only these — the save does not record client-side mods such as LuaCs, so add those by comparing with the covering collection above.',

  // ------------------------------ 对应合集 ------------------------------
  'saves.exactMatchPre': '✅ This save and the collection "',
  'saves.exactMatchMid': '"',
  'saves.exactMatchBold': 'are an exact match',
  'saves.exactMatchPost': ' — just click "Apply" at the top right.',
  'saves.coversPre': '◐ The collection "',
  'saves.coversMid': '"',
  'saves.coversBold': 'covers',
  'saves.coversAfterBold': ' all',
  'saves.coversModCount': '{n} mod(s) this save needs (it has {extra} more):',
  'saves.extraHintPre': 'These extra mods are mostly ',
  'saves.extraHintBold': 'frameworks, UI and QoL mods such as LuaCs',
  'saves.extraHintMid': ' — ',
  'saves.extraHintBold2': 'saves never record pure client-side content packages',
  'saves.extraHintPost':
    ", so they never appear in the save's mod list. Rebuilding this save from this collection is always safe: the collection can only have too many mods, never too few.",
  'saves.otherCovers': '{n} other collection(s) also cover it:',
  'saves.listExtraCount': '{name} ({n} more)',
  'saves.noCoverPre': '✗ No collection covers all of its mods — ',
  'saves.someModsMissing': '{n} of those mods are no longer in the game.',
  'saves.saveAsCollectionHint': 'Use "Save as collection" to keep this setup.',

  // ------------------------------ 内容包列表 ------------------------------
  'saves.modMissingInGame': 'This mod is not in the game',

  // ------------------------------ 操作 ------------------------------
  'saves.applyCollectionTip': 'Apply this collection (it contains every mod the save needs)',
  'saves.applyCollection': 'Apply "{name}"',
  'saves.enableFromSave': 'Enable per save',
  'saves.saveAsCollection': 'Save as collection',

  // ------------------------------ 提示（toast） ------------------------------
  'saves.loadFailed': 'Could not read saves',
  'saves.listNotFound': 'Collection not found',
  'saves.applied': 'Applied "{name}"',
  'saves.backupNote': 'The current config was backed up as {file} (each apply overwrites the same one)',
  'saves.effectiveNextLaunch': 'It takes effect the next time you launch the game',
  'saves.prunedBackups': ', and cleaned up {n} old backup(s)',
  'saves.applyFailed': 'Could not apply',
  'saves.cannotCreateList': 'Cannot create a collection',
  'saves.noModsForList': 'None of the mods this save recorded can be found now',
  'saves.skipNote': '; {n} of them are no longer in the game and cannot be written: {names}',
  'saves.skipNoteMore': ', etc.',
  'saves.enabledFromSave': 'Enabled per save (collection "{name}")',
  'saves.writtenMods': '{n} mod(s) written',
  'saves.backupNoteShort': ', the current config was backed up as {file}',
  'saves.savedAsList': 'Saved as new collection "{name}"',
  'saves.enableFailed': 'Could not enable',
  'saves.createListFailed': 'Could not create the collection',

  // ------------------------------ 新建合集的命名 ------------------------------
  'saves.defaultListName': 'Save',
  'saves.listNameDup': '{root} (Save)',
  'saves.listNameDupN': '{root} (Save {n})'
};
