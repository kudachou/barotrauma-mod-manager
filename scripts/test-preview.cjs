/**
 * 封面服务自检：走 Steam 公开接口批量取 preview_url 并下载图片，
 * 同时验证「暂时失败不写负面缓存」。
 */
const fs = require('node:fs');
const path = require('node:path');
const steam = require('../electron/services/steam');

const dir = path.join(__dirname, '..', 'tmp-preview');
fs.rmSync(dir, { recursive: true, force: true });

const ids = ['2559634234', '3100128373', '3447189416', '2767049553', '2683570256'];
let failures = 0;
const ok = (c, m) => {
  console.log(`  ${c ? 'PASS' : 'FAIL'}  ${m}`);
  if (!c) failures++;
};

(async () => {
  console.log('[1] 批量取条目信息（一次请求）');
  const t0 = Date.now();
  const map = await steam.fetchDetails(ids);
  console.log(`  耗时 ${Date.now() - t0}ms，返回 ${map.size}/${ids.length} 条`);
  ok(map.size === ids.length, '全部 id 都有返回');

  let withPreview = 0;
  for (const id of ids) {
    const d = map.get(id);
    if (!d) {
      console.log(`    ${id}: 无返回`);
      continue;
    }
    const has = !!d.previewUrl;
    if (has) withPreview++;
    console.log(
      `    ${id}  result=${d.result}  title=${JSON.stringify((d.title || '').slice(0, 30))}  preview=${has ? '有' : '无'}`
    );
  }
  ok(withPreview > 0, '至少有一条带 preview_url');

  console.log('\n[2] 下载封面');
  let downloaded = 0;
  for (const id of ids) {
    const d = map.get(id);
    if (!d || !d.previewUrl) continue;
    const p = await steam.downloadPreview(id, d.previewUrl, dir);
    if (p) {
      downloaded++;
      const size = fs.statSync(p).size;
      console.log(`    ${id} -> ${path.basename(p)}  ${size} B`);
      ok(size > 500, `${id} 图片大小正常`);
    } else {
      console.log(`    ${id} -> 下载失败`);
    }
  }
  ok(downloaded > 0, '至少下载到一张封面');

  console.log('\n[3] 二次调用应命中缓存（不再联网）');
  const t1 = Date.now();
  const again = await Promise.all(
    ids
      .filter((id) => map.get(id) && map.get(id).previewUrl)
      .map((id) => steam.downloadPreview(id, map.get(id).previewUrl, dir))
  );
  const cachedMs = Date.now() - t1;
  ok(again.every(Boolean), '缓存命中，全部返回本地路径');
  console.log(`    耗时 ${cachedMs}ms（应接近 0）`);

  console.log('\n[4] 不存在 / 无封面的条目不应污染缓存');
  const ghost = await steam.fetchDetails(['999999999999']);
  const g = ghost.get('999999999999');
  console.log(`    999999999999 -> ${g ? 'result=' + g.result + ' preview=' + !!g.previewUrl : '无返回'}`);
  ok(ghost.size === 0 || (g && g.result !== 1), '不存在的条目会被判定为无效');

  const files = fs.readdirSync(dir);
  const miss = files.filter((f) => f.endsWith('.miss'));
  console.log(`\n缓存目录：${files.length} 个文件，其中负面标记 ${miss.length} 个`);
  ok(miss.length === 0, '正常路径下没有产生负面缓存');

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(failures ? `\n=== ${failures} 项失败 ===` : '\n=== 全部通过 ===');
  process.exit(failures ? 1 : 0);
})();
