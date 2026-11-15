import { useState } from "react";
import { AlbumArt } from "./AlbumArt";
import { IC } from "./Icons";
import { t, tn } from "../i18n";
import type { T } from "../themes";

// ─── NEXT UP, BESIDE THE PLAYER ──────────────────────────────────────────────
// Landscape only. A tap on the player in the side column opens what plays
// next over the list's column, so the player stays in sight while you look.
// A tap on a song plays it; the grip on the right moves it up or down the
// queue, as in the full player. The button at the top opens the full player
// (lyrics, like, speed), which the tap on the player used to do.

export type NextUpItem = { id: string; title: string; artist: string; photo?: string; path?: string; albumId?: number; pinned?: boolean };

/** Every row is this tall, so a drag can tell where it is by its distance. */
const ROW = 60;

export function NextUpPanel({ items, onPlay, onMove, onFullPlayer, onClose, T }: {
  items: NextUpItem[];
  onPlay: (id: string) => void;
  /** Moves the song at `from` to `to`, both counted from the first song up next. */
  onMove: (from: number, to: number) => void;
  onFullPlayer: () => void;
  onClose: () => void;
  T: T;
}) {
  const [drag, setDrag] = useState<{ from: number; over: number; y0: number; dy: number; id: number } | null>(null);
  const iconBtn = {
    background: "transparent", border: `1px solid ${T.border}`, borderRadius: 16, height: 32, minWidth: 38,
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "0 10px",
    color: T.text, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700,
  } as const;

  const grab = (i: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ from: i, over: i, y0: e.clientY, dy: 0, id: e.pointerId });
  };
  const follow = (e: React.PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.y0;
    const over = Math.max(0, Math.min(items.length - 1, drag.from + Math.round(dy / ROW)));
    setDrag({ ...drag, dy, over });
  };
  const drop = () => {
    if (!drag) return;
    if (drag.over !== drag.from) onMove(drag.from, drag.over);
    setDrag(null);
  };
  /** How far a row moves aside while another is dragged past it. */
  const shift = (i: number) => {
    if (!drag || i === drag.from) return 0;
    if (drag.from < drag.over && i > drag.from && i <= drag.over) return -ROW;
    if (drag.from > drag.over && i < drag.from && i >= drag.over) return ROW;
    return 0;
  };

  return (
    <div
      role="dialog"
      aria-label={t("Next up")}
      style={{
        position: "fixed", inset: 0, zIndex: 90, background: T.bg, color: T.text,
        display: "flex", flexDirection: "column", padding: "12px 12px 0",
        animation: "mpNextUpIn 0.22s cubic-bezier(0.22, 1, 0.36, 1)",
      }}
    >
      <style>{"@keyframes mpNextUpIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }"}</style>
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", flexShrink: 0,
        background: T.card, border: `1px solid ${T.border}`, borderRadius: 18,
      }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 20, fontWeight: 800 }}>{t("Next up")}</span>
          {items.length > 0 && <span style={{ fontSize: 12, color: T.muted, marginLeft: 10 }}>{tn(items.length, "{n} song", "{n} songs")}</span>}
        </span>
        <button onClick={onFullPlayer} style={iconBtn}>{t("Open player")}</button>
        <button onClick={onClose} aria-label={t("Close")} style={iconBtn}><IC.Close /></button>
      </div>
      {items.length === 0 ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: 14, color: T.muted, padding: "0 24px" }}>
          {t("Nothing lined up after this song.")}
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflowY: drag ? "hidden" : "auto", WebkitOverflowScrolling: "touch", padding: "8px 0 16px" }}>
          {items.map((q, i) => {
            const held = drag?.from === i;
            return (
              <div
                key={q.id}
                style={{
                  height: ROW, display: "flex", alignItems: "center", gap: 4, borderRadius: 12,
                  position: "relative", zIndex: held ? 2 : 1,
                  background: held ? T.card : "transparent",
                  boxShadow: held ? "0 8px 24px rgba(0,0,0,0.35)" : "none",
                  transform: `translateY(${held ? drag!.dy : shift(i)}px)`,
                  transition: held ? "none" : "transform 0.18s cubic-bezier(0.22, 1, 0.36, 1)",
                }}
              >
                <button
                  onClick={() => { if (!drag) onPlay(q.id); }}
                  style={{
                    flex: 1, minWidth: 0, height: "100%", display: "flex", alignItems: "center", gap: 12, padding: "0 8px",
                    background: "transparent", border: "none", color: T.text, cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                  }}
                >
                  <AlbumArt title={q.title} size={44} customPhoto={q.photo} songPath={q.path} albumId={q.albumId} T={T} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 14.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{q.title}</span>
                    <span style={{ display: "block", fontSize: 12, color: T.textSub, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{q.artist || t("Unknown Artist")}</span>
                  </span>
                  {q.pinned && <span style={{ fontSize: 10, fontWeight: 700, color: T.muted, letterSpacing: "0.04em", flexShrink: 0 }}>{t("Play next").toUpperCase()}</span>}
                </button>
                <div
                  role="button"
                  aria-label={t("Drag to move")}
                  onPointerDown={grab(i)}
                  onPointerMove={follow}
                  onPointerUp={drop}
                  onPointerCancel={drop}
                  style={{ height: "100%", padding: "0 14px", display: "flex", alignItems: "center", color: T.muted, cursor: held ? "grabbing" : "grab", touchAction: "none", flexShrink: 0 }}
                >
                  <svg width="14" height="18" viewBox="0 0 14 18" fill="currentColor" aria-hidden="true">
                    <circle cx="3.5" cy="3" r="1.7"/><circle cx="10.5" cy="3" r="1.7"/>
                    <circle cx="3.5" cy="9" r="1.7"/><circle cx="10.5" cy="9" r="1.7"/>
                    <circle cx="3.5" cy="15" r="1.7"/><circle cx="10.5" cy="15" r="1.7"/>
                  </svg>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
