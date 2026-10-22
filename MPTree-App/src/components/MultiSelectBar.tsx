import type { ReactNode } from "react";
import type { T } from "../themes";
import { t, tn } from "../i18n";
import { IC } from "./Icons";

// ─── MULTI-SELECT ────────────────────────────────────────────────────────────
// While songs are being picked, the header card makes way for a plain bar: a
// way back, how many are picked, and Select all. What can be done with them
// sits along the bottom, each an icon with its name under it. Delete is the
// last of them, in red, and asks first (removeMultiConfirm in App).

/** How tall the top bar is under the status bar. App pads the list by it. */
export const SELECT_TOP_H = 56;

type MultiSelectBarProps = {
  count: number;
  totalCount: number;
  allLiked: boolean;
  onLikeAll: () => void;
  onUnlikeAll: () => void;
  onShuffleSelection: () => void;
  onAddToPlaylist: () => void;
  onPlayNext: () => void;
  onShare: () => void;
  onBulkEdit: () => void;
  /** Only inside a real playlist: take the songs out of it. Supplied there and
   *  nowhere else, which is what makes this bar serve both pages. */
  onRemoveFromPlaylist?: () => void;
  /** Off the library, into the bin. On the Songs page only. */
  onDelete?: () => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onClose: () => void;
  T: T;
};

export function MultiSelectBar({
  count, totalCount, allLiked,
  onLikeAll, onUnlikeAll, onShuffleSelection, onAddToPlaylist, onPlayNext, onShare, onBulkEdit,
  onRemoveFromPlaylist, onDelete,
  onSelectAll, onClearAll, onClose, T,
}: MultiSelectBarProps) {
  const allSelected = count === totalCount && totalCount > 0;
  const none = count === 0;

  return (
    <>
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 110, background: T.bg, paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div style={{ height: SELECT_TOP_H, display: "flex", alignItems: "center", gap: 4, padding: "0 12px 0 4px" }}>
          <button onClick={onClose} aria-label={t("Back")} style={{ background: "transparent", border: "none", color: T.text, cursor: "pointer", padding: 10, display: "flex" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 5 8 12 15 19" /></svg>
          </button>
          <span style={{ flex: 1, minWidth: 0, fontSize: 20, fontWeight: 800, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {tn(count, "{n} selected", "{n} selected")}
          </span>
          <button onClick={allSelected ? onClearAll : onSelectAll} style={{ background: "transparent", border: "none", color: T.violet, cursor: "pointer", fontSize: 14, fontWeight: 700, padding: "8px 4px", fontFamily: "inherit", flexShrink: 0 }}>
            {allSelected ? t("Deselect all") : t("Select all")}
          </button>
        </div>
      </div>

      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 110,
        background: T.sheetBg, borderTop: `1px solid ${T.border}`, borderRadius: "22px 22px 0 0",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)",
      }}>
        <div style={{ display: "flex", overflowX: "auto", scrollbarWidth: "none", padding: "10px 4px 0" }}>
          {allLiked
            ? <Action icon={<IC.Heart filled={true} size={16} />} label={t("Unlike")} onClick={onUnlikeAll} disabled={none} T={T} />
            : <Action icon={<IC.Heart filled={false} size={16} />} label={t("Like")} onClick={onLikeAll} disabled={none} T={T} />}
          <Action icon={<IC.Plus />} label={t("Add to")} onClick={onAddToPlaylist} disabled={none} T={T} />
          <Action icon={<IC.PlayNext />} label={t("Play next")} onClick={onPlayNext} disabled={none} T={T} />
          <Action icon={<IC.Share />} label={t("Share")} onClick={onShare} disabled={none} T={T} />
          <Action icon={<IC.Shuffle />} label={t("Shuffle")} onClick={onShuffleSelection} disabled={none} T={T} />
          <Action icon={<IC.Edit />} label={t("Edit")} onClick={onBulkEdit} disabled={none} T={T} />
          {onRemoveFromPlaylist && <Action icon={<IC.MinusCircle />} label={t("Remove")} onClick={onRemoveFromPlaylist} disabled={none} T={T} />}
          {onDelete && <Action icon={<IC.Trash />} label={t("Delete")} onClick={onDelete} disabled={none} danger T={T} />}
        </div>
      </div>
    </>
  );
}

/** One thing to do with the picked songs: its icon, its name under it. */
function Action({ icon, label, onClick, disabled, danger, T }: { icon: ReactNode; label: string; onClick: () => void; disabled: boolean; danger?: boolean; T: T }) {
  return (
    <button onClick={disabled ? undefined : onClick} aria-disabled={disabled} style={{
      flex: "1 0 54px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
      background: "transparent", border: "none", padding: "4px 2px", fontFamily: "inherit",
      color: danger ? "#e8445a" : T.text, opacity: disabled ? 0.4 : 1, cursor: disabled ? "default" : "pointer",
    }}>
      {/* The icons are drawn at 16 to 20; this brings them near one size. */}
      <span style={{ height: 24, display: "flex", alignItems: "center", transform: "scale(1.2)" }}>{icon}</span>
      <span style={{ fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap", color: danger ? "#e8445a" : T.muted }}>{label}</span>
    </button>
  );
}
