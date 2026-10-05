// What MPTree has to know about the insides of an audio file itself, because
// nothing it depends on does it: how long a Matroska (WebM) file is, and how to
// cut a piece out of an MP3 or a WAV without decoding it.
//
// The Matroska part is here because of downloads: a good share of the ".mp3"
// files people have are WebM with the wrong name. The window plays them, but
// lofty goes by the name, fails, and the song would show no length.

use std::fs::File;
use std::io::Read;
use std::path::Path;

// ── Matroska ────────────────────────────────────────────────────────────────

const EBML: u32 = 0x1A45_DFA3;
const SEGMENT: u32 = 0x1853_8067;
const INFO: u32 = 0x1549_A966;
const CLUSTER: u32 = 0x1F43_B675;
const TIMECODE_SCALE: u32 = 0x2A_D7B1;
const DURATION: u32 = 0x4489;

/// An element id: one to four bytes, the length marker kept in.
fn ebml_id(data: &[u8], pos: usize) -> Option<(u32, usize)> {
    let first = *data.get(pos)?;
    let len = first.leading_zeros() as usize + 1;
    if len > 4 || pos + len > data.len() {
        return None;
    }
    let id = data[pos..pos + len].iter().fold(0u32, |acc, b| (acc << 8) | *b as u32);
    Some((id, len))
}

/// An element size: one to eight bytes, the length marker taken out. None for
/// the value means "unknown", which a live recording's Segment has.
fn ebml_size(data: &[u8], pos: usize) -> Option<(Option<u64>, usize)> {
    let first = *data.get(pos)?;
    let len = first.leading_zeros() as usize + 1;
    if len > 8 || pos + len > data.len() {
        return None;
    }
    let mut value = (first as u64) & (0xFFu64 >> len);
    let mut all_ones = value == (0xFFu64 >> len);
    for b in &data[pos + 1..pos + len] {
        value = (value << 8) | *b as u64;
        all_ones &= *b == 0xFF;
    }
    Some((if all_ones { None } else { Some(value) }, len))
}

/// The length in milliseconds a Matroska file says it has, from the bytes at
/// its start. None when it is not Matroska, or does not say.
pub fn matroska_duration_in(data: &[u8]) -> Option<u64> {
    let (id, n) = ebml_id(data, 0)?;
    if id != EBML {
        return None;
    }
    let (size, m) = ebml_size(data, n)?;
    let mut pos = n + m + size? as usize;

    let (id, n) = ebml_id(data, pos)?;
    if id != SEGMENT {
        return None;
    }
    let (_, m) = ebml_size(data, pos + n)?;
    pos += n + m;

    // The Segment's children, until Info. It stands before the first Cluster.
    while pos < data.len() {
        let (id, n) = ebml_id(data, pos)?;
        let (size, m) = ebml_size(data, pos + n)?;
        let body = pos + n + m;
        if id == CLUSTER {
            return None;
        }
        let size = size? as usize;
        if id != INFO {
            pos = body.checked_add(size)?;
            continue;
        }
        let end = body.checked_add(size)?.min(data.len());
        let (mut scale, mut ticks) = (1_000_000f64, None);
        let mut at = body;
        while at < end {
            let (id, n) = ebml_id(data, at)?;
            let (size, m) = ebml_size(data, at + n)?;
            let from = at + n + m;
            let to = from.checked_add(size? as usize)?;
            let bytes = data.get(from..to)?;
            match id {
                TIMECODE_SCALE => scale = bytes.iter().fold(0u64, |acc, b| (acc << 8) | *b as u64) as f64,
                DURATION => {
                    ticks = match bytes.len() {
                        4 => Some(f32::from_be_bytes(bytes.try_into().ok()?) as f64),
                        8 => Some(f64::from_be_bytes(bytes.try_into().ok()?)),
                        _ => None,
                    }
                }
                _ => {}
            }
            at = to;
        }
        let ms = ticks? * scale / 1_000_000.0;
        return if ms.is_finite() && ms > 0.0 { Some(ms.round() as u64) } else { None };
    }
    None
}

pub fn matroska_duration(path: &Path) -> Option<u64> {
    let mut head = Vec::new();
    File::open(path).ok()?.take(256 * 1024).read_to_end(&mut head).ok()?;
    matroska_duration_in(&head)
}

