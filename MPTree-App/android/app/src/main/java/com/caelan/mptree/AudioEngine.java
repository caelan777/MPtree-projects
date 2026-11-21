package com.caelan.mptree;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executor;

/**
 * MPTree's own player (since test build 136, 21 Nov 2026).
 *
 * Every song goes through ONE sound stream (a Sink: an AudioTrack on a phone),
 * and MPTree mixes the two songs of a crossfade itself. Before this, each song
 * had a MediaPlayer of its own, and a crossfade meant a second player and a
 * second stream starting while the first one played. Phones set up a new
 * stream (and their own sound effects for it) while the music runs, and that
 * was the short pause heard a few seconds before every fade, through three
 * test builds of trying to work around it. With one stream there is nothing
 * to set up halfway through a song.
 *
 * Each song is decoded seconds ahead into a buffer of its own (Ring), on a
 * thread of its own, so a slow phone or a slow card cannot starve the sound.
 * The song after this one is decoded as soon as this one starts: next is
 * heard at once, and a crossfade or a gapless change is a matter of reading
 * from the other buffer. The end of a song is where its decoder ends, so a
 * song can no longer be "stuck" at its end: seeking to the last second, or
 * past the end, simply ends it.
 *
 * Threads: the owner (MusicPlayerService, on the main thread) calls the public
 * methods. A decode thread keeps the buffers filled; an audio thread mixes and
 * writes to the sink. All shared state is guarded by `lock`. The Listener is
 * called through `callbacks` (the main thread on a phone).
 *
 * Pure Java on purpose: the decoding (CodecSource, MediaCodec) and the sound
 * output (TrackSink, AudioTrack) are behind Source and Sink, so all of this is
 * tested on a computer (AudioEngineTest), with songs that are made up.
 */
final class AudioEngine {

    /** Frames a second; the sink plays at this rate and songs are resampled to it. */
    static final int RATE = 44100;
    /** Frames mixed and written at a time: 23 ms, so a change is heard within that. */
    static final int CHUNK = 1024;
    /** How far ahead each song is decoded. More than the longest fade (8 s) at 1.5x. */
    static final int RING_FRAMES = 12 * RATE;
    /** Decoded this much, a song can be started or faded into. */
    static final int READY_FRAMES = RATE / 4;
    /** A song started by hand comes up over this many frames: no click. Not
     *  final so the tests can look at the frames as they are. */
    static int rampFrames = RATE / 100;
    /** Next pressed during a fade: the fade is finished over this many frames. */
    static final int RUSH_FRAMES = RATE / 5;
    /** The decoder is called once at least this much room is free. */
    private static final int DECODE_MIN = 2048;

    // ── what is played ─────────────────────────────────────────────────────

    static final class Item {
        final String path, title, artist;
        /** A cut: where it starts and ends in the file, in ms. 0 is the file's own start and end. */
        final long fromMs, toMs;
        /** The owner's own (MusicPlayerService puts its Track here). */
        final Object tag;

        Item(String path, String title, String artist, long fromMs, long toMs, Object tag) {
            this.path = path; this.title = title; this.artist = artist;
            this.fromMs = Math.max(0, fromMs); this.toMs = toMs > this.fromMs ? toMs : 0; this.tag = tag;
        }

        boolean isCut() { return fromMs > 0 || toMs > 0; }

        boolean sameAs(Item o) {
            return o != null && path.equals(o.path) && fromMs == o.fromMs && toMs == o.toMs;
        }
    }

    /** One file, decoded to stereo float frames at RATE. Used by the decode thread only. */
    interface Source {
        /** Opens the file, ready to read from `fromUs`. */
        void open(long fromUs) throws Exception;
        /** Decodes some more: at most `maxFrames` stereo frames into `out`.
         *  Returns how many, 0 when it has to be called again, -1 at the end. */
        int read(float[] out, int maxFrames) throws Exception;
        /** The file's length in µs, or -1 when it does not say. Known after open. */
        long durationUs();
        void seek(long us) throws Exception;
        void close();
    }

    interface SourceFactory { Source create(Item item); }

