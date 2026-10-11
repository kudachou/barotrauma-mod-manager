import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, isMock } from './api';
import type {
  AppSettings,
  ModInfo,
  ModlistEntry,
  ModlistSummary,
  ScanResult,
  UpdateState,
  ViewKey,
  WorkshopUpdateInfo
} from './types';
import { ALL_CATEGORIES } from './categories';
import { safeFileName, uniq } from './ui';
import { features } from './features';
import Sidebar from './components/Sidebar';
import LibraryView from './components/LibraryView';
import CollectionsView from './components/CollectionsView';
import SavesView from './components/SavesView';
import BrowseView from './components/BrowseView';
import SettingsView from './components/SettingsView';
import ModDetailModal from './components/ModDetailModal';
import UpdateBanner from './components/UpdateBanner';
import WorkshopUpdateBanner, {
  shouldShowWorkshopUpdate
} from './components/WorkshopUpdateBanner';
import BackupModal from './components/BackupModal';
import SyncModal from './components/SyncModal';
import Toasts, { type ToastItem } from './components/Toasts';
import { IconAlert, IconDownload, IconPlay, IconRefresh } from './components/Icons';
import {
  loadSavedLang,
  persistLang,
  setLang as applyLang,
  t,
  type Lang,
  type TKey
} from './i18n';
import { translateMainMessage } from './i18n/mainMessages';

const TITLES: Record<ViewKey, { titleKey: TKey; subKey: TKey }> = {
  library: { titleKey: 'page.library.title', subKey: 'page.library.sub' },
  browse: { titleKey: 'page.browse.title', subKey: 'page.browse.sub' },
  collections: { titleKey: 'page.collections.title', subKey: 'page.collections.sub' },
  saves: { titleKey: 'page.saves.title', subKey: 'page.saves.sub' },
  settings: { titleKey: 'page.settings.title', subKey: 'page.settings.sub' }
};

