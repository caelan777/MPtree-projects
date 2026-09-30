import { describe, it, expect } from "vitest";
import type { Song, Playlist, SongMeta } from "../types";
import { buildLocal, merge, apply, missingFrom, toKey, PENDING, type LibDoc } from "./model";

// Two phones with the same two songs at different paths, and a third song
// only phone A has.
const FP: Record<string, string> = {
  "/a/one.mp3": "fp1", "/a/two.mp3": "fp2", "/a/three.mp3": "fp3",
  "/b/Music/one.mp3": "fp1", "/b/Music/two.mp3": "fp2",
};
const fpOf = (p: string) => FP[p];
const pathOn = (prefix: string) => (fp: string) => Object.keys(FP).find(p => p.startsWith(prefix) && FP[p] === fp);

const song = (uri: string, extra: Partial<Song> = {}): Song => ({ id: uri, uri, title: uri.split("/").pop()!, artist: "", dateAdded: 1, ...extra });

type Phone = { songs: Song[]; removed: Song[]; meta: Record<string, SongMeta>; playlists: Playlist[]; settings: Record<string, string> };
const phoneA = (): Phone => ({
  songs: [song("/a/one.mp3"), song("/a/two.mp3"), song("/a/three.mp3")],
  removed: [], meta: {}, playlists: [], settings: {},
});
const phoneB = (): Phone => ({
  songs: [song("/b/Music/one.mp3"), song("/b/Music/two.mp3")],
  removed: [], meta: {}, playlists: [], settings: {},
});

/** One full round the way the engine does it: build, merge, apply. */
function round(p: Phone, prefix: string, base: LibDoc | null, remote: LibDoc | null) {
  const local = buildLocal({ ...p, fpOf });
  const merged = merge(base, local, remote);
  const out = apply(merged, { ...p, fpOf, pathOf: pathOn(prefix), coverOf: () => undefined });
  const next: Phone = { songs: out.songs, removed: out.removed, meta: out.meta, playlists: out.playlists, settings: { ...p.settings, ...(out.settings ?? {}) } };
  return { merged, next, out };
}

describe("keys", () => {
  it("names songs and cut tracks by fingerprint", () => {
    expect(toKey("/a/one.mp3", fpOf)).toBe("fp1");
    expect(toKey("/a/one.mp3__cut__1000__5000__77", fpOf)).toBe("fp1__cut__1000__5000__77");
    expect(toKey(PENDING + "fp9", fpOf)).toBe("fp9");
    expect(toKey("/gone.mp3", fpOf)).toBeUndefined();
  });
});

