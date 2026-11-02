# Handoff: MPTree on the TV

Everything about the living-room Android TV, as of 2 November 2026: the home
screen (the **launcher**, `TV/`) and **MPTree itself on the TV** (`MPTree-App/src/tv`).
Read this first, then `TV/README.md` for the feature list.

## Where the code is

Two branches, never merged into `main` yet:

| Branch | What | Latest |
|---|---|---|
| `tv-launcher` | The launcher, `TV/` (only exists on this branch). Contains `main`. | `204740e` TV 0.6.0 |
| `claude/peaceful-brahmagupta-q1f0zy` | MPTree app changes for the TV (`MPTree-App/`). Contains `main` plus 4 commits. | `4770db2` |

The two are independent: the launcher talks to MPTree only through Android
(launch intents and media sessions), never through shared code. Keep it that way
(root `CLAUDE.md`: no shared packages).

Switching branches: `TV/node_modules` and `TV/dist` are untracked and stay behind on
the app branch, so `git status` there shows `?? TV/`. Don't commit them.

## The launcher (`TV/`, 0.7.0, versionCode 10)

React 19 + Vite + Capacitor 8, app id `com.caelan.mptree.tv`. A 1920×1080 stage
scaled to the screen, so every CSS size is a real TV pixel.

**How it is put together**

