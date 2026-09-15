# 潜渊症 Mod 管理器

替代《潜渊症 / Barotrauma》内置 mod 管理器的桌面工具：合集编排、一键应用到游戏、本地 mod 与创意工坊版本对比、封面、按功能分类。

## 功能

**Mod 库**
- 卡片网格：封面、版本、来源（本地 / 创意工坊）、分类标签
- 版本对比状态：`工坊有更新` / `本地已改版` / `本地=工坊`
- 搜索、来源筛选、分类筛选、「有更新」「未分类」快捷筛选、排序
- **「已下架」标记**：标出被作者从创意工坊撤掉的 mod，可一键只备份这些。
  填了 Steam Web API Key 时判定准确且快（一次批量请求）；没填则只能显示「工坊不可见」
- 工具栏与筛选条固定，只有卡片区滚动

**合集**
- 管理 `ModLists\*.xml`：新建 / 重命名 / 删除；拖拽排序（**顺序即加载顺序**）、搜索添加、移除、缺失提示
- **一键应用到游戏**：先备份 `config_player.xml`，只替换 `contentpackages` 段；应用后界面立刻刷新
- **「游戏当前应用」**：直接列出游戏现在真正加载的 mod（按加载顺序）
- **未订阅清单**：合集里有本机还没有的 mod 时，可一键筛出这些条目，逐个点「去订阅」打开工坊页面
- **导入 / 导出合集**（联机时把整套配置发给朋友）：
  - 导出 `.xml`（游戏原生格式，**对方不用装本管理器**）、`.json`（用本管理器的朋友用）、
    文本（贴聊天里，每个工坊 mod 一行带订阅链接）
  - 导入这三种都认（选文件或**直接粘贴**）：哪怕只有一串工坊 id 也能认出来，
    并自动补上 mod 名字、列出本机还没有的
  - 重名合集自动加序号，**不覆盖已有合集**

**Mod 详情**
- 创意工坊描述（保留标题层级、列表、粗体斜体、链接）、订阅数 / 收藏数 / 浏览量 / 更新时间、工坊标签
- 本地 ↔ 创意工坊版本对比；一键加入 / 移出任意合集
- **关联 mod（前置需求）**：记下某个 mod 依赖哪些 mod，加入合集时会问要不要一起加
- 分类标签的新建 / 删除；设置封面、打开文件夹、跳转工坊页面
- 用创意工坊版覆盖本地版（自动留快照）、把工坊版复制为新本地 mod、删除本地 mod（连快照一起清）

**同步到游戏**
- 把「Steam 已经下载好、游戏还没装」的工坊更新直接装进 `WorkshopMods\Installed`
- 顶栏只在真有这种 mod 时出现，带数量；先列出清单和体积（`游戏里 v1.110 → Steam v1.111`）
  确认后才动手
- 与游戏内更新等价，但**不会让 Steam 把整包重下一遍**；已下架的 mod 不算「待同步」

**浏览工坊**
- 关键词搜索、5 种排序（最热门 / 趋势 / 最近更新 / 最新发布 / 口碑最好）、
  23 个分类标签（可多选）、翻页
- 点卡片看详情：封面 + **截图画廊**（点缩略图切换）、热度、分类，以及工坊描述的完整排版
- **描述优先用作者写的中文版**；作者没写中文的条目可以一键「翻译成中文」
- 下载交给 Steam：点「在 Steam 里打开」→ 在客户端里点「订阅」→ 回来点「同步到游戏」
- ⚠️ 需要填 Steam Web API Key，并且能访问 Steam（国内通常要先开加速器）

**存档**
- 看清每个存档当时启用了哪些 mod（按加载顺序），并标出游戏里已经没有的
- 找出能用它实现该存档的合集（「完全一致」，或「某某合集完全覆盖」，并列出多出来的 mod）
  - 注：游戏的存档不记录纯客户端型 mod（LuaCs 这类框架、UI），所以判定是「覆盖」而不是「完全一致」
- 一键：**应用那个合集** / **按存档启用** / **存为新合集**

**备份与回滚**
- **一键备份所有工坊 mod 到本地**：先告诉你占多少磁盘、几个新建几个更新，确认后才复制；带进度、可取消
- **本地 mod 历史版本与回滚**：每个本地 mod 保留最近 1 份快照（改动前的状态），
  回滚前会先把当前状态存成新快照，所以**回滚本身也能再滚回去**
  - 手动「创建快照」；此外每次覆盖工坊版、每次再次备份工坊 mod 之前都会自动留一份
- **封面**：工坊 mod 自动拉取并缓存，之后离线可用；本地 mod 默认占位图，可手动指定

## 使用指南

### 安装

