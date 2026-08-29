import { useState, useRef } from "react";
import type { T } from "../themes";
import type { Song, PlayMode } from "../types";
import { AlbumArt } from "./AlbumArt";
import { SpinningDisc } from "./SpinningDisc";
import { IC } from "./Icons";

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
  onEdit: () => void;
  onCut: () => void;
  onToggleLike: () => void;
  onRemove: () => void;
  onShare: () => void;
  onPlayNextReorder: (newQueue: string[]) => void;
  onSkipCurrentUpNext: () => void;
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
  onEdit, onCut, onToggleLike, onRemove, onShare,
  onPlayNextReorder, onSkipCurrentUpNext, onClose,
  dragProgress = null, dragSettling = false, skipEnter = false,
  T,
}: PlayerExpandSheetProps) {
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

  // ── touch-based drag-and-drop for pinned queue ────────────────────────────
  // We track which index is being dragged and which slot we're hovering over.
  const [dragIdx,     setDragIdx]     = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // ref to item elements so we can hit-test touch position
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // touch start: record which item the user grabbed
  const onTouchStartDrag = (i: number) => (e: React.TouchEvent) => {
    e.preventDefault(); // prevent page scroll while dragging
    e.stopPropagation();
    setDragIdx(i);
    setDragOverIdx(i);
  };

  // touch move: find which item the finger is over
  const onTouchMoveDrag = (e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const touch = e.touches[0];
    for (let j = 0; j < itemRefs.current.length; j++) {
      const el = itemRefs.current[j];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
        setDragOverIdx(j);
        break;
      }
    }
  };

  // touch end: commit the reorder
  const onTouchEndDrag = (e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragIdx !== null && dragOverIdx !== null && dragIdx !== dragOverIdx) {
      const newQ = [...playNextQueue];
      const [moved] = newQ.splice(dragIdx, 1);
      newQ.splice(dragOverIdx, 0, moved);
      onPlayNextReorder(newQ);
    }
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const handleRemovePinned = (idx: number) => {
    const newQ = [...playNextQueue];
    newQ.splice(idx, 1);
    onPlayNextReorder(newQ);
  };

  // ── resolve the "normal" next song (first non-pinned after current) ────────
  const normalNext: Song | null = (() => {
    if (!upNextQueue || upNextQueue.length === 0) return null;
    const curIdx = upNextQueue.findIndex(s => s.id === song.id);
    const rest = curIdx >= 0 ? upNextQueue.slice(curIdx + 1) : upNextQueue;
    const pinnedSet = new Set(playNextQueue);
    return rest.find(s => !pinnedSet.has(s.id)) ?? null;
  })();

  // resolve Song objects for the pinned queue
  const pinnedSongs: (Song | null)[] = playNextQueue.map(id =>
    upNextQueue?.find(s => s.id === id) ?? null
  );

  const showUpNext = pinnedSongs.length > 0 || normalNext !== null;

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
        className={closing ? "pes-sheet-out" : dragProgress !== null || skipEnter ? undefined : "pes-sheet-in"}
        onClick={e => e.stopPropagation()}
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
        {/* Blurred album-art backdrop. Sits behind all content, heavily blurred
            and dimmed, so the sheet takes on the track's colors instead of a
            flat surface. Pointer-events off so it never intercepts taps. */}
        {backdropPhoto && (
          <div style={{ position: "absolute", inset: 0, zIndex: 0, overflow: "hidden", borderRadius: "20px 20px 0 0", pointerEvents: "none" }}>
            <img
              src={backdropPhoto}
              alt=""
              style={{
                position: "absolute", top: "-15%", left: "-15%", width: "130%", height: "130%",
                objectFit: "cover", filter: "blur(46px) saturate(1.4)",
                opacity: 0.42,
              }}
            />
            {/* Gradient scrim so text stays readable over the blur. */}
            <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${T.sheetBg}66 0%, ${T.sheetBg}cc 55%, ${T.sheetBg} 100%)` }} />
          </div>
        )}

        <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column" }}>
        {/* Top zone = the drag-down-to-close grab area (handle + header row). */}
        <div
          onTouchStart={e => startCloseDrag(e.touches[0].clientY)}
          onTouchMove={e => moveCloseDrag(e.touches[0].clientY)}
          onTouchEnd={endCloseDrag}
          onTouchCancel={endCloseDrag}
          style={{ flexShrink: 0 }}
        >
        <div style={{ width: 36, height: 4, background: T.dim, borderRadius: 2, margin: "12px auto 0", flexShrink: 0 }} />

        <div style={{ display: "flex", justifyContent: "flex-end", padding: "6px 14px 0", flexShrink: 0 }}>
          <button onClick={animatedClose}
            style={{ background: "transparent", border: "none", color: T.muted, cursor: "pointer", padding: 8, display: "flex" }}>
            <IC.ChevronDown />
          </button>
        </div>
        </div>

        {/* Card matching the "hold song" look */}
        <div style={{
          background: T.card, borderRadius: 14, margin: "4px 16px 0", padding: "14px 14px 12px",
          border: `1px solid ${T.accent}44`, boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, marginBottom: 16, marginTop: 6 }}>
            <SpinningDisc
              size={Math.min(268, (typeof window !== "undefined" ? window.innerWidth : 375) - 84)}
              spinning={isPlaying}
              title={dispName}
              customPhoto={customPhoto}
            />
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

        {/* ── Action chips ─────────────────────────────────────────────────── */}
        <div style={{ padding: "14px 16px 0", display: "flex", gap: 8, flexWrap: "wrap", flexShrink: 0 }}>
          <button className="chip" onClick={onEdit}><IC.Edit /> Edit</button>
          <button className="chip" onClick={onCut}><IC.Scissors /> Cut</button>
          <button className="chip" onClick={onToggleLike}>
            <IC.Heart filled={isLiked} size={15} />
            {isLiked ? "Unlike" : "Like"}
          </button>
          <button className="chip" onClick={onShare}><IC.Share /> Share</button>
          <button className="chip red" onClick={onRemove}><IC.Trash /> Remove</button>
        </div>

        {/* ── Up Next panel ────────────────────────────────────────────────── */}
        {showUpNext && (
          <div style={{ margin: "16px 16px 0", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: "700", color: T.muted, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Up Next
              </span>
              <span style={{ fontSize: 11, color: T.muted }}>
                {pinnedSongs.filter(Boolean).length + (normalNext ? 1 : 0)} songs
              </span>
            </div>

            {/* container: touch events for drag live here so move/end are always caught */}
            <div
              onTouchMove={dragIdx !== null ? onTouchMoveDrag : undefined}
              onTouchEnd={dragIdx !== null ? onTouchEndDrag : undefined}
              style={{ display: "flex", flexDirection: "column", gap: 2 }}
            >
              {/* ── Pinned / Play Next items ── */}
              {pinnedSongs.map((s, i) => {
                if (!s) return null;
                const name   = getName(s);
                const artist = getArtist(s);
                const photo  = getPhoto(s);
                const isDragging = dragIdx === i;
                const isOver     = dragOverIdx === i && dragIdx !== null && dragIdx !== i;
                return (
                  <div
                    key={s.id + i}
                    ref={el => { itemRefs.current[i] = el; }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 10px",
                      borderRadius: 10,
                      background: isOver ? T.dim : T.card,
                      border: `1px solid ${isOver ? T.accent : T.border}`,
                      opacity: isDragging ? 0.4 : 1,
                      transform: isOver ? "scale(1.02)" : "scale(1)",
                      transition: "opacity 0.12s, transform 0.12s, border-color 0.12s",
                      touchAction: "none", // critical: tells browser not to scroll
                    }}
                  >
                    {/* drag handle — only this triggers the drag */}
                    <div
                      onTouchStart={onTouchStartDrag(i)}
                      style={{ color: T.muted, display: "flex", flexShrink: 0, cursor: "grab", padding: "4px 2px" }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="3" y1="7" x2="21" y2="7"/>
                        <line x1="3" y1="12" x2="21" y2="12"/>
                        <line x1="3" y1="17" x2="21" y2="17"/>
                      </svg>
                    </div>
                    <AlbumArt title={name} size={36} active={false} customPhoto={photo} T={T} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: "600", color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {name}
                      </div>
                      <div style={{ fontSize: 11, color: T.textSub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {artist || "Unknown Artist"}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 9, fontWeight: "700", color: T.textSub,
                      background: T.dim, borderRadius: 4, padding: "2px 6px",
                      whiteSpace: "nowrap", flexShrink: 0, letterSpacing: "0.04em",
                    }}>
                      NEXT
                    </span>
                    <button
                      onClick={() => handleRemovePinned(i)}
                      title="Remove from queue"
                      style={{ background: "transparent", border: "none", color: T.muted, cursor: "pointer", padding: 4, display: "flex", flexShrink: 0 }}
                    >
                      <IC.Close />
                    </button>
                  </div>
                );
              })}

              {/* ── Normal next song ── */}
              {normalNext && (() => {
                const name   = getName(normalNext);
                const artist = getArtist(normalNext);
                const photo  = getPhoto(normalNext);
                return (
                  <div
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 10px",
                      borderRadius: 10,
                      background: T.card,
                      border: `1px solid ${T.border}`,
                    }}
                  >
                    <AlbumArt title={name} size={36} active={false} customPhoto={photo} T={T} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: "600", color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {name}
                      </div>
                      <div style={{ fontSize: 11, color: T.textSub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {artist || "Unknown Artist"}
                      </div>
                    </div>
                    {/* Skip button with label */}
                    <button
                      onClick={onSkipCurrentUpNext}
                      title="Skip this song"
                      style={{
                        background: "transparent", border: "none", color: T.muted,
                        cursor: "pointer", padding: "4px 6px", display: "flex",
                        alignItems: "center", gap: 4, flexShrink: 0,
                        fontSize: 12, fontWeight: "600",
                      }}
                    >
                      <IC.SkipF />
                      Skip
                    </button>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}