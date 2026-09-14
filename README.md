# 潜渊症 Mod 管理器

替代《潜渊症 / Barotrauma》内置 mod 管理器的桌面工具。合集编排、一键应用到游戏、本地 mod 与创意工坊版本对比、封面、按功能分类。

> 内置管理器的问题：不能按功能分类、看不到 mod 封面、本地自改的 mod 和创意工坊版本分不清、合集编辑要一个个点。

![Mod 库](docs/screenshot-library.png)

## 功能

**Mod 库**
- 卡片网格，显示封面、版本、来源（本地 / 创意工坊）、分类标签
- 版本对比状态：`工坊有更新` / `本地已改版` / `本地=工坊`
- 搜索、来源筛选、分类筛选、「有更新」快捷筛选、排序
- **「未分类」快捷筛选**：一键筛出还没有任何标签的 mod —— 新订阅的 mod 通常都在这里
- **「已下架」标记**：标出已被作者从创意工坊撤掉的 mod（工坊上再也下不到了），
  可以一键只备份这些。**填了 Steam Web API Key 时判定准确且很快**（一次批量请求、约 1 秒）；
  没填则退回抓工坊网页，只能得出「工坊不可见」—— 因为网页分不清「已下架」和「作者设为私有」
- 工具栏与筛选条固定，只有卡片区滚动

**合集**
- 管理游戏的 `ModLists\*.xml`：新建 / 重命名 / 删除
- 拖拽排序（**顺序即加载顺序**）、搜索添加、移除、缺失提示
- **一键应用到游戏**：解析 → 备份 `config_player.xml`（固定一个备份，每次覆盖）→ 只替换 `contentpackages` 段
  - 应用后**立刻重新扫描**，界面上「游戏当前应用」和「当前应用」徽章马上就是新的（不用点第二次）
- **「游戏当前应用」**：合集列表顶部直接列出游戏现在真正加载的 mod（读自 `config_player.xml`，
  按加载顺序），只读；内容与之一致的合集会打上「当前应用」徽章

**Mod 详情**
- **创意工坊描述**：直接显示 mod 作者写的描述（保留标题层级、列表、粗体斜体、链接、分隔线），
  并附带订阅数 / 收藏数 / 浏览量 / 更新时间、工坊标签
- 本地 ↔ 创意工坊版本对比
- **加入合集**：点一下加入/移出任意合集，也能当场新建合集并加进去
- **关联 mod（前置需求）**：手动记下某个 mod 依赖哪些 mod；加入合集时会问一句
  「要不要把关联的也一起加进去」——前置没加进去是最常见的加载失败原因
- **新建 / 删除分类标签**
- 设置封面、打开文件夹、跳转工坊页面
- 用创意工坊版覆盖本地版（自动快照）、把工坊版复制为新本地 mod
- **删除本地 mod**：连历史快照一起清掉

**启动游戏**
- 顶部「启动游戏」一键拉起潜渊症；找不到 exe 时自动交回 Steam 启动

**存档**
- **看每个存档当时启用了哪些 mod**：直接解析 `.save`（gzip 压缩的 XML）里的
  `selectedcontentpackagenames`，按**加载顺序**列出，并标出哪些 mod 现在游戏里已经没有了
- **找到能用它实现该存档的合集**：标出「完全一致」或「某某合集完全覆盖了它」，
  并把合集里多出来的 mod 逐个列出来；一键「应用」那个合集，或「按存档启用」直接新建合集并应用
- 存档从 `config_player.xml` 的 `savepath` 读取（为空时用默认位置），单机与多人存档分开列

**备份与回滚**
- **一键备份所有工坊 mod 到本地**：全量复制进 `LocalMods`，工坊更新或下架都不怕
  - 先规划再执行：先告诉你占多少磁盘、几个新建几个更新，确认后才动手
  - 优先取游戏实际加载的那份（`WorkshopMods\Installed`），长任务带进度、可取消
