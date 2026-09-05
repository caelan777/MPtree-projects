package com.caelan.mptree;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.IBinder;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * AudioPlayerPlugin — thin bridge between the JS/React layer and
 * MusicPlayerService.  All real playback work (MediaPlayer, MediaSession,
 * foreground notification, crossfade, equalizer) lives in the service.
 *
 * JS-facing API:
 *   play({ path })  pause()  resume()
 *   getCurrentPosition()  getDuration()  seekTo({ milliseconds })
 *   getState()  ← returns { position, duration } in one bridge call
 *   getCurrentSong()  ← returns what native is actually playing right now
 *     (path + isPlaying). This is the source of truth JS should pull from
 *     on app start / resume instead of trusting its own potentially stale
 *     saved session, since the Service keeps running and advancing tracks
 *     natively even while the WebView is frozen/throttled.
 *   setQueue({ tracks, currentIndex })  ← tracks may include isCut: boolean
 *     so native crossfade can skip fading around manually-trimmed tracks.
 *   setPlayMode({ mode })  ← "off" | "shuffle" | "repeat". Needed natively
 *     (not just in JS state) so lock-screen/notification next-track and
 *     crossfade-into-repeat behave correctly even if the WebView never
 *     sees the event.
 *   setCrossfadeDuration({ milliseconds })  ← 0 disables crossfade.
 *   setEqualizerEnabled({ enabled })
 *   setEqualizerBandLevels({ levels })  ← array of millibel ints, one per
 *     band, ordered to match getEqualizerInfo().bandFreqsHz.
 *   getEqualizerInfo()  ← { available, bandFreqsHz, minMillibel, maxMillibel }
 *
 * When the service fires onTrackComplete (end-of-track, including failed
 * loads, and native auto-advance) the plugin emits a "trackComplete" event
 * to JS. It also emits a "stateChange" event on any other state transition
 * (pause/resume/prepare failure) so JS can stay in sync in near-real-time
 * when the WebView is alive — but JS must not depend on never missing one
 * of these; that's what getCurrentSong() is for.
 */
@CapacitorPlugin(name = "AudioPlayer")
public class AudioPlayerPlugin extends Plugin {

    private MusicPlayerService playerService;
    private boolean            bound = false;

