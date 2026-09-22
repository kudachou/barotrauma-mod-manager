# 潜渊症 Mod 管理器 —— 交接文档

> 这份文档是给「下一个接手的人 / 下一个 AI 对话」看的。目标：读完它就能继续干活，
> **不需要重新翻代码，也不需要重新推导下面已经验证过的结论**（那些结论都标了证据）。
>
> 最后更新：v0.4.0 发布之后。

---

## 0. 30 秒摘要

- **是什么**：替换潜渊症（Barotrauma）自带 mod 管理器的桌面工具。Electron 33 + React 18 + TS + Vite 5，无 UI 框架、手写暗色 CSS。
- **在哪**：仓库 `D:\DSH\barotrauma-mod-manager`（工作区根是 `D:\DSH`，仓库在子目录里）。GitHub：`kudachou/barotrauma-mod-manager`。
- **现状**：`package.json` 版本 **0.4.0**，已发布 Release（非 draft、非 prerelease）。`main == origin/main == 4e56b8e`，工作区干净。所有自检脚本通过。
- **在做的事**：用户本地数据问题排查（详见 §6），有一个待用户拍板的选择。
- **最容易踩的坑**：本机沙箱（§2）和「不许碰游戏真实文件」（§2 末尾）。

---

## 1. 仓库、命令、发布

### 1.1 技术栈

| 层 | 用的东西 |
| --- | --- |
| 桌面壳 | Electron 33（`electron/main.js`、`preload.js`、`protocol.js`） |
| 界面 | React 18 + TypeScript + Vite 5，手写 CSS（`src/styles.css`） |
| 打包 | electron-builder + NSIS（oneClick、perMachine=false、按用户安装） |
| 自动更新 | electron-updater 6，GitHub Releases provider |
| 后端 | 纯 Node 的 `electron/services/*.js`，全部走 IPC；不引第三方运行时依赖（只有 electron-updater） |
| 自检 | 自家 `scripts/*.cjs`（Node 断言脚本 + 真跑 Electron 的端到端脚本） |

### 1.2 命令

```powershell
cd D:\DSH\barotrauma-mod-manager

pnpm install          # 依赖
pnpm dev              # Vite 开发服务器（127.0.0.1:5273；浏览器直接看界面，无 window.api 时回落 mock）
pnpm build            # 只构建前端到 dist/
pnpm start            # 用 dist/ 起 Electron（需要先 pnpm build）
pnpm app              # build + 起 Electron
pnpm pack             # build + electron-builder（产物在 release/）
```

带**真实后端**的开发模式（会读写游戏目录，谨慎）：

```powershell
pnpm dev                                                                    # 一个终端
$env:VITE_DEV_SERVER_URL='http://127.0.0.1:5273'; pnpm exec electron .        # 另一个终端
```

### 1.3 自检（改动后必须跑，见 §5）

```powershell
node scripts/test-backend.cjs                    # 后端逻辑，合成样本，不依赖本机数据（约 296 处断言）
node scripts/test-preview.cjs                    # 封面服务（需要联网，7 处断言）
pnpm exec electron scripts/smoke-app.cjs         # 端到端冒烟（真实目录，只读）
pnpm exec electron scripts/shots.cjs             # 界面截图 + 滚动/交互校验
pnpm exec electron scripts/test-desc-scroll.cjs  # 工坊描述真的能滚（发真实滚轮事件）
pnpm exec electron scripts/test-apply-ui.cjs     # 应用到游戏：点一次界面就刷新（15）
pnpm exec electron scripts/test-saves-ui.cjs     # 存档页（32）
pnpm exec electron scripts/test-sync-ui.cjs      # 工坊更新同步进游戏（28）
pnpm exec electron scripts/test-share-ui.cjs     # 合集导入导出 + 未订阅清单（16）
pnpm exec electron scripts/test-browse-ui.cjs    # 浏览工坊：没 key / key 失效（15）
pnpm exec electron scripts/test-compare-ui.cjs   # 本地↔工坊互操作：覆盖/复制/删 mod（61），含越界删除防护
pnpm exec electron scripts/test-csp.cjs          # CSP 不拦界面需要的资源（工坊图要走 CDN，12）
node scripts/compare-mod-dirs.cjs "<A>" "<B>"    # 诊断：两个 mod 目录是否字节一致
```

