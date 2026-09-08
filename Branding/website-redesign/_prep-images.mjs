// Downsamples the site's own assets for use inside the redesign canvas.
// The canvas embeds every image as base64, so they have to be small.
import { createRequire } from "node:module";
import { join } from "node:path";
const require = createRequire(join(process.cwd(), "MPTree-App", "node_modules", "x.js"));
const sharp = require("sharp");

const IMG = join(process.cwd(), "Website", "assets", "img");
const OUT = join(process.cwd(), "Branding", "website-redesign");

const jobs = [
  [join(IMG, "vinyl.webp"), 520, "vinyl.webp"],
  [join(IMG, "screens", "songs.png"), 440, "songs.webp"],
  [join(IMG, "screens", "playlists.png"), 440, "playlists.webp"],
];

for (const [src, width, name] of jobs) {
  const info = await sharp(src).resize({ width }).webp({ quality: 80 }).toFile(join(OUT, name));
  console.log(name, width + "px", Math.round(info.size / 1024) + "KB");
}
