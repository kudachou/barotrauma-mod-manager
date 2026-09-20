const fs = require('node:fs');
const path = require('node:path');

/** 递归复制目录（保留符号链接，失败则跳过该链接） */
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, e.name);
    const to = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(from, to);
    else if (e.isSymbolicLink()) {
      try {
        fs.symlinkSync(fs.readlinkSync(from), to);
      } catch {
        /* 忽略单个链接失败 */
      }
    } else fs.copyFileSync(from, to);
  }
}

/** 统计目录总字节数与文件数 */
function dirStats(dir) {
  let bytes = 0;
  let files = 0;
  const walk = (d) => {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else {
        files++;
        try {
          bytes += fs.statSync(p).size;
        } catch {
          /* 忽略 */
        }
      }
    }
  };
  walk(dir);
  return { bytes, files };
}

/** mod 名 → 合法文件夹名 */
function sanitizeName(name, fallback = 'mod') {
  const cleaned = String(name == null ? '' : name)
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[. ]+$/, '')
    .trim();
  return cleaned || fallback;
}

/** 在 taken 集合里找一个不冲突的名字：foo、foo (2)、foo (3)… */
function uniqueName(base, taken) {
  const b = sanitizeName(base);
  if (!taken.has(b.toLowerCase())) return b;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${b} (${i})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${b} (${Date.now()})`;
}

function pad(n, w = 2) {
  return String(n).padStart(w, '0');
}

/** YYYYMMDD-HHMMSS（本地时间） */
function stamp(d) {
  const t = d || new Date();
  return (
    `${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}` +
    `-${pad(t.getHours())}${pad(t.getMinutes())}${pad(t.getSeconds())}`
  );
}

/**
 * 把 YYYYMMDD-HHMMSS 解析回毫秒。
 * 刻意不加 $ 锚定：同一秒内创建的快照会带上随机后缀（如 20260913-193000-ab12），
 * 加了锚定的话这些快照会被当成"不是快照"而被列表忽略 —— 磁盘上有、界面上看不到。
 */
function parseStamp(id) {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/.exec(String(id || ''));
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  return new Date(y, mo - 1, d, h, mi, s).getTime();
}

function rmrf(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
}

/**
 * 严格版删除：目录**真的没了**才返回，否则抛错。
 *
 * `rmrf` 吞掉异常是为了"顺手清理"（临时的、可失败的地方），但凡后面紧跟着
 * 「复制覆盖」的删除都不能用它 —— 删失败了却当成功，接着就会在半个旧目录上
 * 覆盖出混合状态，回滚逻辑也永远不会被触发。ENOENT 仍然算成功。
 */
function rmrfStrict(p) {
  try {
    fs.rmSync(p, { recursive: true, force: false });
  } catch (e) {
    if (e && e.code === 'ENOENT') return;
    throw e;
  }
}

function humanSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

module.exports = { copyDir, dirStats, sanitizeName, uniqueName, stamp, parseStamp, rmrf, rmrfStrict, humanSize };
