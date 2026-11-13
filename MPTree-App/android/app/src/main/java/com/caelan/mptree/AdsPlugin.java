package com.caelan.mptree;

import android.app.Activity;
import android.content.Context;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.graphics.Color;
import android.graphics.Rect;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import com.google.android.gms.ads.AdListener;
import com.google.android.gms.ads.AdLoader;
import com.google.android.gms.ads.nativead.MediaView;
import com.google.android.gms.ads.nativead.NativeAd;
import com.google.android.gms.ads.nativead.NativeAdOptions;
import com.google.android.gms.ads.nativead.NativeAdView;

import androidx.annotation.NonNull;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;

/**
 * Rewarded video ads (Google AdMob), the way to try MPTree Pro: one ad
 * watched to the end is a day of Pro (src/pro.ts keeps the day).
 *
 * Nothing here runs until someone asks for an ad. Then, in this order:
 * Google's consent question where the law asks for one (UMP: in the EU and
 * the UK it is shown once and can be changed later from Settings), the SDK
 * started, one ad loaded, and shown. The call resolves when the ad is gone,
 * with rewarded true only if it was watched to the end.
 *
 * The ad unit comes from JS, so a test build can use Google's test unit and
 * the Play build the real one. The AdMob app id is in the manifest
 * (build.gradle, admobAppId).
 */
@CapacitorPlugin(name = "Ads")
public class AdsPlugin extends Plugin {

    private boolean started = false;
    /** One ad at a time; a second tap while one is loading is turned away. */
    private boolean busy = false;

    @PluginMethod
    public void showRewarded(PluginCall call) {
        String unit = call.getString("adUnitId");
        if (unit == null || unit.isEmpty()) { done(call, false, "failed"); return; }
        if (busy) { call.reject("An ad is already on its way", "BUSY"); return; }
        if (!online()) { done(call, false, "offline"); return; }
        Activity activity = getActivity();
        if (activity == null) { done(call, false, "failed"); return; }
        busy = true;
        activity.runOnUiThread(() -> askConsent(activity, call, unit));
    }

    /** Whether Settings needs a "Privacy choices for ads" row (EU and UK). */
    @PluginMethod
    public void privacyOptions(PluginCall call) {
        JSObject r = new JSObject();
        Activity activity = getActivity();
        r.put("required", activity != null
            && UserMessagingPlatform.getConsentInformation(activity).getPrivacyOptionsRequirementStatus()
               == ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED);
        call.resolve(r);
    }

