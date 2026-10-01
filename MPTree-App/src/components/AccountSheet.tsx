import { useEffect, useState, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { makeSH, type T } from "../themes";
import { t, tn, fmtBytes } from "../i18n";
import { IC } from "./Icons";
import { Switch } from "./Switch";
import { useAccountPro, useTrial } from "../pro";
import {
  useSync, signIn, signOut, cancelJoin, removeDevice, renameDevice, dismissRemoved, setMobileData, testPhone, deleteDoubles,
  MOBILE_DAILY, type SyncState, type Device, type TestStep,
} from "../sync/engine";

// ─── ACCOUNT & SYNC ──────────────────────────────────────────────────────────
// The one page about the MPTree account. Short sentences, one idea each: it
// should make sense to someone who reads it in ten seconds.

const Svg = ({ children, size = 20 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
export const CloudIcon = () => <Svg size={19}><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/></Svg>;
const Phones = () => <Svg size={18}><rect x="2" y="4" width="10" height="16" rx="2"/><rect x="14" y="7" width="8" height="13" rx="2"/></Svg>;
const Heart = () => <Svg size={18}><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/></Svg>;
const Music = () => <Svg size={18}><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></Svg>;

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
  if (h < 48) return tn(h, "{n} hour ago", "{n} hours ago");
  return tn(Math.round(h / 24), "{n} day ago", "{n} days ago");
}

const mb = (n: number) => (n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0);

export function AccountSheet({ pro, onOpenPro, onClose, onToast, T }: Props) {
  const sh = makeSH(T);
  const s = useSync();
  const [busy, setBusy] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const [removeReceived, setRemoveReceived] = useState(false);
  const viaAccount = useAccountPro();
  const trial = useTrial();
  const proFromAccount = viaAccount && trial.state !== "live";
  // "Saved 2 minutes ago" keeps moving while the page is open.
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick(n => n + 1), 20_000); return () => clearInterval(id); }, []);

  const native = Capacitor.getPlatform() !== "web" || import.meta.env.DEV;

  const doSignIn = async () => {
    const had = pro;
    setBusy(true);
    const r = await signIn();
    setBusy(false);
    if (r === "failed") onToast(t("Could not sign in. Check your connection and try again."));
    else if (r === "nopro") onToast(t("This account has no MPTree Pro yet. Sign in with the account your device with Pro uses."));
    else if (r === "ok" && !had) onToast(t("MPTree Pro is on, from your account"));
  };
  const doRemove = async (d: Device) => {
    setBusy(true);
    try { await removeDevice(d.id); onToast(t("{name} is off your account", { name: d.name })); }
    catch { onToast(t("Could not reach Google Drive. Try again in a moment.")); }
    setBusy(false);
  };
  const doSignOut = async () => {
    setBusy(true);
    const gone = await signOut(removeReceived);
    setBusy(false);
    setConfirmOut(false);
    onToast(removeReceived
      ? tn(gone, "Signed out. {n} song from your other devices was deleted.", "Signed out. {n} songs from your other devices were deleted.")
      : t("Signed out. Everything stays on this device."));
  };
  const doTest = async (step: TestStep, done: string) => {
    setBusy(true);
    try { await testPhone(step); onToast(done); }
    catch { onToast(t("Could not reach Google Drive. Try again in a moment.")); }
    setBusy(false);
  };

  const btn = { ...sh.saveBtn, fontFamily: "inherit" };
  const card = { background: T.dim, borderRadius: 14, padding: "14px 16px", marginTop: 10 } as const;
  const small = { fontSize: 13, color: T.textSub, lineHeight: 1.5 } as const;
  const link = { ...btn, background: "transparent", color: T.muted, fontWeight: 600, fontSize: 14, marginTop: 4 };
  const point = (icon: ReactNode, text: string) => (
    <div key={text} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "7px 0", fontSize: 14.5, color: T.text, lineHeight: 1.45 }}>
      <span style={{ display: "flex", color: T.muted, flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <span>{text}</span>
    </div>
  );

  // What the account is, for anyone not signed in yet.
  const intro = (
    <div style={{ ...card, marginTop: 0, padding: "16px 16px 10px" }}>
      <div style={{ fontSize: 17, fontWeight: 800, color: T.text, marginBottom: 6 }}>{t("Your music on all your devices")}</div>
      {point(<Phones />, tn(MAX, "Sign in on up to {n} device.", "Sign in on up to {n} devices."))}
      {point(<Heart />, t("Playlists, likes and settings are the same on all of them."))}
      {point(<Music />, t("Your songs are copied between your devices, over wifi."))}
    </div>
  );

  let body: ReactNode;
  let bottom: ReactNode;

  if (!native) {
    body = intro;
    bottom = <div style={{ ...small, textAlign: "center" }}>{t("Sign in with Google in the MPTree app on your phone.")}</div>;
  } else if (!pro && s.phase !== "on") {
    body = intro;
    bottom = (
      <>
        <div style={{ ...small, textAlign: "center", marginBottom: 12 }}>{t("Part of MPTree Pro.")}</div>
        <button onClick={onOpenPro} style={btn}>{t("Get MPTree Pro")}</button>
        <button onClick={doSignIn} disabled={busy || s.phase === "joining"} style={{ ...link, opacity: busy ? 0.6 : 1 }}>
          {busy || s.phase === "joining" ? t("Signing in…") : t("Have Pro on another device? Sign in")}
        </button>
      </>
    );
  } else if (s.phase === "limit") {
    body = (
      <div style={{ ...card, marginTop: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{tn(MAX, "Your account is on {n} device already", "Your account is on {n} devices already")}</div>
        <div style={{ ...small, marginTop: 6 }}>{t("Take one off to use it here. Nothing is deleted from that device.")}</div>
        <DeviceList devices={s.devices.filter(d => !d.test)} me={s.deviceId} onRemove={doRemove} busy={busy} T={T} />
      </div>
    );
    bottom = <button onClick={cancelJoin} style={link}>{t("Cancel")}</button>;
  } else if (s.phase === "removed") {
    body = (
      <div style={{ ...card, marginTop: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>
          {s.removedWhy === "emptied" ? t("Your account was emptied") : t("This device was taken off your account")}
        </div>
        <div style={{ ...small, marginTop: 6 }}>
          {s.removedWhy === "emptied"
            ? t("Its data was deleted in Google Drive. Everything on this device stays as it is.")
            : t("That was done from another device. Everything on this device stays as it is.")}
        </div>
      </div>
    );
    bottom = (
      <>
        <button onClick={() => { dismissRemoved(); void doSignIn(); }} style={btn}>{t("Sign in again")}</button>
        <button onClick={dismissRemoved} style={link}>{t("OK")}</button>
      </>
    );
  } else if (s.phase === "on") {
    const status = s.pausedNoPro ? t("Paused")
      : s.problem === "offline" ? t("Waiting for internet")
      : s.problem === "signin" ? t("Sign in again to keep syncing")
      : s.problem === "drive" ? t("Could not reach Google Drive. Trying again soon.")
      : s.saving ? t("Saving…")
      : s.lastSaved ? t("Saved {when}", { when: ago(s.lastSaved) })
      : t("Saving…");
    const realDevices = s.devices.filter(d => !d.test);
    const testOn = s.devices.some(d => d.test);
    const testRow = (label: string, step: TestStep, done: string) => (
      <button disabled={busy} onClick={() => doTest(step, done)}
        style={{ ...btn, background: T.surface, color: T.text, marginTop: 8, opacity: busy ? 0.6 : 1 }}>{label}</button>
    );
    body = (
      <>
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

        {s.pausedNoPro ? (
          <div style={card}>
            <div style={{ fontSize: 14, color: T.text, lineHeight: 1.5 }}>
              {t("Syncing is part of MPTree Pro, so it has stopped. Nothing is lost, and it carries on when Pro is back.")}
            </div>
          </div>
        ) : (
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.muted, marginBottom: 4 }}>{t("Songs")}</div>
            <SongStatus s={s} T={T} />
            {s.songs.doubles.length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 14, color: T.text, lineHeight: 1.45 }}>
                  {tn(s.songs.doubles.length, "{n} song is on this device twice.", "{n} songs are on this device twice.")}
                </div>
                <button disabled={busy} onClick={async () => {
                  setBusy(true);
                  const n = await deleteDoubles().catch(() => 0);
                  setBusy(false);
                  onToast(tn(n, "{n} extra copy deleted", "{n} extra copies deleted"));
                }} style={{ ...btn, background: T.surface, color: T.text, marginTop: 10, opacity: busy ? 0.6 : 1 }}>
                  {t("Delete the extra copies")}
                </button>
              </div>
            )}
          </div>
        )}

        <div style={{ ...sh.lbl, marginTop: 20 }}>{t("Your devices ({n} of {max})", { n: realDevices.length, max: MAX })}</div>
        <DeviceList devices={s.devices} me={s.deviceId} onRemove={doRemove} busy={busy} T={T} />

        <button onClick={() => setMobileData(!s.mobileData)}
          style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", marginTop: 16 }}>
          <span>
            <span style={{ display: "block", fontSize: 15, color: T.text }}>{t("Sync songs over mobile data")}</span>
            <span style={{ display: "block", fontSize: 12.5, color: T.muted, marginTop: 2, lineHeight: 1.4 }}>
              {t("Off: songs only sync on wifi. On: also on mobile data, at most {size} a day.", { size: fmtBytes(MOBILE_DAILY) })}
            </span>
          </span>
          <Switch on={s.mobileData} T={T} />
        </button>

        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.muted, marginBottom: 2 }}>{t("Good to know")}</div>
          {[
            t("Deleting a song permanently only takes it off this device. You can get it back in the bin, under Permanently deleted."),
            t("Language, text size, audio effects and the app icon are set per device."),
            t("Voice notes and short clips stay on the device they are on."),
            t("Everything is kept in your own Google Drive, in a folder only MPTree can open."),
          ].map(x => <div key={x} style={{ ...small, color: T.text, padding: "5px 0" }}>{x}</div>)}
        </div>

        {(__PRO_TEST__ || import.meta.env.DEV) && !s.pausedNoPro && (
          <div style={{ ...card, marginTop: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{t("Test device")}</div>
            <div style={{ ...small, marginTop: 6 }}>
              {t("Only in test builds. A pretend second device in your Drive, with three short songs, so you can try syncing with one device.")}
            </div>
            {!testOn ? testRow(t("Add a test device"), "add", t("Test device added. Its songs come in over the next minute."))
              : (
                <>
                  {testRow(t("Test device makes a playlist"), "playlist", t("The test device made a playlist and liked a song"))}
                  {testRow(t("Test device deletes its songs permanently"), "delete", t("The test device deleted its songs. Look in the bin."))}
                  {testRow(t("Remove the test device"), "remove", t("Test device removed"))}
                </>
              )}
          </div>
        )}
      </>
    );
    bottom = (
      <>
        {s.pausedNoPro && <button onClick={onOpenPro} style={{ ...btn, marginBottom: 8 }}>{t("Get MPTree Pro")}</button>}
        {s.problem === "signin" && <button onClick={doSignIn} style={{ ...btn, marginBottom: 8 }}>{t("Sign in again")}</button>}
        {confirmOut ? (
          <div style={{ ...card, marginTop: 0 }}>
            <div style={{ fontSize: 14, color: T.text, lineHeight: 1.5 }}>
              {t("Sign out on this device? Your playlists and songs stay on it. It just stops syncing.")}
              {proFromAccount && " " + t("MPTree Pro came with your account, so it stops here too.")}
            </div>
            {s.songs.received > 0 && (
              <button onClick={() => setRemoveReceived(!removeReceived)}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%", background: "transparent", border: "none", padding: "12px 0 0", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                <span style={{ fontSize: 13.5, color: T.text, lineHeight: 1.45 }}>
                  {tn(s.songs.received, "Also delete the {n} song that came from your other devices", "Also delete the {n} songs that came from your other devices")}
                </span>
                <Switch on={removeReceived} T={T} />
              </button>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={() => setConfirmOut(false)} style={{ ...btn, background: T.surface, color: T.text }}>{t("Cancel")}</button>
              <button onClick={doSignOut} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>{t("Sign out")}</button>
            </div>
          </div>
        ) : (
          <button onClick={() => { setRemoveReceived(false); setConfirmOut(true); }} style={{ ...btn, background: T.dim, color: T.text }}>{t("Sign out")}</button>
        )}
      </>
    );
  } else {
    body = intro;
    bottom = (
      <>
        <button onClick={doSignIn} disabled={busy || s.phase === "joining"} style={{ ...btn, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, opacity: busy ? 0.7 : 1 }}>
          <GoogleG />{busy || s.phase === "joining" ? t("Signing in…") : t("Sign in with Google")}
        </button>
        <div style={{ ...small, textAlign: "center", marginTop: 8 }}>
          {t("MPTree only gets its own hidden folder in your Google Drive.")}
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
        <div style={{ overflowY: "auto", padding: "0 20px 8px" }}>{body}</div>
        {bottom && <div style={{ padding: "12px 20px 0", flexShrink: 0 }}>{bottom}</div>}
      </div>
    </div>
  );
}

/** One plain line about the songs, or the song on its way. */
function SongStatus({ s, T }: { s: SyncState; T: T }) {
  const g = s.songs;
  const others = s.devices.filter(d => d.id !== s.deviceId);
  if (g.moving) {
    const pct = g.moving.total > 0 ? Math.min(100, Math.round(g.moving.done / g.moving.total * 100)) : 0;
    const what = g.moving.dir === "in"
      ? t("Getting “{name}” from {phone}", { name: g.moving.name, phone: g.moving.peer || t("your other device") })
      : t("Sending “{name}” to {phone}", { name: g.moving.name, phone: g.moving.peer || t("your other device") });
    return (
      <>
        <div style={{ fontSize: 14, color: T.text, lineHeight: 1.45, overflow: "hidden", textOverflow: "ellipsis" }}>{what}</div>
        <div style={{ height: 4, background: T.border, borderRadius: 2, marginTop: 8, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: T.accent, transition: "width 0.3s" }} />
        </div>
        <div style={{ fontSize: 12, color: T.muted, marginTop: 5 }}>
          {g.moving.total > 0 ? `${mb(g.moving.done)} / ${mb(g.moving.total)} MB` : ""}
          {g.missing > 1 ? " · " + tn(g.missing - 1, "{n} more after this", "{n} more after this") : ""}
        </div>
        <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>{t("Keep MPTree open until the song is done.")}</div>
      </>
    );
  }
  let line: string;
  if (!others.length) line = t("Sign in on another device and your songs go there too.");
  else if (g.note === "phone-full") line = t("This device is full. Free up {size} to get the rest.", { size: fmtBytes(Math.max(0, (g.needBytes ?? 0) - Math.max(0, (g.freeBytes ?? 0) - 500 * 1024 * 1024))) });
  else if (g.note === "mobile-limit") line = t("Today's mobile data for songs is used up. The rest waits for wifi.");
  else if (g.note === "wifi" && (g.missing || g.theyMiss)) line = t("Waiting for wifi.");
  else if (g.missing && g.waitingOn.length) line = tn(g.missing, "{n} song comes in when you open MPTree on {phone}.", "{n} songs come in when you open MPTree on {phone}.", { phone: g.waitingOn.join(", ") });
  else if (g.missing) line = tn(g.missing, "{n} song on its way to this device.", "{n} songs on their way to this device.");
  else if (g.theyMiss) line = tn(g.theyMiss, "{n} song still going to your other devices.", "{n} songs still going to your other devices.");
  else line = t("All your songs are on this device.");
  return (
    <>
      <div style={{ fontSize: 14, color: T.text, lineHeight: 1.45 }}>{line}</div>
      {g.arrived > 0 && <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>{tn(g.arrived, "{n} song arrived since you opened MPTree.", "{n} songs arrived since you opened MPTree.")}</div>}
    </>
  );
}

/** The devices on the account. A name can be changed by tapping it, so two
 *  of the same model, or a tablet and a phone, are easy to tell apart. */
function DeviceList({ devices, me, onRemove, busy, T }: {
  devices: Device[]; me?: string; onRemove: (d: Device) => void; busy: boolean; T: T;
}) {
  const [asking, setAsking] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const save = () => {
    if (editing) void renameDevice(editing.id, editing.name).catch(() => {});
    setEditing(null);
  };
  return (
    <div style={{ marginTop: 6 }}>
      {devices.map(d => (
        <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: `1px solid ${T.border}` }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            {editing?.id === d.id ? (
              <input autoFocus value={editing.name} maxLength={30} aria-label={t("Name of this device")}
                onChange={e => setEditing({ id: d.id, name: e.target.value })}
                onBlur={save} onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(null); }}
                style={{ width: "100%", boxSizing: "border-box", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "6px 9px", color: T.text, fontSize: 14.5, fontFamily: "inherit", outline: "none" }} />
            ) : (
              <button onClick={() => !d.test && setEditing({ id: d.id, name: d.name })} disabled={busy || d.test}
                aria-label={t("Rename")}
                style={{ display: "flex", alignItems: "center", gap: 6, maxWidth: "100%", background: "transparent", border: "none", padding: 0, cursor: d.test ? "default" : "pointer", fontFamily: "inherit", textAlign: "left" }}>
                <span style={{ fontSize: 14.5, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                {!d.test && <span style={{ display: "flex", color: T.muted, flexShrink: 0 }}><IC.Edit /></span>}
              </button>
            )}
            <span style={{ display: "block", fontSize: 12, color: T.muted, marginTop: 1 }}>
              {d.id === me ? t("This device")
                : d.test ? t("Pretend, for testing")
                : t("Last used {when}", { when: ago(d.lastActive ?? d.addedAt) })}
            </span>
          </span>
          {d.id !== me && !d.test && (asking === d.id ? (
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
