import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { pageGround, type T } from "../themes";
import { t, tn, fmtBytes, getLang } from "../i18n";
import type { Playlist, Song, SongMeta } from "../types";
import type { BackupData } from "../storage";
import { AlbumArt } from "./AlbumArt";
import { SpinningDisc } from "./SpinningDisc";
import { bytesOf, nothingPicked, songIdsFor, fileOf, backOf, pickText, CLOUD_NAME, type BackupPick, type BackupStep } from "../backupPick";
import type { CloudApp } from "../plugins";

// ─── BACKUP ──────────────────────────────────────────────────────────────────
// Backup is pages of its own, the whole screen (Caelan picked design 2A on
// 20 Nov 2026, tmp-edit/design3/out/backup-1.png):
//
//   Backup ── Make a backup ── What goes in it ── Where to save it ── busy ── sent
//          └─ Restore a backup ── Where is it ── What to restore ── busy ── restored
//
// "What goes in it" is a grid of tiles, two across: All songs first, then
// each playlist. A tile picked gets the violet ring, as anything picked does in
// MPTree. Likes, covers, names and settings always go along; the bin does not.
// A backup goes to the person's own Google Drive, OneDrive or Dropbox through
// that app; there is no "On this phone" (Caelan). This page only draws and
// says what was tapped; App does the work.

// How deep a step is, so a step further on slides in from the right and a
// step back from the left.
const CLOUDS: CloudApp[] = ["drive", "onedrive", "dropbox"];

const DEPTH: Record<BackupStep["kind"], number> = { home: 0, pick: 1, from: 1, where: 2, restorePick: 2, busy: 3, error: 3, made: 4, restored: 4 };

type Props = {
  step: BackupStep;
  onStep: (s: BackupStep) => void;
  onClose: () => void;
  songs: Song[];
  playlists: Playlist[];
  meta: Record<string, SongMeta>;
  /** Which cloud apps are on the phone; null until known. */
  clouds: Record<CloudApp, boolean> | null;
  last: { at: number; app: CloudApp } | null;
  onSave: (pick: BackupPick, app: CloudApp) => void;
  onGetApp: (app: CloudApp) => void;
  onStop: () => void;
  onFrom: (from: CloudApp | "phone") => void;
  onRestore: (pick: BackupPick) => void;
  T: T;
};

const dateText = (at: number) => new Date(at).toLocaleDateString(getLang(), { day: "numeric", month: "short" });

// ── icons ─────────────────────────────────────────────────────────────────
const S = (d: ReactNode, size = 20, w = 2) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const I = {
  back:  (s = 24) => S(<path d="m15 6-6 6 6 6" />, s, 2.2),
  right: (s = 18) => S(<path d="m9 6 6 6-6 6" />, s),
  up:    (s = 22) => S(<><path d="M12 15V4" /><path d="m7 9 5-5 5 5" /><path d="M5 20h14" /></>, s),
  down:  (s = 22) => S(<><path d="M12 4v11" /><path d="m7 10 5 5 5-5" /><path d="M5 20h14" /></>, s),
  check: (s = 14) => S(<path d="m5 12.5 4.5 4.5L19 7.5" />, s, 2.8),
  folder:(s = 20) => S(<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />, s),
  note:  (s = 28) => S(<><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></>, s, 1.8),
  // Plain marks for the three clouds, in the app's own black and white.
  drive:    (s = 20) => S(<><path d="m8.5 4 7 0 6 10.5-3.5 6h-12L2.5 14.5Z" /><path d="m8.5 4 6.5 11" /><path d="M2.5 14.5h13" /></>, s, 1.7),
  onedrive: (s = 21) => S(<path d="M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 9.5a4 4 0 0 1-.5 8.5Z" />, s),
  dropbox:  (s = 20) => S(<><path d="m7 3.5 5 3.2-5 3.3-5-3.3Z" /><path d="m17 3.5 5 3.2-5 3.3-5-3.3Z" /><path d="m7 10 5 3.3-5 3.2-5-3.2Z" /><path d="m17 10 5 3.3-5 3.2-5-3.2Z" /><path d="m7.5 18 4.5 3 4.5-3" /></>, s, 1.6),
};

