import type { ModInfo, ModlistFull, AppSettings, CategoryData, ModCounterpart } from './types';
import { autoCategorize } from './categories';

/* ------------------------------------------------------------------ *
 * 浏览器预览 / `pnpm dev` 用的示例数据。
 *
 * 这里刻意只用**公开的知名 mod**（工坊 ID 都是真的，所以封面能正常加载），
 * 本地 mod 也都是「示例」占位，不包含任何个人数据。
 * 在 Electron 客户端里会被主进程扫描到的真实数据替换。
 * ------------------------------------------------------------------ */

const GAME_DIR = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Barotrauma';
const WORKSHOP_DIR = 'C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\602960';

/**
 * 这些公开 mod 的封面地址（Steam CDN）。
 * 只为让 `pnpm dev` 与 README 截图里能看到真实封面 —— 拉不到时界面会自动回落到占位图，
 * 真实客户端里则一律走主进程的接口拉取 + 本地缓存。
 */
const PREVIEWS: Record<string, string> = {
  '2559634234': 'https://images.steamusercontent.com/ugc/14891511267770665986/3D180E704BC7CC738D46C53FF6D0D157EF75E7DF/',
  '3123289876': 'https://images.steamusercontent.com/ugc/2299715142559074869/BCD77DB49049DB10202F6EFDA877F8734320FE60/',
  '3343911734': 'https://images.steamusercontent.com/ugc/33319299277533365/F6EC0B86C856910B3DD685932CA2C75A120E848B/',
  '3087804415': 'https://images.steamusercontent.com/ugc/2233283965363630803/0DA8BBE0466461B18CAB1EB85EBCEA8445954DE3/',
  '3100128373': 'https://images.steamusercontent.com/ugc/2300839139755907151/F6BDD5B5C3C45BE8AB8D60DDDCE1C4975ADF8926/',
  '2767049553': 'https://images.steamusercontent.com/ugc/1825651231294882178/9E72AD2A1CC9FE512CC69282C14A48928947B8E9/',
  '2085783214': 'https://images.steamusercontent.com/ugc/1751307394141815395/C5C14CDF10E2896BF287860F44774D444720B5A1/',
  '2683570256': 'https://images.steamusercontent.com/ugc/1822267259717808420/E853874BF0626B1B37DFCC84F9C60E240E4F45D7/',
  '2950383008': 'https://images.steamusercontent.com/ugc/2019341512239517518/B2502CBA67F4F719CDFF22B7FDC7AE04B066A303/',
  '3406279065': 'https://images.steamusercontent.com/ugc/2914211346298910/C5529FD11A28EE4B95A827A3FB5F0FF48FEDCEBE/',
  '3271141414': 'https://images.steamusercontent.com/ugc/2482127411165563829/DC2EF806C1C27C632D121DD980C3ED02B16882A9/',
  '3426396486': 'https://images.steamusercontent.com/ugc/63716072303674118/0F482321164DD31907DC03AF042E8A58E74F17AF/',
  '3012187347': 'https://images.steamusercontent.com/ugc/2031737642169548574/5A7AD7E4D2EB64EC3E9E1ACD8A44D0A522031C1D/',
  '2995424153': 'https://images.steamusercontent.com/ugc/2032860371098389546/0D3716BFCC06F491C80556967F816F68A0973391/',
  '3000949045': 'https://images.steamusercontent.com/ugc/2031735971218617445/20B7BF7A3F7B814F7CF3CD10DCEDA23739D55B22/',
  '3008781099': 'https://images.steamusercontent.com/ugc/2031737253370543206/421C9430E3FF837173B600AD856BB4262E9FF71A/',
  '3141693350': 'https://images.steamusercontent.com/ugc/28809909200362173/65ADC000C79F66F5E9CC17F087F6A89660E9F90D/',
  '3413495302': 'https://images.steamusercontent.com/ugc/33314777898976964/F30FCED2212717CA9BC9BEC9C91AE20D652ECE99/',
  '2687090528': 'https://images.steamusercontent.com/ugc/1871806965028451070/6A02EFFA35D7AD4931C294874F53BBB3DC6F7EC1/',
  '2852411866': 'https://images.steamusercontent.com/ugc/1770501597282741506/41EB6899D54E462A937071F81F6B1C36D231145C/',
  '3090498695': 'https://images.steamusercontent.com/ugc/2307593813378458587/D55D283352E51461F3EC89D9C8E3F163E1101589/'
};

