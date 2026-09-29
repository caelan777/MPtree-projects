import React, { useState } from "react";
import type { T } from "../themes";
import { t, tn } from "../i18n";
import { Switch } from "./Switch";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BackupSheetState =
  | { kind: "closed" }
  | { kind: "exportInfo" }
  | { kind: "exportProgress"; done: number; total: number; cancelled: boolean }
  | { kind: "exportSuccess"; folderName: string; jsonUri?: string; failedCount?: number }
  | { kind: "sharing" }
  | { kind: "exportError"; message: string; copiedCount: number }
  | { kind: "importInfo" }
  | { kind: "importProgress"; phase: string }
  | { kind: "importSuccess"; playlistCount: number; songCount: number }
  | { kind: "importError"; message: string };

type BackupSheetProps = {
  state: BackupSheetState;
  onStartBackup: (name: string, options: BackupOptions) => void;
  /** The library and the bin, for the song picker and the size estimate. */
  songs: PickSong[];
  binSongs: PickSong[];
  onCancelBackup: () => void;
  onShare: () => void;
  onDone: () => void;
  onOpenImportPicker: () => void;
  onClose: () => void;
  defaultBackupName: string;
  T: T;
};

// ─── Icons ────────────────────────────────────────────────────────────────────

const BackupIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

const ShareIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
  </svg>
);

const CheckCircleIcon = () => (
  <svg width="44" height="44" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="9 12 11 14 15 10"/>
  </svg>
);

const FolderIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>
);

const InfoCircleIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);

const RestoreIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10"/>
    <path d="M3.51 15a9 9 0 1 0 .49-4.95"/>
  </svg>
);

// ─── Overlay wrapper ──────────────────────────────────────────────────────────

function SheetOverlay({
  children,
  onClose,
  T,
}: {
  children: React.ReactNode;
  onClose?: () => void;
  T: T;
}) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
        zIndex: 300, display: "flex", alignItems: "flex-end",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%", background: T.card,
          borderRadius: "20px 20px 0 0",
          padding: "8px 20px 44px",
          maxHeight: "90vh", overflowY: "auto",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ width: 36, height: 4, background: T.border, borderRadius: 2, margin: "8px auto 16px" }} />
        {children}
      </div>
    </div>
  );
}

// ─── Export Info Sheet ────────────────────────────────────────────────────────
// What goes into the backup. "Everything" is on unless the person turns it
// off; then each part can be picked, and the songs one by one.

/** A song as the backup picker shows it. */
export type PickSong = { id: string; title: string; artist: string; duration?: number };

export type BackupOptions = {
  songs: "all" | "some" | "none";
  /** The picked songs, when songs is "some". */
  songIds: string[];
  /** The songs in the bin, audio and all. */
  bin: boolean;
  playlists: boolean;
  covers: boolean;
  /** Names, lyrics, likes, play counts, cut tracks. */
  details: boolean;
  settings: boolean;
};

const EVERYTHING: BackupOptions = {
  songs: "all", songIds: [], bin: true, playlists: true, covers: true, details: true, settings: true,
};

// About 256 kbps, the same guess the old sheet made; 4 MB for a song of no
// known length.
const mbOf = (list: PickSong[]) =>
  Math.max(0, Math.round(list.reduce((b, s) => b + (s.duration ? s.duration / 1000 * 32_000 : 4 * 1024 * 1024), 0) / 1048576));

function Check({ on, T }: { on: boolean; T: T }) {
  return (
    <span style={{
      width: 22, height: 22, borderRadius: 6, flexShrink: 0, display: "grid", placeItems: "center",
      // Violet is the selection colour, and this is a selection.
      background: on ? T.violet : "transparent", border: `2px solid ${on ? T.violet : T.muted}`,
    }}>
      {on && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
    </span>
  );
}

function OptionRow({ label, sub, on, onToggle, T }: { label: string; sub?: string; on: boolean; onToggle: () => void; T: T }) {
  return (
    <button onClick={onToggle} style={{
      display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
      background: "transparent", border: "none", borderTop: `1px solid ${T.border}`,
      padding: "12px 2px", cursor: "pointer", fontFamily: "inherit",
    }}>
      <Check on={on} T={T} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 15, color: T.text }}>{label}</span>
        {sub && <span style={{ display: "block", fontSize: 12, color: T.muted, marginTop: 2, lineHeight: 1.4 }}>{sub}</span>}
      </span>
    </button>
  );
}