export function BackupPage(p: Props) {
  const { step, T } = p;
  // Which way the new step slides in: further on from the right, back from
  // the left. Worked out when the step changes, during that render.
  const [shown, setShown] = useState({ kind: step.kind, dir: 1 });
  if (shown.kind !== step.kind) setShown({ kind: step.kind, dir: DEPTH[step.kind] >= DEPTH[shown.kind] ? 1 : -1 });
  const dir = shown.kind === step.kind ? shown.dir : DEPTH[step.kind] >= DEPTH[shown.kind] ? 1 : -1;

  const back = backOf(step);
  const column = { width: "100%", maxWidth: 560, margin: "0 auto", boxSizing: "border-box" } as const;
  const css = `
    @keyframes mpBkIn { from { opacity: 0; transform: translateX(var(--mpbk-from)); } to { opacity: 1; transform: none; } }
    @keyframes mpBkPop { 0% { transform: scale(.4); } 60% { transform: scale(1.18); } 100% { transform: scale(1); } }
    @keyframes mpBkBounce { 0% { transform: scale(1); } 40% { transform: scale(.94); } 100% { transform: scale(1); } }
    @keyframes mpBkSlide { from { transform: translateX(-100%); } to { transform: translateX(260%); } }
    @keyframes mpBkTick { 0% { transform: scale(.6); opacity: 0; } 70% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); } }
    .mp-bk-row { transition: background-color .15s ease; }
    .mp-bk-row:active { background-color: ${T.card}; }
    .mp-bk-rows > .mp-bk-row:first-child { border-top-color: transparent !important; }
    .mp-bk-tile:active .mp-bk-art { transform: scale(.97); }
    .mp-bk-art { transition: transform .15s ease, box-shadow .15s ease; }
    @media (prefers-reduced-motion: reduce) { .mp-bk-page, .mp-bk-dot, .mp-bk-art, .mp-bk-tick { animation: none !important; } }
  `;

  return (
    <div style={{ position: "fixed", inset: 0, background: pageGround(T), zIndex: 450, display: "flex", flexDirection: "column", color: T.text }}>
      <style>{css}</style>
      <div style={{ ...column, padding: "calc(env(safe-area-inset-top, 0px) + 10px) 10px 0", flexShrink: 0, minHeight: 50 }}>
        {back !== "stay" && (
          <button onClick={() => (back === null ? p.onClose() : p.onStep(back))} aria-label={t("Back")}
            style={{ width: 44, height: 44, borderRadius: 22, display: "grid", placeItems: "center", background: "transparent", border: "none", color: T.text, cursor: "pointer", padding: 0 }}>
            {I.back()}
          </button>
        )}
      </div>
      <div key={step.kind} className="mp-bk-page"
        style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", animation: "mpBkIn .26s cubic-bezier(.2,.8,.2,1) both", ["--mpbk-from" as string]: `${dir * 28}px` }}>
        <Body {...p} column={column} />
      </div>
    </div>
  );
}

function Title({ title, sub, T }: { title: string; sub?: string; T: T }) {
  return (
    <div style={{ padding: "4px 20px 0" }}>
      <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.15 }}>{title}</div>
      {sub && <div style={{ fontSize: 14, color: T.textSub, marginTop: 6, lineHeight: 1.45 }}>{sub}</div>}
    </div>
  );
}

function Row({ icon, title, sub, onClick, strong, T }: { icon: ReactNode; title: string; sub: string; onClick: () => void; strong?: boolean; T: T }) {
  return (
    <button className="mp-bk-row" onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", padding: "16px 4px", background: "transparent", border: "none", borderTop: `1px solid ${T.border}`, color: T.text, textAlign: "left", cursor: "pointer", fontFamily: "inherit", borderRadius: 0 }}>
      <span style={{ width: 44, height: 44, borderRadius: 14, display: "grid", placeItems: "center", flexShrink: 0, background: strong ? T.accent : "transparent", color: strong ? T.playBtnFg : T.text, border: strong ? "none" : `1px solid ${T.border}` }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 16, fontWeight: 700 }}>{title}</span>
        <span style={{ display: "block", fontSize: 13, color: T.textSub, marginTop: 3, lineHeight: 1.4 }}>{sub}</span>
      </span>
      <span style={{ color: T.muted, display: "flex" }}>{I.right()}</span>
    </button>
  );
}

