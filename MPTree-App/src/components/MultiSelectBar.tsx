import React from "react";
import type { T } from "../themes";
import { IC } from "./Icons";

type MultiSelectBarProps = {
  count: number;
  totalCount: number;
  allLiked: boolean;
  onLikeAll: () => void;
  onUnlikeAll: () => void;
  onShuffleSelection: () => void;
  onAddToPlaylist: () => void;
  onPlayNext: () => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onClose: () => void;
  T: T;
};

export function MultiSelectBar({
  count, totalCount, allLiked,
  onLikeAll, onUnlikeAll, onShuffleSelection, onAddToPlaylist, onPlayNext,
  onSelectAll, onClearAll, onClose, T,
}: MultiSelectBarProps) {
  const allSelected = count === totalCount && totalCount > 0;

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0,
      background: T.sheetBg, borderTop: `1px solid ${T.border}`,
      zIndex: 110, display: "flex", flexDirection: "column", paddingBottom: 24,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px 6px" }}>
        <button onClick={onClose} style={{ background: "transparent", border: "none", color: T.muted, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: "4px 0", fontSize: 14, fontFamily: "inherit" }}>
          <IC.Close />
          <span style={{ fontWeight: "600" }}>Cancel</span>
        </button>
        <div style={{ background: T.violet + "22", color: T.violet, borderRadius: 20, padding: "3px 12px", fontSize: 13, fontWeight: "700" }}>
          {count} selected
        </div>
        <button onClick={allSelected ? onClearAll : onSelectAll} style={{ background: "transparent", border: "none", color: T.violet, cursor: "pointer", fontSize: 13, fontWeight: "700", padding: "4px 0", fontFamily: "inherit" }}>
          {allSelected ? "Deselect all" : "Select all"}
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 16px", overflowX: "auto", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
        {allLiked ? (
          <Chip disabled={count === 0} onClick={onUnlikeAll} T={T}><IC.Heart filled={true} size={15} />Unlike</Chip>
        ) : (
          <Chip disabled={count === 0} onClick={onLikeAll} T={T}><IC.Heart filled={false} size={15} />Like</Chip>
        )}
        <Chip disabled={count === 0} onClick={onShuffleSelection} T={T}><IC.Shuffle />Shuffle</Chip>
        <Chip disabled={count === 0} onClick={onAddToPlaylist} T={T}><IC.Plus />Add to playlist</Chip>
        {/* Remove is deliberately NOT here. It moved up beside the settings
            gear, where the count used to sit, so the one destructive action in
            this mode is not sitting in the same row as four harmless ones. */}
        <Chip disabled={count === 0} onClick={onPlayNext} T={T}><IC.PlayNext />Play next</Chip>
      </div>
    </div>
  );
}

function Chip({ children, disabled, onClick, T }: { children: React.ReactNode; disabled: boolean; onClick: () => void; T: T }) {
  return (
    <button onClick={disabled ? undefined : onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "9px 14px", borderRadius: 20,
      border: `1px solid ${disabled ? T.border : T.chipBorder}`,
      background: disabled ? T.dim : T.chipBg,
      color: disabled ? T.muted : T.chipColor,
      fontSize: 13, fontWeight: "600", cursor: disabled ? "default" : "pointer",
      whiteSpace: "nowrap" as const, fontFamily: "inherit", opacity: disabled ? 0.5 : 1, flexShrink: 0,
    }}>
      {children}
    </button>
  );
}