import voiceUrl from "./assets/lantern-voice.mp3";

// ─── LANTERN'S VOICE ─────────────────────────────────────────────────────────
// The question the first time Lantern is put on is spoken as well as written:
// a short clip Caelan made for it, which asks "Are you afraid?".
//
// Through Web Audio rather than an <audio> element. An element asks Android
// for the sound to itself, and the music the person is listening to would
// stop for it; Web Audio plays alongside. It also lets the light on screen
// follow the voice: `level` is how loud it is right now, 0 to 1.
//
// A browser only lets sound start from a tap, so `primeLanternVoice` is
// called in the tap that opens the question, and the clip is fetched then.

let ctx: AudioContext | null = null;
let clip: Promise<AudioBuffer | null> | null = null;

/** In the tap: wakes the sound up and starts fetching the clip. */
export function primeLanternVoice(): void {
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
    clip ??= fetch(voiceUrl)
      .then(r => r.arrayBuffer())
      .then(b => ctx!.decodeAudioData(b))
      .catch(() => null);
  } catch {
    ctx = null;
  }
}

/** Speaks the question. Calls `level` every frame while it speaks, and
 *  `ended` once, also when there is no sound to be had. Returns a stop. */
export function speakLanternVoice(level: (v: number) => void, ended: () => void): () => void {
  let stopped = false;
  let source: AudioBufferSourceNode | null = null;
  let frame = 0;
  const finish = () => { if (!stopped) { stopped = true; cancelAnimationFrame(frame); level(0); ended(); } };

  if (!ctx || !clip) { setTimeout(finish, 1700); return () => { stopped = true; }; }
  const audio = ctx;
  clip.then(buffer => {
    if (stopped) return;
    if (!buffer) { finish(); return; }
    source = audio.createBufferSource();
    source.buffer = buffer;
    const meter = audio.createAnalyser();
    meter.fftSize = 512;
    source.connect(meter);
    meter.connect(audio.destination);
    const samples = new Float32Array(meter.fftSize);
    const tick = () => {
      meter.getFloatTimeDomainData(samples);
      let sum = 0;
      for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
      // Loudness, shaped so a spoken word fills most of the range.
      level(Math.min(1, Math.sqrt(sum / samples.length) * 5));
      frame = requestAnimationFrame(tick);
    };
    source.onended = finish;
    source.start();
    frame = requestAnimationFrame(tick);
  }).catch(finish);

  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
    try { source?.stop(); } catch { /* already over */ }
  };
}
