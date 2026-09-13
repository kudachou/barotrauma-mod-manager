// 用 Electron 离屏加载 dist/index.html，截图并检查 DOM —— 用于自检外观
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

console.log('shots: script loaded');
process.on('uncaughtException', (e) => console.log('UNCAUGHT ' + ((e && e.stack) || e)));
process.on('unhandledRejection', (e) => console.log('UNHANDLED ' + ((e && e.stack) || e)));

// 受限环境下需要的开关
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('no-zygote');
app.disableHardwareAcceleration();

/*
 * BMM_NO_COVERS=1 时拦截所有图片请求。
 * 用途：生成「不含任何第三方封面素材」的截图 —— 文档里不该出现别人 mod 的图片。
 * 图片被拦后界面会自动回落到占位色块，功能展示不受影响。
 */
if (process.env.BMM_NO_COVERS === '1') {
  const { session } = require('electron');
  app.whenReady().then(() => {
    session.defaultSession.webRequest.onBeforeRequest(
      {
        urls: [
          '*://*.steamusercontent.com/*',
          '*://*.steamstatic.com/*',
          '*://*.akamaihd.net/*',
          '*://*.steamcommunity.com/*'
        ]
      },
      (_details, cb) => cb({ cancel: true })
    );
    console.log('已启用 BMM_NO_COVERS：拦截所有封面图片请求');
  });
}

const OUT = path.join(__dirname, '..', 'shots');
fs.mkdirSync(OUT, { recursive: true });

const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(win, name) {
  const img = await win.webContents.capturePage();
  const png = img.toPNG();
  fs.writeFileSync(path.join(OUT, name + '.png'), png);
  console.log(`saved ${name}.png ${png.length} bytes`);
}

