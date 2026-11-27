package com.caelan.mptree;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.appwidget.AppWidgetManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.MediaMetadataRetriever;
import android.media.MediaPlayer;
import android.media.PlaybackParams;
import android.media.audiofx.Equalizer;
import android.media.audiofx.LoudnessEnhancer;
import android.os.SystemClock;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Binder;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import android.support.v4.media.session.MediaSessionCompat;

import androidx.core.app.NotificationCompat;
import androidx.media.app.NotificationCompat.MediaStyle;

import java.io.File;

public class MusicPlayerService extends Service {

    public static final String CHANNEL_ID      = "mptree_playback";
    public static final String ACTION_PLAY     = "com.caelan.mptree.PLAY";
    public static final String ACTION_PAUSE    = "com.caelan.mptree.PAUSE";
    public static final String ACTION_NEXT     = "com.caelan.mptree.NEXT";
    public static final String ACTION_PREV     = "com.caelan.mptree.PREV";
    public static final String ACTION_STOP     = "com.caelan.mptree.STOP";
    /** Shuffle every song and play, with no window: the MPTree TV launcher's
     *  Shuffle music button, through ShuffleActivity. */
    public static final String ACTION_SHUFFLE_ALL = "com.caelan.mptree.SHUFFLE_ALL";
    /** Every song the app can play, as the app last saved it on a TV (path,
     *  title, artist, and a cut's part): what ACTION_SHUFFLE_ALL shuffles. */
    public static final String PREF_TV_LIBRARY = "mptree_tv_library";

    private static final int NOTIFICATION_ID   = 1;

    // ── Crossfade ──────────────────────────────────────────────────────────
    // How long two songs run over each other; 0 is off. AudioEngine mixes it.
    private int crossfadeDurationMs = 0;

    public class LocalBinder extends Binder {
        public MusicPlayerService getService() { return MusicPlayerService.this; }
    }
    private final IBinder binder = new LocalBinder();

    // ── The player ───────────────────────────────────────────────────────────
    // MPTree's own (AudioEngine, since test build 136): every song through one
    // sound stream, the song after this one decoded ahead, crossfades mixed by
    // MPTree itself. It took the place of a MediaPlayer per song, and of the
    // second one that every crossfade started while the first one played.
    private AudioEngine engine;
    private TrackSink   trackSink;
    private android.os.PowerManager.WakeLock wakeLock;
    /** A file that could not be played: what comes next skips it. */
    private String badPath = null;
    private int    badInARow = 0;


    private MediaSession    mediaSession;
    private AudioManager    audioManager;
    private AudioFocusRequest audioFocusRequest;

    // ── Sharing the speaker with other apps ──────────────────────────────────
    // Off: MPTree holds audio focus the normal way, so anything else that starts
    // playing (a TikTok video) takes it and MPTree pauses.
    // Mix: MPTree holds no focus at all. Nobody can take from it what it does not
    // hold, so it keeps playing, and on Android 12+ it is not force-faded either,
    // since that only happens to a holder of AUDIOFOCUS_GAIN.
    // Mix + duck: MPTree takes a transient "may duck" focus on every play and
    // resume, which makes Android lower whoever held focus. That lasts until the
    // other app asks again (TikTok does on every video). MPTree does not ask back,
    // which would be a tug of war.
    // Both are Capacitor Preferences keys, which live in this same
    // SharedPreferences file, so the service knows them before the WebView does.
    private static final String PREF_MIX  = "mptree_mix_others";
    private static final String PREF_DUCK = "mptree_duck_others";
    private boolean mixWithOthers = false;
    private boolean duckOthers    = false;
    private String          currentPath   = null;
    private String          currentTitle  = "Unknown";
    private String          currentArtist = "Unknown";

    private boolean         isPlaying     = false;
    private boolean         isPreparing   = false;
    private int             playToken     = 0;

    // Tracks whether we're currently a foreground service. startForeground()
    // is ONLY ever called in direct response to playback starting (never at
    // app launch), which avoids the Android 12+ "did not call startForeground
    // within 5s" crash. See promoteToForeground()/demoteFromForeground().
    private boolean         isForeground  = false;

    // ── Playback speed ───────────────────────────────────────────────────────
    // 1.0 == normal. Applied to whichever MediaPlayer is currently active and
    // re-applied to every freshly prepared player so the setting survives
    // track changes and crossfades.
    private float playbackSpeed = 1.0f;

    // FIX 1: Cache the fallback logo bitmap so it is not re-allocated on every
    // metadata update (which fires every second via positionTicker). Allocating
    // a new Bitmap each call and never recycling it builds heap pressure and
    // causes OOM crashes on longer sessions.
    private Bitmap cachedLogoArt = null;
    // Per-track embedded artwork. Recycled and replaced whenever the track
    // changes so we never leak decoded bitmaps across songs.
    private Bitmap currentTrackArt = null;
    private String currentTrackArtPath = null;

    // ── Equalizer ────────────────────────────────────────────────────────────
    private int        sharedAudioSessionId = -1;
    private Equalizer  equalizer;
    // The equalizer of the song fading in, which plays in a session of its own
    // until the crossfade makes it the song.
    private Equalizer  fadeEq;
    private boolean    eqEnabled  = false;
    private short[]    pendingEqBandLevels = null;

    // ── Play mode ────────────────────────────────────────────────────────────
    public static final String MODE_OFF     = "off";
    public static final String MODE_SHUFFLE = "shuffle";
    public static final String MODE_REPEAT  = "repeat";
    /** The whole queue again: after the last song the first comes. */
    public static final String MODE_REPEAT_ALL = "repeatAll";
    private String playMode = MODE_OFF;

    public void setPlayMode(String mode) {
        if (MODE_OFF.equals(mode) || MODE_SHUFFLE.equals(mode) || MODE_REPEAT.equals(mode) || MODE_REPEAT_ALL.equals(mode)) {
            playMode = mode;
        }
        // Repeat one on or off changes what comes after this song.
        if (engine != null) engine.refreshNext();
    }

    public void setCrossfadeDuration(int ms) {
        crossfadeDurationMs = Math.max(0, ms);
        if (engine != null) engine.setCrossfadeMs(crossfadeDurationMs);
    }


    /** speed: playback rate multiplier (0.5–2.0 typical). 1.0 == normal.
     *  Paused or not: the engine's stream keeps it, and it starts nothing. */
    public void setPlaybackSpeed(float speed) {
        playbackSpeed = Math.max(0.25f, Math.min(4.0f, speed));
        if (engine != null) engine.setSpeed(playbackSpeed);
    }

    public float getPlaybackSpeed() { return playbackSpeed; }

    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private final java.util.concurrent.Executor persistExecutor =
            java.util.concurrent.Executors.newSingleThreadExecutor();

    public static class Track {
        public final String path, title, artist;
        public final boolean isCut;
        /** A cut that is not a file of its own: the part of `path` to play, in
         *  milliseconds. cutTo is 0 when there is no such part. */
        public final int cutFrom, cutTo;
        public Track(String path, String title, String artist, boolean isCut, int cutFrom, int cutTo) {
            this.path = path; this.title = title; this.artist = artist; this.isCut = isCut;
            this.cutFrom = Math.max(0, cutFrom); this.cutTo = Math.max(0, cutTo);
        }
        public Track(String path, String title, String artist, boolean isCut) {
            this(path, title, artist, isCut, 0, 0);
        }
        public Track(String path, String title, String artist) {
            this(path, title, artist, false);
        }
    }

    // The part of the current file that is being played, when it is a cut.
    // JS used to keep to these by itself, and could not: its seek to the start
    // arrived while the file was still loading and was dropped, and its watch
    // on the end stops when the screen goes off.
    private int curCutFrom = 0, curCutTo = 0;

    public int getQueueIndex() { return nativeQueueIndex; }

    private final java.util.List<Track> nativeQueue = new java.util.ArrayList<>();
    private int nativeQueueIndex = -1;

