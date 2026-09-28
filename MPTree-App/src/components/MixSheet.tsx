import type { T } from "../themes";
import { t } from "../i18n";
import { InfoSheet } from "./InfoSheet";
import { Switch } from "./Switch";

/**
 * Shown once, the first time music starts on a Bluetooth device: the choice
 * between MPTree pausing when another app makes a sound (the Android default)
 * and carrying on underneath it. The same two switches live in Settings > Audio
 * afterwards; this sheet only exists so people find out they are there.
 *
 * What it does NOT claim: sending MPTree to the headphones and the other app to
 * the phone. Android gives no app that power over another app's sound. Samsung
 * built it into their own settings, so on a Samsung the sheet says where.
 */
export function MixSheet({ mix, duck, onChange, isSamsung, onOpenSoundSettings, onClose, T }: {
  mix: boolean;
  duck: boolean;
  onChange: (mix: boolean, duck: boolean) => void;
  isSamsung: boolean;
  onOpenSoundSettings: () => void;
  onClose: () => void;
  T: T;
}) {
  const row: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 14, width: "100%", textAlign: "left",
    background: T.dim, border: "none", borderRadius: 12, padding: "14px 16px",
    cursor: "pointer", color: T.text, fontFamily: "inherit",
  };
  const sub: React.CSSProperties = { fontSize: 12.5, color: T.muted, lineHeight: 1.5, marginTop: 3 };

  return (
    <InfoSheet
      title={t("Listening on Bluetooth")}
      onClose={onClose}
      T={T}
      footer={
        <button
          onClick={onClose}
          style={{ width: "100%", padding: 14, background: T.accent, color: T.playBtnFg, border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
        >
          {t("Done")}
        </button>
      }
    >
      <p style={{ color: T.textSub, fontSize: 14, lineHeight: 1.6, margin: "0 0 16px" }}>
        {t("When another app starts making sound, a video for instance, MPTree pauses. You can let your music keep going instead.")}
      </p>

      <button style={row} onClick={() => onChange(!mix, mix ? false : duck)} aria-pressed={mix}>
        <span style={{ flex: 1 }}>
          <span style={{ fontSize: 15 }}>{t("Play alongside other apps")}</span>
          <span style={{ ...sub, display: "block" }}>{t("Your music keeps playing when another app plays sound.")}</span>
        </span>
        <Switch on={mix} T={T} />
      </button>

      <button
        style={{ ...row, marginTop: 8, cursor: mix ? "pointer" : "default" }}
        onClick={() => { if (mix) onChange(mix, !duck); }}
        aria-pressed={duck}
        aria-disabled={!mix}
      >
        <span style={{ flex: 1, opacity: mix ? 1 : 0.5 }}>
          <span style={{ fontSize: 15 }}>{t("Turn other apps down")}</span>
          <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: T.muted, border: `1px solid ${T.border}`, borderRadius: 6, padding: "1px 5px", verticalAlign: "2px" }}>
            {t("Experimental")}
          </span>
          <span style={{ ...sub, display: "block" }}>
            {t("Asks Android to lower the other app while your music plays. Most apps turn themselves back up when they start something new, like the next video.")}
          </span>
        </span>
        <Switch on={mix && duck} T={T} disabled={!mix} />
      </button>

      <p style={{ ...sub, fontSize: 12.5, margin: "16px 2px 0" }}>
        {t("Sending only your music to the headphones and the other app to the phone's speaker is something Android does not let one app do to another.")}
        {isSamsung ? " " + t("Your Samsung can do it itself, though:") : ""}
      </p>

      {isSamsung && (
        <div style={{ marginTop: 10, padding: "12px 14px", borderRadius: 12, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 13.5, color: T.text, lineHeight: 1.55 }}>
            {t("Settings > Sounds and vibration > Separate app sound. Choose MPTree and your Bluetooth device.")}
          </div>
          <button
            onClick={onOpenSoundSettings}
            style={{ marginTop: 10, background: "transparent", border: `1px solid ${T.border}`, borderRadius: 10, padding: "8px 12px", color: T.text, fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
          >
            {t("Open sound settings")}
          </button>
        </div>
      )}

      <p style={{ ...sub, margin: "14px 2px 0" }}>{t("You can change this any time in Settings, under Audio.")}</p>
    </InfoSheet>
  );
}
