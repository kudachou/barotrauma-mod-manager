export type ModSource = 'local' | 'workshop';

/** 本地 mod 相对创意工坊对应版本的比较结果 */
export type CompareStatus = 'same' | 'older' | 'newer' | 'different' | 'no-counterpart';

export interface ModCounterpart {
  id: string;
  name: string;
  version: string | null;
  status: CompareStatus;
  /** 工坊 mod 是否已被游戏安装（Installed 目录中存在） */
  installed: boolean;
}

export interface ModInfo {
  source: ModSource;
  /** 本地 = 文件夹名；工坊 = workshop id */
  id: string;
  folder: string;
  name: string;
  modVersion: string | null;
  gameVersion: string | null;
  steamworkshopid: string | null;
  corepackage: boolean;
  /** filelist.xml 绝对路径 */
  path: string;
  counterpart: ModCounterpart | null;
  /** 手动标签 */
  categories: string[];
  /** 关键词自动分类 */
  autoCategories: string[];
  /** 封面图绝对路径（缓存图或本地指定图） */
  preview: string | null;
  /** 文件夹最后修改时间（ms） */
  mtime: number | null;
  /** 该 mod 被哪些合集启用（合集名数组） */
  usedIn: string[];
  /** 工坊上已经没有这个条目了（作者下架或被删）。本地 mod 表示它的工坊来源已下架 */
  delisted?: boolean;
  /** 判定依据：'apikey'=官方接口确认下架；'page-invisible'=只知道工坊上看不到（也可能是私有） */
  delistedHow?: string | null;
  /** 只剩游戏 Installed 里那份副本，Steam 订阅目录里已经没有 */
  installedOnly?: boolean;
  /** LocalMods 里已经有一份对应的备份（工坊 mod 才看这个） */
  backedUpLocally?: boolean;
  /** Steam 那份已经下载好了、但游戏 Installed 里还是旧的（或压根没装） */
  installPending?: boolean;
  /** 游戏 Installed 里那一份的版本号（用于显示「1.110 → 1.111」） */
  installInstalledVersion?: string | null;
}

export interface ModlistEntry {
  type: 'workshop' | 'local';
  name?: string | null;
  id?: string | null;
}

export interface ModlistSummary {
  fileName: string;
  name: string;
  count: number;
  /** 内容与当前游戏生效的一致 */
  matchesApplied?: boolean;
}

export interface ModlistFull {
  fileName: string;
  name: string;
  entries: ModlistEntry[];
}

export interface AppSettings {
  gameDir: string;
  modListsDir: string;
  localModsDir: string;
  workshopModsDir: string;
  configPlayerPath: string;
  installedWorkshopDir: string;
}

export interface CategoryData {
  /** `${source}:${id}` -> 手动标签 */
  mods: Record<string, string[]>;
  /** 用户自定义分类名 */
  custom: string[];
  /** 被用户删除掉的内置标签（含关键词自动分类），不再出现在标签库与 mod 上 */
  removed: string[];
}

/** 一次「工坊下架检查」的结果 */
export interface WorkshopCheckRefresh {
  checks: Record<string, { exists?: boolean | null; how?: string; checkedAt?: number }>;
  /** API Key 不可用时的报错（有 Key 但被拒） */
  apiKeyError: string | null;
  /** 实际用的方式 */
  mode: 'apikey' | 'page';
}

/** 当前游戏实际生效的 mod（读自 config_player.xml） */
export interface AppliedInfo {
  /** 能不能读到 config_player.xml */
  available: boolean;
  reason: string | null;
  /** 形如 `workshop:123` / `local:名字`，按游戏里的加载顺序 */
  keys: string[];
  /** 在生效列表里、但当前目录找不到的（被删了或没装） */
  missing: string[];
}

export interface ScanResult {
  mods: ModInfo[];
  modlists: ModlistSummary[];
  categories: CategoryData;
  settings: AppSettings;
  /** 路径校验结果 */
  warnings: string[];
  /** 游戏当前生效的 mod */
  applied: AppliedInfo;
  /** `${source}:${id}` -> 关联的 mod 标识（一般是前置需求） */
  relations: Record<string, string[]>;
  /** 「工坊条目还在不在」的缓存太旧，界面该去刷一次 */
  checksStale?: boolean;
  /** 已核实为下架的条目数 */
  checksDelisted?: number;
  /** 没能核实的条目数（Steam 挡住时会有） */
  checksUnknown?: number;
  /** 检查方式：'apikey' 走官方接口（更可靠），'page' 抓工坊网页 */
  checksMode?: 'apikey' | 'page';
  /** 上次检查的时间戳 */
  checksCheckedAt?: number;
  /** 「Steam 已下载、游戏还没装」的工坊 mod 个数 */
  installPendingCount?: number;
}

export type ViewKey = 'library' | 'browse' | 'collections' | 'saves' | 'settings';

/* ------------------------- 浏览创意工坊 ------------------------- */

export type WorkshopSort = 'popular' | 'trend' | 'updated' | 'newest' | 'top';

export interface BrowseItem {
  id: string;
  title: string;
  previewUrl: string | null;
  subscriptions: number;
  favorited: number;
  views: number;
  /** 秒 */
  timeUpdated: number;
  fileSize: number;
  tags: string[];
  pageUrl: string;
}

export interface BrowseResult {
  /** 没配 Steam Web API Key —— 这个接口没 key 会 403 */
  needsKey: boolean;
  error: string | null;
  total: number;
  page: number;
  numPerPage: number;
  sort?: WorkshopSort;
  search?: string;
  /** 当前生效的分类筛选 */
  tags?: string[];
  items: BrowseItem[];
}

export interface BrowseTag {
  tag: string;
  count: number;
}

