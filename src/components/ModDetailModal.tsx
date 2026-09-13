import { useEffect, useState } from 'react';
import type { ModInfo, ModlistSummary } from '../types';
import { api, imgSrc, placeholderHue } from '../api';
import { categoryStyle } from '../categories';
import { compareBadge, fmtDate, initials, modKey, uniq } from '../ui';
import {
  IconAlert,
  IconCheck,
  IconClose,
  IconCopy,
  IconDownload,
  IconExternal,
  IconFolder,
  IconImage
} from './Icons';

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
  onDeleteTag
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
      const r = await api.overwriteLocalWithWorkshop(mod.id, cp?.id);
      onToast('ok', '已用创意工坊版覆盖本地', r?.backup ? `备份：${r.backup}` : undefined);
    } catch (e: any) {
      onToast('err', '覆盖失败', String(e?.message || e));
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
        </div>
      </div>
    </div>
  );
}
