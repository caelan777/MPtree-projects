import { NL } from "./i18n-nl";
import { ES } from "./i18n-es";

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
// Each other language lives in its own file (i18n-nl.ts, i18n-es.ts), one
// entry per English sentence. A new language is a file like those, a line in
// LANGS, LANG_NAMES and TABLES here, and a flag in LanguageSheet.tsx.
//
// The language is a module variable rather than a context: App re-renders the
// whole tree when it changes (see setLanguage in App.tsx), and the two memo()
// components hold no text, so nothing can be left behind in the old language.

export type Lang = "en" | "nl" | "es";
export type LangPref = "auto" | Lang;

/** In the order the language picker shows them. */
export const LANGS: Lang[] = ["en", "nl", "es"];
/** Each language named in itself. */
export const LANG_NAMES: Record<Lang, string> = { en: "English", nl: "Nederlands", es: "Español" };
export const isLang = (v: unknown): v is Lang => LANGS.includes(v as Lang);

const TABLES: Partial<Record<Lang, Record<string, string>>> = { nl: NL, es: ES };

/** The phone's own language, narrowed to one MPTree has. */
export function phoneLang(): Lang {
  const langs = typeof navigator !== "undefined"
    ? (navigator.languages?.length ? navigator.languages : [navigator.language])
    : [];
  for (const l of langs) {
    const code = (l || "").toLowerCase();
    const known = LANGS.find(l => code.startsWith(l));
    if (known) return known;
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

// In development, every English sentence shown in another language that has
// no translation yet is collected here, so a walk through the app can prove there is
// nothing left: window.__mptreeMissing in the console.
const missing = new Set<string>();
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { __mptreeMissing: Set<string> }).__mptreeMissing = missing;
}

export function t(en: string, vars?: Record<string, string | number>): string {
  let s = en;
  const table = TABLES[current];
  if (table) {
    const own = table[en];
    if (own !== undefined) s = own;
    else if (import.meta.env.DEV) missing.add(en);
  }
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** One and other. English, Dutch and Spanish agree on where the line is. */
export function tn(n: number, one: string, other: string, vars?: Record<string, string | number>): string {
  return t(n === 1 ? one : other, { n, ...vars });
}

/** 840 MB, 4.2 GB. */
export function fmtBytes(n: number): string {
  if (n >= 1024 ** 3) return t("{n} GB", { n: (n / 1024 ** 3).toFixed(1) });
  return t("{n} MB", { n: Math.max(1, Math.round(n / 1024 ** 2)) });
}
