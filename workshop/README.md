# 创意工坊版上架物料

这个目录**不进安装包**，只是发布创意工坊条目时要用的素材与步骤。

上架时**不要手动拷文件**，跑两条命令：

```powershell
pnpm run pack:workshop            # 产出安装包（会自动校验产物）
node workshop/make-item-folder.cjs   # 汇总参考物料到 release-ws/workshop-upload/
# 关键一步：工坊上传只列出**本地已存在的内容包**，所以必须先把包装进游戏
node workshop/install-local-mod.cjs "D:\steam\steamapps\common\Barotrauma\LocalMods"
```

`install-local-mod.cjs` 会写游戏目录，所以**路径必须显式传**，它也只写那一个目录。
护栏（都实测过）：

- 路径最后一级必须是 `LocalMods`，否则拒绝（防手滑写进游戏根目录）
- 目标目录若已是**已发布 mod**（`filelist.xml` 带 `steamworkshopid`）→ 拒绝并报出那个 id
  （就是它挡住了把 `dead space坏死组织抗性天赋`＝条目 3470517907 就地改造成管理器的做法）
- 目标目录有非本次写入的文件 → 需 `--force`
- 我们的 `filelist.xml` **不能带 `steamworkshopid`**，带了就拒绝安装 ——
  带了上传会变成"更新那个条目"，也就是会覆盖别人的 mod
- 支持 `--dry-run` / `--name <文件夹名>`

装好后的内容包目录（`LocalMods/BarotraumaModManager/`，15 个文件 ≈ 83 MB）：

```
filelist.xml  bmm-app.json  <安装包>.exe  setup.cmd
cover.zh.png  cover.en.png
zh-library-tag.png  zh-collections.png  zh-saves.png  zh-settings.png
en-library-tag.png  en-collections.png  en-saves.png  en-settings.png
```

**封面与截图必须放在内容包根目录**：游戏的上传界面只能从包内挑文件，
放外面就选不到（预览图那一步会像"没得选"）。放根目录而不是子目录，
是因为不确定上传界面的图片选择器能否进子目录。它们是内容包未声明的多余文件，
游戏加载时忽略（同 exe 与 `.cmd`）。

`release-ws/workshop-upload/` 仍然产出，但它是**参考物料**（放整齐的图片 + 可复制的描述文本），
**不是上传源** —— 上传源是游戏里的那个本地内容包。两处内容由同两个脚本保持同步。

```
item-to-upload/            条目本体（与游戏里那个内容包同样 4 个核心文件）
  filelist.xml
  bmm-app.json
  barotrauma-mod-manager-workshop-setup-<版本>.exe
  setup.cmd                订阅后用来启动安装程序（Steam 只下载不执行）
preview/                   预览图
  cover.zh.png / cover.en.png
screenshots/               正文插图（编辑器插图按钮会传到 Steam CDN）
  zh-library-tag.png / zh-collections.png / zh-saves.png / zh-settings.png
  en-library-tag.png / en-collections.png / en-saves.png / en-settings.png
描述-中文.bbcode.txt       复制粘贴进描述框
描述-英文.bbcode.txt
标题与标签.txt
上传步骤.txt               一页清单，上传时对着做
```

`make-item-folder.cjs` 会在汇总前校验，任何一条不过就直接失败：

- 三处版本号必须一致（`package.json` / `filelist.xml` / `bmm-app.json` / `publication.json`）
- `bmm-app.json` 的 `app` 必须是 `barotrauma-mod-manager`（程序靠它认出自己）
- `filelist.xml` 必须是 `corepackage="False"` 且**不声明任何 `<Item>`**
- 安装包必须已存在

## 条目本体里放什么

| 文件 | 作用 |
| --- | --- |
| `filelist.xml` | Barotrauma 的内容包声明。**`corepackage="False"` 且不声明任何 `<Item>`** —— 这样即使玩家误把它启用成 mod，游戏也加载不到任何东西 |
| `bmm-app.json` | **自更新标记**。工坊版启动时扫工坊目录找带这个文件的条目（不硬编码条目 id），比对版本号后提示重装。缺了它自更新就失效 |
| `barotrauma-mod-manager-workshop-setup-<版本>.exe` | 安装包。来自 `release-ws/`，由 `pnpm run pack:workshop` 产出 |
| `setup.cmd` | Steam 只**下载**不执行，所以订阅后必须靠脚本（或手动双击）启动安装程序。文件名纯 ASCII，中英两份描述引用的是同一个文件；脚本内提示刻意只用英文（.cmd 里非 ASCII 文本会因控制台代码页显示成乱码） |

**封面要进内容包根目录**（见上面那段 —— 上传界面只能从包内挑文件），
`preview/` 与 `screenshots/` 只是把它们整齐地另放一份，方便你在上传时对照。

## 上传步骤

