import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { IC } from "./Icons";
import { SpinningDisc } from "./SpinningDisc";
import { Logo } from "./Logo";
import { t } from "../i18n";
import type { T } from "../themes";

// ─── THE PLAYER ON THE SIDE ──────────────────────────────────────────────────
// A phone held sideways has width to spare and no height. The list goes in a
// column on the right, and the player takes the room on its left: the record,
// the song, the time and the buttons, always in sight, where the player card
// at the bottom used to cover half the list. A tap on the record opens the
// full player, as the card did. Dragged sideways across the list it changes
// sides with it, for whoever holds the phone the other way round.

const fmt = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function SidePlayer({
  width, colW, onRight, onSwap, song, title, artist, photo, isPlaying, currentTime, duration, shuffle,
  onTogglePlay, onSkip, onToggleShuffle, onSeek, onSeekStart, onSeekEnd, onOpen, T,
}: {
  width: number;
  /** The list's column: the player goes past it when it is on the right. */
  colW: number;
  onRight: boolean;
  /** Dragged far enough across: change sides. */
  onSwap: () => void;
  song: boolean;
  title: string;
  artist: string;
  photo?: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  shuffle: boolean;
  onTogglePlay: () => void;
  onSkip: (dir: 1 | -1) => void;
  onToggleShuffle: () => void;
  onSeek: (ms: number) => void;
  onSeekStart: () => void;
  onSeekEnd: (ms: number) => void;
  onOpen: () => void;
  T: T;
}) {
  const h = typeof window !== "undefined" ? window.innerHeight : 400;
  const disc = Math.max(110, Math.min(width - 96, h - 200));
  // A drag that starts on the panel (not on a button or the slider) moves it;
  // let go past a third of the way across and it changes sides.
  const [dx, setDx] = useState(0);
  const [held, setHeld] = useState(false);
  // Changing sides: the panel flies from where it was let go to its new
  // place while the list slides the other way, so nothing jumps.
  const [flying, setFlying] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const from = useRef<{ panel: number; body: number } | null>(null);
  const drag = useRef<{ x: number; id: number } | null>(null);
  const toward = onRight ? -1 : 1;
  useLayoutEffect(() => {
    const f = from.current, el = box.current;
    if (!f || !el) return;
    from.current = null;
    const body = document.body;
    const ease = "cubic-bezier(0.22, 1, 0.36, 1)", duration = 380;
    // Both measured before either moves. The list's column moved at once
    // (applyColumn): start it where it was.
    const b = f.body - body.getBoundingClientRect().left;
    // The panel sits in the body, so its own start is net of the body's.
    const p = f.panel - el.getBoundingClientRect().left;
    body.animate([{ transform: `translateX(${b}px)` }, { transform: "translateX(0)" }], { duration, easing: ease });
    const a = el.animate([{ transform: `translateX(${p - b}px)` }, { transform: "translateX(0)" }], { duration, easing: ease });
    a.onfinish = a.oncancel = () => setFlying(false);
  }, [onRight]);
  // On the right the panel ends at the window's edge. The window's width is a
  // whole number here but can be a fraction on the phone, and that sliver
  // past the edge let the page scroll sideways and take the player off
  // screen. The page itself never scrolls in landscape, so put it back.
  useEffect(() => {
    const back = () => { if (window.scrollX || window.scrollY) window.scrollTo(0, 0); };
    window.addEventListener("scroll", back, { passive: true });
    return () => window.removeEventListener("scroll", back);
  }, []);
  const down = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button,input")) return;
    drag.current = { x: e.clientX, id: e.pointerId };
    setHeld(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const d = e.clientX - drag.current.x;
    // Only toward the other side, and no further than across the list.
    setDx(toward > 0 ? Math.max(0, Math.min(colW, d)) : Math.min(0, Math.max(-colW, d)));
  };
  const up = () => {
    if (!drag.current) return;
    drag.current = null;
    setHeld(false);
    if (Math.abs(dx) > colW / 3 && box.current) {
      from.current = { panel: box.current.getBoundingClientRect().left, body: document.body.getBoundingClientRect().left };
      setFlying(true);
      onSwap();
    }
    setDx(0);
  };
  const btn: CSSProperties = { background: "transparent", border: "none", color: T.text, cursor: "pointer", padding: 8, display: "flex" };
  return (
    <div ref={box} style={{
      // On the right one pixel short of the edge (see above): unseen, as the
      // page's own colour runs on under it.
      position: "fixed", top: 0, bottom: 0, left: onRight ? colW : -width, width: onRight ? width - 1 : width,
      zIndex: dx || flying ? 500 : 95,
      transform: dx ? `translateX(${dx}px)` : undefined,
      transition: dx || held || flying ? "none" : "transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
      touchAction: "pan-y",
      // No ground of its own: the page's colour runs on under it (html), so
      // the header card's shadow fades out over it instead of stopping dead
      // at the edge of the column.
      color: T.text,
      display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box",
      padding: "12px 18px",
    }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <div style={{
        width: "100%", height: "100%", borderRadius: 24, position: "relative", cursor: dx ? "grabbing" : "grab",
        background: T.playerBg, border: `1px solid ${T.border}`,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10,
        padding: "14px 16px", boxSizing: "border-box", boxShadow: dx ? "0 18px 50px rgba(0,0,0,0.45)" : "0 10px 36px rgba(0,0,0,0.25)",
      }}>
        {/* The grip: this panel can be dragged to the other side. */}
        <div aria-hidden="true" style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", width: 36, height: 4, borderRadius: 2, background: T.dim }} />
        {song ? (
          <>
            <div onClick={onOpen} role="button" aria-label={t("Expand player")} style={{ cursor: "pointer" }}>
              <SpinningDisc size={disc} spinning={isPlaying} title={title} customPhoto={photo} />
            </div>
            <div onClick={onOpen} style={{ width: "100%", textAlign: "center", minWidth: 0, cursor: "pointer" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.accent, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
              <div style={{ fontSize: 13, color: T.textSub, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{artist || t("Unknown Artist")}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
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
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button onClick={onToggleShuffle} aria-label={t("Shuffle")} style={{ ...btn, color: shuffle ? T.violet : T.muted }}><IC.Shuffle /></button>
              <button onClick={() => onSkip(-1)} aria-label={t("Previous")} style={btn}><IC.SkipB /></button>
              <button onClick={onTogglePlay} aria-label={isPlaying ? t("Pause") : t("Play")}
                style={{ background: T.playBtnBg, border: "none", color: T.playBtnFg, width: 50, height: 50, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                {isPlaying ? <IC.Pause /> : <IC.Play />}
              </button>
              <button onClick={() => onSkip(1)} aria-label={t("Next")} style={btn}><IC.SkipF /></button>
              <span style={{ width: 40 }} />
            </div>
          </>
        ) : (
          <>
            <Logo size={56} color={T.text} />
            <div style={{ fontSize: 14, color: T.muted, textAlign: "center", maxWidth: 220, lineHeight: 1.5 }}>{t("Pick a song and it plays here.")}</div>
          </>
        )}
      </div>
    </div>
  );
}