export default function App() {
  const [view, setView] = useState<ViewKey>('library');
  /*
   * 界面语言。
   *
   * `t()` 读的是模块级状态，组件不会因为语言变化自动重渲染，所以根节点挂了 `key={lang}`：
   * 语言一变整棵子树重挂，所有 t() 重新求值。切换语言是低频操作，代价可以接受。
   * 初始化时就要 applyLang()，否则首屏还是中文（会闪一下）。
   */
  const [lang, setLangState] = useState<Lang>(() => {
    const l = loadSavedLang(features.languageSwitch);
    applyLang(l);
    return l;
  });
  const changeLang = useCallback((l: Lang) => {
    if (!features.languageSwitch) return;
    applyLang(l);
    persistLang(l);
    setLangState(l);
  }, []);

  /*
   * 窗口标题 / 任务栏标题。
   *
   * 主进程 `electron/main.js` 里那个 `title:` 只是初始值 —— 页面加载后 HTML 的 `<title>`
   * 会覆盖它，所以真正生效的是这里。必须在 App 里按语言设置（App 本身不随语言重挂，
   * 只有它的子树重挂），否则切了语言标题还是旧的。
   */
  useEffect(() => {
    document.title = t('app.title');
    // <html lang> 也跟着走：影响字体回退、拼写检查、以及无障碍读屏
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
    /*
     * 告诉主进程当前语言。只有原生文件/文件夹对话框的标题需要它
     *（那类文案由系统绘制，渲染层给不了）。见 electron/services/uilang.js。
     */
    void api.setUiLang?.(lang);
  }, [lang]);
  const [data, setData] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ModInfo | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [reloadToken, setReloadToken] = useState(0);
  const [update, setUpdate] = useState<UpdateState | null>(null);
  const [backupOpen, setBackupOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [backupScope, setBackupScope] = useState<'all' | 'delisted'>('all');
  /** 用户点了「稍后」的版本号，同一个版本不再弹 */
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const toastSeq = useRef(0);

  const pushToast = useCallback(
    (kind: ToastItem['kind'], title: string, msg?: string) => {
      const id = ++toastSeq.current;
      /*
       * 主进程抛上来的提示是中文硬编码（约 40 条），在这里统一翻一道 ——
       * 改主进程为错误码之前，这是唯一不用动 40 处调用点的位置。
       * 详见表里写的边界说明（src/i18n/mainMessages.ts）。
       *
       * ⚠️ 回调参数别叫 `t`：会遮蔽 i18n 的 t()（这个坑踩过）。
       */
      const body = translateMainMessage(msg);
      setToasts((list) => [...list, { id, kind, title, msg: body }]);
      window.setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 5200);
    },
    []
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.scan();
      setData(r);
      const ids: string[] = r.mods.filter((m) => m.source === 'workshop').map((m) => m.id);
      if (ids.length) Promise.resolve(api.fetchPreviews(ids)).catch(() => {});
    } catch (e: any) {
      pushToast('err', t('toast.scanFailed'), String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * 「工坊条目还在不在」的缓存太旧时后台刷一次。
   * 扫描本身不联网（读缓存），所以这里补一次网络检查。
   * 结果要明确告诉用户 —— 不然检查失败时功能会静默失效，看不出来。
   */
  const checksRefreshed = useRef(false);
  useEffect(() => {
    // 创意工坊版没有下架检查（它需要 Web API Key），整段跳过
    if (!features.delistedCheck) return;
    if (!data?.checksStale || checksRefreshed.current) return;
    checksRefreshed.current = true;
    void (async () => {
      try {
        const r = await api.refreshWorkshopChecks();
        await refresh();
        const list = Object.values(r.checks || {});
        const gone = list.filter((c) => c.exists === false).length;
        const unknown = list.filter((c) => c.exists === null).length;
        if (r.apiKeyError) {
          pushToast('err', t('toast.apiKeyUnusable'), r.apiKeyError);
        } else if (gone > 0) {
          pushToast(
            'warn',
            t('toast.delistedFound', { n: gone }),
            t('toast.delistedFoundHint')
          );
        } else if (unknown > 0) {
          pushToast(
            'info',
            t('toast.checkIncomplete'),
            t('toast.checkUnknownPage', { n: unknown })
          );
        }
      } catch {
        /* 离线或接口出错就保持现状 */
      }
    })();
  }, [data?.checksStale, refresh, pushToast]);

  /** 手动重跑下架检查（Steam 挡住自动检查时的补救） */
  const [checkingWorkshop, setCheckingWorkshop] = useState(false);
  const recheckWorkshop = useCallback(async () => {
    if (!features.delistedCheck) return;
    setCheckingWorkshop(true);
    try {
      const r = await api.refreshWorkshopChecks();
      await refresh();
      const list = Object.values(r.checks || {});
      const gone = list.filter((c) => c.exists === false).length;
      const unknown = list.filter((c) => c.exists === null).length;
      if (r.apiKeyError) {
        pushToast(
          'err',
          t('toast.apiKeyUnusableShort'),
          t('toast.fellBackToPage', { err: r.apiKeyError })
        );
        return;
      }
      pushToast(
        gone > 0 ? 'warn' : 'ok',
        gone > 0 ? t('toast.delistedFound', { n: gone }) : t('toast.checkDoneNothing'),
        unknown > 0
          ? t('toast.checkUnknownShort', { n: unknown })
          : r.mode === 'apikey'
            ? t('toast.modeApiKey')
            : t('toast.modePage')
      );
    } catch (e: any) {
      pushToast('err', t('toast.checkFailed'), String(e?.message || e));
    } finally {
      setCheckingWorkshop(false);
    }
  }, [refresh, pushToast]);

  /** Steam Web API Key（有就走官方接口，没有就抓网页） */
  const [steamApiKey, setSteamApiKeyState] = useState('');
  useEffect(() => {
    // 创意工坊版不索取 Key，设置里也没有这一栏 —— 别白跑一次 IPC
    if (!features.apiKey) return;
    void (async () => {
      try {
        setSteamApiKeyState((await api.getSteamApiKey()) || '');
      } catch {
        /* 读不到就当没填 */
      }
    })();
  }, []);
  const saveSteamApiKey = useCallback(
    async (key: string) => {
      try {
        const saved = await api.setSteamApiKey(key);
        setSteamApiKeyState(saved);
        pushToast(
          'ok',
          saved ? t('toast.apiKeySaved') : t('toast.apiKeyCleared'),
          saved ? t('toast.apiKeySavedHint') : t('toast.apiKeyClearedHint')
        );
      } catch (e: any) {
        pushToast('err', t('toast.saveFailed'), String(e?.message || e));
      }
    },
    [pushToast]
  );

  useEffect(() => {
    // 返回退订函数：重复挂载不会叠加监听（preload 的 on* 现在统一返回退订）
    const off = api.onPreviewReady?.((p: { id: string; localPath: string | null }) => {
      setData((prev) =>
        prev
          ? {
              ...prev,
              mods: prev.mods.map((m) =>
                m.source === 'workshop' && m.id === p.id ? { ...m, preview: p.localPath } : m
              )
            }
          : prev
      );
    });
    return () => {
      off?.();
    };
  }, []);

  // 更新：注册事件推送 + 启动时静默检查一次
  useEffect(() => {
    /*
     * 创意工坊版关掉 electron-updater：它的更新走"工坊把新版下载进来 → 程序比对版本号 →
     * 提示重装"。主进程那边也没注册 updater 的 IPC，所以这里必须跳过，
     * 否则会去调不存在的通道。
     */
    if (!features.autoUpdater) return;
    const off = api.onUpdaterEvent?.((s: UpdateState) => setUpdate(s));
    void (async () => {
      try {
        await api.updaterStatus();
        setUpdate(await api.updaterCheck());
      } catch {
        /* 检查更新失败不影响正常使用 */
      }
    })();
    return () => {
      off?.();
    };
  }, []);

  /*
   * 工坊版：启动时查一次"工坊下载进来的那份是不是比当前新"。
   * 纯本地文件读取（不联网、不需要 Key）。没订阅时就查不到，界面上什么都不显示。
   */
  const [workshopUpdate, setWorkshopUpdate] = useState<WorkshopUpdateInfo | null>(null);
  const [dismissedWorkshopVersion, setDismissedWorkshopVersion] = useState<string | null>(null);
  useEffect(() => {
    if (features.autoUpdater) return; // 完整版走 electron-updater，不查这个
    void (async () => {
      try {
        setWorkshopUpdate(await api.workshopUpdateCheck());
      } catch {
        /* 查不到就当没有更新，不打扰用户 */
      }
    })();
  }, []);

  const checkUpdate = useCallback(async () => {
    try {
      setUpdate(await api.updaterCheck());
    } catch (e: any) {
      pushToast('err', t('toast.updateCheckFailed'), String(e?.message || e));
    }
  }, [pushToast]);

  const downloadUpdate = useCallback(async () => {
    try {
      setUpdate(await api.updaterDownload());
    } catch (e: any) {
      pushToast('err', t('toast.updateDownloadFailed'), String(e?.message || e));
    }
  }, [pushToast]);

  const installUpdate = useCallback(async () => {
    try {
      await api.updaterInstall();
    } catch (e: any) {
      pushToast('err', t('toast.updateInstallFailed'), String(e?.message || e));
    }
  }, [pushToast]);

  const launchGame = useCallback(async () => {
    try {
      const r = await api.launchGame();
      pushToast(
        'ok',
        t('toast.launching'),
        r && r.via === 'steam' ? t('toast.launchingViaSteam') : undefined
      );
    } catch (e: any) {
      pushToast('err', t('toast.launchFailed'), String(e?.message || e));
    }
  }, [pushToast]);

  const handleLocalModDeleted = useCallback(() => {
    setSelected(null);
    void refresh();
  }, [refresh]);

  const mods = data?.mods || [];
  const modlists = data?.modlists || [];
  /** Steam 已下载、游戏还没装的工坊更新数量（>0 时顶部出现「同步到游戏」） */
  const pendingInstall = data?.installPendingCount || 0;
  const categories = data?.categories || { mods: {}, custom: [], removed: [] };

  const allCategories = useMemo(() => {
    const removed = categories.removed || [];
    return uniq([...ALL_CATEGORIES, ...categories.custom]).filter((c) => !removed.includes(c));
  }, [categories.custom, categories.removed]);

  const updateMod = useCallback((m: ModInfo) => {
    setData((prev) =>
      prev
        ? {
            ...prev,
            mods: prev.mods.map((x) => (x.source === m.source && x.id === m.id ? { ...x, ...m } : x))
          }
        : prev
    );
    setSelected((cur) => (cur && cur.source === m.source && cur.id === m.id ? { ...cur, ...m } : cur));
  }, []);

  /**
   * 在 mod 详情页直接加入 / 移出合集。
   * 支持一次处理多个 —— 用于「连带关联（前置）mod 一起加入」。
   */
  const setModlistMembership = useCallback(
    async (input: ModInfo | ModInfo[], list: { fileName: string; name: string }, add: boolean) => {
      const keyOf = (m: ModInfo) => `${m.source}:${m.id}`;
      const entryOf = (m: ModInfo): ModlistEntry =>
        m.source === 'workshop'
          ? { type: 'workshop', name: m.name, id: m.id }
          : { type: 'local', name: m.id };

      const seen = new Set<string>();
      const items = (Array.isArray(input) ? input : [input]).filter((m) => {
        if (!m) return false;
        const k = keyOf(m);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      if (!items.length) return;

      const done: ModInfo[] = [];
      try {
        for (const m of items) {
          const entry = entryOf(m);
          if (add) await api.addModToModlist(list.fileName, list.name, entry);
          else await api.removeModFromModlist(list.fileName, entry);
          done.push(m);
        }
      } catch (e: any) {
        pushToast(
          'err',
          add ? t('toast.addToCollectionFailed') : t('toast.removeFromCollectionFailed'),
          String(e?.message || e)
        );
        return;
      }

      const keys = new Set(done.map(keyOf));
      const adjust = (names: string[]) =>
        add ? uniq([...names, list.name]) : names.filter((n) => n !== list.name);
      const delta = add ? done.length : -done.length;

      setData((prev) => {
        if (!prev) return prev;
        const exists = prev.modlists.some((l) => l.fileName === list.fileName);
        return {
          ...prev,
          mods: prev.mods.map((x) => (keys.has(keyOf(x)) ? { ...x, usedIn: adjust(x.usedIn) } : x)),
          modlists: exists
            ? prev.modlists.map((l) =>
                l.fileName === list.fileName
                  ? { ...l, count: Math.max(0, l.count + delta) }
                  : l
              )
            : [...prev.modlists, { fileName: list.fileName, name: list.name, count: done.length }]
        };
      });
      setSelected((cur) =>
        cur && keys.has(keyOf(cur)) ? { ...cur, usedIn: adjust(cur.usedIn) } : cur
      );
      setReloadToken((n) => n + 1);

      if (add) {
        pushToast(
          'ok',
          done.length > 1
            ? t('toast.addedToCollectionWith', { name: list.name, n: done.length - 1 })
            : t('toast.addedToCollection', { name: list.name })
        );
      } else {
        pushToast('ok', t('toast.removedFromCollection', { name: list.name }));
      }
    },
    [pushToast]
  );

  /** 保存 mod 之间的关联（前置需求） */  const setRelations = useCallback(
    async (key: string, keys: string[]) => {
      try {
        const next = await api.setRelations(key, keys);
        setData((prev) => (prev ? { ...prev, relations: next } : prev));
      } catch (e: any) {
        pushToast('err', t('toast.relationsSaveFailed'), String(e?.message || e));
      }
    },
    [pushToast]
  );

  /** 新建合集并把当前 mod 加进去 */
  const createModlistWith = useCallback(
    async (m: ModInfo, rawName: string) => {
      const name = rawName.trim();
      if (!name) return;
      await setModlistMembership(m, { fileName: safeFileName(name), name }, true);
    },
    [setModlistMembership]
  );

  /** 新建自定义分类标签 */
  const addCustomTag = useCallback(
    async (rawName: string) => {
      const name = rawName.trim();
      if (!name) return;
      try {
        await api.addCustomCategory(name);
      } catch (e: any) {
        pushToast('err', t('toast.tagCreateFailed'), String(e?.message || e));
        return;
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              categories: {
                ...prev.categories,
                // 必须生成新数组：原地 push 不会改变引用，useMemo 不会重算
                custom: uniq([...prev.categories.custom, name])
              }
            }
          : prev
      );
      pushToast('ok', t('toast.tagCreated', { name }));
    },
    [pushToast]
  );

  /** 删除分类标签：从标签库与所有 mod 上移除 */
  const deleteTag = useCallback(
    async (rawName: string) => {
      const name = rawName.trim();
      if (!name) return;
      let affected = 0;
      try {
        const r = await api.deleteCategory(name);
        affected = (r && r.affected) || 0;
      } catch (e: any) {
        pushToast('err', t('toast.tagDeleteFailed'), String(e?.message || e));
        return;
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              mods: prev.mods.map((m) => ({
                ...m,
                categories: m.categories.filter((c) => c !== name),
                autoCategories: m.autoCategories.filter((c) => c !== name)
              })),
              categories: {
                ...prev.categories,
                custom: prev.categories.custom.filter((c) => c !== name),
                removed: uniq([...(prev.categories.removed || []), name])
              }
            }
          : prev
      );
      setSelected((cur) =>
        cur
          ? {
              ...cur,
              categories: cur.categories.filter((c) => c !== name),
              autoCategories: cur.autoCategories.filter((c) => c !== name)
            }
          : cur
      );
      pushToast(
        'ok',
        t('toast.tagDeleted', { name }),
        affected
          ? t('toast.tagDeletedAffected', { n: affected })
          : t('toast.tagDeletedHint')
      );
    },
    [pushToast]
  );

  async function saveSettings(s: AppSettings) {
    await api.saveSettings(s);
    await refresh();
  }

  return (
    <div className="app" key={lang}>
      <Sidebar
        view={view}
        onChange={setView}
        modCount={mods.length}
        listCount={modlists.length}
        isMock={isMock}
      />

      <div className="main">
        <div className="topbar">
          <div>
            <div className="page-title">{t(TITLES[view].titleKey)}</div>
            <div className="page-sub">{t(TITLES[view].subKey)}</div>
          </div>
          <span className="spacer" />
          {pendingInstall > 0 && (
            <button
              className="btn"
              onClick={() => setSyncOpen(true)}
              title={t('top.syncToGameTip', { n: pendingInstall })}
              style={{ borderColor: 'var(--warn)' }}
            >
              <IconDownload size={15} />
              {t('top.syncToGame')}
              <span className="badge st-older">{pendingInstall}</span>
            </button>
          )}
          <button
            className="btn"
            onClick={() => {
              setBackupScope('all');
              setBackupOpen(true);
            }}
            title={t('top.backupWorkshopTip')}
          >
            <IconDownload size={15} />
            {t('top.backupWorkshop')}
          </button>
          <button className="btn" onClick={refresh} disabled={loading}>
            <IconRefresh size={15} />
            {loading ? t('common.loading') : t('top.rescan')}
          </button>
          <button className="btn primary" onClick={launchGame} title={t('top.launchGame')}>
            <IconPlay size={15} />
            {t('top.launchGame')}
          </button>
        </div>

        <div className="content">
          {features.autoUpdater && update && update.latestVersion !== dismissedVersion && (
            <UpdateBanner
              state={update}
              onDownload={downloadUpdate}
              onInstall={installUpdate}
              onDismiss={() => setDismissedVersion(update.latestVersion)}
            />
          )}

          {shouldShowWorkshopUpdate(workshopUpdate) &&
            workshopUpdate &&
            workshopUpdate.workshopVersion !== dismissedWorkshopVersion && (
              <WorkshopUpdateBanner
                info={workshopUpdate}
                onDismiss={() => setDismissedWorkshopVersion(workshopUpdate.workshopVersion)}
              />
            )}

          {isMock && (
            <div className="warn-bar">
              <IconAlert size={16} />
              <div>
                {t('mock.barPre')}
                <b>{t('mock.barBold')}</b>
                {t('mock.barPost')}
              </div>
            </div>
          )}

          {view === 'library' && (
            <LibraryView
              mods={mods}
              categories={categories}
              loading={loading && !data}
              onOpenMod={setSelected}
              onBackupDelisted={() => {
                setBackupScope('delisted');
                setBackupOpen(true);
              }}
            />
          )}

          {features.browseWorkshop && view === 'browse' && (
            <BrowseView mods={mods} onToast={pushToast} onGoSettings={() => setView('settings')} />
          )}

          {view === 'collections' && (
            <CollectionsView
              mods={mods}
              modlists={modlists}
              applied={data?.applied || null}
              reloadToken={reloadToken}
              onRefresh={refresh}
              onToast={pushToast}
            />
          )}

          {view === 'saves' && (
            <SavesView modlists={modlists} onRefresh={refresh} onToast={pushToast} />
          )}

          {view === 'settings' && data && (
            <SettingsView
              settings={data.settings}
              onSave={saveSettings}
              onToast={pushToast}
              update={update}
              onCheckUpdate={checkUpdate}
              onDownloadUpdate={downloadUpdate}
              onInstallUpdate={installUpdate}
              lang={lang}
              onChangeLang={changeLang}
              appVersion={workshopUpdate?.currentVersion || update?.currentVersion || ''}
              workshopCheck={{
                delisted: data.checksDelisted || 0,
                unknown: data.checksUnknown || 0,
                lastAt: data.checksCheckedAt || 0,
                checking: checkingWorkshop,
                mode: data.checksMode || 'page',
                apiKey: steamApiKey
              }}
              onRecheckWorkshop={recheckWorkshop}
              onSaveApiKey={saveSteamApiKey}
            />
          )}
        </div>
      </div>

      {selected && (
        <ModDetailModal
          mod={selected}
          allMods={mods}
          allCategories={allCategories}
          modlists={modlists}
          relations={data?.relations || {}}
          onSetRelations={setRelations}
          onSetModlistMembership={setModlistMembership}
          onCreateModlistWith={createModlistWith}
          onCreateTag={addCustomTag}
          onDeleteTag={deleteTag}
          onLocalModDeleted={handleLocalModDeleted}
          onRefresh={refresh}
          onClose={() => setSelected(null)}
          onToast={pushToast}
          onModUpdate={updateMod}
        />
      )}

      {backupOpen && (
        <BackupModal
          scope={backupScope}
          onClose={() => setBackupOpen(false)}
          onToast={pushToast}
          onDone={refresh}
        />
      )}

      {syncOpen && (
        <SyncModal onClose={() => setSyncOpen(false)} onToast={pushToast} onDone={refresh} />
      )}

      <Toasts items={toasts} onClose={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </div>
  );
}
