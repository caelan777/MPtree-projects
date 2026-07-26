import React, { useState } from "react";
import type { T } from "../themes";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BackupSheetState =
  | { kind: "closed" }
  | { kind: "exportInfo"; songCount: number; estimatedMB: number }
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
  onStartBackup: (name: string) => void;
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

function ExportInfoSheet({
  songCount, estimatedMB, defaultName, onStart, onClose, T,
}: {
  songCount: number;
  estimatedMB: number;
  defaultName: string;
  onStart: (name: string) => void;
  onClose: () => void;
  T: T;
}) {
  const [name, setName] = useState(defaultName);

  return (
    <SheetOverlay onClose={onClose} T={T}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <div style={{ color: T.violet }}><BackupIcon /></div>
        <div style={{ fontSize: 18, fontWeight: "700", color: T.text }}>Create backup</div>
      </div>

      <div style={{
        background: T.dim, borderRadius: 12, padding: "12px 14px",
        marginBottom: 16, fontSize: 13, color: T.muted, lineHeight: 1.6,
      }}>
        Your music and playlists will be saved to your Downloads folder. You can share this folder with friends or use it to restore on a new device.
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: "600", color: T.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Backup name
        </div>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="MPlayer1_Backup_..."
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

      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 14px", background: T.dim, borderRadius: 10, marginBottom: 24,
      }}>
        <span style={{ fontSize: 20 }}>🎵</span>
        <span style={{ fontSize: 14, color: T.text, fontWeight: "600" }}>
          {songCount} song{songCount !== 1 ? "s" : ""}
        </span>
        <span style={{ color: T.border }}>·</span>
        <span style={{ fontSize: 14, color: T.muted }}>~{estimatedMB} MB</span>
      </div>

      <button
        onClick={() => onStart(name.trim() || defaultName)}
        style={{
          display: "block", width: "100%", background: T.violet, color: "#fff",
          border: "none", borderRadius: 14, padding: "16px", fontSize: 16,
          fontWeight: "700", cursor: "pointer", fontFamily: "inherit",
        }}
      >
        Start backup
      </button>
      <button
        onClick={onClose}
        style={{
          display: "block", width: "100%", background: "transparent",
          color: T.muted, border: "none", borderRadius: 14, padding: "12px",
          fontSize: 14, cursor: "pointer", marginTop: 6, fontFamily: "inherit",
        }}
      >
        Cancel
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
          Creating backup…
        </div>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 24 }}>
          Copying your music library
        </div>

        {/* Progress bar */}
        <div style={{
          height: 8, background: T.dim, borderRadius: 4,
          marginBottom: 12, overflow: "hidden",
        }}>
          <div style={{
            height: "100%", borderRadius: 4, background: T.violet,
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
          Cancel
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
        <div style={{ color: "#22c55e", marginBottom: 10 }}><CheckCircleIcon /></div>
        <div style={{ fontSize: 18, fontWeight: "700", color: T.text, marginBottom: 6 }}>
          Backup saved!
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
            background: "#f59e0b18", border: "1px solid #f59e0b44",
            borderRadius: 10, padding: "10px 14px", marginBottom: 24,
            textAlign: "left",
          }}>
            <span style={{ color: "#f59e0b", flexShrink: 0 }}>⚠</span>
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
            Some files could not be copied, possibly because they were deleted or moved. The backup JSON is complete and your playlists and metadata are fully saved.
          </div>
        )}

        <button
          onClick={onShare}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            width: "100%", background: T.violet, color: "#fff",
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
          Done
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
          Backup failed
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
          Close
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
        <div style={{ color: T.violet }}><RestoreIcon /></div>
        <div style={{ fontSize: 18, fontWeight: "700", color: T.text }}>Restore backup</div>
      </div>

      <div style={{
        background: T.dim, borderRadius: 12, padding: "12px 14px",
        marginBottom: 16, fontSize: 13, color: T.muted, lineHeight: 1.6,
      }}>
        This will replace your current playlists, likes, and edits with the backup. Your music files won't be deleted.
      </div>

      {/* Visual hint showing folder structure */}
      <div style={{
        background: T.dim, border: `1px solid ${T.border}`, borderRadius: 12,
        padding: "12px 14px", marginBottom: 24, fontFamily: "monospace", fontSize: 12,
        color: T.muted, lineHeight: 1.8,
      }}>
        <div style={{ color: T.text, fontWeight: "600", marginBottom: 4 }}>📁 MPlayer1_Backup_...</div>
        <div style={{ paddingLeft: 16 }}>
          <span style={{ color: T.violet }}>📄 mplayer_backup_....json</span>
          <span style={{ color: T.muted }}> ← select this</span>
        </div>
        <div style={{ paddingLeft: 16 }}>📁 music/</div>
        <div style={{ paddingLeft: 32, opacity: 0.7 }}>🎵 song1.mp3</div>
        <div style={{ paddingLeft: 32, opacity: 0.7 }}>🎵 song2.mp3 …</div>
      </div>

      <button
        onClick={onProceed}
        style={{
          display: "block", width: "100%", background: T.violet, color: "#fff",
          border: "none", borderRadius: 14, padding: "16px", fontSize: 16,
          fontWeight: "700", cursor: "pointer", marginBottom: 10, fontFamily: "inherit",
        }}
      >
        Select backup file
      </button>
      <button
        onClick={onClose}
        style={{
          display: "block", width: "100%", background: "transparent",
          color: T.muted, border: "none", borderRadius: 14, padding: "12px",
          fontSize: 14, cursor: "pointer", fontFamily: "inherit",
        }}
      >
        Cancel
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
            <path d="M22 4 a18 18 0 0 1 18 18" fill="none" stroke={T.violet} strokeWidth="3" strokeLinecap="round"/>
          </svg>
        </div>
        <div style={{ fontSize: 16, fontWeight: "600", color: T.text, marginBottom: 6 }}>
          Preparing backup to share…
        </div>
        <div style={{ fontSize: 13, color: T.muted }}>
          Zipping your music and playlists — this can take a moment for large libraries.
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
            <path d="M22 4 a18 18 0 0 1 18 18" fill="none" stroke={T.violet} strokeWidth="3" strokeLinecap="round"/>
          </svg>
        </div>
        <div style={{ fontSize: 16, fontWeight: "600", color: T.text, marginBottom: 6 }}>
          Restoring your music library…
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
        <div style={{ color: "#22c55e", marginBottom: 10 }}><CheckCircleIcon /></div>
        <div style={{ fontSize: 18, fontWeight: "700", color: T.text, marginBottom: 8 }}>
          Backup restored!
        </div>
        <div style={{
          display: "flex", justifyContent: "center", gap: 20,
          marginBottom: 28,
        }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: "800", color: T.violet }}>{playlistCount}</div>
            <div style={{ fontSize: 12, color: T.muted }}>playlist{playlistCount !== 1 ? "s" : ""}</div>
          </div>
          <div style={{ width: 1, background: T.border }} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: "800", color: T.violet }}>{songCount}</div>
            <div style={{ fontSize: 12, color: T.muted }}>song{songCount !== 1 ? "s" : ""}</div>
          </div>
        </div>
        <button
          onClick={onDone}
          style={{
            display: "block", width: "100%", background: T.violet, color: "#fff",
            border: "none", borderRadius: 14, padding: "15px", fontSize: 15,
            fontWeight: "700", cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Done
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
          Restore failed
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
          Close
        </button>
      </div>
    </SheetOverlay>
  );
}

// ─── Main BackupSheet ─────────────────────────────────────────────────────────

export function BackupSheet({
  state,
  onStartBackup,
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
          songCount={state.songCount}
          estimatedMB={state.estimatedMB}
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