| Path | Role |
|---|---|
| `src/App.tsx` | Pages (home, apps, settings), Home's two sides (`side`: day/house), dark mode, screensaver, Back and Home buttons, the merged weather, the music |
| `src/components/HomeView.tsx` | Home as two pages side by side; the edge slide |
| `src/components/layouts/*.tsx` | Page one in five layouts: Classic, Editorial, Cinema, Sky, DayLine. `parts.tsx` has shared pieces (`DayProps`, `MusicCard`, `HourStrip`, `EdgeTab`, `StatsCard`) |
| `src/components/HouseView.tsx` | Page two: every Home Assistant control |
| `src/home.ts` | `homeOf()`: everything the screens show about the house and its buttons, from Home Assistant states |
| `src/ha.ts` | Home Assistant over REST (polled every 20 s), forecast and sunset-script lights |
| `src/weather.ts` | Open-Meteo, turned into fake Home Assistant states (`weather.forecast_home`, `sun.sun`, `sensor.sun_next_*`) |
| `src/music.ts` | One `Music` shape for "plays on this TV" (media sessions) and "plays on a speaker" (Home Assistant) |
| `src/nav.ts` | The remote: geometric focus, `data-zone` edges, hold-OK, the OK hint |
| `src/home.css` | Round-four styles (layouts, pages, house, night clock). `index.css` is the base, top bar, Settings, panels |
| `src/settings.ts`, `src/homeConfig.ts` | Saved settings; Home Assistant entity ids (change ids only here) |
| `android/.../LauncherPlugin.java` | List/launch apps, Home button, app changes, `nowPlaying`, `mediaControl` |
| `android/.../MediaListener.java` | Empty notification listener; Android requires it before an app may read media sessions |
| `design/v4.html` | Round-four design board (also published: https://claude.ai/artifact/JGfqrQBb7hgCQKTGebH41X) |

**Rules that are easy to break**

- **Home's two pages.** Page one is the same with or without Home Assistant. Page two
  only exists when `haOn(settings)`. Each page is a `<section data-zone>`; `nav.ts`
  keeps Left/Right inside a zone and fires `tvedge` at its edge, which HomeView turns
  into a slide. The page that is away is `inert`; `focusFirst`/`focusOne` skip inert
  elements. Don't put focusable things in the top bar inside a zone.
- **Home Assistant wins over Open-Meteo.** App merges `{...wx.states, ...ha.states}`.
  Settings and the heating panel get `haLive` (real Home Assistant only), so the
  "is this entity found" list is honest.
- **Class names.** `.top` is the top bar (absolute). Don't reuse it inside layouts
  (it broke Sky and the house tiles once). Layout styles are prefixed: `cl-`, `ed-`,
  `ci-`, `sk-`, `dl-`, `hs-`, `mc-`.
- **No refs read in render** (React Compiler lint). `toast` is state-based for that
  reason; non-component helpers go in `.ts` files, not `.tsx` (react-refresh lint).
- **Brand**: black and white; violet only for shuffle state and selection.

**Native features and their one-time steps**

- MPTree's song on Home needs, once per install (survives `adb install -r`, lost on uninstall):
  `adb shell cmd notification allow_listener com.caelan.mptree.tv/com.caelan.mptree.tv.MediaListener`
  Settings → This TV shows whether it is allowed.
- Shuffle music launches MPTree with the extra `mptree_action=shuffle`
  (`LauncherPlugin.launch`, flags NEW_TASK | CLEAR_TOP | SINGLE_TOP).

## MPTree on the TV (`MPTree-App/`, app branch)

- `isTvDevice()` (`src/tv/tvNav.ts`) plus native `System.isTelevision()` switch the
  phone UI off and show `src/tv/TvView.tsx`: songs left, player right, remote nav.
  Sheets (account, settings, Pro) still open over it. Onboarding is hidden on TV.
- Sign-in on a TV skips the account chooser (`AccountPlugin`, `isTv()`). A debug
  build may fail Google sign-in (key not registered): use the release build.
- `MainActivity.pendingAction` + `System.takeAction()`: reads `mptree_action=shuffle`
  on library-ready and on resume.
- Back: TvView hands App a handler via `setBack`; App calls it after the sheets.
  Order: playlist → playlists → songs → clear search → leave app.
- Voice search: mic button next to the search → `System.voiceSearch()`
  (`RecognizerIntent`; manifest `<queries>` for RECOGNIZE_SPEECH, no mic permission).
  The remote's search key also triggers it (`MainActivity.onSearchRequested`, TV only).
  Many Google TV remotes send their mic to the Assistant instead; the on-screen mic
  is the reliable path.
- MPTree's release version was **not** bumped for these changes.

## Building and installing (Windows, PowerShell)

Every new PowerShell window needs:

```
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:Path += ";$env:LOCALAPPDATA\Android\Sdk\platform-tools"
adb connect 192.168.178.31
```

Launcher (repo root, branch `tv-launcher`): `cd TV`, `npm install`, `npm run build`,
`npx cap sync android`, `cd android`, `.\gradlew.bat assembleDebug`,
`adb install -r app\build\outputs\apk\debug\app-debug.apk`.

MPTree (branch `claude/peaceful-brahmagupta-q1f0zy`): `cd MPTree-App`, same steps but
`.\gradlew.bat assembleRelease` and `app\build\outputs\apk\release\app-release.apk`.
Signature mismatch: `adb uninstall com.caelan.mptree` first.

Gotchas: `TV` is next to `MPTree-App`, not inside it. If checkout complains about
`TV/android/app/capacitor.build.gradle` or `TV/android/capacitor.settings.gradle`,
`git stash` (they are regenerated by `cap sync`).

## Testing without a TV

- `npm run build && npx vite preview` in `TV/`, then a browser at 960×540.
  `?song` fakes a song playing on the TV (web stub in `src/launcher.ts`).
- A fake Home Assistant (states, forecast, sunset script, media player, shuffle
  script) was used on `:8123` with token `testtoken`; Open-Meteo was mocked with
  Playwright `page.route`. Those scripts lived in the session scratchpad and are
  not in the repo; recreate them if needed.
- Java can't be built in the cloud sandbox (no Android SDK). It was compile-checked
  with `javac` against Robolectric's `android-all` jar plus stand-ins for Capacitor
  and androidx. A real `gradlew` build on the PC is the actual test.
- Checks before pushing: `npx tsc -b`, `npx eslint .` (launcher: 0 problems;
  MPTree: 58 problems / 37 errors, all pre-existing, the count must not grow),
  `npx vitest run` in `MPTree-App` (53 tests).

## Not verified on the real TV yet

- The 0.6.0 launcher as a whole (the user was installing it at handoff).
- Open-Meteo from the TV (blocked from the sandbox; written to the documented format).
- MPTree's Back levels and voice search.
- Media-session reading after the adb command.
- Round five on the TV: the intro on boot and after standby (screen on/off broadcasts),
  background shuffle (`ShuffleActivity` and the foreground start), MPTree's player
  and Settings panel at the TV's real size.

## Round five (2 November 2026): launcher 0.7.0, MPTree on the TV

Asked for by the user for family use, no other limits. What changed is in
`TV/README.md` ("New in 0.7.0"). The rules it adds:

- **Music is MPTree's only.** No Home Assistant speaker anywhere (data, house page,
  music panel, Settings, `homeConfig.ts`); the native `nowPlaying` only reads
  MPTree's media session (`LauncherPlugin.pick`).
