/* Sound for the cuts that carry their own (cut.sound in cuts.mjs).
 *
 * Every sound here is made from oscillators and noise in an
 * OfflineAudioContext: no samples, no recordings, nobody else's music, so
 * nothing in it can be claimed. compose.html renders it, encodes it to AAC
 * and puts it in the file next to the picture.
 *
 * A score gets the cut and the start of each shot in seconds, and returns an
 * AudioBuffer exactly as long as the video.
 */
export const SR = 48000;

const note = n => 440 * Math.pow(2, (n - 69) / 12);

function noiseBuffer(ctx, seconds) {
  const b = ctx.createBuffer(1, Math.ceil(seconds * SR), SR);
  const d = b.getChannelData(0);
  // Seeded, so every render sounds the same.
  let s = 1234567;
  for (let i = 0; i < d.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = s / 0x3fffffff - 1; }
  return b;
}

/** A plucked, music-box-like note: a sine and its octave, fast attack, long decay. */
function bell(ctx, out, t, midi, gain, len = 1.6) {
  for (const [mult, g] of [[1, 1], [2, 0.35], [3.01, 0.12]]) {
    const o = ctx.createOscillator();
    o.frequency.value = note(midi) * mult;
    const e = ctx.createGain();
    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(gain * g, t + 0.006);
    e.gain.exponentialRampToValueAtTime(0.0001, t + len / mult);
    o.connect(e).connect(out);
    o.start(t); o.stop(t + len + 0.05);
  }
}

/** The hit when the eyes land: a thump that falls away under everything, a
 *  burst of noise, bright and then darker, and a shriek. */
function hit(ctx, master, noise, eyes) {
  //    A thump that falls away under everything.
  const thump = ctx.createOscillator();
  thump.frequency.setValueAtTime(90, eyes);
  thump.frequency.exponentialRampToValueAtTime(32, eyes + 0.45);
  const tg = ctx.createGain();
  tg.gain.setValueAtTime(0, eyes);
  tg.gain.linearRampToValueAtTime(1.0, eyes + 0.004);
  tg.gain.exponentialRampToValueAtTime(0.001, eyes + 0.6);
  thump.connect(tg).connect(master);
  thump.start(eyes); thump.stop(eyes + 0.7);

  //    A burst of noise, bright and then darker.
  const burst = ctx.createBufferSource(); burst.buffer = noise;
  const bf = ctx.createBiquadFilter(); bf.type = "bandpass"; bf.Q.value = 1.2;
  bf.frequency.setValueAtTime(4200, eyes); bf.frequency.exponentialRampToValueAtTime(700, eyes + 0.9);
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(0, eyes);
  bg.gain.linearRampToValueAtTime(0.9, eyes + 0.003);
  bg.gain.exponentialRampToValueAtTime(0.001, eyes + 1.1);
  burst.connect(bf).connect(bg).connect(master);
  burst.start(eyes, 0.5); burst.stop(eyes + 1.2);

  //    The shriek: a cluster of close, sour notes, wobbling and sliding
  //    down, like strings scraped all at once.
  const shriek = ctx.createGain();
  shriek.gain.setValueAtTime(0, eyes);
  shriek.gain.linearRampToValueAtTime(0.3, eyes + 0.01);
  shriek.gain.linearRampToValueAtTime(0.2, eyes + 0.5);
  shriek.gain.exponentialRampToValueAtTime(0.001, eyes + 1.7);
  const sf = ctx.createBiquadFilter(); sf.type = "lowpass"; sf.frequency.value = 5000;
  shriek.connect(sf).connect(master);
  const vib = ctx.createOscillator(); vib.frequency.value = 9;
  const vibDepth = ctx.createGain(); vibDepth.gain.value = 18;
  vib.connect(vibDepth);
  vib.start(eyes); vib.stop(eyes + 1.8);
  [[75, -0.6], [76, 0.6], [77, -0.2], [81, 0.3], [82, -0.4], [88, 0.1]].forEach(([m, pan]) => {
    const o = ctx.createOscillator(); o.type = "sawtooth";
    o.frequency.setValueAtTime(note(m), eyes);
    o.frequency.exponentialRampToValueAtTime(note(m) * 0.82, eyes + 1.6);
    vibDepth.connect(o.frequency);
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    const g = ctx.createGain(); g.gain.value = 0.22;
    o.connect(g).connect(p).connect(shriek);
    o.start(eyes); o.stop(eyes + 1.8);
  });
}

