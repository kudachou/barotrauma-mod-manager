import { useState } from 'react';
import type { WorkshopUpdateInfo } from '../types';
import { api } from '../api';
import { IconClose, IconDownload, IconExternal } from './Icons';
import { t } from '../i18n';

/**
 * 创意工坊版的更新提示条。
 *
 * 和完整版的 UpdateBanner 是**两条不同的通道**：
 *   - 完整版：electron-updater 从 GitHub Releases 下载安装包，再 quitAndInstall
 *   - 工坊版：Steam 已经把新版下载进工坊目录（连同安装包），所以**不需要下载**，
 *     直接运行那个安装包即可升级
 *
 * 「一键升级」的机制与完整版一致：把安装包以 `--updated --force-run` 启动，
 * 由安装包自己处理正在运行的实例，装完自动重开新版（详见
 * electron/services/workshopupdate.js 的文件头说明）。
 */
export default function WorkshopUpdateBanner({
  info,
  onDismiss
}: {
  info: WorkshopUpdateInfo;
  onDismiss: () => void;
}) {
  const [showPath, setShowPath] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!info.newer) return null;

  const canApply = !!info.installerAvailable;

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.workshopUpdateApply();
      if (!r || !r.ok) {
        setBusy(false);
        setError((r && r.reason) || t('updater.workshopApplyFailed'));
        return;
      }
      // 成功：主进程马上会退出，安装包装完自动把新版拉起来。
      // 这里保持 busy 状态，让用户看到"正在更新"而不是一个又能点的按钮。
    } catch (e: any) {
      setBusy(false);
      setError(String((e && e.message) || e));
    }
  };

  return (
    <div className="warn-bar upd-bar">
      <IconDownload size={16} />
      <div style={{ flex: 1 }}>
        <b>{t('updater.workshopTitle', { version: info.workshopVersion || '' })}</b>
        <span style={{ opacity: 0.85 }}>
          {busy
            ? t('updater.workshopApplying')
            : t('updater.workshopBody', { current: info.currentVersion })}
        </span>
        {!canApply && (
          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.9 }}>
            {t('updater.workshopNoInstaller')}
          </div>
        )}
        {canApply ? (
          <button
            className="btn sm primary"
            style={{ marginLeft: 8 }}
            disabled={busy}
            onClick={() => void apply()}
          >
            <IconDownload size={13} />
            {busy ? t('updater.workshopApplyingShort') : t('updater.workshopApplyNow')}
          </button>
        ) : null}
        <button className="btn sm" style={{ marginLeft: 8 }} onClick={() => setShowPath((v) => !v)}>
          <IconExternal size={13} />
          {showPath ? t('updater.hidePath') : t('updater.showPath')}
        </button>
        {error && (
          <div style={{ marginTop: 6, fontSize: 12, wordBreak: 'break-all' }}>{error}</div>
        )}
        {showPath && (
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.9, wordBreak: 'break-all' }}>
            <code>{info.dir}</code>
          </div>
        )}
      </div>
      <button
        className="btn icon"
        disabled={busy}
        onClick={onDismiss}
        title={t('updater.dismiss')}
      >
        <IconClose size={15} />
      </button>
    </div>
  );
}

/** 供外部复用：只有"确实有更新"才值得占版面 */
export function shouldShowWorkshopUpdate(info: WorkshopUpdateInfo | null): boolean {
  return !!info && info.checked && info.found && info.newer;
}
