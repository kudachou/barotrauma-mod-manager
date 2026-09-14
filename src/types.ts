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
}

export type ViewKey = 'library' | 'collections' | 'settings';

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
