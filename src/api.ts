import type {
  AppSettings,
  CategoryData,
  ModlistEntry,
  ModlistFull,
  ModlistSummary,
  ScanResult,
  UpdateState,
  Snapshot,
  SnapshotList,
  BackupPlan,
  BackupProgress,
  BackupResult,
  LocalModFootprint,
  DeleteLocalModResult,
  WorkshopDetails,
  ModInfo,
  AppliedInfo,
  WorkshopCheckRefresh,
  SaveList,
  InstallSyncPlan,
  InstallSyncItem,
  InstallSyncProgress,
  InstallSyncResult,
  BrowseItem,
  BrowseResult,
  BrowseTagsResult,
  WorkshopMedia,
  WorkshopSort
} from './types';
import { buildMockScan, mockCategories, mockModlists, mockSettings } from './mock';
import { autoCategorize } from './categories';

declare global {
  interface Window {
    api?: any;
  }
}

const real: any = typeof window !== 'undefined' && (window as any).api ? (window as any).api : null;

/** true 表示当前运行在浏览器预览模式（无 Electron 后端），使用内置示例数据 */
export const isMock = !real;

/* ----------------------- 浏览器预览用的内存状态 ----------------------- */

const scan = buildMockScan();
let state = {
  mods: scan.mods.map((m) => ({ ...m })),
  modlists: JSON.parse(JSON.stringify(mockModlists)) as ModlistFull[],
  categories: JSON.parse(JSON.stringify(mockCategories)) as CategoryData,
  settings: { ...mockSettings },
  // 预览模式给一组示例关联：整合包依赖 LuaCs 框架
  relations: {
    'workshop:3100128373': ['workshop:2559634234', 'workshop:2683570256']
  } as Record<string, string[]>,
  apiKey: '',
  /** 预览模式：点过「同步到游戏」之后就不再提示待同步 */
  syncDone: false
};

/** 预览模式：把第一个合集的内容当作「游戏当前应用」的 mod */
function appliedKeys(): string[] {
  const first = state.modlists[0];
  if (!first) return [];
  return first.entries.map((e) =>
    e.type === 'workshop' ? `workshop:${e.id}` : `local:${e.name}`
  );
}

function summaries(): ModlistSummary[] {
  const keys = appliedKeys();
  const set = new Set(keys);
  return state.modlists.map((l) => {
    const own = l.entries.map((e) =>
      e.type === 'workshop' ? `workshop:${e.id}` : `local:${e.name}`
    );
    return {
      fileName: l.fileName,
      name: l.name,
      count: l.entries.length,
      matchesApplied: keys.length > 0 && own.length === set.size && own.every((k) => set.has(k))
    };
  });
}

function refreshUsedIn() {
  for (const m of state.mods) m.usedIn = [];
  for (const list of state.modlists) {
    for (const e of list.entries) {
      const target =
        e.type === 'workshop'
          ? state.mods.find((m) => m.source === 'workshop' && m.id === e.id)
          : state.mods.find((m) => m.source === 'local' && m.id === e.name);
      if (target && !target.usedIn.includes(list.name)) target.usedIn.push(list.name);
    }
  }
}

/** 预览模式：把最后两个工坊 mod 假装成「作者已下架」 */
function mockChecks(): Record<string, { exists: boolean; checkedAt: number }> {
  const now = Date.now();
  const out: Record<string, { exists: boolean; checkedAt: number }> = {};
  for (const m of state.mods) {
    if (m.source === 'workshop') out[m.id] = { exists: true, checkedAt: now };
    else if (m.steamworkshopid) out[m.steamworkshopid] = { exists: true, checkedAt: now };
  }
  for (const m of state.mods.filter((x) => x.source === 'workshop').slice(-2)) {
    out[m.id] = { exists: false, checkedAt: now };
  }
  return out;
}

function isDelistedMock(checks: Record<string, { exists?: boolean }>, id?: string | null): boolean {
  if (!id) return false;
  const c = checks[id];
  return !!c && c.exists === false;
}

/** 预览模式下的更新状态：没有安装包，直接告诉界面"不支持" */
function mockUpdateState(): UpdateState {
  return {
    status: 'unsupported',
    supported: false,
    currentVersion: '0.1.0',
    latestVersion: null,
    releaseNotes: null,
    releaseDate: null,
    progress: null,
    error: null,
    checkedAt: null
  };
}

