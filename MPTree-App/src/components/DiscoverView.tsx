import React, { useCallback, useEffect, useRef, useState } from "react";
import type { T } from "../themes";
import { t } from "../i18n";
import { IC } from "./Icons";
import { Logo } from "./Logo";
import { Sync } from "../plugins";
import {
  SHELVES, findFree, loadShelf, loadSaved, markSaved, previewUrl, downloadUrl,
  saveName, licenceChip, type FreeTrack,
} from "../discover";

// ─── DISCOVER ────────────────────────────────────────────────────────────────
// Free music to download, as shelves of covers per genre (direction A of
// docs/discover-directions.html). A tap on a cover plays a preview from
// Audius; the round button on it saves the file into Music/MPTree, and from
// then on it is a song like any other. The page stays mounted once opened, so
// a download keeps going, and keeps its ring, while you are on Songs.

/** Progress of a download: 0..1, -1 while the size is not known, or "done". */
type Dl = number | "done";

const PREVIEW_S = 30;

export function DiscoverView({
  open, T, backRef, onClose, onGoPlaylists, onOpenSettings, onPreview, onSaved,
}: {
  open: boolean;
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
  const [preview, setPreview] = useState<null | { track: FreeTrack; playing: boolean; pos: number }>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const small = typeof window !== "undefined" && window.innerWidth < 390;

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
    if (!open || started.current) return;
    started.current = true;
    loadSaved().then(setSaved);
    loadAll();
  }, [open, loadAll]);

  // ── Preview ───────────────────────────────────────────────────────────────
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
      a.ontimeupdate = () => {
        const pos = a!.currentTime;
        if (pos >= PREVIEW_S) { a!.pause(); a!.currentTime = 0; setPreview(p => p && { ...p, playing: false, pos: 0 }); return; }
        setPreview(p => p && { ...p, pos });
      };
      a.onended = () => setPreview(p => p && { ...p, playing: false, pos: 0 });
      a.onerror = () => setPreview(null);
      audioRef.current = a;
    }
    if (preview?.track.id === track.id) {
      if (preview.playing) { a.pause(); setPreview({ ...preview, playing: false }); }
      else { onPreview(); void a.play().catch(() => setPreview(null)); setPreview({ ...preview, playing: true }); }
      return;
    }
    onPreview();
    a.src = previewUrl(track.id);
    void a.play().catch(() => setPreview(null));
    setPreview({ track, playing: true, pos: 0 });
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

  // Back on Android: out of the list first, then out of Discover.
  backRef.current = () => {
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

  const dlButton = (track: FreeTrack, size: number) => {
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
          background: done ? T.accent : T.bg, color: done ? T.playBtnFg : T.text,
          border: busy ? "none" : `1.5px solid ${done ? T.accent : T.border}`,
        }}
      >
        {busy && (
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: "absolute", inset: 0, animation: state === -1 ? "mptree-spin 1s linear infinite" : undefined }}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={T.dim} strokeWidth="2.5" />
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
      {track.art && <img src={track.art} alt="" loading="lazy" draggable={false} onError={e => { e.currentTarget.style.visibility = "hidden"; }} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
      {preview?.track.id === track.id && preview.playing && size !== 42 && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}><IC.Pause /></div>
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
        <div style={{ display: "flex", gap: 12, padding: "0 12px", overflowX: "auto", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
          {(tracks ?? Array.from({ length: 4 }, () => null)).map((track, i) => track ? (
            <div key={track.id} style={{ flexShrink: 0, width: tileW, cursor: "pointer" }} onClick={() => togglePreview(track)}>
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
      aria-hidden={!open}
      style={{
        position: "fixed", inset: 0, zIndex: 300, background: T.bg, color: T.text, display: "flex", flexDirection: "column",
        paddingTop: "env(safe-area-inset-top, 0px)",
        transform: open ? "translateX(0)" : "translateX(100%)", visibility: open ? "visible" : "hidden",
        transition: open ? "transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)" : "transform 0.26s ease, visibility 0s 0.26s",
      }}
    >
      <style>{"@keyframes mptree-spin { to { transform: rotate(360deg) } }"}</style>

      {/* The same header as Songs and Playlists, with Discover filled. */}
      <div style={{ margin: "2px 12px 0", background: T.card, border: `1px solid ${T.border}`, borderRadius: 22, padding: "8px 14px 12px", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
          <button onClick={onClose} aria-label={t("Songs")} style={{ background: "transparent", border: "none", padding: 0, display: "flex", color: T.text, cursor: "pointer", flexShrink: 0 }}>
            <Logo size={small ? 42 : 48} color={T.text} />
          </button>
          <div style={{ display: "flex", alignItems: "center", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 20, padding: 3, gap: 2, minWidth: 0 }}>
            <button onClick={onClose} style={seg(false)}>{t("Songs")}</button>
            <button onClick={onGoPlaylists} style={seg(false)}>{t("Playlists")}</button>
            <button onClick={() => setList(null)} style={{ ...seg(true), ...(small ? { padding: "6px 10px" } : null) }} aria-label={t("Discover")}>
              {compass(T.playBtnFg)}{!small && t("Discover")}
            </button>
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
              <div key={track.id} onClick={() => togglePreview(track)} style={{ display: "flex", alignItems: "center", gap: 12, height: small ? 68 : 78, padding: small ? "0 10px 0 14px" : "0 10px 0 16px", cursor: "pointer" }}>
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
        <div style={{ position: "absolute", left: 12, right: 12, bottom: "calc(14px + env(safe-area-inset-bottom, 0px))", height: 62, borderRadius: 22, background: T.playerBg, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12, padding: "0 10px" }}>
          {cover(preview.track, 42, 10)}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{preview.track.title}</div>
            <div style={{ fontSize: 12.5, color: T.textSub, marginTop: 3, fontVariantNumeric: "tabular-nums" }}>
              {t("Preview")} · {fmt(preview.pos)} / {fmt(Math.min(PREVIEW_S, preview.track.duration || PREVIEW_S))}
            </div>
          </div>
          {dlButton(preview.track, 40)}
          <button onClick={() => togglePreview(preview.track)} aria-label={preview.playing ? t("Pause") : t("Play")} style={{ width: 40, height: 40, borderRadius: "50%", background: T.accent, color: T.playBtnFg, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            {preview.playing ? <IC.Pause /> : <IC.Play />}
          </button>
        </div>
      )}
    </div>
  );
}

function compass(c: string) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9.5" /><polygon points="15.5 8.5 13.5 13.5 8.5 15.5 10.5 10.5" fill={c} />
    </svg>
  );
}

/** The compass, for the Discover tab in the app's own header. */
export const DiscoverIcon = compass;