- **本地 mod 历史版本与回滚**：每个本地 mod **只保留最近 1 份快照**（改动前的状态），随时回到那个版本
  - 手动「创建快照」；此外**每次覆盖工坊版、每次再次备份工坊 mod 之前都会自动留一份**
  - 回滚前会先把当前状态顶上来当成新的那份快照，所以**回滚本身也能撤销**（再点一次就滚回去了）
  - 只留 1 份是为了省空间；想多留历史，把 `electron/services/backup.js` 里的 `MAX_SNAPSHOTS` 调大即可
- **删除本地 mod**：详情页一键删除，连它的历史快照一起清掉；可选同时从所有合集里移除引用

**封面**
- 创意工坊 mod 自动从 Steam 拉封面并缓存到本地，之后离线可用
- 本地 mod 默认占位图，可手动指定

## 截图

![合集](docs/screenshot-collections.png)

![存档](docs/screenshot-saves.png)

## 运行

从 [Releases](../../releases) 下载 `barotrauma-mod-manager-setup-<版本>.exe`，双击安装（**按用户安装，不需要管理员权限**，装到 `%LocalAppData%\Programs\`）。

首次打开会自动扫描常见 Steam 安装位置来填充目录设置；没检测到就在「设置」页点「自动检测」或手动指定。

### 自动更新

装好之后**不用再手动下载**：

- 每次启动会静默向 GitHub 查一次新版本，有更新时界面顶部出现提示条
- 点「下载更新」→ 下载完点「立即重启安装」→ 程序自动重启到新版本
- 也可以在「设置 → 关于与更新」里手动检查，并查看更新说明

> 更新走的是 [electron-updater](https://www.electron.build/auto-update) + GitHub Releases：
> 它会读取最新 release 里的 `latest.yml`，与当前版本比较，然后下载安装包。
> 所以**发布新版本时 `latest.yml` 必须一起上传**，否则更新会失败（见下面的「发布新版本」）。

### 需要填的 6 个目录

| 设置项 | 说明 |
| --- | --- |
| 游戏根目录 | 潜渊症安装目录，如 `…\steamapps\common\Barotrauma` |
| 合集文件夹 | `…\Barotrauma\ModLists` |
| 本地 mod 文件夹 | `…\Barotrauma\LocalMods` |
| 创意工坊 mod 文件夹 | `…\steamapps\workshop\content\602960` |
| config_player.xml | 「应用到游戏」写入的目标 |
| 已安装的工坊 mod 目录 | `%LocalAppData%\…\WorkshopMods\Installed`（游戏**实际加载**的位置） |

## 从源码构建

需要 Node.js 18+ 与 pnpm。

```bash
pnpm install
pnpm app            # 构建界面 + 启动桌面客户端
```

其它命令：

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 只跑界面开发服务器（浏览器打开，走内置示例数据） |
| `pnpm build` | 只构建界面产物到 `dist/` |
| `pnpm start` | 用已构建的 `dist/` 启动桌面客户端 |
| `pnpm run pack` | 打包成 NSIS 安装包（输出到 `release/`） |

> 要用 `pnpm run pack`。裸写 `pnpm pack` 会命中 pnpm 自己的内置命令（打 npm 包），不会走这里的打包脚本。

打包产物有三个，缺一不可：

```
release\barotrauma-mod-manager-setup-<版本>.exe            安装包
release\barotrauma-mod-manager-setup-<版本>.exe.blockmap   增量更新用
release\latest.yml                                        自动更新清单
```

> 安装包文件名刻意用 ASCII：`latest.yml` 里的 `path` 必须和实际上传的文件名**完全一致**，
> 用中文名时 electron-builder 生成的两者会对不上，导致更新 404。

图标由 `node scripts/make-icon.cjs` 生成 —— 纯 Node 手写 PNG 编码 + ICO 封装，不依赖任何图形库。

<details>
<summary>首次打包可能因 Windows 符号链接权限失败（点开看解决办法）</summary>

electron-builder 会解压 `winCodeSign-2.6.0.7z`，包里含两个 macOS 的符号链接
（`darwin/10.12/lib/libcrypto.dylib`、`libssl.dylib`）。普通 Windows 账户没有
「创建符号链接」特权，解压会报：

```
ERROR: Cannot create symbolic link … 客户端没有所需的特权。
```

这对 Windows 打包没有实际影响 —— 该目录里 Windows 侧真正需要的只有 `rcedit-x64.exe`
（用于写入 exe 图标与版本信息），它其实已经解压出来了。两种解法任选：

1. **把已解压内容补到正式缓存名**（推荐，不用改系统设置）：解压失败后会留下若干数字名的
   临时目录，把其中一个复制成 `winCodeSign-2.6.0`，再重跑 `pnpm run pack` 即可 ——
   electron-builder 的 `getBin` 只要看到该目录存在就会跳过解压。

   ```powershell
   $cache = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
   $tmp = Get-ChildItem $cache -Directory | Where-Object { $_.Name -match '^\d+$' } | Select-Object -First 1
   Copy-Item $tmp.FullName (Join-Path $cache 'winCodeSign-2.6.0') -Recurse -Force
   ```

2. 开启 Windows 开发者模式（设置 → 系统 → 开发者选项），账号即可获得该特权。

</details>

## 发布新版本

1. 改 `package.json` 里的 `version`（例如 `0.1.0` → `0.2.0`）。**不改版本号客户端不会认为有更新。**
2. 打包：

   ```bash
   pnpm run pack
   ```

3. 到 [Releases](../../releases) → **Draft a new release**：
   - **Choose a tag** 填 `v0.2.0`（与 `version` 保持一致）→ 点 **Create new tag**
   - 上传**两个**文件（只传 exe 是不够的）：
     - `release\barotrauma-mod-manager-setup-0.2.0.exe`
     - `release\latest.yml`
   - ⚠️ **不要勾 `Set as a pre-release`** —— 预发布版本客户端会直接跳过
   - 点 **Publish release**

4. 老版本客户端下次启动就会提示更新，点两下即可完成升级。

> 也可以让 electron-builder 自己建 release 并上传，省掉手动传文件：
>
> ```powershell
> $env:GH_TOKEN='<有 repo 权限的 token>'
> pnpm run pack -- --publish always
> ```

## 工作原理

### 合集文件格式

游戏的合集是 `ModLists\` 下的 XML，格式很简单：

```xml
<?xml version="1.0" encoding="utf-8"?>
<mods name="联机">
  <Vanilla />
  <Workshop name="Lua For Barotrauma" id="2559634234" />
  <Local name="我的自改版" />
