import type { CSSProperties } from "react";
import type { Flowers, LanternRecord } from "./look";
import type { Tone } from "./flowers";

// ─── LANTERN ─────────────────────────────────────────────────────────────────
// The Lantern style: black, lit in green. Its records, and the ways the app
// itself can carry that light. Drawn as SVG and handed out as pictures, the
// same way Aviela's flowers are (flowers.ts).
//
// Light, not a picture of anything: beams, rings, a glow. No emblem.

export const LANTERN_GREEN = "#35e08a";
const G = LANTERN_GREEN, NIGHT = "#050d09", INK = "#04140b";

const r1 = (v: number) => Math.round(v * 10) / 10;
const uri = (w: number, h: number, body: string) =>
  "data:image/svg+xml," + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}'>${body}</svg>`.replace(/"/g, "'"));
const css = (w: number, h: number, body: string) => `url("${uri(w, h, body)}")`;

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

// ─── The app ─────────────────────────────────────────────────────────────────
// Light on the header card. Its colour depends on the card's ground: green on
// black and on white, near white on a green card.

const LIGHT: Record<Tone, string> = { black: G, white: "#1fbf70", pink: "#1fbf70", green: "#eafff2" };

type CardLight = "glow" | "beams" | "rings" | "edge" | "sparks";

/** The lights that are round the settings button, and how wide each is. */
const HALO: Partial<Record<Flowers, number>> = { glow: 240, beams: 260, rings: 220 };
export const lanternHalo = (kind: Flowers): number | null => HALO[kind] ?? null;

const star = (x: number, y: number, s: number, colour: string, strength: number) => {
  const k = r1(s * 0.2);
  return `<path d="M${x} ${y - s}L${x + k} ${y - k}L${x + s} ${y}L${x + k} ${y + k}L${x} ${y + s}L${x - k} ${y + k}L${x - s} ${y}L${x - k} ${y - k}Z" fill="${colour}" opacity="${strength}"/>`;
};

function drawLight(kind: CardLight, c: string): string {
  switch (kind) {
    case "glow": return css(240, 240, glowDef("g", c, 0.55) + `<rect width="240" height="240" fill="url(#g)"/>`);
    case "beams": {
      let s = glowDef("g", c, 0.35) + `<rect width="260" height="260" fill="url(#g)"/>`;
      for (let i = 0; i < 8; i++) s += `<path d="M130 130L121 0L139 0Z" transform="rotate(${i * 45 + 22.5} 130 130)" fill="${c}" opacity="${i % 2 ? 0.1 : 0.2}"/>`;
      return css(260, 260, s);
    }
    case "rings":
      return css(220, 220, [[22, 0.55], [40, 0.4], [60, 0.28], [82, 0.18], [106, 0.1]]
        .map(([r, o]) => `<circle cx="110" cy="110" r="${r}" fill="none" stroke="${c}" stroke-opacity="${o}" stroke-width="1.6"/>`).join(""));
    // A lit line along the bottom edge, with its glow above it.
    case "edge":
      return css(8, 22, `<defs><linearGradient id="e" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity="0"/>`
        + `<stop offset="1" stop-color="${c}" stop-opacity="0.38"/></linearGradient></defs>`
        + `<rect width="8" height="22" fill="url(#e)"/><rect y="20" width="8" height="2" fill="${c}"/>`);
    case "sparks":
      return css(150, 96, star(24, 20, 6, c, 0.9) + star(98, 12, 4, c, 0.6) + star(130, 60, 7, c, 0.8) + star(60, 72, 4.5, c, 0.65)
        + `<circle cx="72" cy="34" r="1.5" fill="${c}" opacity="0.7"/><circle cx="118" cy="86" r="1.5" fill="${c}" opacity="0.5"/><circle cx="14" cy="60" r="1.5" fill="${c}" opacity="0.6"/>`);
  }
}

const lights = new Map<string, string>();
function lightArt(kind: CardLight, tone: Tone): string {
  const key = `${kind}:${tone}`;
  let made = lights.get(key);
  if (!made) { made = drawLight(kind, LIGHT[tone]); lights.set(key, made); }
  return made;
}

/** What Lantern draws on the header card, behind what it holds. Null when
 *  this kind has nothing there. Paint only. */
export function cardLight(kind: Flowers, tone: Tone): CSSProperties | null {
  const layer: CSSProperties = { position: "absolute", inset: 0, zIndex: -1, pointerEvents: "none", backgroundRepeat: "no-repeat" };
  switch (kind) {
    case "glow":
    case "beams":
    case "rings": {
      // Centred on the settings button, which sits 32 from the right and from
      // the top of the card.
      const size = HALO[kind]!;
      return { ...layer, backgroundImage: lightArt(kind, tone), backgroundSize: `${size}px ${size}px`, backgroundPosition: `right ${r1(32.7 - size / 2)}px top ${32 - size / 2}px` };
    }
    case "edge":   return { ...layer, backgroundImage: lightArt(kind, tone), backgroundRepeat: "repeat-x", backgroundSize: "8px 22px", backgroundPosition: "left bottom" };
    case "sparks": return { ...layer, backgroundImage: lightArt(kind, tone), backgroundRepeat: "repeat", backgroundSize: "150px 96px" };
    default:       return null;
  }
}

// The one light that is on the app's own ground: a glow coming up from the
// bottom of the screen.
let aura: string | undefined;

/** What Lantern gives the app's own background. Paint only. */
export function groundLight(kind: Flowers): CSSProperties {
  if (kind !== "aura") return {};
  aura ??= css(560, 400, glowDef("g", G, 0.42, 0.45) + `<rect width="560" height="400" fill="url(#g)"/>`);
  return { backgroundImage: aura, backgroundRepeat: "no-repeat", backgroundSize: "560px 400px", backgroundPosition: "center bottom -210px" };
}
