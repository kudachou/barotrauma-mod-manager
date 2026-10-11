import type { UpdateState } from '../types';
import { IconCheck, IconDownload, IconRefresh } from './Icons';
import { t } from '../i18n';

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
            <div className="ub-title">{t('updateBar.available', { next, cur })}</div>
            <div className="ub-sub">{t('updateBar.availableHint')}</div>
          </>
        )}

        {status === 'downloading' && (
          <>
            <div className="ub-title">
              {t('updateBar.downloading', { next, percent: Math.round(percent) })}
            </div>
            <div className="ub-progress">
              <div style={{ width: `${percent}%` }} />
            </div>
          </>
        )}

        {status === 'downloaded' && (
          <>
            <div className="ub-title">{t('updateBar.downloaded', { next })}</div>
            <div className="ub-sub">{t('updateBar.downloadedHint')}</div>
          </>
        )}
      </div>

      <div className="btn-row" style={{ flex: 'none' }}>
        {status === 'available' && (
          <>
            <button className="btn sm primary" onClick={onDownload}>
              <IconDownload size={13} />
              {t('updateBar.download')}
            </button>
            <button className="btn sm" onClick={onDismiss}>
              {t('updateBar.later')}
            </button>
          </>
        )}
        {status === 'downloaded' && (
          <button className="btn sm primary" onClick={onInstall}>
            <IconRefresh size={13} />
            {t('updateBar.installNow')}
          </button>
        )}
      </div>
    </div>
  );
}
