import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { AppliedInfo, ModInfo, ModlistEntry, ModlistFull, ModlistSummary } from '../types';
import { api, imgSrc, placeholderHue } from '../api';
import { compareBadge, initials, safeFileName, uniq } from '../ui';
import { categoryStyle } from '../categories';
import { getLang, t } from '../i18n';
import { categoryLabel } from '../i18n/categories';
import {
  IconAlert,
  IconCheck,
  IconDownload,
  IconExternal,
  IconGrip,
  IconLayers,
  IconPlus,
  IconPlay,
  IconRefresh,
  IconSave,
  IconSearch,
  IconTrash,
  IconUndo,
  IconViewCard,
  IconViewList
} from './Icons';
import ShareModal from './ShareModal';

/** 合集列表里的一个虚拟条目：游戏当前生效的内容 */
const APPLIED = '__applied__';

/**
 * 「游戏当前应用」这块的两种看法：紧凑列表（一屏看很多）与 大卡片（看得清封面）。
 * 记在 localStorage 里，不用每次进来重选；读不到就按列表（和以前一致）。
 */
const APPLIED_VIEW_KEY = 'bmm.collections.appliedView';

function readAppliedView(): 'list' | 'card' {
  try {
    return window.localStorage.getItem(APPLIED_VIEW_KEY) === 'card' ? 'card' : 'list';
  } catch {
    return 'list';
  }
}

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
  /** 只看未订阅（本机没有的） */
  const [onlyMissing, setOnlyMissing] = useState(false);
  /** 合集分享弹窗：null = 关闭 */
  const [shareMode, setShareMode] = useState<'export' | 'import' | null>(null);
  /** 「游戏当前应用」用列表还是大卡片看（记住选择） */
  const [appliedView, setAppliedView] = useState<'list' | 'card'>(readAppliedView);

  function changeAppliedView(v: 'list' | 'card') {
    setAppliedView(v);
    try {
      window.localStorage.setItem(APPLIED_VIEW_KEY, v);
    } catch {
      /* 存不了就只是这次会话生效，不影响使用 */
    }
  }

  /** 打开某个工坊条目的页面去订阅（优先 Steam 客户端，失败退回网页版） */
  async function openWorkshopPage(id: string) {
    try {
      const r = await api.openWorkshopInSteam(id);
      if (r && r.ok) {
        onToast('info', t('collections.openedInSteam'), t('collections.openedInSteamHint'));
        return;
      }
      throw new Error((r && r.error) || '打不开 Steam');
    } catch {
      try {
        await api.getWorkshopPage(id);
        onToast('info', t('collections.openedInBrowser'), t('collections.openedInBrowserHint'));
      } catch (e2: any) {
        onToast('err', t('collections.openWorkshopFailed'), String(e2?.message || e2));
      }
    }
  }

  // 自动选中第一个合集
  useEffect(() => {
    if (!selectedFile && modlists.length) setSelectedFile(modlists[0].fileName);
  }, [modlists, selectedFile]);

  // 有未保存改动时不覆盖编辑器内容
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  /** 编辑器里这份内容是从哪个文件读出来的：「同一个合集被刷新」要留住改动，「切到别的合集」要还原 */
  const loadedFileRef = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    const switched = loadedFileRef.current !== selectedFile;

    /*
     * 切换合集时，如果当前这份还有没保存的改动，直接还原再切走。
     *
     * 以前的做法是「有改动就不加载新的」，结果左边选中已经跳过去了、右边还停在旧合集上，
     * 看着像点了没反应，而且那个状态没有出口。留着一个假的当前选中比丢掉改动更糟，
     * 所以按用户的要求：切走就把这份没保存的改动还原掉，并明确提示一句。
     */
    if (switched && dirtyRef.current) {
      dirtyRef.current = false;
      onToast('info', t('collections.discardTitle'), t('collections.discardBody'));
    }

    if (!selectedFile || selectedFile === APPLIED) {
      loadedFileRef.current = selectedFile;
      setCurrent(null);
      setDirty(false);
      return;
    }

    // 同一个合集因为刷新（重新扫描 / 保存后）又跑到这里：有改动就留着，别覆盖
    if (!switched && dirtyRef.current) return;

    loadedFileRef.current = selectedFile;
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
    // onToast / t 都是稳定的用法，不该进依赖：进来会让「刚切过去」被反复触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFile, reloadToken]);

  /** 还原：丢掉没保存的改动，重新读一遍磁盘上那份 */
  async function revertCurrent() {
    if (!selectedFile || selectedFile === APPLIED) return;
    try {
      const l = await api.getModlist(selectedFile);
      setCurrent(l ? { ...l, entries: [...l.entries] } : null);
      setDirty(false);
      onToast('ok', t('collections.revertedTitle'), t('collections.revertedBody'));
    } catch (e: any) {
      onToast('err', t('collections.revertFailed'), String(e?.message || e));
    }
  }

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

  /*
   * ---------------------------- 拖拽排序 ----------------------------
   *
   * 这里刻意**不用** HTML5 那套 draggable / ondragstart / ondrop。
   * 浏览器一旦进入原生拖拽会话，滚轮事件就不再送到页面了 —— 于是拖到列表下半截时
   * 想看看更下面的 mod，只能先松手、滚一下、再重新拖一遍。用户反馈的就是这个。
   *
   * 换成 pointerdown / pointermove 自己算落点之后就没有原生拖拽会话：
   * 滚动还是交给浏览器（滚轮滚 .mod-rows 就行），我们每帧按最新的滚动位置重算落点。
   * 另外补了贴近上下边缘时的自动滚动，跨好几屏拖的时候也不用来回松手。
   */
  const dragListRef = useRef<HTMLDivElement | null>(null);
  const dragInfo = useRef<{
    idx: number;
    over: number | null;
    active: boolean;
    x0: number;
    y0: number;
    x: number;
    y: number;
    pointerId: number;
    /** 上一帧「滚动位置 + 指针 Y」，两个都没变就不用重新量行高 */
    key: string;
  } | null>(null);
  const dragRaf = useRef<number | null>(null);
  const dragDetach = useRef<(() => void) | null>(null);
  /** 跟着指针走的那个"手里拿着什么"的小标签（原生拖拽本来有半透明幽灵图，自己实现就得补一个） */
  const dragGhost = useRef<HTMLDivElement | null>(null);
  /** 指针监听器是拖拽开始时注册的，闭包里的 entries 会一直是旧的 —— 走 ref 拿最新的那个 */
  const dragMove = useRef(moveEntry);
  dragMove.current = moveEntry;

  /** 指针现在是第几条（落在行与行的间隙里时取纵向最近的一行） */
  function rowIndexAt(y: number): number | null {
    const list = dragListRef.current;
    if (!list) return null;
    let best: number | null = null;
    let bestDist = Infinity;
    for (const row of Array.from(list.querySelectorAll<HTMLElement>('.mod-row[data-idx]'))) {
      const r = row.getBoundingClientRect();
      if (y >= r.top && y <= r.bottom) return Number(row.dataset.idx);
      const d = Math.abs(y - (r.top + r.bottom) / 2);
      if (d < bestDist) {
        bestDist = d;
        best = Number(row.dataset.idx);
      }
    }
    return best;
  }

  /** 重算高亮落点（只有真的换了行才 setState，免得拖动时整列表跟着重渲染） */
  function syncDropTarget() {
    const info = dragInfo.current;
    if (!info) return;
    const over = rowIndexAt(info.y);
    if (over !== info.over) {
      info.over = over;
      setOverIdx(over);
    }
  }

  /** 拖拽期间的逐帧任务：贴边自动滚动 + 滚动之后重算落点 */
  function dragTick() {
    const info = dragInfo.current;
    const list = dragListRef.current;
    if (!info || !info.active || !list) {
      dragRaf.current = null;
      return;
    }
    const r = list.getBoundingClientRect();
    const EDGE = 48;
    const MAX = 15;
    let dy = 0;
    if (info.y < r.top + EDGE) dy = -MAX * Math.min(1, (r.top + EDGE - info.y) / EDGE);
    else if (info.y > r.bottom - EDGE) dy = MAX * Math.min(1, (info.y - r.bottom + EDGE) / EDGE);
    if (dy !== 0) {
      const before = list.scrollTop;
      list.scrollTop = before + dy;
      if (list.scrollTop !== before) info.key = '';
    }
    const key = `${Math.round(list.scrollTop)}:${Math.round(info.y)}`;
    if (key !== info.key) {
      info.key = key;
      syncDropTarget();
    }
    // 幽灵标签跟着指针走：直接改 style，别走 state（每帧都 setState 会把整个列表重渲染一遍）
    const ghost = dragGhost.current;
    if (ghost) ghost.style.transform = `translate3d(${info.x + 14}px, ${info.y + 10}px, 0)`;
    dragRaf.current = requestAnimationFrame(dragTick);
  }

  function endDrag(apply: boolean) {
    const info = dragInfo.current;
    if (dragRaf.current !== null) {
      cancelAnimationFrame(dragRaf.current);
      dragRaf.current = null;
    }
    dragDetach.current?.();
    dragDetach.current = null;
    dragInfo.current = null;
    setDragIdx(null);
    setOverIdx(null);
    // 松手时浏览器自己会释放指针捕获，但「按 Esc 取消」的时候鼠标还按着 ——
    // 不主动释放的话，捕获会一直挂在列表上，接下来点行里的按钮也会被吞掉
    try {
      dragListRef.current?.releasePointerCapture(info?.pointerId ?? -1);
    } catch {
      /* 本来就没捕获成功（合成事件）就算了 */
    }
    if (info && apply && info.active) {
      // 落点按松手这一瞬间的几何位置现算：滚轮可能刚滚完、上一帧还没量
      const to = rowIndexAt(info.y);
      if (to !== null && to !== info.idx) dragMove.current(info.idx, to);
    }
  }

  function beginDrag(i: number, ev: ReactPointerEvent<HTMLDivElement>) {
    if (ev.button !== 0) return;
    // 行里的按钮（订阅 / 删除）照常响应，别把点击吃掉
    if ((ev.target as HTMLElement | null)?.closest('button')) return;
    // 不拦默认行为的话，拖一下就把整行文字选中一片
    ev.preventDefault();
    try {
      dragListRef.current?.setPointerCapture(ev.pointerId);
    } catch {
      /* 合成事件没有真实 pointerId，捕获失败也不影响下面的 window 监听 */
    }
    dragInfo.current = {
      idx: i,
      over: null,
      active: false,
      x0: ev.clientX,
      y0: ev.clientY,
      x: ev.clientX,
      y: ev.clientY,
      pointerId: ev.pointerId,
      key: ''
    };

    const onMove = (e: PointerEvent) => {
      const info = dragInfo.current;
      if (!info) return;
      info.x = e.clientX;
      info.y = e.clientY;
      if (!info.active) {
        // 移动超过 4px 才算拖拽，免得手抖把单击变成拖拽
        if (Math.abs(e.clientX - info.x0) < 4 && Math.abs(e.clientY - info.y0) < 4) return;
        info.active = true;
        setDragIdx(info.idx);
        dragRaf.current = requestAnimationFrame(dragTick);
      }
      info.key = '';
    };
    const onUp = () => endDrag(true);
    const onCancel = () => endDrag(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') endDrag(false);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);
    dragDetach.current = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey);
    };
  }

  // 拖到一半切走页面（组件卸载）时，别把监听器和 rAF 留在那儿
  useEffect(
    () => () => {
      if (dragRaf.current !== null) cancelAnimationFrame(dragRaf.current);
      dragRaf.current = null;
      dragDetach.current?.();
      dragDetach.current = null;
      dragInfo.current = null;
    },
    []
  );

  async function scrollToTop() {
    void 0;
  }

  /**
   * 保存当前合集。
   * @param skipRefresh 「应用到游戏」时用：那一步最后会自己刷新一次，
   *   这里就别刷了 —— 一是白扫一遍磁盘，二是那次刷新发生在写 config 之前，
   *   刷出来的还是旧的应用状态。
   */
  async function saveCurrent(skipRefresh = false): Promise<boolean> {
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
      if (!skipRefresh) await onRefresh();
      return true;
    } catch (e: any) {
      onToast('err', t('collections.saveFailed'), String(e?.message || e));
      return false;
    }
  }

  async function applyCurrent() {
    if (!current) return;
    const ok = await saveCurrent(true);
    if (!ok) return;
    try {
      const r = await api.applyModlist(current.name, current.entries);
      // 关键：应用之后必须重新扫描一遍。
      // saveCurrent() 里的那次刷新发生在写 config 之前，所以「游戏当前应用」列表和卡片上的
      // 「当前应用」标记还停留在旧状态 —— 看起来像没应用成功，会让人再点一次。
      await onRefresh();

      const missing: string[] = (r && r.missing) || [];
      const pruned: string[] = (r && r.prunedBackups) || [];
      const pruneNote = pruned.length ? t('collections.pruneNote', { n: pruned.length }) : '';
      if (missing.length) {
        const head = missing.slice(0, 3).join(t('common.listSeparator'));
        onToast(
          'warn',
          t('collections.applyMissingTitle', { n: missing.length }),
          t('collections.applyMissingBody', {
            head,
            etc: missing.length > 3 ? t('collections.etc') : '',
            prune: pruneNote
          })
        );
      } else if (r && r.changed === false) {
        onToast(
          'ok',
          t('collections.appliedTitle'),
          t('collections.appliedUnchanged', { prune: pruneNote })
        );
      } else {
        onToast(
          'ok',
          t('collections.appliedTitle'),
          r?.backupName
            ? t('collections.appliedBackup', { name: r.backupName, prune: pruneNote })
            : t('collections.appliedNextLaunch')
        );
      }
    } catch (e: any) {
      onToast('err', t('collections.applyFailed'), String(e?.message || e));
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
      onToast('err', t('collections.createFailed'), String(e?.message || e));
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
      onToast('ok', t('collections.deleted'), name);
    } catch (e: any) {
      onToast('err', t('collections.deleteFailed'), String(e?.message || e));
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
          <h3>{t('collections.allTitle')}</h3>
          <span className="spacer" />
          <button className="btn icon sm" title={t('collections.newTip')} onClick={() => setCreating(true)}>
            <IconPlus size={14} />
          </button>
          <button
            className="btn icon sm"
            title={t('collections.importTip')}
            onClick={() => setShareMode('import')}
          >
            <IconDownload size={14} />
          </button>
        </div>

        {creating && (
          <div style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
            <input
              className="input"
              style={{ height: 32, marginBottom: 8 }}
              placeholder={t('collections.namePlaceholder')}
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
                {t('collections.create')}
              </button>
              <button className="btn sm" onClick={() => setCreating(false)}>
                {t('common.cancel')}
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
              title={t('collections.appliedRowTip')}
            >
              <div className="list-row-name">
                <IconPlay size={13} />
                <span
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {t('collections.appliedPageTitle')}
                </span>
              </div>
              <div className="list-row-sub">
                {applied.available
                  ? t('collections.modCount', { n: applied.keys.length })
                  : t('collections.configUnreadable')}
                {applied.available && applied.missing.length > 0 && (
                  <span className="badge st-different">
                    {t('collections.missingCount', { n: applied.missing.length })}
                  </span>
                )}
              </div>
            </div>
          )}

          {modlists.length === 0 && (
            <div className="empty" style={{ padding: 24 }}>
              <div>{t('collections.noCollections')}</div>
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
                {t('collections.modCount', { n: l.count })}
                {l.matchesApplied && <span className="badge applied">{t('collections.appliedBadge')}</span>}
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
            <h3 style={{ margin: 0, fontSize: 15 }}>{t('collections.appliedPageTitle')}</h3>
            {applied?.available ? (
              <span className="badge ver">{t('collections.modCount', { n: appliedRows.length })}</span>
            ) : (
              <span className="badge st-different">{t('collections.configUnreadable')}</span>
            )}
            {applied && applied.missing.length > 0 && (
              <span className="badge st-different" title={applied.missing.join('\n')}>
                <IconAlert size={11} /> {t('collections.missingCount', { n: applied.missing.length })}
              </span>
            )}
            <span className="spacer" />
            {/* 列表看条数、卡片看封面 —— 只影响这里的显示方式 */}
            <div className="seg" title={t('collections.viewToggleTip')}>
              <button
                className={appliedView === 'list' ? 'active' : ''}
                onClick={() => changeAppliedView('list')}
                aria-pressed={appliedView === 'list'}
              >
                <IconViewList size={14} />
                {t('collections.viewList')}
              </button>
              <button
                className={appliedView === 'card' ? 'active' : ''}
                onClick={() => changeAppliedView('card')}
                aria-pressed={appliedView === 'card'}
              >
                <IconViewCard size={14} />
                {t('collections.viewCard')}
              </button>
            </div>
            <button className="btn sm" onClick={() => void onRefresh()}>
              <IconRefresh size={14} />
              {t('common.refresh')}
            </button>
          </div>

          <div className="editor-body">
            {!applied?.available ? (
              <div className="empty" style={{ padding: 40 }}>
                <IconAlert size={28} />
                <div className="empty-title">{t('collections.appliedUnavailableTitle')}</div>
                <div>{applied?.reason || t('collections.appliedPathHint')}</div>
              </div>
            ) : appliedRows.length === 0 ? (
              <div className="empty" style={{ padding: 40 }}>
                <IconPlay size={28} />
                <div className="empty-title">{t('collections.appliedVanillaTitle')}</div>
                <div>{t('collections.appliedVanillaHint')}</div>
              </div>
            ) : (
              /* 只读视图：说明固定在顶部，下面按选择渲染列表或大卡片（占满整行、自己滚动） */
              <div className="applied-body">
                <div className="hint">{t('collections.appliedHint')}</div>
                {appliedView === 'card' ? (
                  /* 卡片：每张一条（左边缩略图 + 右边名字/版本），顺序用缩略图角标表示 */
                  <div className="mod-cards">
                    {appliedRows.map((r, i) => {
                      const hue = placeholderHue(r.entry.name || r.entry.id || '?');
                      const src = imgSrc(r.mod?.preview || null);
                      const cb = r.mod ? compareBadge(r.mod) : null;
                      const name = r.mod?.name || r.entry.name || `#${r.entry.id}`;
                      return (
                        <div key={r.key} className="mod-tile" title={name}>
                          <div className="tile-thumb">
                            {src ? (
                              <img src={src} alt="" loading="lazy" />
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
                            <div className="tile-order">{i + 1}</div>
                          </div>
                          <div className="tile-main">
                            <div className="tile-name">{name}</div>
                            <div className="tile-sub">
                              <span
                                className={`badge ${r.entry.type === 'local' ? 'src-local' : 'src-workshop'}`}
                              >
                                {r.entry.type === 'local' ? t('card.source.local') : t('card.source.workshop')}
                              </span>
                              {r.mod?.modVersion ? (
                                <span className="badge ver">v{r.mod.modVersion}</span>
                              ) : (
                                <span className="badge st-different">{t('collections.versionUnknown')}</span>
                              )}
                              {cb && (
                                <span className={`badge ${cb.cls}`}>
                                  {cb.cls === 'st-same' ? (
                                    <IconCheck size={11} />
                                  ) : cb.cls === 'st-none' ? null : (
                                    <IconAlert size={11} />
                                  )}
                                  {t(cb.key)}
                                </span>
                              )}
                              {!r.mod && <span className="badge st-different">{t('collections.notFound')}</span>}
                            </div>
                            {/* 分类标签：和 Mod 库一致，方便一眼看出这是什么类型的 mod */}
                            <div className="tile-meta">
                              {/* ⚠️ 循环变量不能叫 t —— 会遮蔽 i18n 的 t()（CollectionsView 踩过一回） */}
                              {uniq([...(r.mod?.categories || []), ...(r.mod?.autoCategories || [])])
                                .slice(0, 3)
                                .map((tag) => (
                                  <span key={tag} className="tag" style={categoryStyle(tag)}>
                                    {categoryLabel(tag, getLang())}
                                  </span>
                                ))}
                              {r.entry.type === 'workshop' && (
                                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                                  #{r.entry.id}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                <div className="mod-rows">
                  {appliedRows.map((r, i) => {
                    const hue = placeholderHue(r.entry.name || r.entry.id || '?');
                    const src = imgSrc(r.mod?.preview || null);
                    const cb = r.mod ? compareBadge(r.mod) : null;
                    const tags = uniq([...(r.mod?.categories || []), ...(r.mod?.autoCategories || [])]).slice(
                      0,
                      3
                    );
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
                              {r.entry.type === 'local' ? t('card.source.local') : t('card.source.workshop')}
                            </span>
                            {r.mod?.modVersion && (
                              <span className="badge ver">v{r.mod.modVersion}</span>
                            )}
                            {cb && <span className={`badge ${cb.cls}`}>{t(cb.key)}</span>}
                            {!r.mod && <span className="badge st-different">{t('collections.notFound')}</span>}
                          </div>
                          {/* 列表模式也带分类标签，不用切到大卡片才看得见 */}
                          {r.mod && (
                            <div className="row-tags">
                              {/* ⚠️ 循环变量不能叫 t —— 会遮蔽 i18n 的 t() */}
                              {tags.map((tag) => (
                                <span key={tag} className="tag" style={categoryStyle(tag)}>
                                  {categoryLabel(tag, getLang())}
                                </span>
                              ))}
                              {tags.length === 0 && (
                                <span className="badge st-none">{t('common.uncategorized')}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                )}
              </div>
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
            <span className="badge ver">{t('collections.modCount', { n: entries.length })}</span>
            {dirty && <span className="badge st-older">{t('collections.unsaved')}</span>}
            {missingCount > 0 && (
              <span className="badge st-different" title={t('collections.missingTip')}>
                <IconAlert size={11} /> {t('collections.missingCount', { n: missingCount })}
              </span>
            )}
            <span className="spacer" />
            <button
              className="btn sm"
              onClick={() => setShareMode('export')}
              title={t('collections.exportTip')}
            >
              <IconExternal size={14} />
              {t('collections.exportBtn')}
            </button>
            <button
              className="btn sm danger"
              onClick={() => deleteList(current.fileName, current.name)}
              title={t('collections.deleteTip')}
            >
              <IconTrash size={14} />
            </button>
            <button
              className="btn sm"
              onClick={() => void revertCurrent()}
              disabled={!dirty}
              title={t('collections.revertTip')}
            >
              <IconUndo size={14} />
              {t('collections.revertBtn')}
            </button>
            <button className="btn sm" onClick={() => void saveCurrent()} disabled={!dirty}>
              <IconSave size={14} />
              {t('common.save')}
            </button>
            <button className="btn primary" onClick={applyCurrent}>
              <IconPlay size={15} />
              {t('collections.applyBtn')}
            </button>
          </div>

          <div className="editor-body">
            <div
              ref={dragListRef}
              className={`mod-rows editable ${dragIdx !== null ? 'drag-lock' : ''}`}
              onWheel={() => {
                // 滚轮是浏览器自己滚的：此刻 scrollTop 还是旧值，让下一帧重新量一次落点
                if (dragInfo.current) dragInfo.current.key = '';
              }}
            >
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
                {t('collections.dragHint')}
                <span className="spacer" />
                {missingCount > 0 && (
                  <div
                    className={`tag-toggle ${onlyMissing ? 'on' : ''}`}
                    onClick={() => setOnlyMissing((v) => !v)}
                    title={t('collections.onlyMissingTip')}
                  >
                    {t('collections.onlyMissing', { n: missingCount })}
                  </div>
                )}
              </div>
              {entries.length === 0 && (
                <div className="empty" style={{ padding: 30 }}>
                  <IconLayers size={28} />
                  <div className="empty-title">{t('collections.emptyTitle')}</div>
                  <div>{t('collections.emptyHint')}</div>
                </div>
              )}
              {missingCount > 0 && (
                <div className="hint" style={{ marginBottom: 8 }}>
                  {t('collections.missingHintA', { n: missingCount })}
                  <b>{t('collections.subscribe')}</b>
                  {t('collections.missingHintB')}
                </div>
              )}
              {entries
                .map((e, i) => ({ e, i }))
                .filter(({ e }) => !onlyMissing || !resolve(e))
                .map(({ e, i }) => {
                const m = resolve(e);
                const hue = placeholderHue(e.name || e.id || '?');
                const src = imgSrc(m?.preview || null);
                const cb = m ? compareBadge(m) : null;
                // 分类标签：和 Mod 库/大卡片一致，一眼看出这条是什么类型的 mod
                const tags = uniq([...(m?.categories || []), ...(m?.autoCategories || [])]).slice(0, 3);
                return (
                  <div
                    key={`${e.type}-${e.id || e.name}-${i}`}
                    data-idx={i}
                    className={`mod-row ${dragIdx === i ? 'dragging' : ''} ${
                      overIdx === i && dragIdx !== null && dragIdx !== i ? 'drop-target' : ''
                    }`}
                    onPointerDown={(ev) => beginDrag(i, ev)}
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
                          {e.type === 'local' ? t('card.source.local') : t('card.source.workshop')}
                        </span>
                        {m?.modVersion && <span className="badge ver">v{m.modVersion}</span>}
                        {cb && <span className={`badge ${cb.cls}`}>{t(cb.key)}</span>}
                        {!m && <span className="badge st-different">{t('collections.notFound')}</span>}
                      </div>
                      {/* 分类标签：整理合集时要一眼看出每条是什么类型 */}
                      {m && (
                        <div className="row-tags">
                          {/* ⚠️ 循环变量不能叫 t —— 会遮蔽 i18n 的 t() */}
                          {tags.map((tag) => (
                            <span key={tag} className="tag" style={categoryStyle(tag)}>
                              {categoryLabel(tag, getLang())}
                            </span>
                          ))}
                          {tags.length === 0 && (
                            <span className="badge st-none">{t('common.uncategorized')}</span>
                          )}
                        </div>
                      )}
                    </div>
                    {!m && e.type === 'workshop' && e.id && (
                      <button
                        className="btn sm"
                        title={t('collections.subscribeTip')}
                        onClick={() => openWorkshopPage(e.id as string)}
                      >
                        {t('collections.subscribe')}
                      </button>
                    )}
                    <button
                      className="btn icon sm"
                      title={t('collections.removeTip')}
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
                    placeholder={t('collections.pickerPlaceholder')}
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
                        {m.source === 'local' ? t('card.source.local') : t('card.source.workshop')}
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
            <div className="empty-title">{t('collections.selectTitle')}</div>
            <div>{t('collections.selectHint')}</div>
          </div>
        </div>
      )}

      {/*
        拖拽时跟着指针的小标签：原生 HTML5 拖拽自带一张半透明的幽灵图，
        改成自己实现之后得补上，不然拖的过程中列表一滚，就不知道手里拿的是哪条了。
      */}
      {dragIdx !== null && entries[dragIdx] && (
        <div
          className="drag-ghost"
          ref={(el) => {
            dragGhost.current = el;
            const info = dragInfo.current;
            if (el && info) el.style.transform = `translate3d(${info.x + 14}px, ${info.y + 10}px, 0)`;
          }}
        >
          <IconGrip size={12} />
          {resolve(entries[dragIdx])?.name ||
            entries[dragIdx].name ||
            `#${entries[dragIdx].id}`}
        </div>
      )}

      {shareMode && (
        <ShareModal
          mode={shareMode}
          listName={current?.name}
          entries={current?.entries}
          onClose={() => setShareMode(null)}
          onDone={async (openFileName) => {
            await onRefresh();
            if (openFileName) setSelectedFile(openFileName);
          }}
          onToast={onToast}
          openWorkshop={(id) => void openWorkshopPage(id)}
        />
      )}
    </div>
  );
}
