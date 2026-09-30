import { useState } from "react";
import { makeSH, type T } from "../themes";
import { t, tn } from "../i18n";
import { useSync, setView, type Incoming } from "../sync/engine";

// ─── WHOSE LIBRARY ───────────────────────────────────────────────────────────
// With an MPTree account on more than one phone, a row of chips under the
// header card picks whose library the list shows: this phone's, another
// phone's, or all of them together. Each phone keeps its own; nothing is ever
// merged into another. A change made while looking at another phone is asked
// on that phone before it is kept (IncomingSheet).

export const CHIPS_H = 40;

export function ViewChips({ top, hidden, transition, T }: { top: number; hidden: boolean; transition: string; T: T }) {
  const s = useSync();
  const [busy, setBusy] = useState(false);
  const others = s.devices.filter(d => d.id !== s.deviceId);
  const chips = [
    { id: "me", label: t("This phone") },
    ...others.map(d => ({ id: d.id, label: d.name })),
    { id: "all", label: t("All") },
  ];
  const pick = async (id: string) => {
    if (busy || id === s.view) return;
    setBusy(true);
    try { await setView(id); } finally { setBusy(false); }
  };
  const viewing = others.find(d => d.id === s.view);
  const waiting = viewing && s.waitingFor.includes(viewing.id);
  return (
    <div
      aria-hidden={hidden}
      style={{
        position: "absolute", top, left: 0, right: 0, zIndex: 110, height: CHIPS_H,
        opacity: hidden ? 0 : 1, pointerEvents: hidden ? "none" : "auto", transition,
        display: "flex", alignItems: "center", gap: 6, padding: "0 12px",
        overflowX: "auto", scrollbarWidth: "none", WebkitOverflowScrolling: "touch",
      }}
    >
      <div role="radiogroup" aria-label={t("Whose library")} style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        {chips.map(c => {
          const on = s.view === c.id;
          return (
            <button key={c.id} role="radio" aria-checked={on} onClick={() => pick(c.id)}
              style={{
                flexShrink: 0, height: 30, padding: "0 12px", borderRadius: 15, cursor: "pointer", fontFamily: "inherit",
                fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis",
                border: `1px solid ${on ? T.accent : T.border}`,
                background: on ? T.accent : T.surface, color: on ? T.playBtnFg : T.chipColor,
                opacity: busy && !on ? 0.6 : 1,
              }}>
              {c.label}
            </button>
          );
        })}
      </div>
      {(waiting || (viewing && s.songs.notHereInView > 0)) && (
        <span style={{ fontSize: 11.5, color: T.muted, whiteSpace: "nowrap", flexShrink: 0, paddingLeft: 4 }}>
          {waiting ? t("Waiting for {phone} to accept", { phone: viewing!.name })
            : tn(s.songs.notHereInView, "{n} song still on its way", "{n} songs still on their way")}
        </span>
      )}
    </div>
  );
}

/** Asked when another phone changed this one's library from afar. Declining
 *  puts it back everywhere. */
export function IncomingSheet({ incoming, onAccept, onDecline, T }: {
  incoming: Incoming; onAccept: () => void; onDecline: () => void; T: T;
}) {
  const sh = makeSH(T);
  const s = incoming.summary;
  const lines: string[] = [];
  if (s.liked) lines.push(tn(s.liked, "Liked {n} song", "Liked {n} songs"));
  if (s.unliked) lines.push(tn(s.unliked, "Unliked {n} song", "Unliked {n} songs"));
  if (s.details) lines.push(tn(s.details, "Changed the name, artist, lyrics or cover of {n} song", "Changed the name, artist, lyrics or cover of {n} songs"));
  if (s.binned) lines.push(tn(s.binned, "Moved {n} song to the bin", "Moved {n} songs to the bin"));
  if (s.restored) lines.push(tn(s.restored, "Took {n} song out of the bin", "Took {n} songs out of the bin"));
  if (s.cuts) lines.push(tn(s.cuts, "Changed {n} cut track", "Changed {n} cut tracks"));
  for (const n of s.newPlaylists) lines.push(t("Made the playlist “{name}”", { name: n }));
  for (const n of s.changedPlaylists) lines.push(t("Changed the playlist “{name}”", { name: n }));
  for (const n of s.deletedPlaylists) lines.push(t("Deleted the playlist “{name}”", { name: n }));
  const btn = { ...sh.saveBtn, fontFamily: "inherit" };
  return (
    <div style={{ ...sh.overlay, zIndex: 470 }}>
      <div style={{ ...sh.sheet, paddingBottom: 24 }}>
        <div style={sh.handle} />
        <div style={{ padding: "18px 22px 0" }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: T.text }}>
            {t("{phone} changed this phone's library", { phone: incoming.fromName || t("Another phone") })}
          </div>
          <div style={{ fontSize: 13.5, color: T.textSub, lineHeight: 1.5, marginTop: 6 }}>
            {t("Keep the changes, or decline them and everything goes back to how it was, on every phone.")}
          </div>
          <div style={{ background: T.dim, borderRadius: 14, padding: "10px 14px", marginTop: 14 }}>
            {lines.map((l, i) => (
              <div key={i} style={{ fontSize: 14, color: T.text, padding: "5px 0", borderTop: i ? `1px solid ${T.border}` : "none", lineHeight: 1.45 }}>{l}</div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={onDecline} style={{ ...btn, background: T.dim, color: T.text }}>{t("Decline")}</button>
            <button onClick={onAccept} style={btn}>{t("Accept")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
