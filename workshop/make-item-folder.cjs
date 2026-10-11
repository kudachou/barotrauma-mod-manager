/**
 * 汇总「要上传到创意工坊」的全部东西到一个文件夹。
 *
 * 为什么要脚本：条目里要放 78MB 的安装包，而 `workshop/` 是**会被提交**的目录。
 * 手动拷进去很容易连着 exe 一起 commit。所以统一输出到 `release-ws/workshop-upload/`
 * —— 那个目录已被 .gitignore 忽略。
 *
 * 产出的结构（`item-to-upload/` 才是**在游戏里选的那个文件夹**，其余是上传时
 * 在旁边复制粘贴用的）：
 *
 *   release-ws/workshop-upload/
 *     item-to-upload/             ← 游戏的上传对话框里选这个
 *       filelist.xml
 *       bmm-app.json
 *       barotrauma-mod-manager-workshop-setup-<版本>.exe
 *       setup.cmd
 *     preview/                    ← 上传界面选预览图时用
 *       cover.zh.png
 *       cover.en.png
 *     screenshots/                ← 插进描述正文用（编辑器插图按钮会传到 Steam CDN）
 *       zh-library-tag.png / zh-collections.png / zh-saves.png / zh-settings.png
 *       en-library-tag.png / en-collections.png / en-saves.png / en-settings.png
 *     描述-中文.bbcode.txt         ← 复制粘贴进描述框
 *     描述-英文.bbcode.txt
 *     标题与标签.txt               ← 标题、标签
 *     上传步骤.txt                 ← 一页清单
 *
 * 用法：node workshop/make-item-folder.cjs
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SRC = __dirname;
const OUT_ROOT = path.join(ROOT, 'release-ws', 'workshop-upload');
const ITEM = path.join(OUT_ROOT, 'item-to-upload');

/** 版本号以 package.json 为准，并校验各处一致 —— 不一致会让自更新误报 */
const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const pub = JSON.parse(fs.readFileSync(path.join(SRC, 'publication.json'), 'utf8'));
const marker = JSON.parse(fs.readFileSync(path.join(SRC, 'bmm-app.json'), 'utf8'));
const filelist = fs.readFileSync(path.join(SRC, 'filelist.xml'), 'utf8');

const problems = [];

const flVersion = (filelist.match(/modversion="([^"]+)"/) || [])[1];
if (flVersion !== version) {
  problems.push(`filelist.xml 的 modversion=${flVersion}，package.json 是 ${version}`);
}
/*
 * steamworkshopid 的规则：
 *   - 条目**已经发布过**（publication.json 里有 id）⇒ filelist.xml 必须带上同一个 id，
 *     否则下次上传会又新建一个条目，而不是更新原来那个。
 *   - 还没发布（id 为空占位）⇒ 不能带 id，带了就会去更新别人的条目。
 * 这个 id 是**游戏上传时自己写回**本地 filelist.xml 的，不是我们编的。
 */
const ourId = pub.id && /^\d+$/.test(String(pub.id)) ? String(pub.id) : null;
const flId = (filelist.match(/steamworkshopid\s*=\s*"([^"]*)"/i) || [])[1];
if (ourId && flId !== ourId) {
  problems.push(
    `条目已发布（id=${ourId}），但 filelist.xml 里的 steamworkshopid=${flId || '（没有）'}\n` +
      '     不带上它，下次上传会**新建一个条目**而不是更新 3817941004。'
  );
}
if (!ourId && flId) {
  problems.push(
    `还没发布（publication.json 的 id 是空的），但 filelist.xml 带了 steamworkshopid=${flId}\n` +
      '     带了就会去"更新那个条目"，也就是覆盖不属于我们的条目。'
  );
}
if (marker.version !== version) {
  problems.push(`bmm-app.json 的 version=${marker.version}，package.json 是 ${version}`);
}
if (marker.app !== 'barotrauma-mod-manager') {
  problems.push(`bmm-app.json 的 app=${marker.app}，程序认的是 barotrauma-mod-manager`);
}
if (pub.version !== version) {
  problems.push(`publication.json 的 version=${pub.version}，package.json 是 ${version}`);
}
// 当 mod 启用也必须无害：corepackage=False 且不声明任何 <Item>
if (!/corepackage="False"/.test(filelist)) {
  problems.push('filelist.xml 必须是 corepackage="False"（否则玩家误启用会真的去当 mod 加载）');
}
if (/<Item\s/.test(filelist)) {
  problems.push('filelist.xml 不应声明任何 <Item>（这是工具，不是内容包）');
}

