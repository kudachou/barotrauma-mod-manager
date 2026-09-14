import { useEffect, useState } from 'react';
import type { AppSettings, UpdateState } from '../types';
import { api } from '../api';
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

const ROWS: { key: PathKey; label: string; hint: string; kind: 'folder' | 'file' }[] = [
  {
    key: 'gameDir',
    label: '游戏根目录',
    hint: '潜渊症安装目录，其余路径可据此推导',
    kind: 'folder'
  },
  { key: 'modListsDir', label: '合集文件夹（ModLists）', hint: '游戏内置的合集文件目录', kind: 'folder' },
  { key: 'localModsDir', label: '本地 mod 文件夹（LocalMods）', hint: '手动放入的 mod', kind: 'folder' },
  {
    key: 'workshopModsDir',
    label: '创意工坊 mod 文件夹',
    hint: 'Steam 订阅下载目录 …\\workshop\\content\\602960',
    kind: 'folder'
  },
  {
    key: 'configPlayerPath',
    label: '游戏配置文件 config_player.xml',
    hint: '「应用到游戏」会写回这里的 contentpackages 段（自动备份）',
    kind: 'file'
  },
  {
    key: 'installedWorkshopDir',
    label: '游戏已安装的工坊 mod 目录',
    hint: '游戏实际加载工坊 mod 的位置（%LocalAppData%\\…\\WorkshopMods\\Installed）',
    kind: 'folder'
  }
];

const REPO_URL = 'https://github.com/kudachou/barotrauma-mod-manager';

