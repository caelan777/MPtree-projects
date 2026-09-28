package com.caelan.mptree;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
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
     * Android's sound settings. On a Samsung that is where "Separate app sound"
     * lives. Samsung's own screen for it has no documented entry point, so this
     * stops one level short of it and the app spells out the rest of the path.
     */
    @PluginMethod
    public void openSoundSettings(PluginCall call) {
        try {
            getContext().startActivity(new Intent(Settings.ACTION_SOUND_SETTINGS)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("No sound settings screen", "NO_HANDLER");
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
}
