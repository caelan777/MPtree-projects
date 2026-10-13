import type { CSSProperties } from "react";
import type { FlowerRecord, Flowers } from "./look";

// ─── AVIELA ──────────────────────────────────────────────────────────────────
// The flowers of the Aviela style: eight records, and six ways for the app
// itself to wear flowers. Everything is drawn here as SVG and handed out as a
// picture, so the browser draws each one once and after that only moves a
// picture around, the way it does with vinyl.webp.
//
// Aviela is pink with a white header card, so the flowers are made of those
// two and a deeper rose, with a yellow heart here and there. Asked for by
// name, like pink itself: the one style that is not black and white.

const INK = "#20181b", BLUSH = "#ffeaf4", PETAL = "#ffd5e6", PINK = "#f7bbd1", ROSE = "#ee8fb4";
const WHITE = "#ffffff", GOLD = "#f3c14b";

const r1 = (v: number) => Math.round(v * 10) / 10;

/** One petal: from 0,0 straight up, `len` long. `wide` is its width as a
 *  share of its length. A leaf is the same shape, only narrower. */
const petal = (len: number, wide: number) => {
  const w = r1(len * wide);
  return `M0 0C${w} ${r1(-len * 0.3)} ${w} ${r1(-len * 0.9)} 0 ${r1(-len)}C${-w} ${r1(-len * 0.9)} ${-w} ${r1(-len * 0.3)} 0 0Z`;
};

type Bloom = { n: number; fill: string; heart: string; wide?: number; turn?: number; line?: string };

function flower(x: number, y: number, r: number, b: Bloom): string {
  const d = petal(r, b.wide ?? (b.n > 8 ? 0.2 : b.n > 5 ? 0.42 : 0.58));
  const paint = b.line
    ? `fill="none" stroke="${b.line}" stroke-width="${r1(Math.max(1.4, r * 0.07))}" stroke-linejoin="round"`
    // A hair of shadow between petals, so two of one colour do not melt together.
    : `fill="${b.fill}" stroke="rgba(32,24,27,0.10)" stroke-width="0.6"`;
  let s = `<g transform="translate(${r1(x)} ${r1(y)}) rotate(${r1(b.turn ?? 0)})">`;
  for (let i = 0; i < b.n; i++) s += `<path d="${d}" transform="rotate(${r1(i * 360 / b.n)})" ${paint}/>`;
  s += b.line
    ? `<circle r="${r1(r * 0.2)}" fill="none" stroke="${b.line}" stroke-width="${r1(Math.max(1.4, r * 0.07))}"/>`
    : `<circle r="${r1(r * 0.2)}" fill="${b.heart}"/>`;
  return s + "</g>";
}

const leaf = (x: number, y: number, len: number, turn: number, fill: string, wide = 0.36) =>
  `<path d="${petal(len, wide)}" transform="translate(${r1(x)} ${r1(y)}) rotate(${r1(turn)})" fill="${fill}"/>`;

/** `k` things on a circle of radius R around 200,200. */
function ring(R: number, k: number, each: (x: number, y: number, i: number, deg: number) => string, offset = 0): string {
  let s = "";
  for (let i = 0; i < k; i++) {
    const deg = offset + i * 360 / k;
    const a = deg * Math.PI / 180;
    s += each(200 + R * Math.sin(a), 200 - R * Math.cos(a), i, deg);
  }
  return s;
}

const uri = (w: number, h: number, body: string) =>
  "data:image/svg+xml," + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}'>${body}</svg>`.replace(/"/g, "'"));

// Where things land when they are strewn about, on a record 400 across. Fixed,
// so a record looks the same every time it is drawn.
const STREWN: [number, number, number][] = [
  [104, 96, 27], [302, 118, 21], [80, 238, 19], [318, 258, 29], [196, 326, 23], [242, 62, 17],
  [140, 300, 15], [290, 190, 15], [124, 166, 17], [226, 126, 13], [262, 322, 15], [58, 160, 13],
  [336, 182, 11], [168, 58, 13], [92, 316, 12], [352, 120, 10],
];

// ─── The records ─────────────────────────────────────────────────────────────

