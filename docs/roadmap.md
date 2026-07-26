# MPTree Roadmap

_Last updated: 2026-07-26_

## Vision

A small family of MPTree apps that share a brand and a feel:

- **Android app** — exists today
- **Desktop app** — planned (Tauri)
- **Official website** — planned; also the download & update hub
- **Shared branding** across every surface
- **Modern UI**, **fast performance**, **easy updates**

## Decisions locked in

| Decision | Choice | Why |
|---|---|---|
| Desktop technology | **Tauri** | Reuse the React UI; tiny, fast binaries; low memory |
| Distribution & updates | **Direct download + OTA** | Distribute the APK from our own site; push JS updates over-the-air (e.g. Capgo). Avoids Google Play content-policy risk from the MP3 downloader |
| Sequencing | **Branding + website before desktop** | Fastest visible win; the site becomes the distribution hub for everything else |
| Architecture | **Keep it simple — no shared packages yet** | Prefer duplication over premature abstraction |

## Guiding principle: simple first, share later

We are **not** building shared packages, a monorepo, or `@mptree/*` libraries yet.
Each surface is built as its own standalone project. If the website or desktop prototype
needs a brand token or a component from the Android app, we **copy it** for now.

We introduce shared modules **only when real duplication proves the need** — the natural
moment is *after* both the Android app and a basic desktop prototype exist and we can see
exactly what genuinely overlaps. Extracting shared code is a deliberate later phase, not a
starting assumption.

---

## Near-term plan (in order)

### Phase 1 — Repository cleanup · size: S

Get the workspace into a clean, version-controlled state.

- Put the workspace under **Git** and push to a remote (it isn't a repo yet).
- Remove leftover cruft: the empty `Branding/` / `Website/` / `Desktop/` placeholders stay
  (they'll be filled), but fix the stray top-level `README.md` **directory**, and add a
  proper workspace `.gitignore`.
- Unify naming: pick **MPTree** everywhere (`mplayer` / `MPlayer1` legacy strings,
  `package.json` name + real version number).
- Small in-app tidy-ups: dedupe `Session`/`SessionState` and `SongMeta`/`SongMetaStore`
  types, remove the duplicate viewport-measuring effect, drop the stale Home-Assistant
  comment in `capacitor.config.ts`.

**Exit:** clean repo on a remote, one tagged build of the current Android app, consistent naming.

### Phase 2 — Project documentation · size: S

- `CLAUDE.md` (workspace overview) ✅ and this `docs/roadmap.md` ✅.
- A real **README** for `MPTree-App/` (replace the default Vite template) describing what
  the app is, how to build/run, and the native-service architecture.
- Short "how playback works" note capturing the native-source-of-truth model.

**Exit:** a newcomer can understand and build the Android app from the docs alone.

### Phase 3 — MPTree brand · size: M

Fills `Branding/`.

- Finalize the palette (evolve the existing `themes.ts` DARK/LIGHT tokens), typography,
  spacing, iconography, and motion feel.
- Logo suite: app icon, wordmark, favicon, social/OG images.
- A one-page brand guide as the "modern UI" north star (voice, do/don't, component look).
- Delivered as plain assets + a tokens file (JSON/CSS vars). **Not** a shared npm package —
  surfaces copy what they need for now.

**Exit:** a documented brand the website and (later) desktop can adopt by copying tokens.

### Phase 4 — Official website · size: M

Fills `Website/`. The public face and download/update hub.

- Marketing site styled from the brand: features, screenshots, **APK download + release
  notes**, install instructions.
- Serves the direct-download builds and acts as the update/announcement channel.
- Continuous deploy (Vercel / Netlify / Cloudflare Pages).
- _Stretch:_ an installable **PWA demo player** in-browser — a live demo that also
  sanity-checks a web-audio path before desktop.

**Exit:** public site on a custom domain; a visitor can find → download → install the app.

> ⚠️ The built-in MP3 downloader (`mp3-juices.nu`) has copyright/policy implications.
> Fine for a personal sideloaded app; be deliberate about how prominently the public site
> features it — it affects hosting and legal exposure. Decide before launch.

### Phase 5 — Desktop prototype (Tauri) · size: L

A **prototype**, not a finished product — the goal is to prove the approach and reveal
what actually overlaps with Android.

- Minimal Tauri shell with a basic MPTree UI (rebuild/adapt from the Android UI by hand;
  copy, don't abstract).
- **Rust audio spike** implementing core playback (play/pause/seek/queue) — e.g. `rodio`
  + `symphonia`. Prove EQ / crossfade / gapless are feasible before committing.
- Local-folder library scan; media keys.

**Exit:** a Windows build that scans a folder and plays music with core controls. After
this we can honestly assess what (if anything) is worth extracting into shared modules.

---

## Later (deferred until justified)

These are explicitly **not** now. Revisit once Phases 1–5 are done and the need is concrete.

- **Shared extraction** — only if the website/desktop duplication becomes painful: brand
  tokens → a shared source, common UI → a package, a `PlayerEngine` interface with
  per-platform adapters, and a monorepo if the tooling pays for itself.
- **OTA / auto-update infrastructure** — Android OTA (Capgo) and the Tauri auto-updater,
  wired to the website.
- **Cross-platform feature parity**, a dedicated **modern-UI pass**, and a **performance
  pass** (profiling cold-start and large-library scroll on each platform).
- Test coverage and CI beyond the basics.

---

## Vision → phase map

| Vision item | Delivered in |
|---|---|
| Android app | exists; cleaned up in Phase 1–2 |
| Shared branding | Phase 3 (copied, not packaged, for now) |
| Official website | Phase 4 |
| Desktop app | Phase 5 (prototype), hardened later |
| Modern UI | Phase 3 sets the standard; applied through Phase 4–5 + a later pass |
| Fast performance | Tauri + existing virtualization; dedicated pass later |
| Easy updates | Website as hub (Phase 4); OTA/auto-update infra later |

## Key risks

- **Desktop audio parity in Rust** (EQ, crossfade, playback speed, gapless) is the hardest
  technical unknown — de-risk with the Phase 5 spike before over-investing.
- **MP3-downloader policy/legal exposure** once the app is publicly distributed via the site.
- **Resisting premature abstraction** — the temptation to build shared packages early is
  exactly what this roadmap defers on purpose.
