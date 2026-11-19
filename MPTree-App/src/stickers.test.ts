import { describe, it, expect } from "vitest";
import { cleanSetups, cleanSticker, setupById, freeName, READY_MADE, MAX_STICKERS, isReadyMade } from "./stickers";

describe("stickers", () => {
  it("keeps a good setup as it is", () => {
    const s = [{ id: "s1", name: "Mine", items: [{ k: "sprig", on: "card", x: 0.8, y: 0.3, w: 0.4, r: 10 }] }];
    expect(cleanSetups(s)).toEqual(s);
  });

  it("leaves out what is broken, and never keeps a ready-made one as saved", () => {
    const out = cleanSetups([
      { id: "s1", name: "A", items: [{ k: "sprig", on: "card", x: 0.5, y: 0.5, w: 0.2, r: 0 }, { k: "rose", on: "card", x: 0, y: 0, w: 0.2, r: 0 }, { k: "daisy", on: "sky", x: 0, y: 0, w: 0.2, r: 0 }] },
      { id: "made:sprig", name: "Sprig", items: [] },
      { name: "no id", items: [] },
      "nonsense",
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].items).toHaveLength(1);
  });

  it("keeps a sticker on the screen and its turn under a full circle", () => {
    expect(cleanSticker({ k: "bloom", on: "page", x: 9, y: -9, w: 9, r: -30 })).toEqual({ k: "bloom", on: "page", x: 1.25, y: -0.25, w: 1.3, r: 330 });
  });

  it("keeps no more than the most stickers a setup may have", () => {
    const items = Array.from({ length: MAX_STICKERS + 5 }, () => ({ k: "flower", on: "page", x: 0.5, y: 0.5, w: 0.1, r: 0 }));
    expect(cleanSetups([{ id: "s", name: "Many", items }])[0].items).toHaveLength(MAX_STICKERS);
  });

  it("finds ready-made and saved setups by id", () => {
    const saved = [{ id: "s9", name: "Mine", items: [] }];
    expect(setupById("made:meadow", saved)).toBe(READY_MADE.find(s => s.id === "made:meadow"));
    expect(setupById("s9", saved)?.name).toBe("Mine");
    expect(setupById("gone", saved)).toBeNull();
    expect(setupById(null, saved)).toBeNull();
    expect(isReadyMade("made:sprig")).toBe(true);
    expect(isReadyMade("s9")).toBe(false);
  });

  it("gives a new setup a name that is not taken", () => {
    const saved = [{ id: "a", name: "My stickers", items: [] }, { id: "b", name: "My stickers 2", items: [] }];
    expect(freeName([], "My stickers")).toBe("My stickers");
    expect(freeName(saved, "My stickers")).toBe("My stickers 3");
  });

  it("puts every ready-made sticker somewhere it can be seen", () => {
    for (const s of READY_MADE) for (const i of s.items) {
      const c = cleanSticker(i)!;
      expect([c.x, c.y, c.w, c.on, c.k]).toEqual([i.x, i.y, i.w, i.on, i.k]);
      expect((c.r - i.r + 720) % 360).toBe(0);
      expect(i.x > 0 && i.x < 1 && i.y > 0 && i.y < 1).toBe(true);
    }
  });
});
