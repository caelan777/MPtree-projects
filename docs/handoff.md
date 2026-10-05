# Handoff, 3 October 2026

Where the work stands, for whoever picks it up next. Read `CLAUDE.md` first for
the project itself and `docs/account.md` for how the account and sync work.

## State in one paragraph

1.2.0 is the release with the MPTree account. The Play bundle is built
(versionCode 42) and waits for Caelan to upload it. Test build 25 holds the same
fixes and is live on mp-tree.net/test.html. None of the reinstall and backup
fixes have run on a real device yet.

## What is ready

| Thing | Where | Notes |
|---|---|---|
| Play bundle 1.2.0 | `MPTree-App/android/app/build/outputs/bundle/release/MPTree-1.2.0.aab` | versionCode 42, built 1 Oct 23:11, signed with the upload key (SHA-1 ends `3C:A8`). Do not run `gradlew clean` before it is uploaded. |
| Test build 25 | GitHub prerelease `v1.2.0-pro-test.25`, asset `MPTree-pro-test.apk` | versionCode 41, linked from `Website/test.html` |
| Store screenshots | `Branding/store/app-screens/` | 18 screens at 1080x2160, two framed cards in `framed/`, the pipeline in `capture/` |

## Not committed

- `MPTree-App/android/app/build.gradle`: versionCode 41 to 42.
- `docs/play-store-listing.md`: says versionCode 42.
- `docs/handoff.md`: this file.

Commit these only when Caelan asks. Leave alone: the change in `.gitignore`,
`Branding/tiktok/`, `brag-output/` and `Branding/store/app-screens/`.

## What the last round changed (commit c67a4de, test build 25)

Caelan reported eight things. What was done:

1. Tapping a song or shuffle opens the header and player and centres the playing
   song (`scrollAndHold`, `pendingScroll` in `App.tsx`).
2. The scroll-to-top button works in one tap.
3. to 6. Reinstall. Android's own backup now keeps only `CapacitorStorage.xml`
   (`res/xml/backup_rules.xml`, `data_extraction_rules.xml`), so playlists,
   covers, likes and settings come back without an account. A restored install
   starts signed out (`fresh` from `Sync.deviceId`), and the synced library
   returns after signing in. The bug behind "playlists empty, covers gone": the
   reinstalled device removed its own `pro.json`, so sync paused. Fixed in
   `pro.ts` (`proLost`) and `sync/engine.ts` (`takeBack`, `recallAliases`,
   `noPic`). Auto collapse and logo position now sync and show at once.
7. Jump to the playing song uses the real row height (`rowHRef`), so it no longer
   lands one row short at other text sizes.
8. The tutorial starts 300 ms after the welcome page, was 900.

## Not verified

- Android backup and restore on a device. It runs about once a day on wifi while
  idle and cannot be forced, so a reinstall right after changing things may bring
  back older data.
- The `fresh` sign-out after a restore.
- The scroll fixes with more than 80 songs (the virtualised list).
- Empty playlists and missing covers could not be reproduced beyond the Pro
  pause. `recallAliases` and `noPic` are hardening, not a confirmed fix.

Verified in the browser harness (two fake devices, fake Drive at `/__dev_drive`):
reinstall plus sign-in brings back playlists, covers, likes and settings, and a
second sync round changes nothing.

## For Caelan to do

1. Install test build 25, set things up, reinstall, sign in. Check items 1 to 8.
2. Upload `MPTree-1.2.0.aab` in Play Console, internal testing first.
3. Data safety: Personal info, User IDs (the account), as in
   `docs/play-store-listing.md`.

## Known and left open

- Equaliser shows 3 of 5 sliders at 360 px width.
- Cut track: the Start and End sliders are plain white bars.
- "1 songs" in Up next.
- Coloured corners at the top of the player sheet in the light theme.
- The framed card says "Spotify alternative". Play may reject a screenshot that
  names another brand; fine for socials.
- 31 lint errors from before. `tsc` and the 49 vitest tests pass.

## How to build

Inside `MPTree-App/`, with `JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"`.

The Android project currently holds the **Play** web build. Before the next test
build run `npm run build:test` and `npx cap sync android` again.

- Test APK: `npm run build:test`, `npx cap sync android`, `./gradlew assembleRelease`.
- Play bundle: `npm run build:play`, `npx cap sync android`, `./gradlew bundleRelease`.
- This PC runs close to its memory limit. Add
  `-Dorg.gradle.jvmargs="-Xmx900m -XX:MaxMetaspaceSize=384m" -Dorg.gradle.workers.max=2`
  and stop the preview servers first. The emulator may not start.
- Next versionCode: **44**. 43 is test build 26. 42 was a Play bundle that was never uploaded and is now out of date: build a new one.
- Releases: `"/c/Program Files/GitHub CLI/gh.exe"` is signed in. Tag
  `v1.2.0-pro-test.N`, asset name `MPTree-pro-test.apk`, then update
  `Website/test.html`.

## Rules that hold

- No em or en dashes. Replies to Caelan in Dutch. Nothing that reads as generated.
- Black and white brand; violet only for shuffle and selection.
- Pro adds, never takes away. The in-app web download stays out.
- "Device", not "phone", in account and sync wording. Keep the account page short.
- Secrets stay in the gitignored files (`Dashboard/secrets.env`,
  `android/keystore.properties`, `*.jks`). Never in commits or published pages.
- Uploading to Play, signing in to Google and entering payment details are
  Caelan's own actions.
- Commit and push only when asked.
- After a website change, do not fetch a bumped `?v=N` URL before the deploy has
  landed; poll with a random query string instead.
