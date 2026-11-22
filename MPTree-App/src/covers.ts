import type { Playlist } from "./types";

// ─── COVERS: HOW THEY ARE KEPT ───────────────────────────────────────────────
//
// A cover someone picks is kept as a picture in text (a data URL), in the
// same settings file as the rest of their library. Android backs that file up
// by itself (backup_rules.xml), so a reinstall or a new phone gets the
// playlists and covers back. It takes at most 25 MB, and over that it backs
// up nothing at all. Covers are nearly all of it.
//
// So a new cover is kept as WebP: as sharp as the JPEG it used to be, at about
// two thirds of the size, and much less for screenshots and drawings
// (measured 20 Nov 2026 with this same encoder: tmp-edit/covers). And when the
// covers together pass 20 MB, the biggest are made smaller, quietly, until
// they are under 18 MB: first as WebP at the size they have, which looks the
// same, and only if that is not enough at 512 and then 400 pixels.

/** Above this the covers are made smaller (in characters, about bytes). */
export const COVER_BUDGET = 20 * 1024 * 1024;
/** Where making them smaller stops, so it does not start again at once. */
export const COVER_TARGET = 18 * 1024 * 1024;
const STEPS = [{ px: 640, q: 0.8 }, { px: 512, q: 0.78 }, { px: 400, q: 0.75 }];

/** A canvas as a cover: WebP, or JPEG where WebP cannot be made (Safari
 *  makes a PNG instead, which is far bigger). */
export function encodeCover(canvas: HTMLCanvasElement, quality = 0.8): string {
  const webp = canvas.toDataURL("image/webp", quality);
  if (webp.startsWith("data:image/webp")) return webp;
  return canvas.toDataURL("image/jpeg", Math.min(0.9, quality + 0.02));
}

/** A cover again, at most `px` on its long side. The cover as it was when
 *  anything goes wrong, so a picture is never lost. */
export function recodeCover(url: string, px: number, quality: number): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    img.onerror = () => resolve(url);
    img.onload = () => {
      try {
        const scale = Math.min(1, px / Math.max(img.naturalWidth, img.naturalHeight, 1));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(url); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(encodeCover(canvas, quality));
      } catch {
        resolve(url);
      }
    };
    img.src = url;
  });
}

type Meta = Record<string, { customPhoto?: string }>;
const isPicture = (v: unknown): v is string => typeof v === "string" && v.startsWith("data:image/");

/** How much the covers take, in characters (about bytes). */
export function coverChars(meta: Meta, playlists: Playlist[]): number {
  let n = 0;
  for (const m of Object.values(meta)) if (isPicture(m?.customPhoto)) n += m.customPhoto.length;
  for (const p of playlists) if (isPicture(p.coverPhoto)) n += p.coverPhoto.length;
  return n;
}

/** The order covers are made smaller in: the biggest first, since one of
 *  those saves what ten small ones would. */
export function biggestFirst(sizes: { key: string; size: number }[]): string[] {
  return [...sizes].sort((a, b) => b.size - a.size).map(s => s.key);
}

/** Makes the covers smaller when together they pass COVER_BUDGET. Null when
 *  there was nothing to do; otherwise the library with the smaller covers. */
export async function shrinkCovers<M extends Meta>(
  meta: M, playlists: Playlist[], recode: typeof recodeCover = recodeCover,
): Promise<null | { meta: M; playlists: Playlist[]; before: number; after: number }> {
  const before = coverChars(meta, playlists);
  if (before <= COVER_BUDGET) return null;
  const m: Meta = { ...meta };
  const p = playlists.map(x => ({ ...x }));
  const get = (key: string) => key.startsWith("p:") ? p[Number(key.slice(2))].coverPhoto : m[key.slice(2)]?.customPhoto;
  const put = (key: string, url: string) => {
    if (key.startsWith("p:")) p[Number(key.slice(2))].coverPhoto = url;
    else m[key.slice(2)] = { ...m[key.slice(2)], customPhoto: url };
  };
  let now = before;
  for (const step of STEPS) {
    const sizes: { key: string; size: number }[] = [];
    for (const [id, x] of Object.entries(m)) if (isPicture(x?.customPhoto)) sizes.push({ key: "m:" + id, size: x.customPhoto.length });
    p.forEach((x, i) => { if (isPicture(x.coverPhoto)) sizes.push({ key: "p:" + i, size: x.coverPhoto.length }); });
    for (const key of biggestFirst(sizes)) {
      if (now <= COVER_TARGET) break;
      const url = get(key);
      if (!url) continue;
      // A WebP at full size is what the first step makes: again would only
      // blur it a little for nothing.
      if (step === STEPS[0] && url.startsWith("data:image/webp")) continue;
      const smaller = await recode(url, step.px, step.q);
      // Only worth it when it saves something real.
      if (smaller.length > url.length * 0.9) continue;
      now -= url.length - smaller.length;
      put(key, smaller);
    }
    if (now <= COVER_TARGET) break;
  }
  if (now === before) return null;
  return { meta: m as M, playlists: p, before, after: now };
}