export interface BrowseTagsResult {
  needsKey: boolean;
  tags: BrowseTag[];
  error: string | null;
  cached?: boolean;
}

/** 工坊条目页面里的图片（封面 + 截图） */
export interface WorkshopMedia {
  id: string;
  cover: string | null;
  screenshots: { thumb: string; full: string }[];
  /** 页面显示条目已不存在（下架/私有） */
  missing: boolean;
  error: string | null;
  fetchedAt?: number;
}

/* ---------------------- 工坊更新同步进游戏（install sync） ---------------------- */

export type InstallSyncReason = 'outdated' | 'not-installed' | 'version-differs';

export interface InstallSyncItem {
  id: string;
  name: string;
  reason: InstallSyncReason;
  steamVersion: string | null;
  installedVersion: string | null;
  installedTime: number | null;
  targetTime: number | null;
  bytes: number;
  files: number;
}

export interface InstallSyncPlan {
  items: InstallSyncItem[];
  count: number;
  totalBytes: number;
  totalFiles: number;
  /** 已下架、游戏里没装的：不是「待同步」，另有说明 */
  skippedDelisted: { id: string; name: string; steamVersion: string | null }[];
  acfAvailable: boolean;
  acfReason: string | null;
  workshopDir: string;
  installedDir: string;
}

export interface InstallSyncProgress {
  phase: string;
  done: number;
  total: number;
  current: string | null;
  id?: string;
}

export interface InstallSyncResult {
  synced: { id: string; name: string; installTime: number | null }[];
  failed: { id: string; name: string; error: string }[];
  bytes: number;
  cancelled: boolean;
}

/* --------------------------------- 存档 --------------------------------- */

/** 存档里记录的一个 mod（存档只有名字，靠名字反查当前装着的 mod） */
export interface SaveModEntry {
  name: string;
  /** null = 当前 mod 目录里找不到它（作者删了、或改过名） */
  mod: { source: 'workshop' | 'local'; id: string; name: string } | null;
}

/** 能完全覆盖某个存档的合集 */
export interface SaveCover {
  fileName: string;
  name: string;
  /** 合集里有、但存档没记录的 mod 名 */
  extra: string[];
}

export interface SaveInfo {
  file: string;
  path: string;
  name: string;
  source: 'single' | 'multi';
  size: number;
  /** 存档时间（毫秒） */
  saveTime: number;
  submarine: string | null;
  gameVersion: string | null;
  isMultiplayer: boolean;
  /** 按加载顺序 */
  mods: SaveModEntry[];
  /** 游戏里已经找不到的 mod 个数 */
  missingCount: number;
  /** 与某个合集完全一致 */
  match: { fileName: string; name: string } | null;
  /** 能完全覆盖存档的合集（按"多出来的最少"排序，最多 3 个） */
  covers: SaveCover[];
  coversTotal: number;
}

export interface SaveList {
  saveDir: string;
  dirs: { dir: string; source: 'single' | 'multi'; exists: boolean }[];
  modlistCount: number;
  saves: SaveInfo[];
}

/** 更新状态 */
export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'up-to-date'
  | 'error'
  | 'unsupported';

export interface UpdateProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond?: number;
}

export interface UpdateState {
  status: UpdateStatus;
  /** 打包后的安装版才支持自动更新；开发模式为 false */
  supported: boolean;
  currentVersion: string | null;
  latestVersion: string | null;
  releaseNotes: string | null;
  releaseDate: string | null;
  progress: UpdateProgress | null;
  error: string | null;
  checkedAt: number | null;
}

/** 本地 mod 的一份历史快照 */
export interface Snapshot {
  id: string;
  at: number;
  bytes: number;
  files: number;
  label: string | null;
}

export interface SnapshotList {
  items: Snapshot[];
  summary: { count: number; bytes: number; latestAt: number | null };
}

/** 某个本地 mod 占用的空间（本体 + 历史快照） */
export interface LocalModFootprint {
  exists: boolean;
  modBytes: number;
  snapshotCount: number;
  snapshotBytes: number;
  totalBytes: number;
}

export interface DeleteLocalModResult {
  freedBytes: number;
  snapshotCount: number;
  removedFromModlists: string[];
}

/** 创意工坊条目详情（描述 / 标签 / 热度） */
export interface WorkshopDetails {
  id: string;
  title: string | null;
  description: string | null;
  previewUrl: string | null;
  tags: string[];
  timeCreated: number | null;
  timeUpdated: number | null;
  fileSize: number | null;
  subscriptions: number;
  favorited: number;
  views: number;
  banned: boolean;
  banReason: string | null;
  /** 这份描述是不是本地化过的（用 API Key 走 GetDetails 时才可能为 true） */
  localized?: boolean;
  /** 缓存时间戳 */
  fetchedAt?: number;
}

export interface BackupPlanItem {
  id: string;
  name: string;
  folder: string;
  source: string;
  bytes: number;
  files: number;
  /** 已有本地副本 → 会先留快照再更新 */
  existing: boolean;
  /** 工坊上已下架 */
  delisted?: boolean;
  /** 只剩游戏里的副本 */
  installedOnly?: boolean;
}

export interface BackupPlan {
  items: BackupPlanItem[];
  skipped: { id: string; name: string; reason: string }[];
  totalBytes: number;
  totalFiles: number;
  updateCount: number;
  newCount: number;
}

export interface BackupProgress {
  phase: 'planning' | 'copying' | 'done';
  done: number;
  total: number;
  bytesDone?: number;
  bytesTotal?: number;
  current?: string | null;
  snapshotted?: number;
  errors?: number;
}

export interface BackupResult {
  done: number;
  total: number;
  bytesDone: number;
  snapshotted: number;
  errors: { name: string; id: string; message: string }[];
  folders: string[];
  skipped: { id: string; name: string; reason: string }[];
}
