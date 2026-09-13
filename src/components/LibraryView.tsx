import { useMemo, useState } from 'react';
import type { CategoryData, ModInfo } from '../types';
import ModCard from './ModCard';
import { IconAlert, IconSearch } from './Icons';
import { categoryStyle } from '../categories';

type SortKey = 'name' | 'name-desc' | 'ver' | 'mtime';

export default function LibraryView({
  mods,
  categories,
  onOpenMod,
  loading
}: {
  mods: ModInfo[];
  categories: CategoryData;
  onOpenMod: (m: ModInfo) => void;
  loading: boolean;
}) {
  const [q, setQ] = useState('');
  const [source, setSource] = useState<'all' | 'local' | 'workshop'>('all');
  const [cat, setCat] = useState('全部');
  const [sort, setSort] = useState<SortKey>('name');
  const [onlyOutdated, setOnlyOutdated] = useState(false);

  const catList = useMemo(() => {
    const s = new Set<string>();
    for (const m of mods) {
      for (const c of m.categories) s.add(c);
      for (const c of m.autoCategories) s.add(c);
    }
    for (const c of categories.custom) s.add(c);
    return ['全部', ...Array.from(s).sort((a, b) => a.localeCompare(b, 'zh'))];
  }, [mods, categories]);

  const outdatedCount = useMemo(
    () => mods.filter((m) => m.counterpart?.status === 'older').length,
    [mods]
  );

  const filtered = useMemo(() => {
    let out = mods;
    if (source !== 'all') out = out.filter((m) => m.source === source);
    if (cat !== '全部')
      out = out.filter((m) => m.categories.includes(cat) || m.autoCategories.includes(cat));
    if (onlyOutdated) out = out.filter((m) => m.counterpart?.status === 'older');
    const ql = q.trim().toLowerCase();
    if (ql) {
      out = out.filter(
        (m) =>
          m.name.toLowerCase().includes(ql) ||
          m.id.toLowerCase().includes(ql) ||
          (m.steamworkshopid || '').includes(ql) ||
          m.categories.some((c) => c.toLowerCase().includes(ql))
      );
    }
    const sorted = [...out];
    switch (sort) {
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
        break;
      case 'name-desc':
        sorted.sort((a, b) => b.name.localeCompare(a.name, 'zh'));
        break;
      case 'ver':
        sorted.sort((a, b) =>
          (b.modVersion || '').localeCompare(a.modVersion || '', undefined, { numeric: true })
        );
        break;
      case 'mtime':
        sorted.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
        break;
    }
    return sorted;
  }, [mods, source, cat, onlyOutdated, q, sort]);

  const localCount = mods.filter((m) => m.source === 'local').length;
  const wsCount = mods.filter((m) => m.source === 'workshop').length;

  return (
    <>
      <div className="toolbar">
        <div className="search" style={{ width: 280 }}>
          <IconSearch size={16} />
          <input
            placeholder="搜索 mod 名称 / 工坊 ID…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="seg">
          <button className={source === 'all' ? 'active' : ''} onClick={() => setSource('all')}>
            全部 {mods.length}
          </button>
          <button className={source === 'local' ? 'active' : ''} onClick={() => setSource('local')}>
            本地 {localCount}
          </button>
          <button
            className={source === 'workshop' ? 'active' : ''}
            onClick={() => setSource('workshop')}
          >
            工坊 {wsCount}
          </button>
        </div>

        {outdatedCount > 0 && (
          <button
            className={`btn sm ${onlyOutdated ? 'primary' : ''}`}
            onClick={() => setOnlyOutdated((v) => !v)}
            title="只看创意工坊有更新的本地 mod"
          >
            <IconAlert size={13} />
            有更新 {outdatedCount}
          </button>
        )}

        <select
          className="input"
          style={{ width: 150, height: 36 }}
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
        >
          <option value="name">名称 A → Z</option>
          <option value="name-desc">名称 Z → A</option>
          <option value="ver">版本 高 → 低</option>
          <option value="mtime">最近修改</option>
        </select>

        <span className="result-count">
          {filtered.length} / {mods.length} 个 mod
        </span>
      </div>

      <div className="chips-row">
        {catList.map((c) => {
          const on = cat === c;
          return (
            <button
              key={c}
              className={`tag-toggle ${on ? 'on' : ''}`}
              onClick={() => setCat(c)}
              style={on && c !== '全部' ? categoryStyle(c) : undefined}
            >
              {c}
            </button>
          );
        })}
      </div>

      <div className="lib-scroll">
      {loading ? (
        <div className="grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card" style={{ cursor: 'default' }}>
              <div className="card-cover skeleton" />
              <div className="card-body">
                <div className="skeleton" style={{ height: 14, width: '80%' }} />
                <div className="skeleton" style={{ height: 11, width: '50%' }} />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <IconSearch size={34} />
          <div className="empty-title">没有匹配的 mod</div>
          <div>试试清空搜索或切换筛选条件</div>
        </div>
      ) : (
        <div className="grid">
          {filtered.map((m) => (
            <ModCard key={`${m.source}:${m.id}`} mod={m} onOpen={onOpenMod} />
          ))}
        </div>
      )}
      </div>
    </>
  );
}
