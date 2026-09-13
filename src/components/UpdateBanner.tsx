import type { UpdateState } from '../types';
import { IconCheck, IconDownload, IconRefresh } from './Icons';

/** 有新版本 / 下载中 / 已下载完成 时显示在内容区顶部 */
export default function UpdateBanner({
  state,
  onDownload,
  onInstall,
  onDismiss
}: {
  state: UpdateState;
  onDownload: () => void;
  onInstall: () => void;
  onDismiss: () => void;
}) {
  const { status } = state;
  if (status !== 'available' && status !== 'downloading' && status !== 'downloaded') return null;

  const cur = state.currentVersion || '?';
  const next = state.latestVersion || '?';
  const percent = Math.min(100, Math.max(0, state.progress?.percent || 0));

  return (
    <div className="update-bar">
      <span style={{ marginTop: 1, flex: 'none' }}>
        {status === 'downloaded' ? <IconCheck size={16} /> : <IconDownload size={16} />}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        {status === 'available' && (
          <>
            <div className="ub-title">
              发现新版本 v{next}（当前 v{cur}）
            </div>
            <div className="ub-sub">下载完会自动重启安装，不用再手动下载。</div>
          </>
        )}

        {status === 'downloading' && (
          <>
            <div className="ub-title">
              正在下载 v{next}… {Math.round(percent)}%
            </div>
            <div className="ub-progress">
              <div style={{ width: `${percent}%` }} />
            </div>
          </>
        )}

        {status === 'downloaded' && (
          <>
            <div className="ub-title">v{next} 已下载完成</div>
            <div className="ub-sub">点「立即重启安装」完成更新，程序会自动重启。</div>
          </>
        )}
      </div>

      <div className="btn-row" style={{ flex: 'none' }}>
        {status === 'available' && (
          <>
            <button className="btn sm primary" onClick={onDownload}>
              <IconDownload size={13} />
              下载更新
            </button>
            <button className="btn sm" onClick={onDismiss}>
              稍后
            </button>
          </>
        )}
        {status === 'downloaded' && (
          <button className="btn sm primary" onClick={onInstall}>
            <IconRefresh size={13} />
            立即重启安装
          </button>
        )}
      </div>
    </div>
  );
}
