import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ModlistEntry, ModlistSummary, SaveInfo, SaveList } from '../types';
import { api } from '../api';
import { safeFileName } from '../ui';
import { t } from '../i18n';
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
  if (!ms) return t('saves.timeUnknown');
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
  const fallback = t('saves.defaultListName');
  const root = (base || fallback).trim() || fallback;
  for (let i = 0; i < 50; i++) {
    const name =
      i === 0
        ? root
        : i === 1
          ? t('saves.listNameDup', { root })
          : t('saves.listNameDupN', { root, n: i });
    if (!taken.has(safeFileName(name))) return name;
  }
  return t('saves.listNameDupN', { root, n: Date.now() });
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
        onToast('err', t('saves.loadFailed'), String(e?.message || e));
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
        onToast('err', t('saves.listNotFound'), fileName);
        return;
      }
      const r = await api.applyModlist(l.name, l.entries);
      await onRefresh();
      const pruned = ((r && r.prunedBackups) || []).length;
      onToast(
        'ok',
        t('saves.applied', { name }),
        `${
          r?.backupName
            ? t('saves.backupNote', { file: r.backupName })
            : t('saves.effectiveNextLaunch')
        }${pruned ? t('saves.prunedBackups', { n: pruned }) : ''}`
      );
    } catch (e: any) {
      onToast('err', t('saves.applyFailed'), String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  /** 按存档的 mod 列表建合集；alsoApply 时顺带应用到游戏 */
  async function saveAsList(s: SaveInfo, alsoApply: boolean) {
    const { entries, skipped } = entriesFromSave(s);
    if (!entries.length) {
      onToast('err', t('saves.cannotCreateList'), t('saves.noModsForList'));
      return;
    }
    const name = uniqueListName(s.name, modlists);
    const fileName = safeFileName(name);
    const skipNote = skipped.length
      ? `${t('saves.skipNote', {
          n: skipped.length,
          names: skipped.slice(0, 3).join(t('common.listSeparator'))
        })}${skipped.length > 3 ? t('saves.skipNoteMore') : ''}`
      : '';
    setBusy(true);
    try {
      await api.saveModlist(fileName, name, entries);
      if (alsoApply) {
        const r = await api.applyModlist(name, entries);
        await onRefresh();
        onToast(
          'ok',
          t('saves.enabledFromSave', { name }),
          `${t('saves.writtenMods', { n: entries.length })}${
            r?.backupName ? t('saves.backupNoteShort', { file: r.backupName }) : ''
          }${skipNote}`
        );
      } else {
        await onRefresh();
        onToast(
          'ok',
          t('saves.savedAsList', { name }),
          `${t('saves.modCount', { n: entries.length })}${skipNote}`
        );
      }
      await load(true);
    } catch (e: any) {
      onToast(
        'err',
        alsoApply ? t('saves.enableFailed') : t('saves.createListFailed'),
        String(e?.message || e)
      );
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
            {s.source === 'multi' ? t('saves.multiplayer') : t('saves.singleplayer')}
          </span>
        </div>
        <div className="list-row-sub">
          {fmtTime(s.saveTime)} · {t('saves.modCount', { n: s.mods.length })}
          {s.match ? (
            <span className="badge applied">{t('saves.exactMatch')}</span>
          ) : s.covers.length ? (
            <span className="badge st-same" title={s.covers[0].name}>
              {t('saves.coversBadge', { name: s.covers[0].name })}
            </span>
          ) : (
            <span className="badge st-different">{t('saves.noCollection')}</span>
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
          <h3 style={{ margin: 0, fontSize: 15 }}>{t('saves.title')}</h3>
          {data && <span className="badge ver">{data.saves.length}</span>}
          <span className="spacer" />
          <button className="btn sm" onClick={() => void load()} disabled={loading}>
            <IconRefresh size={14} />
            {loading ? t('saves.reading') : t('common.refresh')}
          </button>
        </div>

        <div className="list-scroll">
          {data && data.saves.length === 0 && (
            <div className="empty" style={{ padding: 24 }}>
              <div>{t('saves.noneFound')}</div>
            </div>
          )}

          {single.length > 0 && <div className="picker-head">{t('saves.singleSaves')}</div>}
          {single.map((s) => (
            <div
              key={s.file}
              className={`list-row ${selectedFile === s.file ? 'active' : ''}`}
              onClick={() => setSelectedFile(s.file)}
            >
              {rowBody(s)}
            </div>
          ))}

          {multi.length > 0 && <div className="picker-head">{t('saves.multiSaves')}</div>}
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
              {data.saveDir || t('saves.dirUnavailable')}
            </span>
          </div>
        )}
      </div>

      {current ? (
        <div className="editor">
          <div className="editor-head">
            <h3 style={{ margin: 0, fontSize: 15 }}>{current.name}</h3>
            <span className="badge ver">{t('saves.modCount', { n: current.mods.length })}</span>
            {current.gameVersion && <span className="badge">v{current.gameVersion}</span>}
            {current.missingCount > 0 && (
              <span className="badge st-different">
                <IconAlert size={11} /> {t('saves.missingInGame', { n: current.missingCount })}
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
                title={t('saves.applyCollectionTip')}
              >
                <IconPlay size={15} />
                {t('saves.applyCollection', { name: (current.match || current.covers[0]).name })}
              </button>
            )}
            <button className="btn" disabled={busy} onClick={() => void saveAsList(current, true)}>
              {t('saves.enableFromSave')}
            </button>
            <button className="btn" disabled={busy} onClick={() => void saveAsList(current, false)}>
              {t('saves.saveAsCollection')}
            </button>
          </div>

          <div className="editor-body">
            <div className="saves-body">
            <div className="hint">
              {t('saves.saveTimeLabel')}<b>{fmtTime(current.saveTime)}</b>
              {current.submarine ? (
                <>
                  {' '}
                  · {t('saves.submarineLabel')} <b>{current.submarine}</b>
                </>
              ) : null}
              {current.gameVersion ? (
                <>
                  {' '}
                  · {t('saves.gameVersionLabel')} <b>{current.gameVersion}</b>
                </>
              ) : null}
              <br />
              {current.file}
            </div>

            {/* 对应合集 */}
            {current.match ? (
              <div className="hint" style={{ marginTop: 10 }}>
                {t('saves.exactMatchPre')}
                <b>{current.match.name}</b>
                {t('saves.exactMatchMid')}
                <b>{t('saves.exactMatchBold')}</b>
                {t('saves.exactMatchPost')}
              </div>
            ) : current.covers.length > 0 ? (
              <div className="hint" style={{ marginTop: 10 }}>
                {t('saves.coversPre')}
                <b>{current.covers[0].name}</b>
                {t('saves.coversMid')}
                <b>{t('saves.coversBold')}</b>
                {t('saves.coversAfterBold')}
                {' '}
                {t('saves.coversModCount', {
                  n: current.mods.length,
                  extra: current.covers[0].extra.length
                })}
                <div style={{ marginTop: 6 }}>
                  {current.covers[0].extra.map((x) => (
                    <span className="badge" key={x} style={{ marginRight: 4, marginBottom: 4 }}>
                      {x}
                    </span>
                  ))}
                </div>
                <div style={{ marginTop: 6 }}>
                  {t('saves.extraHintPre')}
                  <b>{t('saves.extraHintBold')}</b>
                  {t('saves.extraHintMid')}
                  <b>{t('saves.extraHintBold2')}</b>
                  {t('saves.extraHintPost')}
                </div>
                {current.covers.length > 1 && (
                  <div style={{ marginTop: 6 }}>
                    {t('saves.otherCovers', { n: current.coversTotal - 1 })}
                    {current.covers.slice(1).map((c) => (
                      <button
                        key={c.fileName}
                        className="btn sm"
                        style={{ marginLeft: 6 }}
                        disabled={busy}
                        onClick={() => void applyExisting(c.fileName, c.name)}
                      >
                        {t('saves.listExtraCount', { name: c.name, n: c.extra.length })}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="hint" style={{ marginTop: 10 }}>
                {t('saves.noCoverPre')}
                {current.missingCount > 0
                  ? t('saves.someModsMissing', { n: current.missingCount })
                  : t('saves.saveAsCollectionHint')}
              </div>
            )}

            <div className="hint" style={{ marginTop: 10 }}>
              {t('saves.modListHint')}
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
                          {m.mod.source === 'local'
                            ? t('library.source.local')
                            : t('library.source.workshop')}
                        </span>
                      ) : (
                        <span className="badge st-different">{t('saves.modMissingInGame')}</span>
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
              {loading
                ? t('saves.loadingSaves')
                : data && data.saves.length
                  ? t('saves.selectSave')
                  : t('saves.noneFound')}
            </div>
            <div>
              {t('saves.readFromPre')}
              <b>{t('saves.readFromBold')}</b>
              {t('saves.readFromPost')}
              {data?.saveDir ? t('saves.dirInParens', { dir: data.saveDir }) : ''}
              {t('saves.sentenceEnd')}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
