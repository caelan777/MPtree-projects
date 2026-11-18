import { t, tn, fmtBytes } from "../i18n";
import { MAX_DEVICES, MOBILE_DAILY, ROOM_MARGIN, DRIVE_KEEP_FREE, type SyncState } from "./engine";

// ─── WHAT SYNC IS DOING, IN ONE SENTENCE ─────────────────────────────────────
// The account page shows it under the devices, Settings under Account & sync.
// One status at a time: a problem first, then what is moving, then what is
// waiting, and otherwise all set. Each says what is going on and, in `sub`,
// what to do about it; `acts` are the buttons that do it.

const mb = (n: number) => (n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0);

export type StatusIcon = "check" | "down" | "up" | "clock" | "wifi" | "wifiOff" | "cell" | "cloudX" | "full" | "plus" | "key" | "alert" | "copy" | "dots";
export type Flow = "in" | "out" | "calm" | "still";
/** What a status can offer to do about it. */
export type Act = "signin" | "try" | "retry" | "storage" | "mobile" | "add";
export type SyncStatus = {
  icon: StatusIcon;
  /** Drawn filled: everything is done. */
  solid?: boolean;
  head: string;
  sub?: string;
  flow: Flow;
  peer?: string;
  progress?: { pct: number; note: string };
  acts?: Act[];
  /** What Google actually said, small, for whoever has to find out why. */
  code?: string;
};

/** The one status under the devices. Problems first, then what is moving,
 *  then what is waiting, and otherwise all set. */
