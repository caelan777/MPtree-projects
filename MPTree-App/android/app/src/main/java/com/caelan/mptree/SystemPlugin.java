package com.caelan.mptree;

import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;

import androidx.core.content.pm.ShortcutInfoCompat;
import androidx.core.content.pm.ShortcutManagerCompat;
import androidx.core.graphics.drawable.IconCompat;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.webkit.WebSettings;
import android.graphics.Color;
import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.UpdateAvailability;
import com.google.android.play.core.review.ReviewManager;
import com.google.android.play.core.review.ReviewManagerFactory;

/**
 * The phone around the app, as opposed to the music in it: which phone this is,
 * how big the text is, links out to other apps, and whether Google Play has a
 * newer MPTree. The audio side stays on AudioPlayerPlugin.
 */
@CapacitorPlugin(name = "System")
public class SystemPlugin extends Plugin {

    private static final int UPDATE_REQUEST = 7301;

    /** The WebView's own text zoom before MPTree touched it. It already carries
     *  the phone's font size setting, so the in-app size multiplies it rather
     *  than replacing it. Read once, on the UI thread, on first use. */
    private int baseTextZoom = -1;

    private AppUpdateInfo pendingUpdate = null;

    @PluginMethod
    public void getDeviceInfo(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("manufacturer", Build.MANUFACTURER);
        ret.put("model", Build.MODEL);
        ret.put("androidVersion", Build.VERSION.RELEASE);
        ret.put("sdk", Build.VERSION.SDK_INT);
        call.resolve(ret);
    }

    /** factor: 0.9, 1 or 1.15. Scales every piece of text in the app. */
    @PluginMethod
    public void setTextZoom(PluginCall call) {
        Double f = call.getDouble("factor", 1.0);
        final double factor = f != null ? f : 1.0;
        getActivity().runOnUiThread(() -> {
            try {
                WebSettings s = getBridge().getWebView().getSettings();
                if (baseTextZoom < 0) baseTextZoom = s.getTextZoom();
                s.setTextZoom((int) Math.round(baseTextZoom * factor));
                call.resolve();
            } catch (Exception e) {
                call.reject("Could not set text size", e);
            }
        });
    }

