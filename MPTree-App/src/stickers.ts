import { STICKER_KINDS, type StickerKind } from "./flowers";

// ─── STICKERS ────────────────────────────────────────────────────────────────
// Aviela's flowers put down by hand: on the header card, or on the songs page
// behind the list. What is put down together is a setup. A setup is saved
// under a name and can be worn again later, like a record, and a few come
// ready-made. The setups and which one is on are part of the look (look.ts),
// so they go through Apply, sync and backups like every other pick.

export type StickerPlace = "card" | "page";
/** One sticker. x and y: where its middle is, as a share of the width and the
 *  height of what it lies on (the header card, or the screen); w: how wide it
 *  is, as a share of that width; r: how far it is turned, in degrees. */
export type Sticker = { k: StickerKind; on: StickerPlace; x: number; y: number; w: number; r: number };
export type StickerSetup = { id: string; name: string; items: Sticker[] };

export const MAX_STICKERS = 30;
export const MAX_SETUPS = 24;

/** How wide a sticker comes out when it is first put down, as a share of the
 *  screen's width. */
export const START_WIDTH: Record<StickerKind, number> = {
  sprig: 0.36, bunch: 0.24, bloom: 0.3, flower: 0.1, daisy: 0.1, garland: 0.28, vine: 0.3, lines: 0.36, meadow: 0.2,
};

const S = (k: StickerKind, on: StickerPlace, x: number, y: number, w: number, r = 0): Sticker => ({ k, on, x, y, w, r });

/** The ready-made setups. Their ids start with "made:". They are not changed,
 *  only copied; their names are English here and translated where shown. */
export const READY_MADE: StickerSetup[] = [
  { id: "made:sprig", name: "Sprig", items: [S("sprig", "card", 0.84, 0.3, 0.38), S("flower", "page", 0.88, 0.58, 0.07, 14), S("daisy", "page", 0.08, 0.74, 0.06)] },
  { id: "made:meadow", name: "Meadow", items: [
    S("meadow", "page", 0.08, 0.82, 0.17), S("meadow", "page", 0.27, 0.84, 0.15, -4), S("meadow", "page", 0.46, 0.83, 0.17, 3),
    S("meadow", "page", 0.65, 0.84, 0.15, -2), S("meadow", "page", 0.84, 0.82, 0.17, 4), S("flower", "card", 0.93, 0.2, 0.09, 10),
  ] },
  { id: "made:bunches", name: "Bunches", items: [S("bunch", "card", 0.88, 0.22, 0.26), S("bunch", "card", 0.12, 0.8, 0.24, 180), S("bloom", "page", 0.9, 0.7, 0.42, 12)] },
  { id: "made:daisies", name: "Daisies", items: [
    S("garland", "card", 0.18, 0.9, 0.3), S("garland", "card", 0.5, 0.92, 0.3, 4), S("garland", "card", 0.82, 0.9, 0.3, -3),
    S("daisy", "page", 0.9, 0.36, 0.08, 20), S("daisy", "page", 0.08, 0.5, 0.07), S("daisy", "page", 0.86, 0.66, 0.06, 40),
  ] },
];

export const isReadyMade = (id: string | null | undefined): boolean => !!id && id.startsWith("made:");

/** The setup with this id: a ready-made one or one of the person's own. */
export function setupById(id: string | null | undefined, saved: readonly StickerSetup[]): StickerSetup | null {
  if (!id) return null;
  return READY_MADE.find(s => s.id === id) ?? saved.find(s => s.id === id) ?? null;
}

export const newSetupId = (): string => "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** A name not taken yet: "My stickers", then "My stickers 2", and so on. */
export function freeName(saved: readonly StickerSetup[], base: string): string {
  const taken = new Set(saved.map(s => s.name));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
}

const isKind = (v: unknown): v is StickerKind => typeof v === "string" && (STICKER_KINDS as readonly string[]).includes(v);
const num = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null;

/** One sticker read back from storage, or null when it is not one. */
export function cleanSticker(v: unknown): Sticker | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const x = num(o.x, -0.25, 1.25), y = num(o.y, -0.25, 1.25), w = num(o.w, 0.03, 1.3), r = num(o.r, -100000, 100000);
  if (!isKind(o.k) || (o.on !== "card" && o.on !== "page") || x === null || y === null || w === null || r === null) return null;
  return { k: o.k, on: o.on, x, y, w, r: ((r % 360) + 360) % 360 };
}

/** The saved setups read back from storage: what is broken is left out. */
export function cleanSetups(v: unknown): StickerSetup[] {
  if (!Array.isArray(v)) return [];
  const out: StickerSetup[] = [];
  for (const s of v) {
    if (!s || typeof s !== "object") continue;
    const o = s as Record<string, unknown>;
    if (typeof o.id !== "string" || !o.id || isReadyMade(o.id) || typeof o.name !== "string") continue;
    const items = Array.isArray(o.items) ? o.items.map(cleanSticker).filter((x): x is Sticker => !!x).slice(0, MAX_STICKERS) : [];
    out.push({ id: o.id, name: o.name.slice(0, 40), items });
    if (out.length >= MAX_SETUPS) break;
  }
  return out;
}
