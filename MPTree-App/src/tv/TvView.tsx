import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FilterId, Playlist, PlayMode, Song, SongMeta } from "../types";
import type { T } from "../themes";
import { FILTER_OPTIONS } from "../themes";
import { t } from "../i18n";
import { IC } from "../components/Icons";
import { Logo } from "../components/Logo";
import { AlbumArt } from "../components/AlbumArt";
import { focusFirst, useTvRemote } from "./tvNav";
import "./tv.css";

// ─── MPTREE ON A TV ──────────────────────────────────────────────────────────
//
// The landscape screen for a TV, worked with the remote (design: TV/design/v3.html,
// board 06). The songs on the left, as on the phone; the player always open on the
// right. Everything else (playback, the queue, the account that brings the songs
// over from the phones) is the same app underneath: App.tsx hands this its state
// and its actions, and the sheets (account, settings, Pro) open over it as usual.
//
// Drawn on a 1920×1080 stage and scaled to the screen, like the TV launcher.

const STAGE_W = 1920, STAGE_H = 1080;
/** Height of one song row, in stage pixels. The list only draws the rows in view. */
const ROW = 104;

type Props = {
  TH: T;
  /** The songs as the phone shows them: searched, sorted, without the bin. */
  songs: Song[];
  /** Every song, to look playlist songs up by id. */
  allSongs: Song[];
  libraryReady: boolean;
  search: string;
  setSearch: (s: string) => void;
  filter: FilterId;
  setFilter: (f: FilterId) => void;
  playlists: Playlist[];
  meta: (s: Song) => SongMeta;
  dispName: (s: Song) => string;
  dispArtist: (s: Song) => string;
  current: Song | null;
  isPlaying: boolean;
  /** Milliseconds. */
  currentTime: number;
  duration: number;
  upNext: Song[];
  playMode: PlayMode;
  repeatOne: boolean;
  repeatAll: boolean;
  nowPlayingPhoto: (s: Song) => string | undefined;
  onPlay: (song: Song, list: Song[]) => void;
  onToggle: () => void;
  onSkip: (dir: -1 | 1) => void;
  onSeek: (ms: number) => void;
  onShuffleAll: () => void;
  onShuffleToggle: () => void;
  onRepeat: () => void;
  onAccount: () => void;
  onSettings: () => void;
};

function useStageScale(): number {
  const calc = () => Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
  const [scale, setScale] = useState(calc);
  useEffect(() => {
    const on = () => setScale(calc());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return scale;
}

/** 3:41 */
function mmss(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const songMs = (s: Song) => (s.isCut && s.cutTo != null ? Math.max(0, s.cutTo - (s.cutFrom ?? 0)) : s.duration ?? 0);

export function TvView(p: Props) {
  const scale = useStageScale();
  useTvRemote(true);
  const [page, setPage] = useState<"songs" | "playlists">("songs");
  const [openPl, setOpenPl] = useState<Playlist | null>(null);

  const byId = useMemo(() => new Map(p.allSongs.map(s => [s.id, s])), [p.allSongs]);
  const plSongs = useMemo(
    () => (openPl ? openPl.songIds.map(id => byId.get(id)).filter((s): s is Song => !!s) : []),
    [openPl, byId],
  );
  const list = page === "songs" ? p.songs : openPl ? plSongs : null;

  // Start on the song that is playing, else the first song.
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => focusFirst(root.current ?? document));
    return () => cancelAnimationFrame(id);
  }, [page, openPl]);

  const vars = {
    "--bg": p.TH.bg, "--text": p.TH.text, "--sub": p.TH.textSub, "--muted": p.TH.muted, "--card": p.TH.card,
    "--surface": p.TH.surface, "--border": p.TH.border, "--dim": p.TH.dim, "--accent": p.TH.accent,
    "--btnFg": p.TH.playBtnFg, "--player": p.TH.playerBg, "--input": p.TH.inputBg,
  } as React.CSSProperties;

  const filterLabel = FILTER_OPTIONS.find(o => o.id === p.filter)?.label ?? "Sort";
  const nextFilter = () => {
    const i = FILTER_OPTIONS.findIndex(o => o.id === p.filter);
    p.setFilter(FILTER_OPTIONS[(i + 1) % FILTER_OPTIONS.length].id);
  };

  return (
    <div className="tvv" style={{ ...vars, background: p.TH.bg }}>
      <div className="tvv-stage" ref={root} style={{ transform: `scale(${scale})` }}>
        {/* ── left: the songs ── */}
        <div className="tvv-left">
          <div className="tvv-head">
            <div className="hr">
              <span className="logo"><Logo size={60} /></span>
              <div className="seg">
                <button className={page === "songs" ? "on" : ""} onClick={() => { setPage("songs"); setOpenPl(null); }}>{t("Songs")}</button>
                <button className={page === "playlists" ? "on" : ""} onClick={() => { setPage("playlists"); setOpenPl(null); }}>{t("Playlists")}</button>
              </div>
              <span className="grow" />
              <button className="ib txt" onClick={p.onAccount}>{t("Account")}</button>
              <button className="ib" onClick={p.onSettings} aria-label={t("Settings")}><span className="ic">{IC.Settings()}</span></button>
            </div>
            {page === "songs" && (
              <>
                <label className="srch">
                  <span className="ic">{IC.Search(p.TH.muted)}</span>
                  <input value={p.search} onChange={e => p.setSearch(e.target.value)} placeholder={t("Search songs or artists…")}
                    onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                </label>
                <div className="cnt">
                  <span>{t("{n} songs", { n: p.songs.length })}</span>
                  <button className="flt" onClick={nextFilter}>{t(filterLabel)} <span className="ic sm">{IC.Chevron()}</span></button>
                </div>
              </>
            )}
            {page === "playlists" && openPl && (
              <div className="cnt">
                <button className="flt" onClick={() => setOpenPl(null)}>← {t("Playlists")}</button>
                <span><b>{openPl.name}</b> · {t("{n} songs", { n: plSongs.length })}</span>
              </div>
            )}
          </div>

          {list ? (
            list.length ? (
              <SongList {...p} list={list} />
            ) : (
              <Empty {...p} inPlaylist={page === "playlists"} />
            )
          ) : (
            <div className="tvv-pls">
              {p.playlists.length ? p.playlists.map((pl, i) => (
                <button key={pl.id} className="pl" data-tv-default={i === 0 ? "" : undefined} onClick={() => setOpenPl(pl)}>
                  <span className="nm">{pl.name}</span>
                  <span className="n">{t("{n} songs", { n: pl.songIds.filter(id => byId.has(id)).length })}</span>
                </button>
              )) : <div className="tvv-empty"><h3>{t("No playlists yet")}</h3><p>{t("Playlists you make on your phone come here with your account.")}</p></div>}
            </div>
          )}
        </div>

        {/* ── right: the player, always open ── */}
        <Player {...p} />
      </div>
    </div>
  );
}

