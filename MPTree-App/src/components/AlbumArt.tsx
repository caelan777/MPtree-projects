import type { T } from "../themes";

// ─── ALBUM ART ───────────────────────────────────────────────────────────────
// A song with no photo of its own gets a grey tile with a music note. It used
// to be the song's initials on a coloured square, generated from a hue hash,
// which broke the black-and-white brand (see Branding/README.md) and turned the
// list into a patchwork.
//
// One note for every song, deliberately. An earlier pass varied the glyph by a
// hash of the title, which looked lively but was meaningless: the icon appeared
// to say something about the track and did not. A single mark reads as "no
// artwork yet" and lets the titles carry the list.

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
  // 0.58 of the tile. The note sat at half the tile and read as small and
  // tentative against the 48px rows.
  const glyph = Math.round(size * 0.58);

  return (
    <div style={{
      position: "relative", width: size, height: size, borderRadius: radius, flexShrink: 0,
      overflow: "hidden",
      border: active ? `2px solid ${T.accent}` : "2px solid transparent",
      boxShadow: active ? `0 0 0 1px ${T.accent}33` : "none",
      background: customPhoto ? "transparent" : T.dim,
      display: "flex", alignItems: "center", justifyContent: "center",
      transition: "border-color 0.2s", userSelect: "none", color: T.muted,
    }}>
      {customPhoto
        ? <img src={customPhoto} alt={title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : (
          <svg width={glyph} height={glyph} viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
          </svg>
        )}

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
