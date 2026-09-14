import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, isMock } from './api';
import type {
  AppSettings,
  ModInfo,
  ModlistEntry,
  ModlistSummary,
  ScanResult,
  UpdateState,
  ViewKey
} from './types';
import { ALL_CATEGORIES } from './categories';
import { safeFileName, uniq } from './ui';
import Sidebar from './components/Sidebar';
import LibraryView from './components/LibraryView';
import CollectionsView from './components/CollectionsView';
import SavesView from './components/SavesView';
import SettingsView from './components/SettingsView';
import ModDetailModal from './components/ModDetailModal';
import UpdateBanner from './components/UpdateBanner';
import BackupModal from './components/BackupModal';
import Toasts, { type ToastItem } from './components/Toasts';
import { IconAlert, IconDownload, IconPlay, IconRefresh } from './components/Icons';

const TITLES: Record<ViewKey, { title: string; sub: string }> = {
  library: { title: 'Mod 库', sub: '浏览本地与创意工坊 mod，查看版本对比与分类' },
  collections: { title: '合集', sub: '编排 mod 加载顺序，一键应用到游戏' },
  saves: { title: '存档', sub: '查看每个存档当时启用了哪些 mod，找到能用它实现该存档的合集' },
  settings: { title: '设置', sub: '指定游戏与 mod 目录位置' }
};

