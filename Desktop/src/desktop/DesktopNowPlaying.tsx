import { useRef, useState } from "react";
import type { T } from "../themes";
import type { Song } from "../types";
import { SpinningDisc } from "../components/SpinningDisc";
import { AlbumArt } from "../components/AlbumArt";
import { IC } from "../components/Icons";
import { t } from "../i18n";

const SPEED_STOPS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const UP_NEXT_MAX = 60;

/** How narrow and how wide the panel may be dragged. */
export const PANEL_MIN = 280;
export const PANEL_MAX = 560;

const chip = (T: T, on = false): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, height: 34, minWidth: 34, padding: "0 10px",
  borderRadius: 17, border: `1px solid ${T.border}`, background: on ? T.dim : "transparent",
  color: on ? T.text : T.muted, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700,
});

const Chevron = ({ left }: { left?: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <polyline points={left ? "15 18 9 12 15 6" : "9 18 15 12 9 6"} />
  </svg>
);

/** What is left of the panel when it is closed: an arrow on the right edge
 *  that opens it again. */
export function DesktopNowPlayingTab({ T, onOpen }: { T: T; onOpen: () => void }) {
  return (
    <aside style={{ gridColumn: 3, gridRow: 1, borderLeft: `1px solid ${T.border}`, background: T.bg, display: "flex", justifyContent: "center", paddingTop: 14 }}>
      <button onClick={onOpen} aria-label={t("Show what is playing")} className="dnav"
        style={{ width: 30, height: 30, border: "none", borderRadius: 8, color: T.muted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Chevron left />
      </button>
    </aside>
  );
}

/**
 * The right-hand column of the wide layout. Stands where the expanded player
 * stands on a phone: the record, what plays next and the words. The transport
 * is not repeated here, it is in the bar along the bottom.
 */
export function DesktopNowPlaying({
  T, width, song, name, artist, photo, isPlaying, liked, speed, queue, pinned, lyrics,
  dispName, dispArtist, photoOf,
  onLike, onSpeed, onMenu, onPlay, onEditLyrics, onNoCover, onClose, onResize, onUpNext,
}: {
  T: T; width: number; song: Song; name: string; artist: string; photo?: string;
  isPlaying: boolean; liked: boolean; speed: number;
  /** The play order, and the ids pinned to go first with Play next. */
  queue: Song[]; pinned: string[]; lyrics?: string;
  dispName: (s: Song) => string; dispArtist: (s: Song) => string; photoOf: (s: Song) => string | undefined;
  onLike: () => void; onSpeed: (s: number) => void; onMenu: () => void;
  onPlay: (s: Song) => void; onEditLyrics: () => void; onNoCover: () => void; onClose: () => void;
  /** The panel's left edge was dragged to this width. */
  onResize: (width: number) => void;
  /** What comes after this song, in the order it was just put in. */
  onUpNext: (songs: Song[]) => void;
}) {
  const [tab, setTab] = useState<"next" | "lyrics">("next");
  // The row being dragged, and the row it would land in front of.
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const resizing = useRef(false);
  const scroller = useRef<HTMLDivElement | null>(null);
  // Dragging a song towards the top or bottom edge moves the list along, so a
  // song can be taken further than what happens to be in view.
  const edgeScroll = (y: number) => {
    const el = scroller.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (y < r.top + 56) el.scrollTop -= 16;
    else if (y > r.bottom - 56) el.scrollTop += 16;
  };

  const at = queue.findIndex(s => s.id === song.id);
  const rest = at >= 0 ? queue.slice(at + 1) : queue;
  const pinnedSet = new Set(pinned);
  const first = pinned.map(id => queue.find(s => s.id === id)).filter((s): s is Song => !!s && s.id !== song.id);
  const upNext = [...first, ...rest.filter(s => !pinnedSet.has(s.id))];

  const nextSpeed = () => {
    const i = SPEED_STOPS.findIndex(s => Math.abs(s - speed) < 0.01);
    onSpeed(SPEED_STOPS[((i < 0 ? SPEED_STOPS.indexOf(1) : i) + 1) % SPEED_STOPS.length]);
  };
  // As big as the panel is wide and a short screen is tall, so Up next keeps
  // some room under it.
  const discSize = Math.round(Math.max(140, Math.min(240, width - 96, window.innerHeight * 0.25)));
  const hasLyrics = !!lyrics && lyrics.trim().length > 0;

  const drop = (beforeId: string | null) => {
    const moved = upNext.find(s => s.id === dragId);
    setDragId(null); setOverId(null);
    if (!moved || moved.id === beforeId) return;
    const without = upNext.filter(s => s.id !== moved.id);
    const to = beforeId === null ? without.length : without.findIndex(s => s.id === beforeId);
    onUpNext([...without.slice(0, to), moved, ...without.slice(to)]);
  };

  const tabBtn = (id: "next" | "lyrics", label: string) => (
    <button
      onClick={() => setTab(id)}
      aria-pressed={tab === id}
      style={{
        flex: 1, padding: "7px 0", border: "none", borderRadius: 15, cursor: "pointer", fontFamily: "inherit",
        fontSize: 12, fontWeight: 700,
        background: tab === id ? T.accent : "transparent", color: tab === id ? T.playBtnFg : T.muted,
      }}
    >
      {label}
    </button>
  );

  return (
    <aside style={{
      gridColumn: 3, gridRow: 1, display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, position: "relative",
      borderLeft: `1px solid ${T.border}`, background: T.bg, color: T.text,
    }}>
      {/* The edge you drag to make the panel wider or narrower. */}
      <div
        role="separator" aria-orientation="vertical" aria-label={t("Resize")}
        onPointerDown={e => { resizing.current = true; e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={e => { if (resizing.current) onResize(window.innerWidth - e.clientX); }}
        onPointerUp={e => { resizing.current = false; e.currentTarget.releasePointerCapture(e.pointerId); }}
        className="dgrip"
        style={{ position: "absolute", left: -4, top: 0, bottom: 0, width: 8, cursor: "col-resize", zIndex: 5 }}
      />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 12px 0 20px" }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: T.muted }}>{t("Now playing")}</span>
        <button onClick={onClose} aria-label={t("Hide what is playing")} className="dnav" style={{ width: 30, height: 30, border: "none", color: T.muted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 }}>
          <Chevron />
        </button>
      </div>

      {/* Everything under the heading scrolls as one. The record goes up out of
          the way and the two tabs stay put, so the list gets the whole panel. */}
      <div ref={scroller} className="dscroll" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}
        onDragOver={dragId ? e => { e.preventDefault(); edgeScroll(e.clientY); } : undefined}
        onDrop={dragId ? e => { e.preventDefault(); drop(null); } : undefined}
      >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "12px 20px 0" }}>
        <SpinningDisc size={discSize} spinning={isPlaying} title={name} customPhoto={photo} tappable onNoCover={onNoCover} />
        <div style={{ marginTop: 18, maxWidth: "100%", fontSize: 19, fontWeight: 700, textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
        <div style={{ marginTop: 4, maxWidth: "100%", fontSize: 14, color: T.textSub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{artist}</div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button onClick={onLike} aria-label={liked ? t("Remove from favorites") : t("Like")} aria-pressed={liked} style={{ ...chip(T, liked), padding: 0, color: liked ? T.accent : T.muted }}>
            <IC.Heart filled={liked} size={15} />
          </button>
          <button onClick={nextSpeed} aria-label={t("Playback speed")} style={chip(T, Math.abs(speed - 1) > 0.01)}>{speed}×</button>
          <button onClick={onMenu} aria-label={t("More options for {name}", { name })} style={{ ...chip(T), padding: 0 }}><IC.Dots /></button>
        </div>
      </div>

      <div style={{ position: "sticky", top: 0, zIndex: 2, background: T.bg, padding: "18px 20px 8px" }}>
        <div style={{ display: "flex", gap: 2, padding: 3, borderRadius: 18, border: `1px solid ${T.border}`, background: T.surface }}>
          {tabBtn("next", t("Up next"))}
          {tabBtn("lyrics", t("Lyrics"))}
        </div>
      </div>

      <div style={{ padding: "0 8px 12px" }}>
        {tab === "next" ? (
          upNext.length === 0 ? (
            <div style={{ padding: "24px 12px", fontSize: 13, color: T.muted, textAlign: "center" }}>{t("Nothing after this song.")}</div>
          ) : (
            <>
              {upNext.slice(0, UP_NEXT_MAX).map((s, i) => (
                <div
                  key={s.id} className="drow" draggable
                  onDragStart={e => { setDragId(s.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", s.id); }}
                  onDragOver={e => { if (!dragId) return; e.preventDefault(); e.stopPropagation(); edgeScroll(e.clientY); if (overId !== s.id) setOverId(s.id); }}
                  onDrop={e => { e.preventDefault(); e.stopPropagation(); drop(s.id); }}
                  onDragEnd={() => { setDragId(null); setOverId(null); }}
                  onDoubleClick={() => onPlay(s)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "6px 8px 6px 6px", borderRadius: 8, cursor: "grab",
                    opacity: dragId === s.id ? 0.4 : 1,
                    // The line shows where the dragged song would land.
                    boxShadow: dragId && overId === s.id && dragId !== s.id ? `0 -2px 0 ${T.accent}` : undefined,
                  }}
                >
                  <span aria-hidden="true" className="dmore" style={{ display: "flex", color: T.muted, flexShrink: 0 }}>
                    <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor"><circle cx="3" cy="3" r="1.4"/><circle cx="9" cy="3" r="1.4"/><circle cx="3" cy="8" r="1.4"/><circle cx="9" cy="8" r="1.4"/><circle cx="3" cy="13" r="1.4"/><circle cx="9" cy="13" r="1.4"/></svg>
                  </span>
                  <AlbumArt title={dispName(s)} size={34} customPhoto={photoOf(s)} songPath={s.uri} albumId={s.albumId} T={T} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{dispName(s)}</div>
                    <div style={{ fontSize: 12, color: T.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{dispArtist(s) || t("Unknown Artist")}</div>
                  </div>
                  {i < first.length && <span style={{ fontSize: 10, fontWeight: 700, color: T.textSub, background: T.dim, borderRadius: 4, padding: "1px 5px" }}>{t("NEXT")}</span>}
                  <button
                    onClick={e => { e.stopPropagation(); onUpNext(upNext.filter(x => x.id !== s.id)); }}
                    onDoubleClick={e => e.stopPropagation()}
                    aria-label={t("Take {name} out of Up next", { name: dispName(s) })}
                    className="dmore"
                    style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, display: "flex", color: T.muted, flexShrink: 0 }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
              ))}
              {upNext.length > UP_NEXT_MAX && (
                <div style={{ padding: "8px 12px", fontSize: 12, color: T.muted }}>{t("and {n} more", { n: upNext.length - UP_NEXT_MAX })}</div>
              )}
            </>
          )
        ) : hasLyrics ? (
          <div style={{ padding: "4px 12px" }}>
            <div style={{ fontSize: 14, lineHeight: 1.75, whiteSpace: "pre-wrap", userSelect: "text" }}>{lyrics!.trim()}</div>
            <button onClick={onEditLyrics} style={{ ...chip(T), marginTop: 14 }}>{t("Edit")}</button>
          </div>
        ) : (
          <div style={{ padding: "24px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 13, color: T.muted }}>{t("No lyrics saved for this song.")}</div>
            <button onClick={onEditLyrics} style={{ ...chip(T), marginTop: 12 }}>{t("Add lyrics")}</button>
          </div>
        )}
      </div>
      </div>
    </aside>
  );
}
