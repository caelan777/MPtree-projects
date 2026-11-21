package com.caelan.mptree;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;
import android.media.PlaybackParams;

/**
 * AudioEngine's one sound stream: an AudioTrack of stereo floats at
 * AudioEngine.RATE, in the service's own sound session so the equalizer works
 * on it, as it did on the MediaPlayers.
 */
final class TrackSink implements AudioEngine.Sink {

    private final int session;
    private AudioTrack track;
    private float speed = 1f, volume = 1f;
    // The track's clock counts on from here when it starts again from 0
    // (a flush, or 2^32 frames): playedFrames() only goes up.
    private long base, lastHead;

    /** `sessionId` the service's session; 0 or less: a session of its own. */
    TrackSink(int sessionId) { session = sessionId; }

    @Override public synchronized void open() throws Exception {
        int min = AudioTrack.getMinBufferSize(AudioEngine.RATE, AudioFormat.CHANNEL_OUT_STEREO, AudioFormat.ENCODING_PCM_FLOAT);
        // A fifth of a second, at least: room to ride out a busy moment.
        int size = Math.max(min * 2, AudioEngine.RATE / 5 * 8);
        AudioTrack.Builder b = new AudioTrack.Builder()
                .setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build())
                .setAudioFormat(new AudioFormat.Builder()
                        .setSampleRate(AudioEngine.RATE)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_STEREO)
                        .setEncoding(AudioFormat.ENCODING_PCM_FLOAT)
                        .build())
                .setBufferSizeInBytes(size)
                .setTransferMode(AudioTrack.MODE_STREAM);
        if (session > 0) b.setSessionId(session);
        AudioTrack t = b.build();
        if (t.getState() != AudioTrack.STATE_INITIALIZED) {
            t.release();
            android.util.Log.w("MPTree", "no sound output: AudioTrack would not start");
            throw new IllegalStateException("no sound output");
        }
        track = t;
        base = playedFramesLocked();
        lastHead = 0;
        applySpeed();
        try { track.setVolume(volume); } catch (Exception ignored) {}
    }

    /** The session the sound plays in, for the equalizer. */
    synchronized int sessionId() { return track != null ? track.getAudioSessionId() : session; }

    @Override public int write(float[] stereo, int frames) {
        AudioTrack t;
        synchronized (this) { t = track; }
        if (t == null) return -1;
        try {
            int r = t.write(stereo, 0, frames * 2, AudioTrack.WRITE_BLOCKING);
            return r < 0 ? r : r / 2;
        } catch (Exception e) {
            return -1;
        }
    }

    @Override public synchronized void play() {
        if (track == null) return;
        try { track.play(); } catch (Exception ignored) {}
    }

    @Override public synchronized void pause() {
        if (track == null) return;
        try { track.pause(); } catch (Exception ignored) {}
    }

    @Override public synchronized void flush() {
        if (track == null) return;
        // The track's clock starts again from 0 at a flush, at once on some
        // phones and a moment later on others: either way it counts on from
        // here. It used to go back by what had played (seen on the emulator,
        // 21 Nov), and a position after a seek or a next went with it.
        long before = playedFramesLocked();
        try { track.flush(); } catch (Exception ignored) {}
        long head = rawHead();
        base = before - head;
        lastHead = head;
    }

    @Override public synchronized long playedFrames() { return playedFramesLocked(); }

    private long rawHead() {
        try { return track.getPlaybackHeadPosition() & 0xffffffffL; } catch (Exception e) { return lastHead; }
    }

    private long playedFramesLocked() {
        if (track == null) return base + lastHead;
        long head = rawHead();
        // Lower than before: it started again from 0 (a flush that came late,
        // or 2^32 frames). It never goes back otherwise.
        if (head < lastHead) base += lastHead;
        lastHead = head;
        return base + head;
    }

    @Override public synchronized void setSpeed(float s) {
        speed = s > 0 ? s : 1f;
        applySpeed();
    }

    private void applySpeed() {
        if (track == null) return;
        try { track.setPlaybackParams(new PlaybackParams().setSpeed(speed).setPitch(1f)); } catch (Exception ignored) {}
    }

    @Override public synchronized void setVolume(float v) {
        volume = v;
        if (track != null) { try { track.setVolume(v); } catch (Exception ignored) {} }
    }

    @Override public synchronized void release() {
        if (track == null) return;
        base = playedFramesLocked();
        lastHead = 0;
        try { track.pause(); } catch (Exception ignored) {}
        try { track.flush(); } catch (Exception ignored) {}
        try { track.release(); } catch (Exception ignored) {}
        track = null;
    }
}