function mk(
  source: 'local' | 'workshop',
  id: string,
  name: string,
  modVersion: string,
  steamworkshopid: string | null,
  categories: string[],
  extra: Partial<ModInfo> = {}
): ModInfo {
  return {
    source,
    id,
    folder: id,
    name,
    modVersion,
    gameVersion: '1.13.4.0',
    steamworkshopid,
    corepackage: false,
    path:
      source === 'local'
        ? `${GAME_DIR.replace(/\\/g, '/')}/LocalMods/${id}/filelist.xml`
        : `${WORKSHOP_DIR.replace(/\\/g, '/')}/${id}/filelist.xml`,
    counterpart: null,
    categories,
    autoCategories: autoCategorize(name),
    preview: null,
    mtime: Date.now() - 86400000 * 7,
    usedIn: [],
    ...extra
  };
}

const W = (id: string, name: string, version: string, categories: string[] = []) =>
  mk('workshop', id, name, version, id, categories, { preview: PREVIEWS[id] || null });

const L = (
  folder: string,
  name: string,
  version: string,
  wsid: string | null,
  categories: string[] = []
) => mk('local', folder, name, version, wsid, categories);

/** 公开的知名工坊 mod（ID 为真实 ID） */
export const mockWorkshopMods: ModInfo[] = [
  W('2559634234', 'LuaCsForBarotrauma', '1.0.116', ['Lua/框架']),
  W('3123289876', 'Enhanced Immersion (lua only)', '1.2.4', ['UI/界面', 'Lua/框架']),
  W('3343911734', 'Smarter Bot AI', '3.1.0', ['性能/优化']),
  W('3087804415', 'Vertical Engine Lua', '1.0.7', ['潜艇/舰船']),
  W('3100128373', 'Anime Waifu', '5.2.0', ['美化/外观']),
  W('2767049553', 'Wreck Locator', '1.1.0', ['UI/界面']),
  W('2085783214', 'Improved Husks', '4.0.1', ['生物/怪物']),
  W('2683570256', '32x Stack', '1.0.0', ['性能/优化']),
  W('2950383008', 'Item IO Framework', '1.1.0', ['Lua/框架']),
  W('3406279065', 'ItemIO BetterMergeStack', '1.0.3', ['性能/优化']),
  W('3271141414', 'hospitalbedplus 医疗床铺++', '1.0.2', ['医疗']),
  W('3426396486', 'Display Ruin Map（显示遗迹地图）', '1.2.0', ['UI/界面']),
  W('3012187347', 'EK Dockyard 重製版', '1.6.0', ['潜艇/舰船']),
  W('2995424153', 'EK Armory 重製版', '1.7.5', ['武器/装备']),
  W('3000949045', 'EK Gunnery 重製版', '1.8.2', ['武器/装备']),
  W('3008781099', 'EK Utilities 重製版', '1.5.1', ['武器/装备']),
  W('3141693350', 'Scannable wild plants (Lua) 扫描野外植物', '1.0.2', ['UI/界面']),
  W('3413495302', 'Press R to Reload', '1.0.1', []),
  W('2687090528', 'CiYuanToolbox', '2.0.9', ['武器/装备']),
  W('2852411866', 'T.S.M MISSIONS', '2.4.1', ['任务/剧情']),
  W('3090498695', "Stack 'em 疊起來", '1.1.2', ['性能/优化'])
];

/** 本地 mod 示例（占位命名，非真实数据） */
export const mockLocalMods: ModInfo[] = [
  L('示例-美化整合', '示例-美化整合', '5.2.0', '3100128373', ['美化/外观']),
  L('示例-怪物扩展补丁', '示例-怪物扩展补丁', '3.9.0', '2085783214', ['生物/怪物']),
  L('示例-性能优化', '示例-性能优化', '1.2.0', '2683570256', ['性能/优化']),
  L('示例-潜艇微调', '示例-潜艇微调', '1.6.0', '3012187347', ['潜艇/舰船']),
  L('示例-自制武器包', '示例-自制武器包', '1.0.0', null, ['武器/装备']),
  L('示例-界面调整', '示例-界面调整', '0.9.1', null, ['UI/界面']),
  L('示例-音效替换', '示例-音效替换', '1.0.0', null, ['音效/音乐']),
  L('示例-整合包', '示例-整合包', '2.0.0', null, [])
];