app.whenReady().then(async () => {
  console.log('shots: app ready');
  const win = new BrowserWindow({
    width: 1420,
    height: 920,
    show: false,
    webPreferences: { contextIsolation: true, backgroundThrottling: false, offscreen: true }
  });
  console.log('shots: window created');

  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 2) errors.push(`[level ${level}] ${message} (${sourceId}:${line})`);
  });
  win.webContents.on('did-fail-load', (_e, code, desc, url) =>
    errors.push(`did-fail-load ${code} ${desc} ${url}`)
  );
  win.webContents.on('render-process-gone', (_e, d) => errors.push(`render-gone ${JSON.stringify(d)}`));

  await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  await sleep(1800);
  console.log('shots: loaded');

  const report = await win.webContents.executeJavaScript(`(() => ({
    sidebar: !!document.querySelector('.sidebar'),
    navs: document.querySelectorAll('.nav-item').length,
    cards: document.querySelectorAll('.card').length,
    title: (document.querySelector('.page-title') || {}).textContent || null,
    categories: document.querySelectorAll('.tag-toggle').length,
    badges: document.querySelectorAll('.badge').length
  }))()`);
  console.log('DOM ' + JSON.stringify(report));

  // 示例数据里的工坊封面是 Steam CDN 直链，等它们加载完再截图
  let imgStat = { total: 0, loaded: 0 };
  for (let i = 0; i < 24; i++) {
    imgStat = await win.webContents.executeJavaScript(`(() => {
      const imgs = Array.from(document.querySelectorAll('.card-cover img'));
      return {
        total: imgs.length,
        loaded: imgs.filter((x) => x.complete && x.naturalWidth > 0).length
      };
    })()`);
    if (imgStat.total > 0 && imgStat.loaded >= imgStat.total) break;
    await sleep(500);
  }
  console.log(`card-covers total=${imgStat.total} loaded=${imgStat.loaded}`);

  await shot(win, '01-library');

  // 顶部操作按钮
  console.log(
    'topbar-actions=' +
      JSON.stringify(
        await win.webContents.executeJavaScript(
          `Array.from(document.querySelectorAll('.topbar .btn')).map((b) => b.textContent.trim())`
        )
      )
  );

  // 备份工坊 mod 弹窗：规划结果
  await win.webContents.executeJavaScript(`(() => {
    const b = Array.from(document.querySelectorAll('.topbar .btn')).find((x) =>
      x.textContent.includes('备份工坊')
    );
    if (b) b.click();
    return !!b;
  })()`);
  await sleep(1500);
  console.log(
    'backup-modal=' +
      JSON.stringify(
        await win.webContents.executeJavaScript(`(() => ({
          open: !!document.querySelector('.modal'),
          nums: Array.from(document.querySelectorAll('.bk-num')).map((x) => x.textContent.trim()),
          labels: Array.from(document.querySelectorAll('.bk-label')).map((x) => x.textContent.trim()),
          foot: Array.from(document.querySelectorAll('.modal-foot .btn')).map((x) => x.textContent.trim())
        }))()`)
      )
  );
  await shot(win, '14-backup-modal');
  await win.webContents.executeJavaScript(`(() => {
    const b = Array.from(document.querySelectorAll('.modal-foot .btn')).find(
      (x) => x.textContent.trim() === '取消'
    );
    if (b) b.click();
  })()`);
  await sleep(400);

  // 滚动验证：卡片区必须能滚，且工具栏保持可见
  const scroll = await win.webContents.executeJavaScript(`(() => {
    const c = document.querySelector('.lib-scroll');
    if (!c) return null;
    const before = c.scrollTop;
    c.scrollTop = 500;
    const bar = document.querySelector('.toolbar');
    const barTop = bar ? Math.round(bar.getBoundingClientRect().top) : -1;
    return {
      scrollHeight: c.scrollHeight,
      clientHeight: c.clientHeight,
      before,
      after: c.scrollTop,
      toolbarTop: barTop
    };
  })()`);
  console.log('lib-scroll=' + JSON.stringify(scroll));
  await sleep(300);
  await shot(win, '07-library-scrolled');
  await win.webContents.executeJavaScript(`document.querySelector('.lib-scroll').scrollTop = 0`);
  await sleep(300);

  await win.webContents.executeJavaScript(`document.querySelectorAll('.nav-item')[1].click()`);
  await sleep(900);
  await shot(win, '02-collections');

  const rowsScroll = await win.webContents.executeJavaScript(`(() => {
    const e = document.querySelector('.mod-rows');
    if (!e) return null;
    const before = e.scrollTop;
    e.scrollTop = 300;
    return { scrollHeight: e.scrollHeight, clientHeight: e.clientHeight, before, after: e.scrollTop };
  })()`);
  console.log('rows-scroll=' + JSON.stringify(rowsScroll));

  await win.webContents.executeJavaScript(`document.querySelectorAll('.nav-item')[2].click()`);
  await sleep(800);
  await shot(win, '03-settings');

  await win.webContents.executeJavaScript(`document.querySelectorAll('.nav-item')[0].click()`);
  await sleep(600);
  // 优先点开一个「工坊有更新」的本地 mod，检查版本对比界面
  const picked = await win.webContents.executeJavaScript(`(() => {
    const cards = Array.from(document.querySelectorAll('.card'));
    const c = cards.find((x) => x.querySelector('.badge.st-older')) || cards[0];
    if (!c) return null;
    c.click();
    return (c.querySelector('.card-name') || {}).textContent || null;
  })()`);
  console.log('opened card: ' + picked);
  await sleep(800);
  const modal = await win.webContents.executeJavaScript(`!!document.querySelector('.modal')`);
  console.log('modal=' + modal);
  console.log(
    'snapshot-section=' +
      JSON.stringify(
        await win.webContents.executeJavaScript(`(() => {
          const t = Array.from(document.querySelectorAll('.modal .section-title')).find((x) =>
            x.textContent.includes('历史版本')
          );
          return {
            present: !!t,
            text: t ? t.textContent.trim() : null,
            hasCreate: !!Array.from(document.querySelectorAll('.modal .btn')).find((b) =>
              b.textContent.includes('创建快照')
            )
          };
        })()`)
      )
  );
  await shot(win, '04-detail');

  // 验证「加入合集」：点一个合集 chip，应出现提示
  const chip = await win.webContents.executeJavaScript(`(() => {
    const c = document.querySelector('.list-toggle');
    if (!c) return null;
    const label = c.textContent;
    c.click();
    return label;
  })()`);
  console.log('clicked modlist chip: ' + chip);
  await sleep(700);
  const toasts = await win.webContents.executeJavaScript(
    `Array.from(document.querySelectorAll('.toast .t-title')).map((x) => x.textContent)`
  );
  console.log('toasts=' + JSON.stringify(toasts));
  await shot(win, '05-add-to-collection');

  // 验证「新建标签」
  await win.webContents.executeJavaScript(`(() => {
    const b = Array.from(document.querySelectorAll('.tag-toggle')).find((x) =>
      x.textContent.includes('新建标签')
    );
    if (b) b.click();
    return !!b;
  })()`);
  await sleep(300);
  await win.webContents.executeJavaScript(`(() => {
    const el = document.querySelector('input[placeholder="新标签名称…"]');
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, '自用必备');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await sleep(200);
  await win.webContents.executeJavaScript(`(() => {
    const b = Array.from(document.querySelectorAll('.modal .btn')).find((x) =>
      x.textContent.includes('创建并打标')
    );
    if (b) b.click();
    return !!b;
  })()`);
  await sleep(700);
  const tagCheck = await win.webContents.executeJavaScript(`(() => {
    const chips = Array.from(document.querySelectorAll('.tag-toggle'));
    const target = chips.find((x) => x.textContent.includes('自用必备'));
    return {
      hasChip: !!target,
      isOn: target ? target.classList.contains('on') : null,
      onTags: Array.from(document.querySelectorAll('.tag-toggle.on')).map((x) =>
        x.textContent.trim()
      )
    };
  })()`);
  console.log('tag-create=' + JSON.stringify(tagCheck));
  await shot(win, '08-new-tag');

  // 验证「删除标签」
  await win.webContents.executeJavaScript(`(() => {
    const b = Array.from(document.querySelectorAll('.tag-toggle')).find(
      (x) => x.textContent.trim() === '管理标签'
    );
    if (b) b.click();
    return !!b;
  })()`);
  await sleep(400);
  console.log(
    'manage-mode delete buttons=' +
      (await win.webContents.executeJavaScript(`document.querySelectorAll('.tag-del').length`))
  );

  const clickedDel = await win.webContents.executeJavaScript(`(() => {
    const chips = Array.from(document.querySelectorAll('.tag-toggle'));
    const t = chips.find((s) => s.textContent.includes('自用必备') && s.querySelector('.tag-del'));
    if (!t) return false;
    t.querySelector('.tag-del').click();
    return true;
  })()`);
  console.log('clicked delete on 自用必备 = ' + clickedDel);
  await sleep(400);
  console.log(
    'confirm bar = ' +
      (await win.webContents.executeJavaScript(
        `!!Array.from(document.querySelectorAll('.warn-bar')).find((x) => x.textContent.includes('确定删除标签'))`
      ))
  );
  await shot(win, '09-delete-tag');

  await win.webContents.executeJavaScript(`(() => {
    const b = Array.from(document.querySelectorAll('.btn')).find(
      (x) => x.textContent.trim() === '确认删除'
    );
    if (b) b.click();
    return !!b;
  })()`);
  await sleep(800);
  console.log(
    'after delete = ' +
      JSON.stringify(
        await win.webContents.executeJavaScript(`(() => ({
          chipGone: !Array.from(document.querySelectorAll('.tag-toggle')).some((x) =>
            x.textContent.includes('自用必备')
          ),
          toasts: Array.from(document.querySelectorAll('.toast .t-title')).map((x) => x.textContent)
        }))()`)
      )
  );

  // 验证工坊 mod 详情页也有「加入合集」
  await win.webContents.executeJavaScript(`document.querySelector('.overlay').click()`);
  await sleep(500);
  const ws = await win.webContents.executeJavaScript(`(() => {
    const cards = Array.from(document.querySelectorAll('.card'));
    const c = cards.find((x) => x.querySelector('.badge.src-workshop'));
    if (!c) return null;
    c.click();
    return (c.querySelector('.card-name') || {}).textContent || null;
  })()`);
  console.log('opened workshop card: ' + ws);
  await sleep(800);
  const hasListSection = await win.webContents.executeJavaScript(
    `document.querySelectorAll('.list-toggle').length`
  );
  console.log('workshop detail list-chips=' + hasListSection);
  await shot(win, '06-workshop-detail');

  console.log('ERRORS ' + JSON.stringify(errors, null, 1));
  app.exit(0);
});
