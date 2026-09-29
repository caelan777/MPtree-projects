import { useState, useEffect, useRef, type ReactNode } from "react";
import { makeSH, type T } from "../themes";
import type { Theme } from "../types";
import { IC } from "./Icons";
import { Switch } from "./Switch";
import { FaqSheet } from "./FaqSheet";
import { LicencesSheet } from "./LicencesSheet";
import { LanguageSheet } from "./LanguageSheet";
import { t, tn, phoneLang, type LangPref } from "../i18n";
import { useTrial, useOwnsPro, trialTimeLeft } from "../pro";

export type UiSize = "small" | "medium" | "large";

const Svg = ({ children }: { children: ReactNode }) => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

const DownloadIcon = () => <Svg><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></Svg>;
const UploadIcon   = () => <Svg><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></Svg>;
const GlobeIcon    = () => <Svg><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></Svg>;
const BellIcon     = () => <Svg><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></Svg>;
const TextIcon     = () => <Svg><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></Svg>;
const LayersIcon   = () => <Svg><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></Svg>;
const ArrowDownIcon= () => <Svg><polyline points="7 13 12 18 17 13"/><line x1="12" y1="6" x2="12" y2="18"/></Svg>;
const PlayIcon     = () => <Svg><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></Svg>;
const HelpIcon     = () => <Svg><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></Svg>;
const MailIcon     = () => <Svg><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></Svg>;
const StarIcon     = () => <Svg><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></Svg>;
const ShieldIcon   = () => <Svg><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></Svg>;
const FileIcon     = () => <Svg><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></Svg>;
const BrushIcon    = () => <Svg><path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"/></Svg>;
const BroomIcon    = () => <Svg><path d="M19 3l-7 7"/><path d="M12 10l-6 2-3 9 9-3 2-6z"/><path d="M8 15l-2 2"/></Svg>;
const CupIcon      = () => <Svg><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></Svg>;

// Every row in this sheet is the same shape: an icon and a label on the left,
// something on the right, the whole row one button. Declared out here, not
// inside the sheet, so React sees the same component on every render and does
// not rebuild each row whenever the sleep timer ticks.
const rowStyle = (T: T): React.CSSProperties => ({
  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
  width: "100%", background: T.dim, border: "none", borderRadius: 12, padding: "14px 16px",
  cursor: "pointer", color: T.text, fontFamily: "inherit", textAlign: "left",
});

function Row({ icon, label, sub, right, onClick, first, T }: {
  icon: ReactNode; label: string; sub?: string; right?: ReactNode; onClick: () => void; first?: boolean; T: T;
}) {
  return (
    <button onClick={onClick} style={{ ...rowStyle(T), marginTop: first ? 0 : 8 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, minWidth: 0 }}>
        <span style={{ display: "flex", flexShrink: 0 }}>{icon}</span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block" }}>{label}</span>
          {sub && <span style={{ display: "block", fontSize: 12.5, color: T.muted, lineHeight: 1.45, marginTop: 2 }}>{sub}</span>}
        </span>
      </span>
      {right ?? <IC.ChevronR />}
    </button>
  );
}

function ProTag({ T }: { T: T }) {
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
  theme: Theme;
  /** Kept open but out of sight while Personalise is up: that sheet needs the
   *  header card visible and undimmed, and closing it comes back here. */
  hidden?: boolean;
  // ── Pro ──
  pro: boolean;
  onOpenPro: () => void;
  onOpenLook: () => void;
  onOpenCleanup: () => void;
  /** How many probable non-songs the library holds, shown on the row. */
  cleanupCount: number;
  binCount: number;
  onToggleTheme: () => void;
  onViewBin: () => void;
  onOpenAudioEffects: () => void;
  /** Re-runs the first-launch spotlight tour. */
  onShowTutorial: () => void;
  /** Opens the pre-export info sheet */
  onExport: () => void;
  /** Opens the pre-import info sheet */
  onImportOpen: () => void;
  /** Opens the support/tip page in the browser. */
  /** A tip jar outside Play. Left out of the Play build: Play does not allow
   *  payments that go around its own billing. */
  onSupport?: () => void;
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
  duckOthers: boolean;
  onSetMix: (mix: boolean, duck: boolean) => void;
  // ── Help ──
  onFeedback: () => void;
  /** Absent outside the Play build: a sideloaded copy cannot be rated on Play. */
  onRate?: () => void;
  onPrivacy: () => void;
  onClose: () => void;
  T: T;
};

