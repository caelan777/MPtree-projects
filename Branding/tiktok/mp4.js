/* The smallest MP4 writer that does the job: one H.264 video track, no sound,
 * the index at the front so a phone can start playing before the file has
 * finished arriving.
 *
 * Chrome's VideoEncoder hands over the compressed frames and the codec's
 * setup record (avcC); this wraps them in the boxes a player expects. There is
 * no audio track on purpose: TikTok, Reels and Shorts all take their sound
 * from the app, and a track that is picked there reaches more people than one
 * baked into the file.
 */
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
const MATRIX = cat([0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000].map(u32));

// WebCodecs names for colour, as the ISO codes the colr box carries.
const PRIMARIES = { bt709: 1, bt470bg: 5, smpte170m: 6, bt2020: 9, smpte432: 12 };
const TRANSFER  = { bt709: 1, smpte170m: 6, "iec61966-2-1": 13, linear: 8, pq: 16, hlg: 18 };
const MATRICES  = { rgb: 0, bt709: 1, bt470bg: 5, smpte170m: 6, "bt2020-ncl": 9 };

/**
 * @param {object} o
 * @param {number} o.width
 * @param {number} o.height
 * @param {number} o.fps
 * @param {Uint8Array} o.avcC            decoderConfig.description
 * @param {object} [o.colorSpace]        decoderConfig.colorSpace
 * @param {{data: Uint8Array, key: boolean, ts: number}[]} o.samples  in decode order, ts in frames
 */
export function muxMp4({ width, height, fps, avcC, colorSpace, samples }) {
  const n = samples.length;
  const timescale = fps * 1000;
  const delta = 1000;
  const mediaDur = n * delta;
  const movieDur = Math.round(n * 1000 / fps);

  // Frames come back in the order they are decoded. Without B-frames that is
  // also the order they are shown, which is what Chrome's encoders give and
  // what this writer relies on: there is no composition offset table here.
  for (let i = 0; i < n; i++) {
    if (samples[i].ts !== i) throw new Error(`frame ${i} came back out of order (as ${samples[i].ts}); B-frames are not supported`);
  }

  const cs = colorSpace || {};
  const colr = box("colr", enc.encode("nclx"),
    u16(PRIMARIES[cs.primaries] ?? 1), u16(TRANSFER[cs.transfer] ?? 1), u16(MATRICES[cs.matrix] ?? 1),
    u8(cs.fullRange ? 0x80 : 0));

  const name = enc.encode("MPTree");
  const compressor = zeros(32);
  compressor[0] = name.length;
  compressor.set(name, 1);

  const avc1 = box("avc1",
    zeros(6), u16(1),                 // reserved, data_reference_index
    zeros(16),                        // pre_defined, reserved
    u16(width), u16(height),
    u32(0x00480000), u32(0x00480000), // 72 dpi
    u32(0), u16(1),                   // reserved, frame_count
    compressor,
    u16(0x0018), u16(0xffff),         // depth, pre_defined
    box("avcC", avcC),
    colr,
    box("pasp", u32(1), u32(1)),
  );

  const keys = [];
  samples.forEach((s, i) => { if (s.key) keys.push(i + 1); });

  const stblParts = [
    full("stsd", 0, 0, u32(1), avc1),
    full("stts", 0, 0, u32(1), u32(n), u32(delta)),
    full("stss", 0, 0, u32(keys.length), ...keys.map(u32)),
    full("stsc", 0, 0, u32(1), u32(1), u32(n), u32(1)),
    full("stsz", 0, 0, u32(0), u32(n), ...samples.map(s => u32(s.data.length))),
  ];

  const build = offset => {
    const stbl = box("stbl", ...stblParts, full("stco", 0, 0, u32(1), u32(offset)));
    const minf = box("minf",
      full("vmhd", 0, 1, u16(0), u16(0), u16(0), u16(0)),
      box("dinf", full("dref", 0, 0, u32(1), full("url ", 0, 1))),
      stbl);
    const mdia = box("mdia",
      full("mdhd", 0, 0, u32(0), u32(0), u32(timescale), u32(mediaDur), u16(0x55c4), u16(0)),
      full("hdlr", 0, 0, u32(0), enc.encode("vide"), zeros(12), enc.encode("VideoHandler\0")),
      minf);
    const trak = box("trak",
      full("tkhd", 0, 3, u32(0), u32(0), u32(1), u32(0), u32(movieDur), zeros(8),
        u16(0), u16(0), u16(0), u16(0), MATRIX, u32(width << 16), u32(height << 16)),
      mdia);
    const moov = box("moov",
      full("mvhd", 0, 0, u32(0), u32(0), u32(1000), u32(movieDur), u32(0x00010000), u16(0x0100),
        zeros(10), MATRIX, zeros(24), u32(2)),
      trak);
    return moov;
  };

  const ftyp = box("ftyp", enc.encode("isom"), u32(512), enc.encode("isomiso2avc1mp41"));
  // The chunk offset is written inside moov, and moov's size does not depend
  // on the offset's value, so one trial build gives the size to point past.
  const moovSize = build(0).length;
  const moov = build(ftyp.length + moovSize + 8);
  const payload = samples.reduce((s, x) => s + x.data.length, 0);
  const mdatHead = cat([u32(8 + payload), enc.encode("mdat")]);
  return cat([ftyp, moov, mdatHead, ...samples.map(s => s.data)]);
}
