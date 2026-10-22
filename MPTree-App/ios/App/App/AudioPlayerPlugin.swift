import UIKit
import Capacitor
import AVFoundation
import MediaPlayer

/// The iPhone's player, in place of AudioPlayerPlugin.java and
/// MusicPlayerService.java, with the same methods and events.
///
/// Native is the source of truth here too: it moves on to the next song by
/// itself (also with the screen locked, or from the lock screen's buttons)
/// and says so with "stateChange", which the web app adopts. "trackComplete"
/// only means the queue has run out. With repeat on, a song that ends plays
/// again; Next always moves on.
///
/// Crossfade, as on Android: near the end the next song starts in a second
/// player, the two are faded across, and the new one becomes the song. Cuts
/// are never faded into or out of. Not here yet: the equaliser, which says it
/// is not available so the app hides it.
@objc(AudioPlayerPlugin)
public class AudioPlayerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AudioPlayerPlugin"
    public let jsName = "AudioPlayer"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getCurrentPosition", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getDuration", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "seekTo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getCurrentSong", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setQueue", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setPlayMode", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setCrossfadeDuration", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setPlaybackSpeed", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPlaybackSpeed", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setMixMode", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAlbumArt", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAlbumArtThumb", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setTrackArt", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setEqualizerEnabled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setEqualizerBandLevels", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getEqualizerInfo", returnType: CAPPluginReturnPromise),
    ]

    private struct Track {
        let path: String
        let title: String
        let artist: String
        /// Milliseconds into the file; cutTo is 0 when the whole file plays.
        let cutFrom: Int
        let cutTo: Int
    }

    // Everything below is only touched on the main thread.
    private var player = AVPlayer()
    /// Looks four times a second whether a crossfade is due.
    private var tick: Any?
    // The crossfade in progress: the song fading in, and its place.
    private var incoming: AVPlayer?
    private var incomingTrack: Track?
    private var incomingIndex = -1
    private var fading = false
    private var fadeTimer: Timer?
    private var queue: [Track] = []
    private var index = -1
    private var mode = "off"
    private var speed: Float = 1
    private var crossfadeMs = 0
    private var current: Track?
    private var isPlaying = false
    private var wasPlayingBeforeInterruption = false
    private var itemObservers: [NSObjectProtocol] = []
    private var statusObservation: NSKeyValueObservation?
    /// Covers the person picked, handed over with setTrackArt.
    private var picked: [String: UIImage] = [:]
    private var nowCover: UIImage?

    private let artQueue = DispatchQueue(label: "mptree.art")
    private let thumbs = NSCache<NSString, NSString>()

    override public func load() {
        player.automaticallyWaitsToMinimizeStalling = false
        configureSession(mix: false, duck: false)
        let nc = NotificationCenter.default
        nc.addObserver(self, selector: #selector(interrupted(_:)), name: AVAudioSession.interruptionNotification, object: nil)
        nc.addObserver(self, selector: #selector(routeChanged(_:)), name: AVAudioSession.routeChangeNotification, object: nil)
        DispatchQueue.main.async {
            self.setUpRemoteCommands()
            self.installTick()
        }
    }

    // MARK: - Playing

    private func url(_ path: String) -> URL {
        path.contains("://") ? (URL(string: path) ?? URL(fileURLWithPath: path)) : URL(fileURLWithPath: path)
    }

    private func ms(_ time: CMTime) -> Int {
        let s = CMTimeGetSeconds(time)
        return s.isFinite && s > 0 ? Int(s * 1000) : 0
    }

    private func configureSession(mix: Bool, duck: Bool) {
        var options: AVAudioSession.CategoryOptions = []
        if mix {
            options.insert(.mixWithOthers)
            if duck { options.insert(.duckOthers) }
        }
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: options)
    }

    private func start(_ t: Track) {
        cancelCrossfade()
        current = t
        let item = AVPlayerItem(url: url(t.path))
        // A cut ends at its end marker the way a file ends at its last sample.
        if t.cutTo > t.cutFrom { item.forwardPlaybackEndTime = CMTime(value: CMTimeValue(t.cutTo), timescale: 1000) }
        observe(item)
        player.replaceCurrentItem(with: item)
        if t.cutFrom > 0 {
            player.seek(to: CMTime(value: CMTimeValue(t.cutFrom), timescale: 1000), toleranceBefore: .zero, toleranceAfter: .zero)
        }
        try? AVAudioSession.sharedInstance().setActive(true)
        player.volume = 1
        player.playImmediately(atRate: speed)
        isPlaying = true
        nowCover = picked[t.path]
        updateNowPlaying()
        if nowCover == nil { loadCover(for: t.path) }
        notifyStateChange()
    }

    /// The end, a failure and the moment it is ready, for the song that is on.
    private func observe(_ item: AVPlayerItem) {
        for o in itemObservers { NotificationCenter.default.removeObserver(o) }
        itemObservers = []
        statusObservation = nil
        let nc = NotificationCenter.default
        itemObservers.append(nc.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
            self?.finished()
        })
        itemObservers.append(nc.addObserver(forName: .AVPlayerItemFailedToPlayToEndTime, object: item, queue: .main) { [weak self] _ in
            self?.finished()
        })
        statusObservation = item.observe(\.status, options: [.new]) { [weak self] item, _ in
            DispatchQueue.main.async {
                guard let self = self, item === self.player.currentItem else { return }
                if item.status == .readyToPlay {
                    self.updateNowPlaying()
                    self.notifyStateChange()
                } else if item.status == .failed {
                    // A file that will not load is passed over, as on Android.
                    self.finished()
                }
            }
        }
    }

    // MARK: - Crossfade

    private func installTick() {
        if let t = tick { player.removeTimeObserver(t) }
        tick = player.addPeriodicTimeObserver(forInterval: CMTime(value: 250, timescale: 1000), queue: .main) { [weak self] _ in
            self?.checkCrossfade()
        }
    }

    /// What plays after this song, and where it is in the queue.
    private func peekNext() -> (Track, Int)? {
        if mode == "repeat", let t = current { return (t, index) }
        let next = index + 1
        guard index >= 0, next < queue.count else { return nil }
        return (queue[next], next)
    }

    private func checkCrossfade() {
        guard crossfadeMs > 0, !fading, isPlaying, let cur = current, cur.cutTo == 0, cur.cutFrom == 0 else { return }
        guard let upcoming = peekNext(), upcoming.0.cutTo == 0, upcoming.0.cutFrom == 0 else { return }
        let (next, at) = upcoming
        let duration = ms(player.currentItem?.duration ?? .zero)
        guard duration > 0 else { return }
        // In real time: at 1.5 times the speed the end comes sooner.
        let remaining = Int(Double(duration - ms(player.currentTime())) / Double(max(speed, 0.01)))
        // A little early, so the next file has time to load before the fade.
        guard remaining <= crossfadeMs + 250, remaining > 150 else { return }
        startCrossfade(into: next, at: at, fadeMs: max(300, min(crossfadeMs, remaining - 100)))
    }

    private func startCrossfade(into t: Track, at i: Int, fadeMs: Int) {
        fading = true
        let p = AVPlayer(playerItem: AVPlayerItem(url: url(t.path)))
        p.automaticallyWaitsToMinimizeStalling = false
        p.volume = 0
        p.playImmediately(atRate: speed)
        incoming = p
        incomingTrack = t
        incomingIndex = i
        let out = player
        let steps = max(1, fadeMs / 50)
        var step = 0
        fadeTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] timer in
            guard let self = self, self.fading else { timer.invalidate(); return }
            step += 1
            let k = Float(min(1.0, Double(step) / Double(steps)))
            out.volume = 1 - k
            p.volume = k
            if step >= steps {
                timer.invalidate()
                self.finishCrossfade()
            }
        }
    }

    /// The song that faded in becomes the song.
    private func finishCrossfade() {
        guard let p = incoming, let t = incomingTrack, let item = p.currentItem else { cancelCrossfade(); return }
        if let tk = tick { player.removeTimeObserver(tk); tick = nil }
        player.pause()
        player.replaceCurrentItem(with: nil)
        player = p
        incoming = nil
        incomingTrack = nil
        fadeTimer = nil
        fading = false
        current = t
        index = incomingIndex
        p.volume = 1
        observe(item)
        installTick()
        nowCover = picked[t.path]
        updateNowPlaying()
        if nowCover == nil { loadCover(for: t.path) }
        notifyStateChange()
    }

    /// Something else happened (a tap, a seek, a pause): the song that was
    /// fading in goes, and the one that is on plays at full volume again.
    private func cancelCrossfade() {
        fadeTimer?.invalidate()
        fadeTimer = nil
        if let p = incoming {
            p.pause()
            p.replaceCurrentItem(with: nil)
        }
        incoming = nil
        incomingTrack = nil
        fading = false
        player.volume = 1
    }

    /// The song is over, by itself or at a cut's end marker.
    private func finished() {
        // It ran out while fading into the next one: the fade carries on and
        // makes that one the song.
        if fading { return }
        guard let t = current else { return }
        if mode == "repeat" {
            // The same place in the queue: a song can be in it twice.
            let keep = index
            start(t)
            index = keep
            return
        }
        skip(1)
    }

    private func skip(_ dir: Int) {
        if queue.isEmpty || index < 0 {
            // No queue to move through: the web app decides.
            notifyListeners("trackComplete", data: ["event": "trackComplete"])
            return
        }
        let next = index + dir
        guard next >= 0, next < queue.count else {
            // The queue has run out: stop, and say so.
            player.pause()
            isPlaying = false
            updateNowPlaying()
            notifyStateChange()
            notifyListeners("trackComplete", data: ["event": "trackComplete"])
            return
        }
        start(queue[next])
        // A cut and the song it came from are one file, so the place is set
        // here rather than looked up by path.
        index = next
    }

    /// Previous on the lock screen: back to the start of this song once it has
    /// played a few seconds, otherwise the song before.
    private func previous() {
        if ms(player.currentTime()) > 3000 || index <= 0 {
            seek(ms: current?.cutFrom ?? 0)
        } else {
            skip(-1)
        }
    }

    private func pausePlayback() {
        cancelCrossfade()
        player.pause()
        isPlaying = false
        updateNowPlaying()
        notifyStateChange()
    }

    private func resumePlayback() {
        if player.currentItem == nil {
            if let t = current { start(t) }
            return
        }
        try? AVAudioSession.sharedInstance().setActive(true)
        player.playImmediately(atRate: speed)
        isPlaying = true
        updateNowPlaying()
        notifyStateChange()
    }

    private func seek(ms value: Int) {
        cancelCrossfade()
        player.seek(to: CMTime(value: CMTimeValue(max(0, value)), timescale: 1000), toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] _ in
            DispatchQueue.main.async { self?.updateNowPlaying() }
        }
    }

    private func notifyStateChange() {
        notifyListeners("stateChange", data: [
            "isPlaying": isPlaying,
            "path": current?.path ?? "",
            "index": index,
        ])
    }

    // MARK: - Methods

    @objc func play(_ call: CAPPluginCall) {
        guard let path = call.getString("path"), !path.isEmpty else { call.reject("path is required"); return }
        let title = call.getString("title").flatMap { $0.isEmpty ? nil : $0 } ?? "Unknown"
        let artist = call.getString("artist").flatMap { $0.isEmpty ? nil : $0 } ?? "Unknown"
        let from = max(0, call.getInt("cutFrom") ?? 0)
        let to = call.getInt("cutTo") ?? 0
        DispatchQueue.main.async {
            if let i = self.queue.firstIndex(where: { $0.path == path }) { self.index = i }
            self.start(Track(path: path, title: title, artist: artist, cutFrom: from, cutTo: to > from ? to : 0))
            call.resolve()
        }
    }

    @objc func pause(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.pausePlayback(); call.resolve() }
    }

    @objc func resume(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.resumePlayback(); call.resolve() }
    }

    @objc func getCurrentPosition(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(["position": self.ms(self.player.currentTime())]) }
    }

    @objc func getDuration(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(["duration": self.ms(self.player.currentItem?.duration ?? .zero)]) }
    }

    @objc func getState(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve([
                "position": self.ms(self.player.currentTime()),
                "duration": self.ms(self.player.currentItem?.duration ?? .zero),
            ])
        }
    }

    @objc func seekTo(_ call: CAPPluginCall) {
        let value = call.getInt("milliseconds") ?? 0
        DispatchQueue.main.async { self.seek(ms: value); call.resolve() }
    }

    @objc func getCurrentSong(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["path": self.current?.path ?? "", "isPlaying": self.isPlaying])
        }
    }

    @objc func setQueue(_ call: CAPPluginCall) {
        let raw = call.getArray("tracks", JSObject.self) ?? []
        let tracks = raw.map { t in
            Track(path: t["path"] as? String ?? "",
                  title: t["title"] as? String ?? "Unknown",
                  artist: t["artist"] as? String ?? "Unknown",
                  cutFrom: t["cutFrom"] as? Int ?? 0,
                  cutTo: t["cutTo"] as? Int ?? 0)
        }
        let at = call.getInt("currentIndex") ?? -1
        DispatchQueue.main.async {
            self.queue = tracks
            self.index = at
            call.resolve()
        }
    }

    @objc func setPlayMode(_ call: CAPPluginCall) {
        let m = call.getString("mode") ?? "off"
        DispatchQueue.main.async {
            if ["off", "shuffle", "repeat"].contains(m) { self.mode = m }
            call.resolve()
        }
    }

    @objc func setCrossfadeDuration(_ call: CAPPluginCall) {
        let value = max(0, call.getInt("milliseconds") ?? 0)
        DispatchQueue.main.async { self.crossfadeMs = value; call.resolve() }
    }

    @objc func setPlaybackSpeed(_ call: CAPPluginCall) {
        let value = Float(call.getDouble("speed") ?? 1.0)
        DispatchQueue.main.async {
            self.speed = min(4, max(0.25, value))
            // Only while playing: setting a rate on a paused player starts it.
            if self.isPlaying { self.player.rate = self.speed }
            self.incoming?.rate = self.speed
            self.updateNowPlaying()
            call.resolve()
        }
    }

    @objc func getPlaybackSpeed(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(["speed": Double(self.speed)]) }
    }

    /// mix: keep playing when another app starts sound; duck: also turn that
    /// one down. With mix on, iOS shows no lock screen controls.
    @objc func setMixMode(_ call: CAPPluginCall) {
        let mix = call.getBool("mix") ?? false
        let duck = call.getBool("duck") ?? false
        DispatchQueue.main.async { self.configureSession(mix: mix, duck: duck); call.resolve() }
    }

    // MARK: - Covers

    /// The file's own cover, as a picture.
    private func embedded(_ path: String) -> UIImage? {
        for item in AVURLAsset(url: url(path)).commonMetadata where item.commonKey == .commonKeyArtwork {
            if let data = item.dataValue, let img = UIImage(data: data) { return img }
        }
        return nil
    }

    /// Base64 JPEG, as Android gives it (the web app adds "data:image/jpeg;base64,").
    private func jpeg(_ img: UIImage, maxPx: Int?) -> String {
        var out = img
        let w = img.size.width * img.scale, h = img.size.height * img.scale
        if let m = maxPx, m > 0, max(w, h) > CGFloat(m) {
            let k = CGFloat(m) / max(w, h)
            let size = CGSize(width: (w * k).rounded(), height: (h * k).rounded())
            let format = UIGraphicsImageRendererFormat()
            format.scale = 1
            out = UIGraphicsImageRenderer(size: size, format: format).image { _ in
                img.draw(in: CGRect(origin: .zero, size: size))
            }
        }
        return out.jpegData(compressionQuality: 0.85)?.base64EncodedString() ?? ""
    }

    @objc func getAlbumArt(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else { call.resolve(["art": ""]); return }
        artQueue.async {
            let img = self.embedded(path)
            call.resolve(["art": img.map { self.jpeg($0, maxPx: 1200) } ?? ""])
        }
    }

    /// A small JPEG for list rows; "" when the file has none.
    @objc func getAlbumArtThumb(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else { call.resolve(["art": "", "ready": true]); return }
        let maxPx = call.getInt("maxPx") ?? 96
        let key = "\(maxPx)|\(path)" as NSString
        artQueue.async {
            if let hit = self.thumbs.object(forKey: key) {
                call.resolve(["art": hit as String, "ready": true])
                return
            }
            let art = self.embedded(path).map { self.jpeg($0, maxPx: maxPx) } ?? ""
            self.thumbs.setObject(art as NSString, forKey: key)
            call.resolve(["art": art, "ready": true])
        }
    }

    /// The cover the person picked for a song, for the lock screen. An empty
    /// dataUrl takes it away again.
    @objc func setTrackArt(_ call: CAPPluginCall) {
        guard let path = call.getString("path"), !path.isEmpty else { call.reject("path is required"); return }
        var img: UIImage?
        if let s = call.getString("dataUrl"), let comma = s.firstIndex(of: ",") {
            if let data = Data(base64Encoded: String(s[s.index(after: comma)...])) { img = UIImage(data: data) }
        }
        DispatchQueue.main.async {
            if let img = img { self.picked[path] = img } else { self.picked.removeValue(forKey: path) }
            if self.current?.path == path {
                self.nowCover = img
                if img == nil { self.loadCover(for: path) }
                self.updateNowPlaying()
            }
            call.resolve()
        }
    }

    private func loadCover(for path: String) {
        artQueue.async {
            let img = self.embedded(path)
            DispatchQueue.main.async {
                guard self.current?.path == path, self.picked[path] == nil else { return }
                self.nowCover = img
                self.updateNowPlaying()
            }
        }
    }

    // MARK: - Equaliser (not on the iPhone yet)

    @objc func setEqualizerEnabled(_ call: CAPPluginCall) { call.resolve() }
    @objc func setEqualizerBandLevels(_ call: CAPPluginCall) { call.resolve() }
    @objc func getEqualizerInfo(_ call: CAPPluginCall) {
        call.resolve(["available": false, "bandFreqsHz": [Int](), "minMillibel": 0, "maxMillibel": 0])
    }

    // MARK: - Lock screen

    private func updateNowPlaying() {
        guard let t = current else {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            return
        }
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: t.title,
            MPMediaItemPropertyArtist: t.artist,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: Double(ms(player.currentTime())) / 1000,
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? Double(speed) : 0.0,
        ]
        let duration = ms(player.currentItem?.duration ?? .zero)
        if duration > 0 { info[MPMediaItemPropertyPlaybackDuration] = Double(duration) / 1000 }
        if let img = nowCover {
            info[MPMediaItemPropertyArtwork] = MPMediaItemArtwork(boundsSize: img.size) { _ in img }
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    private func setUpRemoteCommands() {
        let rc = MPRemoteCommandCenter.shared()
        rc.playCommand.addTarget { [weak self] _ in
            self?.resumePlayback()
            return .success
        }
        rc.pauseCommand.addTarget { [weak self] _ in
            self?.pausePlayback()
            return .success
        }
        rc.togglePlayPauseCommand.addTarget { [weak self] _ in
            guard let self = self else { return .commandFailed }
            if self.isPlaying { self.pausePlayback() } else { self.resumePlayback() }
            return .success
        }
        rc.nextTrackCommand.addTarget { [weak self] _ in
            self?.skip(1)
            return .success
        }
        rc.previousTrackCommand.addTarget { [weak self] _ in
            self?.previous()
            return .success
        }
        rc.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let self = self, let e = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            self.seek(ms: Int(e.positionTime * 1000))
            return .success
        }
    }

    // MARK: - Calls, alarms and headphones

    @objc private func interrupted(_ n: Notification) {
        guard let raw = n.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        let optionsRaw = n.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
        DispatchQueue.main.async {
            if type == .began {
                self.cancelCrossfade()
                if self.isPlaying {
                    self.wasPlayingBeforeInterruption = true
                    self.isPlaying = false
                    self.updateNowPlaying()
                    self.notifyStateChange()
                }
            } else {
                let resume = AVAudioSession.InterruptionOptions(rawValue: optionsRaw).contains(.shouldResume)
                if resume && self.wasPlayingBeforeInterruption { self.resumePlayback() }
                self.wasPlayingBeforeInterruption = false
            }
        }
    }

    /// Headphones out: stop, as every music app does.
    @objc private func routeChanged(_ n: Notification) {
        guard let raw = n.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
              AVAudioSession.RouteChangeReason(rawValue: raw) == .oldDeviceUnavailable else { return }
        DispatchQueue.main.async { if self.isPlaying { self.pausePlayback() } }
    }
}
