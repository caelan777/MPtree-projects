import { describe, it, expect } from "vitest";
import { biggestFirst, coverChars, shrinkCovers, COVER_BUDGET, COVER_TARGET } from "./covers";
import type { Playlist } from "./types";

// Covers as text of a given length; the "recoder" halves them, so the test
// runs without pictures.
const pic = (n: number, kind = "jpeg") => `data:image/${kind};base64,` + "A".repeat(n);
const half = async (url: string) => url.slice(0, Math.ceil(url.length / 2));
const pl = (cover?: string): Playlist => ({ id: "p", name: "P", songIds: [], createdAt: 0, ...(cover ? { coverPhoto: cover } : {}) }) as Playlist;

describe("covers and the 25 MB of Android's backup", () => {
  it("orders the biggest first", () => {
    expect(biggestFirst([{ key: "a", size: 1 }, { key: "b", size: 9 }, { key: "c", size: 5 }])).toEqual(["b", "c", "a"]);
  });
  it("counts song and playlist covers, nothing else", () => {
    expect(coverChars({ x: { customPhoto: pic(10) }, y: {} }, [pl(pic(5)), pl()])).toBe(pic(10).length + pic(5).length);
  });
  it("leaves covers alone under the budget", async () => {
    expect(await shrinkCovers({ x: { customPhoto: pic(1000) } }, [], half)).toBeNull();
  });
  it("makes the biggest smaller until under the target", async () => {
    const meta: Record<string, { customPhoto?: string }> = {};
    for (let i = 0; i < 30; i++) meta["s" + i] = { customPhoto: pic(Math.floor(COVER_BUDGET / 25)) };
    const r = await shrinkCovers(meta, [pl(pic(1000))], half);
    expect(r).not.toBeNull();
    expect(r!.after).toBeLessThanOrEqual(COVER_TARGET);
    expect(coverChars(r!.meta, r!.playlists)).toBe(r!.after);
    // The small playlist cover was not needed.
    expect(r!.playlists[0].coverPhoto).toBe(pic(1000));
  });
});
