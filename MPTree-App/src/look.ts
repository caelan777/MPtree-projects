import { useSyncExternalStore } from "react";
import { Preferences } from "@capacitor/preferences";

// ─── LOOK ────────────────────────────────────────────────────────────────────
// The Pro personalisation: which shade of dark and of light, what colour the
// header card is in each, which record, which app icon. One small store rather
// than a row of useStates in App.tsx, because the record lives three components
// down (PlayerExpandSheet, SpinningDisc) and the loading screen reads it too.
//
// Dark mode and light mode are personalised separately: each has its own shade,
// its own header card and its own record, so switching modes switches the
// whole look. The app icon is one for both.

/** The records of the Aviela style, drawn in flowers.ts. */
export const FLOWER_RECORDS = ["daisy", "bloom", "blossom", "lines", "wreath", "petals", "ditsy", "bouquet", "dahlia", "oxeye", "night", "branch", "posy"] as const;
export type FlowerRecord = typeof FLOWER_RECORDS[number];
export const isFlowerRecord = (v: string): v is FlowerRecord => (FLOWER_RECORDS as readonly string[]).includes(v);
/** The records of the Lantern style, drawn in lantern.ts. */
export const LANTERN_RECORDS = ["lantern", "lantern-rings", "lantern-core", "lantern-dash", "lantern-solid", "lantern-burst"] as const;
export type LanternRecord = typeof LANTERN_RECORDS[number];
export const isLanternRecord = (v: string): v is LanternRecord => (LANTERN_RECORDS as readonly string[]).includes(v);
export type VinylSkin  = "classic" | "white" | "smoke" | "marble" | LanternRecord | FlowerRecord;
/** How the app itself wears flowers: not at all, or one of Aviela's ways. */
export const FLOWER_KINDS = ["sprig", "garland", "mark", "bloom", "vine", "corners", "confetti", "lines", "daisies", "meadow"] as const;
export type AvielaFlowers = typeof FLOWER_KINDS[number];
/** What Aviela draws on the app, or nothing. */
export type Flowers    = "none" | AvielaFlowers;
export type DarkShade  = "classic" | "graphite" | "lantern";
/** "lantern" is only ever a header card: the green one on the Lantern page. */
export type LightShade = "classic" | "paper" | "stone" | "pink" | "sage" | "lantern";
export type AppIcon    = "classic" | "light" | "vinyl" | "stamp";
/** The header card follows the app ("default") or wears any shade of either
 *  mode, so a light card on a dark app is allowed. */
export type CardShade  = "default" | `dark:${DarkShade}` | `light:${LightShade}`;

/** The header cards Lantern comes with: its own dark green, green, black or white. */
export const LANTERN_CARDS: readonly CardShade[] = ["dark:lantern", "light:lantern", "dark:classic", "light:classic"];
/** A colour of the app with its mode, written the way a header card's is. */
export type AppColour = Exclude<CardShade, "default">;
/** The colours Lantern can be worn on: the usual ones, and its own. */
export const LANTERN_COLOURS: readonly AppColour[] = [
  "dark:classic", "dark:graphite", "light:classic", "light:paper", "light:stone", "light:pink", "light:sage", "dark:lantern",
];
/** The header cards Aviela comes with: white, pink or black. */
export const AVIELA_CARDS: readonly CardShade[] = ["light:classic", "light:pink", "dark:classic"];

export type Look = {
  vinylDark: VinylSkin;
  vinylLight: VinylSkin;
  dark: DarkShade;
  light: LightShade;
  cardDark: CardShade;
  cardLight: CardShade;
  icon: AppIcon;
  flowers: Flowers;
  /** What was last picked on the Aviela page, so coming back to the style
   *  brings back the same record, the same flowers and the same header card. */
  aviela: { record: FlowerRecord; flowers: AvielaFlowers; card: CardShade };
  /** And the same for the Lantern page: its record, its header card and the
   *  colour of the app under them. */
  lantern: { record: LanternRecord; card: CardShade; colour: AppColour };
  /** Tapping the record in the player turns it into a picture disc of the
   *  cover. Free, and remembered. */
  photoDisc: boolean;
};

