import type { LanternRecord } from "./look";

// ─── LANTERN ─────────────────────────────────────────────────────────────────
// The records of the Lantern style: black, lit in green. Drawn as SVG and
// handed out as pictures, the same way Aviela's flowers are (flowers.ts).
//
// Light, not a picture of anything: beams, rings, a glow. No emblem.
//
// Each is built up the way a real record is looked at: a body that is a
// little lighter halfway out than at the edge, the light, the grooves (fine,
// and never two alike), the smooth band round the label, and a rim. The first
// version had eighteen even rings and flat wedges, and looked like a diagram.

export const LANTERN_GREEN = "#35e08a";
const G = LANTERN_GREEN, INK = "#04140b", PALE = "#eafff2";

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const uri = (w: number, h: number, body: string) =>
  "data:image/svg+xml," + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}'>${body}</svg>`.replace(/"/g, "'"));

type Stop = [at: number, colour: string, strength: number];
const stops = (s: Stop[]) => s.map(([at, c, o]) => `<stop offset="${at}" stop-color="${c}" stop-opacity="${o}"/>`).join("");
const radial = (id: string, s: Stop[]) => `<radialGradient id="${id}">${stops(s)}</radialGradient>`;
/** Runs from the middle of the record straight up to its edge, so anything
 *  filled with it fades on its way out. It turns with whatever it fills. */
const outward = (id: string, s: Stop[]) =>
  `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="200" y1="200" x2="200" y2="0">${stops(s)}</linearGradient>`;
const full = (fill: string) => `<rect width="400" height="400" fill="${fill}"/>`;

// ─── The app ─────────────────────────────────────────────────────────────────

/** Lantern lights whatever it is worn on. The accent (the play button, the
 *  chosen tab, a slider) turns green on any colour of the app: bright on a
 *  dark one, deep on a light one, where the bright green would not carry
 *  white. Without this only the record was Lantern, and the rest of the app
 *  stayed black and white beside it.
 *  Null for Lantern's own palettes, which are green already. */
export function lanternAccent(p: { bg: string; accent: string }): { accent: string; playBtnBg: string; playBtnFg: string } | null {
  if (p.accent === G || p.bg === G) return null;
  const dark = parseInt(p.bg.slice(1, 3), 16) < 128;
  return dark ? { accent: G, playBtnBg: G, playBtnFg: INK } : { accent: "#0b7f4a", playBtnBg: "#0b7f4a", playBtnFg: "#ffffff" };
}

// ─── The records ─────────────────────────────────────────────────────────────

/** The label in the middle of each record. */
export const LANTERN_LABEL: Record<LanternRecord, { bg: string; ink: string }> = {
  "lantern":       { bg: G, ink: INK },
  "lantern-rings": { bg: G, ink: INK },
  "lantern-core":  { bg: PALE, ink: INK },
  "lantern-dash":  { bg: G, ink: INK },
  "lantern-solid": { bg: INK, ink: G },
  "lantern-burst": { bg: G, ink: INK },
};

const ring = (r: number, width: number, strength: number, colour = G, dash = "") =>
  `<circle cx="200" cy="200" r="${r}" fill="none" stroke="${colour}" stroke-opacity="${strength}" stroke-width="${width}"${dash}/>`;
/** A bright ring with a wide soft one under it, so it looks lit. */
const litRing = (r: number, width: number, strength: number, colour = G, dash = "") =>
  ring(r, width * 5, r2(strength * 0.16), colour, dash) + ring(r, width * 2.4, r2(strength * 0.3), colour, dash) + ring(r, width, strength, colour, dash);
/** A wedge from the middle to `reach` from the top, `half` wide there. */
const wedge = (deg: number, half: number, fill: string, strength = 1, reach = 4) =>
  `<path d="M200 200L${r1(200 - half)} ${reach}L${r1(200 + half)} ${reach}Z" transform="rotate(${r1(deg)} 200 200)" fill="${fill}" opacity="${strength}"/>`;

/** The grooves: many, fine, and uneven, which is what makes them read as cut
 *  into something rather than drawn on it. */
function grooves(colour: string, strength: number): string {
  let s = "";
  for (let i = 0, r = 68; r <= 192; i++, r += 2.4) {
    s += ring(r1(r), 0.8, r2(strength * (0.35 + 0.65 * Math.abs(Math.sin(i * 2.1)))), colour);
  }
  return s;
}

