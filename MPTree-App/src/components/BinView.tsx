import { useState } from "react";
import type { T } from "../themes";
import { t, tn } from "../i18n";
import type { Song, SongMeta } from "../types";
import type { Deleted } from "../sync/engine";
import { AlbumArt } from "./AlbumArt";
import { IC } from "./Icons";
import { ConfirmSheet } from "./ConfirmSheet";
import { ModeNote } from "./ModeSwitch";

// ─── BIN VIEW ────────────────────────────────────────────────────────────────
// The bin of the library that is showing. Signed in to an MPTree account it
// has a second tab: songs deleted for good on this device, which the other
// devices still have and can send back.

type BinViewProps = {
  removedSongs: Song[];
  meta: Record<string, SongMeta>;
  onRestore: (s: Song) => void;
  /** Permanently delete a single song: removes the file from the device too. */
  onDeleteForever: (s: Song) => void;
  /** Permanently delete every song currently in the bin. */
  onEmptyBin: () => void;
  /** What else deleting these for good does, with an MPTree account. */
  deleteNote?: (songs: Song[]) => string | null;
  /** Signed in: songs deleted for good on this device. */
  deleted?: Deleted[];
  onRestoreDeleted?: (fps: string[]) => void;
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

export function BinView({ removedSongs, meta, onRestore, onDeleteForever, onEmptyBin, deleteNote, deleted, onRestoreDeleted, onPlaySong, onTogglePlay, currentSongId, isPlaying, onClose, T }: BinViewProps) {
  const dispName   = (s: Song) => meta[s.id]?.customName   || s.title;
  const dispArtist = (s: Song) => meta[s.id]?.customArtist || (s.artist && s.artist.toLowerCase() !== "<unknown>" ? s.artist : "");

  // Song pending single-item delete confirmation, or `true` for "empty bin" confirmation.
  const [deleteSong,    setDeleteSong]    = useState<Song | null>(null);
  const [confirmEmpty,  setConfirmEmpty]  = useState(false);
  const [tab, setTab] = useState<"bin" | "deleted">("bin");
  const showDeleted = !!deleted && tab === "deleted";

  const withNote = (body: string, songs: Song[]) => {
    const note = deleteNote?.(songs);
    return note ? `${body}\n\n${note}` : body;
  };

  const tabBtn = (id: "bin" | "deleted", label: string, n: number) => (
    <button
      role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
      style={{
        flex: 1, padding: "8px 6px", borderRadius: 9, border: "none", cursor: "pointer",
        fontSize: 13, fontWeight: 700, fontFamily: "inherit",
        background: tab === id ? T.accent : "transparent", color: tab === id ? T.playBtnFg : T.muted,
      }}>
      {label}{n > 0 ? ` · ${n}` : ""}
    </button>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: T.bg, zIndex: 410, display: "flex", flexDirection: "column" }}>
      {/* The app draws edge to edge, so a full-screen page has to step over the
          status bar itself. Without this the close button sat under the clock. */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(env(safe-area-inset-top, 0px) + 14px) 16px 12px", borderBottom: deleted ? "none" : `1px solid ${T.border}` }}>
        <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: T.muted, padding: 4 }}>
          <IC.Close />
        </button>
        <span style={{ fontSize: 17, fontWeight: "700", color: T.text }}>{t("Removed Songs")}</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          {!showDeleted && <span style={{ fontSize: 13, color: T.muted }}>{tn(removedSongs.length, "{n} song", "{n} songs")}</span>}
          {!showDeleted && removedSongs.length > 0 && (
            <button
              onClick={() => setConfirmEmpty(true)}
              style={{ padding: "6px 11px", background: "transparent", border: "1px solid #e8445a55", borderRadius: 8, color: "#e8445a", fontSize: 12, fontWeight: "700", cursor: "pointer", whiteSpace: "nowrap" }}
            >
              {t("Empty Bin")}
            </button>
          )}
        </div>
      </div>

      {deleted && (
        <div style={{ padding: "0 16px 12px", borderBottom: `1px solid ${T.border}` }}>
          <ModeNote T={T} style={{ marginBottom: 10 }} />
          <div role="tablist" style={{ display: "flex", gap: 2, background: T.surface, borderRadius: 12, padding: 3, border: `1px solid ${T.border}` }}>
            {tabBtn("bin", t("In the bin"), removedSongs.length)}
            {tabBtn("deleted", t("Deleted for good here"), deleted.length)}
          </div>
        </div>
      )}

      {showDeleted ? (
        <DeletedList deleted={deleted!} onRestore={fps => onRestoreDeleted?.(fps)} T={T} />
      ) : removedSongs.length === 0 ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: T.muted, gap: 12 }}>
          <IC.Bin />
          <div style={{ fontSize: 15, fontWeight: "600" }}>{t("Bin is empty")}</div>
          <div style={{ fontSize: 13 }}>{t("Removed songs appear here")}</div>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          <div style={{ padding: "10px 16px 6px", fontSize: 12, color: T.muted }}>
            {t("These songs won't be re-added when you scan. Tap Restore to bring them back, or use the trash icon to delete a song permanently.")}
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
                  <AlbumArt title={dispName(song)} size={44} active={isCurrent} customPhoto={meta[song.id]?.customPhoto} songPath={song.uri} albumId={song.albumId} T={T} />
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
                    {dispArtist(song) || t("Unknown Artist")}
                  </div>
                </div>
              </div>
              <button
                onClick={() => onRestore(song)}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", background: T.dim, border: "none", borderRadius: 8, color: T.text, fontSize: 13, fontWeight: "600", cursor: "pointer", flexShrink: 0 }}
              >
                <IC.Restore /> {t("Restore")}
              </button>
              <button
                onClick={() => setDeleteSong(song)}
                title={t("Delete permanently")}
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
          title={t("Delete permanently")}
          body={withNote(t("\"{name}\" will be permanently deleted from your device. This can't be undone.", { name: dispName(deleteSong) }), [deleteSong])}
          confirmLabel={t("Delete Forever")}
          onConfirm={() => { onDeleteForever(deleteSong); setDeleteSong(null); }}
          onCancel={() => setDeleteSong(null)}
          T={T}
        />
      )}

      {confirmEmpty && (
        <ConfirmSheet
          title={t("Empty bin")}
          body={withNote(tn(removedSongs.length, "{n} song will be permanently deleted from your device. This can't be undone.", "{n} songs will be permanently deleted from your device. This can't be undone."), removedSongs)}
          confirmLabel={t("Delete All")}
          onConfirm={() => { onEmptyBin(); setConfirmEmpty(false); }}
          onCancel={() => setConfirmEmpty(false)}
          T={T}
        />
      )}
    </div>
  );
}

