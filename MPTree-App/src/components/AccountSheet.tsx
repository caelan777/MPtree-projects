import { useEffect, useState, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { makeSH, type T } from "../themes";
import { t, tn, fmtBytes } from "../i18n";
import { IC } from "./Icons";
import { Loading } from "./Loading";
import { Switch } from "./Switch";
import { useAccountPro, useTrial, hasPro } from "../pro";
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
  // One of the folded parts under the sync card, open.
  const [openPart, setOpenPart] = useState<null | "devices" | "how">(null);
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
    else if (r === "ok" && !had && hasPro()) onToast(t("MPTree Pro is on, from your account"));
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
  // What the account is, for anyone not signed in yet.
  // Signed out: the same picture as signed in without Pro, so the two pages
  // of one story look like it.
  const intro = (
    <div style={{ textAlign: "center", padding: "30px 8px 10px" }}>
      <SyncPicture T={T} />
      <div style={{ fontSize: 17, fontWeight: 800, color: T.text, marginTop: 22, letterSpacing: "-0.01em" }}>
        {t("All your songs, on all your devices")}
      </div>
      <div style={{ fontSize: 14, color: T.textSub, lineHeight: 1.55, margin: "8px auto 0", maxWidth: 380 }}>
        {tn(MAX, "Sign in on up to {n} device. Your songs, playlists, likes and settings are the same on all of them.", "Sign in on up to {n} devices. Your songs, playlists, likes and settings are the same on all of them.")}
      </div>
    </div>
  );

  let body: ReactNode;
  let bottom: ReactNode;

  if (!s.ready) {
    // Only just opened: whether there is an account here is not read yet.
    body = <Loading T={T} />;
    bottom = null;
  } else if (!native) {
    body = intro;
    bottom = <div style={{ ...small, textAlign: "center" }}>{t("Sign in with Google in the MPTree app on your phone.")}</div>;
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
    const testOn = s.devices.some(d => d.test);
    const testRow = (label: string, step: TestStep, done: string) => (
      <button disabled={busy} onClick={() => doTest(step, done)}
        style={{ ...btn, background: T.surface, color: T.text, marginTop: 8, opacity: busy ? 0.6 : 1 }}>{label}</button>
    );
    // The library (playlists, likes, settings): saved, saving, or why not.
    const saved = !s.problem && !s.saving && !!s.lastSaved;
    const library = s.problem === "offline" ? t("Waiting for internet")
      : s.problem === "signin" ? t("Sign in again to keep syncing")
      : s.problem === "drive" ? t("Could not reach Google Drive. Trying again soon.")
      : saved ? t("Saved {when}", { when: ago(s.lastSaved!) })
      : t("Saving…");
    const row = {
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%",
      padding: "13px 2px", background: "transparent", borderStyle: "solid", borderColor: T.border, borderWidth: "1px 0 0",
      fontFamily: "inherit", textAlign: "left", color: T.text, cursor: "pointer",
    } as const;
    const chevron = (open: boolean) => (
      <span style={{ display: "flex", color: T.muted, flexShrink: 0, transform: open ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}><IC.ChevronR /></span>
    );
    body = (
      <>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "2px 2px 4px" }}>
          <span style={{ width: 40, height: 40, borderRadius: 20, background: T.accent, color: T.playBtnFg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 17, flexShrink: 0 }}>
            {(s.account?.name || s.account?.email || "?").trim()[0]?.toUpperCase()}
          </span>
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: "block", fontSize: 15, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.account?.name || s.account?.email}</span>
            <span style={{ display: "block", fontSize: 12.5, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t("Signed in as {email}", { email: s.account?.email ?? "" })}</span>
          </span>
        </div>

        {s.pausedNoPro ? (
          <div style={{ textAlign: "center", padding: "30px 8px 10px" }}>
            <SyncPicture T={T} />
            <div style={{ fontSize: 17, fontWeight: 800, color: T.text, marginTop: 22, letterSpacing: "-0.01em" }}>
              {t("All your songs, on all your devices")}
            </div>
            <div style={{ fontSize: 14, color: T.textSub, lineHeight: 1.55, margin: "8px auto 0", maxWidth: 360 }}>
              {t("To start syncing your songs between your devices, buy MPTree Pro, or sign in to a Google account that has Pro.")}
            </div>
          </div>
        ) : (<>
          <div style={{ ...card, background: cardGround(T), padding: "16px 14px", marginTop: 14 }}>
            <SyncCard s={s} T={T} />
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

          <div style={{ marginTop: 14 }}>
            <div style={{ ...row, cursor: "default" }}>
              <span>
                <span style={{ display: "block", fontSize: 14.5, lineHeight: 1.4 }}>{t("Your playlists and likes are the same everywhere")}</span>
                <span style={{ display: "block", fontSize: 12.5, color: s.problem ? T.text : T.muted, marginTop: 2, lineHeight: 1.4 }}>{library}</span>
              </span>
              {saved && <span style={{ display: "flex", flexShrink: 0 }}>{IC.Check(T.text)}</span>}
            </div>
            <button onClick={() => setMobileData(!s.mobileData)} style={row}>
              <span>
                <span style={{ display: "block", fontSize: 14.5, lineHeight: 1.4 }}>{t("Send songs over mobile data too?")}</span>
                <span style={{ display: "block", fontSize: 12.5, color: T.muted, marginTop: 2, lineHeight: 1.4 }}>
                  {t("Off: only over wifi. On: also without wifi, at most {size} a day.", { size: fmtBytes(MOBILE_DAILY) })}
                </span>
              </span>
              <Switch on={s.mobileData} T={T} />
            </button>
            <button onClick={() => setOpenPart(openPart === "devices" ? null : "devices")} style={row} aria-expanded={openPart === "devices"}>
              <span style={{ fontSize: 14.5 }}>{t("Add or remove devices")}</span>
              {chevron(openPart === "devices")}
            </button>
            {openPart === "devices" && (
              <div style={{ padding: "0 2px 6px" }}>
                <div style={{ ...small, paddingBottom: 8 }}>
                  {tn(MAX, "Your account can be on {n} device. To add one, sign in on it with the same Google account.", "Your account can be on {n} devices. To add one, sign in on it with the same Google account.")}
                </div>
                {s.devices.length === 0 && !s.problem
                  ? <Loading T={T} />
                  : <DeviceList devices={s.devices} me={s.deviceId} onRemove={doRemove} busy={busy} T={T} />}
              </div>
            )}
            <button onClick={() => setOpenPart(openPart === "how" ? null : "how")} style={{ ...row, borderWidth: "1px 0" }} aria-expanded={openPart === "how"}>
              <span style={{ fontSize: 14.5 }}>{t("What syncs, and what does not")}</span>
              {chevron(openPart === "how")}
            </button>
            {openPart === "how" && (
              <div style={{ padding: "6px 2px" }}>
                {[
                  t("Your songs, playlists, likes, names, covers and the bin are the same on every device."),
                  t("Language, text size and audio effects are set per device."),
                  t("Voice notes and short clips stay on the device they are on."),
                  t("Deleting a song permanently only takes it off this device. You can get it back in the bin, under Permanently deleted."),
                  t("Everything is kept in your own Google Drive, in a folder only MPTree can open."),
                ].map(x => <div key={x} style={{ ...small, color: T.text, padding: "5px 0" }}>{x}</div>)}
              </div>
            )}
          </div>
        </>)}

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
        {s.pausedNoPro && <button onClick={onOpenPro} style={{ ...btn, marginBottom: 8 }}>{t("Buy MPTree Pro")}</button>}
        {s.problem === "drive" && s.problemDetail && (
          <div style={{ fontSize: 11.5, color: T.muted, margin: "-2px 2px 10px", lineHeight: 1.4, userSelect: "text", wordBreak: "break-word" }}>{s.problemDetail}</div>
        )}
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
          <button onClick={() => { setRemoveReceived(false); setConfirmOut(true); }} style={{ ...btn, background: T.dim, color: T.text }}>{t("Sign out on this device")}</button>
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
          {pro ? t("MPTree only gets its own hidden folder in your Google Drive.")
            : t("Part of MPTree Pro. Sign in first: if your account has Pro, this device has it too.")}
        </div>
      </>
    );
  }

  // A page of its own, the whole screen, like the bin. The app draws edge to
  // edge, so it steps over the status bar and the gesture bar itself.
  const column = { width: "100%", maxWidth: 560, margin: "0 auto", boxSizing: "border-box" } as const;
  return (
    <div style={{ position: "fixed", inset: 0, background: T.bg, zIndex: 450, display: "flex", flexDirection: "column" }}>
      <div style={{ ...column, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "calc(env(safe-area-inset-top, 0px) + 16px) 20px 12px", flexShrink: 0 }}>
        <span style={{ fontSize: 20, fontWeight: 800, color: T.text, letterSpacing: "-0.01em" }}>{t("Account & sync")}</span>
        <button onClick={onClose} style={sh.xBtn} aria-label={t("Close")}><IC.Close /></button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        <div style={{ ...column, padding: "0 20px 16px" }}>{body}</div>
      </div>
      {bottom && <div style={{ ...column, padding: "12px 20px calc(env(safe-area-inset-bottom, 0px) + 20px)", flexShrink: 0 }}>{bottom}</div>}
    </div>
  );
}

