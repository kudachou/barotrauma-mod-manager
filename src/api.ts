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
  AppliedInfo
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
  } as Record<string, string[]>
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
    // 每次返回全新的数组/对象，跟真实后端 scanAll() 的行为一致。
    // 否则 useMemo 按引用比较会认为数据没变，界面不会重算 —— 比如更新完 mod 后
    // 「有更新」的数量不会往下掉。
    return {
      mods: [...state.mods],
      modlists: summaries(),
      categories: {
        mods: { ...state.categories.mods },
        custom: [...state.categories.custom],
        removed: [...state.categories.removed]
      },
      settings: { ...state.settings },
      warnings: [],
      applied: { available: true, reason: null, keys: appliedKeys(), missing: [] },
      relations: { ...state.relations }
    };
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
  applyModlist: async (
    name: string,
    entries: ModlistEntry[]
  ): Promise<{ ok: true; backup: string; missing: string[] }> => {
    void name;
    void entries;
    return { ok: true, backup: '（预览模式未真正写入 config_player.xml）', missing: [] };
  },

  fetchPreviews: async (_ids: string[]): Promise<void> => {},
  onPreviewReady: (_cb: (p: { id: string; localPath: string | null }) => void): void => {},

  // 预览模式下没有安装包，更新功能不可用
  updaterStatus: async (): Promise<UpdateState> => mockUpdateState(),
  updaterCheck: async (): Promise<UpdateState> => mockUpdateState(),
  updaterDownload: async (): Promise<UpdateState> => mockUpdateState(),
  updaterInstall: async (): Promise<boolean> => false,
  onUpdaterEvent: (_cb: (s: UpdateState) => void): void => {},

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

  planWorkshopBackup: async (): Promise<BackupPlan> => {
    // 已经有本地副本的（按 steamworkshopid 认）算「更新」，和真实后端一致
    const localByWsId = new Map<string, ModInfo>();
    for (const m of state.mods) {
      if (m.source === 'local' && m.steamworkshopid && !localByWsId.has(m.steamworkshopid)) {
        localByWsId.set(m.steamworkshopid, m);
      }
    }

    const items = state.mods
      .filter((m) => m.source === 'workshop')
      .map((m, i) => {
        const local = localByWsId.get(m.id);
        return {
          id: m.id,
          name: m.name,
          folder: local ? local.id : m.name,
          source: m.path,
          bytes: 32 * 1024 * 1024 + i * 1_500_000,
          files: 120 + i * 7,
          existing: !!local
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
  startWorkshopBackup: async (): Promise<BackupResult> => {
    const plan = await mockApi.planWorkshopBackup();
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
  onBackupProgress: (_cb: (p: BackupProgress) => void): void => {},

  // 预览模式：给一段示例描述，用来展示工坊描述的排版效果
  getWorkshopDetails: async (id: string): Promise<WorkshopDetails | null> => {
    const m = state.mods.find((x) => x.source === 'workshop' && x.id === id);
    if (!m) return null;
    return {
      id,
      title: m.name,
      description: [
        '[h1]关于这个 mod[/h1]',
        '[b]这是预览模式下的示例描述[/b]，用来展示工坊描述的排版效果。真实运行时这里显示 mod 作者写的原文，',
        '长度动辄几千字（例如 LuaCsForBarotrauma 就有 6500 多字），所以这里刻意写长一点，用来验证超长描述的显示。',
        '',
        '[h2]功能[/h2]',
        '[list]',
        '[*]新增了一批物品与装备',
        '[*]调整了部分数值平衡',
        '[*]修复了若干已知问题',
        '[*]优化了界面布局与操作手感',
        '[*]补充了中文翻译',
        '[/list]',
        '',
        '[h2]前置与兼容[/h2]',
        '需要 [b]LuaCsForBarotrauma[/b] 作为前置。',
        '详细说明见 [url=https://steamcommunity.com/sharedfiles/filedetails/?id=2559634234]这个页面[/url]。',
        '',
        '[h2]安装说明[/h2]',
        '订阅之后在游戏内的 mod 列表里勾选启用即可。如果同时装了其它修改同类内容的 mod，',
        '请注意加载顺序：本 mod 应当排在它们[b]之后[/b]加载，否则改动会被覆盖。',
        '',
        '[h2]常见问题[/h2]',
        '[list]',
        '[*]问：报错找不到某个文件？答：确认前置 mod 已启用。',
        '[*]问：改了配置没生效？答：退出游戏后重新应用一次合集。',
        '[*]问：和某某 mod 冲突？答：把本 mod 挪到列表更靠下的位置。',
        '[/list]',
        '',
        '[h3]更新记录[/h3]',
        '[list]',
        '[*]修正了若干贴图错位',
        '[*]新增两件装备',
        '[*]调整了掉落概率',
        '[/list]',
        '',
        '[quote]如果你觉得这个 mod 还不错，欢迎去工坊点个收藏。[/quote]',
        '',
        '[hr][/hr]',
        '[i]最后更新：示例数据。这一段是用来说明「展开后应当由弹窗整体滚动，而不是在一个小框里再套一层滚动条」。[/i]'
      ].join('\n'),
      previewUrl: null,
      tags: m.autoCategories,
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
  getWorkshopPage: async (_id?: string): Promise<void> => {}
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