function drawRecord(skin: LanternRecord): string {
  const solid = skin === "lantern-solid";
  let defs = radial("body", solid
    ? [[0, "#63eda6", 1], [0.38, "#35e08a", 1], [0.78, "#1fb86c", 1], [1, "#0c7341", 1]]
    : [[0, "#0a1810", 1], [0.55, "#0b1d14", 1], [1, "#020604", 1]]);
  let art = "";
  const glow = (strength: number, reach = 1, mid = 0.5) => {
    defs += radial("glow", [[0, G, strength], [r2(mid * reach), G, r2(strength * 0.22)], [reach, G, 0]]);
    return full("url(#glow)");
  };

  switch (skin) {
    // Six beams from the middle that fade on their way out.
    case "lantern":
      defs += outward("beam", [[0.3, G, 0.6], [0.95, G, 0]]);
      art = glow(0.6);
      for (let i = 0; i < 6; i++) art += wedge(i * 60, 20, "url(#beam)", i % 2 ? 0.5 : 1);
      art += ring(132, 1, 0.22);
      break;
    // Rings broken into arcs, each turned a little further than the last,
    // and one point of light that goes round with them.
    case "lantern-rings":
      art = glow(0.32);
      [80, 101, 122, 143, 164, 185].forEach((r, i) => {
        const around = 2 * Math.PI * r;
        const dash = ` stroke-dasharray="${r1(around * 0.26)} ${r1(around * 0.0733)}" stroke-linecap="round" transform="rotate(${i * 37} 200 200)"`;
        art += litRing(r, 2.2, r2(0.95 - i * 0.11), G, dash);
      });
      art += `<circle cx="200" cy="57" r="13" fill="${G}" opacity="0.28"/><circle cx="200" cy="57" r="5" fill="${PALE}"/>`;
      break;
    // Nearly all light: a core with a short crown of rays round it.
    case "lantern-core":
      art = glow(1, 0.9, 0.42);
      for (let i = 0; i < 40; i++) {
        art += `<line x1="200" y1="${i % 2 ? 108 : 86}" x2="200" y2="134" transform="rotate(${i * 9} 200 200)" stroke="${i % 2 ? G : PALE}" stroke-width="1.6" stroke-opacity="${i % 2 ? 0.4 : 0.55}" stroke-linecap="round"/>`;
      }
      art += litRing(74, 1.4, 0.55) + ring(186, 1.2, 0.3, G, ` stroke-dasharray="230 354" stroke-linecap="round"`);
      break;
    // A ring of segments that fills up as it goes round: a charge, nearly full.
    case "lantern-dash": {
      art = glow(0.3);
      const n = 30, lit = 23;
      for (let i = 0; i < n; i++) {
        const on = i < lit;
        art += `<line x1="200" y1="16" x2="200" y2="42" transform="rotate(${i * 360 / n} 200 200)" stroke="${G}" stroke-width="10.5" stroke-opacity="${on ? r2(0.4 + 0.6 * (i / (lit - 1))) : 0.1}"/>`;
      }
      art += ring(150, 1, 0.3);
      break;
    }
    // The other way round: green vinyl, with the light as shadow.
    case "lantern-solid":
      defs += outward("beam", [[0.3, INK, 0.3], [0.97, INK, 0.04]]) + radial("shine", [[0, "#ffffff", 0.16], [0.45, "#ffffff", 0]]);
      art = full("url(#shine)");
      for (let i = 0; i < 6; i++) art += wedge(i * 60, 22, "url(#beam)", i % 2 ? 0.5 : 1);
      break;
    // Many thin rays, long and short in turn.
    case "lantern-burst":
      defs += outward("beam", [[0.28, G, 0.7], [0.97, G, 0]]);
      art = glow(0.5);
      for (let i = 0; i < 48; i++) art += wedge(i * 7.5, i % 2 ? 2.2 : 3.4, "url(#beam)", i % 2 ? 0.55 : 1, i % 2 ? 78 : 6);
      break;
  }

  const line = solid ? INK : G;
  return uri(400, 400,
    `<defs>${defs}</defs>` + full("url(#body)") + art
    + grooves(line, solid ? 0.26 : 0.17)
    // The smooth band round the label, with a lit edge on either side of it.
    + ring(57, 15, solid ? 0.2 : 0.5, solid ? INK : "#010503")
    + (solid ? ring(65, 1.2, 0.35, INK) + ring(49.5, 1.2, 0.35, INK) : litRing(65, 1.5, 0.85) + ring(49.5, 1.2, 0.5))
    // The rim.
    + ring(197.5, 5, solid ? 0.3 : 0.7, solid ? INK : "#000000") + ring(194.2, 1, solid ? 0.3 : 0.4, line));
}

const records = new Map<LanternRecord, string>();
/** The picture of a Lantern record, to be used as an image and turned. */
export function lanternRecord(skin: LanternRecord): string {
  let made = records.get(skin);
  if (!made) { made = drawRecord(skin); records.set(skin, made); }
  return made;
}
