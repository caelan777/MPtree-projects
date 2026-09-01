// Shared fixture for the browser build.
//
// On Android the native plugins answer; in a browser there is no MediaStore and
// no MediaPlayer, so these stand in. That powers the playable demo embedded on
// the website, and makes `npm run dev` a usable way to work on the UI.
//
// Titles are invented on purpose. The demo is public, so nothing here may be a
// real song or artist. Artists are left blank, which is also what an untagged
// library actually looks like.

export type DemoTrack = {
  id: string;
  title: string;
  artist: string;
  uri: string;
  dateAdded: number;
  duration: number;
};

const TITLES = [
  "Nightjar", "Held", "Loom", "Signal", "Drift", "Ember", "Vellum", "Static Bloom",
  "Pale Hour", "Undertow", "Marrow", "Glasswing", "Sable", "Tinder", "Cinder",
  "Halcyon", "Nocturne", "Fathom", "Ravel", "Umbra", "Quill", "Lantern", "Bramble",
  "Cove", "Aster", "Kiln", "Meridian", "Slate", "Thistle", "Wren",
];

const DAY = 86_400_000;

/** Deterministic, so the demo looks the same to everyone who opens it. */
export const DEMO_TRACKS: DemoTrack[] = TITLES.map((title, i) => ({
  id:        `demo://${i}`,
  title,
  artist:    "",
  uri:       `demo://${i}`,
  dateAdded: Date.UTC(2026, 7, 1) - i * DAY,
  // 2:34 to about 5:30, varied enough that the progress bar reads differently
  // from row to row.
  duration:  154_000 + ((i * 37) % 180) * 1000,
}));

export const DEMO_DURATIONS: Record<string, number> = Object.fromEntries(
  DEMO_TRACKS.map(t => [t.uri, t.duration]),
);
