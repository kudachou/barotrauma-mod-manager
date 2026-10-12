import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BrowseItem, BrowseResult, ModInfo, WorkshopSort } from '../types';
import { api, placeholderHue } from '../api';
import { fmtCount, initials } from '../ui';
import { t, type TKey } from '../i18n';
import { IconAlert, IconExternal, IconRefresh, IconSearch } from './Icons';
import BrowseDetailModal from './BrowseDetailModal';

/**
 * 浏览创意工坊。
 *
 * 数据来自官方 `IPublishedFileService/QueryFiles` —— 唯一能真正搜索/排序工坊的接口，
 * **必须配 Steam Web API Key**（没有 key 会 403）。
 *
 * 下载刻意不做：只「打开工坊页面」让你点订阅。Steam 下好之后，回到本管理器点顶栏的
 * 「同步到游戏」就能装进游戏 —— 那条链路已经做好了，不用额外依赖 SteamCMD。
 */

/** 存 labelKey 而不是写死文案：模块求值发生在 App 设置语言之前（见 docs/HANDOVER.md §1.6） */
const SORTS: { key: WorkshopSort; labelKey: TKey }[] = [
  { key: 'popular', labelKey: 'browse.sortPopular' },
  { key: 'trend', labelKey: 'browse.sortTrend' },
  { key: 'updated', labelKey: 'browse.sortUpdated' },
  { key: 'newest', labelKey: 'browse.sortNewest' },
  { key: 'top', labelKey: 'browse.sortTop' }
];

const PER_PAGE = 24;
/** 分类标签最多同时选几个（多个是 AND 关系，选太多容易筛到空） */
const MAX_TAGS = 3;

