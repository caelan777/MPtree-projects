import { useEffect, useState, type ReactNode, type MutableRefObject } from "react";
import { BackButton, PAGE_IN, PageInStyle } from "./FullPage";
import { LoadLine } from "./LoadLine";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { makeSH, pageGround, type T } from "../themes";
import { t, tn, fmtBytes, getLang } from "../i18n";
import { IC } from "./Icons";
import { Loading } from "./Loading";
import { Switch } from "./Switch";
import { floatCard } from "./cardStyles";
import { useAccountPro, useAdDay, hasPro, ownsPro, buyPro, useProPrice, watchAdForPro, adOkText, adFailText, ADS_ON, PRO_MODE } from "../pro";
import { count } from "../counter";
import {
  useSync, signIn, signOut, cancelJoin, removeDevice, errorDetail, renameDevice, dismissRemoved, setMobileData, testPhone, deleteDoubles, retryNow,
  MAX_DEVICES, MOBILE_DAILY, DRIVE_KEEP_FREE, type SyncState, type Device, type TestStep,
} from "../sync/engine";
import { syncStatus, type SyncStatus, type StatusIcon, type Flow, type Act } from "../sync/status";
import { isDriveFull } from "../sync/drive";

// ─── ACCOUNT & SYNC ──────────────────────────────────────────────────────────
// The one page about the MPTree account. Every page says in one sentence what
// is going on, and under it what you can do about it: one main button at most,
// signing out and cancelling as quiet text. The devices are managed by tapping
// them in the triangle, and how it all works has a page of its own, in plain
// words, including the parts people trip over (MPTree has to be open; where
// the songs land; what is kept in Drive).

