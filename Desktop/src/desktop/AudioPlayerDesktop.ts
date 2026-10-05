import { WebPlugin } from "@capacitor/core";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";

type QueueTrack = { path: string; title: string; artist: string; isCut?: boolean };

const EQ_FREQS = [60, 230, 910, 3600, 14000];

/**
 * The player on Windows. Stands where MusicPlayerService stands on Android and
 * keeps the same contract: this side owns track advancement and announces it
 * through `stateChange`, and `trackComplete` means only "the queue ran out",
 * never "move to the next one".
 *
 * The sound comes from an <audio> element in the window, fed by Tauri's asset
 * protocol. The media keys and the Windows media flyout come with it, through
 * navigator.mediaSession.
 */
export class AudioPlayerDesktop extends WebPlugin {
  private audio = new Audio();
  private queue: QueueTrack[] = [];
  private index = 0;
  private path = "";
  private mode = "off";
  private speed = 1;
  private failures = 0;

  private ctx: AudioContext | null = null;
  private bands: BiquadFilterNode[] = [];
  private eqEnabled = false;
  private eqLevels: number[] = [];

  constructor() {
    super();
    this.audio.preload = "auto";
    // Needed for the equaliser: without it the audio graph gets silence.
    this.audio.crossOrigin = "anonymous";
    this.audio.addEventListener("ended", () => this.onEnded());
    this.audio.addEventListener("error", () => this.onError());
    this.audio.addEventListener("playing", () => { this.failures = 0; });

    const ms = navigator.mediaSession;
    if (ms) {
      ms.setActionHandler("play", () => { void this.resume(); });
      ms.setActionHandler("pause", () => { void this.pause(); });
      ms.setActionHandler("nexttrack", () => this.step(1));
      ms.setActionHandler("previoustrack", () => this.step(-1));
    }
  }

  private announce(isPlaying: boolean) {
    this.notifyListeners("stateChange", { isPlaying, path: this.path });
  }

  private start(track: { path: string; title?: string; artist?: string }) {
    this.path = track.path;
    this.audio.src = convertFileSrc(track.path);
    this.audio.playbackRate = this.speed;
    this.audio.play().catch(() => { /* the error event deals with it */ });
    if (navigator.mediaSession) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: track.title || "", artist: track.artist || "" });
    }
    this.announce(true);
  }

  private step(dir: 1 | -1) {
    // Back, a few seconds in, restarts the song, like every other player.
    if (dir < 0 && this.audio.currentTime > 3) { this.audio.currentTime = 0; return; }
    const next = this.queue[this.index + dir];
    if (!next) return;
    this.index += dir;
    this.start(next);
  }

  private onEnded() {
    if (this.mode === "repeat") {
      this.audio.currentTime = 0;
      this.audio.play().catch(() => {});
      this.announce(true);
      return;
    }
    const next = this.queue[this.index + 1];
    if (!next) {
      this.announce(false);
      this.notifyListeners("trackComplete", {});
      return;
    }
    this.index += 1;
    this.start(next);
  }

  /** A file the window cannot decode: move on, but not round the whole queue. */
  private onError() {
    if (!this.path) return;
    this.failures += 1;
    const next = this.queue[this.index + 1];
    if (!next || this.failures > 5) { this.announce(false); return; }
    this.index += 1;
    this.start(next);
  }

  async play(options: { path: string; title?: string; artist?: string }): Promise<void> {
    const i = this.queue.findIndex(t => t.path === options.path);
    if (i >= 0) this.index = i;
    this.start(options);
  }

  async pause(): Promise<void> {
    this.audio.pause();
    this.announce(false);
  }

  async resume(): Promise<void> {
    if (!this.path) return;
    await this.audio.play().catch(() => {});
    this.announce(!this.audio.paused);
  }

  private positionMs() { return Math.round(this.audio.currentTime * 1000); }
  private durationMs() { return Number.isFinite(this.audio.duration) ? Math.round(this.audio.duration * 1000) : 0; }

  async getCurrentPosition() { return { position: this.positionMs() }; }
  async getDuration() { return { duration: this.durationMs() }; }
  async getState() { return { position: this.positionMs(), duration: this.durationMs() }; }
  async getCurrentSong() { return { path: this.path, isPlaying: !!this.path && !this.audio.paused }; }

  async seekTo(options: { milliseconds: number }): Promise<void> {
    this.audio.currentTime = Math.max(0, options.milliseconds) / 1000;
  }

  async setQueue(options: { tracks: QueueTrack[]; currentIndex: number }): Promise<void> {
    this.queue = options.tracks || [];
    this.index = Math.max(0, options.currentIndex || 0);
  }

  async setPlayMode(options: { mode: string }): Promise<void> {
    this.mode = options.mode;
  }

  /** Not in the prototype yet: one <audio> element has nothing to fade into. */
  async setCrossfadeDuration(): Promise<void> {}

  async setPlaybackSpeed(options: { speed: number }): Promise<void> {
    this.speed = options.speed > 0 ? options.speed : 1;
    this.audio.playbackRate = this.speed;
  }

  async getPlaybackSpeed() { return { speed: this.speed }; }

  async setVolume(options: { volume: number }): Promise<void> {
    this.audio.volume = Math.min(1, Math.max(0, options.volume));
  }

  /** Windows mixes every app's sound already. */
  async setMixMode(): Promise<void> {}

  async getAlbumArt(options: { path: string }): Promise<{ art: string }> {
    try { return { art: await invoke<string>("album_art", { path: options.path }) }; }
    catch { return { art: "" }; }
  }

  async getAlbumArtThumb(options: { path: string; maxPx?: number }): Promise<{ art: string; ready: boolean }> {
    const { art } = await this.getAlbumArt(options);
    if (!art) return { art: "", ready: true };
    return { art: await shrink(art, options.maxPx || 160), ready: true };
  }

  /** The Windows media flyout shows the title and artist only, for now. */
  async setTrackArt(): Promise<void> {}

  // The graph is built the first time the equaliser is switched on, not at
  // start, so a library that never uses it plays straight from the element.
  private buildGraph() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    const source = this.ctx.createMediaElementSource(this.audio);
    this.bands = EQ_FREQS.map(f => {
      const b = this.ctx!.createBiquadFilter();
      b.type = "peaking";
      b.frequency.value = f;
      b.Q.value = 1;
      return b;
    });
    let node: AudioNode = source;
    for (const b of this.bands) { node.connect(b); node = b; }
    node.connect(this.ctx.destination);
  }

  private applyEq() {
    this.bands.forEach((b, i) => { b.gain.value = this.eqEnabled ? (this.eqLevels[i] || 0) / 100 : 0; });
  }

  async setEqualizerEnabled(options: { enabled: boolean }): Promise<void> {
    this.eqEnabled = options.enabled;
    if (options.enabled) { this.buildGraph(); void this.ctx?.resume(); }
    this.applyEq();
  }

  async setEqualizerBandLevels(options: { levels: number[] }): Promise<void> {
    this.eqLevels = options.levels;
    this.applyEq();
  }

  async getEqualizerInfo() {
    return { available: true, bandFreqsHz: EQ_FREQS, minMillibel: -1500, maxMillibel: 1500 };
  }
}

/** A cover at list-row size, so a long library does not hold full-size art. */
function shrink(dataUrl: string, maxPx: number): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => resolve("");
    img.src = dataUrl;
  });
}