export function syncStatus(s: SyncState): SyncStatus {
  const g = s.songs;
  const others = s.devices.filter(d => d.id !== s.deviceId);
  const m = g.moving;
  const where = g.waitingOn.join(", ");
  if (!s.devices.length && !s.problem) return { icon: "dots", head: t("Checking your devices…"), flow: "still" };
  if (s.problem === "offline") return { icon: "wifiOff", head: t("No internet"), sub: t("Syncing starts again by itself when you're back online."), flow: "still" };
  if (s.problem === "signin") return { icon: "key", head: t("Sign in again to keep syncing"), sub: t("Google ended MPTree's sign-in. Nothing on this device is lost."), flow: "still", acts: ["signin"] };
  if (s.problem === "drive") return { icon: "cloudX", head: t("Can't reach Google Drive"), sub: t("MPTree tries again every minute by itself."), flow: "still", acts: ["try"], code: s.problemDetail };
  if (s.problem === "full") return {
    icon: "cloudX", head: t("Your Google storage is full"),
    sub: t("Your playlists and likes can't be saved until there's room. Free up space in Drive, Gmail or Photos."),
    flow: "still", acts: ["storage", "retry"], code: s.problemDetail,
  };
  if (m) {
    const peer = m.peer || t("your other device");
    const pct = m.total > 0 ? Math.min(100, Math.round(m.done / m.total * 100)) : 0;
    const after = (m.dir === "in" ? g.missing : g.theyMiss) - 1;
    const note = t("{done} of {total} MB", { done: mb(m.done), total: mb(m.total) })
      + (after > 0 ? " · " + t("{n} more after this", { n: after }) : "");
    return m.dir === "in"
      ? {
        icon: "down", head: t("Getting “{name}” from {phone}", { name: m.name, phone: peer }), flow: "in", peer: m.peer, progress: { pct, note },
        sub: m.via === "direct" ? t("Straight from {phone}. Keep MPTree open on both.", { phone: peer }) : t("Through your Google Drive. Keep MPTree open here."),
      }
      : {
        icon: "up", head: t("Sending “{name}” to {phone}", { name: m.name, phone: peer }), flow: "out", peer: m.peer, progress: { pct, note },
        sub: m.via === "direct" ? t("Straight to {phone}. Keep MPTree open on both.", { phone: peer }) : t("Through your Google Drive. Keep MPTree open until it's sent."),
      };
  }
  if (!others.length) return {
    icon: "plus", head: t("Only this device so far"),
    sub: t("Sign in on another device with {email}, and your songs go there too.", { email: s.account?.email ?? "" }),
    flow: "still", acts: ["add"],
  };
  if (g.note === "phone-full") {
    const need = Math.max(0, (g.needBytes ?? 0) - Math.max(0, (g.freeBytes ?? 0) - ROOM_MARGIN));
    return {
      icon: "full", head: t("This device is full"), flow: "still",
      sub: tn(g.missing, "Free up {size} to get the last song. MPTree always leaves {keep} free.", "Free up {size} to get the last {n} songs. MPTree always leaves {keep} free.",
        { size: fmtBytes(need), keep: fmtBytes(ROOM_MARGIN) }),
    };
  }
  if (g.note === "mobile-limit") return {
    icon: "cell", head: t("Today's {size} of mobile data is used", { size: fmtBytes(MOBILE_DAILY) }),
    sub: t("The rest goes over wifi, or tomorrow."), flow: "still",
  };
  if (g.note === "wifi" && (g.missing || g.theyMiss)) return {
    icon: "wifi", head: t("Waiting for wifi"), flow: "still", acts: ["mobile"],
    sub: g.missing
      ? tn(g.missing, "{n} song comes in when you're on wifi.", "{n} songs come in when you're on wifi.")
      : tn(g.theyMiss, "{n} song goes out when you're on wifi.", "{n} songs go out when you're on wifi."),
  };
  if (g.note === "drive-full" && (g.missing || g.theyMiss)) return {
    icon: "cloudX", head: t("Songs can't go through Google Drive"), flow: "still", acts: ["storage"],
    sub: t("Your Google storage has less than {size} free. Open MPTree on both devices at the same time, and songs go straight across.", { size: fmtBytes(DRIVE_KEEP_FREE) }),
  };
  if (g.missing && g.waitingOn.length) return {
    icon: "clock", flow: "still",
    head: tn(g.missing, "{n} song is still on {phone}", "{n} songs are still on {phone}", { phone: where }),
    sub: tn(g.missing, "Open MPTree on {phone} to send it. It comes here the next time MPTree is open.",
      "Open MPTree on {phone} to send them. They come here the next time MPTree is open.", { phone: where }),
  };
  if (g.missing) return {
    icon: "down", flow: "in",
    head: tn(g.missing, "{n} song on its way here", "{n} songs on their way here"),
    sub: t("Keep MPTree open. Android pauses it in the background."),
  };
  if (g.theyMiss) return {
    icon: "up", flow: "out",
    head: tn(g.theyMiss, "{n} song still going to your other devices", "{n} songs still going to your other devices"),
    sub: tn(g.theyMiss, "Keep MPTree open here until it's sent.", "Keep MPTree open here until they're sent."),
  };
  return {
    icon: "check", solid: true, head: t("All set"), flow: "calm",
    sub: g.arrived > 0
      ? tn(g.arrived, "{n} song arrived since you opened MPTree.", "{n} songs arrived since you opened MPTree.")
      : t("Every device has all your songs."),
  };
}

/** The line under Account & sync in Settings: the same story, shorter. */
export function syncSummary(s: SyncState, pro: boolean): string {
  if (s.phase === "joining") return t("Signing in…");
  if (s.phase === "limit") return tn(MAX_DEVICES, "Your account is already on {n} device", "Your account is already on {n} devices");
  if (s.phase === "removed") return s.removedWhy === "emptied" ? t("Your account's data was deleted") : t("This device was removed from your account");
  if (s.phase !== "on") return pro ? t("Off · sign in to share your music between devices") : t("Your music on all your devices");
  if (s.pausedNoPro) return t("Paused · sync is part of MPTree Pro");
  if (s.problem === "offline") return t("Paused · no internet");
  if (s.problem === "drive") return t("Paused · can't reach Google Drive");
  if (s.problem === "full") return t("Paused · your Google storage is full");
  if (!s.devices.length) return s.account?.email ?? "";
  const st = syncStatus(s);
  return st.solid ? t("All set · {email}", { email: s.account?.email ?? "" }) : st.head;
}
