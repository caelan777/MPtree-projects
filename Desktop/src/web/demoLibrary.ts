// Shared fixture for the browser build.
//
// On Android the native plugins answer; in a browser there is no MediaStore and
// no MediaPlayer, so these stand in. That powers the playable demo embedded on
// the website, and makes `npm run dev` a usable way to work on the UI.
//
// Everything here is invented on purpose. The demo is public, so no name in
// this file may belong to a real song, artist or record.
//
// Artists used to be left blank, on the reasoning that an untagged library is
// what many people actually have. True, but this fixture is also the shop
// window: it is what the website's screenshots and its embedded demo show, and
// a column of empty artists reads as "this player cannot read my files"
// rather than as "these files have no tags". So the fixture is tagged.

export type DemoTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
  year: number;
  track: number;
  uri: string;
  dateAdded: number;
  duration: number;
};

/** Eight invented acts, each with an invented record. */
const RECORDS: { artist: string; album: string; year: number; titles: string[] }[] = [
  {
    artist: "Kite Season", album: "Paper Weather", year: 2024,
    titles: ["Midnight Drive", "Amber Light", "Iron Lullaby", "Distant Engine",
             "Paper Weather", "Six Hours North", "Lantern", "Winter Arcade"],
  },
  {
    artist: "The Halogens", album: "Slow Signal", year: 2023,
    titles: ["Paper Boats", "Dust and Wire", "Blue Hour", "Slow Signal",
             "Cold Open", "Tinder", "Halcyon", "The Quiet Part"],
  },
  {
    artist: "Marrow", album: "Static Bloom", year: 2025,
    titles: ["Static Bloom", "Neon Orchard", "The Long Way Down", "Glasswing",
             "Sable", "Undertow", "Fathom", "Nocturne"],
  },
  {
    artist: "Nine Lanterns", album: "Ghost Frequency", year: 2024,
    titles: ["Wolves in the Hall", "Ghost Frequency", "Copper Rain", "Bramble",
             "Kiln", "Thistle", "Ravel", "Held"],
  },
  {
    artist: "Ada Vane", album: "Low Tide", year: 2022,
    titles: ["Low Tide", "Silver Kite", "Cove", "Aster",
             "Quill", "Drift", "Wren", "Meridian"],
  },
  {
    artist: "Post Meridiem", album: "Sunday Machine", year: 2025,
    titles: ["Cathedral Hum", "Sunday Machine", "Hollow Season", "Pale Hour",
             "Umbra", "Slate", "Vellum", "Ember"],
  },
  {
    artist: "Fenwick Drive", album: "Nightjar", year: 2023,
    titles: ["Nightjar", "Loom", "Cinder", "Signal Fire",
             "The Understudy", "Harbour Light", "Ninth of June", "Everley"],
  },
  {
    artist: "Salt House", album: "Tidewater", year: 2026,
    titles: ["Tidewater", "Brackish", "Anchor Chain", "Saltmarsh",
             "Gale Warning", "Foghorn", "Spring Tide", "Last Ferry"],
  },
];

const DAY = 86_400_000;

/**
 * Deterministic, so the demo looks the same to everyone who opens it.
 *
 * Records are interleaved rather than listed one after another: sorted by date
 * added, the newest-first default then shows a mixed library the way a real one
 * looks, instead of eight albums in eight clean blocks.
 */
export const DEMO_TRACKS: DemoTrack[] = RECORDS.flatMap((rec, r) =>
  rec.titles.map((title, t) => {
    const i = t * RECORDS.length + r;
    return {
      id:        `demo://${i}`,
      title,
      artist:    rec.artist,
      album:     rec.album,
      year:      rec.year,
      track:     t + 1,
      uri:       `demo://${i}`,
      dateAdded: Date.UTC(2026, 7, 1) - i * DAY,
      // 2:34 to about 5:30, varied enough that the progress bar reads
      // differently from row to row.
      duration:  154_000 + ((i * 37) % 180) * 1000,
    };
  }),
).sort((a, b) => b.dateAdded - a.dateAdded);

export const DEMO_DURATIONS: Record<string, number> = Object.fromEntries(
  DEMO_TRACKS.map(t => [t.uri, t.duration]),
);
