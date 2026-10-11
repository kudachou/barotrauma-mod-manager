import { Fragment, useEffect, useMemo, useState } from 'react';
import type { CategoryData, ModInfo } from '../types';
import ModCard from './ModCard';
import { IconAlert, IconDownload, IconSearch } from './Icons';
import { categoryStyle } from '../categories';
import { features } from '../features';
import { getLang, t } from '../i18n';
import { categoryLabel } from '../i18n/categories';

type SortKey = 'name' | 'name-desc' | 'ver' | 'mtime';

/** 分类筛选里的特殊项：没有任何标签的 mod */
const UNCATEGORIZED = '__uncategorized__';
/**
 * 分类筛选里的"全部"。
 *
 * ⚠️ 必须和显示文案分开：以前这里直接拿 '全部' 当状态值，一做多语言就会散架
 * —— 翻译后 `cat === '全部'` 永远不成立，筛选直接失效。凡是当**键**用的字符串都不能翻译。
 */
const ALL_CATS = '__all__';

/** 「未分类」= 手动标签和关键词自动分类都为空（与卡片上的「未分类」徽章一致） */
function isUncategorized(m: ModInfo): boolean {
  return m.categories.length === 0 && m.autoCategories.length === 0;
}

export default function LibraryView({
  mods,
  categories,
  onOpenMod,
  onBackupDelisted,
  loading
}: {
  mods: ModInfo[];
  categories: CategoryData;
  onOpenMod: (m: ModInfo) => void;
  /** 一键备份已下架的 mod */
  onBackupDelisted: () => void;
  loading: boolean;
}) {
  const [q, setQ] = useState('');
  const [source, setSource] = useState<'all' | 'local' | 'workshop'>('all');
  const [cat, setCat] = useState(ALL_CATS);
  const [sort, setSort] = useState<SortKey>('name');
  const [onlyOutdated, setOnlyOutdated] = useState(false);
  const [onlyDelisted, setOnlyDelisted] = useState(false);

  /*
   * 分类芯片和计数都只针对「当前来源」下的 mod。
   * 否则切到「工坊」时还会看到只有本地 mod 才有的分类，点进去却是空的。
   */
  const sourceMods = useMemo(
    () => (source === 'all' ? mods : mods.filter((m) => m.source === source)),
    [mods, source]
  );

  const catList = useMemo(() => {
    const s = new Set<string>();
    for (const m of sourceMods) {
      for (const c of m.categories) s.add(c);
      for (const c of m.autoCategories) s.add(c);
    }
    // 自定义分类是用户自己建的标签库，与来源无关，始终列出
    for (const c of categories.custom) s.add(c);
    return [ALL_CATS, ...Array.from(s).sort((a, b) => a.localeCompare(b, 'zh'))];
  }, [sourceMods, categories]);

  const outdatedCount = useMemo(
    () => mods.filter((m) => m.counterpart?.status === 'older').length,
    [mods]
  );

  const uncategorizedCount = useMemo(
    () => sourceMods.filter(isUncategorized).length,
    [sourceMods]
  );

  const delistedCount = useMemo(() => sourceMods.filter((m) => m.delisted).length, [sourceMods]);
  /**
   * 措辞要跟卡片徽章一致：官方接口确认的才叫「已下架」；
   * 只靠抓网页得出「看不到」的，可能是下架、也可能是作者（或用户自己）设成了私有，
   * 所以只能说「工坊不可见」。
   */
  const delistedAreInvisibleOnly =
    delistedCount > 0 &&
    sourceMods.filter((m) => m.delisted).every((m) => m.delistedHow === 'page-invisible');
  const delistedLabel = delistedAreInvisibleOnly ? t('library.invisible') : t('library.delisted');

  /*
   * 筛选条件可能因为数据变化而「失效」：更新完就没有「有更新」的 mod 了，
   * 或者某个分类下的 mod 全被删了。这时对应的按钮会消失 —— 如果还继续套用这个条件，
   * 用户就会被卡在一个空列表里，而且界面上找不到地方取消它。
   * 所以这里统一做一次有效性校正，并且把失效的原始状态也清掉
   * （否则数据恢复后筛选会「自己」又生效）。
   */
  const effectiveCat =
    cat === ALL_CATS || cat === UNCATEGORIZED || catList.includes(cat) ? cat : ALL_CATS;
  const effectiveOnlyOutdated = onlyOutdated && outdatedCount > 0;
  const effectiveOnlyDelisted = onlyDelisted && delistedCount > 0;

  useEffect(() => {
    // UNCATEGORIZED 是个虚拟分类，不在 catList 里，别把它当成失效条件重置掉
    if (cat !== ALL_CATS && cat !== UNCATEGORIZED && !catList.includes(cat)) setCat(ALL_CATS);
  }, [cat, catList]);

  useEffect(() => {
    if (onlyOutdated && outdatedCount === 0) setOnlyOutdated(false);
  }, [onlyOutdated, outdatedCount]);

  useEffect(() => {
    if (onlyDelisted && delistedCount === 0) setOnlyDelisted(false);
  }, [onlyDelisted, delistedCount]);

  const filtered = useMemo(() => {
    let out = mods;
    if (source !== 'all') out = out.filter((m) => m.source === source);
    if (effectiveCat === UNCATEGORIZED) out = out.filter(isUncategorized);
    else if (effectiveCat !== ALL_CATS)
      out = out.filter(
        (m) => m.categories.includes(effectiveCat) || m.autoCategories.includes(effectiveCat)
      );
    if (effectiveOnlyOutdated) out = out.filter((m) => m.counterpart?.status === 'older');
    if (effectiveOnlyDelisted) out = out.filter((m) => m.delisted);
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
  }, [mods, source, effectiveCat, effectiveOnlyOutdated, effectiveOnlyDelisted, q, sort]);

  const localCount = mods.filter((m) => m.source === 'local').length;
  const wsCount = mods.filter((m) => m.source === 'workshop').length;

  return (
    <>
      <div className="toolbar">
        <div className="search" style={{ width: 280 }}>
          <IconSearch size={16} />
          <input
            placeholder={t('library.searchPlaceholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="seg">
          <button className={source === 'all' ? 'active' : ''} onClick={() => setSource('all')}>
            {t('library.source.all')} {mods.length}
          </button>
          <button className={source === 'local' ? 'active' : ''} onClick={() => setSource('local')}>
            {t('library.source.local')} {localCount}
          </button>
          <button
            className={source === 'workshop' ? 'active' : ''}
            onClick={() => setSource('workshop')}
          >
            {t('library.source.workshop')} {wsCount}
          </button>
        </div>

        {outdatedCount > 0 && (
          <button
            className={`btn sm ${effectiveOnlyOutdated ? 'primary' : ''}`}
            onClick={() => setOnlyOutdated((v) => !v)}
            title={t('library.hasUpdateTip')}
          >
            <IconAlert size={13} />
            {t('library.hasUpdate')} {outdatedCount}
          </button>
        )}

        {/* 创意工坊版没有下架检查 ⇒ 「已下架」筛选与「只备份已下架的」入口一并去掉 */}
        {features.delistedCheck && delistedCount > 0 && (
          <button
            className={`btn sm delisted-chip ${effectiveOnlyDelisted ? 'primary' : ''}`}
            onClick={() => setOnlyDelisted((v) => !v)}
            title={
              delistedAreInvisibleOnly ? t('library.invisibleTip') : t('library.delistedTip')
            }
          >
            <IconAlert size={13} />
            {delistedLabel} {delistedCount}
          </button>
        )}

        {features.delistedCheck && effectiveOnlyDelisted && (
          <button
            className="btn sm primary"
            onClick={() => onBackupDelisted()}
            title={t('library.backupTheseTip')}
          >
            <IconDownload size={13} />
            {t('library.backupThese')}
          </button>
        )}

        <select
          className="input"
          style={{ width: 150, height: 36 }}
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
        >
          <option value="name">{t('library.sort.nameAsc')}</option>
          <option value="name-desc">{t('library.sort.nameDesc')}</option>
          <option value="ver">{t('library.sort.versionDesc')}</option>
          <option value="mtime">{t('library.sort.mtime')}</option>
        </select>

        <span className="result-count">
          {t('library.resultCount', { shown: filtered.length, total: mods.length })}
        </span>
      </div>

      <div className="chips-row">
        {catList.map((c, i) => {
          const on = effectiveCat === c;
          return (
            <Fragment key={c}>
              <button
                className={`tag-toggle ${on ? 'on' : ''}`}
                onClick={() => setCat(c)}
                style={on && c !== ALL_CATS ? categoryStyle(c) : undefined}
              >
                {/*
                  只翻**显示名**：`c` 本身是筛选用的键（也是用户 categories.json 里的主键），
                  必须原样传给 setCat / categoryStyle，不能翻。
                */}
                {c === ALL_CATS ? t('common.all') : categoryLabel(c, getLang())}
              </button>
              {i === 0 && (
                <button
                  className={`tag-toggle ${effectiveCat === UNCATEGORIZED ? 'on' : ''}`}
                  onClick={() => setCat(effectiveCat === UNCATEGORIZED ? ALL_CATS : UNCATEGORIZED)}
                  title={t('library.uncategorizedTip')}
                >
                  {t('common.uncategorized')} {uncategorizedCount}
                </button>
              )}
            </Fragment>
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
          <div className="empty-title">{t('library.empty')}</div>
          <div>{t('library.emptyHint')}</div>
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