- `test-*.cjs` 用**隔离的 `userData` + 临时目录**跑真实 IPC，**不会**碰游戏目录。
- 要指定目录时可用环境变量 `BMM_GAME_DIR` / `BMM_WORKSHOP_DIR`。
- 截图脚本用 `BMM_NO_COVERS=1` 保证截图里不出现工坊封面（版权考虑，用户明确要求）。

### 1.4 发布流程（README 里也有）

1. 改 `package.json` 的 `version`（先确认这个版本号 GitHub 上还不存在）。
2. `pnpm run pack` → `release\barotrauma-mod-manager-setup-<version>.exe`。
3. `git commit` + 打 tag `v<version>` → 推。
4. 建 Release：**不要**勾 prerelease、不要 draft；上传 exe + `latest.yml`（`.blockmap` 可选，0.4.0 就没传，只影响差分更新）。
5. 老客户端下次启动会自动更新（`updater.js` + `electron-updater`）。

**推送由用户手动做。** 本机 `git push` 被 Windows schannel 拦（TLS 握手失败），
所以流程一直是：我提交 → 用户推。别在这上面浪费时间反复重试。

### 1.5 版本历史

`0.3.0 → 0.3.2 → 0.0.x-beta（浏览工坊/描述/分享这一串）→ 0.4.0（全部整合，去掉 (beta) 标签，当前）`

`updater.js` 里 `isPrerelease()`（版本号含 `-`）会让**预发布版不检查更新**——用于 beta 阶段避免打扰正式版用户，现在是正式版所以不生效。

---

## 2. 环境与硬约束（先读这节，能省几小时）

### 2.1 本机沙箱（DSH）

- 文件策略是 **workspace-write**，工作区 `D:\DSH`（仓库在 `D:\DSH\barotrauma-mod-manager`）。
- 下面这些**默认会被拒**，需要**同一条命令**用 `sandbox_permissions: danger-full-access` 一次性升级（附一句理由）：
  - `vite build` / `pnpm pack`（esbuild 要开命名管道）
  - `pnpm exec electron scripts/*.cjs`（Electron 自身 IPC 用命名管道；报 EPERM）
  - 往 `%APPDATA%` 写文件（截图、自检产物、缓存）
- 被拒时看到的是 `[sandbox: file access denied under ...]`——那是策略，不是命令写错了。**不要换个写法重试**，直接升级或改结构。
- 已经是 workspace-write 时 PowerShell 仍是 FullLanguage；只有 read-only 模式才有「core types only」限制。

### 2.2 PowerShell 编码陷阱（中文项目必踩）

- **不要用 `Get-Content` 读中文文件**：会按 ANSI 解码成乱码，看着像文件坏了，其实没坏。
  用 `[System.IO.File]::ReadAllText(path)`（或 `read` 工具）。
- 写文件用 `[System.IO.File]::WriteAllText(path, text, (New-Object System.Text.UTF8Encoding($false)))`，避免 BOM。
- 不要在 PowerShell 里内联多行 JS / 大量引号 / 反引号（会被吃掉）。
- 多行 commit message 用 `git commit -F <file>`，别用 `-m "多行"`。

### 2.3 绝对不要在没有明确许可时做的事

