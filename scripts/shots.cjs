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

  /*
   * 回归测试：开着「有更新」筛选把工坊 mod 全部更新完之后，
   * 列表不能变空、筛选必须能自动取消。
   * 曾经的 bug：更新完 outdatedCount 归零 → 按钮不再渲染 → 但筛选条件还生效 →
   * 列表空掉且界面上没有任何地方能取消它。
   */
  const libState = `(() => ({
    count: (document.querySelector('.result-count') || {}).textContent || null,
    cards: document.querySelectorAll('.card').length,
    outdatedBtn: (() => {
      const b = Array.from(document.querySelectorAll('.toolbar .btn')).find((x) =>
        x.textContent.includes('有更新')
      );
      return b ? { text: b.textContent.trim(), active: b.classList.contains('primary') } : null;
    })()
  }))()`;

  const baseline = await win.webContents.executeJavaScript(libState);
  console.log('lib-baseline=' + JSON.stringify(baseline));

  await win.webContents.executeJavaScript(`(() => {
    const b = Array.from(document.querySelectorAll('.toolbar .btn')).find((x) =>
      x.textContent.includes('有更新')
    );
    if (b) b.click();
  })()`);
  await sleep(500);
  const filteredState = await win.webContents.executeJavaScript(libState);
  console.log('lib-filtered=' + JSON.stringify(filteredState));

  // 执行一次备份：mock 里会把已有本地副本更新掉，「有更新」数量随之归零
  await win.webContents.executeJavaScript(`(() => {
    const b = Array.from(document.querySelectorAll('.topbar .btn')).find((x) =>
      x.textContent.includes('备份工坊')
    );
    if (b) b.click();
  })()`);
  await sleep(1200);
  await win.webContents.executeJavaScript(`(() => {
    const b = Array.from(document.querySelectorAll('.modal-foot .btn')).find((x) =>
      x.textContent.includes('开始备份')
    );
    if (b) b.click();
  })()`);
  await sleep(1500);
  console.log(
    'backup-run=' +
      JSON.stringify(
        await win.webContents.executeJavaScript(`(() => {
          const nums = Array.from(document.querySelectorAll('.bk-num')).map((x) => x.textContent.trim());
          const foot = Array.from(document.querySelectorAll('.modal-foot .btn')).map((x) => x.textContent.trim());
          return { nums, foot };
        })()`)
      )
  );
  await win.webContents.executeJavaScript(`(() => {
    const b = Array.from(document.querySelectorAll('.modal-foot .btn')).find(
      (x) => x.textContent.trim() === '关闭'
    );
    if (b) b.click();
  })()`);
  await sleep(900);

  const afterUpdate = await win.webContents.executeJavaScript(libState);
  console.log('lib-after-update=' + JSON.stringify(afterUpdate));
  console.log(
    'update-filter-regression=' +
      JSON.stringify({
        更新前总数: baseline.cards,
        筛选后: filteredState.cards,
        更新后: afterUpdate.cards,
        列表没变空: afterUpdate.cards > 0,
        恢复成完整列表: afterUpdate.cards === baseline.cards,
        筛选按钮已消失: !afterUpdate.outdatedBtn
      })
  );

  // 「未分类」特殊标签：作为筛选芯片存在，且筛出来的每张卡都带「未分类」徽章
  await win.webContents.executeJavaScript(`(() => {
    const chip = Array.from(document.querySelectorAll('.chips-row .tag-toggle')).find((b) =>
      b.textContent.includes('未分类')
    );
    if (chip) chip.click();
  })()`);
  await sleep(500);
  console.log(
    'uncategorized=' +
      JSON.stringify(
        await win.webContents.executeJavaScript(`(() => {
          const chip = Array.from(document.querySelectorAll('.chips-row .tag-toggle')).find((b) =>
            b.textContent.includes('未分类')
          );
          const cards = Array.from(document.querySelectorAll('.card'));
          const withBadge = cards.filter((c) => c.textContent.includes('未分类')).length;
          return {
            芯片文案: chip ? chip.textContent.trim() : null,
            芯片已选中: chip ? chip.classList.contains('on') : null,
            筛出数量: (document.querySelector('.result-count') || {}).textContent || null,
            卡片数: cards.length,
            每张卡都标了未分类: cards.length > 0 && withBadge === cards.length
          };
        })()`)
      )
  );
  // 恢复「全部」
  await win.webContents.executeJavaScript(`(() => {
    const b = Array.from(document.querySelectorAll('.chips-row .tag-toggle')).find(
      (x) => x.textContent.trim() === '全部'
    );
    if (b) b.click();
  })()`);
  await sleep(300);

  /*
   * 回归测试：切到「工坊」后，分类芯片的计数要跟着来源变，不能还在数本地 mod。
   * 曾经的 bug：只查看工坊时，「未分类」芯片显示的数字仍然包含本地 mod。
   */
  await win.webContents.executeJavaScript(`(() => {
    const b = Array.from(document.querySelectorAll('.seg button')).find((x) =>
      x.textContent.includes('工坊')
    );
    if (b) b.click();
  })()`);
  await sleep(500);
  const wsScope = await win.webContents.executeJavaScript(`(() => {
    const chip = Array.from(document.querySelectorAll('.chips-row .tag-toggle')).find((b) =>
      b.textContent.includes('未分类')
    );
    const n = chip ? Number((chip.textContent.match(/(\\d+)/) || [])[1] || 0) : -1;
    if (chip) chip.click();
    return { 芯片数字: n };
  })()`);
  await sleep(500);
  const wsFiltered = await win.webContents.executeJavaScript(`(() => {
    const cards = Array.from(document.querySelectorAll('.card'));
    return {
      结果文案: (document.querySelector('.result-count') || {}).textContent || '',
      卡片数: cards.length,
      筛出来的都是工坊: cards.length > 0 && cards.every((c) => c.querySelector('.badge.src-workshop'))
    };
  })()`);
  console.log(
    'uncategorized-scope=' +
      JSON.stringify({
        ...wsScope,
        ...wsFiltered,
        芯片数字与实际一致: wsFiltered.卡片数 === wsScope.芯片数字
      })
  );
  // 复位：来源回「全部」、分类回「全部」
  await win.webContents.executeJavaScript(`(() => {
    const s = Array.from(document.querySelectorAll('.seg button')).find((x) =>
      x.textContent.includes('全部')
    );
    if (s) s.click();
    const c = Array.from(document.querySelectorAll('.chips-row .tag-toggle')).find(
      (x) => x.textContent.trim() === '全部'
    );
    if (c) c.click();
  })()`);
  await sleep(400);

  // 「已下架」标记 + 一键备份这些
  console.log(
    'delisted-chip=' +
      JSON.stringify(
        await win.webContents.executeJavaScript(`(() => {
          const chip = Array.from(document.querySelectorAll('.toolbar .btn')).find((b) =>
            b.textContent.includes('已下架')
          );
          if (!chip) return { present: false };
          const text = chip.textContent.trim();
          chip.click();
          return { present: true, text };
        })()`)
      )
  );
  await sleep(600);
  console.log(
    'delisted-filtered=' +
      JSON.stringify(
        await win.webContents.executeJavaScript(`(() => {
          const cards = Array.from(document.querySelectorAll('.card'));
          const badged = cards.filter((c) => c.querySelector('.badge.st-delisted')).length;
          const backupBtn = Array.from(document.querySelectorAll('.toolbar .btn')).find((b) =>
            b.textContent.includes('一键备份这些')
          );
          return {
            卡片数: cards.length,
            每张卡都带已下架徽章: cards.length > 0 && badged === cards.length,
            出现一键备份按钮: !!backupBtn
          };
        })()`)
      )
  );
  await shot(win, '20-delisted');

  await win.webContents.executeJavaScript(`(() => {
    const b = Array.from(document.querySelectorAll('.toolbar .btn')).find((x) =>
      x.textContent.includes('一键备份这些')
    );
    if (b) b.click();
  })()`);
  await sleep(1400);
  console.log(
    'delisted-backup=' +
      JSON.stringify(
        await win.webContents.executeJavaScript(`(() => ({
          标题: (document.querySelector('.modal-title') || {}).textContent || null,
          数字: Array.from(document.querySelectorAll('.bk-num')).map((x) => x.textContent.trim()),
          按钮: Array.from(document.querySelectorAll('.modal-foot .btn')).map((x) =>
            x.textContent.trim()
          )
        }))()`)
      )
  );
  await shot(win, '21-delisted-backup');
  await win.webContents.executeJavaScript(`(() => {
    const b = Array.from(document.querySelectorAll('.modal-foot .btn')).find(
      (x) => x.textContent.trim() === '取消'
    );
    if (b) b.click();
  })()`);
  await sleep(400);

  // 复位「已下架」筛选，否则后面的测试会一直在筛选后的列表上操作
  await win.webContents.executeJavaScript(`(() => {
    const chip = Array.from(document.querySelectorAll('.toolbar .btn')).find((b) =>
      b.textContent.includes('已下架')
    );
    if (chip && chip.classList.contains('primary')) chip.click();
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

  await win.webContents.executeJavaScript(
    `Array.from(document.querySelectorAll('.nav-item')).find((x) => x.textContent.trim().startsWith('合集')).click()`
  );
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

  // 合集列表顶部的「游戏当前应用」虚拟条目
  console.log(
    'applied-entry=' +
      JSON.stringify(
        await win.webContents.executeJavaScript(`(() => {
          const row = document.querySelector('.applied-row');
          if (!row) return { present: false };
          const badged = Array.from(document.querySelectorAll('.list-row')).filter((r) =>
            r.querySelector('.badge.applied')
          );
          return {
            present: true,
            text: row.textContent.replace(/\\s+/g, ' ').trim(),
            带当前应用徽章的合集数: badged.length
          };
        })()`)
      )
  );

  await win.webContents.executeJavaScript(
    `document.querySelector('.applied-row').click()`
  );
  await sleep(700);
  console.log(
    'applied-panel=' +
      JSON.stringify(
        await win.webContents.executeJavaScript(`(() => {
          const head = document.querySelector('.editor-head h3');
          const idx = Array.from(document.querySelectorAll('.mod-row .row-index')).map(
            (x) => x.textContent.trim()
          );
          const names = Array.from(document.querySelectorAll('.mod-row .row-name')).map((x) =>
            x.textContent.trim()
          );
          return {
            标题: head ? head.textContent.trim() : null,
            行数: idx.length,
            序号连续: idx.every((v, i) => Number(v) === i + 1),
            前三个: names.slice(0, 3),
            只读无删除按钮: document.querySelectorAll('.mod-rows .btn.icon').length === 0
          };
        })()`)
      )
  );
  await shot(win, '17-applied');

  await win.webContents.executeJavaScript(
    `Array.from(document.querySelectorAll('.nav-item')).find((x) => x.textContent.trim().startsWith('设置')).click()`
  );
  await sleep(800);
  await shot(win, '03-settings');

  await win.webContents.executeJavaScript(
    `Array.from(document.querySelectorAll('.nav-item')).find((x) => x.textContent.trim().startsWith('Mod')).click()`
  );
  await sleep(600);
  // 详情页测试要验证「历史版本」和「删除本地 mod」——这两块只有本地 mod 才有，
  // 所以必须明确挑一张本地卡（不能退回 cards[0]，那可能是工坊 mod）
  const picked = await win.webContents.executeJavaScript(`(() => {
    const cards = Array.from(document.querySelectorAll('.card'));
    const local = cards.filter((x) => x.querySelector('.badge.src-local'));
    const c =
      local.find((x) => x.querySelector('.badge.st-older')) || local[0] || cards[0];
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

  // 验证「删除本地 mod」确认条
  await win.webContents.executeJavaScript(`(() => {
    const b = Array.from(document.querySelectorAll('.modal-foot .btn')).find((x) =>
      x.textContent.includes('删除本地 mod')
    );
    if (b) b.click();
    return !!b;
  })()`);
  await sleep(500);
  console.log(
    'delete-local-confirm=' +
      JSON.stringify(
        await win.webContents.executeJavaScript(`(() => {
          const bar = document.querySelector('.danger-bar');
          return {
            shown: !!bar,
            text: bar ? bar.textContent.replace(/\\s+/g, ' ').trim().slice(0, 90) : null,
            hasCheckbox: !!document.querySelector('.cb-row input')
          };
        })()`)
      )
  );
  await shot(win, '15-delete-local');
  await win.webContents.executeJavaScript(`(() => {
    const b = Array.from(document.querySelectorAll('.danger-bar .btn')).find(
      (x) => x.textContent.trim() === '取消'
    );
    if (b) b.click();
  })()`);
  await sleep(300);

  // 关联 mod：先加一个关联……
  await win.webContents.executeJavaScript(`(() => {
    const b = Array.from(document.querySelectorAll('.modal .btn')).find((x) =>
      x.textContent.includes('添加关联 mod')
    );
    if (b) b.click();
  })()`);
  await sleep(400);
  const relPicked = await win.webContents.executeJavaScript(`(() => {
    const cands = Array.from(document.querySelectorAll('.rel-cand'));
    if (!cands.length) return null;
    const name = (cands[0].querySelector('.rel-name') || {}).textContent || '';
    cands[0].click();
    return name;
  })()`);
  await sleep(700);
  const relRows = await win.webContents.executeJavaScript(
    `Array.from(document.querySelectorAll('.rel-row .rel-name')).map((x) => x.textContent.trim())`
  );
  await win.webContents.executeJavaScript(`(() => {
    const b = Array.from(document.querySelectorAll('.rel-picker .btn')).find(
      (x) => x.textContent.trim() === '完成'
    );
    if (b) b.click();
  })()`);
  await sleep(300);
  console.log(
    'relation-added=' + JSON.stringify({ 选中: relPicked, 关联列表: relRows })
  );

  // ……再验证「加入合集时可选是否一并加入关联 mod」
  const chip = await win.webContents.executeJavaScript(`(() => {
    const c = Array.from(document.querySelectorAll('.list-toggle')).find(
      (x) => !x.classList.contains('on')
    );
    if (!c) return null;
    const label = c.textContent.trim();
    c.click();
    return label;
  })()`);
  console.log('clicked modlist chip: ' + chip);
  await sleep(700);
  console.log(
    'related-prompt=' +
      JSON.stringify(
        await win.webContents.executeJavaScript(`(() => {
          const bar = Array.from(document.querySelectorAll('.warn-bar')).find((b) =>
            b.textContent.includes('关联 mod')
          );
          if (!bar) return { shown: false };
          return {
            shown: true,
            text: bar.textContent.replace(/\\s+/g, ' ').trim().slice(0, 110),
            buttons: Array.from(bar.querySelectorAll('.btn')).map((b) => b.textContent.trim())
          };
        })()`)
      )
  );
  await shot(win, '18-related-prompt');

  await win.webContents.executeJavaScript(`(() => {
    const bar = Array.from(document.querySelectorAll('.warn-bar')).find((b) =>
      b.textContent.includes('关联 mod')
    );
    const b =
      bar && Array.from(bar.querySelectorAll('.btn')).find((x) => x.textContent.includes('一起加入'));
    if (b) b.click();
  })()`);
  await sleep(900);
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

  // 验证工坊描述的解析与渲染（BBCode → 结构化节点）
  console.log(
    'workshop-desc=' +
      JSON.stringify(
        await win.webContents.executeJavaScript(`(() => {
          const body = document.querySelector('.ws-body');
          if (!body) return { present: false };
          return {
            present: true,
            headings: Array.from(body.querySelectorAll('.ws-h')).map((x) => x.textContent.trim()),
            listItems: Array.from(body.querySelectorAll('.ws-ul li')).map((x) => x.textContent.trim()),
            links: Array.from(body.querySelectorAll('.ws-link')).map((x) => x.textContent.trim()),
            hasHr: !!body.querySelector('.ws-hr'),
            hasBold: !!body.querySelector('b'),
            hasItalic: !!body.querySelector('i'),
            rawBbcodeLeft: /\\[(b|i|url|h1|h2|h3|list)\\]/i.test(body.textContent),
            stats: Array.from(document.querySelectorAll('.ws-stats span')).map((x) => x.textContent.trim())
          };
        })()`)
      )
  );
  // 描述现在不折叠（整段铺开、由弹窗统一滚），直接截图
  await shot(win, '16-workshop-desc');

  // 确认「没有内层滚动条、由弹窗整体滚」
  console.log(
    'desc-scroll=' +
      JSON.stringify(
        await win.webContents.executeJavaScript(`(() => {
          const w = document.querySelector('.ws-wrap');
          const body = document.querySelector('.modal-body');
          if (!w || !body) return { present: false };
          const cs = getComputedStyle(w);
          return {
            wrapMaxHeight: cs.maxHeight,
            wrapOverflowY: cs.overflowY,
            wrapScrollable: w.scrollHeight > w.clientHeight + 2,
            contentHeight: w.scrollHeight,
            bodyScrollable: body.scrollHeight > body.clientHeight + 2,
            bodyScrollHeight: body.scrollHeight,
            bodyClientHeight: body.clientHeight
          };
        })()`)
      )
  );

  /* ------------------------------ 存档页 ------------------------------ */
  // 先关掉上面留下来的工坊详情弹窗（点遮罩关闭），否则截图会被它盖住
  await win.webContents.executeJavaScript(`(() => {
    const ov = document.querySelector('.overlay');
    if (ov) ov.click();
    return !!ov;
  })()`);
  await sleep(500);
  // 预览模式（无 preload）下走 api.ts 里的示例存档
  await win.webContents.executeJavaScript(
    `Array.from(document.querySelectorAll('.nav-item')).find((x) => x.textContent.trim().startsWith('存档')).click()`
  );
  await sleep(1200);
  console.log(
    'saves=' +
      JSON.stringify(
        await win.webContents.executeJavaScript(`(() => ({
          rows: Array.from(document.querySelectorAll('.list-row')).map((r) => r.textContent.replace(/\\s+/g,' ').trim()),
          badges: Array.from(document.querySelectorAll('.list-row .badge')).map((b) => b.textContent.trim()),
          detail: (document.querySelector('.editor') || {}).textContent
            ? document.querySelector('.editor').textContent.replace(/\\s+/g,' ').trim().slice(0, 200)
            : null,
          modRows: document.querySelectorAll('.editor .mod-row').length,
          buttons: Array.from(document.querySelectorAll('.editor-head button')).map((b) => b.textContent.trim())
        }))()`)
      )
  );
  await shot(win, '20-saves');

  /* --------------------------- 同步到游戏弹窗 --------------------------- */
  // 预览模式的示例数据里有一个「Steam 已下载、游戏还没装」的 mod，顶栏会出现这个按钮
  const openedSync = await win.webContents.executeJavaScript(`(() => {
    const b = Array.from(document.querySelectorAll('.topbar button')).find((x) =>
      x.textContent.includes('同步到游戏')
    );
    if (!b) return false;
    b.click();
    return true;
  })()`);
  await sleep(900);
  console.log(
    'installsync=' +
      JSON.stringify(
        await win.webContents.executeJavaScript(`(() => ({
          opened: ${JSON.stringify(openedSync)},
          title: (document.querySelector('.modal-title') || {}).textContent || null,
          rows: Array.from(document.querySelectorAll('.modal .bk-row')).map((x) =>
            x.textContent.replace(/\\s+/g, ' ').trim()
          ),
          buttons: Array.from(document.querySelectorAll('.modal-foot button')).map((x) =>
            x.textContent.trim()
          )
        }))()`)
      )
  );
  await shot(win, '22-sync-modal');
  await win.webContents.executeJavaScript(`(() => {
    const b = Array.from(document.querySelectorAll('.modal-foot button')).find((x) =>
      x.textContent.trim() === '取消'
    );
    if (b) b.click();
    return !!b;
  })()`);
  await sleep(400);

  console.log('ERRORS ' + JSON.stringify(errors, null, 1));
  app.exit(0);
});
