# Handoff, 25 October 2026

Where the work stands, for whoever picks it up next. Read `CLAUDE.md` first, then
the "Where things stand" part of `docs/roadmap.md`. `docs/account.md` explains the
account and sync, `Desktop/README.md` the Windows app. The iPhone version has its
own notes in `docs/ios.md` on the `ios` branch.

## What is live

| Thing | Version | Where |
|---|---|---|
| Android on Google Play | 1.2.8, versionCode 85 (the ad for a day of Pro) | live by 20 October, ads confirmed working. 1.3.0 (92) and 1.3.1 (99) built; see "Waiting on Caelan" |
| Android test build | 76, versionCode 104 (1.3.2: the player back as a sheet as tall as it needs with the record at 268, Next up as a page of its own, repeat all, playlists in order, the header folds alone, the logo no longer moves) | prerelease `v1.2.3-pro-test.76`, mp-tree.net/test, branch `full-player` (not merged) |
| iPhone | 1.3.1 build 5 (not on a phone yet) | branch `ios`, built by GitHub Actions, `MPTree-iPhone-5.ipa` in the repo root (not committed) |
| Windows, Microsoft Store | 0.1.3 | Store ID 9PN3L88V4H58, live since 15 October |
| Website | Cloudflare Pages | deploys on push to `main` |

Android is on Google Play only; the website no longer hands out an APK. The
website's Windows buttons download the Store's own installer
(`get.microsoft.com/installer/download/9PN3L88V4H58`); `windows.html` is gone and
`/windows` redirects there (`Website/_redirects`).

Next Android versionCode is 100 (1.2.5 took 78, 1.2.6 took 79, test build 57 took 80, 1.2.7 took 81, test builds 58 to 60 took 82 to 84, 1.2.8 took 85, test build 61 took 86, 1.2.9 took 87, test builds 62 to 65 took 88 to 91, 1.3.0 took 92, test builds 66 to 69 took 93 to 96: Get music, the + in the header, shelved on 22 October and kept on branch `get-music`, test builds 70 and 71 took 97 and 98, 1.3.1 took 99, test builds 72 to 76 took 100 to 104, 1.3.2 took 105). Next is 106. Next Windows is 0.1.6.

## Branches

| Branch | What | State |
|---|---|---|
| `main` | Android 1.3.1, website | pushed (`cb7e765`) |
| `small-phones` | test builds 70 and 71, 1.3.1 | merged into main and into `ios` |
| `ios` | the iPhone version | pushed (`4a71866`), has everything of 1.3.1 |
| `full-player` | test builds 72 to 76 and the 1.3.2 bundle: the full-screen player, Next up, playing inside a playlist, repeat all, reordering playlists | pushed, not merged |
| `get-music` | the + in the header with "Get music" (test builds 66 to 69) | shelved, not merged |

## Waiting on Caelan

1. **Upload 1.3.1 to Play** (`MPTree-App/android/app/build/outputs/bundle/release/MPTree-1.3.1.aab`,
   versionCode 99, built 24 October from `small-phones`; release notes in
   `docs/play-store-listing.md`). The small-phone fixes and the quiet icon change of test
   builds 70 and 71, on top of all of 1.3.0. If 1.3.0 (versionCode 92) was never uploaded,
   this one replaces it: use 1.3.0's release notes then. Nothing new to declare. If the
   old AD_ID warning about earlier test builds shows, "Release without permission".
   **Or skip straight to 1.3.2** (`MPTree-1.3.2.aab`, versionCode 105, built 25 October from
   `full-player`, not merged into main yet; release notes in `docs/play-store-listing.md`):
   the new player, Next up, repeat all, playlists in order, on top of all of 1.3.1. Not yet
   seen on a phone in its final form (test build 76 has the same code).
2. **AdMob: ad pods off.** People saw several ads in a row for one day of Pro. MPTree asks
   for one rewarded ad per tap; Google's "Ad pods" (two videos in one impression, on by
   default) do the rest. AdMob, Apps, MPTree, Ad units, Dagpas, Advanced settings: untick
   **Ad pods**, and **Interactive** for only video and image ads. Google decides the length
   (5 to 30 seconds); that cannot be set. Not confirmed whether it was done.
3. **Play listing: name and short description with keywords** (proposed 25 October, not
   in `docs/play-store-listing.md` yet). Play Console, Grow users, Store presence, Store
   listings, then each language:
   - en-GB: `MPTree: Offline Music Player`,
     `Offline MP3 & music player with equalizer, playlists, crossfade and sleep timer`
   - nl-NL: `MPTree: Offline muziekspeler`,
     `Offline mp3- en muziekspeler met equalizer, afspeellijsten, crossfade en timer`
   - es-ES: `MPTree: Reproductor de música`,
     `Música sin conexión: reproductor MP3 con ecualizador, listas y temporizador`

   In the full description: "offline music player", "MP3 player" and "music player" a few
   times each, "equalizer" in the American spelling, the formats (MP3, FLAC, M4A, OGG,
   WAV, AAC), and ringtone, cutting songs, sleep timer, lyrics and backup. Never "free",
   "best", "no ads" (MPTree has the rewarded ad) or "download music". Judge after 2 to 4
   weeks.
