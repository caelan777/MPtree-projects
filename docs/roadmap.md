# MPTree Roadmap

_Last updated: 2026-07-26_

## Vision

A small family of MPTree apps that share a brand and a feel:

- **Android app**: exists today
- **Desktop app**: planned (Tauri)
- **Official website**: planned; also the download & update hub
- **Shared branding** across every surface
- **Modern UI**, **fast performance**, **easy updates**

## Decisions locked in

| Decision | Choice | Why |
|---|---|---|
| Desktop technology | **Tauri** | Reuse the React UI; tiny, fast binaries; low memory |
| Distribution & updates | **Direct download + OTA** | Distribute the APK from our own site; push JS updates over-the-air (e.g. Capgo). Avoids Google Play content-policy risk from the MP3 downloader |
| Sequencing | **Branding + website before desktop** | Fastest visible win; the site becomes the distribution hub for everything else |
| Architecture | **Keep it simple, no shared packages yet** | Prefer duplication over premature abstraction |

## Guiding principle: simple first, share later

We are **not** building shared packages, a monorepo, or `@mptree/*` libraries yet.
Each surface is built as its own standalone project. If the website or desktop prototype
needs a brand token or a component from the Android app, we **copy it** for now.

We introduce shared modules **only when real duplication proves the need**. The natural
moment is *after* both the Android app and a basic desktop prototype exist and we can see
exactly what genuinely overlaps. Extracting shared code is a deliberate later phase, not a
starting assumption.

---

## Near-term plan (in order)

### Phase 1. Repository cleanup · size: S

The workspace is already a **Git repository connected to GitHub** (branch `main`), so this
phase is about cleaning up the repo's *contents*, not setting up version control.

- Remove leftover cruft: the empty `Branding/` / `Website/` / `Desktop/` placeholders stay
  (they'll be filled), but fix the stray top-level `README.md` **directory** (a confirmed
  empty directory that should be an actual file or removed), and ensure a sensible
  workspace `.gitignore` is in place.
- Small in-app tidy-ups: dedupe `Session`/`SessionState` and `SongMeta`/`SongMetaStore`
  types, remove the duplicate viewport-measuring effect, drop the stale Home-Assistant
  comment in `capacitor.config.ts`.

