import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BrowseItem, BrowseResult, ModInfo, WorkshopSort } from '../types';
import { api, placeholderHue } from '../api';
import { initials } from '../ui';
import { IconAlert, IconExternal, IconRefresh, IconSearch } from './Icons';

/**
 * 浏览创意工坊（beta）。
 *
 * 数据来自官方 `IPublishedFileService/QueryFiles` —— 唯一能真正搜索/排序工坊的接口，
 * **必须配 Steam Web API Key**（没有 key 会 403）。
 *
 * 下载刻意不做：只「打开工坊页面」让你点订阅。Steam 下好之后，回到本管理器点顶栏的
 * 「同步到游戏」就能装进游戏 —— 那条链路已经做好了，不用额外依赖 SteamCMD。
 */

const SORTS: { key: WorkshopSort; label: string }[] = [
  { key: 'popular', label: '最热门' },
  { key: 'trend', label: '趋势' },
  { key: 'updated', label: '最近更新' },
  { key: 'newest', label: '最新发布' },
  { key: 'top', label: '口碑最好' }
];

const PER_PAGE = 24;
/** 分类标签最多同时选几个（多个是 AND 关系，选太多容易筛到空） */
const MAX_TAGS = 3;

function humanCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)} 万`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

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
  const [result, setResult] = useState<BrowseResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const seq = useRef(0);

  const load = useCallback(
    async (opts?: { sort?: WorkshopSort; search?: string; page?: number; tags?: string[] }) => {
      const s = opts?.sort ?? sort;
      const q = opts?.search ?? search;
      const p = opts?.page ?? page;
      const t = opts?.tags ?? selectedTags;
      const my = ++seq.current;
      setLoading(true);
      try {
        const r = await api.browseWorkshop({ sort: s, search: q, page: p, numPerPage: PER_PAGE, tags: t });
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
      onToast('warn', `最多同时选 ${MAX_TAGS} 个分类`, '多个分类是「同时满足」的关系，选太多会筛不到东西');
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
      if (!r || !r.ok) throw new Error((r && r.error) || '打不开 Steam');
      onToast(
        'info',
        '已在 Steam 客户端里打开',
        '在 Steam 里点「订阅」，下载完成后回到本管理器点顶栏「同步到游戏」即可装进游戏'
      );
    } catch (e: any) {
      // Steam 那条路走不通就退回网页版，别让按钮变成死的
      try {
        await api.openExternal(it.pageUrl);
        onToast('warn', '没能打开 Steam 客户端，已改用网页版', String(e?.message || e));
      } catch (e2: any) {
        onToast('err', '打不开工坊页面', String(e2?.message || e2));
      }
    }
  }

  async function openWeb(it: BrowseItem) {
    try {
      await api.openExternal(it.pageUrl);
      onToast('info', '已用浏览器打开工坊页面', '在那个页面上点「订阅」也一样有效');
    } catch (e: any) {
      onToast('err', '打不开工坊页面', String(e?.message || e));
    }
  }

  const totalPages = result && result.total > 0 ? Math.ceil(result.total / PER_PAGE) : 1;

  return (
    <div className="browse">
      <div className="browse-bar">
        <div className="search">
          <IconSearch size={14} />
          <input
            placeholder="搜索工坊 mod（按标题/描述）…"
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
              搜索
            </button>
          )}
        </div>
        <div className="browse-sorts">
          {SORTS.map((s) => (
            <div
              key={s.key}
              className={`tag-toggle ${sort === s.key && !search ? 'on' : ''}`}
              onClick={() => changeSort(s.key)}
              title={search ? '搜索时由 Steam 的相关度排序决定' : s.label}
            >
              {s.label}
            </div>
          ))}
        </div>

        <span className="spacer" />

        {result && !result.needsKey && !result.error && (
          <span className="browse-total">
            共 {humanCount(result.total)} 个 · 第 {result.page} / {totalPages} 页
          </span>
        )}
        <button className="btn sm" onClick={() => void load()} disabled={loading}>
          <IconRefresh size={14} />
          {loading ? '读取中…' : '刷新'}
        </button>
      </div>

      {search && (
        <div className="browse-note">
          正在搜索「<b>{search}</b>」
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
            清除
          </button>
        </div>
      )}

      {tags.length > 0 && (
        <div className="chips-row browse-tags">
          <div
            className={`tag-toggle ${selectedTags.length === 0 ? 'on' : ''}`}
            onClick={clearTags}
            title="不按分类筛"
          >
            全部分类
          </div>
          {tags.map((t) => (
            <div
              key={t.tag}
              className={`tag-toggle ${selectedTags.includes(t.tag) ? 'on' : ''}`}
              onClick={() => toggleTag(t.tag)}
              title={`${t.count} 个热门条目带这个分类`}
            >
              {t.tag}
              <span className="browse-tag-count">{t.count}</span>
            </div>
          ))}
          {selectedTags.length > 0 && (
            <span className="browse-note" style={{ margin: 'auto 0 auto 6px' }}>
              已选 {selectedTags.length}/{MAX_TAGS}（同时满足）
            </span>
          )}
        </div>
      )}
      {tagsError && !tags.length && <div className="browse-note">分类没读到：{tagsError}</div>}

      {result?.needsKey ? (
        <div className="empty" style={{ padding: 40 }}>
          <IconAlert size={26} />
          <div className="empty-title">这个功能需要 Steam Web API Key</div>
          <div>
            「浏览创意工坊」用的是官方查询接口 <code>IPublishedFileService/QueryFiles</code>，
            不带 key 会被 Steam 拒绝（403）。
            <br />
            去 <b>steamcommunity.com/dev/apikey</b> 免费申请一个（域名随便填 localhost），
            填到「设置」里的 Steam Web API Key 就能用了。
            <br />
            另外这个页面要能访问 Steam（国内一般需要开加速器），不然会一直「连不上 Steam」。
          </div>
          <div style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={onGoSettings}>
              去设置里填 Key
            </button>
          </div>
        </div>
      ) : result?.error ? (
        <div className="empty" style={{ padding: 40 }}>
          <IconAlert size={26} />
          <div className="empty-title">没读到工坊数据</div>
          <div>{result.error}</div>
          <div style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => void load()}>
              重试
            </button>
          </div>
        </div>
      ) : loading && !result ? (
        <div className="empty" style={{ padding: 40 }}>
          <div className="empty-title">正在读取创意工坊…</div>
        </div>
      ) : result && result.items.length === 0 ? (
        <div className="empty" style={{ padding: 40 }}>
          <div className="empty-title">{search ? '没搜到符合条件的 mod' : '没有结果'}</div>
        </div>
      ) : (
        <>
          <div className="grid">
            {(result?.items || []).map((it) => {
              const hue = placeholderHue(it.title);
              const showImg = it.previewUrl && !broken.has(it.id);
              const owned = ownedIds.has(it.id);
              return (
                <div className="card" key={it.id} title={it.title}>
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
                        <span className="badge st-backup-ok" title="你的 mod 库里已经有这个条目了">
                          已有
                        </span>
                      ) : (
                        <span className="badge" title="还没订阅">
                          未订阅
                        </span>
                      )}
                      {it.tags.slice(0, 1).map((t) => (
                        <span className="badge" key={t}>
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="card-body">
                    <div className="card-name" style={{ cursor: 'default' }}>
                      {it.title}
                    </div>
                    <div className="browse-meta">
                      <span title="订阅数">👍 {humanCount(it.subscriptions)}</span>
                      <span title="收藏数">★ {humanCount(it.favorited)}</span>
                      <span title="最后更新">{fmtDate(it.timeUpdated)}</span>
                    </div>
                    <div className="card-tags">
                      {it.tags.slice(0, 3).map((t) => (
                        <span className="tag" key={t}>
                          {t}
                        </span>
                      ))}
                    </div>
                    <div className="browse-actions">
                      <button
                        className="btn sm primary"
                        onClick={() => void openInSteam(it)}
                        title="在 Steam 客户端里打开这个条目 —— 直接在客户端里点「订阅」"
                      >
                        <IconExternal size={13} />
                        在 Steam 里打开
                      </button>
                      <button
                        className="btn sm"
                        onClick={() => void openWeb(it)}
                        title="用浏览器打开网页版的工坊页面"
                      >
                        网页版
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
                上一页
              </button>
              <span>
                第 {page} 页 / 共 {totalPages} 页
              </span>
              <button
                className="btn"
                disabled={page >= totalPages || loading}
                onClick={() => goPage(page + 1)}
              >
                下一页
              </button>
            </div>
          )}

          <div className="browse-note">
            订阅走 Steam 自己：点「<b>在 Steam 里打开</b>」→ 在 Steam 客户端里点「订阅」
            （按钮换成「网页版」就用浏览器打开，效果一样）→ 下载完成后回到本管理器，
            点顶栏的「同步到游戏」把新装的 mod 同步进游戏（本页刻意不做下载，免得引入 SteamCMD 依赖）。
            <br />
            本页的数据都来自 Steam 官方接口，所以<b>必须能访问 Steam</b>
            —— 国内一般要先开加速器/代理，否则会一直「连不上 Steam」。
          </div>
        </>
      )}
    </div>
  );
}
