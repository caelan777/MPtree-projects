import { useState } from "react";
import { makeSH, type T } from "../themes";
import type { Song, Playlist } from "../types";
import { AlbumArt } from "./AlbumArt";
import { IC } from "./Icons";

// ─── SONG MENU SHEET ─────────────────────────────────────────────────────────
// The per-song action menu, opened from the "⋮" button on a row. Replaces the
// old long-press-to-expand-the-row menu, which was undiscoverable and fought
// with scrolling. Long-press now starts multi-select instead, the way most
// music apps behave.
//
// Two panes live in here: the action list, and the "add to playlist" picker.
// Keeping the picker inline avoids a second stacked overlay for what is really
// one continuous choice.

type SongMenuSheetProps = {
  song: Song;
  dispName: string;
  dispArtist: string;
  customPhoto?: string;
  isLiked: boolean;
  playlists: Playlist[];
  onPlay: () => void;
  onPlayNext: () => void;
  onAddToPlaylist: (playlistId: string) => void;
  onCreatePlaylistWithSong: (name: string) => void;
  onEdit: () => void;
  /** Opens the same edit sheet aimed at the cover photo. */
  onChangePhoto: () => void;
  /** Makes this track the device ringtone. */
  onSetRingtone: () => void;
  /** Paste, look up, or clear this song's lyrics. */
  onEditLyrics: () => void;
  onCut: () => void;
  onToggleLike: () => void;
  onShare: () => void;
  /** Sends the song to the bin. */
  onRemove: () => void;
  /** Only supplied when the menu was opened from inside a real playlist:
   *  pulls the song out of that playlist without touching the library. */
  onRemoveFromPlaylist?: () => void;
  onClose: () => void;
  T: T;
};

