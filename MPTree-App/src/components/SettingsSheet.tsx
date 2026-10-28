import { useState, useEffect, useRef, type ReactNode } from "react";
import { Browser } from "@capacitor/browser";
import { makeSH, pageGround, type T } from "../themes";
import { IC } from "./Icons";
import { Logo } from "./Logo";
import { Switch } from "./Switch";
import { FaqSheet } from "./FaqSheet";
import { LicencesSheet } from "./LicencesSheet";
import { LanguageSheet } from "./LanguageSheet";
import { t, tn, phoneLang, LANG_NAMES, type LangPref } from "../i18n";
import { useAdDay, useOwnsPro, adDayTimeLeft, ADS_ON } from "../pro";
import { Ads, IS_IOS, SIGN_IN_HERE } from "../plugins";
import { useSync } from "../sync/engine";
import { CloudIcon } from "./AccountSheet";
import { FolderIcon, NoteIcon } from "./IosLibrary";

export type UiSize = "small" | "medium" | "large";

const Svg = ({ children }: { children: ReactNode }) => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

const DownloadIcon = () => <Svg><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></Svg>;
const GlobeIcon    = () => <Svg><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></Svg>;
const BellIcon     = () => <Svg><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></Svg>;
const TextIcon     = () => <Svg><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></Svg>;
const LayersIcon   = () => <Svg><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></Svg>;
const PlayIcon     = () => <Svg><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></Svg>;
const HelpIcon     = () => <Svg><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></Svg>;
const MailIcon     = () => <Svg><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></Svg>;
const StarIcon     = () => <Svg><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></Svg>;
const ShieldIcon   = () => <Svg><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></Svg>;
const FileIcon     = () => <Svg><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></Svg>;
const BrushIcon    = () => <Svg><path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"/></Svg>;
const BroomIcon    = () => <Svg><path d="M19 3l-7 7"/><path d="M12 10l-6 2-3 9 9-3 2-6z"/><path d="M8 15l-2 2"/></Svg>;
const InfoIcon     = () => <Svg><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></Svg>;
/** A note with a flick on its stem, for TikTok, without being its logo. */
const TikTokIcon   = () => <Svg><path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 3c.6 2.7 2.6 4.6 5.5 4.8"/></Svg>;
const OutIcon      = () => <Svg><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/></Svg>;
const LinkIcon     = () => <Svg><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></Svg>;

// Every row in this sheet is the same shape: an icon and a label on the left,
// something on the right, the whole row one button. Declared out here, not
// inside the sheet, so React sees the same component on every render and does
// not rebuild each row whenever the sleep timer ticks.
const rowStyle = (T: T): React.CSSProperties => ({
  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
  width: "100%", background: T.dim, border: "none", borderRadius: 12, padding: "14px 16px",
  cursor: "pointer", color: T.text, fontFamily: "inherit", textAlign: "left",
});

/** `tag` goes under the text, not on the right: "Free with an ad" is wide,
 *  and on a small phone with large text it squeezed the label to a word a
 *  line and lay over it. The text takes all the room the right side leaves. */
function Row({ icon, label, sub, tag, right, onClick, first, T }: {
  icon: ReactNode; label: string; sub?: string; tag?: ReactNode; right?: ReactNode; onClick: () => void; first?: boolean; T: T;
}) {
  return (
    <button onClick={onClick} style={{ ...rowStyle(T), marginTop: first ? 0 : 8 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, minWidth: 0, flex: 1 }}>
        <span style={{ display: "flex", flexShrink: 0 }}>{icon}</span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: "block" }}>{label}</span>
          {sub && <span style={{ display: "block", fontSize: 12.5, color: T.muted, lineHeight: 1.45, marginTop: 2 }}>{sub}</span>}
          {tag && <span style={{ display: "flex", marginTop: 6 }}>{tag}</span>}
        </span>
      </span>
      <span style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>{right ?? <IC.ChevronR />}</span>
    </button>
  );
}

/** On something that needs Pro. Where an ad unlocks a day of it, it says so:
 *  "free with an ad" asks less of someone than "Pro" does. */
