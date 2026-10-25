import { useState, useRef, memo } from "react";
import type { T } from "../themes";
import { t, tn } from "../i18n";
import type { Song, PlayMode } from "../types";
import { AlbumArt } from "./AlbumArt";
import { SpinningDisc } from "./SpinningDisc";
import { IC } from "./Icons";

/**
 * The blurred album-art wash behind the player.
 *
 * Two things make this affordable. It is memoised, because it depends on the
 * photo alone and the position ticker re-renders the sheet twice a second: it
 * used to be rebuilt on every one of those, and a 46px blur over a full-bleed
 * image is among the most expensive things a mobile GPU can be asked for.
 *
 * And the blur is done at quarter scale. Blur cost grows with area times radius,
 * so blurring a quarter-size image by a quarter of the radius and scaling the
 * result up costs roughly a sixteenth as much and looks the same: the output is
 * a smooth wash either way, and there is no detail left to lose.
 */
const Backdrop = memo(function Backdrop({ photo, sheetBg }: { photo?: string; sheetBg: string }) {
  if (!photo) return null;
  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 0, overflow: "hidden",
      pointerEvents: "none",
      // Its own layer, and nothing inside can affect anything outside it.
      contain: "paint", willChange: "transform",
    }}>
      <img
        src={photo}
        alt=""
        style={{
          position: "absolute", top: "-15%", left: "-15%",
          width: "32.5%", height: "32.5%",
          transform: "scale(4)", transformOrigin: "top left",
          objectFit: "cover", filter: "blur(11.5px) saturate(1.4)",
          opacity: 0.42,
        }}
      />
      {/* Gradient scrim so text stays readable over the blur. */}
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${sheetBg}66 0%, ${sheetBg}cc 55%, ${sheetBg} 100%)` }} />
    </div>
  );
});

/** How far down "Next up" goes. A whole library can be the queue; past a few
 *  hundred songs nobody is reading the list any more. */
const MAX_UP_NEXT = 500;
/** Rows are added as you scroll rather than all at once: 500 rows, each with
 *  its own cover lookup, would make opening the player stutter. */
const FIRST_ROWS = 40;
const MORE_ROWS = 60;

// ─── PLAYER EXPAND SHEET ─────────────────────────────────────────────────────

type PlayerExpandSheetProps = {
  song: Song;
  dispName: string;
  dispArtist: string;
  customPhoto?: string;
  /** Album art (custom or embedded) used for the blurred backdrop. May equal
   *  customPhoto; separate so the caller controls when a backdrop is shown. */
  backdropPhoto?: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playMode: PlayMode;
  /** Repeat the song that is on; separate from shuffle. */
  repeatOn: boolean;
  isLiked: boolean;
  /** Current playback speed multiplier (1 = normal). */
  playbackSpeed: number;
  onPlaybackSpeedChange: (speed: number) => void;
  // Up Next
  upNextQueue?: Song[];
  playNextQueue?: string[];
  /** What the queue was drawn from ("All songs", a playlist's name), shown
   *  next to "Next up". Left out when there is nothing sensible to call it. */
  sourceLabel?: string;
  getDispName?: (s: Song) => string;
  getDispArtist?: (s: Song) => string;
  getCustomPhoto?: (s: Song) => string | undefined;
  onTogglePlay: () => void;
  onSkip: (dir: -1 | 1) => void;
  /** Shuffle and repeat each have a button, and each is on or off by itself. */
  onToggleShuffle: () => void;
  onToggleRepeat: () => void;
  onSeek: (ms: number) => void;
  onSeekStart: () => void;
  onSeekEnd: (ms: number) => void;
  onToggleLike: () => void;
  onRemove: () => void;
  onShare: () => void;
  /** A song in "Next up" moved by its handle: positions counted from the
   *  first song after the one that is on. */
  onQueueMove: (from: number, to: number) => void;
  /** A tap on a song in "Next up": it plays now, and the queue stays. */
  onPlayFromQueue: (song: Song) => void;
  /** The "⋮" on a row in "Next up". */
  onOpenSongMenu: (song: Song) => void;
  /** Lyrics saved for this song, if any. Their absence is what makes the Lyrics
   *  button offer to add some instead of showing an empty panel. */
  lyrics?: string;
  /** Opens the sheet where lyrics are pasted or searched for. */
  onAddLyrics: () => void;
  /** Opens the same "⋮" action sheet the list rows use, for this track. The
   *  bar below covers the common actions; the menu adds Play next and Add to
   *  playlist, which have nowhere else to live once you are in the player. */
  onOpenMenu: () => void;
  /** A tap on the record of a song without a cover. */
  onNoCover?: () => void;
  onClose: () => void;
  /** 0..1 while the mini-player drag is pulling the sheet up (null = normal). */
  dragProgress?: number | null;
  /** True while a released under-threshold drag is settling back down. */
  dragSettling?: boolean;
  /** Skip the enter keyframe (the drag already brought the sheet into place). */
  skipEnter?: boolean;
  T: T;
};

export function PlayerExpandSheet({
  song, dispName, dispArtist, customPhoto, backdropPhoto,
  isPlaying, currentTime, duration, playMode, repeatOn, isLiked,
  playbackSpeed, onPlaybackSpeedChange,
  upNextQueue, playNextQueue = [], sourceLabel, getDispName, getDispArtist, getCustomPhoto,
  onTogglePlay, onSkip, onToggleShuffle, onToggleRepeat,
  onSeek, onSeekStart, onSeekEnd,
  onToggleLike, onRemove, onShare,
  onQueueMove, onPlayFromQueue, onOpenSongMenu,
  lyrics, onAddLyrics, onOpenMenu, onClose, onNoCover,
  dragProgress = null, dragSettling = false, skipEnter = false,
  T,
}: PlayerExpandSheetProps) {
  // The record gives way to the words, and back. Tied to the song, so moving to
  // the next track always lands you on the record rather than the last song’s
  // lyrics.
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyricsFor, setLyricsFor] = useState(song.id);
  const lyricsOpen = showLyrics && lyricsFor === song.id;
  const hasLyrics = !!lyrics && lyrics.trim().length > 0;

  const toggleLyrics = () => {
    // Nothing to show is not a state worth entering. Offer to add some instead.
    if (!hasLyrics) { onAddLyrics(); return; }
    setLyricsFor(song.id);
    setShowLyrics(!lyricsOpen);
  };

  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  };

  // ── Playback speed ────────────────────────────────────────────────────────
  const SPEED_STOPS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  const cycleSpeed = () => {
    // Advance to the next stop, wrapping back to 1× after the top.
    let idx = SPEED_STOPS.findIndex(s => Math.abs(s - playbackSpeed) < 0.01);
    if (idx === -1) idx = SPEED_STOPS.indexOf(1);
    const next = SPEED_STOPS[(idx + 1) % SPEED_STOPS.length];
    onPlaybackSpeedChange(next);
  };
  const speedLabel = `${playbackSpeed}×`;

  /** The shuffle or the repeat button: coloured, with a dot under it, while on. */
  const modeButton = (mode: "shuffle" | "repeat") => {
    const on = mode === "shuffle" ? playMode === "shuffle" : repeatOn;
    const tint = mode === "shuffle" ? T.violet : T.repeat;
    return (
      <button
        onClick={mode === "shuffle" ? onToggleShuffle : onToggleRepeat}
        aria-pressed={on}
        aria-label={mode === "shuffle" ? t("Shuffle") : t("Repeat")}
        style={{ background: "transparent", border: "none", color: on ? tint : T.muted, cursor: "pointer", padding: 6, display: "flex", position: "relative" }}
      >
        {mode === "shuffle" ? <IC.Shuffle /> : <IC.Repeat />}
        {on && <span style={{ position: "absolute", bottom: 1, left: "50%", transform: "translateX(-50%)", width: 4, height: 4, borderRadius: "50%", background: tint }} />}
      </button>
    );
  };

  // ── Next up ───────────────────────────────────────────────────────────────
  // Everything after the song that is on, in the order it will play. It used
  // to show the pinned songs and one more; now it is the queue itself, so the
  // list is what you will hear.
  const queue = upNextQueue ?? [];
  const curIdx = queue.findIndex(s => s.id === song.id);
  const upcoming = curIdx >= 0 ? queue.slice(curIdx + 1) : [];
  const listed = upcoming.slice(0, MAX_UP_NEXT - 1);
  const pinned = new Set(playNextQueue);
  const [rowsShown, setRowsShown] = useState(FIRST_ROWS);
  const scrollRef = useRef<HTMLDivElement>(null);
  const onBodyScroll = () => {
    const el = scrollRef.current;
    if (!el || rowsShown >= listed.length) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 900) setRowsShown(n => n + MORE_ROWS);
  };

  const getName   = (s: Song) => getDispName   ? getDispName(s)   : s.title;
  const getArtist = (s: Song) => getDispArtist ? getDispArtist(s) : s.artist;
  const getPhoto  = (s: Song) => getCustomPhoto ? getCustomPhoto(s) : undefined;

  // ── Moving a song by its handle ───────────────────────────────────────────
  // The handle alone starts a drag, so a row can still be scrolled past and
  // tapped. While a drag is on, the list does not scroll under the finger.
  const [dragIdx,     setDragIdx]     = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const onHandleTouchStart = (i: number) => (e: React.TouchEvent) => {
    e.stopPropagation();
    setDragIdx(i);
    setDragOverIdx(i);
  };
  const onListTouchMove = (e: React.TouchEvent) => {
    if (dragIdx === null) return;
    e.stopPropagation();
    const y = e.touches[0].clientY;
    for (let j = 0; j < itemRefs.current.length; j++) {
      const el = itemRefs.current[j];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (y >= r.top && y <= r.bottom) { setDragOverIdx(j); break; }
    }
  };
  const onListTouchEnd = () => {
    if (dragIdx !== null && dragOverIdx !== null && dragIdx !== dragOverIdx) onQueueMove(dragIdx, dragOverIdx);
    setDragIdx(null);
    setDragOverIdx(null);
  };

  // ── Close with a slide-down animation ─────────────────────────────────────
  // `closing` swaps the CSS classes to the exit animations; the real onClose
  // (which unmounts us) fires when the slide finishes. Guarded so double-taps
  // during the animation don't call onClose twice.
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const animatedClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setTimeout(onClose, 240); // matches .pes-sheet-out duration
  };

  // ── Gesture-driven drag-down-to-close ─────────────────────────────────────
  // Mirrors the drag-up open: grabbing the top bar drags the player down
  // live; releasing past ~22% of the screen closes it, and anything less snaps
  // back. `closeSnap` turns the transition on for the settle, off while the
  // finger is down.
  const [closeDragY, setCloseDragY] = useState(0);
  const [closeSnap, setCloseSnap]   = useState(false);
  const closeDragStartRef = useRef<number | null>(null);
  const startCloseDrag = (y: number) => { if (!closingRef.current) { closeDragStartRef.current = y; setCloseSnap(false); } };
  const moveCloseDrag  = (y: number) => {
    if (closeDragStartRef.current === null) return;
    const dy = y - closeDragStartRef.current;
    setCloseDragY(dy > 0 ? dy : 0);
  };
  const endCloseDrag = () => {
    if (closeDragStartRef.current === null) return;
    closeDragStartRef.current = null;
    const vh = window.innerHeight || 800;
    if (closeDragY > vh * 0.22) {
      if (closingRef.current) return;
      closingRef.current = true;
      setCloseSnap(true);
      setCloseDragY(vh);           // glide the rest of the way down
      setTimeout(onClose, 260);
    } else {
      setCloseSnap(true);
      setCloseDragY(0);            // snap back up
      setTimeout(() => setCloseSnap(false), 280);
    }
  };

  const isDraggingOpen  = dragProgress !== null && !dragSettling;
  const isDraggingClose = closeDragStartRef.current !== null;
  // Live transform: opening drag positions by progress; closing drag by pixels.
  const sheetTransform =
    dragProgress !== null ? `translateY(${Math.round((1 - dragProgress) * 100)}%)` :
    (closeDragY > 0 || closeSnap) ? `translateY(${Math.round(closeDragY)}px)` : undefined;
  const overlayOpacity =
    dragProgress !== null ? dragProgress :
    closeDragY > 0 ? Math.max(0, 1 - closeDragY / ((window.innerHeight || 800) * 0.7)) : undefined;

  const discSize = Math.min(300, (typeof window !== "undefined" ? window.innerWidth : 375) - 80);

  /** One part of the bar under the transport. The bar is drawn like a
   *  segmented control: a rounded track, the parts inside it rounded on their
   *  outer side only. */
  const barPart = (key: string, label: string, on: boolean, onClick: () => void, body: React.ReactNode, at: "first" | "mid" | "last") => (
    <button
      key={key}
      onClick={onClick}
      aria-label={label}
      aria-pressed={on || undefined}
      style={{
        flex: 1, minWidth: 0, height: 50,
        borderRadius: at === "first" ? "25px 12px 12px 25px" : at === "last" ? "12px 25px 25px 12px" : 12,
        background: on ? T.accent : T.dim,
        color: on ? T.playBtnFg : T.text,
        border: "none", cursor: "pointer", fontFamily: "inherit",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "background 0.15s, color 0.15s",
      }}
    >
      {body}
    </button>
  );

  /** A row in "Next up". Square edged: only the song that is on is drawn as a
   *  rounded tile, so it stands out from the flat list under it. */
  const queueRow = (s: Song, i: number) => {
    const name = getName(s);
    const isDragging = dragIdx === i;
    const isOver = dragIdx !== null && dragOverIdx === i && dragIdx !== i;
    return (
      <div
        key={s.id}
        ref={el => { itemRefs.current[i] = el; }}
        onClick={() => { if (dragIdx === null) onPlayFromQueue(s); }}
        style={{
          display: "flex", alignItems: "center", gap: 12,
          height: 64, padding: "0 8px 0 4px", cursor: "pointer",
          opacity: isDragging ? 0.4 : 1,
          boxShadow: isOver ? `inset 0 ${dragIdx! < i ? -2 : 2}px 0 ${T.accent}` : "none",
          transition: "opacity 0.12s",
        }}
      >
        <div
          onTouchStart={onHandleTouchStart(i)}
          onClick={e => e.stopPropagation()}
          aria-label={t("Drag to move")}
          style={{ color: T.muted, display: "flex", flexShrink: 0, padding: "12px 8px 12px 12px", touchAction: "none", cursor: "grab" }}
        >
          <svg width="14" height="18" viewBox="0 0 14 18" fill="currentColor" aria-hidden="true">
            <circle cx="3.5" cy="3" r="1.7"/><circle cx="10.5" cy="3" r="1.7"/>
            <circle cx="3.5" cy="9" r="1.7"/><circle cx="10.5" cy="9" r="1.7"/>
            <circle cx="3.5" cy="15" r="1.7"/><circle cx="10.5" cy="15" r="1.7"/>
          </svg>
        </div>
        <AlbumArt title={name} size={44} customPhoto={getPhoto(s)} songPath={s.uri} albumId={s.albumId} T={T} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {name}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
            {pinned.has(s.id) && (
              <span style={{ fontSize: 9, fontWeight: 700, color: T.textSub, background: T.dim, borderRadius: 4, padding: "1px 5px", letterSpacing: "0.04em", flexShrink: 0 }}>
                {t("NEXT")}
              </span>
            )}
            <span style={{ fontSize: 13, color: T.textSub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {getArtist(s) || t("Unknown Artist")}
            </span>
          </div>
        </div>
        <button
          onClick={e => { e.stopPropagation(); onOpenSongMenu(s); }}
          aria-label={t("More options for {name}", { name })}
          style={{ background: "transparent", border: "none", color: T.muted, cursor: "pointer", padding: 8, display: "flex", flexShrink: 0 }}
        >
          <IC.Dots />
        </button>
      </div>
    );
  };

  return (
    <div
      className={closing ? "pes-overlay-out" : dragProgress !== null || skipEnter ? undefined : "pes-overlay-in"}
      style={{ position: "fixed", inset: 0, background: T.overlayBg, zIndex: 400, opacity: overlayOpacity, transition: isDraggingOpen || isDraggingClose ? "none" : "opacity 0.25s ease" }}
    >
      <style>{`
        @keyframes pesSlideUp   { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes pesSlideDown { from { transform: translateY(0); } to { transform: translateY(100%); } }
        @keyframes pesFadeIn    { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pesFadeOut   { from { opacity: 1; } to { opacity: 0; } }
        /* Enter animations use fill-mode "backwards", NOT "both". With "both"
           the finished animation keeps asserting transform/opacity forever,
           which outranks the inline styles the drag-to-close writes — so a
           sheet opened by TAP could not be dragged back down. "backwards"
           hands control back once the animation ends. The exit animations do
           need "both" to hold their final state until unmount. */
        .pes-overlay-in  { animation: pesFadeIn 0.22s ease backwards; }
        .pes-overlay-out { animation: pesFadeOut 0.24s ease both; }
        .pes-sheet-in    { animation: pesSlideUp 0.28s cubic-bezier(0.22, 1, 0.36, 1) backwards; }
        .pes-sheet-out   { animation: pesSlideDown 0.24s ease-in both; }
        @media (prefers-reduced-motion: reduce) {
          .pes-overlay-in, .pes-overlay-out, .pes-sheet-in, .pes-sheet-out { animation: none; }
        }
      `}</style>
      {/* The whole screen. It used to be a sheet that stopped short of the
          top; the player is the one place nothing else needs to show. */}
      <div
        className={closing ? "pes-sheet-out" : dragProgress !== null || skipEnter ? undefined : "pes-sheet-in"}
        style={{
          position: "absolute", inset: 0,
          background: T.sheetBg,
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          transform: sheetTransform,
          transition: isDraggingOpen || isDraggingClose ? "none" : "transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <Backdrop photo={backdropPhoto} sheetBg={T.sheetBg} />

        {/* Top bar = the drag-down-to-close grab area. It stays put while the
            queue scrolls under it, so closing never needs a scroll back up. */}
        <div
          onTouchStart={e => startCloseDrag(e.touches[0].clientY)}
          onTouchMove={e => moveCloseDrag(e.touches[0].clientY)}
          onTouchEnd={endCloseDrag}
          onTouchCancel={endCloseDrag}
          style={{
            position: "relative", zIndex: 1, flexShrink: 0,
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "calc(env(safe-area-inset-top, 0px) + 10px) 16px 6px",
            touchAction: "none",
          }}
        >
          <button onClick={animatedClose}
            aria-label={t("Close player")}
            style={{ width: 44, height: 44, borderRadius: 22, background: T.dim, border: "none", color: T.text, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <IC.ChevronDown />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Swaps the record for the words. With no lyrics stored it opens
                the sheet to add some, rather than showing an empty panel. */}
            <button
              onClick={toggleLyrics}
              aria-label={t("Lyrics")}
              aria-pressed={lyricsOpen}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, height: 44,
                background: lyricsOpen ? T.accent : T.dim,
                border: "none", borderRadius: 22, padding: "0 16px",
                color: lyricsOpen ? T.playBtnFg : T.text,
                fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
              }}
            >
              <IC.Lyrics />
              <span>{t("Lyrics")}</span>
            </button>
            <button
              onClick={onOpenMenu}
              aria-label={t("More options for {name}", { name: dispName })}
              style={{ width: 44, height: 44, borderRadius: 22, background: T.dim, border: "none", color: T.text, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <IC.Dots />
            </button>
          </div>
        </div>

        <div
          ref={scrollRef}
          onScroll={onBodyScroll}
          style={{
            position: "relative", zIndex: 1, flex: 1, minHeight: 0,
            overflowY: dragIdx !== null ? "hidden" : "auto", WebkitOverflowScrolling: "touch",
          }}
        >
          {/* ── The song that is on ── */}
          <div style={{ padding: "8px 24px 0", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ margin: "12px 0 22px" }}>
              {lyricsOpen ? (
                <LyricsPanel text={lyrics ?? ""} size={discSize} onEdit={onAddLyrics} T={T} />
              ) : (
                <SpinningDisc
                  size={discSize}
                  spinning={isPlaying}
                  title={dispName}
                  customPhoto={customPhoto}
                  tappable
                  onNoCover={onNoCover}
                />
              )}
            </div>
            <div style={{ width: "100%", textAlign: "center", minWidth: 0 }}>
              <div style={{ fontSize: 21, fontWeight: 700, color: T.text, wordBreak: "break-word", lineHeight: 1.3 }}>
                {dispName}
              </div>
              {song.isCut && (
                <span style={{
                  fontSize: 10, background: T.dim, color: T.textSub,
                  borderRadius: 4, padding: "1px 5px", fontWeight: "700", display: "inline-block", marginTop: 6,
                }}>CUT</span>
              )}
              <div style={{ fontSize: 15, color: T.textSub, marginTop: 6, wordBreak: "break-word" }}>
                {dispArtist || t("Unknown Artist")}
              </div>
            </div>

            {/* Timeline */}
            <div style={{ display: "flex", alignItems: "center", width: "100%", marginTop: 22 }}>
              <span style={{ fontSize: 11, color: T.muted, width: 34 }}>{fmt(currentTime)}</span>
              <input
                className="slider" type="range" min={0} max={duration || 100} value={currentTime}
                onMouseDown={onSeekStart} onTouchStart={onSeekStart}
                onChange={e => onSeek(Number(e.target.value))}
                onMouseUp={e => onSeekEnd(Number((e.target as HTMLInputElement).value))}
                onTouchEnd={e => onSeekEnd(Number((e.target as HTMLInputElement).value))}
              />
              <span style={{ fontSize: 11, color: T.muted, width: 34, textAlign: "right" }}>{fmt(duration)}</span>
            </div>

            {/* Transport */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20, marginTop: 14 }}>
              {/* Shuffle and repeat used to be one button that went round
                  off, shuffle, repeat: reaching repeat meant shuffling first.
                  Each has its own now, at either end, with a dot when on. */}
              {modeButton("shuffle")}
              <button onClick={() => onSkip(-1)} aria-label={t("Previous")} style={{ background: "transparent", border: "none", color: T.text, cursor: "pointer", padding: 6, display: "flex" }}><IC.SkipB /></button>
              <button
                onClick={onTogglePlay}
                aria-label={isPlaying ? t("Pause") : t("Play")}
                style={{ background: T.playBtnBg, border: "none", color: T.playBtnFg, width: 64, height: 64, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
              >
                {isPlaying ? <IC.Pause /> : <IC.Play />}
              </button>
              <button onClick={() => onSkip(1)} aria-label={t("Next")} style={{ background: "transparent", border: "none", color: T.text, cursor: "pointer", padding: 6, display: "flex" }}><IC.SkipF /></button>
              {modeButton("repeat")}
            </div>

            {/* ── Speed, like, share, remove ──────────────────────────────
                One bar instead of four chips. Edit and Cut live behind the
                "⋮" at the top: they take you out of the player entirely. */}
            <div style={{
              display: "flex", gap: 4, width: "100%", marginTop: 24, padding: 5,
              borderRadius: 30, background: T.card, border: `1px solid ${T.border}`, boxSizing: "border-box",
            }}>
              {barPart("speed", t("Playback speed"), playbackSpeed !== 1, cycleSpeed,
                <span style={{ fontSize: 15, fontWeight: 700 }}>{speedLabel}</span>, "first")}
              {barPart("like", isLiked ? t("Unlike") : t("Like"), isLiked, onToggleLike,
                <IC.Heart filled={isLiked} size={20} />, "mid")}
              {barPart("share", t("Share"), false, onShare, <IC.Share />, "mid")}
              {barPart("remove", t("Remove"), false, onRemove, <IC.Trash />, "last")}
            </div>
          </div>

          {/* ── Next up ─────────────────────────────────────────────────── */}
          <div style={{ marginTop: 34, paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, padding: "0 20px 14px" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: T.text, lineHeight: 1.15 }}>{t("Next up")}</div>
                <div style={{ fontSize: 14, color: T.textSub, marginTop: 4 }}>
                  {upcoming.length === 0 ? t("Nothing lined up after this song.") : tn(upcoming.length, "{n} song lined up.", "{n} songs lined up.")}
                </div>
              </div>
              {sourceLabel && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 7, minWidth: 0, maxWidth: "52%",
                  padding: "9px 14px", borderRadius: 20, background: T.dim, color: T.text,
                  fontSize: 13, fontWeight: 600, flexShrink: 1,
                }}>
                  {playMode === "shuffle" ? <span style={{ display: "flex", color: T.violet, flexShrink: 0 }}><IC.Shuffle /></span> : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }} aria-hidden="true">
                      <line x1="3" y1="6" x2="15" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="11" y2="18"/><path d="M19 15V5l3 1"/><circle cx="17" cy="16" r="2"/>
                    </svg>
                  )}
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sourceLabel}</span>
                </div>
              )}
            </div>

            {/* The song that is on, at the head of the list: the one rounded
                tile, with its bars moving while it plays. */}
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              margin: "0 12px 6px", padding: "10px 14px", borderRadius: 18,
              background: T.card, border: `1px solid ${T.border}`,
            }}>
              <AlbumArt title={dispName} size={44} active playing={isPlaying} customPhoto={getPhoto(song)} songPath={song.uri} albumId={song.albumId} T={T} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.accent, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{dispName}</div>
                <div style={{ fontSize: 13, color: T.textSub, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{dispArtist || t("Unknown Artist")}</div>
              </div>
            </div>

            <div
              onTouchMove={dragIdx !== null ? onListTouchMove : undefined}
              onTouchEnd={dragIdx !== null ? onListTouchEnd : undefined}
              onTouchCancel={dragIdx !== null ? onListTouchEnd : undefined}
              style={{ padding: "0 4px" }}
            >
              {listed.slice(0, rowsShown).map(queueRow)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
/**
 * The saved lyrics, in the record's place. Plain scrolling text: MPTree stores
 * whatever you pasted, so there are no timings to follow and pretending
 * otherwise would just be a panel that never moves.
 */
function LyricsPanel({ text, size, onEdit, T }: {
  text: string; size: number; onEdit: () => void; T: T;
}) {
  return (
    <div style={{
      width: size, height: size, flexShrink: 0,
      borderRadius: 16, background: T.dim,
      display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px 6px", flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: T.muted }}>
          {t("Lyrics")}
        </span>
        <button
          onClick={onEdit}
          style={{ background: "transparent", border: "none", color: T.muted, fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", padding: 2 }}
        >
          {t("Edit")}
        </button>
      </div>
      <div style={{
        flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch",
        padding: "0 16px 14px",
        fontSize: 15, lineHeight: 1.75, color: T.text, whiteSpace: "pre-wrap",
      }}>
        {text.trim()}
      </div>
    </div>
  );
}
