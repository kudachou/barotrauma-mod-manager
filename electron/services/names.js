const fs = require('node:fs');
const path = require('node:path');

/**
 * 用户给 mod 起的**显示名**（自定义名字）。
 *
 * 为什么不直接改文件、也不改 filelist.xml：
 *   - 改 mod 文件夹名会让合集、存档、工坊 id 全对不上；
 *   - 改 filelist.xml 是动作者的产物，更新一次 mod 就没了。
 * 所以只在本地存一份「key → 想显示的名字」，扫描时用它盖掉 `name`，
 * 真名留在 `realName` 里（存档匹配、自动分类都还要用它）。
 *
 * 存成 `{ "workshop:123": "我的主力武器", "local:某文件夹": "改过的名字" }`，
 * 和 categories.json / relations.json 一个路子，按目录参数工作，纯 node 下也能测。
 */

const MAX_LEN = 80;

function file(dir) {
  return path.join(String(dir || '.'), 'names.json');
}

/** 去掉控制字符、把换行压成空格、掐掉首尾空白 */
function clean(name) {
  return String(name == null ? '' : name)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LEN);
}

function load(dir) {
  try {
    const raw = JSON.parse(fs.readFileSync(file(dir), 'utf8'));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof k !== 'string' || !k) continue;
      if (typeof v !== 'string') continue;
      const n = clean(v);
      if (n) out[k] = n;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * 写盘并返回写下去的那份数据。
 * 不吞异常：写不进去要让界面如实报错，别显示"改好了"然后重启就没了。
 */
function persist(dir, data) {
  const f = file(dir);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(data, null, 2), 'utf8');
  return data;
}

function getNames(dir) {
  return load(dir);
}

/**
 * 设置显示名。
 * 传空名字 = 恢复默认（等同于 removeName），这样界面上清空输入框再保存也不会留下一个空名字。
 */
function setCustomName(dir, key, name) {
  const k = String(key || '').trim();
  if (!k) throw new Error('缺少 mod 标识');

  const data = load(dir);
  const n = clean(name);
  if (n) data[k] = n;
  else delete data[k];
  return persist(dir, data);
}

/** 恢复默认名字：删掉这一条 */
function removeCustomName(dir, key) {
  const k = String(key || '').trim();
  if (!k) return getNames(dir);
  const data = load(dir);
  delete data[k];
  return persist(dir, data);
}

module.exports = { getNames, setCustomName, removeCustomName, MAX_LEN };
