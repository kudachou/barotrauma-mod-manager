/**
 * 主进程侧的"当前界面语言"。
 *
 * ## 为什么主进程需要知道语言
 *
 * 绝大多数文案都在渲染层，`src/i18n.ts` 一手包办。但有一类**主进程直接产出、渲染层拿不到**
 * 的用户可见文字：**原生文件/文件夹对话框的标题**（`dialog.showOpenDialog` 的 `title`）。
 * 那些字符串由主进程交给 Windows，绕不过渲染层，所以主进程得自己知道当前语言。
 *
 * 渲染层在语言确定/切换时通过 `app:setUiLang` 告知；没告知前默认中文。
 *
 * ⚠️ 只用来处理这类"绕不过去"的文案。业务错误提示**不要**在这里翻 ——
 * 那部分的正解是主进程返回错误码、由渲染层 `t()`，见 `src/i18n/mainMessages.ts` 的说明。
 */
let lang = 'zh';

/** 渲染层告知当前语言 */
function setUiLang(l) {
  lang = l === 'en' ? 'en' : 'zh';
}

function uiLang() {
  return lang;
}

/**
 * 主进程侧极简双语：给一段中文 + 对应英文，按当前语言取一个。
 * @param {string} zh 中文原文
 * @param {string} en 英文
 */
function mt(zh, en) {
  return lang === 'en' ? en : zh;
}

module.exports = { setUiLang, uiLang, mt };
