/**
 * Regenerates the three invented record sleeves used by seed.html.
 *
 *   node scripts/shot-props/make-covers.mjs
 *
 * They only exist so the screenshots are not a column of identical placeholder
 * note icons. Restrained and geometric on purpose: each has to still read as
 * something at 36px in a list row. Nothing here depicts a real record.
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(HERE, "..", "..", "node_modules", "x.js"));
const sharp = require("sharp");

const sleeves = [
  // Kite Season, "Paper Weather"
  `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
     <rect width="512" height="512" fill="#e8e2d6"/>
     <path d="M256 78 L400 300 L256 434 L112 300 Z" fill="none" stroke="#1b1b1b" stroke-width="14"/>
     <line x1="256" y1="78" x2="256" y2="434" stroke="#1b1b1b" stroke-width="14"/>
     <rect x="0" y="452" width="512" height="60" fill="#1b1b1b"/>
   </svg>`,
  // The Halogens, "Slow Signal"
  `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
     <rect width="512" height="512" fill="#101826"/>
     <g fill="#f2b544">
       <rect x="64" y="150" width="384" height="18"/>
       <rect x="64" y="212" width="300" height="18"/>
       <rect x="64" y="274" width="216" height="18"/>
       <rect x="64" y="336" width="132" height="18"/>
     </g>
     <circle cx="404" cy="380" r="46" fill="none" stroke="#f2b544" stroke-width="16"/>
   </svg>`,
  // Marrow, "Static Bloom"
  `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
     <rect width="512" height="512" fill="#0d0d0d"/>
     <circle cx="256" cy="248" r="150" fill="#f5f3ee"/>
     <circle cx="316" cy="212" r="150" fill="#0d0d0d"/>
     <rect x="96" y="430" width="320" height="10" fill="#f5f3ee"/>
   </svg>`,
];

for (let i = 0; i < sleeves.length; i++) {
  const info = await sharp(Buffer.from(sleeves[i]))
    .resize(320, 320).jpeg({ quality: 82 })
    .toFile(join(HERE, `demo-cover-${i}.jpg`));
  console.log(`demo-cover-${i}.jpg  ${Math.round(info.size / 1024)}KB`);
}
