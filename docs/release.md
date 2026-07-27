# Releasing MPTree for Android

The release pipeline works. This is the repeatable version of it.

## Signing key

Release builds are signed with `android/mptree-release.jks`, configured through
`android/keystore.properties`. Both are gitignored and must never be committed.

**Certificate fingerprints for the current key.** Every future release must match these.
If a build ever shows different fingerprints, it was signed with the wrong key and must
not be published, because it cannot upgrade existing installs.

```
CN         MPTree, O=Caelan Verkuijl, L=Utrecht, C=NL
SHA-256    d7:82:de:08:2f:bf:d8:8a:91:89:ac:93:6f:34:67:17:1f:02:ed:68:9c:80:86:ea:4d:90:49:04:8c:5d:c9:bd
SHA-1      6c:11:ff:4b:37:73:21:75:50:f5:00:da:f1:68:0b:6e:39:de:3c:a8
Algorithm  RSA 2048
```

Losing this keystore means never being able to update anyone who installed MPTree. Keep at
least three copies in different places, with the passwords stored separately from the file.

## Build a release

```bash
cd MPTree-App
npm run build
npx cap sync android
cd android
./gradlew assembleRelease
```

The APK lands at `android/app/build/outputs/apk/release/app-release.apk`.

Order matters. `npm run build` then `npx cap sync android` copies the current web build into
the Android project. Running `assembleRelease` without those two first produces an APK with
stale web assets, which looks like the app ignoring your latest changes.

Gradle needs JDK 11 or newer. `android/gradle.properties` points `org.gradle.java.home` at
the JDK bundled with Android Studio, because the system `java` is 8 and fails.

## Verify before publishing

```bash
"$HOME/AppData/Local/Android/Sdk/build-tools/37.0.0/apksigner.bat" verify --print-certs --verbose MPTree-App/android/app/build/outputs/apk/release/app-release.apk
```

Check that it prints `Verifies`, that there is exactly one signer, and that the SHA-256
digest matches the fingerprint above.

`Verified using v1 scheme: false` is expected and fine. `minSdkVersion` is 24 (Android 7.0)
and the v2 signature scheme covers API 24 and up.

## Version numbers

Two values must be kept in step, both in `android/app/build.gradle`:

* `versionName` is what people see. Keep it equal to `version` in `package.json`.
* `versionCode` is an integer that **must increase for every release you hand out**.
  Android refuses to install an update whose `versionCode` is not higher than the installed
  one. This is the most common release mistake.

Current: `versionName "0.1.0"`, `versionCode 1`.

## Publishing

Attach the APK to a GitHub release. The website's download buttons point at
`/releases/latest`, so they resolve on their own once a release exists and never need
editing again.

## Note on the app id change

The app id moved from `com.caelan.mplayer` to `com.caelan.mptree` before the first public
release. Android treats a different app id as a different app, so anyone running an older
build gets MPTree installed alongside it rather than upgraded, and the new install starts
with an empty library.

That is why the rename happened before publishing rather than after. To carry data across,
export a backup from the old app and restore it in the new one.