export function SongMenuSheet({
  song, dispName, dispArtist, customPhoto, isLiked, playlists,
  onPlay, onPlayNext, onAddToPlaylist, onCreatePlaylistWithSong,
  onEdit, onChangePhoto, onSetRingtone, onEditLyrics, onCut, onToggleLike, onShare, onRemove, onRemoveFromPlaylist, onClose, T,
}: SongMenuSheetProps) {
  const sh = makeSH(T);
  const [pane, setPane] = useState<"actions" | "playlists">("actions");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const row = (
    key: string,
    icon: React.ReactNode,
    label: string,
    onClick: () => void,
    opts: { danger?: boolean; trailing?: React.ReactNode } = {},
  ) => (
    <button
      key={key}
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        width: "100%", background: "transparent", border: "none",
        padding: "14px 20px", cursor: "pointer", fontFamily: "inherit",
        color: opts.danger ? T.heart : T.text, fontSize: 15, textAlign: "left",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ display: "flex", width: 20, justifyContent: "center", flexShrink: 0 }}>{icon}</span>
        {label}
      </span>
      {opts.trailing}
    </button>
  );

  return (
    <div style={sh.overlay} onClick={onClose}>
      <div
        style={{ ...sh.sheet, paddingBottom: 24, maxHeight: "80vh", display: "flex", flexDirection: "column" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={sh.handle} />

        {/* Song header — identifies what the actions apply to. */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 20px 14px", flexShrink: 0 }}>
          <AlbumArt title={dispName} size={44} active={false} customPhoto={customPhoto} songPath={song.uri} albumId={song.albumId} T={T} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: "700", color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {dispName}
            </div>
            <div style={{ fontSize: 13, color: T.textSub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {dispArtist || "Unknown Artist"}
            </div>
          </div>
          <button onClick={onClose} style={sh.xBtn}><IC.Close /></button>
        </div>

        <div style={{ height: 1, background: T.border, flexShrink: 0 }} />

        {pane === "actions" ? (
          <div style={{ overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
            {/* ── The three that change the song itself ──────────────────────
                Ringtone, Photo and Edit sit up here as full targets rather than
                in the list below, because they are the ones people come to this
                menu to do. The rest of the list is one-tap verbs; these three
                open something. */}
            <div style={{ display: "flex", gap: 8, padding: "12px 20px 6px" }}>
              <BigAction icon={<IC.Bell />}  label="Set as ringtone" onClick={onSetRingtone} T={T} />
              <BigAction icon={<IC.Photo />} label="Photo"    onClick={onChangePhoto} T={T} />
              <BigAction icon={<IC.Edit />}  label="Edit"     onClick={onEdit}        T={T} />
            </div>
            <div style={{ height: 1, background: T.border, margin: "8px 20px 2px" }} />
            {row("play", <IC.Play />, "Play", onPlay)}
            {row("next", (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>
              </svg>
            ), "Play next", onPlayNext)}
            {row("add", <IC.Plus />, "Add to playlist", () => setPane("playlists"), { trailing: <IC.ChevronR /> })}
            {row("lyrics", <IC.Lyrics />, "Lyrics", onEditLyrics)}
            {row("cut", <IC.Scissors />, "Cut", onCut)}
            {row("like", <IC.Heart filled={isLiked} size={17} />, isLiked ? "Unlike" : "Like", onToggleLike)}
            {row("share", <IC.Share />, "Share", onShare)}
            <div style={{ height: 1, background: T.border, margin: "6px 20px" }} />
            {onRemoveFromPlaylist && row("unpin", (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                <line x1="3" y1="3" x2="21" y2="21"/>
              </svg>
            ), "Remove from playlist", onRemoveFromPlaylist)}
            {/* Always spelled out the same way, in the playlist and out of it.
                It reads identically wherever you meet it, and it says what it
                actually does rather than leaving "Remove" to be guessed at. */}
            {row("remove", <IC.Trash />, "Remove from library", onRemove, { danger: true })}
          </div>
        ) : (
          <div style={{ overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
            <button
              onClick={() => setPane("actions")}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                background: "transparent", border: "none", padding: "12px 20px",
                cursor: "pointer", color: T.muted, fontSize: 13, fontFamily: "inherit",
                fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
              }}
            >
              <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}><IC.ChevronR /></span>
              Add to playlist
            </button>

            {creating ? (
              <div style={{ padding: "0 20px 8px" }}>
                <input
                  autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="Playlist name" style={sh.inp}
                  onKeyDown={e => {
                    if (e.key === "Enter" && newName.trim()) onCreatePlaylistWithSong(newName.trim());
                    if (e.key === "Escape") { setCreating(false); setNewName(""); }
                  }}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button
                    onClick={() => { setCreating(false); setNewName(""); }}
                    style={{ flex: 1, padding: 12, background: T.dim, color: T.text, border: "none", borderRadius: 12, fontSize: 14, fontWeight: "700", cursor: "pointer", fontFamily: "inherit" }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => { if (newName.trim()) onCreatePlaylistWithSong(newName.trim()); }}
                    disabled={!newName.trim()}
                    style={{ flex: 1, padding: 12, background: T.accent, color: T.playBtnFg, border: "none", borderRadius: 12, fontSize: 14, fontWeight: "700", cursor: newName.trim() ? "pointer" : "default", opacity: newName.trim() ? 1 : 0.5, fontFamily: "inherit" }}
                  >
                    Create
                  </button>
                </div>
              </div>
            ) : (
              row("new", <IC.Plus />, "New playlist", () => setCreating(true))
            )}

            {playlists.length === 0 && !creating && (
              <div style={{ padding: "18px 20px 24px", color: T.muted, fontSize: 13, lineHeight: 1.6 }}>
                No playlists yet. Create one to add this song to it.
              </div>
            )}

            {playlists.map(pl => {
              const already = pl.songIds.includes(song.id);
              return row(
                pl.id,
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                </svg>,
                pl.name,
                () => { if (!already) onAddToPlaylist(pl.id); },
                {
                  trailing: already
                    ? <span style={{ display: "flex", alignItems: "center", gap: 6, color: T.muted, fontSize: 12 }}>{IC.Check(T.muted)} Added</span>
                    : <span style={{ color: T.muted, fontSize: 12 }}>{pl.songIds.length}</span>,
                },
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** One of the three large targets at the top of the menu. Equal widths, so the
 *  row reads as a set of three rather than three things that happen to be next
 *  to each other. */
function BigAction({ icon, label, onClick, T }: {
  icon: React.ReactNode; label: string; onClick: () => void; T: T;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, minWidth: 0,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
        padding: "14px 6px",
        background: T.chipBg, border: "1px solid " + T.chipBorder, borderRadius: 12,
        color: T.text, fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
      }}
    >
      {icon}
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{label}</span>
    </button>
  );
}
