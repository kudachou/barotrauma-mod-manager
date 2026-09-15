import type { ViewKey } from '../types';
import { IconAnchor, IconLayers, IconLibrary, IconSave, IconSearch, IconSettings } from './Icons';

const ITEMS: { key: ViewKey; label: string; icon: (p: { size?: number }) => JSX.Element }[] = [
  { key: 'library', label: 'Mod 库', icon: IconLibrary },
  { key: 'browse', label: '浏览工坊', icon: IconSearch },
  { key: 'collections', label: '合集', icon: IconLayers },
  { key: 'saves', label: '存档', icon: IconSave },
  { key: 'settings', label: '设置', icon: IconSettings }
];

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
          <div className="brand-title">潜渊症 Mod</div>
          <div className="brand-sub">BAROTRAUMA MANAGER</div>
        </div>
      </div>

      <nav className="nav">
        {ITEMS.map((it) => {
          const Icon = it.icon;
          return (
            <div
              key={it.key}
              className={`nav-item ${view === it.key ? 'active' : ''}`}
              onClick={() => onChange(it.key)}
            >
              <Icon size={18} />
              <span>{it.label}</span>
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
          {isMock ? '外观预览模式' : '已连接游戏目录'}
        </div>
        <div>{isMock ? '当前显示示例数据，未读写你的磁盘' : '数据来自你的本地 mod 目录'}</div>
      </div>
    </aside>
  );
}
