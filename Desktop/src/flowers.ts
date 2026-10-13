import type { CSSProperties } from "react";
import type { CardShade, FlowerRecord, Flowers, LightShade } from "./look";

// ─── AVIELA ──────────────────────────────────────────────────────────────────
// The flowers of the Aviela style: its records, and the ways the app itself
// wears flowers. Everything is drawn here as SVG and handed out as a picture,
// so the browser draws each one once and after that only moves a picture
// around, the way it does with vinyl.webp.
//
// Aviela is pink, with a header card that is white, pink or black, so the
// flowers are made of pink, white and a deeper rose, with a yellow heart here
// and there. Asked for by name, like pink itself: the one style that is not
// black and white.

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

const stem = (d: string, colour: string, width = 1.6) =>
  `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round"/>`;

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

/** The label in the middle of each record. */
export const RECORD_LABEL: Record<FlowerRecord, { bg: string; ink: string }> = {
  daisy:   { bg: WHITE, ink: INK },
  bloom:   { bg: GOLD,  ink: INK },
  blossom: { bg: INK,   ink: WHITE },
  lines:   { bg: INK,   ink: WHITE },
  wreath:  { bg: PINK,  ink: INK },
  petals:  { bg: WHITE, ink: INK },
  ditsy:   { bg: WHITE, ink: INK },
  bouquet: { bg: INK,   ink: WHITE },
  dahlia:  { bg: WHITE, ink: INK },
  oxeye:   { bg: GOLD,  ink: INK },
  night:   { bg: PINK,  ink: INK },
  branch:  { bg: INK,   ink: WHITE },
  posy:    { bg: WHITE, ink: INK },
};

/** The records on a dark ground, which keep the deeper shadow. */
export const DARK_RECORDS: readonly FlowerRecord[] = ["wreath", "night"];

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
    case "dahlia": {
      // Four rows of petals, deeper towards the middle.
      base = BLUSH;
      const rows: [number, number, string][] = [[197, 18, PETAL], [160, 16, PINK], [122, 14, "#f3a4c2"], [86, 12, ROSE]];
      rows.forEach(([len, n, fill], row) => {
        for (let i = 0; i < n; i++) art += `<path d="${petal(len, 0.26)}" transform="translate(200 200) rotate(${r1((i + (row % 2) / 2) * 360 / n)})" fill="${fill}" stroke="rgba(32,24,27,0.10)" stroke-width="0.8"/>`;
      });
      break;
    }
    case "oxeye":
      // One daisy, as large as the record.
      base = ROSE;
      for (let i = 0; i < 18; i++) art += `<path d="${petal(194, 0.2)}" transform="translate(200 200) rotate(${i * 20})" fill="${WHITE}" stroke="rgba(32,24,27,0.10)" stroke-width="0.8"/>`;
      for (let i = 0; i < 18; i++) art += `<path d="${petal(150, 0.2)}" transform="translate(200 200) rotate(${10 + i * 20})" fill="#fff4f9" stroke="rgba(32,24,27,0.10)" stroke-width="0.8"/>`;
      break;
    case "night":
      base = "#151012";
      groove = "rgba(255,255,255,0.07)";
      art = STREWN.slice(0, 12).map(([x, y, r], i) => flower(x, y, r + 7, { n: i % 2 ? 5 : 6, fill: "none", heart: "none", line: i % 3 ? PINK : ROSE, turn: i * 23 })).join("");
      break;
    case "branch":
      // A branch in blossom, lying across the record.
      base = BLUSH;
      art = stem("M-10 312C90 292 150 232 210 200S330 122 410 96", "#6b4652", 8)
          + stem("M150 246C150 204 170 172 196 150", "#6b4652", 5) + stem("M270 168C300 190 330 196 358 190", "#6b4652", 5)
          + ([[96, 288, 25, 0], [160, 238, 29, 1], [196, 148, 25, 0], [238, 186, 22, 1], [300, 140, 29, 0], [360, 190, 23, 1], [372, 102, 21, 0], [56, 300, 17, 1]] as const)
            .map(([x, y, r, k], i) => flower(x, y, r, { n: 5, fill: k ? PINK : WHITE, heart: ROSE, turn: i * 29 })).join("")
          + ([[128, 210, 9], [330, 96, 9], [228, 130, 8], [118, 262, 8]] as const).map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${ROSE}"/>`).join("");
      break;
    case "posy":
      // Plain pink, with a small ring of flowers round the label.
      art = ring(80, 10, (x, y, i, deg) => flower(x, y, 19, { n: 5, fill: i % 2 ? WHITE : ROSE, heart: i % 2 ? GOLD : WHITE, turn: deg }));
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
// Flowers are drawn on the header card, and what colour they are depends on
// the card's: pink ones would be lost on a pink card.

/** The header card's ground, as far as flowers care. */
export type Tone = "white" | "pink" | "black";

