import { useState } from 'react';
import type { ModlistEntry } from '../types';
import { api } from '../api';
import { IconAlert, IconCheck, IconClose, IconCopy, IconDownload, IconFolder } from './Icons';

/**
 * 合集的导入 / 导出（联机时把整套配置发给朋友）。
 *
 * 导出三种形态：
 *  - `.xml`  游戏原生格式，朋友**不装本管理器**也能用（丢进 ModLists 文件夹）
 *  - `.json` 用本管理器的朋友导入时信息最全（未订阅的 mod 也带名字和链接）
 *  - 文本    贴聊天里，每个工坊 mod 一行带链接，点开就能订阅
 * 导入这三种都认（文件或直接粘贴）。
 */

type ImportPreview = {
  format: string;
  name: string;
  entries: ModlistEntry[];
  count: number;
  missingCount: number;
  missing: ModlistEntry[];
};

export default function ShareModal({
  mode,
  listName,
  entries,
  onClose,
  onDone,
  onToast,
  openWorkshop
}: {
  mode: 'export' | 'import';
  listName?: string;
  entries?: ModlistEntry[];
  onClose: () => void;
  onDone: (openFileName?: string) => Promise<void> | void;
  onToast: (kind: 'ok' | 'warn' | 'err' | 'info', title: string, msg?: string) => void;
  openWorkshop: (id: string) => void;
}) {
  const [tab, setTab] = useState<'export' | 'import'>(mode);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importName, setImportName] = useState('');
  const [applyAfter, setApplyAfter] = useState(false);

  const wsCount = (entries || []).filter((e) => e.type === 'workshop').length;
  const localCount = (entries || []).filter((e) => e.type === 'local').length;

  async function doExport(format: 'xml' | 'json' | 'text') {
    if (!entries || !listName) return;
    setBusy(true);
    try {
      const r = await api.exportModlistFile(listName, entries, format, note.trim() || undefined);
      if (r && r.ok) {
        onToast('ok', '已导出', r.path);
      } else if (r && r.canceled) {
        /* 用户自己取消的，不提示 */
      }
    } catch (e: any) {
      onToast('err', '导出失败', String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function copyText() {
    if (!entries || !listName) return;
    setBusy(true);
    try {
      const text = await api.exportModlistText(listName, entries, note.trim() || undefined);
      await navigator.clipboard.writeText(text);
      onToast('ok', '已复制到剪贴板', '直接贴到聊天里发给朋友就行');
    } catch (e: any) {
      onToast('err', '复制失败', String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function pickAndPreview() {
    setBusy(true);
    try {
      const p = await api.pickFile('选择要导入的合集（.xml / .json / .txt）', [
        { name: '合集文件', extensions: ['xml', 'json', 'txt'] },
        { name: '全部文件', extensions: ['*'] }
      ]);
      if (!p) return;
      const r = await api.previewImportModlist({ path: p });
      setPreview(r);
      setImportName(r.name || '导入的合集');
    } catch (e: any) {
      onToast('err', '读不了这个文件', String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function previewPasted() {
    if (!pasteText.trim()) return;
    setBusy(true);
    try {
      const r = await api.previewImportModlist({ text: pasteText });
      setPreview(r);
      setImportName(r.name || '导入的合集');
    } catch (e: any) {
      onToast('err', '认不出这段内容', String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function doImport() {
    if (!preview) return;
    setBusy(true);
    try {
      const r = await api.importModlist({
        entries: preview.entries,
        name: importName.trim() || preview.name,
        apply: applyAfter
      });
      onToast(
        'ok',
        `已导入「${r.name}」`,
        `${r.count} 个 mod${applyAfter ? '，并已应用到游戏' : ''}${
          preview.missingCount ? `；其中 ${preview.missingCount} 个本机还没有，去工坊订阅后点「同步到游戏」` : ''
        }`
      );
      await onDone(r.fileName);
      onClose();
    } catch (e: any) {
      onToast('err', '导入失败', String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={busy ? undefined : onClose}>
      <div className="modal" style={{ width: 'min(760px, 100%)' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div style={{ flex: 1 }}>
            <div className="modal-title">合集分享</div>
            <div className="page-sub" style={{ marginTop: 4 }}>
              联机时把整套 mod 配置发给朋友：导出的 <code>.xml</code> 连没装本管理器的人也能用。
            </div>
          </div>
          <button className="btn icon" onClick={onClose} disabled={busy} title="关闭">
            <IconClose size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div className="browse-sorts" style={{ marginBottom: 12 }}>
            <div className={`tag-toggle ${tab === 'export' ? 'on' : ''}`} onClick={() => setTab('export')}>
              导出合集
            </div>
            <div className={`tag-toggle ${tab === 'import' ? 'on' : ''}`} onClick={() => setTab('import')}>
              导入合集
            </div>
          </div>

          {tab === 'export' && (
            <>
              {listName ? (
                <>
                  <div className="bk-stats">
                    <div className="bk-stat">
                      <div className="bk-num">{entries?.length || 0}</div>
                      <div className="bk-label">个 mod</div>
                    </div>
                    <div className="bk-stat">
                      <div className="bk-num">{wsCount}</div>
                      <div className="bk-label">工坊</div>
                    </div>
                    <div className="bk-stat">
                      <div className="bk-num">{localCount}</div>
                      <div className="bk-label">本地</div>
                    </div>
                  </div>
                  <div className="section-title">「{listName}」</div>

                  <div className="hint" style={{ marginTop: 0 }}>
                    导出的三种形态：
                    <br />· <b>.xml</b> —— 游戏原生格式，<b>朋友不用装本管理器</b>，丢进
                    <code>Barotrauma\ModLists\</code> 就能在游戏里选它
                    <br />· <b>.json</b> —— 用本管理器的朋友导入时信息最全（连未订阅的 mod 也带名字和链接）
                    <br />· <b>文本</b> —— 贴聊天里，每个工坊 mod 一行带链接，点开就能订阅
                  </div>

                  <div className="search" style={{ height: 34, marginTop: 12 }}>
                    <input
                      placeholder="附一句话给朋友（可选，会写进导出内容里）…"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </div>

                  <div className="btn-row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
                    <button className="btn primary" disabled={busy} onClick={() => void doExport('xml')}>
                      <IconDownload size={14} />
                      导出 .xml（推荐）
                    </button>
                    <button className="btn" disabled={busy} onClick={() => void doExport('json')}>
                      <IconDownload size={14} />
                      导出 .json
                    </button>
                    <button className="btn" disabled={busy} onClick={() => void copyText()}>
                      <IconCopy size={14} />
                      复制成文本
                    </button>
                  </div>
                </>
              ) : (
                <div className="bk-dim">先在左边选一个合集，再导出。</div>
              )}
            </>
          )}

          {tab === 'import' && (
            <>
              {!preview ? (
                <>
                  <div className="hint" style={{ marginTop: 0 }}>
                    可以选文件（<code>.xml</code> / <code>.json</code> / <code>.txt</code>），
                    也可以直接把朋友发的文字<b>粘在下面</b> —— 哪怕只是一串工坊 id 也能认出来。
                  </div>
                  <div className="btn-row" style={{ marginTop: 10 }}>
                    <button className="btn primary" disabled={busy} onClick={() => void pickAndPreview()}>
                      <IconFolder size={14} />
                      选择文件…
                    </button>
                  </div>
                  <div className="section-title">或者粘贴内容</div>
                  <textarea
                    className="share-paste"
                    placeholder="把朋友发来的合集文字贴在这里…"
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                  />
                  <div className="btn-row" style={{ marginTop: 8 }}>
                    <button className="btn" disabled={busy || !pasteText.trim()} onClick={() => void previewPasted()}>
                      解析这段文字
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="bk-stats">
                    <div className="bk-stat">
                      <div className="bk-num">{preview.count}</div>
                      <div className="bk-label">个 mod</div>
                    </div>
                    <div className="bk-stat">
                      <div className="bk-num" style={{ color: preview.missingCount ? 'var(--warn)' : undefined }}>
                        {preview.missingCount}
                      </div>
                      <div className="bk-label">本机还没有</div>
                    </div>
                    <div className="bk-stat">
                      <div className="bk-num">{preview.format}</div>
                      <div className="bk-label">识别为</div>
                    </div>
                  </div>

                  <div className="search" style={{ height: 34 }}>
                    <input
                      placeholder="导入后的合集名"
                      value={importName}
                      onChange={(e) => setImportName(e.target.value)}
                    />
                  </div>

                  {preview.missingCount > 0 && (
                    <>
                      <div className="section-title">本机还没有的（点右边去工坊订阅）</div>
                      <div className="bk-list">
                        {preview.missing.map((e, i) => (
                          <div key={`${e.id || e.name}-${i}`} className="bk-row">
                            <span className="bk-name">{e.name || `#${e.id}`}</span>
                            {e.type === 'workshop' && e.id ? (
                              <>
                                <span className="bk-dim">{e.id}</span>
                                <button className="btn sm" onClick={() => openWorkshop(e.id as string)}>
                                  去订阅
                                </button>
                              </>
                            ) : (
                              <span className="bk-dim">本地 mod（要对方拷给你）</span>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="hint">
                        订阅 / 拷贝之后，回到「合集」页点顶栏的「同步到游戏」把它们装进游戏。
                      </div>
                    </>
                  )}

                  <label className="share-check">
                    <input
                      type="checkbox"
                      checked={applyAfter}
                      onChange={(e) => setApplyAfter(e.target.checked)}
                    />
                    导入后立刻应用到游戏（会覆盖当前启用列表）
                  </label>
                </>
              )}
            </>
          )}
        </div>

        <div className="modal-foot">
          {tab === 'import' && preview && (
            <>
              <button className="btn" disabled={busy} onClick={() => setPreview(null)}>
                重新选
              </button>
              <button className="btn primary" disabled={busy} onClick={() => void doImport()}>
                <IconCheck size={14} />
                导入这个合集
              </button>
            </>
          )}
          <span className="spacer" />
          <button className="btn" onClick={onClose} disabled={busy}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
