import type { CSSProperties, ReactNode } from "react";
import type { T } from "../themes";
import { floatCard, roundBtn } from "./cardStyles";
import { t, tn } from "../i18n";
import { IC } from "./Icons";
import { IS_IOS } from "../plugins";

// ─── MULTI-SELECT ────────────────────────────────────────────────────────────
// While songs are being picked, the header card makes way for a plain bar: a
// way out, how many are picked, and Select all. What can be done with them
// sits in a floating card along the bottom, the same shape as the player it
// replaces: every action at once, four to a row, each a tile with its name
// under it. The "⋮" menu is that same card with that same grid (SongMenuSheet
// uses SongActionTiles from here), so the two read as one thing.
//
// With one song picked the card holds everything the "⋮" menu holds; from
// two on, only what makes sense for many. The bin is always the last tile,
// bottom right, in red, and asks first. Violet is the selection colour, as
// everywhere: the ticks.

/** How tall the top bar is under the status bar. App pads the list by it. */
export const SELECT_TOP_H = 56;
/** From the bottom of the screen to the top of the actions card, at its
 *  tallest: three rows of tiles, which is one song picked. App pads the lists
 *  by it so the last songs can be scrolled clear. */
export const SELECT_BOTTOM_H = 248;

const RED = "#e8445a";

const grid: CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", rowGap: 10, columnGap: 4,
};

/** Everything that can be done with one song: the "⋮" menu, and the
 *  selection with one song in it. */
export type SongActions = {
  isLiked: boolean;
  onPlay: () => void;
  onPlayNext: () => void;
  onAddToPlaylist: () => void;
  onToggleLike: () => void;
  onShare: () => void;
  onEditLyrics: () => void;
  onCut: () => void;
  onSetRingtone: () => void;
  onChangePhoto: () => void;
  onEdit: () => void;
  /** Only inside a real playlist: out of it, still in the library. */
  onRemoveFromPlaylist?: () => void;
  /** Off the library, into the bin. Asks first. */
  onBin: () => void;
};

export function SongActionTiles({ a, T }: { a: SongActions; T: T }) {
  return (
    <div style={grid}>
      <ActionTile icon={<IC.Play />} label={t("Play")} onClick={a.onPlay} T={T} />
      <ActionTile icon={<IC.PlayNext />} label={t("Play next")} onClick={a.onPlayNext} T={T} />
      <ActionTile icon={<IC.Plus />} label={t("Add to")} onClick={a.onAddToPlaylist} T={T} />
      <ActionTile icon={<IC.Heart filled={a.isLiked} size={16} />} label={a.isLiked ? t("Unlike") : t("Like")} onClick={a.onToggleLike} T={T} />
      <ActionTile icon={<IC.Share />} label={t("Share")} onClick={a.onShare} T={T} />
      <ActionTile icon={<IC.Lyrics />} label={t("Lyrics")} onClick={a.onEditLyrics} T={T} />
      <ActionTile icon={<IC.Scissors />} label={t("Cut")} onClick={a.onCut} T={T} />
      {/* An iPhone has no ringtones for apps to set. */}
      {!IS_IOS && <ActionTile icon={<IC.Bell />} label={t("Ringtone")} onClick={a.onSetRingtone} T={T} />}
      <ActionTile icon={<IC.Photo />} label={t("Photo")} onClick={a.onChangePhoto} T={T} />
      <ActionTile icon={<IC.Edit />} label={t("Edit")} onClick={a.onEdit} T={T} />
      {a.onRemoveFromPlaylist && <ActionTile icon={<OutOfPlaylistIcon />} label={t("Out of playlist")} onClick={a.onRemoveFromPlaylist} T={T} />}
      <ActionTile icon={<IC.Trash />} label={t("Bin")} onClick={a.onBin} danger last T={T} />
    </div>
  );
}

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
  /** Off the library, into the bin. Asks first. */
  onDelete: () => void;
  /** What the "⋮" menu can do with the one song picked. Used while exactly
   *  one is. */
  single?: SongActions | null;
  onSelectAll: () => void;
  onClearAll: () => void;
  onClose: () => void;
  T: T;
};