function SongPicker({ songs, picked, onChange, onBack, T }: {
  songs: PickSong[]; picked: Set<string>; onChange: (next: Set<string>) => void; onBack: () => void; T: T;
}) {
  const all = picked.size === songs.length && songs.length > 0;
  return (
    <SheetOverlay T={T}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <button onClick={onBack} aria-label={t("Back")} style={{ background: "transparent", border: "none", color: T.text, cursor: "pointer", padding: 4, display: "flex" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.text, flex: 1 }}>{t("Choose songs")}</div>
        <span style={{ fontSize: 13, color: T.muted }}>{t("{n} of {total}", { n: picked.size, total: songs.length })}</span>
      </div>
      <OptionRow T={T} label={t("All songs")} on={all}
        onToggle={() => onChange(all ? new Set() : new Set(songs.map(s => s.id)))} />
      {songs.map(s => (
        <OptionRow key={s.id} T={T} label={s.title} sub={s.artist || undefined} on={picked.has(s.id)}
          onToggle={() => { const next = new Set(picked); if (next.has(s.id)) next.delete(s.id); else next.add(s.id); onChange(next); }} />
      ))}
      <button onClick={onBack} style={{
        position: "sticky", bottom: 0, display: "block", width: "100%", marginTop: 14,
        background: T.accent, color: T.playBtnFg, border: "none", borderRadius: 14, padding: "15px",
        fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
      }}>
        {t("Done")}
      </button>
    </SheetOverlay>
  );
}

