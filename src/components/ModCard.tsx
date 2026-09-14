import { useState } from 'react';
import type { ModInfo } from '../types';
import { imgSrc, placeholderHue } from '../api';
import { categoryStyle } from '../categories';
import { compareBadge, initials, uniq } from '../ui';
import { IconAlert, IconCheck } from './Icons';

export default function ModCard({ mod, onOpen }: { mod: ModInfo; onOpen: (m: ModInfo) => void }) {
  // 封面加载失败（缓存被清掉、cdn 链接失效等）时回落到占位图，而不是留个破图
  const [broken, setBroken] = useState(false);
  const src = broken ? null : imgSrc(mod.preview);
  const badge = compareBadge(mod);
  const hue = placeholderHue(mod.name);
  const tags = uniq([...mod.categories, ...mod.autoCategories]).slice(0, 3);

  return (
    <div className="card" onClick={() => onOpen(mod)} title={mod.name}>
      <div className="card-cover">
        {src ? (
          <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} />
        ) : (
          <div
            className="cover-ph"
            style={{
              background: `linear-gradient(140deg, hsl(${hue} 52% 34%), hsl(${(hue + 46) % 360} 58% 16%))`
            }}
          >
            {initials(mod.name)}
          </div>
        )}
        <div className="cover-badges">
          <span className={`badge ${mod.source === 'local' ? 'src-local' : 'src-workshop'}`}>
            {mod.source === 'local' ? '本地' : '工坊'}
          </span>
          {mod.delisted && (
            <span
              className={`badge ${mod.backedUpLocally ? 'st-backup-ok' : 'st-delisted'}`}
              title={
                mod.delistedHow === 'page-invisible'
                  ? '工坊上匿名看不到这个条目 —— 可能是已下架，也可能是作者（或你自己）把它设成了私有。填一个 Steam API Key 就能准确区分'
                  : mod.source === 'local'
                    ? '这个本地 mod 对应的工坊原版已被作者下架（本地副本本来就是安全的）'
                    : mod.backedUpLocally
                      ? '已确认从工坊下架，但 LocalMods 里已经有一份备份了 —— 已经安全'
                      : '已确认从工坊下架，而 LocalMods 里还没有备份 —— 建议马上备份'
              }
            >
              {mod.delistedHow === 'page-invisible'
                ? '工坊不可见'
                : mod.source === 'local'
                  ? '工坊已下架'
                  : mod.backedUpLocally
                    ? '已下架 · 已备份'
                    : '已下架 · 待备份'}
            </span>
          )}
          {mod.installedOnly && !mod.backedUpLocally && (
            <span className="badge st-different" title="Steam 订阅目录里已经没有它，只剩游戏里这份副本">
              仅剩游戏副本
            </span>
          )}
          {badge && (
            <span className={`badge ${badge.cls}`}>
              {badge.cls === 'st-same' ? (
                <IconCheck size={11} />
              ) : badge.cls === 'st-none' ? null : (
                <IconAlert size={11} />
              )}
              {badge.text}
            </span>
          )}
        </div>
      </div>

      <div className="card-body">
        <div className="card-name">{mod.name}</div>
        <div className="card-tags">
          {tags.map((t) => (
            <span key={t} className="tag" style={categoryStyle(t)}>
              {t}
            </span>
          ))}
          {tags.length === 0 && <span className="badge st-none">未分类</span>}
        </div>
        <div className="card-meta">
          <span className="badge ver">v{mod.modVersion || '?'}</span>
          {mod.source === 'workshop' && (
            <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 'auto' }}>
              #{mod.id}
            </span>
          )}
          {mod.usedIn.length > 0 && (
            <span className="used-pill" title={`已用于：${mod.usedIn.join('、')}`}>
              {mod.usedIn.length} 个合集
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
