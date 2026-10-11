import { useState } from 'react';
import type { WorkshopUpdateInfo } from '../types';
import { IconClose, IconDownload, IconExternal } from './Icons';
import { t } from '../i18n';

/**
 * 创意工坊版的更新提示条。
 *
 * 和完整版的 UpdateBanner 是**两条不同的通道**：
 *   - 完整版：electron-updater 从 GitHub Releases 下载安装包
 *   - 工坊版：Steam 已经把新版下载进工坊目录，但不会覆盖桌面那份，
 *     所以这里只提示「工坊已下载 vX → 去工坊页面/重新安装」
 *
 * 不做自动下载 —— 工坊版就是要"更新交给 Steam"。
 */
export default function WorkshopUpdateBanner({
  info,
  onDismiss
}: {
  info: WorkshopUpdateInfo;
  onDismiss: () => void;
}) {
  const [showPath, setShowPath] = useState(false);
  if (!info.newer) return null;

  return (
    <div className="warn-bar upd-bar">
      <IconDownload size={16} />
      <div style={{ flex: 1 }}>
        <b>{t('updater.workshopTitle', { version: info.workshopVersion || '' })}</b>
        <span style={{ opacity: 0.85 }}>
          {t('updater.workshopBody', { current: info.currentVersion })}
        </span>
        <button className="btn sm" style={{ marginLeft: 8 }} onClick={() => setShowPath((v) => !v)}>
          <IconExternal size={13} />
          {showPath ? t('updater.hidePath') : t('updater.showPath')}
        </button>
        {showPath && (
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.9, wordBreak: 'break-all' }}>
            <code>{info.dir}</code>
          </div>
        )}
      </div>
      <button className="btn icon" onClick={onDismiss} title={t('updater.dismiss')}>
        <IconClose size={15} />
      </button>
    </div>
  );
}

/** 供外部复用：只有"确实有更新"才值得占版面 */
export function shouldShowWorkshopUpdate(info: WorkshopUpdateInfo | null): boolean {
  return !!info && info.checked && info.found && info.newer;
}