    /**
     * Opens a mailto:, market: or https: link in whatever app handles it. Done
     * here rather than by navigating the WebView, so a missing mail app is a
     * rejected call JS can explain instead of a dead tap.
     */
    @PluginMethod
    public void openExternal(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) { call.reject("url is required"); return; }
        Uri uri = Uri.parse(url);
        Intent intent = "mailto".equals(uri.getScheme())
                ? new Intent(Intent.ACTION_SENDTO, uri)
                : new Intent(Intent.ACTION_VIEW, uri);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            // market: with no Play Store installed. The web page is the same listing.
            if ("market".equals(uri.getScheme())) {
                String id = uri.getQueryParameter("id");
                try {
                    getContext().startActivity(new Intent(Intent.ACTION_VIEW,
                            Uri.parse("https://play.google.com/store/apps/details?id=" + id))
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                    call.resolve();
                    return;
                } catch (ActivityNotFoundException ignored) { /* fall through */ }
            }
            call.reject("No app can open this", "NO_HANDLER");
        }
    }

    /**
     * Asks Google Play whether a newer MPTree is out. Only the Play build calls
     * this. On an install that did not come from Play, Play either fails the
     * request or reports nothing available, and both resolve as { available: false }.
     */
    @PluginMethod
    public void checkPlayUpdate(PluginCall call) {
        AppUpdateManager m = AppUpdateManagerFactory.create(getContext());
        m.getAppUpdateInfo()
                .addOnSuccessListener(info -> {
                    boolean ok = info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE
                            && info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE);
                    pendingUpdate = ok ? info : null;
                    JSObject ret = new JSObject();
                    ret.put("available", ok);
                    ret.put("versionCode", ok ? info.availableVersionCode() : 0);
                    call.resolve(ret);
                })
                .addOnFailureListener(e -> {
                    pendingUpdate = null;
                    JSObject ret = new JSObject();
                    ret.put("available", false);
                    call.resolve(ret);
                });
    }

    /** Hands over to Play's own full-screen update. Needs checkPlayUpdate first. */
    @PluginMethod
    public void startPlayUpdate(PluginCall call) {
        if (pendingUpdate == null) { call.reject("No update to start"); return; }
        try {
            AppUpdateManagerFactory.create(getContext()).startUpdateFlowForResult(
                    pendingUpdate, getActivity(),
                    AppUpdateOptions.newBuilder(AppUpdateType.IMMEDIATE).build(),
                    UPDATE_REQUEST);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not start the update", e);
        }
    }

    // ── App icon (MPTree Pro) ────────────────────────────────────────────────
    // The launcher entry is not MainActivity itself but one of six
    // activity-aliases in AndroidManifest.xml, each pointing at MainActivity
    // with its own icon. Exactly one is enabled; switching enables the new one
    // before disabling the old, so there is never a moment with no icon at all.
    //
    // Switching takes the app's window with it on most phones: Android ends a
    // task whose launcher entry was just switched off. So it is never done
    // while MPTree is in front. It is kept as "pending" and done when the app
    // leaves the screen (handleOnStop), or right away after MPTree has closed
    // itself because the person asked it to. Playback goes on either way: the
    // music service outlives the window.

    private static final String[] ICONS = { "classic", "light", "vinyl", "stamp", "aviela", "lantern" };

    private static final String ICON_PREFS = "mptree_icon";
    private static final String ICON_PENDING = "pending";

    private android.content.SharedPreferences iconPrefs() {
        return getContext().getSharedPreferences(ICON_PREFS, android.content.Context.MODE_PRIVATE);
    }

    private ComponentName iconAlias(String icon) {
        String cls = "Icon" + Character.toUpperCase(icon.charAt(0)) + icon.substring(1);
        return new ComponentName(getContext(), getContext().getPackageName() + "." + cls);
    }

    @PluginMethod
    public void getAppIcon(PluginCall call) {
        // One waiting to be switched to counts as the icon already.
        String pending = iconPrefs().getString(ICON_PENDING, null);
        if (pending != null) {
            JSObject ret = new JSObject();
            ret.put("icon", pending);
            call.resolve(ret);
            return;
        }
        PackageManager pm = getContext().getPackageManager();
        String on = "classic";
        for (String icon : ICONS) {
            int state = pm.getComponentEnabledSetting(iconAlias(icon));
            // "Default" means whatever the manifest says, and only classic is
            // enabled there.
            boolean enabled = state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                    || (state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT && icon.equals("classic"));
            if (enabled && !icon.equals("classic")) { on = icon; break; }
        }
        JSObject ret = new JSObject();
        ret.put("icon", on);
        call.resolve(ret);
    }

    /** Google Play's review card, over the app. Play decides whether it is
     *  really shown, and never says what was given. */
    @PluginMethod
    public void askReview(PluginCall call) {
        try {
            ReviewManager manager = ReviewManagerFactory.create(getContext());
            manager.requestReviewFlow().addOnCompleteListener(request -> {
                if (!request.isSuccessful() || getActivity() == null) {
                    JSObject r = new JSObject(); r.put("asked", false); call.resolve(r); return;
                }
                manager.launchReviewFlow(getActivity(), request.getResult()).addOnCompleteListener(done -> {
                    JSObject r = new JSObject(); r.put("asked", true); call.resolve(r);
                });
            });
        } catch (Exception e) {
            JSObject r = new JSObject(); r.put("asked", false); call.resolve(r);
        }
    }

    /** Keeps the icon to switch to. With restart: true MPTree then closes
     *  itself, and the switch follows as it goes; otherwise the switch waits
     *  until the app next leaves the screen. */
    @PluginMethod
    public void setAppIcon(PluginCall call) {
        String icon = call.getString("icon", "classic");
        boolean known = false;
        for (String i : ICONS) known |= i.equals(icon);
        if (!known) { call.reject("Unknown icon: " + icon); return; }
        iconPrefs().edit().putString(ICON_PENDING, icon).commit();
        call.resolve();
        if (Boolean.TRUE.equals(call.getBoolean("restart", false)) && getActivity() != null) {
            getActivity().runOnUiThread(() -> getActivity().finishAndRemoveTask());
        }
    }

    @Override
    protected void handleOnStop() {
        super.handleOnStop();
        String pending = iconPrefs().getString(ICON_PENDING, null);
        if (pending == null) return;
        iconPrefs().edit().remove(ICON_PENDING).commit();
        try {
            switchIcon(pending);
        } catch (Exception e) {
            // Not switched: the picker shows the one that is really on next time.
        }
    }

    private void switchIcon(String icon) {
        PackageManager pm = getContext().getPackageManager();
        pm.setComponentEnabledSetting(iconAlias(icon),
                PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
        for (String other : ICONS) {
            if (other.equals(icon)) continue;
            pm.setComponentEnabledSetting(iconAlias(other),
                    PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
        }
    }

    /** An extra home-screen shortcut with the person's own photo on it. */
    @PluginMethod
    public void pinPhotoShortcut(PluginCall call) {
        String dataUrl = call.getString("dataUrl");
        String label = call.getString("label", "MPTree");
        if (dataUrl == null || !dataUrl.contains(",")) { call.reject("dataUrl is required"); return; }
        if (!ShortcutManagerCompat.isRequestPinShortcutSupported(getContext())) {
            JSObject ret = new JSObject();
            ret.put("supported", false);
            call.resolve(ret);
            return;
        }
        try {
            byte[] bytes = Base64.decode(dataUrl.substring(dataUrl.indexOf(',') + 1), Base64.DEFAULT);
            Bitmap bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            if (bmp == null) { call.reject("That image could not be read"); return; }
            Intent open = new Intent(getContext(), MainActivity.class)
                    .setAction(Intent.ACTION_MAIN)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
            // A new id each time, so a second photo adds a second icon rather
            // than silently replacing the picture on the first.
            ShortcutInfoCompat info = new ShortcutInfoCompat.Builder(getContext(), "photo-" + System.currentTimeMillis())
                    .setShortLabel(label)
                    .setIcon(IconCompat.createWithAdaptiveBitmap(bmp))
                    .setIntent(open)
                    .build();
            boolean asked = ShortcutManagerCompat.requestPinShortcut(getContext(), info, null);
            JSObject ret = new JSObject();
            ret.put("supported", asked);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not add the shortcut", e);
        }
    }

    // ── Sharing a song with its name, artist and cover ──────────────────────
    // A name, artist or cover set in MPTree lives in MPTree only, not in the
    // file, so sharing the file itself loses them. This makes a copy in the
    // cache named "Artist - Title.ext" and, for an mp3, with the title, artist
    // and cover written into its ID3 tag; the other tags in it are kept. Other
    // formats get the name only. The cache folder is emptied each time.
    /** The navigation bar: its colour (older Android; newer ones draw the page
     *  behind it) and dark or light buttons, to suit the theme. */
    @PluginMethod
    public void setNavBar(PluginCall call) {
        boolean light = Boolean.TRUE.equals(call.getBoolean("light", false));
        String color = call.getString("color");
        getActivity().runOnUiThread(() -> {
            try {
                Window w = getActivity().getWindow();
                if (color != null) {
                    try { w.setNavigationBarColor(Color.parseColor(color)); } catch (IllegalArgumentException ignored) { }
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) w.setNavigationBarContrastEnforced(false);
                WindowInsetsControllerCompat c = WindowCompat.getInsetsController(w, w.getDecorView());
                c.setAppearanceLightNavigationBars(light);
                call.resolve();
            } catch (Exception e) {
                call.reject("nav bar: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void prepareShare(PluginCall call) {
        String path = call.getString("path");
        // Several songs at once: the first call empties the folder, the others add.
        boolean clear = !Boolean.FALSE.equals(call.getBoolean("clear", true));
        String title = call.getString("title", "");
        String artist = call.getString("artist", "");
        String cover = call.getString("cover");
        if (path == null) { call.reject("no path"); return; }
        new Thread(() -> {
            try {
                File src = new File(path);
                File dir = new File(getContext().getCacheDir(), "share");
                if (clear) {
                    File[] old = dir.listFiles();
                    if (old != null) for (File f : old) f.delete();
                }
                dir.mkdirs();
                String name = src.getName();
                int dot = name.lastIndexOf('.');
                String ext = dot >= 0 ? name.substring(dot).toLowerCase(Locale.ROOT) : "";
                String base = (artist.isEmpty() ? title : artist + " - " + title).replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "").trim();
                if (base.isEmpty()) base = dot >= 0 ? name.substring(0, dot) : name;
                if (base.length() > 120) base = base.substring(0, 120).trim();
                File out = new File(dir, base + ext);
                // Two songs with the same name: "Name (2)".
                for (int n = 2; out.exists(); n++) out = new File(dir, base + " (" + n + ")" + ext);
                boolean tagged = ext.equals(".mp3") && writeMp3(src, out, title, artist, decodeCover(cover));
                if (!tagged) { out.delete(); appendRange(src, out, 0, src.length()); }
                JSObject ret = new JSObject();
                ret.put("path", out.getAbsolutePath());
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("share copy failed: " + e.getMessage());
            }
        }).start();
    }

    /** { mime, picture } from a data: URL, or null. */
    private static byte[][] decodeCover(String cover) {
        if (cover == null || !cover.startsWith("data:")) return null;
        int comma = cover.indexOf(',');
        int semi = cover.indexOf(';');
        if (comma < 0 || semi < 0 || semi > comma) return null;
        byte[] mime = cover.substring(5, semi).getBytes(StandardCharsets.ISO_8859_1);
        return new byte[][] { mime, Base64.decode(cover.substring(comma + 1), Base64.DEFAULT) };
    }

    private static void appendRange(File src, File out, long from, long len) throws IOException {
        try (RandomAccessFile in = new RandomAccessFile(src, "r");
             OutputStream os = new BufferedOutputStream(new FileOutputStream(out, true))) {
            in.seek(from);
            byte[] buf = new byte[65536];
            long left = len;
            while (left > 0) {
                int n = in.read(buf, 0, (int) Math.min(buf.length, left));
                if (n < 0) break;
                os.write(buf, 0, n);
                left -= n;
            }
        }
    }

    private static int syncsafe(byte[] b, int o) {
        return ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);
    }

    private static int plain(byte[] b, int o) {
        return ((b[o] & 0xff) << 24) | ((b[o + 1] & 0xff) << 16) | ((b[o + 2] & 0xff) << 8) | (b[o + 3] & 0xff);
    }

    private static void putSize(ByteArrayOutputStream o, int n, boolean safe) {
        if (safe) { o.write((n >> 21) & 0x7f); o.write((n >> 14) & 0x7f); o.write((n >> 7) & 0x7f); o.write(n & 0x7f); }
        else { o.write(n >>> 24); o.write((n >> 16) & 0xff); o.write((n >> 8) & 0xff); o.write(n & 0xff); }
    }

    private static void frame(ByteArrayOutputStream o, String id, byte[] data, boolean safe) {
        o.write(id.getBytes(StandardCharsets.ISO_8859_1), 0, 4);
        putSize(o, data.length, safe);
        o.write(0); o.write(0);
        o.write(data, 0, data.length);
    }

    /** A text frame's body: UTF-16 with its byte order mark. */
    private static byte[] text(String s) {
        byte[] t = s.getBytes(StandardCharsets.UTF_16);
        byte[] d = new byte[t.length + 1];
        d[0] = 1;
        System.arraycopy(t, 0, d, 1, t.length);
        return d;
    }

    /** False when the file's own tag is a kind this does not rewrite (v2.2,
     *  unsynchronised, extended header): the caller then sends a plain copy. */
    private static boolean writeMp3(File src, File out, String title, String artist, byte[][] cover) throws IOException {
        long fileLen = src.length();
        int major = 3;
        long audioFrom = 0;
        long audioEnd = fileLen;
        ByteArrayOutputStream kept = new ByteArrayOutputStream();
        try (RandomAccessFile in = new RandomAccessFile(src, "r")) {
            byte[] head = new byte[10];
            if (fileLen >= 10) in.readFully(head);
            if (fileLen >= 10 && head[0] == 'I' && head[1] == 'D' && head[2] == '3') {
                major = head[3];
                int flags = head[5] & 0xff;
                int size = syncsafe(head, 6);
                if ((major != 3 && major != 4) || (flags & 0xc0) != 0 || size > 16 * 1024 * 1024) return false;
                audioFrom = 10 + size + ((flags & 0x10) != 0 ? 10 : 0);
                byte[] tag = new byte[size];
                in.readFully(tag);
                int p = 0;
                while (p + 10 <= size && tag[p] != 0) {
                    String id = new String(tag, p, 4, StandardCharsets.ISO_8859_1);
                    int fs = major == 4 ? syncsafe(tag, p + 4) : plain(tag, p + 4);
                    if (fs < 0 || p + 10 + fs > size) break;
                    boolean drop = id.equals("TIT2") || id.equals("TPE1") || (cover != null && id.equals("APIC"));
                    if (!drop) kept.write(tag, p, 10 + fs);
                    p += 10 + fs;
                }
            }
            // An old ID3v1 tag at the end would still give the file's own title.
            if (fileLen - audioFrom >= 128) {
                byte[] v1 = new byte[3];
                in.seek(fileLen - 128);
                in.readFully(v1);
                if (v1[0] == 'T' && v1[1] == 'A' && v1[2] == 'G') audioEnd = fileLen - 128;
            }
        }
        boolean safe = major == 4;
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        if (!title.isEmpty()) frame(body, "TIT2", text(title), safe);
        if (!artist.isEmpty()) frame(body, "TPE1", text(artist), safe);
        if (cover != null) {
            ByteArrayOutputStream a = new ByteArrayOutputStream();
            a.write(0);
            a.write(cover[0], 0, cover[0].length);
            a.write(0);
            a.write(3);
            a.write(0);
            a.write(cover[1], 0, cover[1].length);
            frame(body, "APIC", a.toByteArray(), safe);
        }
        byte[] k = kept.toByteArray();
        body.write(k, 0, k.length);
        int padding = 256;
        ByteArrayOutputStream h = new ByteArrayOutputStream();
        h.write('I'); h.write('D'); h.write('3'); h.write(major); h.write(0); h.write(0);
        putSize(h, body.size() + padding, true);
        try (FileOutputStream os = new FileOutputStream(out)) {
            h.writeTo(os);
            body.writeTo(os);
            os.write(new byte[padding]);
        }
        appendRange(src, out, audioFrom, audioEnd - audioFrom);
        return true;
    }
}