describe("merge", () => {
  it("carries a like from one phone to the other", () => {
    const a = phoneA();
    a.meta["/a/one.mp3"] = { liked: true, customName: "First" };
    const r1 = round(a, "/a/", null, null);
    const b = round(phoneB(), "/b/", null, r1.merged);
    expect(b.next.meta["/b/Music/one.mp3"]).toEqual({ liked: true, customName: "First" });
  });

  it("keeps changes made on both phones, and adds up plays", () => {
    const a = phoneA(); a.meta["/a/one.mp3"] = { playCount: 2 };
    const acc = round(a, "/a/", null, null).merged;
    const base = acc;
    // A renames and plays once more; B likes it and plays three times.
    const a2 = phoneA(); a2.meta["/a/one.mp3"] = { playCount: 3, customName: "Renamed" };
    const afterA = merge(base, buildLocal({ ...a2, fpOf }), acc);
    const b = phoneB(); b.meta["/b/Music/one.mp3"] = { playCount: 2 };
    const bBase = round(b, "/b/", null, acc).merged;
    const b2 = phoneB(); b2.meta["/b/Music/one.mp3"] = { playCount: 5, liked: true };
    const afterB = merge(bBase, buildLocal({ ...b2, fpOf }), afterA);
    expect(afterB.songs.fp1).toEqual({ playCount: 6, customName: "Renamed", liked: true });
  });

  it("puts a song in the bin on every phone, and brings it back", () => {
    const acc = round(phoneA(), "/a/", null, null).merged;
    const bJoin = round(phoneB(), "/b/", null, acc);
    // A bins song two.
    const a = phoneA(); a.removed = [a.songs[1]]; a.songs = [a.songs[0], a.songs[2]];
    const afterA = merge(acc, buildLocal({ ...a, fpOf }), acc);
    expect(afterA.songs.fp2?.bin).toBe(true);
    const b = round(bJoin.next, "/b/", bJoin.merged, afterA);
    expect(b.next.removed.map(s => s.id)).toEqual(["/b/Music/two.mp3"]);
    expect(b.next.songs.map(s => s.id)).toEqual(["/b/Music/one.mp3"]);
    // B restores it.
    const b2: Phone = { ...b.next, songs: [...b.next.songs, ...b.next.removed], removed: [] };
    const afterB = merge(b.merged, buildLocal({ ...b2, fpOf }), b.merged);
    expect(afterB.songs.fp2?.bin).toBeUndefined();
  });

  it("does not let a phone wipe what it does not have", () => {
    const a = phoneA(); a.meta["/a/three.mp3"] = { liked: true };
    const acc = round(a, "/a/", null, null).merged;
    const b = round(phoneB(), "/b/", null, acc);
    const again = merge(b.merged, buildLocal({ ...b.next, fpOf }), acc);
    expect(again.songs.fp3).toEqual({ liked: true });
  });

  it("takes the account's word for a song that just arrived", () => {
    const a = phoneA(); a.meta["/a/three.mp3"] = { customName: "Three" };
    const acc = round(a, "/a/", null, null).merged;
    const b = round(phoneB(), "/b/", null, acc);
    // three.mp3 lands on B with nothing set on it yet. B has no say about it
    // until the next round, or its empty name would win over "Three".
    const b2: Phone = { ...b.next, songs: [...b.next.songs, song("/b/Music/three.mp3")] };
    const local = buildLocal({ ...b2, fpOf: p => p === "/b/Music/three.mp3" ? "fp3" : fpOf(p) });
    expect(merge(b.merged, local, acc, new Set(["fp3"])).songs.fp3).toEqual({ customName: "Three" });
  });

  it("keeps a playlist's song that is not on this phone yet", () => {
    const a = phoneA();
    a.playlists = [{ id: "p1", name: "Mix", createdAt: 5, songIds: ["/a/three.mp3", "/a/one.mp3"] }];
    const acc = round(a, "/a/", null, null).merged;
    const b = round(phoneB(), "/b/", null, acc);
    expect(b.next.playlists[0].songIds).toEqual([PENDING + "fp3", "/b/Music/one.mp3"]);
    // And B adding a song leaves the pending one where it was.
    const b2 = { ...b.next, playlists: [{ ...b.next.playlists[0], songIds: [...b.next.playlists[0].songIds, "/b/Music/two.mp3"] }] };
    const after = merge(b.merged, buildLocal({ ...b2, fpOf }), acc);
    expect(after.playlists.p1.songs).toEqual(["fp3", "fp1", "fp2"]);
  });

  it("joins playlists edited on both phones", () => {
    const a = phoneA();
    a.playlists = [{ id: "p1", name: "Mix", createdAt: 5, songIds: ["/a/one.mp3"] }];
    const acc = round(a, "/a/", null, null).merged;
    const b = round(phoneB(), "/b/", null, acc);
    const a2 = { ...a, playlists: [{ ...a.playlists[0], songIds: ["/a/one.mp3", "/a/three.mp3"] }] };
    const afterA = merge(acc, buildLocal({ ...a2, fpOf }), acc);
    const b2 = { ...b.next, playlists: [{ ...b.next.playlists[0], name: "Road", songIds: ["/b/Music/two.mp3"] }] };
    const afterB = merge(b.merged, buildLocal({ ...b2, fpOf }), afterA);
    expect(afterB.playlists.p1).toEqual({ name: "Road", createdAt: 5, songs: ["fp2", "fp3"] });
  });

  it("takes the account's settings when a phone joins", () => {
    const a = phoneA(); a.settings = { mptree_lang: "\"nl\"" };
    const acc = round(a, "/a/", null, null).merged;
    const b = phoneB(); b.settings = { mptree_lang: "\"en\"", mptree_ui_size: "\"large\"" };
    const r = round(b, "/b/", null, acc);
    expect(r.out.settings).toEqual({ mptree_lang: "\"nl\"" });
    expect(r.merged.settings).toEqual({ mptree_lang: "\"nl\"", mptree_ui_size: "\"large\"" });
  });

  it("brings a cut track to a phone that has its song", () => {
    const a = phoneA();
    const cut = song("/a/one.mp3__cut__1000__5000__77", { uri: "/a/one.mp3", isCut: true, cutFrom: 1000, cutTo: 5000, title: "Intro" });
    a.songs = [cut, ...a.songs];
    const acc = round(a, "/a/", null, null).merged;
    const b = round(phoneB(), "/b/", null, acc);
    const got = b.next.songs.find(s => s.isCut);
    expect(got).toMatchObject({ id: "/b/Music/one.mp3__cut__1000__5000__77", uri: "/b/Music/one.mp3", cutFrom: 1000, cutTo: 5000, title: "Intro" });
  });

  it("lists what a phone is missing, without the bin", () => {
    const doc = round(phoneA(), "/a/", null, null).merged;
    doc.songs.fp4 = { bin: true };
    expect(missingFrom({ fp1: [1, "one.mp3"] }, [{ fp1: [1, "one.mp3"], fp3: [3, "three.mp3"], fp4: [4, "four.mp3"] }], doc))
      .toEqual({ fp3: [3, "three.mp3"] });
  });
});
