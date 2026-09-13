const fs = require('node:fs');
const path = require('node:path');
const { userDataDir } = require('./settings');

/**
 * 分类规则 —— 与 src/categories.ts 保持一致（改一处要同时改另一处）。
 */
const AUTO_RULES = [
  {
    category: '美化/外观',
    keywords: ['美化', '皮肤', '外观', '服装', '发型', '高跟', '动态', '萌化', '萌', 'waifu', 'anime', '样子', '机娘']
  },
  { category: '角色/职业', keywords: ['职业', '天赋', '角色', 'job', 'talent', 'class', '美少女', '猫娘'] },
  {
    category: '武器/装备',
    keywords: ['武器', '装备', '枪', '炮', 'armory', 'gunnery', 'sword', 'smg', 'toolbox', '多功能工具', '荧光棒']
  },
  { category: '潜艇/舰船', keywords: ['潜艇', '舰', '船', 'submarine', 'dockyard', 'engine', 'wreck', '沉船'] },
  { category: '任务/剧情', keywords: ['任务', '剧情', 'mission', 'quest', 'story'] },
  { category: '医疗', keywords: ['医疗', 'medical', 'hospital', '药剂', '抵抗劑', '床'] },
  { category: 'Lua/框架', keywords: ['lua', 'framework', '框架', 'api', 'item io'] },
  { category: '汉化/翻译', keywords: ['汉化', '中文', '翻译', 'chinese', 'translation'] },
  { category: '音效/音乐', keywords: ['音乐', '音效', 'music', 'sound', 'voice', '巡演'] },
  { category: 'UI/界面', keywords: ['ui', '界面', 'hud', '地图', 'map', 'locator', 'style'] },
  { category: '性能/优化', keywords: ['性能', '优化', 'performance', 'fps', 'ai', 'stack', '疊', '叠'] },
  { category: '生物/怪物', keywords: ['生物', '怪物', 'husk', 'creature', '异种', '魅魔', '山羊', '浩渺'] }
];

const EXTRA_CATEGORIES = ['前置', '后置', '自用整合'];

function allCategories() {
  return [...AUTO_RULES.map((r) => r.category), ...EXTRA_CATEGORIES];
}

function autoCategorize(name) {
  const n = String(name || '').toLowerCase();
  const out = [];
  for (const rule of AUTO_RULES) {
    if (rule.keywords.some((k) => n.includes(String(k).toLowerCase()))) out.push(rule.category);
  }
  return out;
}

function file() {
  return path.join(userDataDir(), 'categories.json');
}

let cache = null;

function load() {
  if (cache) return cache;
  try {
    const d = JSON.parse(fs.readFileSync(file(), 'utf8'));
    cache = {
      mods: d && typeof d.mods === 'object' && d.mods ? d.mods : {},
      custom: Array.isArray(d && d.custom) ? d.custom : [],
      removed: Array.isArray(d && d.removed) ? d.removed : []
    };
  } catch {
    cache = { mods: {}, custom: [], removed: [] };
  }
  return cache;
}

function persist() {
  const d = load();
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(d, null, 2), 'utf8');
  } catch {
    /* 忽略 */
  }
  return d;
}

function getCategories() {
  return load();
}

function setModCategories(key, tags) {
  const d = load();
  const list = Array.isArray(tags) ? tags.filter(Boolean) : [];
  if (list.length) d.mods[key] = list;
  else delete d.mods[key];
  return persist();
}

function saveCategories(data) {
  cache = {
    mods: data && typeof data.mods === 'object' && data.mods ? data.mods : {},
    custom: Array.isArray(data && data.custom) ? data.custom : [],
    removed: Array.isArray(data && data.removed) ? data.removed : []
  };
  return persist();
}

function addCustomCategory(name) {
  const d = load();
  const n = String(name || '').trim();
  if (n) {
    if (!d.custom.includes(n)) d.custom.push(n);
    // 重新创建同名标签时，把它从「已删除」里拿回来
    d.removed = d.removed.filter((x) => x !== n);
  }
  return persist();
}

/**
 * 删除标签：从自定义列表移除、从所有 mod 的手动标签上摘掉，
 * 并记入 removed，使内置标签（含关键词自动分类）也不再出现。
 * 返回被影响的 mod 数量。
 */
function deleteCategory(name) {
  const d = load();
  const n = String(name || '').trim();
  if (!n) return { categories: d, affected: 0 };

  d.custom = d.custom.filter((x) => x !== n);

  let affected = 0;
  for (const key of Object.keys(d.mods)) {
    if (!d.mods[key].includes(n)) continue;
    affected++;
    const next = d.mods[key].filter((x) => x !== n);
    if (next.length) d.mods[key] = next;
    else delete d.mods[key];
  }

  if (!d.removed.includes(n)) d.removed.push(n);
  return { categories: persist(), affected };
}

/** 当前生效的标签库 */
function effectiveCategories() {
  const d = load();
  const builtin = allCategories();
  return [
    ...builtin.filter((c) => !d.removed.includes(c)),
    ...d.custom.filter((c) => !d.removed.includes(c))
  ];
}

module.exports = {
  AUTO_RULES,
  EXTRA_CATEGORIES,
  allCategories,
  effectiveCategories,
  autoCategorize,
  getCategories,
  setModCategories,
  saveCategories,
  addCustomCategory,
  deleteCategory
};
