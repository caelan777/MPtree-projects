import type { T } from "../themes";
import type { Song } from "../types";
import { AlbumArt } from "./AlbumArt";
import { IC } from "./Icons";

// ─── EXPANDED SONG ROW (long-press → big card) ───────────────────────────────

type ExpandedSongRowProps = {
  song: Song;
  dispName: string;
  dispArtist: string;
  customPhoto?: string;
  isActive: boolean;
  idx: number;
  isLiked: boolean;
  onPlay: () => void;
  onEdit: () => void;
  onCut: () => void;
  onRemove: () => void;
  onToggleLike: () => void;
  onShare: () => void;
  onPlayNext: () => void;
  onClose: () => void;
  T: T;
};

export function ExpandedSongRow({
  song, dispName, dispArtist, customPhoto, isActive, idx, isLiked,
  onPlay, onEdit, onCut, onRemove, onToggleLike, onShare, onPlayNext, onClose, T,
}: ExpandedSongRowProps) {
  return (
    <div style={{
      background: isActive ? T.card : T.surface,
      borderRadius: 14, margin: "4px 10px", padding: "14px 14px 12px",
      border: `1px solid ${isActive ? T.accent + "44" : T.border}`,
      boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
    }}>
      {/* Top row: number + big art + text */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: "700", color: isActive ? T.accent : T.muted, flexShrink: 0, minWidth: 18 }}>
          #{idx + 1}
        </span>
        <AlbumArt title={dispName} size={88} active={isActive} customPhoto={customPhoto} songPath={song.uri} T={T} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: "700", color: isActive ? T.accent : T.text, wordBreak: "break-word", lineHeight: 1.3 }}>
            {dispName}
          </div>
          {song.isCut && (
            <span style={{
              fontSize: 10, background: T.dim, color: T.textSub,
              borderRadius: 4, padding: "1px 5px", fontWeight: "700", display: "inline-block", marginTop: 4,
            }}>CUT</span>
          )}
          <div style={{ fontSize: 14, color: T.textSub, marginTop: 5, wordBreak: "break-word" }}>
            {dispArtist || "Unknown Artist"}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="chip" onClick={onPlay} style={{ flex: 1, justifyContent: "center" }}>
          <IC.Play /> Play
        </button>
        <button className="chip" onClick={onEdit}><IC.Edit /> Edit</button>
        <button className="chip" onClick={onCut}><IC.Scissors /> Cut</button>
        <button className="chip" onClick={onToggleLike}>
          <IC.Heart filled={isLiked} size={15} />
          {isLiked ? "Unlike" : "Like"}
        </button>
        <button className="chip" onClick={onShare}><IC.Share /> Share</button>
        <button className="chip" onClick={onPlayNext}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="5 4 15 12 5 20 5 4"/>
            <line x1="19" y1="5" x2="19" y2="19"/>
            <line x1="22" y1="12" x2="16" y2="12"/>
          </svg>
          Play Next
        </button>
        <button className="chip red" onClick={onRemove}><IC.Trash /> Remove</button>
        <button className="chip" onClick={onClose}><IC.Close /> Done</button>
      </div>
    </div>
  );
}