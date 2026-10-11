/**
 * 内置分类标签的**显示名**。
 *
 * ## 为什么不能直接翻译 `categories.ts` 里的名字
 *
 * 那些名字（"宠物/怪物"、"潜艇/舰船"…）不是单纯的文案，而是**数据主键**：
 *   - 存在用户的 `categories.json` 里；
 *   - 出现在 mod 的 `autoCategories`（关键词自动分类算出）里；
 *   - `categoryStyle(name)`、筛选、拖拽都按它匹配。
 *
 * 一旦把它们翻成英文，老用户的 `categories.json` 立刻对不上号 —— 标签全丢。
 *
 * 所以做法是：**中文名继续当主键，只在显示时查这张表**。
 *
 * ## 只翻"内置"的，不翻用户自建标签
 *
 * 表里只列 `src/categories.ts` 里内置的那些（`AUTO_RULES` + `EXTRA_CATEGORIES`）。
 * 用户自己建的标签是**用户数据**，原样显示 —— 把"我的整合包"翻成英文是错的。
 */
export const categoryLabelsEn: Record<string, string> = {
  '美化/外观': 'Cosmetics & looks',
  '角色/职业': 'Characters & jobs',
  '武器/装备': 'Weapons & gear',
  '潜艇/舰船': 'Submarines & ships',
  '任务/剧情': 'Missions & story',
  医疗: 'Medical',
  'Lua/框架': 'Lua & frameworks',
  '汉化/翻译': 'Translations',
  '音效/音乐': 'Audio & music',
  'UI/界面': 'UI',
  '性能/优化': 'Performance',
  '生物/怪物': 'Creatures & monsters',
  前置: 'Dependencies',
  后置: 'Dependents',
  自用整合: 'Personal bundle'
};

/**
 * 取分类的显示名。
 * 英文界面下先查表；查不到（用户自建标签）原样返回。
 */
export function categoryLabel(name: string, lang: 'zh' | 'en'): string {
  if (lang !== 'en') return name;
  return categoryLabelsEn[name] || name;
}
