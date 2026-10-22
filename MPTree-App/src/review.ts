import { Preferences } from "@capacitor/preferences";
import { System } from "./plugins";

// ─── THE REVIEW ASK ──────────────────────────────────────────────────────────
// Once, Google Play's own review card comes up inside MPTree: from the second
// day MPTree is opened on, after ten songs, as a new song starts and with the
// app on screen. Nothing is offered for it (Play does not allow that), and
// there is no "do you like us?" first. Google decides whether the card is
// actually shown, so asking cannot nag: it is asked once and never again.

const KEY = "mptree_review";
const SONGS = 10;

type Review = { firstDay: string; songs: number; asked: boolean };

let state: Review | null = null;
let asking = false;

const today = () => new Date().toLocaleDateString("en-CA");

async function load(): Promise<Review> {
  if (state) return state;
  try {
    const v = (await Preferences.get({ key: KEY })).value;
    if (v) state = JSON.parse(v) as Review;
  } catch { /* nothing stored */ }
  if (!state) { state = { firstDay: today(), songs: 0, asked: false }; await save(); }
  return state;
}

async function save() {
  if (state) await Preferences.set({ key: KEY, value: JSON.stringify(state) }).catch(() => {});
}

/** Called when the app opens, so the first day is the day it was first used
 *  and not the day of the tenth song. */
export function startReview(): void {
  if (__DISTRIBUTION__ !== "play") return;
  void load();
}

/** A song started. Counts it, and asks when the time has come. */
export async function reviewSongPlayed(): Promise<void> {
  if (__DISTRIBUTION__ !== "play" || asking) return;
  const s = await load();
  if (s.asked) return;
  s.songs++;
  if (s.songs < SONGS || s.firstDay === today() || document.visibilityState !== "visible") { await save(); return; }
  asking = true;
  s.asked = true;
  await save();
  // A moment after the song has started, so the card does not cover the tap.
  setTimeout(() => { System.askReview().catch(() => {}).finally(() => { asking = false; }); }, 2500);
}