const exeName = `barotrauma-mod-manager-workshop-setup-${version}.exe`;
const exePath = path.join(ROOT, 'release-ws', exeName);
if (!fs.existsSync(exePath)) {
  problems.push(`找不到安装包：release-ws/${exeName}（先跑 pnpm run pack:workshop）`);
}

/*
 * 两份描述的安装步骤里直接写了数字文件夹 id（方便玩家在
 * `workshop\content\602960\` 那上百个数字目录里一眼找到我们）。
 * id 同时出现在三处（描述 / filelist.xml / publication.json），换 id 时最容易被漏掉的就是描述，
 * 所以这里校验一下，漏了就报错。
 */
if (ourId) {
  for (const [name, file] of [
    ['中文描述', path.join(SRC, 'description.zh.bbcode.txt')],
    ['英文描述', path.join(SRC, 'description.en.bbcode.txt')]
  ]) {
    if (!fs.readFileSync(file, 'utf8').includes(ourId)) {
      problems.push(`${name}里没出现条目 id ${ourId} —— 安装步骤应写明数字文件夹，方便玩家找`);
    }
  }
}

if (problems.length) {
  console.error('❌ 不能汇总：');
  for (const p of problems) console.error('   - ' + p);
  process.exit(1);
}

/* ------------------------------ 组装 ------------------------------ */

fs.rmSync(OUT_ROOT, { recursive: true, force: true });
fs.mkdirSync(ITEM, { recursive: true });
fs.mkdirSync(path.join(OUT_ROOT, 'preview'), { recursive: true });

// 1) 条目本体
for (const f of ['filelist.xml', 'bmm-app.json', 'setup.cmd']) {
  fs.copyFileSync(path.join(SRC, f), path.join(ITEM, f));
}
fs.copyFileSync(exePath, path.join(ITEM, exeName));

// 2) 预览图 + 正文插图
for (const f of ['cover.zh.png', 'cover.en.png']) {
  fs.copyFileSync(path.join(SRC, 'cover', f), path.join(OUT_ROOT, 'preview', f));
}

const SHOT_SRC = path.join(SRC, 'screenshots');
const shotNames = fs.existsSync(SHOT_SRC)
  ? fs.readdirSync(SHOT_SRC).filter((f) => f.endsWith('.png')).sort()
  : [];
if (shotNames.length) {
  const shotOut = path.join(OUT_ROOT, 'screenshots');
  fs.mkdirSync(shotOut, { recursive: true });
  for (const f of shotNames) fs.copyFileSync(path.join(SHOT_SRC, f), path.join(shotOut, f));
}

// 3) 上传时要粘贴的文本
fs.copyFileSync(
  path.join(SRC, 'description.zh.bbcode.txt'),
  path.join(OUT_ROOT, '描述-中文.bbcode.txt')
);
fs.copyFileSync(
  path.join(SRC, 'description.en.bbcode.txt'),
  path.join(OUT_ROOT, '描述-英文.bbcode.txt')
);

fs.writeFileSync(
  path.join(OUT_ROOT, '标题与标签.txt'),
  [
    '标题（中文）  ' + pub.title,
    '标题（英文）  ' + pub.title_en,
    '可见性        ' + pub.visibility,
    '标签          ' + (pub.tags || []).join('、'),
    '',
    '预览图        preview\\cover.zh.png（中文条目） / cover.en.png（英文条目）',
    '',
    '说明：',
    '  - 标题里不要写版本号，版本号放在描述末尾或变更说明里',
    '  - 标签是 Valve 给工坊定的分类；QOL = 生活质量改进，Client-side = 客户端',
    '  - 上传后把条目 id 填进 workshop/publication.json 的 id / url'
  ].join('\r\n') + '\r\n',
  'utf8'
);