- 写真实的 `config_player.xml`、`ModLists\*.xml`、存档、`WorkshopMods\Installed\*`、`LocalMods\*`。
- 只读诊断可以随便做（读 XML/`.acf`/存档、`Test-Path`、列目录）。
- 本次会话唯一一次动游戏目录是用户明确要求「把本地备份的改一改」→ 给
  `LocalMods\超人气可爱美少女组` **纯增量**加了 1 个 PNG（还原 = 删掉 `Images\General_Items\`）。

### 2.4 本机实测路径（用户这台机器）

| 项 | 值 |
| --- | --- |
| 游戏根 | `D:\steam\steamapps\common\Barotrauma` |
| 合集 | `…\Barotrauma\ModLists`（7 个 xml） |
| 本地 mod | `…\Barotrauma\LocalMods`（23 个） |
| 工坊下载 | `D:\steam\steamapps\workshop\content\602960`（102 个） |
| 游戏实际加载的工坊 mod | `%LOCALAPPDATA%\Daedalic Entertainment GmbH\Barotrauma\WorkshopMods\Installed`（102 个） |
| `.acf` | `D:\steam\steamapps\workshop\appworkshop_602960.acf` |
| `config_player.xml` | `D:\steam\steamapps\common\Barotrauma\config_player.xml`（**在游戏目录，不在 AppData**，11302 B） |
| 存档 | `%LOCALAPPDATA%\Daedalic Entertainment GmbH\Barotrauma\*.save`（同目录还有 `ModData`/`ModConfigs`/`Multiplayer`） |
| 管理器 userData | `%APPDATA%\潜渊症Mod管理器`（`categories.json`、`relations.json`、`steam-api-key.json`、`workshop-checks.json`、`previews/`、`workshop-pages/`、`translations/`；**当前没有 settings.json**，说明目录全用自动检测值） |
| 应用备份目录 | `LocalMods` 同级 `ModManagerBackups\`（同盘改名，瞬时且不占额外空间） |

---

## 3. 架构与文件职责

### 3.1 数据流

```
React 界面 (src/)
   │  window.api.*（→ src/api.ts 里做薄封装；没有 window.api 时用 src/mock.ts）
   ▼
electron/preload.js        白名单暴露 IPC
   ▼
electron/services/index.js 所有 ipcMain.handle 注册在这里（31 KB，改功能基本都从这进）
   ▼
