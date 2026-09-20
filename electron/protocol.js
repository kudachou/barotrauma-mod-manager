const { protocol, app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { getSettings } = require('./services/settings');

/*
 * 只保留真的会被渲染层当图片加载的后缀。
 * **不要**把 .svg 加回来：这个 scheme 注册成了 standard/secure，SVG 是可以带脚本的文档，
 * 一旦按 image/svg+xml 返回，就等于给渲染层开了一个"能自己造内容"的图片来源。
 */
const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp'
};

/** 必须在 app ready 之前调用 */
function registerLocalImgScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'local-img',
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
    }
  ]);
}

/**
 * 允许通过 local-img:// 读取的根目录白名单。
 *
 * 这个协议原本对 ?p= 不做任何限制，等于把"读本机任意文件"暴露给渲染层（渲染层又会
 * 渲染工坊描述、封面等外部内容）。现在收窄到两类位置：
 *   1) 应用自己的 userData（封面 covers、预览 previews 以及以后新加的缓存都在它下面）；
 *   2) 扫描出来的 mod 目录（本地 mod 的自定义封面就在 mod 文件夹里）。
 *
 * 这里刻意放行**整个** userData 而不是逐个列子目录：那是应用自己的数据目录，不含用户的
 * 私人文档；而逐个列目录一旦漏掉某个缓存目录，表现就是"某个界面的图片静默不显示"，
 * 这种 bug 既难查又容易复发。
 */
function allowedImageRoots() {
  const roots = [];
  const push = (p) => {
    if (p && !roots.includes(p)) roots.push(p);
  };
  try {
    push(app.getPath('userData'));
  } catch {
    /* app 还没 ready 时拿不到，交给下面的 mod 目录兜底 */
  }
  try {
    const s = getSettings();
    push(s.localModsDir);
    push(s.installedWorkshopDir);
    push(s.workshopModsDir);
  } catch {
    /* 检测失败就当作没有这些根 */
  }
  return roots.filter(Boolean).map((r) => path.resolve(r));
}

/** 解析并确认路径在某个白名单根之内（不是根本身） */
function isAllowedImagePath(p) {
  let abs;
  try {
    abs = path.resolve(p);
  } catch {
    return false;
  }
  return allowedImageRoots().some((root) => abs.startsWith(root + path.sep));
}

/** app ready 之后调用：local-img://local/?p=<编码后的绝对路径> */
function handleLocalImg() {
  protocol.handle('local-img', async (request) => {
    try {
      const u = new URL(request.url);
      const p = u.searchParams.get('p') || '';
      if (!p) return new Response('bad request', { status: 400 });
      if (!isAllowedImagePath(p)) return new Response('forbidden', { status: 403 });

      const ext = path.extname(p).toLowerCase();
      const mime = MIME[ext];
      if (!mime) return new Response('unsupported type', { status: 415 });

      const data = await fs.promises.readFile(p);
      return new Response(data, { headers: { 'content-type': mime } });
    } catch {
      return new Response('not found', { status: 404 });
    }
  });
}

module.exports = { registerLocalImgScheme, handleLocalImg, allowedImageRoots, isAllowedImagePath };
