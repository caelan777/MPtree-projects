package com.caelan.mptree;

import static org.junit.Assert.*;

import org.junit.After;
import org.junit.Test;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import java.util.function.Function;

/**
 * AudioEngine with songs that are made up and a sound output that only
 * remembers what it got. Each song says on its right channel which song it is
 * and on its left channel which of its frames it is, so the tests can see a
 * song start again, a gap, a frame twice, or a fade.
 *
 * Runs on a computer: javac with JUnit 4 (see tmp-edit/enginetest/run.sh),
 * or ./gradlew testReleaseUnitTest.
 */
public class AudioEngineTest {

    static final int R = AudioEngine.RATE;

    // ── a made-up song ──
    static final class Song implements AudioEngine.Source {
        final int id, frames;
        final boolean failOpen;
        int pos;
        Song(int id, int frames, boolean failOpen) { this.id = id; this.frames = frames; this.failOpen = failOpen; }
        @Override public void open(long fromUs) throws Exception {
            if (failOpen) throw new Exception("cannot open " + id);
            pos = (int) (fromUs * R / 1_000_000L);
        }
        @Override public int read(float[] out, int max) {
            if (pos >= frames) return -1;
            int n = Math.min(Math.min(max, 1152), frames - pos);
            for (int i = 0; i < n; i++) { out[2 * i] = (pos + i) / 1e7f; out[2 * i + 1] = id / 10f; }
            pos += n;
            return n;
        }
        @Override public long durationUs() { return frames * 1_000_000L / R; }
        @Override public void seek(long us) { pos = (int) (us * R / 1_000_000L); }
        @Override public void close() {}
    }

    // ── an output that remembers ──
    interface Hook { void at(long total); }
    static final class FakeSink implements AudioEngine.Sink {
        final List<float[]> chunks = Collections.synchronizedList(new ArrayList<>());
        volatile long total;
        volatile Hook hook;
        volatile long sleepEveryChunkUs = 0;
        @Override public void open() {}
        @Override public int write(float[] s, int frames) {
            float[] c = new float[frames * 2];
            System.arraycopy(s, 0, c, 0, frames * 2);
            chunks.add(c);
            total += frames;
            Hook h = hook;
            if (h != null) h.at(total);
            long us = sleepEveryChunkUs;
            if (us > 0) { try { TimeUnit.MICROSECONDS.sleep(us); } catch (InterruptedException ignored) {} }
            return frames;
        }
        @Override public void play() {}
        @Override public void pause() {}
        @Override public void flush() {}
        @Override public long playedFrames() { return total; }
        @Override public void setSpeed(float speed) {}
        @Override public void setVolume(float v) {}
        @Override public void release() {}
        float[] all() {
            synchronized (chunks) {
                int n = 0;
                for (float[] c : chunks) n += c.length;
                float[] a = new float[n];
                int at = 0;
                for (float[] c : chunks) { System.arraycopy(c, 0, a, at, c.length); at += c.length; }
                return a;
            }
        }
    }

    // ── the owner ──
    final List<String> events = Collections.synchronizedList(new ArrayList<>());
    final ExecutorService main = Executors.newSingleThreadExecutor();
    final Map<String, Song> songs = new HashMap<>();
    final FakeSink sink = new FakeSink();
    volatile Function<AudioEngine.Item, AudioEngine.Item> after = it -> null;
    AudioEngine engine;

    AudioEngine.Item item(int id, int frames) { return item(id, frames, false, 0, 0); }

    AudioEngine.Item item(int id, int frames, boolean bad, long fromMs, long toMs) {
        String path = "/song" + id;
        songs.put(path, new Song(id, frames, bad));
        return new AudioEngine.Item(path, "S" + id, "A", fromMs, toMs, null);
    }

    void start() { start(0, 300); }

    /** ramp: frames of the ramp up after a start by hand (0: frames as they are).
     *  sleepUs: a pause after every chunk, so the output runs at some 75x real time. */
    void start(int ramp, long sleepUs) {
        AudioEngine.rampFrames = ramp;
        sink.sleepEveryChunkUs = sleepUs;
        engine = new AudioEngine(
                it -> { Song s = songs.get(it.path); return new Song(s.id, s.frames, s.failOpen); },
                sink,
                new AudioEngine.Listener() {
                    @Override public void onStart(AudioEngine.Item it, boolean self) { events.add("start " + it.title + (self ? " self" : "")); }
                    @Override public void onEnd(AudioEngine.Item it) { events.add("end " + it.title); }
                    @Override public void onError(AudioEngine.Item it, String why) { events.add("error " + it.title); }
                    @Override public void needNext(AudioEngine.Item it) { engine.setNext(after.apply(it)); }
                },
                main);
    }

    @After public void tearDown() {
        if (engine != null) engine.release();
        main.shutdownNow();
        AudioEngine.rampFrames = AudioEngine.RATE / 100;
    }

