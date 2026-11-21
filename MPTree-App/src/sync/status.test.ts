import { describe, it, expect } from "vitest";
import { syncStatus, syncSummary } from "./status";
import type { SyncState } from "./engine";

// The account page shows one status at a time. These pin the order: a problem
// first, then what is moving, then what is waiting, and otherwise all set.

const me = { id: "me", name: "Pixel 8", addedAt: 0 };
const tab = { id: "tab", name: "Galaxy Tab", addedAt: 0 };
const songs: SyncState["songs"] = {
  here: 10, missing: 0, theyMiss: 0, arrived: 0, waitingOn: [],
  inDrive: { count: 0, bytes: 0 }, notShared: 0, received: 0, absent: [], doubles: [],
};
const on = (patch: Partial<SyncState> = {}, song: Partial<SyncState["songs"]> = {}): SyncState => ({
  phase: "on", deviceId: "me", account: { email: "a@b.c", name: "A" }, devices: [me, tab],
  pausedNoPro: false, saving: false, songs: { ...songs, ...song }, deleted: [], deletedLoaded: true, ready: true, mobileData: false,
  ...patch,
});
const moving = { dir: "in" as const, name: "Song", done: 1, total: 2, via: "direct" as const, peer: "Galaxy Tab" };

describe("sync status", () => {
  it("is all set when nothing waits", () => {
    expect(syncStatus(on()).head).toBe("All set");
    expect(syncSummary(on(), true)).toBe("All set · a@b.c");
  });

  it("puts a problem before a song on its way", () => {
    const s = on({ problem: "offline" }, { moving, missing: 3 });
    expect(syncStatus(s).head).toBe("No internet");
    expect(syncSummary(s, true)).toBe("Paused · no internet");
  });

  it("shows a song on its way, with how many follow", () => {
    const st = syncStatus(on({}, { moving, missing: 3 }));
    expect(st.head).toBe("Getting “Song” from Galaxy Tab");
    expect(st.progress?.note).toContain("2 more after this");
    expect(st.flow).toBe("in");
  });

  it("says which device to open when the songs are on a closed one", () => {
    const st = syncStatus(on({}, { missing: 4, waitingOn: ["Galaxy Tab"] }));
    expect(st.head).toBe("4 songs are still on Galaxy Tab");
    expect(st.icon).toBe("clock");
  });

  it("offers mobile data while songs wait for wifi", () => {
    expect(syncStatus(on({}, { missing: 2, note: "wifi" })).acts).toEqual(["mobile"]);
  });

  it("offers to add a device when this is the only one", () => {
    const st = syncStatus(on({ devices: [me] }));
    expect(st.head).toBe("Only this device so far");
    expect(st.acts).toEqual(["add"]);
  });

  it("offers Google storage and a retry when it is full", () => {
    expect(syncStatus(on({ problem: "full" })).acts).toEqual(["storage", "retry"]);
  });

  it("says paused without Pro, and off when signed out", () => {
    expect(syncSummary(on({ pausedNoPro: true }), false)).toBe("Paused · sync is part of MPTree Pro");
    expect(syncSummary({ ...on(), phase: "off" }, true)).toBe("Off · sign in to share your music between devices");
  });
});
