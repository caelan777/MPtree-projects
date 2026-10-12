import type { ReactNode } from "react";
import { makeSH, type T } from "../themes";
import { t } from "../i18n";
import { IC } from "./Icons";
import { InfoSheet } from "./InfoSheet";
import { Row, ProTag } from "./SettingsSheet";
import { CloudIcon } from "./AccountSheet";

// ─── IMPORT, EXPORT & BACKUP ─────────────────────────────────────────────────
// Every way music and data get into MPTree or out of it, on one page. These
// were spread over Settings, the account sheet and a pull on the list; the
// plus button next to the search field opens them together.
//
// It only gathers what exists. Each row closes this page and opens the thing
// itself, so there is one of everything and not a second copy here.

const Svg = ({ children }: { children: ReactNode }) => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);
const DownloadIcon = () => <Svg><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></Svg>;
const UploadIcon   = () => <Svg><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></Svg>;
const RefreshIcon  = () => <Svg><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></Svg>;
const FolderIcon   = () => <Svg><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></Svg>;

type TransferSheetProps = {
  pro: boolean;
  binCount: number;
  onExport: () => void;
  onImport: () => void;
  onRescan: () => void;
  onOpenAccount: () => void;
  onOpenBin: () => void;
  /** Windows only: pick the folder the library is read from. */
  onMusicFolder?: () => void;
  musicFolder?: string | null;
  onClose: () => void;
  T: T;
};

export function TransferSheet({
  pro, binCount, onExport, onImport, onRescan, onOpenAccount, onOpenBin,
  onMusicFolder, musicFolder, onClose, T,
}: TransferSheetProps) {
  const lbl = makeSH(T).lbl;
  const go = (then: () => void) => () => { onClose(); then(); };
  const chevron = (before?: ReactNode) => (
    <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>{before}<IC.ChevronR /></span>
  );

  return (
    <InfoSheet title={t("Import, export & backup")} onClose={onClose} T={T}>
      <div style={{ ...lbl, marginTop: 4 }}>{t("Backup")}</div>
      <Row T={T} first onClick={go(onExport)} icon={<DownloadIcon />}
        label={t("Export backup")}
        sub={t("Playlists, likes and settings in a file, with or without the songs.")} />
      <Row T={T} onClick={go(onImport)} icon={<UploadIcon />}
        label={t("Restore backup")}
        sub={t("Bring back what a backup file holds.")} />

      <div style={lbl}>{t("Music")}</div>
      {onMusicFolder && (
        <Row T={T} first onClick={go(onMusicFolder)} icon={<FolderIcon />}
          label={t("Music folder")}
          sub={musicFolder || t("All of this computer")} />
      )}
      <Row T={T} first={!onMusicFolder} onClick={go(onRescan)} icon={<RefreshIcon />}
        label={t("Search for new songs")}
        sub={t("Looks again for audio files that were added or taken away.")} />
      <Row T={T} onClick={go(onOpenBin)} icon={<IC.Bin />}
        label={t("Removed songs")}
        sub={t("Put a removed song back in the library.")}
        right={chevron(binCount > 0 && <span style={{ fontSize: 13, color: T.muted }}>{binCount}</span>)} />

      <div style={lbl}>{t("Between your devices")}</div>
      <Row T={T} first onClick={go(onOpenAccount)} icon={<CloudIcon />}
        label={t("Account & sync")}
        sub={t("Your library, playlists and songs on every device you sign in on.")}
        right={chevron(!pro && <ProTag T={T} />)} />
    </InfoSheet>
  );
}