1. 改版本号：`package.json` 的 `version`，以及本目录 `filelist.xml` 的 `modversion`、
   `bmm-app.json` 的 `version`、`publication.json` 的 `version`。
2. `pnpm run pack:workshop` → 产出 `release-ws/barotrauma-mod-manager-workshop-setup-<版本>.exe`。
   它打完会自动校验：asar 清单干净、变体标记就位、**不产出 `latest.yml`**。
3. `node workshop/make-item-folder.cjs` → 参考物料汇总到 `release-ws/workshop-upload/`。
4. `node workshop/install-local-mod.cjs "<游戏>\LocalMods"` → 把包装成游戏里的本地内容包
   （**上传的前提**：工坊上传只列出本地已存在的内容包）。封面与截图会一起进包。
5. 打开游戏上传，**内容包选 `潜渊症 Mod 管理器（创意工坊版）`**。
   标题/标签看 `标题与标签.txt`，描述从 `描述-*.bbcode.txt` 复制，
   预览图从内容包里选 `cover.zh.png`，正文插图从内容包里选 `zh-*.png`。
6. **建议先"隐藏发布"**，自己订阅一遍确认：条目能被识别成内容包、exe 和两个 `.cmd` 能下下来、
   误启用成 mod 时游戏不崩。确认无误再改公开。
7. 上传后回填 `publication.json` 的 `id` / `url`，
   并把新条目 id 写进本目录 `filelist.xml` 的 `steamworkshopid` ——
   **不写的话下次上传会又新建一个条目**，而不是更新原来那个。
   （两份描述里的安装步骤直接写了数字文件夹 id，方便玩家在 `workshop\content\602960\`
   那上百个数字目录里一眼找到我们。**换 id 时记得同步改描述**。）
8. 记下新包的 sha256（`Get-FileHash <exe> -Algorithm SHA256`）填进 `publication.json`。

## 四条不能忘的

1. **安装步骤的主路径是 Steam 的内容目录，不是 `Installed`。**
   Steam 把订阅内容下到 `steamapps\workshop\content\602960\<id>`；
   **游戏启动时**才会把它复制到 `%LOCALAPPDATA%\...\WorkshopMods\Installed\<id>`。
   所以刚订阅、还没开过游戏的用户在 `Installed` 下**什么都找不到**。
   主路径写 Steam 内容目录（永远有），`Installed` 只作为"如果你已经开过游戏"的补充。
   （我们程序自己的自更新检测也是扫这个 Steam 目录 —— 见 `electron/services/workshopupdate.js`
   的调用处，那里用的是 `settings.workshopModsDir`。）
2. **不要传 `latest.yml`。** 它跟完整版自动更新的清单**同名**，一个 Release 只能有一份；
   传上去会把所有完整版老用户"更新"成工坊版。工坊版没有自更新，那份文件对它毫无用。
   构建脚本已删掉它并断言其不存在。
3. **改完 `filelist.xml` 必须重开上传界面。** 游戏的发布界面会**缓存内容包**：
   如果界面是改 id 之前打开的，点发布时用的还是缓存里的旧清单 —— 于是会**新建一个条目**
   而不是更新原来那个。（真实踩过：id 已写进 filelist，仍然新建了 3817971486，见 publication.json。）
3. **描述里必须保留「这是工具，不是 mod」那段和「权限说明」那段。**
   另一个同类工具就是因为被玩家发现"会枚举进程"而**被举报到 Steam**（见其工坊页评论）。
   我们在这一点上是干净的，但要**主动写清楚**——社区看的是你说了什么，而不是你相信什么。
4. **exe 没有代码签名**，首次运行会触发 SmartScreen。描述里没写这条，用户可能会以为中招；
   如果评论里出现相关疑问，把这句加进 FAQ 即可。
5. **两个版本不能真正并存**（只有"两个都装"的人才会遇到，玩家不会）。
   electron-builder 的安装目录取自 package.json 的 `name`（`NsisTarget.js` 的
   `getWindowsInstallationDirName`），两个变体的 `name` 相同 ⇒ 都装进
   `%LOCALAPPDATA%\Programs\barotrauma-mod-manager\`，而 `resources\`（含 `app.asar`
   与 `app-variant.json`）**只有一份**：
   - 两个 exe 都在，但**最后安装的那个赢**，另一个会被"变相换版"
     （完整版的 exe 读到工坊版的 `app-variant.json` 就按工坊版跑）
   - 卸载项与用户数据目录是分开的（`productName` 不同），所以重装不丢设置
   - 想并存必须让安装目录也不同 —— 目前**刻意没做**（玩家只装一个，不值得为它改打包）

## 自更新是怎么工作的（改代码时别改坏）

工坊版**不用 electron-updater**（两条更新通道同时开会让版本号漂移），
而是"Steam 负责把新版下载到工坊目录 → 程序一键把它装上"：

1. 程序（`electron/services/workshopupdate.js`）扫 `<工坊目录>\content\602960\*`，
   找**带 `bmm-app.json` 且 `app` 字段等于 `barotrauma-mod-manager`** 的条目
2. 用它里面的 `version` 和当前运行版本比对，新了就顶部提示「工坊已更新到 vX」
3. 用户点「立即升级」→ 程序以 **`--updated --force-run`** 启动条目里的安装包

第 3 步的参数**必须**是这两个，它们是 electron-builder / electron-updater 的约定
（完整版 `quitAndInstall(false, true)` 实际传的就是这两个）：

| 参数 | 作用 | 不传会怎样 |
| --- | --- | --- |
| `--updated` | 让 NSIS 走升级分支：等程序自己退出（300+1000ms），没退就 `taskkill`，**不弹框** | 会弹「程序正在运行，请先关闭」，用户点取消就退出安装 |
| `--force-run` | 装完自动重开新版 | 装完什么都不发生，用户以为升级失败了 |

（依据：`electron-updater/out/NsisUpdater.js` 的 `doInstall`；
`app-builder-lib/.../nsis/include/allowOnlyOneInstallerInstance.nsh` 的 `${isUpdated}` 分支；
`installSection.nsh` 的 `${isForceRun}` → `StartApp`。别凭记忆改这两个参数。）

所以：
- **`bmm-app.json` 的 `version` 必须和 exe 的实际版本一致**，否则提示会误报或漏报
- 条目里**必须有安装包**，否则界面不会给「立即升级」按钮（只显示提示）
  —— 这个判断在 `checkForWorkshopUpdate` 的 `installerAvailable`
- 纯本地文件读取，不联网、不需要 API Key；升级也不需要再下载（Steam 已经下好了）

## 封面与截图

| 文件 | 用途 |
| --- | --- |
| `cover/cover.zh.png` / `cover.en.png` | 条目预览图（上传时选，800×800） |
| `screenshots/<语言>-library-tag.png` | Mod 库（**按下「基础框架」标签**，15/130）—— 封面里的截图就是这一张 |
| `screenshots/<语言>-collections.png` | 合集页（真实加载顺序） |
| `screenshots/<语言>-tags.png` | **分类标签**（挑标签最多的那个 mod，26 个标签） |
| `screenshots/<语言>-export.png` | **导出合集**（合集分享弹窗，含 .xml/.json/文本三种格式的说明） |
| `screenshots/<语言>-saves.png` | 存档页（"完全覆盖 + LuaCs 说明"那段最有说服力） |
| `screenshots/<语言>-settings.png` | 设置页 |

**建议放进条目的 4–5 张**：`library-tag`（总览）、`collections`（加载顺序）、`tags`（分类标签）、
`export`（导出合集）；`saves` 与 `settings` 可放可不放。

> `tags` 那张会自动**挑标签最多的 mod**（依次开前 8 张卡片数标签数，取最多的）——
> 随便开一个可能只有一两个标签，看不出这个功能。

生成方式（两个脚本都可重复运行）：

```powershell
# 1) 截图（前置：dist 必须是工坊变体）
$env:BMM_VARIANT='workshop'; pnpm run build; Remove-Item Env:\BMM_VARIANT
$env:BMM_SHOT_LANG='zh'; pnpm exec electron scripts/shots-workshop.cjs; Remove-Item Env:\BMM_SHOT_LANG
$env:BMM_SHOT_LANG='en'; pnpm exec electron scripts/shots-workshop.cjs; Remove-Item Env:\BMM_SHOT_LANG