    static void await(String what, BooleanSupplier ok, long ms) {
        long end = System.currentTimeMillis() + ms;
        while (!ok.getAsBoolean()) {
            if (System.currentTimeMillis() > end) fail("timed out waiting for: " + what);
            try { Thread.sleep(2); } catch (InterruptedException ignored) {}
        }
    }

    boolean ended() { synchronized (events) { for (String e : events) if (e.startsWith("end")) return true; } return false; }

    /** Frames of the output that belong to song `id` alone (right channel). */
    static int framesOf(float[] out, int id) {
        int n = 0;
        for (int i = 1; i < out.length; i += 2) if (Math.abs(out[i] - id / 10f) < 1e-6) n++;
        return n;
    }

    static int zeros(float[] out) {
        int n = 0;
        for (int i = 0; i < out.length; i += 2) if (out[i] == 0f && out[i + 1] == 0f) n++;
        return n;
    }

    // ── the tests ──

    @Test public void playsToTheEndAndSaysSo() {
        start();
        AudioEngine.Item a = item(1, R);
        engine.play(a, 0, true);
        await("end", this::ended, 5000);
        float[] out = sink.all();
        assertEquals(R, out.length / 2);
        assertEquals(R, framesOf(out, 1));
        // Every frame once and in order: the left channel counts up.
        for (int i = 1; i < R; i++) assertEquals(i / 1e7f, out[2 * i], 1e-9f + 0f * (out[2 * i - 2]));
        assertEquals(List.of("start S1", "end S1"), new ArrayList<>(events));
    }

    @Test public void goesIntoTheNextWithoutAGap() {
        start();
        AudioEngine.Item a = item(1, R), b = item(2, R / 2);
        after = it -> it.title.equals("S1") ? b : null;
        engine.play(a, 0, true);
        await("end", this::ended, 5000);
        float[] out = sink.all();
        assertEquals(R + R / 2, out.length / 2);
        assertEquals(R, framesOf(out, 1));
        assertEquals(R / 2, framesOf(out, 2));
        assertEquals("no silent frame anywhere", 0, zeros(out));
        assertEquals(List.of("start S1", "start S2 self", "end S2"), new ArrayList<>(events));
    }

    @Test public void crossfadesOverTheSetTime() {
        start();
        AudioEngine.Item a = item(1, R), b = item(2, R);
        after = it -> it.title.equals("S1") ? b : null;
        engine.setCrossfadeMs(300);
        engine.play(a, 0, true);
        await("end", this::ended, 5000);
        float[] out = sink.all();
        int fade = (int) AudioEngine.msToFrames(300);
        assertEquals(2 * R - fade, out.length / 2, 2);
        // Halfway through the fade both are there, each at about 0.71.
        int mid = R - fade / 2;
        float expected = (0.1f + 0.2f) * (float) Math.sqrt(0.5);
        assertEquals(expected, out[2 * mid + 1], 0.01f);
        assertTrue(events.contains("start S2 self"));
    }

    @Test public void nextDuringAFadeKeepsThatSongWhereItIs() {
        start();
        AudioEngine.Item a = item(1, R), b = item(2, R);
        after = it -> it.title.equals("S1") ? b : null;
        engine.setCrossfadeMs(600);
        int fade = (int) AudioEngine.msToFrames(600);
        final boolean[] pressed = {false};
        sink.hook = total -> {
            if (!pressed[0] && total >= R - fade / 2) { pressed[0] = true; engine.play(b, 0, true); }
        };
        engine.play(a, 0, true);
        await("end", this::ended, 5000);
        float[] out = sink.all();
        // Song 2 heard once: its left channel never goes back, and it ends at its last frame.
        float last = -1f;
        int alone = 0;
        for (int i = 0; i < out.length / 2; i++) {
            if (Math.abs(out[2 * i + 1] - 0.2f) < 1e-6) {
                assertTrue("song 2 went back at " + i, out[2 * i] > last);
                last = out[2 * i];
                alone++;
            }
        }
        assertEquals((R - 1) / 1e7f, last, 1e-7f);
        assertTrue("song 2 alone after the fade, not " + alone, alone >= R / 3);
        assertEquals("one start for song 2", 1, Collections.frequency(new ArrayList<>(events), "start S2"));
    }

    @Test public void seekingIntoTheLastSecondEndsTheSongAndGoesOn() {
        start();
        AudioEngine.Item a = item(1, 5 * R), b = item(2, R / 2);
        after = it -> it.title.equals("S1") ? b : null;
        engine.setCrossfadeMs(2000);
        final boolean[] done = {false};
        sink.hook = total -> { if (!done[0] && total >= R) { done[0] = true; engine.seekTo(4900); } };
        engine.play(a, 0, true);
        await("song 2 plays", () -> events.contains("start S2 self"), 5000);
        await("end", this::ended, 5000);
    }

