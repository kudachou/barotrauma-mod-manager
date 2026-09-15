/**
 * 比对两个（或多个）mod 目录是否**内容一致**。
 *
 * 用途：验证「同步到游戏」到底有没有把最新版装进去。
 * 最干净的基准是用 SteamCMD 从工坊重新下一次：
 *
 *   steamcmd +login anonymous +workshop_download_item 602960 <id> +quit
 *
 * 那份是直接从工坊来的最新发布版，拿它跟下面这些比：
 *   - 游戏实际加载的  %LOCALAPPDATA%\Daedalic Entertainment GmbH\Barotrauma\WorkshopMods\Installed\<id>
 *   - 管理器的本地备份 LocalMods\<mod 名>
 *
 * 用法：
 *   node scripts/compare-mod-dirs.cjs "<目录A>" "<目录B>" ["<目录C>" …]
 *
 * 说明：`filelist.xml` 会被**单独对待** —— 游戏安装时会重写它（属性顺序变化、
 * 多加一个 installtime），所以内容一样但字节不同是正常的。脚本会把两边
 * filelist.xml 的字段列出来对比，并在结论里区分「只有元数据差异」和「真的不一样」。
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function hashFile(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function walk(root) {
  const out = new Map();
  const stack = [''];
  while (stack.length) {
    const rel = stack.pop();
    const abs = path.join(root, rel);
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const r = rel ? path.join(rel, e.name) : e.name;
      if (e.isDirectory()) stack.push(r);
      else if (e.isFile()) {
        const full = path.join(root, r);
        const st = fs.statSync(full);
        out.set(r.replace(/\\/g, '/'), { size: st.size, hash: hashFile(full) });
      }
    }
  }
  return out;
}

/** 从 filelist.xml 里挑出有意义的字段（属性顺序/安装时间不算内容差异） */
function filelistFields(file) {
  try {
    const txt = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    const tag = txt.match(/<contentpackage\b[^>]*>/i);
    if (!tag) return null;
    const g = (n) => {
      const m = tag[0].match(new RegExp(`(?:^|\\s)${n}\\s*=\\s*"([^"]*)"`, 'i'));
      return m ? m[1] : null;
    };
    return {
      name: g('name'),
      modversion: g('modversion'),
      gameversion: g('gameversion'),
      steamworkshopid: g('steamworkshopid'),
      expectedhash: g('expectedhash') || g('hash'),
      installtime: g('installtime'),
      原始长度: Buffer.byteLength(txt, 'utf8')
    };
  } catch {
    return null;
  }
}

const dirs = process.argv.slice(2);
if (dirs.length < 2) {
  console.log('用法: node scripts/compare-mod-dirs.cjs "<目录A>" "<目录B>" [更多目录…]');
  process.exit(1);
}

const scans = dirs.map((d) => {
  const exists = fs.existsSync(d);
  return { dir: d, exists, files: exists ? walk(d) : new Map() };
});

console.log('=== 目录概览 ===');
for (const s of scans) {
  let bytes = 0;
  for (const f of s.files.values()) bytes += f.size;
  console.log(
    `  ${s.exists ? '✓' : '✗'} ${s.dir}\n      ${s.files.size} 个文件，${(bytes / 1048576).toFixed(2)} MB` +
      (s.exists ? '' : '（不存在）')
  );
  const fl = filelistFields(path.join(s.dir, 'filelist.xml'));
  if (fl) {
    console.log(
      `      filelist: name=${fl.name} modversion=${fl.modversion} gameversion=${fl.gameversion} ` +
        `installtime=${fl.installtime} expectedhash=${String(fl.expectedhash).slice(0, 16)}`
    );
  }
}

/** 比对：返回 {onlyA, onlyB, diff, same}，filelist.xml 单独标记 */
function compare(a, b) {
  const onlyA = [];
  const onlyB = [];
  const diff = [];
  let same = 0;
  for (const [rel, fa] of a.files) {
    const fb = b.files.get(rel);
    if (!fb) onlyA.push(rel);
    else if (fa.hash !== fb.hash) diff.push(rel);
    else same++;
  }
  for (const rel of b.files.keys()) if (!a.files.has(rel)) onlyB.push(rel);
  return { onlyA, onlyB, diff, same };
}

const base = scans[0];
console.log('\n=== 逐目录与第一个比 ===');
for (const other of scans.slice(1)) {
  const r = compare(base, other);
  // filelist.xml 的字节差异单独看（游戏会重写它）
  const flOnlyMeta =
    r.diff.length === 1 && r.diff[0] === 'filelist.xml' && r.onlyA.length === 0 && r.onlyB.length === 0;
  console.log(`\n--- ${path.basename(base.dir)}  vs  ${other.dir}`);
  console.log(
    `    内容相同的文件: ${r.same}    只在左边: ${r.onlyA.length}    只在右边: ${r.onlyB.length}    内容不同: ${r.diff.length}`
  );
  if (r.onlyA.length) console.log(`    只在左边有: ${r.onlyA.slice(0, 8).join(', ')}${r.onlyA.length > 8 ? ' …' : ''}`);
  if (r.onlyB.length) console.log(`    只在右边有: ${r.onlyB.slice(0, 8).join(', ')}${r.onlyB.length > 8 ? ' …' : ''}`);
  if (r.diff.length) console.log(`    内容不同: ${r.diff.slice(0, 8).join(', ')}${r.diff.length > 8 ? ' …' : ''}`);

  const fa = filelistFields(path.join(base.dir, 'filelist.xml'));
  const fb = filelistFields(path.join(other.dir, 'filelist.xml'));
  if (fa && fb) {
    const keyFields = ['name', 'modversion', 'gameversion', 'steamworkshopid', 'expectedhash'];
    const diffs = keyFields.filter((k) => String(fa[k]) !== String(fb[k]));
    console.log(
      `    filelist 关键字段: ${diffs.length ? diffs.map((k) => `${k}: ${fa[k]} ≠ ${fb[k]}`).join(' | ') : '全部一致（只有 installtime/属性顺序这类差异）'}`
    );
  }
  const identical = r.onlyA.length === 0 && r.onlyB.length === 0 && (r.diff.length === 0 || flOnlyMeta);
  console.log(
    `    ==> ${identical ? (r.diff.length ? '内容一致（仅 filelist.xml 被游戏重写过）' : '完全一致 ✓') : '有差异，见上'}`
  );
}
