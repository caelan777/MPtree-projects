import { WebPlugin } from "@capacitor/core";
import { DEMO_TRACKS, type DemoTrack } from "./demoLibrary";

/** Browser stand-in for the native MediaStore scan. See demoLibrary.ts. */
export class MusicScannerWeb extends WebPlugin {
  async scan(): Promise<{ songs: DemoTrack[] }> {
    // A beat of latency so the loading screen is actually seen, the way it is
    // on a real device rather than flashing past.
    await new Promise(r => setTimeout(r, 400));
    return { songs: DEMO_TRACKS.map(t => ({ ...t })) };
  }

  /** Nothing to rescan without a filesystem. */
  async scanFolder(): Promise<void> {
    return;
  }
  /** No sidecar files to read in the browser fixture. */
  async getLyrics(): Promise<{ lyrics: string }> {
    return { lyrics: "" };
  }

  /** The browser has no ringtone to set. */
  async setAsRingtone(): Promise<{ ok: boolean }> {
    return { ok: false };
  }
}
