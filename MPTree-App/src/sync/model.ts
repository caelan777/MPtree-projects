import type { Song, SongMeta, Playlist } from "../types";

// ─── THE ACCOUNT, AS DATA ────────────────────────────────────────────────────
//
// What the MPTree account holds is one document, library.json, in the person's
// own Drive app folder. Everything a person made is in it: names and artists
// they typed, lyrics, covers, likes, play counts, the bin, playlists, cut
// tracks and settings. The songs themselves are not; phones pass those to each
// other (see engine.ts).
//
// A phone knows a song by its path, and the same song has a different path on
// every phone. So the account knows songs by fingerprint (size plus a checksum,
// SyncPlugin.java), and everything here translates between the two:
//
//   local id  /storage/emulated/0/Music/a.mp3            <->  key  3f9k2-8e1a0b3c
//   cut id    /storage/.../a.mp3__cut__1000__9000__17...  <->  key  3f9k2-8e1a0b3c__cut__1000__9000__17...
//
// A playlist on this phone can hold a song that is not on it yet. It is kept as
// "sync:<key>", which the list skips like any id it cannot find, until the song
// arrives and the id becomes its path.
//
// Merging is three-way. The base is what this phone and the account last
// agreed on; anything that differs from it on one side is a change made there,
// and a change made on both sides goes to the side that made it later. Play
// counts are the exception: plays on both phones add up. The first time a
// phone joins there is no base, and the person chooses (JoinChoice).

export type Key = string;

export type SongRec = {
  customName?: string;
  customArtist?: string;
  customGenre?: string;
  customLyrics?: string;
  /** "cover:<hash>"; the picture itself is in covers.json. */
  customPhoto?: string;
  liked?: boolean;
  lastPlayedAt?: number;
  playCount?: number;
  /** In the bin, on every phone. */
  bin?: boolean;
  /** Deleted for good on one phone. The others still have it in the bin, and
   *  offer to delete it there too. */
  gone?: boolean;
};

export type PlaylistRec = { name: string; createdAt: number; cover?: string; songs: Key[] };
export type CutRec = { title: string; artist: string };

export type LibDoc = {
  v: 1;
  songs: Record<Key, SongRec>;
  playlists: Record<string, PlaylistRec>;
  cuts: Record<Key, CutRec>;
  settings: Record<string, string>;
  /** Which covers covers.json holds, so a phone knows without fetching it. */
  covers?: string[];
  /** When each thing last changed, by "s:" song, "c:" cut, "p:" playlist or
   *  "set:" setting. Decides a change made on two phones. */
  at?: Record<string, number>;
};

export const emptyDoc = (): LibDoc => ({ v: 1, songs: {}, playlists: {}, cuts: {}, settings: {} });

const META_FIELDS = ["customName", "customArtist", "customGenre", "customLyrics", "customPhoto", "liked", "lastPlayedAt", "playCount"] as const;

// ── Keys ──────────────────────────────────────────────────────────────────────

const CUT = "__cut__";
export const PENDING = "sync:";

export function toKey(id: string, fpOf: (path: string) => string | undefined): Key | undefined {
  if (id.startsWith(PENDING)) return id.slice(PENDING.length);
  const i = id.indexOf(CUT);
  const fp = fpOf(i >= 0 ? id.slice(0, i) : id);
  if (!fp) return undefined;
  return i >= 0 ? fp + id.slice(i) : fp;
}

export function toLocalId(key: Key, pathOf: (fp: string) => string | undefined): string | undefined {
  const i = key.indexOf(CUT);
  const path = pathOf(i >= 0 ? key.slice(0, i) : key);
  if (!path) return undefined;
  return i >= 0 ? path + key.slice(i) : path;
}

/** The song a key's file belongs to: the key itself, or a cut's source. */
export const fileOf = (key: Key): string => { const i = key.indexOf(CUT); return i >= 0 ? key.slice(0, i) : key; };

