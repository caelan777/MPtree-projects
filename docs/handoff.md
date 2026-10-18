# Handoff, 17 October 2026

Where the work stands, for whoever picks it up next. Read `CLAUDE.md` first, then
the "Where things stand" part of `docs/roadmap.md`. `docs/account.md` explains the
account and sync, `Desktop/README.md` the Windows app.

## What is live

| Thing | Version | Where |
|---|---|---|
| Android on Google Play | 1.2.4, versionCode 75 | uploaded by Caelan on 15 October |
| Android test build | 60, versionCode 84 (branch `rewarded-ads`: ads with Google test units, two-card Pro page always with the ad, full screen) | prerelease `v1.2.3-pro-test.60`, mp-tree.net/test |
| Windows, Microsoft Store | 0.1.3 | Store ID 9PN3L88V4H58, live since 15 October |
| Website | Cloudflare Pages | deploys on push to `main` |

Android is on Google Play only; the website no longer hands out an APK. The
website's Windows buttons download the Store's own installer
(`get.microsoft.com/installer/download/9PN3L88V4H58`); `windows.html` is gone and
`/windows` redirects there (`Website/_redirects`).

Next Android versionCode is 86 (1.2.5 took 78, 1.2.6 took 79, test build 57 took 80, 1.2.7 took 81, test builds 58 to 60 took 82 to 84, 1.2.8 took 85). Next Windows is 0.1.5.

## Waiting on Caelan

1. **Upload 1.2.8 to Play** (`MPTree-App/android/app/build/outputs/bundle/release/MPTree-1.2.8.aab`,
   versionCode 85, built 18 October; release notes in `docs/play-store-listing.md`).
   The first bundle with ads: everything of 1.2.7 (account page, MP3 cut fix,
   crossfade, sign in again keeps the bin, plain white start) plus the ad for a day
   of Pro instead of the free week. Replaces 1.2.5 to 1.2.7. Before sending it for
   review, in Play Console: Ads yes, Advertising ID yes, Data safety rows for
   AdMob. Caelan tested the ad on his phone with test build 60 (it works). The
   website already says what the app does with ads (privacy page live 18 October).
2. **Windows 0.1.4 MSIX** (`Desktop/src-tauri/target/msix/MPTree-0.1.4.msix`, the
   sign-in-again fix) to upload in Partner Center. Only then bump the `windows`
   block of `Website/version.json` to 0.1.4: its notice sends installer users to
   the Store.
3. **Lemon Squeezy** still "under review" since 5 October. Caelan waits a week from
   15 October; he was given a status message for support@lemonsqueezy.com. Setup is
   complete except 2FA. After approval: copy the product to live mode, a live
   webhook to `https://mp-tree.net/api/pay` (events `order_created`,
   `order_refunded`, same secret as `LEMON_WEBHOOK_SECRET`), delete the test
   webhook, set `LEMON_PRODUCT_ID` and drop `LEMON_ALLOW_TEST` in Cloudflare, clear
   test entries from KV `mptree-pro`, put the live link in `Desktop/.env.local`,
   build Windows with it, tick "purchases outside the Store commerce system" in
   Partner Center, then one real purchase and refund.

## Ads (merged into main on 18 October)

