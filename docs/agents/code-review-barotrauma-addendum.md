# 代码审查子代理 —— 本仓库专用附加约束

> 在通用模板 `docs/agents/code-review-subagent.md` 的「任务简报」**之后**追加这份内容。
> 这些约束来自 `docs/HANDOVER.md` 里已验证的结论，**不要重新推导**。

---

## 追加给子代理的内容（复制这一段）

```text
【本仓库上下文】
项目：潜渊症 Mod 管理器（Electron 33 + React 18 + TypeScript + Vite 5）。
仓库根：D:\DSH\barotrauma-mod-manager
权威交接文档：docs/HANDOVER.md —— 里面的结论都验证过，**不要重复推翻**（尤其是 §4 领域知识、
§5.3 已踩过的测试自身 bug、§7.1 被推翻过的判断）。读代码前先读它。

【绝对禁止】
- 不要写真实的游戏目录：config_player.xml、ModLists\*.xml、存档 *.save、
  WorkshopMods\Installed\*、LocalMods\*。只读诊断（读 XML/.acf/存档、Test-Path、列目录）随便做。
- 不要执行任何写入型脚本；不要跑 pnpm build / vite build / electron 自检脚本
  （需要命名管道，会被沙箱拒绝，且可能触碰真实目录）。
- 只读审查就是只读：不要「顺手修一下」。

【本仓库的高风险面（审查时优先看这些）】
1. renderer → preload 白名单 → ipcMain.handle → services/*.js 这条链上的**参数校验**。
   services/index.js 里有 50+ 个 handler，路径拼接与 rm/copy 操作是重灾区。
2. 路径拼接的安全性：mod 名、工坊 id、合集名、存档名、快照 id 都可能来自界面或导入文件。
   已有正确实现可参照：modlists.js resolveFile、backup.js deleteLocalModFiles、
   installsync.js assertSafeId、workshoppage.js 的 id 白名单。
3. 改写游戏 config_player.xml（services/config.js）：只做 <contentpackages> 段的字符串级替换，
   找不到段必须中止；备份固定一个 config_player.xml.bak；幂等时不得写文件。
4. 目录覆盖类操作（backup.js restoreSnapshot / runWorkshopBackup、index.js compare:overwrite）：
   先删后拷 = 中途失败即数据丢失；参照 installsync.syncOne 已验证的「临时目录 + 改名」方案。
5. 外部输入：Steam Web API（需 key）、工坊页面 HTML 正则、MyMemory 翻译 API、
   mod 的 filelist.xml 与 XML、用户导入的合集（xml/json/任意文本）、.acf、gzip+UTF-16LE 的 .save。
   - Steam API 走 `services/steamapi.js`：主域名 `api.steampowered.com` 被加速器漏掉时会稳定 503，
     重试时自动换 `community.steam-api.com`。**别把域名硬编码回单一入口。**
6. 缓存与设置写盘：userData 下的 categories.json / relations.json / steam-api-key.json /
   workshop-checks.json。当前多处 catch 后静默忽略，会出现「提示保存成功但重启丢失」。
7. 同步/备份是**全同步循环**（无 await），主进程会被冻住，取消通道形同虚设 ——
   改功能时别假设取消能生效。

【本仓库的验证方式（比读代码可靠）】
- node scripts/test-backend.cjs 是主自检（约 296 处断言，合成样本，不依赖本机数据）。
- UI 端到端脚本（test-*-ui.cjs）**只加载 dist 构建产物**，不构建、不校验新旧 ⇒
  「改完 src 忘记 build」会让测试在旧 bundle 上通过。
- 修「用户描述的现象」类 bug 用反证法：先写一个能失败的检查，证明它真的在测那件事（HANDOVER §5.1）。
- `test-sync-ui.cjs` 的夹具条目**必须带 `v: CHECKS_VERSION`**：少了 `v` 会让 `checksStale()`
  恒为真 → 界面启动时自动联网核实工坊条目 → 结果随网络浮动（曾因此出现假失败）。
- `test-compare-ui.cjs` 是唯一覆盖 `compare:overwrite` / `compare:copyToLocal` / `localmod:delete`
  的测试；这三条通道会真删/真改用户 mod 目录，动它们之前先读这个脚本的断言。
- CSP 在 `electron/csp.js`（单独一个模块，便于测试引用同一份字符串）。改它要过
  `test-csp.cjs`：`img-src` 少了 `https://images.steamusercontent.com` 会让**浏览工坊整页没图**
  —— 工坊封面/截图是渲染层直接去 Steam CDN 取的，不走 `local-img://` 代理，
  被 CSP 拦掉只表现为 `onError` → 占位色块，控制台不报错、其它测试也不报错。

【本机沙箱事实（会影响你判断可行性）】
- 文件策略 workspace-write；vite build / Electron 自检 / 写 %APPDATA% 默认被拒，
  需要同一条命令一次性升级 danger-full-access。看到 [sandbox: file access denied] 是策略，不是命令写错。
- 读中文文件用 read 工具或 [System.IO.File]::ReadAllText，**不要用 Get-Content**（会按 ANSI 解成乱码）。

【产出仍按通用模板的 JSON 结构】category 填你这一路的视角；
notes 里请注明你读过哪些文件、哪些可疑点核实后判定为非问题。
```

---

## 本仓库建议的视角分工

派子代理时按这个切分，避免互相重叠：

| 视角 | 重点文件 |
| --- | --- |
| architecture | electron/preload.js ↔ services/index.js 的通道对应、services 之间的依赖方向、src/api.ts 与后端签名一致性 |
| correctness | services/config.js、backup.js、installsync.js、workshopsync.js、categories.js、relations.js、preload.js 的订阅生命周期 |
| tests | scripts/*.cjs 的覆盖矩阵（对着 services/*.js 逐个点）、dist 陈旧产物问题、异常路径 |
| security | services/index.js 的 shell:openPath、protocol.js 的 local-img://、backup.js 的路径拼接、apikey.js、config.js 的条目注入 |

---

## 已知的「别再报」项

这些已经核实为「做法正确」，报出来是噪音：

- IPC 通道两侧**已对齐**（preload 63 方法与 handle 一一对应，含 4 个事件监听）。
- electron 目录 `require` **无环**、无反向依赖；saves.js/modlists.js 等刻意不依赖 electron。
- 渲染层**没有** `dangerouslySetInnerHTML`/`innerHTML`；链接走 `^https?://` 白名单。
- `compareVersions` 的 `0.10 > 0.9` 正确；无 `SORTS.top === 0` 类假值残留。
- 全仓仅 2 处 `spawn`，均数组传参、无 shell 拼接。
- `share.js` 的导出与 `scanAll` 的返回**不含** API Key。
- `updater.js` 不会把正式版降级到 beta。
