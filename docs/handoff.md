# Handoff, 11 October 2026

Where the work stands, for whoever picks it up next. Read `CLAUDE.md` first, then
the "Where things stand" part of `docs/roadmap.md`. `docs/account.md` explains the
account and sync, `Desktop/README.md` the Windows app.

## State in one paragraph

Android 1.2.1 is live on Google Play. Windows 0.1.2 is out on mp-tree.net as an
early release. Both are one fix behind the repository: a song that leaves the
library now also leaves the play queue, and on Windows the floating button no
longer shows white lines when pressed. Those two fixes run only on Caelan's laptop
so far. Buying Pro on Windows is built and waits for Lemon Squeezy to approve the
shop.

## What is live

| Thing | Version | Where |
|---|---|---|
| Android on Google Play | 1.2.1, versionCode 46 | uploaded by Caelan on 5 October |
| Android on the website | 1.1.0 | GitHub release `v1.1.0`, two versions behind Play |
| Android test build | 28, versionCode 45 | prerelease `v1.2.0-pro-test.28`, mp-tree.net/test.html |
| Windows | 0.1.2 | release `windows-v0.1.2`, mp-tree.net/windows.html |
| Website | commit `5d9cf80` | Cloudflare Pages, deploys on push to `main` |

Next versionCode for Android is 47. The next Windows version is 0.1.3.

## In the repository but not released

Commits `98685d0`, `a72a030` and `17666f6`, after Windows 0.1.2 and Android 1.2.1:

1. **A removed song leaves the queue** (`App.tsx` in both apps, the effect right
   under `queueRef.current = queue`). Moved to the bin, deleted, or deleted on
   another device while a different song played, it stayed queued and was played
   when its turn came. Only type-checked. Caelan was asked to try it on the laptop
   (shuffle on, bin the song that is up next) and has not answered yet.
2. **The floating button on Windows** (`Desktop/public/bubble.html`,
   `floating()` in `lib.rs`). The button now fills its round window; the strip
   around it was painted white on a press. Caelan's last screenshot shows the lines
   gone. He remarked on the thin border that is left; it is the button's own 1 px
   line and was not changed.

To release them: Windows 0.1.3 (public build without the checkout link, see
`Desktop/README.md`, "Releasing") and Android 1.2.2 (Play bundle, Caelan uploads).
Wait for Caelan's word on the queue fix first.

## Not committed

- `Branding/social/colours/`: the colours carousel made on 8 October (see below).
  Commit only when Caelan asks.
- Leave alone, as before: the change in `.gitignore`, `Branding/tiktok/`,
  `brag-output/`, `Branding/store/app-screens/`.

## The colours carousel

A TikTok and Instagram photo post in the manner of one by Nothing that Caelan
linked: product shots on light grey, no words. Seven pictures of 1080 x 1350 in
`Branding/social/colours/`:

- `mptree-colours-all.png`: six looks of the Songs page together, meant as the
  first picture. `mptree-colours-1.png` is an older opener with four.
- `mptree-colours-2.png` to `-7.png`: one look each. Pink with a black card, black
  with a pink card, sage with graphite, paper, stone with black, graphite with sage.

Caelan asked for no near-duplicates, so pairs that differed only by black against
graphite were taken out. All six are Pro looks; the caption should say so.

To make more: start the dev server (`mptree-web` in `.claude/launch.json`), then in
that folder `node ../../store/app-screens/capture/shots.mjs "<repo root>" flows.mjs screens [flow ...]`
and `python build.py`. Eighteen captured looks are in `screens/`.

## Open, in the order it matters

**Before the Windows shop opens** (Lemon Squeezy was still reviewing on 6 October):

1. Caelan deletes the test webhook in Lemon Squeezy and makes one in live mode
   with the same secret.
2. Caelan gives the live checkout link; it goes in `Desktop/.env.local`
   (`VITE_CHECKOUT_URL`), and the public Windows build is made with it.
3. One real purchase and refund. The refund path has never been seen working.

