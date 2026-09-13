import { useCallback, useEffect, useState } from 'react';
import type { LocalModFootprint, ModInfo, ModlistSummary, Snapshot } from '../types';
import { api, imgSrc, placeholderHue } from '../api';
import { categoryStyle } from '../categories';
import { compareBadge, fmtDate, initials, modKey, uniq } from '../ui';
import { humanSize } from './BackupModal';
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
  IconTrash
} from './Icons';

function fmtDateTime(ms: number): string {
  if (!ms) return '—';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function ModDetailModal({
  mod,
  allCategories,
  modlists,
  onClose,
  onToast,
  onModUpdate,
  onSetModlistMembership,
  onCreateModlistWith,
  onCreateTag,
  onDeleteTag,
  onLocalModDeleted
}: {
  mod: ModInfo;
  allCategories: string[];
  modlists: ModlistSummary[];
  onClose: () => void;
  onToast: (kind: 'ok' | 'warn' | 'err' | 'info', title: string, msg?: string) => void;
  onModUpdate: (m: ModInfo) => void;
  onSetModlistMembership: (
    m: ModInfo,
    list: { fileName: string; name: string },
    add: boolean
  ) => Promise<void>;
  onCreateModlistWith: (m: ModInfo, name: string) => Promise<void>;
  onCreateTag: (name: string) => Promise<void>;
  onDeleteTag: (name: string) => Promise<void>;
  /** 删除本地 mod 成功后调用：关闭弹窗并刷新列表 */
  onLocalModDeleted: () => void;
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

  const isLocal = mod.source === 'local';

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

  async function toggleTag(t: string) {
    const next = tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t];
    setTags(next);
    try {
      await api.setModCategories(key, next);
      onModUpdate({ ...mod, categories: next });
    } catch (e: any) {
      onToast('err', '标签保存失败', String(e?.message || e));
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
        onToast('ok', '封面已更新');
      }
    } catch (e: any) {
      onToast('err', '设置封面失败', String(e?.message || e));
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
      onToast('ok', '已用创意工坊版覆盖本地', '覆盖前的本地版本已存成快照，可在「历史版本」里回滚');
    } catch (e: any) {
      onToast('err', '覆盖失败', String(e?.message || e));
    }
  }

  async function createSnap() {
    setSnapBusy(true);
    try {
      await api.createSnapshot(mod.id);
      await loadSnapshots();
      onToast('ok', '已创建快照', '之后改坏了可以回滚到这一刻');
    } catch (e: any) {
      onToast('err', '创建快照失败', String(e?.message || e));
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
        '已回滚到该版本',
        r?.undoId ? '回滚前的状态也存成快照了，可以再回滚回去' : undefined
      );
    } catch (e: any) {
      onToast('err', '回滚失败', String(e?.message || e));
    } finally {
      setSnapBusy(false);
    }
  }

  async function doDeleteSnap(id: string) {
    setSnapBusy(true);
    try {
      await api.deleteSnapshot(mod.id, id);
      await loadSnapshots();
      onToast('ok', '已删除快照');
    } catch (e: any) {
      onToast('err', '删除快照失败', String(e?.message || e));
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
        r.snapshotCount ? `含 ${r.snapshotCount} 份历史快照` : null,
        r.removedFromModlists.length ? `已从 ${r.removedFromModlists.length} 个合集移除` : null,
        r.freedBytes ? `释放 ${humanSize(r.freedBytes)}` : null
      ].filter(Boolean) as string[];
      onToast('ok', `已删除本地 mod「${mod.name}」`, parts.join(' · ') || undefined);
      onLocalModDeleted();
    } catch (e: any) {
      onToast('err', '删除失败', String(e?.message || e));
    } finally {
      setDeleting(false);
    }
  }

  async function doCopyToLocal() {
    try {
      const r = await api.copyWorkshopToLocal(cp?.id || mod.id, `${mod.name}(复制)`);
      onToast('ok', '已复制为新本地 mod', r?.newFolder);
    } catch (e: any) {
      onToast('err', '复制失败', String(e?.message || e));
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
                {mod.source === 'local' ? '本地 mod' : '创意工坊 mod'}
              </span>
              <span className="badge ver">v{mod.modVersion || '?'}</span>
              {badge && <span className={`badge ${badge.cls}`}>{badge.text}</span>}
            </div>
          </div>
          <button className="btn icon" onClick={onClose} title="关闭">
            <IconClose size={16} />
          </button>
        </div>

        <div className="modal-body">
          {mod.source === 'local' && (
            <>
              <div className="section-title">版本对比</div>
              {cp ? (
                <div className="cmp">
                  <div className="cmp-side">
                    <div className="label">本地版本</div>
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
                    <div className="label">创意工坊版本</div>
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
                    该本地 mod 的 filelist.xml 里没有 <code>steamworkshopid</code>
                    ，无法自动匹配创意工坊版本（可能是原创 mod 或自改 mod）。
                  </div>
                </div>
              )}
            </>
          )}

          <div className="section-title">加入合集（点击切换）</div>
          <div className="tag-edit">
            {modlists.map((l) => {
              const on = mod.usedIn.includes(l.name);
              return (
                <button
                  key={l.fileName}
                  className={`tag-toggle list-toggle ${on ? 'on' : ''}`}
                  title={on ? `从「${l.name}」移出` : `加入「${l.name}」`}
                  onClick={() => {
                    void onSetModlistMembership(mod, l, !on);
                  }}
                >
                  {on ? '✓ ' : '+ '}
                  {l.name}
                  <span style={{ opacity: 0.55, marginLeft: 6, fontSize: 10.5 }}>{l.count}</span>
                </button>
              );
            })}
            {!creatingList && (
              <button className="tag-toggle" onClick={() => setCreatingList(true)}>
                + 新建合集
              </button>
            )}
          </div>

          {creatingList && (
            <div className="btn-row" style={{ marginTop: 10 }}>
              <input
                className="input"
                style={{ maxWidth: 220, height: 32 }}
                placeholder="新合集名称…"
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
                创建并加入
              </button>
              <button className="btn sm" onClick={() => setCreatingList(false)}>
                取消
              </button>
            </div>
          )}

          {isLocal && (
            <>
              <div className="section-title">
                历史版本{snapshots.length ? `（${snapshots.length}）` : ''}
              </div>

              <div className="btn-row" style={{ marginBottom: snapshots.length ? 10 : 8 }}>
                <button className="btn sm" onClick={createSnap} disabled={snapBusy}>
                  <IconPlus size={13} />
                  创建快照
                </button>
                <span className="bk-dim" style={{ alignSelf: 'center' }}>
                  覆盖工坊版 / 再次备份工坊 mod 时也会自动留快照
                </span>
              </div>

              {snapshots.length === 0 ? (
                <div className="hint" style={{ marginBottom: 0 }}>
                  还没有快照。点「创建快照」把当前状态存下来，之后改坏了可以一键回滚。
                </div>
              ) : (
                <div className="snap-list">
                  {snapshots.map((s) => (
                    <div key={s.id} className="snap-row">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="snap-time">{fmtDateTime(s.at)}</div>
                        <div className="snap-meta">
                          {s.label && <span className="badge ver">{s.label}</span>}
                          {humanSize(s.bytes)} · {s.files} 个文件
                        </div>
                      </div>
                      {pendingRestore === s.id ? (
                        <>
                          <button
                            className="btn sm danger"
                            onClick={() => void doRestore(s.id)}
                            disabled={snapBusy}
                          >
                            确认回滚
                          </button>
                          <button className="btn sm" onClick={() => setPendingRestore(null)}>
                            取消
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
                            回滚
                          </button>
                          <button
                            className="btn icon sm"
                            title="删除这个快照"
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
                    回滚会把这个 mod 的文件夹替换成所选快照的内容。当前状态会先自动存成一份新快照，
                    所以<b>回滚本身也能撤销</b>。
                  </div>
                </div>
              )}

              {confirmDeleteLocal && (
                <div className="danger-bar">
                  <IconAlert size={16} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div>
                      确定删除本地 mod「{mod.name}」？<b>不可撤销。</b>
                    </div>
                    <div className="bk-dim" style={{ marginTop: 4 }}>
                      会删除 mod 文件夹
                      {footprint && footprint.snapshotCount > 0
                        ? ` 和它的 ${footprint.snapshotCount} 份历史快照`
                        : ''}
                      {footprint && footprint.totalBytes > 0
                        ? `（约释放 ${humanSize(footprint.totalBytes)}）`
                        : ''}
                    </div>
                    {mod.usedIn.length > 0 && (
                      <label className="cb-row">
                        <input
                          type="checkbox"
                          checked={removeFromLists}
                          onChange={(e) => setRemoveFromLists(e.target.checked)}
                        />
                        同时从 {mod.usedIn.length} 个合集里移除引用（{mod.usedIn.join('、')}）
                      </label>
                    )}
                  </div>
                  <button className="btn sm danger" onClick={doDeleteLocal} disabled={deleting}>
                    {deleting ? '删除中…' : '确认删除'}
                  </button>
                  <button
                    className="btn sm"
                    onClick={() => setConfirmDeleteLocal(false)}
                    disabled={deleting}
                  >
                    取消
                  </button>
                </div>
              )}
            </>
          )}

          <div className="section-title">
            分类标签{managingTags ? '（管理：点 ✕ 删除）' : '（点击切换）'}
          </div>
          <div className="tag-edit">
            {allCategories.map((c) =>
              managingTags ? (
                <span
                  key={c}
                  className={`tag-toggle ${tags.includes(c) ? 'on' : ''}`}
                  style={{ ...(tags.includes(c) ? categoryStyle(c) : {}), cursor: 'default' }}
                >
                  {c}
                  <button
                    className="tag-del"
                    title={`删除标签「${c}」`}
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
                  {c}
                </button>
              )
            )}
            {!managingTags && !creatingTag && (
              <button className="tag-toggle" onClick={() => setCreatingTag(true)}>
                + 新建标签
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
                {managingTags ? '完成' : '管理标签'}
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
                确定删除标签「{pendingDelete}」？它会从所有使用它的 mod 上移除。
                <span style={{ opacity: 0.75 }}>重新输入同名标签即可恢复。</span>
              </div>
              <button className="btn sm danger" onClick={() => void doDeleteTag()}>
                确认删除
              </button>
              <button className="btn sm" onClick={() => setPendingDelete(null)}>
                取消
              </button>
            </div>
          )}

          {creatingTag && (
            <div className="btn-row" style={{ marginTop: 10 }}>
              <input
                className="input"
                style={{ maxWidth: 200, height: 32 }}
                placeholder="新标签名称…"
                autoFocus
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void createTag();
                  if (e.key === 'Escape') setCreatingTag(false);
                }}
              />
              <button className="btn sm primary" onClick={() => void createTag()}>
                创建并打标
              </button>
              <button className="btn sm" onClick={() => setCreatingTag(false)}>
                取消
              </button>
            </div>
          )}

          <div className="section-title">详细信息</div>
          <dl className="kv">
            <dt>来源</dt>
            <dd>{mod.source === 'local' ? `本地 · ${mod.folder}` : `创意工坊 · #${mod.id}`}</dd>
            <dt>文件夹</dt>
            <dd>{mod.folder}</dd>
            {mod.steamworkshopid && (
              <>
                <dt>工坊 ID</dt>
                <dd>#{mod.steamworkshopid}</dd>
              </>
            )}
            <dt>游戏版本</dt>
            <dd>{mod.gameVersion || '—'}</dd>
            <dt>修改时间</dt>
            <dd>{fmtDate(mod.mtime)}</dd>
            <dt>自动分类</dt>
            <dd>{mod.autoCategories.length ? mod.autoCategories.join('、') : '—'}</dd>
            <dt>已用于合集</dt>
            <dd>{mod.usedIn.length ? mod.usedIn.join('、') : '未在合集中启用'}</dd>
            <dt>路径</dt>
            <dd style={{ color: 'var(--text-3)', fontSize: 12 }}>{mod.path}</dd>
          </dl>
        </div>

        <div className="modal-foot">
          <button className="btn sm" onClick={pickCover}>
            <IconImage size={14} />
            设置封面
          </button>
          <button className="btn sm" onClick={() => api.openModFolder(mod.path.replace(/[\\/]filelist\.xml$/i, ''))}>
            <IconFolder size={14} />
            打开文件夹
          </button>
          {mod.source === 'workshop' && (
            <button className="btn sm" onClick={() => api.getWorkshopPage(mod.id)}>
              <IconExternal size={14} />
              工坊页面
            </button>
          )}
          {cp && (
            <>
              <button className="btn sm" onClick={doCopyToLocal}>
                <IconDownload size={14} />
                复制为新本地 mod
              </button>
              <button
                className={`btn sm ${confirmOverwrite ? 'danger' : ''}`}
                onClick={doOverwrite}
                title="会用创意工坊版本覆盖本地文件夹（自动备份）"
              >
                <IconCopy size={14} />
                {confirmOverwrite ? '再点一次确认覆盖' : '用工坊版覆盖本地'}
              </button>
            </>
          )}
          {isLocal && (
            <button
              className="btn sm danger"
              onClick={() =>
                confirmDeleteLocal ? setConfirmDeleteLocal(false) : void openDeleteLocal()
              }
              title="删除这个本地 mod，连它的历史快照一起"
            >
              <IconTrash size={14} />
              {confirmDeleteLocal ? '取消删除' : '删除本地 mod'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
