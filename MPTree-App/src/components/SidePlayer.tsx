import type { CSSProperties } from "react";
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
// full player, as the card did.

const fmt = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function SidePlayer({
  width, ground, song, title, artist, photo, isPlaying, currentTime, duration, shuffle,
  onTogglePlay, onSkip, onToggleShuffle, onSeek, onSeekStart, onSeekEnd, onOpen, T,
}: {
  width: number;
  /** The app's ground (a style's flowers, light or liquid) carried on to this side. */
  ground: CSSProperties;
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
  const btn: CSSProperties = { background: "transparent", border: "none", color: T.text, cursor: "pointer", padding: 8, display: "flex" };
  return (
    <div style={{
      position: "fixed", top: 0, bottom: 0, left: -width, width, zIndex: 95,
      backgroundColor: T.bg, ...ground, color: T.text,
      display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box",
      padding: "12px 18px",
    }}>
      <div style={{
        width: "100%", height: "100%", borderRadius: 24, background: T.playerBg, border: `1px solid ${T.border}`,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10,
        padding: "14px 16px", boxSizing: "border-box", boxShadow: "0 10px 36px rgba(0,0,0,0.25)",
      }}>
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
