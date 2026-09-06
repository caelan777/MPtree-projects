/**
 * MPTree "12 testers wanted" social post.
 *
 * Google Play will not let a personal developer account publish until twelve
 * people have been opted into a closed test for fourteen continuous days. This
 * is the post that asks for them.
 *
 * Two sizes come out:
 *   mptree-testers-1080x1350.png   Instagram feed (portrait, more height than
 *                                  a square, so it takes more of the screen)
 *   mptree-testers-1080x1920.png   TikTok and Stories (9:16, full screen)
 *
 *   node Branding/build-tester-post.mjs      (run from the workspace root)
 *
 * Black and white only, built from the same master mark as every other asset,
 * so it cannot drift from the brand. Requires sharp, in MPTree-App/node_modules.
 */
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(HERE, "..", "MPTree-App", "node_modules", "x.js"));
const sharp = require("sharp");

const master = readFileSync(join(HERE, "source", "mptree-mark.svg"), "utf8");
const markPath = master.match(/<path[^>]*d="([^"]+)"/)[1];

const W = 1080;
const FONT = "Segoe UI, Helvetica Neue, Arial, sans-serif";

const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A centred line of text. */
const line = (y, size, weight, text, opts = {}) => `
  <text x="${W / 2}" y="${y}" fill="${opts.fill ?? "#FFFFFF"}"
        font-family="${FONT}" font-size="${size}" font-weight="${weight}"
        text-anchor="middle"${opts.spacing ? ` letter-spacing="${opts.spacing}"` : ""}
        ${opts.opacity ? `opacity="${opts.opacity}"` : ""}>${esc(text)}</text>`;

/** A left-aligned line, for the numbered steps. */
const lineAt = (x, y, size, weight, text, opts = {}) => `
  <text x="${x}" y="${y}" fill="${opts.fill ?? "#FFFFFF"}"
        font-family="${FONT}" font-size="${size}" font-weight="${weight}"
        ${opts.opacity ? `opacity="${opts.opacity}"` : ""}>${esc(text)}</text>`;

/**
 * The poster. `top` shifts the whole block down for the taller canvas, where
 * TikTok's own interface eats the bottom of the screen.
 */
function poster(H, top) {
  const markSize = 118;
  const markScale = markSize / 1000;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#000000"/>

  <!-- Mark, from the master artwork -->
  <g transform="translate(${(W - markSize) / 2} ${top}) scale(${markScale})">
    <path fill="#FFFFFF" fill-rule="evenodd" d="${markPath}"/>
  </g>
  ${line(top + markSize + 62, 32, 700, "M P T R E E", { spacing: 10, opacity: 0.75 })}

  <!-- The ask, as the thing you read first -->
  ${line(top + 268, 40, 600, "I am looking for", { opacity: 0.72 })}
  ${line(top + 452, 210, 800, "12")}
  ${line(top + 538, 62, 800, "TESTERS", { spacing: 6 })}

  <line x1="${W / 2 - 90}" y1="${top + 600}" x2="${W / 2 + 90}" y2="${top + 600}"
        stroke="#FFFFFF" stroke-width="3" opacity="0.35"/>

  <!-- Why -->
  ${line(top + 664, 36, 400, "Google Play needs 12 people to test my app", { opacity: 0.9 })}
  ${line(top + 710, 36, 400, "for 14 days before I can publish it.", { opacity: 0.9 })}

  <!-- What they are installing -->
  ${line(top + 790, 34, 400, "MPTree is an offline music player for Android.", { opacity: 0.72 })}
  ${line(top + 834, 34, 400, "No ads. No account. No internet.", { opacity: 0.72 })}

  <!-- The whole of what is being asked. Three lines, so nobody has to wonder
       whether there is more to it. -->
  ${line(top + 912, 38, 700, "That is all you do")}
  <rect x="90" y="${top + 944}" width="${W - 180}" height="196" rx="22"
        fill="none" stroke="#FFFFFF" stroke-width="3" opacity="0.5"/>
  ${lineAt(140, top + 1000, 34, 800, "1", { opacity: 0.55 })}
  ${lineAt(196, top + 1000, 34, 400, "Send me your Google Play email")}
  ${lineAt(140, top + 1058, 34, 800, "2", { opacity: 0.55 })}
  ${lineAt(196, top + 1058, 34, 400, "Download the app")}
  ${lineAt(140, top + 1116, 34, 800, "3", { opacity: 0.55 })}
  ${lineAt(196, top + 1116, 34, 400, "Keep it installed for 14 days")}

  ${line(top + 1210, 34, 700, "Comment or DM to join", { opacity: 0.95 })}
  ${line(top + 1258, 30, 400, "@mp_tree3   ·   mp-tree.net", { opacity: 0.6 })}
</svg>`;
}

const OUT = join(HERE, "social");
mkdirSync(OUT, { recursive: true });

const sizes = [
  { h: 1350, top: 46,  name: "mptree-testers-1080x1350.png", note: "Instagram feed" },
  { h: 1920, top: 236, name: "mptree-testers-1080x1920.png", note: "TikTok / Stories" },
];

for (const s of sizes) {
  const svg = poster(s.h, s.top);
  await sharp(Buffer.from(svg)).png().toFile(join(OUT, s.name));
  console.log(`${s.name}  (${s.note})`);
}