fs.writeFileSync(
  path.join(OUT_ROOT, '上传步骤.txt'),
  [
    '=== 创意工坊上传清单 ===',
    '',
    '前置：把管理器装成本地 mod（工坊上传只列出本地已存在的内容包）：',
    '     node workshop/install-local-mod.cjs "<游戏>\\LocalMods"',
    '   装好后内容包名 = ' + pub.title,
    '   封面与截图都在该内容包根目录里（游戏的上传界面只能从包内挑文件）。',
    '',
    '1. 打开游戏（工坊上传必须在游戏里做）',
    '2. 工坊上传界面，内容包选：' + pub.title,
    '3. 标题 / 标签：见 标题与标签.txt',
    '4. 描述：打开 描述-中文.bbcode.txt 全选复制，粘贴进描述框',
    '   （条目要面向国际用户的话，把 描述-英文.bbcode.txt 也贴进同一个框，',
    '     中英各一段，或者用 Steam 的"分语言描述"功能）',
    '5. 预览图：从内容包里选 cover.zh.png（英文条目用 cover.en.png）',
    '6. 正文插图：用描述编辑器的【插入图片】按钮，从内容包里选',
    '   （它会把图传到 Steam CDN 并插入 [img] 标记；本地路径不能直接写进 BBCode）',
    '   - 中文描述配 zh-*.png，英文描述配 en-*.png',
    '   - 建议放 4–5 张：library-tag（总览）、collections（加载顺序）、tags（分类标签）、',
    '     export（导出合集，含 .xml/.json/文本三种格式）',
    '   - saves（存档反查）与 settings 可放可不放',
    '   - 位置建议插在「能做什么」那一节之后、权限说明之前',
    '     （描述里没有留占位符 —— 留了用户就能看到没填的空标题）',
    '',
    '=== 两个不要忘 ===',
    '',
    '[1] 文件是"直接发布"还是"先隐藏"？',
    '    建议先隐藏发布（或先发成 private），自己在游戏里订阅一遍，确认：',
    '      - 条目能被识别为内容包（不报错）',
    '      - 里面的 exe 和两个 .cmd 能正常下载下来',
    '      - 误启用成 mod 时游戏不会崩（filelist 已声明 corepackage=False 且无内容）',
    '    确认无误再改成公开。',
    '',
    '[2] 这是工具，不是 mod。描述里那两段（"这是工具，不是 mod"和"权限说明"）',
    '    必须保留 —— 另一个同类工具就是因为被玩家发现"会枚举进程"而被举报到 Steam。',
    '',
    '=== 以后每次更新 ===',
    '',
    '  1) 改 package.json 的 version',
    '  2) 同步改 workshop/filelist.xml 的 modversion、bmm-app.json 与 publication.json 的 version',
    '  3) pnpm run pack:workshop',
    '  4) node workshop/make-item-folder.cjs   （会校验三处版本号一致）',
    '  5) 重新上传该内容包，并在工坊的"变更说明"里写这次改了什么',
    '',
    '  注意：bmm-app.json 的 version 必须等于安装包实际版本，',
    '        它就是工坊自更新提示的判断依据（electron/services/workshopupdate.js）。',
    '  注意：首次上传成功后，把新条目 id 写进 workshop/filelist.xml 的 steamworkshopid，',
    '        否则下次上传会**又新建一个条目**，而不是更新原来那个。',
    ''
  ].join('\r\n') + '\r\n',
  'utf8'
);

/* ------------------------------ 汇报 ------------------------------ */

function tree(dir, indent = '  ') {
  let total = 0;
  for (const name of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      console.log(`${indent}${name}/`);
      total += tree(p, indent + '  ');
    } else {
      console.log(`${indent}${(st.size / 1048576).toFixed(2).padStart(7)} MB  ${name}`);
      total += st.size;
    }
  }
  return total;
}

console.log(`✅ 已汇总 → ${path.relative(ROOT, OUT_ROOT)}\n`);
const total = tree(OUT_ROOT);
console.log(`\n合计 ${(total / 1048576).toFixed(2)} MB`);
console.log(`\n上传时选这个文件夹：\n  ${ITEM}`);
console.log('\n⚠️ 本条目不含 latest.yml（工坊版没有自更新），也不会上传到 GitHub Release。');
