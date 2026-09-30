import { useEffect, useState, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { makeSH, type T } from "../themes";
import { t, tn } from "../i18n";
import { IC } from "./Icons";
import { Switch } from "./Switch";
import {
  useSync, signIn, signOut, cancelJoin, removeDevice, dismissRemoved, setMobileData,
  type SyncState, type Device,
} from "../sync/engine";

// ─── ACCOUNT & SYNC ──────────────────────────────────────────────────────────
// The one page about the MPTree account. It has to answer one question before
// any other: what goes where. So the two halves are always on it, whatever
// state the account is in: what is saved in the account, and the songs, which
// are not saved in it but go from phone to phone.

const Svg = ({ children, size = 20 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
export const CloudIcon = () => <Svg size={19}><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/></Svg>;
const CloudCheck = () => <Svg><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/><polyline points="9 13.5 11 15.5 15 11.5"/></Svg>;
const Phones = () => <Svg><rect x="2" y="5" width="8" height="14" rx="2"/><rect x="14" y="5" width="8" height="14" rx="2"/><path d="M10.5 10h3"/><path d="M12.5 8.5 14 10l-1.5 1.5"/><path d="M13.5 14h-3"/><path d="M11.5 12.5 10 14l1.5 1.5"/></Svg>;
const Check = () => <Svg size={15}><polyline points="20 6 9 17 4 12"/></Svg>;

type Props = {
  pro: boolean;
  onOpenPro: () => void;
  onClose: () => void;
  onToast: (msg: string) => void;
  T: T;
};

const MAX = 3;

function ago(ms: number): string {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return t("just now");
  const m = Math.round(s / 60);
  if (m < 60) return tn(m, "{n} minute ago", "{n} minutes ago");
  const h = Math.round(m / 60);
  return tn(h, "{n} hour ago", "{n} hours ago");
}

const mb = (n: number) => (n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0);

export function AccountSheet({ pro, onOpenPro, onClose, onToast, T }: Props) {
  const sh = makeSH(T);
  const s = useSync();
  const [busy, setBusy] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  // "Saved 2 minutes ago" keeps moving while the page is open.
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick(n => n + 1), 20_000); return () => clearInterval(id); }, []);

  const native = Capacitor.getPlatform() !== "web" || import.meta.env.DEV;

  const doSignIn = async () => {
    setBusy(true);
    const r = await signIn();
    setBusy(false);
    if (r === "failed") onToast(t("Could not sign in. Check your connection and try again."));
  };
  const doRemove = async (d: Device) => {
    setBusy(true);
    try { await removeDevice(d.id); onToast(t("{name} is off your account", { name: d.name })); }
    catch { onToast(t("Could not reach Google Drive. Try again in a moment.")); }
    setBusy(false);
  };
  const doSignOut = async () => {
    setBusy(true);
    await signOut();
    setBusy(false);
    setConfirmOut(false);
    onToast(t("Signed out. Everything stays on this phone."));
  };

  const btn = { ...sh.saveBtn, fontFamily: "inherit" };
  const card = { background: T.dim, borderRadius: 14, padding: "14px 16px", marginTop: 10 } as const;
  const cardTitle = (icon: ReactNode, text: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, color: T.text, fontSize: 15, fontWeight: 700 }}>
      <span style={{ display: "flex", flexShrink: 0 }}>{icon}</span>{text}
    </div>
  );
  const small = { fontSize: 13, color: T.textSub, lineHeight: 1.5, marginTop: 8 } as const;
  const link = { ...btn, background: "transparent", color: T.muted, fontWeight: 600, fontSize: 14, marginTop: 4 };

  // ── The two halves ──
  const savedList = [
    t("Playlists"),
    t("Likes and play counts"),
    t("Names, artists, lyrics and covers"),
    t("The bin and cut tracks"),
    t("Settings and your look"),
  ];
  const saved = (
    <div style={card}>
      {cardTitle(<CloudCheck />, t("Saved in your account"))}
      <div style={{ marginTop: 8 }}>
        {savedList.map(x => (
          <div key={x} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: T.text, padding: "3px 0" }}>
            <span style={{ display: "flex", color: T.muted }}><Check /></span>{x}
          </div>
        ))}
      </div>
      <div style={small}>{t("Kept in your own Google Drive, in a folder only MPTree can open.")}</div>
    </div>
  );
  const songsIntro = (
    <div style={card}>
      {cardTitle(<Phones />, t("Your songs go from phone to phone"))}
      <div style={{ ...small, color: T.text }}>
        {t("Songs are not saved in your account. They go from one of your phones straight to the others, so every phone ends up with all of them.")}
      </div>
      <div style={small}>
        {t("When your other phone is not open, a song waits in your Drive and is deleted from it as soon as it has arrived.")}
      </div>
      {s.phase === "on" && !s.pausedNoPro && <SongStatus s={s} T={T} />}
    </div>
  );

  // ── What the bottom of the page does, per state ──
  let top: ReactNode = null;
  let bottom: ReactNode;

  if (!native) {
    bottom = <div style={{ ...small, textAlign: "center" }}>{t("Sign in with Google in the MPTree app on your phone.")}</div>;
  } else if (!pro && s.phase !== "on") {
    bottom = (
      <>
        <div style={{ ...small, textAlign: "center", marginTop: 0, marginBottom: 12 }}>
          {tn(MAX, "Part of MPTree Pro, on up to {n} phone.", "Part of MPTree Pro, on up to {n} phones.")}
        </div>
        <button onClick={onOpenPro} style={btn}>{t("Get MPTree Pro")}</button>
      </>
    );
  } else if (s.phase === "limit") {
    top = (
      <div style={{ ...card, marginTop: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{tn(MAX, "Your account is on {n} phone already", "Your account is on {n} phones already")}</div>
        <div style={small}>{t("Take one off to use your account on this phone. Nothing is deleted from it; it just stops syncing.")}</div>
        <DeviceList devices={s.devices} me={s.deviceId} onRemove={doRemove} busy={busy} T={T} />
      </div>
    );
    bottom = <button onClick={cancelJoin} style={link}>{t("Cancel")}</button>;
  } else if (s.phase === "removed") {
    top = (
      <div style={{ ...card, marginTop: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{t("This phone was taken off your account")}</div>
        <div style={small}>{t("That was done from another phone. Everything on this one stays as it is.")}</div>
      </div>
    );
    bottom = (
      <>
        <button onClick={() => { dismissRemoved(); void doSignIn(); }} style={btn}>{t("Sign in again")}</button>
        <button onClick={dismissRemoved} style={link}>{t("OK")}</button>
      </>
    );
  } else if (s.phase === "on") {
    const status = s.pausedNoPro ? t("Paused. Syncing is part of MPTree Pro.")
      : s.problem === "offline" ? t("Waiting for internet")
      : s.problem === "signin" ? t("Sign in again to keep syncing")
      : s.problem === "drive" ? t("Could not reach Google Drive. Trying again soon.")
      : s.saving ? t("Saving…")
      : s.lastSaved ? t("Saved {when}", { when: ago(s.lastSaved) })
      : t("Saving…");
    top = (
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "2px 2px 4px" }}>
        <span style={{ width: 40, height: 40, borderRadius: 20, background: T.accent, color: T.playBtnFg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 17, flexShrink: 0 }}>
          {(s.account?.name || s.account?.email || "?").trim()[0]?.toUpperCase()}
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: "block", fontSize: 15, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.account?.name || s.account?.email}</span>
          <span style={{ display: "block", fontSize: 12.5, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.account?.email}</span>
        </span>
        <span style={{ fontSize: 12.5, color: s.problem ? T.text : T.muted, textAlign: "right", maxWidth: 130, lineHeight: 1.35 }}>{status}</span>
      </div>
    );
    bottom = (
      <>
        {s.pausedNoPro && <button onClick={onOpenPro} style={{ ...btn, marginBottom: 8 }}>{t("Get MPTree Pro")}</button>}
        {s.problem === "signin" && <button onClick={doSignIn} style={{ ...btn, marginBottom: 8 }}>{t("Sign in again")}</button>}
        {confirmOut ? (
          <div style={{ ...card, marginTop: 0 }}>
            <div style={{ fontSize: 14, color: T.text, lineHeight: 1.5 }}>
              {t("Sign out on this phone? Everything on it stays, and your account keeps what it has. This phone just stops syncing.")}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={() => setConfirmOut(false)} style={{ ...btn, background: T.surface, color: T.text }}>{t("Cancel")}</button>
              <button onClick={doSignOut} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>{t("Sign out")}</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setConfirmOut(true)} style={{ ...btn, background: T.dim, color: T.text }}>{t("Sign out")}</button>
        )}
      </>
    );
  } else {
    bottom = (
      <>
        <button onClick={doSignIn} disabled={busy || s.phase === "joining"} style={{ ...btn, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, opacity: busy ? 0.7 : 1 }}>
          <GoogleG />{busy || s.phase === "joining" ? t("Signing in…") : t("Sign in with Google")}
        </button>
        <div style={{ ...small, textAlign: "center", marginTop: 8 }}>
          {tn(MAX, "On up to {n} phone. MPTree only gets its own folder in your Drive.", "On up to {n} phones. MPTree only gets its own folder in your Drive.")}
        </div>
      </>
    );
  }

  return (
    <div style={{ ...sh.overlay, zIndex: 450 }} onClick={onClose}>
      <div style={{ ...sh.sheet, maxHeight: "88vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
        <div style={sh.handle} />
        <div style={sh.hdr}>
          <span style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{t("Account & sync")}</span>
          <button onClick={onClose} style={sh.xBtn} aria-label={t("Close")}><IC.Close /></button>
        </div>

        <div style={{ overflowY: "auto", padding: "0 20px 8px" }}>
          {top}
          {saved}
          {songsIntro}
          {s.phase === "on" && (
            <>
              <button onClick={() => setMobileData(!s.mobileData)}
                style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                <span>
                  <span style={{ display: "block", fontSize: 15, color: T.text }}>{t("Use mobile data for songs")}</span>
                  <span style={{ display: "block", fontSize: 12.5, color: T.muted, marginTop: 2, lineHeight: 1.4 }}>{t("Off: songs only move on wifi. Your account is always saved.")}</span>
                </span>
                <Switch on={s.mobileData} T={T} />
              </button>
              <div style={{ ...sh.lbl, marginTop: 20 }}>{t("Phones ({n} of {max})", { n: s.devices.length, max: MAX })}</div>
              <DeviceList devices={s.devices} me={s.deviceId} onRemove={doRemove} busy={busy} T={T} />
            </>
          )}
        </div>

        <div style={{ padding: "12px 20px 0", flexShrink: 0 }}>{bottom}</div>
      </div>
    </div>
  );
}

function SongStatus({ s, T }: { s: SyncState; T: T }) {
  const g = s.songs;
  const others = s.devices.filter(d => d.id !== s.deviceId);
  let line: string;
  if (g.moving) {
    const pct = g.moving.total > 0 ? Math.min(100, Math.round(g.moving.done / g.moving.total * 100)) : 0;
    const what = g.moving.dir === "in"
      ? t("Getting “{name}” from {phone}", { name: g.moving.name, phone: g.moving.peer || t("your other phone") })
      : g.moving.via === "drive"
        ? t("Leaving “{name}” in your Drive for {phone}", { name: g.moving.name, phone: g.moving.peer || t("your other phone") })
        : t("Sending “{name}” to {phone}", { name: g.moving.name, phone: g.moving.peer || t("your other phone") });
    return (
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 13.5, color: T.text, lineHeight: 1.45, overflow: "hidden", textOverflow: "ellipsis" }}>{what}</div>
        <div style={{ height: 4, background: T.border, borderRadius: 2, marginTop: 8, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: T.accent, transition: "width 0.3s" }} />
        </div>
        <div style={{ fontSize: 12, color: T.muted, marginTop: 5 }}>
          {g.moving.total > 0 ? `${mb(g.moving.done)} / ${mb(g.moving.total)} MB` : ""}
          {g.missing > 1 ? " · " + tn(g.missing - 1, "{n} more after this", "{n} more after this") : ""}
        </div>
      </div>
    );
  }
  if (!others.length) line = t("Sign in on another phone and your songs go there too.");
  else if (g.note === "phone-full") line = t("This phone is full. Make room to get the rest of your songs.");
  else if (g.note === "wifi" && (g.missing || g.theyMiss)) line = t("Waiting for wifi. Or turn on mobile data for songs below.");
  else if (g.missing && g.waitingOn.length) line = tn(g.missing, "{n} song is on {phone} and not here yet. Open MPTree on {phone} to get it.", "{n} songs are on {phone} and not here yet. Open MPTree on {phone} to get them.", { phone: g.waitingOn.join(", ") });
  else if (g.missing) line = tn(g.missing, "{n} song on its way to this phone.", "{n} songs on their way to this phone.");
  else if (g.note === "drive-full" && g.theyMiss) line = t("Your Google Drive is full, so songs can only go straight across. Open MPTree on both phones.");
  else if (g.theyMiss) line = tn(g.theyMiss, "{n} song from this phone still going to your other phones.", "{n} songs from this phone still going to your other phones.");
  else line = tn(g.here, "Your {n} song is on every phone.", "All {n} songs are on every phone.");
  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}`, fontSize: 13.5, color: T.text, lineHeight: 1.45 }}>
      {line}
      {g.arrived > 0 && <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>{tn(g.arrived, "{n} song arrived since you opened MPTree.", "{n} songs arrived since you opened MPTree.")}</div>}
    </div>
  );
}

function DeviceList({ devices, me, onRemove, busy, T }: { devices: Device[]; me?: string; onRemove: (d: Device) => void; busy: boolean; T: T }) {
  const [asking, setAsking] = useState<string | null>(null);
  return (
    <div style={{ marginTop: 6 }}>
      {devices.map(d => (
        <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: `1px solid ${T.border}` }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 14.5, color: T.text }}>{d.name}</span>
            <span style={{ display: "block", fontSize: 12, color: T.muted, marginTop: 1 }}>
              {d.id === me ? t("This phone") : t("Added {date}", { date: new Date(d.addedAt).toLocaleDateString() })}
            </span>
          </span>
          {d.id !== me && (asking === d.id ? (
            <button onClick={() => { setAsking(null); onRemove(d); }} disabled={busy}
              style={{ background: T.accent, color: T.playBtnFg, border: "none", borderRadius: 9, padding: "7px 11px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              {t("Take off")}
            </button>
          ) : (
            <button onClick={() => setAsking(d.id)} disabled={busy}
              style={{ background: "transparent", color: T.muted, border: `1px solid ${T.border}`, borderRadius: 9, padding: "6px 10px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              {t("Remove")}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Google's G, in its own colours on a white disc: Google's sign-in rules ask
 *  for the standard G, and the disc keeps it tidy on a black button. The only
 *  colour on the page, and it is Google's, not ours. */
function GoogleG() {
  return (
    <span style={{ width: 22, height: 22, borderRadius: 11, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width="14" height="14" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
      </svg>
    </span>
  );
}