    @Test public void seekingPastTheEndGoesToTheNext() {
        start();
        AudioEngine.Item a = item(1, 5 * R), b = item(2, R / 2);
        after = it -> it.title.equals("S1") ? b : null;
        final boolean[] done = {false};
        sink.hook = total -> { if (!done[0] && total >= R / 2) { done[0] = true; engine.seekTo(60_000); } };
        engine.play(a, 0, true);
        await("end", this::ended, 5000);
        assertTrue(events.contains("start S2 self"));
        assertTrue("song 1 did not play to its end", framesOf(sink.all(), 1) < 2 * R);
    }

    @Test public void pauseAndResumeLoseNothing() throws Exception {
        start();
        AudioEngine.Item a = item(1, R);
        final boolean[] done = {false};
        sink.hook = total -> { if (!done[0] && total >= R / 3) { done[0] = true; engine.pause(); } };
        engine.play(a, 0, true);
        await("paused", () -> done[0] && !engine.isPlaying(), 5000);
        long at = sink.total;
        Thread.sleep(80);
        assertEquals("nothing while paused", at, sink.total);
        engine.resume();
        await("end", this::ended, 5000);
        float[] out = sink.all();
        assertEquals(R, out.length / 2);
        for (int i = 1; i < R; i++) assertTrue("gap or repeat at " + i, out[2 * i] > out[2 * i - 2]);
    }

    @Test public void aSongThatCannotBeOpenedIsSkipped() {
        start();
        AudioEngine.Item a = item(1, R / 2), b = item(2, R, true, 0, 0), c = item(3, R / 2);
        after = it -> it.title.equals("S1") ? b : null;
        // After the error, the owner names the one after the bad one.
        final boolean[] badSeen = {false};
        AudioEngine.Listener[] none = new AudioEngine.Listener[0];
        after = it -> {
            if (events.contains("error S2")) return it.title.equals("S1") ? c : null;
            return it.title.equals("S1") ? b : null;
        };
        engine.play(a, 0, true);
        await("end", this::ended, 5000);
        assertTrue(events.contains("error S2"));
        assertTrue(events.contains("start S3 self"));
        assertEquals(R / 2, framesOf(sink.all(), 3));
    }

    @Test public void theFirstSongFailingGoesStraightOn() {
        start();
        AudioEngine.Item a = item(1, R, true, 0, 0), b = item(2, R / 2);
        after = it -> it.title.equals("S1") ? b : null;
        engine.play(a, 0, true);
        await("end", this::ended, 5000);
        assertTrue(events.contains("error S1"));
        assertFalse("a song that failed is never said to start", events.contains("start S1"));
        assertEquals(R / 2, framesOf(sink.all(), 2));
    }

    @Test public void repeatOnePlaysTheSongAgain() {
        start();
        AudioEngine.Item a = item(1, R / 2);
        final int[] rounds = {0};
        after = it -> rounds[0]++ < 1 ? a : null;
        engine.setCrossfadeMs(100);
        engine.play(a, 0, true);
        await("end", this::ended, 5000);
        float[] out = sink.all();
        int fade = (int) AudioEngine.msToFrames(100);
        assertEquals(R - fade, out.length / 2, 2);
    }

    @Test public void aCutPlaysItsPartOnlyAndIsNotFaded() {
        start();
        AudioEngine.Item cut = item(1, 2 * R, false, 200, 700), b = item(2, R / 4);
        after = it -> it.title.equals("S1") ? b : null;
        engine.setCrossfadeMs(300);
        engine.play(cut, 0, true);
        await("end", this::ended, 5000);
        float[] out = sink.all();
        assertEquals("the part from 0.2 s to 0.7 s", (int) AudioEngine.msToFrames(500), framesOf(out, 1), 2);
        assertEquals("no fade with a cut", R / 4, framesOf(out, 2));
        assertEquals("starts at its own start", AudioEngine.msToFrames(200) / 1e7f, out[0], 1e-6f);
    }

    @Test public void nextByHandIsHeardAtOnceWhenItWasDecodedAhead() {
        start();
        AudioEngine.Item a = item(1, 10 * R), b = item(2, R / 2);
        after = it -> it.title.equals("S1") ? b : null;
        final boolean[] pressed = {false};
        final long[] pressedAt = {0};
        sink.hook = total -> {
            if (!pressed[0] && total >= R) { pressed[0] = true; pressedAt[0] = total; engine.play(b, 0, true); }
        };
        engine.play(a, 0, true);
        await("end", this::ended, 5000);
        float[] out = sink.all();
        // Song 2 begins within two chunks of the press (one may be on its way already).
        int first = -1;
        for (int i = 0; i < out.length / 2; i++) if (Math.abs(out[2 * i + 1] - 0.2f) < 1e-6) { first = i; break; }
        assertTrue("song 2 came", first >= 0);
        assertTrue("song 2 at once, not after " + (first - pressedAt[0]), first - pressedAt[0] <= 2 * AudioEngine.CHUNK);
    }

