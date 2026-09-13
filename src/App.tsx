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
import SettingsView from './components/SettingsView';
import ModDetailModal from './components/ModDetailModal';
import UpdateBanner from './components/UpdateBanner';
import Toasts, { type ToastItem } from './components/Toasts';
import { IconAlert, IconRefresh } from './components/Icons';

const TITLES: Record<ViewKey, { title: string; sub: string }> = {
  library: { title: 'Mod 库', sub: '浏览本地与创意工坊 mod，查看版本对比与分类' },
  collections: { title: '合集', sub: '编排 mod 加载顺序，一键应用到游戏' },
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

  /** 在 mod 详情页直接加入 / 移出合集 */
  const setModlistMembership = useCallback(
    async (m: ModInfo, list: { fileName: string; name: string }, add: boolean) => {
      const entry: ModlistEntry =
        m.source === 'workshop'
          ? { type: 'workshop', name: m.name, id: m.id }
          : { type: 'local', name: m.id };
      try {
        if (add) await api.addModToModlist(list.fileName, list.name, entry);
        else await api.removeModFromModlist(list.fileName, entry);
      } catch (e: any) {
        pushToast('err', add ? '加入合集失败' : '移出合集失败', String(e?.message || e));
        return;
      }

      const adjust = (names: string[]) =>
        add ? uniq([...names, list.name]) : names.filter((n) => n !== list.name);

      setData((prev) => {
        if (!prev) return prev;
        const exists = prev.modlists.some((l) => l.fileName === list.fileName);
        return {
          ...prev,
          mods: prev.mods.map((x) =>
            x.source === m.source && x.id === m.id ? { ...x, usedIn: adjust(x.usedIn) } : x
          ),
          modlists: exists
            ? prev.modlists.map((l) =>
                l.fileName === list.fileName
                  ? { ...l, count: Math.max(0, l.count + (add ? 1 : -1)) }
                  : l
              )
            : [...prev.modlists, { fileName: list.fileName, name: list.name, count: 1 }]
        };
      });
      setSelected((cur) =>
        cur && cur.source === m.source && cur.id === m.id
          ? { ...cur, usedIn: adjust(cur.usedIn) }
          : cur
      );
      setReloadToken((n) => n + 1);
      pushToast('ok', add ? `已加入合集「${list.name}」` : `已从合集「${list.name}」移出`);
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
          <button className="btn" onClick={refresh} disabled={loading}>
            <IconRefresh size={15} />
            {loading ? '读取中…' : '重新扫描'}
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
            />
          )}

          {view === 'collections' && (
            <CollectionsView
              mods={mods}
              modlists={modlists}
              reloadToken={reloadToken}
              onRefresh={refresh}
              onToast={pushToast}
            />
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
            />
          )}
        </div>
      </div>

      {selected && (
        <ModDetailModal
          mod={selected}
          allCategories={allCategories}
          modlists={modlists}
          onSetModlistMembership={setModlistMembership}
          onCreateModlistWith={createModlistWith}
          onCreateTag={addCustomTag}
          onDeleteTag={deleteTag}
          onClose={() => setSelected(null)}
          onToast={pushToast}
          onModUpdate={updateMod}
        />
      )}

      <Toasts items={toasts} onClose={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </div>
  );
}
