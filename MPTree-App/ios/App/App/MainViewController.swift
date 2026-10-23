import UIKit
import Capacitor

/// The web app's window, with MPTree's own plugins on its bridge. They carry
/// the names and methods of the Android ones (android/.../com/caelan/mptree),
/// so src/plugins.ts talks to both the same way. A plugin that is not here
/// yet is answered by its browser stand-in (see IOS_SWIFT in src/plugins.ts).
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(MusicScannerPlugin())
        bridge?.registerPluginInstance(AudioPlayerPlugin())
        bridge?.registerPluginInstance(SystemPlugin())
        bridge?.registerPluginInstance(AdsPlugin())
    }
}
