import { useEffect, useState } from "react";

// Photos of places around the world for the screensaver, from Wikimedia
// Commons' Featured pictures: chosen by the Commons community, free to use under
// their licence (mostly CC BY-SA), on condition the photographer is named. The
// screensaver does that in its corner. No key, no account.

export type Photo = { url: string; title: string; artist: string; licence: string };

const API = "https://commons.wikimedia.org/w/api.php";
const SUBJECTS = ["landscape", "mountains", "lake", "coast", "waterfall", "fjord", "canyon", "desert", "glacier", "beach", "valley", "forest", "island", "volcano", "aurora"];
/** A new photo every minute: also what keeps the screen from burning in. */
const EVERY_MS = 60_000;
/** The list is fetched again after this long, for fresh photos. */
const LIST_TTL = 6 * 3_600_000;

let cache: { at: number; photos: Photo[] } | null = null;

const plain = (html: string | undefined) => (html ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

type ApiPage = {
  title: string;
  imageinfo?: { thumburl?: string; thumbwidth?: number; thumbheight?: number; extmetadata?: Record<string, { value?: string }> }[];
};

async function search(subject: string): Promise<Photo[]> {
  const q = new URLSearchParams({
    action: "query", format: "json", formatversion: "2", origin: "*",
    generator: "search", gsrnamespace: "6", gsrlimit: "40",
    gsrsearch: `incategory:"Featured_pictures_on_Wikimedia_Commons" filetype:bitmap ${subject}`,
    prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: "1920",
  });
  const res = await fetch(`${API}?${q}`);
  if (!res.ok) return [];
  const body = (await res.json()) as { query?: { pages?: ApiPage[] } };
  const out: Photo[] = [];
  for (const p of body.query?.pages ?? []) {
    const ii = p.imageinfo?.[0];
    if (!ii?.thumburl || !ii.thumbwidth || !ii.thumbheight) continue;
    // Wide pictures only: a tall one would be cropped to a sliver on a TV.
    if (ii.thumbwidth < ii.thumbheight * 1.35) continue;
    const m = ii.extmetadata ?? {};
    out.push({
      url: ii.thumburl,
      title: plain(m.ObjectName?.value) || p.title.replace(/^File:/, "").replace(/\.[a-z]+$/i, ""),
      artist: plain(m.Artist?.value).slice(0, 60) || "Wikimedia Commons",
      licence: plain(m.LicenseShortName?.value),
    });
  }
  return out;
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function loadPhotos(): Promise<Photo[]> {
  if (cache && Date.now() - cache.at < LIST_TTL) return cache.photos;
  const picks = shuffle([...SUBJECTS]).slice(0, 4);
  const lists = await Promise.all(picks.map(s => search(s).catch(() => [] as Photo[])));
  const seen = new Set<string>();
  const photos = shuffle(lists.flat().filter(p => !seen.has(p.url) && seen.add(p.url)));
  if (photos.length) cache = { at: Date.now(), photos };
  return photos;
}

/** The photo to show now while `on`, changing every minute, with the next one
 *  already loaded so the change is instant. Null until the first has loaded. */
export function usePhoto(on: boolean): Photo | null {
  const [photo, setPhoto] = useState<Photo | null>(null);

  useEffect(() => {
    if (!on) return;
    let alive = true;
    let i = 0;
    let list: Photo[] = [];
    const preload = (p: Photo) => new Promise<void>(resolve => {
      const img = new Image();
      img.onload = img.onerror = () => resolve();
      img.src = p.url;
    });
    const next = async () => {
      if (!list.length) return;
      const p = list[i++ % list.length];
      await preload(p);
      if (alive) setPhoto(p);
    };
    loadPhotos().then(ps => { list = ps; return next(); }).catch(() => {});
    const t = window.setInterval(next, EVERY_MS);
    return () => { alive = false; window.clearInterval(t); };
  }, [on]);

  return on ? photo : null;
}
