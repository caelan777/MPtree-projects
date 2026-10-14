# MPTree in the Microsoft Store

The Store build is the same app as the installer on mp-tree.net, with two
differences: it is packed as an MSIX, which the Store signs (so Windows shows no
"unknown publisher" warning), and it does not tell people about new versions on the
website, because the Store updates it itself (`__DISTRIBUTION__ === "store"`). The
installer on the website stays as it is, unsigned, for people who cannot use the
Store.

The listing text, the age rating answers and the reason for `runFullTrust` are in
[docs/microsoft-store-listing.md](../../docs/microsoft-store-listing.md).

## Once: the account and the name (Caelan)

1. Create the developer account at storedeveloper.microsoft.com. It is free for an
   individual; Microsoft checks an ID and a selfie.
2. In Partner Center: Apps and games, New product, MSIX or PWA app, and reserve the
   name **MPTree**.
3. Product management, Product identity. Copy three values into
   `store/identity.json`:
   - `Package/Identity/Name` into `name`
   - `Package/Identity/Publisher` (starts with `CN=`) into `publisher`
   - `Package/Properties/PublisherDisplayName` into `publisherDisplayName`

## Every version

1. Bump the version as for the website installer (`package.json`,
   `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`).
2. Build it, from `Desktop/`, with the Buy button off while the shop is closed:

   ```bash
   export PATH="$HOME/.cargo/bin:$PATH"; export CARGO_BUILD_JOBS=1
   VITE_CHECKOUT_URL="" npm run app:build:store
   ```

   This builds the app with `--mode store` and then runs `scripts/msix.mjs`, which
   writes `src-tauri/target/msix/MPTree-<version>.msix`. The installer for the
   website is a separate build (`npm run app:build`): the two exe files differ.
3. In Partner Center, start a submission, upload the `.msix` under Packages, and
   send it in. Certification takes from a few hours to a few days.

## Trying the package on this PC first

Developer Mode is on, so the package folder can be installed without signing:

```powershell
node scripts/msix.mjs --layout
Add-AppxPackage -Register src-tauri\target\msix\layout\AppxManifest.xml
```

MPTree then appears in Start as an app of its own. Where it keeps its data depends
on what was there before. On a PC that never had the installer, Windows gives the
package a folder of its own. On a PC that has (or had) the installer, the folders
`%LOCALAPPDATA%\net.mp-tree.desktop` and `%APPDATA%\net.mp-tree.desktop` already
exist, and Windows lets the package use them as they are: it opens with the same
library, account and device as the installed app. That is also what someone moving
from the website version to the Store version gets, which is what they would want.
So trying the package on this PC is trying it on the real profile: no destructive
tests. Remove it afterwards with:

```powershell
Get-AppxPackage CaelanVerkuijl.MPTree | Remove-AppxPackage
```
