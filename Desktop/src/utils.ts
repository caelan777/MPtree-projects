// ─── Missing-artist detection ─────────────────────────────────────────────────
//
// Android's MediaStore scanner uses different strings to indicate "no artist":
//   "<unknown>"       — the most common one, returned by older AOSP builds
//   "Unknown"         — returned by many OEM ROMs (Samsung, Xiaomi, etc.)
//   "Unknown Artist"  — another OEM variant
//   ""                — empty string, from files with no ID3 tag at all
//
// Used by App.tsx for dispArtist / toNativeTrack to decide whether a native
// artist string should be shown to the user or treated as "no artist".
export function isMissingArtist(artist: string | null | undefined): boolean {
  if (!artist || !artist.trim()) return true;
  const lower = artist.trim().toLowerCase();
  return (
    lower === "<unknown>"       ||
    lower === "unknown"         ||
    lower === "unknown artist"  ||
    lower === "unknown artists" ||
    lower === "various artists" ||
    lower === "various"
  );
}

// ─── Dominant color extraction ────────────────────────────────────────────────
//
// Used to tint the mini-player background and blur the expanded-player backdrop
// with a color pulled from the current track's album art, instead of a flat
// theme color. Downsamples to a tiny canvas for speed and picks a reasonably
// saturated, mid-brightness average so the result works as a UI tint (avoids
// near-white/near-black art washing out to an unusable color).
export function extractDominantColor(imageUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const SIZE = 24; // tiny — this is a color estimate, not a rendering
          const canvas = document.createElement("canvas");
          canvas.width = SIZE; canvas.height = SIZE;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) { resolve(null); return; }
          ctx.drawImage(img, 0, 0, SIZE, SIZE);
          const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

          let r = 0, g = 0, b = 0, n = 0;
          for (let i = 0; i < data.length; i += 4) {
            const alpha = data[i + 3];
            if (alpha < 128) continue; // skip transparent pixels
            const pr = data[i], pg = data[i + 1], pb = data[i + 2];
            // Skip near-white and near-black pixels — they wash out as a tint
            // and are usually letterboxing/background, not the art's color.
            const max = Math.max(pr, pg, pb), min = Math.min(pr, pg, pb);
            if (max > 235 && min > 215) continue; // near white
            if (max < 25) continue;               // near black
            r += pr; g += pg; b += pb; n++;
          }
          if (n === 0) { resolve(null); return; }
          r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
          resolve(`rgb(${r}, ${g}, ${b})`);
        } catch {
          resolve(null); // canvas can throw on some malformed images — degrade quietly
        }
      };
      img.onerror = () => resolve(null);
      img.src = imageUrl;
    } catch {
      resolve(null);
    }
  });
}

// ─── COVER PHOTOS ────────────────────────────────────────────────────────────
//
// A photo chosen from the gallery arrives at full camera resolution, and reading
// it with FileReader.readAsDataURL stores it verbatim: a 3 MB photo becomes
// roughly 4 MB of base64 sitting in song meta.
//
// That is expensive in every direction. Meta is serialised to Preferences as one
// JSON blob, so every write pays for every photo; the whole store is parsed on
// launch; backups carry it; and it crosses the bridge again to reach the lock
// screen. Cover art is displayed at 268px at the very largest, so none of that
// size was ever visible.
//
// 640px on the long edge, JPEG, keeps a cover sharp on any phone screen and
// turns megabytes into tens of kilobytes.
const COVER_MAX_PX = 640;
const COVER_QUALITY = 0.82;

export function readCoverPhoto(file: File, maxPx = COVER_MAX_PX): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that image"));
    reader.onload = () => {
      const original = reader.result as string;
      const img = new Image();
      // If anything about the decode or the canvas fails, fall back to the
      // original rather than losing the user's photo.
      img.onerror = () => resolve(original);
      img.onload = () => {
        try {
          const longest = Math.max(img.width, img.height);
          if (longest <= maxPx) { resolve(original); return; }

          const scale = maxPx / longest;
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext("2d");
          if (!ctx) { resolve(original); return; }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", COVER_QUALITY));
        } catch {
          resolve(original);
        }
      };
      img.src = original;
    };
    reader.readAsDataURL(file);
  });
}