- **Rewarded ads instead of the free week (Android only)**, on the branch
  `rewarded-ads`, merged into main on 18 October for 1.2.8. Test build 58
  is made from it. The Pro page there shows buying and the ad as two equal cards
  (design B of https://claude.ai/artifact/HfXts2MANZazZggR3LNmyW). Someone without Pro who
  taps something Pro (a Pro record or shade, Clean up, sync paused) gets the Pro
  page with "Watch an ad for 24 hours of Pro" under the buy button. Since test
  build 59 the ad card shows however the Pro page opens, also from the Settings
  card, which now says "Free for a day with an ad, or pay once". One rewarded video watched to the end
  is 24 hours of Pro, as often as they like. `pro.ts` (the day, key
  `mptree_ad_day`; a free week still running is carried over once), `AdsPlugin.java`
  (AdMob 25.5.0 + Google's consent form, UMP 3.2.0), a "Privacy choices for ads"
  row in Settings when Google says it is needed (EU/UK). `TrialOverSheet` is gone.
  Typecheck, tests and the Java compile pass; not run on a device. Privacy page
  (new Ads part) and `docs/play-store-listing.md` (description, Data safety, Ads:
  yes, Advertising ID) are updated on the branch.
  AdMob: publisher pub-3909703327280410, app id
  ca-app-pub-3909703327280410~7778718905 (`admobAppId` in build.gradle), rewarded
  unit "Dagpas" ca-app-pub-3909703327280410/3472642383 (`AD_UNIT` for the Play
  build; the test build keeps Google's test unit on purpose). EU consent message
  "MPTree EU" published (Consent, Do not consent, Manage options).
  `Website/app-ads.txt` is live (pushed on its own). AdMob "Verify app" failed
  right after that push, most likely because it had crawled before the file was
  there; Caelan presses Check for updates again on 18 October. The app still
  "Requires review" in AdMob.
  Done for 1.2.8: branch merged, privacy page live (dated 18 October), "no ads"
  gone from `Website/index.html`, the splash says "your music · on your device".
  Windows keeps the free week.

## Parked by Caelan (18 October): sync, to watch

Not problems yet, to look at only if people run into them: songs only move while
MPTree is open (no native background work); WebRTC has STUN only, no TURN, so on
many mobile networks songs go the slower way through Drive; the relay uses the
person's own Drive space; `engine.ts` has no tests (only `model.ts` does); a
conflict goes to the later device clock. Look at Play reviews and mail for
"songs do not arrive" first.

## In the working tree, not committed

- `Branding/build-reddit-post.mjs` and `Branding/social/mptree-reddit-1080x1350.png`
  (the Reddit poster). Commit only when asked.
- Leave alone: the change in `.gitignore`, `Branding/tiktok/`, `brag-output/`,
  `Branding/store/app-screens/`, `Branding/social/colours/`.

## Done this week, for context

- Account & sync page (Android, 1.2.6): design B from the canvas
  https://claude.ai/artifact/QHFuSQLBKb9UNurRbqNdre. The devices in a triangle,
  this one on top, dots running along a line while songs go that way (slowly both
  ways when all is in step), one plain sentence below, then rows: playlists and
  likes, songs over mobile data, add or remove devices (folds open), what syncs.
  The Windows app still has the old page.

- Crossfade (Android, test build 56): the song fading in plays in an audio session
  of its own with an equalizer set the same way, and takes the session over at the
  end. Sharing one session made the ending song cut out on many phones. Not heard
  on a device yet.
- Sync (both apps, test build 55, Windows 0.1.4): signing in again no longer brings
  back what the other devices binned or deleted; `joinSong` in `sync/model.ts`
  takes the account's bin. Covered by tests.
- Windows Store builds must be made with
  `VITE_CHECKOUT_URL="" npm run app:build:store` until the shop is live, or the
  test checkout link from `.env.local` ends up in them. Whether the live 0.1.3 has
  it was not checked; 0.1.4 does not.

## Decided by Caelan

- Rewarded ads replace the free week on Android (17 October, changing his earlier
  "no ads for now"): 24 hours of Pro per ad, unlimited, offered only after tapping
  something Pro. Windows keeps the free week.
- Loading screen white for light-mode users is fine.
- Pro is not free on Windows. The repository stays public. Uploading to Play and
  Partner Center, Google sign-in and payment details are his.
- Rejected, do not bring back: plus page, extra widgets, app icon picker, the
  in-app web download, a website APK.

## How to build

Android, inside `MPTree-App/`, with
`JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"`:

- Test APK: `npm run build:test`, `npx cap sync android`, `./gradlew assembleRelease`,
  copy to `MPTree-pro-test.apk` in the repo root, `gh release create
  v1.2.3-pro-test.N ... --prerelease`, then `Website/test.html` (link, build number,
  what is new). gh is at `/c/Program Files/GitHub CLI/gh.exe`.
- Play bundle: `npm run build:play`, `npx cap sync android`, `./gradlew bundleRelease`,
  copy to `MPTree-<version>.aab`, release notes in `docs/play-store-listing.md`.
- Add `--offline -Dorg.gradle.jvmargs="-Xmx900m -XX:MaxMetaspaceSize=384m" -Dorg.gradle.workers.max=2`,
  then `./gradlew --stop`. Never `gradlew clean`.

Windows, inside `Desktop/`: version in `package.json`, `src-tauri/tauri.conf.json`,
`src-tauri/Cargo.toml` and `Cargo.lock`. Store package as above. The laptop runs
out of memory with Chrome open; ask Caelan to close it rather than changing build
settings.

## House rules

No em or en dashes. Replies to Caelan in Dutch. Nothing that reads as generated.
Black and white brand; violet only for shuffle and selection, pink for Aviela,
green for Lantern. Pro adds, never takes away. "Device", not "phone", in account
and sync wording. Secrets stay in the gitignored files. Commit and push only when
asked. Temp files inside the project folder, deleted after use. Edit each app
separately; no shared packages.