    /** Where the mixed sound goes. write() is called on the audio thread only. */
    interface Sink {
        void open() throws Exception;
        /** Blocks until all frames are taken. Returns frames taken, or < 0 when the
         *  sink broke (the sound server restarted, say): it is opened again. */
        int write(float[] stereo, int frames);
        void play();
        void pause();
        void flush();
        /** Frames played since it was opened. */
        long playedFrames();
        void setSpeed(float speed);
        void setVolume(float volume);
        void release();
    }

    interface Listener {
        /** `item` started to be heard: after play(), or by itself after the one before it. */
        void onStart(Item item, boolean byItself);
        /** `item` ended and nothing came after it. */
        void onEnd(Item item);
        /** `item` could not be played; when it was the song on, the engine went on if it could. */
        void onError(Item item, String why);
        /** What comes after `item`? Answer with setNext (null: nothing). */
        void needNext(Item item);
    }

    // ── a song being decoded and played ────────────────────────────────────

    private static final class Deck {
        final Item item;
        final Source src;
        final Ring ring;
        boolean opened, eos, failed, dead, started, announced;
        String error;
        /** The file's position (frames) of the first frame after a seek or the start. */
        long baseFrame;
        /** Frames taken by the mixer since baseFrame. */
        long consumed;
        /** Asked for the decode thread, in µs; -1 when not. */
        long seekUs = -1;
        /** Bumped by every seek: frames decoded before it are thrown away. */
        int gen;
        /** From the file, and for a cut its own end; -1 when not known. */
        long endFrame = -1;
        /** Frames left of the ramp up after a hand-made change. */
        int ramp;

        Deck(Item item, Source src, Ring ring) {
            this.item = item; this.src = src; this.ring = ring;
            this.baseFrame = msToFrames(item.fromMs);
            if (item.toMs > 0) endFrame = msToFrames(item.toMs);
        }

        long position() { return baseFrame + consumed; }

        boolean ready() { return failed || eos || ring.size() >= READY_FRAMES; }

        /** Frames left: exactly at the decoder's end, else from the file's length. */
        long remaining() {
            if (eos) return ring.size();
            if (endFrame > 0) return Math.max(0, endFrame - position());
            return Long.MAX_VALUE;
        }
    }

    // ── state, all guarded by lock ─────────────────────────────────────────

    private final Object lock = new Object();
    private final SourceFactory factory;
    private final Sink sink;
    private final Listener listener;
    private final Executor callbacks;

    private Deck cur;
    private Deck next;
    private final List<Deck> toClose = new ArrayList<>();
    private final ArrayDeque<Ring> rings = new ArrayDeque<>();

    private boolean alive = true;
    private boolean playing;
    private boolean flushNeeded;
    private boolean sinkOpen;
    /** The sink was told to play (and not paused since). */
    private boolean sinkPlaying;
    private int crossfadeMs;
    private float speed = 1f;
    private float volume = 1f;
    /** Frames written to the sink since its last flush, and its clock then. */
    private long written, sinkBase;
    /** needNext was asked and not answered yet. */
    private boolean nextAsked;
    /** A song ended with nothing after it: what is shown then. */
    private Item endedItem;

    // The fade in progress, from `cur` into `next`.
    private boolean fading;
    private long fadePos, fadeAnchorPos, fadeLen;
    private float fadeAnchorT;
    private boolean fadeExact;

    private final Thread audioThread, decodeThread;

    AudioEngine(SourceFactory factory, Sink sink, Listener listener, Executor callbacks) {
        this.factory = factory; this.sink = sink; this.listener = listener; this.callbacks = callbacks;
        for (int i = 0; i < 3; i++) rings.add(new Ring(RING_FRAMES));
        audioThread = new Thread(this::audioLoop, "MPTree audio");
        decodeThread = new Thread(this::decodeLoop, "MPTree decode");
        audioThread.setPriority(Thread.MAX_PRIORITY);
        audioThread.start();
        decodeThread.start();
    }

    static long msToFrames(long ms) { return ms * RATE / 1000; }
    static long framesToMs(long frames) { return frames * 1000 / RATE; }

    // ── the owner's controls ───────────────────────────────────────────────