    public void setQueue(java.util.List<Track> queue, int currentIndex) {
        nativeQueue.clear();
        nativeQueue.addAll(queue);
        nativeQueueIndex = currentIndex;
        queueFromShuffleAll = false;
        saveQueue();
        // A new queue, a new song after this one (decoded ahead again).
        if (engine != null) engine.refreshNext();
    }

    // The queue on disk, so a widget's next and previous work with the player
    // started cold (MPTree closed): before, the queue lived only in memory and
    // came back only once the app was opened and a song skipped there.
    private static final String QUEUE_FILE = "native_queue.json";
    private void saveQueue() {
        final org.json.JSONArray a = new org.json.JSONArray();
        try {
            for (Track t : nativeQueue) {
                org.json.JSONObject o = new org.json.JSONObject();
                o.put("p", t.path); o.put("t", t.title); o.put("a", t.artist);
                if (t.isCut) o.put("c", true);
                if (t.cutTo > 0) { o.put("f", t.cutFrom); o.put("e", t.cutTo); }
                a.put(o);
            }
        } catch (Exception e) { return; }
        final java.io.File f = new java.io.File(getFilesDir(), QUEUE_FILE);
        new Thread(() -> {
            try (java.io.FileOutputStream out = new java.io.FileOutputStream(f)) {
                out.write(a.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
            } catch (Exception ignored) {}
        }).start();
    }
    private void restoreQueue() {
        if (!nativeQueue.isEmpty()) return;
        try {
            java.io.File f = new java.io.File(getFilesDir(), QUEUE_FILE);
            if (!f.exists()) return;
            byte[] b = new byte[(int) f.length()];
            try (java.io.FileInputStream in = new java.io.FileInputStream(f)) { int n = 0; while (n < b.length) { int r = in.read(b, n, b.length - n); if (r < 0) break; n += r; } }
            org.json.JSONArray a = new org.json.JSONArray(new String(b, java.nio.charset.StandardCharsets.UTF_8));
            for (int i = 0; i < a.length(); i++) {
                org.json.JSONObject o = a.getJSONObject(i);
                nativeQueue.add(new Track(o.optString("p"), o.optString("t"), o.optString("a"), o.optBoolean("c"), o.optInt("f"), o.optInt("e")));
            }
        } catch (Exception e) { nativeQueue.clear(); }
    }

    /** The queue as it is now, for the app to take over (it may have been made
     *  here, by ACTION_SHUFFLE_ALL, while the app was not looking). */
    public java.util.List<Track> getQueue() { return new java.util.ArrayList<>(nativeQueue); }

    /** The queue is every song, shuffled here (ACTION_SHUFFLE_ALL), not one the app sent. */
    public boolean isQueueFromShuffleAll() { return queueFromShuffleAll; }
    private boolean queueFromShuffleAll = false;

    /** Whether the app saved its songs for ACTION_SHUFFLE_ALL. */
    public static boolean hasTvLibrary(Context ctx) {
        String raw = ctx.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE).getString(PREF_TV_LIBRARY, null);
        return raw != null && raw.length() > 2;
    }

    /** Every song the app saved, shuffled, playing from the first: the whole of
     *  "shuffle all" without the app's window. False when there is nothing saved
     *  or the first song would not start. */
    private boolean shuffleAllSaved() {
        java.util.List<Track> all = new java.util.ArrayList<>();
        try {
            String raw = getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE).getString(PREF_TV_LIBRARY, null);
            if (raw == null) return false;
            org.json.JSONArray arr = new org.json.JSONArray(raw);
            for (int i = 0; i < arr.length(); i++) {
                org.json.JSONObject t = arr.getJSONObject(i);
                String path = t.optString("path", "");
                if (path.isEmpty()) continue;
                all.add(new Track(path, t.optString("title", "Unknown"), t.optString("artist", ""),
                        t.optBoolean("isCut", false), t.optInt("cutFrom", 0), t.optInt("cutTo", 0)));
            }
        } catch (Exception e) {
            return false;
        }
        if (all.isEmpty()) return false;
        java.util.Collections.shuffle(all);
        nativeQueue.clear();
        nativeQueue.addAll(all);
        nativeQueueIndex = 0;
        queueFromShuffleAll = true;
        saveQueue();
        Track first = all.get(0);
        try {
            play(first.path, first.title, first.artist, first.cutFrom, first.cutTo);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    // ── Timers ────────────────────────────────────────────────────────────────
    // The 1-second ticker handles state persistence + notification refresh.
    private final Handler positionHandler = new Handler(Looper.getMainLooper());
    private final Runnable positionTicker = new Runnable() {
        @Override public void run() {
            if (isPlaying) {
                updatePlaybackState(PlaybackState.STATE_PLAYING);
                persistNowPlaying();
                positionHandler.postDelayed(this, 1000);
            }
        }
    };



    public interface OnCompletionListener {
        void onTrackComplete();
    }
    private OnCompletionListener completionListener;

    public void setOnCompletionListener(OnCompletionListener l) {
        completionListener = l;
    }

    public interface OnStateChangeListener {
        void onStateChange();
    }
    private OnStateChangeListener stateChangeListener;
    public void setOnStateChangeListener(OnStateChangeListener l) {
        stateChangeListener = l;
    }
    private void notifyStateChange() {
        // The listener is the app's window. When that is gone (swiped away) a
        // call into it must never take the music down with it.
        try { if (stateChangeListener != null) stateChangeListener.onStateChange(); }
        catch (Exception ignored) { }
    }

    private final BroadcastReceiver actionReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context ctx, Intent intent) {
            String action = intent.getAction();
            if (action == null) return;
            switch (action) {
                case ACTION_PLAY:  resumePlayback(); break;
                case ACTION_PAUSE: pausePlayback();  break;
                case ACTION_NEXT:  nativeSkip(1);   break;
                case ACTION_PREV:  nativeSkip(-1);  break;
                case ACTION_STOP:  stopSelf();       break;
            }
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        audioManager = (AudioManager) getSystemService(AUDIO_SERVICE);
        createNotificationChannel();
        setupMediaSession();
        registerActionReceiver();
        registerNoisyReceiver();
        loadMixMode();
        loadPlayerSettings();
        // FIX 2: Bring up a shared audio session + equalizer eagerly, so
        // getEqualizerInfo() returns real band data even before the first
        // play() call (e.g. user opens Audio Effects immediately on launch).
        initEqualizerEarly();
        startEngine();
    }

    private void startEngine() {
        trackSink = new TrackSink(sharedAudioSessionId);
        engine = new AudioEngine(it -> new CodecSource(this, it), trackSink, engineListener, mainHandler::post);
        engine.setCrossfadeMs(crossfadeDurationMs);
        engine.setSpeed(playbackSpeed);
        try {
            android.os.PowerManager pm = (android.os.PowerManager) getSystemService(POWER_SERVICE);
            wakeLock = pm.newWakeLock(android.os.PowerManager.PARTIAL_WAKE_LOCK, "MPTree:playback");
            wakeLock.setReferenceCounted(false);
        } catch (Exception ignored) {}
    }

    /** Holds the CPU while a song plays: without it the phone may doze once the
     *  screen is off and the app is gone from recents, and the next song never
     *  comes. Each MediaPlayer took this itself; the engine does not. Six
     *  hours at most, taken again at every start. */
    private void keepAwake(boolean on) {
        if (wakeLock == null) return;
        try {
            if (on) wakeLock.acquire(6 * 60 * 60 * 1000L);
            else if (wakeLock.isHeld()) wakeLock.release();
        } catch (Exception ignored) {}
    }

