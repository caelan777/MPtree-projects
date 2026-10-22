import React, { useState } from "react";
import type { T } from "../themes";
import { t } from "../i18n";

// ─── GET MUSIC ───────────────────────────────────────────────────────────────
// The + in the header. A fixed list of legal places to get music: type a song,
// tap a place, and that site's own search opens in the browser. MPTree itself
// downloads nothing and sends the search nowhere; whatever the person saves
// lands in Download, which the library scan already reads.
//
// None of these sites lets an app search or download for it: Jamendo's API
// terms rule out offline use for an app with ads or Pro, and Bandcamp and Free
// Music Archive have no open API. Hence links, not results.

type MusicSite = "bandcamp" | "jamendo" | "fma" | "qobuz";

// Qobuz keeps a shop per country, and a search outside one is a 404. All of
// these answered a search on 22 October 2026.
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

/** Where a place opens: its search for `query`, or its front page without one. */
function siteUrl(site: MusicSite, query: string): string {
  const q = encodeURIComponent(query.trim());
  switch (site) {
    case "bandcamp": return q ? `https://bandcamp.com/search?q=${q}` : "https://bandcamp.com/";
    case "jamendo":  return q ? `https://www.jamendo.com/search?q=${q}` : "https://www.jamendo.com/";
    case "fma":      return q ? `https://freemusicarchive.org/search?quicksearch=${q}` : "https://freemusicarchive.org/";
    case "qobuz": {
      const shop = qobuzShop();
      if (!shop) return "https://www.qobuz.com/";
      return q ? `https://www.qobuz.com/${shop}/search/?q=${q}` : `https://www.qobuz.com/${shop}/shop`;
    }
  }
}

interface Props {
  query: string;
  onQuery: (q: string) => void;
  onOpen: (url: string) => void;
  onClose: () => void;
  T: T;
}

export function GetMusicSheet({ query, onQuery, onOpen, onClose, T }: Props) {
  const [howTo, setHowTo] = useState(false);

  const chip = (label: string) => (
    <span style={{
      fontSize: 11, fontWeight: 700, color: T.text, background: T.card,
      border: `1px solid ${T.border}`, borderRadius: 10, padding: "2px 8px",
      whiteSpace: "nowrap", flexShrink: 0,
    }}>{label}</span>
  );

  const row = (key: string, name: string, label: string, sub: string, onClick: () => void, right: React.ReactNode) => (
    <button key={key} onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", cursor: "pointer",
      background: T.dim, border: `1px solid ${T.border}`, borderRadius: 14, padding: "13px 16px",
      marginBottom: 10, fontFamily: "inherit", color: T.text,
    }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>{name}</span>
          {label && chip(label)}
        </span>
        <span style={{ display: "block", fontSize: 13, color: T.muted, marginTop: 3, lineHeight: 1.4 }}>{sub}</span>
      </span>
      <span style={{ display: "flex", flexShrink: 0, color: T.muted }}>{right}</span>
    </button>
  );

  const out = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 17 17 7" /><path d="M8 7h9v9" />
    </svg>
  );
  const chevron = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ transform: howTo ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );

  const sites: { site: MusicSite; name: string; label: string; sub: string }[] = [
    { site: "bandcamp", name: "Bandcamp",           label: t("Free or buy"), sub: t("Straight from the artists. Some songs are free, the rest you buy.") },
    // "Free download", not "Free": that one is taken by the account page,
    // where it means an empty device slot ("Vrij", "Libre").
    { site: "jamendo",  name: "Jamendo",            label: t("Free download"), sub: t("Free music from independent artists. Needs a free account.") },
    { site: "fma",      name: "Free Music Archive", label: t("Free download"), sub: t("Free songs shared by the artists themselves.") },
    { site: "qobuz",    name: "Qobuz",              label: t("Buy"),         sub: t("The big names too, as files you keep.") },
  ];

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 400, display: "flex", alignItems: "flex-end" }}
      onClick={onClose}
    >
      <div
        style={{ width: "100%", background: T.card, borderRadius: "20px 20px 0 0", padding: "8px 20px 44px", maxHeight: "90vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ width: 36, height: 4, background: T.border, borderRadius: 2, margin: "8px auto 16px" }} />
        <div style={{ fontSize: 18, fontWeight: 700, color: T.text }}>{t("Get music")}</div>
        <div style={{ fontSize: 13, color: T.muted, marginTop: 4, marginBottom: 14, lineHeight: 1.4 }}>
          {t("Free or paid, always legal. What you download shows up in MPTree by itself.")}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.dim, border: `1px solid ${T.border}`, borderRadius: 12, padding: "0 12px", height: 44, marginBottom: 14 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={query}
            onChange={e => onQuery(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            enterKeyHint="search"
            placeholder={t("Song, artist or album")}
            aria-label={t("Song, artist or album")}
            style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 16, fontFamily: "inherit" }}
          />
          {query.length > 0 && (
            <button onClick={() => onQuery("")} aria-label={t("Clear search")} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2, display: "flex", color: T.muted }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          )}
        </div>

        {sites.map(s => row(s.site, s.name, s.label, s.sub, () => onOpen(siteUrl(s.site, query)), out))}

        {row("computer", t("From your computer"), "", t("Songs you already have, copied over with a cable."), () => setHowTo(v => !v), chevron)}
        {howTo && (
          <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.55, padding: "0 4px 12px" }}>
            {t("Connect your device to a computer with a cable and choose File transfer. Open it on the computer and copy your songs into the Music folder. They show up in MPTree by themselves.")}
          </div>
        )}

        <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5, marginTop: 4, opacity: 0.85 }}>
          {t("Albums often come as a .zip. Open it in Files and tap Extract, and the songs show up here.")}
        </div>
      </div>
    </div>
  );
}
