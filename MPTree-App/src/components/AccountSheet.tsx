import { useEffect, useState, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { makeSH, type T } from "../themes";
import { t, tn, fmtBytes } from "../i18n";
import { IC } from "./Icons";
import { Switch } from "./Switch";
import { ModeSwitch, PhoneIcon, DevicesIcon } from "./ModeSwitch";
import {
  useSync, signIn, signOut, cancelJoin, removeDevice, dismissRemoved, setMobileData, testPhone,
  MOBILE_DAILY, type SyncState, type Device, type TestStep,
} from "../sync/engine";

// ─── ACCOUNT & SYNC ──────────────────────────────────────────────────────────
// The one page about the MPTree account. It answers one question before any
// other, in as few words as it can: what is where. Three short blocks, always
// on the page whatever state the account is in: This device, All devices, and
// what stays with each device either way. Then the songs.

const Svg = ({ children, size = 20 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
export const CloudIcon = () => <Svg size={19}><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/></Svg>;
const Music = () => <Svg><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></Svg>;
const Pin = () => <Svg><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></Svg>;

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
  // "Saved 2 minutes ago" keeps moving while the page is open.
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick(n => n + 1), 20_000); return () => clearInterval(id); }, []);

  const native = Capacitor.getPlatform() !== "web" || import.meta.env.DEV;
  const on = s.phase === "on" && !s.pausedNoPro;

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
    const gone = await signOut(removeReceived);
    setBusy(false);
    setConfirmOut(false);
    onToast(removeReceived
      ? tn(gone, "Signed out. {n} song from your other devices was removed.", "Signed out. {n} songs from your other devices were removed.")
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
  const small = { fontSize: 13, color: T.textSub, lineHeight: 1.5, marginTop: 6 } as const;
  const link = { ...btn, background: "transparent", color: T.muted, fontWeight: 600, fontSize: 14, marginTop: 4 };
  const block = (icon: ReactNode, title: string, body: string, current?: boolean) => (
    <div style={{ ...card, border: `1.5px solid ${current ? T.accent : "transparent"}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, color: T.text, fontSize: 15, fontWeight: 700 }}>
        <span style={{ display: "flex", flexShrink: 0 }}>{icon}</span>
        <span style={{ flex: 1 }}>{title}</span>
        {current && <span style={{ fontSize: 11, fontWeight: 800, color: T.muted, letterSpacing: "0.05em", textTransform: "uppercase" }}>{t("Showing")}</span>}
      </div>
      <div style={small}>{body}</div>
    </div>
  );

  // ── What is where ──
  const what = (
    <>
      {block(<PhoneIcon size={19} />, t("This device"),
        t("What you already had: your songs, playlists, likes, bin and look. It stays on this device, and your other devices never see it."),
        on && s.mode === "device")}
      {block(<DevicesIcon size={19} />, t("All devices"),
        t("One library on all your devices, with the songs of every one of them. It has its own playlists, likes, bin and look. What you do here happens on every device. It is kept in your own Google Drive."),
        on && s.mode === "all")}
      {block(<Pin />, t("Always per device"),
        t("Language, text size, audio effects and the app icon. They stay the same whichever library you look at."))}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: T.text, fontSize: 15, fontWeight: 700 }}>
          <span style={{ display: "flex", flexShrink: 0 }}><Music /></span>{t("Your songs")}
        </div>
        <div style={small}>
          {t("Songs are not kept in your account. They go from device to device, so each one has them all. Songs from your other devices land in Music/MPTree and show in All devices only.")}
        </div>
        <div style={small}>
          {t("Delete a song for good and your other devices keep it, in the bin of All devices. You can get it back from them in the bin, under Deleted for good here.")}
        </div>
        <div style={small}>{t("Voice notes, recordings and clips under a minute stay in This device.")}</div>
        {on && <SongStatus s={s} T={T} />}
      </div>
    </>
  );

  // ── What the top and bottom of the page do, per state ──
  let top: ReactNode = null;
  let bottom: ReactNode;

  if (!native) {
    bottom = <div style={{ ...small, textAlign: "center" }}>{t("Sign in with Google in the MPTree app on your phone.")}</div>;
  } else if (!pro && s.phase !== "on") {
    bottom = (
      <>
        <div style={{ ...small, textAlign: "center", marginTop: 0, marginBottom: 12 }}>
          {tn(MAX, "Part of MPTree Pro, on up to {n} device.", "Part of MPTree Pro, on up to {n} devices.")}
        </div>
        <button onClick={onOpenPro} style={btn}>{t("Get MPTree Pro")}</button>
      </>
    );
  } else if (s.phase === "limit") {
    top = (
      <div style={{ ...card, marginTop: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{tn(MAX, "Your account is on {n} device already", "Your account is on {n} devices already")}</div>
        <div style={small}>{t("Take one off to use your account here. Nothing is deleted from it; it just stops syncing.")}</div>
        <DeviceList devices={s.devices.filter(d => !d.test)} me={s.deviceId} onRemove={doRemove} busy={busy} T={T} />
      </div>
    );
    bottom = <button onClick={cancelJoin} style={link}>{t("Cancel")}</button>;
  } else if (s.phase === "removed") {
    top = (
      <div style={{ ...card, marginTop: 0 }}>
        {s.removedWhy === "emptied" ? (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{t("Your account was emptied")}</div>
            <div style={small}>{t("Its data was deleted in Google Drive, so this device stopped syncing. This device stays as it is, and keeps the songs that came from your other devices. Sign in again to start a new account from here.")}</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{t("This device was taken off your account")}</div>
            <div style={small}>{t("That was done from another device. This device stays as it is, and keeps the songs that came from your other devices.")}</div>
          </>
        )}
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
    top = (
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
          <div style={{ ...card, marginTop: 8 }}>
            <div style={{ fontSize: 14, color: T.text, lineHeight: 1.5 }}>
              {t("All devices is part of MPTree Pro, so it has stopped. Nothing is lost: your account keeps it, and it carries on when Pro is back.")}
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 10 }}><ModeSwitch T={T} /></div>
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
              {t("Sign out on this device? All devices disappears from here and This device stays as it is. Your account keeps All devices for your other devices.")}
            </div>
            {s.songs.received > 0 && (
              <button onClick={() => setRemoveReceived(!removeReceived)}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%", background: "transparent", border: "none", padding: "12px 0 0", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                <span style={{ fontSize: 13.5, color: T.text, lineHeight: 1.45 }}>
                  {removeReceived
                    ? tn(s.songs.received, "Delete the {n} song that came from your other devices", "Delete the {n} songs that came from your other devices")
                    : tn(s.songs.received, "Keep the {n} song that came from your other devices, in This device", "Keep the {n} songs that came from your other devices, in This device")}
                </span>
                <Switch on={!removeReceived} T={T} />
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
    bottom = (
      <>
        <button onClick={doSignIn} disabled={busy || s.phase === "joining"} style={{ ...btn, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, opacity: busy ? 0.7 : 1 }}>
          <GoogleG />{busy || s.phase === "joining" ? t("Signing in…") : t("Sign in with Google")}
        </button>
        <div style={{ ...small, textAlign: "center", marginTop: 8 }}>
          {tn(MAX, "On up to {n} device. MPTree only gets its own folder in your Drive.", "On up to {n} devices. MPTree only gets its own folder in your Drive.")}
        </div>
      </>
    );
  }

  const realDevices = s.devices.filter(d => !d.test);
  const testOn = s.devices.some(d => d.test);
  const testRow = (label: string, step: TestStep, done: string) => (
    <button disabled={busy} onClick={() => doTest(step, done)}
      style={{ ...btn, background: T.surface, color: T.text, marginTop: 8, opacity: busy ? 0.6 : 1 }}>{label}</button>
  );

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
          {what}
          {s.phase === "on" && (
            <>
              <button onClick={() => setMobileData(!s.mobileData)}
                style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                <span>
                  <span style={{ display: "block", fontSize: 15, color: T.text }}>{t("Use mobile data for songs")}</span>
                  <span style={{ display: "block", fontSize: 12.5, color: T.muted, marginTop: 2, lineHeight: 1.4 }}>
                    {t("Off: songs only move on wifi. On: at most {size} a day. Your account is always saved.", { size: fmtBytes(MOBILE_DAILY) })}
                  </span>
                </span>
                <Switch on={s.mobileData} T={T} />
              </button>
              <div style={{ ...sh.lbl, marginTop: 20 }}>{t("Devices ({n} of {max})", { n: realDevices.length, max: MAX })}</div>
              <DeviceList devices={s.devices} me={s.deviceId} onRemove={doRemove} busy={busy} T={T} />
              {(__PRO_TEST__ || import.meta.env.DEV) && !s.pausedNoPro && (
                <div style={{ ...card, marginTop: 20 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{t("Test phone")}</div>
                  <div style={small}>
                    {t("Only in test builds. A pretend second device in your Drive, with three short songs of its own, so you can try All devices with one phone.")}
                  </div>
                  {!testOn ? testRow(t("Add a test phone"), "add", t("Test phone added. Its songs come in over the next minute."))
                    : (
                      <>
                        {testRow(t("Test phone makes a playlist"), "playlist", t("The test phone made a playlist and liked a song"))}
                        {testRow(t("Test phone deletes its songs for good"), "delete", t("The test phone deleted its songs. Look in the bin of All devices."))}
                        {testRow(t("Remove the test phone"), "remove", t("Test phone removed"))}
                      </>
                    )}
                </div>
              )}
            </>
          )}
        </div>

        {bottom && <div style={{ padding: "12px 20px 0", flexShrink: 0 }}>{bottom}</div>}
      </div>
    </div>
  );
}

function SongStatus({ s, T }: { s: SyncState; T: T }) {
  const g = s.songs;
  const others = s.devices.filter(d => d.id !== s.deviceId);
  const extra: ReactNode[] = [];
  if (s.deleted.length > 0) extra.push(
    <div key="del" style={{ color: T.muted }}>
      {tn(s.deleted.length, "{n} song deleted for good here. See the bin to get it back.", "{n} songs deleted for good here. See the bin to get them back.")}
    </div>);
  if (g.inDrive.count > 0) extra.push(
    <div key="drive" style={{ color: T.muted }}>
      {tn(g.inDrive.count, "{n} song waiting in your Drive ({size}), until the device it is for opens MPTree.", "{n} songs waiting in your Drive ({size}), until the device they are for opens MPTree.", { size: fmtBytes(g.inDrive.bytes) })}
    </div>);

  let main: ReactNode;
  if (g.moving) {
    const pct = g.moving.total > 0 ? Math.min(100, Math.round(g.moving.done / g.moving.total * 100)) : 0;
    const what = g.moving.dir === "in"
      ? t("Getting “{name}” from {phone}", { name: g.moving.name, phone: g.moving.peer || t("your other device") })
      : g.moving.via === "drive"
        ? t("Leaving “{name}” in your Drive for {phone}", { name: g.moving.name, phone: g.moving.peer || t("your other device") })
        : t("Sending “{name}” to {phone}", { name: g.moving.name, phone: g.moving.peer || t("your other device") });
    main = (
      <>
        <div style={{ fontSize: 13.5, color: T.text, lineHeight: 1.45, overflow: "hidden", textOverflow: "ellipsis" }}>{what}</div>
        <div style={{ height: 4, background: T.border, borderRadius: 2, marginTop: 8, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: T.accent, transition: "width 0.3s" }} />
        </div>
        <div style={{ fontSize: 12, color: T.muted, marginTop: 5 }}>
          {g.moving.total > 0 ? `${mb(g.moving.done)} / ${mb(g.moving.total)} MB` : ""}
          {g.missing > 1 ? " · " + tn(g.missing - 1, "{n} more after this", "{n} more after this") : ""}
        </div>
        <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>{t("Keep MPTree open. The screen stays on until it is done.")}</div>
      </>
    );
  } else {
    let line: string;
    if (!others.length) line = t("Sign in on another device and your songs go there too.");
    else if (g.note === "phone-full") line = t("Not enough room on this device: the songs still to come need {need}, and {free} is free. They show greyed out in All devices until you make room.", { need: fmtBytes(g.needBytes ?? 0), free: fmtBytes(Math.max(0, g.freeBytes ?? 0)) });
    else if (g.note === "mobile-limit") line = t("Today's {size} over mobile data is used up. The rest waits for wifi or tomorrow.", { size: fmtBytes(MOBILE_DAILY) });
    else if (g.note === "wifi" && (g.missing || g.theyMiss)) line = t("Waiting for wifi. Or turn on mobile data for songs below.");
    else if (g.missing && g.waitingOn.length) line = tn(g.missing, "{n} song is on {phone} and not here yet. Open MPTree on {phone} to get it.", "{n} songs are on {phone} and not here yet. Open MPTree on {phone} to get them.", { phone: g.waitingOn.join(", ") });
    else if (g.missing) line = tn(g.missing, "{n} song on its way to this device.", "{n} songs on their way to this device.");
    else if (g.note === "drive-full" && g.theyMiss) line = t("Your Google Drive is full, so songs can only go straight across. Open MPTree on both devices.");
    else if (g.theyMiss) line = tn(g.theyMiss, "{n} song from this device still going to your other devices.", "{n} songs from this device still going to your other devices.");
    else line = tn(g.here, "Your {n} song is on every device.", "All {n} songs are on every device.");
    main = <>{line}</>;
  }
  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}`, fontSize: 13.5, color: T.text, lineHeight: 1.45 }}>
      {main}
      {g.arrived > 0 && <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>{tn(g.arrived, "{n} song arrived since you opened MPTree.", "{n} songs arrived since you opened MPTree.")}</div>}
      {extra.map((x, i) => <div key={i} style={{ marginTop: 10 }}>{x}</div>)}
    </div>
  );
}

function DeviceList({ devices, me, onRemove, busy, T }: {
  devices: Device[]; me?: string; onRemove: (d: Device) => void; busy: boolean; T: T;
}) {
  const [asking, setAsking] = useState<string | null>(null);
  return (
    <div style={{ marginTop: 6 }}>
      {devices.map(d => (
        <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: `1px solid ${T.border}` }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 14.5, color: T.text }}>{d.name}</span>
            <span style={{ display: "block", fontSize: 12, color: T.muted, marginTop: 1 }}>
              {d.id === me ? t("This device")
                : d.test ? t("Pretend, for testing")
                : t("Added {date}", { date: new Date(d.addedAt).toLocaleDateString() }) + " · " + t("last used {when}", { when: ago(d.lastActive ?? d.addedAt) })}
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
