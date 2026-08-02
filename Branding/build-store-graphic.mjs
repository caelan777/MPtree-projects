/**
 * MPTree Play Store feature graphic builder.
 *
 * Generates the 1024x500 feature graphic Google Play shows at the top of the
 * store listing. Monochrome, built from the same master mark as everything
 * else, so the identity does not drift.
 *
 *   node Branding/build-store-graphic.mjs      (run from the workspace root)
 *
 * Requires sharp, which lives in MPTree-App/node_modules.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(HERE, "..", "MPTree-App", "node_modules", "x.js"));
const sharp = require("sharp");

// Pull the single path out of the master mark so this never drifts from the app.
const master = readFileSync(join(HERE, "source", "mptree-mark.svg"), "utf8");
const markPath = master.match(/<path[^>]*d="([^"]+)"/)[1];

const W = 1024;
const H = 500;

// Mark sits left, scaled from its native 1000x1000 box. 210px tall, centred.
const markSize = 210;
const markScale = markSize / 1000;
const markX = 96;
const markY = (H - markSize) / 2;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#000000"/>
  <g transform="translate(${markX} ${markY}) scale(${markScale})">
    <path fill="#FFFFFF" fill-rule="evenodd" d="${markPath}"/>
  </g>
  <text x="360" y="238" fill="#FFFFFF"
        font-family="Segoe UI, Arial, sans-serif" font-size="92" font-weight="800"
        letter-spacing="-3">MPTree</text>
  <text x="363" y="292" fill="#9A9A9A"
        font-family="Segoe UI, Arial, sans-serif" font-size="30" font-weight="500">Your music. On your device.</text>
  <text x="363" y="336" fill="#6A6A6A"
        font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="400">Offline. Private. Free.</text>
</svg>`;

const OUT = join(HERE, "store");
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "feature-graphic-1024x500.svg"), svg);

await sharp(Buffer.from(svg))
  .png()
  .toFile(join(OUT, "feature-graphic-1024x500.png"));

console.log("Wrote Branding/store/feature-graphic-1024x500.png (and .svg source)");
