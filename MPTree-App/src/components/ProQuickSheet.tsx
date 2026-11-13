import { useEffect, useState } from "react";
import type { T } from "../themes";
import { t } from "../i18n";
import { count } from "../counter";
import { buyPro, watchAdForPro, adOkText, adFailText, useProPrice, ADS_ON, PRO_MODE } from "../pro";
import { useSync } from "../sync/engine";

// ─── PART OF PRO ─────────────────────────────────────────────────────────────
// Keeping something locked in Personalise. The preview stays on show above
// this small sheet: the price and one button, right where the choice was
// made, instead of a jump to the whole Pro page. "See all of Pro" is there
// for whoever wants the page.

export function ProQuickSheet({ name, onGot, onAll, onClose, onToast, T }: {
  /** What is on show: "Lantern", "Aviela", or null for anything else. */
  name: string | null;
  /** Pro is on now (bought, or a day for an ad): keep what was picked. */
  onGot: () => void;
  onAll: () => void;
  onClose: () => void;
  onToast: (msg: string) => void;
  T: T;
}) {
  const price = useProPrice();
  const sync = useSync();
  const [busy, setBusy] = useState<null | "buy" | "ad">(null);
  useEffect(() => { count("pro-look-sheet"); }, []);

  const buy = async () => {
    count("pro-tap-buy");
    setBusy("buy");
    const r = await buyPro(sync.phase === "on" ? sync.account?.email : undefined);
    setBusy(null);
    if (r === "owned") { onToast(t("Pro unlocked. Thank you!")); onGot(); }
    else if (r === "pending") onToast(t("Payment pending. Pro unlocks as soon as it goes through."));
    else if (r === "failed") onToast(t("Google Play could not be reached. Try again in a moment."));
  };
  const ad = async () => {
    setBusy("ad");
    const r = await watchAdForPro();
    setBusy(null);
    if (r === "pro" || r === "pro-free") { onToast(adOkText(r)); onGot(); }
    else onToast(adFailText(r));
  };
  const link = { background: "transparent", border: "none", padding: "10px 4px", color: T.muted, fontSize: 13.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" } as const;

  return (
    <div onClick={busy ? undefined : onClose} style={{ position: "fixed", inset: 0, zIndex: 490, display: "flex", alignItems: "flex-end" }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: 560, margin: "0 auto", background: T.sheetBg, borderRadius: "22px 22px 0 0",
        boxShadow: "0 -10px 40px rgba(0,0,0,0.28)", padding: "10px 20px calc(env(safe-area-inset-bottom, 0px) + 12px)",
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: T.dim, margin: "0 auto 14px" }} />
        <div style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>{t("Preview")}</div>
        <div style={{ fontSize: 21, fontWeight: 800, color: T.text, marginTop: 2, lineHeight: 1.25 }}>
          {name ? t("{name} is part of Pro.", { name }) : t("This is part of Pro.")}
        </div>
        <div style={{ fontSize: 14, color: T.textSub, marginTop: 6 }}>{t("This is how it looks. {price}, once.", { price })}</div>
        {PRO_MODE !== "none" ? (
          <button onClick={buy} disabled={busy !== null} style={{
            width: "100%", marginTop: 16, padding: 15, borderRadius: 14, border: "none", cursor: "pointer",
            background: T.accent, color: T.playBtnFg, fontSize: 15.5, fontWeight: 700, fontFamily: "inherit", opacity: busy === "buy" ? 0.6 : 1,
          }}>{busy === "buy" ? t("Opening Google Play…") : t("Get Pro")}</button>
        ) : (
          <button onClick={onAll} style={{
            width: "100%", marginTop: 16, padding: 15, borderRadius: 14, border: "none", cursor: "pointer",
            background: T.accent, color: T.playBtnFg, fontSize: 15.5, fontWeight: 700, fontFamily: "inherit",
          }}>{t("See all of Pro")}</button>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          {ADS_ON ? (
            <button onClick={ad} disabled={busy !== null} style={{ ...link, color: T.text }}>
              {busy === "ad" ? t("Loading the ad…") : t("Try free for a day")}
            </button>
          ) : PRO_MODE !== "none" ? (
            <button onClick={onAll} style={link}>{t("See all of Pro")}</button>
          ) : <span />}
          <button onClick={onClose} disabled={busy !== null} style={link}>{t("Back")}</button>
        </div>
      </div>
    </div>
  );
}
