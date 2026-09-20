import { useEffect, useState } from 'react';
import type { BackupPlan, BackupProgress, BackupResult } from '../types';
import { api } from '../api';
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
      onToast('warn', '已请求取消', '会在当前文件复制完后停下');
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
              {onlyDelisted ? '备份已下架的工坊 mod' : '一键备份所有工坊 mod 到本地'}
            </div>
            <div className="page-sub" style={{ marginTop: 4 }}>
              {onlyDelisted ? (
                <>
                  这些 mod 已被作者从创意工坊下架，<b>工坊上再也下不到了</b>。
                  复制进 <code>LocalMods</code> 变成本地 mod 后就不再依赖工坊和 Steam。
                </>
              ) : (
                <>
                  把创意工坊 mod 复制进 <code>LocalMods</code>，之后即使工坊更新或下架，本地这份还在。
                </>
              )}
            </div>
          </div>
          <button className="btn icon" onClick={onClose} disabled={phase === 'running'} title="关闭">
            <IconClose size={16} />
          </button>
        </div>

        <div className="modal-body">
          {phase === 'planning' && (
            <div className="bk-center">
              <div className="bk-spinner" />
              <div>
                正在统计体积…
                {progress && progress.total ? `（${progress.done}/${progress.total}）` : ''}
              </div>
              {progress?.current && <div className="bk-dim">{progress.current}</div>}
            </div>
          )}

          {phase === 'ready' && plan && (
            <>
              <div className="bk-stats">
                <div className="bk-stat">
                  <div className="bk-num">{plan.items.length}</div>
                  <div className="bk-label">{onlyDelisted ? '个待备份' : '个工坊 mod'}</div>
                </div>
                <div className="bk-stat">
                  <div className="bk-num">{humanSize(plan.totalBytes)}</div>
                  <div className="bk-label">预计占用</div>
                </div>
                <div className="bk-stat">
                  <div className="bk-num">{plan.newCount}</div>
                  <div className="bk-label">新建</div>
                </div>
                <div className="bk-stat">
                  <div className="bk-num">{plan.updateCount}</div>
                  <div className="bk-label">更新（先留快照）</div>
                </div>
              </div>

              {onlyDelisted && (
                <div className="hint" style={{ marginTop: 14, marginBottom: 0 }}>
                  已经在 <code>LocalMods</code> 里备份过的会自动跳过 ——
                  既是省事，也是避免覆盖你自己改过的本地副本。它们会列在下面的「跳过」里。
                </div>
              )}

              <div className="warn-bar" style={{ marginTop: 16 }}>
                <IconAlert size={16} />
                <div>
                  会在 <code>LocalMods</code> 里多出一份完整副本，<b>占用约 {humanSize(plan.totalBytes)} 磁盘空间</b>。
                  {plan.updateCount > 0 && (
                    <>
                      {' '}
                      其中 {plan.updateCount} 个已有本地副本，覆盖前会先存快照，之后可以在 mod
                      详情页里回滚。
                    </>
                  )}
                </div>
              </div>

              {plan.items.some((i) => i.installedOnly && !i.existing) && (
                <div className="danger-bar" style={{ marginTop: 12 }}>
                  <IconAlert size={16} />
                  <div>
                    其中{' '}
                    <b>{plan.items.filter((i) => i.installedOnly && !i.existing).length} 个</b>{' '}
                    在 Steam 订阅目录里已经没有了、LocalMods 里也还没备份，
                    只剩游戏 <code>Installed</code> 里那份副本 —— 这次备份是它们唯一的保底。
                  </div>
                </div>
              )}

              {plan.items.some((i) => i.delisted) && !onlyDelisted && (
                <div className="hint" style={{ marginTop: 12, marginBottom: 0 }}>
                  计划里有 {plan.items.filter((i) => i.delisted).length} 个是<b>已被作者下架</b>的 mod。
                  只想处理这些的话，回列表点「已下架」再点「一键备份这些」。
                </div>
              )}

              {plan.skipped.length > 0 && (
                <>
                  <div className="section-title">跳过 {plan.skipped.length} 个</div>
                  <div className="bk-list">
                    {plan.skipped.slice(0, 6).map((s) => (
                      <div key={s.id} className="bk-row">
                        <span className="bk-name">{s.name}</span>
                        <span className="bk-dim">{s.reason}</span>
                      </div>
                    ))}
                    {plan.skipped.length > 6 && (
                      <div className="bk-dim">…还有 {plan.skipped.length - 6} 个</div>
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
                  {progress?.done || 0} / {progress?.total || 0} 个 ·{' '}
                  {humanSize(progress?.bytesDone || 0)} / {humanSize(progress?.bytesTotal || 0)}
                </span>
              </div>
              <div className="ub-progress" style={{ height: 8 }}>
                <div style={{ width: `${percent}%` }} />
              </div>
              <div className="bk-dim" style={{ marginTop: 12 }}>
                正在复制：{progress?.current || '…'}
              </div>
              {!!progress?.snapshotted && (
                <div className="bk-dim" style={{ marginTop: 4 }}>
                  已留快照 {progress.snapshotted} 份
                </div>
              )}
            </>
          )}

          {phase === 'done' && (
            <>
              {error ? (
                <div className="warn-bar" style={{ marginBottom: 0 }}>
                  <IconAlert size={16} />
                  <div>备份失败：{error}</div>
                </div>
              ) : result ? (
                <>
                  <div className="bk-stats">
                    <div className="bk-stat">
                      <div className="bk-num">
                        <IconCheck size={18} /> {result.done}
                      </div>
                      <div className="bk-label">已备份</div>
                    </div>
                    <div className="bk-stat">
                      <div className="bk-num">{humanSize(result.bytesDone)}</div>
                      <div className="bk-label">实际写入</div>
                    </div>
                    <div className="bk-stat">
                      <div className="bk-num">{result.snapshotted}</div>
                      <div className="bk-label">留了快照</div>
                    </div>
                    <div className="bk-stat">
                      <div className="bk-num">{result.errors.length}</div>
                      <div className="bk-label">失败</div>
                    </div>
                  </div>

                  {result.errors.length > 0 && (
                    <>
                      <div className="section-title">失败的 mod</div>
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
                      ? `已留 ${result.snapshotted} 份快照 —— 去任意本地 mod 的详情页可以回滚。`
                      : '这些 mod 之前没有本地副本，所以是全新备份。以后再次备份时，旧版本会自动留成快照。'}
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
                取消
              </button>
              <button className="btn primary" onClick={start} disabled={!plan || plan.items.length === 0}>
                <IconDownload size={15} />
                开始备份{plan ? `（${plan.items.length} 个）` : ''}
              </button>
            </>
          )}
          {phase === 'running' && (
            <button className="btn danger" onClick={cancel}>
              取消备份
            </button>
          )}
          {phase === 'done' && (
            <button className="btn primary" onClick={onClose}>
              关闭
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