/** The songs, one per row; only the rows in view are drawn. Up and Down go row by
 *  row (Up from the first goes to the search); Right goes to the player. */
function SongList(p: Props & { list: Song[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const [height, setHeight] = useState(800);
  const [focusAt, setFocusAt] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    setHeight(el.clientHeight);
    // Open on the song that is playing.
    const at = p.current ? p.list.findIndex(s => s.id === p.current!.id) : -1;
    if (at > 3) { el.scrollTop = (at - 2) * ROW; setTop(el.scrollTop); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.list]);

  const first = Math.max(0, Math.floor(top / ROW) - 6);
  const last = Math.min(p.list.length, Math.ceil((top + height) / ROW) + 6);
  const playingAt = p.current ? p.list.findIndex(s => s.id === p.current!.id) : -1;
  const defaultAt = playingAt >= first && playingAt < last ? playingAt : first;

  // After moving to a row that was not drawn yet, focus it once it is.
  useEffect(() => {
    if (focusAt === null) return;
    const el = box.current?.querySelector<HTMLElement>(`[data-row="${focusAt}"]`);
    if (el) { el.focus({ preventScroll: true }); setFocusAt(null); }
  }, [focusAt, first, last]);

  const go = (i: number) => {
    const el = box.current;
    if (!el) return;
    const want = Math.max(0, Math.min(p.list.length - 1, i));
    // Keep the highlighted row away from the edges, two rows in.
    const rowTop = want * ROW;
    if (rowTop < el.scrollTop + ROW * 2) el.scrollTop = Math.max(0, rowTop - ROW * 2);
    else if (rowTop + ROW > el.scrollTop + el.clientHeight - ROW * 2) el.scrollTop = rowTop + ROW * 3 - el.clientHeight;
    setTop(el.scrollTop);
    setFocusAt(want);
  };

  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key === "ArrowDown" && i < p.list.length - 1) { e.preventDefault(); e.stopPropagation(); go(i + 1); }
    else if (e.key === "ArrowUp" && i > 0) { e.preventDefault(); e.stopPropagation(); go(i - 1); }
    else if (e.key === "PageDown") { e.preventDefault(); e.stopPropagation(); go(i + 8); }
    else if (e.key === "PageUp") { e.preventDefault(); e.stopPropagation(); go(i - 8); }
  };

  return (
    <div className="tvv-songs" data-tv-group="" ref={box} onScroll={e => setTop((e.target as HTMLDivElement).scrollTop)}>
      <div style={{ height: p.list.length * ROW, position: "relative" }}>
        {p.list.slice(first, last).map((s, k) => {
          const i = first + k;
          const active = p.current?.id === s.id;
          const m = p.meta(s);
          return (
            <button
              key={s.id} data-row={i} data-tv-default={i === defaultAt ? "" : undefined} data-tv-entry={i === defaultAt ? "" : undefined}
              className={"song" + (active ? " act" : "")} style={{ top: i * ROW }}
              onKeyDown={e => onKey(e, i)} onClick={() => p.onPlay(s, p.list)}
            >
              <span className="a"><AlbumArt title={p.dispName(s)} size={70} active={active} playing={active && p.isPlaying} customPhoto={m.customPhoto} songPath={s.uri} albumId={s.albumId} T={p.TH} /></span>
              <span className="tx">
                <span className="tt">{p.dispName(s)}</span>
                <span className="bt"><span className="d">{mmss(songMs(s))}</span><span className="ar">{p.dispArtist(s)}</span></span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** No songs here. On a new TV that is the normal start: the songs come from the
 *  phones, through the account. */
function Empty(p: Props & { inPlaylist: boolean }) {
  if (!p.libraryReady) return <div className="tvv-empty"><p>{t("Loading…")}</p></div>;
  if (p.inPlaylist) return <div className="tvv-empty"><h3>{t("This playlist is empty")}</h3></div>;
  if (p.search) return <div className="tvv-empty"><h3>{t("No songs found")}</h3><p>{t("Try another word.")}</p></div>;
  return (
    <div className="tvv-empty">
      <h3>{t("No songs on this TV yet")}</h3>
      <p>{t("Sign in with your MPTree account, the one your phone uses. Your songs then come over from your phone: keep MPTree open on both.")}</p>
      <button className="big" data-tv-default="" onClick={p.onAccount}>{t("MPTree account")}</button>
    </div>
  );
}

/** The player, always open on the right: the cover, the song, the time (Left and
 *  Right on the bar jump 10 seconds), shuffle, back, play, next, repeat, and what
 *  comes next. */
function Player(p: Props) {
  const s = p.current;
  if (!s) {
    return (
      <div className="tvv-right none" data-tv-group="">
        <div className="art-none"><Logo size={140} /></div>
        <h3>{t("Nothing is playing")}</h3>
        <p>{t("Choose a song on the left, or shuffle them all.")}</p>
        {p.songs.length > 0 && <button className="big" data-tv-entry="" onClick={p.onShuffleAll}><span className="ic">{IC.Shuffle()}</span>{t("Shuffle all songs")}</button>}
      </div>
    );
  }
  const total = p.duration || songMs(s);
  const pct = total ? Math.min(100, (p.currentTime / total) * 100) : 0;
  const shuffle = p.playMode === "shuffle";
  const repeat = p.repeatOne || p.repeatAll;
  const barKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault(); e.stopPropagation();
    p.onSeek(Math.max(0, Math.min(total, p.currentTime + (e.key === "ArrowRight" ? 10_000 : -10_000))));
  };
  return (
    <div className="tvv-right" data-tv-group="">
      <div className="art"><AlbumArt title={p.dispName(s)} size={430} customPhoto={p.nowPlayingPhoto(s)} songPath={s.uri} albumId={s.albumId} T={p.TH} /></div>
      <div className="mp-t"><h3>{p.dispName(s)}</h3><div>{p.dispArtist(s)}</div></div>
      <div>
        <button className="prog" tabIndex={0} aria-label={t("Position")} onKeyDown={barKey} onClick={p.onToggle}>
          <span className="bar"><i style={{ width: `${pct}%` }} /></span>
        </button>
        <div className="pt"><span>{mmss(p.currentTime)}</span><span className="hint">◀ ▶ 10 s</span><span>{mmss(total)}</span></div>
      </div>
      <div className="ctrls">
        <button className={"cb sm" + (shuffle ? " on" : "")} data-tv-stop="down" onClick={p.onShuffleToggle} aria-label={t("Shuffle")}><span className="ic">{IC.Shuffle()}</span></button>
        <button className="cb" data-tv-stop="down" onClick={() => p.onSkip(-1)} aria-label={t("Previous")}><span className="ic">{IC.SkipB()}</span></button>
        <button className="cb pl" data-tv-entry="" data-tv-stop="down" onClick={p.onToggle} aria-label={p.isPlaying ? t("Pause") : t("Play")}><span className="ic lg">{p.isPlaying ? IC.Pause() : IC.Play()}</span></button>
        <button className="cb" data-tv-stop="down" onClick={() => p.onSkip(1)} aria-label={t("Next")}><span className="ic">{IC.SkipF()}</span></button>
        <button className={"cb sm" + (repeat ? " on" : "")} data-tv-stop="down" onClick={p.onRepeat} aria-label={t("Repeat")}>
          <span className="ic">{IC.Repeat()}</span>{p.repeatOne && <span className="one">1</span>}
        </button>
      </div>
      <div className="upn">
        <div className="lbl">{t("Up next")}</div>
        {p.upNext.length ? p.upNext.slice(0, 3).map(n => (
          <div key={n.id} className="un"><span>{p.dispName(n)}</span><span className="d">{mmss(songMs(n))}</span></div>
        )) : <div className="un"><span className="d">{t("Nothing after this song")}</span></div>}
      </div>
    </div>
  );
}