/** 预览模式用：合集名 → 文件名（跟 ui.ts 的 safeFileName 一个规则） */
function safeFileNameForMock(name: string): string {
  const cleaned = String(name || '').replace(/[\\/:*?"<>|]/g, '_').trim();
  return `${cleaned || '未命名'}.xml`;
}

/** 预览模式用：把版本号最后一段 +1，好演示「游戏里 v1.0 → Steam v1.1」 */
function bumpVersion(v: string | null | undefined): string {
  const s = String(v || '1.0');
  const parts = s.split('.');
  const last = Number(parts[parts.length - 1]);
  if (Number.isFinite(last)) parts[parts.length - 1] = String(last + 1);
  else parts.push('1');
  return parts.join('.');
}

/** 预览模式用：把版本号最后一段 -1（演示「游戏里装的是旧版」） */
function prevVersion(v: string | null | undefined): string {
  const s = String(v || '1.0');
  const parts = s.split('.');
  const last = Number(parts[parts.length - 1]);
  if (Number.isFinite(last)) parts[parts.length - 1] = String(Math.max(0, last - 1));
  return parts.join('.');
}

const mockApi = {  getSettings: async (): Promise<AppSettings> => ({ ...state.settings }),
  saveSettings: async (s: AppSettings): Promise<ScanResult> => {
    state.settings = { ...s };
    return mockApi.scan();
  },
  pickFolder: async (_title?: string): Promise<string | null> => null,
  pickFile: async (_title?: string, _filters?: unknown): Promise<string | null> => null,
  pathExists: async (_p: string): Promise<boolean> => true,
  detectPaths: async (): Promise<AppSettings> => ({ ...state.settings }),

  scan: async (): Promise<ScanResult> => {
    refreshUsedIn();
    const checks = mockChecks();
    const localWsIds = new Set(
      state.mods.filter((m) => m.source === 'local' && m.steamworkshopid).map((m) => m.steamworkshopid!)
    );
    // 预览模式：拿第一个工坊 mod 假装「Steam 已下载、游戏还没装」，好把「同步到游戏」撑起来
    const pendingId =
      state.syncDone ? null : state.mods.find((m) => m.source === 'workshop')?.id || null;
    // 每次返回全新的数组/对象，跟真实后端 scanAll() 的行为一致。
    // 否则 useMemo 按引用比较会认为数据没变，界面不会重算 —— 比如更新完 mod 后
    // 「有更新」的数量不会往下掉。
    return {
      mods: state.mods.map((m) => ({
        ...m,
        delisted:
          m.source === 'workshop'
            ? isDelistedMock(checks, m.id)
            : isDelistedMock(checks, m.steamworkshopid),
        backedUpLocally: m.source === 'workshop' ? localWsIds.has(m.id) : true,
        installPending: m.source === 'workshop' && m.id === pendingId,
        installInstalledVersion:
          m.source === 'workshop' && m.id === pendingId ? prevVersion(m.modVersion) : null
      })),
      modlists: summaries(),
      categories: {
        mods: { ...state.categories.mods },
        custom: [...state.categories.custom],
        removed: [...state.categories.removed]
      },
      settings: { ...state.settings },
      warnings: [],
      applied: { available: true, reason: null, keys: appliedKeys(), missing: [] },
      relations: { ...state.relations },
      checksStale: false,
      checksDelisted: Object.values(checks).filter((c) => c.exists === false).length,
      checksUnknown: 0,
      checksMode: state.apiKey ? 'apikey' : 'page',
      checksCheckedAt: Date.now(),
      installPendingCount: pendingId ? 1 : 0
    };
  },

  refreshWorkshopChecks: async (): Promise<WorkshopCheckRefresh> => ({
    checks: mockChecks(),
    apiKeyError: null,
    mode: 'page'
  }),

  // Steam Web API Key
  getSteamApiKey: async (): Promise<string> => state.apiKey,
  setSteamApiKey: async (key: string): Promise<string> => {
    state.apiKey = String(key || '').trim();
    return state.apiKey;
  },

  getModlist: async (fileName: string): Promise<ModlistFull | null> => {
    const l = state.modlists.find((x) => x.fileName === fileName);
    return l ? (JSON.parse(JSON.stringify(l)) as ModlistFull) : null;
  },
  saveModlist: async (fileName: string, name: string, entries: ModlistEntry[]): Promise<void> => {
    const idx = state.modlists.findIndex((l) => l.fileName === fileName);
    const payload: ModlistFull = { fileName, name, entries };
    if (idx >= 0) state.modlists[idx] = payload;
    else state.modlists.push(payload);
    refreshUsedIn();
  },

  /** 把某个 mod 加入合集（合集不存在时自动创建） */
  addModToModlist: async (fileName: string, name: string, entry: ModlistEntry): Promise<void> => {
    let list = state.modlists.find((l) => l.fileName === fileName);
    if (!list) {
      list = { fileName, name, entries: [] };
      state.modlists.push(list);
    }
    const dup =
      entry.type === 'workshop'
        ? list.entries.some((e) => e.type === 'workshop' && e.id === entry.id)
        : list.entries.some((e) => e.type === 'local' && e.name === entry.name);
    if (!dup) list.entries.push(entry);
    refreshUsedIn();
  },

  /** 把某个 mod 从合集移出 */
  removeModFromModlist: async (fileName: string, entry: ModlistEntry): Promise<void> => {
    const list = state.modlists.find((l) => l.fileName === fileName);
    if (!list) return;
    list.entries = list.entries.filter((e) =>
      entry.type === 'workshop'
        ? !(e.type === 'workshop' && e.id === entry.id)
        : !(e.type === 'local' && e.name === entry.name)
    );
    refreshUsedIn();
  },
  deleteModlist: async (fileName: string): Promise<void> => {
    state.modlists = state.modlists.filter((l) => l.fileName !== fileName);
    refreshUsedIn();
  },

  /* ------------- 合集导入 / 导出（预览模式下只做界面演示） ------------- */

  exportModlistFile: async (
    _name: string,
    _entries: ModlistEntry[],
    format: string,
    _note?: string
  ): Promise<{ ok: boolean; canceled?: boolean; path?: string }> => ({
    ok: false,
    canceled: true,
    path: `（预览模式不会真的保存文件：${format}）`
  }),

  exportModlistText: async (name: string, entries: ModlistEntry[], _note?: string): Promise<string> => {
    const ws = entries.filter((e) => e.type === 'workshop');
    const local = entries.filter((e) => e.type === 'local');
    const lines = [`【潜渊症合集】${name}`, `共 ${entries.length} 个 mod（工坊 ${ws.length} · 本地 ${local.length}）`, ''];
    for (const e of ws) {
      lines.push(
        `${e.id}  ${e.name || ''}  https://steamcommunity.com/sharedfiles/filedetails/?id=${e.id}`
      );
    }
    for (const e of local) lines.push(String(e.name || ''));
    return lines.join('\n');
  },

  previewImportModlist: async (payload: {
    path?: string;
    text?: string;
  }): Promise<{
    format: string;
    name: string;
    entries: ModlistEntry[];
    count: number;
    missingCount: number;
    missing: ModlistEntry[];
  }> => {
    const raw = String(payload?.text || '');
    const ids = [...raw.matchAll(/\b(\d{5,20})\b/g)].map((m) => m[1]);
    const entries: ModlistEntry[] = (ids.length ? ids : ['2559634234', '3343911734']).map((id) => ({
      type: 'workshop',
      id,
      name: state.mods.find((m) => m.id === id)?.name || null
    }));
    const missing = entries.filter((e) => !state.mods.some((m) => m.id === e.id));
    return {
      format: ids.length ? 'text' : '（预览示例）',
      name: '导入的合集',
      entries,
      count: entries.length,
      missingCount: missing.length,
      missing
    };
  },

  importModlist: async (payload: {
    entries: ModlistEntry[];
    name: string;
    apply?: boolean;
  }): Promise<{ ok: boolean; fileName: string; name: string; count: number }> => {
    const fileName = `${safeFileNameForMock(payload.name)}`;
    state.modlists.push({
      fileName,
      name: payload.name,
      entries: payload.entries.map((e) => ({ ...e }))
    });
    refreshUsedIn();
    return { ok: true, fileName, name: payload.name, count: payload.entries.length };
  },
  applyModlist: async (
    name: string,
    entries: ModlistEntry[]
  ): Promise<{
    ok: true;
    backup: string | null;
    backupName: string | null;
    changed: boolean;
    missing: string[];
    count: number;
    prunedBackups: string[];
  }> => {
    void name;
    void entries;
    return {
      ok: true,
      backup: null,
      backupName: null,
      changed: false,
      missing: [],
      count: 0,
      prunedBackups: []
    };
  },

  // 预览模式：拿示例合集编两个存档出来，好把界面撑起来
  listSaves: async (): Promise<SaveList> => {
    const resolve = (e: ModlistEntry) => {
      const m =
        e.type === 'workshop'
          ? state.mods.find((x) => x.source === 'workshop' && x.id === e.id)
          : state.mods.find((x) => x.source === 'local' && x.id === e.name);
      return m ? { source: m.source, id: m.id, name: m.name } : null;
    };
    const entriesOf = (i: number) => state.modlists[i]?.entries || [];
    const first = state.modlists[0];
    const second = state.modlists[1];
    const subset = entriesOf(1).slice(0, 2);

    return {
      saveDir: '（预览模式）%LOCALAPPDATA%\\Daedalic Entertainment GmbH\\Barotrauma',
      dirs: [
        { dir: '（预览模式）', source: 'single', exists: true },
        { dir: '（预览模式）\\Multiplayer', source: 'multi', exists: false }
      ],
      modlistCount: state.modlists.length,
      saves: [
        {
          file: '示例存档.save',
          path: '（预览模式）\\示例存档.save',
          name: '示例存档',
          source: 'single',
          size: 253605,
          saveTime: Date.now() - 3600_000,
          submarine: 'Helena-海伦娜-无模组自行大改',
          gameVersion: '1.13.4.0',
          isMultiplayer: false,
          mods: entriesOf(0).map((e) => ({ name: e.name || e.id || '', mod: resolve(e) })),
          missingCount: 0,
          match: first ? { fileName: first.fileName, name: first.name } : null,
          covers: [],
          coversTotal: first ? 1 : 0
        },
        {
          file: '示例存档 2.save',
          path: '（预览模式）\\示例存档 2.save',
          name: '示例存档 2',
          source: 'single',
          size: 195624,
          saveTime: Date.now() - 86400_000,
          submarine: '儒艮2',
          gameVersion: '1.13.4.0',
          isMultiplayer: false,
          mods: subset.map((e) => ({ name: e.name || e.id || '', mod: resolve(e) })),
          missingCount: 1,
          match: null,
          covers: second
            ? [
                {
                  fileName: second.fileName,
                  name: second.name,
                  extra: entriesOf(1)
                    .slice(2)
                    .map((e) => e.name || e.id || '')
                }
              ]
            : [],
          coversTotal: second ? 1 : 0
        }
      ]
    };
  },

  fetchPreviews: async (_ids: string[]): Promise<void> => {},
  onPreviewReady: (_cb: (p: { id: string; localPath: string | null }) => void): (() => void) => () => {},

  // 预览模式下没有安装包，更新功能不可用
  updaterStatus: async (): Promise<UpdateState> => mockUpdateState(),
  updaterCheck: async (): Promise<UpdateState> => mockUpdateState(),
  updaterDownload: async (): Promise<UpdateState> => mockUpdateState(),
  updaterInstall: async (): Promise<boolean> => false,
  onUpdaterEvent: (_cb: (s: UpdateState) => void): (() => void) => () => {},

  // 预览模式下只是把示例数据装出来给界面看
  launchGame: async (): Promise<{ ok: boolean; via: string }> => ({ ok: true, via: 'preview' }),

  listSnapshots: async (_modName: string): Promise<SnapshotList> => ({
    items: [],
    summary: { count: 0, bytes: 0, latestAt: null }
  }),
  createSnapshot: async (_modName: string): Promise<Snapshot> => ({
    id: 'preview',
    at: Date.now(),
    bytes: 0,
    files: 0,
    label: '预览模式'
  }),
  restoreSnapshot: async (
    _modName: string,
    _id: string
  ): Promise<{ ok: boolean; undoId: string | null }> => ({ ok: true, undoId: null }),
  deleteSnapshot: async (_modName: string, _id: string): Promise<{ ok: boolean }> => ({ ok: true }),

  localModFootprint: async (_modName: string): Promise<LocalModFootprint> => ({
    exists: true,
    modBytes: 0,
    snapshotCount: 0,
    snapshotBytes: 0,
    totalBytes: 0
  }),
  deleteLocalMod: async (
    modName: string,
    removeFromModlists: boolean
  ): Promise<DeleteLocalModResult> => {
    const idx = state.mods.findIndex((m) => m.source === 'local' && m.id === modName);
    if (idx >= 0) state.mods.splice(idx, 1);
    const removedFromModlists: string[] = [];
    if (removeFromModlists) {
      for (const l of state.modlists) {
        const before = l.entries.length;
        l.entries = l.entries.filter((e) => !(e.type === 'local' && e.name === modName));
        if (l.entries.length !== before) removedFromModlists.push(l.name);
      }
    }
    refreshUsedIn();
    return { freedBytes: 0, snapshotCount: 0, removedFromModlists };
  },

  planWorkshopBackup: async (scope?: string): Promise<BackupPlan> => {
    // 已经有本地副本的（按 steamworkshopid 认）算「更新」，和真实后端一致
    const localByWsId = new Map<string, ModInfo>();
    for (const m of state.mods) {
      if (m.source === 'local' && m.steamworkshopid && !localByWsId.has(m.steamworkshopid)) {
        localByWsId.set(m.steamworkshopid, m);
      }
    }

    const checks = mockChecks();
    const onlyDelisted = scope === 'delisted';

    const items = state.mods
      .filter((m) => m.source === 'workshop')
      .filter((m) => !onlyDelisted || isDelistedMock(checks, m.id))
      .map((m, i) => {
        const local = localByWsId.get(m.id);
        return {
          id: m.id,
          name: m.name,
          folder: local ? local.id : m.name,
          source: m.path,
          bytes: 32 * 1024 * 1024 + i * 1_500_000,
          files: 120 + i * 7,
          existing: !!local,
          delisted: isDelistedMock(checks, m.id),
          installedOnly: false
        };
      });

    const updateCount = items.filter((x) => x.existing).length;
    return {
      items,
      skipped: [],
      totalBytes: items.reduce((s, x) => s + x.bytes, 0),
      totalFiles: items.reduce((s, x) => s + x.files, 0),
      updateCount,
      newCount: items.length - updateCount
    };
  },
  startWorkshopBackup: async (scope?: string): Promise<BackupResult> => {
    const plan = await mockApi.planWorkshopBackup(scope);
    // 预览模式把「更新已有本地副本」这一步做实：版本对齐、对比状态变为一致，
    // 这样界面上的「有更新」数量会真的往下掉，相关逻辑才测得到
    for (const item of plan.items) {
      if (!item.existing) continue;
      const local = state.mods.find((x) => x.source === 'local' && x.steamworkshopid === item.id);
      const ws = state.mods.find((x) => x.source === 'workshop' && x.id === item.id);
      if (local && ws && local.counterpart) {
        local.modVersion = ws.modVersion;
        local.counterpart = { ...local.counterpart, version: ws.modVersion, status: 'same' };
      }
    }
    return {
      done: plan.items.length,
      total: plan.items.length,
      bytesDone: plan.totalBytes,
      snapshotted: plan.updateCount,
      errors: [],
      folders: plan.items.map((x) => x.folder),
      skipped: []
    };
  },
  cancelWorkshopBackup: async (): Promise<boolean> => true,
  onBackupProgress: (_cb: (p: BackupProgress) => void): (() => void) => () => {},

  // 预览模式：假装有一个工坊 mod 的更新躺在 Steam 里还没装进游戏
  planInstallSync: async (): Promise<InstallSyncPlan> => {
    const m = state.syncDone ? null : state.mods.find((x) => x.source === 'workshop');
    const items: InstallSyncItem[] = m
      ? [
          {
            id: m.id,
            name: m.name,
            reason: 'outdated',
            steamVersion: m.modVersion || null,
            installedVersion: prevVersion(m.modVersion),
            installedTime: 1789125745,
            targetTime: 1789472317,
            bytes: 61969352,
            files: 980
          }
        ]
      : [];
    return {
      items,
      count: items.length,
      totalBytes: items.reduce((s, x) => s + x.bytes, 0),
      totalFiles: items.reduce((s, x) => s + x.files, 0),
      skippedDelisted: [],
      acfAvailable: true,
      acfReason: null,
      workshopDir: '（预览模式）\\steamapps\\workshop\\content\\602960',
      installedDir: '（预览模式）\\WorkshopMods\\Installed'
    };
  },
  startInstallSync: async (): Promise<InstallSyncResult> => {
    const p = await mockApi.planInstallSync();
    state.syncDone = true; // 预览模式：同步完就不该再提示
    return {
      synced: p.items.map((i) => ({ id: i.id, name: i.name, installTime: i.targetTime })),
      failed: [],
      bytes: p.totalBytes,
      cancelled: false
    };
  },
  cancelInstallSync: async (): Promise<boolean> => true,
  onInstallSyncProgress: (_cb: (p: InstallSyncProgress) => void): (() => void) => () => {},

  // 预览模式：拿内置示例数据假装是工坊搜索结果
  browseWorkshop: async (params?: any): Promise<BrowseResult> => {
    const sort: WorkshopSort = (params?.sort as WorkshopSort) || 'popular';
    const search = String(params?.search || '').trim();
    const tags: string[] = Array.isArray(params?.tags) ? params.tags : [];
    const page = Number(params?.page || 1);
    const per = 24;
    const base: BrowseItem[] = state.mods
      .filter((m) => m.source === 'workshop')
      .slice(0, 30)
      .map((m, i) => ({
        id: m.id,
        title: m.name,
        previewUrl: null,
        subscriptions: 686618 - i * 41235,
        favorited: 24273 - i * 1337,
        views: 554390 - i * 8211,
        timeUpdated: Math.floor(Date.now() / 1000) - i * 86400,
        fileSize: 1024 * 1024 * (12 + i * 7),
        tags: ['Item', 'Submarine', 'Art', 'Total conversion', 'QOL'].slice(0, (i % 4) + 1),
        pageUrl: `https://steamcommunity.com/sharedfiles/filedetails/?id=${m.id}`
      }));
    const filtered = base.filter((x) => {
      if (search && !x.title.toLowerCase().includes(search.toLowerCase())) return false;
      // 多个分类是 AND（跟 Steam 工坊一致）
      if (tags.length && !tags.every((t) => x.tags.includes(t))) return false;
      return true;
    });
    const start = (Math.max(1, page) - 1) * per;
    return {
      needsKey: false,
      error: null,
      total: tags.length ? filtered.length : 82890,
      page: Math.max(1, page),
      numPerPage: per,
      sort,
      search,
      tags,
      items: filtered.slice(start, start + per)
    };
  },
  browseWorkshopTags: async (): Promise<BrowseTagsResult> => ({    needsKey: false,
    error: null,
    tags: [
      { tag: 'Item', count: 68 },
      { tag: 'Submarine', count: 38 },
      { tag: 'Art', count: 36 },
      { tag: 'Total conversion', count: 30 },
      { tag: 'Item assembly', count: 30 },
      { tag: 'Mission', count: 28 },
      { tag: 'Environment', count: 28 },
      { tag: 'Monster', count: 27 },
      { tag: 'Event set', count: 26 },
      { tag: 'Client-side', count: 24 },
      { tag: 'Equipment', count: 24 },
      { tag: 'QOL', count: 23 },
      { tag: 'Server-side', count: 18 },
      { tag: 'Weapons', count: 18 },
      { tag: 'Gameplay mechanics', count: 15 },
      { tag: 'Medical', count: 10 },
      { tag: 'Language', count: 10 },
      { tag: 'Wreck', count: 5 },
      { tag: 'Game mode', count: 5 },
      { tag: 'Outpost', count: 4 },
      { tag: 'Beacon station', count: 4 },
      { tag: 'Library', count: 3 },
      { tag: 'Ruin', count: 1 }
    ]
  }),

  // 预览模式：假装翻译了一下（真实翻译走 MyMemory 免费接口）
  translateText: async (
    text: string
  ): Promise<{ ok: boolean; text: string; chunks: number; cached?: boolean; error?: string }> => ({
    ok: true,
    text: `【预览模式的示例翻译】${String(text || '').slice(0, 120)}`,
    chunks: 1
  }),

  // 预览模式：没有截图（线上要读工坊页面），但只要不报错，详情弹窗就能走通
  getWorkshopMedia: async (id: string, _force?: boolean): Promise<WorkshopMedia> => ({
    id: String(id || ''),
    cover: null,
    screenshots: [],
    missing: false,
    error: null
  }),

  // 预览模式：给一段示例描述，用来展示工坊描述的排版效果
  getWorkshopDetails: async (id: string, _force?: boolean): Promise<WorkshopDetails | null> => {
    const m = state.mods.find((x) => x.source === 'workshop' && x.id === id);
    if (!m) return null;
    return {
      id,
      title: m.name,
      description: [
        // 预览模式刻意用**英文**描述：真实场景里作者常常只写了英文，
        // 界面要能正确显示「只有原文」+「翻译成中文」按钮
        '[h1]About this mod[/h1]',
        '[b]This is the sample description used in preview mode[/b], showing how a workshop description is laid out. ' +
          'At runtime this is whatever the author wrote, often several thousand characters ' +
          '(LuaCsForBarotrauma has about 6,500), so this sample is deliberately long to exercise long-description layout.',
        '',
        '[h2]Features[/h2]',
        '[list]',
        '[*]Adds a batch of new items and equipment',
        '[*]Rebalances part of the damage numbers',
        '[*]Fixes several known issues',
        '[*]Improves the UI layout and handling',
        '[*]Includes translated text',
        '[/list]',
        '',
        '[h2]Requirements and compatibility[/h2]',
        'Requires [b]LuaCsForBarotrauma[/b].',
        'See [url=https://steamcommunity.com/sharedfiles/filedetails/?id=2559634234]this page[/url] for details.',
        '',
        '[h2]Installation[/h2]',
        'Subscribe and enable it in the in-game mod list. If you also run mods that change the same content, ' +
          'mind the load order: this mod should load [b]after[/b] them, otherwise its changes get overwritten.',
        '',
        '[h2]FAQ[/h2]',
        '[list]',
        '[*]Q: It reports a missing file? A: Make sure the required mod is enabled.',
        '[*]Q: My config change did nothing? A: Quit the game and apply the collection again.',
        '[*]Q: It conflicts with another mod? A: Move this mod further down the list.',
        '[/list]',
        '',
        '[h3]Changelog[/h3]',
        '[list]',
        '[*]Fixed several misplaced textures',
        '[*]Added two pieces of equipment',
        '[*]Adjusted drop rates',
        '[/list]',
        '',
        '[quote]If you like this mod, consider adding it to your favorites. [/quote]',
        '',
        '[hr][/hr]',
        '[i]This section exists to verify that a long description scrolls the whole dialog instead of nesting its own scrollbar.[/i]'
      ].join('\n'),
      previewUrl: null,
      tags: m.autoCategories,
      localized: false, // 预览：作者没写中文，界面应该给出「翻译成中文」
      timeCreated: Math.floor(Date.now() / 1000) - 86400 * 400,
      timeUpdated: Math.floor(Date.now() / 1000) - 86400 * 12,
      fileSize: 42 * 1024 * 1024,
      subscriptions: 12345,
      favorited: 678,
      views: 90123,
      banned: false,
      banReason: null,
      fetchedAt: Date.now()
    };
  },

  setLocalCover: async (sourceId: string): Promise<string | null> => {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = () => {
        const f = input.files && input.files[0];
        if (!f) return resolve(null);
        resolve(URL.createObjectURL(f));
      };
      input.click();
    });
  },

  getCategories: async (): Promise<CategoryData> => state.categories,
  setModCategories: async (sourceId: string, tags: string[]): Promise<CategoryData> => {
    if (tags.length) state.categories.mods[sourceId] = tags;
    else delete state.categories.mods[sourceId];
    const m = state.mods.find((x) => `${x.source}:${x.id}` === sourceId);
    if (m) m.categories = tags;
    return state.categories;
  },
  saveCategories: async (data: CategoryData): Promise<CategoryData> => {
    state.categories = {
      mods: data.mods || {},
      custom: data.custom || [],
      removed: data.removed || []
    };
    return state.categories;
  },
  /** 新建一个自定义标签（返回更新后的分类数据） */
  addCustomCategory: async (name: string): Promise<CategoryData> => {
    const n = (name || '').trim();
    if (!n) return state.categories;
    if (!state.categories.custom.includes(n)) state.categories.custom.push(n);
    // 重新创建同名标签 → 从「已删除」里拿回来
    state.categories.removed = state.categories.removed.filter((x) => x !== n);
    return state.categories;
  },
  /** 关联 mod（前置需求） */
  setRelations: async (key: string, keys: string[]): Promise<Record<string, string[]>> => {
    const k = (key || '').trim();
    const list = Array.from(new Set((keys || []).map((x) => (x || '').trim()).filter((x) => x && x !== k)));
    const next = { ...state.relations };
    if (list.length) next[k] = list;
    else delete next[k];
    state.relations = next;
    return { ...next };
  },
  /** 删除标签：从自定义列表与所有 mod 上移除，并记入 removed */
  deleteCategory: async (
    name: string
  ): Promise<{ categories: CategoryData; affected: number }> => {
    const n = (name || '').trim();
    if (!n) return { categories: state.categories, affected: 0 };

    state.categories.custom = state.categories.custom.filter((x) => x !== n);

    let affected = 0;
    for (const key of Object.keys(state.categories.mods)) {
      if (!state.categories.mods[key].includes(n)) continue;
      affected++;
      const next = state.categories.mods[key].filter((x) => x !== n);
      if (next.length) state.categories.mods[key] = next;
      else delete state.categories.mods[key];
    }
    if (!state.categories.removed.includes(n)) state.categories.removed.push(n);

    // 同步到 mod 对象，让界面立刻反映（自动分类要重算，保证可恢复）
    for (const m of state.mods) {
      m.categories = state.categories.mods[`${m.source}:${m.id}`] || [];
      m.autoCategories = autoCategorize(m.name).filter(
        (c) => !state.categories.removed.includes(c)
      );
    }
    return { categories: state.categories, affected };
  },

  getVersionDiff: async (localId: string): Promise<any> => {
    const m = state.mods.find((x) => x.source === 'local' && x.id === localId);
    return m ? { local: m, workshop: m.counterpart } : null;
  },
  overwriteLocalWithWorkshop: async (
    localId?: string,
    workshopId?: string
  ): Promise<{ ok: true; snapshotId: string }> => {
    // 预览模式把覆盖做实：本地版本对齐工坊版，对比状态变为一致
    const local = state.mods.find((x) => x.source === 'local' && x.id === localId);
    const ws = state.mods.find((x) => x.source === 'workshop' && x.id === workshopId);
    if (local && ws && local.counterpart) {
      local.modVersion = ws.modVersion;
      local.counterpart = { ...local.counterpart, version: ws.modVersion, status: 'same' };
    }
    return { ok: true, snapshotId: 'preview' };
  },
  copyWorkshopToLocal: async (
    _workshopId?: string,
    _newName?: string
  ): Promise<{ ok: true; newFolder: string }> => ({
    ok: true,
    newFolder: '（预览模式未真正复制）'
  }),

  openPath: async (_p?: string): Promise<void> => {},
  openModFolder: async (_p?: string): Promise<void> => {},
  openExternal: async (_url?: string): Promise<void> => {},
  getWorkshopPage: async (_id?: string): Promise<void> => {},
  openWorkshopInSteam: async (
    id?: string
  ): Promise<{ ok: boolean; via: string; url: string; error?: string }> => ({
    ok: true,
    via: 'preview',
    url: `steam://url/CommunityFilePage/${id || ''}`
  })
};

export const api: typeof mockApi = real || mockApi;

/** 把封面值转成 <img src> 可用的地址 */
export function imgSrc(preview: string | null | undefined): string | null {
  if (!preview) return null;
  if (/^(https?:|blob:|data:)/i.test(preview)) return preview;
  return 'local-img://local/?p=' + encodeURIComponent(preview);
}

/** 名称 → 稳定的占位色（深海色系：青绿 → 蓝 → 靛紫，保证网格整体协调） */
export function placeholderHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 100000;
  return 168 + (h % 112);
}