function cutRange(key: Key): { from: number; to: number } | null {
  const i = key.indexOf(CUT);
  if (i < 0) return null;
  const [from, to] = key.slice(i + CUT.length).split("__").map(Number);
  return Number.isFinite(from) && Number.isFinite(to) ? { from, to } : null;
}

// ── Covers ────────────────────────────────────────────────────────────────────
// A cover is a data URL of up to a few hundred kilobytes. The document names it
// by hash, so it travels once, not on every save.

export function hashText(s: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995);
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36) + s.length.toString(36);
}

const COVER = "cover:";
const coverRef = (dataUrl: string, covers: Map<string, string>): string => {
  const h = hashText(dataUrl);
  covers.set(h, dataUrl);
  return COVER + h;
};
export const coverHash = (ref: string | undefined): string | undefined =>
  ref?.startsWith(COVER) ? ref.slice(COVER.length) : undefined;

/** Every cover a document points at. */
export function coverRefs(doc: LibDoc): Set<string> {
  const out = new Set<string>();
  for (const r of Object.values(doc.songs)) { const h = coverHash(r.customPhoto); if (h) out.add(h); }
  for (const p of Object.values(doc.playlists)) { const h = coverHash(p.cover); if (h) out.add(h); }
  return out;
}

// ── This phone, as a document ─────────────────────────────────────────────────

export type LocalInput = {
  /** The list as the app shows it: scanned songs and cut tracks, not the bin. */
  songs: Song[];
  removed: Song[];
  meta: Record<string, SongMeta>;
  playlists: Playlist[];
  settings: Record<string, string>;
  fpOf: (path: string) => string | undefined;
};

export type LocalDoc = {
  doc: LibDoc;
  /** The keys of songs on this phone: the only ones it has a say about. */
  speaks: Set<Key>;
  /** The pictures behind the cover hashes in doc. */
  covers: Map<string, string>;
};

function clean<T extends object>(o: T): T | undefined {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== "" && v !== false && v !== 0) out[k] = v;
  return Object.keys(out).length ? (out as T) : undefined;
}

export function buildLocal(input: LocalInput): LocalDoc {
  const { fpOf } = input;
  const doc = emptyDoc();
  const speaks = new Set<Key>();
  const covers = new Map<string, string>();

  const add = (s: Song, binned: boolean) => {
    const key = toKey(s.id, fpOf);
    if (!key) return;
    speaks.add(key);
    const m = input.meta[s.id] ?? {};
    const rec: SongRec = {};
    for (const f of META_FIELDS) if (m[f] !== undefined) (rec as Record<string, unknown>)[f] = m[f];
    if (rec.customPhoto) rec.customPhoto = coverRef(rec.customPhoto, covers);
    if (binned) rec.bin = true;
    const c = clean(rec);
    if (c) doc.songs[key] = c;
    if (s.isCut) doc.cuts[key] = { title: s.title, artist: s.artist };
  };
  for (const s of input.songs) add(s, false);
  for (const s of input.removed) add(s, true);

  for (const p of input.playlists) {
    const songs: Key[] = [];
    for (const id of p.songIds) { const k = toKey(id, fpOf); if (k && !songs.includes(k)) songs.push(k); }
    doc.playlists[p.id] = {
      name: p.name, createdAt: p.createdAt, songs,
      ...(p.coverPhoto ? { cover: coverRef(p.coverPhoto, covers) } : {}),
    };
  }
  doc.settings = { ...input.settings };
  return { doc, speaks, covers };
}

// ── Merging ───────────────────────────────────────────────────────────────────