    @Test public void survivesAnythingPressedInAnyOrder() throws Exception {
        start();
        List<AudioEngine.Item> list = new ArrayList<>();
        for (int i = 1; i <= 6; i++) list.add(item(i, R + i * 3000, i == 4, 0, 0));
        after = it -> {
            int at = -1;
            for (int i = 0; i < list.size(); i++) if (list.get(i).sameAs(it)) at = i;
            return at >= 0 && at + 1 < list.size() ? list.get(at + 1) : null;
        };
        Random rnd = new Random(42);
        engine.play(list.get(0), 0, true);
        for (int k = 0; k < 400; k++) {
            switch (rnd.nextInt(8)) {
                case 0: engine.play(list.get(rnd.nextInt(list.size())), 0, true); break;
                case 1: engine.seekTo(rnd.nextInt(1500)); break;
                case 2: engine.pause(); break;
                case 3: engine.resume(); break;
                case 4: engine.setCrossfadeMs(rnd.nextInt(3) * 400); break;
                case 5: engine.refreshNext(); break;
                case 6: engine.seekTo(rnd.nextInt(60_000)); break;
                default: engine.positionMs(); engine.durationMs(); break;
            }
            Thread.sleep(rnd.nextInt(4));
        }
        engine.resume();
        engine.play(list.get(list.size() - 1), 0, true);
        await("it still plays to the end after all that", this::ended, 10_000);
        for (float v : sink.all()) assertFalse("not a number in the sound", Float.isNaN(v));
    }

    @Test public void positionFollowsWhatIsPlayed() throws Exception {
        start();
        AudioEngine.Item a = item(1, 4 * R);
        final boolean[] done = {false};
        sink.hook = total -> { if (!done[0] && total >= 2 * R) { done[0] = true; engine.pause(); } };
        engine.play(a, 0, true);
        await("paused", () -> done[0] && !engine.isPlaying(), 5000);
        long ms = engine.positionMs();
        assertTrue("about 2 s in, not " + ms, ms >= 1990 && ms <= 2100);
        assertEquals(4000, engine.durationMs());
        engine.seekTo(3000);
        assertEquals(3000, engine.positionMs());
    }

    @Test public void aSongLongerThanTheBufferPlaysToTheEnd() {
        // The buffer holds 12 s; a song of 20 s needs the decoder woken again
        // and again as the buffer empties. Without that it went quiet at 12 s.
        start(0, 100);
        AudioEngine.Item a = item(1, 20 * R), b = item(2, 15 * R);
        after = it -> it.title.equals("S1") ? b : null;
        engine.play(a, 0, true);
        await("end", this::ended, 20_000);
        float[] out = sink.all();
        assertEquals(35 * R, out.length / 2);
        assertEquals(20 * R, framesOf(out, 1));
        assertEquals(15 * R, framesOf(out, 2));
    }

    @Test public void aStartByHandComesUpWithoutAClick() {
        start(AudioEngine.RATE / 100, 300);
        AudioEngine.Item a = item(1, R / 2);
        engine.play(a, 0, true);
        await("end", this::ended, 5000);
        float[] out = sink.all();
        assertEquals("from silence", 0f, out[1], 1e-6f);
        assertTrue("rising", out[2 * 100 + 1] < out[2 * 300 + 1]);
        assertEquals("full after 10 ms", 0.1f, out[2 * 500 + 1], 1e-6f);
    }

    @Test public void resamplerKeepsTheLengthAndTheShape() {
        AudioEngine.Resampler rs = new AudioEngine.Resampler();
        int inRate = 48000, frames = 48000;
        float[] src = new float[frames * 2];
        for (int i = 0; i < frames; i++) { float v = (float) Math.sin(2 * Math.PI * 440 * i / inRate); src[2 * i] = v; src[2 * i + 1] = v; }
        float[] out = new float[0];
        int[] n = new int[1];
        int total = 0;
        float maxErr = 0;
        for (int at = 0; at < frames; at += 1000) {
            float[] part = new float[2000];
            System.arraycopy(src, at * 2, part, 0, 2000);
            out = rs.process(part, 1000, inRate, R, out, n);
            for (int i = 0; i < n[0]; i++) {
                double t = (total + i) / (double) R;
                float want = (float) Math.sin(2 * Math.PI * 440 * t);
                maxErr = Math.max(maxErr, Math.abs(out[2 * i] - want));
            }
            total += n[0];
        }
        assertEquals("44.1k frames for a second at 48k", R, total, 4);
        assertTrue("a sine stays a sine, off by " + maxErr, maxErr < 0.01f);
    }
}
