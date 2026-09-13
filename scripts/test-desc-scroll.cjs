/**
 * 一次性：用真实数据 + 真实滚轮输入事件，验证工坊描述能不能滚。
 * 注意：滚轮坐标必须落在「描述区」与「弹窗可见区」的交集里，
 * 否则会打在标题栏上，测出假的"滚不动"。
 */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const services = require('../electron/services');
const { registerLocalImgScheme, handleLocalImg } = require('../electron/protocol');
const pkg = require('../package.json');

app.setName(pkg.productName || pkg.name);
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.disableHardwareAcceleration();
registerLocalImgScheme();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probe(win) {
  return win.webContents.executeJavaScript(`(() => {
    const wrap = document.querySelector('.ws-wrap');
    const body = document.querySelector('.modal-body');
    if (!wrap || !body) return { present: false };

    const wr = wrap.getBoundingClientRect();
    const br = body.getBoundingClientRect();
    const top = Math.max(wr.top, br.top);
    const bottom = Math.min(wr.bottom, br.bottom);
    const visible = bottom - top;

    const cs = getComputedStyle(wrap);
    return {
      present: true,
      wrapMaxHeight: cs.maxHeight,
      wrapOverflowY: cs.overflowY,
      wrapScrollable: wrap.scrollHeight > wrap.clientHeight + 2,
      wrapHeight: Math.round(wr.height),
      bodyScrollable: body.scrollHeight > body.clientHeight + 2,
      bodyScrollTop: Math.round(body.scrollTop),
      bodyMaxScroll: Math.round(body.scrollHeight - body.clientHeight),
      // 滚轮要打在这个点上才算数
      wheelPoint: visible > 20
        ? { x: Math.round(br.left + br.width / 2), y: Math.round((top + bottom) / 2) }
        : null,
      descVisiblePx: Math.round(visible)
    };
  })()`);
}

async function wheel(win, pt, deltaY) {
  win.webContents.sendInputEvent({ type: 'mouseWheel', x: pt.x, y: pt.y, deltaX: 0, deltaY, canScroll: true });
  await sleep(250);
}

app.whenReady().then(async () => {
  handleLocalImg();
  services.registerIpc();

  const win = new BrowserWindow({
    width: 1420,
    height: 920,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
      contextIsolation: true,
      backgroundThrottling: false,
      offscreen: true
    }
  });

  await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  await sleep(2500);

  const opened = await win.webContents.executeJavaScript(`(() => {
    const cards = Array.from(document.querySelectorAll('.card'));
    const pick =
      cards.find((x) => (x.querySelector('.card-name') || {}).textContent === 'LuaCsForBarotrauma') ||
      cards.find((x) => x.querySelector('.badge.src-workshop'));
    if (!pick) return null;
    pick.click();
    return (pick.querySelector('.card-name') || {}).textContent;
  })()`);
  console.log('打开的 mod: ' + opened);
  await sleep(4000);

  const start = await probe(win);
  console.log('\n初始状态:');
  console.log(JSON.stringify(start, null, 1));

  if (!start.present) {
    console.log('❌ 没有找到描述区域');
    app.exit(1);
    return;
  }

  console.log('\n在描述区域滚轮下滚（每次 -400，共 8 次）:');
  for (let i = 0; i < 8; i++) {
    const p = await probe(win);
    if (!p.wheelPoint) {
      console.log('  ⚠ 描述区已完全滚出可视范围，改用弹窗中心继续');
      const pt = await win.webContents.executeJavaScript(`(() => {
        const b = document.querySelector('.modal-body').getBoundingClientRect();
        return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };
      })()`);
      await wheel(win, pt, -400);
    } else {
      await wheel(win, p.wheelPoint, -400);
    }
    const now = await probe(win);
    console.log(`  ${i + 1}: bodyScrollTop = ${now.bodyScrollTop} / ${now.bodyMaxScroll}`);
  }

  const end = await probe(win);
  console.log('\n结论:');
  if (end.bodyScrollTop > start.bodyScrollTop) {
    console.log(`  ✅ 滚轮能滚：${start.bodyScrollTop} → ${end.bodyScrollTop}`);
    if (end.bodyScrollTop >= end.bodyMaxScroll - 4) console.log('  ✅ 能一直滚到底，描述完整可达');
    else console.log(`  ⚠ 还没到底（${end.bodyMaxScroll}），但确实在滚`);
  } else {
    console.log('  ❌ 滚轮滚不动');
  }
  if (end.wrapScrollable) console.log('  ⚠ 描述区内部还有一层滚动条（不应该）');
  else console.log('  ✅ 描述区内部没有嵌套滚动条');

  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, '..', 'shots', '20-desc-scroll-test.png'), img.toPNG());
  console.log('\n截图: shots/20-desc-scroll-test.png');

  app.exit(0);
});
