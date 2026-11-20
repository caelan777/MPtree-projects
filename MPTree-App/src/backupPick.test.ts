import { describe, it, expect } from "vitest";
import { songIdsFor, restoreOf, nothingPicked, bytesOf, sizeText } from "./backupPick";
import type { BackupData } from "./storage";
import type { Playlist } from "./types";

const pl = (id: string, songIds: string[]): Playlist => ({ id, name: id, songIds, createdAt: 0 }) as Playlist;
const song = (path: string) => ({ id: path, title: path, artist: "", path });

const backup: BackupData = {
  version: 2, exportedAt: 1,
  playlists: [
    { id: "gym", name: "Gym", createdAt: 0, songs: [song("/m/a.mp3"), song("/m/b.mp3")] },
    { id: "rain", name: "Rain", createdAt: 0, songs: [song("/m/c.mp3")] },
  ],
  meta: { "/m/a.mp3": { liked: true }, "/m/c.mp3": { customName: "C" }, "/m/d.mp3": { customPhoto: "data:image/webp;base64,x" }, "/m/a.mp3__cut__1__2__3": { customName: "A cut" } },
  removedSongs: [{ id: "/m/z.mp3", title: "z", artist: "", path: "/m/z.mp3" }],
  cutTracks: [{ id: "/m/a.mp3__cut__1__2__3", title: "A cut", artist: "", path: "/m/a.mp3" }],
  liked: ["/m/a.mp3", "/m/d.mp3"],
  includeMusic: true,
  musicFiles: ["/m/a.mp3", "/m/b.mp3", "/m/c.mp3", "/m/d.mp3"],
  parts: { playlists: true, covers: true, details: true, bin: true, settings: true },
};

describe("what a backup holds", () => {
  it("takes every song for All songs, and the playlists' songs otherwise", () => {
    const lists = [pl("gym", ["/m/a.mp3", "/m/b.mp3"]), pl("rain", ["/m/c.mp3"])];
    expect([...songIdsFor({ all: true, playlists: [] }, ["/m/a.mp3", "/m/x.mp3"], lists)]).toEqual(["/m/a.mp3", "/m/x.mp3"]);
    expect([...songIdsFor({ all: false, playlists: ["rain"] }, ["/m/a.mp3"], lists)]).toEqual(["/m/c.mp3"]);
    expect(nothingPicked({ all: false, playlists: [] })).toBe(true);
  });

  it("brings back one playlist with only its songs and what belongs to them", () => {
    const { data, files } = restoreOf(backup, { all: false, playlists: ["gym"] });
    expect(files).toEqual(["/m/a.mp3", "/m/b.mp3"]);
    expect(data.playlists.map(p => p.id)).toEqual(["gym"]);
    expect(Object.keys(data.meta).sort()).toEqual(["/m/a.mp3", "/m/a.mp3__cut__1__2__3"]);
    expect(data.liked).toEqual(["/m/a.mp3"]);
    expect(data.cutTracks).toHaveLength(1);
    expect(data.removedSongs).toEqual([]);
    expect(data.parts?.bin).toBe(false);
  });

  it("brings back every song for All songs, and leaves the playlists here alone without any picked", () => {
    const { data, files } = restoreOf(backup, { all: true, playlists: [] });
    expect(files).toHaveLength(4);
    expect(data.liked).toEqual(["/m/a.mp3", "/m/d.mp3"]);
    expect(data.parts?.playlists).toBe(false);
    expect(data.parts?.settings).toBe(true);
  });

  it("says how big, roughly", () => {
    expect(bytesOf([60_000, undefined])).toBe(60 * 32_000 + 4_000_000);
    expect(sizeText(1.94e9)).toBe("1.9 GB");
    expect(sizeText(140e6)).toBe("140 MB");
  });
});
