// Makes the pictures of the figure behind Lantern from Caelan's photo
// (Branding/lantern/figure-source.jpg): a man in the dark with green light on
// his shoulders. Blurred hard, so what is left is a vague shape and the light.
//
//   node MPTree-App/scripts/lantern-figure.mjs [outDir]
//
//   lantern-figure-body.webp   the figure, for the question ("Are you afraid?")
//   lantern-figure-glow.webp   only its green light, laid over it; the question
//                              makes it swell with the voice
//   lantern-ground-dark.webp   behind the list on a dark app
//   lantern-ground-light.webp  behind the list on a light app: a faint shadow
//                              with the green on it, fading out at the edges
//
// Written into MPTree-App/src/assets and Desktop/src/assets unless an outDir
// is given (then with previews, for looking at).
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(HERE, "..", "node_modules", "x.js"));
const sharp = require("sharp");

const SOURCE = join(HERE, "..", "..", "Branding", "lantern", "figure-source.jpg");
// The part of the photo with the figure in it, at the apps' 600:560.
const CROP = { left: 380, top: 0, width: 910, height: 850 };
const W = 900, H = 840;
const BLUR = 9;

const base = await sharp(SOURCE).extract(CROP).resize(W, H).blur(BLUR).toBuffer();

// Fades the picture out towards its edges, so no rectangle shows: an ellipse
// round the figure, a little higher than the middle.
const edge = (inner) => sharp(Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
  `<defs><radialGradient id="g" cx="0.5" cy="0.44" r="0.56"><stop offset="${inner}" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient></defs>` +
  `<rect width="${W}" height="${H}" fill="url(#g)"/></svg>`,
)).greyscale().raw().toBuffer();

/** The photo with an alpha channel: `alphaOf` says how opaque each pixel is,
 *  from its brightness (0..1) and how far in it is from the edge (0..1). */
async function withAlpha(rgb, alphaOf, inner = 0.55) {
  const { data, info } = await sharp(rgb).raw().toBuffer({ resolveWithObject: true });
  const ed = await edge(inner);
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0, p = 0; p < info.width * info.height; p++, i += info.channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    out[p * 4] = r; out[p * 4 + 1] = g; out[p * 4 + 2] = b;
    out[p * 4 + 3] = Math.round(255 * Math.max(0, Math.min(1, alphaOf(lum, ed[p] / 255, r, g, b))));
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } });
}

// The question is on black, so the figure can stay as it is there, fading out
// at the edges. The glow is the green of it alone: the brighter and greener a
// pixel, the more of it is kept.
const body = await withAlpha(base, (_l, e) => e, 0.6);
const glow = await withAlpha(base, (l, e, r, g, b) => e * Math.min(1, Math.max(0, (g - Math.max(r, b)) / 90) * 1.6), 0.6);
// On a dark app: the same, a little dimmer. On a light one the dark of the
// photo would be a grey cloud, so there only what has light in it shows: the
// green, the hair, the edges the light catches, as a faint shadow.
const groundDark = await withAlpha(await sharp(base).modulate({ brightness: 0.85 }).toBuffer(), (_l, e) => e, 0.5);
// The body itself is as black as the dark round it in the photo, so on a
// light app it is given its shape by a very soft outline laid where the
// figure stands: a faint grey mist of him. What has light in it (the green,
// the hair) keeps its colour, made bright where it is thin so it has no dark
// rim against the page.
const HALF = "M300 46C332 46 354 66 358 102C364 108 368 120 364 134C362 142 358 146 356 150" +
  "C352 174 344 190 334 200C338 214 340 228 350 240C374 250 402 256 434 265" +
  "C474 274 506 296 518 336C528 372 530 430 532 560L300 560Z";
const shape = await sharp(Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 600 560">` +
  // On black, so the blur softens the shape and not only its transparency.
  `<rect width="600" height="560" fill="#000"/>` +
  `<g transform="translate(300 60) scale(0.84 0.9) translate(-300 -46)"><path d="${HALF}" fill="#fff"/>` +
  `<path d="${HALF}" fill="#fff" transform="translate(600 0) scale(-1 1)"/></g></svg>`,
)).blur(34).greyscale().raw().toBuffer();
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const groundLight = await (async () => {
  const soft = await sharp(base).blur(12).raw().toBuffer({ resolveWithObject: true });
  const { data, info } = soft;
  const ed = await edge(0.6);
  const out = Buffer.alloc(W * H * 4);
  const MIST = [92, 96, 92];
  for (let p = 0, i = 0; p < W * H; p++, i += info.channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    // Graded, not cut off at some brightness: a cut leaves an edge.
    const lit = Math.min(1, Math.pow(Math.max(0, l - 0.015) / 0.22, 0.9));
    // Thin light, brightened to its own colour rather than left dark.
    const lift = Math.min(2.4, 0.34 / Math.max(l, 0.05));
    for (let c = 0; c < 3; c++) {
      const bright = Math.min(255, [r, g, b][c] * lift);
      out[p * 4 + c] = Math.round(MIST[c] + (bright - MIST[c]) * lit);
    }
    const a = (ed[p] / 255) * Math.min(1, (shape[p] / 255) * 0.24 + lit * 0.7);
    out[p * 4 + 3] = Math.round(255 * a);
  }
  return sharp(out, { raw: { width: W, height: H, channels: 4 } });
})();

const webp = img => img.webp({ quality: 86, alphaQuality: 90, smartSubsample: true }).toBuffer();
const files = {
  "lantern-figure-body.webp": await webp(body),
  "lantern-figure-glow.webp": await webp(glow),
  "lantern-ground-dark.webp": await webp(groundDark),
  "lantern-ground-light.webp": await webp(groundLight),
};

const outDirs = process.argv[2]
  ? [process.argv[2]]
  : [join(HERE, "..", "src", "assets"), join(HERE, "..", "..", "Desktop", "src", "assets")];
for (const dir of outDirs) {
  mkdirSync(dir, { recursive: true });
  for (const [name, buf] of Object.entries(files)) writeFileSync(join(dir, name), buf);
  if (process.argv[2]) {
    const on = (bg, layers) => sharp({ create: { width: W, height: H, channels: 4, background: bg } })
      .composite(layers.map(input => ({ input }))).png().toBuffer();
    writeFileSync(join(dir, "preview-question.png"), await on("#000", [files["lantern-figure-body.webp"], files["lantern-figure-glow.webp"]]));
    writeFileSync(join(dir, "preview-paper.png"), await on("#f3eee3", [files["lantern-ground-light.webp"]]));
    writeFileSync(join(dir, "preview-black.png"), await on("#000", [files["lantern-ground-dark.webp"]]));
  }
  console.log("wrote", dir, Object.entries(files).map(([n, b]) => `${n} ${Math.round(b.length / 1024)} kB`).join(", "));
}