export function toneOf(card: CardShade, appIsDark: boolean, light: LightShade): Tone {
  if (card === "default") return appIsDark ? "black" : light === "pink" ? "pink" : "white";
  return card.startsWith("dark:") ? "black" : card === "light:pink" ? "pink" : "white";
}

type Paint = { daisy: string; main: string; soft: string; deep: string; leaf: string; stem: string; pale: string; paleHeart: string; line: string };
const PAINT: Record<Tone, Paint> = {
  white: { daisy: PETAL, main: PINK,  soft: PETAL,     deep: ROSE, leaf: PETAL,     stem: PINK,      pale: BLUSH,     paleHeart: PETAL,     line: INK },
  pink:  { daisy: WHITE, main: WHITE, soft: "#fff6fa", deep: ROSE, leaf: PINK,      stem: "#f1a3c0", pale: "#fff3f9", paleHeart: PETAL,     line: INK },
  black: { daisy: WHITE, main: PINK,  soft: ROSE,      deep: PETAL, leaf: "#9c5873", stem: "#9c5873", pale: "#22151a", paleHeart: "#351f28", line: PINK },
};

const css = (w: number, h: number, body: string) => `url("${uri(w, h, body)}")`;

type CardKind = Exclude<Flowers, "none" | "mark" | "meadow">;

function drawCard(kind: CardKind, p: Paint): string {
  switch (kind) {
    // Comes in over the top right corner. The settings button is drawn on it.
    case "sprig": return css(130, 84,
      stem("M130 4C104 6 84 16 66 34M112 10C110 30 104 44 96 58", p.stem)
      + leaf(100, 12, 20, -150, p.leaf) + leaf(86, 20, 18, -60, p.leaf) + leaf(108, 30, 16, 120, p.leaf)
      + flower(64, 36, 19, { n: 6, fill: p.main, heart: GOLD, turn: 10 })
      + flower(96, 60, 14, { n: 5, fill: p.soft, heart: ROSE })
      + flower(118, 22, 11, { n: 5, fill: p.deep, heart: WHITE, turn: 20 })
      + flower(36, 12, 8, { n: 5, fill: p.soft, heart: p.deep }));
    // The same corner, drawn with a pen.
    case "lines": return css(130, 84,
      stem("M130 6C106 8 88 18 70 36M114 12C112 32 106 44 98 58", p.line, 1.4)
      + flower(66, 38, 19, { n: 6, fill: "none", heart: "none", line: p.line, turn: 10 })
      + flower(98, 62, 13, { n: 5, fill: "none", heart: "none", line: p.line })
      + flower(118, 24, 10, { n: 5, fill: "none", heart: "none", line: p.line, turn: 20 }));
    // Half flowers along the bottom edge, as if they grow behind the card.
    case "garland": return css(64, 22,
      flower(16, 22, 15, { n: 6, fill: p.main, heart: GOLD }) + flower(48, 23, 11, { n: 5, fill: p.deep, heart: WHITE, turn: 36 }));
    case "daisies": return css(36, 20, flower(18, 21, 15, { n: 12, fill: p.daisy, heart: GOLD }));
    // Hangs from the top edge.
    case "vine": return css(96, 20,
      stem("M0 3C16 9 32 9 48 3S80 -3 96 3", p.stem, 1.5)
      + leaf(12, 6, 9, 150, p.leaf) + leaf(60, 2, 9, 205, p.leaf) + leaf(84, 1, 8, 160, p.leaf)
      + flower(30, 10, 7.5, { n: 5, fill: p.main, heart: GOLD }) + flower(74, 8, 6, { n: 5, fill: p.deep, heart: WHITE, turn: 30 }));
    // A few small ones, strewn over the whole card.
    case "confetti": return css(150, 96,
      flower(22, 20, 7, { n: 5, fill: p.main, heart: GOLD }) + flower(96, 12, 5.5, { n: 5, fill: p.deep, heart: WHITE, turn: 30 })
      + flower(132, 58, 7, { n: 5, fill: p.soft, heart: p.deep, turn: 12 }) + flower(58, 70, 6, { n: 5, fill: p.deep, heart: WHITE })
      + `<circle cx="70" cy="34" r="1.6" fill="${p.deep}"/><circle cx="118" cy="86" r="1.6" fill="${p.main}"/><circle cx="14" cy="62" r="1.6" fill="${p.deep}"/>`);
    // One very large flower, more a tint than a picture, with the settings
    // button as its heart.
    case "bloom": return css(180, 180, flower(90, 90, 88, { n: 8, fill: p.pale, heart: p.paleHeart, wide: 0.4 }));
    // A small bunch in two opposite corners. Drawn for the top right; the
    // bottom left is the same picture turned round.
    case "corners": return css(78, 52,
      leaf(60, 14, 18, -120, p.leaf) + leaf(52, 22, 15, -40, p.leaf)
      + flower(52, 20, 15, { n: 6, fill: p.main, heart: GOLD }) + flower(70, 40, 9, { n: 5, fill: p.deep, heart: WHITE, turn: 20 })
      + flower(28, 8, 8, { n: 5, fill: p.soft, heart: p.deep }));
  }
}

