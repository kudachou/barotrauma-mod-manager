/**
 * 自检脚本共用的「干净临时目录」。
 *
 * ## 为什么不是一句 rmSync 就完事
 *
 * 这些脚本原来都在模块顶层这么写：
 *
 *     const TMP = path.join(ROOT, 'tmp-xxx');
 *     fs.rmSync(TMP, { recursive: true, force: true });
 *
 * 平时没问题，但**上一次自检被强行中断**时，Chromium 的 GPU 缓存
 * （userdata\DawnGraphiteCache\data_0）可能还被系统锁着，rmSync 就会抛
 * `EPERM: operation not permitted, unlink`。它抛在模块顶层、没人接，Electron 于是弹一个
 * 「A JavaScript error occurred in the main process」的错误框 —— 跑个自检把屏幕糊满弹窗，
 * 这不该发生（用户看到过一次）。
 *
 * 注意 `force: true` 只压得住「文件不存在」，压不住「文件被别的进程占着」。
 *
 * 所以这里做两件事：目录换到系统的 %TEMP% 下（删不掉也不会在仓库里攒一地 tmp-xxx），
 * 删除失败也咽掉、退回一个带时间戳的目录 —— 跑得下去比目录叫什么都重要。
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/**
 * 删掉 base（删不掉就换一个），确保返回的目录已存在而且是空的。
 *
 * 真正用的目录放在**系统临时目录**里，而不是仓库里：Chromium 的 GPU 缓存偶尔会被系统
 * 锁上一阵子（跑到一半强行中断、或者进程刚退出还没完全释放句柄），这时清理就会失败。
 * 删不掉的东西留在仓库里会越攒越多（实测一次全量自检能留下十几个 tmp-xxx），
 * 丢到 %TEMP% 里就不会碍眼，系统自己也会定期清。
 */
function freshDir(base) {
  let dir = path.join(os.tmpdir(), path.basename(base));
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    dir = `${dir}-${Date.now()}`;
  }
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

module.exports = { freshDir };
