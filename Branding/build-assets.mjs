/**
 * MPTree asset builder.
 *
 * Single source of truth: source/mptree-mark.svg
 * Every exported logo, app icon and favicon in this folder is generated from it,
 * so the identity can never drift between Android, desktop and the website.
 *
 *   node Branding/build-assets.mjs        (run from the workspace root)
 *
 * Requires sharp, which is already present in MPTree-App/node_modules.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(HERE, "..", "MPTree-App", "node_modules", "x.js"));
const sharp = require("sharp");

const BLACK = "#000000";
const WHITE = "#FFFFFF";

const MASTER = join(HERE, "source", "mptree-mark.svg");
const master = readFileSync(MASTER, "utf8");

const dir = p => { mkdirSync(p, { recursive: true }); return p; };
const LOGO = dir(join(HERE, "logo"));
const ICON = dir(join(HERE, "icon"));

/** The master paints with currentColor; swap in a literal for standalone files. */
const inked = color => master.replace(/currentColor/g, color);

/** Render the bare mark, transparent background, mark scaled to fill `size`. */
const markPng = (color, size) =>
  sharp(Buffer.from(inked(color)), { density: 600 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();

/** Render an app icon: solid ground, mark inset to `pad` of the canvas. */
async function appIcon(size, ground, ink) {
  const inner = Math.round(size * 0.62);
  const mark = await markPng(ink, inner);
  const off = Math.round((size - inner) / 2);
  return sharp({ create: { width: size, height: size, channels: 4, background: ground } })
    .composite([{ input: mark, left: off, top: off }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

const OPAQUE_BLACK = { r: 0, g: 0, b: 0, alpha: 1 };
const OPAQUE_WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

const written = [];
const put = (path, buf) => { writeFileSync(path, buf); written.push([path.replace(HERE, "Branding"), buf.length]); };

// ── Standalone vector logos ────────────────────────────────────────────────
put(join(LOGO, "mptree-mark-black.svg"), Buffer.from(inked(BLACK)));
put(join(LOGO, "mptree-mark-white.svg"), Buffer.from(inked(WHITE)));

// ── Transparent PNG marks, for surfaces that cannot take SVG ───────────────
for (const size of [64, 128, 256, 512, 1024]) {
  put(join(LOGO, `mptree-mark-black-${size}.png`), await markPng(BLACK, size));
  put(join(LOGO, `mptree-mark-white-${size}.png`), await markPng(WHITE, size));
}

// ── App icons: white mark on black, the app's own identity ─────────────────
for (const size of [48, 72, 96, 128, 192, 256, 512, 1024]) {
  put(join(ICON, `app-icon-${size}.png`), await appIcon(size, OPAQUE_BLACK, WHITE));
}
// Inverse, for light contexts such as store listings on white
put(join(ICON, "app-icon-light-512.png"), await appIcon(512, OPAQUE_WHITE, BLACK));

// Maskable icon for Android adaptive / PWA: same ground, safer 46% inset
{
  const size = 512, inner = Math.round(size * 0.46);
  const mark = await markPng(WHITE, inner);
  const off = Math.round((size - inner) / 2);
  put(join(ICON, "app-icon-maskable-512.png"), await sharp({
    create: { width: size, height: size, channels: 4, background: OPAQUE_BLACK },
  }).composite([{ input: mark, left: off, top: off }]).png({ compressionLevel: 9 }).toBuffer());
}

// ── Favicons ───────────────────────────────────────────────────────────────
// Theme-aware vector favicon: black mark on light chrome, white on dark chrome.
const faviconSvg = master
  .replace('fill="currentColor"', 'fill="#000000" class="mark"')
  .replace("</svg>", `  <style>
    @media (prefers-color-scheme: dark) { .mark { fill: #FFFFFF; } }
  </style>
</svg>`);
put(join(ICON, "favicon.svg"), Buffer.from(faviconSvg));

for (const size of [16, 32, 48]) {
  put(join(ICON, `favicon-${size}.png`), await appIcon(size, OPAQUE_BLACK, WHITE));
}
put(join(ICON, "apple-touch-icon-180.png"), await appIcon(180, OPAQUE_BLACK, WHITE));

// ── Source assets for the Android app ──────────────────────────────────────
// These feed @capacitor/assets, which expands them into every density.
// After running this script:  cd MPTree-App && npx capacitor-assets generate --android
const APP = join(HERE, "..", "MPTree-App", "assets");
mkdirSync(APP, { recursive: true });

const appPut = (name, buf) => {
  writeFileSync(join(APP, name), buf);
  written.push([join("MPTree-App", "assets", name), buf.length]);
};

// Launcher icon: white mark on black, matching the app's home ground.
appPut("icon.png", await appIcon(1024, OPAQUE_BLACK, WHITE));

// Adaptive icon. The foreground MUST keep its alpha, otherwise it hides the
// background layer entirely, which is how the old icon ended up white.
// Android crops adaptive icons hard, so the mark sits at 40% of the canvas.
{
  const size = 1024, inner = Math.round(size * 0.40);
  const mark = await markPng(WHITE, inner);
  const off = Math.round((size - inner) / 2);
  appPut("icon-foreground.png", await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{ input: mark, left: off, top: off }]).png({ compressionLevel: 9 }).toBuffer());

  appPut("icon-background.png", await sharp({
    create: { width: size, height: size, channels: 4, background: OPAQUE_BLACK },
  }).png({ compressionLevel: 9 }).toBuffer());
}

// Splash screens. The canvas is square and gets centre-cropped on every device,
// so the mark stays small and central.
async function splash(ground, ink) {
  const size = 2732, inner = Math.round(size * 0.16);
  const mark = await markPng(ink, inner);
  const off = Math.round((size - inner) / 2);
  return sharp({ create: { width: size, height: size, channels: 4, background: ground } })
    .composite([{ input: mark, left: off, top: off }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}
appPut("splash.png", await splash(OPAQUE_WHITE, BLACK));
appPut("splash-dark.png", await splash(OPAQUE_BLACK, WHITE));

// ── Report ─────────────────────────────────────────────────────────────────
const pad = Math.max(...written.map(([p]) => p.length));
for (const [p, bytes] of written) console.log(p.padEnd(pad), (bytes / 1024).toFixed(1).padStart(7), "KB");
console.log(`\n${written.length} files generated from source/mptree-mark.svg`);