/** Songs deleted for good on this device. The ones another device still has
 *  can come back; the rest are gone from every device and shown greyed out. */
function DeletedList({ deleted, onRestore, T }: { deleted: Deleted[]; onRestore: (fps: string[]) => void; T: T }) {
  const back = deleted.filter(d => d.canRestore && !d.restoring);
  if (!deleted.length) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: T.muted, gap: 10, padding: "0 32px", textAlign: "center" }}>
        <IC.Bin />
        <div style={{ fontSize: 15, fontWeight: 600 }}>{t("Nothing deleted for good here")}</div>
        <div style={{ fontSize: 13, lineHeight: 1.5 }}>{t("A song you delete for good stays on your other devices. It shows up here, and you can get it back from them.")}</div>
      </div>
    );
  }
  return (
    <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <div style={{ padding: "10px 16px 6px", fontSize: 12, color: T.muted, lineHeight: 1.5, display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{ flex: 1 }}>{t("Your other devices still have these. Getting one back puts it back everywhere it was, on every device.")}</span>
        {back.length > 1 && (
          <button onClick={() => onRestore(back.map(d => d.fp))}
            style={{ flexShrink: 0, padding: "6px 11px", background: T.dim, border: "none", borderRadius: 8, color: T.text, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            {t("Get all back")}
          </button>
        )}
      </div>
      {deleted.map(d => (
        <div key={d.fp} style={{ display: "flex", alignItems: "center", padding: "10px 16px", gap: 10, borderBottom: `1px solid ${T.border}`, opacity: d.canRestore ? 1 : 0.45 }}>
          <div style={{ width: 44, height: 44, borderRadius: 8, background: T.dim, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.title}</div>
            <div style={{ fontSize: 13, color: T.muted, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {d.restoring ? t("Coming back…") : d.canRestore ? (d.artist || t("Unknown Artist")) : t("No device has it any more")}
            </div>
          </div>
          {d.canRestore && !d.restoring && (
            <button onClick={() => onRestore([d.fp])}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", background: T.dim, border: "none", borderRadius: 8, color: T.text, fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0, fontFamily: "inherit" }}>
              <IC.Restore /> {t("Get back")}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