electron/services/*.js     业务逻辑；其中只有 settings.js / updater.js 依赖 electron 的 app.getPath
                           （saves.js、detect.js、config.js 等刻意不依赖，方便纯 Node 自检）
```

- 图片走自定义协议 `local-img://`（`electron/protocol.js`），因为渲染层不能用 `file://` 读任意本地图。
- 进度类操作（同步、翻译）用 IPC 事件回推，preload 里返回 unsubscribe 函数。

### 3.2 后端服务一览

| 文件 | 职责 | 关键点 |
| --- | --- | --- |
| `services/index.js` | IPC 注册 + `scanAll` 汇总 | `scanAll` 会附 `installPendingCount` 和每个 mod 的 `installPending`/`installInstalledVersion` |
| `services/detect.js` | 自动检测 Steam/游戏目录 | `steamRootCandidates()`、`readLibraryFolders()`（解析 `libraryfolders.vdf`，注意双反斜杠）、`steamRootFromGame()`；找不到就返回空串让用户手填 |
| `services/settings.js` | 目录设置读写 | `backupDir()` = LocalMods 同级 `ModManagerBackups`；`localAppDataDir()` 只能靠环境变量（electron 没有 `localAppData` 这个 getPath 键） |
| `services/mods.js` | 扫描 mod、解析 `filelist.xml`、版本对比 | 工坊 mod 按 id，本地 mod 按**文件夹名** |
| `services/modlists.js` | 合集读写 | 导出 `parseModlistText(raw, fallbackName)`、`xmlUnescape`；`parseModlistFile` 是它的包装 |
| `services/config.js` | 应用到 `config_player.xml` | 见 §4.2 |
| `services/saves.js` | 解析 `.save`，反查「这存档当时启用了哪些 mod」 | 见 §4.3；只 import `./mods`、`./modlists`，**不依赖 electron**（方便纯 Node 自检） |
| `services/installsync.js` | 把 Steam 已下载、游戏还没装的工坊更新同步进 `Installed` | 见 §4.4 |
| `services/workshopbrowse.js` | 浏览工坊（QueryFiles：搜索/排序/分类） | 见 §4.5；`SORTS.top === 0` 这种「假值」坑在这 |
| `services/workshoppage.js` | 从工坊页面 HTML 抽封面和截图 | 见 §4.5 末尾（截图只能扒 HTML） |
| `services/openinsteam.js` | 在 Steam 客户端里打开工坊页 | 见 §4.6 |
| `services/translate.js` | 描述没中文版时翻译成中文 | 见 §4.7 |
| `services/share.js` | 合集导入/导出（xml / json / 文本） | `FORMAT = 'bmm-modlist'`；`parseShared` 能从任意文本里挖 id |
| `services/steam.js` | 工坊封面 + 详情（公开接口 + 缓存） | `request()` 自己实现重试（429/5xx + ECONNRESET/超时） |
| `services/categories.js` | 分类规则与标签持久化 | 「未分类」筛选、自定义分类 |
| `services/relations.js` | mod 之间的关联（前置需求） | |
| `services/updater.js` | 自动更新 | `isPrerelease()` 跳过更新检查 |
| `services/backup.js` | 快照/回滚/一键把工坊 mod 备份进 LocalMods | |
| `services/fsutil.js` | 复制目录、统计体积、文件名清洗 | |

### 3.3 界面层（`src/`）

| 文件 | 说明 |
| --- | --- |
| `App.tsx` | 五个视图 `library / browse / collections / saves / settings` + 顶栏（有未同步项时显示「同步到游戏 N」） |
| `components/LibraryView.tsx`、`ModCard.tsx`、`ModDetailModal.tsx`（36 KB，最大） | Mod 库 |
| `components/CollectionsView.tsx`（26 KB） | 合集编排、应用到游戏、导入导出、未订阅过滤 |
| `components/BrowseView.tsx`、`BrowseDetailModal.tsx` | 浏览工坊 |
| `components/SavesView.tsx` | 存档反查 |
| `components/SyncModal.tsx` | 同步到游戏（计划 → 执行 → 进度） |
| `components/ShareModal.tsx` | 分享/导入合集 |
| `components/SettingsView.tsx`、`BackupModal.tsx`、`UpdateBanner.tsx`、`Sidebar.tsx`、`Toasts.tsx`、`Icons.tsx` | 其余 |
| `workshopText.tsx` | 工坊描述的 BBCode → 安全 React 节点 |
| `api.ts` / `mock.ts` / `types.ts` / `ui.ts` / `categories.ts` | 桥接、示例数据、类型、小工具 |

---

## 4. 领域知识（已验证的结论，别重新推导）

### 4.1 合集（modlist）文件格式

```xml
<mods name="合集名">
  <Vanilla />
  <Workshop name="Mod 名" id="3732726694" />
  <Local name="文件夹名" />          <!-- 本地 mod 用文件夹名，不是显示名 -->
</mods>
```

### 4.2 应用到游戏（`config_player.xml`）

- 目标文件里被改的**只有** `<contentpackages>…</contentpackages>` 这一段：字符串级替换，
  段外的 BOM / CRLF / 缩进逐字节保持不变；**找不到段就中止**（不猜、不重建）。
- 路径写法有区别：
  - 本地 mod → **相对**路径 `LocalMods/<文件夹名>/filelist.xml`
  - 工坊 mod → **绝对**路径 `…/WorkshopMods/Installed/<id>/filelist.xml`（用 `toSlash` 转正斜杠）
- 备份：**固定一个** `config_player.xml.bak`，每次应用覆盖（用户投诉过堆了十几个带时间戳的备份）。
  `pruneLegacyBackups()` 用严格正则删历史 `.bak-YYYYMMDD-HHMMSS`。
- 幂等：如果替换前后内容相同，直接返回 `changed:false`，**不写文件、不动备份**。
- 返回 `{ backup, backupName, changed, missing, count, prunedBackups }` 给界面。
- **应用本身一次点击就生效**；用户当初说的「要点两下」是**界面没刷新**（见 §5.3），
  修法是在 `CollectionsView.applyCurrent()` 里 apply 之后 `await onRefresh()`。

### 4.3 存档格式与「该用哪个合集」的匹配语义

- `.save` 是 **gzip**，解出来开头是 **UTF-16LE** 的 `gamesession.xml` 前缀，里面有
  `<Gamesession … selectedcontentpackagenames="Vanilla|A|B…">`（顺序 = 当时的加载顺序），
  另外能读到 `savetime` / `submarine` / `version` / `ismultiplayer`。
- **关键结论（有证据，别再怀疑）**：存档**从不记录纯客户端的内容包**——排查时逐个解包对比过多个存档，
  里面明明用了 Lua 系 mod，但 `LuaCs` 一次都没出现。所以匹配只做两种，**不做相似度打分**：
  - 「完全一致」：存档列表 == 合集列表
  - 「完全覆盖」：合集 ⊇ 存档列表（并列出合集里多出来的 mod：`covers[{fileName,name,extra}]` / `coversTotal`）
- 名称比较用 NFKC 规范化（`normName`）。
- 存档目录：显式配置的 `savepath` **即使不存在也优先**（用户主动设过就尊重他），否则用第一个存在的默认目录。
  （原来不存在就悄悄回落，导致「保存了设置却没生效」，已改。）

### 4.4 工坊更新检测 + 同步到游戏

- 数据源：`appworkshop_602960.acf` → `WorkshopItemDetails[id].timeUpdated` / `latestTimeUpdated`
  （`parseDetails` 出来是 **camelCase**；我一度以为字段名是 `timeupdated`，白查了半天）。
- 游戏把 `timeUpdated` 写进 Installed 的 `filelist.xml`，属性名是 `installtime`。
- **待同步判定**：`Installed 的 installtime != .acf 的 timeUpdated` ⇒ 需要同步。
- `planInstallSync()` 会跳过：已下架（delisted）+ 没装上的（`not-installed`），
  返回 `{ items, count, totalBytes, skippedDelisted, … }`。
- `syncOne()`：先复制到临时目录（`.bmm-sync-tmp-*`），再改名换上去（`-old-*` 回收）；
  Windows 占用报错映射成「文件被占用…关掉游戏后重试」。
- 已下架的 id 实测：`2933290631`、`3156077899`（接口 result=15）。
  **用户自己私密上传的 `3452929713` / `3464257536` / `3464345125` 不能标成「已下架」**。
- 同步正确性验证方法见 §5.2。

### 4.5 Steam Web API（浏览工坊）

> ⚠️ **API 域名会被加速器漏掉**：实测本机（开着加速器）`api.steampowered.com` 稳定返回
> **503**（Akamai 边缘 `errors.edgesuite.net`）或超时，而 `steamcommunity.com` 与
> `store.steampowered.com` 都 200 —— 所以现象是「浏览器能打开创意工坊、管理器却报 503」。
> 不是 key / UA / TLS 指纹的问题（Node https 与 Chromium 网络栈、四种 UA 都试过，结果一样），
> 而是加速器只代理了网页域名。
> **解决**：`services/steamapi.js` 提供备用入口 `community.steam-api.com`（Steam 另一个正式
> API 入口，接口形状一致，实测 QueryFiles / GetDetails / GetServerInfo 全通）；
> `steam.js` 的 `request` 与 `workshopsync.js` 的 `httpGetStatus` 在 5xx / 连不上时
> **换域名重试**，并且**记住哪个域名能用**（否则每次请求都要先白等一次主域名超时）。
> 主域名能用就仍走主域名，不硬编码单一入口。2026-09-20 实测备用域名：total=83067、
> 中文标题、24 个分类标签、封面全有。
>
> ⚠️ **两个性能坑（都已修，别再踩回去）**：
> 1. `req.setTimeout()` 对「TCP 连得上但服务端不响应」的域名**不可靠**（socket 建立前不触发），
>    只能等系统自己 reset，实测 11~21 秒。`steam.js` 里改用**真实计时器**竞速 + destroy。
> 2. `numperpage=100` 配订阅榜（`query_type=12`）**单独要 57 秒**（同样 479KB，其它排序只要 1~2 秒）。
>    所以标签扫描用 `TAG_SCAN_PER_PAGE = 50`（3 个榜 × 50 = 150 条样本足够）。
> 修前/修后：打开浏览工坊 **20.4s → 2.4s**、分类标签 **75s/失败 → 6.7s**（缓存命中 0ms）。

- `IPublishedFileService/QueryFiles/v1`（**必须带 key**，GET）：
  - `query_type`：`12`=我的订阅、`0`=最高评分、`3`=趋势、`21`=最近更新、`1`=最新、`11`=文本搜索
  - 必须 `return_metadata=true`；`numperpage` 上限 100；`requiredtags[0]=X` 用数组形式，多个是 AND，最多 3 个
- `IPublishedFileService/GetDetails/v1` + `language=6`（简中）能拿到**本地化标题 + `file_description`**；
  老的 `ISteamRemoteStorage/GetPublishedFileDetails` **没有** language 参数（永远返回原文/英文）。
  - 缓存失效条件是 `cached.lang !== language`；**写缓存放独立 try** —— 否则缓存目录写不进去（比如沙箱拒绝）会把刚拿到的好数据一起丢掉（这个 bug 真发生过）。
- **截图不在 API 里**，只能扒工坊页面 HTML：`images.steamusercontent.com/ugc/<数字>/<hash>/`；
  页面里同时有全尺寸（`?imw=5000&…`）和缩略（`?imw=637&imh=358`）。`fetchText` 用短 UA
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64)`。
- 默认请求间隔 400 ms、8 s 超时、失败重试 1 次（`defaultGetJson`）；连不上时的文案是
  「连不上 Steam —— 国内通常需要开加速器/代理」。
- API key 存在 `userData\steam-api-key.json`（**明文**，可选功能，不填也能用其它功能）。
  ⚠️ 之前排查时 key 出现在对话记录里，建议轮换一把新的（待办 §6.3）。
- 分类标签缓存 6 小时（`browseTags`：3 种排序 × 100 项）。

### 4.6 在 Steam 里打开工坊页

- URL 用 `steam://url/CommunityFilePage/<id>`。
- **ShellExecute 不可靠**（实测 `Start-Process <steam://…>` 什么都不发生）。
  现在的做法：按 `steamExeCandidates()`（含从游戏目录反推）找到 `steam.exe`，
  直接 `spawn(steam.exe, ['--', url])`；找不到才回落 shell。
  返回 `{ ok, via: 'steam.exe'|'shell', exe, url, error }`。

### 4.7 描述翻译

- Google 的所有端点在这台机器上**全部超时**；`cn.bing.com/ttranslatev3` 返回 `{"statusCode":205}`。
- 现在用 **MyMemory**：`api.mymemory.translated.net/get?langpair=en|zh-CN&q=`。
  单请求 500 字节上限 ⇒ `chunkByBytes(text, 450)` **按字节**切（不是按字符，中文/emoji 会踩）。
- 判断「已经是中文」用 `chineseRatio`（CJK ≥ 6%）；缓存键是文本的 sha1，存在 `userData\translations`。
- 结果校验里会识别配额警告文案。
- 顺序：**先看作者给的中文描述**（`language=6`）→ 没有才给「翻译成中文」按钮。

### 4.8 其它

- 本地图片协议：`local-img://`，`%ModDir%` 在 mod 的 XML 里解析成 mod 根目录。
- 自动更新：electron-updater + GitHub provider；`artifactName` 是
  `barotrauma-mod-manager-setup-${version}.exe`；`latest.yml` 必须上传。
- 分享格式：`FORMAT = 'bmm-modlist'`，支持 xml / json / 纯文本三种；导入时能从任意文本里挖
  （`id=`、`?id=`、行首裸数字）并去重，挖不到就报错。

---

## 5. 怎么验证（比读代码可靠）

### 5.1 反证法（最有用的一招）

修 UI 刷新 bug 时：把 `await onRefresh()` **注释掉**，`test-apply-ui.cjs` 立刻失败并复现用户症状
（点一次界面不更新），恢复后通过 ⇒ 证明这条断言真的在测那件事，而不是假通过。
以后修「用户描述的现象」类 bug，都按这个套路先写一个能失败的检查。
对应脚本还留在工作区：`scripts/tmp-twoclick.cjs`（`.gitignore` 里有 `tmp-*`，不会推上去）。

### 5.2 同步功能的字节级验证

用 SteamCMD 干净下载一份（`D:\steamcmd\steamapps\workshop\content\602960\<id>`），和
Steam 目录（`D:\steam\steamapps\workshop\content\602960\<id>`）比对 ⇒ **字节完全一致**；
再和 `Installed\<id>`、`LocalMods\<文件夹>` 比对 ⇒ 只差 `filelist.xml`
（`installtime` + 属性顺序）⇒ 判定「内容一致」。
`.acf` 的 `timeUpdated == latestTimeUpdated == installtime` 时管理器报 0 个待同步 —— 闭环。
工具：`node scripts/compare-mod-dirs.cjs "<A>" "<B>"`。

### 5.3 已经踩过的「测试自身的 bug」

- 断言数量写错 / 重复的变量名（`p1`、`r2`、`noAcf`、`calls`、`fake`）——测试跑不起来不等于代码坏。
- `SORTS.top = 0` 是假值，用 `if (SORTS[sort])` 会静默回落 ⇒ 改成 `hasOwnProperty`。
- JSX 标签里把文字写成 `**…**`（Markdown 语法在 JSX 里不会加粗，会原样显示）。
- 一个「.acf 字段读不到」的假 bug：我临时脚本里写成 `timeupdated`，实际是 `timeUpdated`。

---

## 6. 进行中的问题（最需要上下文的一节）

### 6.1 `超人气可爱美少女组`（工坊 id `3732726694`，v1.0.4）缺贴图

- **现象**：游戏里频繁报错（但能跑）。
- **根因（已定位）**：mod 内 5 处 `<SlotIcon>` 引用了
  `%ModDir%/Images/General_Items/StatusMonitorUI.png`（`sourcerect="0,0,64,64"`）：
  `Items/Clothes/Character_Clothes.xml` 第 56/114/172/230 行 + `Talent_Ema_Clothes.xml` 第 60 行，
  而 **这个 mod 里根本没有 `Images/General_Items/` 目录**。
- **素材来源**：从 mod `3761730795`「【Bang Dream】Morfonica 装束」里找到同名同路径的 64×64 PNG（1182 B，
  sha256 `d8e603df1c6397f1…`）。
- **已做**：给**本地**副本 `LocalMods\超人气可爱美少女组\Images\General_Items\StatusMonitorUI.png` 加了进去
  （纯增量；已确认该副本其余 20 个文件与 `Installed\3732726694` 逐字节相同）。
  它的 `filelist.xml` 只需列内容 XML，`%ModDir%` 贴图是运行时按盘上路径读的 ⇒ **不用改 filelist**。
- **还没生效**：当前 `config_player.xml` 里 `超人气可爱美少女组` 指向的是
  `Installed/3732726694/filelist.xml`（工坊副本）。所以现在**测不出修复效果**。
- **待用户拍板（两条路，别两条同时做）**：
  - **A. 用本地版**：管理器 → 模组库 → 取消勾选工坊那份、勾上本地 `超人气可爱美少女组` → 应用到游戏 → 启动游戏。
    ⚠️ **绝不能两个同时启用**（同一套内容重复加载会出重复 item/identifier）。
    代价：本地版不随工坊更新，mod 更新后要重新备份+打补丁。
  - **B. 快速验证**：把同一个 PNG 复制进 `Installed\3732726694\Images\General_Items\`。
    游戏现在读的就是这份 ⇒ 立刻生效、不动 modlist；代价是工坊更新一次就没了。
- **预期**：缺贴图报错消失。**还原**：删掉那个 PNG / 把工坊项勾回来。

### 6.2 `Unauthorized multithreaded access to RandSync.ServerAndClient`

- **来源**：`BaroWardrobeSwitcher.VisualOverride.CaptureFashionPrefabCore`，由 Lua `OnUpdate` 里
  构造 Item 触发（游戏 Rand 阶段的线程检查）。
- 日志里相关调用栈**全部**落在 `3737903001\Lua\**`（Wardrobe(衣櫃)(衣柜) v0.5.27）名下；
  `3732726694` **没有任何 `.lua` / `.dll`**。⇒ 跟「美少女组」无关，只是穿上这些衣服时才被触发。
- **状态**：未修，等用户决定。可选做法：改 Wardrobe 的 Lua，把构造 Item 放到合法阶段（别在 `OnUpdate` 里建）。

### 6.3 可选待办清单

- 轮换 Steam Web API Key（曾出现在对话里），删掉旧文件里的 key。
- 清理 `D:\DSH\synctest-mod\`（同步功能的测试残留）。
- 退订/删除测试用的工坊条目 `3801589375`。
- README 里目前**没有**截图小节，`docs/screenshot-{library,collections,saves,sync}.png` 4 张图现在是孤儿
  （要么加回去，要么删掉）。
- `docs/release-notes-v0.4.0.md` 是发布正文草稿，可以贴进 Release。
- 可考虑的新功能：**检查 mod 内部贴图引用**（就是 §6.1 那类「引用了不存在的 `%ModDir%` 文件」的自动体检）。
- 工作区残留（已被 `.gitignore` 忽略，不会推上去）：`scripts/tmp-twoclick.cjs`、`tc.log`。

---

## 7. 用户偏好与协作方式

- **全程中文**；UI 文案、代码注释、commit message 都是中文。
- 做**影响大的决定前先给取舍**（两个方案的代价各是什么），别直接开干；用户会自己拍板。
- 讨厌啰嗦和堆砌；README 要求「只写有哪些功能、安全说明、常见问题、技术栈、使用指南、项目结构」，
  明确**不要**写「为什么某个功能没加入」这类内容。
- 讨厌手动重复劳动（比如重复下载、重复点两下），也讨厌磁盘上堆垃圾（备份只留一个就是这个原因）。
- 截图不许出现工坊封面（`BMM_NO_COVERS=1`）。
- 不喜欢界面上有多余的东西，顺手的小功能（比如「未分类」筛选、「只看未订阅」）要按需加。
- 用户的 mod 环境是真实在玩的：22–23 个本地 mod、102 个工坊 mod、7 个合集。

### 7.1 被推翻过的判断（别再重复说）

- ❌「应用到游戏要点两下」⇒ 其实是**界面没刷新**，应用本身一次点击就生效。
- ❌「同步工坊更新进游戏这个状态不存在 / 没必要」⇒ 已被证伪，功能存在且验证过（§5.2）。
- ❌ 用「相似度」给存档找合集 ⇒ 存档不记录客户端内容包，只能「完全一致 / 完全覆盖」。
- ❌ `.acf` 字段名 `timeupdated` ⇒ 是 `timeUpdated`。
- ❌ 下载 mod 用 SteamCMD ⇒ 管理器的「去订阅」是**打开 Steam 页面**，让 Steam 自己下。

---

## 8. 新对话开局模板

把下面这段直接贴给新对话（按需改最后一行）：

```text
项目：潜渊症 Mod 管理器（Electron + React + TS），仓库 D:\DSH\barotrauma-mod-manager。
先读 docs/HANDOVER.md（交接文档，含所有已验证结论）和 README.md，再按需读代码。
不要重新推导交接文档 §4 里已经验证过的结论；改完必须跑文档 §1.3 列的自检脚本。
注意：本机沙箱是 workspace-write，vite build / Electron 自检 / 写 %APPDATA% 需要
一次性 danger-full-access 升级；读中文文件用 [System.IO.File]::ReadAllText，不要用 Get-Content。
未经我明确同意，不要写真实的游戏目录（config_player.xml / ModLists / 存档 / Installed / LocalMods）。
git push 我自己来。

这次要做的事：<在这里写>
```

**建议的阅读顺序**：`docs/HANDOVER.md`（本文）→ `README.md` → `electron/services/index.js`（看 IPC 全貌）
→ 需要改的那个 service → 对应的 `src/components/*` → 对应的自检脚本。

**改动完成前的自检底线**：`node scripts/test-backend.cjs` 必须过；
碰上界面行为改动，跑对应的 `test-*-ui.cjs`；涉及真实目录的，先用 `smoke-app.cjs`（只读）。