    private final AudioEngine.Listener engineListener = new AudioEngine.Listener() {
        @Override public void onStart(AudioEngine.Item it, boolean byItself) {
            badInARow = 0;
            badPath = null;
            if (byItself) {
                // The song before it ended, faded into this one or not: this
                // one is the song now, as if it had been tapped.
                currentPath   = it.path;
                currentTitle  = it.title;
                currentArtist = it.artist;
                curCutFrom = (int) it.fromMs;
                curCutTo   = (int) it.toMs;
                int at = indexOfItem(it);
                if (at >= 0) nativeQueueIndex = at;
                ++playToken;
                loadArtForCurrentTrack();
            }
            if (sharedAudioSessionId == -1 && trackSink != null) {
                // No session could be made at the start: the equalizer goes on the stream's own.
                sharedAudioSessionId = trackSink.sessionId();
                attachEqualizer();
            }
            isPreparing = false;
            isPlaying = engine.isPlaying();
            if (mediaSession != null && !mediaSession.isActive()) mediaSession.setActive(true);
            updateMediaSessionMetadata();
            updatePlaybackState(isPlaying ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED);
            showNotification();
            persistNowPlaying();
            if (isPlaying) startTickers();
            notifyStateChange();
        }

        @Override public void onEnd(AudioEngine.Item it) {
            // Nothing came after it: stopped, and the app resets its buttons.
            isPreparing = false;
            isPlaying = false;
            keepAwake(false);
            updatePlaybackState(PlaybackState.STATE_STOPPED);
            showNotification();
            persistNowPlaying();
            notifyStateChange();
            if (completionListener != null) completionListener.onTrackComplete();
        }

        @Override public void onError(AudioEngine.Item it, String why) {
            android.util.Log.w("MPTree", "cannot play " + it.path + ": " + why);
            badPath = it.path;
            // Every song failing (a card taken out): stop instead of trying forever.
            if (++badInARow >= Math.max(3, nativeQueue.size())) {
                engine.pause();
                isPlaying = false;
                keepAwake(false);
                updatePlaybackState(PlaybackState.STATE_PAUSED);
                showNotification();
                notifyStateChange();
            }
        }

        @Override public void needNext(AudioEngine.Item it) {
            Track t = trackAfter(it);
            engine.setNext(t != null ? itemOf(t) : null);
        }
    };

    /** What comes after `it`: the same one with repeat one, else the next in
     *  the queue; past its end the queue goes round to the start, as next and
     *  the end of a song always did. A file that just failed is skipped. */
    private Track trackAfter(AudioEngine.Item it) {
        if (it == null) return null;
        if (MODE_REPEAT.equals(playMode)) return trackOf(it);
        int n = nativeQueue.size();
        if (n == 0) return null;
        int at = indexOfItem(it);
        if (at < 0) at = nativeQueueIndex;
        for (int step = 1; step <= n; step++) {
            Track t = nativeQueue.get(((at + step) % n + n) % n);
            if (badPath == null || !badPath.equals(t.path)) return t;
        }
        return null;
    }

    /** Its place in the queue: the same track, else the same file (and cut),
     *  looked for from the song on, then from the start. */
    private int indexOfItem(AudioEngine.Item it) {
        for (int i = 0; i < nativeQueue.size(); i++) if (nativeQueue.get(i) == it.tag) return i;
        if (nativeQueueIndex >= 0 && nativeQueueIndex < nativeQueue.size() && sameTrack(nativeQueue.get(nativeQueueIndex), it)) return nativeQueueIndex;
        for (int i = Math.max(0, nativeQueueIndex + 1); i < nativeQueue.size(); i++) if (sameTrack(nativeQueue.get(i), it)) return i;
        for (int i = 0; i < nativeQueue.size(); i++) if (sameTrack(nativeQueue.get(i), it)) return i;
        return -1;
    }

    private static boolean sameTrack(Track t, AudioEngine.Item it) {
        long to = t.cutTo > t.cutFrom ? t.cutTo : 0;
        return t.path.equals(it.path) && Math.max(0, t.cutFrom) == it.fromMs && to == it.toMs;
    }

    private static AudioEngine.Item itemOf(Track t) {
        return new AudioEngine.Item(t.path, t.title, t.artist, t.cutFrom, t.cutTo, t);
    }

    private Track trackOf(AudioEngine.Item it) {
        if (it.tag instanceof Track) return (Track) it.tag;
        return new Track(it.path, it.title, it.artist, it.isCut(), (int) it.fromMs, (int) it.toMs);
    }

    @Override public IBinder onBind(Intent intent) { return binder; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // The TV launcher's Shuffle all (ShuffleActivity, ACTION_SHUFFLE_ALL), or a
        // widget's button (WidgetActionReceiver): either way the player was started
        // with startForegroundService, so it goes to the foreground at once.
        String act = intent != null ? intent.getAction() : null;
        if (ACTION_SHUFFLE_ALL.equals(act)) {
            // Before the first song has loaded. If nothing could start it steps back down.
            promoteToForeground(buildNotification());
            if (!shuffleAllSaved()) showNotification();
        } else if (act != null && (ACTION_PLAY.equals(act) || ACTION_PAUSE.equals(act) || ACTION_NEXT.equals(act) || ACTION_PREV.equals(act))) {
            try { promoteToForeground(buildNotification()); } catch (Exception ignored) {}
            final String a = act;
            mainHandler.post(() -> widgetAction(a));
        }
        return START_STICKY;
    }