function fmtDate(sec: number): string {
  if (!sec) return '—';
  const d = new Date(sec * 1000);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`;
}

export default function BrowseView({
  mods,
  onToast,
  onGoSettings
}: {
  mods: ModInfo[];
  onToast: (kind: 'ok' | 'warn' | 'err' | 'info', title: string, msg?: string) => void;
  onGoSettings: () => void;
}) {
  const [sort, setSort] = useState<WorkshopSort>('popular');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tags, setTags] = useState<{ tag: string; count: number }[]>([]);
  const [tagsError, setTagsError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<BrowseItem | null>(null);
  const [result, setResult] = useState<BrowseResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const seq = useRef(0);

  const load = useCallback(
    async (opts?: { sort?: WorkshopSort; search?: string; page?: number; tags?: string[] }) => {
      const s = opts?.sort ?? sort;
      const q = opts?.search ?? search;
      const p = opts?.page ?? page;
      /* 别叫 `t`：会遮蔽 i18n 的 t()（docs/HANDOVER.md §1.6 规则 2） */
      const tagFilter = opts?.tags ?? selectedTags;
      const my = ++seq.current;
      setLoading(true);
      try {
        const r = await api.browseWorkshop({
          sort: s,
          search: q,
          page: p,
          numPerPage: PER_PAGE,
          tags: tagFilter
        });
        if (my !== seq.current) return; // 只认最后一次请求，避免翻页时旧结果盖上新结果
        setResult(r);
      } catch (e: any) {
        if (my !== seq.current) return;
        setResult({
          needsKey: false,
          error: String(e?.message || e),
          total: 0,
          page: p,
          numPerPage: PER_PAGE,
          items: []
        });
      } finally {
        if (my === seq.current) setLoading(false);
      }
    },
    [sort, search, page, selectedTags]
  );

  /** 分类标签：从 Steam 结果里统计出来的，不硬编码（缓存 6 小时） */
  const loadTags = useCallback(async () => {
    try {
      const r = await api.browseWorkshopTags();
      if (r && r.needsKey) {
        setTags([]);
        setTagsError(null);
        return;
      }
      setTags((r && r.tags) || []);
      setTagsError((r && r.error) || null);
    } catch (e: any) {
      setTagsError(String(e?.message || e));
    }
  }, []);

  useEffect(() => {
    void load();
    void loadTags();
    // 只在首次进入时拉一次；后续都由交互显式触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 已经在本地有的工坊 mod（订阅过或装过），卡片上标出来 */
  const ownedIds = useMemo(
    () => new Set(mods.filter((m) => m.source === 'workshop').map((m) => m.id)),
    [mods]
  );

  function submitSearch() {
    const q = searchInput.trim();
    setSearch(q);
    setPage(1);
    void load({ search: q, page: 1 });
  }

  function changeSort(s: WorkshopSort) {
    setSort(s);
    setPage(1);
    void load({ sort: s, page: 1 });
  }

  /** 点分类：选中/取消，多个之间是 AND（跟 Steam 工坊一致） */
  function toggleTag(tag: string) {
    const has = selectedTags.includes(tag);
    let next: string[];
    if (has) next = selectedTags.filter((x) => x !== tag);
    else if (selectedTags.length >= MAX_TAGS) {
      onToast('warn', t('browse.maxTags', { n: MAX_TAGS }), t('browse.maxTagsHint'));
      return;
    } else next = [...selectedTags, tag];
    setSelectedTags(next);
    setPage(1);
    void load({ tags: next, page: 1 });
  }

  function clearTags() {
    setSelectedTags([]);
    setPage(1);
    void load({ tags: [], page: 1 });
  }

  function goPage(p: number) {
    setPage(p);
    void load({ page: p });
  }

  async function openInSteam(it: BrowseItem) {
    try {
      const r = await api.openWorkshopInSteam(it.id);
      if (!r || !r.ok) throw new Error((r && r.error) || t('browse.cannotOpenSteam'));
      onToast('info', t('browse.openedInSteam'), t('browse.openedInSteamHint'));
    } catch (e: any) {
      // Steam 那条路走不通就退回网页版，别让按钮变成死的
      try {
        await api.openExternal(it.pageUrl);
        onToast('warn', t('browse.steamFallbackWeb'), String(e?.message || e));
      } catch (e2: any) {
        onToast('err', t('browse.openPageFailed'), String(e2?.message || e2));
      }
    }
  }

  async function openWeb(it: BrowseItem) {
    try {
      await api.openExternal(it.pageUrl);
      onToast('info', t('browse.openedInBrowser'), t('browse.openedInBrowserHint'));
    } catch (e: any) {
      onToast('err', t('browse.openPageFailed'), String(e?.message || e));
    }
  }

  const totalPages = result && result.total > 0 ? Math.ceil(result.total / PER_PAGE) : 1;

  return (
    <div className="browse">
      <div className="browse-bar">
        <div className="search">
          <IconSearch size={14} />
          <input
            placeholder={t('browse.searchPlaceholder')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitSearch();
              if (e.key === 'Escape') {
                setSearchInput('');
                setSearch('');
                setPage(1);
                void load({ search: '', page: 1 });
              }
            }}
          />
          {searchInput && (
            <button className="btn sm" onClick={submitSearch}>
              {t('browse.search')}
            </button>
          )}
        </div>
        <div className="browse-sorts">
          {SORTS.map((s) => (
            <div
              key={s.key}
              className={`tag-toggle ${sort === s.key && !search ? 'on' : ''}`}
              onClick={() => changeSort(s.key)}
              title={search ? t('browse.sortSearchTip') : t(s.labelKey)}
            >
              {t(s.labelKey)}
            </div>
          ))}
        </div>

        <span className="spacer" />

        {result && !result.needsKey && !result.error && (
          <span className="browse-total">
            {t('browse.totalLine', {
              total: fmtCount(result.total),
              page: result.page,
              pages: totalPages
            })}
          </span>
        )}
        <button className="btn sm" onClick={() => void load()} disabled={loading}>
          <IconRefresh size={14} />
          {loading ? t('browse.loadingShort') : t('common.refresh')}
        </button>
      </div>

      {search && (
        <div className="browse-note">
          {t('browse.searchingPre')}
          <b>{search}</b>
          {t('browse.searchingPost')}
          <button
            className="btn sm"
            style={{ marginLeft: 8 }}
            onClick={() => {
              setSearchInput('');
              setSearch('');
              setPage(1);
              void load({ search: '', page: 1 });
            }}
          >
            {t('browse.clear')}
          </button>
        </div>
      )}

      {tags.length > 0 && (
        <div className="chips-row browse-tags">
          <div
            className={`tag-toggle ${selectedTags.length === 0 ? 'on' : ''}`}
            onClick={clearTags}
            title={t('browse.clearTagFilterTip')}
          >
            {t('browse.allCategories')}
          </div>
          {tags.map((tag) => (
            <div
              key={tag.tag}
              className={`tag-toggle ${selectedTags.includes(tag.tag) ? 'on' : ''}`}
              onClick={() => toggleTag(tag.tag)}
              title={t('browse.tagCountTip', { n: tag.count })}
            >
              {tag.tag}
              <span className="browse-tag-count">{tag.count}</span>
            </div>
          ))}
          {selectedTags.length > 0 && (
            <span className="browse-note" style={{ margin: 'auto 0 auto 6px' }}>
              {t('browse.selectedTags', { n: selectedTags.length, max: MAX_TAGS })}
            </span>
          )}
        </div>
      )}
      {tagsError && !tags.length && (
        <div className="browse-note">{t('browse.tagsLoadFailed', { error: tagsError })}</div>
      )}

      {result?.needsKey ? (
        <div className="empty" style={{ padding: 40 }}>
          <IconAlert size={26} />
          <div className="empty-title">{t('browse.needKeyTitle')}</div>
          <div>
            {t('browse.needKeyBody1')}
            <code>IPublishedFileService/QueryFiles</code>
            {t('browse.needKeyBody2')}
            <br />
            {t('browse.needKeyBody3')}
            <b>steamcommunity.com/dev/apikey</b>
            {t('browse.needKeyBody4')}
            <br />
            {t('browse.needKeyBody5')}
          </div>
          <div style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={onGoSettings}>
              {t('browse.goSettingsForKey')}
            </button>
          </div>
        </div>
      ) : result?.error ? (
        <div className="empty" style={{ padding: 40 }}>
          <IconAlert size={26} />
          <div className="empty-title">{t('browse.loadFailedTitle')}</div>
          <div>{result.error}</div>
          <div style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => void load()}>
              {t('common.retry')}
            </button>
          </div>
        </div>
      ) : loading && !result ? (
        <div className="empty" style={{ padding: 40 }}>
          <div className="empty-title">{t('browse.loadingWorkshop')}</div>
        </div>
      ) : result && result.items.length === 0 ? (
        <div className="empty" style={{ padding: 40 }}>
          <div className="empty-title">
            {search ? t('browse.noSearchResults') : t('browse.noResults')}
          </div>
        </div>
      ) : (
        <>
          <div className="grid">
            {(result?.items || []).map((it) => {
              const hue = placeholderHue(it.title);
              const showImg = it.previewUrl && !broken.has(it.id);
              const owned = ownedIds.has(it.id);
              return (
                <div className="card" key={it.id} title={it.title} onClick={() => setDetail(it)}>
                  <div className="card-cover">
                    {showImg ? (
                      <img
                        src={it.previewUrl as string}
                        alt=""
                        loading="lazy"
                        onError={() => setBroken((s) => new Set(s).add(it.id))}
                      />
                    ) : (
                      <div
                        className="cover-ph"
                        style={{
                          background: `linear-gradient(140deg, hsl(${hue} 52% 34%), hsl(${(hue + 46) % 360} 58% 16%))`
                        }}
                      >
                        {initials(it.title)}
                      </div>
                    )}
                    <div className="cover-badges">
                      {owned ? (
                        <span className="badge st-backup-ok" title={t('browse.ownedTip')}>
                          {t('browse.owned')}
                        </span>
                      ) : (
                        <span className="badge" title={t('browse.notSubscribedTip')}>
                          {t('browse.notSubscribed')}
                        </span>
                      )}
                      {it.tags.slice(0, 1).map((tag) => (
                        <span className="badge" key={tag}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="card-body">
                    <div className="card-name" style={{ cursor: 'pointer' }}>
                      {it.title}
                    </div>
                    <div className="browse-meta">
                      <span title={t('browse.subscriptionsTip')}>
                        👍 {fmtCount(it.subscriptions)}
                      </span>
                      <span title={t('browse.favoritedTip')}>★ {fmtCount(it.favorited)}</span>
                      <span title={t('browse.updatedTip')}>{fmtDate(it.timeUpdated)}</span>
                    </div>
                    <div className="card-tags">
                      {it.tags.slice(0, 3).map((tag) => (
                        <span className="tag" key={tag}>
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="browse-actions">
                      <button
                        className="btn sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetail(it);
                        }}
                        title={t('browse.viewDetailsTip')}
                      >
                        {t('browse.details')}
                      </button>
                      <button
                        className="btn sm primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          void openInSteam(it);
                        }}
                        title={t('browse.openInSteamTip')}
                      >
                        <IconExternal size={13} />
                        {t('browse.openInSteam')}
                      </button>
                      <button
                        className="btn sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          void openWeb(it);
                        }}
                        title={t('browse.openWebTip')}
                      >
                        {t('browse.openWeb')}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {result && result.total > PER_PAGE && (
            <div className="browse-pager">
              <button className="btn" disabled={page <= 1 || loading} onClick={() => goPage(page - 1)}>
                {t('browse.prevPage')}
              </button>
              <span>{t('browse.pageLine', { page, pages: totalPages })}</span>
              <button
                className="btn"
                disabled={page >= totalPages || loading}
                onClick={() => goPage(page + 1)}
              >
                {t('browse.nextPage')}
              </button>
            </div>
          )}

          <div className="browse-note">
            {t('browse.note1')}
            <b>{t('browse.descriptionAndScreenshots')}</b>
            {t('browse.note2')}
            <b>{t('browse.openInSteam')}</b>
            {t('browse.note3')}
            <br />
            {t('browse.note4')}
            <b>{t('browse.mustReachSteam')}</b>
            {t('browse.note5')}
          </div>
        </>
      )}

      {detail && (
        <BrowseDetailModal
          item={detail}
          onClose={() => setDetail(null)}
          onToast={onToast}
          onOpenInSteam={openInSteam}
          onOpenWeb={openWeb}
        />
      )}
    </div>
  );
}