function ExportInfoSheet({
  songs, binSongs, defaultName, onStart, onClose, T,
}: {
  songs: PickSong[];
  binSongs: PickSong[];
  defaultName: string;
  onStart: (name: string, options: BackupOptions) => void;
  onClose: () => void;
  T: T;
}) {
  const [name, setName] = useState(defaultName);
  const [everything, setEverything] = useState(true);
  const [opts, setOpts] = useState<BackupOptions>(EVERYTHING);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(songs.map(s => s.id)));
  const [picking, setPicking] = useState(false);

  const o = everything ? EVERYTHING : opts;
  const set = (patch: Partial<BackupOptions>) => setOpts(prev => ({ ...prev, ...patch }));
  const chosen = o.songs === "all" ? songs : o.songs === "some" ? songs.filter(s => picked.has(s.id)) : [];
  const files = chosen.length + (o.bin ? binSongs.length : 0);
  const mb = mbOf(chosen) + (o.bin ? mbOf(binSongs) : 0);
  const anything = files > 0 || o.playlists || o.covers || o.details || o.settings;

  if (picking) {
    return <SongPicker songs={songs} picked={picked} onChange={setPicked} onBack={() => setPicking(false)} T={T} />;
  }

  const seg = (id: BackupOptions["songs"], label: string) => (
    <button key={id} onClick={() => set({ songs: id })} style={{
      flex: 1, padding: "9px 0", borderRadius: 9, border: "none", cursor: "pointer",
      fontFamily: "inherit", fontWeight: 700, fontSize: 13.5,
      background: o.songs === id ? T.accent : "transparent", color: o.songs === id ? T.playBtnFg : T.muted,
    }}>{label}</button>
  );

  return (
    <SheetOverlay onClose={onClose} T={T}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <div style={{ color: T.text }}><BackupIcon /></div>
        <div style={{ fontSize: 18, fontWeight: "700", color: T.text }}>{t("Create backup")}</div>
      </div>

      <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.6, marginBottom: 14 }}>
        {t("Saved to your Downloads folder. You can share it, or use it to restore on a new phone.")}
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: "600", color: T.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {t("Backup name")}
        </div>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="MPTree_Backup_..."
          style={{
            width: "100%", background: T.dim, border: `1px solid ${T.border}`,
            borderRadius: 12, padding: "13px 14px", color: T.text,
            fontSize: 15, fontFamily: "inherit", outline: "none",
            boxSizing: "border-box",
          }}
          autoCapitalize="none"
          autoCorrect="off"
        />
      </div>

      <button onClick={() => setEverything(v => !v)} style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
        background: T.dim, border: "none", borderRadius: 12, padding: "13px 14px",
        cursor: "pointer", fontFamily: "inherit", marginBottom: everything ? 14 : 6,
      }}>
        <span style={{ flex: 1 }}>
          <span style={{ display: "block", fontSize: 15, fontWeight: 700, color: T.text }}>{t("Save everything")}</span>
          <span style={{ display: "block", fontSize: 12, color: T.muted, marginTop: 2, lineHeight: 1.4 }}>
            {everything ? t("All songs, the bin, playlists, covers and settings.") : t("Pick what goes in below.")}
          </span>
        </span>
        <Switch on={everything} T={T} />
      </button>

      {!everything && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, margin: "10px 0 6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {t("Songs")}
          </div>
          <div role="radiogroup" style={{ display: "flex", gap: 4, background: T.dim, borderRadius: 12, padding: 3 }}>
            {seg("all", t("All"))}{seg("some", t("Choose"))}{seg("none", t("None"))}
          </div>
          {o.songs === "some" && (
            <button onClick={() => setPicking(true)} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
              background: "transparent", border: `1px solid ${T.border}`, borderRadius: 12,
              padding: "12px 14px", marginTop: 8, cursor: "pointer", fontFamily: "inherit", color: T.text, fontSize: 14.5,
            }}>
              <span>{t("Choose songs")}</span>
              <span style={{ color: T.muted, fontSize: 13 }}>{t("{n} of {total}", { n: picked.size, total: songs.length })} ›</span>
            </button>
          )}
          <div style={{ marginTop: 10 }}>
            <OptionRow T={T} label={t("Songs in the bin")} sub={tn(binSongs.length, "{n} song", "{n} songs")} on={o.bin} onToggle={() => set({ bin: !o.bin })} />
            <OptionRow T={T} label={t("Playlists")} on={o.playlists} onToggle={() => set({ playlists: !o.playlists })} />
            <OptionRow T={T} label={t("Album covers")} sub={t("Covers you set on songs and playlists.")} on={o.covers} onToggle={() => set({ covers: !o.covers })} />
            <OptionRow T={T} label={t("Likes and song details")} sub={t("Likes, lyrics, play counts, names you changed, cut tracks.")} on={o.details} onToggle={() => set({ details: !o.details })} />
            <OptionRow T={T} label={t("Settings")} sub={t("Theme, size, language, audio effects and your look.")} on={o.settings} onToggle={() => set({ settings: !o.settings })} />
          </div>
        </div>
      )}

      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 14px", background: T.dim, borderRadius: 10, marginBottom: 20,
      }}>
        <span style={{ fontSize: 14, color: T.text, fontWeight: "600" }}>
          {tn(files, "{n} audio file", "{n} audio files")}
        </span>
        <span style={{ color: T.border }}>·</span>
        <span style={{ fontSize: 14, color: T.muted }}>~{mb} MB</span>
      </div>

      <button
        disabled={!anything}
        onClick={() => onStart(name.trim() || defaultName, { ...o, songIds: o.songs === "some" ? [...picked] : [] })}
        style={{
          display: "block", width: "100%", background: T.accent, color: T.playBtnFg,
          border: "none", borderRadius: 14, padding: "16px", fontSize: 16,
          fontWeight: "700", cursor: anything ? "pointer" : "default", fontFamily: "inherit",
          opacity: anything ? 1 : 0.5,
        }}
      >
        {t("Start backup")}
      </button>
      <button
        onClick={onClose}
        style={{
          display: "block", width: "100%", background: "transparent",
          color: T.muted, border: "none", borderRadius: 14, padding: "12px",
          fontSize: 14, cursor: "pointer", marginTop: 6, fontFamily: "inherit",
        }}
      >
        {t("Cancel")}
      </button>
    </SheetOverlay>
  );
}

// ─── Export Progress Sheet ────────────────────────────────────────────────────

function ExportProgressSheet({
  done, total, onCancel, T,
}: {
  done: number;
  total: number;
  onCancel: () => void;
  T: T;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <SheetOverlay T={T}>
      <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
        <div style={{ fontSize: 17, fontWeight: "700", color: T.text, marginBottom: 6 }}>
          {t("Creating backup…")}
        </div>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 24 }}>
          {t("Copying your music library")}
        </div>

        {/* Progress bar */}
        <div style={{
          height: 8, background: T.dim, borderRadius: 4,
          marginBottom: 12, overflow: "hidden",
        }}>
          <div style={{
            height: "100%", borderRadius: 4, background: T.accent,
            width: `${pct}%`, transition: "width 0.3s ease",
          }} />
        </div>

        <div style={{ fontSize: 13, color: T.muted, marginBottom: 32 }}>
          {done} / {total} files · {pct}%
        </div>

        <button
          onClick={onCancel}
          style={{
            background: T.dim, color: T.muted, border: `1px solid ${T.border}`,
            borderRadius: 12, padding: "10px 24px", fontSize: 14,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          {t("Cancel")}
        </button>
      </div>
    </SheetOverlay>
  );
}

