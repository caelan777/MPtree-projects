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
    // The launcher entry is not MainActivity itself but one of four
    // activity-aliases in AndroidManifest.xml, each pointing at MainActivity
    // with its own icon. Exactly one is enabled; switching enables the new one
    // before disabling the old, so there is never a moment with no icon at all.

    private static final String[] ICONS = { "classic", "light", "vinyl", "stamp" };

    private ComponentName iconAlias(String icon) {
        String cls = "Icon" + Character.toUpperCase(icon.charAt(0)) + icon.substring(1);
        return new ComponentName(getContext(), getContext().getPackageName() + "." + cls);
    }

    @PluginMethod
    public void getAppIcon(PluginCall call) {
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

    @PluginMethod
    public void setAppIcon(PluginCall call) {
        String icon = call.getString("icon", "classic");
        boolean known = false;
        for (String i : ICONS) known |= i.equals(icon);
        if (!known) { call.reject("Unknown icon: " + icon); return; }
        try {
            PackageManager pm = getContext().getPackageManager();
            pm.setComponentEnabledSetting(iconAlias(icon),
                    PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
            for (String other : ICONS) {
                if (other.equals(icon)) continue;
                pm.setComponentEnabledSetting(iconAlias(other),
                        PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not change the icon", e);
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
}