    /** A widget's button, also with the player just started: without a song
     *  loaded it carries on with the last one, where it was. */
    private void widgetAction(String act) {
        if (ACTION_PAUSE.equals(act)) { pausePlayback(); return; }
        if ((engine == null || !engine.hasSong()) && currentPath == null) {
            try {
                String json = getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE).getString("mptree_native_now_playing", null);
                if (json == null) { stopIfIdle(); return; }
                org.json.JSONObject o = new org.json.JSONObject(json);
                String path = o.optString("path", "");
                if (path.isEmpty()) { stopIfIdle(); return; }
                final int at = o.optInt("position", 0);
                restoreQueue();
                nativeQueueIndex = -1;
                for (int i = 0; i < nativeQueue.size(); i++) if (path.equals(nativeQueue.get(i).path)) { nativeQueueIndex = i; break; }
                // Next and previous: the song next to the last one, from its start.
                if (!ACTION_PLAY.equals(act) && nativeQueueIndex >= 0) { nativeSkip(ACTION_NEXT.equals(act) ? 1 : -1); return; }
                play(path, o.optString("title", ""), o.optString("artist", ""), 0, 0);
                if (at > 1000) seekTo(at);
            } catch (Exception e) { stopIfIdle(); }
            return;
        }
        if (ACTION_PLAY.equals(act)) resumePlayback();
        else if (ACTION_NEXT.equals(act)) nativeSkip(1);
        else nativeSkip(-1);
    }

    private void stopIfIdle() {
        if (isPlaying) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(Service.STOP_FOREGROUND_REMOVE);
            else stopForeground(true);
        } catch (Exception ignored) {}
        isForeground = false;
    }

    @Override
    public void onDestroy() {
        positionHandler.removeCallbacks(positionTicker);
        mainHandler.removeCallbacksAndMessages(null);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(Service.STOP_FOREGROUND_REMOVE);
            } else {
                //noinspection deprecation
                stopForeground(true);
            }
        } catch (Exception ignored) {}
        isForeground = false;
        releaseEqualizer();
        if (engine != null) { engine.release(); engine = null; }
        keepAwake(false);
        if (mediaSession != null) { mediaSession.release(); mediaSession = null; }
        try { unregisterReceiver(actionReceiver); } catch (Exception ignored) {}
        try { unregisterReceiver(noisyReceiver); } catch (Exception ignored) {}
        abandonAudioFocus();
        // FIX 1: Recycle cached bitmaps to release their native memory.
        if (cachedLogoArt != null)   { cachedLogoArt.recycle();   cachedLogoArt = null; }
        if (currentTrackArt != null) { currentTrackArt.recycle(); currentTrackArt = null; }
        super.onDestroy();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        // Swiped away from recents. Playing: make sure the service is in the
        // foreground, which is what keeps Android from ending it with the
        // window (an earlier promotion can have been refused, see
        // promoteToForeground). Not playing: nothing to keep alive.
        if (isPlaying) showNotification();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, getString(R.string.channel_playback), NotificationManager.IMPORTANCE_LOW);
            ch.setDescription(getString(R.string.channel_playback_desc));
            ch.setShowBadge(false);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    private void setupMediaSession() {
        mediaSession = new MediaSession(this, "MPTreeSession");
        mediaSession.setFlags(
                MediaSession.FLAG_HANDLES_MEDIA_BUTTONS |
                        MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
        mediaSession.setCallback(new MediaSession.Callback() {
            @Override public void onPlay()           { resumePlayback(); }
            @Override public void onPause()          { pausePlayback();  }
            @Override public void onStop()           { stopSelf();       }
            @Override public void onSkipToNext()     { nativeSkip(1);   }
            @Override public void onSkipToPrevious() { nativeSkip(-1);  }
            @Override public void onSeekTo(long pos) {
                seekTo((int) pos);
                updatePlaybackState(isPlaying
                        ? PlaybackState.STATE_PLAYING
                        : PlaybackState.STATE_PAUSED);
            }
        });
        mediaSession.setActive(true);
    }

    private void registerActionReceiver() {
        IntentFilter filter = new IntentFilter();
        filter.addAction(ACTION_PLAY);
        filter.addAction(ACTION_PAUSE);
        filter.addAction(ACTION_NEXT);
        filter.addAction(ACTION_PREV);
        filter.addAction(ACTION_STOP);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(actionReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(actionReceiver, filter);
        }
    }

    // One listener for the life of the service. Focus is keyed on it, so asking
    // again (with a different gain) replaces MPTree's entry rather than stacking
    // a second one, and there is never a moment in between where the other app
    // gets focus back and starts up again.
    // Whether it was another app that paused MPTree, and when. A game's
    // end-of-match jingle or a navigation voice takes the speaker for a moment;
    // when they give it back MPTree carries on. A pause by the person clears it.
    private boolean pausedByFocus = false;
    private long    pausedByFocusAt = 0;
    /** Past this, coming back is no longer "the same listening": a call that
     *  took an hour should not end in music starting by itself. */
    private static final long RESUME_WITHIN_MS = 10 * 60 * 1000;
    /** An app that took the speaker for good (TikTok, a video app) is
     *  followed this long: leaving TikTok after a few minutes of scrolling
     *  should bring the music back, as people expect. */
    private static final long RESUME_AFTER_TAKEOVER_MS = 30 * 60 * 1000;
    private long resumeWithin = RESUME_WITHIN_MS;
    /** The other app must be quiet this many looks in a row (1.5 s apart)
     *  before MPTree comes back, so the short gap between two TikTok videos
     *  does not count as "done" and steal the speaker mid-scroll. */
    private static final int QUIET_LOOKS_NEEDED = 3;
    private int quietLooks = 0;

    private final AudioManager.OnAudioFocusChangeListener focusListener = focusChange -> {
        if (mixWithOthers) return;
        if (focusChange == AudioManager.AUDIOFOCUS_LOSS ||
                focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
            boolean wasPlaying = isPlaying;
            pausePlayback();
            if (wasPlaying) {
                pausedByFocus = true;
                pausedByFocusAt = System.currentTimeMillis();
                resumeWithin = focusChange == AudioManager.AUDIOFOCUS_LOSS ? RESUME_AFTER_TAKEOVER_MS : RESUME_WITHIN_MS;
                // An app that took the speaker for good never hands it back,
                // so nothing would say when its sound is over. Asking again
                // after a moment does: the request is granted once it is done.
                if (focusChange == AudioManager.AUDIOFOCUS_LOSS) {
                    quietLooks = 0;
                    mainHandler.removeCallbacks(this.watchForQuiet);
                    mainHandler.postDelayed(this.watchForQuiet, 4000);
                }
            }
        } else if (focusChange == AudioManager.AUDIOFOCUS_GAIN) {
            mainHandler.removeCallbacks(this.watchForQuiet);
            resumeAfterFocusLoss();
        }
    };

    /** After a takeover: look every 1.5 s whether the other app is still
     *  sounding, and come back once it has been quiet a few looks in a row. */
    private final Runnable watchForQuiet = new Runnable() {
        @Override public void run() {
            if (!pausedByFocus || isPlaying) return;
            if (System.currentTimeMillis() - pausedByFocusAt > resumeWithin) { pausedByFocus = false; return; }
            boolean busy = audioManager != null && audioManager.isMusicActive();
            quietLooks = busy ? 0 : quietLooks + 1;
            if (quietLooks >= QUIET_LOOKS_NEEDED) { resumeAfterFocusLoss(); return; }
            mainHandler.postDelayed(this, 1500);
        }
    };

    private void resumeAfterFocusLoss() {
        if (!pausedByFocus || isPlaying) return;
        if (System.currentTimeMillis() - pausedByFocusAt > resumeWithin) { pausedByFocus = false; return; }
        // Something else is still sounding (a video, a call): leave it, and
        // look again in a while.
        if (audioManager != null && audioManager.isMusicActive()) {
            mainHandler.postDelayed(this::resumeAfterFocusLoss, 3000);
            return;
        }
        pausedByFocus = false;
        resumePlayback();
    }

    private boolean requestAudioFocus() {
        if (mixWithOthers) {
            if (!duckOthers) { abandonAudioFocus(); return true; }
            return requestFocus(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK);
        }
        return requestFocus(AudioManager.AUDIOFOCUS_GAIN);
    }

    private boolean requestFocus(int gain) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build();
            audioFocusRequest = new AudioFocusRequest.Builder(gain)
                    .setAudioAttributes(attrs)
                    .setOnAudioFocusChangeListener(focusListener)
                    .build();
            return audioManager.requestAudioFocus(audioFocusRequest)
                    == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        } else {
            //noinspection deprecation
            return audioManager.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, gain)
                    == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        }
    }

    private void abandonAudioFocus() {
        if (audioManager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (audioFocusRequest != null) audioManager.abandonAudioFocusRequest(audioFocusRequest);
            audioFocusRequest = null;
        } else {
            //noinspection deprecation
            audioManager.abandonAudioFocus(focusListener);
        }
    }

    /** Crossfade, repeat and speed as the app last saved them. The app sends
     *  them too, but a service Android started again by itself (or one that
     *  came up after the app had sent them) would otherwise run without them:
     *  no crossfade until the setting was touched again. */
    private void loadPlayerSettings() {
        try {
            android.content.SharedPreferences prefs =
                    getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
            String raw = prefs.getString("mptree_session", null);
            if (raw == null) return;
            org.json.JSONObject s = new org.json.JSONObject(raw);
            crossfadeDurationMs = Math.max(0, s.optInt("crossfadeMs", 0));
            String mode = s.optString("playMode", MODE_OFF);
            playMode = s.optBoolean("repeat", false) || MODE_REPEAT.equals(mode) ? MODE_REPEAT
                    : s.optBoolean("repeatAll", false) ? MODE_REPEAT_ALL
                    : MODE_SHUFFLE.equals(mode) ? MODE_SHUFFLE : MODE_OFF;
            double speed = s.optDouble("playbackSpeed", 1.0);
            if (speed > 0) playbackSpeed = (float) Math.max(0.25, Math.min(4.0, speed));
        } catch (Exception ignored) { /* a broken entry: the defaults */ }
    }

    private void loadMixMode() {
        android.content.SharedPreferences prefs =
                getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
        mixWithOthers = "true".equals(prefs.getString(PREF_MIX, null));
        duckOthers    = "true".equals(prefs.getString(PREF_DUCK, null));
    }

    /** Applied at once: if something is playing, focus is taken or let go now. */
    public void setMixMode(boolean mix, boolean duck) {
        mixWithOthers = mix;
        duckOthers    = mix && duck;
        if (isPlaying) requestAudioFocus();
        else if (mixWithOthers) abandonAudioFocus();
    }

    // ── Headphones and Bluetooth dropping out ────────────────────────────────
    // Android sends this the moment audio is about to move from headphones or a
    // Bluetooth device to the phone's own speaker. Without it, a speaker going out
    // of range meant the music carried on out loud from a pocket. Registered for
    // the life of the service; pause() does nothing when nothing is playing.
    private final BroadcastReceiver noisyReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context ctx, Intent intent) {
            if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())) {
                pausePlayback();
            }
        }
    };

    private void registerNoisyReceiver() {
        IntentFilter filter = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
        // A system broadcast, so it still arrives with the receiver not exported.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(noisyReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(noisyReceiver, filter);
        }
    }

    // ── Equalizer ────────────────────────────────────────────────────────────

    // FIX 2: Create a shared audio session id and attach the Equalizer to it
    // once, at service startup. MediaPlayers created later are pinned to the
    // same session in ensureSharedSessionId(), so the same Equalizer applies to
    // all of them AND getEqualizerInfo() has real data from the very first call.
    private void initEqualizerEarly() {
        try {
            if (sharedAudioSessionId == -1 && audioManager != null) {
                sharedAudioSessionId = audioManager.generateAudioSessionId();
            }
            if (sharedAudioSessionId != AudioManager.ERROR && sharedAudioSessionId != -1) {
                attachEqualizer();
            }
        } catch (Exception ignored) {
            // Device without a usable global session — falls back to lazy
            // attach on first play(); getEqualizerInfo() will report unavailable
            // until then, which the UI already handles gracefully.
        }
    }

    private void attachEqualizer() {
        try {
            if (equalizer != null) { equalizer.release(); }
            equalizer = new Equalizer(0, sharedAudioSessionId);
            equalizer.setEnabled(eqEnabled);
            if (pendingEqBandLevels != null) applyBandLevelsInternal(pendingEqBandLevels);
        } catch (Exception ignored) {}
    }

    private void releaseEqualizer() {
        if (equalizer != null) {
            try { equalizer.release(); } catch (Exception ignored) {}
            equalizer = null;
        }
    }

    public void setEqualizerEnabled(boolean enabled) {
        eqEnabled = enabled;
        if (equalizer != null) {
            try { equalizer.setEnabled(enabled); } catch (Exception ignored) {}
        }
        if (fadeEq != null) {
            try { fadeEq.setEnabled(enabled); } catch (Exception ignored) {}
        }
    }

    public void setEqualizerBandLevels(short[] bandLevels) {
        pendingEqBandLevels = bandLevels;
        if (equalizer != null) applyBandLevelsInternal(bandLevels);
        if (fadeEq != null) {
            try {
                short bands = fadeEq.getNumberOfBands();
                for (short i = 0; i < bands && i < bandLevels.length; i++) fadeEq.setBandLevel(i, bandLevels[i]);
            } catch (Exception ignored) {}
        }
    }

    private void applyBandLevelsInternal(short[] levels) {
        try {
            short bands = equalizer.getNumberOfBands();
            for (short i = 0; i < bands && i < levels.length; i++) {
                equalizer.setBandLevel(i, levels[i]);
            }
        } catch (Exception ignored) {}
    }

    public int[] getEqualizerBandFreqsHz() {
        if (equalizer == null) return new int[0];
        try {
            short bands = equalizer.getNumberOfBands();
            int[] out = new int[bands];
            for (short i = 0; i < bands; i++) {
                out[i] = equalizer.getCenterFreq(i) / 1000;
            }
            return out;
        } catch (Exception e) { return new int[0]; }
    }

    public int[] getEqualizerLevelRangeMillibel() {
        if (equalizer == null) return new int[]{0, 0};
        try {
            short[] range = equalizer.getBandLevelRange();
            return new int[]{range[0], range[1]};
        } catch (Exception e) { return new int[]{0, 0}; }
    }

    // ── Public API ──────────────────────────────────────────────────────────

    public void play(String path, String title, String artist) throws Exception {
        play(path, title, artist, false);
    }

    public void play(String path, String title, String artist, boolean isAutoAdvance) throws Exception {
        play(path, title, artist, isAutoAdvance, 0, 0);
    }

    public void play(String path, String title, String artist, int cutFrom, int cutTo) throws Exception {
        play(path, title, artist, false, cutFrom, cutTo);
    }

    private void play(String path, String title, String artist, boolean isAutoAdvance,
                      int cutFrom, int cutTo) throws Exception {
        if (path == null || path.isEmpty()) throw new IllegalArgumentException("path is empty");

        // A start without an end is allowed: the cut sheet listens from a
        // point and stops by itself.
        curCutTo      = cutTo > cutFrom ? cutTo : 0;
        curCutFrom    = Math.max(0, cutFrom);
        currentPath   = path;
        currentTitle  = title  != null ? title  : "Unknown";
        currentArtist = artist != null ? artist : "Unknown";

        for (int i = 0; i < nativeQueue.size(); i++) {
            if (nativeQueue.get(i).path.equals(path)) { nativeQueueIndex = i; break; }
        }
        Track t = nativeQueueIndex >= 0 && nativeQueueIndex < nativeQueue.size()
                && nativeQueue.get(nativeQueueIndex).path.equals(path) ? nativeQueue.get(nativeQueueIndex) : null;

        ++playToken;
        requestAudioFocus();
        isPreparing = true;
        isPlaying   = true;
        keepAwake(true);
        // The song decoded ahead (the next one) is heard at once; another one
        // as soon as its start is decoded. Next during a crossfade into this
        // very song keeps it where it is (AudioEngine.play).
        engine.play(new AudioEngine.Item(path, currentTitle, currentArtist, curCutFrom, curCutTo, t), curCutFrom, true);
        if (mediaSession != null && !mediaSession.isActive()) mediaSession.setActive(true);
        updateMediaSessionMetadata();
        updatePlaybackState(PlaybackState.STATE_PLAYING);
        showNotification();
        persistNowPlaying();
        // The app hears of it when the song is heard (onStart), as it did
        // once a MediaPlayer had loaded.
    }

    public void pause() {
        // Whoever pauses, it is no longer "paused by another app" unless the
        // focus listener says so right after this.
        pausedByFocus = false;
        if (engine == null || !engine.hasSong() || !isPlaying) return;
        engine.pause();
        isPlaying = false;
        keepAwake(false);
        // A duck only makes sense while MPTree is actually playing over
        // something. Letting go brings the other app back up.
        if (mixWithOthers) abandonAudioFocus();
        updatePlaybackState(PlaybackState.STATE_PAUSED);
        showNotification();
        persistNowPlaying();
        positionHandler.removeCallbacks(positionTicker);
        notifyStateChange();
    }

    public void resume() {
        pausedByFocus = false;
        if (engine == null || !engine.hasSong() || isPlaying) return;
        // Resuming used to skip this, so after another app had paused MPTree,
        // play started it again without focus: the other app kept playing
        // over it, and MPTree was never told when to stop again.
        requestAudioFocus();
        engine.resume();
        isPlaying = true;
        keepAwake(true);
        updatePlaybackState(PlaybackState.STATE_PLAYING);
        showNotification();
        persistNowPlaying();
        startTickers();
        notifyStateChange();
    }

    private void startTickers() {
        positionHandler.removeCallbacks(positionTicker);
        positionHandler.post(positionTicker);
    }

    public int getCurrentPosition() { return engine != null ? (int) engine.positionMs() : 0; }

    public int getDuration() { return engine != null ? (int) engine.durationMs() : 0; }

    /** Returns [currentPositionMs, durationMs] in a single call to halve bridge overhead. */
    public int[] getPositionAndDuration() {
        return new int[]{ getCurrentPosition(), getDuration() };
    }

    /** Anywhere: while it still loads, at the very end, past the end (the next song comes). */
    public void seekTo(int ms) {
        if (engine == null) return;
        engine.seekTo(ms);
        updatePlaybackState(isPlaying ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED);
        persistNowPlaying();
    }

    public boolean isCurrentlyPlaying() { return isPlaying; }
    public String getCurrentPath()      { return currentPath; }
    public String getCurrentTitle()     { return currentTitle; }
    public String getCurrentArtist()    { return currentArtist; }


    /** Next and previous with "blend" (the app sends it no more): as any song. */
    public void playBlended(String path, String title, String artist) throws Exception {
        play(path, title, artist, 0, 0);
    }

    // FIX 4: Native is now the single source of truth for advancing playback.
    //
    // Previously nativeSkip() advanced the track AND unconditionally fired
    // onTrackComplete(), while the JS trackComplete handler ALSO advanced the
    // queue independently. That double-advance was only masked by an 800ms
    // guard and caused "skips two songs" / "jumps back" glitches.
    //
    // Now:
    //   • On a successful auto-advance we do NOT call onTrackComplete(). The
    //     new track's onPrepared → notifyStateChange() already tells JS the
    //     current path changed, and JS just syncs its UI to that path.
    //   • onTrackComplete() is fired ONLY when the queue is exhausted, so JS
    //     knows to stop and reset — it never re-drives the advance itself.
    private void nativeSkip(int dir) {
        // No queue in memory (the app restored its last song without handing
        // one over): the one kept on disk. And the place in it by the song that
        // is on, if the index does not point at it.
        restoreQueue();
        if (currentPath != null && (nativeQueueIndex < 0 || nativeQueueIndex >= nativeQueue.size()
                || !currentPath.equals(nativeQueue.get(nativeQueueIndex).path))) {
            for (int i = 0; i < nativeQueue.size(); i++) if (currentPath.equals(nativeQueue.get(i).path)) { nativeQueueIndex = i; break; }
        }
        if (nativeQueue.isEmpty() || nativeQueueIndex < 0) {
            // No native queue to advance through — let JS decide what to do.
            if (completionListener != null) completionListener.onTrackComplete();
            return;
        }

        // Repeat is for when a song ends (advanceForCompletion). Next means
        // the next song, repeat on or not; it used to play the same one again.
        int next = nativeQueueIndex + dir;
        // Repeat all goes round, both ways.
        if (MODE_REPEAT_ALL.equals(playMode)) next = (next + nativeQueue.size()) % nativeQueue.size();

        // By hand past the ends: previous on the first song starts it again,
        // next on the last goes round to the first. It used to say "stopped"
        // (the widget showed pause) while the song went on playing.
        if (next < 0 && engine != null && engine.hasSong()) { try { seekTo(0); } catch (Exception ignored) {} return; }
        if (next >= nativeQueue.size()) next = 0;
        if (next < 0 || next >= nativeQueue.size()) {
            // Queue exhausted: stop and notify JS to reset its transport UI.
            isPlaying = false;
            updatePlaybackState(PlaybackState.STATE_STOPPED);
            showNotification();
            persistNowPlaying();
            notifyStateChange();
            if (completionListener != null) completionListener.onTrackComplete();
            return;
        }

        Track t = nativeQueue.get(next);
        try {
            play(t.path, t.title, t.artist, true, t.cutFrom, t.cutTo);
            // play() looks the track up by its file, and a cut shares its file
            // with the song it was cut from.
            nativeQueueIndex = next;
            // NOTE: no onTrackComplete() here — see FIX 4 above. JS syncs via
            // the stateChange fired from the new track's onPrepared callback.
        } catch (Exception ignored) {
            // If starting the next track threw synchronously, fall back to
            // telling JS so it isn't left hanging.
            if (completionListener != null) completionListener.onTrackComplete();
        }
    }

    private void pushWidgetUpdate() {
        // All four widgets (WidgetRenderer). Once a second while playing only
        // the Card's timeline goes out; the rest when something else changed.
        try { WidgetRenderer.refreshAll(this, false); } catch (Exception ignored) {}
    }

    private void persistNowPlaying() {
        final String  path     = currentPath;
        final String  title    = currentTitle;
        final String  artist   = currentArtist;
        final int     position = getCurrentPosition();
        final int     duration = getDuration();
        final boolean playing  = isPlaying;
        final long    now      = System.currentTimeMillis();

        persistExecutor.execute(() -> {
            try {
                android.content.SharedPreferences prefs =
                        getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
                android.content.SharedPreferences.Editor ed = prefs.edit();
                if (path == null) {
                    ed.remove("mptree_native_now_playing");
                } else {
                    org.json.JSONObject obj = new org.json.JSONObject();
                    obj.put("path",      path);
                    obj.put("title",     title);
                    obj.put("artist",    artist);
                    obj.put("position",  position);
                    obj.put("duration",  duration);
                    obj.put("isPlaying", playing);
                    obj.put("updatedAt", now);
                    ed.putString("mptree_native_now_playing", obj.toString());
                }
                ed.apply();
            } catch (Exception ignored) {}

            mainHandler.post(this::pushWidgetUpdate);
        });
    }

    // ── Album art ──────────────────────────────────────────────────────────
    //
    // Embedded cover art is decoded OFF the main thread (MediaMetadataRetriever
    // + BitmapFactory can block for hundreds of ms on large files — that was a
    // primary ANR source). The main thread only ever reads the already-decoded
    // `currentTrackArt` (or the logo). When the track changes we kick off a
    // background decode; when it finishes we refresh the notification/metadata
    // on the main thread with the ready bitmap.
    private final java.util.concurrent.Executor artExecutor =
            java.util.concurrent.Executors.newSingleThreadExecutor();

    // Max edge length for art pushed to the MediaSession / notification.
    // Embedded covers can be 3000×3000+, which is wasteful and can blow the
    // binder transaction limit. 512px is plenty for lock-screen display.
    private static final int ART_MAX_PX = 512;

    // ── User-picked covers ─────────────────────────────────────────────────
    //
    // A cover the user chose in Edit lives in JS as a base64 data URL, which the
    // lock screen and notification never saw: they only ever showed the picture
    // embedded in the file, or the logo. Pushing art per track through setQueue
    // is not an option (queues run to hundreds of tracks, and these photos are
    // uncompressed straight from a file picker), and pushing only the current
    // one fails whenever the service advances a track by itself with the WebView
    // frozen, which is the normal case.
    //
    // So native owns the mapping. JS calls setTrackArt once per photo; we write
    // a downscaled JPEG into cacheDir and remember path -> file in our own
    // SharedPreferences. It survives the WebView being frozen and the process
    // being killed, so background auto-advance still shows the right cover.
    private static final String ART_PREFS = "mptree_track_art";

    private File customArtFile(String trackPath) {
        if (trackPath == null || trackPath.isEmpty()) return null;
        String name = getSharedPreferences(ART_PREFS, Context.MODE_PRIVATE)
                .getString(trackPath, null);
        if (name == null) return null;
        File f = new File(new File(getCacheDir(), "art"), name);
        return f.exists() ? f : null;
    }

    /** Store (or with a null dataUrl, clear) the user's cover for one track. */
    public void setTrackArt(String trackPath, String dataUrl) {
        if (trackPath == null || trackPath.isEmpty()) return;
        artExecutor.execute(() -> {
            android.content.SharedPreferences prefs =
                    getSharedPreferences(ART_PREFS, Context.MODE_PRIVATE);
            File dir = new File(getCacheDir(), "art");
            String existing = prefs.getString(trackPath, null);
            if (existing != null) {
                try { new File(dir, existing).delete(); } catch (Exception ignored) {}
            }

            if (dataUrl == null || dataUrl.isEmpty()) {
                prefs.edit().remove(trackPath).apply();
            } else {
                try {
                    if (!dir.exists()) dir.mkdirs();
                    int comma = dataUrl.indexOf(',');
                    byte[] raw = android.util.Base64.decode(
                            comma >= 0 ? dataUrl.substring(comma + 1) : dataUrl,
                            android.util.Base64.DEFAULT);

                    BitmapFactory.Options bounds = new BitmapFactory.Options();
                    bounds.inJustDecodeBounds = true;
                    BitmapFactory.decodeByteArray(raw, 0, raw.length, bounds);
                    int sample = 1;
                    int longest = Math.max(bounds.outWidth, bounds.outHeight);
                    while (longest / sample > ART_MAX_PX) sample *= 2;

                    BitmapFactory.Options opts = new BitmapFactory.Options();
                    opts.inSampleSize = sample;
                    Bitmap bmp = BitmapFactory.decodeByteArray(raw, 0, raw.length, opts);
                    if (bmp != null) {
                        // Name the file after the track path's hash, so replacing a
                        // photo never collides with the copy it replaces.
                        String name = Integer.toHexString(trackPath.hashCode())
                                + "_" + System.currentTimeMillis() + ".jpg";
                        java.io.FileOutputStream out = new java.io.FileOutputStream(new File(dir, name));
                        bmp.compress(Bitmap.CompressFormat.JPEG, 90, out);
                        out.close();
                        bmp.recycle();
                        prefs.edit().putString(trackPath, name).apply();
                    }
                } catch (Exception ignored) {}
            }

            // The cover for the track playing right now may have just changed.
            mainHandler.post(() -> {
                if (trackPath.equals(currentPath)) {
                    currentTrackArt     = null;
                    currentTrackArtPath = null;
                    loadArtForCurrentTrack();
                    updateMediaSessionMetadata();
                    showNotification();
                }
            });
        });
    }

    /** Main-thread-safe: returns whatever art is ready right now, no I/O. */
    private Bitmap currentArtOrLogo() {
        if (currentTrackArt != null && currentPath != null
                && currentPath.equals(currentTrackArtPath)) {
            return currentTrackArt;
        }
        if (cachedLogoArt == null || cachedLogoArt.isRecycled()) {
            cachedLogoArt = BitmapFactory.decodeResource(getResources(), R.drawable.album_art_logo);
        }
        return cachedLogoArt;
    }

    /** Kick off a background decode for `path`. On completion, refresh the
     *  notification + media-session metadata on the main thread. Skips work if
     *  we already have art for this exact path. */
    private void loadArtForCurrentTrack() {
        final String path = currentPath;
        if (path == null) return;
        if (path.equals(currentTrackArtPath) && currentTrackArt != null) return;

        // Invalidate stale art immediately so the UI falls back to the logo
        // until the new art is ready, instead of showing the previous cover.
        final Bitmap stale = currentTrackArt;
        currentTrackArt     = null;
        currentTrackArtPath = null;
        if (stale != null && stale != cachedLogoArt) {
            // Recycle on the art thread to avoid touching it while in use.
            artExecutor.execute(() -> { try { stale.recycle(); } catch (Exception ignored) {} });
        }

        artExecutor.execute(() -> {
            // A cover the user picked wins over whatever is embedded in the file.
            File custom = customArtFile(path);
            Bitmap decoded = custom != null ? decodeCustomArt(custom) : null;
            if (decoded == null) decoded = decodeEmbeddedArt(path);
            final Bitmap ready = decoded;
            mainHandler.post(() -> {
                // If the track changed again while we were decoding, drop this result.
                if (path.equals(currentPath)) {
                    currentTrackArt     = ready;
                    currentTrackArtPath = path;
                    // The widgets get a copy of their own: this one is recycled later.
                    WidgetRenderer.setArt(MusicPlayerService.this, path, ready);
                    // Refresh surfaces now that real art is available.
                    updateMediaSessionMetadata();
                    showNotification();
                } else if (ready != null) {
                    ready.recycle();
                }
            });
        });
    }

    /**
     * The album cover MediaStore already holds for this albumId, or null.
     *
     * Two routes because the platform changed under us: from Android 10 the
     * supported call is loadThumbnail on the album URI, which serves a cached,
     * correctly sized bitmap. Before that the only way in was the undocumented
     * albumart content provider, which still works on those releases. Either way
     * this is one lookup per album rather than per song.
     *
     * MUST be called off the main thread.
     */
    private Bitmap loadAlbumThumb(long albumId, int maxPx) {
        if (albumId <= 0) return null;
        try {
            Uri albumUri = android.content.ContentUris.withAppendedId(
                    Uri.parse("content://media/external/audio/albumart"), albumId);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                try {
                    return getContentResolver().loadThumbnail(
                            albumUri, new android.util.Size(maxPx, maxPx), null);
                } catch (Exception e) {
                    // No thumbnail for this album. Fall through to the caller,
                    // which reads the file itself.
                    return null;
                }
            }
            java.io.InputStream in = getContentResolver().openInputStream(albumUri);
            if (in == null) return null;
            try {
                BitmapFactory.Options bounds = new BitmapFactory.Options();
                bounds.inJustDecodeBounds = true;
                BitmapFactory.decodeStream(in, null, bounds);
                in.close();

                int sample = 1;
                int longest = Math.max(bounds.outWidth, bounds.outHeight);
                while (longest / sample > maxPx * 2) sample *= 2;

                java.io.InputStream in2 = getContentResolver().openInputStream(albumUri);
                if (in2 == null) return null;
                try {
                    BitmapFactory.Options opts = new BitmapFactory.Options();
                    opts.inSampleSize = sample;
                    return BitmapFactory.decodeStream(in2, null, opts);
                } finally {
                    try { in2.close(); } catch (Exception ignored) {}
                }
            } finally {
                try { in.close(); } catch (Exception ignored) {}
            }
        } catch (Exception e) {
            return null;
        }
    }

    /** A cover the user picked, read no larger than the lock screen shows it.
     *  The app keeps covers small already; this is for one that is not, so a
     *  large file never becomes a large bitmap. Off the main thread only. */
    private Bitmap decodeCustomArt(File file) {
        try {
            String at = file.getAbsolutePath();
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(at, bounds);

            int sample = 1;
            int longest = Math.max(bounds.outWidth, bounds.outHeight);
            while (longest / sample > ART_MAX_PX) sample *= 2;

            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inSampleSize = sample;
            return BitmapFactory.decodeFile(at, opts);
        } catch (Exception e) {
            return null;
        }
    }

    /** Blocking decode — MUST be called off the main thread. */
    private Bitmap decodeEmbeddedArt(String path) {
        if (path == null || path.isEmpty()) return null;
        MediaMetadataRetriever retriever = new MediaMetadataRetriever();
        try {
            retriever.setDataSource(path);
            byte[] picture = retriever.getEmbeddedPicture();
            if (picture == null || picture.length == 0) return null;

            // Decode bounds first, then subsample to keep memory sane.
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(picture, 0, picture.length, bounds);

            int sample = 1;
            int longest = Math.max(bounds.outWidth, bounds.outHeight);
            while (longest / sample > ART_MAX_PX) sample *= 2;

            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inSampleSize = sample;
            return BitmapFactory.decodeByteArray(picture, 0, picture.length, opts);
        } catch (Exception e) {
            return null;
        } finally {
            try { retriever.release(); } catch (Exception ignored) {}
        }
    }

    /**
     * Returns embedded cover art for an arbitrary file as a base64-encoded
     * payload (no data: prefix — the JS side adds it), or "" when the file has
     * no embedded picture / can't be read. Runs the blocking decode on the art
     * executor and delivers the result via the callback, so the binder/main
     * thread is never blocked.
     */
    public interface ArtBase64Callback { void onResult(String base64); }
    public void getAlbumArtBase64Async(String path, ArtBase64Callback cb) {
        artExecutor.execute(() -> {
            String result = "";
            if (path != null && !path.isEmpty()) {
                MediaMetadataRetriever retriever = new MediaMetadataRetriever();
                try {
                    retriever.setDataSource(path);
                    byte[] picture = retriever.getEmbeddedPicture();
                    if (picture != null && picture.length > 0) {
                        result = android.util.Base64.encodeToString(picture, android.util.Base64.NO_WRAP);
                    }
                } catch (Exception ignored) {
                } finally {
                    try { retriever.release(); } catch (Exception ignored) {}
                }
            }
            cb.onResult(result);
        });
    }

    /**
     * Like getAlbumArtBase64Async, but returns a small JPEG instead of the
     * original picture. The list views need one of these per visible row, and
     * embedded covers are routinely 1000x1000 or larger: handing those to the
     * WebView by the hundred would put tens of megabytes of base64 on the JS
     * heap. At 96px a cover is a few kilobytes.
     *
     * Same single-thread art executor as everything else here, so a burst of
     * requests from a long list can never pile up on the main thread.
     */
    public void getAlbumArtThumbAsync(String path, long albumId, int maxPx, ArtBase64Callback cb) {
        artExecutor.execute(() -> {
            String result = "";
            Bitmap scaled = null;

            // Prefer the album route. MediaStore keeps one thumbnail per album and
            // caches it, so a library of 500 songs across 40 albums costs 40 cheap
            // lookups instead of 500 full metadata reads. Only if that misses do we
            // fall back to cracking the file open ourselves.
            byte[] picture = null;
            if (albumId > 0) {
                Bitmap albumArt = loadAlbumThumb(albumId, maxPx);
                if (albumArt != null) {
                    try {
                        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
                        albumArt.compress(Bitmap.CompressFormat.JPEG, 80, out);
                        result = android.util.Base64.encodeToString(
                                out.toByteArray(), android.util.Base64.NO_WRAP);
                    } catch (Exception ignored) {
                    } finally {
                        try { albumArt.recycle(); } catch (Exception ignored) {}
                    }
                    cb.onResult(result);
                    return;
                }
            }

            if (path != null && !path.isEmpty()) {
                MediaMetadataRetriever retriever = new MediaMetadataRetriever();
                try {
                    retriever.setDataSource(path);
                    picture = retriever.getEmbeddedPicture();
                    if (picture != null && picture.length > 0) {
                        // Bounds first, then subsample, so a huge cover is never
                        // fully decoded just to be thrown away.
                        BitmapFactory.Options bounds = new BitmapFactory.Options();
                        bounds.inJustDecodeBounds = true;
                        BitmapFactory.decodeByteArray(picture, 0, picture.length, bounds);

                        int sample = 1;
                        int longest = Math.max(bounds.outWidth, bounds.outHeight);
                        while (longest / sample > maxPx * 2) sample *= 2;

                        BitmapFactory.Options opts = new BitmapFactory.Options();
                        opts.inSampleSize = sample;
                        Bitmap decoded = BitmapFactory.decodeByteArray(picture, 0, picture.length, opts);
                        if (decoded != null) {
                            int w = decoded.getWidth(), h = decoded.getHeight();
                            int longEdge = Math.max(w, h);
                            if (longEdge > maxPx) {
                                float f = (float) maxPx / longEdge;
                                scaled = Bitmap.createScaledBitmap(
                                        decoded, Math.max(1, Math.round(w * f)),
                                        Math.max(1, Math.round(h * f)), true);
                                if (scaled != decoded) decoded.recycle();
                            } else {
                                scaled = decoded;
                            }
                            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
                            scaled.compress(Bitmap.CompressFormat.JPEG, 80, out);
                            result = android.util.Base64.encodeToString(
                                    out.toByteArray(), android.util.Base64.NO_WRAP);
                        }
                    }
                } catch (Exception ignored) {
                } finally {
                    if (scaled != null) { try { scaled.recycle(); } catch (Exception ignored) {} }
                    try { retriever.release(); } catch (Exception ignored) {}
                }
            }
            cb.onResult(result);
        });
    }

    private void updateMediaSessionMetadata() {
        if (mediaSession == null) return;
        int duration = getDuration();
        // Uses only already-decoded art — never blocks (FIX: ANR).
        Bitmap art = currentArtOrLogo();
        mediaSession.setMetadata(new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE,  currentTitle)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, currentArtist)
                .putLong(MediaMetadata.METADATA_KEY_DURATION, duration)
                .putBitmap(MediaMetadata.METADATA_KEY_ART,    art)
                .build());
    }

    private void updatePlaybackState(int state) {
        if (mediaSession == null) return;
        long position = getCurrentPosition();
        // Report the actual playback speed so the system position UI stays accurate.
        float reportedSpeed = (state == PlaybackState.STATE_PLAYING) ? playbackSpeed : 0f;
        PlaybackState.Builder builder = new PlaybackState.Builder()
                .setActions(
                        PlaybackState.ACTION_PLAY |
                                PlaybackState.ACTION_PAUSE |
                                PlaybackState.ACTION_SKIP_TO_NEXT |
                                PlaybackState.ACTION_SKIP_TO_PREVIOUS |
                                PlaybackState.ACTION_SEEK_TO |
                                PlaybackState.ACTION_STOP)
                .setState(state, position, reportedSpeed);
        mediaSession.setPlaybackState(builder.build());
    }

    private void pausePlayback()  { pause(); }
    private void resumePlayback() {
        if ((engine == null || !engine.hasSong()) && currentPath != null) {
            try { play(currentPath, currentTitle, currentArtist); } catch (Exception ignored) {}
            return;
        }
        resume();
    }

    private void showNotification() {
        Notification notification = buildNotification();
        if (isPlaying) {
            promoteToForeground(notification);
        } else {
            // Paused/stopped: keep the notification (so controls persist) but
            // demote from foreground so the service isn't holding a foreground
            // slot it no longer needs.
            demoteFromForeground(notification);
        }
    }

    /** Builds the media-style notification. On its own it never touches the
     *  foreground-service lifecycle. */
    private Notification buildNotification() {
        Intent openApp = new Intent(this, MainActivity.class);
        openApp.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openPI = PendingIntent.getActivity(this, 0, openApp,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        PendingIntent prevPI      = buildActionIntent(ACTION_PREV,  1);
        PendingIntent playPausePI = isPlaying
                ? buildActionIntent(ACTION_PAUSE, 2)
                : buildActionIntent(ACTION_PLAY,  2);
        PendingIntent nextPI      = buildActionIntent(ACTION_NEXT,  3);

        int playPauseIcon = isPlaying
                ? android.R.drawable.ic_media_pause
                : android.R.drawable.ic_media_play;

        // MediaStyle bound to our active MediaSession is what makes the media
        // controls appear on the lock screen and in the system media area.
        MediaStyle style = new MediaStyle()
                .setMediaSession(MediaSessionCompat.Token.fromToken(
                        mediaSession.getSessionToken()))
                .setShowActionsInCompactView(0, 1, 2);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                // The mark alone, white on nothing: Android draws the small icon
                // as a shape, and the launcher icon came out as a dot.
                .setSmallIcon(R.drawable.ic_stat_mptree)
                .setLargeIcon(currentArtOrLogo())
                .setContentTitle(currentTitle)
                .setContentText(currentArtist)
                .setContentIntent(openPI)
                // VISIBILITY_PUBLIC lets the full controls + art show on the
                // lock screen rather than being hidden.
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(isPlaying)
                .setSilent(true)
                .setColor(android.graphics.Color.BLACK)
                .setColorized(true)
                .addAction(android.R.drawable.ic_media_previous, getString(R.string.action_previous), prevPI)
                .addAction(playPauseIcon, getString(isPlaying ? R.string.action_pause : R.string.action_play), playPausePI)
                .addAction(android.R.drawable.ic_media_next, getString(R.string.action_next), nextPI)
                .setStyle(style)
                .build();
    }

    /** Promote to foreground. Only called when playback is actually starting,
     *  so the Android 12+ 5-second startForeground requirement is always met.
     *  Wrapped in try/catch for the rare ForegroundServiceStartNotAllowedException
     *  (e.g. a race where the app just went to background) so it degrades to a
     *  plain notification instead of crashing. */
    private void promoteToForeground(Notification notification) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification,
                        android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
            isForeground = true;
        } catch (Exception e) {
            // Could not go foreground (background-start restriction). Fall back
            // to a normal notification so controls still show and we don't crash.
            isForeground = false;
            try {
                NotificationManager nm =
                        (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                if (nm != null) nm.notify(NOTIFICATION_ID, notification);
            } catch (Exception ignored) {}
        }
    }

    /** Demote from foreground but keep the notification visible so the user can
     *  resume from it. */
    private void demoteFromForeground(Notification notification) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                // STOP_FOREGROUND_DETACH keeps the notification after demotion.
                stopForeground(Service.STOP_FOREGROUND_DETACH);
            } else {
                //noinspection deprecation
                stopForeground(false);
            }
        } catch (Exception ignored) {}
        isForeground = false;
        try {
            NotificationManager nm =
                    (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTIFICATION_ID, notification);
        } catch (Exception ignored) {}
    }

    private PendingIntent buildActionIntent(String action, int requestCode) {
        Intent intent = new Intent(action);
        intent.setPackage(getPackageName());
        return PendingIntent.getBroadcast(this, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}