export function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined || a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((x, i) => same(x, bb[i]));
  }
  const ka = Object.keys(a as object).filter(k => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b as object).filter(k => (b as Record<string, unknown>)[k] !== undefined);
  return ka.length === kb.length && ka.every(k => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** Changed on one side: that side. Changed on both: the newer change. */
function pick3<T>(b: T | undefined, l: T | undefined, r: T | undefined, localNewer: boolean): T | undefined {
  if (same(l, b)) return r;
  if (same(r, b)) return l;
  return localNewer ? l : r;
}

function mergeSong(b: SongRec | undefined, l: SongRec | undefined, r: SongRec | undefined, localNewer: boolean): SongRec | undefined {
  const bb = b ?? {}, ll = l ?? {}, rr = r ?? {};
  const out: SongRec = {};
  for (const f of META_FIELDS) {
    if (f === "playCount") {
      const base = bb.playCount ?? 0;
      const n = base + ((ll.playCount ?? 0) - base) + ((rr.playCount ?? 0) - base);
      if (n > 0) out.playCount = n;
    } else if (f === "lastPlayedAt") {
      const t = Math.max(ll.lastPlayedAt ?? 0, rr.lastPlayedAt ?? 0);
      if (t > 0) out.lastPlayedAt = t;
    } else {
      const v = pick3(bb[f], ll[f], rr[f], localNewer);
      if (v !== undefined) (out as Record<string, unknown>)[f] = v;
    }
  }
  if (pick3(bb.bin, ll.bin, rr.bin, localNewer)) {
    out.bin = true;
    // Deleted for good on some phone. Taking it out of the bin anywhere
    // brings it back, so "gone" only holds while it is in the bin.
    if (pick3(bb.gone, ll.gone, rr.gone, localNewer)) out.gone = true;
  }
  return clean(out);
}

/** The first time a phone joins an account there is no base. The account's
 *  side wins where both have something, likes are joined, counts kept. A song
 *  this phone has stays in its list or in its bin the way it is here: joining
 *  should not make a song someone is playing disappear. */
function joinSong(l: SongRec | undefined, r: SongRec | undefined, keepLocalBin: boolean): SongRec | undefined {
  const out: SongRec = {
    ...(l ?? {}), ...(r ?? {}),
    liked: l?.liked || r?.liked,
    playCount: Math.max(l?.playCount ?? 0, r?.playCount ?? 0),
    lastPlayedAt: Math.max(l?.lastPlayedAt ?? 0, r?.lastPlayedAt ?? 0),
  };
  if (keepLocalBin) { out.bin = l?.bin; out.gone = l?.bin ? l.gone : undefined; }
  return clean(out);
}

/** A list both sides changed: this phone's order, with what the other side
 *  added appended and what it took out left out. */
function mergeList(b: Key[], l: Key[], r: Key[]): Key[] {
  const inB = new Set(b), inR = new Set(r);
  const out = l.filter(k => !(inB.has(k) && !inR.has(k)));
  const have = new Set(out);
  for (const k of r) if (!inB.has(k) && !have.has(k)) { out.push(k); have.add(k); }
  return out;
}

function mergePlaylist(b: PlaylistRec | undefined, l: PlaylistRec | undefined, r: PlaylistRec | undefined, localNewer: boolean): PlaylistRec | undefined {
  if (same(l, b)) return r;
  if (same(r, b)) return l;
  // Changed on both sides. One side deleting it loses to the other editing it.
  if (!l) return r;
  if (!r) return l;
  const bb = b ?? { name: "", createdAt: 0, songs: [] };
  const out: PlaylistRec = {
    name: pick3(bb.name, l.name, r.name, localNewer) ?? l.name,
    createdAt: pick3(bb.createdAt, l.createdAt, r.createdAt, localNewer) ?? l.createdAt,
    songs: mergeList(bb.songs, l.songs, r.songs),
  };
  const cover = pick3(bb.cover, l.cover, r.cover, localNewer);
  if (cover) out.cover = cover;
  return out;
}

const keysOf = (...objs: (object | undefined)[]) => {
  const s = new Set<string>();
  for (const o of objs) if (o) for (const k of Object.keys(o)) s.add(k);
  return s;
};

const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** What a phone chose when it first joined an account that already had things
 *  in it. */
export type JoinChoice = {
  /** Whose look and settings: the account's, or this phone's. */
  settings: "account" | "phone";
  /** merge: this phone's playlists, likes and the rest join the account's.
   *  account: this phone takes the account's and drops its own. */
  library: "merge" | "account";
};

export const DEFAULT_JOIN: JoinChoice = { settings: "account", library: "merge" };

export type MergeOptions = {
  /** Keys that arrived on this phone since the base: it has no say about them
   *  yet, only a file. */
  fresh?: Set<Key>;
  /** When this phone's changes were made. A change made on both sides goes to
   *  whichever was made later, so a phone that was off for a week does not
   *  win with what it changed before everyone else did. */
  stamp?: number;
  /** Only when base is null. */
  join?: JoinChoice;
};

/**
 * @param base    What this phone and the account last agreed on, or null the
 *                first time this phone joins the account.
 * @param local   This phone now.
 * @param remote  The account now, or null when it has nothing yet.
 */
export function merge(base: LibDoc | null, local: LocalDoc, remote: LibDoc | null, opts: MergeOptions = {}): LibDoc {
  const fresh = opts.fresh ?? new Set<Key>();
  const stamp = opts.stamp ?? Date.now();
  const join = opts.join ?? DEFAULT_JOIN;
  const replace = !base && join.library === "account" && !!remote;
  const L = replace ? { ...emptyDoc(), settings: local.doc.settings } : local.doc;
  const out = emptyDoc();
  const at: Record<string, number> = {};
  const says = (k: Key) => local.speaks.has(k) && !fresh.has(k);
  // A key this phone has no say about: whatever the account holds.
  const theirs = <T,>(pick: (d: LibDoc) => Record<string, T>, k: string): T | undefined =>
    remote ? pick(remote)[k] : base ? pick(base)[k] : undefined;
  const newer = (id: string) => stamp >= (remote?.at?.[id] ?? 0);
  /** Stamps what this phone decided: its own time where it wrote something
   *  new, the account's where it kept the account's. */
  const stampIt = (id: string, v: unknown, r: unknown) => {
    const t = !same(v, r) ? stamp : remote?.at?.[id];
    if (t && v !== undefined) at[id] = t;
  };

  for (const k of keysOf(base?.songs, L.songs, remote?.songs)) {
    const r = remote?.songs[k];
    const v = !says(k) ? theirs(d => d.songs, k)
      : !base ? joinSong(L.songs[k], r, !replace)
      : mergeSong(base.songs[k], L.songs[k], r, newer("s:" + k));
    if (v) { out.songs[k] = v; stampIt("s:" + k, v, r); }
  }

  for (const k of keysOf(base?.cuts, L.cuts, remote?.cuts)) {
    const v = !says(k) ? theirs(d => d.cuts, k)
      : !base ? (remote?.cuts[k] ?? L.cuts[k])
      : pick3(base.cuts[k], L.cuts[k], remote?.cuts[k], newer("c:" + k));
    if (v) { out.cuts[k] = v; stampIt("c:" + k, v, remote?.cuts[k]); }
  }

  for (const id of keysOf(base?.playlists, L.playlists, remote?.playlists)) {
    const l = L.playlists[id], r = remote?.playlists[id];
    const v = !base
      ? (l && r ? { ...l, ...r, songs: mergeList([], r.songs, l.songs) } : (r ?? l))
      : mergePlaylist(base.playlists[id], l, r, newer("p:" + id));
    if (v) { out.playlists[id] = v; stampIt("p:" + id, v, r); }
  }
  // Joining: a playlist here with the same name as one in the account becomes
  // one playlist, not two called "Favourites".
  if (!base && remote) {
    for (const [id, p] of Object.entries(out.playlists)) {
      if (remote.playlists[id]) continue;
      const twin = Object.entries(out.playlists).find(([oid, o]) => oid !== id && remote.playlists[oid] && normName(o.name) === normName(p.name));
      if (!twin) continue;
      const [tid, t] = twin;
      out.playlists[tid] = { ...t, songs: mergeList([], t.songs, p.songs) };
      at["p:" + tid] = stamp;
      delete out.playlists[id];
      delete at["p:" + id];
    }
  }

  for (const k of keysOf(base?.settings, L.settings, remote?.settings)) {
    const l = L.settings[k], r = remote?.settings[k];
    const v = !base
      ? (join.settings === "phone" ? (l ?? r) : (r ?? l))
      : pick3(base.settings[k], l, r, newer("set:" + k));
    if (v !== undefined) { out.settings[k] = v; stampIt("set:" + k, v, r); }
  }
  out.at = at;
  return out;
}

// ── The account, back onto this phone ─────────────────────────────────────────

export type ApplyInput = LocalInput & {
  pathOf: (fp: string) => string | undefined;
  /** The picture for a cover hash, if this phone has it. */
  coverOf: (hash: string) => string | undefined;
};

export type Applied = {
  songs: Song[];
  removed: Song[];
  meta: Record<string, SongMeta>;
  playlists: Playlist[];
  /** Settings the account has and this phone does not, or null. */
  settings: Record<string, string> | null;
  changed: { songs: boolean; removed: boolean; meta: boolean; playlists: boolean };
};

function recToMeta(rec: SongRec | undefined, current: SongMeta | undefined, coverOf: ApplyInput["coverOf"]): SongMeta | undefined {
  if (!rec) return undefined;
  const m: SongMeta = {};
  for (const f of META_FIELDS) if (rec[f] !== undefined) (m as Record<string, unknown>)[f] = rec[f];
  const h = coverHash(rec.customPhoto);
  if (h) {
    const pic = coverOf(h);
    // A cover whose picture has not come down yet: keep what is here.
    if (pic) m.customPhoto = pic; else if (current?.customPhoto) m.customPhoto = current.customPhoto; else delete m.customPhoto;
  }
  return clean(m);
}

export function apply(doc: LibDoc, input: ApplyInput): Applied {
  const { fpOf, pathOf, coverOf } = input;
  const keyOf = (id: string) => toKey(id, fpOf);

  // ── Meta ──
  const meta: Record<string, SongMeta> = { ...input.meta };
  let metaChanged = false;
  const local = [...input.songs, ...input.removed];

  // ── Bin, and cut tracks ──
  const songs: Song[] = [];
  const removed: Song[] = [];
  const seen = new Set<string>();
  for (const s of local) {
    seen.add(s.id);
    const k = keyOf(s.id);
    if (!k) { (input.removed.includes(s) ? removed : songs).push(s); continue; }
    if (s.isCut && !doc.cuts[k]) continue; // deleted on another phone
    (doc.songs[k]?.bin ? removed : songs).push(s);
  }
  for (const [k, rec] of Object.entries(doc.cuts)) {
    const id = toLocalId(k, pathOf);
    const range = cutRange(k);
    if (!id || seen.has(id) || !range) continue;
    const cut: Song = {
      id, title: rec.title, artist: rec.artist, uri: pathOf(fileOf(k))!,
      dateAdded: Date.now(), isCut: true, cutFrom: range.from, cutTo: range.to,
    };
    (doc.songs[k]?.bin ? removed : songs).push(cut);
    seen.add(id);
  }
  for (const s of [...songs, ...removed]) {
    const k = keyOf(s.id);
    if (!k) continue;
    const next = recToMeta(doc.songs[k], meta[s.id], coverOf);
    if (!same(next, meta[s.id])) {
      metaChanged = true;
      if (next) meta[s.id] = next; else delete meta[s.id];
    }
  }

  const ids = (list: Song[]) => list.map(s => s.id).join("\n");
  // Newly in the bin: first in it, the way doRemove puts it there.
  const removedOrdered = [
    ...removed.filter(s => !input.removed.some(x => x.id === s.id)),
    ...removed.filter(s => input.removed.some(x => x.id === s.id)),
  ];

  // ── Playlists ──
  const order = new Map(input.playlists.map((p, i) => [p.id, i]));
  const playlists: Playlist[] = Object.entries(doc.playlists)
    .map(([id, p]) => {
      const current = input.playlists.find(x => x.id === id);
      const h = coverHash(p.cover);
      const coverPhoto = h ? (coverOf(h) ?? current?.coverPhoto) : undefined;
      const pl: Playlist = {
        id, name: p.name, createdAt: p.createdAt,
        songIds: p.songs.map(k => toLocalId(k, pathOf) ?? PENDING + k),
      };
      if (coverPhoto) pl.coverPhoto = coverPhoto;
      return pl;
    })
    .sort((a, b) => (order.get(a.id) ?? 1e9 + a.createdAt) - (order.get(b.id) ?? 1e9 + b.createdAt));
  const playlistsChanged = !same(
    playlists.map(p => ({ ...p })),
    input.playlists.map(p => { const c: Playlist = { ...p }; if (!c.coverPhoto) delete c.coverPhoto; return c; }),
  );

  // ── Settings ──
  let settings: Record<string, string> | null = null;
  for (const [k, v] of Object.entries(doc.settings)) {
    if (input.settings[k] !== v) (settings ??= {})[k] = v;
  }

  return {
    songs, removed: removedOrdered, meta, playlists, settings,
    changed: {
      songs: ids(songs) !== ids(input.songs),
      removed: ids(removedOrdered) !== ids(input.removed),
      meta: metaChanged,
      playlists: playlistsChanged,
    },
  };
}

// ── Songs to move ─────────────────────────────────────────────────────────────

/** fp -> [size, file name, title and artist, length in ms]: the song files one
 *  phone shares. The last two tell two versions of one song apart from two
 *  songs. */
export type Inventory = Record<string, [number, string, string?, number?]>;

/** Title and artist, the way two copies of one song would both have them. */
export function songSig(title: string, artist: string): string | undefined {
  const n = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const t = n(title || "");
  if (!t || t === "unknown title") return undefined;
  return `${t}|${n(artist || "")}`;
}

/** Title and artist to lengths, for the songs a phone has. */
export function sigsOf(inv: Inventory): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const [, , sig, ms] of Object.values(inv)) {
    if (!sig || !ms) continue;
    const list = out.get(sig) ?? [];
    list.push(ms);
    out.set(sig, list);
  }
  return out;
}

/** Another version of a song this phone already has: same title and artist,
 *  and no more than two seconds longer or shorter. */
function isCopy(entry: Inventory[string], sigs: Map<string, number[]>): boolean {
  const [, , sig, ms] = entry;
  if (!sig || !ms) return false;
  return (sigs.get(sig) ?? []).some(d => Math.abs(d - ms) <= 2000);
}

export type MissingOptions = {
  /** Songs this phone deleted and does not want back. */
  skip?: Set<string>;
  /** What this phone has, by title and artist (sigsOf). */
  sigs?: Map<string, number[]>;
};

/** What `mine` is missing that other phones have: not what is in the bin or
 *  deleted for good, not what this phone threw away itself, and not another
 *  version of a song it already has. */
export function missingFrom(mine: Inventory, others: Inventory[], doc: LibDoc, opts: MissingOptions = {}): Inventory {
  const out: Inventory = {};
  const sigs = opts.sigs ?? sigsOf(mine);
  for (const inv of others) {
    for (const [fp, v] of Object.entries(inv)) {
      if (mine[fp] || out[fp] || doc.songs[fp]?.bin || opts.skip?.has(fp)) continue;
      if (isCopy(v, sigs)) continue;
      out[fp] = v;
    }
  }
  return out;
}
