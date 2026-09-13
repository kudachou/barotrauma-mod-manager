const fs = require('node:fs');
const path = require('node:path');

/** 潜渊症的 Steam AppID */
const WORKSHOP_APP_ID = '602960';
const GAME_FOLDER = 'Barotrauma';

/** Steam 可能装在哪些位置（按常见程度排序） */
function steamRootCandidates() {
  const out = [];
  const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

  for (const drive of ['C:', 'D:', 'E:', 'F:', 'G:']) {
    out.push(path.join(`${drive}${path.sep}`, 'Steam'));
    out.push(path.join(`${drive}${path.sep}`, 'steam'));
    out.push(path.join(`${drive}${path.sep}`, 'SteamLibrary'));
    out.push(path.join(`${drive}${path.sep}`, 'Games', 'Steam'));
  }
  out.push(path.join(pf86, 'Steam'));
  out.push(path.join(pf, 'Steam'));
  return out;
}

/** 解析 libraryfolders.vdf，拿到这个 Steam 根下挂载的所有游戏库 */
function readLibraryFolders(steamRoot) {
  const libs = [];
  const vdf = path.join(steamRoot, 'steamapps', 'libraryfolders.vdf');
  try {
    const txt = fs.readFileSync(vdf, 'utf8');
    const re = /"path"\s*"([^"]+)"/gi;
    let m;
    while ((m = re.exec(txt))) {
      // vdf 里是双反斜杠转义
      const p = m[1].replace(/\\\\/g, '\\');
      if (p) libs.push(p);
    }
  } catch {
    /* 没有该文件就忽略 */
  }
  return libs;
}

/** 从游戏目录反推 Steam 根：<root>/steamapps/common/Barotrauma */
function steamRootFromGame(gameDir) {
  return path.dirname(path.dirname(path.dirname(gameDir)));
}

/**
 * 自动检测各个目录。
 *
 * 刻意不依赖 electron，方便在纯 Node 下自检；localAppData 由调用方传入。
 * 找不到的项返回空字符串，由用户在「设置」里手动指定。
 */
function detectPaths(options = {}) {
  const localAppData =
    options.localAppData || process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');

  const roots = new Set();
  for (const c of steamRootCandidates()) {
    try {
      if (fs.existsSync(c)) roots.add(c);
    } catch {
      /* 忽略无权限的盘 */
    }
  }
  if (options.knownGameDir) {
    const up = steamRootFromGame(options.knownGameDir);
    try {
      if (fs.existsSync(up)) roots.add(up);
    } catch {
      /* 忽略 */
    }
  }

  // Steam 根 + 它声明的所有游戏库
  const libs = new Set(roots);
  for (const r of roots) {
    for (const l of readLibraryFolders(r)) {
      try {
        if (fs.existsSync(l)) libs.add(l);
      } catch {
        /* 忽略 */
      }
    }
  }

  let gameDir = '';
  let workshopModsDir = '';

  for (const lib of libs) {
    const g = path.join(lib, 'steamapps', 'common', GAME_FOLDER);
    if (!gameDir && fs.existsSync(g)) gameDir = g;

    const w = path.join(lib, 'steamapps', 'workshop', 'content', WORKSHOP_APP_ID);
    if (!workshopModsDir && fs.existsSync(w)) workshopModsDir = w;
  }

  // 游戏不在任何 Steam 库里（比如绿色版），仍然接受用户已知的目录
  if (!gameDir && options.knownGameDir && fs.existsSync(options.knownGameDir)) {
    gameDir = options.knownGameDir;
  }

  // 工坊目录兜底：按游戏目录推
  if (!workshopModsDir && gameDir) {
    const guess = path.join(steamRootFromGame(gameDir), 'steamapps', 'workshop', 'content', WORKSHOP_APP_ID);
    if (fs.existsSync(guess)) workshopModsDir = guess;
  }

  return {
    gameDir,
    modListsDir: gameDir ? path.join(gameDir, 'ModLists') : '',
    localModsDir: gameDir ? path.join(gameDir, 'LocalMods') : '',
    configPlayerPath: gameDir ? path.join(gameDir, 'config_player.xml') : '',
    workshopModsDir,
    // 游戏实际加载工坊 mod 的位置，跟具体用户绑定，直接按当前用户算
    installedWorkshopDir: path.join(
      localAppData,
      'Daedalic Entertainment GmbH',
      'Barotrauma',
      'WorkshopMods',
      'Installed'
    )
  };
}

module.exports = { detectPaths, steamRootCandidates, readLibraryFolders, steamRootFromGame, WORKSHOP_APP_ID };
