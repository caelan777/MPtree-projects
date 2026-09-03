import { useState } from "react";
import { makeSH, type T } from "../themes";
import type { Playlist } from "../types";
import { IC } from "./Icons";

// ─── ADD TO PLAYLIST SHEET ───────────────────────────────────────────────────
// Standalone playlist picker, used when the songs being added are NOT a single
// row — multi-select on the Songs page. The one-song case lives inline in
// SongMenuSheet, because there it is one continuous choice inside a menu that
// is already open; here there is no menu to nest inside.

type AddToPlaylistSheetProps = {
  /** How many songs are being added — shown in the title. */
  count: number;
  playlists: Playlist[];
  onAddToPlaylist: (playlistId: string) => void;
  onCreatePlaylist: (name: string) => void;
  onClose: () => void;
  T: T;
};

export function AddToPlaylistSheet({
  count, playlists, onAddToPlaylist, onCreatePlaylist, onClose, T,
}: AddToPlaylistSheetProps) {
  const sh = makeSH(T);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  return (
    <div style={{ ...sh.overlay, zIndex: 420 }} onClick={onClose}>
      <div
        style={{ ...sh.sheet, paddingBottom: 24, maxHeight: "80vh", display: "flex", flexDirection: "column" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={sh.handle} />

        <div style={{ ...sh.hdr, flexShrink: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: T.text }}>
            Add {count} {count === 1 ? "song" : "songs"} to…
          </span>
          <button onClick={onClose} style={sh.xBtn}><IC.Close /></button>
        </div>

        <div style={{ height: 1, background: T.border, flexShrink: 0 }} />

        <div style={{ overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          {creating ? (
            <div style={{ padding: "14px 20px 8px" }}>
              <input
                autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="Playlist name" style={sh.inp}
                onKeyDown={e => {
                  if (e.key === "Enter" && newName.trim()) onCreatePlaylist(newName.trim());
                  if (e.key === "Escape") { setCreating(false); setNewName(""); }
                }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button
                  onClick={() => { setCreating(false); setNewName(""); }}
                  style={{ flex: 1, padding: 12, background: T.dim, color: T.text, border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => { if (newName.trim()) onCreatePlaylist(newName.trim()); }}
                  disabled={!newName.trim()}
                  style={{ flex: 1, padding: 12, background: T.accent, color: T.playBtnFg, border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: newName.trim() ? "pointer" : "default", opacity: newName.trim() ? 1 : 0.5, fontFamily: "inherit" }}
                >
                  Create
                </button>
              </div>
            </div>
          ) : (
            <Row icon={<IC.Plus />} label="New playlist" onClick={() => setCreating(true)} T={T} />
          )}

          {playlists.length === 0 && !creating && (
            <div style={{ padding: "18px 20px 24px", color: T.muted, fontSize: 13, lineHeight: 1.6 }}>
              No playlists yet. Create one to add these songs to it.
            </div>
          )}

          {playlists.map(pl => (
            <Row
              key={pl.id}
              icon={
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                </svg>
              }
              label={pl.name}
              trailing={<span style={{ color: T.muted, fontSize: 12 }}>{pl.songIds.length}</span>}
              onClick={() => onAddToPlaylist(pl.id)}
              T={T}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({ icon, label, trailing, onClick, T }: {
  icon: React.ReactNode; label: string; trailing?: React.ReactNode; onClick: () => void; T: T;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        width: "100%", background: "transparent", border: "none",
        padding: "14px 20px", cursor: "pointer", fontFamily: "inherit",
        color: T.text, fontSize: 15, textAlign: "left",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ display: "flex", width: 20, justifyContent: "center", flexShrink: 0 }}>{icon}</span>
        {label}
      </span>
      {trailing}
    </button>
  );
}