- **The intro** (`components/Intro.tsx`) plays on boot (`startInfo().sinceBootMs`
  under 5 minutes) and on `screenOn` with the launcher in front, never otherwise.
  `screenOff` closes the screensaver and blacks the screen out ("wait"); the wait
  gives up by itself after 3 s in view. Home waits for `loadApps` and Home
  Assistant's `refresh` (at most 12 s). The Verkuijl logo is the owl from
  `design/verkuijl-owl.png`, traced to SVG paths (`OWL`, stroke 7.5 in the PNG's
  480 x 600 space); `FLY_ORIGIN` is the middle of its face, the opening you fly through.
  On `SCREEN_OFF` the plugin adds a black view over the WebView (else the screen
  came on showing the WebView's stale Home frame before the intro); the page calls
  `uncover` two frames after it is in view with the intro playing (or skipped).
  Checked on the TV: after wake, black, then the owl, then Home. `screenrecord`
  can't capture a wake (its encoder fails while the screen is off): use rapid raw
  `screencap` in a device-side loop instead.
- **App rows** are `AppRow` (`layouts/parts.tsx`): apps then "All apps"; the row
  slides by `--shift` when the seventh takes focus. Editorial's is a text line.
- **Background shuffle**: the launcher starts `com.caelan.mptree/.ShuffleActivity`
  (no window), which `startForegroundService`s MPTree's player with
  `SHUFFLE_ALL`. The player shuffles the songs MPTree saved in Preferences under
  `mptree_tv_library` (written on TVs only, 3 s after the library changes). The app
  takes the player's queue over through `AudioPlayer.getQueue()`. Fallbacks: no
  saved list, or an older MPTree, opens MPTree with `mptree_action=shuffle`.
- **MPTree on the TV**: text zoom is always 100% on a TV (`SystemPlugin.setTextZoom`;
  a bigger zoom pushed the player off screen); the player fits its 1000 px column
  (cover 360, two songs in Up next); Settings is a panel over the player card
  (`SettingsSheet tv`, class `tv-panel-veil`), without Size and Show tutorial;
  the remote reaches rows scrolled out of a sheet (`tvNav.scrolledAway`).
- **MPTree numbers**: `STATS_URL` in `homeConfig.ts` (empty), no Settings section.
- **Classic's left side**: of the five options on `design/v5-classic.html` the user
  picked the first, the ruled strip tidied (strip 880 px, taller, bigger figures).

## Open next

1. **MPTree numbers on the TV.** The launcher reads `STATS_URL` in
   `src/homeConfig.ts` (empty). Missing: somewhere to host `data.json`.
   Recommended: have `Dashboard/collect.mjs` upload it to a public Cloudflare R2
   bucket (`wrangler r2 object put … --remote`), run daily from Windows Task
   Scheduler; keys stay on the PC (see `Dashboard/README.md`). Alternatives: Home
   Assistant `www` folder, or via the MPTree account (most work). Waiting on the
   user's choice.
2. Merging both branches into `main` once tested on the TV. `CLAUDE.md` on `main`
   already lists `TV/`, but the folder only exists on `tv-launcher`. Both branches
   are 12 commits behind `main` (MPTree 1.3.6); merge `main` into the app branch
   first.
3. Security: the user once pasted a Home Assistant token in chat and was told to
   revoke it. Never reuse it; tokens are only typed into the TV's Settings.