/** The label in the middle of each record, and whether its shadow is soft. */
export const RECORD_LABEL: Record<FlowerRecord, { bg: string; ink: string }> = {
  daisy:   { bg: WHITE, ink: INK },
  bloom:   { bg: GOLD,  ink: INK },
  blossom: { bg: INK,   ink: WHITE },
  lines:   { bg: INK,   ink: WHITE },
  wreath:  { bg: PINK,  ink: INK },
  petals:  { bg: WHITE, ink: INK },
  ditsy:   { bg: WHITE, ink: INK },
  bouquet: { bg: INK,   ink: WHITE },
};

function drawRecord(skin: FlowerRecord): string {
  let base = PINK;
  let groove = "rgba(32,24,27,0.09)";
  let art = "";
  switch (skin) {
    case "daisy":
      art = ring(124, 8, (x, y, _i, deg) => flower(x, y, 35, { n: 12, fill: WHITE, heart: GOLD, turn: deg }))
          + ring(174, 8, (x, y, _i, deg) => flower(x, y, 13, { n: 5, fill: PETAL, heart: WHITE, turn: deg }), 22.5);
      break;
    case "bloom": {
      // The record is the flower: two rows of petals around the label.
      base = BLUSH;
      for (let i = 0; i < 8; i++) art += `<path d="${petal(197, 0.4)}" transform="translate(200 200) rotate(${i * 45})" fill="${i % 2 ? PINK : ROSE}"/>`;
      for (let i = 0; i < 8; i++) art += `<path d="${petal(128, 0.44)}" transform="translate(200 200) rotate(${22.5 + i * 45})" fill="${i % 2 ? WHITE : PETAL}" stroke="rgba(32,24,27,0.08)" stroke-width="0.8"/>`;
      break;
    }
    case "blossom":
      base = WHITE;
      art = STREWN.map(([x, y, r], i) => flower(x, y, r, { n: 5, fill: i % 3 ? PINK : ROSE, heart: WHITE, turn: i * 31 })).join("");
      break;
    case "lines":
      base = BLUSH;
      groove = "rgba(32,24,27,0.06)";
      art = STREWN.slice(0, 11).map(([x, y, r], i) => flower(x, y, r + 7, { n: 6, fill: "none", heart: "none", line: INK, turn: i * 23 })).join("");
      break;
    case "wreath":
      base = "#151012";
      groove = "rgba(255,255,255,0.08)";
      art = ring(160, 12, (x, y, i, deg) => i % 2
        ? leaf(x, y, 30, deg + 62, ROSE) + leaf(x, y, 30, deg - 118, ROSE)
        : flower(x, y, 25, { n: 5, fill: PINK, heart: WHITE, turn: deg }));
      break;
    case "petals":
      base = PETAL;
      art = STREWN.map(([x, y, r], i) => leaf(x, y, r * 1.5, i * 47, i % 2 ? WHITE : ROSE, 0.5)).join("");
      break;
    case "ditsy": {
      base = ROSE;
      const small = (x: number, y: number, _i: number, deg: number) => flower(x, y, 12, { n: 5, fill: WHITE, heart: GOLD, turn: deg });
      art = ring(84, 8, small) + ring(124, 12, small, 15) + ring(166, 16, small);
      break;
    }
    case "bouquet":
      base = WHITE;
      art = leaf(128, 300, 62, -38, PETAL) + leaf(128, 300, 58, 70, PETAL) + leaf(96, 262, 50, 8, PETAL)
          + flower(84, 250, 42, { n: 6, fill: ROSE, heart: WHITE, turn: 12 })
          + flower(146, 322, 50, { n: 6, fill: PINK, heart: GOLD })
          + flower(226, 356, 34, { n: 6, fill: ROSE, heart: WHITE, turn: 20 })
          + flower(60, 176, 24, { n: 5, fill: PINK, heart: WHITE })
          + flower(178, 250, 22, { n: 5, fill: PETAL, heart: GOLD, turn: 30 })
          + flower(292, 372, 18, { n: 5, fill: PINK, heart: WHITE });
      break;
  }
  let grooves = "";
  for (let r = 68; r <= 190; r += 7) grooves += `<circle cx="200" cy="200" r="${r}" fill="none" stroke="${groove}" stroke-width="1.1"/>`;
  return uri(400, 400, `<rect width="400" height="400" fill="${base}"/>${art}${grooves}`);
}

const records = new Map<FlowerRecord, string>();
/** The picture of a flower record, to be used as an image and turned. */
export function recordArt(skin: FlowerRecord): string {
  let made = records.get(skin);
  if (!made) { made = drawRecord(skin); records.set(skin, made); }
  return made;
}