/** A phone and a computer with songs going between them: what the account
 *  does once Pro is on. Shown where the sync status would be without it. */
function SyncPicture({ T }: { T: T }) {
  const dot = (delay: number, back = false) => (
    <span style={{
      position: "absolute", top: back ? 15 : 3, left: 0, width: 6, height: 6, borderRadius: "50%", background: T.text,
      animation: `${back ? "mpSyncBack" : "mpSyncGo"} 2.4s linear ${delay}s infinite`, opacity: 0,
    }} />
  );
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, color: T.text }} aria-hidden="true">
      <style>{`
        @keyframes mpSyncGo   { 0% { transform: translateX(0); opacity: 0; } 15%, 85% { opacity: 1; } 100% { transform: translateX(74px); opacity: 0; } }
        @keyframes mpSyncBack { 0% { transform: translateX(74px); opacity: 0; } 15%, 85% { opacity: 1; } 100% { transform: translateX(0); opacity: 0; } }
        @media (prefers-reduced-motion: reduce) { .mp-sync span { animation: none !important; opacity: 0.5 !important; } }
      `}</style>
      <svg width="46" height="76" viewBox="0 0 46 76" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="40" height="70" rx="8" /><line x1="18" y1="64" x2="28" y2="64" />
      </svg>
      <div className="mp-sync" style={{ position: "relative", width: 80, height: 24 }}>
        {dot(0)}{dot(0.8)}{dot(1.6)}{dot(0.4, true)}{dot(1.2, true)}{dot(2, true)}
      </div>
      <svg width="104" height="76" viewBox="0 0 104 76" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="14" y="8" width="76" height="50" rx="6" /><line x1="3" y1="68" x2="101" y2="68" />
      </svg>
    </div>
  );
}

