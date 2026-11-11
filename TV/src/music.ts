import { useCallback, useEffect, useRef, useState } from "react";
import { Launcher, type TvApp, type TvNowPlaying } from "./launcher";

// The music Home shows: what MPTree plays on this TV, read from Android's media
// sessions. Only MPTree: never a speaker from Home Assistant, and never another
// app (a YouTube video is not music on Home).

/** MPTree's package on the TV. */
export const MPTREE = "com.caelan.mptree";

/** MPTree has no TV banner of its own, so its app tiles draw one: the mark big,
 *  white on black, like the other apps' banners, rather than a small icon and its name. */
export function hasMark(app: TvApp): boolean {
  return app.packageName === MPTREE && !(app.image && app.isBanner);
}

export type Music = {
  title: string;
  artist: string;
  /** "MPTree, on this TV". */
  where: string;
  /** The same in a sentence: "in MPTree on this TV". */
  place: string;
  art: string | null;
  playing: boolean;
  /** Seconds into the song as of `asOf` (ms), and how long it is, when known. */
  position: number | null;
  duration: number | null;
  asOf: number;
  can: { prev: boolean; next: boolean };
  playPause: () => Promise<unknown>;
  skip: (dir: "prev" | "next") => Promise<unknown>;
};

/** Shuffle all songs in MPTree on this TV, or null when MPTree is not installed. */
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

/** The song MPTree plays on this TV, as Music. Nothing for any other app. */
export function tvMusic(np: TvState, control: (a: "toggle" | "next" | "prev") => Promise<void>): Music | null {
  if (!np || !np.allowed || !np.title || np.package !== MPTREE) return null;
  return {
    title: np.title,
    artist: np.artist ?? "",
    where: "MPTree, on this TV",
    place: "in MPTree on this TV",
    art: np.art ?? null,
    playing: !!np.playing,
    position: np.position ?? null,
    duration: np.duration ?? null,
    asOf: np.at,
    can: { prev: !!np.canPrev, next: !!np.canNext },
    playPause: () => control("toggle"),
    skip: dir => control(dir),
  };
}
