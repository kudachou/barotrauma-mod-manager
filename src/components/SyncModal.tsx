import { useEffect, useRef, useState } from 'react';
import type { InstallSyncPlan, InstallSyncProgress, InstallSyncResult } from '../types';
import { api } from '../api';
import { t } from '../i18n';
import { translateMainMessage } from '../i18n/mainMessages';
import { IconAlert, IconCheck, IconClose, IconDownload } from './Icons';
import { humanSize } from './BackupModal';

/**
 * 「同步到游戏」弹窗：把 Steam 已经下载好、但游戏还没装的工坊更新装进 Installed。
 *
 * 为什么需要它：游戏只在你**自己在 mod 列表里按更新键**时才装新版本，实测能拖 4 天。
 * 而且那个按键会先让 Steam 把整包重下一遍（实测 59 MB / 15 秒）—— 管理器直接复制能省掉这一步。
 */
export default function SyncModal({
  onClose,
  onDone,
  onToast
}: {
  onClose: () => void;
  onDone: () => Promise<void>;
  onToast: (kind: 'ok' | 'warn' | 'err' | 'info', title: string, msg?: string) => void;
}) {
  const [phase, setPhase] = useState<'planning' | 'ready' | 'running' | 'done'>('planning');
  const [plan, setPlan] = useState<InstallSyncPlan | null>(null);
  const [progress, setProgress] = useState<InstallSyncProgress | null>(null);
  const [result, setResult] = useState<InstallSyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    void (async () => {
      try {
        const p = await api.planInstallSync();
        if (!alive.current) return;
        setPlan(p);
        setPhase('ready');
      } catch (e: any) {
        if (!alive.current) return;
        setError(String(e?.message || e));
        setPhase('done');
      }
    })();
    const off = api.onInstallSyncProgress?.((p: InstallSyncProgress) => {
      if (alive.current) setProgress(p);
    });
    return () => {
      alive.current = false;
      if (typeof off === 'function') off();
    };
  }, []);

  async function start() {
    setPhase('running');
    setProgress({ phase: 'syncing', done: 0, total: plan?.count || 0, current: null });
    try {
      const r = await api.startInstallSync();
      if (!alive.current) return;
      setResult(r);
      setPhase('done');
      await onDone();
      const bad = (r && r.failed) || [];
      if (bad.length) {
        onToast('warn', t('modal.syncPartial', { n: bad.length }), bad[0].error);
      } else {
        onToast(
          'ok',
          t('modal.syncedToGame'),
          t('modal.syncedToGameMsg', { n: (r && r.synced.length) || 0 })
        );
      }
    } catch (e: any) {
      if (!alive.current) return;
      setError(String(e?.message || e));
      setPhase('done');
      onToast('err', t('modal.syncFailed'), String(e?.message || e));
    }
  }

  const percent =
    progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="overlay" onClick={phase === 'running' ? undefined : onClose}>
      <div
        className="modal"
        style={{ width: 'min(700px, 100%)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div style={{ flex: 1 }}>
            <div className="modal-title">{t('top.syncToGame')}</div>
            <div className="page-sub" style={{ marginTop: 4 }}>
              {t('modal.syncBody1')}
              <b>{t('modal.syncBodyBold')}</b>
              {t('modal.syncBody2')}
              <code>WorkshopMods\Installed</code>
              {t('modal.sentenceEnd')}
            </div>
          </div>
          <button
            className="btn icon"
            onClick={onClose}
            disabled={phase === 'running'}
            title={t('common.close')}
          >
            <IconClose size={16} />
          </button>
        </div>

        <div className="modal-body">
          {phase === 'planning' && (
            <div className="bk-center">
              <div className="bk-spinner" />
              <div>{t('modal.comparingVersions')}</div>
            </div>
          )}

          {phase === 'ready' && plan && plan.count === 0 && (
            <div className="bk-center">
              <IconCheck size={22} />
              <div>{t('modal.upToDate')}</div>
              <div className="bk-dim">
                {t('modal.basis1')}
                <code>filelist.xml</code>
                {t('modal.basis2')}
                <code>installtime</code>
                {t('modal.basis3')}
              </div>
            </div>
          )}

          {phase === 'ready' && plan && plan.skippedDelisted.length > 0 && (
            <div className="hint" style={{ marginTop: plan.count > 0 ? 14 : 0, marginBottom: 0 }}>
              {t('modal.skippedDelistedPre')}
              <b>{t('modal.skippedDelistedCount', { n: plan.skippedDelisted.length })}</b>
              {t('modal.skippedDelistedBold')}
              {t('modal.skippedDelistedTail')}
              {plan.skippedDelisted.map((x) => (
                <span className="badge" key={x.id} style={{ marginLeft: 4 }}>
                  {x.name}
                </span>
              ))}
              <div style={{ marginTop: 6 }}>
                {t('modal.notSyncedHereBold')}
                {t('modal.notSyncedHere1')}
                <code>LocalMods</code>
                {t('modal.notSyncedHere2')}
              </div>
            </div>
          )}

          {phase === 'ready' && plan && plan.count > 0 && (
            <>
              <div className="bk-stats">
                <div className="bk-stat">
                  <div className="bk-num">{plan.count}</div>
                  <div className="bk-label">{t('modal.statPendingSync')}</div>
                </div>
                <div className="bk-stat">
                  <div className="bk-num">{humanSize(plan.totalBytes)}</div>
                  <div className="bk-label">{t('modal.statCopySize')}</div>
                </div>
                <div className="bk-stat">
                  <div className="bk-num">{plan.totalFiles}</div>
                  <div className="bk-label">{t('modal.statFiles')}</div>
                </div>
              </div>

              <div className="section-title">{t('modal.pendingMods')}</div>
              <div className="bk-list">
                {plan.items.map((it) => (
                  <div key={it.id} className="bk-row">
                    <span className="bk-name">{it.name}</span>
                    <span className="bk-dim">
                      {it.reason === 'not-installed'
                        ? t('modal.notInstalledYet', { version: it.steamVersion || '?' })
                        : t('modal.versionTransition', {
                            from: it.installedVersion || '?',
                            to: it.steamVersion || '?'
                          })}
                    </span>
                    <span className="bk-dim">{humanSize(it.bytes)}</span>
                  </div>
                ))}
              </div>

              <div className="hint" style={{ marginTop: 14, marginBottom: 0 }}>
                {t('modal.syncHint1')}
                <b>{t('modal.syncHintBold1')}</b>
                {t('modal.syncHint2')}
                <b>{t('modal.syncHintBold2')}</b>
                {t('modal.syncHint3')}
                <code>installtime</code>
                {t('modal.syncHint4')}
              </div>
              <div className="warn-bar" style={{ marginTop: 10, marginBottom: 0 }}>
                <IconAlert size={16} />
                <div>
                  {t('modal.closeGameFirst1')}
                  <code>dll</code>
                  {t('modal.closeGameFirst2')}
                </div>
              </div>
            </>
          )}

          {phase === 'running' && (
            <>
              <div className="bk-progress-head">
                <span>{percent}%</span>
                <span className="bk-dim">
                  {t('modal.progressCount', {
                    done: progress?.done || 0,
                    total: progress?.total || 0
                  })}
                </span>
              </div>
              <div className="ub-progress" style={{ height: 8 }}>
                <div style={{ width: `${percent}%` }} />
              </div>
              <div className="bk-dim" style={{ marginTop: 12 }}>
                {t('modal.copying', { name: progress?.current || '…' })}
              </div>
            </>
          )}

          {phase === 'done' && (
            <>
              {error ? (
                <div className="warn-bar" style={{ marginBottom: 0 }}>
                  <IconAlert size={16} />
                  <div>{t('modal.syncFailedDetail', { error: translateMainMessage(error) })}</div>
                </div>
              ) : result ? (
                <>
                  <div className="bk-stats">
                    <div className="bk-stat">
                      <div className="bk-num">
                        <IconCheck size={18} /> {result.synced.length}
                      </div>
                      <div className="bk-label">{t('modal.statSynced')}</div>
                    </div>
                    <div className="bk-stat">
                      <div className="bk-num">{humanSize(result.bytes)}</div>
                      <div className="bk-label">{t('modal.statWritten')}</div>
                    </div>
                    <div className="bk-stat">
                      <div className="bk-num">{result.failed.length}</div>
                      <div className="bk-label">{t('modal.statFailed')}</div>
                    </div>
                  </div>

                  {result.failed.length > 0 && (
                    <>
                      <div className="section-title">{t('modal.failedOnes')}</div>
                      <div className="bk-list">
                        {result.failed.map((f) => (
                          <div key={f.id} className="bk-row">
                            <span className="bk-name">{f.name}</span>
                            <span className="bk-dim">{f.error}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  <div className="hint" style={{ marginTop: 16, marginBottom: 0 }}>
                    {result.failed.length === 0
                      ? t('modal.syncDoneOk')
                      : t('modal.syncDoneFailed')}
                  </div>
                </>
              ) : null}
            </>
          )}
        </div>

        <div className="modal-foot">
          {phase === 'ready' && plan && plan.count > 0 && (
            <button className="btn primary" onClick={start}>
              <IconDownload size={15} />
              {t('modal.startSync', { n: plan.count })}
            </button>
          )}
          {phase === 'running' && (
            <button className="btn" onClick={() => void api.cancelInstallSync()}>
              {t('modal.abort')}
            </button>
          )}
          <button className="btn" onClick={onClose} disabled={phase === 'running'}>
            {phase === 'done' || (phase === 'ready' && plan && plan.count === 0)
              ? t('common.close')
              : t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
