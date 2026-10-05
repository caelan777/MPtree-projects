import { WebPlugin } from "@capacitor/core";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";

/** `cutFrom` and `cutTo`: a cut that is two markers on its source file (see
 *  saveCutTrack in App.tsx). The player keeps to them itself, because the
 *  window that would otherwise watch for the end may be minimised. */
type QueueTrack = { path: string; title: string; artist: string; isCut?: boolean; cutFrom?: number; cutTo?: number };
type Bounds = { cutFrom?: number; cutTo?: number };

const EQ_FREQS = [60, 230, 910, 3600, 14000];

/**
 * The player on Windows. Stands where MusicPlayerService stands on Android and
 * keeps the same contract: this side owns track advancement and announces it
 * through `stateChange`, and `trackComplete` means only "the queue ran out",
 * never "move to the next one".
 *
 * The sound comes from <audio> elements in the window, fed by Tauri's asset
 * protocol. There are two of them, as the service has two MediaPlayers: one
 * plays, and for a crossfade the other starts the next song under it. The
 * media keys and the Windows media flyout come through navigator.mediaSession.
 */
export class AudioPlayerDesktop extends WebPlugin {
  private decks = [this.makeDeck(), this.makeDeck()];
  /** The deck that is the song: what position, pause and seek mean. */
  private audio = this.decks[0];
  private queue: QueueTrack[] = [];
  private index = 0;
  private path = "";
  private bounds: Bounds = {};
  private mode = "off";
  private speed = 1;
  private volume = 1;
  private failures = 0;

  private crossfadeMs = 0;
  /** The next song coming up under this one, and how far the fade is. */
  private fade: { deck: HTMLAudioElement; track: QueueTrack; index: number; ms: number } | null = null;
  private fadeTimer: ReturnType<typeof setInterval> | undefined;

  private ctx: AudioContext | null = null;
  private bands: BiquadFilterNode[] = [];
  private eqEnabled = false;
  private eqLevels: number[] = [];

  constructor() {
    super();
    const ms = navigator.mediaSession;
    if (ms) {
      ms.setActionHandler("play", () => { void this.resume(); });
      ms.setActionHandler("pause", () => { void this.pause(); });
      ms.setActionHandler("nexttrack", () => this.step(1));
      ms.setActionHandler("previoustrack", () => this.step(-1));
    }
  }

  private makeDeck(): HTMLAudioElement {
    const a = new Audio();
    a.preload = "auto";
    // Needed for the equaliser: without it the audio graph gets silence.
    a.crossOrigin = "anonymous";
    a.addEventListener("ended", () => this.onEnded(a));
    a.addEventListener("error", () => this.onError(a));
    a.addEventListener("playing", () => { if (a === this.audio) this.failures = 0; });
    // The clock of everything that happens during a song. Events of the
    // element rather than a timer: a window that is minimised has its timers
    // slowed to one a second, and these keep coming.
    a.addEventListener("timeupdate", () => this.tick());
    return a;
  }

  private other(): HTMLAudioElement {
    return this.audio === this.decks[0] ? this.decks[1] : this.decks[0];
  }

  /** `fromQueue`: this player moved on by itself. Then it also says where in
   *  the queue it is, which lets the window tell a cut from its source: the
   *  two are the same file, so the path alone does not say which one started.
   *  Not when the window asked for the song: it knows, and this player's queue
   *  may still be the one from before. */
  private announce(isPlaying: boolean, fromQueue = false) {
    this.notifyListeners("stateChange", { isPlaying, path: this.path, ...(fromQueue ? { index: this.index } : null) });
  }

