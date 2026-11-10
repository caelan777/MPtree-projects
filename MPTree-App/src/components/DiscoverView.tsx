import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Browser } from "@capacitor/browser";
import { Preferences } from "@capacitor/preferences";
import type { T } from "../themes";
import { t } from "../i18n";
import { IC } from "./Icons";
import { Sync } from "../plugins";
import { count, countDaily } from "../counter";
import {
  SHELVES, POPULAR, POPULAR_ALL, loadShelf, listShelf, pageSize, loadSaved, markSaved, type Shelf,
  saveName, licenceChip, nextArt, baseName, onSavedChange, type FreeTrack,
  searchAll, artistsOf, artistTracks, type Artist,
} from "../discover";

// ─── DISCOVER ────────────────────────────────────────────────────────────────
// Free music to download, as shelves of covers per genre, from Audius and the
// Internet Archive, under Popular this week and Popular artists. It is the first page,
// left of Songs, under the same header card: the download button in the card
// slides it in, and Back or a tab takes you back. It is not swiped, so the
// rows of covers can scroll sideways freely. The header's search box searches both sources while you are here.
//
// A tap on a cover brings that song forward as a card (the big player) and
// plays the whole song from Audius, with a timeline to seek. Closing the card
// leaves the small player at the bottom; a tap on it brings the card back.
// Every download button saves the file into Music/MPTree, and what was tapped
// then flies into the Songs tab, which gets a "+1". You stay here. The page
// stays mounted once opened, so a download keeps going while you are on Songs.

/** What a full list shows: a row, a search, or an artist's songs. */
type ListOf = { title: string; shelf?: Shelf; query?: string; artist?: Artist };

/** Progress of a download: 0..1, -1 while the size is not known, or "done". */
type Dl = number | "done";

type Preview = { track: FreeTrack; playing: boolean; loading: boolean; pos: number };
type Flyer = { key: number; art: string | null; x: number; y: number; w: number; h: number; dx: number; dy: number; go: boolean };