4. **The iPhone on Caelan's phone.** Sideloadly (v0.71.1) fails with Apple's
   "Login failed (-80046)" for everyone on Windows since 21 October
   (github.com/SideloadlyiOS/Sideloadly-Download/issues/24, still open on 24 October).
   Caelan waits for a fix; until then no more Start presses (failed sign-ins can get the
   Apple ID blocked from sideloading). Then: Sideloadly, `MPTree-iPhone-5.ipa`, the Apple
   ID on the phone, Developer Mode on, trust the profile (steps in `docs/ios.md`). The other
   way is the Apple Developer Program (€99 a year) and TestFlight, which needs the cloud
   build changed to sign and upload.
5. **Windows 0.1.5 MSIX** (`Desktop/src-tauri/target/msix/MPTree-0.1.5.msix`, built
   20 October, replaces the 0.1.4 that was never uploaded): the sign-in-again fix
   plus the full-screen Pro page (two equal cards: pay once, or the free week; no
   ads and no film on Windows) and the triangle Account & sync page, with this
   computer drawn as a laptop. Upload in Partner Center. Only then bump the `windows`
   block of `Website/version.json` to 0.1.5: its notice sends installer users to
   the Store.
6. **Lemon Squeezy** still "under review" since 5 October. Setup is complete except
   2FA. After approval: copy the product to live mode, a live webhook to
   `https://mp-tree.net/api/pay` (events `order_created`, `order_refunded`, same secret
   as `LEMON_WEBHOOK_SECRET`), delete the test webhook, set `LEMON_PRODUCT_ID` and drop
   `LEMON_ALLOW_TEST` in Cloudflare, clear test entries from KV `mptree-pro`, put the
   live link in `Desktop/.env.local`, build Windows with it, tick "purchases outside the
   Store commerce system" in Partner Center, then one real purchase and refund.

## The iPhone version (branch `ios`)

The same React app in Capacitor 8 (Swift Package Manager), with Swift plugins in
`MPTree-App/ios/App/App/` that keep the Android plugins' names and methods. Built on
GitHub's free Macs (`.github/workflows/ios.yml`, on every push to `ios`), unsigned, as
`MPTree.ipa`; Sideloadly signs it with an Apple ID. Builds 1 to 5 all compiled; none of
the Swift has run on a real iPhone yet.

- **Songs:** an iPhone app cannot scan the phone. MusicScannerPlugin.swift reads the
  MPTree folder in the Files app, folders given to it (bookmarks, everything inside),
  and the Music library when switched on (only songs on the phone that Apple does not
  lock). Settings, Library: Add songs, Music folders, Music library. Ids survive app
  updates (`docs/…`, `f<key>/…`, `lib/<id>`). A folder with `.nomedia` is skipped, so a
  backup's song copies do not show twice.
- **Player:** AudioPlayerPlugin.swift on AVPlayer, native is the source of truth as on
  Android; background, lock screen, speed, crossfade. No equaliser yet.
- **Also:** app icons (the `AppIcon-*` sets from `Branding/build-alt-icons.mjs`; iOS
  switches at once and says so itself), cuts as AAC, lyrics, the test ad day (Google
  Mobile Ads 13.11 with Google's iOS test unit, "allow tracking?" first).
- **Not yet:** account and sync (needs an iOS OAuth client in Google Cloud; hidden in
  Settings until then), the equaliser, Google's EU consent screen, the widget (not
  possible with a free Apple ID), buying Pro (a free Apple ID cannot sell; Pro has the
  test unlock).
- `npm run build:ios` is the web app for it (`__DISTRIBUTION__` "appstore", Pro test on).
  New Swift files go into the Xcode project with `node scripts/ios-sources.mjs`.

Decided with Caelan: free sideloading first, everything that is possible now, songs from
the folder, added folders and the Music library ("access to all files" does not exist on
iOS).

## Get music (shelved, branch `get-music`)

The + in the header came back on 22 October as Get music: a full-screen page with a 36 s
tutorial film (`brag-output/getmusic.mp4`, script `brag-output/getmusic-script.md`, voice
ElevenLabs Megan), Bandcamp and Qobuz opened in the browser, and a big arrow at the +
after the tour. Caelan shelved it the same evening; it is not in main or 1.3.1. If it
comes back, first test a Bandcamp download on a real phone.

Refused, and stays refused: mp3juice (a YouTube rip site) in a TikTok or in the app, and
a row for "illegal sites, MPTree not responsible". Google Play bans apps that encourage
infringement, whatever the disclaimer; that is why the old + went on 2 August. Real
in-app downloads would need a paid deal with Jamendo, whose API terms forbid offline use
in an app with ads or Pro.

## Ads