  private setMeta(track: { title?: string; artist?: string }) {
    if (navigator.mediaSession) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: track.title || "", artist: track.artist || "" });
    }
  }

  private start(track: { path: string; title?: string; artist?: string } & Bounds, fromQueue = true) {
    this.cancelFade();
    this.path = track.path;
    this.bounds = { cutFrom: track.cutFrom, cutTo: track.cutTo };
    const a = this.audio;
    a.src = convertFileSrc(track.path);
    a.volume = this.volume;
    a.playbackRate = this.speed;
    const from = track.cutFrom && track.cutFrom > 0 ? track.cutFrom / 1000 : 0;
    if (from) {
      // Not before the file is known: a seek on an element with nothing
      // loaded is forgotten.
      a.addEventListener("loadedmetadata", () => { if (a === this.audio && a.currentTime < from) a.currentTime = from; }, { once: true });
    }
    a.play().catch(() => { /* the error event deals with it */ });
    this.setMeta(track);
    this.announce(true, fromQueue);
  }

  private step(dir: 1 | -1) {
    // Back, a few seconds in, restarts the song, like every other player.
    const from = (this.bounds.cutFrom ?? 0) / 1000;
    if (dir < 0 && this.audio.currentTime - from > 3) { this.cancelFade(); this.audio.currentTime = from; return; }
    const next = this.queue[this.index + dir];
    if (!next) return;
    this.index += dir;
    this.start(next);
  }

  /** The song is over: by itself, or because a cut reached its end marker. */
  private advance() {
    if (this.mode === "repeat") {
      this.cancelFade();
      this.audio.currentTime = (this.bounds.cutFrom ?? 0) / 1000;
      this.audio.play().catch(() => {});
      this.announce(true);
      return;
    }
    const next = this.queue[this.index + 1];
    if (!next) {
      this.cancelFade();
      this.audio.pause();
      this.announce(false);
      this.notifyListeners("trackComplete", {});
      return;
    }
    this.index += 1;
    this.start(next);
  }

  private onEnded(deck: HTMLAudioElement) {
    if (deck !== this.audio) return;
    // Ran out while the next one was still coming up under it: that one is
    // the song now, at whatever volume the fade had reached.
    if (this.fade) { this.finishFade(); return; }
    this.advance();
  }

  /** A file the window cannot decode: move on, but not round the whole queue. */
  private onError(deck: HTMLAudioElement) {
    if (this.fade && deck === this.fade.deck) { this.cancelFade(); return; }
    if (deck !== this.audio || !this.path) return;
    this.cancelFade();
    this.failures += 1;
    const next = this.queue[this.index + 1];
    if (!next || this.failures > 5) { this.announce(false); return; }
    this.index += 1;
    this.start(next);
  }

  // ── Crossfade ────────────────────────────────────────────────────────────
  // As on Android: when what is left of the song is no more than the fade, the
  // next one starts silently on the other deck and the two change places in
  // volume. The window hears of the new song when the fade is done. A cut is
  // not faded into or out of; its markers are where it starts and stops.

  private tick() {
    const a = this.audio;
    if (a.paused) return;
    const to = this.bounds.cutTo;
    if (to != null && a.currentTime * 1000 >= to) { this.advance(); return; }
    if (this.fade) { this.rideFade(); return; }
    if (this.crossfadeMs <= 0 || to != null || this.bounds.cutFrom != null) return;
    if (!Number.isFinite(a.duration) || a.duration <= 0) return;
    const left = (a.duration - a.currentTime) * 1000 / this.speed;
    if (left > this.crossfadeMs || left <= 0) return;
    const index = this.mode === "repeat" ? this.index : this.index + 1;
    const next = this.queue[index];
    if (!next || next.isCut || next.cutFrom != null) return;
    this.startFade(next, index, Math.max(300, Math.min(this.crossfadeMs, left)));
  }

  private startFade(track: QueueTrack, index: number, ms: number) {
    const deck = this.other();
    this.fade = { deck, track, index, ms };
    deck.src = convertFileSrc(track.path);
    deck.volume = 0;
    deck.playbackRate = this.speed;
    deck.play().catch(() => { /* the error event calls the fade off */ });
    // The element says where it is four times a second, which as steps of
    // volume can be heard. A timer fills in between while the window is in
    // view; out of view it is slowed down and the element's ticks carry on.
    clearInterval(this.fadeTimer);
    this.fadeTimer = setInterval(() => this.rideFade(), 40);
  }

  /** How far the fade is goes by how much of the new song has played, so a
   *  pause in the middle of one pauses the fade with it. */
  private rideFade() {
    const f = this.fade;
    if (!f) return;
    if (f.deck.paused && this.audio.paused) return;
    const t = Math.min(1, Math.max(0, f.deck.currentTime * 1000 / this.speed / f.ms));
    this.audio.volume = this.volume * (1 - t);
    f.deck.volume = this.volume * t;
    if (t >= 1) this.finishFade();
  }

  private finishFade() {
    const f = this.fade;
    if (!f) return;
    this.fade = null;
    clearInterval(this.fadeTimer);
    const old = this.audio;
    old.pause();
    old.removeAttribute("src");
    old.load();
    this.audio = f.deck;
    this.audio.volume = this.volume;
    this.index = f.index;
    this.path = f.track.path;
    this.bounds = {};
    this.setMeta(f.track);
    this.announce(true, true);
  }

  /** Whatever starts or moves the song by hand ends a fade that was on. */
  private cancelFade() {
    const f = this.fade;
    if (!f) return;
    this.fade = null;
    clearInterval(this.fadeTimer);
    f.deck.pause();
    f.deck.removeAttribute("src");
    f.deck.load();
    this.audio.volume = this.volume;
  }

  // ── What the window asks ─────────────────────────────────────────────────

  async play(options: { path: string; title?: string; artist?: string } & Bounds): Promise<void> {
    // A cut and its source are one path: the markers say which is meant.
    const same = (t: QueueTrack) => t.path === options.path && (t.cutFrom ?? -1) === (options.cutFrom ?? -1);
    let i = this.queue.findIndex(same);
    if (i < 0) i = this.queue.findIndex(t => t.path === options.path);
    if (i >= 0) this.index = i;
    this.start(options, false);
  }

  async pause(): Promise<void> {
    this.audio.pause();
    this.fade?.deck.pause();
    this.announce(false);
  }

  async resume(): Promise<void> {
    if (!this.path) return;
    await this.audio.play().catch(() => {});
    this.fade?.deck.play().catch(() => {});
    this.announce(!this.audio.paused);
  }

  private positionMs() { return Math.round(this.audio.currentTime * 1000); }
  private durationMs() { return Number.isFinite(this.audio.duration) ? Math.round(this.audio.duration * 1000) : 0; }

  async getCurrentPosition() { return { position: this.positionMs() }; }
  async getDuration() { return { duration: this.durationMs() }; }
  async getState() { return { position: this.positionMs(), duration: this.durationMs() }; }
  async getCurrentSong() { return { path: this.path, isPlaying: !!this.path && !this.audio.paused }; }

  async seekTo(options: { milliseconds: number }): Promise<void> {
    this.cancelFade();
    this.audio.currentTime = Math.max(0, options.milliseconds) / 1000;
  }

  async setQueue(options: { tracks: QueueTrack[]; currentIndex: number }): Promise<void> {
    this.queue = options.tracks || [];
    this.index = Math.max(0, options.currentIndex || 0);
    // The song that is playing may be a cut whose markers came with the queue
    // and not with play(): the queue is what knows.
    const now = this.queue[this.index];
    if (now && now.path === this.path && !this.fade) this.bounds = { cutFrom: now.cutFrom, cutTo: now.cutTo };
    // A queue put in another order while a fade is on: the song coming up is
    // somewhere else in it now.
    if (this.fade) {
      const coming = this.fade.track.path;
      const i = this.queue.findIndex(t => t.path === coming);
      if (i >= 0) this.fade.index = i;
    }
  }

  async setPlayMode(options: { mode: string }): Promise<void> {
    this.mode = options.mode;
  }

  async setCrossfadeDuration(options: { milliseconds: number }): Promise<void> {
    this.crossfadeMs = Math.max(0, options?.milliseconds || 0);
    if (!this.crossfadeMs) this.cancelFade();
  }

  async setPlaybackSpeed(options: { speed: number }): Promise<void> {
    this.speed = options.speed > 0 ? options.speed : 1;
    this.audio.playbackRate = this.speed;
    if (this.fade) this.fade.deck.playbackRate = this.speed;
  }

  async getPlaybackSpeed() { return { speed: this.speed }; }

  async setVolume(options: { volume: number }): Promise<void> {
    this.volume = Math.min(1, Math.max(0, options.volume));
    if (this.fade) this.rideFade(); else this.audio.volume = this.volume;
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
  // start, so a library that never uses it plays straight from the elements.
  // Both decks go through the same bands.
  private buildGraph() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.bands = EQ_FREQS.map(f => {
      const b = this.ctx!.createBiquadFilter();
      b.type = "peaking";
      b.frequency.value = f;
      b.Q.value = 1;
      return b;
    });
    for (let i = 0; i < this.bands.length - 1; i++) this.bands[i].connect(this.bands[i + 1]);
    this.bands[this.bands.length - 1].connect(this.ctx.destination);
    for (const deck of this.decks) this.ctx.createMediaElementSource(deck).connect(this.bands[0]);
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
