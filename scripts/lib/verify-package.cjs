/**
 * 打包产物校验（完整版与创意工坊版共用）。
 *
 * ## 为什么必须有
 *
 * electron-builder 打出来的 app.asar，实测把**整个仓库**都装进去了：
 *
 *     17.46 MB  shots\           界面截图
 *     12.00 MB  tmp-*-ui\        7 个自检临时产物目录
 *      2.08 MB  docs\
 *      0.31 MB  src\             整个源码
 *   还有 pnpm-lock.yaml / tsconfig.json / vite.config.ts / tc.log
 *
 * 本该只有 `electron/**` + `dist/**` ≈ 2.5 MB，实际 35 MB。而且这是**静默**的：
 * 打包成功、退出码 0，不主动查根本不知道。已发布出去的安装包很可能一直带着这些
 * ——既白占体积，也把开发期的目录结构暴露给用户。
 *
 * 所以两条构建线打完包都要跑一遍这个校验，不合格就让构建失败。
 */
const fs = require('node:fs');
const path = require('node:path');

/** 不该出现在 app.asar 里的顶层目录/文件（精确匹配） */
const FORBIDDEN = [
  'shots', // 界面截图（17 MB）
  'docs', // 文档
  'src', // 渲染层源码
  'scripts', // 自检脚本
  'pnpm-lock.yaml',
  'tsconfig.json',
  'vite.config.ts',
  'tc.log'
];

/**
 * 不该出现的**前缀**规则。
 *
 * 比逐个列目录可靠：自检临时目录是按脚本名生成的（`tmp-apply-ui`、`tmp-browse-ui`、
 * `tmp-i18n-ui`…），新增一个自检就多一个 —— 之前那个手写清单就漏了三个。
 * `.bmm-*` 是构建/调试期的临时产物（`.bmm-build-tmp` 等）。
 */
const FORBIDDEN_PREFIXES = ['tmp-', '.bmm'];

/** 除禁止项外，总体积也不能超这个数（正常情况下约 2.5 MB） */
const MAX_ASAR_MB = 4;

/**
 * 读 app.asar 的头部清单。
 * asar 格式：前 16 字节头部（第 12 字节起是 4 字节的 header 长度），紧跟 JSON 清单。
 */
function readAsarEntries(asarPath) {
  const fd = fs.openSync(asarPath, 'r');
  try {
    const head = Buffer.alloc(16);
    fs.readSync(fd, head, 0, 16, 0);
    const headerSize = head.readUInt32LE(12);
    const hb = Buffer.alloc(headerSize);
    fs.readSync(fd, hb, 0, headerSize, 16);
    // 清单尾部用 \0 补齐
    const tree = JSON.parse(hb.toString('utf8').replace(/\0+$/, ''));
    const out = [];
    const walk = (node, prefix) => {
      for (const [name, v] of Object.entries(node.files || {})) {
        if (v.files) walk(v, `${prefix}/${name}`);
        else out.push({ path: `${prefix}/${name}`, size: v.size || 0 });
      }
    };
    walk(tree, '');
    return out;
  } finally {
    fs.closeSync(fd);
  }
}

/** 某个顶层目录/文件占多少字节 */
function sizeOf(entries, name) {
  return entries
    .filter((e) => e.path.startsWith(`/${name}/`) || e.path === `/${name}`)
    .reduce((a, e) => a + e.size, 0);
}

/**
 * 校验一个已经打好的 win-unpacked。
 *
 * @param {string} resourcesDir `<输出目录>\win-unpacked\resources`
 * @param {object} [opts]
 * @param {string|null} [opts.expectVariant] 期望的变体（读 resources/app-variant.json）；null = 不检查
 * @returns {boolean} 是否通过
 */
