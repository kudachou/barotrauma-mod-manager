import { useEffect, useRef, useState } from 'react';
import type { InstallSyncPlan, InstallSyncProgress, InstallSyncResult } from '../types';
import { api } from '../api';
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
        onToast('warn', `同步完成，但有 ${bad.length} 个没成功`, bad[0].error);
      } else {
        onToast('ok', '已同步到游戏', `${(r && r.synced.length) || 0} 个 mod 已装进游戏`);
      }
    } catch (e: any) {
      if (!alive.current) return;
      setError(String(e?.message || e));
      setPhase('done');
      onToast('err', '同步失败', String(e?.message || e));
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
            <div className="modal-title">同步到游戏</div>
            <div className="page-sub" style={{ marginTop: 4 }}>
              把 Steam <b>已经下载好、但游戏还没装</b>的工坊更新装进游戏的{' '}
              <code>WorkshopMods\Installed</code>。
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
              <div>正在对比 Steam 与游戏里的版本…</div>
            </div>
          )}

          {phase === 'ready' && plan && plan.count === 0 && (
            <div className="bk-center">
              <IconCheck size={22} />
              <div>游戏里已经是最新的了，没有需要同步的 mod。</div>
              <div className="bk-dim">
                判定依据：游戏写在 <code>filelist.xml</code> 里的 <code>installtime</code>{' '}
                与 Steam 记录的下载时间一致。
              </div>
            </div>
          )}

          {phase === 'ready' && plan && plan.skippedDelisted.length > 0 && (
            <div className="hint" style={{ marginTop: plan.count > 0 ? 14 : 0, marginBottom: 0 }}>
              另有 <b>{plan.skippedDelisted.length}</b> 个<b>工坊上已下架</b>的 mod
              游戏里没装（Steam 缓存里还留着内容）：
              {plan.skippedDelisted.map((x) => (
                <span className="badge" key={x.id} style={{ marginLeft: 4 }}>
                  {x.name}
                </span>
              ))}
              <div style={{ marginTop: 6 }}>
                这些<b>不在这里同步</b> —— 条目已经没了，游戏本来就不会装它们，也不会有更新。
                想留住它们请用顶部「备份工坊 mod」→「只备份已下架的」，存成
                <code>LocalMods</code> 里的本地 mod。
              </div>
            </div>
          )}

          {phase === 'ready' && plan && plan.count > 0 && (
            <>
              <div className="bk-stats">
                <div className="bk-stat">
                  <div className="bk-num">{plan.count}</div>
                  <div className="bk-label">个待同步</div>
                </div>
                <div className="bk-stat">
                  <div className="bk-num">{humanSize(plan.totalBytes)}</div>
                  <div className="bk-label">要复制的体积</div>
                </div>
                <div className="bk-stat">
                  <div className="bk-num">{plan.totalFiles}</div>
                  <div className="bk-label">个文件</div>
                </div>
              </div>

              <div className="section-title">待同步的 mod</div>
              <div className="bk-list">
                {plan.items.map((it) => (
                  <div key={it.id} className="bk-row">
                    <span className="bk-name">{it.name}</span>
                    <span className="bk-dim">
                      {it.reason === 'not-installed'
                        ? `游戏里还没装 · Steam v${it.steamVersion || '?'}`
                        : `游戏里 v${it.installedVersion || '?'} → Steam v${it.steamVersion || '?'}`}
                    </span>
                    <span className="bk-dim">{humanSize(it.bytes)}</span>
                  </div>
                ))}
              </div>

              <div className="hint" style={{ marginTop: 14, marginBottom: 0 }}>
                等同你在游戏里按「更新」，但<b>不会让 Steam 把整包重下一遍</b>
                （Steam 那份本来就已经下好了）。会把 Steam 订阅目录里那份<b>整份复制</b>
                过去，并写上游戏要的 <code>installtime</code>。
              </div>
              <div className="warn-bar" style={{ marginTop: 10, marginBottom: 0 }}>
                <IconAlert size={16} />
                <div>
                  建议先关掉游戏再同步：游戏正在运行时，已加载的 <code>dll</code> 会被系统锁住
                  （比如 LuaCs），那种 mod 会同步失败。
                </div>
              </div>
            </>
          )}

          {phase === 'running' && (
            <>
              <div className="bk-progress-head">
                <span>{percent}%</span>
                <span className="bk-dim">
                  {progress?.done || 0} / {progress?.total || 0} 个
                </span>
              </div>
              <div className="ub-progress" style={{ height: 8 }}>
                <div style={{ width: `${percent}%` }} />
              </div>
              <div className="bk-dim" style={{ marginTop: 12 }}>
                正在复制：{progress?.current || '…'}
              </div>
            </>
          )}

          {phase === 'done' && (
            <>
              {error ? (
                <div className="warn-bar" style={{ marginBottom: 0 }}>
                  <IconAlert size={16} />
                  <div>同步失败：{error}</div>
                </div>
              ) : result ? (
                <>
                  <div className="bk-stats">
                    <div className="bk-stat">
                      <div className="bk-num">
                        <IconCheck size={18} /> {result.synced.length}
                      </div>
                      <div className="bk-label">已同步</div>
                    </div>
                    <div className="bk-stat">
                      <div className="bk-num">{humanSize(result.bytes)}</div>
                      <div className="bk-label">已写入</div>
                    </div>
                    <div className="bk-stat">
                      <div className="bk-num">{result.failed.length}</div>
                      <div className="bk-label">失败</div>
                    </div>
                  </div>

                  {result.failed.length > 0 && (
                    <>
                      <div className="section-title">没成功的</div>
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
                      ? '下次启动游戏读档时就会用上新版本。'
                      : '失败的多半是文件被占用 —— 关掉游戏再点一次「同步到游戏」即可。'}
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
              开始同步（{plan.count} 个）
            </button>
          )}
          {phase === 'running' && (
            <button className="btn" onClick={() => void api.cancelInstallSync()}>
              中止
            </button>
          )}
          <button className="btn" onClick={onClose} disabled={phase === 'running'}>
            {phase === 'done' || (phase === 'ready' && plan && plan.count === 0) ? '关闭' : '取消'}
          </button>
        </div>
      </div>
    </div>
  );
}