function ProTag({ T }: { T: T }) {
  if (ADS_ON) return (
    <span style={{ fontSize: 11, fontWeight: 700, color: T.playBtnFg, background: T.accent, borderRadius: 6, padding: "2px 7px", whiteSpace: "nowrap" }}>
      {t("Free with an ad")}
    </span>
  );
  return (
    <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.04em", color: T.playBtnFg, background: T.accent, borderRadius: 5, padding: "2px 6px" }}>
      PRO
    </span>
  );
}

function Section({ title, children, T }: { title: string; children: ReactNode; T: T }) {
  return (
    <div style={{ padding: "0 20px" }}>
      <div style={makeSH(T).lbl}>{title}</div>
      {children}
    </div>
  );
}

type SettingsSheetProps = {
  /** Kept open but out of sight while Personalise is up: that sheet needs the
   *  header card visible and undimmed, and closing it comes back here. */
  hidden?: boolean;
  // ── Pro ──
  pro: boolean;
  onOpenPro: () => void;
  onOpenLook: () => void;
  onOpenAccount: () => void;
  onOpenCleanup: () => void;
  /** How many probable non-songs the library holds, shown on the row. */
  cleanupCount: number;
  binCount: number;
  /** The iPhone's ways in for songs (see components/IosLibrary.tsx). Only
   *  there: Android reads the whole phone by itself. */
  ios?: { onAddSongs: () => void; onFolders: () => void; libraryOn: boolean; onToggleLibrary: () => void };
  onViewBin: () => void;
  onOpenAudioEffects: () => void;
  /** Re-runs the first-launch spotlight tour. */
  onShowTutorial: () => void;
  /** Backup & restore: asks which of the two. */
  onBackup: () => void;
  /** Opens the support/tip page in the browser. */
  // ── Sleep timer ──
  /** Absolute epoch-ms deadline for a fixed-clock sleep timer, or null. */
  sleepUntil: number | null;
  /** True when the timer is armed to pause at the end of the current track. */
  sleepEndOfTrack: boolean;
  /** Whether a song is loaded (enables the "end of track" option). */
  hasCurrentSong: boolean;
  onSetSleepTimer: (minutes: number | "endOfTrack" | null) => void;
  // ── Appearance and general ──
  uiSize: UiSize;
  onSetUiSize: (s: UiSize) => void;
  lang: LangPref;
  onSetLang: (l: LangPref) => void;
  /** null hides the row: the demo has nothing to update. */
  updateNotices: boolean | null;
  onSetUpdateNotices: (on: boolean) => void;
  // ── Other apps ──
  mixOthers: boolean;
  onSetMix: (mix: boolean) => void;
  // ── Help ──
  onFeedback: () => void;
  /** Absent outside the Play build: a sideloaded copy cannot be rated on Play. */
  onRate?: () => void;
  onPrivacy: () => void;
  onClose: () => void;
  T: T;
};

