import React, { useCallback, useEffect, useRef, useState } from "react";
import type { T } from "../themes";
import { t } from "../i18n";
import { IC } from "./Icons";
import { Logo } from "./Logo";
import { Sync } from "../plugins";
import {
  SHELVES, findFree, loadShelf, loadSaved, markSaved, previewUrl, downloadUrl,
  saveName, licenceChip, nextArt, type FreeTrack,
} from "../discover";

// ─── DISCOVER ────────────────────────────────────────────────────────────────
// Free music to download, as shelves of covers per genre. It is the first tab,
// left of Songs: the download arrow in the tabs, or a swipe to the right on
// Songs, slides it in; a swipe to the left takes you back. A tap on a cover
// brings that song forward as a card and plays it from Audius, the whole song;
// its round button saves the file into Music/MPTree, and the card then shrinks
// away into the Songs tab, which gets a "+1". You stay here. The page stays
// mounted once opened, so a download keeps going while you are on Songs.

/** Progress of a download: 0..1, -1 while the size is not known, or "done". */
type Dl = number | "done";

export function DiscoverView({
  open, dragIn, newSongs, T, backRef, onClose, onGoPlaylists, onOpenSettings, onPreview, onSaved,
}: {
  open: boolean;
  /** How far a swipe on Songs has pulled this page in, in px. */
  dragIn: number;
  /** Songs saved here since Songs was last looked at. */
  newSongs: number;
  /** Android's Back: true when the page handled it (left a list). */
  backRef: React.MutableRefObject<(() => boolean) | null>;
  T: T;
  onClose: () => void;
  onGoPlaylists: () => void;
  onOpenSettings: () => void;
  /** A preview starts: MPTree's own playback should pause. */
  onPreview: () => void;
  /** The file is in Music/MPTree. Resolves when the song is in Songs. */
  onSaved: (track: FreeTrack, path: string) => Promise<void>;
}) {
  const [shelves, setShelves] = useState<Record<string, FreeTrack[] | "error">>({});
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [dl, setDl] = useState<Record<string, Dl>>({});
  const [list, setList] = useState<null | { title: string; genre?: string; query?: string; tracks: FreeTrack[]; more: boolean; busy: boolean; error?: boolean }>(null);
  const [query, setQuery] = useState("");
  const [failNote, setFailNote] = useState<string | null>(null);
  // `loading`: asked to play, no sound yet (starting, or buffering).
  const [preview, setPreview] = useState<null | { track: FreeTrack; playing: boolean; loading: boolean; pos: number }>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const small = typeof window !== "undefined" && window.innerWidth < 390;

  // The song that came forward. `fly` is where Songs is, once it is saved.
  const [card, setCard] = useState<null | { track: FreeTrack; fly?: { x: number; y: number } }>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const cardIdRef = useRef<string | null>(null);
  cardIdRef.current = card?.track.id ?? null;
  const songsTabRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => { if (!open) setCard(null); }, [open]);

  // ── Swipe left: back to Songs ─────────────────────────────────────────────
  // Not from a shelf, which scrolls sideways itself, and not with a card up.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [dragOut, setDragOut] = useState(0);
  const sw = useRef<null | { x: number; y: number; t: number; axis: null | "h" | "v" }>(null);
  const cardUp = !!card;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const start = (e: TouchEvent) => {
      const tg = e.target as HTMLElement | null;
      if (cardUp || tg?.closest("[data-hscroll]")) { sw.current = null; return; }
      sw.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: e.timeStamp, axis: null };
    };
    const move = (e: TouchEvent) => {
      const g = sw.current;
      if (!g) return;
      const dx = e.touches[0].clientX - g.x, dy = e.touches[0].clientY - g.y;
      if (!g.axis) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        g.axis = Math.abs(dx) > Math.abs(dy) * 1.3 && dx < 0 ? "h" : "v";
      }
      if (g.axis !== "h") return;
      if (e.cancelable) e.preventDefault();
      setDragOut(Math.min(0, dx));
    };
    const end = (e: TouchEvent) => {
      const g = sw.current;
      sw.current = null;
      if (!g || g.axis !== "h") return;
      const dx = (e.changedTouches[0]?.clientX ?? g.x) - g.x;
      const fast = dx < -20 && -dx / Math.max(1, e.timeStamp - g.t) > 0.3;
      setDragOut(0);
      if (dx < -55 || fast) closeRef.current();
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }, [cardUp]);

  // ── Shelves ───────────────────────────────────────────────────────────────
  const loadAll = useCallback(() => {
    setShelves({});
    SHELVES.forEach(s => {
      loadShelf(s.genre)
        .then(tracks => setShelves(prev => ({ ...prev, [s.genre]: tracks })))
        .catch(() => setShelves(prev => ({ ...prev, [s.genre]: "error" })));
    });
  }, []);

  const started = useRef(false);
  useEffect(() => {
    if (!(open || dragIn > 0) || started.current) return;
    started.current = true;
    loadSaved().then(setSaved);
    loadAll();
  }, [open, dragIn, loadAll]);

  // ── Playing (the whole song, streamed from Audius) ────────────────────────
  const stopPreview = useCallback(() => {
    const a = audioRef.current;
    if (a) { a.pause(); a.removeAttribute("src"); a.load(); }
    setPreview(null);
  }, []);

  useEffect(() => { if (!open) stopPreview(); }, [open, stopPreview]);

  const togglePreview = (track: FreeTrack) => {
    let a = audioRef.current;
    if (!a) {
      a = new Audio();
      a.preload = "none";
      a.ontimeupdate = () => { const pos = a!.currentTime; setPreview(p => p && { ...p, pos }); };
      a.onwaiting = () => setPreview(p => p && p.playing ? { ...p, loading: true } : p);
      a.onplaying = () => setPreview(p => p && { ...p, loading: false });
      a.onended = () => setPreview(p => p && { ...p, playing: false, loading: false, pos: 0 });
      a.onerror = () => { if (!a!.getAttribute("src")) return; setPreview(null); setFailNote(t("This song does not play right now. Try another one.")); };
      audioRef.current = a;
    }
    if (preview?.track.id === track.id) {
      if (preview.playing) { a.pause(); setPreview({ ...preview, playing: false, loading: false }); }
      else { onPreview(); void a.play().catch(() => setPreview(null)); setPreview({ ...preview, playing: true, loading: a.readyState < 3 }); }
      return;
    }
    onPreview();
    a.src = previewUrl(track.id);
    void a.play().catch(() => setPreview(null));
    setPreview({ track, playing: true, loading: true, pos: 0 });
  };

  const openCard = (track: FreeTrack) => {
    setCard({ track });
    if (!(preview?.track.id === track.id && preview.playing)) togglePreview(track);
  };

  // Saved while its card is up: the card shrinks into the Songs tab. You stay
  // here; the tab gets its "+1", and the song keeps playing.
  const flyToSongs = (id: string) => {
    const c = cardRef.current, s = songsTabRef.current;
    if (!c || !s || cardIdRef.current !== id) return;
    const a = c.getBoundingClientRect(), b = s.getBoundingClientRect();
    setCard(cur => cur && { ...cur, fly: { x: b.left + b.width / 2 - (a.left + a.width / 2), y: b.top + b.height / 2 - (a.top + a.height / 2) } });
    setTimeout(() => {
      if (cardIdRef.current !== id) return;
      setCard(null);
    }, FLY_MS);
  };

  // ── Download ──────────────────────────────────────────────────────────────
  const download = async (track: FreeTrack) => {
    if (dl[track.id] !== undefined && dl[track.id] !== "done") return;
    if (saved[track.id]) return;
    const tid = "discover-" + track.id;
    setDl(d => ({ ...d, [track.id]: -1 }));
    const sub = await Sync.addListener("progress", p => {
      if (p.tid === tid) setDl(d => ({ ...d, [track.id]: p.total > 0 ? Math.min(0.99, p.done / p.total) : -1 }));
    }).catch(() => null);
    try {
      await Sync.urlDownload({ url: downloadUrl(track.id), tid });
      const out = await Sync.finishFile({ tid, name: saveName(track) });
      if (!out.path) throw new Error("not saved");
      await markSaved(track.id, out.path);
      setSaved(s => ({ ...s, [track.id]: out.path! }));
      setDl(d => ({ ...d, [track.id]: "done" }));
      flyToSongs(track.id);
      await onSaved(track, out.path);
    } catch (e) {
      Sync.abortFile({ tid }).catch(() => {});
      setDl(d => { const n = { ...d }; delete n[track.id]; return n; });
      const full = (e as { code?: string })?.code === "FULL";
      setFailNote(full ? t("Your phone is full") : t("Download failed. Check your connection and try again."));
    } finally {
      sub?.remove();
    }
  };
  useEffect(() => { if (!failNote) return; const id = setTimeout(() => setFailNote(null), 3000); return () => clearTimeout(id); }, [failNote]);

  // ── A full list: one genre, or a search ───────────────────────────────────
  const openList = (o: { title: string; genre?: string; query?: string }) => {
    setList({ ...o, tracks: [], more: false, busy: true });
    findFree({ genre: o.genre, query: o.query, limit: 60 })
      .then(tracks => setList(l => l && { ...l, tracks, more: tracks.length > 0, busy: false }))
      .catch(() => setList(l => l && { ...l, busy: false, error: true }));
  };
  const offsetRef = useRef(0);
  useEffect(() => { offsetRef.current = 60; }, [list?.title]);
  const loadMore = () => {
    if (!list || list.busy) return;
    const offset = offsetRef.current;
    offsetRef.current += 60;
    setList({ ...list, busy: true });
    findFree({ genre: list.genre, query: list.query, limit: 60, offset })
      .then(more => setList(l => {
        if (!l) return l;
        const have = new Set(l.tracks.map(x => x.id));
        const fresh = more.filter(x => !have.has(x.id));
        return { ...l, tracks: [...l.tracks, ...fresh], more: fresh.length > 0, busy: false };
      }))
      .catch(() => setList(l => l && { ...l, busy: false }));
  };

  // Back on Android: the card first, then the list, then out of Discover.
  backRef.current = () => {
    if (card) { if (!card.fly) setCard(null); return true; }
    if (list) { setList(null); return true; }
    return false;
  };

  const submitSearch = () => {
    const q = query.trim();
    if (!q) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    openList({ title: q, query: q });
  };

  // ── Pieces ────────────────────────────────────────────────────────────────
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  /** inverse: on the card, which is the accent colour itself. */
  const dlButton = (track: FreeTrack, size: number, inverse = false) => {
    const state = saved[track.id] ? "done" : dl[track.id];
    const done = state === "done";
    const busy = typeof state === "number";
    const r = size / 2 - 1.5;
    const c = 2 * Math.PI * r;
    return (
      <button
        onClick={e => { e.stopPropagation(); void download(track); }}
        aria-label={done ? t("In your Songs") : t("Download")}
        disabled={done || busy}
        style={{
          width: size, height: size, borderRadius: "50%", flexShrink: 0, position: "relative", padding: 0,
          display: "flex", alignItems: "center", justifyContent: "center", cursor: done || busy ? "default" : "pointer",
          background: inverse ? T.playBtnFg : done ? T.accent : T.bg,
          color: inverse ? T.accent : done ? T.playBtnFg : T.text,
          border: busy || inverse ? "none" : `1.5px solid ${done ? T.accent : T.border}`,
        }}
      >
        {busy && (
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: "absolute", inset: 0, animation: state === -1 ? "mptree-spin 1s linear infinite" : undefined }}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={inverse ? T.muted : T.dim} strokeWidth="2.5" />
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={T.accent} strokeWidth="2.5" strokeLinecap="round"
              strokeDasharray={c} strokeDashoffset={c * (1 - (state === -1 ? 0.25 : (state as number)))}
              transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: "stroke-dashoffset 0.3s" }} />
          </svg>
        )}
        {done
          ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          : !busy && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v12"/><polyline points="6 11 12 17 18 11"/><path d="M5 20h14"/></svg>}
      </button>
    );
  };

  const cover = (track: FreeTrack, size: number | string, radius: number) => (
    <div style={{ width: size, height: typeof size === "number" ? size : undefined, aspectRatio: "1", borderRadius: radius, overflow: "hidden", background: T.card, border: `1px solid ${T.border}`, flexShrink: 0, position: "relative" }}>
      {track.art && <img src={track.art} alt="" loading="lazy" draggable={false} onError={e => nextArt(track, e.currentTarget)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
      {preview?.track.id === track.id && preview.playing && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
          {preview.loading ? <Spinner size={typeof size === "number" && size < 60 ? 18 : 28} /> : <Bars size={typeof size === "number" && size < 60 ? 16 : 24} />}
        </div>
      )}
    </div>
  );

  const chip = (track: FreeTrack) => (
    <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, letterSpacing: "0.03em", border: `1px solid ${T.border}`, borderRadius: 5, padding: "1px 4px", color: T.muted, flexShrink: 0 }}>
      {licenceChip(track.license)}
    </span>
  );

  const sub = (track: FreeTrack, extra?: string) => saved[track.id]
    ? <span>{t("In your Songs")}</span>
    : <><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{track.artist}</span>{chip(track)}{extra && <span style={{ flexShrink: 0 }}>{extra}</span>}</>;

  const tileW = small ? 132 : 150;
  const shelf = (genre: string, label: string) => {
    const tracks = shelves[genre];
    if (tracks === "error" || (Array.isArray(tracks) && tracks.length === 0)) return null;
    return (
      <div key={genre}>
        <div style={{ fontSize: 11, color: T.muted, letterSpacing: "0.08em", textTransform: "uppercase", margin: "18px 16px 8px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span>{t(label)}</span>
          {tracks && (
            <button onClick={() => openList({ title: t(label), genre })} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", letterSpacing: 0, textTransform: "none", fontSize: 12, color: T.textSub, fontFamily: "inherit" }}>
              {t("See all")}
            </button>
          )}
        </div>
        <div data-hscroll="" style={{ display: "flex", gap: 12, padding: "0 12px", overflowX: "auto", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
          {(tracks ?? Array.from({ length: 4 }, () => null)).map((track, i) => track ? (
            <div key={track.id} style={{ flexShrink: 0, width: tileW, cursor: "pointer" }} onClick={() => openCard(track)}>
              <div style={{ position: "relative" }}>
                {cover(track, tileW, 14)}
                <div style={{ position: "absolute", right: 8, bottom: 8 }}>{dlButton(track, 32)}</div>
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: T.text }}>{track.title}</div>
              <div style={{ fontSize: 12, color: T.textSub, marginTop: 2, display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}>{sub(track)}</div>
            </div>
          ) : (
            <div key={i} style={{ flexShrink: 0, width: tileW }}>
              <div style={{ width: tileW, height: tileW, borderRadius: 14, background: T.card, border: `1px solid ${T.border}` }} />
              <div style={{ height: 12, width: "70%", borderRadius: 4, background: T.card, marginTop: 10 }} />
            </div>
          ))}
        </div>
      </div>
    );
  };

  const allFailed = SHELVES.every(s => shelves[s.genre] === "error");
  const seg = (on: boolean): React.CSSProperties => ({
    padding: "6px 14px", borderRadius: 17, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit",
    whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 5,
    background: on ? T.accent : "transparent", color: on ? T.playBtnFg : T.muted,
  });

  return (
    <div
      ref={rootRef}
      aria-hidden={!open}
      style={{
        position: "fixed", inset: 0, zIndex: 300, background: T.bg, color: T.text, display: "flex", flexDirection: "column",
        paddingTop: "env(safe-area-inset-top, 0px)",
        visibility: open || dragIn > 0 ? "visible" : "hidden",
        transform: open ? `translateX(${dragOut}px)` : `translateX(calc(-100% + ${dragIn}px))`,
        boxShadow: open || dragIn > 0 ? "8px 0 24px rgba(0,0,0,0.25)" : "none",
        transition: dragIn > 0 || dragOut < 0 ? "none" : `transform 0.22s cubic-bezier(0.22,0.61,0.36,1), visibility 0s ${open ? "0s" : "0.22s"}`,
        willChange: "transform",
      }}
    >
      <style>{KEYFRAMES}</style>

      {/* The same header as Songs and Playlists, with Discover filled. */}
      <div style={{ margin: "2px 12px 0", background: T.card, border: `1px solid ${T.border}`, borderRadius: 22, padding: "8px 14px 12px", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
          <button onClick={onClose} aria-label={t("Songs")} style={{ background: "transparent", border: "none", padding: 0, display: "flex", color: T.text, cursor: "pointer", flexShrink: 0 }}>
            <Logo size={small ? 42 : 48} color={T.text} />
          </button>
          <div style={{ display: "flex", alignItems: "center", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 20, padding: 3, gap: 2, minWidth: 0 }}>
            <button onClick={() => { setList(null); setCard(null); }} aria-label={t("Discover")} style={{ ...seg(true), paddingLeft: 11, paddingRight: 11 }}>
              {downloadGlyph(T.playBtnFg)}
            </button>
            <span style={{ position: "relative", display: "flex" }}>
              <button ref={songsTabRef} onClick={onClose} style={seg(false)}>{t("Songs")}</button>
              {newSongs > 0 && <NewBadge n={newSongs} T={T} />}
            </span>
            <button onClick={onGoPlaylists} style={seg(false)}>{t("Playlists")}</button>
          </div>
          <button onClick={onOpenSettings} style={{ background: "transparent", border: "none", color: T.muted, cursor: "pointer", padding: 8, display: "flex", flexShrink: 0 }}>
            <IC.Settings />
          </button>
        </div>
        <form onSubmit={e => { e.preventDefault(); submitSearch(); }} style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 12px", borderRadius: 10, background: T.surface, border: `1px solid ${T.border}` }}>
          {IC.Search(T.muted)}
          <input
            value={query} onChange={e => setQuery(e.target.value)} enterKeyHint="search" tabIndex={open ? undefined : -1}
            placeholder={t("Search free music")}
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 15, minWidth: 0, fontFamily: "inherit" }}
          />
        </form>
      </div>

      <div style={{ flex: 1, overflowY: "auto", paddingBottom: preview ? 96 : 24 }}>
        {list ? (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "14px 8px 6px" }}>
              <button onClick={() => setList(null)} aria-label={t("Back")} style={{ background: "none", border: "none", color: T.text, padding: 8, display: "flex", cursor: "pointer" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{list.title}</div>
            </div>
            {list.tracks.map(track => (
              <div key={track.id} onClick={() => openCard(track)} style={{ display: "flex", alignItems: "center", gap: 12, height: small ? 68 : 78, padding: small ? "0 10px 0 14px" : "0 10px 0 16px", cursor: "pointer" }}>
                {cover(track, small ? 42 : 48, 10)}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{track.title}</div>
                  <div style={{ fontSize: 12.5, color: T.textSub, marginTop: 3, display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}>{sub(track, fmt(track.duration))}</div>
                </div>
                {dlButton(track, 40)}
              </div>
            ))}
            {list.busy && <div style={{ textAlign: "center", color: T.muted, fontSize: 13, padding: 24 }}>{t("Loading…")}</div>}
            {!list.busy && list.error && <div style={{ textAlign: "center", color: T.muted, fontSize: 14, padding: "40px 24px" }}>{t("No connection. Check your internet and try again.")}</div>}
            {!list.busy && !list.error && list.tracks.length === 0 && <div style={{ textAlign: "center", color: T.muted, fontSize: 14, padding: "40px 24px" }}>{t("Nothing found")}</div>}
            {!list.busy && list.more && (
              <div style={{ display: "flex", justifyContent: "center", padding: 16 }}>
                <button onClick={loadMore} style={{ borderRadius: 12, padding: "9px 16px", fontSize: 14, fontWeight: 700, background: T.dim, color: T.text, border: "none", cursor: "pointer", fontFamily: "inherit" }}>{t("Load more")}</button>
              </div>
            )}
          </div>
        ) : allFailed ? (
          <div style={{ textAlign: "center", color: T.muted, fontSize: 14, padding: "80px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            {t("No connection. Check your internet and try again.")}
            <button onClick={loadAll} style={{ borderRadius: 12, padding: "9px 16px", fontSize: 14, fontWeight: 700, background: T.accent, color: T.playBtnFg, border: "none", cursor: "pointer", fontFamily: "inherit" }}>{t("Try again")}</button>
          </div>
        ) : (
          SHELVES.map(s => shelf(s.genre, s.label))
        )}
        <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5, padding: "28px 20px 8px", textAlign: "center" }}>
          {t("Music from Audius. Only songs the artist offers as a free download, with their name kept on them.")}
        </div>
      </div>

      {failNote && (
        <div style={{ position: "absolute", left: 12, right: 12, bottom: preview ? 88 : 16, background: T.sheetBg, border: `1px solid ${T.border}`, borderRadius: 18, padding: "12px 16px", fontSize: 14, fontWeight: 600, boxShadow: "0 10px 36px rgba(0,0,0,0.35)" }}>
          {failNote}
        </div>
      )}

      {preview && (
        <div style={{ position: "absolute", left: 12, right: 12, bottom: "calc(14px + env(safe-area-inset-bottom, 0px))", height: 62, borderRadius: 22, background: T.playerBg, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12, padding: "0 10px", overflow: "hidden" }}>
          <div aria-hidden="true" style={{ position: "absolute", left: 0, bottom: 0, height: 2, background: T.text, width: `${preview.track.duration ? Math.min(100, (preview.pos / preview.track.duration) * 100) : 0}%`, transition: "width 0.25s linear" }} />
          {cover(preview.track, 42, 10)}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{preview.track.title}</div>
            <div style={{ fontSize: 12.5, color: T.textSub, marginTop: 3, fontVariantNumeric: "tabular-nums" }}>
              {preview.loading ? t("Loading…") : `${fmt(preview.pos)} / ${fmt(preview.track.duration)}`}
            </div>
          </div>
          {dlButton(preview.track, 40)}
          <button onClick={() => togglePreview(preview.track)} aria-label={preview.playing ? t("Pause") : t("Play")} style={{ width: 40, height: 40, borderRadius: "50%", background: T.accent, color: T.playBtnFg, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            {preview.playing && preview.loading ? <Spinner size={18} /> : preview.playing ? <IC.Pause /> : <IC.Play />}
          </button>
        </div>
      )}

      {card && (
        <div onClick={() => { if (!card.fly) setCard(null); }} style={{ position: "absolute", inset: 0, zIndex: 5, display: "flex", alignItems: "center", justifyContent: "center", background: card.fly ? "rgba(0,0,0,0)" : "rgba(0,0,0,0.55)", transition: `background ${FLY_MS}ms ease` }}>
          {/* Outer: the flight into Songs. Inner: coming forward. Two
              elements, so the two transforms never fight. */}
          <div ref={cardRef} style={{
            width: "min(306px, 80vw)",
            transform: card.fly ? `translate(${card.fly.x}px, ${card.fly.y}px) scale(0.06)` : "none",
            opacity: card.fly ? 0.2 : 1,
            transition: card.fly ? `transform ${FLY_MS}ms cubic-bezier(0.55, 0, 0.75, 0.2), opacity ${FLY_MS}ms ease-in` : "none",
          }}>
            <div onClick={e => e.stopPropagation()} style={{ background: T.accent, color: T.playBtnFg, borderRadius: 20, overflow: "hidden", boxShadow: "0 30px 60px rgba(0,0,0,0.7)", animation: "mptree-card-in 0.34s cubic-bezier(0.22, 1, 0.36, 1) both" }}>
              <div onClick={() => togglePreview(card.track)} style={{ aspectRatio: "1", background: T.card, position: "relative", cursor: "pointer" }}>
                {card.track.art && <img src={card.track.art} alt="" draggable={false} onError={e => nextArt(card.track, e.currentTarget)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
                {(() => {
                  const mine = preview?.track.id === card.track.id ? preview : null;
                  const pct = mine && card.track.duration ? Math.min(100, (mine.pos / card.track.duration) * 100) : 0;
                  return (
                    <>
                      <div style={{ position: "absolute", left: 12, bottom: 12, height: 30, borderRadius: 15, padding: "0 12px 0 10px", background: "rgba(0,0,0,0.62)", color: "#fff", display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                        {mine?.playing && mine.loading ? <><Spinner size={14} />{t("Loading…")}</>
                          : mine?.playing ? <><Bars size={14} />{fmt(mine.pos)} / {fmt(card.track.duration)}</>
                          : <><IC.Play />{fmt(card.track.duration)}</>}
                      </div>
                      <div aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 3, background: "rgba(255,255,255,0.2)" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: "#fff", transition: "width 0.25s linear" }} />
                      </div>
                    </>
                  );
                })()}
              </div>
              <div style={{ padding: "14px 14px 14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{card.track.title}</div>
                  <div style={{ fontSize: 12.5, opacity: 0.65, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {[card.track.artist, card.track.genre, licenceChip(card.track.license)].filter(Boolean).join(" · ")}
                  </div>
                </div>
                {dlButton(card.track, 46, true)}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

const FLY_MS = 600;

const KEYFRAMES = `
@keyframes mptree-spin { to { transform: rotate(360deg) } }
@keyframes mptree-card-in { from { transform: translateY(24px) scale(0.86); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes mptree-bar { 0%, 100% { transform: scaleY(0.35) } 50% { transform: scaleY(1) } }
@keyframes mptree-badge-in { from { transform: translate(50%, 6px) scale(0.4); opacity: 0 } to { transform: translate(50%, 0) scale(1); opacity: 1 } }
`;

/** Asked to play, no sound yet. */
function Spinner({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-label={t("Loading…")} style={{ animation: "mptree-spin 0.9s linear infinite", flexShrink: 0 }}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M12 3 a9 9 0 0 1 9 9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Playing: three bars going up and down. */
function Bars({ size }: { size: number }) {
  const w = Math.max(2, Math.round(size / 6));
  return (
    <span aria-label={t("Playing")} style={{ display: "flex", alignItems: "flex-end", gap: w * 0.8, height: size, flexShrink: 0 }}>
      {[0, 0.25, 0.5].map(d => (
        <span key={d} style={{ width: w, height: "100%", background: "currentColor", borderRadius: w / 2, transformOrigin: "bottom", animation: `mptree-bar 0.9s ease-in-out ${-d * 0.9}s infinite` }} />
      ))}
    </span>
  );
}

/** "+1" above the Songs tab: songs saved from Discover you have not seen yet.
 *  Its keyframes come with DiscoverView, which is mounted before any save. */
export function NewBadge({ n, T }: { n: number; T: T }) {
  return (
    <span aria-label={t("{n} new", { n })} style={{
      position: "absolute", top: -9, right: 12, transform: "translate(50%, 0)", pointerEvents: "none",
      minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, boxSizing: "border-box",
      background: T.text, color: T.bg, border: `2px solid ${T.surface}`,
      fontSize: 10.5, fontWeight: 800, lineHeight: "14px", textAlign: "center",
      animation: "mptree-badge-in 0.3s cubic-bezier(0.22, 1, 0.36, 1) both",
    }}>+{n}</span>
  );
}

function downloadGlyph(c: string) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4v12" /><polyline points="6 11 12 17 18 11" /><path d="M5 20h14" />
    </svg>
  );
}

/** The download arrow, for the Discover button in the app's own header. */
export const DiscoverIcon = downloadGlyph;
