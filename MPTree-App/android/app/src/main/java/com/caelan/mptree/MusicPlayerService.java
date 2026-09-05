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
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.MediaMetadataRetriever;
import android.media.MediaPlayer;
import android.media.PlaybackParams;
import android.media.audiofx.Equalizer;
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

    private static final int NOTIFICATION_ID   = 1;

    // ── Crossfade tuning ────────────────────────────────────────────────────
    private static final int  CROSSFADE_STEP_MS = 100;
    // FIX 3: Poll crossfade detection on its own fast timer, independent of the
    // 1-second persist/notification ticker. On the old 1s cadence, a fade could
    // start up to ~1s late and get truncated. 200ms gives smooth, on-time fades.
    private static final int  CROSSFADE_POLL_MS  = 200;
    private int crossfadeDurationMs = 0;

    public class LocalBinder extends Binder {
        public MusicPlayerService getService() { return MusicPlayerService.this; }
    }
    private final IBinder binder = new LocalBinder();

    private MediaPlayer     mediaPlayer;
    private MediaPlayer     incomingPlayer;
    private boolean         crossfading = false;

    private MediaSession    mediaSession;
    private AudioManager    audioManager;
    private AudioFocusRequest audioFocusRequest;
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
    private boolean    eqEnabled  = false;
    private short[]    pendingEqBandLevels = null;

    // ── Play mode ────────────────────────────────────────────────────────────
    public static final String MODE_OFF     = "off";
    public static final String MODE_SHUFFLE = "shuffle";
    public static final String MODE_REPEAT  = "repeat";
    private String playMode = MODE_OFF;

    public void setPlayMode(String mode) {
        if (MODE_OFF.equals(mode) || MODE_SHUFFLE.equals(mode) || MODE_REPEAT.equals(mode)) {
            playMode = mode;
        }
    }

    public void setCrossfadeDuration(int ms) {
        crossfadeDurationMs = Math.max(0, ms);
    }

    /** speed: playback rate multiplier (0.5–2.0 typical). 1.0 == normal. */
    public void setPlaybackSpeed(float speed) {
        playbackSpeed = Math.max(0.25f, Math.min(4.0f, speed));
        // Only push to the player if it's actually playing. Calling
        // setPlaybackParams() on a prepared-but-paused MediaPlayer STARTS
        // playback (documented Android behaviour) — that was why changing speed
        // while paused made the music start. When paused we just remember the
        // value; resume() re-applies it via applyPlaybackSpeed().
        if (isPlaying) applyPlaybackSpeed(mediaPlayer);
    }

    public float getPlaybackSpeed() { return playbackSpeed; }

    /** Applies the current speed to a player. MUST only be called when the
     *  player is (about to be) playing — setPlaybackParams auto-starts a
     *  prepared player, so callers guard on isPlaying / call it right after
     *  start(). */
    private void applyPlaybackSpeed(MediaPlayer mp) {
        if (mp == null) return;
        try {
            PlaybackParams params = mp.getPlaybackParams();
            params.setSpeed(playbackSpeed);
            mp.setPlaybackParams(params);
        } catch (Exception ignored) {
            // Some devices throw if called in an invalid state; ignore.
        }
    }

    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private final java.util.concurrent.Executor persistExecutor =
            java.util.concurrent.Executors.newSingleThreadExecutor();

    public static class Track {
        public final String path, title, artist;
        public final boolean isCut;
        public Track(String path, String title, String artist, boolean isCut) {
            this.path = path; this.title = title; this.artist = artist; this.isCut = isCut;
        }
        public Track(String path, String title, String artist) {
            this(path, title, artist, false);
        }
    }

    private final java.util.List<Track> nativeQueue = new java.util.ArrayList<>();
    private int nativeQueueIndex = -1;

    public void setQueue(java.util.List<Track> queue, int currentIndex) {
        nativeQueue.clear();
        nativeQueue.addAll(queue);
        nativeQueueIndex = currentIndex;
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

    // FIX 3: A separate, faster ticker drives crossfade detection only.
    private final Handler crossfadeHandler = new Handler(Looper.getMainLooper());
    private final Runnable crossfadeTicker = new Runnable() {
        @Override public void run() {
            if (isPlaying) {
                maybeStartCrossfade();
                crossfadeHandler.postDelayed(this, CROSSFADE_POLL_MS);
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
        if (stateChangeListener != null) stateChangeListener.onStateChange();
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
        // FIX 2: Bring up a shared audio session + equalizer eagerly, so
        // getEqualizerInfo() returns real band data even before the first
        // play() call (e.g. user opens Audio Effects immediately on launch).
        initEqualizerEarly();
    }

    @Override public IBinder onBind(Intent intent) { return binder; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        positionHandler.removeCallbacks(positionTicker);
        crossfadeHandler.removeCallbacks(crossfadeTicker);
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
        releasePlayer();
        releaseIncomingPlayer();
        if (mediaSession != null) { mediaSession.release(); mediaSession = null; }
        try { unregisterReceiver(actionReceiver); } catch (Exception ignored) {}
        abandonAudioFocus();
        // FIX 1: Recycle cached bitmaps to release their native memory.
        if (cachedLogoArt != null)   { cachedLogoArt.recycle();   cachedLogoArt = null; }
        if (currentTrackArt != null) { currentTrackArt.recycle(); currentTrackArt = null; }
        super.onDestroy();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, "Music Playback", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("MPTree now-playing controls");
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

    private boolean requestAudioFocus() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build();
            audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(attrs)
                    .setOnAudioFocusChangeListener(focusChange -> {
                        if (focusChange == AudioManager.AUDIOFOCUS_LOSS ||
                                focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
                            pausePlayback();
                        }
                    }).build();
            return audioManager.requestAudioFocus(audioFocusRequest)
                    == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        } else {
            //noinspection deprecation
            return audioManager.requestAudioFocus(
                    focusChange -> {
                        if (focusChange == AudioManager.AUDIOFOCUS_LOSS ||
                                focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
                            pausePlayback();
                        }
                    },
                    AudioManager.STREAM_MUSIC,
                    AudioManager.AUDIOFOCUS_GAIN
            ) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        }
    }

    private void abandonAudioFocus() {
        if (audioManager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null) {
            audioManager.abandonAudioFocusRequest(audioFocusRequest);
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

    private void ensureSharedSessionId(MediaPlayer mp) {
        if (sharedAudioSessionId == -1 || sharedAudioSessionId == AudioManager.ERROR) {
            sharedAudioSessionId = mp.getAudioSessionId();
            attachEqualizer();
        } else {
            try { mp.setAudioSessionId(sharedAudioSessionId); } catch (Exception ignored) {}
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
    }

    public void setEqualizerBandLevels(short[] bandLevels) {
        pendingEqBandLevels = bandLevels;
        if (equalizer != null) applyBandLevelsInternal(bandLevels);
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
        if (path == null || path.isEmpty()) throw new IllegalArgumentException("path is empty");

        if (!isAutoAdvance) cancelCrossfade();

        currentPath   = path;
        currentTitle  = title  != null ? title  : "Unknown";
        currentArtist = artist != null ? artist : "Unknown";

        for (int i = 0; i < nativeQueue.size(); i++) {
            if (nativeQueue.get(i).path.equals(path)) { nativeQueueIndex = i; break; }
        }

        final int myToken = ++playToken;
        final boolean wasAutoAdvance = isAutoAdvance;

        releasePlayer();
        requestAudioFocus();

        isPlaying   = false;
        isPreparing = true;

        mediaPlayer = new MediaPlayer();
        ensureSharedSessionId(mediaPlayer);
        mediaPlayer.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build());

        mediaPlayer.setOnPreparedListener(mp -> {
            if (myToken != playToken) return;
            isPreparing = false;
            try {
                mp.setVolume(1f, 1f);
                mp.start();
                applyPlaybackSpeed(mp); // keep user's speed across track changes
                isPlaying = true;
                // Re-assert the session as active so lock-screen / system media
                // controls reliably pick it up (some OEMs drop inactive sessions).
                if (mediaSession != null && !mediaSession.isActive()) {
                    mediaSession.setActive(true);
                }
                updateMediaSessionMetadata();
                updatePlaybackState(PlaybackState.STATE_PLAYING);
                showNotification();
                persistNowPlaying();
                startTickers();
                notifyStateChange();
                // Decode embedded art in the background; refreshes the
                // notification + metadata when ready (never blocks main thread).
                loadArtForCurrentTrack();
            } catch (Exception e) {
                isPlaying = false;
                updatePlaybackState(PlaybackState.STATE_PAUSED);
                showNotification();
                notifyStateChange();
            }
        });

        mediaPlayer.setOnErrorListener((mp, what, extra) -> {
            if (myToken != playToken) return true;
            isPreparing = false;
            isPlaying   = false;
            updatePlaybackState(PlaybackState.STATE_PAUSED);
            showNotification();
            persistNowPlaying();
            notifyStateChange();
            // A failed load should behave like a completed track: advance
            // natively. We do NOT also fire onTrackComplete here — native is the
            // single source of truth for advancing (see FIX 4 in nativeSkip).
            mainHandler.post(() -> {
                if (myToken != playToken) return;
                nativeSkip(1);
            });
            return true;
        });

        mediaPlayer.setOnCompletionListener(mp -> {
            if (myToken != playToken) return;
            mainHandler.post(() -> {
                if (myToken != playToken) return;
                advanceForCompletion();
            });
        });

        try {
            mediaPlayer.setDataSource(path);
            mediaPlayer.prepareAsync();
        } catch (Exception e) {
            // Bad path / illegal state — clean up and report instead of crashing.
            isPreparing = false;
            isPlaying   = false;
            releasePlayer();
            updatePlaybackState(PlaybackState.STATE_PAUSED);
            notifyStateChange();
        }
    }

    public void pause() {
        if (mediaPlayer != null && isPlaying) {
            try { mediaPlayer.pause(); } catch (Exception ignored) {}
            if (incomingPlayer != null) { try { incomingPlayer.pause(); } catch (Exception ignored) {} }
            isPlaying = false;
            updatePlaybackState(PlaybackState.STATE_PAUSED);
            showNotification();
            persistNowPlaying();
            positionHandler.removeCallbacks(positionTicker);
            crossfadeHandler.removeCallbacks(crossfadeTicker);
            notifyStateChange();
        }
    }

    public void resume() {
        if (mediaPlayer != null && !isPlaying && !isPreparing) {
            mediaPlayer.start();
            applyPlaybackSpeed(mediaPlayer);
            if (incomingPlayer != null) { try { incomingPlayer.start(); } catch (Exception ignored) {} }
            isPlaying = true;
            updatePlaybackState(PlaybackState.STATE_PLAYING);
            showNotification();
            persistNowPlaying();
            startTickers();
            notifyStateChange();
        }
    }

    private void startTickers() {
        positionHandler.removeCallbacks(positionTicker);
        positionHandler.post(positionTicker);
        crossfadeHandler.removeCallbacks(crossfadeTicker);
        crossfadeHandler.postDelayed(crossfadeTicker, CROSSFADE_POLL_MS);
    }

    public int getCurrentPosition() {
        if (mediaPlayer == null || isPreparing) return 0;
        try { return mediaPlayer.getCurrentPosition(); } catch (Exception e) { return 0; }
    }

    public int getDuration() {
        if (mediaPlayer == null || isPreparing) return 0;
        try { return mediaPlayer.getDuration(); } catch (Exception e) { return 0; }
    }

    /** Returns [currentPositionMs, durationMs] in a single call to halve bridge overhead. */
    public int[] getPositionAndDuration() {
        if (mediaPlayer == null || isPreparing) return new int[]{0, 0};
        try {
            return new int[]{ mediaPlayer.getCurrentPosition(), mediaPlayer.getDuration() };
        } catch (Exception e) { return new int[]{0, 0}; }
    }

    public void seekTo(int ms) {
        if (mediaPlayer != null && !isPreparing) {
            try { mediaPlayer.seekTo(ms); } catch (Exception ignored) {}
        }
        cancelCrossfade();
    }

    public boolean isCurrentlyPlaying() { return isPlaying; }
    public String getCurrentPath()      { return currentPath; }
    public String getCurrentTitle()     { return currentTitle; }
    public String getCurrentArtist()    { return currentArtist; }

    private void releasePlayer() {
        if (mediaPlayer != null) {
            final MediaPlayer mp = mediaPlayer;
            // Detach listeners FIRST so nothing fires during teardown.
            mp.setOnCompletionListener(null);
            mp.setOnPreparedListener(null);
            mp.setOnErrorListener(null);
            mediaPlayer = null;
            isPreparing = false;
            // reset() before release(). Calling stop() on a player that is still
            // inside prepareAsync() is an illegal state transition and can crash
            // the native layer (SIGSEGV → app dropped to home screen) — which is
            // exactly what happens when you tap a second song before the first
            // finished preparing. reset() cancels any in-flight prepare and moves
            // the player to Idle cleanly, from which release() is always safe.
            try { mp.reset(); } catch (Exception ignored) {}
            try { mp.release(); } catch (Exception ignored) {}
        }
    }

    private void releaseIncomingPlayer() {
        if (incomingPlayer != null) {
            final MediaPlayer mp = incomingPlayer;
            mp.setOnCompletionListener(null);
            mp.setOnPreparedListener(null);
            mp.setOnErrorListener(null);
            incomingPlayer = null;
            try { mp.reset(); } catch (Exception ignored) {}
            try { mp.release(); } catch (Exception ignored) {}
        }
    }

    private void cancelCrossfade() {
        if (!crossfading) return;
        crossfading = false;
        releaseIncomingPlayer();
        if (mediaPlayer != null) { try { mediaPlayer.setVolume(1f, 1f); } catch (Exception ignored) {} }
    }

    private void maybeStartCrossfade() {
        if (crossfadeDurationMs <= 0) return;
        if (crossfading || isPreparing || mediaPlayer == null) return;
        if (nativeQueue.isEmpty() || nativeQueueIndex < 0) return;

        Track currentTrack = (nativeQueueIndex >= 0 && nativeQueueIndex < nativeQueue.size())
                ? nativeQueue.get(nativeQueueIndex) : null;
        if (currentTrack != null && currentTrack.isCut) return;

        Track upcoming = peekNextTrack();
        if (upcoming == null || upcoming.isCut) return;

        int duration = mediaPlayer.getDuration();
        int position = mediaPlayer.getCurrentPosition();
        if (duration <= 0) return;
        int remaining = duration - position;
        if (remaining > crossfadeDurationMs || remaining <= 0) return;

        startCrossfadeInto(upcoming);
    }

    private Track peekNextTrack() {
        if (MODE_REPEAT.equals(playMode)) {
            return nativeQueue.get(nativeQueueIndex);
        }
        int next = nativeQueueIndex + 1;
        if (next < 0 || next >= nativeQueue.size()) return null;
        return nativeQueue.get(next);
    }

    private void startCrossfadeInto(Track next) {
        crossfading = true;
        final MediaPlayer outgoing = mediaPlayer;
        final int fadeSteps = Math.max(1, crossfadeDurationMs / CROSSFADE_STEP_MS);

        try {
            incomingPlayer = new MediaPlayer();
            ensureSharedSessionId(incomingPlayer);
            incomingPlayer.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build());
            incomingPlayer.setVolume(0f, 0f);

            final int incomingToken = ++playToken;

            incomingPlayer.setOnPreparedListener(mp -> {
                if (incomingToken != playToken) return;
                try {
                    mp.start();
                    applyPlaybackSpeed(mp);
                    runCrossfadeRamp(outgoing, mp, fadeSteps, incomingToken, next);
                } catch (Exception e) {
                    crossfading = false;
                    releaseIncomingPlayer();
                }
            });
            incomingPlayer.setOnErrorListener((mp, what, extra) -> {
                crossfading = false;
                releaseIncomingPlayer();
                return true;
            });
            incomingPlayer.setDataSource(next.path);
            incomingPlayer.prepareAsync();
        } catch (Exception e) {
            crossfading = false;
            releaseIncomingPlayer();
        }
    }

    private void runCrossfadeRamp(MediaPlayer outgoing, MediaPlayer incoming, int stepsTotal,
                                  int incomingToken, Track next) {
        final int[] step = {0};
        Runnable ramp = new Runnable() {
            @Override public void run() {
                // FIX 3 (existing): Also check crossfading flag — cancelCrossfade()
                // sets it false without incrementing playToken, so without this guard
                // the ramp keeps ticking for one more step after cancellation, calling
                // setVolume() on a potentially released outgoing player.
                if (incomingToken != playToken || !crossfading) return;
                step[0]++;
                float t = Math.min(1f, step[0] / (float) stepsTotal);
                try { outgoing.setVolume(1f - t, 1f - t); } catch (Exception ignored) {}
                try { incoming.setVolume(t, t); } catch (Exception ignored) {}
                if (t >= 1f) {
                    try { outgoing.stop(); outgoing.release(); } catch (Exception ignored) {}
                    mediaPlayer    = incoming;
                    incomingPlayer = null;
                    crossfading    = false;

                    currentPath   = next.path;
                    currentTitle  = next.title;
                    currentArtist = next.artist;
                    for (int i = 0; i < nativeQueue.size(); i++) {
                        if (nativeQueue.get(i) == next) { nativeQueueIndex = i; break; }
                    }

                    final int promotedToken = incomingToken;
                    mediaPlayer.setOnCompletionListener(mp -> {
                        if (promotedToken != playToken) return;
                        mainHandler.post(() -> {
                            if (promotedToken != playToken) return;
                            advanceForCompletion();
                        });
                    });
                    mediaPlayer.setOnErrorListener((mp, what, extra) -> {
                        if (promotedToken != playToken) return true;
                        isPlaying = false;
                        updatePlaybackState(PlaybackState.STATE_PAUSED);
                        showNotification();
                        persistNowPlaying();
                        notifyStateChange();
                        mainHandler.post(() -> { if (promotedToken == playToken) nativeSkip(1); });
                        return true;
                    });

                    updateMediaSessionMetadata();
                    updatePlaybackState(PlaybackState.STATE_PLAYING);
                    showNotification();
                    persistNowPlaying();
                    // Crossfade promoted us to a new track: tell JS to resync its
                    // UI to whatever native is now playing (FIX 4 relies on this).
                    notifyStateChange();
                    // Keep the crossfade poller alive for the newly-promoted track.
                    startTickers();
                    // Decode the new track's art in the background.
                    loadArtForCurrentTrack();
                } else {
                    mainHandler.postDelayed(this, CROSSFADE_STEP_MS);
                }
            }
        };
        mainHandler.post(ramp);
    }

    private void advanceForCompletion() {
        nativeSkip(1);
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
        cancelCrossfade();
        if (nativeQueue.isEmpty() || nativeQueueIndex < 0) {
            // No native queue to advance through — let JS decide what to do.
            if (completionListener != null) completionListener.onTrackComplete();
            return;
        }

        int next;
        if (dir > 0 && MODE_REPEAT.equals(playMode)) {
            next = nativeQueueIndex;
        } else {
            next = nativeQueueIndex + dir;
        }

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
            play(t.path, t.title, t.artist, true);
            // NOTE: no onTrackComplete() here — see FIX 4 above. JS syncs via
            // the stateChange fired from the new track's onPrepared callback.
        } catch (Exception ignored) {
            // If starting the next track threw synchronously, fall back to
            // telling JS so it isn't left hanging.
            if (completionListener != null) completionListener.onTrackComplete();
        }
    }

    private void pushWidgetUpdate() {
        try {
            Intent updateIntent = new Intent(this, NowPlayingWidgetProvider.class);
            updateIntent.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
            AppWidgetManager mgr = AppWidgetManager.getInstance(this);
            int[] ids = mgr.getAppWidgetIds(
                    new android.content.ComponentName(this, NowPlayingWidgetProvider.class));
            updateIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
            sendBroadcast(updateIntent);
        } catch (Exception ignored) {}
    }

    private void persistNowPlaying() {
        final String  path     = currentPath;
        final String  title    = currentTitle;
        final String  artist   = currentArtist;
        final int     position = getCurrentPosition();
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
            Bitmap decoded = custom != null
                    ? BitmapFactory.decodeFile(custom.getAbsolutePath())
                    : null;
            if (decoded == null) decoded = decodeEmbeddedArt(path);
            final Bitmap ready = decoded;
            mainHandler.post(() -> {
                // If the track changed again while we were decoding, drop this result.
                if (path.equals(currentPath)) {
                    currentTrackArt     = ready;
                    currentTrackArtPath = path;
                    // Refresh surfaces now that real art is available.
                    updateMediaSessionMetadata();
                    showNotification();
                } else if (ready != null) {
                    ready.recycle();
                }
            });
        });
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
    public void getAlbumArtThumbAsync(String path, int maxPx, ArtBase64Callback cb) {
        artExecutor.execute(() -> {
            String result = "";
            Bitmap scaled = null;
            if (path != null && !path.isEmpty()) {
                MediaMetadataRetriever retriever = new MediaMetadataRetriever();
                try {
                    retriever.setDataSource(path);
                    byte[] picture = retriever.getEmbeddedPicture();
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
        int duration = (mediaPlayer != null && !isPreparing) ? mediaPlayer.getDuration() : 0;
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
        long position = (mediaPlayer != null && !isPreparing) ? mediaPlayer.getCurrentPosition() : 0;
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
        if (mediaPlayer == null && currentPath != null) {
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
                .setSmallIcon(R.mipmap.ic_launcher)
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
                .addAction(android.R.drawable.ic_media_previous, "Previous", prevPI)
                .addAction(playPauseIcon, isPlaying ? "Pause" : "Play", playPausePI)
                .addAction(android.R.drawable.ic_media_next, "Next", nextPI)
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