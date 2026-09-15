import { useEffect, useState } from 'react';
import type { BrowseItem, WorkshopDetails, WorkshopMedia } from '../types';
import { api } from '../api';
import { WorkshopText } from '../workshopText';
import { IconAlert, IconClose, IconExternal, IconRefresh } from './Icons';

/**
 * 浏览工坊的条目详情：封面 / 截图 / 描述 / 热度。
 *
 * - 描述与热度走已有的 `workshop:details`（拉的是 `GetPublishedFileDetails`，带 BBCode 描述），
 *   用 `WorkshopText` 安全渲染，跟 Mod 详情页同一套。
 * - **截图**那个接口不给，只能读工坊页面 HTML（`workshop:media`）—— 好消息是页面里直接
 *   写了全尺寸 URL，不用跑 JS。
 */

function humanCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)} 万`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function humanSize(bytes: number | null): string {
  const n = Number(bytes) || 0;
  if (!n) return '—';
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function fmtDate(sec: number | null): string {
  if (!sec) return '—';
  const d = new Date(sec * 1000);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`;
}

export default function BrowseDetailModal({
  item,
  onClose,
  onToast,
  onOpenInSteam,
  onOpenWeb
}: {
  item: BrowseItem;
  onClose: () => void;
  onToast: (kind: 'ok' | 'warn' | 'err' | 'info', title: string, msg?: string) => void;
  onOpenInSteam: (it: BrowseItem) => void;
  onOpenWeb: (it: BrowseItem) => void;
}) {
  const [details, setDetails] = useState<WorkshopDetails | null>(null);
  const [media, setMedia] = useState<WorkshopMedia | null>(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(0);
  const [broken, setBroken] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void (async () => {
      try {
        // 两件事并行：接口给描述/热度，页面给截图
        const [d, m] = await Promise.all([
          api.getWorkshopDetails(item.id, false).catch(() => null),
          api.getWorkshopMedia(item.id, false).catch(() => null)
        ]);
        if (!alive) return;
        setDetails(d || null);
        setMedia(m || null);
        setActive(0);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [item.id]);

  const shots = (media?.screenshots || []).filter((s) => !broken.has(s.full));
  const mainUrl = shots.length ? shots[Math.min(active, shots.length - 1)].full : media?.cover || item.previewUrl;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ width: 'min(880px, 100%)' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="modal-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {details?.title || item.title}
            </div>
            <div className="page-sub" style={{ marginTop: 4 }}>
              {item.id} · 更新 {fmtDate(details?.timeUpdated || item.timeUpdated)} · 体积{' '}
              {humanSize(details?.fileSize || item.fileSize)}
            </div>
          </div>
          <button className="btn icon" onClick={onClose} title="关闭">
            <IconClose size={16} />
          </button>
        </div>

        <div className="modal-body">
          {loading && !details && !media && <div className="bk-dim">正在读取工坊数据…</div>}

          {media?.missing && (
            <div className="warn-bar" style={{ marginBottom: 10 }}>
              <IconAlert size={16} />
              <div>工坊页面上看不到这个条目了（可能已下架或被作者设为私有）。</div>
            </div>
          )}

          {/* 封面 / 截图主图 */}
          <div className="ws-main">
            {mainUrl ? (
              <img
                src={mainUrl}
                alt=""
                onError={() => setBroken((s) => new Set(s).add(mainUrl))}
              />
            ) : (
              <div className="cover-ph" style={{ height: '100%' }}>
                没有预览图
              </div>
            )}
          </div>

          {/* 截图缩略图条 */}
          {shots.length > 1 && (
            <div className="ws-shots">
              {shots.map((s, i) => (
                <div
                  key={s.full}
                  className={`ws-shot ${i === active ? 'on' : ''}`}
                  onClick={() => setActive(i)}
                  title={`第 ${i + 1} 张`}
                >
                  <img
                    src={s.thumb}
                    alt=""
                    loading="lazy"
                    onError={() => setBroken((x) => new Set(x).add(s.full))}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="ws-stats">
            <span>👍 订阅 {humanCount(details?.subscriptions ?? item.subscriptions)}</span>
            <span>★ 收藏 {humanCount(details?.favorited ?? item.favorited)}</span>
            <span>👁 浏览 {humanCount(details?.views ?? item.views)}</span>
            <span>创建 {fmtDate(details?.timeCreated || null)}</span>
          </div>

          {(details?.tags?.length || item.tags.length) > 0 && (
            <div className="card-tags" style={{ marginTop: 6 }}>
              {(details?.tags?.length ? details.tags : item.tags).map((t) => (
                <span className="tag" key={t}>
                  {t}
                </span>
              ))}
            </div>
          )}

          {details?.banned && (
            <div className="warn-bar" style={{ marginTop: 10 }}>
              <IconAlert size={16} />
              <div>这个条目在工坊上被标记为封禁：{details.banReason || '（无原因）'}</div>
            </div>
          )}

          <div className="section-title">创意工坊描述</div>
          {details?.description ? (
            <WorkshopText
              text={details.description}
              onOpenLink={(url) => {
                void api.openExternal(url).catch(() => onToast('err', '打不开链接', url));
              }}
            />
          ) : (
            <div className="bk-dim">
              {loading ? '读取中…' : '这个条目没有描述，或者没能读到。'}
              {!loading && (
                <button
                  className="btn sm"
                  style={{ marginLeft: 8 }}
                  onClick={() => {
                    void (async () => {
                      try {
                        const d = await api.getWorkshopDetails(item.id, true);
                        setDetails(d || null);
                      } catch (e: any) {
                        onToast('err', '重新读取失败', String(e?.message || e));
                      }
                    })();
                  }}
                >
                  <IconRefresh size={13} />
                  重新读取
                </button>
              )}
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn primary" onClick={() => onOpenInSteam(item)}>
            <IconExternal size={14} />
            在 Steam 里打开
          </button>
          <button className="btn" onClick={() => onOpenWeb(item)}>
            网页版
          </button>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
