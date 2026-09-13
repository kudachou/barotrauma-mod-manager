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

export interface ScanResult {
  mods: ModInfo[];
  modlists: ModlistSummary[];
  categories: CategoryData;
  settings: AppSettings;
  /** 路径校验结果 */
  warnings: string[];
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
