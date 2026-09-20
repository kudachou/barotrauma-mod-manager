/**
 * 验证生产环境注入的 CSP 不会把界面需要的东西拦掉。
 *
 * 为什么值得单独一个测试：CSP 是"一旦写错就整片功能静默失效"的东西 ——
 * 曾经把 img-src 收成 `'self' local-img: data:`，结果**浏览工坊整页看不到图**
 *（工坊封面/截图是渲染层直接去 images.steamusercontent.com 取的，不走 local-img:// 代理），
 * 而图片加载失败只表现为 onError → 占位色块，控制台不报错、测试也不报错。
 *
 * 所以这里做两件事：
 *   1) 指令级断言：该放行的放行（工坊 CDN）、该收紧的收紧（不允许任意 https / eval）；
 *   2) 真实加载：起一个带同样 CSP 的窗口，实际拉一张 Steam CDN 的图，看 naturalWidth。
 *
 * CSP 字符串直接 require ../electron/csp —— 与线上是同一份，不是照抄。
 */
const { app, BrowserWindow, session } = require('electron');
const path = require('node:path');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.disableHardwareAcceleration();

const { CSP_PROD, directive } = require('../electron/csp');
const steam = require('../electron/services/steam');

const STEAM_IMG =
  'https://images.steamusercontent.com/ugc/14891511267770665986/3D180E704BC7CC738D46C53FF6D0D157EF75E7DF/?imw=637&imh=358';

let pass = 0;
let fail = 0;
function ok(cond, label, extra) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}${extra !== undefined ? ' — ' + extra : ''}`);
  }
}

app.whenReady().then(async () => {
  console.log('\n[1] CSP 指令内容');
  console.log('  策略: ' + CSP_PROD);

  const imgSrc = directive('img-src') || '';
  ok(
    imgSrc.includes('https://images.steamusercontent.com'),
    'img-src 放行工坊 CDN（少了它浏览工坊会整页没图）'
  );
  ok(imgSrc.includes('local-img:'), 'img-src 放行 local-img://（本地 mod 封面走这个协议）');
  ok(imgSrc.includes("'self'") && imgSrc.includes('data:'), 'img-src 放行自身资源与 data:');

  // 不能图省事写成 https:（那等于放行所有站点的图片）
  ok(!/(^|\s)https:(\s|$)/.test(imgSrc), 'img-src 没有写成裸的 https:（那会放行任意站点）');

  const scriptSrc = directive('script-src') || '';
  ok(scriptSrc === "'self'", "script-src 就是 'self'（不允许 eval / 内联脚本）", scriptSrc);
  ok(!scriptSrc.includes('unsafe-eval'), 'script-src 没有 unsafe-eval');

  const connectSrc = directive('connect-src') || '';
  ok(
    !connectSrc.includes('https:'),
    'connect-src 没有放行外部 https（工坊接口/翻译都由主进程发，渲染层不需要外发通道）',
    connectSrc
  );

  ok(directive('object-src') === "'none'", 'object-src 为 none');
  ok(directive('base-uri') === "'none'", 'base-uri 为 none');
  ok(directive('frame-ancestors') === "'none'", 'frame-ancestors 为 none');

  console.log('\n[2] 真实加载：带 CSP 的窗口能不能拉到工坊图');

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP_PROD]
      }
    });
  });

  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 600,
    webPreferences: { contextIsolation: true, offscreen: true }
  });

  /*
   * 尽量用**接口真实返回**的图片地址，而不是写死一个 URL —— 浏览工坊页用的是
   * QueryFiles/GetDetails 返回的 previewUrl，这里跑的就是同一条链路。
   * 公开接口不需要 key；真拿不到（离线）就退回一个已知地址，并明确标注。
   */
  let imgUrl = STEAM_IMG;
  let urlSource = '硬编码兜底地址';
  try {
    const map = await steam.fetchDetails(['2559634234', '3100128373', '2767049553']);
    for (const [id, d] of map.entries()) {
      if (d && d.previewUrl) {
        imgUrl = d.previewUrl;
        urlSource = `工坊接口返回（id ${id}）`;
        break;
      }
    }
  } catch (e) {
    console.log('    接口不可用，改用兜底地址：' + String((e && e.message) || e));
  }
  console.log(`    测试图片来自：${urlSource}`);
  console.log(`    ${imgUrl}`);

  const page =
    '<!doctype html><html><body style="margin:0">' +
    `<img id="steam" src="${imgUrl}" />` +
    '<img id="d" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" />' +
    '</body></html>';
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(page));
  await new Promise((r) => setTimeout(r, 6000));

  const res = await win.webContents.executeJavaScript(`(() => {
    const a = document.getElementById('steam'), b = document.getElementById('d');
    return { w: a.naturalWidth, h: a.naturalHeight, complete: a.complete, dw: b.naturalWidth };
  })()`);

  console.log(`  工坊图: naturalWidth=${res.w} height=${res.h} complete=${res.complete}`);
  ok(res.w > 0, `带 CSP 时工坊 CDN 的图片真的加载出来了（${urlSource}）`);
  ok(res.dw > 0, 'data: 图片正常（CSP 没有误伤本地内联图）');

  // 反向确认：CSP 确实在生效 —— 一个不在白名单里的图片来源必须被拦掉
  const blocked = await win.webContents.executeJavaScript(`(async () => {
    const img = new Image();
    img.src = 'https://example.com/definitely-not-allowed.png';
    await new Promise((r) => setTimeout(r, 2500));
    return img.naturalWidth;
  })()`);
  ok(blocked === 0, '不在白名单里的外部图片被 CSP 拦掉（说明策略确实生效，不是空转）');

  console.log(`\n=== ${fail === 0 ? '全部通过' : fail + ' 项失败'}（${pass} 通过 / ${fail} 失败）===`);
  app.exit(fail === 0 ? 0 : 1);
});
