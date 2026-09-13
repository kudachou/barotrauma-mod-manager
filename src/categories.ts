/** 分类规则（关键词自动预分类）与分类配色 —— 前后端共用同一份定义 */

import type { CSSProperties } from 'react';

export interface CategoryRule {
  category: string;
  keywords: string[];
}

export const AUTO_RULES: CategoryRule[] = [
  {
    category: '美化/外观',
    keywords: ['美化', '皮肤', '外观', '服装', '发型', '高跟', '动态', '萌化', '萌', 'waifu', 'anime', '样子', '机娘']
  },
  {
    category: '角色/职业',
    keywords: ['职业', '天赋', '角色', 'job', 'talent', 'class', '美少女', '猫娘']
  },
  {
    category: '武器/装备',
    keywords: ['武器', '装备', '枪', '炮', 'armory', 'gunnery', 'sword', 'smg', 'toolbox', '多功能工具', '荧光棒']
  },
  {
    category: '潜艇/舰船',
    keywords: ['潜艇', '舰', '船', 'submarine', 'dockyard', 'engine', 'wreck', '沉船']
  },
  { category: '任务/剧情', keywords: ['任务', '剧情', 'mission', 'quest', 'story'] },
  { category: '医疗', keywords: ['医疗', 'medical', 'hospital', '药剂', '抵抗劑', '床'] },
  { category: 'Lua/框架', keywords: ['lua', 'framework', '框架', 'api', 'item io'] },
  {
    category: '汉化/翻译',
    keywords: ['汉化', '中文', '翻译', 'chinese', 'translation']
  },
  { category: '音效/音乐', keywords: ['音乐', '音效', 'music', 'sound', 'voice', '巡演'] },
  { category: 'UI/界面', keywords: ['ui', '界面', 'hud', '地图', 'map', 'locator', 'style'] },
  {
    category: '性能/优化',
    keywords: ['性能', '优化', 'performance', 'fps', 'ai', 'stack', '疊', '叠']
  },
  {
    category: '生物/怪物',
    keywords: ['生物', '怪物', 'creature', 'husk', 'monster']
  }
];

/** 非自动规则、供手动使用的常用分类 */
export const EXTRA_CATEGORIES = ['前置', '后置', '自用整合'];

export const ALL_CATEGORIES: string[] = [
  ...AUTO_RULES.map((r) => r.category),
  ...EXTRA_CATEGORIES
];

export function autoCategorize(name: string): string[] {
  const n = (name || '').toLowerCase();
  const out: string[] = [];
  for (const rule of AUTO_RULES) {
    if (rule.keywords.some((k) => n.includes(k.toLowerCase()))) out.push(rule.category);
  }
  return out;
}

/** 分类名 → 稳定的色相（用于标签配色） */
export function categoryHue(cat: string): number {
  let h = 0;
  for (let i = 0; i < cat.length; i++) h = (h * 33 + cat.charCodeAt(i)) % 360;
  return h;
}

export function categoryStyle(cat: string): CSSProperties {
  const hue = categoryHue(cat);
  return {
    background: `hsla(${hue}, 62%, 46%, 0.18)`,
    borderColor: `hsla(${hue}, 62%, 60%, 0.32)`,
    color: `hsl(${hue}, 74%, 78%)`
  };
}
