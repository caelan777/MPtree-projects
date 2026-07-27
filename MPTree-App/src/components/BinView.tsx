import { useState } from "react";
import type { T } from "../themes";
import type { Song, SongMeta } from "../types";
import { AlbumArt } from "./AlbumArt";
import { IC } from "./Icons";
import { ConfirmSheet } from "./ConfirmSheet";

// ─── BIN VIEW ────────────────────────────────────────────────────────────────

type BinViewProps = {
  removedSongs: Song[];
  meta: Record<string, SongMeta>;
  onRestore: (s: Song) => void;
  /** Permanently delete a single song — removes the file from the device too. */
  onDeleteForever: (s: Song) => void;
  /** Permanently delete every song currently in the bin. */
  onEmptyBin: () => void;
  /** Play a bin song, using the bin as the queue. */
  onPlaySong: (s: Song, list: Song[]) => void;
  /** Pause/resume the current song (tap on the already-playing row). */
  onTogglePlay: () => void;
  /** id of the currently-playing song, to highlight it. */
  currentSongId?: string | null;
  /** Whether playback is running, for the art overlay icon. */
  isPlaying?: boolean;
  onClose: () => void;
  T: T;
};

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

export function BinView({ removedSongs, meta, onRestore, onDeleteForever, onEmptyBin, onPlaySong, onTogglePlay, currentSongId, isPlaying, onClose, T }: BinViewProps) {
  const dispName   = (s: Song) => meta[s.id]?.customName   || s.title;
  const dispArtist = (s: Song) => meta[s.id]?.customArtist || (s.artist && s.artist.toLowerCase() !== "<unknown>" ? s.artist : "");

  // Song pending single-item delete confirmation, or `true` for "empty bin" confirmation.
  const [deleteSong,    setDeleteSong]    = useState<Song | null>(null);
  const [confirmEmpty,  setConfirmEmpty]  = useState(false);

  return (
    <div style={{ position: "fixed", inset: 0, background: T.bg, zIndex: 300, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px 12px", borderBottom: `1px solid ${T.border}` }}>
        <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: T.muted, padding: 4 }}>
          <IC.Close />
        </button>
        <span style={{ fontSize: 17, fontWeight: "700", color: T.text }}>Removed Songs</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, color: T.muted }}>{removedSongs.length} songs</span>
          {removedSongs.length > 0 && (
            <button
              onClick={() => setConfirmEmpty(true)}
              style={{ padding: "6px 11px", background: "transparent", border: "1px solid #e8445a55", borderRadius: 8, color: "#e8445a", fontSize: 12, fontWeight: "700", cursor: "pointer", whiteSpace: "nowrap" }}
            >
              Empty Bin
            </button>
          )}
        </div>
      </div>

      {removedSongs.length === 0 ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: T.muted, gap: 12 }}>
          <IC.Bin />
          <div style={{ fontSize: 15, fontWeight: "600" }}>Bin is empty</div>
          <div style={{ fontSize: 13 }}>Removed songs appear here</div>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          <div style={{ padding: "10px 16px 6px", fontSize: 12, color: T.muted }}>
            These songs won't be re-added when you scan. Tap Restore to bring them back, or use the trash icon to delete a song permanently.
          </div>
          {removedSongs.map(song => {
            const isCurrent = currentSongId === song.id;
            return (
            <div key={song.id} style={{ display: "flex", alignItems: "center", padding: "10px 16px", gap: 10, borderBottom: `1px solid ${T.border}`, background: isCurrent ? T.card : "transparent" }}>
              <div
                onClick={() => { if (isCurrent) onTogglePlay(); else onPlaySong(song, removedSongs); }}
                style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, cursor: "pointer" }}
              >
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <AlbumArt title={dispName(song)} size={44} active={isCurrent} customPhoto={meta[song.id]?.customPhoto} T={T} />
                  {isCurrent && (
                    <div style={{ position: "absolute", inset: 0, borderRadius: 8, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {isPlaying
                        ? <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
                        : <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><polygon points="6 4 20 12 6 20 6 4"/></svg>}
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: "600", color: isCurrent ? T.accent : T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {dispName(song)}
                  </div>
                  <div style={{ fontSize: 13, color: T.muted, opacity: 0.7, marginTop: 2 }}>
                    {dispArtist(song) || "Unknown Artist"}
                  </div>
                </div>
              </div>
              <button
                onClick={() => onRestore(song)}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", background: T.dim, border: "none", borderRadius: 8, color: T.text, fontSize: 13, fontWeight: "600", cursor: "pointer", flexShrink: 0 }}
              >
                <IC.Restore /> Restore
              </button>
              <button
                onClick={() => setDeleteSong(song)}
                title="Delete permanently"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, background: "transparent", border: "none", borderRadius: 8, color: "#e8445a", cursor: "pointer", flexShrink: 0 }}
              >
                <TrashIcon />
              </button>
            </div>
            );
          })}
        </div>
      )}

      {deleteSong && (
        <ConfirmSheet
          title="Delete permanently"
          body={`"${dispName(deleteSong)}" will be permanently deleted from your device. This can't be undone.`}
          confirmLabel="Delete Forever"
          onConfirm={() => { onDeleteForever(deleteSong); setDeleteSong(null); }}
          onCancel={() => setDeleteSong(null)}
          T={T}
        />
      )}

      {confirmEmpty && (
        <ConfirmSheet
          title="Empty bin"
          body={`${removedSongs.length} ${removedSongs.length === 1 ? "song" : "songs"} will be permanently deleted from your device. This can't be undone.`}
          confirmLabel="Delete All"
          onConfirm={() => { onEmptyBin(); setConfirmEmpty(false); }}
          onCancel={() => setConfirmEmpty(false)}
          T={T}
        />
      )}
    </div>
  );
}