    /** Plays `item` from `startMs` (a cut: from its own start when 0). At once
     *  when it is the song decoded ahead; otherwise as soon as its first part
     *  is decoded. `playNow` false loads it and waits (paused). */
    void play(Item item, long startMs, boolean playNow) {
        synchronized (lock) {
            endedItem = null;
            long from = Math.max(item.fromMs, startMs);
            // Next by hand while that song is already fading in: it stays where
            // it is and the old one goes out over a fifth of a second.
            if (fading && next != null && next.item.sameAs(item) && startMs <= item.fromMs) {
                rushFade();
                next.announced = true;
                post(() -> listener.onStart(item, false));
                playing = playNow || playing;
                lock.notifyAll();
                return;
            }
            Deck d;
            if (next != null && next.item.sameAs(item) && !next.failed && next.consumed == 0
                    && next.baseFrame == msToFrames(from)) {
                d = next;                 // decoded already: heard at once
                next = null;
            } else {
                d = newDeck(item);
                if (from > item.fromMs) { d.baseFrame = msToFrames(from); d.seekUs = from * 1000; }
            }
            if (cur != null) drop(cur);
            if (next != null) { drop(next); next = null; }
            cur = d;
            cur.ramp = rampFrames;
            cancelFade();
            flushNeeded = true;
            // What was waiting in the sink is not heard any more: the position is the new one at once.
            written = 0;
            if (sinkOpen) sinkBase = sink.playedFrames();
            playing = playNow;
            askNext();
            if (!playing) flushSinkNow();
            lock.notifyAll();
        }
    }

    /** The song after the one on (asked for with needNext). null: none. */
    void setNext(Item item) {
        synchronized (lock) {
            nextAsked = false;
            if (fading) { lock.notifyAll(); return; }   // asked again when the fade is done
            if (item == null) {
                if (next != null) { drop(next); next = null; }
            } else if (next == null || !next.item.sameAs(item) || next.failed) {
                if (next != null) drop(next);
                next = newDeck(item);
            }
            lock.notifyAll();
        }
    }

    /** The queue or the play mode changed: ask again what comes next. */
    void refreshNext() {
        synchronized (lock) { askNext(); }
    }

    void pause() {
        synchronized (lock) {
            if (!playing) return;
            playing = false;
            // At once, here: the audio thread may be waiting inside a write.
            sink.pause();
            sinkPlaying = false;
            lock.notifyAll();
        }
    }

    void resume() {
        synchronized (lock) {
            if (playing || cur == null) return;
            playing = true;
            // A write may be waiting in the paused sink: it has to be let go
            // here, the audio thread cannot. Unless a seek emptied it: then the
            // audio thread starts it again with the new sound.
            if (sinkOpen && !flushNeeded) { sink.play(); sinkPlaying = true; }
            lock.notifyAll();
        }
    }

    /** To `ms` in the file. Past the end of the song is its end: the next one comes. */
    void seekTo(long ms) {
        synchronized (lock) {
            Deck d = cur;
            if (d == null) return;
            long target = msToFrames(Math.max(d.item.fromMs, ms));
            if (d.endFrame > 0) target = Math.min(target, d.endFrame);
            long delta = target - d.position();
            if (d.opened && !d.failed && delta >= 0 && delta <= d.ring.size()) {
                // Inside what is decoded already: no decoder seek at all.
                d.ring.skip((int) delta);
                d.consumed += delta;
            } else {
                d.ring.clear();
                d.gen++;
                d.seekUs = framesToMs(target) * 1000;
                d.baseFrame = target;
                d.consumed = 0;
                d.eos = false;
            }
            if (fading) {
                cancelFade();
                // The song that was coming in starts from its start again.
                if (next != null && next.consumed > 0) restart(next);
            }
            flushNeeded = true;
            written = 0;
            if (sinkOpen) sinkBase = sink.playedFrames();
            if (!playing) flushSinkNow();
            lock.notifyAll();
        }
    }

    void setCrossfadeMs(int ms) { synchronized (lock) { crossfadeMs = Math.max(0, ms); } }

    void setSpeed(float s) {
        synchronized (lock) { speed = s > 0 ? s : 1f; }
        sink.setSpeed(s > 0 ? s : 1f);
    }

    void setVolume(float v) {
        synchronized (lock) { volume = Math.max(0f, Math.min(1f, v)); }
    }

    boolean isPlaying() { synchronized (lock) { return playing && cur != null; } }

    /** A song is loaded (playing or paused). */
    boolean hasSong() { synchronized (lock) { return cur != null; } }

