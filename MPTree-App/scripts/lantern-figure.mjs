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

// The question shows him sharp, on black, fading out at the edges. Only a
// touch of blur, to smooth the blocks of the JPEG. The glow is the green of
// him alone (the brighter and greener a pixel, the more of it is kept), with
// a bloom round it, so it can be laid over him and swell with the voice.
const clear = await sharp(SOURCE).extract(CROP).resize(W, H).blur(0.5).toBuffer();
const body = await withAlpha(clear, (_l, e) => e, 0.62);
const green = (l, e, r, g, b) => e * Math.min(1, Math.max(0, (g - Math.max(r, b)) / 90) * 1.6);
const glowLines = await (await withAlpha(clear, green, 0.62)).png().toBuffer();
const glow = sharp(await sharp(glowLines).blur(18).png().toBuffer())
  .composite([{ input: glowLines, blend: "screen" }]);
// On a dark app: the same, a little dimmer. On a light one the dark of the
// photo would be a grey cloud, so there only what has light in it shows: the
// green, the hair, the edges the light catches, as a faint shadow.
const groundDark = await withAlpha(await sharp(base).modulate({ brightness: 0.85 }).toBuffer(), (_l, e) => e, 0.5);
// On a light app: the photo itself, faint, as if seen through the page.
// Caelan's own mock-up of the screen was exactly this. It fades out in the
// shape of the figure, not of a circle: a circle left a grey disc round him,
// since the dark behind him in the photo is as dark as he is.
const HALF = "M300 46C332 46 354 66 358 102C364 108 368 120 364 134C362 142 358 146 356 150" +
  "C352 174 344 190 334 200C338 214 340 228 350 240C374 250 402 256 434 265" +
  "C474 274 506 296 518 336C528 372 530 430 532 560L300 560Z";
const bust = await sharp(Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 600 560">` +
  `<rect width="600" height="560" fill="#000"/>` +
  `<g transform="translate(300 40) scale(0.95 0.95) translate(-300 -46)"><path d="${HALF}" fill="#fff"/>` +
  `<path d="${HALF}" fill="#fff" transform="translate(600 0) scale(-1 1)"/></g></svg>`,
)).blur(40).greyscale().raw().toBuffer();
// A little sharper than the question, so the cords of the suit show faintly.
const sharper = await sharp(SOURCE).extract(CROP).resize(W, H).blur(5).toBuffer();
// Gone by the chest: below the shoulders he fades into the page.
const down = y => 1 - Math.max(0, Math.min(1, (y / H - 0.52) / 0.3));
let at = 0;
const groundLight = await withAlpha(sharper, (_l, e) => {
  const y = Math.floor(at / W);
  return e * (bust[at++] / 255) * down(y) * 0.36;
}, 0.75);

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
