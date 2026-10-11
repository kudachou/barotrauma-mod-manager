import { useEffect, useState } from 'react';
import type { BackupPlan, BackupProgress, BackupResult } from '../types';
import { api } from '../api';
import { t } from '../i18n';
import { translateMainMessage } from '../i18n/mainMessages';
import { IconAlert, IconCheck, IconClose, IconDownload } from './Icons';

export function humanSize(bytes: number): string {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

type Phase = 'planning' | 'ready' | 'running' | 'done';

export default function BackupModal({
  scope = 'all',
  onClose,
  onToast,
  onDone
}: {
  /** 'delisted' = 只备份已被作者下架的 mod */
  scope?: 'all' | 'delisted';
  onClose: () => void;
  onToast: (kind: 'ok' | 'warn' | 'err' | 'info', title: string, msg?: string) => void;
  onDone: () => void;
}) {
  const onlyDelisted = scope === 'delisted';
  const [plan, setPlan] = useState<BackupPlan | null>(null);
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [phase, setPhase] = useState<Phase>('planning');
  const [result, setResult] = useState<BackupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const off = api.onBackupProgress?.((p: BackupProgress) => setProgress(p));
    void (async () => {
      try {
        const p = await api.planWorkshopBackup(scope);
        setPlan(p);
        setPhase('ready');
      } catch (e: any) {
        setError(String(e?.message || e));
        setPhase('done');
      }
    })();
    // 返回退订：scope 变化或弹窗关闭时把上一个监听摘掉（不能返回上面那个 async 的返回值）
    return () => {
      off?.();
    };
  }, [scope]);

  async function start() {
    setPhase('running');
    setProgress({
      phase: 'copying',
      done: 0,
      total: plan?.items.length || 0,
      bytesDone: 0,
      bytesTotal: plan?.totalBytes || 0
    });
    try {
      const r = await api.startWorkshopBackup(scope);
      setResult(r);
    } catch (e: any) {
      setError(String(e?.message || e));
    }
    setPhase('done');
    onDone();
  }

  async function cancel() {
    try {
      await api.cancelWorkshopBackup();
      onToast('warn', t('modal.cancelRequested'), t('modal.cancelRequestedMsg'));
    } catch {
      /* 忽略 */
    }
  }

  const percent =
    progress && progress.bytesTotal
      ? Math.min(100, Math.round(((progress.bytesDone || 0) / progress.bytesTotal) * 100))
      : progress && progress.total
        ? Math.min(100, Math.round((progress.done / progress.total) * 100))
        : 0;

  return (
    <div className="overlay" onClick={phase === 'running' ? undefined : onClose}>
      <div className="modal" style={{ width: 'min(680px, 100%)' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div style={{ flex: 1 }}>
            <div className="modal-title">
              {onlyDelisted
                ? t('modal.backupDelistedTitle')
                : t('modal.backupAllTitle')}
            </div>
            <div className="page-sub" style={{ marginTop: 4 }}>
              {onlyDelisted ? (
                <>
                  {t('modal.backupDelistedBody1')}
                  <b>{t('modal.backupDelistedBodyBold')}</b>
                  {t('modal.backupDelistedBody2')}
                  <code>LocalMods</code>
                  {t('modal.backupDelistedBody3')}
                </>
              ) : (
                <>
                  {t('modal.backupAllBody1')}
                  <code>LocalMods</code>
                  {t('modal.backupAllBody2')}
                </>
              )}
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
              <div>
                {t('modal.planningSizes')}
                {progress && progress.total
                  ? t('modal.planningProgress', { done: progress.done, total: progress.total })
                  : ''}
              </div>
              {progress?.current && <div className="bk-dim">{progress.current}</div>}
            </div>
          )}

          {phase === 'ready' && plan && (
            <>
              <div className="bk-stats">
                <div className="bk-stat">
                  <div className="bk-num">{plan.items.length}</div>
                  <div className="bk-label">
                    {onlyDelisted ? t('modal.statPendingBackup') : t('modal.statWorkshopMods')}
                  </div>
                </div>
                <div className="bk-stat">
                  <div className="bk-num">{humanSize(plan.totalBytes)}</div>
                  <div className="bk-label">{t('modal.statEstimatedSize')}</div>
                </div>
                <div className="bk-stat">
                  <div className="bk-num">{plan.newCount}</div>
                  <div className="bk-label">{t('modal.statNew')}</div>
                </div>
                <div className="bk-stat">
                  <div className="bk-num">{plan.updateCount}</div>
                  <div className="bk-label">{t('modal.statUpdates')}</div>
                </div>
              </div>

              {onlyDelisted && (
                <div className="hint" style={{ marginTop: 14, marginBottom: 0 }}>
                  {t('modal.delistedSkipHint1')}
                  <code>LocalMods</code>
                  {t('modal.delistedSkipHint2')}
                </div>
              )}

              <div className="warn-bar" style={{ marginTop: 16 }}>
                <IconAlert size={16} />
                <div>
                  {t('modal.backupWarn1')}
                  <code>LocalMods</code>
                  {t('modal.backupWarn2')}
                  <b>{t('modal.backupWarnBold', { size: humanSize(plan.totalBytes) })}</b>
                  {t('modal.sentenceEnd')}
                  {plan.updateCount > 0 && (
                    <>
                      {' '}
                      {t('modal.backupUpdateNote', { n: plan.updateCount })}
                    </>
                  )}
                </div>
              </div>

              {plan.items.some((i) => i.installedOnly && !i.existing) && (
                <div className="danger-bar" style={{ marginTop: 12 }}>
                  <IconAlert size={16} />
                  <div>
                    {t('modal.onlyInstalledWarn1')}
                    <b>
                      {t('modal.onlyInstalledWarnCount', {
                        n: plan.items.filter((i) => i.installedOnly && !i.existing).length
                      })}
                    </b>
                    {t('modal.onlyInstalledWarn2')}
                    <code>Installed</code>
                    {t('modal.onlyInstalledWarn3')}
                  </div>
                </div>
              )}

              {plan.items.some((i) => i.delisted) && !onlyDelisted && (
                <div className="hint" style={{ marginTop: 12, marginBottom: 0 }}>
                  {t('modal.delistedInPlanPre')}
                  {t('modal.delistedInPlanCount', {
                    n: plan.items.filter((i) => i.delisted).length
                  })}
                  <b>{t('modal.delistedInPlanBold')}</b>
                  {t('modal.delistedInPlanTail')}
                </div>
              )}

              {plan.skipped.length > 0 && (
                <>
                  <div className="section-title">
                    {t('modal.skippedTitle', { n: plan.skipped.length })}
                  </div>
                  <div className="bk-list">
                    {plan.skipped.slice(0, 6).map((s) => (
                      <div key={s.id} className="bk-row">
                        <span className="bk-name">{s.name}</span>
                        <span className="bk-dim">{s.reason}</span>
                      </div>
                    ))}
                    {plan.skipped.length > 6 && (
                      <div className="bk-dim">
                        {t('modal.moreItems', { n: plan.skipped.length - 6 })}
                      </div>
                    )}
                  </div>
                </>
              )}
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
                  })}{' '}
                  · {humanSize(progress?.bytesDone || 0)} / {humanSize(progress?.bytesTotal || 0)}
                </span>
              </div>
              <div className="ub-progress" style={{ height: 8 }}>
                <div style={{ width: `${percent}%` }} />
              </div>
              <div className="bk-dim" style={{ marginTop: 12 }}>
                {t('modal.copying', { name: progress?.current || '…' })}
              </div>
              {!!progress?.snapshotted && (
                <div className="bk-dim" style={{ marginTop: 4 }}>
                  {t('modal.snapshottedCount', { n: progress.snapshotted })}
                </div>
              )}
            </>
          )}

          {phase === 'done' && (
            <>
              {error ? (
                <div className="warn-bar" style={{ marginBottom: 0 }}>
                  <IconAlert size={16} />
                  <div>{t('modal.backupFailed', { error: translateMainMessage(error) })}</div>
                </div>
              ) : result ? (
                <>
                  <div className="bk-stats">
                    <div className="bk-stat">
                      <div className="bk-num">
                        <IconCheck size={18} /> {result.done}
                      </div>
                      <div className="bk-label">{t('modal.statBackedUp')}</div>
                    </div>
                    <div className="bk-stat">
                      <div className="bk-num">{humanSize(result.bytesDone)}</div>
                      <div className="bk-label">{t('modal.statActuallyWritten')}</div>
                    </div>
                    <div className="bk-stat">
                      <div className="bk-num">{result.snapshotted}</div>
                      <div className="bk-label">{t('modal.statSnapshotted')}</div>
                    </div>
                    <div className="bk-stat">
                      <div className="bk-num">{result.errors.length}</div>
                      <div className="bk-label">{t('modal.statFailed')}</div>
                    </div>
                  </div>

                  {result.errors.length > 0 && (
                    <>
                      <div className="section-title">{t('modal.failedMods')}</div>
                      <div className="bk-list">
                        {result.errors.slice(0, 8).map((e) => (
                          <div key={e.id} className="bk-row">
                            <span className="bk-name">{e.name}</span>
                            <span className="bk-dim">{e.message}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  <div className="hint" style={{ marginTop: 16, marginBottom: 0 }}>
                    {result.snapshotted > 0
                      ? t('modal.doneWithSnapshots', { n: result.snapshotted })
                      : t('modal.doneFreshBackup')}
                  </div>
                </>
              ) : null}
            </>
          )}
        </div>

        <div className="modal-foot">
          {phase === 'ready' && (
            <>
              <button className="btn" onClick={onClose}>
                {t('common.cancel')}
              </button>
              <button className="btn primary" onClick={start} disabled={!plan || plan.items.length === 0}>
                <IconDownload size={15} />
                {t('modal.startBackup')}
                {plan ? t('modal.startBackupCount', { n: plan.items.length }) : ''}
              </button>
            </>
          )}
          {phase === 'running' && (
            <button className="btn danger" onClick={cancel}>
              {t('modal.cancelBackup')}
            </button>
          )}
          {phase === 'done' && (
            <button className="btn primary" onClick={onClose}>
              {t('common.close')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
