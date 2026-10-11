import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  LocalModFootprint,
  ModInfo,
  ModlistSummary,
  Snapshot,
  WorkshopDetails
} from '../types';
import { api, imgSrc, placeholderHue } from '../api';
import { categoryStyle } from '../categories';
import { features } from '../features';
import { getLang, t } from '../i18n';
import { categoryLabel } from '../i18n/categories';
import { translateMainMessage } from '../i18n/mainMessages';
import { compareBadge, fmtDate, initials, modKey, uniq } from '../ui';
import { humanSize } from './BackupModal';
import { WorkshopText } from '../workshopText';
import {
  IconAlert,
  IconCheck,
  IconClose,
  IconCopy,
  IconDownload,
  IconExternal,
  IconFolder,
  IconImage,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconTrash
} from './Icons';

function fmtDateTime(ms: number): string {
  if (!ms) return '—';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 订阅数之类的大数字，超过一万用「万」显示（英文界面按千位显示 k） */
function fmtCount(n: number): string {
  if (!n) return '0';
  if (n >= 10000) {
    return t('modal.countWan', { n: (n / 10000).toFixed(1), k: (n / 1000).toFixed(1) });
  }
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export default function ModDetailModal({
  mod,
  allMods,
  allCategories,
  modlists,
  relations,
  onClose,
  onToast,
  onModUpdate,
  onSetModlistMembership,
  onSetRelations,
  onCreateModlistWith,
  onCreateTag,
  onDeleteTag,
  onLocalModDeleted,
  onRefresh
}: {
  mod: ModInfo;
  /** 整个 mod 库，用于挑选关联 mod */
  allMods: ModInfo[];
  allCategories: string[];
  modlists: ModlistSummary[];
  relations: Record<string, string[]>;
  onClose: () => void;
  onToast: (kind: 'ok' | 'warn' | 'err' | 'info', title: string, msg?: string) => void;
  onModUpdate: (m: ModInfo) => void;
  onSetModlistMembership: (
    m: ModInfo | ModInfo[],
    list: { fileName: string; name: string },
    add: boolean
  ) => Promise<void>;
  onSetRelations: (key: string, keys: string[]) => Promise<void>;
  onCreateModlistWith: (m: ModInfo, name: string) => Promise<void>;
  onCreateTag: (name: string) => Promise<void>;
  onDeleteTag: (name: string) => Promise<void>;
  /** 删除本地 mod 成功后调用：关闭弹窗并刷新列表 */
  onLocalModDeleted: () => void;
  /** 覆盖 / 复制之后重新扫描，避免卡片还显示旧版本 */
  onRefresh: () => Promise<void>;
}) {
  const [tags, setTags] = useState<string[]>(mod.categories);
  const [preview, setPreview] = useState<string | null>(mod.preview);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [creatingList, setCreatingList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [creatingTag, setCreatingTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [managingTags, setManagingTags] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [thumbBroken, setThumbBroken] = useState(false);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [snapBusy, setSnapBusy] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<string | null>(null);
  const [confirmDeleteLocal, setConfirmDeleteLocal] = useState(false);
  const [footprint, setFootprint] = useState<LocalModFootprint | null>(null);
  const [removeFromLists, setRemoveFromLists] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [wsDetails, setWsDetails] = useState<WorkshopDetails | null>(null);
  const [wsLoading, setWsLoading] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);
  const [relationQ, setRelationQ] = useState('');
  const [showRelationPicker, setShowRelationPicker] = useState(false);
  const [pendingList, setPendingList] = useState<{ fileName: string; name: string } | null>(
    null
  );

  /** 当前 mod 的标识，和 categories / relations 里的 key 一致 */
  const myKey = `${mod.source}:${mod.id}`;
  const relatedKeys = relations[myKey] || [];

  const modByKey = useMemo(() => {
    const m = new Map<string, ModInfo>();
    for (const x of allMods) m.set(`${x.source}:${x.id}`, x);
    return m;
  }, [allMods]);

  const relatedMods = relatedKeys.map((k) => modByKey.get(k)).filter(Boolean) as ModInfo[];
  /** 配了关联、但这个 mod 已经不在库里了 */
  const danglingRelations = relatedKeys.filter((k) => !modByKey.has(k));

  const relationCandidates = useMemo(() => {
    const q = relationQ.trim().toLowerCase();
    return allMods
      .filter(
        (m) => `${m.source}:${m.id}` !== myKey && !relatedKeys.includes(`${m.source}:${m.id}`)
      )
      .filter(
        (m) =>
          !q ||
          m.name.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q) ||
          (m.steamworkshopid || '').includes(q)
      )
      .slice(0, 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMods, relationQ, relations, myKey]);

  async function toggleRelation(target: ModInfo) {
    const k = `${target.source}:${target.id}`;
    const next = relatedKeys.includes(k) ? relatedKeys.filter((x) => x !== k) : [...relatedKeys, k];
    await onSetRelations(myKey, next);
  }

  /** 点合集标签：移出直接做；加入时如果有关联 mod，先问一句要不要一起加 */
  function onListClick(l: { fileName: string; name: string }, on: boolean) {
    if (on) {
      void onSetModlistMembership(mod, l, false);
      return;
    }
    if (relatedMods.length > 0) {
      setPendingList(l);
      return;
    }
    void onSetModlistMembership(mod, l, true);
  }

  const isLocal = mod.source === 'local';
  /** 本地 mod 靠 filelist 里的 steamworkshopid 找到它对应的工坊条目 */
  const workshopId = mod.source === 'workshop' ? mod.id : mod.steamworkshopid;

  useEffect(() => {
    setWsError(null);
    setWsDetails(null);
    if (!workshopId) return;
    /*
     * 工坊描述只在有浏览工坊功能的变体里取。
     * 创意工坊版关掉了 `workshop:details`（要 Web API Key），不挡的话这里会白跑一次请求、
     * 必然抛错，然后在控制台留一条没用的报错（界面那块已经隐藏了）。
     */
    if (!features.browseWorkshop) return;
    let alive = true;
    setWsLoading(true);
    api
      .getWorkshopDetails(workshopId)
      .then((d) => {
        if (alive) setWsDetails(d);
      })
      .catch((e: any) => {
        if (alive) setWsError(String(e?.message || e));
      })
      .finally(() => {
        if (alive) setWsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [workshopId]);

  const loadSnapshots = useCallback(async () => {
    if (!isLocal) {
      setSnapshots([]);
      return;
    }
    try {
      const r = await api.listSnapshots(mod.id);
      setSnapshots(r.items);
    } catch {
      setSnapshots([]);
    }
  }, [isLocal, mod.id]);

  useEffect(() => {
    void loadSnapshots();
  }, [loadSnapshots]);

  useEffect(() => {
    setTags(mod.categories);
    setPreview(mod.preview);
    setConfirmOverwrite(false);
    setCreatingList(false);
    setNewListName('');
    setCreatingTag(false);
    setNewTagName('');
    setManagingTags(false);
    setPendingDelete(null);
    setThumbBroken(false);
  }, [mod]);

  const key = modKey(mod);
  const badge = compareBadge(mod);
  const src = thumbBroken ? null : imgSrc(preview);
  const hue = placeholderHue(mod.name);
  const cp = mod.counterpart;

  async function toggleTag(tag: string) {
    const next = tags.includes(tag) ? tags.filter((x) => x !== tag) : [...tags, tag];
    setTags(next);
    try {
      await api.setModCategories(key, next);
      onModUpdate({ ...mod, categories: next });
    } catch (e: any) {
      onToast('err', t('modal.tagSaveFailed'), String(e?.message || e));
    }
  }

  /** 新建标签并直接打到这个 mod 上 */
  async function createTag() {
    const n = newTagName.trim();
    if (!n) return;
    await onCreateTag(n);
    if (!tags.includes(n)) await toggleTag(n);
    setNewTagName('');
    setCreatingTag(false);
  }

  /** 确认删除标签 */
  async function doDeleteTag() {
    const n = pendingDelete;
    if (!n) return;
    await onDeleteTag(n);
    setTags((prev) => prev.filter((x) => x !== n));
    setPendingDelete(null);
  }

  async function pickCover() {
    try {
      const p = await api.setLocalCover(key);
      if (p) {
        setPreview(p);
        onModUpdate({ ...mod, preview: p });
        onToast('ok', t('modal.coverUpdated'));
      }
    } catch (e: any) {
      onToast('err', t('modal.setCoverFailed'), String(e?.message || e));
    }
  }

  async function doOverwrite() {
    if (!confirmOverwrite) {
      setConfirmOverwrite(true);
      window.setTimeout(() => setConfirmOverwrite(false), 4000);
      return;
    }
    try {
      await api.overwriteLocalWithWorkshop(mod.id, cp?.id);
      await loadSnapshots();
      await onRefresh();
      onToast('ok', t('modal.overwrittenLocal'), t('modal.overwrittenLocalMsg'));
    } catch (e: any) {
      onToast('err', t('modal.overwriteFailed'), String(e?.message || e));
    }
  }

  async function createSnap() {
    setSnapBusy(true);
    try {
      await api.createSnapshot(mod.id);
      await loadSnapshots();
      onToast('ok', t('modal.snapCreated'), t('modal.snapCreatedMsg'));
    } catch (e: any) {
      onToast('err', t('modal.snapCreateFailed'), String(e?.message || e));
    } finally {
      setSnapBusy(false);
    }
  }

  async function doRestore(id: string) {
    setSnapBusy(true);
    try {
      const r = await api.restoreSnapshot(mod.id, id);
      await loadSnapshots();
      setPendingRestore(null);
      onToast(
        'ok',
        t('modal.restoredToVersion'),
        r?.undoId ? t('modal.restoredToVersionMsg') : undefined
      );
    } catch (e: any) {
      onToast('err', t('modal.restoreFailed'), String(e?.message || e));
    } finally {
      setSnapBusy(false);
    }
  }

  async function doDeleteSnap(id: string) {
    setSnapBusy(true);
    try {
      await api.deleteSnapshot(mod.id, id);
      await loadSnapshots();
      onToast('ok', t('modal.snapDeleted'));
    } catch (e: any) {
      onToast('err', t('modal.snapDeleteFailed'), String(e?.message || e));
    } finally {
      setSnapBusy(false);
    }
  }

  async function openDeleteLocal() {
    setConfirmDeleteLocal(true);
    setRemoveFromLists(mod.usedIn.length > 0);
    setFootprint(null);
    try {
      setFootprint(await api.localModFootprint(mod.id));
    } catch {
      /* 拿不到体积也不影响删除 */
    }
  }

  async function doDeleteLocal() {
    setDeleting(true);
    try {
      const r = await api.deleteLocalMod(mod.id, removeFromLists);
      const parts = [
        r.snapshotCount ? t('modal.deletedPartSnapshots', { n: r.snapshotCount }) : null,
        r.removedFromModlists.length
          ? t('modal.deletedPartLists', { n: r.removedFromModlists.length })
          : null,
        r.freedBytes ? t('modal.deletedPartFreed', { size: humanSize(r.freedBytes) }) : null
      ].filter(Boolean) as string[];
      onToast('ok', t('modal.localDeleted', { name: mod.name }), parts.join(' · ') || undefined);
      onLocalModDeleted();
    } catch (e: any) {
      onToast('err', t('modal.deleteFailed'), String(e?.message || e));
    } finally {
      setDeleting(false);
    }
  }

  async function doCopyToLocal() {
    try {
      const r = await api.copyWorkshopToLocal(
        cp?.id || mod.id,
        t('modal.copyNamePattern', { name: mod.name })
      );
      onToast('ok', t('modal.copiedToLocal'), r?.newFolder);
    } catch (e: any) {
      onToast('err', t('modal.copyFailed'), String(e?.message || e));
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="row-thumb" style={{ width: 84, height: 54, borderRadius: 9 }}>
            {src ? (
              <img src={src} alt="" onError={() => setThumbBroken(true)} />
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
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="modal-title">{mod.name}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <span className={`badge ${mod.source === 'local' ? 'src-local' : 'src-workshop'}`}>
                {mod.source === 'local'
                  ? t('modal.sourceLocalMod')
                  : t('modal.sourceWorkshopMod')}
              </span>
              <span className="badge ver">v{mod.modVersion || '?'}</span>
              {badge && <span className={`badge ${badge.cls}`}>{t(badge.key)}</span>}
            </div>
          </div>
          <button className="btn icon" onClick={onClose} title={t('common.close')}>
            <IconClose size={16} />
          </button>
        </div>

        <div className="modal-body">
          {mod.source === 'local' && (
            <>
              <div className="section-title">{t('modal.versionCompare')}</div>
              {cp ? (
                <div className="cmp">
                  <div className="cmp-side">
                    <div className="label">{t('modal.localVersion')}</div>
                    <div className="ver">{mod.modVersion || '?'}</div>
                    <div className="nm">{mod.name}</div>
                  </div>
                  <div className="cmp-arrow">
                    {cp.status === 'older' ? (
                      <IconAlert size={20} />
                    ) : cp.status === 'same' ? (
                      <IconCheck size={20} />
                    ) : (
                      <IconCopy size={20} />
                    )}
                  </div>
                  <div className="cmp-side">
                    <div className="label">{t('modal.workshopVersion')}</div>
                    <div className="ver">{cp.version || '?'}</div>
                    <div className="nm">
                      {cp.name} · #{cp.id}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="warn-bar">
                  <IconAlert size={16} />
                  <div>
                    {t('modal.noWorkshopIdPre')}
                    <code>steamworkshopid</code>
                    {t('modal.noWorkshopIdPost')}
                  </div>
                </div>
              )}
            </>
          )}

          {/*
            工坊描述整块只在**有浏览工坊功能**的变体里显示。
            创意工坊版关掉了 `workshop:details`（它要 Web API Key），这块以前会渲染出来并
            直接给用户甩一句主进程报错（`Error invoking remote method 'workshop:details': …`）。
            底部的「Workshop page」按钮不受影响，跳转工坊页面本来就不需要 Key。
          */}
          {workshopId && features.browseWorkshop && (
            <>
              <div className="section-title">{t('modal.wsDescription')}</div>

              {wsLoading ? (
                <div className="hint" style={{ marginBottom: 0 }}>
                  {t('modal.wsReading')}
                </div>
              ) : wsError ? (
                <div className="warn-bar" style={{ marginBottom: 0 }}>
                  <IconAlert size={16} />
                  <div>{t('modal.wsReadFailed', { error: translateMainMessage(wsError) })}</div>
                </div>
              ) : !wsDetails ? (
                <div className="hint" style={{ marginBottom: 0 }}>
                  {t('modal.wsNotFound')}
                </div>
              ) : (
                <>
                  {wsDetails.banned && (
                    <div className="danger-bar" style={{ marginTop: 0, marginBottom: 12 }}>
                      <IconAlert size={16} />
                      <div>
                        {t('modal.wsBannedPre')}
                        {wsDetails.banReason
                          ? t('modal.wsBannedReason', { reason: wsDetails.banReason })
                          : t('modal.sentenceEnd')}
                      </div>
                    </div>
                  )}

                  <div className="ws-stats">
                    <span>{t('modal.wsSubscriptions', { n: fmtCount(wsDetails.subscriptions) })}</span>
                    <span>{t('modal.wsFavorited', { n: fmtCount(wsDetails.favorited) })}</span>
                    <span>{t('modal.wsViews', { n: fmtCount(wsDetails.views) })}</span>
                    {wsDetails.timeUpdated ? (
                      <span>{t('modal.wsUpdatedAt', { date: fmtDate(wsDetails.timeUpdated * 1000) })}</span>
                    ) : null}
                  </div>

                  {wsDetails.tags.length > 0 && (
                    <div className="tag-edit" style={{ margin: '0 0 12px' }}>
                      {wsDetails.tags.map((t) => (
                        <span key={t} className="badge ver">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}

                  {wsDetails.description?.trim() ? (
                    <div className="ws-wrap">
                      <WorkshopText
                        text={wsDetails.description}
                        onOpenLink={(u) => void api.openExternal(u)}
                      />
                    </div>
                  ) : (
                    <div className="hint" style={{ marginBottom: 0 }}>
                      {t('modal.wsNoDescription')}
                    </div>
                  )}

                  <div className="btn-row" style={{ marginTop: 10 }}>
                    <button className="btn sm" onClick={() => void api.getWorkshopPage(workshopId)}>
                      <IconExternal size={14} />
                      {t('modal.openWorkshopPage')}
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          <div className="section-title">{t('modal.joinLists')}</div>
          <div className="tag-edit">
            {modlists.map((l) => {
              const on = mod.usedIn.includes(l.name);
              return (
                <button
                  key={l.fileName}
                  className={`tag-toggle list-toggle ${on ? 'on' : ''}`}
                  title={
                    on
                      ? t('modal.listRemoveTip', { name: l.name })
                      : t('modal.listAddTip', { name: l.name })
                  }
                  onClick={() => onListClick(l, on)}
                >
                  {on ? '✓ ' : '+ '}
                  {l.name}
                  <span style={{ opacity: 0.55, marginLeft: 6, fontSize: 10.5 }}>{l.count}</span>
                </button>
              );
            })}
            {!creatingList && (
              <button className="tag-toggle" onClick={() => setCreatingList(true)}>
                {t('modal.newList')}
              </button>
            )}
          </div>

          {pendingList && (
            <div className="warn-bar" style={{ marginTop: 10, marginBottom: 0 }}>
              <IconAlert size={16} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div>
                  {t('modal.relatedAskPre', { name: mod.name })}
                  {t('modal.relatedAskCount', { n: relatedMods.length })}
                  <b>{relatedMods.map((m) => m.name).join(t('common.listSeparator'))}</b>
                  {t('modal.sentenceEnd')}
                </div>
                <div className="bk-dim" style={{ marginTop: 3 }}>
                  {t('modal.relatedConfirm', { name: pendingList.name })}
                </div>
                <div className="btn-row" style={{ marginTop: 8 }}>
                  <button
                    className="btn sm primary"
                    onClick={() => {
                      const target = pendingList;
                      setPendingList(null);
                      void onSetModlistMembership([mod, ...relatedMods], target, true);
                    }}
                  >
                    {t('modal.addTogether', { n: relatedMods.length + 1 })}
                  </button>
                  <button
                    className="btn sm"
                    onClick={() => {
                      const target = pendingList;
                      setPendingList(null);
                      void onSetModlistMembership(mod, target, true);
                    }}
                  >
                    {t('modal.addOnlyThis')}
                  </button>
                  <button className="btn sm" onClick={() => setPendingList(null)}>
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {creatingList && (
            <div className="btn-row" style={{ marginTop: 10 }}>
              <input
                className="input"
                style={{ maxWidth: 220, height: 32 }}
                placeholder={t('modal.newListPlaceholder')}
                autoFocus
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newListName.trim()) {
                    void onCreateModlistWith(mod, newListName);
                    setNewListName('');
                    setCreatingList(false);
                  }
                  if (e.key === 'Escape') setCreatingList(false);
                }}
              />
              <button
                className="btn sm primary"
                onClick={() => {
                  if (!newListName.trim()) return;
                  void onCreateModlistWith(mod, newListName);
                  setNewListName('');
                  setCreatingList(false);
                }}
              >
                {t('modal.createAndJoin')}
              </button>
              <button className="btn sm" onClick={() => setCreatingList(false)}>
                {t('common.cancel')}
              </button>
            </div>
          )}

          {isLocal && (
            <>
              <div className="section-title">
                {t('modal.historyTitle')}
                {snapshots.length ? t('modal.parenCount', { n: snapshots.length }) : ''}
              </div>

              <div className="btn-row" style={{ marginBottom: snapshots.length ? 10 : 8 }}>
                <button className="btn sm" onClick={createSnap} disabled={snapBusy}>
                  <IconPlus size={13} />
                  {t('modal.createSnapshot')}
                </button>
                <span className="bk-dim" style={{ alignSelf: 'center' }}>
                  {t('modal.snapshotAutoHint')}
                </span>
              </div>

              {snapshots.length === 0 ? (
                <div className="hint" style={{ marginBottom: 0 }}>
                  {t('modal.noSnapshots')}
                </div>
              ) : (
                <div className="snap-list">
                  {snapshots.map((s) => (
                    <div key={s.id} className="snap-row">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="snap-time">{fmtDateTime(s.at)}</div>
                        <div className="snap-meta">
                          {s.label && <span className="badge ver">{s.label}</span>}
                          {humanSize(s.bytes)} · {t('modal.fileCount', { n: s.files })}
                        </div>
                      </div>
                      {pendingRestore === s.id ? (
                        <>
                          <button
                            className="btn sm danger"
                            onClick={() => void doRestore(s.id)}
                            disabled={snapBusy}
                          >
                            {t('modal.confirmRestore')}
                          </button>
                          <button className="btn sm" onClick={() => setPendingRestore(null)}>
                            {t('common.cancel')}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="btn sm"
                            onClick={() => setPendingRestore(s.id)}
                            disabled={snapBusy}
                          >
                            <IconRefresh size={13} />
                            {t('modal.restore')}
                          </button>
                          <button
                            className="btn icon sm"
                            title={t('modal.deleteSnapshotTip')}
                            onClick={() => void doDeleteSnap(s.id)}
                            disabled={snapBusy}
                          >
                            <IconTrash size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {pendingRestore && (
                <div className="warn-bar" style={{ marginTop: 10, marginBottom: 0 }}>
                  <IconAlert size={16} />
                  <div>
                    {t('modal.restoreHintPre')}
                    <b>{t('modal.restoreHintBold')}</b>
                    {t('modal.sentenceEnd')}
                  </div>
                </div>
              )}

              {confirmDeleteLocal && (
                <div className="danger-bar">
                  <IconAlert size={16} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div>
                      {t('modal.deleteLocalConfirmPre', { name: mod.name })}
                      <b>{t('modal.deleteLocalIrreversible')}</b>
                    </div>
                    <div className="bk-dim" style={{ marginTop: 4 }}>
                      {t('modal.deleteFolderBase')}
                      {footprint && footprint.snapshotCount > 0
                        ? t('modal.deleteFolderSnaps', { n: footprint.snapshotCount })
                        : ''}
                      {footprint && footprint.totalBytes > 0
                        ? t('modal.deleteFreedBytes', { size: humanSize(footprint.totalBytes) })
                        : ''}
                    </div>
                    {mod.usedIn.length > 0 && (
                      <label className="cb-row">
                        <input
                          type="checkbox"
                          checked={removeFromLists}
                          onChange={(e) => setRemoveFromLists(e.target.checked)}
                        />
                        {t('modal.removeFromLists', {
                          n: mod.usedIn.length,
                          list: mod.usedIn.join(t('common.listSeparator'))
                        })}
                      </label>
                    )}
                  </div>
                  <button className="btn sm danger" onClick={doDeleteLocal} disabled={deleting}>
                    {deleting ? t('modal.deleting') : t('modal.confirmDelete')}
                  </button>
                  <button
                    className="btn sm"
                    onClick={() => setConfirmDeleteLocal(false)}
                    disabled={deleting}
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              )}
            </>
          )}

          <div className="section-title">
            {t('modal.relatedMods')}
            {relatedMods.length > 0 ? t('modal.parenCount', { n: relatedMods.length }) : ''}
          </div>

          {relatedMods.length > 0 ? (
            <div className="rel-list">
              {relatedMods.map((r) => (
                <div key={`${r.source}:${r.id}`} className="rel-row">
                  <span className={`badge ${r.source === 'local' ? 'src-local' : 'src-workshop'}`}>
                    {r.source === 'local' ? t('card.source.local') : t('card.source.workshop')}
                  </span>
                  <span className="rel-name" title={r.name}>
                    {r.name}
                  </span>
                  {r.modVersion && <span className="badge ver">v{r.modVersion}</span>}
                  <button
                    className="btn icon sm"
                    title={t('modal.unlinkTip')}
                    onClick={() => void toggleRelation(r)}
                  >
                    <IconTrash size={13} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="hint" style={{ marginBottom: 8 }}>
              {t('modal.noRelations')}
            </div>
          )}

          {danglingRelations.length > 0 && (
            <div className="bk-dim" style={{ marginBottom: 8 }}>
              {t('modal.danglingRelations', { n: danglingRelations.length })}
              <button
                className="btn sm"
                style={{ marginLeft: 8 }}
                onClick={() =>
                  void onSetRelations(
                    myKey,
                    relatedMods.map((m) => `${m.source}:${m.id}`)
                  )
                }
              >
                {t('modal.cleanup')}
              </button>
            </div>
          )}

          {!showRelationPicker ? (
            <button className="btn sm" onClick={() => setShowRelationPicker(true)}>
              <IconPlus size={13} />
              {t('modal.addRelation')}
            </button>
          ) : (
            <div className="rel-picker">
              <div className="search" style={{ height: 34 }}>
                <IconSearch size={14} />
                <input
                  autoFocus
                  placeholder={t('library.searchPlaceholder')}
                  value={relationQ}
                  onChange={(e) => setRelationQ(e.target.value)}
                />
              </div>
              <div className="rel-candidates">
                {relationCandidates.length === 0 && (
                  <div className="bk-dim" style={{ padding: 10 }}>
                    {t('library.empty')}
                  </div>
                )}
                {relationCandidates.map((m) => (
                  <button
                    key={`${m.source}:${m.id}`}
                    className="rel-cand"
                    onClick={() => void toggleRelation(m)}
                  >
                    <span className={`badge ${m.source === 'local' ? 'src-local' : 'src-workshop'}`}>
                      {m.source === 'local' ? t('card.source.local') : t('card.source.workshop')}
                    </span>
                    <span className="rel-name">{m.name}</span>
                    <IconPlus size={13} />
                  </button>
                ))}
              </div>
              <button
                className="btn sm"
                onClick={() => {
                  setShowRelationPicker(false);
                  setRelationQ('');
                }}
              >
                {t('modal.done')}
              </button>
            </div>
          )}

          <div className="section-title">
            {t('modal.tagsTitle')}
            {managingTags ? t('modal.tagsManaging') : t('modal.tagsClickToggle')}
          </div>
          <div className="tag-edit">
            {allCategories.map((c) =>
              managingTags ? (
                <span
                  key={c}
                  className={`tag-toggle ${tags.includes(c) ? 'on' : ''}`}
                  style={{ ...(tags.includes(c) ? categoryStyle(c) : {}), cursor: 'default' }}
                >
                  {/* 只翻显示名：c 是分类主键，删除/匹配都用它 */}
                  {categoryLabel(c, getLang())}
                  <button
                    className="tag-del"
                    title={t('modal.deleteTagTip', { name: categoryLabel(c, getLang()) })}
                    onClick={() => setPendingDelete(c)}
                  >
                    ✕
                  </button>
                </span>
              ) : (
                <button
                  key={c}
                  className={`tag-toggle ${tags.includes(c) ? 'on' : ''}`}
                  onClick={() => toggleTag(c)}
                  style={tags.includes(c) ? categoryStyle(c) : undefined}
                >
                  {categoryLabel(c, getLang())}
                </button>
              )
            )}
            {!managingTags && !creatingTag && (
              <button className="tag-toggle" onClick={() => setCreatingTag(true)}>
                {t('modal.newTag')}
              </button>
            )}
            {!creatingTag && (
              <button
                className={`tag-toggle ${managingTags ? 'on' : ''}`}
                onClick={() => {
                  setManagingTags((v) => !v);
                  setPendingDelete(null);
                }}
              >
                {managingTags ? t('modal.done') : t('modal.manageTags')}
              </button>
            )}
          </div>

          {pendingDelete && (
            <div
              className="warn-bar"
              style={{ marginTop: 10, marginBottom: 0, alignItems: 'center' }}
            >
              <IconAlert size={16} />
              <div style={{ flex: 1 }}>
                {t('modal.deleteTagConfirm', { name: pendingDelete })}
                <span style={{ opacity: 0.75 }}>{t('modal.deleteTagRestoreHint')}</span>
              </div>
              <button className="btn sm danger" onClick={() => void doDeleteTag()}>
                {t('modal.confirmDelete')}
              </button>
              <button className="btn sm" onClick={() => setPendingDelete(null)}>
                {t('common.cancel')}
              </button>
            </div>
          )}

          {creatingTag && (
            <div className="btn-row" style={{ marginTop: 10 }}>
              <input
                className="input"
                style={{ maxWidth: 200, height: 32 }}
                placeholder={t('modal.newTagPlaceholder')}
                autoFocus
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void createTag();
                  if (e.key === 'Escape') setCreatingTag(false);
                }}
              />
              <button className="btn sm primary" onClick={() => void createTag()}>
                {t('modal.createAndTag')}
              </button>
              <button className="btn sm" onClick={() => setCreatingTag(false)}>
                {t('common.cancel')}
              </button>
            </div>
          )}

          <div className="section-title">{t('modal.details')}</div>
          <dl className="kv">
            <dt>{t('modal.dtSource')}</dt>
            <dd>
              {mod.source === 'local'
                ? t('modal.sourceLocalFolder', { folder: mod.folder })
                : t('modal.sourceWorkshopId', { id: mod.id })}
            </dd>
            <dt>{t('modal.dtFolder')}</dt>
            <dd>{mod.folder}</dd>
            {mod.steamworkshopid && (
              <>
                <dt>{t('modal.dtWorkshopId')}</dt>
                <dd>#{mod.steamworkshopid}</dd>
              </>
            )}
            <dt>{t('modal.dtGameVersion')}</dt>
            <dd>{mod.gameVersion || '—'}</dd>
            <dt>{t('modal.dtMtime')}</dt>
            <dd>{fmtDate(mod.mtime)}</dd>
            <dt>{t('modal.dtAutoCategories')}</dt>
            <dd>
              {mod.autoCategories.length
                ? mod.autoCategories.map((c) => categoryLabel(c, getLang())).join(t('common.listSeparator'))
                : '—'}
            </dd>
            <dt>{t('modal.dtUsedIn')}</dt>
            <dd>
              {mod.usedIn.length
                ? mod.usedIn.join(t('common.listSeparator'))
                : t('modal.notInAnyList')}
            </dd>
            <dt>{t('modal.dtPath')}</dt>
            <dd style={{ color: 'var(--text-3)', fontSize: 12 }}>{mod.path}</dd>
          </dl>
        </div>

        <div className="modal-foot">
          <button className="btn sm" onClick={pickCover}>
            <IconImage size={14} />
            {t('modal.setCover')}
          </button>
          <button className="btn sm" onClick={() => api.openModFolder(mod.path.replace(/[\\/]filelist\.xml$/i, ''))}>
            <IconFolder size={14} />
            {t('modal.openFolder')}
          </button>
          {mod.source === 'workshop' && (
            <button className="btn sm" onClick={() => api.getWorkshopPage(mod.id)}>
              <IconExternal size={14} />
              {t('modal.workshopPage')}
            </button>
          )}
          {cp && (
            <>
              <button className="btn sm" onClick={doCopyToLocal}>
                <IconDownload size={14} />
                {t('modal.copyToLocal')}
              </button>
              <button
                className={`btn sm ${confirmOverwrite ? 'danger' : ''}`}
                onClick={doOverwrite}
                title={t('modal.overwriteTip')}
              >
                <IconCopy size={14} />
                {confirmOverwrite ? t('modal.overwriteConfirm') : t('modal.overwriteLocal')}
              </button>
            </>
          )}
          {isLocal && (
            <button
              className="btn sm danger"
              onClick={() =>
                confirmDeleteLocal ? setConfirmDeleteLocal(false) : void openDeleteLocal()
              }
              title={t('modal.deleteLocalTip')}
            >
              <IconTrash size={14} />
              {confirmDeleteLocal ? t('modal.cancelDelete') : t('modal.deleteLocal')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
