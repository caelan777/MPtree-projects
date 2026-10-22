# MPTree for iPhone

The iPhone version is the same React app as Android, in Capacitor, with its
native parts written again in Swift (`MPTree-App/ios/App/App/`). It is built on
one of GitHub's Macs and put on the iPhone with **Sideloadly** and a free Apple
ID. No Apple Developer Program yet. Work happens on the `ios` branch.

## Getting a build

Every push to `ios` that touches the app starts **iPhone build** under the
repo's Actions tab (about 10 to 15 minutes).

1. github.com/caelan777/MPtree-projects, **Actions**, **iPhone build**, the newest run.
2. Under **Artifacts**, download `MPTree-iPhone-<number>`. It is a zip; inside is `MPTree.ipa`.

## Once, on the Windows laptop

1. **iTunes** and **iCloud for Windows**, the versions from apple.com, not
   the Microsoft Store ones. Sideloadly talks to the iPhone through them.
2. **Sideloadly**, from sideloadly.io.

## Putting it on the iPhone

1. Plug the iPhone in with a cable and tap **Trust** on it.
2. Open Sideloadly, drag `MPTree.ipa` in, pick the iPhone, type your Apple ID,
   **Start**. It asks for your password and the two-step code. A second
   Apple ID works too if you'd rather not use your own.
3. The first time only:
   - On the iPhone, Settings, Privacy & Security, **Developer Mode** on. The
     iPhone restarts; confirm when it asks.
   - Settings, General, **VPN & Device Management**, your Apple ID, **Trust**.

Putting a newer build on the same way keeps your songs, playlists and
settings.

## Every 7 days

With a free Apple ID the app stops opening after 7 days. Put it on again with
Sideloadly (the same `.ipa` is fine); nothing is lost. Sideloadly can also
refresh it by itself when the laptop and iPhone are on the same Wi-Fi.

## What a free Apple ID can't do

- At most about 3 sideloaded apps on one iPhone.
- **No purchases**, so Pro is unlocked in these builds, as in the Android
  test builds ("Unlock (test build)").
- **No widget**: it needs a feature only the paid Apple account has.

The €99 a year Apple Developer Program lifts all of these, and the App Store
needs it anyway.

## Where it stands

`src/plugins.ts` uses a Swift plugin once it exists on the iPhone and the
browser's stand-in until then, so the app runs from the first build on.

| Plugin | iPhone |
|---|---|
| MusicScanner (songs) | Swift: the MPTree folder in Files, Add songs, Music folders, the Music library, cuts, lyrics |
| AudioPlayer | Swift: AVPlayer, background, lock screen, speed; no crossfade or equaliser yet |
| System | Swift: device, links, text size; no app icons yet (Icons hidden in Personalise) |
| Billing | stand-in (Pro unlocks with a tap) |
| Ads | stand-in, none yet |
| Account, Sync | stand-in; Account & sync hidden in Settings |

A Swift plugin is listed in `IOS_SWIFT` in `src/plugins.ts` and registered in
`MainViewController.swift`. A new `.swift` file in `ios/App/App/` goes into the
Xcode project with `node scripts/ios-sources.mjs`.

Still to come: crossfade, app icons, the test ad day; then account and sync
once an iOS OAuth client exists in Google Cloud.

On the iPhone, songs come from: the MPTree folder in Files (always), Settings,
Library, **Add songs** (copies files in), **Music folders** (any folder, read
with everything inside, every time) and **Music library** (songs synced to the
Music app, not Apple Music's own). Ids stay the same across updates
(`docs/…`, `f<key>/…`, `lib/<id>`), so playlists and likes keep their songs.

## Building, for whoever works on it

- `npm run build:ios` is the web app for the iPhone (`__DISTRIBUTION__` is
  `appstore`, Pro test unlock on, no update checks).
- `ios/` was made with `npx cap add ios` (Swift Package Manager). Running
  `npx cap sync ios` on Windows writes `ios/App/CapApp-SPM/Package.swift` with
  backslashes; the Mac in the workflow writes it again, so do not commit
  that change.
- `.github/workflows/ios.yml` builds Release for a device with signing off and
  zips `App.app` into `Payload/` as `MPTree.ipa`.
- The app is iPhone only, portrait, with background audio, its folder in
  Files (`UIFileSharingEnabled`) and the Music library question in
  `Info.plist`. The icon and launch screen come from `npx capacitor-assets
  generate --ios`, like Android's.
