package com.caelan.mptree;

import android.content.Context;
import android.media.AudioFormat;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.net.Uri;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/**
 * A song file for AudioEngine, decoded with the phone's own decoders
 * (MediaExtractor finds the sound in the file, MediaCodec decodes it): MP3,
 * AAC and M4A, FLAC, Ogg, Opus, WAV, whatever the phone can play. Out come
 * stereo float frames at AudioEngine.RATE: one channel is doubled, more than
 * two are mixed down, and another rate is resampled.
 *
 * Used by the engine's decode thread only.
 */
final class CodecSource implements AudioEngine.Source {

    private final Context ctx;
    private final String path;
    /** A cut's end in µs, or -1. */
    private final long toUs;

    private MediaExtractor ex;
    private MediaCodec codec;
    private final MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
    private boolean inEos, outEos;
    private int inRate = AudioEngine.RATE, inCh = 2, enc = AudioFormat.ENCODING_PCM_16BIT;
    private long durUs = -1;
    /** Opus: what its decoder leaves out by itself after a seek (its seek
     *  pre-roll, 80 ms). The times on what comes out do not count it, so it
     *  is not dropped a second time. */
    private long preRollUs = 0;
    /** After a seek: what comes before this (in µs) is dropped, the decoder
     *  starts at the frame before. -1 when nothing is to be dropped. */
    private long dropUntilUs = -1;

    private final AudioEngine.Resampler rs = new AudioEngine.Resampler();
    private float[] stereo = new float[0];
    private float[] res = new float[0];
    private final int[] resN = new int[1];
    // Decoded and resampled, not taken yet.
    private float[] pend = new float[0];
    private int pendOff, pendLen;

    CodecSource(Context ctx, AudioEngine.Item item) {
        this.ctx = ctx != null ? ctx.getApplicationContext() : null;
        this.path = item.path;
        this.toUs = item.toMs > 0 ? item.toMs * 1000 : -1;
    }

    @Override public void open(long fromUs) throws Exception {
        ex = new MediaExtractor();
        if (path.startsWith("content://")) ex.setDataSource(ctx, Uri.parse(path), null);
        else ex.setDataSource(path);
        MediaFormat fmt = null;
        String mime = null;
        for (int i = 0; i < ex.getTrackCount(); i++) {
            MediaFormat f = ex.getTrackFormat(i);
            String m = f.getString(MediaFormat.KEY_MIME);
            if (m != null && m.startsWith("audio/")) { ex.selectTrack(i); fmt = f; mime = m; break; }
        }
        if (fmt == null) throw new IOException("no sound in this file");
        if (fmt.containsKey(MediaFormat.KEY_SAMPLE_RATE)) inRate = fmt.getInteger(MediaFormat.KEY_SAMPLE_RATE);
        if (fmt.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) inCh = Math.max(1, fmt.getInteger(MediaFormat.KEY_CHANNEL_COUNT));
        if (fmt.containsKey(MediaFormat.KEY_DURATION)) durUs = fmt.getLong(MediaFormat.KEY_DURATION);
        if (fmt.containsKey(MediaFormat.KEY_PCM_ENCODING)) enc = fmt.getInteger(MediaFormat.KEY_PCM_ENCODING);
        if ("audio/opus".equals(mime)) preRollUs = 80_000;
        codec = MediaCodec.createDecoderByType(mime);
        codec.configure(fmt, null, null, 0);
        codec.start();
        if (fromUs > 0) seekExtractor(fromUs);
    }

    @Override public long durationUs() { return durUs; }