export const mockModlists: ModlistFull[] = [
  {
    fileName: '示例-联机.xml',
    name: '示例-联机',
    entries: [
      { type: 'workshop', name: 'LuaCsForBarotrauma', id: '2559634234' },
      { type: 'workshop', name: 'Enhanced Immersion (lua only)', id: '3123289876' },
      { type: 'workshop', name: 'Smarter Bot AI', id: '3343911734' },
      { type: 'workshop', name: 'Wreck Locator', id: '2767049553' },
      { type: 'workshop', name: 'Press R to Reload', id: '3413495302' },
      { type: 'workshop', name: 'CiYuanToolbox', id: '2687090528' },
      { type: 'local', name: '示例-自制武器包' }
    ]
  },
  {
    fileName: '示例-美化.xml',
    name: '示例-美化',
    entries: [
      { type: 'workshop', name: 'LuaCsForBarotrauma', id: '2559634234' },
      { type: 'workshop', name: 'Anime Waifu', id: '3100128373' },
      { type: 'workshop', name: 'Enhanced Immersion (lua only)', id: '3123289876' },
      { type: 'local', name: '示例-美化整合' },
      { type: 'local', name: '示例-界面调整' }
    ]
  },
  {
    fileName: '示例-性能.xml',
    name: '示例-性能',
    entries: [
      { type: 'workshop', name: '32x Stack', id: '2683570256' },
      { type: 'workshop', name: "Stack 'em 疊起來", id: '3090498695' },
      { type: 'workshop', name: 'ItemIO BetterMergeStack', id: '3406279065' },
      { type: 'local', name: '示例-性能优化' }
    ]
  }
];

export const mockSettings: AppSettings = {
  gameDir: GAME_DIR,
  modListsDir: `${GAME_DIR}\\ModLists`,
  localModsDir: `${GAME_DIR}\\LocalMods`,
  workshopModsDir: WORKSHOP_DIR,
  configPlayerPath: `${GAME_DIR}\\config_player.xml`,
  installedWorkshopDir:
    'C:\\Users\\<用户名>\\AppData\\Local\\Daedalic Entertainment GmbH\\Barotrauma\\WorkshopMods\\Installed'
};

export const mockCategories: CategoryData = {
  mods: {
    'local:示例-怪物扩展补丁': ['前置'],
    'local:示例-自制武器包': ['自用整合'],
    'local:示例-整合包': ['自用整合']
  },
  custom: ['前置', '后置', '自用整合'],
  removed: []
};

/** 组装出与 Electron 主进程一致的扫描结果 */
export function buildMockScan() {
  const mods: ModInfo[] = [...mockWorkshopMods, ...mockLocalMods];
  const byId = new Map<string, ModInfo>();
  for (const m of mockWorkshopMods) byId.set(m.id, m);

  // 每个 mod 被哪些合集启用
  for (const list of mockModlists) {
    for (const e of list.entries) {
      const target =
        e.type === 'workshop'
          ? byId.get(e.id || '')
          : mods.find((m) => m.source === 'local' && m.id === e.name);
      if (target && !target.usedIn.includes(list.name)) target.usedIn.push(list.name);
    }
  }

  // 本地 mod 与工坊对应版本的对比
  for (const m of mockLocalMods) {
    if (!m.steamworkshopid) continue;
    const w = byId.get(m.steamworkshopid);
    if (!w || !m.modVersion || !w.modVersion) continue;

    const pa = m.modVersion.split('.').map((x) => parseInt(x, 10));
    const pb = w.modVersion.split('.').map((x) => parseInt(x, 10));
    let status: ModCounterpart['status'] = 'different';
    const len = Math.max(pa.length, pb.length);
    let cmp = 0;
    for (let i = 0; i < len; i++) {
      const x = pa[i] || 0;
      const y = pb[i] || 0;
      if (Number.isNaN(x) || Number.isNaN(y)) {
        cmp = m.modVersion.localeCompare(w.modVersion, undefined, { numeric: true });
        break;
      }
      if (x !== y) {
        cmp = x < y ? -1 : 1;
        break;
      }
    }
    status = cmp === 0 ? 'same' : cmp < 0 ? 'older' : 'newer';

    m.counterpart = {
      id: w.id,
      name: w.name,
      version: w.modVersion,
      status,
      installed: true
    };
  }

  return {
    mods,
    modlists: mockModlists.map((l) => ({
      fileName: l.fileName,
      name: l.name,
      count: l.entries.length
    })),
    categories: mockCategories,
    settings: mockSettings,
    warnings: [] as string[]
  };
}
