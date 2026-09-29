package com.caelan.mptree;

import android.app.Activity;

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

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * One rewarded ad, for the MPTree Pro day pass. Nothing else in MPTree shows
 * ads: no banners, nothing between songs. An ad only loads when someone taps
 * "watch an ad", so the ad SDK does not touch the network before that.
 *
 * Before the first ad, Google's consent form (UMP) asks people in the EU and
 * the UK what they allow. It only shows where the law asks for it, and only
 * once; the answer can be changed later from Settings (showPrivacyOptions).
 */
@CapacitorPlugin(name = "Ads")
public class AdsPlugin extends Plugin {

    private boolean initialised = false;
    /** One ad at a time, whatever JS asks for. */
    private boolean busy = false;

    /** Resolves { rewarded, reason? } once the ad is closed or could not show.
     *  reason: "closed" (closed before the reward), "consent", "nofill",
     *  "offline" or "error". */
    @PluginMethod
    public void showRewarded(PluginCall call) {
        String unit = call.getString("adUnitId");
        if (unit == null || unit.isEmpty()) { call.reject("No ad unit"); return; }
        if (busy) { call.reject("An ad is already on its way"); return; }
        Activity activity = getActivity();
        busy = true;
        activity.runOnUiThread(() -> withConsent(activity, call, () -> loadAndShow(activity, call, unit)));
    }

    private void withConsent(Activity activity, PluginCall call, Runnable next) {
        ConsentInformation info = UserMessagingPlatform.getConsentInformation(activity);
        ConsentRequestParameters params = new ConsentRequestParameters.Builder().build();
        info.requestConsentInfoUpdate(activity, params,
            () -> UserMessagingPlatform.loadAndShowConsentFormIfRequired(activity, formError -> {
                if (info.canRequestAds()) next.run();
                else done(call, false, "consent");
            }),
            // The consent service could not be asked (it also says so for an
            // app with no consent message set up, like the test build). The ad
            // is still asked for; Google then only serves what needs no consent.
            requestError -> next.run());
    }

    private void loadAndShow(Activity activity, PluginCall call, String unit) {
        if (!initialised) {
            initialised = true;
            new Thread(() -> MobileAds.initialize(activity.getApplicationContext(), status -> {})).start();
        }
        RewardedAd.load(activity, unit, new AdRequest.Builder().build(), new RewardedAdLoadCallback() {
            @Override
            public void onAdLoaded(@NonNull RewardedAd ad) {
                AtomicBoolean earned = new AtomicBoolean(false);
                ad.setFullScreenContentCallback(new FullScreenContentCallback() {
                    @Override
                    public void onAdDismissedFullScreenContent() {
                        done(call, earned.get(), earned.get() ? null : "closed");
                    }
                    @Override
                    public void onAdFailedToShowFullScreenContent(@NonNull AdError e) {
                        done(call, false, "error");
                    }
                });
                ad.show(activity, reward -> earned.set(true));
            }

            @Override
            public void onAdFailedToLoad(@NonNull LoadAdError e) {
                int code = e.getCode();
                done(call, false,
                    code == AdRequest.ERROR_CODE_NO_FILL ? "nofill"
                    : code == AdRequest.ERROR_CODE_NETWORK_ERROR ? "offline"
                    : "error");
            }
        });
    }

    private void done(PluginCall call, boolean rewarded, String reason) {
        busy = false;
        JSObject r = new JSObject();
        r.put("rewarded", rewarded);
        if (reason != null) r.put("reason", reason);
        call.resolve(r);
    }

    /** Whether the law asks for a way to change the ad consent (EU, UK). */
    @PluginMethod
    public void privacyOptions(PluginCall call) {
        ConsentInformation info = UserMessagingPlatform.getConsentInformation(getContext());
        JSObject r = new JSObject();
        r.put("required", info.getPrivacyOptionsRequirementStatus()
            == ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED);
        call.resolve(r);
    }

    /** Google's form for changing the ad consent given before. */
    @PluginMethod
    public void showPrivacyOptions(PluginCall call) {
        Activity activity = getActivity();
        activity.runOnUiThread(() -> UserMessagingPlatform.showPrivacyOptionsForm(activity, formError -> {
            if (formError != null) call.reject(formError.getMessage());
            else call.resolve();
        }));
    }
}