// ─── The app ─────────────────────────────────────────────────────────────────

const css = (w: number, h: number, body: string) => `url("${uri(w, h, body)}")`;
const once = <V,>(make: () => V) => { let v: V | undefined; return () => (v ??= make()); };

// A sprig that comes in over the top right corner of the header card. Pale,
// because the settings button is drawn on top of it.
const SPRIG = once(() => css(130, 84,
  `<path d="M130 4C104 6 84 16 66 34M112 10C110 30 104 44 96 58" fill="none" stroke="${PINK}" stroke-width="1.6" stroke-linecap="round"/>`
  + leaf(100, 12, 20, -150, PETAL) + leaf(86, 20, 18, -60, PETAL) + leaf(108, 30, 16, 120, PETAL)
  + flower(64, 36, 19, { n: 6, fill: PINK, heart: GOLD, turn: 10 })
  + flower(96, 60, 14, { n: 5, fill: PETAL, heart: ROSE })
  + flower(118, 22, 11, { n: 5, fill: ROSE, heart: WHITE, turn: 20 })
  + flower(36, 12, 8, { n: 5, fill: PETAL, heart: PINK })));

// Half flowers along the bottom edge of the card, as if they grow behind it.
const GARLAND = once(() => css(64, 22,
  flower(16, 22, 15, { n: 6, fill: PINK, heart: GOLD }) + flower(48, 23, 11, { n: 5, fill: ROSE, heart: WHITE, turn: 36 })));

const MARK = once(() => css(20, 20, flower(10, 10, 9.4, { n: 6, fill: ROSE, heart: GOLD })));

const CARD_BLOOM = once(() => css(180, 180, flower(90, 90, 88, { n: 8, fill: BLUSH, heart: PETAL, wide: 0.4 })));

// A print of small flowers, the kind a summer dress has.
const PRINT = once(() => css(64, 64,
  flower(16, 16, 7, { n: 5, fill: WHITE, heart: PINK }) + flower(48, 48, 7, { n: 5, fill: WHITE, heart: PINK, turn: 36 })
  + `<circle cx="48" cy="16" r="1.6" fill="${PINK}"/><circle cx="16" cy="48" r="1.6" fill="${PINK}"/>`));

const FALLING = once(() => css(300, 420, [
  [40, 60, 16, 30], [210, 30, 12, 110], [130, 130, 14, -40], [262, 150, 18, 70], [70, 232, 12, 160],
  [180, 262, 16, 15], [30, 352, 14, -80], [240, 340, 12, 200], [128, 392, 15, 95],
].map(([x, y, r, turn], i) => leaf(x, y, r, turn, i % 2 ? WHITE : PINK, 0.5)).join("")));

const BIG_BLOOM = once(() => css(400, 400, flower(200, 200, 196, { n: 8, fill: "#ffdcea", heart: PETAL, wide: 0.4 })));

/** What the app's own background gets. Paint only. */
export function groundFlowers(kind: Flowers): CSSProperties {
  switch (kind) {
    case "print":  return { backgroundImage: PRINT(), backgroundSize: "64px 64px" };
    case "petals": return { backgroundImage: FALLING(), backgroundSize: "300px 420px" };
    case "bloom":  return { backgroundImage: BIG_BLOOM(), backgroundRepeat: "no-repeat", backgroundSize: "420px 420px", backgroundPosition: "right -150px bottom 60px" };
    default:       return {};
  }
}

/** What is drawn inside the header card, behind what it holds. Null when this
 *  kind has nothing there. Paint only: it is laid over the card, never in it. */
export function cardFlowers(kind: Flowers): CSSProperties | null {
  const layer: CSSProperties = { position: "absolute", inset: 0, zIndex: -1, pointerEvents: "none", backgroundRepeat: "no-repeat" };
  switch (kind) {
    case "sprig":   return { ...layer, backgroundImage: SPRIG(), backgroundSize: "130px 84px", backgroundPosition: "right top" };
    case "garland": return { ...layer, backgroundImage: GARLAND(), backgroundRepeat: "repeat-x", backgroundSize: "64px 22px", backgroundPosition: "left 4px bottom" };
    case "bloom":   return { ...layer, backgroundImage: CARD_BLOOM(), backgroundSize: "180px 180px", backgroundPosition: "right -56px top -52px" };
    default:        return null;
  }
}

/** The one flower that sits on the logo. */
export const logoFlower = (): string => MARK();