- Rewarded ads instead of the free week (Android only), since 1.2.8. One rewarded video
  watched to the end is 24 hours of Pro, as often as they like (`pro.ts`, key
  `mptree_ad_day`; `AdsPlugin.java` with AdMob 25.5.0 and Google's consent form, UMP
  3.2.0). Pro things say "Free with an ad". A "Privacy choices for ads" row in Settings
  when Google says it is needed (EU/UK). Windows keeps the free week.
- AdMob: publisher pub-3909703327280410, app id ca-app-pub-3909703327280410~7778718905
  (`admobAppId` in build.gradle), rewarded unit "Dagpas"
  ca-app-pub-3909703327280410/3472642383 (the Play build; test builds use Google's test
  unit on purpose). EU consent message "MPTree EU" published. `Website/app-ads.txt` live.
- Look at the AdMob numbers again in early November.

## Parked by Caelan (18 October): sync, to watch

Not problems yet, to look at only if people run into them: songs only move while
MPTree is open (no native background work); WebRTC has STUN only, no TURN, so on
many mobile networks songs go the slower way through Drive; the relay uses the
person's own Drive space; `engine.ts` has no tests (only `model.ts` does); a
conflict goes to the later device clock. Look at Play reviews and mail for
"songs do not arrive" first.

## In the working tree, not committed

- `MPTree-iPhone-5.ipa` in the repo root: iPhone build 5, for Sideloadly.
- `Branding/build-reddit-post.mjs` and `Branding/social/mptree-reddit-1080x1350.png`
  (the Reddit poster). Commit only when asked.
- Leave alone: the change in `.gitignore`, `Branding/tiktok/`, `brag-output/` (films,
  including the Get music one), `Branding/store/app-screens/` (also
  `capture/flows-getmusic-film.mjs`), `Branding/social/colours/`.
- On branches other than `ios`, `MPTree-App/ios/` holds leftovers of the iOS build
  (`App/App/public`, `capacitor.config.json`, `config.xml`) that the `ios` branch
  ignores. Harmless.

## Decided by Caelan

- Rewarded ads replace the free week on Android (17 October): 24 hours of Pro per ad,
  unlimited. Banners between songs and an ad on every Pro tap were turned down
  (22 October).
- Loading screen white for light-mode users is fine.
- Pro is not free on Windows. The repository stays public. Uploading to Play and
  Partner Center, Google sign-in and payment details are his.
- Rejected, do not bring back: extra widgets, the in-app web download page, a website
  APK, rip sites in any form. Get music is shelved, not rejected.
- No reward for a review: Google Play does not allow it. The review card
  (`src/review.ts`) asks once, from the second day, after ten songs, for nothing.
- Aviela's flower editor was in test build 62 only; taken out on 22 October.
- The app icon is never switched while MPTree is in front on Android: Android ends the
  window when its launcher entry changes. SystemPlugin keeps it as pending and switches
  in handleOnStop. Since test build 71 Personalise asks nothing and shows no message; the
  Icons page says it comes when MPTree is left. On the iPhone it switches at once.
- Small phones (24 October): the Pro tag goes under a Settings row's text, Personalise's
  keep button on a sub-page is two lines ("Keep it" / "Free with an ad"), the search box
  has `minWidth: 0`.

## How to build

Android, inside `MPTree-App/`, with
`JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"`:

- Test APK: `npm run build:test`, `npx cap sync android`, `./gradlew assembleRelease`,
  copy to `MPTree-pro-test.apk` in the repo root, `gh release create
  v1.2.3-pro-test.N ... --prerelease --latest=false --target <pushed SHA>`, then
  `Website/test.html` on main (link, build number, what is new). gh is at
  `/c/Program Files/GitHub CLI/gh.exe`.
- Play bundle: `npm run build:play`, `npx cap sync android`, `./gradlew bundleRelease`,
  copy to `MPTree-<version>.aab`, release notes in `docs/play-store-listing.md`.
- Add `--offline -Dorg.gradle.jvmargs="-Xmx900m -XX:MaxMetaspaceSize=384m" -Dorg.gradle.workers.max=2`,
  then `./gradlew --stop`. Never `gradlew clean`. If Gradle dies with "insufficient
  memory", stop the preview dev servers, or ask Caelan to close Chrome.

iPhone: push to `ios`; the workflow builds it (about 2 to 3 minutes) and attaches
`MPTree-iPhone-<run>` with `MPTree.ipa`. `gh run download <id> -n MPTree-iPhone-<n>`.

Windows, inside `Desktop/`: version in `package.json`, `src-tauri/tauri.conf.json`,
`src-tauri/Cargo.toml` and `Cargo.lock`. Store builds with
`VITE_CHECKOUT_URL="" npm run app:build:store` until the shop is live. The laptop runs
out of memory with Chrome open; ask Caelan to close it rather than changing build
settings.

## House rules

No em or en dashes. Replies to Caelan in Dutch. Nothing that reads as generated.
Black and white brand; violet only
for shuffle and selection, pink for Aviela, green for Lantern. Pro adds, never takes
away. "Device", not "phone", in account and sync wording. Secrets stay in the
gitignored files. Commit and push only when asked. Temp files inside the project
folder, deleted after use. Edit each app separately; no shared packages.