const cards = new Map<string, string>();
function cardArt(kind: CardKind, tone: Tone): string {
  const key = `${kind}:${tone}`;
  let made = cards.get(key);
  if (!made) { made = drawCard(kind, PAINT[tone]); cards.set(key, made); }
  return made;
}

/** What is drawn on the header card, behind what it holds. Null when this kind
 *  has nothing there. Paint only: it is laid over the card, never in it. */
export function cardFlowers(kind: Flowers, tone: Tone): CSSProperties | null {
  const layer: CSSProperties = { position: "absolute", inset: 0, zIndex: -1, pointerEvents: "none", backgroundRepeat: "no-repeat" };
  switch (kind) {
    case "sprig":
    case "lines":    return { ...layer, backgroundImage: cardArt(kind, tone), backgroundSize: "130px 84px", backgroundPosition: "right top" };
    case "garland":  return { ...layer, backgroundImage: cardArt(kind, tone), backgroundRepeat: "repeat-x", backgroundSize: "64px 22px", backgroundPosition: "left 4px bottom" };
    case "daisies":  return { ...layer, backgroundImage: cardArt(kind, tone), backgroundRepeat: "repeat-x", backgroundSize: "36px 20px", backgroundPosition: "left 2px bottom" };
    case "vine":     return { ...layer, backgroundImage: cardArt(kind, tone), backgroundRepeat: "repeat-x", backgroundSize: "96px 20px", backgroundPosition: "left top" };
    case "confetti": return { ...layer, backgroundImage: cardArt(kind, tone), backgroundRepeat: "repeat", backgroundSize: "150px 96px" };
    case "bloom":    return { ...layer, backgroundImage: cardArt(kind, tone),
      // The settings button sits 32 from the right and from the top of the card.
      backgroundSize: "180px 180px", backgroundPosition: "right -57.3px top -58px" };
    case "corners":  return { ...layer, backgroundImage: cardArt(kind, tone), backgroundSize: "78px 52px", backgroundPosition: "right top" };
    default:         return null;
  }
}

/** The second bunch of "corners", for the bottom left: the first one turned
 *  round. Null for every other kind. */
export function cornerFlowers(kind: Flowers, tone: Tone): CSSProperties | null {
  if (kind !== "corners") return null;
  return {
    position: "absolute", left: 0, bottom: 0, width: 78, height: 52, zIndex: -1, pointerEvents: "none",
    backgroundImage: cardArt("corners", tone), backgroundSize: "78px 52px", backgroundRepeat: "no-repeat", transform: "rotate(180deg)",
  };
}

const once = <V,>(make: () => V) => { let v: V | undefined; return () => (v ??= make()); };

const MARK = once(() => css(20, 20, flower(10, 10, 9.4, { n: 6, fill: ROSE, heart: GOLD })));
/** The one flower that sits on the logo. */
export const logoFlower = (): string => MARK();

// The two that are on the app's own pink, not on the card.
const BIG_BLOOM = once(() => css(400, 400, flower(200, 200, 196, { n: 8, fill: "#ffdcea", heart: PETAL, wide: 0.4 })));

// Flowers on their stalks along the bottom of the screen. The stalks are long,
// so the flowers still stand above the small player when a song is on.
const MEADOW = once(() => {
  const grow: [number, number, number, number][] = [[14, 46, 11, 0], [40, 22, 14, 1], [66, 52, 9, 2], [92, 30, 12, 0], [120, 58, 10, 1], [146, 26, 13, 2], [170, 48, 9, 0]];
  return css(184, 156, grow.map(([x, top, r, k]) =>
    stem(`M${x} 156C${x + 4} ${r1((156 + top) / 2)} ${x - 4} ${top + 16} ${x} ${top}`, "#f1a3c0", 1.6)
    + leaf(x, top + 30, 13, k % 2 ? 50 : -50, PINK)
    + flower(x, top, r, k === 0 ? { n: 6, fill: WHITE, heart: GOLD } : k === 1 ? { n: 5, fill: ROSE, heart: WHITE } : { n: 12, fill: WHITE, heart: GOLD })).join(""));
});

/** What the app's own background gets. Paint only. */
export function groundFlowers(kind: Flowers): CSSProperties {
  switch (kind) {
    case "bloom":  return { backgroundImage: BIG_BLOOM(), backgroundRepeat: "no-repeat", backgroundSize: "420px 420px", backgroundPosition: "right -150px bottom 60px" };
    case "meadow": return { backgroundImage: MEADOW(), backgroundRepeat: "repeat-x", backgroundSize: "184px 156px", backgroundPosition: "left bottom" };
    default:       return {};
  }
}