    @Override public int read(float[] out, int maxFrames) throws Exception {
        if (pendLen > 0) return drain(out, maxFrames);
        if (outEos) return -1;
        feed();
        int oi = codec.dequeueOutputBuffer(info, 10_000);
        if (oi == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
            // The decoder's own word on what comes out (HE-AAC doubles the
            // rate the file states, for one).
            MediaFormat of = codec.getOutputFormat();
            if (of.containsKey(MediaFormat.KEY_SAMPLE_RATE)) inRate = of.getInteger(MediaFormat.KEY_SAMPLE_RATE);
            if (of.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) inCh = Math.max(1, of.getInteger(MediaFormat.KEY_CHANNEL_COUNT));
            enc = of.containsKey(MediaFormat.KEY_PCM_ENCODING) ? of.getInteger(MediaFormat.KEY_PCM_ENCODING) : AudioFormat.ENCODING_PCM_16BIT;
            rs.reset();
            return 0;
        }
        if (oi < 0) return 0;
        boolean last = (info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0;
        int frames = 0;
        if (info.size > 0) {
            ByteBuffer ob = codec.getOutputBuffer(oi);
            if (ob != null) {
                ob.position(info.offset);
                ob.limit(info.offset + info.size);
                frames = toStereo(ob.slice().order(ByteOrder.nativeOrder()));
            }
        }
        long pts = info.presentationTimeUs;
        codec.releaseOutputBuffer(oi, false);

        int from = 0, to = frames;
        if (dropUntilUs >= 0 && frames > 0) {
            long skip = (dropUntilUs - pts) * inRate / 1_000_000L;
            if (skip >= frames) from = frames;
            else { if (skip > 0) from = (int) skip; dropUntilUs = -1; }
        }
        if (toUs > 0 && frames > 0) {
            long keep = (toUs - pts) * inRate / 1_000_000L;
            if (keep <= from) { to = from; last = true; }
            else if (keep < frames) { to = (int) keep; last = true; }
        }
        if (last) outEos = true;
        int n = to - from;
        if (n > 0) {
            if (from > 0) System.arraycopy(stereo, from * 2, stereo, 0, n * 2);
            res = rs.process(stereo, n, inRate, AudioEngine.RATE, res, resN);
            pend = res;
            pendOff = 0;
            pendLen = resN[0];
        }
        if (pendLen > 0) return drain(out, maxFrames);
        return outEos ? -1 : 0;
    }

    @Override public void seek(long us) throws Exception {
        codec.flush();
        seekExtractor(us);
        inEos = false;
        outEos = false;
        pendLen = 0;
        rs.reset();
    }

    @Override public void close() {
        try { if (codec != null) { codec.stop(); } } catch (Exception ignored) {}
        try { if (codec != null) { codec.release(); } } catch (Exception ignored) {}
        try { if (ex != null) ex.release(); } catch (Exception ignored) {}
        codec = null;
        ex = null;
    }

    // ──────────────────────────────────────────────────────────────────────

    /** A tenth of a second early, and what comes before `us` dropped: Opus
     *  needs that much decoded before it sounds right again, and MP3 a frame
     *  (seen on the emulator, 21 Nov: the first moments after a seek were off). */
    private void seekExtractor(long us) {
        ex.seekTo(Math.max(0, us - 100_000), MediaExtractor.SEEK_TO_PREVIOUS_SYNC);
        dropUntilUs = Math.max(0, us - preRollUs);
    }

    /** One piece of the file into the decoder. */
    private void feed() {
        if (inEos) return;
        int ii = codec.dequeueInputBuffer(5_000);
        if (ii < 0) return;
        ByteBuffer ib = codec.getInputBuffer(ii);
        int size = ib == null ? -1 : ex.readSampleData(ib, 0);
        long t = ex.getSampleTime();
        // A cut needs nothing much past its end.
        if (size < 0 || (toUs > 0 && t > toUs + 500_000)) {
            codec.queueInputBuffer(ii, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
            inEos = true;
        } else {
            codec.queueInputBuffer(ii, 0, size, Math.max(0, t), 0);
            ex.advance();
        }
    }

    private int drain(float[] out, int maxFrames) {
        int n = Math.min(pendLen, maxFrames);
        System.arraycopy(pend, pendOff * 2, out, 0, n * 2);
        pendOff += n;
        pendLen -= n;
        return n;
    }

    /** The decoder's samples, as stereo floats into `stereo`. Returns frames. */
    private int toStereo(ByteBuffer b) {
        int bytes = enc == AudioFormat.ENCODING_PCM_FLOAT || enc == AudioFormat.ENCODING_PCM_32BIT ? 4
                : enc == AudioFormat.ENCODING_PCM_24BIT_PACKED ? 3
                : enc == AudioFormat.ENCODING_PCM_8BIT ? 1 : 2;
        int frames = b.remaining() / (bytes * inCh);
        if (stereo.length < frames * 2) stereo = new float[frames * 2];
        for (int f = 0; f < frames; f++) {
            float l = sample(b), r;
            if (inCh == 1) {
                r = l;
            } else {
                r = sample(b);
                if (inCh >= 3) {
                    // Front left and right with the centre; the rest is left out.
                    float c = sample(b);
                    l = (l + 0.707f * c) / 1.707f;
                    r = (r + 0.707f * c) / 1.707f;
                    for (int k = 3; k < inCh; k++) sample(b);
                }
            }
            stereo[2 * f] = l;
            stereo[2 * f + 1] = r;
        }
        return frames;
    }

    private float sample(ByteBuffer b) {
        switch (enc) {
            case AudioFormat.ENCODING_PCM_FLOAT: return b.getFloat();
            case AudioFormat.ENCODING_PCM_32BIT: return b.getInt() / 2147483648f;
            case AudioFormat.ENCODING_PCM_24BIT_PACKED: {
                int v = (b.get() & 0xff) | ((b.get() & 0xff) << 8) | (b.get() << 16);
                return v / 8388608f;
            }
            case AudioFormat.ENCODING_PCM_8BIT: return ((b.get() & 0xff) - 128) / 128f;
            default: return b.getShort() / 32768f;
        }
    }
}
