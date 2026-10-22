import UIKit
import Capacitor

/// The iPhone's half of SystemPlugin.java: the device, links and text size.
/// Play's updates and review card do not exist here, and app icons come
/// later (Personalise hides Icons on the iPhone until then).
@objc(SystemPlugin)
public class SystemPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SystemPlugin"
    public let jsName = "System"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getDeviceInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setTextZoom", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openExternal", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkPlayUpdate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startPlayUpdate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAppIcon", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAppIcon", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "askReview", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pinPhotoShortcut", returnType: CAPPluginReturnPromise),
    ]

    @objc func getDeviceInfo(_ call: CAPPluginCall) {
        // The hardware name, e.g. "iPhone15,2", tells phones apart in feedback
        // mail better than "iPhone" does.
        var sys = utsname()
        uname(&sys)
        let machine = withUnsafePointer(to: &sys.machine) {
            $0.withMemoryRebound(to: CChar.self, capacity: 1) { String(cString: $0) }
        }
        DispatchQueue.main.async {
            call.resolve([
                "manufacturer": "Apple",
                "model": machine,
                "androidVersion": "iOS " + UIDevice.current.systemVersion,
                "sdk": 0,
            ])
        }
    }

    /// Android scales the WebView's text; WebKit on the iPhone does the same
    /// with -webkit-text-size-adjust.
    @objc func setTextZoom(_ call: CAPPluginCall) {
        let factor = call.getDouble("factor") ?? 1.0
        let percent = Int((factor * 100).rounded())
        DispatchQueue.main.async {
            self.bridge?.webView?.evaluateJavaScript(
                "document.documentElement.style.webkitTextSizeAdjust = '\(percent)%'", completionHandler: nil)
            call.resolve()
        }
    }

    @objc func openExternal(_ call: CAPPluginCall) {
        guard let s = call.getString("url"), let url = URL(string: s) else {
            call.reject("url is required")
            return
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { ok in
                if ok { call.resolve() } else { call.reject("Could not open the link") }
            }
        }
    }

    @objc func checkPlayUpdate(_ call: CAPPluginCall) { call.resolve(["available": false]) }
    @objc func startPlayUpdate(_ call: CAPPluginCall) { call.resolve() }
    @objc func getAppIcon(_ call: CAPPluginCall) { call.resolve(["icon": "classic"]) }
    @objc func setAppIcon(_ call: CAPPluginCall) { call.resolve() }
    @objc func askReview(_ call: CAPPluginCall) { call.resolve(["asked": false]) }
    @objc func pinPhotoShortcut(_ call: CAPPluginCall) { call.resolve(["supported": false]) }
}
