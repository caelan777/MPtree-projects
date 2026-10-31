package com.caelan.mptree.tv;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.provider.Settings;
import android.util.Base64;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * What makes MPTree TV a home screen rather than an app: it lists the apps on the
 * TV (with their TV banners), opens them, and tells the page when the Home button
 * is pressed or an app comes or goes. The page itself is src/launcher.ts.
 */
@CapacitorPlugin(name = "Launcher")
public class LauncherPlugin extends Plugin {

    /** Banners are 16:9; drawn at this width, which is plenty for a tile. */
    private static final int BANNER_W = 480;
    private static final int ICON_PX = 160;

    private BroadcastReceiver packageReceiver;

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
    }

    @Override
    protected void handleOnDestroy() {
        if (packageReceiver != null) {
            try { getContext().unregisterReceiver(packageReceiver); } catch (IllegalArgumentException ignored) { }
            packageReceiver = null;
        }
    }

    /** The Home button while this is already the screen in front: back to Home. */
    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (intent != null && intent.hasCategory(Intent.CATEGORY_HOME)) {
            notifyListeners("home", new JSObject());
        }
    }

    @PluginMethod
    public void listApps(PluginCall call) {
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
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception ex) {
            call.reject("Cannot open " + pkg, ex);
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