function DiscoverViewInner({
  open, warm, panelRef, topInset, bottomInset, playerBottom, songsTabRef, query, searchSignal, libraryNames,
  T, backRef, onPreview, onSaved, onActiveChange, onBodyScroll, onInsetJump, animateInsets = true,
}: {
  open: boolean;
  /** A swipe on Songs has started to pull this page in: time to load. */
  warm: boolean;
  /** The page itself, for App to move while a finger pulls it in. */
  panelRef: React.MutableRefObject<HTMLDivElement | null>;
  /** Where the header card ends, and the room the app's own player takes. */
  topInset: number;
  bottomInset: number;
  /** Where the app puts its small player above the bottom edge; this page's own goes there too. */
  playerBottom: number;
  /** The Songs tab in the header: where a download flies to. */
  songsTabRef: React.RefObject<HTMLElement | null>;
  /** The header's search box, and a count that goes up on Enter or clear. */
  query: string;
  searchSignal: number;
  /** File names of every song MPTree has (in Songs or the bin). Null while the
   *  library is still loading. A saved track no longer among them was deleted
   *  for good, and can be downloaded again. */
  libraryNames: Set<string> | null;
  /** Android's Back: true when the page handled it (closed the card, left a list). */
  backRef: React.MutableRefObject<(() => boolean) | null>;
  T: T;
  /** Not called from here any more (the page is not swiped away); kept for App. */
  onClose?: () => void;
  /** Playing here starts: MPTree's own playback should pause. */
  onPreview: () => void;
  /** The file is in Music/MPTree. Resolves when the song is in Songs. */
  onSaved: (track: FreeTrack, path: string) => Promise<void>;
  /** Whether this page has its own small player up, so the app hides its own. */
  onActiveChange: (active: boolean) => void;
  /** Scrolling, for the header to fold and unfold as on Songs. */
  onBodyScroll?: (top: number) => void;
  /** Called before the page moves its own scroll to make up for the fold, so
   *  App does not take that scroll for the finger's. */
  onInsetJump?: () => void;
  animateInsets?: boolean;
}) {
  const [shelves, setShelves] = useState<Record<string, FreeTrack[] | "error">>({});
  // The week had too few free songs: the first list is the most played ever.
  const [popAll, setPopAll] = useState(false);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [dl, setDl] = useState<Record<string, Dl>>({});
  const [list, setList] = useState<null | ListOf & { tracks: FreeTrack[]; more: boolean; busy: boolean; error?: boolean }>(null);
  const [failNote, setFailNote] = useState<string | null>(null);
  // Add more music: a site of their own choosing, typed in once, then one
  // tap opens it in the browser. Kept on the phone only.
  const [ownLink, setOwnLink] = useState<string | null>(null);
  const [ownEdit, setOwnEdit] = useState<string | null>(null);
  useEffect(() => { Preferences.get({ key: OWN_KEY }).then(r => setOwnLink(r.value || null)).catch(() => {}); }, []);
  const saveOwn = (raw: string) => {
    const url = toLink(raw);
    if (raw.trim() && !url) return;
    setOwnLink(url);
    setOwnEdit(null);
    (url ? Preferences.set({ key: OWN_KEY, value: url }) : Preferences.remove({ key: OWN_KEY })).catch(() => {});
  };
  // `loading`: asked to play, no sound yet (starting, or buffering).
  const [preview, setPreview] = useState<Preview | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const small = typeof window !== "undefined" && window.innerWidth < 390;

  // The song that came forward. `fly` is where Songs is, once it is saved.
  const [card, setCard] = useState<null | { track: FreeTrack; fly?: { x: number; y: number } }>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const cardIdRef = useRef<string | null>(null);
  cardIdRef.current = card?.track.id ?? null;
  const [flyers, setFlyers] = useState<Flyer[]>([]);

  // Leaving the page: next time it opens on its home, not on an old list.
  // ── The wall ──────────────────────────────────────────────────────────────
  // A wall of black and white sleeves (build 88) passes over the screen.
  // Opening, it flows down from the top; leaving, from the bottom up. The
  // moment it covers the screen, the page is put in or taken away behind it,
  // and the wall goes on and out at the other end. Nothing else moves.
  // Tapping fast: a pass that has not covered the screen yet just shows what
  // is wanted by the time it does. Once a pass has covered it, the next tap
  // sends a new one in from its own end, and the old one carries on out. So
  // there is always a wall to cover the change. Not with reduced motion.
  const [passes, setPasses] = useState<{ id: number; up: boolean }[]>([]);
  // The page is on screen (it changes only behind a wall).
  const [shown, setShown] = useState(open);
  const openRef = useRef(open);
  openRef.current = open;
  const wasOpen = useRef(open);
  const coverAt = useRef(0);
  const passId = useRef(0);
  useEffect(() => {
    if (wasOpen.current === open) return;
    wasOpen.current = open;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setShown(open); return; }
    if (performance.now() < coverAt.current) return;
    const id = ++passId.current;
    coverAt.current = performance.now() + WALL_MS / 2;
    setPasses(p => [...p, { id, up: !open }]);
    window.setTimeout(() => setShown(openRef.current), WALL_MS / 2);
    window.setTimeout(() => setPasses(p => p.filter(x => x.id !== id)), WALL_MS);
  }, [open]);

  // The anonymous counter (counter.ts): Discover opened, once a day.
  useEffect(() => { if (open) countDaily("discover"); }, [open]);
  // Gone from the screen: next time it opens on its home, not on an old list.
  useEffect(() => { if (!shown) { setCard(null); setList(null); } }, [shown]);
  useEffect(() => { onActiveChange(!!preview); }, [!!preview]); // eslint-disable-line react-hooks/exhaustive-deps

  const rootRef = useRef<HTMLDivElement | null>(null);
  const rootScrollRef = useRef<HTMLDivElement | null>(null);
  const setRoot = useCallback((el: HTMLDivElement | null) => { rootRef.current = el; panelRef.current = el; }, [panelRef]);
  const listUp = !!list;

  // ── Shelves ───────────────────────────────────────────────────────────────
  const loadAll = useCallback(() => {
    setShelves({});
    setPopAll(false);
    [POPULAR, ...SHELVES].forEach(s => {
      const load = s === POPULAR
        ? loadShelf(s).catch(() => loadShelf(POPULAR_ALL).then(tracks => { setPopAll(true); return tracks; }))
        : loadShelf(s);
      load
        .then(tracks => setShelves(prev => ({ ...prev, [s.key]: tracks })))
        .catch(() => setShelves(prev => ({ ...prev, [s.key]: "error" })));
    });
  }, []);

  const started = useRef(false);
  useEffect(() => {
    if (!(open || warm) || started.current) return;
    started.current = true;
    loadSaved().then(setSaved);
    loadAll();
  }, [open, warm, loadAll]);

  // A song deleted for good: forget it here too.
  useEffect(() => onSavedChange(() => {
    loadSaved().then(all => {
      setSaved(all);
      setDl(d => {
        const n = { ...d };
        for (const id of Object.keys(n)) if (n[id] === "done" && !all[id]) delete n[id];
        return n;
      });
    });
  }), []);

  const isSaved = (id: string) =>
    dl[id] === "done" || (!!saved[id] && (!libraryNames || libraryNames.has(baseName(saved[id]))));

  // ── Playing (the whole song, streamed from Audius) ────────────────────────
  const stopPreview = useCallback(() => {
    const a = audioRef.current;
    if (a) { a.pause(); a.removeAttribute("src"); a.load(); }
    setPreview(null);
  }, []);

  useEffect(() => { if (!open) stopPreview(); }, [open, stopPreview]);

  const audio = () => {
    let a = audioRef.current;
    if (a) return a;
    a = new Audio();
    a.preload = "none";
    a.ontimeupdate = () => { const pos = a!.currentTime; setPreview(p => p && { ...p, pos }); };
    a.onwaiting = () => setPreview(p => p && p.playing ? { ...p, loading: true } : p);
    a.onseeking = () => setPreview(p => p && p.playing ? { ...p, loading: true } : p);
    a.onplaying = () => setPreview(p => p && { ...p, loading: false });
    a.onseeked = () => setPreview(p => p && { ...p, loading: false });
    a.onended = () => setPreview(p => p && { ...p, playing: false, loading: false, pos: 0 });
    a.onerror = () => { if (!a!.getAttribute("src")) return; setPreview(null); setFailNote(t("This song does not play right now. Try another one.")); };
    audioRef.current = a;
    return a;
  };

  const togglePreview = (track: FreeTrack) => {
    const a = audio();
    if (preview?.track.id === track.id) {
      if (preview.playing) { a.pause(); setPreview({ ...preview, playing: false, loading: false }); }
      else { onPreview(); void a.play().catch(() => setPreview(null)); setPreview({ ...preview, playing: true, loading: a.readyState < 3 }); }
      return;
    }
    onPreview();
    a.src = track.stream;
    void a.play().catch(() => setPreview(null));
    setPreview({ track, playing: true, loading: true, pos: 0 });
    count("discover-play");
  };

  /** To a point in the song, in seconds. Starts it when it is not the one playing. */
  const seek = (track: FreeTrack, sec: number) => {
    const a = audio();
    if (preview?.track.id !== track.id) {
      onPreview();
      a.src = track.stream;
      setPreview({ track, playing: true, loading: true, pos: sec });
      count("discover-play");
      const go = () => { a.currentTime = sec; a.removeEventListener("loadedmetadata", go); };
      a.addEventListener("loadedmetadata", go);
      void a.play().catch(() => setPreview(null));
      return;
    }
    a.currentTime = sec;
    setPreview(p => p && { ...p, pos: sec });
    if (!preview.playing) { onPreview(); void a.play().catch(() => {}); setPreview(p => p && { ...p, playing: true, loading: true }); }
  };

  const openCard = (track: FreeTrack) => {
    setCard({ track });
    if (!(preview?.track.id === track.id && preview.playing)) togglePreview(track);
  };

  // ── Into Songs ────────────────────────────────────────────────────────────
  // Saved while its card is up: the card itself shrinks into the Songs tab.
  // Saved from anywhere else (a tile, a row, the small player): its cover
  // flies there. You stay here, and the song keeps playing.
  const target = () => {
    const s = songsTabRef.current?.getBoundingClientRect();
    return s && s.width > 0 ? { x: s.left + s.width / 2, y: s.top + s.height / 2 } : null;
  };

  const flyCard = (id: string) => {
    const c = cardRef.current, to = target();
    if (!c || !to || cardIdRef.current !== id) return false;
    const a = c.getBoundingClientRect();
    setCard(cur => cur && { ...cur, fly: { x: to.x - (a.left + a.width / 2), y: to.y - (a.top + a.height / 2) } });
    setTimeout(() => { if (cardIdRef.current === id) setCard(null); }, FLY_MS);
    return true;
  };

  const flyKey = useRef(0);
  const flyCover = (track: FreeTrack, from: HTMLElement | null) => {
    const to = target();
    const el = from?.closest("[data-fly]")?.querySelector<HTMLElement>("[data-cover]") ?? from;
    if (!to || !el || !el.isConnected) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0) return;
    const key = ++flyKey.current;
    const f: Flyer = { key, art: track.art, x: r.left, y: r.top, w: r.width, h: r.height, dx: to.x - (r.left + r.width / 2), dy: to.y - (r.top + r.height / 2), go: false };
    setFlyers(fs => [...fs, f]);
    requestAnimationFrame(() => requestAnimationFrame(() => setFlyers(fs => fs.map(x => x.key === key ? { ...x, go: true } : x))));
    setTimeout(() => setFlyers(fs => fs.filter(x => x.key !== key)), FLY_MS + 60);
  };

  // ── Download ──────────────────────────────────────────────────────────────
  const download = async (track: FreeTrack, from: HTMLElement | null) => {
    if (typeof dl[track.id] === "number") return;
    if (isSaved(track.id)) return;
    const tid = "discover-" + track.id;
    setDl(d => ({ ...d, [track.id]: -1 }));
    const sub = await Sync.addListener("progress", p => {
      if (p.tid === tid) setDl(d => ({ ...d, [track.id]: p.total > 0 ? Math.min(0.99, p.done / p.total) : -1 }));
    }).catch(() => null);
    try {
      await Sync.urlDownload({ url: track.file, tid });
      const out = await Sync.finishFile({ tid, name: saveName(track) });
      if (!out.path) throw new Error("not saved");
      await markSaved(track.id, out.path);
      setSaved(s => ({ ...s, [track.id]: out.path! }));
      setDl(d => ({ ...d, [track.id]: "done" }));
      count("discover-download");
      if (!flyCard(track.id)) flyCover(track, from);
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

  // ── A full list: one row, a search (both sources), or an artist ───────────
  // `page` counts from 0. An artist is one page: Audius gives all at once.
  const known = (): FreeTrack[] => Object.values(shelves).flatMap(v => (Array.isArray(v) ? v : []));
  const fetchList = async (o: ListOf, page: number): Promise<FreeTrack[]> => {
    if (o.shelf) return listShelf(o.shelf, page * pageSize(o.shelf));
    if (o.query) return searchAll(o.query, page);
    if (!o.artist || page > 0) return [];
    const id = o.artist.id;
    const mine = known().filter(x => x.artistId === id);
    const theirs = await artistTracks(id).catch(() => (mine.length ? [] : Promise.reject(new Error("offline"))));
    const have = new Set(theirs.map(x => x.id));
    return [...theirs, ...mine.filter(x => !have.has(x.id))];
  };
  const offsetRef = useRef(0);
  // A search typed while another still loads: the older answer is dropped,
  // or it would fill the newer list.
  const listToken = useRef(0);
  // The fold, the same as on Songs. Scrolled down, the top padding changes at
  // once and the scroll position by the same amount, so what is on screen
  // stays put while the header folds over or out (moving it by a transform
  // there instead made the page flicker on the phone). At the top of the page
  // the padding stays and the content moves with the header by a transform,
  // over the same time and curve, so that fold does not lay out the ~2900
  // elements on the page on every frame.
  const baseRef = useRef(topInset);
  const prevInset = useRef(topInset);
  const jumpRef = useRef(0);
  if (topInset !== prevInset.current) {
    const el = rootScrollRef.current;
    if (el && el.scrollTop > 0) {
      jumpRef.current += topInset - prevInset.current;
      baseRef.current = topInset;
    }
    prevInset.current = topInset;
  }
  const pad = baseRef.current;
  const shift = topInset - pad;
  const [scrolled, setScrolled] = useState(false);
  useLayoutEffect(() => {
    const el = rootScrollRef.current;
    const d = jumpRef.current;
    jumpRef.current = 0;
    if (!el || !d) return;
    onInsetJump?.();
    el.scrollTop += d;
  }, [topInset]); // eslint-disable-line react-hooks/exhaustive-deps
  const FOLD_MOTION = "0.24s cubic-bezier(0.22, 1, 0.36, 1)";

  // Where the home was, to go back there when the list closes.
  const homeTop = useRef(0);
  const openList = (o: ListOf) => {
    const sc = rootScrollRef.current;
    if (!list && sc) homeTop.current = sc.scrollTop;
    const token = ++listToken.current;
    setList({ ...o, tracks: [], more: false, busy: true });
    offsetRef.current = 1;
    sc?.scrollTo({ top: 0 });
    fetchList(o, 0)
      .then(tracks => { if (token === listToken.current) setList(l => l && { ...l, tracks, more: tracks.length > 0 && !o.artist, busy: false }); })
      .catch(() => { if (token === listToken.current) setList(l => l && { ...l, busy: false, error: true }); });
  };
  const loadMore = () => {
    if (!list || list.busy) return;
    const token = listToken.current;
    const page = offsetRef.current;
    offsetRef.current += 1;
    setList({ ...list, busy: true });
    fetchList(list, page)
      .then(more => { if (token === listToken.current) setList(l => {
        if (!l) return l;
        const have = new Set(l.tracks.map(x => x.id));
        const fresh = more.filter(x => !have.has(x.id));
        return { ...l, tracks: [...l.tracks, ...fresh], more: fresh.length > 0, busy: false };
      }); })
      .catch(() => { if (token === listToken.current) setList(l => l && { ...l, busy: false }); });
  };
  const closeList = () => { listToken.current++; setList(null); };
  // Back on the home: where it was, before it is drawn.
  useLayoutEffect(() => {
    if (!listUp && rootScrollRef.current) rootScrollRef.current.scrollTop = homeTop.current;
  }, [listUp]);

  // The header's search box: Enter searches, the X (an empty box) goes back.
  const firstSignal = useRef(searchSignal);
  useEffect(() => {
    if (searchSignal === firstSignal.current) return;
    const q = query.trim();
    if (q) { setCard(null); openList({ title: q, query: q }); }
    else if (list?.query) closeList();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchSignal]);

  // Back on Android: the card first, then the list, then out of Discover.
  backRef.current = () => {
    if (card) { closeCard(); return true; }
    if (list) { closeList(); return true; }
    return false;
  };

  // ── Pieces ────────────────────────────────────────────────────────────────
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  /** inverse: on the card, which is the accent colour itself. */
  const dlButton = (track: FreeTrack, size: number, inverse = false) => {
    const done = isSaved(track.id);
    const state = done ? "done" : dl[track.id];
    const busy = typeof state === "number";
    const r = size / 2 - 1.5;
    const c = 2 * Math.PI * r;
    return (
      <button
        onClick={e => { e.stopPropagation(); void download(track, e.currentTarget); }}
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
    <div data-cover="" style={{ width: size, height: typeof size === "number" ? size : undefined, aspectRatio: "1", borderRadius: radius, overflow: "hidden", background: T.card, border: `1px solid ${T.border}`, flexShrink: 0, position: "relative" }}>
      {track.art && <img src={track.art} alt="" loading="lazy" decoding="async" draggable={false} onError={e => nextArt(track, e.currentTarget)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
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

  const sub = (track: FreeTrack, extra?: string) => isSaved(track.id)
    ? <span>{t("In your Songs")}</span>
    : <><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{track.artist}</span>{chip(track)}{extra && <span style={{ flexShrink: 0 }}>{extra}</span>}</>;

  const tileW = small ? 132 : 150;
  const shelf = (s: Shelf) => {
    const { key, label } = s;
    const tracks = shelves[key];
    if (tracks === "error" || (Array.isArray(tracks) && tracks.length === 0)) return null;
    return (
      <div key={key} style={{ contain: "layout paint" }}>
        {sectionTitle(t(label), tracks ? () => openList({ title: t(label), shelf: s }) : undefined)}
        <div data-hscroll="" style={{ display: "flex", gap: 12, padding: "0 12px", overflowX: "auto", scrollbarWidth: "none", WebkitOverflowScrolling: "touch", overscrollBehaviorX: "contain" }}>
          {(tracks ?? Array.from({ length: 4 }, () => null)).map((track, i) => track ? (
            <div key={track.id} data-fly="" style={{ flexShrink: 0, width: tileW, cursor: "pointer" }} onClick={() => openCard(track)}>
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

  /** A heading on the home, with See all when there is more. */
  const sectionTitle = (label: string, onAll?: () => void) => (
    <div style={{ margin: "26px 16px 12px", display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
      <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", color: T.text }}>{label}</span>
      {onAll && (
        <button onClick={onAll} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: T.textSub, fontFamily: "inherit", flexShrink: 0 }}>
          {t("See all")}
        </button>
      )}
    </div>
  );

  /** One song as a row: in lists, and in Popular songs (with its place). */
  const row = (track: FreeTrack, rank?: number) => (
    <div key={track.id} data-fly="" onClick={() => openCard(track)} style={{ display: "flex", alignItems: "center", gap: 12, height: small ? 68 : 74, padding: rank ? "0 4px 0 0" : small ? "0 10px 0 14px" : "0 10px 0 16px", cursor: "pointer", minWidth: 0 }}>
      {rank !== undefined && <span style={{ width: 22, textAlign: "center", fontSize: 15, fontWeight: 800, color: T.muted, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{rank}</span>}
      {cover(track, small ? 42 : 48, 10)}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{track.title}</div>
        <div style={{ fontSize: 12.5, color: T.textSub, marginTop: 3, display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}>{sub(track, rank ? undefined : fmt(track.duration))}</div>
      </div>
      {dlButton(track, 38)}
    </div>
  );

  // Popular this week: columns of four, numbered, a column at a time.
  const popular = shelves[POPULAR.key];
  const popTitle = popAll ? t("Popular songs") : t("Popular this week");
  const popularSection = () => {
    if (popular === "error" || (Array.isArray(popular) && popular.length === 0)) return null;
    const cols: (FreeTrack | null)[][] = [];
    const items = popular ?? Array.from({ length: 8 }, () => null);
    for (let i = 0; i < items.length; i += 4) cols.push(items.slice(i, i + 4));
    return (
      <div>
        {sectionTitle(popTitle, popular ? () => openList({ title: popTitle, shelf: popAll ? POPULAR_ALL : POPULAR }) : undefined)}
        <div data-hscroll="" style={{ display: "flex", gap: 16, padding: "0 16px", overflowX: "auto", scrollbarWidth: "none", overscrollBehaviorX: "contain", scrollSnapType: "x proximity", scrollPaddingInline: 16 }}>
          {cols.map((col, c) => (
            <div key={c} style={{ flex: "0 0 calc(100% - 28px)", minWidth: 0, scrollSnapAlign: "end" }}>
              {col.map((track, i) => track ? row(track, c * 4 + i + 1) : (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, height: small ? 68 : 74 }}>
                  <span style={{ width: 22 }} />
                  <div style={{ width: 48, height: 48, borderRadius: 10, background: T.card, border: `1px solid ${T.border}` }} />
                  <div style={{ height: 12, width: "50%", borderRadius: 4, background: T.card }} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Popular artists: the people behind the songs on the page, most followed first.
  const artists = artistsOf(known());
  const artistPic = (a: Artist, size: number) => (
    <div style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", background: T.card, border: `1px solid ${T.border}`, flexShrink: 0 }}>
      {a.pic && <img src={a.pic} alt="" loading="lazy" draggable={false} onError={e => {
        const img = e.currentTarget, i = Number(img.dataset.try ?? -1) + 1;
        if (i < a.mirrors.length) { img.dataset.try = String(i); img.src = a.mirrors[i]; } else img.style.visibility = "hidden";
      }} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
    </div>
  );
  const artistW = small ? 92 : 104;
  const artistsSection = () => artists.length < 3 ? null : (
    <div>
      {sectionTitle(t("Popular artists"))}
      <div data-hscroll="" style={{ display: "flex", gap: 14, padding: "0 14px", overflowX: "auto", scrollbarWidth: "none", overscrollBehaviorX: "contain" }}>
        {artists.map(a => (
          <div key={a.id} onClick={() => openList({ title: a.name, artist: a })} style={{ flexShrink: 0, width: artistW, cursor: "pointer", textAlign: "center" }}>
            {artistPic(a, artistW)}
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: T.text }}>{a.name}</div>
          </div>
        ))}
      </div>
    </div>
  );

  /** A site in the browser. */
  const opening = useRef(0);
  const openSite = (url: string) => {
    if (Date.now() - opening.current < 1500) return;
    opening.current = Date.now();
    Browser.open({ url }).catch(() => window.open(url, "_blank", "noopener"));
  };
  /** A card that opens a site: its mark, and what you find there. */
  const siteCard = (label: string, url: string, mark: React.ReactNode) => (
    <button className="mp-press" onClick={() => openSite(url)} style={{ flex: 1, minWidth: 0, height: 104, padding: 14, borderRadius: 16, border: `1px solid ${T.border}`, background: T.card, color: T.text, fontFamily: "inherit", cursor: "pointer", display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "stretch", textAlign: "left" }}>
      <span style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span style={{ width: 40, height: 40, borderRadius: 11, background: T.text, color: T.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>{mark}</span>
        <span style={{ color: T.muted, display: "flex" }}>{ARROW}</span>
      </span>
      <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.25 }}>{label}</span>
    </button>
  );

  /** Add more music: unset, a tap asks for the link; set, a tap opens it
   *  and the pencil changes it. */
  const ownCard = () => (
    <div className="mp-press" role="button" onClick={() => (ownLink ? openSite(ownLink) : setOwnEdit(""))} style={{ height: 64, padding: "0 6px 0 12px", borderRadius: 16, border: `1px solid ${T.border}`, background: T.card, color: T.text, display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
      <span style={{ width: 40, height: 40, borderRadius: 11, background: T.text, color: T.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><IC.Plus /></span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 700 }}>{t("Add more music")}</span>
        <span style={{ display: "block", fontSize: 12.5, color: T.muted, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {ownLink ? ownLink.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") : t("Add a link to a site you get music from")}
        </span>
      </span>
      {ownLink ? (
        <button onClick={e => { e.stopPropagation(); setOwnEdit(ownLink); }} aria-label={t("Change the link")} style={{ width: 40, height: 40, border: "none", background: "transparent", color: T.muted, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}><IC.Edit /></button>
      ) : null}
    </div>
  );

  const allFailed = [POPULAR, ...SHELVES].every(s => shelves[s.key] === "error");
  const cardPreview = card && preview?.track.id === card.track.id ? preview : null;

  // Closing the card: it and its shade fade out rather than vanish.
  const [cardOut, setCardOut] = useState(false);
  const closeCard = () => {
    if (!card || card.fly || cardOut) return;
    setCardOut(true);
    setTimeout(() => { setCard(null); setCardOut(false); }, 160);
  };


  // Drawn again only when something on it changes: not on every render of
  // App, and not on each tick of the playing song's clock.
  const previewKey = preview ? `${preview.track.id}|${preview.playing}|${preview.loading}` : "";
  const homeView = useMemo(() => (
          <div>
            {/* More music elsewhere: the sites themselves, never a search on
                them, so nothing here points at a song without a licence. */}
            <div style={{ display: "flex", gap: 10, padding: "4px 16px 0" }}>
              {siteCard(t("More music on Internet Archive"), "https://archive.org/details/audio", ARCHIVE_MARK)}
              {siteCard(t("Buy music on Bandcamp"), "https://bandcamp.com", BANDCAMP_MARK)}
            </div>
            <div style={{ padding: "10px 16px 0" }}>{ownCard()}</div>
            {popularSection()}{artistsSection()}{SHELVES.map(s => shelf(s))}
          </div>
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [shelves, saved, dl, libraryNames, previewKey, small, T, ownLink]);
  const listView = useMemo(() => !list ? null : (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 8px 6px" }}>
              <button onClick={closeList} aria-label={t("Back")} style={{ background: "none", border: "none", color: T.text, padding: 8, display: "flex", cursor: "pointer" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              {list.artist && artistPic(list.artist, 40)}
              <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{list.title}</div>
            </div>
            {list.tracks.map((track, i) => (
              <React.Fragment key={track.id}>
                {list.query && track.source === "archive" && list.tracks[i - 1]?.source !== "archive" && (
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.textSub, padding: "18px 16px 4px" }}>Internet Archive</div>
                )}
                {row(track)}
              </React.Fragment>
            ))}
            {list.busy && <div style={{ textAlign: "center", color: T.muted, fontSize: 13, padding: 24 }}>{t("Loading…")}</div>}
            {!list.busy && list.error && <div style={{ textAlign: "center", color: T.muted, fontSize: 14, padding: "40px 24px" }}>{t("No connection. Check your internet and try again.")}</div>}
            {!list.busy && !list.error && list.tracks.length === 0 && <div style={{ textAlign: "center", color: T.muted, fontSize: 14, padding: "40px 24px" }}>{t("Nothing found")}</div>}
            {!list.busy && !list.error && (list.more || list.query) && (
              <div style={{ display: "flex", justifyContent: "center", padding: 16 }}>
                {list.more
                  ? <button onClick={loadMore} style={{ borderRadius: 12, padding: "9px 16px", fontSize: 14, fontWeight: 700, background: T.dim, color: T.text, border: "none", cursor: "pointer", fontFamily: "inherit" }}>{t("Load more")}</button>
                  // The search page itself, without the words: what is on the
                  // Archive is not all free to share, so MPTree does not search it for you.
                  : <button onClick={() => openSite("https://archive.org/search")} style={{ display: "flex", alignItems: "center", gap: 8, borderRadius: 12, padding: "9px 14px 9px 16px", fontSize: 14, fontWeight: 700, background: T.dim, color: T.text, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                      {t("More music on Internet Archive")}{ARROW}
                    </button>}
              </div>
            )}
          </div>
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [list, saved, dl, libraryNames, previewKey, small, T]);

  return (
    <div
      ref={setRoot}
      aria-hidden={!open}
      style={{
        position: "absolute", inset: 0, zIndex: 15, background: T.bg, color: T.text,
        // Hidden, the walls in it still show (they say visible themselves).
        visibility: shown ? "visible" : "hidden",
        pointerEvents: open && shown ? undefined : "none",
      }}
    >
      <style>{KEYFRAMES}</style>

      <div
        ref={rootScrollRef}
        onScroll={e => {
          const top = e.currentTarget.scrollTop;
          if ((top > 0) !== scrolled) setScrolled(top > 0);
          onBodyScroll?.(top);
        }}
        style={{ position: "absolute", inset: 0, overflowY: "auto", touchAction: "pan-y", paddingTop: pad, paddingBottom: preview ? playerBottom + 62 + 24 : bottomInset + 12, boxSizing: "border-box", overflowAnchor: "none" }}
      >
        <div style={{ transform: shift || !scrolled ? `translateY(${shift}px)` : "none", transition: animateInsets && !scrolled ? `transform ${FOLD_MOTION}` : "none" }}>
        {list ? listView : allFailed ? (
          <div style={{ textAlign: "center", color: T.muted, fontSize: 14, padding: "80px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            {t("No connection. Check your internet and try again.")}
            <button onClick={loadAll} style={{ borderRadius: 12, padding: "9px 16px", fontSize: 14, fontWeight: 700, background: T.accent, color: T.playBtnFg, border: "none", cursor: "pointer", fontFamily: "inherit" }}>{t("Try again")}</button>
          </div>
        ) : homeView}
        <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5, padding: "28px 20px 8px", textAlign: "center" }}>
          {t("Music from Audius and the Internet Archive. Only songs that may be shared freely, with the artist's name kept on them.")}
          {/* Audius' API terms ask apps to give their users these. */}
          <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", justifyContent: "center", columnGap: 14, rowGap: 2 }}>
            {([
              [t("Audius privacy policy"), "https://audius.co/legal/privacy-policy"],
              [t("Audius API terms"), "https://audius.co/legal/api-terms"],
              ["Open Music License", "https://openaudiofoundation.org/open-music-license.pdf"],
            ] as const).map(([label, url]) => (
              <button key={url} onClick={() => openSite(url)} style={{ border: "none", background: "transparent", color: T.muted, fontFamily: "inherit", fontSize: 12, padding: "6px 0", textDecoration: "underline", textUnderlineOffset: 2, cursor: "pointer" }}>{label}</button>
            ))}
          </div>
        </div>
        </div>
      </div>

      {passes.map(p => <Wall key={p.id} up={p.up} />)}

      {failNote && (
        <div style={{ position: "absolute", left: 12, right: 12, bottom: preview ? playerBottom + 62 + 16 : bottomInset + 8, background: T.sheetBg, border: `1px solid ${T.border}`, borderRadius: 18, padding: "12px 16px", fontSize: 14, fontWeight: 600, boxShadow: "0 10px 36px rgba(0,0,0,0.35)" }}>
          {failNote}
        </div>
      )}

      {/* The small player. A tap on it brings the card back. */}
      {preview && (
        <div
          data-fly=""
          onClick={() => setCard({ track: preview.track })}
          role="button"
          aria-label={t("Open")}
          style={{ position: "absolute", left: 12, right: 12, bottom: playerBottom, height: 62, borderRadius: 22, background: T.playerBg, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12, padding: "0 10px", overflow: "hidden", cursor: "pointer", boxShadow: "0 10px 36px rgba(0,0,0,0.35)" }}
        >
          <div aria-hidden="true" style={{ position: "absolute", left: 0, bottom: 0, height: 2, background: T.text, width: `${preview.track.duration ? Math.min(100, (preview.pos / preview.track.duration) * 100) : 0}%`, transition: "width 0.25s linear" }} />
          {cover(preview.track, 42, 10)}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{preview.track.title}</div>
            <div style={{ fontSize: 12.5, color: T.textSub, marginTop: 3, fontVariantNumeric: "tabular-nums" }}>
              {preview.loading ? t("Loading…") : `${fmt(preview.pos)} / ${fmt(preview.track.duration)}`}
            </div>
          </div>
          {dlButton(preview.track, 40)}
          <button onClick={e => { e.stopPropagation(); togglePreview(preview.track); }} aria-label={preview.playing ? t("Pause") : t("Play")} style={{ width: 40, height: 40, borderRadius: "50%", background: T.accent, color: T.playBtnFg, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            {preview.playing && preview.loading ? <Spinner size={18} /> : preview.playing ? <IC.Pause /> : <IC.Play />}
          </button>
        </div>
      )}

      {/* The card and the flying covers go over everything, header included:
          they fly into its Songs tab. */}
      {createPortal(
        <>
          {ownEdit !== null && (
            <div onClick={() => setOwnEdit(null)} style={{ position: "fixed", inset: 0, zIndex: 380, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.55)", color: T.text, padding: 20 }}>
              <form noValidate onClick={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); saveOwn(ownEdit); }} style={{ width: "min(340px, 100%)", background: T.sheetBg, border: `1px solid ${T.border}`, borderRadius: 20, padding: 18, boxShadow: "0 30px 60px rgba(0,0,0,0.5)" }}>
                <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em" }}>{t("Add more music")}</div>
                <div style={{ fontSize: 13, color: T.muted, marginTop: 4, lineHeight: 1.4 }}>{t("The site you get music from. A tap on the card then opens it in your browser.")}</div>
                <input autoFocus type="url" inputMode="url" value={ownEdit} onChange={e => setOwnEdit(e.target.value)} placeholder="example.com" aria-label={t("Link")}
                  style={{ width: "100%", boxSizing: "border-box", marginTop: 14, height: 46, borderRadius: 12, border: `1px solid ${ownEdit.trim() && !toLink(ownEdit) ? T.text : T.border}`, background: T.card, color: T.text, fontSize: 16, padding: "0 12px", fontFamily: "inherit", outline: "none" }} />
                {ownEdit.trim() && !toLink(ownEdit) && <div style={{ fontSize: 12.5, color: T.muted, marginTop: 6 }}>{t("That is not a web address.")}</div>}
                <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
                  {ownLink && <button type="button" onClick={() => saveOwn("")} style={{ marginRight: "auto", border: "none", background: "transparent", color: T.muted, fontSize: 14, fontWeight: 600, fontFamily: "inherit", padding: "9px 4px", cursor: "pointer" }}>{t("Remove")}</button>}
                  <button type="button" onClick={() => setOwnEdit(null)} style={{ border: "none", background: "transparent", color: T.text, fontSize: 14, fontWeight: 600, fontFamily: "inherit", padding: "9px 12px", cursor: "pointer" }}>{t("Cancel")}</button>
                  <button type="submit" disabled={!toLink(ownEdit)} style={{ border: "none", borderRadius: 12, background: T.accent, color: T.playBtnFg, fontSize: 14, fontWeight: 700, fontFamily: "inherit", padding: "9px 16px", cursor: "pointer", opacity: toLink(ownEdit) ? 1 : 0.4 }}>{t("Save")}</button>
                </div>
              </form>
            </div>
          )}
          {card && (
            <div onClick={closeCard} style={{ position: "fixed", inset: 0, zIndex: 380, display: "flex", alignItems: "center", justifyContent: "center", background: card.fly ? "rgba(0,0,0,0)" : "rgba(0,0,0,0.55)", transition: `background ${FLY_MS}ms ease, opacity 0.16s ease`, opacity: cardOut ? 0 : 1, animation: "mptree-fade-in 0.22s ease backwards", color: T.text }}>
              <style>{KEYFRAMES}</style>
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
                    {(!cardPreview?.playing || cardPreview.loading) && (
                      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(0,0,0,0.6)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {cardPreview?.playing ? <Spinner size={30} /> : <IC.Play />}
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{ padding: "14px 14px 4px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{card.track.title}</div>
                      <div style={{ fontSize: 12.5, opacity: 0.65, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {[card.track.artist, card.track.genre, licenceChip(card.track.license), card.track.source === "archive" ? "Internet Archive" : "Audius"].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    {dlButton(card.track, 46, true)}
                  </div>
                  <div style={{ padding: "4px 16px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                    <button onClick={() => togglePreview(card.track)} aria-label={cardPreview?.playing ? t("Pause") : t("Play")} style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: "transparent", color: T.playBtnFg, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, flexShrink: 0 }}>
                      {cardPreview?.playing && cardPreview.loading ? <Spinner size={18} /> : cardPreview?.playing ? <IC.Pause /> : <IC.Play />}
                    </button>
                    <span style={{ fontSize: 11.5, fontVariantNumeric: "tabular-nums", opacity: 0.7, width: 34, textAlign: "right", flexShrink: 0 }}>{fmt(cardPreview?.pos ?? 0)}</span>
                    <Seek pos={cardPreview?.pos ?? 0} dur={card.track.duration} color={T.playBtnFg} onSeek={sec => seek(card.track, sec)} />
                    <span style={{ fontSize: 11.5, fontVariantNumeric: "tabular-nums", opacity: 0.7, width: 34, flexShrink: 0 }}>{fmt(card.track.duration)}</span>
                  </div>
                  {/* The credit the licence asks for: who made it, under which
                      licence, and a link to the song where it lives. */}
                  <div style={{ margin: "0 16px", height: 1, background: "currentColor", opacity: 0.14 }} />
                  <div style={{ padding: "8px 8px 10px 16px", display: "flex", alignItems: "center", gap: 8, fontSize: 11.5 }}>
                    <span style={{ flex: 1, minWidth: 0, opacity: 0.65, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{credit(card.track)}</span>
                    <button onClick={() => openSite(card.track.permalink)} style={{ border: "none", background: "transparent", color: T.playBtnFg, fontFamily: "inherit", fontSize: 12, fontWeight: 700, padding: "6px 8px", display: "flex", alignItems: "center", gap: 4, cursor: "pointer", flexShrink: 0 }}>
                      {card.track.source === "archive" ? "Internet Archive" : "Audius"}{ARROW}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          {flyers.map(f => (
            <div key={f.key} aria-hidden="true" style={{
              position: "fixed", left: f.x, top: f.y, width: f.w, height: f.h, zIndex: 390, pointerEvents: "none",
              borderRadius: 12, overflow: "hidden", background: T.card, boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
              transform: f.go ? `translate(${f.dx}px, ${f.dy}px) scale(${Math.min(0.5, 24 / Math.max(1, f.w))})` : "none",
              opacity: f.go ? 0.3 : 1,
              transition: `transform ${FLY_MS}ms cubic-bezier(0.55, 0, 0.75, 0.2), opacity ${FLY_MS}ms ease-in`,
            }}>
              {f.art && <img src={f.art} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
            </div>
          ))}
        </>,
        document.body,
      )}
    </div>
  );
}

/** Drawn again only when a prop really changed. App builds its theme object
 *  afresh on each render, so that one is compared by value. */
export const DiscoverView = React.memo(DiscoverViewInner, (a, b) => {
  for (const k of Object.keys(b) as (keyof typeof b)[]) {
    if (k === "T") {
      const x = a.T as unknown as Record<string, unknown>, y = b.T as unknown as Record<string, unknown>;
      const ks = Object.keys(y);
      if (ks.length !== Object.keys(x).length || ks.some(key => x[key] !== y[key])) return false;
    } else if (a[k] !== b[k]) return false;
  }
  return true;
});

const OWN_KEY = "mptree_own_source";
/** "example.com/music" → "https://example.com/music"; null for anything that
 *  is not a web address. */
function toLink(raw: string): string | null {
  const v = raw.trim();
  if (!v || /\s/.test(v)) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : "https://" + v);
    return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".") ? u.href : null;
  } catch { return null; }
}

const FLY_MS = 600;
export const WALL_MS = 900;

// Black and white sleeves, drawn rather than loaded so the wall is there at
// once, even offline.
const SLEEVES = [
  "#161616",
  "repeating-linear-gradient(45deg,#e8e8e8 0 5px,#1a1a1a 5px 10px)",
  "#f4f4f4",
  "radial-gradient(circle at 50% 50%,#fff 0 24%,#161616 25%)",
  "repeating-radial-gradient(circle,#111 0 4px,#bdbdbd 4px 6px)",
  "#2b2b2b",
  "linear-gradient(90deg,#111 50%,#d9d9d9 50%)",
  "radial-gradient(#fff 1.2px,transparent 1.6px) 0 0/8px 8px,#222",
  "#bdbdbd",
  "repeating-linear-gradient(0deg,#111 0 3px,#888 3px 10px)",
  "conic-gradient(from 135deg at 50% 60%,#fff 0 90deg,#5b5b5b 0)",
  "#0a0a0a",
  "linear-gradient(#111,#111) 20% 80%/45% 45% no-repeat,#e9e9e9",
];

// Torn at both ends: the bottom edge comes in first, the top one goes out last.
const TORN = "polygon(0 12px, 9% 34px, 18% 4px, 27% 30px, 36% 8px, 45% 32px, 54% 2px, 63% 28px, 72% 6px, 82% 34px, 91% 10px, 100% 26px, 100% calc(100% - 26px), 92% calc(100% - 4px), 83% calc(100% - 30px), 73% calc(100% - 6px), 64% calc(100% - 34px), 55% calc(100% - 10px), 46% calc(100% - 28px), 35% calc(100% - 2px), 26% calc(100% - 30px), 17% calc(100% - 8px), 8% calc(100% - 32px), 0 calc(100% - 12px))";

/** Flows from above the screen to below it in one go (or the other way up),
 *  covering it halfway. */
function Wall({ up }: { up: boolean }) {
  const cols = 6;
  const tiles = useMemo(() => {
    const size = window.innerWidth / cols;
    const rows = Math.ceil((window.innerHeight + 80) / size) + 1;
    return Array.from({ length: rows * cols }, (_, i) => SLEEVES[(i * 7 + (i >> 3)) % SLEEVES.length]);
  }, []);
  return (
    <div aria-hidden="true" style={{
      position: "absolute", left: 0, right: 0, top: -40, height: "calc(100% + 80px)", zIndex: 30, pointerEvents: "none", overflow: "hidden",
      clipPath: TORN, background: "#000", willChange: "transform", visibility: "visible",
      animation: `mptree-wall-flow ${WALL_MS}ms cubic-bezier(0.45, 0, 0.55, 1) ${up ? "reverse" : "normal"} both`,
    }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {tiles.map((bg, i) => <div key={i} style={{ aspectRatio: "1", background: bg }} />)}
      </div>
    </div>
  );
}

/** "© Artist · Open Music License", "© Artist · CC BY 3.0", or no © when
 *  the song is in the public domain. */
function credit(track: FreeTrack): string {
  const chip = licenceChip(track.license);
  const free = chip === "CC0" || chip === "PD";
  const licence = track.source === "archive" ? track.license : chip === "OML" ? "Open Music License" : chip;
  return [track.artist ? (free ? track.artist : `© ${track.artist}`) : "", licence].filter(Boolean).join(" · ");
}

const ARROW = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17 17 7"/><polyline points="8 7 17 7 17 16"/></svg>;
// The sites' marks, drawn in one colour to fit the page: the Archive's
// building, Bandcamp's slanted block.
const ARCHIVE_MARK = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2.5 2.5 7.5h19z"/><rect x="3" y="8.6" width="18" height="2"/>
    <rect x="4.5" y="11.6" width="2" height="6.8"/><rect x="9" y="11.6" width="2" height="6.8"/><rect x="13" y="11.6" width="2" height="6.8"/><rect x="17.5" y="11.6" width="2" height="6.8"/>
    <rect x="2.5" y="19.4" width="19" height="2.1"/>
  </svg>
);
const BANDCAMP_MARK = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M1 18 7.6 6H23l-6.6 12z"/></svg>
);

const KEYFRAMES = `
@keyframes mptree-spin { to { transform: rotate(360deg) } }
@keyframes mptree-wall-flow { from { transform: translateY(-100%) } to { transform: translateY(100%) } }
.mp-press { transition: transform 0.12s ease, opacity 0.12s ease; -webkit-tap-highlight-color: transparent; }
.mp-press:active { transform: scale(0.97); opacity: 0.8; }
@keyframes mptree-fade-in { from { opacity: 0 } to { opacity: 1 } }
@keyframes mptree-card-in { from { transform: translateY(24px) scale(0.86); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes mptree-bar { 0%, 100% { transform: scaleY(0.35) } 50% { transform: scaleY(1) } }
@keyframes mptree-badge-in { from { transform: translate(50%, 6px) scale(0.4); opacity: 0 } to { transform: translate(50%, 0) scale(1); opacity: 1 } }
`;

/** The timeline on the card: drag or tap to go to a point in the song. */
function Seek({ pos, dur, color, onSeek }: { pos: number; dur: number; color: string; onSeek: (sec: number) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const at = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / Math.max(1, r.width)));
  };
  const frac = drag ?? (dur ? Math.min(1, pos / dur) : 0);
  return (
    <div
      ref={ref}
      role="slider"
      aria-label={t("Position")}
      aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(frac * dur)}
      onPointerDown={e => { e.stopPropagation(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); setDrag(at(e.clientX)); }}
      onPointerMove={e => { if (drag !== null) setDrag(at(e.clientX)); }}
      onPointerUp={e => { if (drag === null) return; const f = at(e.clientX); setDrag(null); if (dur) onSeek(f * dur); }}
      onPointerCancel={() => setDrag(null)}
      onClick={e => e.stopPropagation()}
      style={{ flex: 1, height: 28, display: "flex", alignItems: "center", cursor: "pointer", touchAction: "none", position: "relative" }}
    >
      <div style={{ position: "absolute", left: 0, right: 0, height: 4, borderRadius: 2, background: color, opacity: 0.25 }} />
      <div style={{ position: "absolute", left: 0, width: `${frac * 100}%`, height: 4, borderRadius: 2, background: color }} />
      <div style={{ position: "absolute", left: `calc(${frac * 100}% - ${drag !== null ? 8 : 6}px)`, width: drag !== null ? 16 : 12, height: drag !== null ? 16 : 12, borderRadius: "50%", background: color, transition: "width 0.1s, height 0.1s" }} />
    </div>
  );
}

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

/** The download arrow, for the Discover tab in the app's header. */
export const DiscoverIcon = downloadGlyph;
