import { useState, type ReactNode } from "react";
import type { T } from "../themes";
import type { PlayMode } from "../types";
import { IC } from "../components/Icons";
import { t } from "../i18n";

const VolumeIcon = ({ muted }: { muted: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    {muted
      ? <><line x1="22" y1="9" x2="16" y2="15" /><line x1="16" y1="9" x2="22" y2="15" /></>
      : <><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></>}
  </svg>
);

const plain: React.CSSProperties = { background: "transparent", border: "none", cursor: "pointer", padding: 8, display: "flex", borderRadius: 8 };

/** The bar along the bottom of the wide layout. Stands where the floating
 *  mini-player stands on a phone, and has room for what that one leaves to the
 *  expanded player: the timeline. Volume is new here; a phone has buttons. */
export function DesktopPlayerBar({
  T, art, title, artist, hasSong, isPlaying, playMode, currentTime, duration, volume, fmt,
  onTogglePlay, onSkip, onShuffle, onRepeat, onSeek, onVolume, onExpand,
}: {
  T: T; art: ReactNode; title: string; artist: string; hasSong: boolean;
  isPlaying: boolean; playMode: PlayMode; currentTime: number; duration: number; volume: number;
  fmt: (ms: number) => string;
  onTogglePlay: () => void; onSkip: (dir: 1 | -1) => void; onShuffle: () => void; onRepeat: () => void;
  onSeek: (ms: number) => void; onVolume: (v: number) => void; onExpand: () => void;
}) {
  // While the thumb is held the bar shows where it is, not where the song is.
  const [held, setHeld] = useState<number | null>(null);
  const shown = held ?? currentTime;
  const dim = hasSong ? 1 : 0.4;

  return (
    <footer style={{
      gridColumn: "1 / -1", gridRow: 2, display: "grid", alignItems: "center", gap: 20,
      gridTemplateColumns: "minmax(180px, 1fr) minmax(320px, 2fr) minmax(180px, 1fr)",
      padding: "12px 20px", borderTop: `1px solid ${T.border}`, background: T.playerBg, color: T.text,
    }}>
      <button
        onClick={hasSong ? onExpand : undefined}
        aria-label={t("Expand player")}
        style={{ ...plain, padding: 0, alignItems: "center", gap: 12, minWidth: 0, textAlign: "left", cursor: hasSong ? "pointer" : "default", color: T.text, fontFamily: "inherit" }}
      >
        {art}
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{hasSong ? title : t("Nothing playing")}</span>
          {hasSong && <span style={{ display: "block", fontSize: 12, color: T.muted, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{artist}</span>}
        </span>
      </button>

      <div style={{ opacity: dim, pointerEvents: hasSong ? "auto" : "none" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <button onClick={onShuffle} aria-label={t("Shuffle")} style={{ ...plain, color: playMode === "shuffle" ? T.violet : T.muted }}><IC.Shuffle /></button>
          <button onClick={() => onSkip(-1)} aria-label={t("Previous")} style={{ ...plain, color: T.text }}><IC.SkipB /></button>
          <button onClick={onTogglePlay} aria-label={isPlaying ? t("Pause") : t("Play")} style={{ background: T.playBtnBg, border: "none", color: T.playBtnFg, width: 38, height: 38, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", margin: "0 6px" }}>
            {isPlaying ? <IC.Pause /> : <IC.Play />}
          </button>
          <button onClick={() => onSkip(1)} aria-label={t("Next")} style={{ ...plain, color: T.text }}><IC.SkipF /></button>
          <button onClick={onRepeat} aria-label={t("Repeat")} style={{ ...plain, color: playMode === "repeat" ? T.repeat : T.muted }}><IC.Repeat /></button>
        </div>
        <div style={{ display: "flex", alignItems: "center", marginTop: 4, fontSize: 11, color: T.muted, fontVariantNumeric: "tabular-nums" }}>
          <span style={{ width: 38, textAlign: "right" }}>{fmt(shown)}</span>
          <input
            type="range" className="slider" min={0} max={Math.max(1, duration)} step={250} value={Math.min(shown, Math.max(1, duration))}
            aria-label={t("Position in the song")}
            onChange={e => setHeld(Number(e.target.value))}
            onPointerUp={() => { if (held !== null) { onSeek(held); setHeld(null); } }}
            onKeyUp={() => { if (held !== null) { onSeek(held); setHeld(null); } }}
            style={{ flex: 1 }}
          />
          <span style={{ width: 38 }}>{duration > 0 ? fmt(duration) : ""}</span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", color: T.muted }}>
        <button onClick={() => onVolume(volume > 0 ? 0 : 1)} aria-label={volume > 0 ? t("Mute") : t("Unmute")} style={{ ...plain, color: T.muted }}>
          <VolumeIcon muted={volume === 0} />
        </button>
        <input
          type="range" className="slider" min={0} max={1} step={0.01} value={volume}
          aria-label={t("Volume")}
          onChange={e => onVolume(Number(e.target.value))}
          style={{ width: 110, flex: "none", margin: "0 0 0 4px" }}
        />
      </div>
    </footer>
  );
}
