import voiceUrl from "./assets/lantern-voice.mp3";

// ─── LANTERN'S VOICE ─────────────────────────────────────────────────────────
// The question the first time Lantern is put on is spoken as well as written:
// a short clip Caelan made for it, which asks "Are you afraid?".
//
// Through Web Audio rather than an <audio> element. An element asks Android
// for the sound to itself, and the music the person is listening to would
// stop for it; Web Audio plays alongside.
//
// The light on screen follows the voice. It used to be measured while the
// clip played and written onto the light every frame, but every one of those
// frames needs the page's main thread, and when that is busy the light
// stutters. Now the whole clip is measured once, before it plays, into a list
// of loudnesses, and the light is given those as one animation that the GPU
// runs by itself, started together with the sound.
//
// A browser only lets sound start from a tap, so `primeLanternVoice` is
// called in the tap that opens the question, and the clip is fetched then.

let ctx: AudioContext | null = null;
let clip: Promise<AudioBuffer | null> | null = null;
let levels: number[] | null = null;

/** How far apart the loudnesses are, in milliseconds. */
export const VOICE_STEP = 40;

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

/** How loud the clip is through time, 0 to 1, one value every VOICE_STEP.
 *  Smoothed the way a light should follow a voice: up fast with a word, down
 *  slowly after it, and down to nothing at the end. */
function loudness(buffer: AudioBuffer): number[] {
  const data = buffer.getChannelData(0);
  const win = Math.max(1, Math.round((buffer.sampleRate * VOICE_STEP) / 1000));
  const out: number[] = [0];
  let smooth = 0;
  for (let i = 0; i < data.length; i += win) {
    const end = Math.min(data.length, i + win);
    let sum = 0;
    for (let j = i; j < end; j++) sum += data[j] * data[j];
    // Shaped so a spoken word fills most of the range.
    const raw = Math.min(1, Math.sqrt(sum / (end - i)) * 5);
    smooth += (raw - smooth) * (raw > smooth ? 0.65 : 0.2);
    out.push(smooth);
  }
  while (smooth > 0.02) { smooth *= 0.8; out.push(smooth); }
  out.push(0);
  return out;
}

/** Speaks the question. `started` gets the loudness the moment the sound
 *  starts; `ended` comes once, when the light has gone back down, and also
 *  when there is no sound to be had. Returns a stop. */
export function speakLanternVoice(started: (levels: number[]) => void, ended: () => void): () => void {
  let stopped = false;
  let source: AudioBufferSourceNode | null = null;
  let timer = 0;
  const finish = () => { if (!stopped) { stopped = true; ended(); } };

  if (!ctx || !clip) { timer = window.setTimeout(finish, 1700); return () => { stopped = true; clearTimeout(timer); }; }
  const audio = ctx;
  clip.then(buffer => {
    if (stopped) return;
    if (!buffer) { finish(); return; }
    levels ??= loudness(buffer);
    source = audio.createBufferSource();
    source.buffer = buffer;
    source.connect(audio.destination);
    started(levels);
    source.start();
    timer = window.setTimeout(finish, (levels.length - 1) * VOICE_STEP);
  }).catch(finish);

  return () => {
    stopped = true;
    clearTimeout(timer);
    try { source?.stop(); } catch { /* already over */ }
  };
}
