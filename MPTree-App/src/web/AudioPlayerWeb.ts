import { WebPlugin } from "@capacitor/core";
import { DEMO_DURATIONS } from "./demoLibrary";

type QueueTrack = { path: string; title: string; artist: string; isCut?: boolean };

/**
 * Browser stand-in for the native MusicPlayerService.
 *
 * There is no audio: a timer advances a play position instead, which is enough
 * for the whole UI — progress bar, auto-advance, queue, repeat — to behave as
 * it does on a device. It deliberately mirrors the native contract the app
 * relies on: this side owns track advancement and announces it through
 * `stateChange`, and `trackComplete` means only "the queue ran out", never
 * "move to the next one".
 */
export class AudioPlayerWeb extends WebPlugin {
  private queue: QueueTrack[] = [];
  private index = 0;
  private path = "";
  private position = 0;
  private playing = false;
  private speed = 1;
  private mode: string = "off";
  private timer: ReturnType<typeof setInterval> | null = null;
  private eqEnabled = false;
  private eqLevels: number[] = [];

  private static readonly TICK_MS = 250;
  private static readonly FALLBACK_DURATION = 210_000;

  private durationOf(path: string): number {
    return DEMO_DURATIONS[path] ?? AudioPlayerWeb.FALLBACK_DURATION;
  }

  private startTimer() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), AudioPlayerWeb.TICK_MS);
  }

  private stopTimer() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private tick() {
    if (!this.playing) return;
    this.position += AudioPlayerWeb.TICK_MS * this.speed;
    if (this.position < this.durationOf(this.path)) return;

    // Track finished.
    if (this.mode === "repeat") {
      this.position = 0;
      this.notifyListeners("stateChange", { isPlaying: true, path: this.path });
      return;
    }
    const next = this.queue[this.index + 1];
    if (!next) {
      this.playing = false;
      this.position = 0;
      this.stopTimer();
      this.notifyListeners("trackComplete", {});
      return;
    }
    this.index += 1;
    this.path = next.path;
    this.position = 0;
    this.notifyListeners("stateChange", { isPlaying: true, path: this.path });
  }

  async play(options: { path: string; title?: string; artist?: string }): Promise<void> {
    this.path = options.path;
    this.position = 0;
    this.playing = true;
    const i = this.queue.findIndex(t => t.path === options.path);
    if (i >= 0) this.index = i;
    this.startTimer();
    this.notifyListeners("stateChange", { isPlaying: true, path: this.path });
  }

  async pause(): Promise<void> {
    this.playing = false;
    this.notifyListeners("stateChange", { isPlaying: false, path: this.path });
  }

  async resume(): Promise<void> {
    if (!this.path) return;
    this.playing = true;
    this.startTimer();
    this.notifyListeners("stateChange", { isPlaying: true, path: this.path });
  }

  async getCurrentPosition(): Promise<{ position: number }> {
    return { position: Math.round(this.position) };
  }

  async getDuration(): Promise<{ duration: number }> {
    return { duration: this.path ? this.durationOf(this.path) : 0 };
  }

  async getState(): Promise<{ position: number; duration: number }> {
    return {
      position: Math.round(this.position),
      duration: this.path ? this.durationOf(this.path) : 0,
    };
  }

  async getCurrentSong(): Promise<{ path: string; isPlaying: boolean }> {
    return { path: this.path, isPlaying: this.playing };
  }

  async seekTo(options: { milliseconds: number }): Promise<void> {
    this.position = Math.max(0, options.milliseconds);
  }

  async setQueue(options: { tracks: QueueTrack[]; currentIndex: number }): Promise<void> {
    this.queue = options.tracks || [];
    this.index = Math.max(0, options.currentIndex || 0);
  }

  async setPlayMode(options: { mode: string }): Promise<void> {
    this.mode = options.mode;
  }

  /** Crossfade has nothing to fade between here. */
  async setCrossfadeDuration(): Promise<void> {
    return;
  }

  async setPlaybackSpeed(options: { speed: number }): Promise<void> {
    this.speed = options.speed > 0 ? options.speed : 1;
  }

  async getPlaybackSpeed(): Promise<{ speed: number }> {
    return { speed: this.speed };
  }

  /** No embedded art in the fixture; the app falls back to its own artwork. */
  async getAlbumArt(): Promise<{ art: string }> {
    return { art: "" };
  }

  /** Same: no embedded covers in the browser, so every row shows the grey note.
   *  ready:true, because there is no service to wait for here. */
  async getAlbumArtThumb(): Promise<{ art: string; ready: boolean }> {
    return { art: "", ready: true };
  }

  /** Nothing to tell: the browser has no lock screen or notification. */
  async setTrackArt(): Promise<void> {}

  async setEqualizerEnabled(options: { enabled: boolean }): Promise<void> {
    this.eqEnabled = options.enabled;
  }

  async setEqualizerBandLevels(options: { levels: number[] }): Promise<void> {
    this.eqLevels = options.levels;
  }

  /** Reported as available so the equaliser sheet is explorable in the demo. */
  async getEqualizerInfo(): Promise<{
    available: boolean; bandFreqsHz: number[]; minMillibel: number; maxMillibel: number;
  }> {
    void this.eqEnabled; void this.eqLevels;
    return {
      available: true,
      bandFreqsHz: [60, 230, 910, 3600, 14000],
      minMillibel: -1500,
      maxMillibel: 1500,
    };
  }
}
