const { protocol } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml'
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

/** app ready 之后调用：local-img://local/?p=<编码后的绝对路径> */
function handleLocalImg() {
  protocol.handle('local-img', async (request) => {
    try {
      const u = new URL(request.url);
      const p = u.searchParams.get('p') || '';
      if (!p) return new Response('bad request', { status: 400 });
      const data = await fs.promises.readFile(p);
      const ext = path.extname(p).toLowerCase();
      return new Response(data, {
        headers: { 'content-type': MIME[ext] || 'application/octet-stream' }
      });
    } catch {
      return new Response('not found', { status: 404 });
    }
  });
}

module.exports = { registerLocalImgScheme, handleLocalImg };