Already done for this: `functions/api/pay.js` ignores test-mode payments unless
`LEMON_ALLOW_TEST` is `1` (the test checkout link is in this public repository's
history), the KV store `mptree-pro` is empty, and the privacy page says what a
Windows purchase leaves on mp-tree.net. Because of the first, the test checkout on
Caelan's laptop no longer gives Pro unless he sets that variable in Cloudflare.

**For Caelan, any time:**

- A copy of what exists only on this laptop: `MPTree-App/android/mptree-release.jks`
  and `keystore.properties` first, then `Desktop/src-tauri/google-oauth.json`,
  `Desktop/.env.local`, `Dashboard/secrets.env`, `brag-output/`, `Branding/tiktok/`.
  He said he would do it another time.
- Install Windows 0.1.2 from the website over his 0.1.1. His Start menu still
  opens 0.1.1, and the installer itself has never been run.

**Waiting for a yes from Caelan:**

- The website's Android download to 1.2.1. He asked whether the same version
  everywhere is better; the answer given was yes. No "go ahead" yet.
- Looking into the Microsoft Store for Windows (it signs the app for free, but
  wants MSIX packaging, and its rules for an own checkout were not looked up).

**Later:**

- Tests for the sync rules of October (`keepUnscanned`, `inheritDeletions` in
  `sync/engine.ts`). They are live and were only type-checked.
- Windows: a signed installer, updates that install themselves, remembering the
  window size, telling wifi from a metered connection.
- The small things under "Known and left open" below.

## Decided by Caelan

- Pro is not free on Windows.
- The repository stays public.
- The sync video (`brag-output/syncpc.mp4`) is dropped: he does not like it.
- The homepage no longer links to "Download another version".
- Uploading to Play, signing in to Google and payment details are his to do.

## Not verified

- Android 1.2.1 on a device, by anyone but Caelan (he says he used it).
- The queue fix, in a running app.
- Android `pathStates` (a memory card that is taken out) on a device.
- Deletions carried over after a reinstall under a new device entry.
- A real charge on Google Play. Caelan's Pro came free as a licence tester
  (`pro.json` in his account: by his Pixel, via "play", 1 October).
- How the crossfade sounds. The volumes were measured, nobody listened.

Verified in the built Windows app on 5 October, on an empty profile: crossfade,
cutting (MP3, WAV, and a marker cut on a WebM), the tour, a second start, the bin,
and that deleting a marker cut for good leaves its source. On 6 October: the
installed 0.1.1 announces 0.1.2.

## Known and left open

- A marker cut shows the source's timeline in the player bar.
- A WAV cut named with characters Windows does not allow shows its file name
  after a rescan.
- With a network share offline, each sync round waits about ten seconds on it.
- Equaliser shows 3 of 5 sliders at 360 px width; "1 songs" in Up next; the cut
  sheet's sliders are plain bars.
- 31 lint errors from before. `tsc` and the 49 vitest tests pass in both apps.

## How to build

Android, inside `MPTree-App/`, with
`JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"`:

- Test APK: `npm run build:test`, `npx cap sync android`, `./gradlew assembleRelease`.
- Play bundle: `npm run build:play`, `npx cap sync android`, `./gradlew bundleRelease`.
- Add `--offline -Dorg.gradle.jvmargs="-Xmx900m -XX:MaxMetaspaceSize=384m" -Dorg.gradle.workers.max=2`.
  Do not run `gradlew clean`. The Android project currently holds the **Play** web
  build.

Windows, inside `Desktop/`: `export PATH="$HOME/.cargo/bin:$PATH" CARGO_BUILD_JOBS=2`,
then `npx tauri build`. Close MPTree first or the build cannot replace the exe. The
laptop runs out of memory with Chrome open; ask Caelan to close it rather than
changing build settings. How to try the built app on an empty profile is in
`Desktop/README.md`.

## House rules

No em or en dashes. Replies to Caelan in Dutch. Nothing that reads as generated.
Black and white brand; violet only for shuffle and selection. Pro adds, never takes
away. "Device", not "phone", in account and sync wording. Secrets stay in the
gitignored files. Commit and push only when asked.
