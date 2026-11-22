import { STICKER_KINDS, type StickerKind } from "./flowers";

// ─── STICKERS ────────────────────────────────────────────────────────────────
// Aviela's flowers put down by hand: on the header card, or on the songs page
// behind the list. What is put down together is a setup, saved under a name
// and worn again later, like a record. Custom (the Stickers page) and Aviela
// (Custom in its row of flowers) each have setups of their own; they do not
// share them. The setups and which one is on are part of the look (look.ts),
// so they go through Apply, sync and backups like every other pick.

export type StickerPlace = "card" | "page";
/** One sticker. x and y: where its middle is, as a share of the width and the
 *  height of what it lies on (the header card, or the screen); w: how wide it
 *  is, as a share of that width; r: how far it is turned, in degrees; f: it is
 *  mirrored. */
export type Sticker = { k: StickerKind; on: StickerPlace; x: number; y: number; w: number; r: number; f?: boolean };
/** Whose setup it is: Custom's or Aviela's. */
export type StickerEnv = "custom" | "aviela";
export type StickerSetup = { id: string; name: string; items: Sticker[]; env?: StickerEnv };

export const MAX_STICKERS = 30;
export const MAX_SETUPS = 24;

/** How wide a sticker comes out when it is first put down, as a share of the
 *  screen's width. */
export const START_WIDTH: Record<StickerKind, number> = {
  sprig: 0.36, bunch: 0.24, bloom: 0.3, flower: 0.1, daisy: 0.1, garland: 0.28, vine: 0.3, lines: 0.36, meadow: 0.2,
};

/** The setup with this id. (Test build 127 had ready-made ones too, with ids
 *  starting "made:"; Caelan had them taken out.) */
export function setupById(id: string | null | undefined, saved: readonly StickerSetup[]): StickerSetup | null {
  if (!id) return null;
  return saved.find(s => s.id === id) ?? null;
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
  return { k: o.k, on: o.on, x, y, w, r: ((r % 360) + 360) % 360, ...(o.f === true ? { f: true } : {}) };
}

/** The saved setups read back from storage: what is broken is left out. */
export function cleanSetups(v: unknown): StickerSetup[] {
  if (!Array.isArray(v)) return [];
  const out: StickerSetup[] = [];
  for (const s of v) {
    if (!s || typeof s !== "object") continue;
    const o = s as Record<string, unknown>;
    if (typeof o.id !== "string" || !o.id || o.id.startsWith("made:") || typeof o.name !== "string") continue;
    const items = Array.isArray(o.items) ? o.items.map(cleanSticker).filter((x): x is Sticker => !!x).slice(0, MAX_STICKERS) : [];
    out.push({ id: o.id, name: o.name.slice(0, 40), items, env: o.env === "aviela" ? "aviela" : "custom" });
    if (out.length >= MAX_SETUPS) break;
  }
  return out;
}
