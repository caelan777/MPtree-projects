# The MPTree account

Part of MPTree Pro. Sign in with Google on up to three phones. Every phone
keeps its own library (playlists, likes, details, bin, look), saved in the
account per phone; nothing is merged. The songs are not saved, they go from
phone to phone so every phone has them all. Code: `MPTree-App/src/sync/` (model, engine, drive, rtc),
`src/components/AccountSheet.tsx`, and the native `AccountPlugin.java` and
`SyncPlugin.java`.

## Where things live

There is no MPTree server. The account is the app folder (`appDataFolder`) of
the person's own Google Drive, reached with the `drive.appdata` scope only.

| File | What |
|---|---|
| `devices.json` | The phones on the account, three at most |
| `lib-<phone>.json` | That phone's playlists, song details, bin, cut tracks, settings (songs by fingerprint) |
| `covers-<phone>.json` | That phone's cover pictures by hash |
| `prop-<to>-<from>.json` | Changes phone `<from>` made to `<to>`'s library, waiting for Accept or Decline |
| `inv-<phone>.json` | Which song files that phone has |
| `peer-<phone>.json` | "I am open now", and the WebRTC offer or answer |
| `relay-<to>-<fp>` | A song waiting for phone `<to>`; deleted once it arrives |

Songs go straight across over WebRTC when both phones have MPTree open (Google
STUN, no TURN). When that fails, or the other phone is closed, they wait in the
app folder, at most 1 GB per phone at a time, and a month at most. Wifi only
unless the person allows mobile data, and then 500 MB a day at most.

## Whose library

With two phones or more, chips under the header card pick the view:
**This phone**, each other phone by name, or **All**.

- Another phone's view loads its library into scoped storage keys
  (`mptree_*@<view>`, see `setLibraryScope` in storage.ts), so it never
  overwrites this phone's own. The song list is filtered to the songs that
  phone has.
- An edit there becomes a proposal (`applyEdit`). Everyone sees it at once,
  marked "Waiting for ... to accept". When MPTree opens on that phone it asks:
  Accept puts it in that phone's library, Decline deletes the proposal so it is
  gone everywhere. The sender gets a toast either way.
- **All** combines every library: likes together, playlists of the same name as
  one (`combine`). An edit there is split (`spread`): this phone's part is
  kept straight away, the other phones get proposals.
- Settings always switches back to This phone, so the bin, cleanup and backups
  only ever touch this phone.
- The account page can copy another phone's look or library onto this one.
  Phones taken off the account keep their library under "Phones that left",
  to put on this phone or delete.

## Rules for the awkward cases

- **Signing in** asks nothing: this phone's library goes up as its own.
- **Signing out** leaves the phone as it is, and can also delete the songs that
  came from other phones.
- **Voice notes, recordings, clips under a minute** (cleanup.ts) are never sent.
- **Deleted outside MPTree:** a file that disappears is not fetched back.
  "Get them back" on the account page undoes that.
- **Two versions of one song** (same title and artist, within 2 s) are not both
  fetched.
- **Room:** songs only come in while 500 MB stays free.
- **Conflicts:** only a phone itself writes its library; other phones can only
  propose. A proposal is laid over the library as it was when it was made
  (`overlay`), so later edits on the phone are kept.
- **Reinstalling** keeps the phone's id (ANDROID_ID). A phone of the same name
  unused for 30 days makes room by itself; same-model phones get "(2)".
- **Emptied in Drive** (Delete hidden app data): phones stop and say so,
  instead of filling it up again.
- The screen stays on while a song is moving.

## Google Cloud setup (once)

1. In Google Cloud Console, pick or create a project and enable the
   **Google Drive API**.
2. **Google Auth Platform, Branding:** app name MPTree, support email, home page
   `https://mp-tree.net`, privacy policy `https://mp-tree.net/privacy.html`.
   No logo, or Google wants to verify the brand first.
3. **Audience:** External. **Data access:** add `.../auth/drive.appdata`. It is a
   non-sensitive scope, so no scope verification.
4. **Clients:** two Android clients for package `com.caelan.mptree`:
   - the upload key, which signs the website APK and the test builds:
     SHA-1 `6C:11:FF:4B:37:73:21:75:50:F5:00:DA:F1:68:0B:6E:39:DE:3C:A8`
   - the Play app signing key: SHA-1 from Play Console, Test and release,
     App integrity, App signing.
5. **Audience, Publish app.** While it is in Testing, only listed test users can
   sign in, and their access runs out after 7 days.

No client id goes into the app: Google Play services matches the app by package
name and signing certificate.

## Testing on the dev server

`localStorage.mptree_dev_account = "1"` switches on a stand-in account whose
"Drive" lives in the dev server's memory (`vite.config.ts`). Open
`http://localhost:5174` and `http://phone-b.localhost:5174` to play two phones.
Songs do not move in the browser; only the account does.
`window.__mptreeSync.run()` runs a round by hand.