// ─── Export Success Sheet ─────────────────────────────────────────────────────

function ExportSuccessSheet({
  folderName, failedCount, onShare, onDone, T,
}: {
  folderName: string;
  failedCount?: number;
  onShare: () => void;
  onDone: () => void;
  T: T;
}) {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <SheetOverlay T={T}>
      <div style={{ textAlign: "center", padding: "12px 0 4px" }}>
        <div style={{ color: T.text, marginBottom: 10 }}><CheckCircleIcon /></div>
        <div style={{ fontSize: 18, fontWeight: "700", color: T.text, marginBottom: 6 }}>
          {t("Backup saved!")}
        </div>

        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "8px 14px", background: T.dim, borderRadius: 10,
          marginBottom: failedCount ? 12 : 24,
        }}>
          <span style={{ color: T.muted }}><FolderIcon /></span>
          <span style={{ fontSize: 13, color: T.muted, fontFamily: "monospace" }}>
            Downloads/{folderName}/
          </span>
        </div>

        {!!failedCount && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            background: T.dim, border: `1px solid ${T.border}`,
            borderRadius: 10, padding: "10px 14px", marginBottom: 24,
            textAlign: "left",
          }}>
            <span style={{ color: T.textSub, flexShrink: 0 }}>⚠</span>
            <span style={{ fontSize: 13, color: T.text, flex: 1 }}>
              {failedCount} file{failedCount !== 1 ? "s" : ""} could not be copied
            </span>
            <button
              onClick={() => setShowInfo(v => !v)}
              style={{ background: "transparent", border: "none", color: T.muted, cursor: "pointer", padding: 2 }}
            >
              <InfoCircleIcon />
            </button>
          </div>
        )}

        {showInfo && (
          <div style={{
            background: T.dim, borderRadius: 10, padding: "10px 14px",
            marginBottom: 16, fontSize: 12, color: T.muted, textAlign: "left", lineHeight: 1.6,
          }}>
            {t("Some files could not be copied, possibly because they were deleted or moved. The backup JSON is complete and your playlists and metadata are fully saved.")}
          </div>
        )}

        <button
          onClick={onShare}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            width: "100%", background: T.accent, color: T.playBtnFg,
            border: "none", borderRadius: 14, padding: "15px", fontSize: 15,
            fontWeight: "700", cursor: "pointer", marginBottom: 10, fontFamily: "inherit",
            boxSizing: "border-box",
          }}
        >
          <ShareIcon /> Share backup
        </button>
        <button
          onClick={onDone}
          style={{
            display: "block", width: "100%", background: T.dim,
            color: T.text, border: "none", borderRadius: 14, padding: "14px",
            fontSize: 15, fontWeight: "600", cursor: "pointer", fontFamily: "inherit",
          }}
        >
          {t("Done")}
        </button>
      </div>
    </SheetOverlay>
  );
}

// ─── Export Error Sheet ───────────────────────────────────────────────────────