    /** Google's own form for changing the answer to the consent question. */
    @PluginMethod
    public void showPrivacyOptions(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) { call.resolve(); return; }
        activity.runOnUiThread(() ->
            UserMessagingPlatform.showPrivacyOptionsForm(activity, error -> call.resolve()));
    }

    private void askConsent(Activity activity, PluginCall call, String unit) {
        ConsentInformation consent = UserMessagingPlatform.getConsentInformation(activity);
        ConsentRequestParameters params = new ConsentRequestParameters.Builder().build();
        consent.requestConsentInfoUpdate(activity, params,
            () -> UserMessagingPlatform.loadAndShowConsentFormIfRequired(activity, formError -> {
                if (consent.canRequestAds()) start(activity, call, unit);
                else finish(call, false, "consent");
            }),
            // Google could not be asked. An earlier answer still counts.
            requestError -> {
                if (consent.canRequestAds()) start(activity, call, unit);
                else finish(call, false, "failed");
            });
    }

    private void start(Activity activity, PluginCall call, String unit) {
        if (started) { load(activity, call, unit); return; }
        MobileAds.initialize(activity.getApplicationContext(), status -> {
            started = true;
            load(activity, call, unit);
        });
    }

    private void load(Activity activity, PluginCall call, String unit) {
        RewardedAd.load(activity, unit, new AdRequest.Builder().build(), new RewardedAdLoadCallback() {
            @Override
            public void onAdLoaded(@NonNull RewardedAd ad) { show(activity, call, ad); }

            @Override
            public void onAdFailedToLoad(@NonNull LoadAdError error) {
                finish(call, false, error.getCode() == AdRequest.ERROR_CODE_NO_FILL ? "none" : "failed");
            }
        });
    }

    private void show(Activity activity, PluginCall call, RewardedAd ad) {
        final boolean[] earned = { false };
        ad.setFullScreenContentCallback(new FullScreenContentCallback() {
            @Override
            public void onAdDismissedFullScreenContent() { finish(call, earned[0], earned[0] ? null : "closed"); }

            @Override
            public void onAdFailedToShowFullScreenContent(@NonNull AdError error) { finish(call, false, "failed"); }
        });
        ad.show(activity, reward -> earned[0] = true);
    }

    private void finish(PluginCall call, boolean rewarded, String reason) {
        busy = false;
        done(call, rewarded, reason);
    }

    /** reason, when not rewarded: offline, consent (the person said no to
     *  ads of any kind), none (Google had no ad), closed, or failed. */
    private static void done(PluginCall call, boolean rewarded, String reason) {
        JSObject r = new JSObject();
        r.put("rewarded", rewarded);
        if (reason != null) r.put("reason", reason);
        call.resolve(r);
    }

    // ── The ad on the Discover page ──────────────────────────────────────────
    // A native ad, drawn by Android over a gap the page leaves for it under
    // Popular this week, in the page's own colours so it reads as part of it.
    // AdMob only allows native ads in its own NativeAdView, so it cannot be
    // HTML: the page tells where its gap is (placeNative) as it scrolls, and
    // the view follows, cut off where the header card or the screen ends.
    // Only asked for once the person has answered the consent question (on a
    // first rewarded ad, in the EU): this page never brings the form up itself.

    private NativeAd nativeAd;
    private NativeAdView nativeView;
    private boolean nativeBusy = false;

    @PluginMethod
    public void loadNative(PluginCall call) {
        String unit = call.getString("adUnitId");
        if (unit == null || unit.isEmpty() || nativeBusy) { nativeDone(call, false); return; }
        if (nativeAd != null && nativeView != null) { nativeDone(call, true); return; }
        if (!online()) { nativeDone(call, false); return; }
        Activity activity = getActivity();
        if (activity == null) { nativeDone(call, false); return; }
        JSObject c = call.getObject("colours", new JSObject());
        nativeBusy = true;
        activity.runOnUiThread(() -> {
            ConsentInformation consent = UserMessagingPlatform.getConsentInformation(activity);
            consent.requestConsentInfoUpdate(activity, new ConsentRequestParameters.Builder().build(),
                () -> { if (consent.canRequestAds()) startNative(activity, call, unit, c); else { nativeBusy = false; nativeDone(call, false); } },
                e -> { if (consent.canRequestAds()) startNative(activity, call, unit, c); else { nativeBusy = false; nativeDone(call, false); } });
        });
    }

    private void startNative(Activity activity, PluginCall call, String unit, JSObject c) {
        Runnable go = () -> new AdLoader.Builder(activity, unit)
            .forNativeAd(ad -> activity.runOnUiThread(() -> {
                nativeBusy = false;
                if (activity.isDestroyed()) { ad.destroy(); nativeDone(call, false); return; }
                if (nativeAd != null) nativeAd.destroy();
                nativeAd = ad;
                buildNativeView(activity, ad, c);
                nativeDone(call, true);
            }))
            .withAdListener(new AdListener() {
                @Override public void onAdFailedToLoad(@NonNull LoadAdError error) { nativeBusy = false; nativeDone(call, false); }
            })
            .withNativeAdOptions(new NativeAdOptions.Builder()
                .setAdChoicesPlacement(NativeAdOptions.ADCHOICES_TOP_RIGHT).build())
            .build()
            .loadAd(new AdRequest.Builder().build());
        if (started) go.run();
        else MobileAds.initialize(activity.getApplicationContext(), status -> { started = true; go.run(); });
    }

    private static int colour(JSObject c, String key, String fallback) {
        try { return Color.parseColor(c.getString(key, fallback)); } catch (Exception e) { return Color.parseColor(fallback); }
    }

    private void buildNativeView(Activity activity, NativeAd ad, JSObject c) {
        removeNativeView();
        float d = activity.getResources().getDisplayMetrics().density;
        int text = colour(c, "text", "#ffffff"), muted = colour(c, "muted", "#9a9a9a");
        int card = colour(c, "card", "#141414"), border = colour(c, "border", "#2a2a2a");
        int accent = colour(c, "accent", "#ffffff"), onAccent = colour(c, "onAccent", "#000000");
        int line = Math.max(1, Math.round(d));

        NativeAdView view = new NativeAdView(activity);
        LinearLayout box = new LinearLayout(activity);
        box.setOrientation(LinearLayout.VERTICAL);
        int pad = Math.round(14 * d);
        box.setPadding(pad, pad, pad, pad);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(card); bg.setCornerRadius(16 * d); bg.setStroke(line, border);
        box.setBackground(bg);

        TextView badge = new TextView(activity);
        badge.setText("AD");
        badge.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10);
        badge.setTypeface(Typeface.DEFAULT_BOLD);
        badge.setTextColor(muted);
        GradientDrawable badgeBg = new GradientDrawable();
        badgeBg.setCornerRadius(4 * d); badgeBg.setStroke(line, border);
        badge.setBackground(badgeBg);
        badge.setPadding(Math.round(5 * d), Math.round(1 * d), Math.round(5 * d), Math.round(1 * d));
        box.addView(badge, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView headline = new TextView(activity);
        headline.setText(ad.getHeadline());
        headline.setTextColor(text);
        headline.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        headline.setTypeface(Typeface.DEFAULT_BOLD);
        headline.setMaxLines(1);
        headline.setEllipsize(TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams hl = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        hl.topMargin = Math.round(6 * d);
        box.addView(headline, hl);
        view.setHeadlineView(headline);

        if (ad.getBody() != null) {
            TextView body = new TextView(activity);
            body.setText(ad.getBody());
            body.setTextColor(muted);
            body.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
            body.setMaxLines(2);
            body.setEllipsize(TextUtils.TruncateAt.END);
            LinearLayout.LayoutParams bl = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            bl.topMargin = Math.round(2 * d);
            box.addView(body, bl);
            view.setBodyView(body);
        }

        MediaView media = new MediaView(activity);
        media.setImageScaleType(ImageView.ScaleType.CENTER_INSIDE);
        LinearLayout.LayoutParams ml = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f);
        ml.topMargin = Math.round(10 * d);
        ml.bottomMargin = Math.round(12 * d);
        box.addView(media, ml);
        view.setMediaView(media);

        if (ad.getCallToAction() != null) {
            TextView cta = new TextView(activity);
            cta.setText(ad.getCallToAction().toUpperCase());
            cta.setTextColor(onAccent);
            cta.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
            cta.setTypeface(Typeface.DEFAULT_BOLD);
            cta.setGravity(Gravity.CENTER);
            GradientDrawable ctaBg = new GradientDrawable();
            ctaBg.setColor(accent); ctaBg.setCornerRadius(22 * d);
            cta.setBackground(ctaBg);
            box.addView(cta, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Math.round(44 * d)));
            view.setCallToActionView(cta);
        }

        view.addView(box, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        view.setNativeAd(ad);
        view.setVisibility(View.INVISIBLE);

        WebView web = getBridge().getWebView();
        ViewGroup parent = (ViewGroup) web.getParent();
        parent.addView(view, new ViewGroup.LayoutParams(1, 1));
        nativeView = view;
    }

    /** Where the page's gap for the ad is now, in CSS pixels from the top left
     *  of the page, and between which heights it may show (under the header
     *  card, above the player). visible false hides it. */
    @PluginMethod
    public void placeNative(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) { call.resolve(); return; }
        boolean visible = Boolean.TRUE.equals(call.getBoolean("visible", false));
        float x = call.getFloat("x", 0f), y = call.getFloat("y", 0f);
        float w = call.getFloat("w", 0f), h = call.getFloat("h", 0f);
        float top = call.getFloat("clipTop", 0f), bottom = call.getFloat("clipBottom", 100000f);
        activity.runOnUiThread(() -> {
            NativeAdView v = nativeView;
            if (v == null) return;
            float d = activity.getResources().getDisplayMetrics().density;
            int wp = Math.round(w * d), hp = Math.round(h * d);
            int from = Math.max(0, Math.round((top - y) * d)), to = Math.min(hp, Math.round((bottom - y) * d));
            if (!visible || wp <= 0 || hp <= 0 || to <= from) { v.setVisibility(View.INVISIBLE); return; }
            ViewGroup.LayoutParams lp = v.getLayoutParams();
            if (lp.width != wp || lp.height != hp) { lp.width = wp; lp.height = hp; v.setLayoutParams(lp); }
            WebView web = getBridge().getWebView();
            v.setX(web.getX() + x * d);
            v.setY(web.getY() + y * d);
            v.setClipBounds(from == 0 && to == hp ? null : new Rect(0, from, wp, to));
            v.setVisibility(View.VISIBLE);
        });
        call.resolve();
    }

    @PluginMethod
    public void destroyNative(PluginCall call) {
        Activity activity = getActivity();
        if (activity != null) activity.runOnUiThread(() -> {
            removeNativeView();
            if (nativeAd != null) { nativeAd.destroy(); nativeAd = null; }
        });
        call.resolve();
    }

    private void removeNativeView() {
        if (nativeView != null && nativeView.getParent() instanceof ViewGroup) ((ViewGroup) nativeView.getParent()).removeView(nativeView);
        nativeView = null;
    }

    private static void nativeDone(PluginCall call, boolean loaded) {
        JSObject r = new JSObject();
        r.put("loaded", loaded);
        call.resolve(r);
    }

    private boolean online() {
        ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return true;
        NetworkCapabilities caps = cm.getNetworkCapabilities(cm.getActiveNetwork());
        return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
    }
}