// ── Cutting ─────────────────────────────────────────────────────────────────
// A cut that makes a real file, which then is a song like any other and goes to
// the other devices on the account. Only where it can be done by copying:
// MP3 is a row of frames that each stand alone (near enough), WAV is plain
// samples. Anything else answers UNSUPPORTED_FORMAT, and the window keeps the
// cut as two markers on the original instead, as the phone does.

pub const UNSUPPORTED: &str = "UNSUPPORTED_FORMAT: This format cannot be cut into a file of its own";

struct Mp3Frame {
    len: usize,
    samples: u32,
    rate: u32,
    /// Where a Xing or Info tag would stand, counted from the frame's start.
    xing_at: usize,
}

fn mp3_frame(d: &[u8], pos: usize) -> Option<Mp3Frame> {
    let h = d.get(pos..pos + 4)?;
    if h[0] != 0xFF || h[1] & 0xE0 != 0xE0 {
        return None;
    }
    let version = (h[1] >> 3) & 3; // 0 = 2.5, 2 = 2, 3 = 1
    let layer = (h[1] >> 1) & 3; // 1 = layer III
    let bitrate = (h[2] >> 4) as usize;
    let rate_index = ((h[2] >> 2) & 3) as usize;
    let padding = ((h[2] >> 1) & 1) as usize;
    let mono = (h[3] >> 6) == 3;
    if version == 1 || layer != 1 || bitrate == 0 || bitrate == 15 || rate_index == 3 {
        return None;
    }
    let v1 = version == 3;
    const V1: [u32; 15] = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
    const V2: [u32; 15] = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
    let kbps = if v1 { V1[bitrate] } else { V2[bitrate] };
    let rate = match version {
        3 => [44100, 48000, 32000][rate_index],
        2 => [22050, 24000, 16000][rate_index],
        _ => [11025, 12000, 8000][rate_index],
    };
    let len = ((if v1 { 144 } else { 72 }) * kbps * 1000 / rate) as usize + padding;
    let side = match (v1, mono) {
        (true, false) => 32,
        (true, true) | (false, false) => 17,
        (false, true) => 9,
    };
    Some(Mp3Frame { len, samples: if v1 { 1152 } else { 576 }, rate, xing_at: 4 + side })
}

/// Where the audio starts: past an ID3v2 tag, if there is one.
fn after_id3v2(d: &[u8]) -> usize {
    if d.len() < 10 || &d[..3] != b"ID3" {
        return 0;
    }
    let size = d[6..10].iter().fold(0usize, |acc, b| (acc << 7) | (*b & 0x7F) as usize);
    10 + size + if d[5] & 0x10 != 0 { 10 } else { 0 }
}

/// The frames of `d` between two times, with a header frame in front that says
/// how many there are, so every player shows the right length. Resolves the
/// new file's bytes and its length in milliseconds.
pub fn cut_mp3(d: &[u8], start_ms: u64, end_ms: u64) -> Result<(Vec<u8>, u64), String> {
    let mut pos = after_id3v2(d).min(d.len());
    // The first frame: one that is followed by another, so a stray FF in a
    // tag or in something that is not MP3 at all is not taken for one.
    let first = loop {
        if pos + 4 > d.len() || pos > 2 * 1024 * 1024 + after_id3v2(d) {
            return Err(UNSUPPORTED.into());
        }
        if let Some(f) = mp3_frame(d, pos) {
            if f.len > 4 && mp3_frame(d, pos + f.len).is_some() {
                break f;
            }
        }
        pos += 1;
    };
    // The file's own header frame carries the old counts: left behind.
    let tag = d.get(pos + first.xing_at..pos + first.xing_at + 4);
    if matches!(tag, Some(b"Xing") | Some(b"Info")) || d.get(pos + 36..pos + 40) == Some(b"VBRI") {
        pos += first.len;
    }

    let mut kept: Vec<u8> = Vec::new();
    let (mut frames, mut samples_done, mut rate) = (0u32, 0u64, first.rate);
    let mut head: Option<[u8; 4]> = None;
    while let Some(f) = mp3_frame(d, pos) {
        if pos + f.len > d.len() {
            break;
        }
        let at_ms = samples_done * 1000 / f.rate as u64;
        if at_ms >= end_ms {
            break;
        }
        if at_ms >= start_ms {
            if head.is_none() {
                head = Some([d[pos], d[pos + 1], d[pos + 2], d[pos + 3]]);
                rate = f.rate;
            }
            kept.extend_from_slice(&d[pos..pos + f.len]);
            frames += 1;
        }
        samples_done += f.samples as u64;
        pos += f.len;
    }
    let Some(mut h) = head else {
        return Err("INVALID_RANGE: Nothing of the song lies between those two points".into());
    };

    // The header frame: a silent frame of the same kind, holding "Xing", how
    // many frames follow and how many bytes the whole file is.
    h[1] |= 0x01; // no checksum after the header
    h[2] &= !0x02; // no padding
    let mut info = mp3_frame(&h, 0).ok_or(UNSUPPORTED)?;
    while info.len < info.xing_at + 16 && (h[2] >> 4) < 14 {
        h[2] += 0x10; // a higher bitrate: a longer frame
        info = mp3_frame(&h, 0).ok_or(UNSUPPORTED)?;
    }
    if info.len < info.xing_at + 16 {
        return Err(UNSUPPORTED.into());
    }
    let mut out = vec![0u8; info.len];
    out[..4].copy_from_slice(&h);
    let x = info.xing_at;
    out[x..x + 4].copy_from_slice(b"Xing");
    out[x + 4..x + 8].copy_from_slice(&3u32.to_be_bytes()); // frames and bytes follow
    out[x + 8..x + 12].copy_from_slice(&frames.to_be_bytes());
    out[x + 12..x + 16].copy_from_slice(&((info.len + kept.len()) as u32).to_be_bytes());
    out.extend_from_slice(&kept);

    let samples = frames as u64 * info.samples as u64;
    Ok((out, samples * 1000 / rate as u64))
}