const Svg = ({ children, size = 20 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
export const CloudIcon = () => <Svg size={19}><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/></Svg>;

/** The small pictures beside a status and the paragraphs of How sync works. */
const PATHS = {
  check: <path d="M20 6 9 17l-5-5" />,
  down: <path d="M12 5v14M19 12l-7 7-7-7" />,
  up: <path d="M12 19V5M5 12l7-7 7 7" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  wifi: <><path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a15 15 0 0 1 20 0" /><path d="M12 19.5h.01" /></>,
  wifiOff: <path d="M2 2l20 20M8.5 16a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 4.4-2.5M2 9a15 15 0 0 1 4.6-2.9M14.5 10.1A10 10 0 0 1 19 12.5M17.4 6.1A15 15 0 0 1 22 9M12 19.5h.01" />,
  cell: <path d="M4 20v-3M9 20v-7M14 20V9M19 20V4" />,
  cloudX: <><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z" /><path d="m10 11 4 4M14 11l-4 4" /></>,
  full: <><rect x="3" y="6" width="18" height="12" rx="3" /><path d="M7 10v4M10.5 10v4M14 10v4M17.5 10v4" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M17 6l3 3" /></>,
  alert: <><path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17h.01" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M4 16V6a2 2 0 0 1 2-2h10" /></>,
  dots: <path d="M5 12h.01M12 12h.01M19 12h.01" />,
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  music: <><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  trash: <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  devices: <><rect x="2" y="4" width="14" height="10" rx="2" /><path d="M6 18h6" /><rect x="17" y="8" width="5" height="12" rx="1.5" /></>,
  back: <path d="M15 18l-6-6 6-6" />,
};
/** Every StatusIcon is one of these: Icon takes a status's icon as it is. */
type IconName = keyof typeof PATHS;
const Icon = ({ n, size = 18 }: { n: IconName; size?: number }) => <Svg size={size}>{PATHS[n]}</Svg>;

type Props = {
  pro: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
  /** Android's Back: a window or How sync works closes first. */
  backRef?: MutableRefObject<(() => boolean) | null>;
  T: T;
};

const MAX = MAX_DEVICES;
const NAME_MAX = 30;
/** Where a Google account's storage is shown and freed up. */
const STORAGE_URL = "https://one.google.com/storage";
/** A device that said something this recently has MPTree open. */
const OPEN_NOW = 90_000;
const openNow = (d: Device) => Date.now() - (d.lastActive ?? 0) < OPEN_NOW;

function ago(ms: number): string {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return t("just now");
  const m = Math.round(s / 60);
  if (m < 60) return tn(m, "{n} minute ago", "{n} minutes ago");
  const h = Math.round(m / 60);
  if (h < 48) return tn(h, "{n} hour ago", "{n} hours ago");
  return tn(Math.round(h / 24), "{n} day ago", "{n} days ago");
}
/** "12 Oct", in the app's language. */
const day = (ms: number) => new Date(ms).toLocaleDateString(getLang(), { day: "numeric", month: "short" });
const realDevices = (s: SyncState) => s.devices.filter(d => !d.test);

// ── The page ──────────────────────────────────────────────────────────────────

type Sheet = null
  | { kind: "device"; id: string; step: "menu" | "rename" | "remove" }
  | { kind: "add" }
  | { kind: "signout" }
  | { kind: "welcome"; proNow: boolean; bought?: boolean };

export function AccountSheet({ pro, onClose, onToast, backRef, T }: Props) {
  const sh = makeSH(T);
  const s = useSync();
  const [busy, setBusy] = useState(false);
  /** The device being taken off, so its row can say so. */
  const [removing, setRemoving] = useState<string | null>(null);
  /** On the full-account page: the device whose Remove was tapped once. */
  const [asking, setAsking] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [how, setHow] = useState(false);
  const [removeReceived, setRemoveReceived] = useState(false);
  const viaAccount = useAccountPro();
  const adDay = useAdDay();
  const proFromAccount = viaAccount && adDay.state === "off";
  // "Saved 2 minutes ago" keeps moving while the page is open.
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick(n => n + 1), 20_000); return () => clearInterval(id); }, []);

  // Back on Android: the window first, then How sync works, then the page.
  useEffect(() => {
    if (!backRef) return;
    backRef.current = () => {
      if (sheet) {
        if (busy) return true;
        if (sheet.kind === "device" && sheet.step !== "menu" && sheet.id !== s.deviceId) setSheet({ ...sheet, step: "menu" });
        else setSheet(null);
        return true;
      }
      if (how) { setHow(false); return true; }
      return false;
    };
    return () => { backRef.current = null; };
  }, [backRef, sheet, busy, how, s.deviceId]);

  const native = Capacitor.getPlatform() !== "web" || import.meta.env.DEV;
  const email = s.account?.email ?? "";
  const ground = cardGround(T);
  // On the card, a button or a round picture is a step away from its ground.
  const onCard = ground === T.dim ? T.surface : T.dim;

  const doSignIn = async () => {
    const had = pro;
    setBusy(true);
    const r = await signIn();
    setBusy(false);
    // A failure stays on the page (problem and problemDetail), not in a toast.
    if (r === "ok" && hasPro()) setSheet({ kind: "welcome", proNow: !had });
  };
  const doRemove = async (d: Device) => {
    setBusy(true); setRemoving(d.id);
    try {
      await removeDevice(d.id);
      onToast(t("{name} was removed from your account", { name: d.name }));
      setSheet(null);
    } catch (e) {
      onToast(isDriveFull(e) ? t("Your Google storage is full. Make room in Google Drive, then try again.")
        : `${t("Removing didn't work. Check your internet and try again.")} (${errorDetail(e)})`);
    }
    setBusy(false); setRemoving(null); setAsking(null);
  };
  const doRename = async (d: Device, name: string) => {
    const clean = name.trim().slice(0, NAME_MAX);
    if (!clean || clean === d.name) { setSheet(null); return; }
    setBusy(true);
    try { await renameDevice(d.id, clean); onToast(t("Renamed to {name}", { name: clean })); setSheet(null); }
    catch { onToast(t("Renaming didn't work. Check your internet and try again.")); }
    setBusy(false);
  };
  const doSignOut = async () => {
    setBusy(true);
    const gone = await signOut(removeReceived);
    setBusy(false);
    setSheet(null);
    onToast(removeReceived
      ? tn(gone, "Signed out. {n} song from your other devices was deleted.", "Signed out. {n} songs from your other devices were deleted.")
      : t("Signed out. Everything stays on this device."));
  };
  const doDoubles = async () => {
    setBusy(true);
    try { const n = await deleteDoubles(); onToast(tn(n, "{n} extra copy deleted", "{n} extra copies deleted")); }
    catch { onToast(t("Deleting the copies didn't work. Try again.")); }
    setBusy(false);
  };
  const doTest = async (step: TestStep, done: string) => {
    setBusy(true);
    try { await testPhone(step); onToast(done); }
    catch (e) { onToast(`${t("Could not reach Google Drive. Try again in a moment.")} (${errorDetail(e)})`); }
    setBusy(false);
  };
  const price = useProPrice();
  /** Buys Pro for the account signed in here, as the Pro page does. */
  const doBuy = async () => {
    count("pro-tap-buy");
    setBusy(true);
    const r = await buyPro(s.account?.email);
    setBusy(false);
    if (r === "owned") setSheet({ kind: "welcome", proNow: false, bought: true });
    else if (r === "pending") onToast(t("Payment pending. Pro unlocks as soon as it goes through."));
    else if (r === "failed") onToast(t("Google Play could not be reached. Try again in a moment."));
  };
  /** A day of Pro for one ad, as on the Pro page. */
  const doAdDay = async () => {
    setBusy(true);
    const r = await watchAdForPro();
    setBusy(false);
    onToast(r === "pro" || r === "pro-free" ? adOkText(r) : adFailText(r));
  };
  const openStorage = () => { Browser.open({ url: STORAGE_URL }).catch(() => {}); };
  const startSignOut = () => { setRemoveReceived(false); setSheet({ kind: "signout" }); };

  const btn = { ...sh.saveBtn, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, minHeight: 48, borderRadius: 14 } as const;
  const btn2 = { ...btn, background: T.dim, color: T.text } as const;
  const link = { ...btn, background: "transparent", color: T.muted, fontWeight: 600, fontSize: 14, marginTop: 2 } as const;
  const hint = { fontSize: 12.5, color: T.muted, lineHeight: 1.5, textAlign: "center", marginTop: 10 } as const;
  const act = (a: Act) => {
    const primary = a === "signin" || a === "storage";
    const style = { ...btn, minHeight: 42, padding: "10px 12px", fontSize: 14, marginTop: 10, ...(primary ? {} : { background: onCard, color: T.text }), opacity: busy ? 0.6 : 1 };
    const [label, run] = {
      signin: [<><GoogleG />{t("Sign in again")}</>, () => void doSignIn()],
      try: [t("Try now"), retryNow],
      retry: [t("Try again"), retryNow],
      storage: [t("Open Google storage"), openStorage],
      mobile: [t("Use mobile data too"), () => void setMobileData(true)],
      add: [t("How to add a device"), () => setSheet({ kind: "add" })],
    }[a] as [ReactNode, () => void];
    return <button key={a} disabled={busy} onClick={run} style={style}>{label}</button>;
  };

  const accountRow = (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "2px 2px 14px" }}>
      <span style={{ width: 40, height: 40, borderRadius: 20, background: T.accent, color: T.playBtnFg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 17, flexShrink: 0 }}>
        {(s.account?.name || email || "?").trim()[0]?.toUpperCase()}
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "block", fontSize: 15, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.account?.name || email}</span>
        {s.account?.name && <span style={{ display: "block", fontSize: 12.5, color: T.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</span>}
      </span>
    </div>
  );
  const big = (text: string) => <div style={{ fontSize: 21, fontWeight: 800, color: T.text, letterSpacing: "-0.01em", lineHeight: 1.25, marginTop: 26 }}>{text}</div>;
  const lead = (text: string, strong?: boolean) => <div style={{ fontSize: 14.5, color: strong ? T.text : T.textSub, lineHeight: 1.5, marginTop: 8, maxWidth: 380 }}>{text}</div>;
  const centered = (children: ReactNode) => (
    <div style={{ margin: "auto 0", padding: "20px 4px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>{children}</div>
  );
  const problemCard = (icon: StatusIcon, head: string, sub: string, extra?: ReactNode) => (
    <div style={{ background: ground, borderRadius: 18, padding: 16, marginTop: 18, width: "100%", boxSizing: "border-box", textAlign: "left" }}>
      <StatusView st={{ icon, head, sub, flow: "still" }} circle={onCard} T={T} />
      {extra}
    </div>
  );

  let body: ReactNode;
  let bottom: ReactNode = null;
  let title = t("Account & sync");

  if (!s.ready) {
    // Only just opened: whether there is an account here is not read yet.
    body = <Loading T={T} />;
  } else if (how) {
    title = t("How sync works");
    body = <HowItWorks T={T} />;
  } else if (!native) {
    body = centered(<>
      <SyncPicture T={T} mode="flow" />
      {big(t("Your music on all your devices"))}
      {lead(t("Sign in with Google in the MPTree app on your phone."))}
    </>);
  } else if (s.phase === "limit") {
    body = centered(<>
      <LimitPicture T={T} />
      {big(tn(MAX, "Your account is already on {n} device", "Your account is already on {n} devices"))}
      {lead(t("Remove one to sign in here. Nothing is deleted on that device. It just stops syncing."))}
      <div style={{ width: "100%", marginTop: 18, textAlign: "left" }}>
        {realDevices(s).map(d => (
          <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 2px", borderTop: `1px solid ${T.border}` }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 15, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
              <span style={{ display: "block", fontSize: 12.5, color: T.muted, marginTop: 2 }}>{t("Last used {when}", { when: ago(d.lastActive ?? d.addedAt) })}</span>
            </span>
            {removing === d.id
              ? <span style={{ fontSize: 13, fontWeight: 600, color: T.muted }}>{t("Removing…")}</span>
              : asking === d.id
                ? <button disabled={busy} onClick={() => void doRemove(d)} style={{ ...btn, width: "auto", minHeight: 38, padding: "8px 14px", fontSize: 13.5 }}>{t("Remove {name}", { name: cut(d.name, 14) })}</button>
                : <button disabled={busy} onClick={() => setAsking(d.id)} style={{ ...btn2, width: "auto", minHeight: 38, padding: "8px 14px", fontSize: 13.5 }}>{t("Remove")}</button>}
          </div>
        ))}
      </div>
    </>);
    bottom = <button onClick={cancelJoin} style={link}>{t("Not now")}</button>;
  } else if (s.phase === "removed") {
    const emptied = s.removedWhy === "emptied";
    body = centered(emptied ? <>
      <span style={{ width: 68, height: 68, borderRadius: 34, background: ground, color: T.text, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon n="cloudX" size={30} /></span>
      {big(t("Your account's data was deleted"))}
      {lead(t("MPTree's hidden folder in your Google Drive was emptied, for example under Manage apps in Drive. Everything on this device stays as it is."))}
      {lead(t("Sign in again to start the account fresh from this device."), true)}
    </> : <>
      <SyncPicture T={T} mode="cut" />
      {big(t("This device was removed from your account"))}
      {lead(t("That was done on one of your other devices. Your songs and playlists here stay as they are. This device just doesn't sync any more."))}
    </>);
    bottom = <>
      <button onClick={() => { dismissRemoved(); void doSignIn(); }} style={btn}><GoogleG />{t("Sign in again")}</button>
      <button onClick={dismissRemoved} style={link}>{t("OK")}</button>
    </>;
  } else if (s.phase === "on" && s.pausedNoPro) {
    // What Pro changes, side by side: how it is now, and how it is with Pro.
    const side = (head: string, lines: string[], on: boolean) => (
      <div style={{ flex: 1, minWidth: 0, background: ground, borderRadius: 16, padding: "14px 12px", textAlign: "left", boxSizing: "border-box", border: on ? `1px solid ${T.muted}` : "1px solid transparent" }}>
        <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: on ? T.text : T.muted, marginBottom: 10 }}>{head}</div>
        {lines.map(l => <div key={l} style={{ fontSize: 13.5, lineHeight: 1.45, color: on ? T.text : T.textSub, marginBottom: 8 }}>{l}</div>)}
      </div>
    );
    body = <>
      {accountRow}
      {centered(<>
        <SyncPicture T={T} mode="pause" />
        {big(t("Sync is part of MPTree Pro"))}
        {lead(t("You're signed in. Here is what Pro changes."))}
        <div style={{ display: "flex", gap: 10, width: "100%", marginTop: 20 }}>
          {side(t("Now"), [t("Each device keeps only its own songs"), t("Playlists differ per device"), t("Nothing is sent")], false)}
          {side(t("With Pro"), [t("Every device gets all your songs"), t("Same playlists and likes"), t("Up to {n} devices", { n: MAX })], true)}
        </div>
      </>)}
    </>;
    bottom = <>
      <button onClick={doBuy} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>
        {PRO_MODE === "free" ? `${t("Get Pro · {price}, once", { price })} (${t("test build")})` : t("Get Pro · {price}, once", { price })}
      </button>
      {ADS_ON && adDay.state !== "live" && (
        <button onClick={doAdDay} disabled={busy} style={{ ...link, fontSize: 13, marginTop: 6, minHeight: 36 }}>{t("Or try it free for a day, with one ad.")}</button>
      )}
      <button onClick={startSignOut} style={link}>{t("Sign out on this device")}</button>
    </>;
  } else if (s.phase === "on") {
    const st = syncStatus(s);
    const g = s.songs;
    const row = {
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%",
      padding: "14px 2px", background: "transparent", borderStyle: "solid", borderColor: T.border, borderWidth: "1px 0 0",
      fontFamily: "inherit", textAlign: "left", color: T.text,
    } as const;
    const rowTitle = { display: "block", fontSize: 15, fontWeight: 600, lineHeight: 1.35 } as const;
    const rowSub = { display: "block", fontSize: 12.5, color: T.muted, marginTop: 3, lineHeight: 1.4 } as const;
    const testOn = s.devices.some(d => d.test);
    const testRow = (label: string, step: TestStep, done: string) => (
      <button disabled={busy} onClick={() => doTest(step, done)}
        style={{ ...btn2, marginTop: 8, opacity: busy ? 0.6 : 1 }}>{label}</button>
    );
    body = <>
      {accountRow}
      <div style={{ background: ground, borderRadius: 18, padding: "16px 14px" }}>
        <Triangle s={s} flow={st.flow} peer={st.peer} T={T}
          onPick={d => { if (!d.test) setSheet({ kind: "device", id: d.id, step: "menu" }); }}
          onAdd={() => setSheet({ kind: "add" })} />
        <div style={{ height: 1, background: T.border, margin: "10px 2px 14px" }} />
        <StatusView st={st} circle={onCard} T={T}>{st.acts?.map(act)}</StatusView>
        {g.doubles.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.border}` }}>
            <StatusView circle={onCard} T={T} st={{
              icon: "copy", flow: "still",
              head: tn(g.doubles.length, "{n} song is on this device twice", "{n} songs are on this device twice"),
              sub: t("Another device sent copies of songs this one already had."),
            }}>
              <button disabled={busy} onClick={doDoubles} style={{ ...btn, minHeight: 42, padding: "10px 12px", fontSize: 14, marginTop: 10, background: onCard, color: T.text, opacity: busy ? 0.6 : 1 }}>
                {tn(g.doubles.length, "Delete the extra copy", "Delete the {n} extra copies")}
              </button>
            </StatusView>
          </div>
        )}
      </div>

      <div style={{ marginTop: 10 }}>
        <div style={row}>
          <span style={{ minWidth: 0 }}>
            <span style={rowTitle}>{t("Songs on this device")}</span>
            {g.received > 0 && <span style={rowSub}>{t("From your other devices: {n}", { n: g.received })}</span>}
            {g.notShared > 0 && <span style={rowSub}>{t("Voice notes and clips that stay here: {n}", { n: g.notShared })}</span>}
          </span>
          <span style={{ fontSize: 17, fontWeight: 800, flexShrink: 0 }}>{g.here}</span>
        </div>
        <button onClick={() => setMobileData(!s.mobileData)} style={{ ...row, cursor: "pointer" }} role="switch" aria-checked={s.mobileData}>
          <span style={{ minWidth: 0 }}>
            <span style={rowTitle}>{t("Sync songs without wifi")}</span>
            <span style={rowSub}>{s.mobileData
              ? t("Now also on mobile data, at most {size} a day.", { size: fmtBytes(MOBILE_DAILY) })
              : t("Now only on wifi, so it costs no mobile data.")}</span>
          </span>
          <Switch on={s.mobileData} T={T} />
        </button>
        <button onClick={() => setHow(true)} style={{ ...row, borderWidth: "1px 0", cursor: "pointer" }}>
          <span style={rowTitle}>{t("How sync works")}</span>
          <span style={{ display: "flex", color: T.muted, flexShrink: 0 }}><IC.ChevronR /></span>
        </button>
      </div>

      {/* A pretend second device in Drive, so syncing can be tried with one
          phone. Only in test builds and the dev server, never in a release. */}
      {(__PRO_TEST__ || import.meta.env.DEV) && (
        <div style={{ background: ground, borderRadius: 14, padding: "14px 16px", marginTop: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{t("Test device")}</div>
          <div style={{ fontSize: 13, color: T.textSub, lineHeight: 1.5, marginTop: 6 }}>
            {t("Only in test builds. A pretend second device in your Drive, with three short songs, so you can try syncing with one device.")}
          </div>
          {!testOn ? testRow(t("Add a test device"), "add", t("Test device added. Its songs come in over the next minute.")) : <>
            {testRow(t("Test device makes a playlist"), "playlist", t("The test device made a playlist and liked a song"))}
            {testRow(t("Test device deletes its songs permanently"), "delete", t("The test device deleted its songs. Look in the bin."))}
            {testRow(t("Remove the test device"), "remove", t("Test device removed"))}
          </>}
        </div>
      )}
    </>;
    bottom = <button onClick={startSignOut} style={link}>{t("Sign out on this device")}</button>;
  } else {
    // Signed out, or signing in.
    const joining = busy || s.phase === "joining";
    const failed = !joining && (s.problem === "signin" || s.problem === "full");
    body = centered(<>
      <SyncPicture T={T} mode="flow" />
      {big(t("Your music on all your devices"))}
      <Checks T={T} items={[
        { text: t("Songs copy themselves to your other devices") },
        { text: t("Playlists, likes and settings are the same everywhere") },
        { text: t("Up to {n} phones, tablets or computers", { n: MAX }) },
        { text: t("No MPTree servers. Everything goes through your own Google Drive."), icon: "lock", muted: true },
      ]} />
      {failed && (s.problem === "full"
        ? problemCard("cloudX", t("Your Google storage is full"), t("MPTree needs a little room in your Google Drive to sign in. Free up space, then try again."), <>
          <button onClick={openStorage} style={{ ...btn, minHeight: 42, padding: "10px 12px", fontSize: 14, marginTop: 12, background: onCard, color: T.text }}>{t("Open Google storage")}</button>
          {s.problemDetail && <Code text={s.problemDetail} T={T} />}
        </>)
        : problemCard("alert", t("Couldn't sign in"), t("Check your internet and try again."), s.problemDetail ? <Code text={s.problemDetail} T={T} /> : null))}
    </>);
    bottom = <>
      <button onClick={doSignIn} disabled={joining} style={{ ...btn, opacity: joining ? 0.7 : 1 }}>
        <GoogleG />{joining ? t("Signing in…") : failed ? t("Try again") : t("Sign in with Google")}
      </button>
      <div style={hint}>
        {pro ? t("MPTree only gets a hidden folder in your Google Drive. It can't see your other files.") : <>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.04em", color: T.playBtnFg, background: T.accent, borderRadius: 5, padding: "2px 6px", marginRight: 6 }}>PRO</span>
          {t("Sync is part of MPTree Pro. Bought Pro on another device? Sign in, and it's on here too.")}
        </>}
      </div>
    </>;
  }

  const device = sheet?.kind === "device" ? s.devices.find(d => d.id === sheet.id) : undefined;

  // A page of its own, the whole screen, like the bin. The app draws edge to
  // edge, so it steps over the status bar and the gesture bar itself.
  const column = { width: "100%", maxWidth: 560, margin: "0 auto", boxSizing: "border-box" } as const;
  return (
    <div className={PAGE_IN} style={{ position: "fixed", inset: 0, background: pageGround(T), zIndex: 450, display: "flex", flexDirection: "column" }}>
      <PageInStyle />
      <LoadLine on={busy || s.phase === "joining"} T={T} />
      {/* The back arrow: out of "how it works" first, then out of the page. */}
      <div style={{ ...column, display: "flex", alignItems: "center", gap: 2, padding: "calc(env(safe-area-inset-top, 0px) + 8px) 10px 8px", flexShrink: 0 }}>
        <BackButton onClick={() => (how ? setHow(false) : onClose())} T={T} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 20, fontWeight: 800, color: T.text, letterSpacing: "-0.01em", lineHeight: 1.2 }}>{title}</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", display: "flex", flexDirection: "column" }}>
        <div style={{ ...column, padding: "0 20px 16px", flex: 1, display: "flex", flexDirection: "column" }}>{body}</div>
      </div>
      {bottom && !how && <div style={{ ...column, padding: "10px 20px calc(env(safe-area-inset-bottom, 0px) + 16px)", flexShrink: 0 }}>{bottom}</div>}

      {sheet?.kind === "device" && device && (
        <DeviceSheet d={device} me={device.id === s.deviceId} step={sheet.step} busy={busy} removing={removing === device.id}
          onStep={step => setSheet({ ...sheet, step })} onClose={() => !busy && setSheet(null)}
          onRename={name => void doRename(device, name)} onRemove={() => void doRemove(device)} onSignOut={startSignOut}
          btn={btn} link={link} T={T} />
      )}
      {sheet?.kind === "add" && (
        <Float onClose={() => setSheet(null)} T={T}>
          <SheetTitle T={T}>{t("Add a device")}</SheetTitle>
          <div style={{ fontSize: 14, color: T.textSub, lineHeight: 1.5, marginTop: 4 }}>
            {tn(Math.max(1, MAX - realDevices(s).length), "You can add {n} more phone, tablet or computer.", "You can add {n} more phones, tablets or computers.")}
          </div>
          <Steps T={T} items={[
            t("Install MPTree on it, from Google Play or mp-tree.net."),
            t("Open Settings, then Account & sync."),
            withBold(t("Sign in with {email}."), "{email}", email),
          ]} />
          {(ownsPro() || viaAccount) && <div style={{ fontSize: 13.5, color: T.textSub, lineHeight: 1.5, margin: "2px 2px 14px" }}>{t("Your Pro comes along: the new device gets it from your account.")}</div>}
          <button onClick={() => setSheet(null)} style={{ ...btn, marginTop: 4 }}>{t("Got it")}</button>
        </Float>
      )}
      {sheet?.kind === "signout" && (
        <Float onClose={() => !busy && setSheet(null)} T={T}>
          <SheetTitle T={T}>{t("Sign out on this device?")}</SheetTitle>
          <div style={{ fontSize: 14, color: T.textSub, lineHeight: 1.5, marginTop: 6 }}>
            {s.songs.received > 0 ? t("This device stops syncing. Your playlists stay here.") : t("This device stops syncing. Your songs and playlists stay here.")}
          </div>
          {proFromAccount && <div style={{ fontSize: 14, color: T.text, lineHeight: 1.5, marginTop: 8 }}>{t("MPTree Pro came with your account, so it turns off here too.")}</div>}
          {s.songs.received > 0 && <>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: T.muted, margin: "16px 2px 4px" }}>
              {tn(s.songs.received, "{n} song came from your other devices", "{n} songs came from your other devices")}
            </div>
            <Choice T={T} on={!removeReceived} onPick={() => setRemoveReceived(false)}
              title={tn(s.songs.received, "Keep it on this device", "Keep them on this device")} sub={t("Nothing is deleted.")} />
            <Choice T={T} on={removeReceived} onPick={() => setRemoveReceived(true)}
              title={tn(s.songs.received, "Delete it from this device", "Delete them from this device")}
              sub={tn(s.songs.received, "Your other devices keep it.", "Your other devices keep them.")} />
          </>}
          <button onClick={doSignOut} disabled={busy} style={{ ...btn, marginTop: 16, opacity: busy ? 0.6 : 1 }}>{busy ? t("Signing out…") : t("Sign out")}</button>
          <button onClick={() => setSheet(null)} disabled={busy} style={link}>{t("Cancel")}</button>
        </Float>
      )}
      {sheet?.kind === "welcome" && (
        <Float onClose={() => setSheet(null)} T={T}>
          <SheetTitle T={T}>{sheet.bought ? t("Pro is yours.") : t("You're signed in")}</SheetTitle>
          <Steps T={T} items={[
            t("Your playlists and likes are combined with the ones already in your account. Nothing is lost."),
            t("Your songs copy to your other devices while MPTree is open on them. When you close the app, it waits until you open it again."),
            t("Songs from your other devices show up in your song list, just like your own."),
          ]} />
          {sheet.proNow && <div style={{ fontSize: 13.5, color: T.textSub, lineHeight: 1.5, margin: "2px 2px 14px" }}>{t("MPTree Pro is on, from your account")}</div>}
          <button onClick={() => setSheet(null)} style={{ ...btn, marginTop: 4 }}>{t("Got it")}</button>
        </Float>
      )}
    </div>
  );
}

// ── Pieces ────────────────────────────────────────────────────────────────────

/** A sentence with one value in bold, such as the email address in a step. */
function withBold(sentence: string, slot: string, value: string): ReactNode {
  const [before, after = ""] = sentence.split(slot);
  return <>{before}<b>{value}</b>{after}</>;
}

/** A status: a round picture, what is going on, what to do, and buttons. */
function StatusView({ st, circle, children, T }: { st: SyncStatus; circle: string; children?: ReactNode; T: T }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "0 2px" }}>
      <span style={{
        width: 34, height: 34, borderRadius: 17, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
        background: st.solid ? T.accent : circle, color: st.solid ? T.playBtnFg : T.text,
      }}><Icon n={st.icon} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15.5, fontWeight: 800, color: T.text, lineHeight: 1.3, overflowWrap: "anywhere", marginTop: st.sub || st.progress ? 0 : 7 }}>{st.head}</div>
        {st.progress && <>
          <div style={{ height: 4, background: T.border, borderRadius: 2, marginTop: 9, overflow: "hidden" }}>
            <div style={{ width: `${st.progress.pct}%`, height: "100%", background: T.accent, transition: "width 0.3s" }} />
          </div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 5 }}>{st.progress.note}</div>
        </>}
        {st.sub && <div style={{ fontSize: 13.5, color: T.textSub, lineHeight: 1.45, marginTop: 3 }}>{st.sub}</div>}
        {children}
        {st.code && <Code text={st.code} T={T} />}
      </div>
    </div>
  );
}

const Code = ({ text, T }: { text: string; T: T }) => (
  <div style={{ fontSize: 11, color: T.muted, marginTop: 8, lineHeight: 1.4, userSelect: "text", wordBreak: "break-word", textAlign: "left" }}>{text}</div>
);

/** Ticked lines: what something gives you. */
function Checks({ items, T }: { items: { text: string; icon?: IconName; muted?: boolean }[]; T: T }) {
  return (
    <div style={{ width: "100%", marginTop: 20, textAlign: "left" }}>
      {items.map((it, i) => (
        <div key={i} style={{
          display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 2px", fontSize: 14.5, lineHeight: 1.4,
          color: it.muted ? T.textSub : T.text, borderTop: `1px solid ${T.border}`, borderBottom: i === items.length - 1 ? `1px solid ${T.border}` : undefined,
        }}>
          <span style={{ display: "flex", marginTop: 1, color: T.text, flexShrink: 0 }}><Icon n={it.icon ?? "check"} /></span>
          <span>{it.text}</span>
        </div>
      ))}
    </div>
  );
}

/** Numbered steps. */
function Steps({ items, T }: { items: ReactNode[]; T: T }) {
  return (
    <div style={{ margin: "12px 0 8px" }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: "flex", gap: 12, padding: "9px 2px", fontSize: 14.5, lineHeight: 1.45, color: T.text }}>
          <span style={{ width: 24, height: 24, borderRadius: 12, background: T.accent, color: T.playBtnFg, fontSize: 12.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span>
          <span style={{ minWidth: 0 }}>{it}</span>
        </div>
      ))}
    </div>
  );
}

/** One of two answers, as a round button and its line. */
function Choice({ on, onPick, title, sub, T }: { on: boolean; onPick: () => void; title: string; sub: string; T: T }) {
  return (
    <button role="radio" aria-checked={on} onClick={onPick}
      style={{ display: "flex", gap: 12, alignItems: "flex-start", width: "100%", padding: "12px 2px", background: "transparent", border: "none", borderTop: `1px solid ${T.border}`, cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: T.text }}>
      <span style={{ width: 20, height: 20, borderRadius: 10, boxSizing: "border-box", border: on ? `6px solid ${T.accent}` : `2px solid ${T.muted}`, flexShrink: 0, marginTop: 1 }} />
      <span>
        <span style={{ display: "block", fontSize: 14.5, fontWeight: 700, lineHeight: 1.35 }}>{title}</span>
        <span style={{ display: "block", fontSize: 13, color: T.textSub, marginTop: 2, lineHeight: 1.4 }}>{sub}</span>
      </span>
    </button>
  );
}

const SheetTitle = ({ children, T }: { children: ReactNode; T: T }) => (
  <div style={{ fontSize: 20, fontWeight: 800, color: T.text, letterSpacing: "-0.01em", lineHeight: 1.25, padding: "0 2px", overflowWrap: "anywhere" }}>{children}</div>
);

/** The floating card every window on this page comes up in, as elsewhere in
 *  the app. A tap beside it closes it. */
function Float({ onClose, children, T }: { onClose: () => void; children: ReactNode; T: T }) {
  const sh = makeSH(T);
  return (
    <div style={{ ...sh.overlay, zIndex: 460, padding: "0 12px calc(env(safe-area-inset-bottom, 0px) + 12px)", boxSizing: "border-box" }} onClick={onClose}>
      <div role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}
        style={{ ...floatCard(T), width: "100%", maxWidth: 536, margin: "0 auto", padding: "22px 18px 10px", maxHeight: "86vh", overflowY: "auto", animation: "mpCardUp 0.3s cubic-bezier(0.22, 1, 0.36, 1) both" }}>
        {children}
      </div>
    </div>
  );
}

/** A tapped device: rename it, or take it off the account. This device is
 *  renamed here too, and signed out from here. */
function DeviceSheet({ d, me, step, busy, removing, onStep, onClose, onRename, onRemove, onSignOut, btn, link, T }: {
  d: Device; me: boolean; step: "menu" | "rename" | "remove"; busy: boolean; removing: boolean;
  onStep: (s: "menu" | "rename" | "remove") => void; onClose: () => void; onRename: (name: string) => void; onRemove: () => void; onSignOut: () => void;
  btn: React.CSSProperties; link: React.CSSProperties; T: T;
}) {
  const [name, setName] = useState(d.name);
  const since = t("On your account since {date}", { date: day(d.addedAt) });
  const used = openNow(d) ? t("Open now") : t("Last used {when}", { when: ago(d.lastActive ?? d.addedAt) });
  const row = { display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "14px 2px", background: "transparent", border: "none", borderTop: `1px solid ${T.border}`, cursor: "pointer", fontFamily: "inherit", fontSize: 15, fontWeight: 600, color: T.text, textAlign: "left" } as const;

  const rename = (
    <>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: T.muted, margin: "18px 2px 6px" }}>{t("Name")}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, background: T.dim, borderRadius: 12, padding: "0 14px" }}>
        <input autoFocus={!me} value={name} maxLength={NAME_MAX} aria-label={t("Name of this device")}
          onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") onRename(name); }}
          style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", padding: "13px 0", color: T.text, fontSize: 15.5, fontFamily: "inherit" }} />
        <span style={{ fontSize: 12, color: T.muted, flexShrink: 0 }}>{name.length} / {NAME_MAX}</span>
      </div>
      <div style={{ fontSize: 13, color: T.textSub, lineHeight: 1.45, margin: "8px 2px 0" }}>{t("Your other devices see this name.")}</div>
      <button disabled={busy || !name.trim()} onClick={() => onRename(name)} style={{ ...btn, marginTop: 16, opacity: busy || !name.trim() ? 0.6 : 1 }}>{t("Save")}</button>
    </>
  );

  return (
    <Float onClose={onClose} T={T}>
      {step === "remove" ? <>
        <SheetTitle T={T}>{t("Remove {name} from your account?", { name: d.name })}</SheetTitle>
        <Checks T={T} items={[
          { text: t("Everything on {name} stays on {name}", { name: d.name }) },
          { text: t("{name} stops syncing with your other devices", { name: d.name }) },
          { text: t("You can sign in there again later") },
        ]} />
        <button disabled={busy} onClick={onRemove} style={{ ...btn, marginTop: 18, opacity: busy ? 0.6 : 1 }}>
          {removing ? t("Removing…") : t("Remove {name}", { name: cut(d.name, 20) })}
        </button>
        <button disabled={busy} onClick={() => onStep("menu")} style={link}>{t("Cancel")}</button>
      </> : <>
        <SheetTitle T={T}>{me ? t("This device") : d.name}</SheetTitle>
        <div style={{ fontSize: 13.5, color: T.textSub, marginTop: 4, padding: "0 2px" }}>{me ? since : `${used} · ${since}`}</div>
        {me || step === "rename" ? rename : <>
          <div style={{ marginTop: 14 }}>
            <button onClick={() => onStep("rename")} style={row}>{t("Rename")}<span style={{ display: "flex", color: T.muted }}><IC.ChevronR /></span></button>
            <button onClick={() => onStep("remove")} style={{ ...row, borderBottom: `1px solid ${T.border}` }}>{t("Remove from account")}<span style={{ display: "flex", color: T.muted }}><IC.ChevronR /></span></button>
          </div>
          <div style={{ fontSize: 13, color: T.textSub, lineHeight: 1.5, margin: "12px 2px 0" }}>
            {t("Removing doesn't delete anything on {name}. It stops syncing, and {name} shows that it was removed.", { name: d.name })}
          </div>
        </>}
        <button onClick={me ? onSignOut : onClose} style={link}>{me ? t("Sign out on this device") : t("Close")}</button>
      </>}
    </Float>
  );
}

/** How it works, in plain words: the page behind "How sync works". */
function HowItWorks({ T }: { T: T }) {
  const parts: [IconName, string, string][] = [
    ["list", t("Playlists, likes and settings"), t("Saved in your Google Drive. Your other devices get the changes within a minute while MPTree is open there. Language, text size, sound and the app icon stay set per device.")],
    ["music", t("Songs"), t("Songs are copied from device to device. With MPTree open on both, they go straight across. If not, they wait in your Google Drive until the other device takes them, and are then deleted from Drive. They show up in your song list like your own; the files are in the MPTree folder, inside Music.")],
    ["eye", t("Keep MPTree open"), t("Android pauses apps in the background, so songs only move while MPTree is open on screen. Your screen stays on while a song is on its way.")],
    ["cell", t("Wifi and mobile data"), t("Playlists and likes always sync. Songs wait for wifi, unless you allow mobile data: then up to {size} a day.", { size: fmtBytes(MOBILE_DAILY) })],
    ["trash", t("Deleting songs"), t("Move a song to the bin, and it's in the bin on every device. Delete it permanently, and it's only gone from this device. Your other devices keep it, and you can get it back from the bin.")],
    ["mic", t("What stays on this device"), t("Voice notes, recordings and clips under a minute are never sent to your other devices.")],
    ["devices", t("Up to {n} devices", { n: MAX }), t("Remove one under Account & sync to make room for another. Nothing on it is deleted.")],
    ["lock", t("Your Google Drive"), t("There are no MPTree servers. MPTree uses a hidden folder in your Drive that only it can open, and never uses your last {size} of space.", { size: fmtBytes(DRIVE_KEEP_FREE) })],
  ];
  return (
    <div style={{ paddingBottom: 24 }}>
      {parts.map(([icon, head, text]) => (
        <div key={head} style={{ padding: "16px 2px 4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 16.5, fontWeight: 800, color: T.text }}><Icon n={icon} />{head}</div>
          <div style={{ fontSize: 14, color: T.textSub, lineHeight: 1.55, marginTop: 6 }}>{text}</div>
        </div>
      ))}
    </div>
  );
}

/** A phone and a computer, and between them: songs going both ways (flow),
 *  two bars (pause: signed in without Pro), or a cross with the computer
 *  greyed (cut: this device was taken off). */
function SyncPicture({ T, mode }: { T: T; mode: "flow" | "pause" | "cut" }) {
  const dot = (delay: number, back = false) => (
    <span style={{
      position: "absolute", top: back ? 15 : 3, left: 0, width: 6, height: 6, borderRadius: "50%", background: T.text,
      animation: `${back ? "mpSyncBack" : "mpSyncGo"} 2.4s linear ${delay}s infinite`, opacity: 0,
    }} />
  );
  const far = mode === "cut" ? T.muted : T.text;
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
      <div className="mp-sync" style={{ position: "relative", width: 80, height: 24, display: "flex", alignItems: "center", justifyContent: "center", color: T.muted }}>
        {mode === "flow" && <>{dot(0)}{dot(0.8)}{dot(1.6)}{dot(0.4, true)}{dot(1.2, true)}{dot(2, true)}</>}
        {mode === "pause" && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.text} strokeWidth="3" strokeLinecap="round"><path d="M8 5v14M16 5v14" /></svg>}
        {mode === "cut" && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>}
      </div>
      <svg width="104" height="76" viewBox="0 0 104 76" fill="none" stroke={far} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="14" y="8" width="76" height="50" rx="6" /><line x1="3" y1="68" x2="101" y2="68" />
      </svg>
    </div>
  );
}

/** Three devices and a fourth place that is not there: the account is full. */
function LimitPicture({ T }: { T: T }) {
  const phone = (x: number, c: string, dash?: boolean) => (
    <rect x={x} y="4" width="34" height="58" rx="7" stroke={c} strokeDasharray={dash ? "4 4" : undefined} />
  );
  return (
    <svg width="196" height="66" viewBox="0 0 196 66" fill="none" strokeWidth="2.4" aria-hidden="true">
      {phone(4, T.text)}{phone(52, T.text)}{phone(100, T.text)}{phone(152, T.muted, true)}
      <path d="M169 26v14M162 33h14" stroke={T.muted} strokeLinecap="round" />
    </svg>
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

/** Three places, this device at the top. A free place is drawn dashed. A
 *  device opens its window when tapped, and a free place how to add one. */
function Triangle({ s, flow, peer, onPick, onAdd, T }: {
  s: SyncState; flow: Flow; peer?: string; onPick: (d: Device) => void; onAdd: () => void; T: T;
}) {
  const me = s.devices.find(d => d.id === s.deviceId);
  const rest = [...s.devices.filter(d => d.id !== s.deviceId && !d.test), ...s.devices.filter(d => d.test)];
  const spots: (Device | null)[] = [me ?? null, rest[0] ?? null, rest[1] ?? null];
  const ground = cardGround(T);
  const still = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const label = (d: Device | null, i: number) => {
    if (!d) return { name: t("Free spot"), sub: t("Add a device") };
    if (i === 0) return { name: d.name, sub: t("This device") };
    if (d.test) return { name: d.name, sub: t("Pretend, for testing") };
    if (peer && d.name === peer && flow === "in") return { name: d.name, sub: t("Sending songs") };
    if (peer && d.name === peer && flow === "out") return { name: d.name, sub: t("Getting songs") };
    if (openNow(d)) return { name: d.name, sub: t("Open now") };
    // Just "2 hours ago": "Used 2 hours ago" did not fit under a device in Dutch.
    return { name: d.name, sub: ago(d.lastActive ?? d.addedAt) };
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
    <svg viewBox="0 0 330 244" width="100%" style={{ display: "block", maxWidth: 330, margin: "0 auto", overflow: "visible" }}>
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
        const tap = d ? (d.test ? undefined : () => onPick(d)) : onAdd;
        return (
          <g key={i} onClick={tap} role={tap ? "button" : undefined} tabIndex={tap ? 0 : undefined}
            aria-label={tap ? `${l.name}, ${l.sub}` : undefined}
            onKeyDown={tap ? e => { if (e.key === "Enter" || e.key === " ") tap(); } : undefined}
            style={{ cursor: tap ? "pointer" : "default", outline: "none" }}>
            <rect x={x - 54} y={y - 34} width="108" height="104" fill="transparent" />
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
