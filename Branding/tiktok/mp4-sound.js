/* An MP4 writer with a sound track: one H.264 track and one AAC track, the
 * index at the front. A copy of brag-output/work/mux.js, for the cuts in
 * cuts.mjs that carry their own sound (see sounds.js). */
const enc = new TextEncoder();

function u32(n) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0); return b; }
function u16(n) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n & 0xffff); return b; }
function u8(...n) { return Uint8Array.from(n); }
function zeros(n) { return new Uint8Array(n); }
function cat(parts) {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
function box(type, ...parts) {
  const body = cat(parts);
  return cat([u32(8 + body.length), enc.encode(type), body]);
}
function full(type, version, flags, ...parts) {
  return box(type, u8(version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255), ...parts);
}
// An MPEG-4 descriptor, its length always written in four bytes.
function desc(tag, ...parts) {
  const body = cat(parts);
  const n = body.length;
  return cat([u8(tag, 0x80 | ((n >> 21) & 127), 0x80 | ((n >> 14) & 127), 0x80 | ((n >> 7) & 127), n & 127), body]);
}
const MATRIX = cat([0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000].map(u32));
const PRIMARIES = { bt709: 1, bt470bg: 5, smpte170m: 6, bt2020: 9, smpte432: 12 };
const TRANSFER  = { bt709: 1, smpte170m: 6, "iec61966-2-1": 13, linear: 8, pq: 16, hlg: 18 };
const MATRICES  = { rgb: 0, bt709: 1, bt470bg: 5, smpte170m: 6, "bt2020-ncl": 9 };

/**
 * video: { width, height, fps, avcC, colorSpace, samples: [{data, key, ts}] }  ts in frames
 * audio: { sampleRate, channels, asc, bitrate, samples: [{data}] }             1024 frames each
 */
export function muxMp4(video, audio) {
  const { width, height, fps, avcC, colorSpace, samples } = video;
  const n = samples.length;
  for (let i = 0; i < n; i++) {
    if (samples[i].ts !== i) throw new Error(`frame ${i} came back out of order (as ${samples[i].ts})`);
  }
  const vScale = fps * 1000, vDelta = 1000, vDur = n * vDelta;
  const movieDur = Math.round(n * 1000 / fps);

  const cs = colorSpace || {};
  const colr = box("colr", enc.encode("nclx"),
    u16(PRIMARIES[cs.primaries] ?? 1), u16(TRANSFER[cs.transfer] ?? 1), u16(MATRICES[cs.matrix] ?? 1),
    u8(cs.fullRange ? 0x80 : 0));
  const name = enc.encode("MPTree");
  const compressor = zeros(32); compressor[0] = name.length; compressor.set(name, 1);
  const avc1 = box("avc1", zeros(6), u16(1), zeros(16), u16(width), u16(height),
    u32(0x00480000), u32(0x00480000), u32(0), u16(1), compressor, u16(0x0018), u16(0xffff),
    box("avcC", avcC), colr, box("pasp", u32(1), u32(1)));
  const keys = [];
  samples.forEach((s, i) => { if (s.key) keys.push(i + 1); });

  const an = audio.samples.length;
  const aDur = an * 1024;
  const mp4a = box("mp4a", zeros(6), u16(1), zeros(8), u16(audio.channels), u16(16), u16(0), u16(0),
    u32(audio.sampleRate * 65536),
    full("esds", 0, 0,
      desc(3, u16(2), u8(0),
        desc(4, u8(0x40, 0x15, 0, 0, 0), u32(audio.bitrate), u32(audio.bitrate),
          desc(5, audio.asc)),
        desc(6, u8(2)))));

  const vTrak = off => box("trak",
    full("tkhd", 0, 3, u32(0), u32(0), u32(1), u32(0), u32(movieDur), zeros(8),
      u16(0), u16(0), u16(0), u16(0), MATRIX, u32(width << 16), u32(height << 16)),
    box("mdia",
      full("mdhd", 0, 0, u32(0), u32(0), u32(vScale), u32(vDur), u16(0x55c4), u16(0)),
      full("hdlr", 0, 0, u32(0), enc.encode("vide"), zeros(12), enc.encode("VideoHandler\0")),
      box("minf",
        full("vmhd", 0, 1, u16(0), u16(0), u16(0), u16(0)),
        box("dinf", full("dref", 0, 0, u32(1), full("url ", 0, 1))),
        box("stbl",
          full("stsd", 0, 0, u32(1), avc1),
          full("stts", 0, 0, u32(1), u32(n), u32(vDelta)),
          full("stss", 0, 0, u32(keys.length), ...keys.map(u32)),
          full("stsc", 0, 0, u32(1), u32(1), u32(n), u32(1)),
          full("stsz", 0, 0, u32(0), u32(n), ...samples.map(s => u32(s.data.length))),
          full("stco", 0, 0, u32(1), u32(off))))));

  const aTrak = off => box("trak",
    full("tkhd", 0, 3, u32(0), u32(0), u32(2), u32(0), u32(Math.round(aDur * 1000 / audio.sampleRate)), zeros(8),
      u16(0), u16(1), u16(0x0100), u16(0), MATRIX, u32(0), u32(0)),
    box("mdia",
      full("mdhd", 0, 0, u32(0), u32(0), u32(audio.sampleRate), u32(aDur), u16(0x55c4), u16(0)),
      full("hdlr", 0, 0, u32(0), enc.encode("soun"), zeros(12), enc.encode("SoundHandler\0")),
      box("minf",
        full("smhd", 0, 0, u16(0), u16(0)),
        box("dinf", full("dref", 0, 0, u32(1), full("url ", 0, 1))),
        box("stbl",
          full("stsd", 0, 0, u32(1), mp4a),
          full("stts", 0, 0, u32(1), u32(an), u32(1024)),
          full("stsc", 0, 0, u32(1), u32(1), u32(an), u32(1)),
          full("stsz", 0, 0, u32(0), u32(an), ...audio.samples.map(s => u32(s.data.length))),
          full("stco", 0, 0, u32(1), u32(off))))));

  const build = (vOff, aOff) => box("moov",
    full("mvhd", 0, 0, u32(0), u32(0), u32(1000), u32(movieDur), u32(0x00010000), u16(0x0100),
      zeros(10), MATRIX, zeros(24), u32(3)),
    vTrak(vOff), aTrak(aOff));

  const ftyp = box("ftyp", enc.encode("isom"), u32(512), enc.encode("isomiso2avc1mp41"));
  const moovSize = build(0, 0).length;
  const vBytes = samples.reduce((s, x) => s + x.data.length, 0);
  const aBytes = audio.samples.reduce((s, x) => s + x.data.length, 0);
  const vOff = ftyp.length + moovSize + 8;
  const moov = build(vOff, vOff + vBytes);
  const mdatHead = cat([u32(8 + vBytes + aBytes), enc.encode("mdat")]);
  return cat([ftyp, moov, mdatHead, ...samples.map(s => s.data), ...audio.samples.map(s => s.data)]);
}