/// The samples of a WAV file between two times, under a new header.
pub fn cut_wav(d: &[u8], start_ms: u64, end_ms: u64) -> Result<(Vec<u8>, u64), String> {
    if d.len() < 12 || &d[..4] != b"RIFF" || &d[8..12] != b"WAVE" {
        return Err(UNSUPPORTED.into());
    }
    let (mut fmt, mut data) = (None, None);
    let mut pos = 12;
    while pos + 8 <= d.len() {
        let size = u32::from_le_bytes(d[pos + 4..pos + 8].try_into().unwrap()) as usize;
        let body = pos + 8;
        let end = body.saturating_add(size).min(d.len());
        match &d[pos..pos + 4] {
            b"fmt " => fmt = Some(&d[body..end]),
            b"data" => data = Some(&d[body..end]),
            _ => {}
        }
        pos = body + size + (size & 1);
    }
    let (Some(fmt), Some(data)) = (fmt, data) else { return Err(UNSUPPORTED.into()) };
    if fmt.len() < 16 {
        return Err(UNSUPPORTED.into());
    }
    let byte_rate = u32::from_le_bytes(fmt[8..12].try_into().unwrap()) as u64;
    let align = u16::from_le_bytes(fmt[12..14].try_into().unwrap()).max(1) as u64;
    if byte_rate == 0 {
        return Err(UNSUPPORTED.into());
    }
    let at = |ms: u64| ((ms * byte_rate / 1000) / align * align).min(data.len() as u64) as usize;
    let (from, to) = (at(start_ms), at(end_ms));
    if to <= from {
        return Err("INVALID_RANGE: Nothing of the song lies between those two points".into());
    }
    let piece = &data[from..to];
    let mut out = Vec::with_capacity(piece.len() + fmt.len() + 28);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&((4 + 8 + fmt.len() + (fmt.len() & 1) + 8 + piece.len()) as u32).to_le_bytes());
    out.extend_from_slice(b"WAVEfmt ");
    out.extend_from_slice(&(fmt.len() as u32).to_le_bytes());
    out.extend_from_slice(fmt);
    if fmt.len() & 1 == 1 {
        out.push(0);
    }
    out.extend_from_slice(b"data");
    out.extend_from_slice(&(piece.len() as u32).to_le_bytes());
    out.extend_from_slice(piece);
    Ok((out, piece.len() as u64 * 1000 / byte_rate))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn el(id: &[u8], body: &[u8]) -> Vec<u8> {
        let mut v = id.to_vec();
        v.push(0x80 | body.len() as u8);
        v.extend_from_slice(body);
        v
    }

    #[test]
    fn matroska_says_how_long_it_is() {
        let info = [
            el(&[0x2A, 0xD7, 0xB1], &[0x0F, 0x42, 0x40]), // 1 000 000 ns
            el(&[0x44, 0x89], &215_000f64.to_be_bytes()),
        ]
        .concat();
        let segment = [el(&[0xEC], &[0, 0, 0]), el(&[0x15, 0x49, 0xA9, 0x66], &info)].concat();
        let mut file = el(&[0x1A, 0x45, 0xDF, 0xA3], &[0x42, 0x86, 0x81, 0x01]);
        file.extend_from_slice(&[0x18, 0x53, 0x80, 0x67, 0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]); // size unknown
        file.extend_from_slice(&segment);
        assert_eq!(matroska_duration_in(&file), Some(215_000));
        assert_eq!(matroska_duration_in(b"ID3\x04\x00\x00\x00\x00\x00\x00"), None);
    }

    /// 128 kbps, 44.1 kHz, stereo, MPEG 1 layer III: 417 bytes, 26.12 ms.
    fn frames(n: usize) -> Vec<u8> {
        let mut v = Vec::new();
        for i in 0..n {
            let mut f = vec![0u8; 417];
            f[..4].copy_from_slice(&[0xFF, 0xFB, 0x90, 0x00]);
            f[100] = i as u8;
            v.extend_from_slice(&f);
        }
        v
    }

    #[test]
    fn an_mp3_is_cut_on_its_frames() {
        let mut file = b"ID3\x04\x00\x00\x00\x00\x00\x05hello".to_vec();
        file.extend_from_slice(&frames(200)); // 5.2 s
        let (out, ms) = cut_mp3(&file, 1000, 3000).unwrap();
        // 1000 ms is in frame 38 (starts at 992.6), so the first kept is 39.
        let first = mp3_frame(&out, 0).unwrap();
        assert_eq!(&out[first.xing_at..first.xing_at + 4], b"Xing");
        let kept = u32::from_be_bytes(out[first.xing_at + 8..first.xing_at + 12].try_into().unwrap());
        assert_eq!(out.len(), first.len + kept as usize * 417);
        assert_eq!(out[first.len + 100], 39);
        assert!((1950..=2050).contains(&ms), "{ms}");
        assert!(cut_mp3(&file, 9000, 9500).is_err());
        assert_eq!(cut_mp3(b"\x1A\x45\xDF\xA3 not an mp3 at all, whatever it is called", 0, 1000).unwrap_err(), UNSUPPORTED);
    }

    /// With a real song: MPTREE_TEST_MP3=path cargo test real_mp3 -- --nocapture
    #[test]
    fn a_real_mp3_keeps_its_length() {
        let Ok(path) = std::env::var("MPTREE_TEST_MP3") else { return };
        let bytes = std::fs::read(&path).unwrap();
        let (out, ms) = cut_mp3(&bytes, 30_000, 60_000).unwrap();
        assert!((29_900..=30_100).contains(&ms), "{ms}");
        let dest = std::env::temp_dir().join("mptree-cut-test.mp3");
        std::fs::write(&dest, &out).unwrap();
        // What a player would make of it: lofty reads the header frame.
        use lofty::file::AudioFile;
        let read = lofty::read_from_path(&dest).unwrap().properties().duration().as_millis() as u64;
        println!("cut {} bytes, says {} ms, reads as {} ms", out.len(), ms, read);
        assert!((29_500..=30_500).contains(&read), "{read}");
        let _ = std::fs::remove_file(dest);
    }

    #[test]
    fn a_wav_is_cut_on_its_samples() {
        let mut fmt = Vec::new();
        fmt.extend_from_slice(&1u16.to_le_bytes()); // PCM
        fmt.extend_from_slice(&2u16.to_le_bytes()); // stereo
        fmt.extend_from_slice(&8000u32.to_le_bytes());
        fmt.extend_from_slice(&32000u32.to_le_bytes()); // bytes a second
        fmt.extend_from_slice(&4u16.to_le_bytes()); // bytes a sample pair
        fmt.extend_from_slice(&16u16.to_le_bytes());
        let data: Vec<u8> = (0..64000u32).map(|i| (i / 4) as u8).collect(); // 2 s
        let mut file = b"RIFF\x00\x00\x00\x00WAVEfmt ".to_vec();
        file.extend_from_slice(&16u32.to_le_bytes());
        file.extend_from_slice(&fmt);
        file.extend_from_slice(b"data");
        file.extend_from_slice(&(data.len() as u32).to_le_bytes());
        file.extend_from_slice(&data);
        let (out, ms) = cut_wav(&file, 500, 1500).unwrap();
        assert_eq!(ms, 1000);
        assert_eq!(out.len(), 44 + 32000);
        assert_eq!(&out[36..40], b"data");
        assert_eq!(out[44], (16000u32 / 4) as u8);
    }
}
