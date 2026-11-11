package com.caelan.mptree.tv;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothClass;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSessionManager;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewParent;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PermissionState;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.ByteArrayOutputStream;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * What makes MPTree TV a home screen rather than an app: it lists the apps on the
 * TV (with their TV banners), opens them, and tells the page when the Home button
 * is pressed or an app comes or goes. The page itself is src/launcher.ts.
 */
@CapacitorPlugin(name = "Launcher", permissions = {
        @Permission(strings = { Manifest.permission.BLUETOOTH_CONNECT }, alias = "bluetooth")
})
public class LauncherPlugin extends Plugin {

    /** Banners are 16:9; drawn at this width, which is plenty for a tile. */
    private static final int BANNER_W = 480;
    private static final int ICON_PX = 160;

    private BroadcastReceiver packageReceiver;
    private BroadcastReceiver screenReceiver;

    @Override
    public void load() {
        // An app installed, updated or removed: the page reads the list again.
        packageReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                notifyListeners("appsChanged", new JSObject());
            }
        };
        IntentFilter filter = new IntentFilter();
        filter.addAction(Intent.ACTION_PACKAGE_ADDED);
        filter.addAction(Intent.ACTION_PACKAGE_REMOVED);
        filter.addAction(Intent.ACTION_PACKAGE_CHANGED);
        filter.addDataScheme("package");
        // System broadcasts still arrive with NOT_EXPORTED; nothing else can send them to us.
        ContextCompat.registerReceiver(getContext(), packageReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED);

        // The TV going to standby and coming back: the page plays the logo intro
        // when it comes on, and never starts on the screensaver. Android only
        // sends these to receivers registered while running, like this one.
        screenReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String a = intent.getAction();
                if (Intent.ACTION_SCREEN_ON.equals(a)) {
                    uncoverLater();
                    notifyListeners("screenOn", new JSObject());
                } else if (Intent.ACTION_SCREEN_OFF.equals(a)) {
                    cover();
                    notifyListeners("screenOff", new JSObject());
                }
            }
        };
        IntentFilter screen = new IntentFilter();
        screen.addAction(Intent.ACTION_SCREEN_ON);
        screen.addAction(Intent.ACTION_SCREEN_OFF);
        ContextCompat.registerReceiver(getContext(), screenReceiver, screen, ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    @Override
    protected void handleOnDestroy() {
        if (packageReceiver != null) {
            try { getContext().unregisterReceiver(packageReceiver); } catch (IllegalArgumentException ignored) { }
            packageReceiver = null;
        }
        if (screenReceiver != null) {
            try { getContext().unregisterReceiver(screenReceiver); } catch (IllegalArgumentException ignored) { }
            screenReceiver = null;
        }
    }

    // ── the black sheet while the TV is off ──
    // The screen goes dark before the page can draw itself black, so when it comes
    // on again the WebView first shows its last picture, Home, and only then the
    // intro. A black view over it from the moment the screen goes off hides that;
    // the page takes it away (uncover) once it has drawn the intro.

    /** Should the page never take the sheet away, it goes by itself this long after the screen comes on. */
    private static final long COVER_MAX_MS = 15_000;
    private View cover;

    private void cover() {
        getActivity().runOnUiThread(() -> {
            if (cover != null) return;
            View v = new View(getActivity());
            v.setBackgroundColor(Color.BLACK);
            v.setFocusable(false);
            ((ViewGroup) getActivity().getWindow().getDecorView())
                    .addView(v, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            cover = v;
        });
    }

    private void uncoverLater() {
        getActivity().runOnUiThread(() -> {
            final View v = cover;
            if (v != null) v.postDelayed(() -> { if (cover == v) removeCover(); }, COVER_MAX_MS);
        });
    }

    private void removeCover() {
        if (cover == null) return;
        ViewParent parent = cover.getParent();
        if (parent instanceof ViewGroup) ((ViewGroup) parent).removeView(cover);
        cover = null;
    }

    @PluginMethod
    public void uncover(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            removeCover();
            call.resolve();
        });
    }

    /** How long ago the TV started. The launcher starting within minutes of that
     *  is the TV turning on, and the page plays its intro. */
    @PluginMethod
    public void startInfo(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("sinceBootMs", SystemClock.elapsedRealtime());
        call.resolve(ret);
    }

    /** The Home button while this is already the screen in front: back to Home. */
    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (intent != null && intent.hasCategory(Intent.CATEGORY_HOME)) {
            notifyListeners("home", new JSObject());
        }
    }

    /** Drawing every banner takes seconds just after the TV starts. On its own
     *  thread, so the plugin's other calls (startInfo above all: whether to play the
     *  intro) are not queued behind it; they waited six seconds for it at boot. */
    @PluginMethod
    public void listApps(PluginCall call) {
        new Thread(() -> readApps(call), "listApps").start();
    }

    private void readApps(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        String self = getContext().getPackageName();

        // TV apps first (they have banners), then anything else that can be opened.
        Map<String, ResolveInfo> found = new LinkedHashMap<>();
        for (String category : new String[] { Intent.CATEGORY_LEANBACK_LAUNCHER, Intent.CATEGORY_LAUNCHER }) {
            Intent query = new Intent(Intent.ACTION_MAIN).addCategory(category);
            List<ResolveInfo> list = pm.queryIntentActivities(query, 0);
            for (ResolveInfo ri : list) {
                String pkg = ri.activityInfo.packageName;
                if (pkg.equals(self) || found.containsKey(pkg)) continue;
                found.put(pkg, ri);
            }
        }

        JSArray apps = new JSArray();
        for (Map.Entry<String, ResolveInfo> e : found.entrySet()) {
            ResolveInfo ri = e.getValue();
            JSObject app = new JSObject();
            app.put("packageName", e.getKey());
            app.put("label", String.valueOf(ri.loadLabel(pm)));

            Drawable banner = ri.activityInfo.loadBanner(pm);
            if (banner == null) banner = ri.activityInfo.applicationInfo.loadBanner(pm);
            if (banner != null) {
                app.put("image", toDataUrl(banner, BANNER_W, BANNER_W * 9 / 16));
                app.put("isBanner", true);
            } else {
                app.put("image", toDataUrl(ri.loadIcon(pm), ICON_PX, ICON_PX));
                app.put("isBanner", false);
            }
            apps.put(app);
        }

        JSObject ret = new JSObject();
        ret.put("apps", apps);
        call.resolve(ret);
    }

    @PluginMethod
    public void launch(PluginCall call) {
        String pkg = call.getString("packageName");
        if (pkg == null) { call.reject("No packageName"); return; }
        PackageManager pm = getContext().getPackageManager();
        Intent intent = pm.getLeanbackLaunchIntentForPackage(pkg);
        if (intent == null) intent = pm.getLaunchIntentForPackage(pkg);
        if (intent == null) { call.reject("Cannot open " + pkg); return; }
        // An app that understands it can be told what to do as it opens:
        // MPTree takes "shuffle" (shuffle all songs). CLEAR_TOP makes a running
        // MPTree get it too (onNewIntent), not just come to the front.
        String action = call.getString("action");
        if (action != null) {
            intent.putExtra("mptree_action", action);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        } else {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        }
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception ex) {
            call.reject("Cannot open " + pkg, ex);
        }
    }

    /**
     * Shuffle all songs in MPTree without MPTree's screen opening: its
     * ShuffleActivity has no window, starts MPTree's player and closes again, so
     * this screen stays in front. An MPTree from before it has no such activity:
     * then this fails and the page opens MPTree with "shuffle" instead.
     */
    @PluginMethod
    public void shuffleMptree(PluginCall call) {
        Intent intent = new Intent()
                .setClassName(MPTREE, MPTREE + ".ShuffleActivity")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_ANIMATION);
        if (intent.resolveActivity(getContext().getPackageManager()) == null) {
            call.reject("This MPTree can't shuffle in the background");
            return;
        }
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception ex) {
            call.reject("MPTree would not shuffle", ex);
        }
    }

    // ── the living-room speaker ──
    // The Speaker button: Bluetooth on, then the paired speaker connected. Android
    // has no public "connect this speaker" call, so the hidden A2DP connect() is
    // tried; where Android refuses it, Bluetooth coming on is usually enough, since
    // it reconnects the speaker it last played on by itself. Should neither work
    // in time, the page opens the TV's Bluetooth screen to pick it there.

    private static final String SPEAKER_PREFS = "mptree_tv_speaker";
    private static final long SPEAKER_WAIT_MS = 12_000;

    private BluetoothAdapter adapter() {
        BluetoothManager m = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return m != null ? m.getAdapter() : null;
    }

    private boolean mayUseBluetooth() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S || getPermissionState("bluetooth") == PermissionState.GRANTED;
    }

    /** { state: "connected" | "off" | "on" | "none" }: "none" is no Bluetooth, or not allowed yet. */
    @PluginMethod
    public void speakerState(PluginCall call) {
        BluetoothAdapter a = adapter();
        JSObject ret = new JSObject();
        if (a == null || !mayUseBluetooth()) ret.put("state", "none");
        else if (!a.isEnabled()) ret.put("state", "off");
        else ret.put("state", a.getProfileConnectionState(BluetoothProfile.A2DP) == BluetoothProfile.STATE_CONNECTED ? "connected" : "on");
        call.resolve(ret);
    }

    /** Resolves { connected, name } once the speaker plays, or after SPEAKER_WAIT_MS without it. */
    @PluginMethod
    public void connectSpeaker(PluginCall call) {
        if (!mayUseBluetooth()) { requestPermissionForAlias("bluetooth", call, "speakerAllowed"); return; }
        connectNow(call);
    }

    @PermissionCallback
    private void speakerAllowed(PluginCall call) {
        if (mayUseBluetooth()) connectNow(call);
        else call.reject("Bluetooth was not allowed");
    }

    @SuppressWarnings({"MissingPermission", "deprecation"})
    private void connectNow(PluginCall call) {
        BluetoothAdapter a = adapter();
        if (a == null) { call.reject("This TV has no Bluetooth"); return; }
        // Android 12 still lets an app switch Bluetooth on itself (13 and later only by asking).
        if (!a.isEnabled() && !a.enable()) { call.reject("Bluetooth would not switch on"); return; }
        final long until = SystemClock.elapsedRealtime() + SPEAKER_WAIT_MS;
        final android.os.Handler h = new android.os.Handler(android.os.Looper.getMainLooper());
        h.post(new Runnable() {
            boolean asked = false;
            @Override public void run() {
                if (!a.isEnabled()) {
                    if (SystemClock.elapsedRealtime() < until) h.postDelayed(this, 300); else done(call, null);
                    return;
                }
                if (!asked) {
                    asked = true;
                    a.getProfileProxy(getContext(), new BluetoothProfile.ServiceListener() {
                        @Override public void onServiceConnected(int profile, BluetoothProfile proxy) {
                            BluetoothDevice target = speakerOf(a);
                            if (target != null && proxy.getConnectionState(target) != BluetoothProfile.STATE_CONNECTED) {
                                try { proxy.getClass().getMethod("connect", BluetoothDevice.class).invoke(proxy, target); }
                                catch (Exception refused) { /* Android's own reconnect, below */ }
                            }
                            waitFor(proxy, a, call, until, h);
                        }
                        @Override public void onServiceDisconnected(int profile) { }
                    }, BluetoothProfile.A2DP);
                }
            }
        });
    }

    @SuppressWarnings("MissingPermission")
    private void waitFor(BluetoothProfile proxy, BluetoothAdapter a, PluginCall call, long until, android.os.Handler h) {
        List<BluetoothDevice> on = proxy.getConnectedDevices();
        if (!on.isEmpty()) {
            BluetoothDevice d = on.get(0);
            getContext().getSharedPreferences(SPEAKER_PREFS, Context.MODE_PRIVATE).edit().putString("address", d.getAddress()).apply();
            a.closeProfileProxy(BluetoothProfile.A2DP, proxy);
            done(call, d.getName());
        } else if (SystemClock.elapsedRealtime() < until) {
            h.postDelayed(() -> waitFor(proxy, a, call, until, h), 500);
        } else {
            a.closeProfileProxy(BluetoothProfile.A2DP, proxy);
            done(call, null);
        }
    }

    /** The speaker: the one that last connected through this button, else the first
     *  paired audio device (a speaker or a soundbar, not a remote or a phone). */
    @SuppressWarnings("MissingPermission")
    private BluetoothDevice speakerOf(BluetoothAdapter a) {
        String saved = getContext().getSharedPreferences(SPEAKER_PREFS, Context.MODE_PRIVATE).getString("address", null);
        BluetoothDevice first = null;
        for (BluetoothDevice d : a.getBondedDevices()) {
            if (d.getAddress().equals(saved)) return d;
            BluetoothClass c = d.getBluetoothClass();
            if (first == null && c != null && c.getMajorDeviceClass() == BluetoothClass.Device.Major.AUDIO_VIDEO) first = d;
        }
        return first;
    }

    private void done(PluginCall call, String name) {
        JSObject ret = new JSObject();
        ret.put("connected", name != null);
        if (name != null) ret.put("name", name);
        call.resolve(ret);
    }

    @PluginMethod
    public void openBluetoothSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_BLUETOOTH_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception ex) {
            call.reject("Cannot open Bluetooth settings", ex);
        }
    }

    @PluginMethod
    public void openSystemSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception ex) {
            call.reject("Cannot open settings", ex);
        }
    }

    /**
     * Starts the TV's own screensaver (Google's ambient mode with the photos) now.
     * Android has no public way to do this; SystemUI's Somnambulator is the
     * activity behind "start now" in the screensaver settings and works on most
     * TVs. If this TV has none, the call fails and the page shows MPTree's own.
     */
    @PluginMethod
    public void startScreensaver(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_MAIN)
                .setClassName("com.android.systemui", "com.android.systemui.Somnambulator")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception ex) {
            call.reject("This TV cannot start its screensaver from an app", ex);
        }
    }

    // ── What is playing on this TV ──────────────────────────────────────────

    private static final String MPTREE = "com.caelan.mptree";
    private static final int ART_PX = 256;
    /** The last cover sent, so it is only drawn and sent again when the song changes. */
    private String artKey = null;
    private String artUrl = null;

    /** Every app on the TV that is playing (or paused on) something, or null when
     *  the launcher is not allowed to see them (see MediaListener). */
    private List<MediaController> sessions() {
        try {
            MediaSessionManager msm = (MediaSessionManager) getContext().getSystemService(Context.MEDIA_SESSION_SERVICE);
            if (msm == null) return Collections.emptyList();
            List<MediaController> list = msm.getActiveSessions(new ComponentName(getContext(), MediaListener.class));
            return list != null ? list : Collections.<MediaController>emptyList();
        } catch (SecurityException ex) {
            return null;
        }
    }

    private static boolean isPlaying(MediaController c) {
        PlaybackState ps = c.getPlaybackState();
        if (ps == null) return false;
        int st = ps.getState();
        return st == PlaybackState.STATE_PLAYING || st == PlaybackState.STATE_BUFFERING;
    }

    private static String titleOf(MediaController c) {
        MediaMetadata md = c.getMetadata();
        if (md == null) return null;
        String t = md.getString(MediaMetadata.METADATA_KEY_TITLE);
        if (t == null && md.getDescription() != null && md.getDescription().getTitle() != null) t = md.getDescription().getTitle().toString();
        return t == null || t.isEmpty() ? null : t;
    }

    /** MPTree's session, playing or paused. Music on Home is only ever MPTree's:
     *  another app's video or a speaker is never shown (or paused) from here. */
    private static MediaController pick(List<MediaController> list) {
        MediaController best = null;
        for (MediaController c : list) {
            if (!MPTREE.equals(c.getPackageName()) || titleOf(c) == null) continue;
            if (best == null || (isPlaying(c) && !isPlaying(best))) best = c;
        }
        return best;
    }

    /**
     * The song MPTree plays on this TV: { allowed, package, app, title, artist, playing,
     * position, duration (seconds), canPrev, canNext, artKey, art }. `art` (a JPEG
     * data URL) is left out when the page already has it: it passes the artKey it has.
     */
    @PluginMethod
    public void nowPlaying(PluginCall call) {
        JSObject ret = new JSObject();
        List<MediaController> list = sessions();
        ret.put("allowed", list != null);
        MediaController c = list == null ? null : pick(list);
        if (c == null) { call.resolve(ret); return; }

        MediaMetadata md = c.getMetadata();
        PlaybackState ps = c.getPlaybackState();
        String pkg = c.getPackageName();
        String title = titleOf(c);
        String artist = md.getString(MediaMetadata.METADATA_KEY_ARTIST);
        if (artist == null) artist = md.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST);
        boolean playing = isPlaying(c);
        ret.put("package", pkg);
        ret.put("app", appLabel(pkg));
        ret.put("title", title);
        ret.put("artist", artist == null ? "" : artist);
        ret.put("playing", playing);

        long duration = md.getLong(MediaMetadata.METADATA_KEY_DURATION);
        if (duration > 0) ret.put("duration", duration / 1000.0);
        if (ps != null && ps.getPosition() >= 0) {
            long pos = ps.getPosition();
            // The position is as of its last update; while playing it has moved on since.
            if (playing && ps.getLastPositionUpdateTime() > 0) {
                pos += (long) ((SystemClock.elapsedRealtime() - ps.getLastPositionUpdateTime()) * ps.getPlaybackSpeed());
            }
            if (duration > 0) pos = Math.min(pos, duration);
            ret.put("position", Math.max(0, pos) / 1000.0);
        }
        long actions = ps == null ? 0 : ps.getActions();
        ret.put("canPrev", (actions & PlaybackState.ACTION_SKIP_TO_PREVIOUS) != 0);
        ret.put("canNext", (actions & PlaybackState.ACTION_SKIP_TO_NEXT) != 0);

        // The picture is part of the key: MPTree first sends its logo and then, once
        // it has read it from the file, the song's cover, under the same song.
        Bitmap art = md.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART);
        if (art == null) art = md.getBitmap(MediaMetadata.METADATA_KEY_ART);
        if (art == null) art = md.getBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON);
        int[] print = art == null ? null : print(art);
        String key = pkg + "|" + title + "|" + (artist == null ? "" : artist) + "|" + md.getString(MediaMetadata.METADATA_KEY_ALBUM)
                + "|" + (print == null ? "" : Integer.toHexString(java.util.Arrays.hashCode(print)));
        if (!key.equals(artKey)) {
            // MPTree's logo, sent when a song has no cover, is not a cover: none then.
            artUrl = art == null || isMptreeLogo(print) ? null : toJpeg(art);
            artKey = key;
        }
        ret.put("artKey", key);
        if (!key.equals(call.getString("artKey"))) ret.put("art", artUrl);
        call.resolve(ret);
    }

    /** A picture boiled down to 12 x 12 colours: enough to tell two apart, cheap to
     *  make on every poll. */
    private static int[] print(Bitmap b) {
        Bitmap s = Bitmap.createScaledBitmap(b, 12, 12, true);
        int[] px = new int[144];
        s.getPixels(px, 0, 12, 0, 0, 12, 12);
        if (s != b) s.recycle();
        return px;
    }

    private int[] logoPrint;
    private boolean logoRead;

    /** Whether a picture is MPTree's stand-in (its album_art_logo), read from MPTree
     *  itself so a new logo there needs nothing here. Close colours, not equal ones:
     *  the media session may have scaled it. */
    private boolean isMptreeLogo(int[] p) {
        if (p == null) return false;
        if (!logoRead) {
            logoRead = true;
            try {
                android.content.res.Resources r = getContext().getPackageManager().getResourcesForApplication(MPTREE);
                int id = r.getIdentifier("album_art_logo", "drawable", MPTREE);
                Bitmap logo = id == 0 ? null : android.graphics.BitmapFactory.decodeResource(r, id);
                if (logo != null) logoPrint = print(logo);
            } catch (Exception ignored) { }
        }
        if (logoPrint == null) return false;
        long diff = 0;
        for (int i = 0; i < p.length; i++) {
            int a = p[i], b = logoPrint[i];
            diff += Math.abs(((a >> 16) & 255) - ((b >> 16) & 255)) + Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)) + Math.abs((a & 255) - (b & 255));
        }
        return diff / (p.length * 3) < 14;
    }

    /** Play, pause, toggle, next or prev on what nowPlaying shows. */
    @PluginMethod
    public void mediaControl(PluginCall call) {
        String action = call.getString("action", "toggle");
        List<MediaController> list = sessions();
        if (list == null) { call.reject("Not allowed to see what plays on this TV"); return; }
        MediaController c = pick(list);
        if (c == null) { call.reject("Nothing is playing"); return; }
        MediaController.TransportControls tc = c.getTransportControls();
        switch (action) {
            case "play": tc.play(); break;
            case "pause": tc.pause(); break;
            case "next": tc.skipToNext(); break;
            case "prev": tc.skipToPrevious(); break;
            default: if (isPlaying(c)) tc.pause(); else tc.play(); break;
        }
        call.resolve();
    }

    private String appLabel(String pkg) {
        try {
            PackageManager pm = getContext().getPackageManager();
            return String.valueOf(pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)));
        } catch (Exception ex) {
            return pkg;
        }
    }

    private static String toJpeg(Bitmap src) {
        try {
            int w = src.getWidth(), h = src.getHeight();
            if (w <= 0 || h <= 0) return null;
            float k = Math.min(1f, (float) ART_PX / Math.max(w, h));
            Bitmap bmp = k < 1f ? Bitmap.createScaledBitmap(src, Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)), true) : src;
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            bmp.compress(Bitmap.CompressFormat.JPEG, 85, out);
            return "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
        } catch (Exception ex) {
            return null;
        }
    }

    /** Draws any drawable (adaptive icons included) into a PNG data URL. */
    private static String toDataUrl(Drawable d, int w, int h) {
        if (d == null) return null;
        Bitmap bmp;
        if (d instanceof BitmapDrawable && ((BitmapDrawable) d).getBitmap() != null) {
            bmp = Bitmap.createScaledBitmap(((BitmapDrawable) d).getBitmap(), w, h, true);
        } else {
            bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(bmp);
            d.setBounds(0, 0, w, h);
            d.draw(canvas);
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        bmp.compress(Bitmap.CompressFormat.PNG, 100, out);
        return "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
    }
}