const Note = ({ children, T }: { children: ReactNode; T: T }) => (
  <div style={{ margin: "auto 20px 0", padding: "12px 0 calc(env(safe-area-inset-bottom, 0px) + 22px)", fontSize: 13, lineHeight: 1.5, color: T.textSub, borderTop: `1px solid ${T.border}` }}>{children}</div>
);

const btn = (T: T, primary = true, off = false) => ({
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, height: 48, padding: "0 24px", borderRadius: 24,
  fontSize: 15, fontWeight: 700, fontFamily: "inherit", cursor: off ? "default" : "pointer",
  background: primary ? T.accent : "transparent", color: primary ? T.playBtnFg : T.text,
  border: primary ? "none" : `1px solid ${T.border}`, opacity: off ? 0.35 : 1, transition: "opacity .2s ease",
}) as const;

function Body(p: Props & { column: Record<string, unknown> }) {
  const { step, T } = p;
  const scroll = { flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", display: "flex", flexDirection: "column" } as const;

  if (step.kind === "home") return (
    <div style={{ ...scroll, ...p.column }}>
      <Title T={T} title={t("Backup")} sub={p.last ? t("Last backup: {date}, in {place}", { date: dateText(p.last.at), place: CLOUD_NAME[p.last.app] }) : undefined} />
      <div className="mp-bk-rows" style={{ padding: "22px 20px 0" }}>
        <Row T={T} strong icon={I.up()} title={t("Make a backup")} sub={t("Your songs and playlists, saved in your own cloud")} onClick={() => p.onStep({ kind: "pick" })} />
        <Row T={T} icon={I.down()} title={t("Restore a backup")} sub={t("Bring them back, here or on a new phone")} onClick={() => p.onStep({ kind: "from" })} />
      </div>
      <Note T={T}>{t("Likes, covers, names and settings always go along.")}</Note>
    </div>
  );

  if (step.kind === "pick") return <PickPage {...p} initial={step.initial} />;

  if (step.kind === "where") {
    const ids = songIdsFor(step.pick, p.songs.map(s => s.id), p.playlists);
    const songs = p.songs.filter(s => ids.has(s.id));
    return (
      <div style={{ ...scroll, ...p.column }}>
        <Title T={T} title={t("Where to save it")} sub={`${pickText(step.pick, p.playlists.length)}, ${t("about {size}", { size: fmtBytes(bytesOf(songs.map(s => s.duration))) })}`} />
        <div className="mp-bk-rows" style={{ padding: "14px 20px 0" }}>
          {CLOUDS.map(app => {
            const here = p.clouds?.[app] !== false;
            return <Row key={app} T={T} icon={I[app]()} title={CLOUD_NAME[app]}
              sub={here ? t(app === "drive" ? "In your own Drive" : app === "onedrive" ? "In your own OneDrive" : "In your own Dropbox") : t("Not on this phone. Tap to get it.")}
              onClick={() => (here ? p.onSave(step.pick, app) : p.onGetApp(app))} />;
          })}
        </div>
        <Note T={T}>{t("Your cloud app opens, and there you choose where to save the backup.")}</Note>
      </div>
    );
  }

  if (step.kind === "busy") {
    const pct = step.total > 0 ? Math.min(100, (step.done / step.total) * 100) : 0;
    const counted = step.unit !== "none" && step.total > 0;
    return (
      <div style={{ ...scroll, ...p.column }}>
        <Title T={T} title={step.title} />
        <div style={{ padding: "30px 20px 0" }}>
          {counted && step.unit === "songs" && (
            <div style={{ fontSize: 56, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1 }}>
              {step.done}<span style={{ fontSize: 22, fontWeight: 700, letterSpacing: 0, color: T.textSub }}> {t("of {n}", { n: step.total })}</span>
            </div>
          )}
          {counted && step.unit === "bytes" && (
            <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1 }}>
              {fmtBytes(step.done)}<span style={{ fontSize: 20, fontWeight: 700, letterSpacing: 0, color: T.textSub }}> {t("of {n}", { n: fmtBytes(step.total) })}</span>
            </div>
          )}
          <div style={{ position: "relative", height: 6, borderRadius: 3, background: T.dim, overflow: "hidden", marginTop: 16 }}>
            {counted
              ? <i style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, background: T.accent, borderRadius: 3, transition: "width .3s ease" }} />
              : <i style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "38%", background: T.accent, borderRadius: 3, animation: "mpBkSlide 1.2s ease-in-out infinite" }} />}
          </div>
          <div style={{ fontSize: 14, color: T.textSub, marginTop: 14, lineHeight: 1.5 }}>{step.line}</div>
        </div>
        {step.stop && (
          <div style={{ margin: "auto 20px 0", padding: "12px 0 calc(env(safe-area-inset-bottom, 0px) + 22px)" }}>
            <button onClick={p.onStop} style={btn(T, false)}>{t("Stop")}</button>
          </div>
        )}
      </div>
    );
  }

  if (step.kind === "made" || step.kind === "restored") {
    const made = step.kind === "made";
    return (
      <div style={{ ...scroll, ...p.column }}>
        <div style={{ padding: "26px 20px 0" }}>
          <div className="mp-bk-tick" style={{ width: 64, height: 64, borderRadius: 32, background: T.accent, color: T.playBtnFg, display: "grid", placeItems: "center", animation: "mpBkTick .45s cubic-bezier(.2,.8,.2,1) both" }}>{I.check(30)}</div>
          <div style={{ fontSize: 24, fontWeight: 800, marginTop: 20, lineHeight: 1.25, letterSpacing: "-0.01em" }}>
            {made ? t("Sent to {app}", { app: CLOUD_NAME[step.app] }) : t("Restored")}
          </div>
          <div style={{ fontSize: 15, color: T.textSub, marginTop: 8, lineHeight: 1.5 }}>
            {made ? step.what : `${tn(step.songs, "{n} song", "{n} songs")}, ${tn(step.playlists, "{n} playlist", "{n} playlists")}`}
          </div>
          {made && <div style={{ fontSize: 15, color: T.textSub, marginTop: 14, lineHeight: 1.5 }}>
            {t("Save it there. On a new phone: install MPTree, then Backup, Restore a backup, {app}.", { app: CLOUD_NAME[step.app] })}
          </div>}
        </div>
        <div style={{ margin: "auto 20px 0", padding: "12px 0 calc(env(safe-area-inset-bottom, 0px) + 22px)", display: "flex" }}>
          <button onClick={p.onClose} style={{ ...btn(T), flex: 1 }}>{t("Done")}</button>
        </div>
      </div>
    );
  }

  if (step.kind === "from") return (
    <div style={{ ...scroll, ...p.column }}>
      <Title T={T} title={t("Restore a backup")} sub={t("Where is your backup?")} />
      <div className="mp-bk-rows" style={{ padding: "14px 20px 0" }}>
        {CLOUDS.map(app => {
          const here = p.clouds?.[app] !== false;
          return <Row key={app} T={T} icon={I[app]()} title={CLOUD_NAME[app]}
            sub={here ? t(app === "drive" ? "Choose the backup in your Drive" : app === "onedrive" ? "Choose the backup in your OneDrive" : "Choose the backup in your Dropbox") : t("Not on this phone. Tap to get it.")}
            onClick={() => (here ? p.onFrom(app) : p.onGetApp(app))} />;
        })}
        <Row T={T} icon={I.folder()} title={t("This phone")} sub={t("Choose the file, from Downloads or elsewhere")} onClick={() => p.onFrom("phone")} />
      </div>
    </div>
  );

  if (step.kind === "restorePick") return <RestorePickPage {...p} data={step.data} />;

  return (
    <div style={{ ...scroll, ...p.column }}>
      <Title T={T} title={t("Something went wrong")} sub={step.message} />
      <div style={{ margin: "auto 20px 0", padding: "12px 0 calc(env(safe-area-inset-bottom, 0px) + 22px)", display: "flex", gap: 10 }}>
        <button onClick={p.onClose} style={{ ...btn(T, false), flex: 1 }}>{t("Close")}</button>
        <button onClick={() => p.onStep({ kind: step.back })} style={{ ...btn(T), flex: 1.4 }}>{t("Try again")}</button>
      </div>
    </div>
  );
}

