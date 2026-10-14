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

// ─── THE BUILD-UP ────────────────────────────────────────────────────────────
// Before the voice, the first time: a low drone that rises and opens up, a
// hiss that climbs with it, and a heartbeat that comes faster and harder, all
// cut off at once by a deep hit, the moment he appears. Made here with Web
// Audio rather than a recording, so it is ours and costs no file, and set out
// on the sound's own clock at the start, so nothing waits on the page.

/** How long the build-up is, in milliseconds: he appears at the end of it. */
export const BUILD_MS = 3400;
/** When the heart beats, in milliseconds from the start: further apart at
 *  first, then closer and closer. The screen pulses on the same beats. */
export const BUILD_BEATS: number[] = (() => {
  const out: number[] = [];
  for (let at = 320, gap = 820; at < BUILD_MS - 140; at += gap, gap = Math.max(170, gap * 0.78)) out.push(Math.round(at));
  return out;
})();

/** Plays the build-up and its hit. Returns a stop, which fades it out. */
export function playLanternBuildUp(): () => void {
  const a = ctx;
  if (!a) return () => {};
  const nodes: AudioScheduledSourceNode[] = [];
  const t0 = a.currentTime + 0.05;
  const end = t0 + BUILD_MS / 1000;
  const master = a.createGain();
  master.gain.value = 0.9;
  master.connect(a.destination);

  const noise = a.createBuffer(1, a.sampleRate, a.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  // The drone: three saws, two of them a little apart, through a filter
  // that opens as they climb half an octave.
  const lp = a.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.value = 6;
  lp.frequency.setValueAtTime(110, t0);
  lp.frequency.exponentialRampToValueAtTime(1400, end);
  const drone = a.createGain();
  drone.gain.setValueAtTime(0.0001, t0);
  drone.gain.exponentialRampToValueAtTime(0.22, end - 0.05);
  drone.gain.linearRampToValueAtTime(0, end + 0.02);
  lp.connect(drone).connect(master);
  for (const [f, detune] of [[55, -8], [55.4, 7], [110, 0]]) {
    const o = a.createOscillator();
    o.type = "sawtooth";
    o.detune.value = detune;
    o.frequency.setValueAtTime(f, t0);
    o.frequency.exponentialRampToValueAtTime(f * 1.5, end);
    o.connect(lp);
    o.start(t0); o.stop(end + 0.05);
    nodes.push(o);
  }

  // The hiss: noise through a band that climbs.
  const bp = a.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(250, t0);
  bp.frequency.exponentialRampToValueAtTime(5000, end);
  const hiss = a.createGain();
  hiss.gain.setValueAtTime(0.0001, t0);
  hiss.gain.exponentialRampToValueAtTime(0.12, end - 0.03);
  hiss.gain.linearRampToValueAtTime(0, end + 0.01);
  const ns = a.createBufferSource();
  ns.buffer = noise;
  ns.loop = true;
  ns.connect(bp).connect(hiss).connect(master);
  ns.start(t0); ns.stop(end + 0.05);
  nodes.push(ns);

  // The heart: two thumps a beat, harder as it goes.
  for (const ms of BUILD_BEATS) {
    const at = t0 + ms / 1000;
    const strength = 0.35 + 0.65 * (ms / BUILD_MS);
    for (const [after, share] of [[0, 1], [0.14, 0.6]]) {
      const o = a.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(70, at + after);
      o.frequency.exponentialRampToValueAtTime(40, at + after + 0.18);
      const g = a.createGain();
      g.gain.setValueAtTime(0.0001, at + after);
      g.gain.exponentialRampToValueAtTime(0.55 * strength * share, at + after + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + after + 0.22);
      o.connect(g).connect(master);
      o.start(at + after); o.stop(at + after + 0.25);
      nodes.push(o);
    }
  }

  // The hit: a deep drop, and a burst of low noise under it.
  const hit = a.createOscillator();
  hit.type = "sine";
  hit.frequency.setValueAtTime(110, end);
  hit.frequency.exponentialRampToValueAtTime(32, end + 1.2);
  const hitGain = a.createGain();
  hitGain.gain.setValueAtTime(0.0001, end);
  hitGain.gain.exponentialRampToValueAtTime(0.9, end + 0.02);
  hitGain.gain.exponentialRampToValueAtTime(0.0001, end + 1.6);
  hit.connect(hitGain).connect(master);
  hit.start(end); hit.stop(end + 1.7);
  nodes.push(hit);
  const thud = a.createBufferSource();
  thud.buffer = noise;
  const low = a.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.setValueAtTime(900, end);
  low.frequency.exponentialRampToValueAtTime(80, end + 0.9);
  const thudGain = a.createGain();
  thudGain.gain.setValueAtTime(0.0001, end);
  thudGain.gain.exponentialRampToValueAtTime(0.5, end + 0.015);
  thudGain.gain.exponentialRampToValueAtTime(0.0001, end + 0.9);
  thud.connect(low).connect(thudGain).connect(master);
  thud.start(end); thud.stop(end + 1);
  nodes.push(thud);

  return () => {
    const now = a.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0, now + 0.15);
    for (const n of nodes) { try { n.stop(now + 0.2); } catch { /* already done */ } }
  };
}