</mods>
```

- **创意工坊 mod 靠 `id` 定位**，`name` 只是备注 —— 它经常过期（比如合集里写着
  `Lua For Barotrauma`，mod 现在其实叫 `LuaCsForBarotrauma`）。本工具一律以 `id` 为准，
  显示时用 mod 当前的真实名称。
- 本地 mod 靠 `name` 定位，也就是 `LocalMods` 下的文件夹名。
- **条目顺序就是加载顺序**，所以顺序可拖拽调整。

### 「应用到游戏」是怎么写的

游戏的当前启用列表存在 `config_player.xml` 的 `<contentpackages>` 段里，是**解析后的绝对路径**，
不是合集名。所以应用合集时会：

1. 把 `Workshop` 条目解析成 `…\WorkshopMods\Installed\{id}\filelist.xml`
   （**注意**：游戏实际加载的是 `Installed` 目录，不是 Steam 的 `workshop\content` 订阅缓存）
2. 把 `Local` 条目解析成 `LocalMods\{名称}\filelist.xml`（**游戏的相对写法**，写绝对路径游戏认不出来）
3. 备份到 `config_player.xml.bak`（**固定就这一个文件，每次应用覆盖它**）
4. **只替换** `<contentpackages>` 段

第 4 步是字符串级替换而非整份重写，并且刻意沿用原文件的行尾风格（CRLF/LF）与缩进、
保留 UTF-8 BOM —— 也就是段外的内容**逐字节不变**。如果文件里没有该段，直接中止、不写任何内容。

内容跟当前配置**完全一样时什么都不写**（连备份都不动），所以反复点「应用到游戏」不会把备份
冲成"已应用之后"的状态。旧版本（≤ 0.2.5）每次应用都会留一个 `config_player.xml.bak-<时间戳>`，
应用多了游戏根目录里全是这些文件；新版在下次应用时会把它们**一并清掉**，之后永远只有一个。

### 版本对比

每个 mod 的 `filelist.xml` 里有 `modversion`、`steamworkshopid` 等字段。
**本地复制的 mod 通常保留着原来的 `steamworkshopid`**，所以能精确匹配到工坊对应版本，
再比版本号。

版本号比较按段拆分；段数少的一方按 0 补齐，因此 `2.0` 与 `2.0.0` 视为相同
（否则同一版本会被误报成「工坊有更新」）。非纯数字的段回退字符串比较。

### 封面

走 Steam 的公开接口 `ISteamRemoteStorage/GetPublishedFileDetails`（**不需要 API Key**），
一次请求可带 50 个 id —— 100 多个 mod 只需 3 次请求，返回里就有 `preview_url`，
下载后缓存到本地。

> 不用抓商店页 `og:image` 的方案：Steam 现在返回 SSR 页面，HTML 里已经没有 `og:image`，抓取不可靠。

只有接口**明确答复**该条目没有封面时才写负面缓存；网络错误 / 被限流一律不写，
避免一次限流导致封面长期不刷新。

### 创意工坊描述

同一个接口里就有 `description`（作者写的原文，Steam BBCode 格式）、`tags` 和订阅/收藏/浏览量，
按需取回并在本地缓存 7 天。

描述**来自第三方作者，内容不可信**，所以界面只把它解析成结构化数据再用组件渲染，
**绝不注入原始 HTML**；其中的链接也只用点击事件交给主进程打开，不放进 `<a href>`，
避免界面被导航走。`[img]` 只显示占位文字、不加载图片。

### 「已下架」是怎么判定的

游戏侧完全看不出区别：作者下架后，Steam 的 `.acf` 记录和正常 mod 一模一样。
只能联网核实，而这里有两个坑：

1. `ISteamRemoteStorage/GetPublishedFileDetails`（不需要 Key 的老接口）把
   **「已删除」和「成人内容」都返回 `result=9`**，只看它会把大量成人 mod 误判成已下架。
2. 抓工坊网页能区分删没删（被删时标题是「Steam 社区 :: 错误」），但网页
   **分不清「已下架」和「私有」** —— 设成私有的条目，匿名访问同样是错误页。

所以填了 API Key 时走官方 `IPublishedFileService/GetDetails`（必须用 **GET**，POST 会返回 405）：

| 返回 | 含义 | 判定 |
| --- | --- | --- |
| `result=1`, `visibility=0` | 公开 | 正常 |
| `result=1`, `visibility=3` | 不公开列出（链接可访问） | 正常 |
| `result=1`, `visibility=1` | 私有（仅作者可见） | 正常，**不是**下架 |
| `result=9` | 条目不存在（`k_EResultNoMatch`） | 已下架 |
| `result=15` | 无权访问（`k_EResultAccessDenied`） | 已下架 |

没填 Key 时逐个抓网页，只能把「看不到」标成「工坊不可见」，不敢断言已下架。
结果缓存在 `userData/workshop-checks.json`，扫描时读缓存不联网；核实不出来的会退避重试。

### 为什么不做一个「把工坊更新同步进游戏」的功能

曾经做过，后来移除了。原因是实测发现**那个中间态根本不存在**：

Steam 把订阅的 mod 下载到 `steamapps\workshop\content\<appid>\<id>`，
而游戏加载的是自己的 `…\Barotrauma\WorkshopMods\Installed\<id>`（它会写一个 `installtime`）。
看起来像是「Steam 下好了、游戏还没复制」有个空档可以帮忙 —— 但实测：

```
工坊条目 3801589375 发布后
  Steam 订阅目录： 13:35:40
  Installed：      13:35:41     ← 相差 1 秒
  .acf 的 timeupdated   = 1789392938
  Installed installtime = 1789392938   ← 完全一致