> **Naming unification is deferred.** Renaming the `mplayer` / `MPlayer1` / `MPTree` strings,
> the `package.json` name, and the `com.caelan.mplayer` app id is **postponed until we
> prepare the first public release**. Changing the app id in particular is disruptive
> (it's a new install/identity on device), so it's cheapest to do once, at release prep.

**Status:** README, workspace docs, and the stray `README.md` directory are done. The empty
placeholder folders remain by design. Remaining tidy-ups are optional and can happen anytime.

### Phase 2. Project documentation · size: S

- `CLAUDE.md` (workspace overview) ✅ and this `docs/roadmap.md` ✅.
- A real **README** for `MPTree-App/` (replace the default Vite template) describing what
  the app is, how to build/run, and the native-service architecture.
- Short "how playback works" note capturing the native-source-of-truth model.

**Exit:** a newcomer can understand and build the Android app from the docs alone.

### Phase 3. MPTree brand · size: M · done

Fills `Branding/`.

**Direction: MPTree is black and white.** There is no brand colour. The accent is whichever
of black or white is not the background, and that inversion is the whole system. The three
colours in the product (rose, sky, violet) are functional UI signals only, never brand or
decoration.

- ✅ Single master artwork at `Branding/source/mptree-mark.svg`, a clean vector with no
  baked background, painted with `currentColor`.
- ✅ `Branding/build-assets.mjs` generates every logo, app icon and favicon from that master,
  so the surfaces cannot drift apart. 27 files in `Branding/logo/` and `Branding/icon/`.
- ✅ Tokens as plain data in `Branding/tokens/` (`tokens.json`, `tokens.css`), mirroring
  `themes.ts` so the app stays the reference. **Not** a shared npm package. Surfaces copy
  what they need for now.
- ✅ Brand guide in `Branding/README.md` and a visual reference sheet at
  `Branding/brand-board.html`.
- Not done: a drawn wordmark lockup (currently set in the platform sans), and social/OG
  images. Both can wait until the website needs them.

**Exit:** ✅ a documented brand the website and (later) desktop can adopt by copying tokens.

#### Phase 3b. Aligning the Android app · done

The app was reviewed against the brand system and brought in line on 2026-07-26.

Defects fixed: the dark splash showed a white tile (the alpha-less source baked in); the
adaptive launcher icon had an opaque white foreground, so it rendered inverted; the favicon
was a different logo entirely; `icons/icon-*.webp` were PNG data with no alpha;
`manifest.webmanifest` pointed outside `public/` and had no name, colours or display mode;
the page title was `mplayer`.

Brand alignment: the four smart playlist cards were coloured gradients across five hues and
are now plain surfaces distinguished by their icon; violet was being used as the primary
action colour and is now restricted to shuffle state and selection, with primary actions
using the accent inversion; the loading screen is monochrome; eight off-palette Tailwind
colours are gone.

Also: the 2.2 MB of logo PNGs were replaced by a vector component, cutting `dist` from
2.7 MB to 0.54 MB, and the user-facing `MPlayer1` backup labels became `MPTree`. Verified
with `tsc`, `eslint` (no new problems against baseline), `vite build` and `cap sync`.

### Phase 4. Official website · size: M · built, not yet deployed

Fills `Website/`. The public face and download hub.

**Decisions:** one landing page, plain HTML and CSS (no build step, no dependencies),
hosted on **Cloudflare Pages**, downloads served from **GitHub Releases** so the binary
never touches the web host.

- ✅ Single landing page: hero, six features, interface section, privacy, download, footer.
- ✅ Styled entirely from `tokens.css`, copied from `Branding/tokens` rather than shared.
- ✅ Pinned to the dark ground on purpose (`data-theme="dark"`), since dark is MPTree's
  home and the hero photograph only reads there.
- ✅ Hero is a generated monochrome vinyl macro in a contained bordered panel, slowly
  rotating in CSS with `prefers-reduced-motion` honoured. 108 KB WebP.
- ✅ The interface section is a **CSS mockup built from the real tokens**, not screenshots,
  so it cannot show a stale or buggy build.
- ✅ The in-app browser is described neutrally ("add music from the web") with no source
  site named, keeping copyright and hosting exposure low.
- ✅ The record is the hero background and spins on its spindle as the page scrolls. The
  source image must stay a centred top-down record, verified centred to within half a
  pixel. An angled crop rotates like a tumbling ball, which is what the first attempt got
  wrong.
- ✅ Feedback block that opens the reader's email app, since a static site has no backend.
- ✅ Windows download button showing "Coming soon".
- Not done: register a domain, replace the `PLACEHOLDER` values, connect Cloudflare Pages,
  attach an APK to a GitHub release. No social share image yet.

**Exit:** ✅ **MPTree is publicly launched (2026-07-27).** The site is live at
`https://mptree-projects.pages.dev`, and a visitor can find, download and install the app.
The only remaining Phase 4 item is attaching a custom domain (see 4c).

### Phase 4b. First public release prep · size: M · done

Going live triggered the naming decision deferred in phase 1, plus a few things with no
workaround. All done on 2026-07-27:

- ✅ **Naming unified.** App id is `com.caelan.mptree`, package name `mptree`, version
  `0.1.0`, consistent across the Java package, Capacitor config and Android strings.
- ✅ **A signed release APK.** Keystore created and backed up, signing wired through a
  gitignored `keystore.properties`, verified V2-signed. Fingerprints recorded in
  `docs/release.md`.
- ✅ **Published.** GitHub release `v0.1.0-beta` with the APK, repo made public so assets
  download anonymously, verified end to end (200, correct size, attachment).
- ✅ **Deployed.** Cloudflare Pages from the `Website/` directory, auto-deploying on push.
- ✅ Download buttons stream the APK directly via `/releases/latest/download/MPTree.apk`
  (see the stable-asset requirement in `docs/release.md`).

### Phase 4c. Custom domain · not started

- Buy a domain, add it under Cloudflare Pages → Custom domains, point DNS as instructed.
- Then replace the three `https://mp-tree.net` values in `Website/index.html` (canonical +
  og:url) and redeploy. No rebuild, no other changes.

> ⚠️ The built-in MP3 downloader (`mp3-juices.nu`) has copyright/policy implications.
> Fine for a personal sideloaded app; be deliberate about how prominently the public site
> features it. It affects hosting and legal exposure. Decide before launch.

### Phase 5. Desktop prototype (Tauri) · size: L

A **prototype**, not a finished product. The goal is to prove the approach and reveal
what actually overlaps with Android.

- Minimal Tauri shell with a basic MPTree UI (rebuild/adapt from the Android UI by hand;
  copy, don't abstract).
- **Rust audio spike** implementing core playback (play/pause/seek/queue), e.g. `rodio`
  + `symphonia`. Prove EQ / crossfade / gapless are feasible before committing.
- Local-folder library scan; media keys.

**Exit:** a Windows build that scans a folder and plays music with core controls. After
this we can honestly assess what (if anything) is worth extracting into shared modules.

---

## Later (deferred until justified)

These are explicitly **not** now. Revisit once Phases 1 to 5 are done and the need is concrete.

- **Shared extraction**: only if the website/desktop duplication becomes painful: brand
  tokens → a shared source, common UI → a package, a `PlayerEngine` interface with
  per-platform adapters, and a monorepo if the tooling pays for itself.
- **OTA / auto-update infrastructure**: Android OTA (Capgo) and the Tauri auto-updater,
  wired to the website.
- **Cross-platform feature parity**, a dedicated **modern-UI pass**, and a **performance
  pass** (profiling cold-start and large-library scroll on each platform).
- Test coverage and CI beyond the basics.

---

## Vision → phase map

| Vision item | Delivered in |
|---|---|
| Android app | exists; cleaned up in Phases 1 and 2 |
| Shared branding | Phase 3 (copied, not packaged, for now) |
| Official website | Phase 4 |
| Desktop app | Phase 5 (prototype), hardened later |
| Modern UI | Phase 3 sets the standard; applied through Phases 4 and 5 + a later pass |
| Fast performance | Tauri + existing virtualization; dedicated pass later |
| Easy updates | Website as hub (Phase 4); OTA/auto-update infra later |

## Key risks

- **Desktop audio parity in Rust** (EQ, crossfade, playback speed, gapless) is the hardest
  technical unknown. De-risk with the Phase 5 spike before over-investing.
- **MP3-downloader policy/legal exposure** once the app is publicly distributed via the site.
- **Resisting premature abstraction**: the temptation to build shared packages early is
  exactly what this roadmap defers on purpose.
