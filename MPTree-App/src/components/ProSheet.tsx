import { useEffect, useState, type ReactNode } from "react";
import { makeSH, type T } from "../themes";
import { t } from "../i18n";
import { IC } from "./Icons";
import { Logo } from "./Logo";
import { usePro, buyPro, restorePro, proPrice, lockProForTesting, PRO_MODE } from "../pro";

// ─── MPTREE PRO ──────────────────────────────────────────────────────────────
// What Pro is and the one button that buys it. Opened from Settings, and from
// anything Pro that someone without it taps.

const Svg = ({ children }: { children: ReactNode }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
const RecordIcon = () => <Svg><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><path d="M12 5a7 7 0 0 1 7 7"/></Svg>;
const ShadeIcon  = () => <Svg><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 0 0 20z" fill="currentColor"/></Svg>;
const CardIcon   = () => <Svg><rect x="3" y="4" width="18" height="8" rx="3"/><line x1="3" y1="17" x2="21" y2="17"/><line x1="3" y1="21" x2="14" y2="21"/></Svg>;
const IconIcon   = () => <Svg><rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/></Svg>;
const BroomIcon  = () => <Svg><path d="M19 3l-7 7"/><path d="M12 10l-6 2-3 9 9-3 2-6z"/><path d="M8 15l-2 2"/></Svg>;

type ProSheetProps = {
  onClose: () => void;
  onToast: (msg: string) => void;
  /** Opens a store link. The sideloaded build uses it to point at Play. */
  onOpenStore: () => void;
  T: T;
};

export function ProSheet({ onClose, onToast, onOpenStore, T }: ProSheetProps) {
  const sh = makeSH(T);
  const pro = usePro();
  const [price, setPrice] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "buy" | "restore">(null);

  useEffect(() => {
    let live = true;
    proPrice().then(p => { if (live) setPrice(p); });
    return () => { live = false; };
  }, []);

  const buy = async () => {
    setBusy("buy");
    const r = await buyPro();
    setBusy(null);
    if (r === "owned") onToast(t("Pro unlocked. Thank you!"));
    else if (r === "pending") onToast(t("Payment pending. Pro unlocks as soon as it goes through."));
    else if (r === "failed") onToast(t("Google Play could not be reached. Try again in a moment."));
  };
  const restore = async () => {
    setBusy("restore");
    const r = await restorePro();
    setBusy(null);
    onToast(r === null ? t("Google Play could not be reached. Try again in a moment.")
      : r ? t("Pro restored") : t("No Pro purchase found on this Google account"));
  };

  const features: { icon: ReactNode; title: string; body: string }[] = [
    { icon: <RecordIcon />, title: t("Records"),      body: t("White, smoke and marble records for the player.") },
    { icon: <ShadeIcon />,  title: t("Shades"),       body: t("Plum, pink, AMOLED and graphite for dark mode. Pink, sage, paper and stone for light.") },
    { icon: <CardIcon />,   title: t("Header card"),  body: t("Give the card at the top a colour of its own, from either mode.") },
    { icon: <IconIcon />,   title: t("App icon"),     body: t("Four icons for your home screen, or one with your own photo.") },
    { icon: <BroomIcon />,  title: t("Clean up"),     body: t("Finds voice notes, WhatsApp audio and clips under a minute, and bins them in one go.") },
  ];

  const priceLabel = price ?? "€2,99";

  return (
    <div style={{ ...sh.overlay, zIndex: 450 }} onClick={onClose}>
      <div style={{ ...sh.sheet, maxHeight: "88vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
        <div style={sh.handle} />
        <div style={{ ...sh.hdr, paddingBottom: 4 }}>
          <span />
          <button onClick={onClose} style={sh.xBtn} aria-label={t("Close")}><IC.Close /></button>
        </div>

        <div style={{ overflowY: "auto", padding: "0 20px 8px" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Logo size={40} color={T.text} />
              <span style={{ fontSize: 26, fontWeight: 800, color: T.text, letterSpacing: "-0.01em" }}>
                MPTree <span style={{ fontWeight: 800, background: T.accent, color: T.playBtnFg, borderRadius: 7, padding: "1px 7px", fontSize: 20, verticalAlign: "3px" }}>Pro</span>
              </span>
            </div>
            <div style={{ fontSize: 14, color: T.textSub, marginTop: 10, lineHeight: 1.5 }}>
              {pro ? t("You have Pro. Thank you for supporting MPTree.") : t("Pay once, keep it forever. No subscription.")}
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            {features.map(f => (
              <div key={f.title} style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "11px 2px", borderTop: `1px solid ${T.dim}` }}>
                <span style={{ display: "flex", color: T.text, marginTop: 1, flexShrink: 0 }}>{f.icon}</span>
                <span>
                  <span style={{ display: "block", fontSize: 15, fontWeight: 700, color: T.text }}>{f.title}</span>
                  <span style={{ display: "block", fontSize: 13, color: T.textSub, lineHeight: 1.45, marginTop: 2 }}>{f.body}</span>
                </span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5, marginTop: 6 }}>
            {t("Everything that is free now stays free.")}
          </div>
        </div>

        <div style={{ padding: "12px 20px 0", flexShrink: 0 }}>
          {pro ? (
            PRO_MODE === "free" ? (
              <button onClick={() => { lockProForTesting(); onToast(t("Pro locked again")); }}
                style={{ ...sh.saveBtn, background: T.dim, color: T.text }}>
                {t("Lock Pro again (test build)")}
              </button>
            ) : (
              <button onClick={onClose} style={sh.saveBtn}>{t("Done")}</button>
            )
          ) : PRO_MODE === "none" ? (
            <>
              <div style={{ fontSize: 13, color: T.textSub, lineHeight: 1.5, marginBottom: 12, textAlign: "center" }}>
                {t("Pro is sold through Google Play. This copy of MPTree came from the website, so it cannot buy it.")}
              </div>
              <button onClick={onOpenStore} style={sh.saveBtn}>{t("Open Google Play")}</button>
            </>
          ) : (
            <>
              <button onClick={buy} disabled={busy !== null}
                style={{ ...sh.saveBtn, opacity: busy ? 0.6 : 1 }}>
                {PRO_MODE === "free"
                  ? t("Unlock Pro for free (test build)")
                  : busy === "buy" ? t("Opening Google Play…") : t("Get Pro for {price}", { price: priceLabel })}
              </button>
              {PRO_MODE === "play" && (
                <button onClick={restore} disabled={busy !== null}
                  style={{ ...sh.saveBtn, background: "transparent", color: T.muted, fontWeight: 600, fontSize: 14, marginTop: 4 }}>
                  {busy === "restore" ? t("Checking…") : t("Restore purchase")}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