function ExportErrorSheet({
  message, copiedCount, onClose, T,
}: {
  message: string;
  copiedCount: number;
  onClose: () => void;
  T: T;
}) {
  return (
    <SheetOverlay T={T}>
      <div style={{ textAlign: "center", padding: "12px 0 4px" }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>⚠️</div>
        <div style={{ fontSize: 17, fontWeight: "700", color: T.text, marginBottom: 8 }}>
          {t("Backup failed")}
        </div>
        <div style={{ fontSize: 14, color: T.muted, marginBottom: 16, lineHeight: 1.6 }}>
          {message}
        </div>
        {copiedCount > 0 && (
          <div style={{
            background: T.dim, borderRadius: 10, padding: "10px 14px",
            fontSize: 13, color: T.muted, marginBottom: 20, lineHeight: 1.6,
          }}>
            {copiedCount} file{copiedCount !== 1 ? "s" : ""} were copied before the backup stopped. The playlist data is still saved.
          </div>
        )}
        <button
          onClick={onClose}
          style={{
            display: "block", width: "100%", background: T.dim, color: T.text,
            border: "none", borderRadius: 14, padding: "14px", fontSize: 15,
            fontWeight: "600", cursor: "pointer", fontFamily: "inherit",
          }}
        >
          {t("Close")}
        </button>
      </div>
    </SheetOverlay>
  );
}

// ─── Import Info Sheet ────────────────────────────────────────────────────────

function ImportInfoSheet({
  onProceed, onClose, T,
}: {
  onProceed: () => void;
  onClose: () => void;
  T: T;
}) {
  return (
    <SheetOverlay onClose={onClose} T={T}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <div style={{ color: T.text }}><RestoreIcon /></div>
        <div style={{ fontSize: 18, fontWeight: "700", color: T.text }}>{t("Restore backup")}</div>
      </div>

      <div style={{
        background: T.dim, borderRadius: 12, padding: "12px 14px",
        marginBottom: 16, fontSize: 13, color: T.muted, lineHeight: 1.6,
      }}>
        {t("This will replace your current playlists, likes, and edits with the backup. Your music files won't be deleted.")}
      </div>

      {/* Visual hint showing folder structure */}
      <div style={{
        background: T.dim, border: `1px solid ${T.border}`, borderRadius: 12,
        padding: "12px 14px", marginBottom: 24, fontFamily: "monospace", fontSize: 12,
        color: T.muted, lineHeight: 1.8,
      }}>
        <div style={{ color: T.text, fontWeight: "600", marginBottom: 4 }}>📁 MPTree_Backup_...</div>
        <div style={{ paddingLeft: 16 }}>
          <span style={{ color: T.text }}>📄 mptree_backup_....json</span>
          <span style={{ color: T.muted }}> {t("← select this")}</span>
        </div>
        <div style={{ paddingLeft: 16 }}>📁 music/</div>
        <div style={{ paddingLeft: 32, opacity: 0.7 }}>🎵 song1.mp3</div>
        <div style={{ paddingLeft: 32, opacity: 0.7 }}>🎵 song2.mp3 …</div>
      </div>

      <button
        onClick={onProceed}
        style={{
          display: "block", width: "100%", background: T.accent, color: T.playBtnFg,
          border: "none", borderRadius: 14, padding: "16px", fontSize: 16,
          fontWeight: "700", cursor: "pointer", marginBottom: 10, fontFamily: "inherit",
        }}
      >
        {t("Select backup file")}
      </button>
      <button
        onClick={onClose}
        style={{
          display: "block", width: "100%", background: "transparent",
          color: T.muted, border: "none", borderRadius: 14, padding: "12px",
          fontSize: 14, cursor: "pointer", fontFamily: "inherit",
        }}
      >
        {t("Cancel")}
      </button>
    </SheetOverlay>
  );
}

// ─── Sharing Sheet ────────────────────────────────────────────────────────────

function SharingSheet({ T }: { T: T }) {
  return (
    <SheetOverlay T={T}>
      <div style={{ textAlign: "center", padding: "20px 0 8px" }}>
        <div style={{ marginBottom: 16 }}>
          {/* Spinner */}
          <svg width="44" height="44" viewBox="0 0 44 44" style={{ animation: "spin 1s linear infinite" }}>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            <circle cx="22" cy="22" r="18" fill="none" stroke={T.border} strokeWidth="3"/>
            <path d="M22 4 a18 18 0 0 1 18 18" fill="none" stroke={T.text} strokeWidth="3" strokeLinecap="round"/>
          </svg>
        </div>
        <div style={{ fontSize: 16, fontWeight: "600", color: T.text, marginBottom: 6 }}>
          {t("Preparing backup to share…")}
        </div>
        <div style={{ fontSize: 13, color: T.muted }}>
          {t("Zipping your music and playlists. This can take a moment for large libraries.")}
        </div>
      </div>
    </SheetOverlay>
  );
}

// ─── Import Progress Sheet ────────────────────────────────────────────────────

function ImportProgressSheet({ phase, T }: { phase: string; T: T }) {
  return (
    <SheetOverlay T={T}>
      <div style={{ textAlign: "center", padding: "20px 0 8px" }}>
        <div style={{ marginBottom: 16 }}>
          {/* Spinner */}
          <svg width="44" height="44" viewBox="0 0 44 44" style={{ animation: "spin 1s linear infinite" }}>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            <circle cx="22" cy="22" r="18" fill="none" stroke={T.border} strokeWidth="3"/>
            <path d="M22 4 a18 18 0 0 1 18 18" fill="none" stroke={T.text} strokeWidth="3" strokeLinecap="round"/>
          </svg>
        </div>
        <div style={{ fontSize: 16, fontWeight: "600", color: T.text, marginBottom: 6 }}>
          {t("Restoring your music library…")}
        </div>
        <div style={{ fontSize: 13, color: T.muted }}>{phase}</div>
      </div>
    </SheetOverlay>
  );
}

// ─── Import Success Sheet ─────────────────────────────────────────────────────

function ImportSuccessSheet({
  playlistCount, songCount, onDone, T,
}: {
  playlistCount: number;
  songCount: number;
  onDone: () => void;
  T: T;
}) {
  return (
    <SheetOverlay T={T}>
      <div style={{ textAlign: "center", padding: "12px 0 4px" }}>
        <div style={{ color: T.text, marginBottom: 10 }}><CheckCircleIcon /></div>
        <div style={{ fontSize: 18, fontWeight: "700", color: T.text, marginBottom: 8 }}>
          {t("Backup restored!")}
        </div>
        <div style={{
          display: "flex", justifyContent: "center", gap: 20,
          marginBottom: 28,
        }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: "800", color: T.text }}>{playlistCount}</div>
            <div style={{ fontSize: 12, color: T.muted }}>playlist{playlistCount !== 1 ? "s" : ""}</div>
          </div>
          <div style={{ width: 1, background: T.border }} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: "800", color: T.text }}>{songCount}</div>
            <div style={{ fontSize: 12, color: T.muted }}>song{songCount !== 1 ? "s" : ""}</div>
          </div>
        </div>
        <button
          onClick={onDone}
          style={{
            display: "block", width: "100%", background: T.accent, color: T.playBtnFg,
            border: "none", borderRadius: 14, padding: "15px", fontSize: 15,
            fontWeight: "700", cursor: "pointer", fontFamily: "inherit",
          }}
        >
          {t("Done")}
        </button>
      </div>
    </SheetOverlay>
  );
}

