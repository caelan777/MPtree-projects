import { NL } from "./i18n-nl";

// ─── LANGUAGE ────────────────────────────────────────────────────────────────
// Every piece of text the app shows goes through t(), keyed on the English
// sentence itself:
//
//   t("Removed songs")
//   t("{n} songs", { n: 12 })
//   tn(count, "{n} song", "{n} songs")
//
// English keys keep the component code readable, and a sentence nobody has
// translated yet falls back to English instead of to a blank or to a key name.
// The Dutch lives in i18n-nl.ts, one entry per English sentence.
//
// The language is a module variable rather than a context: App re-renders the
// whole tree when it changes (see setLanguage in App.tsx), and the two memo()
// components hold no text, so nothing can be left behind in the old language.

export type Lang = "en" | "nl";
export type LangPref = "auto" | Lang;

/** The phone's own language, narrowed to one MPTree has. */
export function phoneLang(): Lang {
  const langs = typeof navigator !== "undefined"
    ? (navigator.languages?.length ? navigator.languages : [navigator.language])
    : [];
  for (const l of langs) {
    const code = (l || "").toLowerCase();
    if (code.startsWith("nl")) return "nl";
    if (code.startsWith("en")) return "en";
  }
  return "en";
}

let current: Lang = phoneLang();

export function applyLang(pref: LangPref): Lang {
  current = pref === "auto" ? phoneLang() : pref;
  if (typeof document !== "undefined") document.documentElement.lang = current;
  return current;
}

export function getLang(): Lang { return current; }

// In development, every English sentence shown while Dutch is on that has no
// Dutch yet is collected here, so a walk through the app can prove there is
// nothing left: window.__mptreeMissing in the console.
const missing = new Set<string>();
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { __mptreeMissing: Set<string> }).__mptreeMissing = missing;
}

export function t(en: string, vars?: Record<string, string | number>): string {
  let s = en;
  if (current === "nl") {
    const nl = NL[en];
    if (nl !== undefined) s = nl;
    else if (import.meta.env.DEV) missing.add(en);
  }
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** One and other. Dutch and English agree on where the line is. */
export function tn(n: number, one: string, other: string, vars?: Record<string, string | number>): string {
  return t(n === 1 ? one : other, { n, ...vars });
}
