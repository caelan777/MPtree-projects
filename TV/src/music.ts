import { useCallback, useEffect, useRef, useState } from "react";
import { Launcher, type TvNowPlaying } from "./launcher";
import type { Home } from "./home";

// The music Home shows: what plays on this TV (MPTree first, read from Android's
// media sessions), or else what plays on a speaker in the house (Home Assistant).
// Both look the same to the screens and the music panel.

export type Music = {
  source: "tv" | "ha";
  title: string;
  artist: string;
  /** "MPTree, on this TV", "Living room speaker". */
  where: string;
  /** The same in a sentence: "in MPTree on this TV", "on the living room speaker". */
  place: string;
  art: string | null;
  playing: boolean;
  /** Seconds into the song as of `asOf` (ms), and how long it is, when known. */
  position: number | null;
  duration: number | null;
  asOf: number;
  /** 0 to 1, when known. */
  volume: number | null;
  shuffle: boolean | null;
  repeat: "off" | "all" | "one" | null;
  can: { prev: boolean; next: boolean; volume: boolean; shuffle: boolean; repeat: boolean };
  playPause: () => Promise<unknown>;
  skip: (dir: "prev" | "next") => Promise<unknown>;
  volumeBy: (by: number) => Promise<unknown>;
  setShuffle: (on: boolean) => Promise<unknown>;
  nextRepeat: () => Promise<unknown>;
};

/** Shuffle all songs: in MPTree on this TV, or with the speaker's script. */
export type ShuffleAll = { where: string; run: () => Promise<unknown> } | null;

/** Where the song is now: moved on since `asOf` while it plays. */
export function positionAt(m: Music, nowMs: number): number | null {
  if (m.position === null) return null;
  const p = m.playing ? m.position + Math.max(0, nowMs - m.asOf) / 1000 : m.position;
  return m.duration !== null ? Math.min(p, m.duration) : p;
}

/** "Playing · MPTree, on this TV". */
export function kicker(m: Music): string {
  return `${m.playing ? "Playing" : "Paused"} · ${m.where}`;
}

/** 0 to 100, how far into the song. */
export function progressAt(m: Music, nowMs: number): number {
  const p = positionAt(m, nowMs);
  return p !== null && m.duration ? Math.min(100, (p / m.duration) * 100) : 0;
}

type TvState = (TvNowPlaying & { at: number }) | null;

/**
 * What plays on this TV, read every few seconds while `on` (Home is in front).
 * `allowed` is null until the first answer, then whether Android lets the
 * launcher see it (see Settings, This TV).
 */
export function useTvMedia(on: boolean) {
  const [np, setNp] = useState<TvState>(null);
  const art = useRef<{ key?: string; url: string | null }>({ url: null });
  const allowedRef = useRef<boolean | null>(null);
  useEffect(() => { allowedRef.current = np ? np.allowed : null; }, [np]);

  const load = useCallback(async () => {
    try {
      const r = await Launcher.nowPlaying({ artKey: art.current.key });
      // The cover only comes along when the song changed.
      if (r.artKey !== undefined && r.artKey !== art.current.key) art.current = { key: r.artKey, url: r.art ?? null };
      setNp({ ...r, art: r.artKey !== undefined ? art.current.url : null, at: Date.now() });
    } catch {
      setNp(null);
    }
  }, []);

  useEffect(() => {
    if (!on) return;
    let timer: number | undefined;
    let alive = true;
    const tick = async () => {
      if (!document.hidden) await load();
      // Not allowed yet: look again now and then, in case it was just allowed.
      if (alive) timer = window.setTimeout(tick, allowedRef.current === false ? 30_000 : 2500);
    };
    tick();
    return () => { alive = false; window.clearTimeout(timer); };
  }, [on, load]);

  const control = useCallback(async (action: "toggle" | "next" | "prev") => {
    // Show it straight away; the next read confirms it.
    if (action === "toggle") setNp(p => (p ? { ...p, playing: !p.playing, position: p.position, at: Date.now() } : p));
    await Launcher.mediaControl({ action });
    window.setTimeout(load, 500);
  }, [load]);

  return { np, allowed: np ? np.allowed : null, control };
}

const nothing = async () => {};

/** The song on this TV, as Music. */
export function tvMusic(np: TvState, control: (a: "toggle" | "next" | "prev") => Promise<void>): Music | null {
  if (!np || !np.allowed || !np.title) return null;
  return {
    source: "tv",
    title: np.title,
    artist: np.artist ?? "",
    where: `${np.app ?? "An app"}, on this TV`,
    place: `in ${np.app ?? "an app"} on this TV`,
    art: np.art ?? null,
    playing: !!np.playing,
    position: np.position ?? null,
    duration: np.duration ?? null,
    asOf: np.at,
    volume: null, shuffle: null, repeat: null,
    can: { prev: !!np.canPrev, next: !!np.canNext, volume: false, shuffle: false, repeat: false },
    playPause: () => control("toggle"),
    skip: dir => control(dir),
    volumeBy: nothing, setShuffle: nothing, nextRepeat: nothing,
  };
}

/** The song on a speaker in the house, as Music. */
export function haMusic(h: Home, nowMs: number): Music | null {
  const p = h.playing;
  if (!p) return null;
  return {
    source: "ha",
    title: p.title, artist: p.artist, where: p.where, place: `on the ${p.where.toLowerCase()}`, art: p.art, playing: p.playing,
    position: p.position, duration: p.duration, asOf: nowMs,
    volume: p.volume, shuffle: p.shuffle, repeat: p.repeat,
    can: { prev: p.can.prev, next: p.can.next, volume: p.can.volume, shuffle: p.can.shuffle, repeat: p.can.repeat },
    playPause: h.playPause, skip: h.skip, volumeBy: h.volumeBy, setShuffle: h.setShuffle, nextRepeat: h.nextRepeat,
  };
}

/** What plays wins over what is paused; the TV wins over a speaker. */
export function pickMusic(tv: Music | null, ha: Music | null): Music | null {
  if (tv?.playing) return tv;
  if (ha?.playing) return ha;
  return tv ?? ha;
}
