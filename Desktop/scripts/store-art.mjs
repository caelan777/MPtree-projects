// The two logo pictures for the Microsoft Store listing: 9:16 poster art and
// 1:1 box art. The white mark on black, as on the app icon.
//
//   node Desktop/scripts/store-art.mjs
//
// Writes Desktop/store/art/poster-1440x2160.png and box-2160x2160.png.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const require = createRequire(join(ROOT, "MPTree-App", "node_modules", "x.js"));
const sharp = require("sharp");
const OUT = join(HERE, "..", "store", "art");
mkdirSync(OUT, { recursive: true });

const mark = readFileSync(join(ROOT, "Branding", "source", "mptree-mark.svg"), "utf8").replace(/currentColor/g, "#FFFFFF");
async function art(file, w, h, share) {
  const size = Math.round(Math.min(w, h) * share);
  const m = await sharp(Buffer.from(mark), { density: 300 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  await sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } })
    .composite([{ input: m, left: Math.round((w - size) / 2), top: Math.round((h - size) / 2) }])
    .png({ compressionLevel: 9 }).toFile(join(OUT, file));
  console.log("wrote", file);
}
await art("poster-1440x2160.png", 1440, 2160, 0.42);
await art("box-2160x2160.png", 2160, 2160, 0.38);