    /** Its first part is not decoded yet. */
    boolean isLoading() { synchronized (lock) { return cur != null && !cur.ready(); } }

    Item current() { synchronized (lock) { return cur != null ? cur.item : endedItem; } }

    /** Where the song is, as heard: what the mixer took, less what still waits in the sink. */
    long positionMs() {
        synchronized (lock) {
            if (cur == null) return endedItem != null && endedItem.toMs > 0 ? endedItem.toMs : 0;
            long pending = Math.max(0, written - (sink.playedFrames() - sinkBase));
            long start = msToFrames(cur.item.fromMs);
            return framesToMs(Math.max(start, cur.position() - pending));
        }
    }

    long durationMs() {
        synchronized (lock) {
            if (cur == null || cur.endFrame <= 0) return 0;
            return framesToMs(cur.endFrame);
        }
    }

    void release() {
        synchronized (lock) {
            alive = false;
            lock.notifyAll();
        }
        try { audioThread.join(500); } catch (InterruptedException ignored) {}
        try { decodeThread.join(500); } catch (InterruptedException ignored) {}
        synchronized (lock) {
            if (cur != null) drop(cur);
            if (next != null) drop(next);
            cur = next = null;
        }
        for (Deck d : takeToClose()) d.src.close();
        sink.release();
    }

    // ── inside, under lock ─────────────────────────────────────────────────

    private Deck newDeck(Item item) {
        Ring r = rings.isEmpty() ? new Ring(RING_FRAMES) : rings.poll();
        r.clear();
        return new Deck(item, factory.create(item), r);
    }

    /** Off the stage: the decode thread closes it, and its ring is used again. */
    private void drop(Deck d) {
        if (d.dead) return;
        d.dead = true;
        toClose.add(d);
        lock.notifyAll();
    }

    private void restart(Deck d) {
        d.ring.clear();
        d.gen++;
        d.seekUs = d.item.fromMs * 1000;
        d.baseFrame = msToFrames(d.item.fromMs);
        d.consumed = 0;
        d.eos = false;
    }

    private void askNext() {
        if (cur == null) return;
        nextAsked = true;
        final Item it = cur.item;
        post(() -> listener.needNext(it));
    }

    private void post(Runnable r) {
        try { callbacks.execute(r); } catch (Exception ignored) {}
    }

    /** With the sink paused, emptied at once: a write waiting in it returns. */
    private void flushSinkNow() {
        if (!sinkOpen) return;
        sink.pause();
        sink.flush();
        sinkPlaying = false;
    }

    private void cancelFade() {
        fading = false;
        fadePos = fadeAnchorPos = fadeLen = 0;
        fadeAnchorT = 0f;
    }

    /** Where the fade is, 0 to 1, at fadePos. */
    private float fadeT() {
        if (fadeLen <= 0) return 1f;
        float t = fadeAnchorT + (1f - fadeAnchorT) * (fadePos - fadeAnchorPos) / (float) fadeLen;
        return t < 0f ? 0f : (t > 1f ? 1f : t);
    }

    private void rushFade() {
        fadeAnchorT = fadeT();
        fadeAnchorPos = fadePos;
        fadeLen = Math.min(RUSH_FRAMES, Math.max(1, cur != null ? cur.remaining() : RUSH_FRAMES));
        fadeExact = true;
    }

    private void maybeStartFade() {
        if (fading || crossfadeMs <= 0 || cur == null || next == null) return;
        if (cur.item.isCut() || next.item.isCut() || next.failed || cur.failed) return;
        if (!next.ready()) return;
        long len = (long) (msToFrames(crossfadeMs) * speed);
        long rem = cur.remaining();
        if (rem > len || rem <= 0) return;
        fading = true;
        fadePos = fadeAnchorPos = 0;
        fadeAnchorT = 0f;
        fadeLen = Math.max(1, rem);
        fadeExact = cur.eos;
    }

    /** Frames until the fade into the next song has to begin; 0 when no fade is due. */
    private long untilFade(Deck c) {
        if (crossfadeMs <= 0 || next == null || c.item.isCut() || next.item.isCut()) return 0;
        long len = (long) (msToFrames(crossfadeMs) * speed);
        long rem = c.remaining();
        return rem == Long.MAX_VALUE || rem <= len ? 0 : rem - len;
    }

