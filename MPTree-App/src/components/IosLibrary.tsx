import { useEffect, useState } from "react";
import type { T } from "../themes";
import { t } from "../i18n";
import { IC } from "./Icons";
import { MusicScanner } from "../plugins";

// ─── THE IPHONE'S MUSIC FOLDERS ──────────────────────────────────────────────
// An iPhone app cannot look through the phone for music. MPTree always reads
// its own folder in the Files app; here the person gives it more folders
// (Downloads, all of iCloud Drive), which it then reads, subfolders and all,
// every time it opens. See MusicScannerPlugin.swift.

export function FolderIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" />
    </svg>
  );
}

export function NoteIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 18V5l11-2v13" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" />
    </svg>
  );
}

type Folder = { key: string; name: string };

export function MusicFoldersSheet({ onClose, onChanged, T }: { onClose: () => void; onChanged: () => void; T: T }) {
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => MusicScanner.folders?.().then(r => setFolders(r.folders)).catch(() => setFolders([]));
  useEffect(() => { load(); }, []);

  const add = async () => {
    setBusy(true);
    try {
      const r = await MusicScanner.addFolder!();
      if (r.key) { await load(); onChanged(); }
    } catch { /* the picker said why */ }
    setBusy(false);
  };
  const remove = async (key: string) => {
    await MusicScanner.removeFolder?.({ key }).catch(() => {});
    await load();
    onChanged();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 430, display: "flex", alignItems: "flex-end" }} onClick={onClose}>
      <div style={{ width: "100%", background: T.card, borderRadius: "20px 20px 0 0", padding: "8px 20px 44px", maxHeight: "90vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ width: 36, height: 4, background: T.border, borderRadius: 2, margin: "8px auto 16px" }} />
        <div style={{ fontSize: 18, fontWeight: 700, color: T.text }}>{t("Music folders")}</div>
        <div style={{ fontSize: 13, color: T.muted, marginTop: 6, marginBottom: 16, lineHeight: 1.5 }}>
          {t("MPTree reads these folders, and every folder inside them, each time it opens. Downloads works, and so does all of iCloud Drive.")}
        </div>

        {folders !== null && folders.length === 0 && (
          <div style={{ fontSize: 14, color: T.muted, padding: "6px 2px 14px" }}>{t("No folders yet.")}</div>
        )}
        {(folders ?? []).map(f => (
          <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 12, background: T.dim, border: `1px solid ${T.border}`, borderRadius: 14, padding: "10px 10px 10px 14px", marginBottom: 8, color: T.text }}>
            <span style={{ display: "flex", flexShrink: 0 }}><FolderIcon /></span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
            <button onClick={() => remove(f.key)} aria-label={t("Remove")} style={{ width: 36, height: 36, borderRadius: 18, border: "none", background: "transparent", color: T.muted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <IC.Close />
            </button>
          </div>
        ))}

        <button onClick={add} disabled={busy} style={{
          width: "100%", marginTop: 8, background: T.accent, color: T.playBtnFg, border: "none", borderRadius: 14,
          padding: "14px 16px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: busy ? 0.6 : 1,
        }}>
          {t("Add a folder")}
        </button>
        <div style={{ fontSize: 12, color: T.muted, marginTop: 12, lineHeight: 1.5 }}>
          {t("The MPTree folder in the Files app is always read. Removing a folder here takes its songs out of MPTree; the files stay where they are.")}
        </div>
      </div>
    </div>
  );
}
