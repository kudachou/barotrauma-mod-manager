import type { ModInfo } from './types';
import { localeTag } from './i18n';

export function modKey(m: ModInfo): string {
  return `${m.source}:${m.id}`;
}

export function fmtDate(ms: number | null | undefined): string {
  if (!ms) return '—';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '—';
  // 按当前界面语言格式化（别写死 'zh-CN'，否则英文界面会显示中文日期格式）
  return d.toLocaleDateString(localeTag(), { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function initials(name: string): string {
  const raw = name || '?';
  // 优先取中文，更像 mod 的简称
  const cjkRuns = raw.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g);
  if (cjkRuns && cjkRuns.length) {
    const run = cjkRuns[0].replace(/^[的之与和地得]+/, '');
    const chars = Array.from(run || cjkRuns[0]);
    if (chars.length) return chars.slice(0, 2).join('');
  }
  // 退化为英文/数字
  const alnum = raw.match(/[A-Za-z0-9]+/g);
  if (alnum && alnum.length) return alnum[0].slice(0, 2);
  return '?';
}

export interface BadgeInfo {
  /**
   * i18n key —— 由调用方 `t(badge.key)` 取文案。
   * （以前这里还有一个临时的中文 `text` 字段，等所有调用方都接上 i18n 后已删除：
   *   两处各存一份文案迟早会不一致。）
   */
  key: 'card.same' | 'card.workshopNewer' | 'card.localNewer' | 'card.different';
  cls: string;
}

/** 本地 mod 相对创意工坊的版本状态徽章（无对应版本时不显示） */
export function compareBadge(m: ModInfo): BadgeInfo | null {
  if (m.source !== 'local') return null;
  if (!m.counterpart) return null;
  switch (m.counterpart.status) {
    case 'same':
      return { key: 'card.same', cls: 'st-same' };
    case 'older':
      return { key: 'card.workshopNewer', cls: 'st-older' };
    case 'newer':
      return { key: 'card.localNewer', cls: 'st-newer' };
    default:
      return { key: 'card.different', cls: 'st-different' };
  }
}

export function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

/**
 * 合集名 → 合法文件名。
 *
 * ⚠️ `'未命名'` 这个兜底**故意是中文**：它不只是显示名，还会成为磁盘上的文件名
 *（`未命名.xml`）。翻成英文会让同一个"没取名"的合集在不同语言下落到不同文件名。
 * 属于数据而非界面文案，所以不接 i18n。
 */
export function safeFileName(name: string): string {
  const cleaned = (name || '').replace(/[\\/:*?"<>|]/g, '_').trim();
  return `${cleaned || '未命名'}.xml`;
}
