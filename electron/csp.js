/**
 * 生产环境注入的 Content-Security-Policy。
 *
 * 单独一个模块（而不是写在 main.js 里）的原因：main.js 一被 require 就会启动整个应用，
 * 测试没法引用它。放这里，回归测试可以**直接 require 到与线上完全同一份字符串**，
 * 而不是自己照抄一遍 —— 照抄的那份会飘。
 *
 * ⚠️ `img-src` 里**必须**留着 `https://images.steamusercontent.com`：
 * 工坊的封面与截图是渲染层**直接**去 Steam CDN 取的（BrowseView / BrowseDetailModal 用的是
 * 接口返回的 previewUrl / screenshots，没有走 local-img:// 代理）。少了它，浏览工坊整页
 * 只能看到占位色块 —— 图片被 CSP 拦掉、`onError` 触发，用户看到的现象就是"图片加载不出来"。
 *
 * 其余外部请求（工坊接口、翻译、工坊页面 HTML）全部由主进程发出，不经过渲染层的 CSP，
 * 所以 connect-src 可以收到最紧：即便渲染层被注入内容，也没有自己的外发通道。
 */
const CSP_PROD = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' local-img: data: https://images.steamusercontent.com",
  "font-src 'self' data:",
  "connect-src 'self' local-img:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'"
].join('; ');

/** 单个指令的值，供测试断言用；取不到返回 null */
function directive(name) {
  const hit = CSP_PROD.split('; ')
    .map((s) => s.trim())
    .find((s) => s === name || s.startsWith(name + ' '));
  return hit ? hit.slice(name.length).trim() : null;
}

module.exports = { CSP_PROD, directive };