    // ── Service connection ──────────────────────────────────────────────────
    private final ServiceConnection connection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder binder) {
            MusicPlayerService.LocalBinder lb =
                    (MusicPlayerService.LocalBinder) binder;
            playerService = lb.getService();
            bound = true;

            // When the track ends natively (even in background), fire an
            // event to JS so it can call play() with the next song.
            playerService.setOnCompletionListener(() -> {
                JSObject data = new JSObject();
                data.put("event", "trackComplete");
                notifyListeners("trackComplete", data);
            });

            // Best-effort live sync for pause/resume/prepare-failure while
            // the WebView is alive. JS should treat this as a hint to
            // refresh via getCurrentSong()/getCurrentPosition(), not as
            // guaranteed delivery.
            playerService.setOnStateChangeListener(() -> {
                JSObject data = new JSObject();
                data.put("isPlaying", playerService.isCurrentlyPlaying());
                data.put("path", playerService.getCurrentPath());
                notifyListeners("stateChange", data);
            });
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            bound = false;
            playerService = null;
        }
    };

    // ── Plugin lifecycle ────────────────────────────────────────────────────
    @Override
    public void load() {
        // Only BIND at app launch — do NOT call startForegroundService() here.
        //
        // Previously this called startForegroundService() on launch, which on
        // Android 12+ obligates the service to call startForeground() within 5
        // seconds. But the service only goes foreground when a song actually
        // plays, which may be much later or never — so the system killed the
        // app with a ForegroundServiceDidNotStartInTimeException. That was the
        // "occasional crash".
        //
        // BIND_AUTO_CREATE creates the service (so onCreate/MediaSession set up)
        // without any foreground obligation. The service promotes itself to
        // foreground from within play(), in direct response to playback — which
        // is always within the 5s window and always user-initiated.
        Intent intent = new Intent(getContext(), MusicPlayerService.class);
        getContext().startService(intent);
        getContext().bindService(intent, connection, Context.BIND_AUTO_CREATE);
    }

    @Override
    protected void handleOnDestroy() {
        if (bound) {
            getContext().unbindService(connection);
            bound = false;
        }
    }

    // ── Helper: extract optional metadata from the call ────────────────────
    /** JS can pass title/artist alongside path for richer lock-screen display. */
    private String getStringOrDefault(PluginCall call, String key, String def) {
        String val = call.getString(key);
        return (val != null && !val.isEmpty()) ? val : def;
    }

    // ── Plugin methods ───────────────────────────────────────────────────────
    @PluginMethod
    public void play(PluginCall call) {
        if (!bound) { call.reject("Service not bound"); return; }
        String path   = call.getString("path");
        String title  = getStringOrDefault(call, "title",  "Unknown");
        String artist = getStringOrDefault(call, "artist", "Unknown");
        if (path == null || path.isEmpty()) { call.reject("path is required"); return; }
        try {
            playerService.play(path, title, artist);
            call.resolve();
        } catch (Exception e) {
            call.reject("Playback failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void pause(PluginCall call) {
        if (bound) playerService.pause();
        call.resolve();
    }

    @PluginMethod
    public void resume(PluginCall call) {
        if (bound) playerService.resume();
        call.resolve();
    }

    @PluginMethod
    public void getCurrentPosition(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("position", bound ? playerService.getCurrentPosition() : 0);
        call.resolve(ret);
    }

    @PluginMethod
    public void getDuration(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("duration", bound ? playerService.getDuration() : 0);
        call.resolve(ret);
    }

    /** Returns { position, duration } in one bridge call. Used by the JS position-polling interval. */
    @PluginMethod
    public void getState(PluginCall call) {
        JSObject ret = new JSObject();
        if (bound) {
            int[] pd = playerService.getPositionAndDuration();
            ret.put("position", pd[0]);
            ret.put("duration", pd[1]);
        } else {
            ret.put("position", 0);
            ret.put("duration", 0);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void seekTo(PluginCall call) {
        if (bound) playerService.seekTo(call.getInt("milliseconds", 0));
        call.resolve();
    }

    /**
     * Returns what the native Service is actually playing right now —
     * the file path it has loaded and whether it's audibly playing.
     *
     * JS should call this on app start/resume to decide what to show,
     * rather than trusting a possibly-stale locally-saved session.
     */
    @PluginMethod
    public void getCurrentSong(PluginCall call) {
        JSObject ret = new JSObject();
        if (bound) {
            String path = playerService.getCurrentPath();
            ret.put("path", path != null ? path : "");
            ret.put("isPlaying", playerService.isCurrentlyPlaying());
        } else {
            ret.put("path", "");
            ret.put("isPlaying", false);
        }
        call.resolve(ret);
    }

    /**
     * Push a copy of the JS-side queue into the native service, plus which
     * index in that queue is currently playing. Called by App.tsx every time
     * the queue changes (new shuffle, skip, song tap, etc.) so the service
     * can advance tracks on its own — from the lock screen, notification, or
     * a Bluetooth headset button — even if this plugin/Activity has since
     * been killed.
     *
     * Expected call shape:
     *   { tracks: [{ path, title, artist, isCut }, ...], currentIndex: number }
     * `isCut` is optional and defaults to false; cut tracks are excluded
     * from crossfade on either side of the transition.
     */
    @PluginMethod
    public void setQueue(PluginCall call) {
        if (!bound) { call.resolve(); return; } // nothing to push to yet, not an error
        JSArray tracksArr = call.getArray("tracks");
        int currentIndex  = call.getInt("currentIndex", -1);
        List<MusicPlayerService.Track> tracks = new ArrayList<>();
        if (tracksArr != null) {
            try {
                for (int i = 0; i < tracksArr.length(); i++) {
                    JSONObject t = tracksArr.getJSONObject(i);
                    tracks.add(new MusicPlayerService.Track(
                            t.optString("path", ""),
                            t.optString("title", "Unknown"),
                            t.optString("artist", "Unknown"),
                            t.optBoolean("isCut", false)
                    ));
                }
            } catch (JSONException e) {
                call.reject("Invalid tracks payload: " + e.getMessage(), e);
                return;
            }
        }
        playerService.setQueue(tracks, currentIndex);
        call.resolve();
    }

    /**
     * Tells native which play mode is active ("off" | "shuffle" | "repeat").
     * Needed so lock-screen/notification next-track and crossfade-into-
     * repeat work even if the WebView never sees the corresponding JS
     * state change (e.g. backgrounded).
     */
    @PluginMethod
    public void setPlayMode(PluginCall call) {
        String mode = call.getString("mode", "off");
        if (bound) playerService.setPlayMode(mode);
        call.resolve();
    }

    /** milliseconds: 0 disables crossfade entirely. */
    @PluginMethod
    public void setCrossfadeDuration(PluginCall call) {
        int ms = call.getInt("milliseconds", 0);
        if (bound) playerService.setCrossfadeDuration(ms);
        call.resolve();
    }

    /** speed: playback rate multiplier. 1.0 == normal. Clamped natively. */
    @PluginMethod
    public void setPlaybackSpeed(PluginCall call) {
        if (!bound) { call.resolve(); return; }
        Double speed = call.getDouble("speed", 1.0);
        playerService.setPlaybackSpeed(speed != null ? speed.floatValue() : 1.0f);
        call.resolve();
    }

    @PluginMethod
    public void getPlaybackSpeed(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("speed", bound ? playerService.getPlaybackSpeed() : 1.0);
        call.resolve(ret);
    }

    /**
     * Returns embedded cover art for the given file path as a base64 string
     * ({ art: "<base64>" }), or empty string when none. The decode runs on a
     * background executor so neither the main thread nor the Capacitor bridge
     * thread is blocked (FIX: ANR). JS prepends the data: URI prefix.
     */
    @PluginMethod
    public void getAlbumArt(PluginCall call) {
        String path = call.getString("path");
        if (!bound) {
            JSObject ret = new JSObject();
            ret.put("art", "");
            call.resolve(ret);
            return;
        }
        playerService.getAlbumArtBase64Async(path, base64 -> {
            JSObject ret = new JSObject();
            ret.put("art", base64 != null ? base64 : "");
            call.resolve(ret);
        });
    }

    /**
     * A downscaled JPEG of the file's embedded cover, for list rows. Returns ""
     * when the file has none, which JS caches as "checked, nothing there" so the
     * same file is never probed twice.
     */
    @PluginMethod
    public void getAlbumArtThumb(PluginCall call) {
        String path = call.getString("path");
        int maxPx = call.getInt("maxPx", 96);
        long albumId = call.getLong("albumId", 0L);
        // "ready" separates "this file has no cover" from "could not look yet".
        // Binding finishes a moment after launch, and without this flag a lookup
        // that lost that race would be cached as "no artwork" for the session.
        if (!bound) {
            JSObject ret = new JSObject();
            ret.put("art", "");
            ret.put("ready", false);
            call.resolve(ret);
            return;
        }
        playerService.getAlbumArtThumbAsync(path, albumId, maxPx, base64 -> {
            JSObject ret = new JSObject();
            ret.put("art", base64 != null ? base64 : "");
            ret.put("ready", true);
            call.resolve(ret);
        });
    }

    /**
     * Hands native the cover the user picked for one track, so the lock screen
     * and notification can show it. Pass a null/empty dataUrl to clear it.
     * Native stores it on disk and remembers it across process death, which is
     * what makes it work when the service advances tracks on its own with the
     * WebView frozen.
     */
    @PluginMethod
    public void setTrackArt(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) { call.reject("path is required"); return; }
        // Rejects rather than resolving quietly: the caller records which covers
        // it has handed over, and must not tick off one that never arrived.
        if (!bound) { call.reject("Service not bound"); return; }
        playerService.setTrackArt(path, call.getString("dataUrl"));
        call.resolve();
    }

    @PluginMethod
    public void setEqualizerEnabled(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);
        if (bound) playerService.setEqualizerEnabled(enabled);
        call.resolve();
    }

    /** levels: array of millibel ints, one per band, in the same order as
     *  getEqualizerInfo().bandFreqsHz. */
    @PluginMethod
    public void setEqualizerBandLevels(PluginCall call) {
        if (!bound) { call.resolve(); return; }
        JSArray levelsArr = call.getArray("levels");
        if (levelsArr == null) { call.reject("levels is required"); return; }
        short[] levels = new short[levelsArr.length()];
        try {
            for (int i = 0; i < levelsArr.length(); i++) {
                levels[i] = (short) levelsArr.getInt(i);
            }
        } catch (JSONException e) {
            call.reject("Invalid levels payload: " + e.getMessage(), e);
            return;
        }
        playerService.setEqualizerBandLevels(levels);
        call.resolve();
    }

    /**
     * Returns the equalizer's band center frequencies (Hz) and valid level
     * range (millibel), so JS can build slider UI. `available` is false on
     * devices/builds without an Equalizer effect — JS should hide the EQ
     * UI in that case rather than show non-functional sliders.
     */
    @PluginMethod
    public void getEqualizerInfo(PluginCall call) {
        JSObject ret = new JSObject();
        if (!bound) {
            ret.put("available", false);
            ret.put("bandFreqsHz", new JSArray());
            ret.put("minMillibel", 0);
            ret.put("maxMillibel", 0);
            call.resolve(ret);
            return;
        }
        int[] freqs = playerService.getEqualizerBandFreqsHz();
        int[] range = playerService.getEqualizerLevelRangeMillibel();
        JSArray freqsArr = new JSArray();
        for (int f : freqs) freqsArr.put(f);
        ret.put("available", freqs.length > 0);
        ret.put("bandFreqsHz", freqsArr);
        ret.put("minMillibel", range[0]);
        ret.put("maxMillibel", range[1]);
        call.resolve(ret);
    }
}