export const DEFAULT_LOOK: Look = {
  vinylDark: "classic", vinylLight: "classic", dark: "classic", light: "classic",
  cardDark: "default", cardLight: "default", icon: "classic", photoDisc: false,
  flowers: "none", aviela: { record: "daisy", flowers: "sprig", card: "light:classic" },
  lantern: { record: "lantern", card: "dark:lantern", colour: "dark:classic" },
};

/** What anyone gets without Pro. */
export const FREE = { vinyl: "classic", dark: "classic", light: "classic", card: "default", icon: "classic" } as const;

/** The records anyone may have: the black one, and the white one that goes
 *  with the White style, which is free as a whole. */
export const isFreeVinyl = (v: VinylSkin): boolean => v === "classic" || v === "white";

const KEY = "mptree_look";

// The saved look, and while the Personalise sheet is open, a preview of what is
// being tried. Without Pro anything can be tried; the preview is dropped when
// the sheet closes, unless Pro is bought first.
let look: Look = DEFAULT_LOOK;
let preview: Look | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
const snapshot = () => preview ?? look;
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function useLook(): Look {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function getLook(): Look { return preview ?? look; }

// Which mode the app is in, so the record can follow it. App.tsx keeps it set.
let mode: "dark" | "light" = "dark";
const modeSnapshot = () => mode;
export function setLookMode(next: "dark" | "light"): void {
  if (next === mode) return;
  mode = next;
  emit();
}
/** The record for the mode the app is in. */
export function useVinyl(): VinylSkin {
  const l = useLook();
  const m = useSyncExternalStore(subscribe, modeSnapshot, modeSnapshot);
  return m === "dark" ? l.vinylDark : l.vinylLight;
}
export function isPreviewing(): boolean { return preview !== null; }

export async function loadLook(): Promise<Look> {
  try {
    const { value } = await Preferences.get({ key: KEY });
    if (value) {
      const stored = JSON.parse(value);
      look = { ...DEFAULT_LOOK, ...stored };
      // Test builds before 10 had one record for both modes.
      if (typeof stored.vinyl === "string" && !stored.vinylDark) look = { ...look, vinylDark: stored.vinyl, vinylLight: stored.vinyl };
      // Picture disc used to be one of the records; it is the tap now.
      if ((stored.vinyl as string) === "picture") look = { ...look, photoDisc: true };
      for (const k of ["vinylDark", "vinylLight"] as const) {
        if (!(["classic", "white", "smoke", "marble"] as string[]).includes(look[k]) && !isFlowerRecord(look[k]) && !isLanternRecord(look[k])) look = { ...look, [k]: "classic" };
      }
      // Test build 38 had light on the card for Lantern; that is gone.
      if (look.flowers !== "none" && !(FLOWER_KINDS as readonly string[]).includes(look.flowers)) look = { ...look, flowers: "none" };
      // Test build 35 had two kinds that are gone, and no card of Aviela's own.
      look = { ...look, aviela: { ...DEFAULT_LOOK.aviela, ...look.aviela } };
      if (!isFlowerRecord(look.aviela.record) || !(FLOWER_KINDS as readonly string[]).includes(look.aviela.flowers) || !AVIELA_CARDS.includes(look.aviela.card)) look = { ...look, aviela: DEFAULT_LOOK.aviela };
      {
        const l = { ...DEFAULT_LOOK.lantern, ...look.lantern };
        const ok = isLanternRecord(l.record) && LANTERN_CARDS.includes(l.card) && LANTERN_COLOURS.includes(l.colour);
        look = { ...look, lantern: ok ? { record: l.record, card: l.card, colour: l.colour } : DEFAULT_LOOK.lantern };
      }
      delete (look as Partial<Record<"vinyl", unknown>>).vinyl;
      // Test builds 2 and 3 had plum and pink for dark mode, and there was an
      // AMOLED black until October 2026: black is the nearest to all of them.
      if (!(["classic", "graphite", "lantern"] as string[]).includes(look.dark)) look = { ...look, dark: "classic" };
      for (const k of ["cardDark", "cardLight"] as const) {
        if (String(look[k]) === "dark:amoled") look = { ...look, [k]: "dark:classic" };
        if (/^dark:(purple|pink)$/.test(String(look[k]))) look = { ...look, [k]: "default" };
      }
      // The first test build had one card skin (glass, line...) for both modes.
      if (typeof look.cardDark !== "string" || !/^(default|dark:|light:)/.test(look.cardDark)) look = { ...look, cardDark: "default" };
      if (typeof look.cardLight !== "string" || !/^(default|dark:|light:)/.test(look.cardLight)) look = { ...look, cardLight: "default" };
    }
  } catch { /* a broken entry just means the default look */ }
  emit();
  return look;
}

export function saveLook(patch: Partial<Look>): Look {
  look = { ...look, ...patch };
  // Something kept while trying other things stays part of the preview too.
  if (preview) preview = { ...preview, ...patch };
  Preferences.set({ key: KEY, value: JSON.stringify(look) }).catch(() => {});
  emit();
  return look;
}

/** Shows a change without keeping it. */
export function previewLook(patch: Partial<Look>): void {
  preview = { ...(preview ?? look), ...patch };
  emit();
}

/** Keeps what is being previewed, once it may be kept (Pro was bought). */
export function keepPreview(): void {
  if (!preview) return;
  const kept = preview;
  preview = null;
  saveLook(kept);
}

/** Drops what was being tried. */
export function endPreview(): void {
  if (!preview) return;
  preview = null;
  emit();
}

// The Personalise page's own step back, out of a style's page, while it has
// one. The phone's back button asks here before it closes the page.
// It answers whether it took the step itself; when it did not, the page closes.
let back: (() => boolean) | null = null;
export function setLookBack(step: (() => boolean) | null): void { back = step; }
/** True when the page took the step back itself. */
export function lookBack(): boolean {
  return back ? back() : false;
}

/** Whether what is on show differs from what was applied. */
export function hasLookChanges(): boolean {
  return preview !== null && JSON.stringify(preview) !== JSON.stringify(look);
}

/** Whether a look is made of free things only, so it can be kept without Pro. */
export function isFreeLook(l: Look): boolean {
  return l.dark === FREE.dark && l.light === FREE.light && l.cardDark === FREE.card && l.cardLight === FREE.card
    && isFreeVinyl(l.vinylDark) && isFreeVinyl(l.vinylLight) && l.flowers === "none";
}

// ─── Lantern's question ──────────────────────────────────────────────────────
// Putting Lantern on the first time asks one thing first (LanternGate), once
// only. Whoever answers that they are afraid cannot wear it for a week. Kept on this device only: it is
// a moment, not a setting, and has no business following the account around.
const AFRAID_KEY = "mptree_lantern_afraid";
const AFRAID_DAYS = 7;
const ASKED_KEY = "mptree_lantern_asked";
let asked = false;
const DAY_MS = 24 * 60 * 60 * 1000;
let afraidUntil = 0;

/** How many days Lantern is still shut for; 0 when it is open. */
export function lanternLockDays(): number {
  return Math.max(0, Math.ceil((afraidUntil - Date.now()) / DAY_MS));
}
export async function loadLanternLock(): Promise<number> {
  try {
    const { value } = await Preferences.get({ key: AFRAID_KEY });
    afraidUntil = Number(value) || 0;
    asked = (await Preferences.get({ key: ASKED_KEY })).value === "1";
  } catch { /* open, then */ }
  return lanternLockDays();
}
export function lockLantern(): number {
  afraidUntil = Date.now() + AFRAID_DAYS * DAY_MS;
  Preferences.set({ key: AFRAID_KEY, value: String(afraidUntil) }).catch(() => {});
  return lanternLockDays();
}
/** Whether the ring has asked already. It asks once. */
export function lanternAsked(): boolean { return asked; }
export function markLanternAsked(): void {
  asked = true;
  Preferences.set({ key: ASKED_KEY, value: "1" }).catch(() => {});
}
/** Open again, and ready to be asked again: for test builds. */
export function unlockLantern(): void {
  afraidUntil = 0;
  asked = false;
  Preferences.remove({ key: AFRAID_KEY }).catch(() => {});
  Preferences.remove({ key: ASKED_KEY }).catch(() => {});
}

/** Losing Pro (a refund, or locking a test build again) puts the free look
 *  back. The picture disc tap is free, so it stays as it was. */
export function resetLook(): void {
  preview = null;
  // The white record is free, so it is not taken off either.
  const kept = (v: VinylSkin): VinylSkin => (isFreeVinyl(v) ? v : DEFAULT_LOOK.vinylDark);
  saveLook({ ...DEFAULT_LOOK, vinylDark: kept(look.vinylDark), vinylLight: kept(look.vinylLight), photoDisc: look.photoDisc });
}