```

**下载完 1 秒内游戏就自己复制过去了**，而且下载本身也是游戏触发的
（游戏不在运行时，工坊更新只会躺在那里等着）。
所以这个功能既插不进手，也会让人误以为管理器能管更新流程。

### 存档里记录的 mod 名单（以及为什么不能用「完全一致」判对应合集）

存档是 **gzip 压缩**的，解压后开头有一小段 UTF-16LE 文件名（`gamesession.xml`），之后才是 XML。
根元素 `<Gamesession>` 上带 `selectedcontentpackagenames="Vanilla|modA|modB|…"` ——
这是**当时启用的内容包名，按加载顺序**（就是这个存档实现所需的那套），另有 `savetime`、
`submarine`、`version`。老的 1.11.5 存档也有这些字段。全文里 `package` 只出现这一处，
**存档没有第二份 mod 记录**。

关键的一点：**这份名单不记录纯客户端型内容包**。用真实存档验证过：

```
9 个存档（2026/1 ~ 2026/9）全都启用了 Lua 类 mod
  （Vertical Engine Lua、Scannable wild plants (Lua) …）
但 LuaCsForBarotrauma 框架一次都没出现在任何存档里
```

没有 LuaCs，那些 Lua mod 根本跑不起来 —— 所以它一直启用着，只是存档不记它。
「测试」合集比最新存档多出来的 7 个，全部是这类：LuaCs（`Binary/Lua`）、
`Enhanced Immersion (lua only)`（只有 `Lua`）、`BetterHealthUI`（`CSharp/Localization`）、
两个 `ItemIO`（`CSharp`）、`Press-R-to-Reload`。

所以界面上「对应合集」判定用的是**两个精确关系**，而不是相似度估算：

| 关系 | 含义 |
| --- | --- |
| **完全一致** | 存档的 mod 集合 == 合集集合（很少见） |
| **完全覆盖** | 存档的 mod 全在合集里（合集另有若干个，界面会逐个列出来） |
| 都没有 | 如实说「没有能覆盖它的合集」，而不是猜一个最像的 |

用覆盖它的合集去实现存档**永远安全**（只多不少）；而「按存档启用」只写存档记录里的 mod，
可能漏掉 LuaCs 这类框架，所以界面上会明确提示这一点，并且有覆盖合集时主按钮是「应用那个合集」。

## 安全说明

- **应用合集**：先备份再写，只动 `<contentpackages>` 段，段外逐字节不变，缺段则中止。
  备份固定在 `config_player.xml.bak` 一个文件上，每次应用覆盖，不在游戏目录里堆积。
- **用创意工坊版覆盖本地**：先把本地文件夹**同盘改名**到 `LocalMods` 的**同级**目录
  `ModManagerBackups\`（改名是瞬时的，不占额外空间），失败会自动回滚。
  备份刻意不放在 `LocalMods` 里，避免被游戏当成 mod 扫描到。
- **合集文件名**做了目录穿越拦截。
- **备份与快照**都放在 `LocalMods` 的**同级**目录 `ModManagerBackups\`：
  `<mod 名>\<时间戳>\`。刻意不放进 `LocalMods`，避免被游戏当成 mod 扫描到；
  也不要手改快照文件夹名（时间戳就是它的 id）。快照是完整副本，攒多了会占空间，可在详情页逐个删除。
- 本工具自身的设置数据存在 `%AppData%\潜渊症Mod管理器\`：`settings.json`、`categories.json`、
  `previews\`（封面缓存）、`covers\`（手动设置的封面）。只在本机，不上传。

## 常见问题

**Q：应用合集后游戏里没生效？**
A：确认「设置」里的 `config_player.xml` 指向的是游戏根目录下那份，并且改完之后重启游戏。

**Q：某些 mod 没有封面？**
A：Steam 接口对该条目没返回封面图（部分 mod 本来就没上传预览图），会显示占位色块。

**Q：本地 mod 显示「无工坊对应」？**
A：该 mod 的 `filelist.xml` 里没有 `steamworkshopid`，无法自动匹配（自制的或改了标识的 mod）。
   这是正常的，不影响使用。

**Q：工坊 mod 卡片上写「未安装」/ 应用时提示有 mod 没安装？**
A：说明它在 Steam 订阅目录里、但游戏还没把它装到 `WorkshopMods\Installed`。
   启动一次游戏即可自动安装。

## 开发

```
electron/            主进程
  main.js            窗口 + 启动
  preload.js         暴露给界面的 window.api
  protocol.js        local-img:// 协议（显示本地图片）
  services/
    index.js         IPC 注册
    detect.js        自动检测 Steam / 游戏目录
    settings.js      目录设置读写
    mods.js          扫描 mod、解析 filelist.xml、版本对比
    modlists.js      合集文件读写
    config.js        应用到 config_player.xml
    saves.js         解析 .save，读出「这个存档当时启用了哪些 mod」
    steam.js         工坊封面（公开接口 + 缓存）
    categories.js    分类规则与标签持久化
    relations.js     mod 之间的关联（前置需求）
    updater.js       自动更新（electron-updater + GitHub Releases）
    backup.js        快照 / 回滚 / 一键备份工坊 mod
    fsutil.js        复制目录、统计体积、文件名清洗等
