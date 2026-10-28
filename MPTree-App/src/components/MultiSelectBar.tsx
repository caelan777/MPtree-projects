import type { ReactNode } from "react";
import type { T } from "../themes";
import { t, tn } from "../i18n";
import { IC } from "./Icons";

// ─── MULTI-SELECT ────────────────────────────────────────────────────────────
// While songs are being picked, the header card makes way for a plain bar: a
// way out, how many are picked, and Select all. What can be done with them
// sits in a floating card along the bottom, the same shape as the player it
// replaces: every action at once, four to a row, each a tile with its name
// under it. It used to be one strip that scrolled sideways, so on a small
// phone Edit, Remove and Delete were off the edge where nobody found them.
// Delete is the last of them, in red, and asks first (removeMultiConfirm in
// App). Violet is the selection colour, as everywhere: the count and the
// ticks.

/** How tall the top bar is under the status bar. App pads the list by it. */
export const SELECT_TOP_H = 56;
/** From the bottom of the screen to the top of the actions card, two rows of
 *  tiles. App pads the lists by it so the last songs can be scrolled clear. */
export const SELECT_BOTTOM_H = 176;

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
        <div style={{ height: SELECT_TOP_H, display: "flex", alignItems: "center", gap: 12, padding: "0 14px 0 12px" }}>
          <button onClick={onClose} aria-label={t("Close")} style={{
            width: 40, height: 40, borderRadius: "50%", border: "none", background: T.dim, color: T.text,
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, padding: 0,
          }}>
            <IC.Close />
          </button>
          <span style={{ flex: 1, minWidth: 0, fontSize: 20, fontWeight: 800, color: none ? T.muted : T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: "-0.01em" }}>
            {tn(count, "{n} selected", "{n} selected")}
          </span>
          <button onClick={allSelected ? onClearAll : onSelectAll} style={{
            display: "flex", alignItems: "center", gap: 7, flexShrink: 0,
            background: allSelected ? T.violet + "1f" : "transparent", border: `1.5px solid ${allSelected ? T.violet : T.border}`,
            borderRadius: 18, padding: "6px 12px 6px 8px", cursor: "pointer", fontFamily: "inherit",
            color: allSelected ? T.violet : T.text, fontSize: 13.5, fontWeight: 700,
          }}>
            <SelectCheck on={allSelected} size={18} T={T} />
            {allSelected ? t("Deselect all") : t("Select all")}
          </button>
        </div>
      </div>

      <div style={{
        position: "fixed", left: 12, right: 12, bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)", zIndex: 110,
        background: T.sheetBg, border: `1px solid ${T.border}`, borderRadius: 24,
        boxShadow: "0 10px 36px rgba(0,0,0,0.35)",
        padding: 12, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", rowGap: 10, columnGap: 4,
      }}>
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
    </>
  );
}

/** The tick on a row being picked, and on Select all. Violet when on. */
export function SelectCheck({ on, size = 24, T }: { on: boolean; size?: number; T: T }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0, boxSizing: "border-box",
      border: on ? "none" : `2px solid ${T.muted}`, background: on ? T.violet : "transparent",
      display: "flex", alignItems: "center", justifyContent: "center",
      transition: "background 0.15s, border-color 0.15s",
    }}>
      {on && (
        <svg width={Math.round(size * 0.55)} height={Math.round(size * 0.55)} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </span>
  );
}

/** One thing to do with the picked songs: a tile with its icon, its name under it. */
function Action({ icon, label, onClick, disabled, danger, T }: { icon: ReactNode; label: string; onClick: () => void; disabled: boolean; danger?: boolean; T: T }) {
  const red = "#e8445a";
  return (
    <button onClick={disabled ? undefined : onClick} aria-disabled={disabled} style={{
      minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
      background: "transparent", border: "none", padding: 0, fontFamily: "inherit",
      color: danger ? red : T.text, opacity: disabled ? 0.38 : 1, cursor: disabled ? "default" : "pointer",
      transition: "opacity 0.15s",
    }}>
      <span style={{
        width: 48, height: 44, borderRadius: 14, background: danger ? red + "1f" : T.dim,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {/* The icons are drawn at 16 to 20; this brings them near one size. */}
        <span style={{ display: "flex", transform: "scale(1.15)" }}>{icon}</span>
      </span>
      <span style={{ maxWidth: "100%", fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: danger ? red : T.muted }}>{label}</span>
    </button>
  );
}
