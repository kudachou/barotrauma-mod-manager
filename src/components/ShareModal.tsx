import { useState } from 'react';
import type { ModlistEntry } from '../types';
import { api } from '../api';
import { t } from '../i18n';
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
        onToast('ok', t('modal.exported'), r.path);
      } else if (r && r.canceled) {
        /* 用户自己取消的，不提示 */
      }
    } catch (e: any) {
      onToast('err', t('modal.exportFailed'), String(e?.message || e));
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
      onToast('ok', t('modal.copiedToClipboard'), t('modal.copiedToClipboardMsg'));
    } catch (e: any) {
      onToast('err', t('modal.copyFailed'), String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function pickAndPreview() {
    setBusy(true);
    try {
      const p = await api.pickFile(t('modal.pickImportTitle'), [
        { name: t('modal.filterModlistFiles'), extensions: ['xml', 'json', 'txt'] },
        { name: t('modal.filterAllFiles'), extensions: ['*'] }
      ]);
      if (!p) return;
      const r = await api.previewImportModlist({ path: p });
      setPreview(r);
      setImportName(r.name || t('modal.defaultImportName'));
    } catch (e: any) {
      onToast('err', t('modal.cannotReadFile'), String(e?.message || e));
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
      setImportName(r.name || t('modal.defaultImportName'));
    } catch (e: any) {
      onToast('err', t('modal.unrecognizedContent'), String(e?.message || e));
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
        t('modal.importedList', { name: r.name }),
        `${t('modal.importedCount', { n: r.count })}${
          applyAfter ? t('modal.importedApplied') : ''
        }${
          preview.missingCount ? t('modal.importedMissing', { n: preview.missingCount }) : ''
        }`
      );
      await onDone(r.fileName);
      onClose();
    } catch (e: any) {
      onToast('err', t('modal.importFailed'), String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={busy ? undefined : onClose}>
      <div className="modal" style={{ width: 'min(760px, 100%)' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div style={{ flex: 1 }}>
            <div className="modal-title">{t('modal.shareTitle')}</div>
            <div className="page-sub" style={{ marginTop: 4 }}>
              {t('modal.shareSub1')}
              <code>.xml</code>
              {t('modal.shareSub2')}
            </div>
          </div>
          <button className="btn icon" onClick={onClose} disabled={busy} title={t('common.close')}>
            <IconClose size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div className="browse-sorts" style={{ marginBottom: 12 }}>
            <div className={`tag-toggle ${tab === 'export' ? 'on' : ''}`} onClick={() => setTab('export')}>
              {t('modal.tabExport')}
            </div>
            <div className={`tag-toggle ${tab === 'import' ? 'on' : ''}`} onClick={() => setTab('import')}>
              {t('modal.tabImport')}
            </div>
          </div>

          {tab === 'export' && (
            <>
              {listName ? (
                <>
                  <div className="bk-stats">
                    <div className="bk-stat">
                      <div className="bk-num">{entries?.length || 0}</div>
                      <div className="bk-label">{t('modal.statMods')}</div>
                    </div>
                    <div className="bk-stat">
                      <div className="bk-num">{wsCount}</div>
                      <div className="bk-label">{t('card.source.workshop')}</div>
                    </div>
                    <div className="bk-stat">
                      <div className="bk-num">{localCount}</div>
                      <div className="bk-label">{t('card.source.local')}</div>
                    </div>
                  </div>
                  <div className="section-title">
                    {t('modal.listNameQuoted', { name: listName })}
                  </div>

                  <div className="hint" style={{ marginTop: 0 }}>
                    {t('modal.exportFormatsIntro')}
                    <br />
                    · <b>.xml</b>
                    {t('modal.xmlFormat1')}
                    <b>{t('modal.xmlFormatBold')}</b>
                    {t('modal.xmlFormat2')}
                    <code>Barotrauma\ModLists\</code>
                    {t('modal.xmlFormat3')}
                    <br />
                    · <b>.json</b>
                    {t('modal.jsonFormat')}
                    <br />
                    · <b>{t('modal.textFormatBold')}</b>
                    {t('modal.textFormat')}
                  </div>

                  <div className="search" style={{ height: 34, marginTop: 12 }}>
                    <input
                      placeholder={t('modal.notePlaceholder')}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </div>

                  <div className="btn-row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
                    <button className="btn primary" disabled={busy} onClick={() => void doExport('xml')}>
                      <IconDownload size={14} />
                      {t('modal.exportXml')}
                    </button>
                    <button className="btn" disabled={busy} onClick={() => void doExport('json')}>
                      <IconDownload size={14} />
                      {t('modal.exportJson')}
                    </button>
                    <button className="btn" disabled={busy} onClick={() => void copyText()}>
                      <IconCopy size={14} />
                      {t('modal.copyAsText')}
                    </button>
                  </div>
                </>
              ) : (
                <div className="bk-dim">{t('modal.pickListFirst')}</div>
              )}
            </>
          )}

          {tab === 'import' && (
            <>
              {!preview ? (
                <>
                  <div className="hint" style={{ marginTop: 0 }}>
                    {t('modal.importHint1')}
                    <code>.xml</code> / <code>.json</code> / <code>.txt</code>
                    {t('modal.importHint2')}
                    <b>{t('modal.importHintBold')}</b>
                    {t('modal.importHint3')}
                  </div>
                  <div className="btn-row" style={{ marginTop: 10 }}>
                    <button className="btn primary" disabled={busy} onClick={() => void pickAndPreview()}>
                      <IconFolder size={14} />
                      {t('modal.chooseFile')}
                    </button>
                  </div>
                  <div className="section-title">{t('modal.orPaste')}</div>
                  <textarea
                    className="share-paste"
                    placeholder={t('modal.pastePlaceholder')}
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                  />
                  <div className="btn-row" style={{ marginTop: 8 }}>
                    <button className="btn" disabled={busy || !pasteText.trim()} onClick={() => void previewPasted()}>
                      {t('modal.parseText')}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="bk-stats">
                    <div className="bk-stat">
                      <div className="bk-num">{preview.count}</div>
                      <div className="bk-label">{t('modal.statMods')}</div>
                    </div>
                    <div className="bk-stat">
                      <div className="bk-num" style={{ color: preview.missingCount ? 'var(--warn)' : undefined }}>
                        {preview.missingCount}
                      </div>
                      <div className="bk-label">{t('modal.statMissing')}</div>
                    </div>
                    <div className="bk-stat">
                      <div className="bk-num">{preview.format}</div>
                      <div className="bk-label">{t('modal.statDetectedAs')}</div>
                    </div>
                  </div>

                  <div className="search" style={{ height: 34 }}>
                    <input
                      placeholder={t('modal.importNamePlaceholder')}
                      value={importName}
                      onChange={(e) => setImportName(e.target.value)}
                    />
                  </div>

                  {preview.missingCount > 0 && (
                    <>
                      <div className="section-title">{t('modal.missingTitle')}</div>
                      <div className="bk-list">
                        {preview.missing.map((e, i) => (
                          <div key={`${e.id || e.name}-${i}`} className="bk-row">
                            <span className="bk-name">{e.name || `#${e.id}`}</span>
                            {e.type === 'workshop' && e.id ? (
                              <>
                                <span className="bk-dim">{e.id}</span>
                                <button className="btn sm" onClick={() => openWorkshop(e.id as string)}>
                                  {t('modal.subscribe')}
                                </button>
                              </>
                            ) : (
                              <span className="bk-dim">{t('modal.localModNeedCopy')}</span>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="hint">{t('modal.afterSubscribeHint')}</div>
                    </>
                  )}

                  <label className="share-check">
                    <input
                      type="checkbox"
                      checked={applyAfter}
                      onChange={(e) => setApplyAfter(e.target.checked)}
                    />
                    {t('modal.applyAfterImport')}
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
                {t('modal.chooseAgain')}
              </button>
              <button className="btn primary" disabled={busy} onClick={() => void doImport()}>
                <IconCheck size={14} />
                {t('modal.importThisList')}
              </button>
            </>
          )}
          <span className="spacer" />
          <button className="btn" onClick={onClose} disabled={busy}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
