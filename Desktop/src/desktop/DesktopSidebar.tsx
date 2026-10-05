import type { ReactNode } from "react";
import type { T } from "../themes";
import { Logo } from "../components/Logo";
import { IC } from "../components/Icons";
import { t } from "../i18n";

const NoteIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
  </svg>
);
const ListIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
    <circle cx="3.5" cy="6" r="1" /><circle cx="3.5" cy="12" r="1" /><circle cx="3.5" cy="18" r="1" />
  </svg>
);

function Item({ T, icon, label, active, onClick, tour, mini, count }: {
  T: T; icon: ReactNode; label: string; active?: boolean; onClick: () => void; tour?: string;
  /** Folded: the icon alone, the label as a tooltip. */
  mini?: boolean; count?: number;
}) {
  return (
    <button
      onClick={onClick}
      data-tour={tour}
      className="dnav"
      title={mini ? label : undefined}
      aria-label={label}
      style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%", padding: mini ? "10px 0" : "9px 12px",
        justifyContent: mini ? "center" : undefined,
        border: "none", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
        fontSize: 14, fontWeight: active ? 700 : 600,
        background: active ? T.card : undefined, color: active ? T.text : T.textSub,
      }}
    >
      <span style={{ display: "flex", flexShrink: 0, width: 20, justifyContent: "center" }}>{icon}</span>
      {!mini && <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>}
      {!mini && !!count && <span style={{ fontSize: 12, fontWeight: 600, color: T.muted }}>{count}</span>}
    </button>
  );
}

const label = (T: T): React.CSSProperties => ({
  padding: "6px 12px 6px", fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: T.muted,
});

/** The left column of the wide layout. Stands where the Songs / Playlists
 *  switch and the settings cog stand in the phone header. */
export function DesktopSidebar({ T, ground, page, onPage, onSettings, account, onAccount, mini, onMini, binCount, onBin }: {
  /** Folded to its icons, and the button that folds and unfolds it. */
  mini: boolean; onMini: (mini: boolean) => void;
  binCount: number; onBin: () => void;
  /** The header card's palette (Personalise): on Windows the sidebar is what
   *  wears it, since the wide layout has no header card. */
  T: T; ground: string; page: "songs" | "playlists"; onPage: (p: "songs" | "playlists") => void; onSettings: () => void;
  /** The MPTree account that is signed in, if one is. */
  account?: { name: string; email: string; photo?: string } | null;
  onAccount: () => void;
}) {
  return (
    <nav data-tour="d-sidebar" style={{
      gridColumn: 1, gridRow: 1, display: "flex", flexDirection: "column", gap: 2, minHeight: 0,
      padding: mini ? "16px 8px 12px" : "16px 12px 12px", borderRight: `1px solid ${T.border}`, background: ground,
      // Hover takes its colour from this palette, not the page's.
      ["--dhover" as string]: T.card,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: mini ? "0 0 8px" : "0 0 14px 8px", color: T.text, flexDirection: mini ? "column" : "row" }}>
        <Logo size={30} color={T.text} />
        {!mini && <span style={{ flex: 1, fontSize: 17, fontWeight: 800, letterSpacing: "-0.01em" }}>MPTree</span>}
        <button
          onClick={() => onMini(!mini)} className="dnav"
          aria-label={mini ? t("Show the sidebar") : t("Hide the sidebar")} title={mini ? t("Show the sidebar") : t("Hide the sidebar")}
          style={{ width: 30, height: 30, border: "none", borderRadius: 8, color: T.muted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points={mini ? "9 6 15 12 9 18" : "15 6 9 12 15 18"} />
          </svg>
        </button>
      </div>
      {/* What you listen to, together. The bin belongs with it: it is where
          songs from this list go. */}
      {!mini && <div style={label(T)}>{t("Library")}</div>}
      <Item T={T} icon={<NoteIcon />} label={t("Songs")} mini={mini} active={page === "songs"} onClick={() => onPage("songs")} />
      <Item T={T} icon={<ListIcon />} label={t("Playlists")} mini={mini} active={page === "playlists"} onClick={() => onPage("playlists")} tour="playlists" />
      {/* Red on purpose: the one place in the sidebar that throws things away. */}
      <Item T={T} icon={<span style={{ display: "flex", color: "#e8445a" }}><IC.Trash /></span>} label={t("Bin")} mini={mini} count={binCount} onClick={onBin} />

      <div style={{ flex: 1 }} />

      {/* The app and who is using it, under a line of their own. */}
      <div style={{ height: 1, background: T.border, margin: mini ? "0 6px 6px" : "0 4px 6px" }} />
      <Item T={T} icon={<IC.Settings />} label={t("Settings")} mini={mini} onClick={onSettings} tour="settings" />
      {/* Who is signed in. With nobody: an empty grey figure and "Sign in". */}
      <button
        onClick={onAccount}
        className="dnav"
        title={mini ? (account ? account.name || account.email : t("Sign in")) : undefined}
        style={{
          display: "flex", alignItems: "center", gap: 9, width: "100%", padding: mini ? "7px 0" : "7px 8px",
          justifyContent: mini ? "center" : undefined,
          border: "none", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: T.textSub,
        }}
      >
        <span style={{
          width: 28, height: 28, borderRadius: "50%", flexShrink: 0, overflow: "hidden",
          background: T.dim, color: account ? T.text : T.muted,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 700,
        }}>
          {account?.photo ? (
            <img src={account.photo} alt="" referrerPolicy="no-referrer" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : account ? (
            (account.name || account.email).slice(0, 1).toUpperCase()
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
            </svg>
          )}
        </span>
        {!mini && (
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: account ? T.text : T.textSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {account ? account.name || account.email : t("Sign in")}
            </span>
            {account && account.name && (
              <span style={{ display: "block", fontSize: 11.5, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{account.email}</span>
            )}
          </span>
        )}
      </button>
    </nav>
  );
}
