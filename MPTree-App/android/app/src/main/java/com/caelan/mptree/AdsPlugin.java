package com.caelan.mptree;

import android.app.Activity;
import android.content.Context;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;

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

    private boolean online() {
        ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return true;
        NetworkCapabilities caps = cm.getNetworkCapabilities(cm.getActiveNetwork());
        return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
    }
}