    /** The song on is used up: the next one goes on without a gap, or it ends. */
    private void finishCurrent() {
        Deck old = cur;
        cancelFade();
        if (next != null && !next.failed) {
            cur = next;
            next = null;
            drop(old);
            if (!cur.announced) {
                cur.announced = true;
                final Item it = cur.item;
                post(() -> listener.onStart(it, true));
            }
            askNext();
        } else if (next != null) {
            // The next one could not be opened: reported, and asked again (the
            // owner then names the one after it), while this one waits at its end.
            final Item bad = next.item;
            final String why = next.error;
            drop(next);
            next = null;
            post(() -> listener.onError(bad, why));
            nextAsked = true;
            final Item it = old.item;
            post(() -> listener.needNext(it));
            endOrWait(old);
        } else {
            endOrWait(old);
        }
    }

    /** Nothing after `old`: unless the owner is still answering what comes next. */
    private void endOrWait(Deck old) {
        if (nextAsked) { return; }          // the mixer looks again when setNext comes
        drop(old);
        cur = null;
        playing = false;
        endedItem = old.item;
        final Item it = old.item;
        post(() -> listener.onEnd(it));
    }

    // ── the audio thread ───────────────────────────────────────────────────

    private void audioLoop() {
        final float[] mix = new float[CHUNK * 2];
        final float[] a = new float[CHUNK * 2];
        final float[] b = new float[CHUNK * 2];
        while (true) {
            int frames;
            boolean flush;
            synchronized (lock) {
                while (alive && !(playing && cur != null && (cur.ready() || cur.dead))) {
                    if (!playing && sinkPlaying) { sink.pause(); sinkPlaying = false; }
                    try { lock.wait(playing ? 20 : 0); } catch (InterruptedException e) { return; }
                }
                if (!alive) break;
                if (!sinkOpen) {
                    try { sink.open(); sinkOpen = true; sinkBase = sink.playedFrames(); written = 0; }
                    catch (Exception e) {
                        try { lock.wait(500); } catch (InterruptedException ie) { return; }
                        continue;
                    }
                }
                flush = flushNeeded;
                flushNeeded = false;
                if (flush) {
                    sink.pause();
                    sink.flush();
                    sinkPlaying = false;
                    sinkBase = sink.playedFrames();
                    written = 0;
                }
                frames = mixChunk(mix, a, b);
                if (frames > 0 && !sinkPlaying) { sink.setVolume(volume); sink.play(); sinkPlaying = true; }
                if (frames == 0) {
                    // Waiting for the decoder (or for what comes next): look again shortly.
                    try { lock.wait(10); } catch (InterruptedException e) { return; }
                    continue;
                }
            }
            int done = sink.write(mix, frames);
            synchronized (lock) {
                if (done < 0) {
                    // The sound server went away: a new stream, from here.
                    sink.release();
                    sinkOpen = false;
                    sinkPlaying = false;
                } else {
                    written += done;
                }
            }
        }
    }

