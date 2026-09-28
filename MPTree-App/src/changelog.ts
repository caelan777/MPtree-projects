// What changed in THIS build, shown once after someone updates to it (see
// WhatsNewSheet). Bundled rather than fetched, because the app is offline.
//
// Update this with every release, next to Website/assets/versions.js. Each line
// is an English key: add its Dutch to i18n-nl.ts in the same commit.

export const CHANGELOG: { version: string; notes: string[] } = {
  version: "0.3.0",
  notes: [
    "Your music can keep playing while another app plays sound. Settings > Audio.",
    "Music now pauses when your headphones or Bluetooth speaker disconnect.",
    "MPTree speaks Dutch. It follows your phone, or pick a language in Settings.",
    "A size setting for text and rows: Small, Medium or Large.",
    "A Help section, with answers to common questions, feedback and ratings.",
    "A moved logo button stays put now. The logo flies to the top and back.",
    "Smoother scrolling through long lists.",
  ],
};
