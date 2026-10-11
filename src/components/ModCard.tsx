import { useState } from 'react';
import type { ModInfo } from '../types';
import { imgSrc, placeholderHue } from '../api';
import { categoryStyle } from '../categories';
import { compareBadge, initials, uniq } from '../ui';
import { features } from '../features';
import { t, getLang } from '../i18n';
import { categoryLabel } from '../i18n/categories';
import { IconAlert, IconCheck, IconDownload } from './Icons';

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
            {mod.source === 'local' ? t('card.source.local') : t('card.source.workshop')}
          </span>
          {/* 创意工坊版没有下架检查（它需要 Web API Key），不显示这个徽章 */}
          {features.delistedCheck && mod.delisted && (
            <span
              className={`badge ${mod.backedUpLocally ? 'st-backup-ok' : 'st-delisted'}`}
              title={
                mod.delistedHow === 'page-invisible'
                  ? t('card.delistedTipInvisible')
                  : mod.source === 'local'
                    ? t('card.delistedTipLocal')
                    : mod.backedUpLocally
                      ? t('card.delistedTipBackedUp')
                      : t('card.delistedTipNeedBackup')
              }
            >
              {mod.delistedHow === 'page-invisible'
                ? t('card.invisible')
                : mod.source === 'local'
                  ? t('card.delisted')
                  : mod.backedUpLocally
                    ? t('card.delistedBackedUp')
                    : t('card.delistedPendingBackup')}
            </span>
          )}
          {mod.installPending && (
            <span
              className="badge st-older"
              title={t('card.installPendingTip', {
                state: mod.installInstalledVersion
                  ? t('card.installStateOld', { version: mod.installInstalledVersion })
                  : t('card.installStateNone')
              })}
            >
              <IconDownload size={11} />
              {t('card.installPending')}
            </span>
          )}
          {mod.installedOnly && !mod.backedUpLocally && (
            <span className="badge st-different" title={t('card.onlyInstalledTip')}>
              {t('card.onlyInstalled')}
            </span>
          )}
          {badge && (
            <span className={`badge ${badge.cls}`}>
              {badge.cls === 'st-same' ? (
                <IconCheck size={11} />
              ) : badge.cls === 'st-none' ? null : (
                <IconAlert size={11} />
              )}
              {t(badge.key)}
            </span>
          )}
        </div>
      </div>

      <div className="card-body">
        <div className="card-name">{mod.name}</div>
        <div className="card-tags">
          {/* ⚠️ 循环变量不能叫 t —— 会遮蔽 i18n 的 t() */}
          {tags.map((tag) => (
            <span key={tag} className="tag" style={categoryStyle(tag)}>
              {/* 只翻显示名：tag 本身是数据主键，仍按原样匹配分类与配色 */}
              {categoryLabel(tag, getLang())}
            </span>
          ))}
          {tags.length === 0 && <span className="badge st-none">{t('common.uncategorized')}</span>}
        </div>
        <div className="card-meta">
          <span className="badge ver">v{mod.modVersion || '?'}</span>
          {mod.source === 'workshop' && (
            <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 'auto' }}>
              #{mod.id}
            </span>
          )}
          {mod.usedIn.length > 0 && (
            <span
              className="used-pill"
              title={t('card.usedInTip', { list: mod.usedIn.join(t('common.listSeparator')) })}
            >
              {t('card.usedInCount', { n: mod.usedIn.length })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
