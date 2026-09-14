import { useEffect, useState } from 'react';
import type {
  WorkshopSyncInfo,
  WorkshopSyncItem,
  WorkshopSyncProgress,
  WorkshopSyncResult
} from '../types';
import { api } from '../api';
import { IconAlert, IconCheck, IconClose, IconRefresh } from './Icons';

type Phase = 'planning' | 'ready' | 'running' | 'done';

function fmtTime(sec: number | null): string {
  if (!sec) return '—';
  const d = new Date(sec * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const REASON_LABEL: Record<WorkshopSyncItem['reason'], string> = {
  update: '工坊有新版',
  downloading: 'Steam 下载中',
  missing: '还没装进游戏',
  delisted: '已下架'
};

export default function SyncModal({
  initial,
  onClose,
  onToast,
  onDone
}: {
  /** 界面上已经拿到的扫描结果，先拿来渲染，避免再等一次 */
  initial: WorkshopSyncInfo | null;
  onClose: () => void;
  onToast: (kind: 'ok' | 'warn' | 'err' | 'info', title: string, msg?: string) => void;
  onDone: () => void;
}) {
  const [plan, setPlan] = useState<WorkshopSyncInfo | null>(initial);
  const [phase, setPhase] = useState<Phase>(initial ? 'ready' : 'planning');
  const [progress, setProgress] = useState<WorkshopSyncProgress | null>(null);
  const [result, setResult] = useState<WorkshopSyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.onWorkshopSyncProgress((p: WorkshopSyncProgress) => setProgress(p));
    void (async () => {
      try {
        const p = await api.planWorkshopSync();
        setPlan(p);
        setPhase('ready');
      } catch (e: any) {
        setError(String(e?.message || e));
        setPhase('done');
      }
    })();
  }, []);

  // 已下架的不能同步（工坊上已经没有它了），单独列出来并引导去备份
  const runnable = (plan?.items || []).filter(
    (i) => i.reason !== 'downloading' && i.reason !== 'delisted'
  );
  const blocked = (plan?.items || []).filter((i) => i.reason === 'downloading');
  const gone = (plan?.items || []).filter((i) => i.reason === 'delisted');

  async function start() {
    setPhase('running');
    setProgress({ phase: 'copying', done: 0, total: runnable.length });
    try {
      const r = await api.startWorkshopSync();
      setResult(r);
    } catch (e: any) {
      setError(String(e?.message || e));
    }
    setPhase('done');
    onDone();
  }

  async function cancel() {
    try {
      await api.cancelWorkshopSync();
      onToast('warn', '已请求取消', '会在当前 mod 复制完后停下');
    } catch {
      /* 忽略 */
    }
  }

  const percent =
    progress && progress.total
      ? Math.min(100, Math.round((progress.done / progress.total) * 100))
      : 0;

  return (
    <div className="overlay" onClick={phase === 'running' ? undefined : onClose}>
      <div
        className="modal"
        style={{ width: 'min(720px, 100%)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div style={{ flex: 1 }}>
            <div className="modal-title">同步工坊更新到游戏</div>
            <div className="page-sub" style={{ marginTop: 4 }}>
              游戏并不直接读取 Steam 的订阅目录，而是把内容复制进自己的{' '}
              <code>WorkshopMods\Installed</code>。这里替你把这个复制做掉，
              <b>不用启动游戏</b>就能让更新生效。
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
              <div>正在对比工坊与游戏目录…</div>
            </div>
          )}

          {phase === 'ready' && plan && (
            <>
              {!plan.available ? (
                <div className="warn-bar" style={{ marginBottom: 0 }}>
                  <IconAlert size={16} />
                  <div>读不到 Steam 的工坊状态文件，无法判断哪些需要同步。<br />{plan.reason}</div>
                </div>
              ) : plan.items.length === 0 ? (
                <div className="bk-center" style={{ padding: '30px 20px' }}>
                  <IconCheck size={30} />
                  <div>游戏里的副本已经是最新的，没有需要同步的东西。</div>
                  <div className="bk-dim">对比依据：Steam 记录的版本时间戳 vs 游戏写入的 installtime</div>
                </div>
              ) : (
                <>
                  <div className="bk-stats" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                    <div className="bk-stat">
                      <div className="bk-num">{runnable.length}</div>
                      <div className="bk-label">可以同步</div>
                    </div>
                    <div className="bk-stat">
                      <div className="bk-num">{blocked.length}</div>
                      <div className="bk-label">等 Steam 下完</div>
                    </div>
                    <div className="bk-stat">
                      <div className="bk-num">{gone.length}</div>
                      <div className="bk-label">已下架</div>
                    </div>
                  </div>

                  {gone.length > 0 && (
                    <div className="danger-bar" style={{ marginTop: 16 }}>
                      <IconAlert size={16} />
                      <div>
                        有 {gone.length} 个 mod <b>已被作者从创意工坊下架</b>，工坊上再也下不到了，
                        所以这里不处理它们。想留住的话，回 mod 列表点「已下架」→「一键备份这些」，
                        把它们复制进 <code>LocalMods</code> 变成本地 mod。
                      </div>
                    </div>
                  )}

                  {blocked.length > 0 && (
                    <div className="warn-bar" style={{ marginTop: 16 }}>
                      <IconAlert size={16} />
                      <div>
                        有 {blocked.length} 个 mod 的新版本 <b>Steam 还没下载完</b>，
                        现在同步会搬进不完整的内容，所以这次会跳过它们。
                        等 Steam 下载完再点一次即可。
                      </div>
                    </div>
                  )}

                  <div className="section-title">明细</div>
                  <div className="bk-list" style={{ maxHeight: 260 }}>
                    {plan.items.map((it) => (
                      <div key={it.id} className="bk-row">
                        <span className="bk-name">{it.name}</span>
                        <span
                          className={`badge ${
                            it.reason === 'downloading'
                              ? 'st-different'
                              : it.reason === 'delisted'
                                ? 'st-delisted'
                                : 'st-older'
                          }`}
                        >
                          {REASON_LABEL[it.reason]}
                        </span>
                        <span className="bk-dim" style={{ flex: 'none' }}>
                          {fmtTime(it.installedTime)} → {fmtTime(it.latestTime)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="hint" style={{ marginTop: 14, marginBottom: 0 }}>
                    同步只做两件事：把工坊的内容<b>原样复制</b>进 Installed、按游戏的写法更新
                    <code>installtime</code>。内容一个字节都不改，所以不会破坏联机校验。
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
                  {progress?.done || 0} / {progress?.total || 0} 个
                </span>
              </div>
              <div className="ub-progress" style={{ height: 8 }}>
                <div style={{ width: `${percent}%` }} />
              </div>
              <div className="bk-dim" style={{ marginTop: 12 }}>
                正在同步：{progress?.current || '…'}
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
                  <div className="bk-stats" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                    <div className="bk-stat">
                      <div className="bk-num">
                        <IconCheck size={18} /> {result.done}
                      </div>
                      <div className="bk-label">已同步</div>
                    </div>
                    <div className="bk-stat">
                      <div className="bk-num">{blocked.length}</div>
                      <div className="bk-label">跳过（Steam 下载中）</div>
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
                    现在启动游戏就能直接用上新版本了（游戏会发现它已经装好，不会再重复复制）。
                  </div>
                </>
              ) : null}
            </>
          )}
        </div>

        <div className="modal-foot">
          {phase === 'ready' && plan?.available && plan.items.length > 0 && (
            <>
              <button className="btn" onClick={onClose}>
                取消
              </button>
              <button className="btn primary" onClick={start} disabled={runnable.length === 0}>
                <IconRefresh size={15} />
                开始同步{runnable.length ? `（${runnable.length} 个）` : ''}
              </button>
            </>
          )}
          {phase === 'running' && (
            <button className="btn danger" onClick={cancel}>
              取消同步
            </button>
          )}
          {phase === 'done' && (
            <button className="btn primary" onClick={onClose}>
              关闭
            </button>
          )}
          {phase === 'ready' && (!plan?.available || plan.items.length === 0) && (
            <button className="btn primary" onClick={onClose}>
              关闭
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
