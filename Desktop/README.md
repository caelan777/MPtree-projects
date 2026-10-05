# MPTree for Windows

The Windows prototype: a Tauri window around a copy of the Android app's
interface. It scans the computer for music and plays it, with a layout made for
a window rather than a phone.

It is a copy on purpose (see the workspace `CLAUDE.md`): nothing here is shared
with `MPTree-App/`, and a change there does not arrive here by itself.

## How it is put together

| Part | Where | What it does |
|---|---|---|
| Interface | `src/` | The Android app's React code, copied, plus the wide layout |
| Wide layout | `src/desktop/Desktop*.tsx`, and `wide` in `src/App.tsx` | Sidebar, table, player bar, the panel with the record |
| Player | `src/desktop/AudioPlayerDesktop.ts` | An `<audio>` element in the window. Keeps the native contract: it advances tracks and says so through `stateChange` |
| Scanner | `src/desktop/MusicScannerDesktop.ts` | Asks Rust for the songs in a folder |
| Rust | `src-tauri/src/lib.rs` | Folder scan and tags (`lofty`), covers, sidecar lyrics, Recycle Bin, the logo button |
| Account | `src-tauri/src/account.rs`, `sync.rs` | Google sign-in through the browser, and the file work for sync |

`src/plugins.ts` picks the Windows player and scanner when the page runs inside
Tauri. In a plain browser (`npm run dev`) it falls back to the demo library and
the silent player, which is how the interface is worked on without building Rust.

## The layouts

- **Wide** (window 900 px or wider): sidebar, table, player bar. From 1100 px the
  panel on the right (drag its left edge to resize it) with the record, Up next and lyrics. Sheets are dialogs in
  the middle. The number 900 is `isWide` in `src/themes.ts` and `WIDE_FROM` in
  `lib.rs`; change both.
- **Narrow**: the phone layout, unchanged.
- **The round button**: a round logo that floats on the screen while MPTree is
  minimised or in its small form. A click brings MPTree up small, in the phone
  layout, beside it; another click puts it away. It can be dragged anywhere, and
  dropped on the X that shows meanwhile to switch it off. Settings, Appearance,
  "Floating button" switches it on and off. Maximising ends the small form.
- **The title bar** is the app's own (`src/desktop/TitleBar.tsx`): Windows'
  is switched off in `tauri.conf.json`.

## Run and build (inside `Desktop/`)

Needs Rust (`rustup`) and the Visual Studio C++ Build Tools. Cargo is not on the
PATH of Git Bash by default: `export PATH="$HOME/.cargo/bin:$PATH"`.

```bash
npm install
npm run dev          # interface only, in a browser, with the demo library
npm run app:dev      # the real window, with hot reload
npm run app:build    # the installer, in src-tauri/target/release/bundle/nsis/
```

This PC is short on memory: `export CARGO_BUILD_JOBS=4` before a Rust build.

## Releasing

Bump the version in `package.json`, `src-tauri/tauri.conf.json` and
`src-tauri/Cargo.toml`, build, and upload the installer to a GitHub release
tagged `windows-v<version>` as `MPTree-Setup-<version>.exe`, **not** marked as
latest (the Android download button follows `/releases/latest`). Then update
the link in `Website/windows.html` and the `windows` block in
`Website/version.json`. The picture on the site comes from
`node Desktop/scripts/site-shot.mjs`.

## Things worth knowing

- **One at a time.** A second start shows the MPTree that is already open
  (`first_instance` in `lib.rs`).
- **The scan is cached.** Tags are read once per file and kept for as long as
  the file does not change (`Tags` in `lib.rs`); the sync engine scans on
  every round. Fingerprints are kept the same way (`sync.rs`).
- **Files that are online only are left out.** A OneDrive file that is not on
  this disk would be downloaded by reading its tags.
- **Crossfade** is two `<audio>` elements changing places in volume
  (`AudioPlayerDesktop.ts`), as the phone has two MediaPlayers.
- **A cut** is a real file when the source is MP3 or WAV (`media.rs`), and two
  markers on the original otherwise, which the player keeps to itself.
- **A marker cut is not a file.** Its path is its source's. Deleting one for
  good takes it out of the bin and leaves the source where it is
  (`handleDeleteForever` and `handleEmptyBin` in `App.tsx`); before 0.1.2 it
  took the original song with it.
- **A WebM saved as .mp3** plays, and shows its length (`media.rs` reads it
  from the Matroska header; lofty goes by the name and gives up).
- **A song the scan no longer lists is not "deleted"** while its file is still
  there or its disk is not (a stick taken out, another music folder chosen):
  see `keepUnscanned` in `src/sync/engine.ts`. Counting it as deleted would
  put it in the bin on every device.

## Trying the real window without touching your own library

The built app can be started on an empty profile, and driven from a script
through the WebView's debugging port:

```bash
export WEBVIEW2_USER_DATA_FOLDER="$PWD/.test-run/profile"
export WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9340"
src-tauri/target/release/mptree-desktop.exe
```

That profile has no account, so nothing syncs. Point it at a folder of copies
(`localStorage.mptree_desktop_folder`), and keep that folder under a name that
starts with a dot: the scan of the whole user folder skips those, so the copies
never show up in the real library. Songs in `Music\MPTree` are listed whichever
folder is chosen, and a cut is written there, so remove test cuts afterwards.
MPTree runs once at a time: close the real one first.

## Not there yet

- Buying Pro on Windows is built (a web checkout, `BillingDesktop.ts`) and
  switched off in public builds until the shop is approved: it is on when
  `VITE_CHECKOUT_URL` is set at build time.
- Updates do not install themselves. The app reads the `windows` block of
  `Website/version.json` once a day and points at `mp-tree.net/windows.html`.
- Code signing: the installer is unsigned, so Windows warns about it.
- The Playlists page is the phone page with a wider grid; it has no keyboard
  handling.
- Formats the WebView cannot decode are not scanned (see `AUDIO_EXTENSIONS`).
- A metered connection is not told apart from wifi, so songs sync on both.
- This PC cannot always build the release: the last link needs a few
  gigabytes of memory. Close the browser first if it fails with "out of
  memory".
