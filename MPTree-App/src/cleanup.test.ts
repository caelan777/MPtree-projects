import { describe, it, expect } from "vitest";
import { findSuspects } from "./cleanup";
import type { Song } from "./types";

const song = (id: string, uri: string, duration?: number, extra: Partial<Song> = {}): Song =>
  ({ id, title: id, artist: "", uri, dateAdded: 0, duration, ...extra });

describe("findSuspects", () => {
  it("finds voice notes, recordings and short clips, and leaves songs alone", () => {
    const found = findSuspects([
      song("song", "/storage/emulated/0/Music/Artist/Song.mp3", 215_000),
      song("short", "/storage/emulated/0/Music/intro.mp3", 42_000),
      song("ptt", "/storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Voice Notes/202609/PTT-20260901-WA0003.opus", 190_000),
      song("rec", "/storage/emulated/0/Recordings/Voice Recorder/Meeting.m4a", 600_000),
      song("tg", "/storage/emulated/0/Telegram/Telegram Audio/clip.ogg", 120_000),
    ]);
    expect(found.map(f => [f.song.id, f.why])).toEqual([
      ["tg", "messenger"], ["ptt", "messenger"], ["rec", "recording"], ["short", "short"],
    ]);
  });

  it("never offers a cut track or a song with no known length", () => {
    const found = findSuspects([
      song("cut", "/storage/emulated/0/Music/MPTree/chorus.mp3", 20_000, { isCut: true }),
      song("unknown", "/storage/emulated/0/Music/x.mp3", undefined),
      song("zero", "/storage/emulated/0/Music/y.mp3", 0),
    ]);
    expect(found).toEqual([]);
  });
});