/** The devices on the account in a triangle, this one on top, and below them
 *  one plain sentence about the songs. Dots run along a line while songs go
 *  that way; slowly both ways when everything is in step; not at all when
 *  something is waiting. */
function SyncCard({ s, T }: { s: SyncState; T: T }) {
  const g = s.songs;
  const others = s.devices.filter(d => d.id !== s.deviceId);
  const peer = g.moving?.peer;
  let head: string;
  let sub = "";
  let flow: "in" | "out" | "calm" | "still" = "still";
  if (!s.devices.length && !s.problem) head = t("Loading…");
  else if (s.problem === "offline") head = t("Waiting for internet");
  else if (s.problem === "signin") head = t("Sign in again to keep syncing");
  else if (s.problem === "drive") { head = t("Could not reach Google Drive"); sub = t("Trying again soon."); }
  else if (g.moving) {
    flow = g.moving.dir;
    head = g.moving.dir === "in"
      ? t("{phone} is sending “{name}” to this device", { phone: peer || t("Your other device"), name: g.moving.name })
      : t("Sending “{name}” to {phone}", { name: g.moving.name, phone: peer || t("your other device") });
    sub = t("Keep MPTree open on both until it is there.");
  }
  else if (!others.length) { head = t("Only this device so far"); sub = t("Sign in on another device with the same Google account, and your songs go there too."); }
  else if (g.note === "phone-full") { head = t("This device is full"); sub = t("Free up {size} to get the rest.", { size: fmtBytes(Math.max(0, (g.needBytes ?? 0) - Math.max(0, (g.freeBytes ?? 0) - 500 * 1024 * 1024))) }); }
  else if (g.note === "mobile-limit") { head = t("Today's mobile data for songs is used up"); sub = t("The rest waits for wifi."); }
  else if (g.note === "wifi" && (g.missing || g.theyMiss)) { head = t("Waiting for wifi"); sub = t("Songs only go over wifi. You can change that below."); }
  else if (g.missing && g.waitingOn.length) {
    head = tn(g.missing, "{n} song is still on {phone}", "{n} songs are still on {phone}", { phone: g.waitingOn.join(", ") });
    sub = t("Open MPTree on {phone} to send them here.", { phone: g.waitingOn.join(", ") });
  }
  else if (g.missing) { flow = "in"; head = tn(g.missing, "{n} song on its way to this device", "{n} songs on their way to this device"); sub = t("Keep MPTree open until they are here."); }
  else if (g.theyMiss) { flow = "out"; head = tn(g.theyMiss, "{n} song still going to your other devices", "{n} songs still going to your other devices"); sub = t("Keep MPTree open until they are there."); }
  else {
    flow = "calm";
    head = t("All your songs are on every device");
    if (g.arrived > 0) sub = tn(g.arrived, "{n} song arrived since you opened MPTree.", "{n} songs arrived since you opened MPTree.");
  }
  const pct = g.moving && g.moving.total > 0 ? Math.min(100, Math.round(g.moving.done / g.moving.total * 100)) : null;
  return (
    <>
      <Triangle s={s} flow={flow} peer={peer} T={T} />
      <div style={{ height: 1, background: T.border, margin: "10px 2px 14px" }} />
      <div style={{ padding: "0 2px" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.text, lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis" }}>{head}</div>
        {pct !== null && g.moving && (
          <>
            <div style={{ height: 4, background: T.border, borderRadius: 2, marginTop: 9, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: T.accent, transition: "width 0.3s" }} />
            </div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 5 }}>
              {`${mb(g.moving.done)} / ${mb(g.moving.total)} MB`}
              {g.missing > 1 ? " · " + tn(g.missing - 1, "{n} more after this", "{n} more after this") : ""}
            </div>
          </>
        )}
        {sub && <div style={{ fontSize: 13, color: T.textSub, lineHeight: 1.45, marginTop: 4 }}>{sub}</div>}
      </div>
    </>
  );
}

