import { useEffect, useState } from "react";
import { makeSH, type T } from "../themes";
import { t } from "../i18n";
import { count } from "../counter";
import { useLook, useVinyl, LANTERN_RECORDS, isFlowerRecord } from "../look";
import { buyPro, useProPrice, ADS_ON, PRO_MODE } from "../pro";
import { useSync } from "../sync/engine";
import { MiniDisc, type DiscKind } from "./ProArt";

// ─── WHEN THE PRO DAY IS OVER ────────────────────────────────────────────────
// What comes up when a day of Pro is over (see pro.ts). Pro stays on while it
// is up, look and all, so nothing is lost by deciding now. It names what was
// used that day, and offers to keep it for good, or one more day for an ad.
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
  /** Bought here: App says thank you. */
  onBought: () => void;
  onToast: (msg: string) => void;
  onNotNow: () => void;
  T: T;
};

export function AdDayPrompt({ stage, onWatch, onBought, onToast, onNotNow, T }: AdDayPromptProps) {
  const sh = makeSH(T);
  const [busy, setBusy] = useState<null | "ad" | "buy">(null);
  const price = useProPrice();
  const sync = useSync();
  const look = useLook();
  const vinyl = useVinyl();
  useEffect(() => { count("pro-day-over"); }, []);

  // What of Pro is on show right now, which is what was picked that day.
  const used: { kind: DiscKind; name: string }[] = [];
  if ((LANTERN_RECORDS as readonly string[]).includes(vinyl) && look.flowers === "none") used.push({ kind: "lantern", name: "Lantern" });
  else if (look.flowers !== "none" || isFlowerRecord(vinyl)) used.push({ kind: "aviela", name: "Aviela" });
  if (vinyl === "smoke") used.push({ kind: "smoke", name: t("the smoke record") });
  if (vinyl === "marble") used.push({ kind: "marble", name: t("the marble record") });

  const watch = async () => {
    if (busy) return;
    setBusy("ad");
    await onWatch();
    setBusy(null);
  };
  const buy = async () => {
    if (busy) return;
    count("pro-tap-buy");
    setBusy("buy");
    const r = await buyPro(sync.phase === "on" ? sync.account?.email : undefined);
    setBusy(null);
    if (r === "owned") onBought();
    else if (r === "pending") onToast(t("Payment pending. Pro unlocks as soon as it goes through."));
    else if (r === "failed") onToast(t("Google Play could not be reached. Try again in a moment."));
  };

  const title = stage === 1 ? t("Your Pro day is over.")
    : stage === 2 ? t("Your extra hour of Pro is over.")
    : t("Pro is turned off.");
  const what = used.length === 2 ? t("{a} and {b}", { a: used[0].name, b: used[1].name }) : used[0]?.name;
  const body = stage === "off" ? t("To get it back, keep Pro for {price}, once. Or have one more day free.", { price })
    : what ? t("You used {what}. Keep it for {price}, once.", { what, price })
    : t("Keep Pro for {price}, once. Everything you picked stays as it is.", { price });
  const footnote = stage === 1 ? t("Not now keeps Pro on for one more hour.")
    : stage === 2 ? t("Not now turns Pro off.")
    : null;
  const canAd = ADS_ON || import.meta.env.DEV;

  return (
    <div style={sh.overlay} onClick={busy ? undefined : onNotNow}>
      <div style={sh.sheet} onClick={e => e.stopPropagation()}>
        <div style={sh.handle} />
        <div style={{ padding: "18px 20px 6px" }}>
          {used.length > 0 && (
            <div style={{ display: "flex", gap: 8 }}>
              {used.map(u => <MiniDisc key={u.kind} kind={u.kind} size={46} />)}
            </div>
          )}
          <div style={{ fontSize: 22, fontWeight: 800, color: T.text, marginTop: used.length ? 14 : 4, lineHeight: 1.25 }}>{title}</div>
          <p style={{ color: T.textSub, fontSize: 14.5, lineHeight: 1.55, margin: "6px 0 20px" }}>{body}</p>

          {PRO_MODE !== "none" && (
            <button onClick={buy} disabled={busy !== null} style={{ ...sh.saveBtn, fontFamily: "inherit", padding: 15, opacity: busy === "buy" ? 0.7 : 1 }}>
              {busy === "buy" ? t("Opening Google Play…") : t("Keep Pro · {price}", { price })}
            </button>
          )}
          {canAd && (
            <button onClick={watch} disabled={busy !== null}
              style={{ ...sh.saveBtn, fontFamily: "inherit", marginTop: 10, padding: "10px 14px", background: "transparent", color: T.text, border: `1.5px solid ${T.border}`, lineHeight: 1.25, opacity: busy === "ad" ? 0.7 : 1 }}>
              {busy === "ad" ? t("Loading the ad…") : (
                <>
                  <span style={{ display: "block" }}>{t("One more day free")}</span>
                  <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: T.muted }}>{t("Watch one ad")}</span>
                </>
              )}
            </button>
          )}
          <button onClick={onNotNow} disabled={busy !== null}
            style={{ ...sh.saveBtn, fontFamily: "inherit", marginTop: 4, background: "transparent", color: T.muted, fontWeight: 600 }}>
            {stage === "off" ? t("OK") : t("Not now")}
          </button>
          {footnote && (
            <div style={{ fontSize: 12.5, color: T.muted, textAlign: "center", marginTop: 0 }}>{footnote}</div>
          )}
        </div>
      </div>
    </div>
  );
}
