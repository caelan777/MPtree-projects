import { useState } from "react";
import { makeSH, type T } from "../themes";
import { t } from "../i18n";
import { Logo } from "./Logo";

// ─── AD DAY PROMPT ───────────────────────────────────────────────────────────
// What comes up when a day of Pro for an ad is over (see pro.ts). Pro stays on
// while it is up, look and all, so watching straight away loses nothing.
//
//   1    The day is over. "Not now" keeps Pro on for one more hour.
//   2    The extra hour is over. "Not now" turns Pro off.
//   off  Pro is off now, and how to get it back.
//
// A tap beside the sheet, or Back, is the same as "Not now".

export type AdDayStage = 1 | 2 | "off";

type AdDayPromptProps = {
  stage: AdDayStage;
  /** Shows the ad. Resolves true once it gave Pro; App says why when it did not. */
  onWatch: () => Promise<boolean>;
  onBuy: () => void;
  onNotNow: () => void;
  T: T;
};

export function AdDayPrompt({ stage, onWatch, onBuy, onNotNow, T }: AdDayPromptProps) {
  const sh = makeSH(T);
  const [busy, setBusy] = useState(false);

  const watch = async () => {
    if (busy) return;
    setBusy(true);
    await onWatch();
    setBusy(false);
  };

  const title = stage === 1 ? t("Your day of Pro is over")
    : stage === 2 ? t("Your extra hour of Pro is over")
    : t("Pro is turned off");
  const body = stage === 1 ? t("Watch one more ad and Pro stays on for another 24 hours. Everything you picked stays as it is.")
    : stage === 2 ? t("Watch an ad to keep Pro for 24 hours. If not, Pro turns off and MPTree goes back to its standard style.")
    : t("To get Pro again, watch an ad for 24 hours, or buy Pro once and keep it for good.");
  const footnote = stage === 1 ? t("Not now keeps Pro on for one more hour.")
    : stage === 2 ? t("Not now turns Pro off.")
    : null;

  return (
    <div style={sh.overlay} onClick={busy ? undefined : onNotNow}>
      <div style={sh.sheet} onClick={e => e.stopPropagation()}>
        <div style={sh.handle} />
        <div style={{ padding: "22px 20px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Logo size={30} color={T.text} />
            <span style={{ fontWeight: 800, background: T.accent, color: T.playBtnFg, borderRadius: 6, padding: "1px 7px", fontSize: 14 }}>Pro</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: T.text, marginTop: 16, lineHeight: 1.25 }}>{title}</div>
          <p style={{ color: T.textSub, fontSize: 14.5, lineHeight: 1.55, margin: "8px 0 22px" }}>{body}</p>

          <button onClick={watch} disabled={busy} style={{ ...sh.saveBtn, fontFamily: "inherit", opacity: busy ? 0.7 : 1 }}>
            {busy ? t("Loading the ad…") : t("Watch an ad")}
          </button>
          <button onClick={onBuy} disabled={busy}
            style={{ ...sh.saveBtn, fontFamily: "inherit", marginTop: 10, background: "transparent", color: T.text, border: `1.5px solid ${T.border}` }}>
            {t("Buy Pro")}
          </button>
          <button onClick={onNotNow} disabled={busy}
            style={{ ...sh.saveBtn, fontFamily: "inherit", marginTop: 4, background: "transparent", color: T.muted, fontWeight: 600 }}>
            {stage === "off" ? t("OK") : t("Not now")}
          </button>
          {footnote && (
            <div style={{ fontSize: 12.5, color: T.muted, textAlign: "center", marginTop: 2 }}>{footnote}</div>
          )}
        </div>
      </div>
    </div>
  );
}