export default function App() {
  const [view, setView] = useState<ViewKey>('library');
  const [data, setData] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ModInfo | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [reloadToken, setReloadToken] = useState(0);
  const [update, setUpdate] = useState<UpdateState | null>(null);
  const [backupOpen, setBackupOpen] = useState(false);
  const [backupScope, setBackupScope] = useState<'all' | 'delisted'>('all');
  /** 用户点了「稍后」的版本号，同一个版本不再弹 */
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const toastSeq = useRef(0);

  const pushToast = useCallback(
    (kind: ToastItem['kind'], title: string, msg?: string) => {
      const id = ++toastSeq.current;
      setToasts((t) => [...t, { id, kind, title, msg }]);
      window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5200);
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
      pushToast('err', '读取 mod 目录失败', String(e?.message || e));
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
          pushToast('err', 'API Key 不可用，已退回网页检查', r.apiKeyError);
        } else if (gone > 0) {
          pushToast('warn', `发现 ${gone} 个 mod 已被工坊下架`, '点工具栏「已下架」查看');
        } else if (unknown > 0) {
          pushToast(
            'info',
            '下架检查没能全部完成',
            `有 ${unknown} 个条目没查到（成人内容需要登录才能看）—— 在设置里填个 Steam API Key 就能可靠检查`
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
    setCheckingWorkshop(true);
    try {
      const r = await api.refreshWorkshopChecks();
      await refresh();
      const list = Object.values(r.checks || {});
      const gone = list.filter((c) => c.exists === false).length;
      const unknown = list.filter((c) => c.exists === null).length;
      if (r.apiKeyError) {
        pushToast('err', 'API Key 不可用', `${r.apiKeyError}（已退回网页检查）`);
        return;
      }
      pushToast(
        gone > 0 ? 'warn' : 'ok',
        gone > 0 ? `发现 ${gone} 个 mod 已被工坊下架` : '检查完成，没有发现被下架的 mod',
        unknown > 0
          ? `另有 ${unknown} 个条目没能核实（成人内容需登录）—— 填个 Steam API Key 就能可靠检查`
          : r.mode === 'apikey'
            ? '通过官方 API 检查'
            : '通过工坊网页检查'
      );
    } catch (e: any) {
      pushToast('err', '下架检查失败', String(e?.message || e));
    } finally {
      setCheckingWorkshop(false);
    }
  }, [refresh, pushToast]);

  /** Steam Web API Key（有就走官方接口，没有就抓网页） */
  const [steamApiKey, setSteamApiKeyState] = useState('');
  useEffect(() => {
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
        pushToast('ok', saved ? '已保存 API Key' : '已清空 API Key', saved ? '下次检查会走官方接口' : '将退回抓网页的方式');
      } catch (e: any) {
        pushToast('err', '保存失败', String(e?.message || e));
      }
    },
    [pushToast]
  );

  useEffect(() => {
    api.onPreviewReady((p: { id: string; localPath: string | null }) => {
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
  }, []);

  // 更新：注册事件推送 + 启动时静默检查一次
  useEffect(() => {
    api.onUpdaterEvent((s: UpdateState) => setUpdate(s));
    void (async () => {
      try {
        await api.updaterStatus();
        setUpdate(await api.updaterCheck());
      } catch {
        /* 检查更新失败不影响正常使用 */
      }
    })();
  }, []);

  const checkUpdate = useCallback(async () => {
    try {
      setUpdate(await api.updaterCheck());
    } catch (e: any) {
      pushToast('err', '检查更新失败', String(e?.message || e));
    }
  }, [pushToast]);

  const downloadUpdate = useCallback(async () => {
    try {
      setUpdate(await api.updaterDownload());
    } catch (e: any) {
      pushToast('err', '下载更新失败', String(e?.message || e));
    }
  }, [pushToast]);

  const installUpdate = useCallback(async () => {
    try {
      await api.updaterInstall();
    } catch (e: any) {
      pushToast('err', '启动安装失败', String(e?.message || e));
    }
  }, [pushToast]);

  const launchGame = useCallback(async () => {
    try {
      const r = await api.launchGame();
      pushToast('ok', '正在启动游戏', r && r.via === 'steam' ? '找不到游戏 exe，已交给 Steam 启动' : undefined);
    } catch (e: any) {
      pushToast('err', '启动游戏失败', String(e?.message || e));
    }
  }, [pushToast]);

  const handleLocalModDeleted = useCallback(() => {
    setSelected(null);
    void refresh();
  }, [refresh]);

  const mods = data?.mods || [];
  const modlists = data?.modlists || [];
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
        pushToast('err', add ? '加入合集失败' : '移出合集失败', String(e?.message || e));
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
            ? `已加入合集「${list.name}」（含 ${done.length - 1} 个关联 mod）`
            : `已加入合集「${list.name}」`
        );
      } else {
        pushToast('ok', `已从合集「${list.name}」移出`);
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
        pushToast('err', '保存关联失败', String(e?.message || e));
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
        pushToast('err', '新建标签失败', String(e?.message || e));
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
      pushToast('ok', `已新建标签「${name}」`);
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
        pushToast('err', '删除标签失败', String(e?.message || e));
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
        `已删除标签「${name}」`,
        affected
          ? `已从 ${affected} 个 mod 上移除（重新输入同名标签即可恢复）`
          : '重新输入同名标签即可恢复'
      );
    },
    [pushToast]
  );

  async function saveSettings(s: AppSettings) {
    await api.saveSettings(s);
    await refresh();
  }

  return (
    <div className="app">
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
            <div className="page-title">{TITLES[view].title}</div>
            <div className="page-sub">{TITLES[view].sub}</div>
          </div>
          <span className="spacer" />
          <button
            className="btn"
            onClick={() => {
              setBackupScope('all');
              setBackupOpen(true);
            }}
            title="把所有创意工坊 mod 复制一份到 LocalMods"
          >
            <IconDownload size={15} />
            备份工坊 mod
          </button>
          <button className="btn" onClick={refresh} disabled={loading}>
            <IconRefresh size={15} />
            {loading ? '读取中…' : '重新扫描'}
          </button>
          <button className="btn primary" onClick={launchGame} title="启动潜渊症">
            <IconPlay size={15} />
            启动游戏
          </button>
        </div>

        <div className="content">
          {update && update.latestVersion !== dismissedVersion && (
            <UpdateBanner
              state={update}
              onDownload={downloadUpdate}
              onInstall={installUpdate}
              onDismiss={() => setDismissedVersion(update.latestVersion)}
            />
          )}

          {isMock && (
            <div className="warn-bar">
              <IconAlert size={16} />
              <div>
                当前是<b>外观预览模式</b>：显示的是内置示例数据（内容取自你真实的 mod
                目录），不会读写你的磁盘。启动 Electron 客户端后即为真实数据。
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

      <Toasts items={toasts} onClose={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </div>
  );
}