export function MultiSelectBar({
  count, totalCount, allLiked,
  onLikeAll, onUnlikeAll, onShuffleSelection, onAddToPlaylist, onPlayNext, onShare, onBulkEdit,
  onRemoveFromPlaylist, onDelete, single,
  onSelectAll, onClearAll, onClose, T,
}: MultiSelectBarProps) {
  const allSelected = count === totalCount && totalCount > 0;
  const none = count === 0;

  return (
    <>
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 110, background: T.bg, paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div style={{ height: SELECT_TOP_H, display: "flex", alignItems: "center", gap: 12, padding: "0 14px 0 12px" }}>
          <button onClick={onClose} aria-label={t("Close")} style={roundBtn(T)}>
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
        ...floatCard(T),
        position: "fixed", left: 12, right: 12, bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)", zIndex: 110,
        padding: 12,
      }}>
        {count === 1 && single ? <SongActionTiles a={single} T={T} /> : (
          <div style={grid}>
            {allLiked
              ? <ActionTile icon={<IC.Heart filled={true} size={16} />} label={t("Unlike")} onClick={onUnlikeAll} disabled={none} T={T} />
              : <ActionTile icon={<IC.Heart filled={false} size={16} />} label={t("Like")} onClick={onLikeAll} disabled={none} T={T} />}
            <ActionTile icon={<IC.Plus />} label={t("Add to")} onClick={onAddToPlaylist} disabled={none} T={T} />
            <ActionTile icon={<IC.PlayNext />} label={t("Play next")} onClick={onPlayNext} disabled={none} T={T} />
            <ActionTile icon={<IC.Share />} label={t("Share")} onClick={onShare} disabled={none} T={T} />
            <ActionTile icon={<IC.Shuffle />} label={t("Shuffle")} onClick={onShuffleSelection} disabled={none} T={T} />
            <ActionTile icon={<IC.Edit />} label={t("Edit")} onClick={onBulkEdit} disabled={none} T={T} />
            {onRemoveFromPlaylist && <ActionTile icon={<OutOfPlaylistIcon />} label={t("Out of playlist")} onClick={onRemoveFromPlaylist} disabled={none} T={T} />}
            <ActionTile icon={<IC.Trash />} label={t("Bin")} onClick={onDelete} disabled={none} danger last T={T} />
          </div>
        )}
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

/** A note with a minus: out of this playlist, unlike the bin's "out of
 *  everything". */
function OutOfPlaylistIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v7" /><circle cx="6" cy="18" r="3" /><path d="M15 17h7" />
    </svg>
  );
}

/** One thing to do: a tile with its icon, its name under it. `last` puts it
 *  in the fourth column whatever comes before it, so the bin is always in the
 *  same corner. */
export function ActionTile({ icon, label, onClick, disabled = false, danger, last, T }: {
  icon: ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean; last?: boolean; T: T;
}) {
  return (
    <button onClick={disabled ? undefined : onClick} aria-disabled={disabled} style={{
      minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
      background: "transparent", border: "none", padding: 0, fontFamily: "inherit",
      color: danger ? RED : T.text, opacity: disabled ? 0.38 : 1, cursor: disabled ? "default" : "pointer",
      transition: "opacity 0.15s", gridColumn: last ? 4 : undefined,
    }}>
      <span style={{
        width: 48, height: 44, borderRadius: 14, background: danger ? RED + "1f" : T.dim,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {/* The icons are drawn at 16 to 20; this brings them near one size. */}
        <span style={{ display: "flex", transform: "scale(1.15)" }}>{icon}</span>
      </span>
      <span style={{ maxWidth: "100%", fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: danger ? RED : T.textSub }}>{label}</span>
    </button>
  );
}