    /** Mixes up to CHUNK frames into `out`. Under lock. */
    private int mixChunk(float[] out, float[] a, float[] b) {
        int n = 0;
        int guard = 0;
        while (n < CHUNK && cur != null && guard++ < 64) {
            Deck c = cur;
            if (c.dead) { cur = null; break; }
            if (c.failed) {
                final Item bad = c.item;
                final String why = c.error;
                post(() -> listener.onError(bad, why));
                // Skipped: the next one, as if this one had ended. Never
                // announced as started: it was not heard.
                c.eos = true;
                c.ring.clear();
                c.failed = false;
                c.announced = true;
                finishCurrent();
                continue;
            }
            if (!c.ready()) break;
            if (!c.announced) {
                c.announced = true;
                final Item it = c.item;
                post(() -> listener.onStart(it, false));
            }
            maybeStartFade();
            if (fading && !fadeExact && c.eos) {
                // The real end is known now: carry on from where the fade is to it.
                fadeAnchorT = fadeT();
                fadeAnchorPos = fadePos;
                fadeLen = Math.max(1, c.ring.size());
                fadeExact = true;
            }
            int avail = c.ring.size();
            if (avail == 0) {
                if (c.eos) {
                    if (next == null && nextAsked) break;     // the owner is still answering
                    if (next != null && !next.ready()) break; // still decoding its start
                    finishCurrent();
                    continue;
                }
                break;                                       // decoder behind: underrun
            }
            int take = Math.min(CHUNK - n, avail);
            if (!fading) {
                long until = untilFade(c);
                if (until > 0 && until < take) take = (int) until;
            }
            int got = c.ring.take(a, 0, take);
            int gotB = 0;
            Deck in = fading ? next : null;
            if (in != null) gotB = in.ring.take(b, 0, got);
            for (int i = 0; i < got; i++) {
                float ga = 1f, gb = 0f;
                if (in != null) {
                    float t = fadeT();
                    ga = (float) Math.cos(t * Math.PI / 2);
                    gb = (float) Math.sin(t * Math.PI / 2);
                    fadePos++;
                }
                if (c.ramp > 0) { ga *= 1f - c.ramp / (float) rampFrames; c.ramp--; }
                float l = a[2 * i] * ga, r = a[2 * i + 1] * ga;
                if (in != null && i < gotB) { l += b[2 * i] * gb; r += b[2 * i + 1] * gb; }
                out[2 * (n + i)] = l;
                out[2 * (n + i) + 1] = r;
            }
            c.consumed += got;
            if (in != null) in.consumed += gotB;
            n += got;
            if (in != null && fadeT() >= 1f) {
                // Faded all the way: the rest of the old song is not heard.
                c.ring.clear();
                c.eos = true;
                finishCurrent();
            }
        }
        // Over 1 is clipping: held at the edge.
        for (int i = 0; i < n * 2; i++) {
            float v = out[i] * volume;
            out[i] = v > 1f ? 1f : (v < -1f ? -1f : v);
        }
        return n;
    }

    // ── the decode thread ──────────────────────────────────────────────────

    private List<Deck> takeToClose() {
        synchronized (lock) {
            List<Deck> l = new ArrayList<>(toClose);
            toClose.clear();
            return l;
        }
    }

    /** The song on first, then the one after it. */
    private Deck needsWork() {
        Deck c = cur;
        if (c != null && !c.dead && !c.failed && (c.seekUs >= 0 || !c.opened || (!c.eos && c.ring.free() >= DECODE_MIN))) return c;
        Deck n = next;
        if (n != null && !n.dead && !n.failed && (n.seekUs >= 0 || !n.opened || (!n.eos && n.ring.free() >= DECODE_MIN))) return n;
        return null;
    }

    private void decodeLoop() {
        final float[] tmp = new float[8192 * 2];
        while (true) {
            Deck d;
            long seek;
            int gen, room;
            boolean open;
            List<Deck> closing;
            synchronized (lock) {
                while (alive && toClose.isEmpty() && needsWork() == null) {
                    try { lock.wait(); } catch (InterruptedException e) { return; }
                }
                if (!alive) break;
                closing = new ArrayList<>(toClose);
                toClose.clear();
                d = needsWork();
                if (d != null) {
                    seek = d.seekUs;
                    d.seekUs = -1;
                    gen = d.gen;
                    open = !d.opened;
                    room = Math.min(tmp.length / 2, d.ring.free());
                } else { seek = -1; gen = 0; open = false; room = 0; }
            }
            for (Deck x : closing) {
                try { x.src.close(); } catch (Exception ignored) {}
                synchronized (lock) { x.ring.clear(); rings.add(x.ring); }
            }
            if (d == null) continue;
            try {
                if (open) {
                    d.src.open(seek >= 0 ? seek : d.item.fromMs * 1000);
                    synchronized (lock) {
                        d.opened = true;
                        if (d.item.toMs <= 0) {
                            long us = d.src.durationUs();
                            if (us > 0) d.endFrame = us * RATE / 1_000_000L;
                        }
                    }
                    continue;
                }
                if (seek >= 0) { d.src.seek(seek); continue; }
                int got = d.src.read(tmp, room);
                synchronized (lock) {
                    if (d.dead || d.gen != gen) continue;          // a seek came meanwhile
                    if (got < 0) {
                        d.eos = true;
                    } else if (got > 0) {
                        int fit = Math.min(got, d.ring.free());
                        // A cut ends at its end marker, whatever the file does after it.
                        if (d.item.toMs > 0) {
                            long left = d.endFrame - (d.position() + d.ring.size());
                            if (left <= fit) { fit = (int) Math.max(0, left); d.eos = true; }
                        }
                        d.ring.put(tmp, fit);
                    }
                    lock.notifyAll();
                }
            } catch (Exception e) {
                synchronized (lock) {
                    if (!d.dead) { d.failed = true; d.error = String.valueOf(e.getMessage()); }
                    lock.notifyAll();
                }
            }
        }
        for (Deck x : takeToClose()) { try { x.src.close(); } catch (Exception ignored) {} }
    }

