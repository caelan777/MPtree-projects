import { useState, useRef, useEffect, useMemo, memo, forwardRef } from "react";
import type { T } from "../themes";
import type { Song, PlayMode } from "../types";
import { AlbumArt } from "./AlbumArt";
import { SpinningDisc } from "./SpinningDisc";
import { IC } from "./Icons";
import { MusicScanner } from "../plugins";
import { parseLrc, stripTimestamps, activeLineIndex, hasLyrics } from "../lyrics";
import { fetchExact } from "../lyricsFetch";

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
  isLiked: boolean;
  /** Current playback speed multiplier (1 = normal). */
  playbackSpeed: number;
  onPlaybackSpeedChange: (speed: number) => void;
  // Up Next
  upNextQueue?: Song[];
  playNextQueue?: string[];
  getDispName?: (s: Song) => string;
  getDispArtist?: (s: Song) => string;
  getCustomPhoto?: (s: Song) => string | undefined;
  onTogglePlay: () => void;
  onSkip: (dir: -1 | 1) => void;
  /** Cycles the play mode: off → shuffle → repeat → off. */
  onCycleMode: () => void;
  onSeek: (ms: number) => void;
  onSeekStart: () => void;
  onSeekEnd: (ms: number) => void;
  onToggleLike: () => void;
  onRemove: () => void;
  onShare: () => void;
  /** Reorder the real playback queue. Must reach native: the service advances
   *  through the queue it was last handed. */
  onQueueReorder: (newQueue: Song[]) => void;
  /** Drop one track out of the queue. Never the one playing. */
  onQueueRemove: (songId: string) => void;
  /** Jump straight to a track in the queue. */
  onPlayFromQueue: (s: Song) => void;
  /** Lyrics the user pasted or looked up for this song, if any. */
  savedLyrics?: string;
  /** Whether an automatic online lookup is allowed. Off unless switched on. */
  lyricsAutoFetch?: boolean;
  /** Hands back what an automatic lookup found, so it is stored once. */
  onLyricsFetched?: (lyrics: string) => void;
  /** Opens the same "⋮" action sheet the list rows use, for this track. The
   *  chips below cover the common actions; the menu adds Play next and Add to
   *  playlist, which have nowhere else to live once you are in the player. */
  onOpenMenu: () => void;
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
  isPlaying, currentTime, duration, playMode, isLiked,
  playbackSpeed, onPlaybackSpeedChange,
  upNextQueue, playNextQueue = [], getDispName, getDispArtist, getCustomPhoto,
  onTogglePlay, onSkip, onCycleMode,
  onSeek, onSeekStart, onSeekEnd,
  onToggleLike, onRemove, onShare,
  onQueueReorder, onQueueRemove, onPlayFromQueue,
  savedLyrics, lyricsAutoFetch = false, onLyricsFetched,
  onOpenMenu, onClose,
  dragProgress = null, dragSettling = false, skipEnter = false,
  T,
}: PlayerExpandSheetProps) {
  // Which face of the sheet is showing. Laid over the player rather than
  // swapping the body out, so the transport keeps its state and the artwork does
  // not remount every time you glance at the queue.
  //
  // The pane belongs to the song it was opened on. Rather than reset it from an
  // effect when the track changes, it is derived: a queue or a lyric sheet for
  // the song that just finished is worse than useless, and deriving means there
  // is never a frame showing the wrong one.
  const [pane, setPane] = useState<"player" | "queue" | "lyrics">("player");
  const [paneSong, setPaneSong] = useState(song.id);
  const activePane = paneSong === song.id ? pane : "player";
  const showPane = (next: "player" | "queue" | "lyrics") => {
    setPaneSong(song.id);
    setPane(next);
  };

  const [lyrics, setLyrics] = useState<{ songId: string; text: string; source?: string } | null>(null);
  const lyricsReady = lyrics !== null && lyrics.songId === song.id;

  // Where the words come from, in order: what the user saved for this song, a
  // .lrc or .txt sitting beside the audio, and only then, and only if switched
  // on, an online lookup.
  useEffect(() => {
    if (activePane !== "lyrics" || lyricsReady) return;
    let cancelled = false;
    const id = song.id;

    (async () => {
      // What the user saved wins outright, and costs nothing to check.
      if (savedLyrics) {
        if (!cancelled) setLyrics({ songId: id, text: savedLyrics, source: "saved" });
        return;
      }

      let found = "";
      let source: string | undefined;
      try {
        const r = await MusicScanner.getLyrics({ path: song.uri });
        found = r.lyrics || "";
        source = r.source;
      } catch { /* no sidecar */ }

      if (!found && lyricsAutoFetch) {
        try {
          const hit = await fetchExact({
            title: dispName,
            artist: dispArtist,
            album: song.album || undefined,
            durationMs: duration || song.duration,
          });
          if (hit?.text) {
            found = hit.text;
            source = "lrclib.net";
            onLyricsFetched?.(hit.text);
          }
        } catch { /* offline, or nothing there */ }
      }

      if (!cancelled) setLyrics({ songId: id, text: found, source });
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePane, lyricsReady, song.id, song.uri, savedLyrics, lyricsAutoFetch]);

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



  const getName   = (s: Song) => getDispName   ? getDispName(s)   : s.title;
  const getArtist = (s: Song) => getDispArtist ? getDispArtist(s) : s.artist;
  const getPhoto  = (s: Song) => getCustomPhoto ? getCustomPhoto(s) : undefined;

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
  // Mirrors the drag-up open: grabbing the top zone (handle + header) drags
  // the sheet down live; releasing past ~22% of the screen closes it, and
  // anything less snaps back. `closeSnap` turns the transition on for the
  // settle, off while the finger is down.
  const [closeDragY, setCloseDragY] = useState(0);
  // The sheet is its own scroll container. Dragging down closes it, but only
  // from the top: anywhere else that gesture is a scroll, and stealing it would
  // make the queue below unreachable.
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const atTopRef = useRef(true);
  const [closeSnap, setCloseSnap]   = useState(false);
  const closeDragStartRef = useRef<number | null>(null);
  const startCloseDrag = (y: number) => {
    if (closingRef.current) return;
    atTopRef.current = (sheetRef.current?.scrollTop ?? 0) <= 0;
    if (!atTopRef.current) return;
    closeDragStartRef.current = y;
    setCloseSnap(false);
  };
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

  return (
    <div
      className={closing ? "pes-overlay-out" : dragProgress !== null || skipEnter ? undefined : "pes-overlay-in"}
      style={{ position: "fixed", inset: 0, background: T.overlayBg, zIndex: 400, display: "flex", alignItems: "flex-end", opacity: overlayOpacity, transition: isDraggingOpen || isDraggingClose ? "none" : "opacity 0.25s ease" }}
      onClick={animatedClose}
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
      <div
        ref={sheetRef}
        className={closing ? "pes-sheet-out" : dragProgress !== null || skipEnter ? undefined : "pes-sheet-in"}
        onClick={e => e.stopPropagation()}
        // Drag-to-close works from anywhere on the sheet, not just the handle.
        // startCloseDrag only arms itself when the sheet is scrolled to the top,
        // so further down the same gesture scrolls the queue instead.
        onTouchStart={e => startCloseDrag(e.touches[0].clientY)}
        onTouchMove={e => moveCloseDrag(e.touches[0].clientY)}
        onTouchEnd={endCloseDrag}
        onTouchCancel={endCloseDrag}
        style={{
          background: T.sheetBg,
          borderRadius: "20px 20px 0 0",
          width: "100%",
          paddingBottom: 32,
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
          position: "relative",
          transform: sheetTransform,
          transition: isDraggingOpen || isDraggingClose ? "none" : "transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)",
          touchAction: closeDragY > 0 ? "none" : undefined,
        }}
      >
        {/* Blurred album-art backdrop, in its own memo component. A 46px blur
            over a full-bleed image is one of the most expensive things a mobile
            GPU can be asked for, and it used to be rebuilt twice a second along
            with the rest of the sheet as the position ticker fired. It depends
            on nothing but the photo, so it now re-renders only when that
            changes. Pointer-events off so it never intercepts taps. */}
        <Backdrop photo={backdropPhoto} sheetBg={T.sheetBg} />

        <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column" }}>
        {/* The handle and header row. The close gesture used to be bound here
            alone, which meant the sheet could only be dismissed by grabbing a
            4px bar. It lives on the sheet itself now. */}
        <div style={{ flexShrink: 0 }}>
        <div style={{ width: 36, height: 4, background: T.dim, borderRadius: 2, margin: "12px auto 0", flexShrink: 0 }} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 14px 0", flexShrink: 0 }}>
          <button
            onClick={onOpenMenu}
            aria-label={`More options for ${dispName}`}
            style={{ background: "transparent", border: "none", color: T.muted, cursor: "pointer", padding: 8, display: "flex" }}>
            <IC.Dots />
          </button>
          {/* Lyrics swaps the record for the words. The queue used to have a
              toggle beside it; it lives in the flow of the sheet now, because
              what is coming next is something you glance at by scrolling, not
              somewhere you navigate to. */}
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <TopToggle
              active={activePane === "lyrics"} label="Lyrics"
              onClick={() => showPane(activePane === "lyrics" ? "player" : "lyrics")}
              icon={<IC.Lyrics />} T={T}
            />
            <button onClick={animatedClose}
              aria-label="Close player"
              style={{ background: "transparent", border: "none", color: T.muted, cursor: "pointer", padding: 8, display: "flex" }}>
              <IC.ChevronDown />
            </button>
          </div>
        </div>
        </div>

        {/* Card matching the "hold song" look */}
        <div style={{
          background: T.card, borderRadius: 14, margin: "4px 16px 0", padding: "14px 14px 12px",
          border: `1px solid ${T.accent}44`, boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, marginBottom: 16, marginTop: 6 }}>
            {activePane === "lyrics" ? (
              <LyricsPane
                loading={!lyricsReady}
                lyrics={lyricsReady ? lyrics : null}
                positionMs={currentTime}
                size={Math.min(268, (typeof window !== "undefined" ? window.innerWidth : 375) - 84)}
                T={T}
              />
            ) : (
              <SpinningDisc
                size={Math.min(268, (typeof window !== "undefined" ? window.innerWidth : 375) - 84)}
                spinning={isPlaying}
                title={dispName}
                customPhoto={customPhoto}
              />
            )}
            <div style={{ width: "100%", textAlign: "center", minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: "700", color: T.accent, wordBreak: "break-word", lineHeight: 1.3 }}>
                {dispName}
              </div>
              {song.isCut && (
                <span style={{
                  fontSize: 10, background: T.dim, color: T.textSub,
                  borderRadius: 4, padding: "1px 5px", fontWeight: "700", display: "inline-block", marginTop: 6,
                }}>CUT</span>
              )}
              <div style={{ fontSize: 14, color: T.textSub, marginTop: 6, wordBreak: "break-word" }}>
                {dispArtist || "Unknown Artist"}
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18, marginTop: 10 }}>
            <button
              onClick={onCycleMode}
              title={playMode === "shuffle" ? "Shuffle on, tap for repeat" : playMode === "repeat" ? "Repeat on, tap to turn off" : "Tap to shuffle, again to repeat"}
              style={{ background: "transparent", border: "none", color: playMode === "shuffle" ? T.violet : playMode === "repeat" ? T.repeat : T.muted, cursor: "pointer", padding: 6, display: "flex", position: "relative" }}
            >
              {playMode === "repeat" ? <IC.Repeat /> : <IC.Shuffle />}
              {playMode !== "off" && (
                <span style={{ position: "absolute", bottom: 1, left: "50%", transform: "translateX(-50%)", width: 4, height: 4, borderRadius: "50%", background: playMode === "shuffle" ? T.violet : T.repeat }} />
              )}
            </button>
            <button onClick={() => onSkip(-1)} style={{ background: "transparent", border: "none", color: T.text, cursor: "pointer", padding: 6, display: "flex" }}><IC.SkipB /></button>
            <button
              onClick={onTogglePlay}
              style={{ background: T.playBtnBg, border: "none", color: T.playBtnFg, width: 54, height: 54, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
            >
              {isPlaying ? <IC.Pause /> : <IC.Play />}
            </button>
            <button onClick={() => onSkip(1)} style={{ background: "transparent", border: "none", color: T.text, cursor: "pointer", padding: 6, display: "flex" }}><IC.SkipF /></button>
            <button
              onClick={cycleSpeed}
              title="Playback speed"
              style={{
                background: playbackSpeed !== 1 ? T.dim : "transparent",
                border: `1px solid ${playbackSpeed !== 1 ? T.accent : T.border}`,
                color: playbackSpeed !== 1 ? T.text : T.muted,
                cursor: "pointer", padding: "5px 8px", borderRadius: 8,
                fontSize: 12, fontWeight: "700", minWidth: 44, fontFamily: "inherit",
              }}
            >
              {speedLabel}
            </button>
          </div>
        </div>

        {/* ── Action chips ─────────────────────────────────────────────────
            Edit and Cut used to sit here too. They are one-off, deliberate
            actions that take you out of the player entirely, so they belong
            with the rest of the per-song actions behind the "⋮" above rather
            than competing with Like and Share for a spot next to the
            transport. ─────────────────────────────────────────────────────── */}
        <div style={{ padding: "14px 16px 0", display: "flex", gap: 8, flexWrap: "wrap", flexShrink: 0 }}>
          <button className="chip" onClick={onToggleLike}>
            <IC.Heart filled={isLiked} size={15} />
            {isLiked ? "Unlike" : "Like"}
          </button>
          <button className="chip" onClick={onShare}><IC.Share /> Share</button>
          <button className="chip red" onClick={onRemove}><IC.Trash /> Remove</button>
        </div>

        {/* ── The queue ──────────────────────────────────────────────────────
            The whole queue, in the flow of the sheet, so scrolling down from the
            player reveals it. It used to be a two-row teaser behind a button;
            the button is gone because "what is coming" is something you glance
            at, not something you navigate to. */}
        <QueueList
          song={song}
          queue={upNextQueue ?? []}
          pinned={playNextQueue}
          isPlaying={isPlaying}
          getName={getName} getArtist={getArtist} getPhoto={getPhoto}
          onReorder={onQueueReorder}
          onRemove={onQueueRemove}
          onPlay={onPlayFromQueue}
          T={T}
        />
        </div>

      </div>
    </div>
  );
}

/**
 * The blurred album-art wash behind the player. Its own component purely so
 * memo can hold it still: nothing here depends on playback position, and
 * re-rasterising a 46px blur twice a second was the single most expensive thing
 * the expanded player did.
 */
const Backdrop = memo(function Backdrop({ photo, sheetBg }: { photo?: string; sheetBg: string }) {
  if (!photo) return null;
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 0, overflow: "hidden", borderRadius: "20px 20px 0 0", pointerEvents: "none" }}>
      <img
        src={photo}
        alt=""
        style={{
          position: "absolute", top: "-15%", left: "-15%", width: "130%", height: "130%",
          objectFit: "cover", filter: "blur(46px) saturate(1.4)",
          opacity: 0.42,
          // Promote to its own layer so the blur is rasterised once and then
          // simply composited, rather than recomputed whenever anything above
          // it repaints.
          willChange: "transform",
          transform: "translateZ(0)",
        }}
      />
      {/* Gradient scrim so text stays readable over the blur. */}
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${sheetBg}66 0%, ${sheetBg}cc 55%, ${sheetBg} 100%)` }} />
    </div>
  );
});

/** One of the two view switches in the player's top row. */
function TopToggle({ active, label, icon, onClick, T }: {
  active: boolean; label: string; icon: React.ReactNode; onClick: () => void; T: T;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        background: active ? T.dim : "transparent",
        border: "none", borderRadius: 16, padding: "6px 10px",
        color: active ? T.text : T.muted,
        fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

/**
 * The queue, from the current track onward, reorderable and prunable.
 *
 * Reordering is a long-press-then-drag on the grip, not a drag on the row: the
 * sheet itself scrolls, and a row that moved whenever a finger travelled down it
 * would make the queue impossible to scroll past.
 */
function QueueList({
  song, queue, pinned, isPlaying, getName, getArtist, getPhoto,
  onReorder, onRemove, onPlay, T,
}: {
  song: Song;
  queue: Song[];
  pinned: string[];
  isPlaying: boolean;
  getName: (s: Song) => string;
  getArtist: (s: Song) => string;
  getPhoto: (s: Song) => string | undefined;
  onReorder: (q: Song[]) => void;
  onRemove: (id: string) => void;
  onPlay: (s: Song) => void;
  T: T;
}) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  const curIdx = queue.findIndex(s => s.id === song.id);
  const rest = curIdx >= 0 ? queue.slice(curIdx + 1) : queue;
  const pinnedSet = new Set(pinned);

  const beginDrag = (i: number) => (e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragFrom(i);
    setDragOver(i);
  };

  const moveDrag = (e: React.TouchEvent) => {
    if (dragFrom === null) return;
    e.preventDefault();
    e.stopPropagation();
    const y = e.touches[0].clientY;
    for (let j = 0; j < rowRefs.current.length; j++) {
      const el = rowRefs.current[j];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (y >= r.top && y <= r.bottom) { setDragOver(j); break; }
    }
  };

  const endDrag = (e: React.TouchEvent) => {
    if (dragFrom === null) return;
    e.preventDefault();
    e.stopPropagation();
    if (dragOver !== null && dragOver !== dragFrom) {
      // Indices here are into the tail after the current track, so shift them
      // back onto the real queue before moving anything.
      const offset = curIdx >= 0 ? curIdx + 1 : 0;
      const next = [...queue];
      const [moved] = next.splice(offset + dragFrom, 1);
      next.splice(offset + dragOver, 0, moved);
      onReorder(next);
    }
    setDragFrom(null);
    setDragOver(null);
  };

  return (
    <div style={{ margin: "18px 16px 0" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: T.muted, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Queue
        </span>
        <span style={{ fontSize: 11, color: T.muted }}>
          {rest.length === 0 ? "nothing after this" : rest.length + " to go"}
        </span>
      </div>

      <div
        onTouchMove={dragFrom !== null ? moveDrag : undefined}
        onTouchEnd={dragFrom !== null ? endDrag : undefined}
        onTouchCancel={dragFrom !== null ? endDrag : undefined}
        style={{ display: "flex", flexDirection: "column", gap: 3 }}
      >
        <QueueRow
          song={song} current pinned={false} playing={isPlaying}
          getName={getName} getArtist={getArtist} getPhoto={getPhoto} T={T}
        />

        {rest.map((s, i) => (
          <QueueRow
            key={s.id + i}
            ref={(el: HTMLDivElement | null) => { rowRefs.current[i] = el; }}
            song={s}
            current={false}
            pinned={pinnedSet.has(s.id)}
            playing={false}
            dragging={dragFrom === i}
            dropTarget={dragOver === i && dragFrom !== null && dragFrom !== i}
            onGrab={beginDrag(i)}
            onRemove={() => onRemove(s.id)}
            onPlay={() => onPlay(s)}
            getName={getName} getArtist={getArtist} getPhoto={getPhoto} T={T}
          />
        ))}

        {rest.length === 0 && (
          <p style={{ margin: "6px 2px", fontSize: 13, color: T.muted, lineHeight: 1.6 }}>
            This is the last track in the queue.
          </p>
        )}
      </div>
    </div>
  );
}

const QueueRow = forwardRef<HTMLDivElement, {
  song: Song;
  current: boolean;
  pinned: boolean;
  playing?: boolean;
  dragging?: boolean;
  dropTarget?: boolean;
  onGrab?: (e: React.TouchEvent) => void;
  onRemove?: () => void;
  onPlay?: () => void;
  getName: (s: Song) => string;
  getArtist: (s: Song) => string;
  getPhoto: (s: Song) => string | undefined;
  T: T;
}>(function QueueRow({
  song, current, pinned, playing = false, dragging = false, dropTarget = false,
  onGrab, onRemove, onPlay, getName, getArtist, getPhoto, T,
}, ref) {
  return (
    <div
      ref={ref}
      onClick={onPlay}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 10px", borderRadius: 10,
        background: dropTarget ? T.dim : current ? T.dim : T.card,
        border: "1px solid " + (current ? T.accent : dropTarget ? T.accent : T.border),
        opacity: dragging ? 0.4 : 1,
        transform: dropTarget ? "scale(1.02)" : "scale(1)",
        transition: "opacity 0.12s, transform 0.12s, border-color 0.12s",
        cursor: onPlay ? "pointer" : "default",
      }}
    >
      {/* The grip, and only the grip, starts a reorder. Dragging anywhere else
          has to stay free for scrolling the sheet. */}
      {onGrab ? (
        <div
          onTouchStart={onGrab}
          onClick={e => e.stopPropagation()}
          aria-label="Reorder"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 26, height: 34, flexShrink: 0, color: T.muted,
            cursor: "grab", touchAction: "none",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="4" y1="8" x2="20" y2="8"/><line x1="4" y1="16" x2="20" y2="16"/>
          </svg>
        </div>
      ) : (
        <div style={{ width: 26, flexShrink: 0 }} />
      )}

      <AlbumArt title={getName(song)} size={36} active={false} playing={current && playing}
        customPhoto={getPhoto(song)} songPath={song.uri} albumId={song.albumId} T={T} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: current ? 700 : 600, color: current ? T.accent : T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {getName(song)}
        </div>
        <div style={{ fontSize: 11, color: T.textSub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {getArtist(song) || "Unknown Artist"}
        </div>
      </div>

      {pinned && !current && (
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: T.violet, flexShrink: 0 }}>NEXT</span>
      )}
      {current && (
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: T.accent, flexShrink: 0 }}>PLAYING</span>
      )}

      {/* No X on the current track: taking the queue out from under the service
          while it is playing that track has no sensible meaning. Skip does that. */}
      {onRemove && !current && (
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          aria-label={"Remove " + getName(song) + " from the queue"}
          style={{ background: "transparent", border: "none", color: T.muted, cursor: "pointer", padding: 6, display: "flex", flexShrink: 0 }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      )}
    </div>
  );
});
/**
 * Lyrics in the record's place: karaoke, when the words carry timestamps.
 *
 * An .lrc gives each line a time, so the current one can be highlighted and kept
 * centred while the rest dim. Without timestamps this is simply readable text,
 * which is the honest thing to show rather than faking a follow-along.
 */
function LyricsPane({ loading, lyrics, positionMs, size, T }: {
  loading: boolean;
  lyrics: { text: string; source?: string } | null;
  positionMs: number;
  size: number;
  T: T;
}) {
  const text = lyrics?.text ?? "";
  const timed = useMemo(() => parseLrc(text), [text]);
  const plain = useMemo(() => stripTimestamps(text), [text]);
  const active = timed ? activeLineIndex(timed, positionMs) : -1;

  const boxRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLParagraphElement | null>(null);

  // Keep the current line centred. Scrolling the container directly rather than
  // scrollIntoView, which would drag the whole sheet around it.
  useEffect(() => {
    const box = boxRef.current, line = activeRef.current;
    if (!box || !line) return;
    const target = line.offsetTop - box.clientHeight / 2 + line.clientHeight / 2;
    box.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }, [active]);

  const frame = {
    width: size, height: size, flexShrink: 0,
    borderRadius: 16, background: T.dim,
    overflowY: "auto" as const, WebkitOverflowScrolling: "touch" as const,
    padding: "14px 16px",
  };

  if (loading) {
    return (
      <div style={{ ...frame, display: "grid", placeItems: "center" }}>
        <span style={{ fontSize: 13, color: T.muted }}>Looking…</span>
      </div>
    );
  }

  if (!hasLyrics(text)) {
    return (
      <div style={{ ...frame, display: "grid", placeItems: "center", textAlign: "center" }}>
        <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.65 }}>
          <p style={{ margin: "0 0 8px", fontWeight: 700, color: T.text }}>No lyrics yet</p>
          <p style={{ margin: 0 }}>Add them from the song menu.</p>
        </div>
      </div>
    );
  }

  if (!timed) {
    return (
      <div ref={boxRef} style={frame}>
        <div style={{ fontSize: 15, lineHeight: 1.75, color: T.text, whiteSpace: "pre-wrap" }}>{plain}</div>
      </div>
    );
  }

  return (
    <div ref={boxRef} style={frame}>
      {timed.map((line, i) => (
        <p
          key={i}
          ref={i === active ? activeRef : undefined}
          style={{
            margin: "0 0 10px",
            fontSize: i === active ? 17 : 15,
            fontWeight: i === active ? 700 : 500,
            color: i === active ? T.accent : T.muted,
            opacity: i === active ? 1 : 0.55,
            lineHeight: 1.45,
            transition: "color 0.2s, opacity 0.2s, font-size 0.2s",
          }}
        >
          {line.text || " "}
        </p>
      ))}
    </div>
  );
}
