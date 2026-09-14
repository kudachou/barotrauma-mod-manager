import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppliedInfo, ModInfo, ModlistEntry, ModlistFull, ModlistSummary } from '../types';
import { api, imgSrc, placeholderHue } from '../api';
import { compareBadge, initials, safeFileName, uniq } from '../ui';
import {
  IconAlert,
  IconCheck,
  IconGrip,
  IconLayers,
  IconPlus,
  IconPlay,
  IconRefresh,
  IconSave,
  IconSearch,
  IconTrash
} from './Icons';

/** 合集列表里的一个虚拟条目：游戏当前生效的内容 */
const APPLIED = '__applied__';

export default function CollectionsView({
  mods,
  modlists,
  applied,
  reloadToken,
  onRefresh,
  onToast
}: {
  mods: ModInfo[];
  modlists: ModlistSummary[];
  applied: AppliedInfo | null;
  reloadToken: number;
  onRefresh: () => Promise<void>;
  onToast: (kind: 'ok' | 'warn' | 'err' | 'info', title: string, msg?: string) => void;
}) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [current, setCurrent] = useState<ModlistFull | null>(null);
  const [dirty, setDirty] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [pickerQ, setPickerQ] = useState('');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  // 自动选中第一个合集
  useEffect(() => {
    if (!selectedFile && modlists.length) setSelectedFile(modlists[0].fileName);
  }, [modlists, selectedFile]);

  // 有未保存改动时不覆盖编辑器内容
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    let alive = true;
    if (!selectedFile || selectedFile === APPLIED) {
      setCurrent(null);
      return;
    }
    if (dirtyRef.current) return;
    api
      .getModlist(selectedFile)
      .then((l: ModlistFull | null) => {
        if (!alive) return;
        setCurrent(l ? { ...l, entries: [...l.entries] } : null);
        setDirty(false);
      })
      .catch(() => alive && setCurrent(null));
    return () => {
      alive = false;
    };
  }, [selectedFile, reloadToken]);

  const byWorkshopId = useMemo(() => {
    const m = new Map<string, ModInfo>();
    for (const x of mods) if (x.source === 'workshop') m.set(x.id, x);
    return m;
  }, [mods]);

  const byLocalName = useMemo(() => {
    const m = new Map<string, ModInfo>();
    for (const x of mods) if (x.source === 'local') m.set(x.id, x);
    return m;
  }, [mods]);

  function resolve(e: ModlistEntry): ModInfo | undefined {
    return e.type === 'workshop' ? byWorkshopId.get(e.id || '') : byLocalName.get(e.name || '');
  }

  const missingCount = useMemo(() => {
    if (!current) return 0;
    return current.entries.filter((e) => !resolve(e)).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, byWorkshopId, byLocalName]);

  /** 游戏当前生效的内容，按加载顺序解析成 mod 信息 */
  const appliedRows = useMemo(() => {
    if (!applied || !applied.available) return [];
    return applied.keys.map((k) => {
      const i = k.indexOf(':');
      const type = k.slice(0, i);
      const val = k.slice(i + 1);
      const entry: ModlistEntry =
        type === 'workshop' ? { type: 'workshop', id: val } : { type: 'local', name: val };
      return { key: k, entry, mod: resolve(entry) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied, byWorkshopId, byLocalName]);

  const entries = current?.entries || [];

  function mutate(fn: (list: ModlistEntry[]) => ModlistEntry[]) {
    if (!current) return;
    setCurrent({ ...current, entries: fn([...current.entries]) });
    setDirty(true);
  }

  function addMod(m: ModInfo) {
    if (!current) return;
    if (m.source === 'workshop') {
      if (current.entries.some((e) => e.type === 'workshop' && e.id === m.id)) return;
      mutate((l) => [...l, { type: 'workshop', name: m.name, id: m.id }]);
    } else {
      if (current.entries.some((e) => e.type === 'local' && e.name === m.id)) return;
      mutate((l) => [...l, { type: 'local', name: m.id }]);
    }
  }

  function removeAt(i: number) {
    mutate((l) => l.filter((_, idx) => idx !== i));
  }

  function moveEntry(from: number, to: number) {
    if (from === to) return;
    mutate((l) => {
      const copy = [...l];
      const [item] = copy.splice(from, 1);
      copy.splice(to, 0, item);
      return copy;
    });
  }

  async function scrollToTop() {
    void 0;
  }

  async function saveCurrent(): Promise<boolean> {
    if (!current) return false;
    const name = current.name.trim() || '未命名';
    const fileName = safeFileName(name);
    try {
      await api.saveModlist(fileName, name, current.entries);
      if (fileName !== current.fileName && selectedFile) {
        await api.deleteModlist(selectedFile);
      }
      setCurrent({ ...current, name, fileName });
      setSelectedFile(fileName);
      setDirty(false);
      await onRefresh();
      return true;
    } catch (e: any) {
      onToast('err', '保存合集失败', String(e?.message || e));
      return false;
    }
  }

  async function applyCurrent() {
    if (!current) return;
    const ok = await saveCurrent();
    if (!ok) return;
    try {
      const r = await api.applyModlist(current.name, current.entries);
      const missing: string[] = (r && r.missing) || [];
      if (missing.length) {
        const head = missing.slice(0, 3).join('、');
        onToast(
          'warn',
          `已应用，但有 ${missing.length} 个 mod 游戏还没安装`,
          `${head}${missing.length > 3 ? ' 等' : ''} —— 启动游戏后会自动安装，本次已照常写入`
        );
      } else {
        onToast(
          'ok',
          '已应用到游戏',
          r?.backup ? `原配置已备份为 ${r.backup}` : '下次启动游戏即生效'
        );
      }
    } catch (e: any) {
      onToast('err', '应用失败', String(e?.message || e));
    }
  }

  async function createList() {
    const name = newName.trim();
    if (!name) return;
    const fileName = safeFileName(name);
    try {
      await api.saveModlist(fileName, name, []);
      setCreating(false);
      setNewName('');
      await onRefresh();
      setSelectedFile(fileName);
    } catch (e: any) {
      onToast('err', '创建合集失败', String(e?.message || e));
    }
  }

  async function deleteList(fileName: string, name: string) {
    try {
      await api.deleteModlist(fileName);
      if (selectedFile === fileName) {
        setSelectedFile(null);
        setCurrent(null);
      }
      await onRefresh();
      onToast('ok', '已删除合集', name);
    } catch (e: any) {
      onToast('err', '删除失败', String(e?.message || e));
    }
  }

  const pickerMods = useMemo(() => {
    const q = pickerQ.trim().toLowerCase();
    const list = mods.filter((m) => {
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q) || m.categories.some((c) => c.includes(q))
      );
    });
    const added = new Set(
      entries.map((e) => (e.type === 'workshop' ? `w:${e.id}` : `l:${e.name}`))
    );
    return { list, added };
  }, [mods, pickerQ, entries]);

  return (
    <div className="collections">
      {/* 左：合集列表 */}
      <div className="list-panel">
        <div className="list-head">
          <IconLayers size={15} />
          <h3>全部合集</h3>
          <span className="spacer" />
          <button className="btn icon sm" title="新建合集" onClick={() => setCreating(true)}>
            <IconPlus size={14} />
          </button>
        </div>

        {creating && (
          <div style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
            <input
              className="input"
              style={{ height: 32, marginBottom: 8 }}
              placeholder="合集名称…"
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createList();
                if (e.key === 'Escape') setCreating(false);
              }}
            />
            <div className="btn-row">
              <button className="btn sm primary" onClick={createList}>
                创建
              </button>
              <button className="btn sm" onClick={() => setCreating(false)}>
                取消
              </button>
            </div>
          </div>
        )}

        <div className="list-scroll">
          {/* 游戏当前生效的内容：一个虚拟条目，不是磁盘上的合集文件 */}
          {applied && (
            <div
              className={`list-row applied-row ${selectedFile === APPLIED ? 'active' : ''}`}
              onClick={() => setSelectedFile(APPLIED)}
              title="读自 config_player.xml，即游戏现在真正加载的 mod"
            >
              <div className="list-row-name">
                <IconPlay size={13} />
                <span
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  游戏当前应用
                </span>
              </div>
              <div className="list-row-sub">
                {applied.available ? `${applied.keys.length} 个 mod` : '读不到配置'}
                {applied.available && applied.missing.length > 0 && (
                  <span className="badge st-different">{applied.missing.length} 个缺失</span>
                )}
              </div>
            </div>
          )}

          {modlists.length === 0 && (
            <div className="empty" style={{ padding: 24 }}>
              <div>还没有合集</div>
            </div>
          )}
          {modlists.map((l) => (
            <div
              key={l.fileName}
              className={`list-row ${selectedFile === l.fileName ? 'active' : ''}`}
              onClick={() => setSelectedFile(l.fileName)}
            >
              <div className="list-row-name">
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {l.name}
                </span>
                {dirty && selectedFile === l.fileName && (
                  <span className="dot" style={{ background: 'var(--warn)', flex: 'none' }} />
                )}
              </div>
              <div className="list-row-sub">
                {l.count} 个 mod
                {l.matchesApplied && <span className="badge applied">当前应用</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 右：编辑器 */}
      {selectedFile === APPLIED ? (
        <div className="editor">
          <div className="editor-head">
            <IconPlay size={15} />
            <h3 style={{ margin: 0, fontSize: 15 }}>游戏当前应用</h3>
            {applied?.available ? (
              <span className="badge ver">{appliedRows.length} 个 mod</span>
            ) : (
              <span className="badge st-different">读不到配置</span>
            )}
            {applied && applied.missing.length > 0 && (
              <span className="badge st-different" title={applied.missing.join('\n')}>
                <IconAlert size={11} /> {applied.missing.length} 个缺失
              </span>
            )}
            <span className="spacer" />
            <button className="btn sm" onClick={() => void onRefresh()}>
              <IconRefresh size={14} />
              刷新
            </button>
          </div>

          <div className="editor-body">
            {!applied?.available ? (
              <div className="empty" style={{ padding: 40 }}>
                <IconAlert size={28} />
                <div className="empty-title">读不到游戏当前配置</div>
                <div>{applied?.reason || '请到「设置」里确认 config_player.xml 的路径'}</div>
              </div>
            ) : appliedRows.length === 0 ? (
              <div className="empty" style={{ padding: 40 }}>
                <IconPlay size={28} />
                <div className="empty-title">游戏当前只加载了原版内容</div>
                <div>在任意合集里点「应用到游戏」，这里就会显示实际生效的 mod</div>
              </div>
            ) : (
              <>
                <div className="hint">
                  这是游戏现在真正加载的 mod，按加载顺序排列（读自 config_player.xml）。
                  这里是只读的，要改请回到对应合集里改完再应用。
                </div>
                <div className="mod-rows">
                  {appliedRows.map((r, i) => {
                    const hue = placeholderHue(r.entry.name || r.entry.id || '?');
                    const src = imgSrc(r.mod?.preview || null);
                    const cb = r.mod ? compareBadge(r.mod) : null;
                    return (
                      <div key={r.key} className="mod-row" style={{ cursor: 'default' }}>
                        <div className="row-index">{i + 1}</div>
                        <div className="row-thumb">
                          {src ? (
                            <img src={src} alt="" />
                          ) : (
                            <div
                              className="cover-ph"
                              style={{
                                background: `linear-gradient(140deg, hsl(${hue} 52% 34%), hsl(${(hue + 46) % 360} 58% 16%))`
                              }}
                            >
                              {initials(r.entry.name || r.entry.id || '?')}
                            </div>
                          )}
                        </div>
                        <div className="row-main">
                          <div className="row-name">
                            {r.mod?.name || r.entry.name || `#${r.entry.id}`}
                          </div>
                          <div className="row-sub">
                            <span
                              className={`badge ${r.entry.type === 'local' ? 'src-local' : 'src-workshop'}`}
                            >
                              {r.entry.type === 'local' ? '本地' : '工坊'}
                            </span>
                            {r.mod?.modVersion && (
                              <span className="badge ver">v{r.mod.modVersion}</span>
                            )}
                            {cb && <span className={`badge ${cb.cls}`}>{cb.text}</span>}
                            {!r.mod && <span className="badge st-different">未找到</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      ) : current ? (
        <div className="editor">
          <div className="editor-head">
            <input
              className="input"
              style={{ maxWidth: 300, fontWeight: 600 }}
              value={current.name}
              onChange={(e) => {
                setCurrent({ ...current, name: e.target.value });
                setDirty(true);
              }}
            />
            <span className="badge ver">{entries.length} 个 mod</span>
            {dirty && <span className="badge st-older">未保存</span>}
            {missingCount > 0 && (
              <span className="badge st-different" title="有 mod 在当前目录中找不到">
                <IconAlert size={11} /> {missingCount} 个缺失
              </span>
            )}
            <span className="spacer" />
            <button
              className="btn sm danger"
              onClick={() => deleteList(current.fileName, current.name)}
              title="删除该合集"
            >
              <IconTrash size={14} />
            </button>
            <button className="btn sm" onClick={saveCurrent} disabled={!dirty}>
              <IconSave size={14} />
              保存
            </button>
            <button className="btn primary" onClick={applyCurrent}>
              <IconPlay size={15} />
              应用到游戏
            </button>
          </div>

          <div className="editor-body">
            <div className="mod-rows" onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}>
              <div
                style={{
                  fontSize: 11.5,
                  color: 'var(--text-3)',
                  padding: '2px 4px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <IconGrip size={12} />
                拖拽调整顺序（顺序即加载顺序，越靠下越后加载）
              </div>
              {entries.length === 0 && (
                <div className="empty" style={{ padding: 30 }}>
                  <IconLayers size={28} />
                  <div className="empty-title">合集是空的</div>
                  <div>从右侧列表点击添加 mod</div>
                </div>
              )}
              {entries.map((e, i) => {
                const m = resolve(e);
                const hue = placeholderHue(e.name || e.id || '?');
                const src = imgSrc(m?.preview || null);
                const cb = m ? compareBadge(m) : null;
                return (
                  <div
                    key={`${e.type}-${e.id || e.name}-${i}`}
                    className={`mod-row ${dragIdx === i ? 'dragging' : ''} ${
                      overIdx === i && dragIdx !== null && dragIdx !== i ? 'drop-target' : ''
                    }`}
                    draggable
                    onDragStart={() => setDragIdx(i)}
                    onDragOver={(ev) => {
                      ev.preventDefault();
                      setOverIdx(i);
                    }}
                    onDrop={(ev) => {
                      ev.preventDefault();
                      if (dragIdx !== null) moveEntry(dragIdx, i);
                      setDragIdx(null);
                      setOverIdx(null);
                    }}
                  >
                    <div className="drag-handle">
                      <IconGrip size={15} />
                    </div>
                    <div className="row-index">{i + 1}</div>
                    <div className="row-thumb">
                      {src ? (
                        <img src={src} alt="" />
                      ) : (
                        <div
                          className="cover-ph"
                          style={{
                            background: `linear-gradient(140deg, hsl(${hue} 52% 34%), hsl(${(hue + 46) % 360} 58% 16%))`
                          }}
                        >
                          {initials(e.name || e.id || '?')}
                        </div>
                      )}
                    </div>
                    <div className="row-main">
                      <div className="row-name">{m?.name || e.name || `#${e.id}`}</div>
                      <div className="row-sub">
                        <span className={`badge ${e.type === 'local' ? 'src-local' : 'src-workshop'}`}>
                          {e.type === 'local' ? '本地' : '工坊'}
                        </span>
                        {m?.modVersion && <span className="badge ver">v{m.modVersion}</span>}
                        {cb && <span className={`badge ${cb.cls}`}>{cb.text}</span>}
                        {!m && <span className="badge st-different">未找到</span>}
                      </div>
                    </div>
                    <button
                      className="btn icon sm"
                      title="移除"
                      onClick={() => removeAt(i)}
                    >
                      <IconTrash size={14} />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* 右侧：可添加的 mod */}
            <div className="picker">
              <div className="picker-head">
                <div className="search" style={{ height: 32 }}>
                  <IconSearch size={14} />
                  <input
                    placeholder="搜索并添加到合集…"
                    value={pickerQ}
                    onChange={(e) => setPickerQ(e.target.value)}
                  />
                </div>
              </div>
              <div className="picker-scroll">
                {pickerMods.list.map((m) => {
                  const key = m.source === 'workshop' ? `w:${m.id}` : `l:${m.id}`;
                  const added = pickerMods.added.has(key);
                  return (
                    <div
                      key={`${m.source}:${m.id}`}
                      className={`pick-row ${added ? 'added' : ''}`}
                      onClick={() => !added && addMod(m)}
                      title={m.name}
                    >
                      <span
                        className={`badge ${m.source === 'local' ? 'src-local' : 'src-workshop'}`}
                        style={{ flex: 'none' }}
                      >
                        {m.source === 'local' ? '本地' : '工坊'}
                      </span>
                      <span className="pick-name">{m.name}</span>
                      {added ? <IconCheck size={14} /> : <IconPlus size={14} />}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="editor">
          <div className="empty">
            <IconLayers size={36} />
            <div className="empty-title">选择左侧的一个合集</div>
            <div>或点击 + 新建一个合集</div>
          </div>
        </div>
      )}
    </div>
  );
}
