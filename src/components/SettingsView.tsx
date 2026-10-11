import { useEffect, useState } from 'react';
import type { AppSettings, UpdateState } from '../types';
import { api } from '../api';
import { features } from '../features';
import { LANGS, localeTag, t, type Lang, type TKey } from '../i18n';
import {
  IconCheck,
  IconAlert,
  IconFolder,
  IconSave,
  IconSearch,
  IconDownload,
  IconRefresh,
  IconExternal
} from './Icons';

type PathKey = keyof AppSettings;

/*
 * 这里存的是文案 key 而不是译文：模块级常量在 App 调 setLang() 之前就求值了，
 * 直接写 t(...) 会固定成首次导入时的语言，切语言后标题仍是旧的。
 */
const ROWS: { key: PathKey; labelKey: TKey; hintKey: TKey; kind: 'folder' | 'file' }[] = [
  {
    key: 'gameDir',
    labelKey: 'settings.rowGameDirLabel',
    hintKey: 'settings.rowGameDirHint',
    kind: 'folder'
  },
  {
    key: 'modListsDir',
    labelKey: 'settings.rowModListsLabel',
    hintKey: 'settings.rowModListsHint',
    kind: 'folder'
  },
  {
    key: 'localModsDir',
    labelKey: 'settings.rowLocalModsLabel',
    hintKey: 'settings.rowLocalModsHint',
    kind: 'folder'
  },
  {
    key: 'workshopModsDir',
    labelKey: 'settings.rowWorkshopModsLabel',
    hintKey: 'settings.rowWorkshopModsHint',
    kind: 'folder'
  },
  {
    key: 'configPlayerPath',
    labelKey: 'settings.rowConfigPlayerLabel',
    hintKey: 'settings.rowConfigPlayerHint',
    kind: 'file'
  },
  {
    key: 'installedWorkshopDir',
    labelKey: 'settings.rowInstalledWorkshopLabel',
    hintKey: 'settings.rowInstalledWorkshopHint',
    kind: 'folder'
  }
];

const REPO_URL = 'https://github.com/kudachou/barotrauma-mod-manager';

function updateStatusText(u: UpdateState | null): string {
  if (!u) return '';
  // latestVersion 的类型是 string | null：原来的模板字符串会把 null 渲染成 "null"，这里用
  // String() 保持一模一样的行为（同时也满足 t() 的 vars 类型）。
  switch (u.status) {
    case 'checking':
      return t('settings.updateChecking');
    case 'available':
      return t('settings.updateAvailable', { version: String(u.latestVersion) });
    case 'downloading':
      return t('settings.updateDownloading', { version: String(u.latestVersion) });
    case 'downloaded':
      return t('settings.updateDownloaded', { version: String(u.latestVersion) });
    case 'up-to-date':
      return t('settings.updateUpToDate');
    case 'error':
      return t('settings.updateError', {
        error: u.error || t('settings.updateUnknownError')
      });
    case 'unsupported':
      return t('settings.updateUnsupported');
    default:
      return '';
  }
}

