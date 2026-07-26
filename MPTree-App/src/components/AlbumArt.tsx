import type { T } from "../themes";

// ─── ALBUM ART ───────────────────────────────────────────────────────────────

type AlbumArtProps = {
  title: string;
  size: number;
  active?: boolean;
  customPhoto?: string;
  T: T;
};

export function AlbumArt({ title, size, active = false, customPhoto, T }: AlbumArtProps) {
  // Generate a consistent hue from the title string
  const hue = title.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;

  if (customPhoto) {
    return (
      <div style={{
        width: size, height: size, borderRadius: size * 0.22, flexShrink: 0, overflow: "hidden",
        border: active ? `2px solid ${T.accent}` : "2px solid transparent",
        boxShadow: active ? `0 0 0 1px ${T.accent}33` : "none",
        transition: "border-color 0.2s",
      }}>
        <img
          src={customPhoto} alt={title}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
    );
  }

  // Initials fallback
  const initials = title
    .split(" ")
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.22, flexShrink: 0,
      background: `hsl(${hue}, 45%, 28%)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      border: active ? `2px solid ${T.accent}` : `2px solid hsl(${hue}, 45%, 38%)`,
      boxShadow: active ? `0 0 0 1px ${T.accent}33` : "none",
      transition: "border-color 0.2s",
      userSelect: "none",
    }}>
      <span style={{
        fontSize: size * 0.32, fontWeight: "700",
        color: `hsl(${hue}, 60%, 85%)`,
        letterSpacing: "-0.02em",
      }}>
        {initials || "♪"}
      </span>
    </div>
  );
}