# 2) 封面（消耗 screenshots/ 里对应语言的那张）
& "<bundled python>\python.exe" workshop/build-cover.py
```

`scripts/shots-workshop.cjs` 的两个关键设计，改它时别破坏：

1. **用临时 userData**（`tmp-shot-ud-<语言>`，只播种 `previews/` 封面缓存与几个 json）——
   切语言会把结果写进 localStorage，不能污染用户真实配置。
2. **临时目录按语言分开**。程序"首次启动检测系统语言并落盘"，共用目录时第一轮的
   `bmm.lang` 会被第二轮直接复用 —— 英文截图会**悄悄拍成中文**（已经踩过一次，
   所以脚本现在会断言侧栏标签与请求语言一致，不一致直接以非 0 退出）。

> 与 `scripts/shots.cjs`（README 截图）的区别：那个用**内置示例数据**且默认
> `BMM_NO_COVERS=1` 拦截第三方封面；这个用**真实数据**、封面照常显示 ——
> 工坊条目里展示真实界面才有说服力（用户明确允许）。
>
> 附带说明：英文截图里分类芯片栏仍会看到中文（`基础框架`、`服装`…）——
> 那是**用户自建标签**，属于用户数据，任何语言下都原样显示。想拍一屏全英文的，
> 改 `shots-workshop.cjs` 里 `clickChip('基础框架')` 为内置分类（如 `武器/装备`，
> 英文界面下显示为 `Weapons & gear`）即可。
