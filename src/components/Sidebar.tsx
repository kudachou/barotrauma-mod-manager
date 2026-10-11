import type { ViewKey } from '../types';
import { IconAnchor, IconLayers, IconLibrary, IconSave, IconSearch, IconSettings } from './Icons';
import { features } from '../features';
import { t, type TKey } from '../i18n';
/** labelKey 而不是写死文案：语言一变（App 用 key={lang} 重挂子树）就会重新求值 */
const ITEMS: { key: ViewKey; labelKey: TKey; icon: (p: { size?: number }) => JSX.Element }[] = [
  { key: 'library', labelKey: 'nav.library', icon: IconLibrary },
  { key: 'browse', labelKey: 'nav.browse', icon: IconSearch },
  { key: 'collections', labelKey: 'nav.collections', icon: IconLayers },
  { key: 'saves', labelKey: 'nav.saves', icon: IconSave },
  { key: 'settings', labelKey: 'nav.settings', icon: IconSettings }
];

/** 创意工坊版没有「浏览工坊」（它需要 Web API Key），导航里整项去掉 */
const VISIBLE_ITEMS = ITEMS.filter((it) => it.key !== 'browse' || features.browseWorkshop);

export default function Sidebar({
  view,
  onChange,
  modCount,
  listCount,
  isMock
}: {
  view: ViewKey;
  onChange: (v: ViewKey) => void;
  modCount: number;
  listCount: number;
  isMock: boolean;
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-logo">
          <IconAnchor size={21} />
        </div>
        <div>
          <div className="brand-title">{t('sidebar.brandTitle')}</div>
          <div className="brand-sub">{t('sidebar.brandSub')}</div>
        </div>
      </div>

      <nav className="nav">
        {VISIBLE_ITEMS.map((it) => {
          const Icon = it.icon;
          return (
            <div
              key={it.key}
              className={`nav-item ${view === it.key ? 'active' : ''}`}
              onClick={() => onChange(it.key)}
            >
              <Icon size={18} />
              <span>{t(it.labelKey)}</span>
              {it.key === 'library' && modCount > 0 && <span className="nav-badge">{modCount}</span>}
              {it.key === 'collections' && listCount > 0 && (
                <span className="nav-badge">{listCount}</span>
              )}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-foot">
        <div className={`mode-pill ${isMock ? '' : 'live'}`}>
          <span className="dot" />
          {isMock ? t('sidebar.mockMode') : t('sidebar.liveMode')}
        </div>
        <div>{isMock ? t('sidebar.mockHint') : t('sidebar.liveHint')}</div>
      </div>
    </aside>
  );
}
