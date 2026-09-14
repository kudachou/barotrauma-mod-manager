const fs = require('node:fs');
const path = require('node:path');

/**
 * mod 之间的关联关系（一般是「前置需求」）。
 *
 * 存成 `{ "workshop:123": ["workshop:456", "local:某mod"] }`，键和值都是 `${source}:${id}`，
 * 和界面上其他地方用的 mod 标识保持一致。游戏本身不会声明依赖，所以这里完全是用户手填的。
 *
 * 和 backup.js / steam.js 一样按目录参数工作（不自己去问 Electron 要 userData），
 * 这样纯 node 下也能直接测。
 */

function file(dir) {
  return path.join(String(dir || '.'), 'relations.json');
}

function load(dir) {
  try {
    const raw = JSON.parse(fs.readFileSync(file(dir), 'utf8'));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
      // 丢掉格式不对的条目，避免脏数据传到界面
      if (typeof k !== 'string' || !k) continue;
      if (!Array.isArray(v)) continue;
      const list = v.filter((x) => typeof x === 'string' && x);
      if (list.length) out[k] = list;
    }
    return out;
  } catch {
    return {};
  }
}

function persist(dir, data) {
  const f = file(dir);
  try {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(data, null, 2), 'utf8');
  } catch {
    /* 写盘失败不影响返回值 */
  }
  return data;
}

function getRelations(dir) {
  return load(dir);
}

/** 设置某个 mod 的关联列表：去重、去掉自己、去掉空值 */
function setRelations(dir, key, keys) {
  const k = String(key || '').trim();
  if (!k) throw new Error('缺少 mod 标识');

  const data = load(dir);
  const list = Array.isArray(keys)
    ? Array.from(new Set(keys.map((x) => String(x || '').trim()).filter((x) => x && x !== k)))
    : [];

  if (list.length) data[k] = list;
  else delete data[k];
  return persist(dir, data);
}

/** mod 被删掉时清理它的关联（自己那条 + 别人指向它的） */
function removeRelations(dir, key) {
  const k = String(key || '').trim();
  if (!k) return getRelations(dir);

  const data = load(dir);
  delete data[k];
  for (const [from, to] of Object.entries(data)) {
    const next = to.filter((x) => x !== k);
    if (next.length) data[from] = next;
    else delete data[from];
  }
  return persist(dir, data);
}

module.exports = { getRelations, setRelations, removeRelations };