    // ── a song's buffer: stereo float frames, first in first out ───────────

    static final class Ring {
        private final float[] buf;
        private final int cap;
        private int head, size;

        Ring(int frames) { cap = frames; buf = new float[frames * 2]; }

        int size() { return size; }
        int free() { return cap - size; }
        void clear() { head = 0; size = 0; }

        void put(float[] src, int frames) {
            int tail = (head + size) % cap;
            for (int i = 0; i < frames; i++) {
                buf[2 * tail] = src[2 * i];
                buf[2 * tail + 1] = src[2 * i + 1];
                if (++tail == cap) tail = 0;
            }
            size += frames;
        }

        int take(float[] dst, int off, int frames) {
            int n = Math.min(frames, size);
            for (int i = 0; i < n; i++) {
                dst[2 * (off + i)] = buf[2 * head];
                dst[2 * (off + i) + 1] = buf[2 * head + 1];
                if (++head == cap) head = 0;
            }
            size -= n;
            return n;
        }

        void skip(int frames) {
            int n = Math.min(frames, size);
            head = (head + n) % cap;
            size -= n;
        }
    }

    // ── from a song's own rate to RATE ─────────────────────────────────────
    // Catmull-Rom between the frames around each point: smooth enough for
    // music, and cheap. Songs at RATE (most of them) pass straight through.

    static final class Resampler {
        private float[] in = new float[0];
        private int inLen;          // frames held
        private double pos = 1;     // where the next output frame is, in frames of `in`
        private boolean primed;

        void reset() { inLen = 0; pos = 1; primed = false; }

        /** Takes `frames` stereo frames at `inRate`; writes what it can at `outRate`
         *  into `out` (grown when needed, returned) and sets `outFrames[0]`. */
        float[] process(float[] src, int frames, int inRate, int outRate, float[] out, int[] outFrames) {
            if (inRate == outRate) {
                if (out.length < frames * 2) out = new float[frames * 2];
                System.arraycopy(src, 0, out, 0, frames * 2);
                outFrames[0] = frames;
                return out;
            }
            // Room for what is held and what comes; the first frame twice, as the one before it.
            int lead = primed ? 0 : 1;
            int need = (inLen + frames + lead) * 2;
            if (in.length < need) { float[] g = new float[need + 2048]; System.arraycopy(in, 0, g, 0, inLen * 2); in = g; }
            if (!primed && frames > 0) {
                in[2 * inLen] = src[0]; in[2 * inLen + 1] = src[1];
                inLen++;
                primed = true;
            }
            System.arraycopy(src, 0, in, inLen * 2, frames * 2);
            inLen += frames;
            double step = inRate / (double) outRate;
            int max = (int) ((inLen - pos) / step) + 2;
            if (out.length < max * 2) out = new float[max * 2];
            int n = 0;
            while (pos + 2 < inLen) {
                int i = (int) pos;
                float t = (float) (pos - i);
                for (int ch = 0; ch < 2; ch++) {
                    float x0 = in[2 * (i - 1) + ch], x1 = in[2 * i + ch], x2 = in[2 * (i + 1) + ch], x3 = in[2 * (i + 2) + ch];
                    out[2 * n + ch] = x1 + 0.5f * t * (x2 - x0 + t * (2f * x0 - 5f * x1 + 4f * x2 - x3 + t * (3f * (x1 - x2) + x3 - x0)));
                }
                n++;
                pos += step;
            }
            // Keep the frame before `pos` and all after it.
            int keepFrom = Math.max(0, (int) pos - 1);
            int keep = inLen - keepFrom;
            System.arraycopy(in, keepFrom * 2, in, 0, keep * 2);
            inLen = keep;
            pos -= keepFrom;
            outFrames[0] = n;
            return out;
        }
    }
}