/** The sync card's ground: the light grey of the design on a white page,
 *  the usual card grey on a dark one, where the light one would vanish. */
function cardGround(T: T): string {
  const h = T.bg.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h.slice(0, 6), 16);
  const lum = ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114;
  return lum > 140 ? T.surface : T.dim;
}

const SPOTS = [{ x: 165, y: 34 }, { x: 60, y: 168 }, { x: 270, y: 168 }];
const cut = (text: string, n = 16) => text.length > n ? text.slice(0, n - 1) + "…" : text;

/** Three places, this device at the top. A free place is drawn dashed. */
function Triangle({ s, flow, peer, T }: { s: SyncState; flow: "in" | "out" | "calm" | "still"; peer?: string; T: T }) {
  const me = s.devices.find(d => d.id === s.deviceId);
  const rest = [...s.devices.filter(d => d.id !== s.deviceId && !d.test), ...s.devices.filter(d => d.test)];
  const spots: (Device | null)[] = [me ?? null, rest[0] ?? null, rest[1] ?? null];
  const ground = cardGround(T);
  const still = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const label = (d: Device | null, i: number) => {
    if (!d) return { name: t("Free"), sub: t("Sign in there") };
    if (i === 0) return { name: d.name, sub: t("This device") };
    if (d.test) return { name: d.name, sub: t("Pretend, for testing") };
    if (peer && d.name === peer && flow === "in") return { name: d.name, sub: t("Sending songs") };
    if (peer && d.name === peer && flow === "out") return { name: d.name, sub: t("Getting songs") };
    return { name: d.name, sub: t("Used {when}", { when: ago(d.lastActive ?? d.addedAt) }) };
  };
  const pairs: [number, number][] = [[0, 1], [0, 2], [1, 2]];
  const dots = (a: number, b: number, n: number, dur: number, r: number, op: number, key: string) =>
    Array.from({ length: n }, (_, k) => {
      const from = SPOTS[a], to = SPOTS[b], begin = `${(dur / n) * k}s`;
      return (
        <circle key={key + k} r={r} fill={T.text} opacity="0">
          <animateMotion dur={`${dur}s`} repeatCount="indefinite" begin={begin} path={`M${from.x},${from.y} L${to.x},${to.y}`} />
          <animate attributeName="opacity" values={`0;${op};${op};0`} keyTimes="0;0.15;0.85;1" dur={`${dur}s`} repeatCount="indefinite" begin={begin} />
        </circle>
      );
    });
  // Songs go between this device and the one named, or, when none is named,
  // every other device on the account.
  const named = peer ? spots.findIndex((d, i) => i > 0 && d?.name === peer) : -1;
  const ends = named > 0 ? [named] : [1, 2].filter(i => spots[i]);
  return (
    <svg viewBox="0 0 330 244" width="100%" style={{ display: "block", maxWidth: 330, margin: "0 auto", overflow: "visible" }} aria-hidden="true">
      {pairs.map(([a, b]) => {
        const live = !!spots[a] && !!spots[b];
        return <line key={`${a}${b}`} x1={SPOTS[a].x} y1={SPOTS[a].y} x2={SPOTS[b].x} y2={SPOTS[b].y}
          stroke={live ? T.text : T.muted} strokeWidth="1.5" strokeDasharray={live ? undefined : "4 5"} opacity={live ? 1 : 0.6} />;
      })}
      {!still && (flow === "in" || flow === "out") && ends.flatMap(i => flow === "in"
        ? dots(i, 0, 3, 2.4, 4, 1, `go${i}`)
        : dots(0, i, 3, 2.4, 4, 1, `go${i}`))}
      {!still && flow === "calm" && pairs.filter(([a, b]) => spots[a] && spots[b]).flatMap(([a, b]) => [
        ...dots(a, b, 2, 4, 3, 0.4, `c${a}${b}`), ...dots(b, a, 2, 4, 3, 0.4, `d${a}${b}`),
      ])}
      {spots.map((d, i) => {
        const { x, y } = SPOTS[i];
        const l = label(d, i);
        return (
          <g key={i}>
            <rect x={x - 16} y={y - 28} width="32" height="56" rx="7" fill={ground}
              stroke={d ? T.text : T.muted} strokeWidth="2.2" strokeDasharray={d ? undefined : "4 4"} />
            {d ? <line x1={x - 4} y1={y + 19} x2={x + 4} y2={y + 19} stroke={T.text} strokeWidth="2.2" strokeLinecap="round" />
              : <path d={`M${x} ${y - 7}v14M${x - 7} ${y}h14`} stroke={T.muted} strokeWidth="2.2" strokeLinecap="round" />}
            <text x={x} y={y + 48} textAnchor="middle" fontSize="13" fontWeight={d ? 700 : 600} fill={d ? T.text : T.muted}
              stroke={ground} strokeWidth="6" strokeLinejoin="round" paintOrder="stroke">{cut(l.name)}</text>
            <text x={x} y={y + 64} textAnchor="middle" fontSize="11.5" fill={T.textSub}
              stroke={ground} strokeWidth="6" strokeLinejoin="round" paintOrder="stroke">{cut(l.sub, 19)}</text>
          </g>
        );
      })}
    </svg>
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
export function GoogleG() {
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