export function SettingsSheet({
  theme, hidden, binCount,
  pro, onOpenPro, onOpenLook, onOpenCleanup, cleanupCount,
  onToggleTheme, onViewBin, onOpenAudioEffects, onShowTutorial,
  onExport, onImportOpen, onSupport,
  sleepUntil, sleepEndOfTrack, hasCurrentSong, onSetSleepTimer,
  uiSize, onSetUiSize, lang, onSetLang, updateNotices, onSetUpdateNotices,
  mixOthers, duckOthers, onSetMix,
  onFeedback, onRate, onPrivacy,
  onClose, T,
}: SettingsSheetProps) {
  const sh = makeSH(T);
  const trial = useTrial();
  const ownsPro = useOwnsPro();
  // The countdown on the Pro card moves while Settings is open.
  const [, tick] = useState(0);
  useEffect(() => {
    if (trial.state !== "live") return;
    const id = setInterval(() => tick(n => n + 1), 30_000);
    return () => clearInterval(id);
  }, [trial.state]);
  // Sheets opened from here stack on top of this one, so closing them lands
  // you back where you were in Settings rather than on the song list.
  const [sub, setSub] = useState<null | "faq" | "licences" | "language">(null);

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
    ? t("Phone ({name})", { name: phoneLang() === "nl" ? "Nederlands" : "English" })
    : lang === "nl" ? "Nederlands" : "English";

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
                {trial.state === "live" && !ownsPro ? t("Free week, {time} left.", { time: trialTimeLeft(trial.until) })
                  : pro ? t("Thank you for supporting MPTree.")
                  : trial.state === "unused" ? t("Records, shades, icons and more. Try it free for a week.")
                  : t("Records, shades, icons and more. Pay once.")}
              </span>
            </span>
            <IC.ChevronR />
          </button>
        </div>

        <Section T={T} title={t("Appearance")}>
          <Row T={T}
            first
            onClick={onToggleTheme}
            icon={theme === "dark" ? <IC.Moon /> : <IC.Sun />}
            label={theme === "dark" ? t("Dark mode") : t("Light mode")}
            right={<Switch on={theme === "light"} T={T} />}
          />
          <Row T={T}
            onClick={onOpenLook}
            icon={<BrushIcon />}
            label={t("Personalise")}
            sub={t("Shades, header card, record and app icon.")}
            right={<span style={{ display: "flex", alignItems: "center", gap: 6 }}>{!pro && <ProTag T={T} />}<IC.ChevronR /></span>}
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
            onClick={() => onSetMix(!mixOthers, mixOthers ? false : duckOthers)}
            icon={<LayersIcon />}
            label={t("Play alongside other apps")}
            sub={t("Keep playing when another app, like a video, makes sound.")}
            right={<Switch on={mixOthers} T={T} />}
          />
          {mixOthers && (
            <Row T={T}
              onClick={() => onSetMix(true, !duckOthers)}
              icon={<ArrowDownIcon />}
              label={t("Turn other apps down") + " · " + t("Experimental")}
              sub={t("Most apps turn themselves back up on the next video.")}
              right={<Switch on={duckOthers} T={T} />}
            />
          )}
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
          <Row T={T}
            first
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
            right={<span style={{ display: "flex", alignItems: "center", gap: 6 }}>{!pro && <ProTag T={T} />}<IC.ChevronR /></span>}
          />
        </Section>

        <Section T={T} title={t("Backup & Restore")}>
          <Row T={T} first onClick={onExport} icon={<DownloadIcon />} label={t("Export backup")} />
          <Row T={T} onClick={onImportOpen} icon={<UploadIcon />} label={t("Restore backup")} />
        </Section>

        <Section T={T} title={t("Help")}>
          <Row T={T} first onClick={onShowTutorial} icon={<PlayIcon />} label={t("Show tutorial")} />
          <Row T={T} onClick={() => setSub("faq")} icon={<HelpIcon />} label={t("Questions")} />
          <Row T={T} onClick={onFeedback} icon={<MailIcon />} label={t("Send feedback")} />
          {onRate && <Row T={T} onClick={onRate} icon={<StarIcon />} label={t("Rate MPTree")} />}
          <Row T={T} onClick={onPrivacy} icon={<ShieldIcon />} label={t("Privacy policy")} />
          <Row T={T} onClick={() => setSub("licences")} icon={<FileIcon />} label={t("Open source licences")} />
        </Section>

        {onSupport && (
          <div style={{ padding: "0 20px" }}>
            <div style={sh.lbl}>{t("Support")}</div>
            <Row T={T} first onClick={onSupport} icon={<CupIcon />} label={t("Buy me a coffee")} />
            <div style={{ fontSize: 12, color: T.muted, marginTop: 8, lineHeight: 1.5 }}>
              {t("MPTree is free. If it is useful to you, you can chip in.")}
            </div>
          </div>
        )}

        {/* Version comes from package.json via Vite, so it always matches the
            build rather than whatever was last typed here. */}
        <div style={{ padding: "14px 20px 0", color: T.muted, fontSize: 12 }}>MPTree {__APP_VERSION__}</div>

        </div>
      </div>

      {/* Outside the sheet's own box so they are not moved by its drag, and
          stopped here so a tap on their backdrop closes only them. */}
      <div onClick={e => e.stopPropagation()}>
        {sub === "faq"      && <FaqSheet onClose={() => setSub(null)} T={T} />}
        {sub === "licences" && <LicencesSheet onClose={() => setSub(null)} T={T} />}
        {sub === "language" && (
          <LanguageSheet value={lang} onPick={v => { onSetLang(v); setSub(null); }} onClose={() => setSub(null)} T={T} />
        )}
      </div>
    </div>
  );
}
