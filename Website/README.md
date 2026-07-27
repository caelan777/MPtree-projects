# MPTree Website

The official site and download hub. One landing page, plain HTML and CSS, no build
step and no dependencies.

```
Website/
├─ index.html          the whole page
├─ _headers            Cloudflare Pages caching and security headers
└─ assets/
   ├─ site.css         all styling
   ├─ site.js          scroll driven record, feedback form
   ├─ tokens.css       copied from Branding/tokens (do not edit here)
   ├─ img/             mark SVGs, vinyl.webp hero
   └─ icon/            favicons and apple touch icon
```

## Before it goes live

Three placeholders must be replaced. Search the folder for `PLACEHOLDER`:

| Placeholder | Where | Replace with |
| --- | --- | --- |
| `PLACEHOLDER_DOMAIN` | `index.html` canonical and og:url | the real domain once registered |
| `PLACEHOLDER_USER` | `index.html` download links | your GitHub username |
| `PLACEHOLDER_REPO` | `index.html` download links | the repository name |

The download buttons point at `/releases/latest` on GitHub, so once a release with an
APK attached exists the links resolve on their own and never need touching again.

## Local preview

No server required, just open `index.html`. To serve it properly:

```bash
npx serve Website
```

## Deploying to Cloudflare Pages

1. Push this repository to GitHub.
2. In the Cloudflare dashboard: Workers and Pages, Create, Pages, then connect the repo.
3. Build settings: framework preset **None**, build command **empty**, output directory
   **Website**.
4. Deploy. Every push to `main` republishes.

Attach a custom domain later under the project's Custom domains tab. Nothing in the page
needs rebuilding, only the two `PLACEHOLDER_DOMAIN` references.

## Notes

* The site is pinned to the dark ground with `data-theme="dark"` on `<html>`. That is
  deliberate: dark is MPTree's home and the hero photograph only reads there.
* `tokens.css` is a copy from `Branding/tokens/`, following the workspace rule of
  preferring duplication over shared packages. If brand tokens change, copy the file again.
* **The record is the hero background and turns as you scroll.** `site.js` maps scroll
  position to a `--rot` custom property at 0.18 degrees per pixel, batched into one
  animation frame per scroll burst, and skipped entirely when the reader prefers reduced
  motion. The copy sits over the record on purpose.
* **The source image must stay a centred, top-down record.** `vinyl.webp` is a full disc
  whose centre is the exact centre of the image, verified to within half a pixel. That is
  what makes it read as spinning on its spindle. An angled or off-centre crop rotates like
  a tumbling ball instead, which is exactly what the first attempt got wrong.
* **The white label does not rotate with the record.** A real one would, but the brand
  forbids rotating the mark, so the label is a separate concentric layer.

## Asset versioning, do not skip this

`_headers` tells Cloudflare to cache everything under `/assets/` as `immutable` for a year,
and the filenames are not content hashed. So the asset links in `index.html` carry a version
query, currently `?v=3`.

**Whenever you edit `site.css`, `site.js` or `vinyl.webp`, bump that number**, otherwise
returning visitors keep the old file for up to a year:

```bash
node -e "const f='Website/index.html',fs=require('fs');fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/\?v=\d+/g,'?v=4'))"
```
* **The phone mockup is HTML and CSS, not a screenshot.** The album art tiles use the app's
  real colour formula from `AlbumArt.tsx`: `hsl(hue, 45%, 28%)` fill,
  `hsl(hue, 45%, 38%)` border and `hsl(hue, 60%, 85%)` letter, where the hue is the sum of
  the title's character codes modulo 360. Each row carries its hue as `style="--h:103"`.
  Because it is built from tokens it can never show a stale or buggy build.
* **Feedback opens the reader's email app.** There is no backend, so `site.js` builds a
  `mailto:` link. The destination address sits at the top of that file as `FEEDBACK_TO`.
* The in-app browser is described neutrally as "add music from the web" and no source
  site is named, which keeps the copyright and hosting exposure low.

## Heads up about the feedback address

`FEEDBACK_TO` in `assets/site.js` is currently `caelanverycool@gmail.com`, and it will be
visible in the page source to anyone who looks, including address harvesters. If that
matters, swap it for a dedicated address such as `feedback@yourdomain`, or move to a form
service that hides the destination.

## Known gaps

* No social share image, so the page uses a plain summary card. Add `og:image` and switch
  `twitter:card` to `summary_large_image` when one exists.
* The hero photograph is a generated image. It is the loosest fit to a brand that forbids
  gradients and glows, so it is deliberately contained in a bordered panel rather than
  used full bleed.