export default function SettingsView({
  settings,
  onSave,
  onToast,
  update,
  onCheckUpdate,
  onDownloadUpdate,
  onInstallUpdate,
  workshopCheck,
  onRecheckWorkshop,
  onSaveApiKey,
  lang,
  onChangeLang,
  appVersion
}: {
  settings: AppSettings;
  onSave: (s: AppSettings) => Promise<void>;
  onToast: (kind: 'ok' | 'warn' | 'err' | 'info', title: string, msg?: string) => void;
  update: UpdateState | null;
  onCheckUpdate: () => Promise<void>;
  onDownloadUpdate: () => Promise<void>;
  onInstallUpdate: () => Promise<void>;
  /** 当前界面语言，以及切换回调（只有 features.languageSwitch 为真时才会用到） */
  lang: Lang;
  onChangeLang: (l: Lang) => void;
  /**
   * 当前程序版本号。
   * 不能再用 `update.currentVersion`：那个来自 updater 状态，工坊版没有 updater，
   * 会永远显示 "—"。工坊版由 updater:workshopCheck 的 currentVersion 提供。
   */
  appVersion: string;
  /** 工坊下架检查的状态 */
  workshopCheck: {
    delisted: number;
    unknown: number;
    lastAt: number;
    checking: boolean;
    mode: 'apikey' | 'page';
    apiKey: string;
  };
  onRecheckWorkshop: () => Promise<void>;
  onSaveApiKey: (key: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [apiKeyDraft, setApiKeyDraft] = useState(workshopCheck.apiKey);
  useEffect(() => {
    setApiKeyDraft(workshopCheck.apiKey);
  }, [workshopCheck.apiKey]);
  const [exists, setExists] = useState<Record<string, boolean | undefined>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(settings), [settings]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const next: Record<string, boolean | undefined> = {};
      for (const r of ROWS) {
        const p = draft[r.key];
        if (!p) {
          next[r.key] = false;
          continue;
        }
        try {
          next[r.key] = await api.pathExists(p);
        } catch {
          next[r.key] = undefined;
        }
      }
      if (alive) setExists(next);
    })();
    return () => {
      alive = false;
    };
  }, [draft]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  async function browse(key: PathKey, kind: 'folder' | 'file') {
    const row = ROWS.find((r) => r.key === key);
    const p =
      kind === 'folder'
        ? await api.pickFolder(t('settings.pickFolderTitle', { name: row ? t(row.labelKey) : '' }))
        : await api.pickFile(t('settings.pickFileTitle'), [{ name: 'XML', extensions: ['xml'] }]);
    if (p) setDraft((d) => ({ ...d, [key]: p }));
  }

  async function save() {
    setSaving(true);
    try {
      await onSave(draft);
      onToast('ok', t('settings.toastSaved'));
    } catch (e: any) {
      onToast('err', t('settings.toastSaveFailed'), String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  /** 自动检测：扫描常见 Steam 位置 + 解析 libraryfolders.vdf */
  async function autoDetect() {
    try {
      const d = await api.detectPaths();
      const next = { ...draft };
      let found = 0;
      for (const r of ROWS) {
        if (d[r.key]) {
          next[r.key] = d[r.key];
          found++;
        }
      }
      setDraft(next);
      if (found) {
        onToast(
          'ok',
          t('settings.toastAutoFilled', { n: found }),
          t('settings.toastAutoFilledHint')
        );
      } else {
        onToast('warn', t('settings.toastAutoNoneTitle'), t('settings.toastAutoNoneHint'));
      }
    } catch (e: any) {
      onToast('err', t('settings.toastAutoFailed'), String(e?.message || e));
    }
  }

  return (
    <div className="settings">
      {/* 界面语言：只在允许切换的变体里出现（完整版暂不提供，见 features.languageSwitch） */}
      {features.languageSwitch && (
        <div className="panel">
          <h3>{t('settings.language')}</h3>
          <div className="hint" style={{ marginBottom: 12 }}>
            {t('settings.languageHint')}
          </div>
          <div className="seg" style={{ display: 'inline-flex' }}>
            {LANGS.map((l) => (
              <button
                key={l.code}
                className={lang === l.code ? 'active' : ''}
                onClick={() => onChangeLang(l.code)}
              >
                {l.code === 'zh' ? t('settings.languageZh') : t('settings.languageEn')}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="panel">
        <h3>{t('settings.dirTitle')}</h3>
        <div className="hint">{t('settings.dirIntro')}</div>

        {ROWS.map((r) => {
          const st = exists[r.key];
          return (
            <div className="path-row" key={r.key}>
              <label className="field-label">
                {t(r.labelKey)}
                <span style={{ color: 'var(--text-3)', fontWeight: 400, marginLeft: 8 }}>
                  {t(r.hintKey)}
                </span>
              </label>
              <div className="path-line">
                <input
                  className="input"
                  value={draft[r.key]}
                  onChange={(e) => setDraft({ ...draft, [r.key]: e.target.value })}
                  spellCheck={false}
                />
                <button className="btn" onClick={() => browse(r.key, r.kind)} style={{ flex: 'none' }}>
                  <IconFolder size={15} />
                  {t('settings.browse')}
                </button>
              </div>
              <div className={`path-status ${st === true ? 'ok' : st === false ? 'bad' : 'idle'}`}>
                {st === true ? <IconCheck size={13} /> : st === false ? <IconAlert size={13} /> : null}
                {st === true
                  ? t('settings.pathExists')
                  : st === false
                  ? t('settings.pathMissing')
                  : t('settings.pathUnverified')}
              </div>
            </div>
          );
        })}

        <div className="btn-row" style={{ marginTop: 18 }}>
          <button className="btn primary" onClick={save} disabled={!dirty || saving}>
            <IconSave size={15} />
            {saving ? t('settings.saving') : t('settings.saveSettings')}
          </button>
          <button className="btn" onClick={autoDetect}>
            <IconSearch size={15} />
            {t('settings.autoDetect')}
          </button>
          <button className="btn" onClick={() => setDraft(settings)} disabled={!dirty}>
            {t('settings.revert')}
          </button>
        </div>
      </div>

      <div className="panel">
        <h3>{t('settings.applyTitle')}</h3>
        <div className="hint" style={{ marginBottom: 0 }}>
          {t('settings.applyIntro')}
          <br />
          {t('settings.applyStep1')}{' '}
          <code>…\WorkshopMods\Installed\&#123;id&#125;\filelist.xml</code>
          {t('settings.applyStep1End')}
          <br />
          {t('settings.applyStep2')}{' '}
          <code>…\LocalMods\&#123;名称&#125;\filelist.xml</code>
          {t('settings.applyStep2End')}
          <br />
          {t('settings.applyStep3')} <code>config_player.xml</code>
          {t('settings.applyStep3Mid')}
          <code>contentpackages</code> {t('settings.applyStep3Tail')}
        </div>
      </div>

      <div className="panel">
        <h3>{t('settings.aboutTitle')}</h3>
        <div className="hint" style={{ marginBottom: 14 }}>
          {t('settings.currentVersion')} <b>v{appVersion || '—'}</b>
          {features.autoUpdater && update && (
            <span style={{ marginLeft: 12, color: 'var(--text-3)' }}>
              {updateStatusText(update)}
            </span>
          )}
        </div>

        {/*
          electron-updater 的界面只在完整版出现。
          创意工坊版主进程**没有注册** updater 的 IPC（见 index.js 的 FEATURES.autoUpdater），
          不挡的话这里会渲染出一个点了必然失败的「检查更新」按钮。
        */}
        {features.autoUpdater && (update?.status === 'unsupported' ? (
          <div className="path-status idle">
            <IconAlert size={13} />
            {t('settings.updateUnsupportedNote')}
          </div>
        ) : (
          <>
            {update?.status === 'downloading' && (
              <div className="ub-progress" style={{ marginBottom: 14 }}>
                <div style={{ width: `${Math.min(100, update.progress?.percent || 0)}%` }} />
              </div>
            )}

            {update?.status === 'available' && update.releaseNotes && (
              <div className="release-notes">{update.releaseNotes}</div>
            )}

            <div className="btn-row">
              <button
                className="btn"
                onClick={onCheckUpdate}
                disabled={update?.status === 'checking' || update?.status === 'downloading'}
              >
                <IconSearch size={15} />
                {update?.status === 'checking' ? t('settings.checking') : t('settings.checkUpdate')}
              </button>

              {update?.status === 'available' && (
                <button className="btn primary" onClick={onDownloadUpdate}>
                  <IconDownload size={15} />
                  {t('settings.downloadVersion', { version: String(update.latestVersion) })}
                </button>
              )}

              {update?.status === 'downloaded' && (
                <button className="btn primary" onClick={onInstallUpdate}>
                  <IconRefresh size={15} />
                  {t('settings.restartInstall')}
                </button>
              )}

              <button className="btn" onClick={() => api.openExternal(`${REPO_URL}/releases`)}>
                <IconExternal size={15} />
                {t('settings.releaseNotes')}
              </button>
            </div>
          </>
        ))}

        {/* 工坊版没有自更新，但更新日志这个入口仍然有用 */}
        {!features.autoUpdater && (
          <div className="btn-row">
            <button className="btn" onClick={() => api.openExternal(`${REPO_URL}/releases`)}>
              <IconExternal size={15} />
              {t('settings.releaseNotes')}
            </button>
          </div>
        )}

        {/* 工坊下架检查：联网逐个核实条目还在不在。
            成人内容的 mod 匿名访问时 Steam 要求登录，所以推荐填个官方 API Key。
            创意工坊版整块去掉：它依赖 Web API Key，而这个版本就是不索取 Key。 */}
        {features.delistedCheck && (
        <div className="panel">
          <h3>{t('settings.delistedTitle')}</h3>
          <div className="hint" style={{ marginBottom: 14 }}>
            {t('settings.delistedIntro')}
            {workshopCheck.mode === 'apikey' ? (
              <b style={{ color: '#6ee7b7' }}> {t('settings.delistedModeApi')}</b>
            ) : (
              <b style={{ color: '#fcd34d' }}> {t('settings.delistedModePage')}</b>
            )}
          </div>

          <div
            className="bk-stats"
            style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginBottom: 14 }}
          >
            <div className="bk-stat">
              <div className="bk-num">{workshopCheck.delisted}</div>
              <div className="bk-label">{t('settings.delistedStatDelisted')}</div>
            </div>
            <div className="bk-stat">
              <div className="bk-num">{workshopCheck.unknown}</div>
              <div className="bk-label">{t('settings.delistedStatUnknown')}</div>
            </div>
          </div>

          {workshopCheck.mode !== 'apikey' && (
            <div className="warn-bar" style={{ marginBottom: 14 }}>
              <IconAlert size={16} />
              <div>
                {t('settings.delistedWarnPrefix')}
                <b>{t('settings.delistedWarnBold')}</b> {t('settings.delistedWarnSuffix')}
              </div>
            </div>
          )}

          <div className="path-row" style={{ marginBottom: 0 }}>
            <label>Steam Web API Key</label>
            <div className="path-line">
              <input
                className="input"
                placeholder={t('settings.apiKeyPlaceholder')}
                value={apiKeyDraft}
                onChange={(e) => setApiKeyDraft(e.target.value)}
              />
              <button className="btn" onClick={() => void onSaveApiKey(apiKeyDraft)}>
                <IconSave size={14} />
                {t('common.save')}
              </button>
              <button
                className="btn"
                onClick={() => void api.openExternal('https://steamcommunity.com/dev/apikey')}
              >
                <IconExternal size={14} />
                {t('settings.delistedApply')}
              </button>
            </div>
            <div className="hint" style={{ marginTop: 8, marginBottom: 0 }}>
              {t('settings.apiKeyHintPrefix')}
              <code> steam-api-key.json</code>
              {t('settings.apiKeyHintSuffix')}
            </div>
          </div>

          <div className="hint" style={{ marginBottom: 12 }}>
            {t('settings.delistedLastCheck')}
            {workshopCheck.lastAt
              ? new Date(workshopCheck.lastAt).toLocaleString(localeTag())
              : t('settings.delistedNeverChecked')}
            {workshopCheck.unknown > 0 && t('settings.delistedUnknownNote')}
          </div>

          <div className="btn-row">
            <button
              className="btn primary"
              onClick={onRecheckWorkshop}
              disabled={workshopCheck.checking}
            >
              <IconRefresh size={15} />
              {workshopCheck.checking ? t('settings.checking') : t('settings.recheck')}
            </button>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
