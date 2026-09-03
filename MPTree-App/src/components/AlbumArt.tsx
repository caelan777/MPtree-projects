import type { T } from "../themes";

// ─── ALBUM ART ───────────────────────────────────────────────────────────────
// A song with no photo of its own gets a grey tile with a music icon. It used
// to be the song's initials on a coloured square, generated from a hue hash —
// which broke the black-and-white brand (see Branding/README.md) and turned the
// list into a patchwork. The tile is now theme grey, and the ICON is what
// varies: eight of them, picked by a hash of the title, so tracks still look
// distinguishable at a glance without anything being coloured.

type AlbumArtProps = {
  title: string;
  size: number;
  /** The song this art belongs to is the one loaded in the player. */
  active?: boolean;
  /** Show the animated bars overlay. Only pass this where "which song is
   *  playing" is the question being answered, i.e. list rows. */
  playing?: boolean;
  customPhoto?: string;
  T: T;
};

// Stable, order-independent hash of the title. Multiplying by 31 (rather than
// summing char codes, as the old hue did) keeps anagrams and one-letter-apart
// titles from landing on the same icon.
function iconIndex(title: string, count: number): number {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) | 0;
  return Math.abs(h) % count;
}

// Eight monochrome glyphs, all drawn on a 24×24 grid and painted with
// currentColor so the caller's colour wins.
const GLYPHS: ((s: number) => React.ReactNode)[] = [
  // Single eighth note
  s => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l10-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="16" cy="16" r="3" />
    </svg>
  ),
  // Beamed pair
  s => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 17V4l11 2v11" /><circle cx="5.5" cy="17" r="2.5" /><circle cx="16.5" cy="17" r="2.5" />
    </svg>
  ),
  // Vinyl record
  s => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  ),
  // Headphones
  s => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
      <path d="M4 15h2a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
      <path d="M20 15h-2a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1z" />
    </svg>
  ),
  // Level meter
  s => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
      <line x1="5" y1="15" x2="5" y2="19" /><line x1="9.7" y1="9" x2="9.7" y2="19" />
      <line x1="14.3" y1="5" x2="14.3" y2="19" /><line x1="19" y1="12" x2="19" y2="19" />
    </svg>
  ),
  // Microphone
  s => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="10" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="21" />
    </svg>
  ),
  // Cassette
  s => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" /><circle cx="8.5" cy="12" r="2" /><circle cx="15.5" cy="12" r="2" />
      <line x1="8.5" y1="16.5" x2="15.5" y2="16.5" />
    </svg>
  ),
  // Radio waves
  s => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <circle cx="12" cy="12" r="2.2" /><path d="M8.2 8.2a5.4 5.4 0 0 0 0 7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6" />
      <path d="M5.2 5.2a9.6 9.6 0 0 0 0 13.6M18.8 5.2a9.6 9.6 0 0 1 0 13.6" />
    </svg>
  ),
];

/** Four bars that rise and fall while a track plays. */
function PlayingBars({ size, color }: { size: number; color: string }) {
  const barW = Math.max(2, Math.round(size * 0.075));
  const gap = Math.max(2, Math.round(size * 0.06));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap, height: size * 0.42 }} aria-hidden="true">
      {[0, 1, 2, 3].map(i => (
        <span
          key={i}
          className="mp-eqbar"
          style={{ width: barW, background: color, borderRadius: 1, animationDelay: `${i * 0.16}s` }}
        />
      ))}
    </div>
  );
}

export function AlbumArt({ title, size, active = false, playing = false, customPhoto, T }: AlbumArtProps) {
  const radius = size * 0.22;
  const border = active ? `2px solid ${T.accent}` : `2px solid transparent`;
  const glow = active ? `0 0 0 1px ${T.accent}33` : "none";

  return (
    <div style={{
      position: "relative", width: size, height: size, borderRadius: radius, flexShrink: 0,
      overflow: "hidden", border, boxShadow: glow, background: customPhoto ? "transparent" : T.dim,
      display: "flex", alignItems: "center", justifyContent: "center",
      transition: "border-color 0.2s", userSelect: "none", color: T.muted,
    }}>
      {customPhoto
        ? <img src={customPhoto} alt={title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : GLYPHS[iconIndex(title, GLYPHS.length)](Math.round(size * 0.5))}

      {playing && (
        <div style={{
          position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <PlayingBars size={size} color="#ffffff" />
        </div>
      )}
    </div>
  );
}
