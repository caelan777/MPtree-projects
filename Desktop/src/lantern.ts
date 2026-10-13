import type { LanternRecord } from "./look";

// ─── LANTERN ─────────────────────────────────────────────────────────────────
// The records of the Lantern style: black, lit in green. Drawn as SVG and
// handed out as pictures, the same way Aviela's flowers are (flowers.ts).
//
// Light, not a picture of anything: beams, rings, a glow. No emblem.

export const LANTERN_GREEN = "#35e08a";
const G = LANTERN_GREEN, NIGHT = "#050d09", INK = "#04140b";

const r1 = (v: number) => Math.round(v * 10) / 10;
const uri = (w: number, h: number, body: string) =>
  "data:image/svg+xml," + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}'>${body}</svg>`.replace(/"/g, "'"));

/** A round glow: `colour` in the middle, nothing at the edge. */
const glowDef = (id: string, colour: string, strength: number, mid = 0.5) =>
  `<defs><radialGradient id="${id}"><stop offset="0" stop-color="${colour}" stop-opacity="${strength}"/>`
  + `<stop offset="${mid}" stop-color="${colour}" stop-opacity="${r1(strength * 0.22 * 10) / 10}"/>`
  + `<stop offset="1" stop-color="${colour}" stop-opacity="0"/></radialGradient></defs>`;

// ─── The records ─────────────────────────────────────────────────────────────

/** The label in the middle of each record. */
export const LANTERN_LABEL: Record<LanternRecord, { bg: string; ink: string }> = {
  "lantern":       { bg: G, ink: INK },
  "lantern-rings": { bg: G, ink: INK },
  "lantern-core":  { bg: G, ink: INK },
  "lantern-dash":  { bg: G, ink: INK },
  "lantern-solid": { bg: INK, ink: G },
  "lantern-burst": { bg: G, ink: INK },
};

/** A bright ring with a soft one under it, so it looks lit. */
const ringOfLight = (r: number, width: number, strength: number, colour = G) =>
  `<circle cx="200" cy="200" r="${r}" fill="none" stroke="${colour}" stroke-opacity="${r1(strength * 2) / 10}" stroke-width="${width * 4}"/>`
  + `<circle cx="200" cy="200" r="${r}" fill="none" stroke="${colour}" stroke-opacity="${strength}" stroke-width="${width}"/>`;

const beam = (deg: number, half: number, strength: number, colour = G, reach = 4) =>
  `<path d="M200 200L${200 - half} ${reach}L${200 + half} ${reach}Z" transform="rotate(${deg} 200 200)" fill="${colour}" opacity="${strength}"/>`;

function drawRecord(skin: LanternRecord): string {
  let base = NIGHT;
  let groove = G, grooveStrength = 0.1;
  let art = "";
  const lit = (strength: number, mid?: number) => glowDef("g", G, strength, mid) + `<rect width="400" height="400" fill="url(#g)"/>`;
  switch (skin) {
    // Six beams from the middle, so there is something to see turn.
    case "lantern":
      art = lit(0.6);
      for (let i = 0; i < 6; i++) art += beam(i * 60, 12, i % 2 ? 0.1 : 0.2);
      art += ringOfLight(96, 2.5, 0.9) + ringOfLight(150, 1.5, 0.55) + ringOfLight(190, 3, 0.8);
      break;
    // Rings only, fading outwards, and one point of light that goes round.
    case "lantern-rings":
      art = lit(0.35);
      [84, 108, 132, 156, 180].forEach((r, i) => { art += ringOfLight(r, 2.2, r1((0.95 - i * 0.15) * 10) / 10); });
      art += `<circle cx="200" cy="44" r="14" fill="${G}" opacity="0.25"/><circle cx="200" cy="44" r="6" fill="#eafff2"/>`;
      break;
    // Nearly all glow, with two arcs to show it turning.
    case "lantern-core":
      art = lit(0.95, 0.42)
          + `<circle cx="200" cy="200" r="150" fill="none" stroke="${G}" stroke-opacity="0.75" stroke-width="3" stroke-dasharray="150 321" stroke-linecap="round"/>`
          + ringOfLight(190, 2, 0.5);
      break;
    // A ring of segments, most of them lit: a charge that is nearly full.
    case "lantern-dash":
      art = lit(0.3);
      for (let i = 0; i < 24; i++) art += `<line x1="200" y1="20" x2="200" y2="46" transform="rotate(${i * 15} 200 200)" stroke="${G}" stroke-width="13" stroke-opacity="${i < 17 ? 0.92 : 0.16}"/>`;
      for (let i = 0; i < 24; i++) art += `<line x1="200" y1="72" x2="200" y2="82" transform="rotate(${i * 15 + 7.5} 200 200)" stroke="${G}" stroke-width="5" stroke-opacity="0.4"/>`;
      art += ringOfLight(108, 2, 0.7);
      break;
    // The other way round: a green record with dark grooves.
    case "lantern-solid":
      base = G; groove = INK; grooveStrength = 0.16;
      for (let i = 0; i < 6; i++) art += beam(i * 60, 14, i % 2 ? 0.06 : 0.12, INK);
      art += ringOfLight(96, 2, 0.5, INK) + ringOfLight(190, 3, 0.6, INK);
      break;
    // Many thin rays, long and short in turn.
    case "lantern-burst":
      art = lit(0.5);
      for (let i = 0; i < 36; i++) art += beam(i * 10, 4, i % 2 ? 0.16 : 0.3, G, i % 2 ? 70 : 8);
      art += ringOfLight(190, 2.5, 0.7);
      break;
  }
  let grooves = "";
  for (let r = 68; r <= 190; r += 7) grooves += `<circle cx="200" cy="200" r="${r}" fill="none" stroke="${groove}" stroke-opacity="${grooveStrength}" stroke-width="1.1"/>`;
  return uri(400, 400, `<rect width="400" height="400" fill="${base}"/>${art}${grooves}`);
}

const records = new Map<LanternRecord, string>();
/** The picture of a Lantern record, to be used as an image and turned. */
export function lanternRecord(skin: LanternRecord): string {
  let made = records.get(skin);
  if (!made) { made = drawRecord(skin); records.set(skin, made); }
  return made;
}
