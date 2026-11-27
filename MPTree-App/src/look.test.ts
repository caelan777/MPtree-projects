import { describe, it, expect, vi, beforeEach } from "vitest";

// Preferences as a plain map, so loadLook reads what each test puts there.
const store = new Map<string, string>();
vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: store.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => { store.set(key, value); },
    remove: async ({ key }: { key: string }) => { store.delete(key); },
  },
}));

const base = { vinylDark: "classic", vinylLight: "classic", dark: "classic", light: "classic", cardDark: "default", cardLight: "default", icon: "classic", photoDisc: true, flowers: "none" };

async function load(stored: object) {
  store.clear();
  store.set("mptree_cover_disc", "1");
  store.set("mptree_look", JSON.stringify(stored));
  vi.resetModules();
  const m = await import("./look");
  return m.loadLook();
}

describe("the three worlds", () => {
  beforeEach(() => { store.clear(); });

  it("reads a look from before test build 128 as Aviela when it was pink with flowers", async () => {
    const l = await load({ ...base, light: "pink", flowers: "sprig", vinylLight: "lily" });
    expect(l.env).toBe("aviela");
  });

  it("reads a Lantern record without flowers as Lantern", async () => {
    const l = await load({ ...base, vinylDark: "lantern", vinylLight: "lantern" });
    expect(l.env).toBe("lantern");
  });

  it("reads anything else as Custom, and keeps what it was as Custom's own", async () => {
    const l = await load({ ...base, dark: "graphite", cardDark: "light:paper", vinylDark: "marble" });
    expect(l.env).toBe("custom");
    expect(l.custom.dark).toBe("graphite");
    expect(l.custom.vinylDark).toBe("marble");
  });

  it("keeps the world saved since, even when it looks like another one", async () => {
    // A Lantern record picked in Custom stays Custom.
    const l = await load({ ...base, env: "custom", vinylDark: "lantern", vinylLight: "lantern" });
    expect(l.env).toBe("custom");
  });

  it("brings a turntable back as the record, which is all there is now", async () => {
    const l = await load({ ...base, playerStyle: "turntable", custom: { playerStyle: "turntable" } });
    expect(l.playerStyle).toBe("record");
    expect(l.custom.playerStyle).toBe("record");
  });

  it("drops a ready-made sticker setup that is gone", async () => {
    const l = await load({ ...base, stickers: "made:meadow" });
    expect(l.stickers).toBeNull();
  });
});
