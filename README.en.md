<p align="center">
  <a href="README.md"><b><u>简体中文</u></b></a> ｜ <a href="README.en.md"><b><u>English</u></b></a>
</p>

# Barotrauma Mod Manager

A desktop tool that replaces the built-in mod manager in *Barotrauma*: collections, one-click apply to the game, local vs Workshop version comparison, covers, and tags by function.

## Features

**Mod Library**
- Card grid: cover, version, source (local / Workshop), category tags
- Version comparison states: `Workshop is newer` / `local edited` / `local = Workshop`
- Search, source filter, category filter, "Updates" and "Uncategorized" quick filters, sorting
- **"Delisted" marker**: flags mods the author pulled from the Workshop, with a one-click way to back up only those.
  With a Steam Web API Key filled in the verdict is accurate and fast (a single batch request); without one it can only show "Hidden on Workshop"
- The toolbar and filter bar stay fixed; only the card area scrolls

**Collections**
- Manage `ModLists\*.xml`: create / rename / delete; drag to reorder (**the order is the load order**), search and add, remove, missing-mod warnings
- **Apply to game**: backs up `config_player.xml` first and replaces only the `contentpackages` section; the UI refreshes immediately afterwards
- **"Currently applied in game"**: lists the mods the game is actually loading right now (in load order)
- **Unsubscribed list**: when a collection contains mods this machine does not have yet, one click filters those entries out so you can hit "Subscribe" on each one to open its Workshop page
- **Import / export collections** (hand the whole setup to a friend when playing together):
  - Export `.xml` (the game's native format, **so the other person needs no manager**), `.json` (for friends who use this manager),
    or text (paste it into chat, one line per Workshop mod with a subscription link)
  - Import accepts all three (pick a file or **just paste it**): even a bare list of Workshop IDs is recognised,
    mod names are filled in automatically, and anything you do not have yet is listed
  - Duplicate collection names get a number automatically, so **existing collections are never overwritten**

**Mod details**
- Workshop description (headings, lists, bold and italics, links preserved), subscriptions / favourites / views / update time, Workshop tags
- Local ↔ Workshop version comparison; add to or remove from any collection in one click
- **Related mods (dependencies)**: record which mods a mod depends on, and when you add it to a collection the app asks whether to add them too
- Create / delete category tags; set a cover, open the folder, open the Workshop page
- Overwrite the local version with the Workshop version (a snapshot is taken automatically), copy the Workshop version as a new local mod, or delete a local mod (together with its snapshots)

**Sync to game**
- Installs Workshop updates that "Steam has already downloaded but the game has not installed" straight into `WorkshopMods\Installed`
- The top bar only appears when such mods exist, with a count; it lists them and the size first (`game v1.110 → Steam v1.111`)
  and only acts once you confirm
- Equivalent to updating inside the game, but **without making Steam download the whole package again**; delisted mods do not count as "pending sync"

**Browse Workshop**
- Keyword search, 5 sort orders (Most popular / Trending / Recently updated / Newest / Top rated),
  23 category tags (multiple selection), paging
- Click a card for details: cover + **screenshot gallery** (click a thumbnail to switch), popularity, categories, and the full layout of the Workshop description
- **The description prefers the localised version the author wrote**; for items with no entry in your language there is a one-click "Translate to English" / 翻译成中文
  (**the translation target follows the interface language**: a Chinese interface translates into Chinese, an English interface into English; results are cached per description + target language)
- Downloading is left to Steam: click "Open in Steam" → click "Subscribe" in the client → come back and click "Sync to game"
- ⚠️ Requires a Steam Web API Key and access to Steam (in mainland China an accelerator is usually needed first)

**Saves**
- See which mods each save had enabled at the time (in load order), and what the game no longer has
- Find the collections that can reproduce that save ("Exact match", or "collection X covers it completely", listing the extra mods)
  - Note: the game's saves do not record purely client-side mods (frameworks such as LuaCs, UI), so the verdict is "covers" rather than "exact match"
- One click: **apply that collection** / **Enable per save** / **Save as collection**

**Backup and rollback**
- **Back up every Workshop mod locally in one click**: it tells you how much disk space that takes and how many are new or updated, and only copies after you confirm; with progress and cancel
- **Local mod version history and rollback**: each local mod keeps its most recent snapshot (the state before the change),
  and the current state is stored as a new snapshot before rolling back, so **a rollback can itself be rolled back**
  - "Create snapshot" by hand; snapshots are also stored automatically every time the Workshop version overwrites the local one and every time Workshop mods are backed up again
- **Covers**: Workshop mods are fetched and cached automatically and then work offline; local mods get a placeholder by default and can be set by hand

**Interface language (中文 / English)**
- **中文 / English** can be switched in Settings; it applies immediately and is remembered on this machine
- **On first launch it follows the system language**: Simplified/Traditional Chinese → Chinese interface; every other language → English.
  After that it no longer follows the system language (switch it by hand in Settings if you want to change it)
- The window title, date format and built-in category names all follow the language; **mod names, your own tags and paths are data and are not translated**
- The Workshop edition and the full edition are separate: the file whose name contains `workshop` is the Workshop edition (it never asks for a Steam Web API Key, has no "Browse Workshop", and updates are delivered through the Steam Workshop)

## Usage

### Install

Download `barotrauma-mod-manager-setup-<version>.exe` from [Releases](../../releases) and double-click it
(**it installs per user, no administrator rights needed**, into `%LocalAppData%\Programs\`).

On first launch the app scans the usual Steam install locations to fill in the folder settings; if it finds nothing, click "Auto-detect" on the Settings page or set the paths by hand.

### The 6 folders you need to fill in

| Setting | Description |
| --- | --- |
| Game root folder | Where Barotrauma is installed, e.g. `…\steamapps\common\Barotrauma` |
| Collections folder | `…\Barotrauma\ModLists` |
| Local mods folder | `…\Barotrauma\LocalMods` |
| Workshop mods folder | `…\steamapps\workshop\content\602960` |
| config_player.xml | The file "Apply to game" writes to |
| Workshop mods installed by the game | `%LocalAppData%\…\WorkshopMods\Installed` (where the game **actually loads** from) |

### Everyday use

1. **Mod Library**: browse / search / tag; mods whose Workshop version is newer are marked
2. **Collections**: arrange the order → "Apply to game" (this backs up `config_player.xml` automatically); the change takes effect the next time you start the game
3. Workshop updates the game has not installed yet → click "**Sync to game**" in the top bar
4. **Before playing together**: "Export" the collection and send it to your friend (either `.xml` or text works); they "Import" it and click "Subscribe" on each entry after filtering with "Only missing"
5. **Saves**: work backwards from a save to see which mods it had enabled and which collection to use

### Automatic updates

Once installed there is nothing to download by hand: every launch quietly checks GitHub for a new version, and when one exists a bar appears at the top of the window —
click "Download update" → "Restart and install". You can also check manually under "Settings → About & updates".

## Safety

### How writing to the game folder is kept safe

- **Applying a collection**: back up first, then write; only the `<contentpackages>` section is touched, everything outside it stays byte-for-byte identical, and a missing section aborts the operation.
  The backup always lives in the single file `config_player.xml.bak`, overwritten on every apply, so nothing piles up in the game folder.
- **Overwriting the local copy with the Workshop version**: the local folder is first **renamed on the same drive** into `ModManagerBackups\`, a **sibling** of `LocalMods`
  (renaming is instant and takes no extra space); if it fails, the change is rolled back automatically.
- **Collection file names** are checked for directory traversal; "Sync to game" and "Import collection" likewise only accept valid IDs / file names.
  Operations that delete things — "Overwrite local with Workshop", "Delete local mod", "Delete snapshot" — must pass path boundary validation first
  (only direct children of `LocalMods`, and snapshot IDs only in the format this app generates itself); anything out of bounds is refused.
- **Backups and snapshots** both live in `ModManagerBackups\`, a **sibling** of `LocalMods`: `<mod name>\<timestamp>\`.
  This is deliberate so the game does not scan them as mods; do not rename snapshot folders by hand (the timestamp is the ID).
  Snapshots are full copies and will add up, so you can delete them one by one on the details page.

### What this program touches (access & privacy)

One principle: **do only what the features require, read rather than write whenever possible, and stay out of the system whenever possible.**

| Operation | Purpose and scope |
| --- | --- |
| Locating the install | Only `Test-Path` on a few common Steam locations (`Steam` / `SteamLibrary` / `Games\Steam` on each drive, `Program Files`), stopping at the first hit; then reads `libraryfolders.vdf` to find the library you declared. **If nothing is found, you type it in Settings yourself** |
| Local reads | The game folder you picked, the current user's Barotrauma mod / config folders, the Workshop subscription folder and its `.acf` files, and `.save` files. It parses each mod's `filelist.xml` and XML definitions; **it executes no mod code** |
| Deciding whether the game is running | **It does not enumerate processes or probe file handles.** Instead, when a file change fails with Windows reporting `EBUSY / EPERM`, that is translated into "the file is in use (the game is running) — close the game and try again". This is **inferred from the error**, not looked up in the system: it cannot tell which process holds the file, and it cannot check another installation |
| Network (only while you act) | Workshop browsing / details / covers (Steam's official Web API + Workshop pages), description translation, update checks. On startup and "Rescan" it **only reads local files and does not go online** |
| Disk writes | The changes you asked for, plus the tool's own data under `%AppData%\潜渊症Mod管理器\`: `settings.json`, `categories.json`, `relations.json`, `steam-api-key.json`, `workshop-checks.json`, `steam-api-host.json`, `previews\` (cover cache), `covers\` (manual covers), `workshop\` / `workshop-pages\` (details and page cache), `translations\` (machine translation cache). **All of it stays on this machine and is never uploaded** |
| Launching other programs | Only when you click: starting the game, opening a Workshop page in Steam, opening a link in your system browser, opening a mod or save folder. "Open path" accepts **directories** only, never files (so it cannot be used to launch an executable) |

**Things it explicitly does not do:**

- **No enumerating system processes**, no reading another process's memory, no terminating any process.
- **No registry writes**, no reading browser data, no reading your account credentials.
- **No administrator rights needed**, no UAC prompts anywhere: the installer is **per user** (`perMachine=false`, `allowElevation=false`),
  and the build contains no `requestedExecutionLevel`.
- No telemetry, no automatic reporting, **no data sent back at all**: this program does not even have a server of its own.

**Where data goes when it is online:**

- `api.steampowered.com` / `community.steam-api.com` (Workshop APIs), `steamcommunity.com` (Workshop pages),
  `images.steamusercontent.com` (covers and screenshots), `api.mymemory.translated.net` (machine translation),
  GitHub (update checks).
- Workshop covers and screenshots are **loaded straight from Steam's image CDN by the renderer**, while every other piece of external data is fetched by the main process and cached locally.
- The only feature that sends **the content itself** out is "Translate": click it and the description text is sent to MyMemory (a free third-party service).
  **The target language = the current interface language** (a Chinese interface translates into Chinese, an English one into English), and translations are cached separately.
  Nothing is sent unless you click it.

**Limits (do not mistake this for a sandbox):** everything above is a constraint in this program's code, **not operating-system isolation**.
A mod's own code runs inside the game and is not controlled by this tool, and this tool does not restrict other programs either.
On top of that, there is an inherent time gap between deciding "the file is in use" and actually changing the file, so close the game before changing anything and keep good backups.

### Steam Web API Key

- Only "Workshop delisting check" and "Browse Workshop" need it; **no other feature does**.
- The key **only ever lives on your own machine** (`%AppData%\潜渊症Mod管理器\steam-api-key.json`, in plain text),
  and requests go straight from your machine to Steam — **they pass through no relay server; we do not have a server**.
- It only reads public Workshop item information (title, description, tags, cover, subscription counts and so on); **it calls no endpoint that needs account authorisation**,
  and it cannot reach your account, password or inventory.
- Using it is bound by the [Steam Web API Terms of Use](https://steamcommunity.com/dev/apiterms) (a limit of 100,000 calls per day,
  no implying Valve's endorsement, no sharing the key, and so on); when you [request one](https://steamcommunity.com/dev/apikey), write the purpose as
  "a mod manager for personal use".

## FAQ

**Q: I applied a collection but nothing changed in the game?**
A: Make sure `config_player.xml` in Settings points at the copy in the game root folder, and restart the game after applying.

**Q: A Workshop mod was clearly updated, but the game still runs the old version?**
A: The game does not install updates by itself — you have to press the update button in its mod list. The manager shows "Sync to game N" in the top bar;
   one click installs it, and Steam does not re-download the whole package. If it says the file is in use, close the game and click again.

**Q: Why do some mods have no cover?**
A: The Steam API returned no cover image for that item (some mods simply have no preview image uploaded), so a placeholder block is shown.

**Q: A local mod shows "not on the Workshop"?**
A: That mod's `filelist.xml` has no `steamworkshopid`, so it cannot be matched automatically (a self-made mod, or one whose ID was changed).
   This is normal and does not affect anything.

**Q: A Workshop mod card says "not in the game yet" / applying reports a mod that is not installed?**
A: That means it is in the Steam subscription folder but the game has not installed it into `WorkshopMods\Installed` yet.
   Launch the game once and it installs automatically, or just click "Sync to game" in the top bar.

**Q: "Browse Workshop" says it cannot reach Steam / needs an API key?**
A: This page uses Steam's official APIs: you first need to request a key at [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey)
   and paste it into Settings, and **this machine must be able to reach Steam** (in mainland China an accelerator is usually required).
   When requesting it, fill in the "domain" and the email address **truthfully** (the domain can be `localhost`, but the email must be a real, working one) —
   giving false information violates the [Steam Web API Terms of Use](https://steamcommunity.com/dev/apiterms)
   and risks having the key disabled; the purpose can simply be "a mod manager for personal use".

**Q: The translation button worked but reads oddly?**
A: Only mods where the author **provided no description in your language** need machine translation (if the author wrote one in that language, theirs is used as-is).
   Machine translation is never accurate on proper nouns; it is only good enough for the gist. Translations are cached separately per "description + target language",
   so the Chinese and English interfaces do not interfere with each other, and each mod is translated only once per language.

## Tech Stack

- **Desktop framework**: [Electron](https://www.electronjs.org/) 33
- **UI**: React 18 + TypeScript + Vite 5 (no UI framework dependency, hand-written CSS)
- **Main process**: Node.js; Workshop data comes from Steam's official Web API (`ISteamRemoteStorage` /
  `IPublishedFileService`) and the Workshop pages; descriptions, covers, screenshots and translations all have a local cache
- **Auto-update**: [electron-updater](https://www.electron.build/auto-update) + GitHub Releases
- **Packaging**: electron-builder (NSIS, per-user install); the icon is generated purely in Node by `scripts/make-icon.cjs`

### Building from source

Node.js 18+ and pnpm are required.

```bash
pnpm install
pnpm app            # build the UI + start the desktop client
```

| Command | What it does |
| --- | --- |
| `pnpm dev` | Runs only the UI dev server (open it in a browser; it uses the built-in sample data) |
| `pnpm build` | Builds only the UI output into `dist/` |
| `pnpm start` | Starts the desktop client against the already-built `dist/` |
| `pnpm run pack` | Packages an NSIS installer (output goes to `release/`) |

> Use `pnpm run pack`. Bare `pnpm pack` hits pnpm's own built-in command (which packs an npm package) and never reaches the packaging script.

Packaging produces three files:

```
release\barotrauma-mod-manager-setup-<version>.exe            the installer (must be uploaded for a release)
release\latest.yml                                            the auto-update manifest (must be uploaded for a release)
release\barotrauma-mod-manager-setup-<version>.exe.blockmap   for delta updates (optional)
```

> `latest.yml` must be uploaded together with the installer, otherwise client updates 404. Updates also work without uploading
> the `.blockmap`, except the client downloads the whole package and cannot fetch only the differences.
>
> The installer file name is deliberately ASCII: the `path` in `latest.yml` must **match the uploaded file name exactly**,
> and with a Chinese name the two would not line up.

<details>
<summary>Releasing a new version (a checklist for myself)</summary>

1. Change `version` in `package.json`. **Clients will not see an update unless the version number changes.**
2. Package it with `pnpm run pack` (first make sure this version number has never been released).
3. Create a Release on GitHub with the tag `v<version>` (matching `package.json`).
4. Upload `barotrauma-mod-manager-setup-<version>.exe` and `latest.yml` from `release\`
   (the `.blockmap` is optional, for delta updates).
   - ⚠️ **Do not tick `Set as a pre-release`** — clients skip pre-releases outright.
5. For the release notes it is best to **paste the Markdown text straight into the body** (far easier to read than a single attachment link).
6. Clients on older versions will be prompted to update the next time they start.

</details>

<details>
<summary>The first packaging run may fail on Windows symlink permissions</summary>

electron-builder unpacks `winCodeSign-2.6.0.7z`, which contains two macOS symlinks, and an ordinary Windows account
without the "create symbolic link" privilege gets `Cannot create symbolic link …`. This has no practical effect on a Windows build;
just copy the unpacked contents under the real cache name and run it again:

```powershell
$cache = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
$tmp = Get-ChildItem $cache -Directory | Where-Object { $_.Name -match '^\d+$' } | Select-Object -First 1
Copy-Item $tmp.FullName (Join-Path $cache 'winCodeSign-2.6.0') -Recurse -Force
```

</details>

## Project structure

```
electron/            main process
  main.js            window + startup
  preload.js         the window.api exposed to the UI
  protocol.js        the local-img:// protocol (displaying local images)
  services/
    index.js         IPC registration
    detect.js        auto-detect Steam / game folders
    settings.js      read and write the folder settings
    mods.js          scan mods, parse filelist.xml, compare versions
    modlists.js      read and write collection files
    config.js        apply to config_player.xml
    saves.js         parse .save files and read out "which mods this save had enabled"
    installsync.js   sync Workshop updates Steam has downloaded but the game has not installed into Installed
    workshopbrowse.js browse the Workshop (QueryFiles: search / sort / category counts)
    workshoppage.js   pull covers and screenshots out of Workshop page HTML (for the details dialog)
    openinsteam.js    open a Workshop page in the Steam client (calls steam.exe directly)
    translate.js      translate a description when no version exists in that language (target = interface language, source language auto-detected)
    share.js          import / export collections (the xml / json / text forms)
    steam.js          Workshop covers and details (public APIs + cache)
    categories.js     category rules and tag persistence
    relations.js     relations between mods (dependencies)
    updater.js        auto-update (electron-updater + GitHub Releases)
    backup.js         snapshots / rollback / one-click backup of Workshop mods
    fsutil.js         copy folders, measure sizes, sanitise file names, and so on
src/                 UI (React + TypeScript, no UI framework dependency, hand-written CSS)
  workshopText.tsx   BBCode in Workshop descriptions → safe React nodes
scripts/             self-test and utility scripts
```

When the UI layer cannot find `window.api` it automatically falls back to the built-in sample data — so `pnpm dev` in a plain browser
is enough to look at the UI, with no need to start Electron.

### Self-tests

```bash
node scripts/test-backend.cjs                    # backend logic (synthetic samples, no local data needed)
node scripts/test-preview.cjs                    # cover service (needs network access)
pnpm exec electron scripts/smoke-app.cjs         # end to end (real folders, read-only)
pnpm exec electron scripts/shots.cjs             # UI screenshots + scroll/interaction checks
pnpm exec electron scripts/test-desc-scroll.cjs  # whether a Workshop description really scrolls (sends real wheel events)
pnpm exec electron scripts/test-apply-ui.cjs     # the UI updates after one "Apply to game" click (isolated temp folder)
pnpm exec electron scripts/test-saves-ui.cjs     # Saves page: parsing, matching collection, both actions (isolated temp saves)
pnpm exec electron scripts/test-sync-ui.cjs      # Workshop updates synced into the game (isolated temp folder)
pnpm exec electron scripts/test-browse-ui.cjs    # Browse Workshop: the no-key / dead-key messages (isolated userData)
pnpm exec electron scripts/test-share-ui.cjs     # collection import/export + the unsubscribed list (isolated temp folder)
```

The scripts with `-ui` all run real IPC against an **isolated `userData` + temp folders** and never touch your game folder;
to point them at a specific game folder, use the `BMM_GAME_DIR` / `BMM_WORKSHOP_DIR` environment variables.

`scripts/compare-mod-dirs.cjs` is a diagnostic tool: it compares whether two copies of a mod have identical contents
(for example taking a clean SteamCMD download and verifying that what "Sync to game" installed really is the newest version):

```bash
node scripts/compare-mod-dirs.cjs "<folder A>" "<folder B>" [more folders…]
```

## License

[MIT](LICENSE)