export const SCORES = {
  /* halloween-boo: a low, uneasy hum under the quiet list; it stops dead
     when the screen goes black; a hit and a shriek when the eyes land; then
     a small music box for "happy halloween" that carries on under the end. */
  async boo(cut, starts, total) {
    const ctx = new OfflineAudioContext(2, Math.ceil(total * SR), SR);
    const master = ctx.createGain();
    master.gain.value = 1;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10; comp.knee.value = 6; comp.ratio.value = 8;
    comp.attack.value = 0.002; comp.release.value = 0.2;
    master.connect(comp).connect(ctx.destination);

    const dark = starts[1], eyes = starts[2], end = starts[3];
    const noise = noiseBuffer(ctx, total);

    // 1. The hum: two low tones a few hertz apart, so it throbs, and a thin
    //    wind of filtered noise. Swells a little, then cuts off at the dark.
    const hum = ctx.createGain();
    hum.gain.setValueAtTime(0, 0);
    hum.gain.linearRampToValueAtTime(0.035, 0.25);
    hum.gain.linearRampToValueAtTime(0.06, dark - 0.02);
    hum.gain.linearRampToValueAtTime(0, dark);
    hum.connect(master);
    for (const f of [55, 58.3, 110.4]) {
      const o = ctx.createOscillator();
      o.type = f > 100 ? "triangle" : "sine";
      o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = f > 100 ? 0.25 : 0.8;
      o.connect(g).connect(hum);
      o.start(0); o.stop(dark + 0.05);
    }
    const wind = ctx.createBufferSource(); wind.buffer = noise;
    const wf = ctx.createBiquadFilter(); wf.type = "bandpass"; wf.Q.value = 6;
    wf.frequency.setValueAtTime(500, 0); wf.frequency.linearRampToValueAtTime(1400, dark);
    const wg = ctx.createGain(); wg.gain.value = 0.35;
    wind.connect(wf).connect(wg).connect(hum);
    wind.start(0); wind.stop(dark + 0.05);

    // 2. The dark is silent on purpose: a third of a second of nothing.

    // 3. The hit, when the eyes land.
    hit(ctx, master, noise, eyes);

    // 4. The music box, from "happy halloween" on: a slow minor figure of my
    //    own, high and soft, with a low note under each bar.
    const box = ctx.createGain(); box.gain.value = 0.07; box.connect(master);
    const t0 = eyes + 1.0, beat = 0.3;
    // A minor, then F, then E: down, round and back up.
    const tune = [81, 76, 72, 76, 77, 72, 69, 72, 76, 71, 68, 71, 69, 72, 76, 81];
    const bass = [45, 41, 40, 45];
    tune.forEach((m, i) => { const t = t0 + i * beat; if (t < total - 0.2) bell(ctx, box, t, m, 0.55); });
    bass.forEach((m, i) => { const t = t0 + i * beat * 4; if (t < total - 0.2) bell(ctx, box, t, m + 12, 0.5, 2.4); });
    box.gain.setValueAtTime(0.07, Math.max(t0, total - 0.6));
    box.gain.linearRampToValueAtTime(0, total);

    void end;
    return await ctx.startRendering();
  },
  /* man.html: a muffled beat leaking from his headphones while he listens,
     cut dead when the screen goes black; the hit on the eyes; a heartbeat
     while he is scared; then nothing from the grin on, because that is where
     the song is added in the TikTok editor. */
  async man(T, total) {
    const ctx = new OfflineAudioContext(2, Math.ceil(total * SR), SR);
    const master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10; comp.knee.value = 6; comp.ratio.value = 8;
    comp.attack.value = 0.002; comp.release.value = 0.2;
    master.connect(comp).connect(ctx.destination);
    const noise = noiseBuffer(ctx, total);

    // 1. Headphone leak: kick, hat and a bass line of my own at 118 bpm,
    //    behind a low-pass so it sounds like it comes out of his ears.
    const leak = ctx.createGain(); leak.gain.value = 0.16;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900;
    leak.connect(lp).connect(master);
    const beat = 60 / 118, stop = T.black;
    for (let i = 0, t = 0.05; t < stop - 0.02; i++, t = 0.05 + i * beat / 2) {
      if (i % 2 === 0) {
        const k = ctx.createOscillator(); k.frequency.setValueAtTime(120, t); k.frequency.exponentialRampToValueAtTime(45, t + 0.12);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, Math.min(stop, t + 0.25));
        k.connect(g).connect(leak); k.start(t); k.stop(Math.min(stop, t + 0.26));
      }
      const h = ctx.createBufferSource(); h.buffer = noise;
      const hf = ctx.createBiquadFilter(); hf.type = "highpass"; hf.frequency.value = 6000;
      const hg = ctx.createGain(); hg.gain.setValueAtTime(0.06, t); hg.gain.exponentialRampToValueAtTime(0.001, Math.min(stop, t + 0.05));
      h.connect(hf).connect(hg).connect(master); h.start(t, (i * 0.37) % 3); h.stop(Math.min(stop, t + 0.06));
    }
    // Bass: A, A, C, G, one note a beat.
    [45, 45, 48, 43, 45, 45].forEach((m, bar) => {
      for (let b = 0; b < 4; b++) {
        const t = 0.05 + (bar * 4 + b) * beat;
        if (t >= stop - 0.02) return;
        const o = ctx.createOscillator(); o.type = "square"; o.frequency.value = note(m - 12);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, Math.min(stop, t + beat * 0.9));
        o.connect(g).connect(leak); o.start(t); o.stop(Math.min(stop, t + beat));
      }
    });

    // 2. The dark: silent. 3. The hit.
    hit(ctx, master, noise, T.eyes);

    // 4. His heart while he is scared: lub-dub, slowing as he calms down.
    let t = T.scared + 0.05, gap = 0.42;
    while (t < T.relief + 0.3) {
      for (const [dt, f, g0] of [[0, 62, 0.8], [0.16, 55, 0.55]]) {
        const o = ctx.createOscillator(); o.frequency.setValueAtTime(f, t + dt); o.frequency.exponentialRampToValueAtTime(f * 0.6, t + dt + 0.15);
        const g = ctx.createGain(); g.gain.setValueAtTime(0, t + dt); g.gain.linearRampToValueAtTime(g0, t + dt + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.22);
        o.connect(g).connect(master); o.start(t + dt); o.stop(t + dt + 0.25);
      }
      t += gap; gap *= 1.12;
    }

    // 5. From the grin on: silence, for the song.
    return await ctx.startRendering();
  },
};
