/**
 * Builds a GUIDE voiceover for the ad, using the speech voices built into
 * Windows.
 *
 *   node Branding/ad/voice/make-guide.mjs
 *   node Branding/ad/make-ad.mjs --vo
 *
 * This is a scratch track, not a finished one. The voices Windows ships are
 * the old SAPI ones and they sound it. What it is good for is hearing whether
 * a line fits its gap and whether the writing works against the picture,
 * before anyone stands in front of a microphone.
 *
 * To replace it with a real voice, record these six lines however you like,
 * drop them in this folder, and point lines.json at them. Anything a browser
 * can decode works: wav, mp3, m4a. The renderer only cares about `at`.
 *
 * Options: --rate <-10..10>  --voice "<name>"  --list
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };

/* The cues are seconds into the film, and they are the film's own beats:
   see ../script.md. A line has to finish before the next one starts. */
const LINES = [
  { file: "01.wav", at: 3.00,  say: "Everything you own, in one place." },
  { file: "02.wav", at: 5.60,  say: "No setup. It is just there." },
  { file: "03.wav", at: 7.95,  say: "Your own artwork, turning as it plays." },
  { file: "04.wav", at: 10.70, say: "Favourites, most played, last added." },
  { file: "05.wav", at: 13.40, say: "It costs nothing, and wants nothing from you." },
  // Spelt out, or the synthesiser reads the brand as a word.
  { file: "06.wav", at: 16.55, say: "M P Tree. On Google Play." },
];
const FILM = 19.0;

const ps = script => spawnSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8" });

if (process.argv.includes("--list")) {
  const r = ps(`Add-Type -AssemblyName System.Speech
    (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() |
      ForEach-Object { $_.VoiceInfo.Name }`);
  console.log(r.stdout.trim() || r.stderr);
  process.exit(0);
}

const VOICE = arg("voice", "Microsoft George");
const RATE  = arg("rate", "2");

console.log(`${VOICE}, rate ${RATE}`);
const script = `Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SelectVoice(${JSON.stringify(VOICE)})
$s.Rate = ${Number(RATE)}
${LINES.map(l => `$s.SetOutputToWaveFile(${JSON.stringify(join(HERE, l.file))}); $s.Speak(${JSON.stringify(l.say)})`).join("\n")}
$s.SetOutputToNull(); $s.Dispose()`;

const res = ps(script);
if (res.status !== 0) { console.error(res.stderr || "speech synthesis failed"); process.exit(1); }

/**
 * Cuts the silence off both ends.
 *
 * The synthesiser leaves a good half second of nothing around each line, which
 * would push every cue late by a different amount. Trimming is what makes `at`
 * mean the word rather than the file.
 */
function trim(path, thresh = 0.015, pad = 0.03) {
  const buf = readFileSync(path);
  // Walk the chunks rather than assuming a 44 byte header.
  let pos = 12, fmt = null, dataAt = 0, dataLen = 0;
  while (pos + 8 <= buf.length) {
    const id = buf.toString("ascii", pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    if (id === "fmt ") fmt = { channels: buf.readUInt16LE(pos + 10), rate: buf.readUInt32LE(pos + 12), bits: buf.readUInt16LE(pos + 22) };
    if (id === "data") { dataAt = pos + 8; dataLen = size; break; }
    pos += 8 + size + (size % 2);
  }
  if (!fmt || fmt.bits !== 16) return null;

  const step = fmt.channels * 2;
  const frames = Math.floor(dataLen / step);
  const win = Math.max(1, Math.floor(fmt.rate * 0.005));
  let first = -1, last = -1;
  for (let f = 0; f < frames; f += win) {
    let peak = 0;
    for (let i = f; i < Math.min(f + win, frames); i++) {
      const v = Math.abs(buf.readInt16LE(dataAt + i * step)) / 32768;
      if (v > peak) peak = v;
    }
    if (peak > thresh) { if (first < 0) first = f; last = Math.min(f + win, frames); }
  }
  if (first < 0) return null;
  first = Math.max(0, first - Math.floor(fmt.rate * pad));
  last  = Math.min(frames, last + Math.floor(fmt.rate * pad));

  const body = buf.subarray(dataAt + first * step, dataAt + last * step);
  const head = Buffer.alloc(44);
  head.write("RIFF", 0); head.writeUInt32LE(36 + body.length, 4); head.write("WAVE", 8);
  head.write("fmt ", 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20);
  head.writeUInt16LE(fmt.channels, 22); head.writeUInt32LE(fmt.rate, 24);
  head.writeUInt32LE(fmt.rate * step, 28); head.writeUInt16LE(step, 32); head.writeUInt16LE(16, 34);
  head.write("data", 36); head.writeUInt32LE(body.length, 40);
  writeFileSync(path, Buffer.concat([head, body]));
  return body.length / step / fmt.rate;
}

let over = 0;
LINES.forEach((l, i) => {
  const dur = trim(join(HERE, l.file));
  const next = i + 1 < LINES.length ? LINES[i + 1].at : FILM;
  const ends = l.at + dur;
  const fits = ends <= next + 0.02;
  if (!fits) over++;
  console.log(`  ${l.file}  at ${l.at.toFixed(2).padStart(5)}  ${dur.toFixed(2)}s  ends ${ends.toFixed(2).padStart(5)}  ${fits ? "ok" : `OVERRUNS the next cue at ${next.toFixed(2)}`}`);
});

writeFileSync(join(HERE, "lines.json"), JSON.stringify(LINES.map(l => ({ at: l.at, file: l.file })), null, 2) + "\n");
console.log(`\nlines.json written.` + (over ? `\n${over} line(s) run past the next cue: shorten the words or raise --rate.` : ""));