function verifyPackage(resourcesDir, opts = {}) {
  const problems = [];
  const log = opts.log || console.log;
  const expectVariant = opts.expectVariant === undefined ? null : opts.expectVariant;

  // 1) 变体标记（只有工坊版需要；完整版**不该**有这个文件，否则会被误判成工坊版）
  const markerOut = path.join(resourcesDir, 'app-variant.json');
  const hasMarker = fs.existsSync(markerOut);
  if (expectVariant === 'workshop') {
    if (!hasMarker) {
      problems.push('resources/app-variant.json 不存在 —— 工坊版会被误判成完整版');
    } else {
      try {
        const v = JSON.parse(fs.readFileSync(markerOut, 'utf8')).variant;
        if (v !== 'workshop') problems.push(`app-variant.json 里 variant=${v}，应为 workshop`);
      } catch (e) {
        problems.push('app-variant.json 读不动：' + ((e && e.message) || e));
      }
    }
  } else if (expectVariant === 'full' && hasMarker) {
    problems.push('完整版里不该有 resources/app-variant.json —— 会被误判成工坊版');
  }

  // 2) asar 清单
  const asarPath = path.join(resourcesDir, 'app.asar');
  if (!fs.existsSync(asarPath)) {
    problems.push('resources/app.asar 不存在');
  } else {
    const entries = readAsarEntries(asarPath);
    const totalMB = entries.reduce((a, e) => a + e.size, 0) / 1048576;

    for (const bad of FORBIDDEN) {
      const bytes = sizeOf(entries, bad);
      if (bytes > 0) {
        problems.push(`asar 里混进了 ${bad}/（${(bytes / 1048576).toFixed(2)} MB）`);
      }
    }
    // 前缀规则：自检临时目录（tmp-*）与调试产物（.bmm*）
    const tops = new Set(entries.map((e) => e.path.split('/')[1]).filter(Boolean));
    for (const top of tops) {
      if (FORBIDDEN_PREFIXES.some((p) => top.startsWith(p))) {
        const bytes = sizeOf(entries, top);
        problems.push(
          `asar 里混进了 ${top}/（${(bytes / 1048576).toFixed(2)} MB）—— 匹配禁止前缀`
        );
      }
    }
    log(`[verify] asar 清单：${entries.length} 个文件，共 ${totalMB.toFixed(2)} MB`);
    if (totalMB > MAX_ASAR_MB) {
      problems.push(`asar 有 ${totalMB.toFixed(2)} MB，超过阈值 ${MAX_ASAR_MB} MB`);
    }
  }

  if (problems.length) {
    console.error('\n[verify] ❌ 产物校验不通过：');
    for (const p of problems) console.error('   - ' + p);
    console.error('   检查 electron-builder 配置里的 files 段。');
    return false;
  }
  log('[verify] ✅ 产物校验通过');
  return true;
}

/**
 * 校验 updater 清单（`latest.yml`）。
 *
 * ## 为什么这条必须有
 *
 * electron-builder 因为 package.json 里配了 `publish`（GitHub provider），
 * **每个构建都会在自己的输出目录写一份 `latest.yml`**，名字一模一样。而一个 GitHub Release
 * 里只能存在一个 `latest.yml` —— 谁最后传上去，谁就决定所有客户端的自动更新指向哪个包。
 *
 * 创意工坊版**没有自更新**（`features.autoUpdater` 为 false，主进程不注册 updater 的 IPC），
 * 那份 manifest 毫无用处；一旦手滑和 exe 一起传上去，就会覆盖完整版的清单，
 * 让所有完整版用户在下次启动时被"更新"成功能被砍掉的工坊版。**静默、且不可逆。**
 *
 * 所以把它变成构建期约束，而不是发布清单里的注意事项：
 *   - 工坊版：`expect: 'none'` —— 输出目录里**不得存在** latest.yml
 *   - 完整版：`expect: 'full'` —— 必须存在，且 url **不得**指向 workshop 包
 *
 * @param {string} outputDir electron-builder 的输出目录（如 `release` / `release-ws`）
 * @param {{expect: 'none'|'full', log?: Function}} opts
 * @returns {boolean}
 */
function verifyUpdaterManifest(outputDir, opts = {}) {
  const log = opts.log || console.log;
  const expect = opts.expect === 'none' ? 'none' : 'full';
  const file = path.join(outputDir, 'latest.yml');

  if (expect === 'none') {
    if (fs.existsSync(file)) {
      console.error(
        `\n[verify] ❌ 工坊版不该有 ${path.relative(process.cwd(), file)}：\n` +
          '   它没有自更新，这份 manifest 只会被误传到 Release 上覆盖完整版的更新清单，\n' +
          '   把所有完整版用户更新成工坊版。删掉它，并检查 build-workshop.cjs 里的清理步骤。'
      );
      return false;
    }
    log('[verify] ✅ 工坊版没有产出 latest.yml（不会污染 Release 的更新清单）');
    return true;
  }

  if (!fs.existsSync(file)) {
    console.error(`\n[verify] ❌ 完整版缺少 ${file} —— 自动更新拿不到清单`);
    return false;
  }
  const text = fs.readFileSync(file, 'utf8');
  const url = (text.match(/^\s*-?\s*url:\s*(\S+)/m) || [])[1] || '';
  if (/workshop/i.test(url)) {
    console.error(
      `\n[verify] ❌ 完整版的 latest.yml 指向了工坊版：${url}\n` +
        '   必须指向 barotrauma-mod-manager-setup-*.exe，否则完整版用户会被更新成工坊版。'
    );
    return false;
  }
  log(`[verify] ✅ 完整版 latest.yml 指向 ${url}`);
  return true;
}

module.exports = {
  FORBIDDEN,
  FORBIDDEN_PREFIXES,
  MAX_ASAR_MB,
  readAsarEntries,
  sizeOf,
  verifyPackage,
  verifyUpdaterManifest
};
