import type { ModInfo } from './types';

export function modKey(m: ModInfo): string {
  return `${m.source}:${m.id}`;
}

export function fmtDate(ms: number | null | undefined): string {
  if (!ms) return '—';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
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
  text: string;
  cls: string;
}

/** 本地 mod 相对创意工坊的版本状态徽章（无对应版本时不显示） */
export function compareBadge(m: ModInfo): BadgeInfo | null {
  if (m.source !== 'local') return null;
  if (!m.counterpart) return null;
  switch (m.counterpart.status) {
    case 'same':
      return { text: '本地=工坊', cls: 'st-same' };
    case 'older':
      return { text: '工坊有更新', cls: 'st-older' };
    case 'newer':
      return { text: '本地已改版', cls: 'st-newer' };
    default:
      return { text: '版本不同', cls: 'st-different' };
  }
}

export function sourceLabel(m: ModInfo): string {
  return m.source === 'local' ? '本地' : '创意工坊';
}

export function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

/** 合集名 → 合法文件名 */
export function safeFileName(name: string): string {
  const cleaned = (name || '').replace(/[\\/:*?"<>|]/g, '_').trim();
  return `${cleaned || '未命名'}.xml`;
}