src/                 界面（React + TypeScript，无 UI 框架依赖，手写 CSS）
  workshopText.tsx   工坊描述的 BBCode → 安全 React 节点
scripts/             自检与工具脚本
```

界面层在检测不到 `window.api` 时会自动回落到内置示例数据 —— 所以 `pnpm dev` 直接用浏览器
就能看界面，不需要启动 Electron。

### 自检

```bash
node scripts/test-backend.cjs                # 后端逻辑（合成样本，不依赖本机数据）
node scripts/test-preview.cjs                # 封面服务（需要联网）
pnpm exec electron scripts/smoke-app.cjs     # 端到端（真实目录，只读）
pnpm exec electron scripts/shots.cjs         # 界面截图 + 滚动/交互校验
pnpm exec electron scripts/test-desc-scroll.cjs  # 工坊描述能否真的滚（发真实滚轮事件）
pnpm exec electron scripts/test-apply-ui.cjs     # 「应用到游戏」点一次界面就更新（隔离临时目录）
pnpm exec electron scripts/test-saves-ui.cjs     # 存档页：解析、对应合集、两个动作（隔离临时存档）
```

`test-apply-ui.cjs` 是为了用户反馈的那个坑留下的：**点一次「应用到游戏」，config 确实写进去了，
但界面没刷新**，看起来像没生效，于是又点一次。脚本用隔离的 `userData` + 临时游戏目录跑真实
IPC，断言「点击前 0 个『当前应用』徽章 → 点一次后立刻 1 个」，并检查磁盘上只有一个固定备份。
把 `CollectionsView` 里应用后的那次 `onRefresh()` 注释掉，这个脚本会失败 —— 它是有效的。

`test-desc-scroll.cjs` 是为了一个具体的坑留下的：工坊描述很长时，光看
「scrollHeight > clientHeight」这种静态条件会误判成"能滚"。必须用
`webContents.sendInputEvent` 发**真实滚轮事件**，并确认滚轮坐标落在
「描述区 ∩ 弹窗可见区」的交集里 —— 否则事件会打在标题栏上，测出假的"滚不动"。

`test-saves-ui.cjs` 用**临时存档目录**（gzip 出来的假 `.save`，结构与真实的一致）+ 隔离
`userData` 跑真实 IPC，覆盖：gzip + UTF-16LE 前缀的解析、`savepath` 为空/相对/绝对三种情形、
「完全一致」与「完全覆盖」的判定、多出来的 mod 要按**真名**列出、「存为新合集」在名字被占用时
自动改名（绝不覆盖已有合集）、「按存档启用」真的写进了 config。

`test-backend.cjs` 覆盖了 `filelist.xml` 解析（含单引号、老格式 `version` 属性、BOM、
以及 `modversion` 被 `gameversion` 误匹配的经典坑）、版本比较、合集往返、
以及「应用到 config 时区域外逐字节不变 / BOM 保留 / 缺段中止 / 备份只留一个且不累积」。

要指定游戏目录时可用环境变量 `BMM_GAME_DIR` / `BMM_WORKSHOP_DIR`。

## 协议

[MIT](LICENSE)