function updateStatusText(u: UpdateState | null): string {
  if (!u) return '';
  switch (u.status) {
    case 'checking':
      return '正在检查更新…';
    case 'available':
      return `发现新版本 v${u.latestVersion}`;
    case 'downloading':
      return `正在下载 v${u.latestVersion}…`;
    case 'downloaded':
      return `v${u.latestVersion} 已下载，等待安装`;
    case 'up-to-date':
      return '已是最新版本';
    case 'error':
      return `检查失败：${u.error || '未知错误'}`;
    case 'unsupported':
      return '当前环境不支持自动更新';
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
  onSaveApiKey
}: {
  settings: AppSettings;
  onSave: (s: AppSettings) => Promise<void>;
  onToast: (kind: 'ok' | 'warn' | 'err' | 'info', title: string, msg?: string) => void;
  update: UpdateState | null;
  onCheckUpdate: () => Promise<void>;
  onDownloadUpdate: () => Promise<void>;
  onInstallUpdate: () => Promise<void>;
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
    const p =
      kind === 'folder'
        ? await api.pickFolder(`选择${ROWS.find((r) => r.key === key)?.label || ''}`)
        : await api.pickFile('选择 config_player.xml', [{ name: 'XML', extensions: ['xml'] }]);
    if (p) setDraft((d) => ({ ...d, [key]: p }));
  }

  async function save() {
    setSaving(true);
    try {
      await onSave(draft);
      onToast('ok', '设置已保存');
    } catch (e: any) {
      onToast('err', '保存设置失败', String(e?.message || e));
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
        onToast('ok', `已自动填入 ${found} 个路径`, '确认无误后点「保存设置」生效');
      } else {
        onToast('warn', '没能自动找到游戏目录', '请手动指定；也可以用游戏根目录推出其余路径');
      }
    } catch (e: any) {
      onToast('err', '自动检测失败', String(e?.message || e));
    }
  }

  return (
    <div className="settings">
      <div className="panel">
        <h3>目录设置</h3>
        <div className="hint">
          首次运行会自动扫描常见 Steam 安装位置，检测不到时点「自动检测」或手动指定。路径只保存在本机，不会上传。
        </div>

        {ROWS.map((r) => {
          const st = exists[r.key];
          return (
            <div className="path-row" key={r.key}>
              <label className="field-label">
                {r.label}
                <span style={{ color: 'var(--text-3)', fontWeight: 400, marginLeft: 8 }}>{r.hint}</span>
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
                  浏览
                </button>
              </div>
              <div className={`path-status ${st === true ? 'ok' : st === false ? 'bad' : 'idle'}`}>
                {st === true ? <IconCheck size={13} /> : st === false ? <IconAlert size={13} /> : null}
                {st === true
                  ? '路径存在'
                  : st === false
                  ? '路径不存在或未填写'
                  : '未校验（预览模式）'}
              </div>
            </div>
          );
        })}

        <div className="btn-row" style={{ marginTop: 18 }}>
          <button className="btn primary" onClick={save} disabled={!dirty || saving}>
            <IconSave size={15} />
            {saving ? '保存中…' : '保存设置'}
          </button>
          <button className="btn" onClick={autoDetect}>
            <IconSearch size={15} />
            自动检测
          </button>
          <button className="btn" onClick={() => setDraft(settings)} disabled={!dirty}>
            还原
          </button>
        </div>
      </div>

      <div className="panel">
        <h3>关于「应用到游戏」</h3>
        <div className="hint" style={{ marginBottom: 0 }}>
          应用合集时，程序会：
          <br />
          1. 把合集里的工坊 mod 解析为 <code>…\WorkshopMods\Installed\&#123;id&#125;\filelist.xml</code>；
          <br />
          2. 本地 mod 解析为 <code>…\LocalMods\&#123;名称&#125;\filelist.xml</code>；
          <br />
          3. 先备份 <code>config_player.xml</code>（带时间戳），再只替换其中的
          <code>contentpackages</code> 段，其余设置原样保留。
        </div>
      </div>

      <div className="panel">
        <h3>关于与更新</h3>
        <div className="hint" style={{ marginBottom: 14 }}>
          当前版本 <b>v{update?.currentVersion || '—'}</b>
          {update && (
            <span style={{ marginLeft: 12, color: 'var(--text-3)' }}>
              {updateStatusText(update)}
            </span>
          )}
        </div>

        {update?.status === 'unsupported' ? (
          <div className="path-status idle">
            <IconAlert size={13} />
            开发 / 预览模式下不可用。安装版会在启动时自动检查更新，并支持一键下载重启安装。
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
                {update?.status === 'checking' ? '检查中…' : '检查更新'}
              </button>

              {update?.status === 'available' && (
                <button className="btn primary" onClick={onDownloadUpdate}>
                  <IconDownload size={15} />
                  下载 v{update.latestVersion}
                </button>
              )}

              {update?.status === 'downloaded' && (
                <button className="btn primary" onClick={onInstallUpdate}>
                  <IconRefresh size={15} />
                  立即重启安装
                </button>
              )}

              <button className="btn" onClick={() => api.openExternal(`${REPO_URL}/releases`)}>
                <IconExternal size={15} />
                更新日志
              </button>
            </div>
          </>
        )}

        {/* 工坊下架检查：联网逐个核实条目还在不在。
            成人内容的 mod 匿名访问时 Steam 要求登录，所以推荐填个官方 API Key。 */}
        <div className="panel">
          <h3>创意工坊下架检查</h3>
          <div className="hint" style={{ marginBottom: 14 }}>
            作者下架之后，本地文件看不出任何区别（Steam 的 .acf 记录和正常 mod 一模一样），
            只能联网核实。当前方式：
            {workshopCheck.mode === 'apikey' ? (
              <b style={{ color: '#6ee7b7' }}> 官方 API（可靠）</b>
            ) : (
              <b style={{ color: '#fcd34d' }}> 抓工坊网页（尽力而为）</b>
            )}
          </div>

          <div
            className="bk-stats"
            style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginBottom: 14 }}
          >
            <div className="bk-stat">
              <div className="bk-num">{workshopCheck.delisted}</div>
              <div className="bk-label">已下架</div>
            </div>
            <div className="bk-stat">
              <div className="bk-num">{workshopCheck.unknown}</div>
              <div className="bk-label">没能核实</div>
            </div>
          </div>

          {workshopCheck.mode !== 'apikey' && (
            <div className="warn-bar" style={{ marginBottom: 14 }}>
              <IconAlert size={16} />
              <div>
                不填 API Key 时只能抓工坊网页，而网页<b>分不清「已下架」和「私有」</b> ——
                作者（或你自己）设成私有的条目，匿名访问同样是错误页。
                所以那种结果只会标成「工坊不可见」，不敢断言已下架。
                填个 Key 走官方接口就能准确区分，也更快。
              </div>
            </div>
          )}

          <div className="path-row" style={{ marginBottom: 0 }}>
            <label>Steam Web API Key</label>
            <div className="path-line">
              <input
                className="input"
                placeholder="留空 = 用抓网页的方式"
                value={apiKeyDraft}
                onChange={(e) => setApiKeyDraft(e.target.value)}
              />
              <button className="btn" onClick={() => void onSaveApiKey(apiKeyDraft)}>
                <IconSave size={14} />
                保存
              </button>
              <button
                className="btn"
                onClick={() => void api.openExternal('https://steamcommunity.com/dev/apikey')}
              >
                <IconExternal size={14} />
                去申请
              </button>
            </div>
            <div className="hint" style={{ marginTop: 8, marginBottom: 0 }}>
              免费申请，域名随便填（比如 localhost）。Key 只存在本机的
              <code> steam-api-key.json</code>，不会上传到任何地方。
            </div>
          </div>

          <div className="hint" style={{ marginBottom: 12 }}>
            上次检查：
            {workshopCheck.lastAt
              ? new Date(workshopCheck.lastAt).toLocaleString('zh-CN')
              : '还没查过'}
            {workshopCheck.unknown > 0 &&
              ' —— 没核实出来的既不会显示成「已下架」，也不会被当成正常'}
          </div>

          <div className="btn-row">
            <button
              className="btn primary"
              onClick={onRecheckWorkshop}
              disabled={workshopCheck.checking}
            >
              <IconRefresh size={15} />
              {workshopCheck.checking ? '检查中…' : '重新检查'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