// ── the grid ────────────────────────────────────────────────────────────────

type TileData = { id: string; name: string; count: string; art: ReactNode };

function Grid({ tiles, picked, onToggle, T }: { tiles: TileData[]; picked: Set<string>; onToggle: (id: string) => void; T: T }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px 12px", padding: "16px 16px 120px" }}>
      {tiles.map(tile => {
        const on = picked.has(tile.id);
        return (
          <button key={tile.id} className="mp-bk-tile" onClick={() => onToggle(tile.id)} aria-pressed={on}
            style={{ position: "relative", background: "transparent", border: "none", padding: 0, textAlign: "left", color: T.text, cursor: "pointer", fontFamily: "inherit", minWidth: 0 }}>
            <div className="mp-bk-art" style={{ position: "relative", width: "100%", aspectRatio: "1", borderRadius: 16, overflow: "hidden", background: T.card, boxShadow: on ? `0 0 0 2.5px ${T.violet}` : "none", animation: on ? "mpBkBounce .28s ease" : undefined }}>
              {tile.art}
              <span className="mp-bk-dot" style={{
                position: "absolute", right: 8, top: 8, width: 26, height: 26, borderRadius: 13, display: "grid", placeItems: "center",
                ...(on ? { background: T.violet, color: "#fff", animation: "mpBkPop .3s ease both" } : { border: "2px solid rgba(255,255,255,0.9)", background: "rgba(0,0,0,0.22)", boxShadow: "0 0 0 1px rgba(0,0,0,0.22)", boxSizing: "border-box" }),
              }}>{on && I.check(14)}</span>
            </div>
            <span style={{ display: "block", fontSize: 14, fontWeight: 700, marginTop: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tile.name}</span>
            <span style={{ display: "block", fontSize: 12, color: T.textSub, marginTop: 2 }}>{tile.count}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Four covers of a list, in a square; one of its own when it has one. */
function Collage({ cover, items, T }: { cover?: string; items: { title: string; photo?: string; path?: string }[]; T: T }) {
  if (cover) return <img src={cover} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />;
  if (items.length === 0) return <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: T.muted }}>{I.note()}</div>;
  const four = items.slice(0, 4);
  // One song fills the tile; more make a square of four.
  if (four.length < 4) {
    const s = four[0];
    return <div style={{ position: "absolute", inset: 0 }}><FillArt title={s.title} photo={s.photo} path={s.path} T={T} /></div>;
  }
  return (
    <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr" }}>
      {four.map((s, i) => <div key={i} style={{ position: "relative", overflow: "hidden" }}><FillArt title={s.title} photo={s.photo} path={s.path} T={T} /></div>)}
    </div>
  );
}

/** A song's cover filling its box. */
function FillArt({ title, photo, path, T }: { title: string; photo?: string; path?: string; T: T }) {
  const box = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState(80);
  useEffect(() => { const w = box.current?.getBoundingClientRect().width; if (w) setSize(Math.round(w)); }, []);
  return (
    <div ref={box} style={{ position: "absolute", inset: 0 }}>
      <AlbumArt title={title} size={size} customPhoto={photo} songPath={path} radius={0} T={T} />
    </div>
  );
}

/** The record of All songs, a little bigger than its tile. */
function RecordArt() {
  const box = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState(0);
  useEffect(() => { const w = box.current?.getBoundingClientRect().width; if (w) setSize(Math.round(w)); }, []);
  return (
    <div ref={box} style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", overflow: "hidden" }}>
      {size > 0 && <div style={{ width: size * 1.12, height: size * 1.12, flexShrink: 0 }}><SpinningDisc size={Math.round(size * 1.12)} /></div>}
    </div>
  );
}

function Footer({ line1, line2, action, off, onAction, T }: { line1: string; line2: string; action: string; off: boolean; onAction: () => void; T: T }) {
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "28px 16px calc(env(safe-area-inset-bottom, 0px) + 16px)", background: `linear-gradient(transparent, ${T.bg} 34%)`, display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: 1.35 }}>
        <b style={{ display: "block", fontSize: 15 }}>{line1}</b>
        <span style={{ color: T.textSub }}>{line2}</span>
      </div>
      <button disabled={off} onClick={onAction} style={btn(T, true, off)}>{action}</button>
    </div>
  );
}

const ALL = "\u0000all";

function PickPage(p: Props & { column: Record<string, unknown>; initial?: BackupPick }) {
  const { T } = p;
  const [picked, setPicked] = useState<Set<string>>(() => {
    const s = new Set<string>(p.initial?.playlists ?? []);
    if (!p.initial || p.initial.all) s.add(ALL);
    return s;
  });
  const toggle = (id: string) => setPicked(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const byId = useMemo(() => new Map(p.songs.map(s => [s.id, s])), [p.songs]);
  const tiles: TileData[] = [
    { id: ALL, name: t("All songs"), count: tn(p.songs.length, "{n} song", "{n} songs"), art: <RecordArt /> },
    ...p.playlists.map(pl => ({
      id: pl.id, name: pl.name, count: tn(pl.songIds.length, "{n} song", "{n} songs"),
      art: <Collage T={T} cover={pl.coverPhoto} items={pl.songIds.map(id => byId.get(id)).filter((s): s is Song => !!s).map(s => ({ title: p.meta[s.id]?.customName ?? s.title, photo: p.meta[s.id]?.customPhoto, path: fileOf(s.uri) }))} />,
    })),
  ];
  const pick: BackupPick = { all: picked.has(ALL), playlists: p.playlists.filter(pl => picked.has(pl.id)).map(pl => pl.id) };
  const ids = songIdsFor(pick, p.songs.map(s => s.id), p.playlists);
  const bytes = bytesOf(p.songs.filter(s => ids.has(s.id)).map(s => s.duration));
  const none = nothingPicked(pick);
  return (
    <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        <div style={p.column}>
          <Title T={T} title={t("What goes in it")} sub={t("Tap what you want in the backup.")} />
          <Grid tiles={tiles} picked={picked} onToggle={toggle} T={T} />
        </div>
      </div>
      <div style={{ ...p.column, position: "absolute", left: 0, right: 0, bottom: 0 }}>
        <Footer T={T} off={none} action={t("Next")} onAction={() => p.onStep({ kind: "where", pick })}
          line1={none ? t("Pick what goes in it") : pickText(pick, p.playlists.length)}
          line2={none ? " " : t("about {size}", { size: fmtBytes(bytes) })} />
      </div>
    </div>
  );
}

function RestorePickPage(p: Props & { column: Record<string, unknown>; data: BackupData }) {
  const { T, data } = p;
  const files = data.musicFiles ?? [];
  const lists = data.playlists ?? [];
  const [picked, setPicked] = useState<Set<string>>(() => new Set([...(files.length ? [ALL] : []), ...lists.map(l => l.id)]));
  const toggle = (id: string) => setPicked(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const tiles: TileData[] = [
    ...(files.length ? [{ id: ALL, name: t("All songs"), count: tn(files.length, "{n} song", "{n} songs"), art: <RecordArt /> }] : []),
    ...lists.map(pl => ({
      id: pl.id, name: pl.name, count: tn(pl.songs.length, "{n} song", "{n} songs"),
      art: <Collage T={T} cover={pl.coverPhoto} items={pl.songs.map(s => ({ title: s.title, photo: data.meta?.[s.id]?.customPhoto ?? data.meta?.[s.path]?.customPhoto }))} />,
    })),
  ];
  const pick: BackupPick = { all: picked.has(ALL), playlists: lists.filter(l => picked.has(l.id)).map(l => l.id) };
  const none = nothingPicked(pick);
  const songCount = pick.all ? files.length : new Set(lists.filter(l => picked.has(l.id)).flatMap(l => l.songs.map(s => fileOf(s.path)))).size;
  const everything = pick.all && pick.playlists.length === lists.length;
  return (
    <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        <div style={p.column}>
          <Title T={T} title={t("What to restore")} sub={t("From your backup of {date}.", { date: dateText(data.exportedAt) })} />
          <Grid tiles={tiles} picked={picked} onToggle={toggle} T={T} />
        </div>
      </div>
      <div style={{ ...p.column, position: "absolute", left: 0, right: 0, bottom: 0 }}>
        <Footer T={T} off={none} action={t("Restore")} onAction={() => p.onRestore(pick)}
          line1={none ? t("Pick what to restore") : everything ? t("Everything") : pickText(pick, lists.length)}
          line2={none ? " " : tn(songCount, "{n} song", "{n} songs")} />
      </div>
    </div>
  );
}
