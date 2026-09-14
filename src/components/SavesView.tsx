import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ModlistEntry, ModlistSummary, SaveInfo, SaveList } from '../types';
import { api } from '../api';
import { safeFileName } from '../ui';
import { IconAlert, IconClock, IconPlay, IconRefresh, IconSave } from './Icons';

/**
 * 存档页：看每个存档当时启用了哪些 mod，并找到能用来实现这个存档的合集。
 *
 * 关于「对应合集」的判定（重要）：
 *   存档里只有一串**内容包名字**（`selectedcontentpackagenames`），而且它**不记录纯客户端型
 *   内容包** —— LuaCs 这类框架、UI/QoL 类 mod 永远不会出现在存档里（实测：9 个存档全都用了
 *   Lua 类 mod，但 LuaCs 一次都没被记进去）。所以「完全一致」几乎不可能成立。
 *   真正有用的关系是「**完全覆盖**」：存档的 mod 全在这个合集里（合集另有若干个）。
 *   用这个合集去实现存档永远是安全的 —— 多出来的 mod 只会被一起加载，不会缺东西。
 */

function fmtTime(ms: number): string {
  if (!ms) return '时间未知';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 存档里记的 mod → 合集条目。存档只有名字，找不到的 mod 没法写进配置，只能跳过。 */
function entriesFromSave(s: SaveInfo): { entries: ModlistEntry[]; skipped: string[] } {
  const entries: ModlistEntry[] = [];
  const skipped: string[] = [];
  for (const m of s.mods) {
    if (!m.mod) {
      skipped.push(m.name);
      continue;
    }
    if (m.mod.source === 'workshop') entries.push({ type: 'workshop', name: m.mod.name, id: m.mod.id });
    else entries.push({ type: 'local', name: m.mod.id });
  }
  return { entries, skipped };
}

/** 新建合集时取一个没被占用的名字，别把已有的合集覆盖掉 */
function uniqueListName(base: string, existing: ModlistSummary[]): string {
  const taken = new Set(existing.map((l) => l.fileName));
  const root = (base || '存档').trim() || '存档';
  for (let i = 0; i < 50; i++) {
    const name = i === 0 ? root : i === 1 ? `${root}（存档）` : `${root}（存档 ${i}）`;
    if (!taken.has(safeFileName(name))) return name;
  }
  return `${root}（存档 ${Date.now()}）`;
}

export default function SavesView({
  modlists,
  onRefresh,
  onToast
}: {
  modlists: ModlistSummary[];
  onRefresh: () => Promise<void>;
  onToast: (kind: 'ok' | 'warn' | 'err' | 'info', title: string, msg?: string) => void;
}) {
  const [data, setData] = useState<SaveList | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const r = await api.listSaves();
        setData(r);
        setSelectedFile((cur) =>
          cur && r.saves.some((s) => s.file === cur) ? cur : r.saves[0]?.file || null
        );
      } catch (e: any) {
        onToast('err', '读存档失败', String(e?.message || e));
      } finally {
        setLoading(false);
      }
    },
    [onToast]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const current = useMemo(
    () => data?.saves.find((s) => s.file === selectedFile) || null,
    [data, selectedFile]
  );

  /** 应用一个已有的合集 */
  async function applyExisting(fileName: string, name: string) {
    setBusy(true);
    try {
      const l = await api.getModlist(fileName);
      if (!l) {
        onToast('err', '找不到这个合集', fileName);
        return;
      }
      const r = await api.applyModlist(l.name, l.entries);
      await onRefresh();
      const pruned = ((r && r.prunedBackups) || []).length;
      onToast(
        'ok',
        `已应用「${name}」`,
        `${
          r?.backupName ? `原配置已备份为 ${r.backupName}（每次应用覆盖同一个）` : '下次启动游戏即生效'
        }${pruned ? `，并清理了 ${pruned} 个旧备份` : ''}`
      );
    } catch (e: any) {
      onToast('err', '应用失败', String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  /** 按存档的 mod 列表建合集；alsoApply 时顺带应用到游戏 */
  async function saveAsList(s: SaveInfo, alsoApply: boolean) {
    const { entries, skipped } = entriesFromSave(s);
    if (!entries.length) {
      onToast('err', '没法建合集', '这个存档记录的 mod 现在一个都找不到');
      return;
    }
    const name = uniqueListName(s.name, modlists);
    const fileName = safeFileName(name);
    const skipNote = skipped.length
      ? `；${skipped.length} 个游戏里已经没有了，没法写入：${skipped.slice(0, 3).join('、')}${
          skipped.length > 3 ? ' 等' : ''
        }`
      : '';
    setBusy(true);
    try {
      await api.saveModlist(fileName, name, entries);
      if (alsoApply) {
        const r = await api.applyModlist(name, entries);
        await onRefresh();
        onToast(
          'ok',
          `已按存档启用（合集「${name}」）`,
          `${entries.length} 个 mod 已写入${
            r?.backupName ? `，原配置已备份为 ${r.backupName}` : ''
          }${skipNote}`
        );
      } else {
        await onRefresh();
        onToast('ok', `已存为新合集「${name}」`, `${entries.length} 个 mod${skipNote}`);
      }
      await load(true);
    } catch (e: any) {
      onToast('err', alsoApply ? '启用失败' : '新建合集失败', String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  const single = data?.saves.filter((s) => s.source === 'single') || [];
  const multi = data?.saves.filter((s) => s.source === 'multi') || [];

  function rowBody(s: SaveInfo) {
    return (
      <>
        <div className="list-row-name">
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {s.name}
          </span>
          <span className={`badge ${s.source === 'multi' ? 'src-workshop' : 'src-local'}`}>
            {s.source === 'multi' ? '多人' : '单机'}
          </span>
        </div>
        <div className="list-row-sub">
          {fmtTime(s.saveTime)} · {s.mods.length} 个 mod
          {s.match ? (
            <span className="badge applied">完全一致</span>
          ) : s.covers.length ? (
            <span className="badge st-same" title={s.covers[0].name}>
              「{s.covers[0].name}」覆盖
            </span>
          ) : (
            <span className="badge st-different">没有对应合集</span>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="collections">
      <div className="list-panel">
        <div className="list-head">
          <IconSave size={15} />
          <h3 style={{ margin: 0, fontSize: 15 }}>存档</h3>
          {data && <span className="badge ver">{data.saves.length}</span>}
          <span className="spacer" />
          <button className="btn sm" onClick={() => void load()} disabled={loading}>
            <IconRefresh size={14} />
            {loading ? '读取中…' : '刷新'}
          </button>
        </div>

        <div className="list-scroll">
          {data && data.saves.length === 0 && (
            <div className="empty" style={{ padding: 24 }}>
              <div>没找到存档</div>
            </div>
          )}

          {single.length > 0 && <div className="picker-head">单机存档</div>}
          {single.map((s) => (
            <div
              key={s.file}
              className={`list-row ${selectedFile === s.file ? 'active' : ''}`}
              onClick={() => setSelectedFile(s.file)}
            >
              {rowBody(s)}
            </div>
          ))}

          {multi.length > 0 && <div className="picker-head">多人存档</div>}
          {multi.map((s) => (
            <div
              key={s.file}
              className={`list-row ${selectedFile === s.file ? 'active' : ''}`}
              onClick={() => setSelectedFile(s.file)}
            >
              {rowBody(s)}
            </div>
          ))}
        </div>

        {data && (
          <div className="list-foot" title={data.saveDir}>
            <IconClock size={12} />
            <span
              style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {data.saveDir || '（读不到存档目录）'}
            </span>
          </div>
        )}
      </div>

      {current ? (
        <div className="editor">
          <div className="editor-head">
            <h3 style={{ margin: 0, fontSize: 15 }}>{current.name}</h3>
            <span className="badge ver">{current.mods.length} 个 mod</span>
            {current.gameVersion && <span className="badge">v{current.gameVersion}</span>}
            {current.missingCount > 0 && (
              <span className="badge st-different">
                <IconAlert size={11} /> {current.missingCount} 个游戏里没有
              </span>
            )}
            <span className="spacer" />
            {(current.match || current.covers.length > 0) && (
              <button
                className="btn primary"
                disabled={busy}
                onClick={() =>
                  void applyExisting(
                    (current.match || current.covers[0]).fileName,
                    (current.match || current.covers[0]).name
                  )
                }
                title="应用这个合集（它包含存档需要的全部 mod）"
              >
                <IconPlay size={15} />
                应用「{(current.match || current.covers[0]).name}」
              </button>
            )}
            <button className="btn" disabled={busy} onClick={() => void saveAsList(current, true)}>
              按存档启用
            </button>
            <button className="btn" disabled={busy} onClick={() => void saveAsList(current, false)}>
              存为新合集
            </button>
          </div>

          <div className="editor-body">
            <div className="saves-body">
            <div className="hint">
              存档时间 <b>{fmtTime(current.saveTime)}</b>
              {current.submarine ? (
                <>
                  {' '}
                  · 潜艇 <b>{current.submarine}</b>
                </>
              ) : null}
              {current.gameVersion ? (
                <>
                  {' '}
                  · 游戏版本 <b>{current.gameVersion}</b>
                </>
              ) : null}
              <br />
              {current.file}
            </div>

            {/* 对应合集 */}
            {current.match ? (
              <div className="hint" style={{ marginTop: 10 }}>
                ✅ 这个存档和合集「<b>{current.match.name}</b>」<b>完全一致</b> ——
                直接点右上角「应用」即可。
              </div>
            ) : current.covers.length > 0 ? (
              <div className="hint" style={{ marginTop: 10 }}>
                ◐ 合集「<b>{current.covers[0].name}</b>」<b>完全覆盖</b>了这个存档的{' '}
                {current.mods.length} 个 mod（它另有 {current.covers[0].extra.length} 个）：
                <div style={{ marginTop: 6 }}>
                  {current.covers[0].extra.map((x) => (
                    <span className="badge" key={x} style={{ marginRight: 4, marginBottom: 4 }}>
                      {x}
                    </span>
                  ))}
                </div>
                <div style={{ marginTop: 6 }}>
                  多出来的这些多半是 <b>LuaCs 这类框架 / UI / QoL mod</b> ——
                  <b>存档从不记录纯客户端型内容包</b>，所以它们不会出现在存档名单里。
                  用这个合集实现存档是最稳的：只多不少。
                </div>
                {current.covers.length > 1 && (
                  <div style={{ marginTop: 6 }}>
                    另外还有 {current.coversTotal - 1} 个合集也能覆盖它：
                    {current.covers.slice(1).map((c) => (
                      <button
                        key={c.fileName}
                        className="btn sm"
                        style={{ marginLeft: 6 }}
                        disabled={busy}
                        onClick={() => void applyExisting(c.fileName, c.name)}
                      >
                        {c.name}（另有 {c.extra.length} 个）
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="hint" style={{ marginTop: 10 }}>
                ✗ 没有任何合集能覆盖它的全部 mod ——
                {current.missingCount > 0
                  ? `其中 ${current.missingCount} 个 mod 游戏里已经没有了。`
                  : '用「存为新合集」把这套配置保存下来吧。'}
              </div>
            )}

            <div className="hint" style={{ marginTop: 10 }}>
              下面是存档记录的内容包（按加载顺序）。「按存档启用」只会写入这些 ——
              存档不记录 LuaCs 这类客户端 mod，需要的话请对照上面的覆盖合集补上。
            </div>

            <div className="mod-rows">
              {current.mods.map((m, i) => (
                <div key={`${m.name}-${i}`} className="mod-row" style={{ cursor: 'default' }}>
                  <div className="row-index">{i + 1}</div>
                  <div className="row-main">
                    <div className="row-name">{m.name}</div>
                    <div className="row-sub">
                      {m.mod ? (
                        <span
                          className={`badge ${m.mod.source === 'local' ? 'src-local' : 'src-workshop'}`}
                        >
                          {m.mod.source === 'local' ? '本地' : '工坊'}
                        </span>
                      ) : (
                        <span className="badge st-different">游戏里没有这个 mod</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="editor">
          <div className="empty">
            <IconSave size={28} />
            <div className="empty-title">
              {loading ? '正在读存档…' : data && data.saves.length ? '选择左侧的一个存档' : '没找到存档'}
            </div>
            <div>
              存档从 <b>config_player.xml 的 savepath</b> 指定的目录读取
              {data?.saveDir ? `（${data.saveDir}）` : ''}。
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