export function SettingsSheet({
  hidden, binCount, ios,
  pro, onOpenPro, onOpenLook, onOpenAccount, onOpenCleanup, cleanupCount,
  onViewBin, onOpenAudioEffects, onShowTutorial,
  onBackup,
  sleepUntil, sleepEndOfTrack, hasCurrentSong, onSetSleepTimer,
  uiSize, onSetUiSize, lang, onSetLang, updateNotices, onSetUpdateNotices,
  mixOthers, onSetMix,
  onFeedback, onRate, onPrivacy,
  onClose, T,
}: SettingsSheetProps) {
  const sh = makeSH(T);
  const adDay = useAdDay();
  const ownsPro = useOwnsPro();
  const sync = useSync();
  // The countdown on the Pro card moves while Settings is open.
  const [, tick] = useState(0);
  useEffect(() => {
    if (adDay.state !== "live") return;
    const id = setInterval(() => tick(n => n + 1), 30_000);
    return () => clearInterval(id);
  }, [adDay.state]);
  // In the EU and the UK, the answer to Google's consent question for the ad
  // must be changeable later. Google says when; until an ad was asked for, never.
  const [adPrivacy, setAdPrivacy] = useState(false);
  useEffect(() => {
    if (ADS_ON) Ads.privacyOptions().then(r => setAdPrivacy(r.required)).catch(() => {});
  }, []);
  // Sheets opened from here stack on top of this one, so closing them lands
  // you back where you were in Settings rather than on the song list.
  const [sub, setSub] = useState<null | "language" | "about">(null);

  // Live remaining-time label for an active fixed-clock timer.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (sleepUntil == null) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [sleepUntil]);

  // ── Swipe-down-to-dismiss ─────────────────────────────────────────────────
  // Drag the handle / header downward to close, in addition to the ✕ button
  // and tapping the dimmed backdrop. The sheet follows the finger and commits
  // to closing once dragged past a threshold; otherwise it springs back.
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStartY = useRef<number | null>(null);
  const CLOSE_THRESHOLD = 90;

  const onDragStart = (e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    setDragging(true);
  };
  const onDragMove = (e: React.TouchEvent) => {
    if (dragStartY.current === null) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    setDragY(Math.max(0, dy));
  };
  const onDragEnd = () => {
    if (dragY > CLOSE_THRESHOLD) { onClose(); return; }
    dragStartY.current = null;
    setDragging(false);
    setDragY(0);
  };

  const sleepActive = sleepUntil != null || sleepEndOfTrack;
  const remainingMs = sleepUntil != null ? Math.max(0, sleepUntil - now) : 0;
  const remainingLabel = (() => {
    if (sleepEndOfTrack) return t("End of track");
    if (sleepUntil == null) return t("Off");
    const totalSec = Math.round(remainingMs / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  })();

  const SLEEP_PRESETS = [15, 30, 45, 60];

  const row = rowStyle(T);

  const SIZES: { id: UiSize; label: string }[] = [
    { id: "small",  label: t("Small")  },
    { id: "medium", label: t("Medium") },
    { id: "large",  label: t("Large")  },
  ];
  const langLabel = lang === "auto"
    ? t("Phone ({name})", { name: LANG_NAMES[phoneLang()] })
    : LANG_NAMES[lang];

  return (
    // Everything opened from here opens on top of it, and closing that comes
    // back here, the same way the questions and language sheets always did.
    <div style={{ ...sh.overlay, visibility: hidden ? "hidden" : undefined }} onClick={onClose}>
      <div
        style={{
          ...sh.sheet, paddingBottom: 0, maxHeight: "75vh", display: "flex", flexDirection: "column", position: "relative",
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? "none" : "transform 0.25s ease",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle + header act as the drag-to-dismiss grip. */}
        <div
          onTouchStart={onDragStart}
          onTouchMove={onDragMove}
          onTouchEnd={onDragEnd}
          onTouchCancel={onDragEnd}
          style={{ flexShrink: 0 }}
        >
          <div style={{ ...sh.handle }} />
          <div style={{ ...sh.hdr }}>
            <span style={{ fontSize: 16, fontWeight: "700", color: T.text }}>{t("Settings")}</span>
            <button onClick={onClose} style={sh.xBtn} aria-label={t("Close")}><IC.Close /></button>
          </div>
        </div>

        <div style={{ overflowY: "auto", flex: 1, paddingBottom: 32, WebkitOverflowScrolling: "touch" }}>

        {/* Pro: a card of its own at the top rather than a row among forty.
            Once bought it stays, smaller, as a thank-you and a way back in. */}
        <div style={{ padding: "0 20px 2px" }}>
          <button
            onClick={onOpenPro}
            style={{
              display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
              background: pro ? T.dim : T.accent, color: pro ? T.text : T.playBtnFg,
              border: "none", borderRadius: 14, padding: pro ? "13px 16px" : "15px 16px",
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 15.5, fontWeight: 800 }}>
                {pro ? t("MPTree Pro is on") : t("Get MPTree Pro")}
              </span>
              <span style={{ display: "block", fontSize: 12.5, opacity: 0.72, marginTop: 2, lineHeight: 1.4 }}>
                {adDay.state === "live" && !ownsPro ? t("Pro for a day, {time} left.", { time: adDayTimeLeft(adDay.until) })
                  : pro ? t("Thank you for supporting MPTree.")
                  : ADS_ON ? t("Free for a day with an ad, or pay once.")
                  : t("Records, shades and more. Pay once.")}
              </span>
            </span>
            <IC.ChevronR />
          </button>
        </div>

        {/* On the iPhone the account waits for its native Google sign-in. */}
        {(!IS_IOS || SIGN_IN_HERE) && <Section T={T} title={t("Account")}>
          <Row T={T}
            first
            onClick={onOpenAccount}
            icon={<CloudIcon />}
            label={t("Account & sync")}
            sub={sync.phase === "on"
              ? (sync.pausedNoPro ? t("Paused. Syncing is part of MPTree Pro.") : sync.account?.email)
              : pro ? t("Sign in to sync your songs between your devices.") : t("Your music on all your devices.")}
            tag={!pro && <ProTag T={T} />}
          />
        </Section>}

        <Section T={T} title={t("Appearance")}>
          {/* Dark or light is not picked here any more: a colour under
              Personalise is one or the other, and brings its mode with it. */}
          <Row T={T}
            first
            onClick={onOpenLook}
            icon={<BrushIcon />}
            label={t("Personalise")}
            sub={t("Styles, your own background, colours, icon and record.")}
            tag={!pro && <ProTag T={T} />}
          />
          {/* Size: text and rows together. One control rather than two: a
              bigger font in a row that stays the same height is a row that
              clips. */}
          <div style={{ ...row, marginTop: 8, cursor: "default", flexDirection: "column", alignItems: "stretch", gap: 12 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15 }}>
              <TextIcon /><span>{t("Size")}</span>
            </span>
            <div role="radiogroup" aria-label={t("Size")} style={{ display: "flex", gap: 4, background: T.surface, borderRadius: 10, padding: 3, border: `1px solid ${T.border}` }}>
              {SIZES.map(s => (
                <button
                  key={s.id}
                  role="radio"
                  aria-checked={uiSize === s.id}
                  onClick={() => onSetUiSize(s.id)}
                  style={{
                    flex: 1, padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer",
                    fontFamily: "inherit", fontWeight: 700,
                    // Each label drawn at the size it stands for, so the choice
                    // shows itself before you make it.
                    fontSize: s.id === "small" ? 12 : s.id === "medium" ? 14 : 16,
                    background: uiSize === s.id ? T.accent : "transparent",
                    color: uiSize === s.id ? T.playBtnFg : T.muted,
                    transition: "background 0.2s, color 0.2s",
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </Section>

        <Section T={T} title={t("General")}>
          <Row T={T}
            first
            onClick={() => setSub("language")}
            icon={<GlobeIcon />}
            label={t("Language")}
            right={<span style={{ display: "flex", alignItems: "center", gap: 6, color: T.muted, fontSize: 14 }}>{langLabel}<IC.ChevronR /></span>}
          />
          {updateNotices !== null && (
            <Row T={T}
              onClick={() => onSetUpdateNotices(!updateNotices)}
              icon={<BellIcon />}
              label={t("Update notices")}
              sub={t("Tell me when a new version of MPTree is out.")}
              right={<Switch on={updateNotices} T={T} />}
            />
          )}
        </Section>

        <Section T={T} title={t("Audio")}>
          <Row T={T} first onClick={onOpenAudioEffects} icon={<IC.EQ />} label={t("Audio Effects")} />
          <Row T={T}
            onClick={() => onSetMix(!mixOthers)}
            icon={<LayersIcon />}
            label={t("Play alongside other apps")}
            sub={t("Keep playing when another app, like a video, makes sound.")}
            right={<Switch on={mixOthers} T={T} />}
          />
        </Section>

        <Section T={T} title={t("Sleep Timer")}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {SLEEP_PRESETS.map(min => (
              <button
                key={min}
                onClick={() => onSetSleepTimer(min)}
                style={{
                  flex: "1 1 0", minWidth: 60, padding: "10px 0", borderRadius: 10,
                  border: `1px solid ${T.border}`,
                  background: T.dim,
                  color: T.text, fontSize: 14, fontWeight: "600", cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {t("{n}m", { n: min })}
              </button>
            ))}
          </div>
          <button
            onClick={() => onSetSleepTimer("endOfTrack")}
            disabled={!hasCurrentSong}
            style={{
              ...row, marginTop: 8,
              border: `1px solid ${sleepEndOfTrack ? T.accent : "transparent"}`,
              cursor: hasCurrentSong ? "pointer" : "default",
              opacity: hasCurrentSong ? 1 : 0.5, fontSize: 15,
            }}
          >
            <span>{t("Stop at end of track")}</span>
            {sleepEndOfTrack && IC.Check(T.text)}
          </button>

          {sleepActive && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, padding: "12px 16px", background: T.dim, borderRadius: 12, border: `1px solid ${T.border}` }}>
              <span style={{ fontSize: 14, color: T.text }}>
                {t("Pausing in")} <strong style={{ color: T.text }}>{remainingLabel}</strong>
              </span>
              <button
                onClick={() => onSetSleepTimer(null)}
                style={{ background: "transparent", border: "none", color: T.muted, fontSize: 13, fontWeight: "700", cursor: "pointer", fontFamily: "inherit" }}
              >
                {t("Cancel")}
              </button>
            </div>
          )}
        </Section>

        <Section T={T} title={t("Library")}>
          {ios && (
            <>
              <Row T={T} first onClick={ios.onAddSongs} icon={<IC.Plus />} label={t("Add songs")}
                sub={t("Copied into the MPTree folder in the Files app.")} />
              <Row T={T} onClick={ios.onFolders} icon={<FolderIcon />} label={t("Music folders")}
                sub={t("Folders MPTree reads every time, like Downloads.")} />
              <Row T={T} onClick={ios.onToggleLibrary} icon={<NoteIcon />} label={t("Music library")}
                sub={t("Songs in the Music app that are stored on this iPhone.")}
                right={<Switch on={ios.libraryOn} T={T} />} />
            </>
          )}
          <Row T={T}
            first={!ios}
            onClick={onViewBin}
            icon={<IC.Bin />}
            label={t("Removed songs")}
            right={
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {/* A count, not an alarm. It was rose, which in MPTree means
                    one thing only: liked. */}
                {binCount > 0 && (
                  <span style={{ background: T.border, color: T.text, borderRadius: 10, padding: "2px 8px", fontSize: 12, fontWeight: "700" }}>{binCount}</span>
                )}
                <IC.ChevronR />
              </span>
            }
          />
          <Row T={T}
            onClick={onOpenCleanup}
            icon={<BroomIcon />}
            label={t("Clean up non-songs")}
            sub={cleanupCount > 0
              ? tn(cleanupCount, "{n} voice note or clip found", "{n} voice notes or clips found")
              : t("Voice notes, recordings and clips under a minute.")}
            tag={!pro && <ProTag T={T} />}
          />
        </Section>

        <Section T={T} title={t("Backup")}>
          <Row T={T} first onClick={onBackup} icon={<DownloadIcon />} label={t("Backup & restore")} sub={t("Make a backup, or put one back.")} />
        </Section>

        {/* Help, privacy, licences and the version were seven rows here. They
            live on a page of their own now, behind this one row. */}
        <Section T={T} title={t("Help")}>
          <Row T={T} first onClick={() => setSub("about")} icon={<InfoIcon />} label={t("About MPTree")}
            sub={t("Help, questions, feedback and privacy.")} />
        </Section>

        </div>
      </div>

      {/* Outside the sheet's own box so they are not moved by its drag, and
          stopped here so a tap on their backdrop closes only them. */}
      <div onClick={e => e.stopPropagation()}>
        {sub === "language" && (
          <LanguageSheet value={lang} onPick={v => { onSetLang(v); setSub(null); }} onClose={() => setSub(null)} T={T} />
        )}
        {sub === "about" && (
          <AboutPage
            onShowTutorial={onShowTutorial} onFeedback={onFeedback} onRate={onRate} onPrivacy={onPrivacy}
            adPrivacy={adPrivacy} onClose={() => setSub(null)} T={T}
          />
        )}
      </div>
    </div>
  );
}

// ─── ABOUT ───────────────────────────────────────────────────────────────────
// A page of its own, the whole screen, like Account & sync: what MPTree is and
// which version, and everything that is help or small print. Settings keeps
// one row for it. The questions and the licences open on top of this page,
// inside it, so closing them comes back here.

function AboutPage({ onShowTutorial, onFeedback, onRate, onPrivacy, adPrivacy, onClose, T }: {
  onShowTutorial: () => void;
  onFeedback: () => void;
  onRate?: () => void;
  onPrivacy: () => void;
  adPrivacy: boolean;
  onClose: () => void;
  T: T;
}) {
  const sh = makeSH(T);
  const [sub, setSub] = useState<null | "faq" | "licences">(null);
  const column = { width: "100%", maxWidth: 560, margin: "0 auto", boxSizing: "border-box" } as const;
  return (
    <div style={{ position: "fixed", inset: 0, background: pageGround(T), zIndex: 450, display: "flex", flexDirection: "column" }}>
      <div style={{ ...column, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "calc(env(safe-area-inset-top, 0px) + 16px) 20px 4px", flexShrink: 0 }}>
        <span style={{ fontSize: 20, fontWeight: 800, color: T.text, letterSpacing: "-0.01em" }}>{t("About MPTree")}</span>
        <button onClick={onClose} style={sh.xBtn} aria-label={t("Close")}><IC.Close /></button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        <div style={{ ...column, paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 28px)" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "22px 20px 8px" }}>
            <Logo size={76} color={T.text} />
            <div style={{ fontSize: 28, fontWeight: 900, color: T.text, marginTop: 14, letterSpacing: "-0.02em" }}>MPTree</div>
            {/* From package.json via Vite, so it always matches the build. */}
            <div style={{ marginTop: 14, fontSize: 12.5, fontWeight: 700, color: T.text, background: T.dim, borderRadius: 12, padding: "5px 12px" }}>
              {t("Version {v}", { v: __APP_VERSION__ })}
            </div>
          </div>

          {/* First, so people who like MPTree find where it is talked about. */}
          <Section T={T} title={t("Follow MPTree")}>
            <Row T={T} first onClick={() => { Browser.open({ url: "https://www.tiktok.com/@mp_tree3" }).catch(() => {}); }}
              icon={<TikTokIcon />} label="TikTok" sub="@mp_tree3" right={<span style={{ color: T.muted, display: "flex" }}><OutIcon /></span>} />
            <Row T={T} onClick={() => { Browser.open({ url: "https://mp-tree.net" }).catch(() => {}); }}
              icon={<LinkIcon />} label="mp-tree.net" right={<span style={{ color: T.muted, display: "flex" }}><OutIcon /></span>} />
          </Section>

          <Section T={T} title={t("Help")}>
            <Row T={T} first onClick={onShowTutorial} icon={<PlayIcon />} label={t("Show tutorial")} />
            <Row T={T} onClick={() => setSub("faq")} icon={<HelpIcon />} label={t("Questions")} />
            <Row T={T} onClick={onFeedback} icon={<MailIcon />} label={t("Send feedback")} />
            {onRate && <Row T={T} onClick={onRate} icon={<StarIcon />} label={t("Rate MPTree")} />}
          </Section>

          <Section T={T} title={t("Privacy")}>
            <Row T={T} first onClick={onPrivacy} icon={<ShieldIcon />} label={t("Privacy policy")} />
            {adPrivacy && <Row T={T} onClick={() => { Ads.showPrivacyOptions().catch(() => {}); }} icon={<ShieldIcon />} label={t("Privacy choices for ads")} />}
            <Row T={T} onClick={() => setSub("licences")} icon={<FileIcon />} label={t("Open source licences")} />
          </Section>

          <div style={{ textAlign: "center", color: T.muted, fontSize: 12, marginTop: 26 }}>by Verkuijl</div>
        </div>
      </div>

      {sub === "faq"      && <FaqSheet onClose={() => setSub(null)} T={T} />}
      {sub === "licences" && <LicencesSheet onClose={() => setSub(null)} T={T} />}
    </div>
  );
}
