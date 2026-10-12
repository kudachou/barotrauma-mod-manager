import { useEffect, useState } from 'react';
import type { BrowseItem, WorkshopDetails, WorkshopMedia } from '../types';
import { api } from '../api';
import { getLang, t } from '../i18n';
import { fmtCount, fmtDate } from '../ui';
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

/** 大数字统一用 `ui.fmtCount()`（原本三处各一份、行为还不一致） */

function humanSize(bytes: number | null): string {
  const n = Number(bytes) || 0;
  if (!n) return '—';
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

/** 工坊接口给的时间戳是**秒**，`ui.fmtDate` 收毫秒、并按当前语言格式化 */
function fmtDateSec(sec: number | null): string {
  return fmtDate(sec ? sec * 1000 : null);
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
  /** 翻译：null=还没翻；''=正在翻；其它=译文 */
  const [translated, setTranslated] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [showTranslated, setShowTranslated] = useState(true);

  const desc = details?.description || '';
  /*
   * 描述区要"以界面语言为中心"判断，不能以中文为中心 ——
   * 最初只有中文界面，所以逻辑是"描述不是中文就给翻译按钮"。
   * 有了英文界面之后那样正好反了：对英文用户来说，**中文描述才是最需要翻译的情况**。
   *
   * 现在：描述看起来已经是当前界面语言 → 不用翻；否则给按钮。
   * 已知不足：英文界面遇到俄文/日文描述也会被当成"已经是英文"（只有中英两种界面，
   * 中文探测够用；真要做多语言得引入语言识别）。
   */
  const uiLang = getLang();
  const chineseRatio = desc
    ? (desc.match(/[\u4e00-\u9fff]/g) || []).length / Math.max(1, desc.length)
    : 0;
  const descLooksChinese = chineseRatio >= 0.06;
  /**
   * 描述是否已经是当前界面语言。
   *
   * ⚠️ **不能信 `details.localized`**：那个标记只表示"这份描述是用 language 参数请求回来的"，
   * 而 Steam 在没有对应语言版本时会**退回基础语言**——所以作者只写了中文的条目，
   * 请求英文也会拿到中文。曾经因此把中文描述当成"已经是你的语言"，连翻译按钮都不给。
   * 只能看文本本身。
   */
  const descInUiLang = uiLang === 'zh' ? descLooksChinese : !descLooksChinese;
  const needTranslate = !!desc && !descInUiLang;

  async function doTranslate() {
    if (translating || !desc) return;
    setTranslating(true);
    try {
      const r = await api.translateText(desc, getLang());
      if (r && r.ok && r.text) {
        setTranslated(r.text);
        setShowTranslated(true);
        onToast(
          'ok',
          t('browseDetail.translated'),
          r.cached
            ? t('browseDetail.translatedCached')
            : t('browseDetail.mtToast', {
                chunks: r.chunks ? t('browseDetail.mtChunks', { n: r.chunks }) : ''
              })
        );
      } else {
        onToast(
          'warn',
          t('browseDetail.translateFailed'),
          (r && r.error) || t('browseDetail.translateNoContent')
        );
        setTranslated(r && r.text ? r.text : null);
      }
    } catch (e: any) {
      onToast('err', t('browseDetail.translateError'), String(e?.message || e));
    } finally {
      setTranslating(false);
    }
  }

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
              {item.id} · {t('browseDetail.updated', { date: fmtDateSec(details?.timeUpdated || item.timeUpdated) })} ·{' '}
              {t('browseDetail.size', { size: humanSize(details?.fileSize || item.fileSize) })}
            </div>
          </div>
          <button className="btn icon" onClick={onClose} title={t('common.close')}>
            <IconClose size={16} />
          </button>
        </div>

        <div className="modal-body">
          {loading && !details && !media && <div className="bk-dim">{t('browseDetail.loading')}</div>}

          {media?.missing && (
            <div className="warn-bar" style={{ marginBottom: 10 }}>
              <IconAlert size={16} />
              <div>{t('browseDetail.missing')}</div>
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
                {t('browseDetail.noPreview')}
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
                  title={t('browseDetail.shotIndex', { n: i + 1 })}
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
            <span>
              {t('browseDetail.subscriptions', {
                n: fmtCount(details?.subscriptions ?? item.subscriptions)
              })}
            </span>
            <span>
              {t('browseDetail.favorited', { n: fmtCount(details?.favorited ?? item.favorited) })}
            </span>
            <span>{t('browseDetail.views', { n: fmtCount(details?.views ?? item.views) })}</span>
            <span>{t('browseDetail.created', { date: fmtDateSec(details?.timeCreated || null) })}</span>
          </div>

          {(details?.tags?.length || item.tags.length) > 0 && (
            <div className="card-tags" style={{ marginTop: 6 }}>
              {/* ⚠️ 循环变量不能叫 t —— 会遮蔽 i18n 的 t()（ModCard / CollectionsView 都踩过） */}
              {(details?.tags?.length ? details.tags : item.tags).map((tag) => (
                <span className="tag" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
          )}

          {details?.banned && (
            <div className="warn-bar" style={{ marginTop: 10 }}>
              <IconAlert size={16} />
              <div>
                {t('browseDetail.banned', {
                  reason: details.banReason || t('browseDetail.bannedNoReason')
                })}
              </div>
            </div>
          )}

          <div className="section-title">{t('browseDetail.wsDescription')}</div>
          {details?.description ? (
            <>
              <div className="browse-note" style={{ marginTop: 0 }}>
                {/*
                  两个条件都要满足才敢说"作者提供了你的语言版本"：
                  用 language 参数请求过（localized），**且**文本看起来确实是该语言。
                  只看 localized 会把"Steam 退回基础语言（中文）"也标成作者提供了本地化版本。
                */}
                {details.localized && descInUiLang ? (
                  <span
                    className="badge st-backup-ok"
                    title={t('browseDetail.authorZhTip')}
                  >
                    {t('browseDetail.authorZh')}
                  </span>
                ) : descInUiLang ? (
                  <span className="badge st-backup-ok">{t('browseDetail.descIsZh')}</span>
                ) : (
                  <span className="badge st-older" title={t('browseDetail.onlyOriginalTip')}>
                    {t('browseDetail.onlyOriginal')}
                  </span>
                )}
                {needTranslate &&
                  (translated ? (
                    <>
                      <button
                        className="btn sm"
                        style={{ marginLeft: 8 }}
                        onClick={() => setShowTranslated((v) => !v)}
                      >
                        {showTranslated
                          ? t('browseDetail.showOriginal')
                          : t('browseDetail.showTranslation')}
                      </button>
                      <span className="bk-dim" style={{ marginLeft: 8 }}>
                        {t('browseDetail.mtNote')}
                      </span>
                    </>
                  ) : (
                    <button
                      className="btn sm primary"
                      style={{ marginLeft: 8 }}
                      disabled={translating}
                      onClick={() => void doTranslate()}
                      title={t('browseDetail.translateTip')}
                    >
                      {translating ? t('browseDetail.translating') : t('browseDetail.translate')}
                    </button>
                  ))}
              </div>
              {translating && !translated && (
                <div className="bk-dim">{t('browseDetail.translatingLong')}</div>
              )}
              <WorkshopText
                text={showTranslated && translated ? translated : details.description}
                onOpenLink={(url) => {
                  void api.openExternal(url).catch(() => onToast('err', t('browseDetail.linkOpenFailed'), url));
                }}
              />
            </>
          ) : (
            <div className="bk-dim">
              {loading ? t('browseDetail.reading') : t('browseDetail.noDescription')}
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
                        onToast('err', t('browseDetail.reloadFailed'), String(e?.message || e));
                      }
                    })();
                  }}
                >
                  <IconRefresh size={13} />
                  {t('browseDetail.reload')}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn primary" onClick={() => onOpenInSteam(item)}>
            <IconExternal size={14} />
            {t('browseDetail.openInSteam')}
          </button>
          <button className="btn" onClick={() => onOpenWeb(item)}>
            {t('browseDetail.openInBrowser')}
          </button>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