从 [Releases](../../releases) 下载 `barotrauma-mod-manager-setup-<版本>.exe`，双击安装
（**按用户安装，不需要管理员权限**，装到 `%LocalAppData%\Programs\`）。

首次打开会自动扫描常见 Steam 安装位置来填充目录设置；没检测到就在「设置」页点「自动检测」或手动指定。

### 需要填的 6 个目录

| 设置项 | 说明 |
| --- | --- |
| 游戏根目录 | 潜渊症安装目录，如 `…\steamapps\common\Barotrauma` |
| 合集文件夹 | `…\Barotrauma\ModLists` |
| 本地 mod 文件夹 | `…\Barotrauma\LocalMods` |
| 创意工坊 mod 文件夹 | `…\steamapps\workshop\content\602960` |
| config_player.xml | 「应用到游戏」写入的目标 |
| 已安装的工坊 mod 目录 | `%LocalAppData%\…\WorkshopMods\Installed`（游戏**实际加载**的位置） |

### 日常怎么用

1. **Mod 库**：浏览 / 搜索 / 打标签，工坊有更新的 mod 会标出来
2. **合集**：编排顺序 → 「应用到游戏」（会自动备份 `config_player.xml`），之后启动游戏即生效
3. 游戏里还没装上的工坊更新 → 点顶栏「**同步到游戏**」
4. **联机前**：把合集「导出」发给朋友（`.xml` 或文本都行）；朋友「导入」后按「只看未订阅」逐个订阅
5. **存档**：反查某个存档当时启用了哪些 mod，以及该用哪个合集

### 自动更新

装好之后不用再手动下载：每次启动会静默向 GitHub 查一次新版本，有更新时界面顶部出现提示条，
点「下载更新」→「立即重启安装」即可。也可以在「设置 → 关于与更新」里手动检查。

## 安全说明

- **应用合集**：先备份再写，只动 `<contentpackages>` 段，段外逐字节不变，缺段则中止。
  备份固定在 `config_player.xml.bak` 一个文件上，每次应用覆盖，不在游戏目录里堆积。
- **用创意工坊版覆盖本地**：先把本地文件夹**同盘改名**到 `LocalMods` 的**同级**目录
  `ModManagerBackups\`（改名是瞬时的，不占额外空间），失败会自动回滚。
- **合集文件名**做了目录穿越拦截；「同步到游戏」「导入合集」也都只接受合法的 id / 文件名。
- **备份与快照**都放在 `LocalMods` 的**同级**目录 `ModManagerBackups\`：`<mod 名>\<时间戳>\`。
  刻意不放进 `LocalMods`，避免被游戏当成 mod 扫描到；不要手改快照文件夹名（时间戳就是它的 id）。
  快照是完整副本，攒多了会占空间，可在详情页逐个删除。
- 本工具自身的设置数据存在 `%AppData%\潜渊症Mod管理器\`：`settings.json`、`categories.json`、
  `previews\`（封面缓存）、`covers\`（手动设置的封面）、`workshop\`（工坊详情缓存）。
  只在本机，不上传；Steam Web API Key 也存在这里。

## 常见问题

**Q：应用合集后游戏里没生效？**
A：确认「设置」里的 `config_player.xml` 指向的是游戏根目录下那份，并且改完之后重启游戏。

**Q：工坊 mod 明明更新了，游戏里还是旧版？**
A：游戏不会自动装 —— 要你在 mod 列表里自己按更新键。管理器会在顶栏显示「同步到游戏 N」，
   点一下就能装好，而且不会让 Steam 把整包重下一遍。如果提示「文件被占用」，先关掉游戏再点一次。

**Q：某些 mod 没有封面？**
A：Steam 接口对该条目没返回封面图（部分 mod 本来就没上传预览图），会显示占位色块。

**Q：本地 mod 显示「无工坊对应」？**
A：该 mod 的 `filelist.xml` 里没有 `steamworkshopid`，无法自动匹配（自制的或改了标识的 mod）。
   这是正常的，不影响使用。

**Q：工坊 mod 卡片上写「未安装」/ 应用时提示有 mod 没安装？**
A：说明它在 Steam 订阅目录里、但游戏还没把它装到 `WorkshopMods\Installed`。
   启动一次游戏即可自动安装，或者直接点顶栏「同步到游戏」。

**Q：「浏览工坊」提示连不上 Steam / 需要 API Key？**
A：这个页面用的是 Steam 官方接口：需要先在 [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey)
   申请一个 Key（域名随便填 localhost）填到「设置」里，且**本机能访问 Steam**（国内一般要开加速器）。

**Q：翻译按钮翻了但读起来怪？**
A：只有作者**没提供中文描述**的 mod 才需要机翻（作者写了中文会直接用他的原文）。
   机器翻译对专有名词本来就不准，只能看个大概。

## 技术栈

- **桌面框架**：[Electron](https://www.electronjs.org/) 33
- **界面**：React 18 + TypeScript + Vite 5（无 UI 框架依赖，手写 CSS）
- **主进程**：Node.js；工坊数据来自 Steam 官方 Web API（`ISteamRemoteStorage` /
  `IPublishedFileService`）与工坊页面；描述、封面、截图、翻译都有本地缓存
- **自动更新**：[electron-updater](https://www.electron.build/auto-update) + GitHub Releases
- **打包**：electron-builder（NSIS，按用户安装）；图标由 `scripts/make-icon.cjs` 纯 Node 生成

### 从源码构建

需要 Node.js 18+ 与 pnpm。

```bash
pnpm install
pnpm app            # 构建界面 + 启动桌面客户端
```

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 只跑界面开发服务器（浏览器打开，走内置示例数据） |
| `pnpm build` | 只构建界面产物到 `dist/` |
| `pnpm start` | 用已构建的 `dist/` 启动桌面客户端 |
| `pnpm run pack` | 打包成 NSIS 安装包（输出到 `release/`） |

> 要用 `pnpm run pack`。裸写 `pnpm pack` 会命中 pnpm 自己的内置命令（打 npm 包），不会走打包脚本。

打包产物有三个：

```
release\barotrauma-mod-manager-setup-<版本>.exe            安装包（发布必传）
release\latest.yml                                        自动更新清单（发布必传）
release\barotrauma-mod-manager-setup-<版本>.exe.blockmap   增量更新用（可选）
```

> `latest.yml` 必须和安装包一起上传，否则客户端更新会 404。`.blockmap` 不上传也能更新，
> 只是客户端会整包下载、没法只下差异部分。
>
> 安装包文件名刻意用 ASCII：`latest.yml` 里的 `path` 必须和实际上传的文件名**完全一致**，
> 用中文名时两者会对不上。

<details>
<summary>发布新版本（给自己看的检查清单）</summary>

1. 改 `package.json` 里的 `version`。**不改版本号客户端不会认为有更新。**
2. `pnpm run pack` 打包（先确认这个版本号没发布过）。
3. 到 GitHub 建 Release，tag 用 `v<版本>`（和 `package.json` 一致）。
4. 上传 `release\` 里的 `barotrauma-mod-manager-setup-<版本>.exe` 和 `latest.yml`
   （`.blockmap` 可选，用于增量更新）。
   - ⚠️ **不要勾 `Set as a pre-release`** —— 预发布版本客户端会直接跳过。
5. release 说明建议**直接把 Markdown 文本粘进正文**（比只挂一个附件链接更容易读）。
6. 老版本客户端下次启动就会提示更新。

</details>

<details>
<summary>首次打包可能因 Windows 符号链接权限失败</summary>

electron-builder 会解压 `winCodeSign-2.6.0.7z`，包里含两个 macOS 的符号链接，普通 Windows 账户
没有「创建符号链接」特权会报 `Cannot create symbolic link …`。这对 Windows 打包没有实际影响，
把已解压内容补到正式缓存名再重跑即可：

```powershell
$cache = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
$tmp = Get-ChildItem $cache -Directory | Where-Object { $_.Name -match '^\d+$' } | Select-Object -First 1
Copy-Item $tmp.FullName (Join-Path $cache 'winCodeSign-2.6.0') -Recurse -Force
```

</details>

## 项目结构

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
    installsync.js   把 Steam 已下载、游戏还没装的工坊更新同步进 Installed
    workshopbrowse.js 浏览创意工坊（QueryFiles：搜索 / 排序 / 分类统计）
    workshoppage.js   从工坊页面 HTML 里抽封面与截图（详情弹窗用）
    openinsteam.js    在 Steam 客户端里打开工坊页面（直接调 steam.exe）
    translate.js      描述没有中文版时用免费接口翻译成中文
    share.js          合集的导入 / 导出（xml / json / 文本三种形态）
    steam.js         工坊封面与详情（公开接口 + 缓存）
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
node scripts/test-backend.cjs                    # 后端逻辑（合成样本，不依赖本机数据）
node scripts/test-preview.cjs                    # 封面服务（需要联网）
pnpm exec electron scripts/smoke-app.cjs         # 端到端（真实目录，只读）
pnpm exec electron scripts/shots.cjs             # 界面截图 + 滚动/交互校验
pnpm exec electron scripts/test-desc-scroll.cjs  # 工坊描述能否真的滚（发真实滚轮事件）
pnpm exec electron scripts/test-apply-ui.cjs     # 「应用到游戏」点一次界面就更新（隔离临时目录）
pnpm exec electron scripts/test-saves-ui.cjs     # 存档页：解析、对应合集、两个动作（隔离临时存档）
pnpm exec electron scripts/test-sync-ui.cjs      # 工坊更新同步进游戏（隔离临时目录）
pnpm exec electron scripts/test-browse-ui.cjs    # 浏览工坊：没 key / key 失效时的提示（隔离 userData）
pnpm exec electron scripts/test-share-ui.cjs     # 合集导入导出 + 未订阅清单（隔离临时目录）
```

带 `-ui` 的脚本都用**隔离的 `userData` + 临时目录**跑真实 IPC，不会碰你的游戏目录；
要指定游戏目录时可用环境变量 `BMM_GAME_DIR` / `BMM_WORKSHOP_DIR`。

`scripts/compare-mod-dirs.cjs` 是个诊断工具：比对一个 mod 的两份副本是否内容一致
（例如拿 SteamCMD 干净下载的那份，验证「同步到游戏」装进去的到底是不是最新版）：

```bash
node scripts/compare-mod-dirs.cjs "<目录A>" "<目录B>" [更多目录…]
```

## 协议

[MIT](LICENSE)
