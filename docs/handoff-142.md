# Handoff: test build 142 (versionCode 176, 1.7.1)

For a Claude session on Caelan's PC. The code is done and pushed; what is left
needs the PC: building the signed APK and publishing it.

## Where the code is

Branch `claude/peaceful-brahmagupta-q1f0zy`, head `a567a2f`. It is `fixes-137`
(test build 141, 1.7.0) merged in, plus the TV work, plus these fixes:

| Caelan's item | What changed | Commit |
|---|---|---|
| 11, 18 | "Reorder songs" in your own playlists, dragged by a handle; a playlist playing in order follows the new order (`PlaylistsView.tsx`, `followPlaylistOrder` in `App.tsx`) | 33f3471 |
| 12, 13, 20 | `MusicPlayerService`: a watchdog restarts a stalled output where it was, pauses after more than two stalls in two minutes; stays foreground while waiting to resume after another app (TikTok); keeps the notification on swipe from recents | 8a53a28 |
| 14 | Each widget keeps its own colour (`WidgetRenderer`, `colour_<id>`); the colour choice is for the next widget | e6699c4 |
| 15, 16 | Mini player: no flight down after Add to playlist from the big player; fades while a tapped-open player grows | 093537a |
| 17 | No flicker on return: window and WebView ground follow the theme (`setNavBar` `ground`), unchanged scans keep the same song list | 1aaabda |
| 21 | Discover downloads keep their cover: big covers are shrunk to 640 px WebP instead of dropped; Internet Archive tile as fallback (`artDataUrl` in `discover.ts`) | eae1736 |
| 22 | Account photos: the cover list in `library.json` is checked against `covers.json` (missing, too small, or read) and missing pictures are sent again (`engine.ts`) | 07056be |
| | Version bump: versionCode 176, versionName and package.json 1.7.1 | a567a2f |

Checked in the cloud session: tsc, lint at the old baseline (110: 87 errors,
23 warnings), vitest 95 pass, all Java compiles, `AudioEngineTest` 18 pass,
browser checks for 11/18, 15, 16, 21, and a two-phone dev Drive test for 22.

Not checked (needs a phone): real TikTok focus, swipe from recents, widget
colours on a home screen, the flicker itself, photos through a real Google
account.

## What to do on the PC

From `C:\Users\ROG\Desktop\MPtree projects`, in PowerShell:

```
git fetch
git checkout claude/peaceful-brahmagupta-q1f0zy
git pull
cd MPTree-App
npm install
npm run build:test
npx cap sync android
cd android
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
.\gradlew.bat assembleRelease
cd ..
Copy-Item android\app\build\outputs\apk\release\app-release.apk MPTree-pro-test.apk
gh release create v1.2.3-pro-test.142 MPTree-pro-test.apk --prerelease --target claude/peaceful-brahmagupta-q1f0zy --title "Test build 142" --notes "MPTree 1.7.1 test build (versionCode 176): reorder songs in a playlist, music that keeps playing in the background and after TikTok, widgets keep their colour, no mini player jumps, no flicker on return, Discover covers kept, photos come back after a reinstall."
```

`keystore.properties` must be there, or the APK comes out unsigned and will
not install over 141. Delete `MPTree-pro-test.apk` from `MPTree-App` after the
upload.

Download link for the phone, once uploaded:
https://github.com/caelan777/MPtree-projects/releases/download/v1.2.3-pro-test.142/MPTree-pro-test.apk

## Notes

- For item 22: photos already missing from the account only come back from a
  device that still has them. Install 142 there and let it sync before any
  reinstall.
- The Windows app has the same cover code and was not changed; the phone's
  correction of the list makes Windows resend what only it has.
- `fixes-137` was not changed. Do not merge to `main` without Caelan.
- House rules: replies to Caelan in Dutch, no em or en dashes, black and white
  brand, commit and push only when asked.
