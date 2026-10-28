import { useState } from "react";
import { makeSH, type T } from "../themes";
import { t } from "../i18n";
import type { Song, Playlist } from "../types";
import { AlbumArt } from "./AlbumArt";
import { IC } from "./Icons";
import { SongActionTiles } from "./MultiSelectBar";
import { floatCard, roundBtn } from "./cardStyles";

// ─── SONG MENU SHEET ─────────────────────────────────────────────────────────
// The per-song action menu, opened from the "⋮" button on a row. It is the
// selection's actions card: the same floating card, the same tiles four to a
// row, the same round close button. Picking one song and opening its menu
// therefore look like one thing, which they are.
//
// Two panes live in here: the tiles, and the "add to playlist" picker.
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
  /** The playlist the menu was opened in, said under the artist. */
  inPlaylistName?: string;
  onClose: () => void;
  T: T;
};

export function SongMenuSheet({
  song, dispName, dispArtist, customPhoto, isLiked, playlists,
  onPlay, onPlayNext, onAddToPlaylist, onCreatePlaylistWithSong,
  onEdit, onChangePhoto, onSetRingtone, onEditLyrics, onCut, onToggleLike, onShare, onRemove, onRemoveFromPlaylist,
  inPlaylistName, onClose, T,
}: SongMenuSheetProps) {
  const sh = makeSH(T);
  const [pane, setPane] = useState<"actions" | "playlists">("actions");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const sub = [dispArtist, inPlaylistName && t("in {name}", { name: inPlaylistName })].filter(Boolean).join(" · ");

  const row = (
    key: string,
    icon: React.ReactNode,
    label: string,
    onClick: () => void,
    trailing?: React.ReactNode,
  ) => (
    <button
      key={key}
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        width: "100%", background: "transparent", border: "none",
        padding: "13px 8px", cursor: "pointer", fontFamily: "inherit",
        color: T.text, fontSize: 15, textAlign: "left",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
        <span style={{ display: "flex", width: 20, justifyContent: "center", flexShrink: 0 }}>{icon}</span>
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      </span>
      {trailing}
    </button>
  );

  return (
    <div style={{ ...sh.overlay, padding: "0 12px calc(env(safe-area-inset-bottom, 0px) + 12px)", boxSizing: "border-box" }} onClick={onClose}>
      <div
        style={{ ...floatCard(T), width: "100%", maxHeight: "82vh", display: "flex", flexDirection: "column", padding: 12, animation: "mpCardUp 0.3s cubic-bezier(0.22, 1, 0.36, 1) both" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Song header: what the tiles apply to. */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "2px 2px 12px 4px", flexShrink: 0 }}>
          <AlbumArt title={dispName} size={44} active={false} customPhoto={customPhoto} songPath={song.uri} albumId={song.albumId} T={T} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: "700", color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {dispName}
            </div>
            {sub && (
              <div style={{ fontSize: 13, color: T.textSub, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {sub}
              </div>
            )}
          </div>
          <button onClick={onClose} aria-label={t("Close")} style={roundBtn(T)}><IC.Close /></button>
        </div>

        <div style={{ height: 1, background: T.border, margin: "0 -12px 12px", flexShrink: 0 }} />

        {pane === "actions" ? (
          <SongActionTiles T={T} a={{
            isLiked, onPlay, onPlayNext, onToggleLike, onShare, onEditLyrics, onCut, onSetRingtone,
            onChangePhoto, onEdit, onRemoveFromPlaylist, onBin: onRemove,
            onAddToPlaylist: () => setPane("playlists"),
          }} />
        ) : (
          <div style={{ overflowY: "auto", WebkitOverflowScrolling: "touch", margin: "-4px -4px 0" }}>
            <button
              onClick={() => setPane("actions")}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                background: "transparent", border: "none", padding: "4px 8px 10px",
                cursor: "pointer", color: T.muted, fontSize: 13, fontFamily: "inherit",
                fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
              }}
            >
              <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}><IC.ChevronR /></span>
              {t("Add to playlist")}
            </button>

            {creating ? (
              <div style={{ padding: "0 4px 8px" }}>
                <input
                  autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder={t("Playlist name")} style={sh.inp}
                  onKeyDown={e => {
                    if (e.key === "Enter" && newName.trim()) onCreatePlaylistWithSong(newName.trim());
                    if (e.key === "Escape") { setCreating(false); setNewName(""); }
                  }}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button
                    onClick={() => { setCreating(false); setNewName(""); }}
                    style={{ flex: 1, minWidth: 0, padding: 12, background: T.dim, color: T.text, border: "none", borderRadius: 14, fontSize: 14, fontWeight: "700", cursor: "pointer", fontFamily: "inherit" }}
                  >
                    {t("Cancel")}
                  </button>
                  <button
                    onClick={() => { if (newName.trim()) onCreatePlaylistWithSong(newName.trim()); }}
                    disabled={!newName.trim()}
                    style={{ flex: 1, minWidth: 0, padding: 12, background: T.accent, color: T.playBtnFg, border: "none", borderRadius: 14, fontSize: 14, fontWeight: "700", cursor: newName.trim() ? "pointer" : "default", opacity: newName.trim() ? 1 : 0.5, fontFamily: "inherit" }}
                  >
                    {t("Create")}
                  </button>
                </div>
              </div>
            ) : (
              row("new", <IC.Plus />, t("New playlist"), () => setCreating(true))
            )}

            {playlists.length === 0 && !creating && (
              <div style={{ padding: "12px 8px 16px", color: T.muted, fontSize: 13, lineHeight: 1.6 }}>
                {t("No playlists yet. Create one to add this song to it.")}
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
                already
                  ? <span style={{ display: "flex", alignItems: "center", gap: 6, color: T.muted, fontSize: 12, flexShrink: 0 }}>{IC.Check(T.muted)} {t("Added")}</span>
                  : <span style={{ color: T.muted, fontSize: 12, flexShrink: 0 }}>{pl.songIds.length}</span>,
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
