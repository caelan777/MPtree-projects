import { useState } from "react";
import { makeSH, pageGround, type T } from "../themes";
import { t } from "../i18n";
import { IC } from "./Icons";

// ─── GET MUSIC ───────────────────────────────────────────────────────────────
// The + in the header. A page of its own with the legal places to get music;
// tapping one opens that site in the browser. MPTree itself downloads nothing;
// whatever the person saves lands in Download, which the library scan already
// reads.
//
// None of these sites lets an app search or download for it (Bandcamp has no
// open API), hence links, not results. Never a site that rips songs from
// YouTube or the like: that is what the + removed on 2 August 2026 led to.

type MusicSite = "bandcamp" | "qobuz";

// Qobuz keeps a shop per country, and outside one a page is a 404. All of
// these answered on 22 October 2026.
const QOBUZ_BY_COUNTRY: Record<string, string> = {
  US: "us-en", GB: "gb-en", IE: "ie-en", AU: "au-en", NZ: "nz-en",
  NL: "nl-nl", DE: "de-de", AT: "at-de", FR: "fr-fr", LU: "lu-fr",
  IT: "it-it", ES: "es-es", PT: "pt-pt", SE: "se-en", DK: "dk-en",
  NO: "no-en", FI: "fi-en", BR: "br-pt", MX: "mx-es", AR: "ar-es",
  CL: "cl-es", CO: "co-es", JP: "jp-ja",
};
const QOBUZ_BY_LANGUAGE: Record<string, string> = {
  nl: "nl-nl", es: "es-es", de: "de-de", fr: "fr-fr", it: "it-it", pt: "pt-pt", ja: "jp-ja",
};

/** The Qobuz shop for this device's locale, or null when there is none. */
function qobuzShop(): string | null {
  const tag = (navigator.languages?.[0] ?? navigator.language ?? "").replace("_", "-");
  const [lang = "", region = ""] = tag.split("-");
  const country = region.toUpperCase();
  const fr = lang.toLowerCase() === "fr";
  if (country === "BE") return fr ? "be-fr" : "be-nl";
  if (country === "CH") return fr ? "ch-fr" : "ch-de";
  if (country === "CA") return fr ? "ca-fr" : "ca-en";
  return QOBUZ_BY_COUNTRY[country] ?? QOBUZ_BY_LANGUAGE[lang.toLowerCase()] ?? null;
}

function siteUrl(site: MusicSite): string {
  if (site === "bandcamp") return "https://bandcamp.com/";
  const shop = qobuzShop();
  return shop ? `https://www.qobuz.com/${shop}/shop` : "https://www.qobuz.com/";
}

interface Props {
  onOpen: (url: string) => void;
  onClose: () => void;
  T: T;
}

export function GetMusicSheet({ onOpen, onClose, T }: Props) {
  const sh = makeSH(T);
  // The film that shows how (brag-output/getmusic.mp4), full screen. It ships
  // inside the app (public/get-music-video.mp4), so it plays without internet.
  const [film, setFilm] = useState(false);

  const sites: { site: MusicSite; name: string; label: string; sub: string }[] = [
    { site: "bandcamp", name: "Bandcamp", label: t("Free or buy"), sub: t("Straight from the artists. Some songs are free, the rest you buy.") },
    { site: "qobuz",    name: "Qobuz",    label: t("Buy"),         sub: t("The big names too, as files you keep.") },
  ];

  const out = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 17 17 7" /><path d="M8 7h9v9" />
    </svg>
  );

  // A page of its own, the whole screen, like Pro and Account & sync.
  const column = { width: "100%", maxWidth: 560, margin: "0 auto", boxSizing: "border-box" } as const;
  return (
    <div style={{ position: "fixed", inset: 0, background: pageGround(T), zIndex: 450, display: "flex", flexDirection: "column" }}>
      <div style={{ ...column, display: "flex", justifyContent: "flex-end", padding: "calc(env(safe-area-inset-top, 0px) + 12px) 16px 0", flexShrink: 0 }}>
        <button onClick={onClose} style={sh.xBtn} aria-label={t("Close")}><IC.Close /></button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        <div style={{ ...column, padding: "0 20px calc(env(safe-area-inset-bottom, 0px) + 24px)" }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: T.text, letterSpacing: "-0.01em" }}>{t("Get music")}</div>
          <div style={{ fontSize: 14, color: T.textSub, marginTop: 8, lineHeight: 1.5 }}>
            {t("Free or paid, always legal. What you download shows up in MPTree by itself.")}
          </div>

          <button onClick={() => setFilm(true)} aria-label={t("Watch how it works")}
            style={{ display: "block", width: "100%", margin: "18px 0 20px", padding: 0, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
            <span style={{ display: "block", position: "relative", width: "100%", aspectRatio: "16 / 9", borderRadius: 16, overflow: "hidden", border: `1px solid ${T.border}`, background: "#fff" }}>
              <img src={`${import.meta.env.BASE_URL}get-music-video.jpg`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              <span style={{ position: "absolute", left: "50%", top: "50%", width: 58, height: 58, marginLeft: -29, marginTop: -29, borderRadius: 29, background: "#0b0b0d", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 20px rgba(0,0,0,0.25)" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="#fff" /></svg>
              </span>
            </span>
            <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 8, padding: "0 2px" }}>
              <span style={{ fontSize: 14.5, fontWeight: 700, color: T.text }}>{t("Watch how it works")}</span>
              <span style={{ fontSize: 12.5, color: T.muted }}>0:36</span>
            </span>
          </button>

          {sites.map(s => (
            <button key={s.site} onClick={() => onOpen(siteUrl(s.site))} style={{
              display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", cursor: "pointer",
              background: T.dim, border: `1px solid ${T.border}`, borderRadius: 14, padding: "15px 16px",
              marginBottom: 10, fontFamily: "inherit", color: T.text,
            }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{s.name}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: T.text, background: T.card,
                    border: `1px solid ${T.border}`, borderRadius: 10, padding: "2px 8px", whiteSpace: "nowrap",
                  }}>{s.label}</span>
                </span>
                <span style={{ display: "block", fontSize: 13, color: T.textSub, marginTop: 4, lineHeight: 1.4 }}>{s.sub}</span>
              </span>
              <span style={{ display: "flex", flexShrink: 0, color: T.muted }}>{out}</span>
            </button>
          ))}

          <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5, marginTop: 10 }}>
            {t("Only download music you have the right to. MPTree is not responsible for what you download from other websites.")}
          </div>
        </div>
      </div>

      {film && (
        <div style={{ position: "fixed", inset: 0, zIndex: 460, background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <video src={`${import.meta.env.BASE_URL}get-music-video.mp4`}
            autoPlay controls playsInline onEnded={() => setFilm(false)}
            style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }} />
          <button onClick={() => setFilm(false)} aria-label={t("Close")}
            style={{ position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 12px)", right: 14, width: 44, height: 44, borderRadius: 22, border: "none", background: "rgba(255,255,255,0.9)", color: "#0b0b0d", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <IC.Close />
          </button>
        </div>
      )}
    </div>
  );
}