// ─── Import Error Sheet ───────────────────────────────────────────────────────

function ImportErrorSheet({ message, onClose, T }: { message: string; onClose: () => void; T: T }) {
  return (
    <SheetOverlay T={T}>
      <div style={{ textAlign: "center", padding: "12px 0 4px" }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>❌</div>
        <div style={{ fontSize: 17, fontWeight: "700", color: T.text, marginBottom: 8 }}>
          {t("Restore failed")}
        </div>
        <div style={{ fontSize: 14, color: T.muted, marginBottom: 24, lineHeight: 1.6 }}>
          {message}
        </div>
        <button
          onClick={onClose}
          style={{
            display: "block", width: "100%", background: T.dim, color: T.text,
            border: "none", borderRadius: 14, padding: "14px", fontSize: 15,
            fontWeight: "600", cursor: "pointer", fontFamily: "inherit",
          }}
        >
          {t("Close")}
        </button>
      </div>
    </SheetOverlay>
  );
}

// ─── Main BackupSheet ─────────────────────────────────────────────────────────

export function BackupSheet({
  state,
  onStartBackup,
  songs,
  binSongs,
  onCancelBackup,
  onShare,
  onDone,
  onOpenImportPicker,
  onClose,
  defaultBackupName,
  T,
}: BackupSheetProps) {
  if (state.kind === "closed") return null;

  switch (state.kind) {
    case "exportInfo":
      return (
        <ExportInfoSheet
          songs={songs}
          binSongs={binSongs}
          defaultName={defaultBackupName}
          onStart={onStartBackup}
          onClose={onClose}
          T={T}
        />
      );

    case "exportProgress":
      return (
        <ExportProgressSheet
          done={state.done}
          total={state.total}
          onCancel={onCancelBackup}
          T={T}
        />
      );

    case "exportSuccess":
      return (
        <ExportSuccessSheet
          folderName={state.folderName}
          failedCount={state.failedCount}
          onShare={onShare}
          onDone={onDone}
          T={T}
        />
      );

    case "sharing":
      return <SharingSheet T={T} />;

    case "exportError":
      return (
        <ExportErrorSheet
          message={state.message}
          copiedCount={state.copiedCount}
          onClose={onClose}
          T={T}
        />
      );

    case "importInfo":
      return (
        <ImportInfoSheet
          onProceed={onOpenImportPicker}
          onClose={onClose}
          T={T}
        />
      );

    case "importProgress":
      return <ImportProgressSheet phase={state.phase} T={T} />;

    case "importSuccess":
      return (
        <ImportSuccessSheet
          playlistCount={state.playlistCount}
          songCount={state.songCount}
          onDone={onDone}
          T={T}
        />
      );

    case "importError":
      return <ImportErrorSheet message={state.message} onClose={onClose} T={T} />;

    default:
      return null;
  }
}