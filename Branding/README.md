# MPTree Brand

The visual system for MPTree, shared by the Android app, the desktop app and the website.

**MPTree is black and white.** The identity is one mark, two grounds and a lot of space.
There is no brand colour. Anything coloured in the product is a functional signal, not
decoration.

Version 0.1.0, last updated 2026-07-26.

---

## 1. The master source

```
Branding/
├─ source/mptree-mark.svg     ← the ONLY hand-maintained artwork
├─ build-assets.mjs           ← regenerates everything below from it
├─ tokens/                    ← tokens.json, tokens.css
├─ logo/                      ← generated: vector + transparent PNG marks
├─ icon/                      ← generated: app icons, favicons
└─ brand-board.html           ← the visual reference sheet
```

`source/mptree-mark.svg` is the single point of truth. It is a clean vector with no
baked background, painted with `currentColor` so it inherits whatever colour it is placed in.

Everything in `logo/` and `icon/` is generated. Do not edit those files by hand, and do not
add new artwork alongside them. To change the mark, edit the master and re-run:

```bash
node Branding/build-assets.mjs
```

That guarantees Android, desktop and web can never drift apart.

## 2. The mark

A single continuous line drawn as an "MP3" ligature: an M and P form flowing into a
rounded 3. Thin stroke, geometric, rounded caps. It works as a logo and, on a black tile,
as the app icon.

**Rules**

* Use the master, or a generated export. Never redraw or trace it again.
* Monochrome only: solid black, or solid white. Never a gradient, tint or glow.
* Never rotate, stretch, outline, add a shadow, or place it inside a coloured shape.
* Clear space on all sides: one quarter of the mark's width.
* Minimum size: 20px in an interface, 16px for a favicon.
* On photography, place it on a solid black or white panel rather than directly on the image.

**Which file to reach for**

| Context | File |
| --- | --- |
| Anywhere that accepts SVG | `logo/mptree-mark-black.svg`, `logo/mptree-mark-white.svg` |
| Raster, dark ground | `logo/mptree-mark-white-{64…1024}.png` |
| Raster, light ground | `logo/mptree-mark-black-{64…1024}.png` |
| Android / desktop app icon | `icon/app-icon-{48…1024}.png` |
| Android adaptive, PWA maskable | `icon/app-icon-maskable-512.png` |
| Store listing on white | `icon/app-icon-light-512.png` |
| Website tab | `icon/favicon.svg` plus `favicon-{16,32,48}.png` |
| iOS home screen | `icon/apple-touch-icon-180.png` |

`favicon.svg` carries its own `prefers-color-scheme` rule, so it turns white on dark
browser chrome without a second file.

## 3. Colour

Black and white are the brand. Everything else is a neutral step between them.

| Role | Dark ground | Light ground |
| --- | --- | --- |
| Background | `#000000` | `#FFFFFF` |
| Raised surface | `#111111` | `#F5F5F5` |
| Card | `#141414` | `#EFEFEF` |
| Player | `#0C0C0C` | `#F9F9F9` |
| Hairline / border | `#2A2A2A` | `#D8D8D8` |
| Primary text | `#FFFFFF` | `#111111` |
| Secondary text | `#777777` | `#666666` |
| Accent (primary action) | `#FFFFFF` | `#000000` |

The accent inverts with the ground. On black the primary button is white with black type,
on white it is black with white type. That inversion is the whole system.

**State colours, functional only**

Three colours exist in the product. Each means exactly one thing. They are not brand
colours, they never appear in marketing, and nothing else may borrow them.

| Colour | Value | Means |
| --- | --- | --- |
| Rose | `#E8445A` | a track is liked |
| Sky | `#0EA5E9` | repeat is on |
| Violet | `#7C3AED` | shuffle is on, or rows are selected |

If a new state needs a signal, prefer weight, position or an icon before reaching for a
fourth colour.

## 4. Typography

Native system faces, so nothing is downloaded and text renders instantly on every platform.

* **Sans:** the platform UI face. Used for everything a person reads.
* **Mono:** the platform monospace. Used for labels, values, durations and file paths.

Set headings tight and heavy (`-0.04em` at display size). Set body at a comfortable
measure, roughly 65 characters. Give uppercase labels wide tracking (`0.16em`) and keep
them small. Use tabular figures wherever numbers line up, such as track durations.

Full scale in `tokens/tokens.json`.

## 5. Surfaces and motion

Rounded rectangles in three sizes: 10px for controls, 16px for cards, 22px for sheets and
the floating player. Hairline borders rather than shadows wherever possible. Depth comes
from the ground going darker, not from drop shadows.

Motion is short and eased: 150ms for a control, 250ms for a surface, 400ms for a sheet.
Nothing bounces. Honour `prefers-reduced-motion` on every surface.

## 6. Voice

MPTree speaks like a good player behaves: it gets out of the way.

* **Private by default.** "On your device. Nothing uploaded." Say it plainly, it is the point.
* **Say what happens.** A control names its action, and the result confirms it.
* **Quiet, not cold.** Warm and human, never chatty. Short sentences, no hype.
* **Precise over clever.** If a label needs a tooltip, rewrite the label.

Write "MPTree", one word, capital M, P and T. Never "MPtree", "MP Tree" or "MPlayer".

## 7. Using this system

Copy what you need into each surface. We are deliberately **not** publishing this as a
shared package yet, per the architecture principle in [CLAUDE.md](../CLAUDE.md): prefer
duplication until real duplication proves the need.

* Website and desktop: copy `tokens/tokens.css`, reference the generated assets.
* The Android app already implements these values in `MPTree-App/src/themes.ts`. It is
  intentionally untouched for now, and remains the reference implementation.

## 8. The Android app

The app was aligned to this system on 2026-07-26 and now implements it. Notes for anyone
changing it:

* The mark in the UI is `MPTree-App/src/components/Logo.tsx`, generated from the master and
  painted with `currentColor`. It replaced two PNGs totalling 2.2 MB.
* Android icons and splash screens are generated, not hand made. `build-assets.mjs` writes
  the sources into `MPTree-App/assets/`, then:

  ```bash
  cd MPTree-App && npx capacitor-assets generate --android
  ```

* Violet appears in the app **only** for shuffle state and selection. If you find it
  anywhere else, that is a regression.

## Known gaps

* No wordmark lockup yet. The wordmark is currently set in the platform sans. A drawn
  lockup can be added later if the website needs one.
* No social or OG images yet. Add them when the website needs them.
* The app id (`com.caelan.mplayer`), the `package.json` name and the version `0.0.0` are
  still the old naming. That is deliberate, see the deferral note in `docs/roadmap.md`.
