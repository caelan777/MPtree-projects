import UIKit
import Capacitor
import GoogleMobileAds
import AppTrackingTransparency

/// The iPhone's half of AdsPlugin.java: the rewarded ad that gives a day of
/// Pro. The web app picks the ad unit (src/pro.ts); while the iPhone build is
/// sideloaded that is always Google's test unit, and Info.plist carries
/// Google's test app id.
///
/// Before the first ad, iOS asks whether apps may track ("allow tracking?").
/// Either answer works; without it the ads are just not personal.
///
/// The answers match Android's: { rewarded } and, when not rewarded, a reason
/// of "offline", "none" (no ad to show), "closed" (closed early) or "failed".
/// Google's consent screen for the EU (privacyOptions) is not here yet.
@objc(AdsPlugin)
public class AdsPlugin: CAPPlugin, CAPBridgedPlugin, FullScreenContentDelegate {
    public let identifier = "AdsPlugin"
    public let jsName = "Ads"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "showRewarded", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "privacyOptions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showPrivacyOptions", returnType: CAPPluginReturnPromise),
    ]

    private var started = false
    // The ad on screen, and the call that waits for how it ended.
    private var ad: RewardedAd?
    private var call: CAPPluginCall?
    private var earned = false

    @objc func showRewarded(_ call: CAPPluginCall) {
        guard let unit = call.getString("adUnitId"), !unit.isEmpty else {
            call.resolve(["rewarded": false, "reason": "failed"])
            return
        }
        DispatchQueue.main.async {
            if self.call != nil { call.resolve(["rewarded": false, "reason": "failed"]); return }
            self.call = call
            self.earned = false
            self.askTracking { self.load(unit) }
        }
    }

    /// "Allow tracking?" once, before the first ad. iOS only asks while the
    /// app is in front, which it is when someone taps Watch ad.
    private func askTracking(then go: @escaping () -> Void) {
        guard ATTrackingManager.trackingAuthorizationStatus == .notDetermined else { go(); return }
        ATTrackingManager.requestTrackingAuthorization { _ in DispatchQueue.main.async { go() } }
    }

    private func load(_ unit: String) {
        if !started {
            started = true
            MobileAds.shared.start(completionHandler: nil)
        }
        RewardedAd.load(with: unit, request: Request()) { [weak self] ad, error in
            DispatchQueue.main.async {
                guard let self = self else { return }
                if let error = error as NSError? {
                    // Google's error codes: 1 no ad to show, 2 no network.
                    self.finish(false, reason: error.code == 2 ? "offline" : error.code == 1 ? "none" : "failed")
                    return
                }
                guard let ad = ad, let screen = self.bridge?.viewController else {
                    self.finish(false, reason: "failed")
                    return
                }
                self.ad = ad
                ad.fullScreenContentDelegate = self
                ad.present(from: screen) { [weak self] in self?.earned = true }
            }
        }
    }

    public func adDidDismissFullScreenContent(_ ad: FullScreenPresentingAd) {
        DispatchQueue.main.async { self.finish(self.earned, reason: self.earned ? nil : "closed") }
    }

    public func ad(_ ad: FullScreenPresentingAd, didFailToPresentFullScreenContentWithError error: Error) {
        DispatchQueue.main.async { self.finish(false, reason: "failed") }
    }

    private func finish(_ rewarded: Bool, reason: String?) {
        guard let call = call else { return }
        self.call = nil
        ad = nil
        var r: [String: Any] = ["rewarded": rewarded]
        if let reason = reason { r["reason"] = reason }
        call.resolve(r)
    }

    @objc func privacyOptions(_ call: CAPPluginCall) { call.resolve(["required": false]) }
    @objc func showPrivacyOptions(_ call: CAPPluginCall) { call.resolve() }
}
