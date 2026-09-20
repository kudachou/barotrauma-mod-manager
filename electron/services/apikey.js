const fs = require('node:fs');
const path = require('node:path');

/**
 * Steam Web API Key 的本地存取。
 *
 * 单独存一个文件，不塞进 AppSettings —— 那边是按「路径」渲染的，
 * 混进一个非路径字段会把它也画成路径输入框。
 *
 * 有 Key 时「工坊下架检查」走官方 IPublishedFileService/GetDetails（可靠）；
 * 没 Key 就退回抓工坊网页的尽力而为方式。
 */

const FILE = 'steam-api-key.json';

function file(dir) {
  return path.join(String(dir || '.'), FILE);
}

function getApiKey(dir) {
  try {
    const raw = JSON.parse(fs.readFileSync(file(dir), 'utf8'));
    return typeof raw.key === 'string' ? raw.key.trim() : '';
  } catch {
    return '';
  }
}

/**
 * 写盘并返回写下去的 key。
 * 不吞异常：以前写失败也返回成功，用户以为 Key 存住了，重启后又变回没 Key 的状态。
 */
function setApiKey(dir, key) {
  const k = String(key == null ? '' : key).trim();
  const f = file(dir);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ key: k }, null, 2), 'utf8');
  return k;
}

module.exports = { getApiKey, setApiKey };
