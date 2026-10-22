import UIKit
import Capacitor
import AVFoundation
import MediaPlayer
import UniformTypeIdentifiers

/// Where MPTree's songs come from on an iPhone. An app there cannot look
/// through the phone for music, so every scan reads:
///   - its own folder in the Files app ("On My iPhone", MPTree), without the
///     song copies inside backups (a folder with a .nomedia file is skipped);
///   - every folder the person gave it (Music folders), kept with bookmarks so
///     the permission lasts;
///   - the Music library, once allowed and switched on: only songs stored on
///     the iPhone and not locked by Apple (Apple Music's own songs are).
///
/// Every song carries an `id` that survives app updates. The app's folder
/// moves with each update, so a full path, which Android uses as the id,
/// would not: docs/<path>, f<key>/<path>, lib/<persistentID>. The `uri` is
/// the real path (or the Music library's URL), worked out again on each scan.
@objc(MusicScannerPlugin)
public class MusicScannerPlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate {
    public let identifier = "MusicScannerPlugin"
    public let jsName = "MusicScanner"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "scan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hasAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scanFolder", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteFiles", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cutTrack", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openAppSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAsRingtone", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getLyrics", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "addSongs", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "addFolder", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "folders", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeFolder", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "musicLibrary", returnType: CAPPluginReturnPromise),
    ]

    private let fm = FileManager.default
    /// Scans, the folder list and the tag cache are only touched on this queue.
    private let work = DispatchQueue(label: "mptree.scanner")
    private static let audioTypes: Set<String> = [
        "mp3", "m4a", "m4b", "aac", "wav", "aif", "aiff", "aifc", "caf", "flac", "alac",
    ]
    private static let foldersKey = "mptree.folders"
    private static let nextKey = "mptree.folderNext"
    private static let libraryKey = "mptree.musicLibrary"

    private var docs: URL { fm.urls(for: .documentDirectory, in: .userDomainMask)[0] }

    // ── Tags, cached ─────────────────────────────────────────────────────────
    // Reading a file's tags costs a few milliseconds, and the app scans each
    // time it comes to the front. So what was read is kept, on disk too, and
    // read again only when the file changed (its size or modification date).
    private struct Entry: Codable {
        var size: Int64
        var modified: Double
        var title: String, artist: String, album: String, genre: String
        var duration: Int, track: Int, disc: Int, year: Int
    }
    private var cache: [String: Entry] = [:]
    private var cacheLoaded = false
    private var cacheDirty = false
    private var cacheFile: URL {
        fm.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("mptree-tags.json")
    }

    // ── Folders the person gave MPTree ───────────────────────────────────────
    private struct Folder { let key: String; let name: String; let url: URL }
    /// Resolved and opened once, and kept open for as long as the app runs:
    /// the player reads from them too.
    private var opened: [String: URL] = [:]

    // The picker in progress, and what it is for.
    private var pickCall: CAPPluginCall?
    private var pickingFolder = false

    // MARK: - Scanning

    @objc func scan(_ call: CAPPluginCall) {
        work.async {
            self.loadCache()
            var songs: [[String: Any]] = []
            self.collect(root: self.docs, prefix: "docs", into: &songs)
            for f in self.openFolders() {
                self.collect(root: f.url, prefix: "f" + f.key, into: &songs)
            }
            if self.libraryOn() { self.collectLibrary(into: &songs) }
            self.saveCache()
            call.resolve(["songs": songs])
        }
    }

    @objc func hasAccess(_ call: CAPPluginCall) {
        // Its own folder needs no permission; the others were given when added.
        call.resolve(["granted": true])
    }

    /// After a restore, the backup's songs become part of the library. Android
    /// asks its media index to look at the folder; here every scan reads the
    /// files themselves, so all that is left is taking away the .nomedia
    /// marker a backup leaves in its music folder (see below).
    @objc func scanFolder(_ call: CAPPluginCall) {
        if let path = call.getString("path") {
            let marker = URL(fileURLWithPath: path.replacingOccurrences(of: "file://", with: "")).appendingPathComponent(".nomedia")
            try? fm.removeItem(at: marker)
        }
        call.resolve()
    }

    private func real(_ url: URL) -> String { url.resolvingSymlinksInPath().standardizedFileURL.path }

    private func collect(root: URL, prefix: String, into songs: inout [[String: Any]]) {
        let base = real(root)
        guard let it = fm.enumerator(at: root,
                                     includingPropertiesForKeys: [.isRegularFileKey, .isDirectoryKey, .fileSizeKey, .contentModificationDateKey, .creationDateKey],
                                     options: [], errorHandler: { _, _ in true }) else { return }
        for case let url as URL in it {
            let name = url.lastPathComponent
            // A song in iCloud Drive that is not on the iPhone yet shows as
            // ".Name.mp3.icloud": ask for it, and it is there next time.
            if name.hasPrefix(".") {
                if name.hasSuffix(".icloud") {
                    let realName = String(name.dropFirst().dropLast(".icloud".count))
                    let target = url.deletingLastPathComponent().appendingPathComponent(realName)
                    if Self.audioTypes.contains(target.pathExtension.lowercased()) {
                        try? fm.startDownloadingUbiquitousItem(at: target)
                    }
                }
                if (try? url.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory == true { it.skipDescendants() }
                continue
            }
            // A folder with a .nomedia file in it is left out, as Android's
            // media index does: a backup puts one in its copy of the songs,
            // which would otherwise all show up twice.
            if (try? url.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory == true {
                if fm.fileExists(atPath: url.appendingPathComponent(".nomedia").path) { it.skipDescendants() }
                continue
            }
            guard Self.audioTypes.contains(url.pathExtension.lowercased()) else { continue }
            let vals = try? url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey, .contentModificationDateKey, .creationDateKey])
            guard vals?.isRegularFile == true else { continue }
            let path = real(url)
            var rel = path.hasPrefix(base + "/") ? String(path.dropFirst(base.count + 1)) : name
            if rel.isEmpty { rel = name }
            let size = Int64(vals?.fileSize ?? 0)
            let modified = vals?.contentModificationDate?.timeIntervalSince1970 ?? 0
            let e = tags(for: url, path: path, size: size, modified: modified)
            let added = vals?.creationDate ?? vals?.contentModificationDate ?? Date()
            songs.append([
                "id": prefix + "/" + rel,
                "uri": path,
                "title": e.title,
                "artist": e.artist,
                "album": e.album,
                "albumId": 0,
                "duration": e.duration,
                "dateAdded": Int64(added.timeIntervalSince1970 * 1000),
                "track": e.track,
                "disc": e.disc,
                "year": e.year,
                "genre": e.genre,
            ])
        }
    }

    private func tags(for url: URL, path: String, size: Int64, modified: Double) -> Entry {
        if let e = cache[path], e.size == size, e.modified == modified { return e }
        let asset = AVURLAsset(url: url)
        var e = Entry(size: size, modified: modified,
                      title: "", artist: "", album: "", genre: "",
                      duration: 0, track: 0, disc: 0, year: 0)
        for item in asset.commonMetadata {
            guard let key = item.commonKey else { continue }
            switch key {
            case .commonKeyTitle: e.title = item.stringValue ?? e.title
            case .commonKeyArtist: e.artist = item.stringValue ?? e.artist
            case .commonKeyAlbumName: e.album = item.stringValue ?? e.album
            case .commonKeyType: e.genre = item.stringValue ?? e.genre
            case .commonKeyCreationDate:
                if let v = item.stringValue, let y = Int(v.prefix(4)) { e.year = y }
            default: break
            }
        }
        for item in asset.metadata {
            guard let ident = item.identifier else { continue }
            switch ident {
            case .id3MetadataTrackNumber:
                if let v = item.stringValue { e.track = Int(v.split(separator: "/").first ?? "") ?? e.track }
            case .id3MetadataPartOfASet:
                if let v = item.stringValue { e.disc = Int(v.split(separator: "/").first ?? "") ?? e.disc }
            case .iTunesMetadataTrackNumber:
                if let d = item.dataValue { let b = [UInt8](d); if b.count >= 4 { e.track = Int(b[2]) << 8 | Int(b[3]) } }
            case .iTunesMetadataDiscNumber:
                if let d = item.dataValue { let b = [UInt8](d); if b.count >= 4 { e.disc = Int(b[2]) << 8 | Int(b[3]) } }
            case .id3MetadataYear, .id3MetadataRecordingTime, .iTunesMetadataReleaseDate:
                if e.year == 0, let v = item.stringValue, let y = Int(v.prefix(4)) { e.year = y }
            case .id3MetadataContentType, .iTunesMetadataUserGenre:
                if e.genre.isEmpty, let v = item.stringValue { e.genre = v }
            default: break
            }
        }
        if e.title.isEmpty { e.title = url.deletingPathExtension().lastPathComponent }
        let secs = CMTimeGetSeconds(asset.duration)
        e.duration = secs.isFinite && secs > 0 ? Int(secs * 1000) : 0
        cache[path] = e
        cacheDirty = true
        return e
    }

    private func loadCache() {
        if cacheLoaded { return }
        cacheLoaded = true
        if let data = try? Data(contentsOf: cacheFile),
           let saved = try? JSONDecoder().decode([String: Entry].self, from: data) {
            cache = saved
        }
    }

    private func saveCache() {
        guard cacheDirty else { return }
        cacheDirty = false
        if let data = try? JSONEncoder().encode(cache) { try? data.write(to: cacheFile, options: .atomic) }
    }

    // MARK: - The Music library

    private func libraryOn() -> Bool {
        UserDefaults.standard.bool(forKey: Self.libraryKey) && MPMediaLibrary.authorizationStatus() == .authorized
    }

    private func collectLibrary(into songs: inout [[String: Any]]) {
        let items = MPMediaQuery.songs().items ?? []
        for item in items {
            // Apple Music's own songs have no file to read, or are locked.
            guard let url = item.assetURL, !item.hasProtectedAsset else { continue }
            var year = 0
            if let d = item.releaseDate { year = Calendar.current.component(.year, from: d) }
            songs.append([
                "id": "lib/\(item.persistentID)",
                "uri": url.absoluteString,
                "title": item.title ?? "",
                "artist": item.artist ?? "",
                "album": item.albumTitle ?? "",
                "albumId": 0,
                "duration": Int(item.playbackDuration * 1000),
                "dateAdded": Int64(item.dateAdded.timeIntervalSince1970 * 1000),
                "track": item.albumTrackNumber,
                "disc": item.discNumber,
                "year": year,
                "genre": item.genre ?? "",
            ])
        }
    }

    /// { on? } switches the Music library on or off; without it, says how it
    /// stands. Switching on asks Apple's permission the first time.
    @objc func musicLibrary(_ call: CAPPluginCall) {
        let status = MPMediaLibrary.authorizationStatus()
        guard let want = call.getBool("on") else {
            call.resolve(["on": libraryOn(), "denied": status == .denied || status == .restricted])
            return
        }
        if !want {
            UserDefaults.standard.set(false, forKey: Self.libraryKey)
            call.resolve(["on": false, "denied": false])
            return
        }
        MPMediaLibrary.requestAuthorization { st in
            let ok = st == .authorized
            UserDefaults.standard.set(ok, forKey: Self.libraryKey)
            call.resolve(["on": ok, "denied": st == .denied || st == .restricted])
        }
    }

    // MARK: - Music folders

    private func savedFolders() -> [[String: Any]] {
        UserDefaults.standard.array(forKey: Self.foldersKey) as? [[String: Any]] ?? []
    }

    /// The folders, resolved from their bookmarks and opened. One that is gone
    /// for good (deleted, or its drive signed out) is skipped, not dropped:
    /// it may come back.
    private func openFolders() -> [Folder] {
        var out: [Folder] = []
        var list = savedFolders()
        var changed = false
        for (i, f) in list.enumerated() {
            guard let key = f["key"] as? String, let data = f["bookmark"] as? Data else { continue }
            let name = f["name"] as? String ?? key
            if let url = opened[key] { out.append(Folder(key: key, name: name, url: url)); continue }
            var stale = false
            guard let url = try? URL(resolvingBookmarkData: data, options: [], relativeTo: nil, bookmarkDataIsStale: &stale) else { continue }
            guard url.startAccessingSecurityScopedResource() else { continue }
            opened[key] = url
            if stale, let fresh = try? url.bookmarkData(options: .minimalBookmark, includingResourceValuesForKeys: nil, relativeTo: nil) {
                list[i]["bookmark"] = fresh
                changed = true
            }
            out.append(Folder(key: key, name: name, url: url))
        }
        if changed { UserDefaults.standard.set(list, forKey: Self.foldersKey) }
        return out
    }

    @objc func folders(_ call: CAPPluginCall) {
        work.async {
            let list = self.savedFolders().compactMap { f -> [String: Any]? in
                guard let key = f["key"] as? String else { return nil }
                return ["key": key, "name": f["name"] as? String ?? key]
            }
            call.resolve(["folders": list])
        }
    }

    @objc func removeFolder(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else { call.reject("key is required"); return }
        work.async {
            let list = self.savedFolders().filter { ($0["key"] as? String) != key }
            UserDefaults.standard.set(list, forKey: Self.foldersKey)
            if let url = self.opened.removeValue(forKey: key) { url.stopAccessingSecurityScopedResource() }
            call.resolve()
        }
    }

    @objc func addFolder(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: [UTType.folder])
            self.present(picker, for: call, folder: true)
        }
    }

    @objc func addSongs(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: [UTType.audio], asCopy: true)
            picker.allowsMultipleSelection = true
            self.present(picker, for: call, folder: false)
        }
    }

    private func present(_ picker: UIDocumentPickerViewController, for call: CAPPluginCall, folder: Bool) {
        if let waiting = pickCall { waiting.resolve(["cancelled": true]) }
        pickCall = call
        pickingFolder = folder
        picker.delegate = self
        bridge?.viewController?.present(picker, animated: true)
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        pickCall?.resolve(["cancelled": true, "added": 0])
        pickCall = nil
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let call = pickCall else { return }
        pickCall = nil
        let folder = pickingFolder
        work.async {
            if folder {
                guard let url = urls.first, url.startAccessingSecurityScopedResource() else {
                    call.reject("That folder could not be opened")
                    return
                }
                guard let data = try? url.bookmarkData(options: .minimalBookmark, includingResourceValuesForKeys: nil, relativeTo: nil) else {
                    url.stopAccessingSecurityScopedResource()
                    call.reject("That folder could not be kept")
                    return
                }
                let n = UserDefaults.standard.integer(forKey: Self.nextKey) + 1
                UserDefaults.standard.set(n, forKey: Self.nextKey)
                let key = String(n)
                var list = self.savedFolders()
                list.append(["key": key, "name": url.lastPathComponent, "bookmark": data])
                UserDefaults.standard.set(list, forKey: Self.foldersKey)
                self.opened[key] = url
                call.resolve(["key": key, "name": url.lastPathComponent])
            } else {
                // Copies, made by the picker: moved into MPTree's own folder.
                var added = 0
                for src in urls {
                    let dest = self.unique(self.docs.appendingPathComponent(src.lastPathComponent))
                    if (try? self.fm.moveItem(at: src, to: dest)) != nil || (try? self.fm.copyItem(at: src, to: dest)) != nil {
                        added += 1
                    }
                }
                call.resolve(["added": added])
            }
        }
    }

    /// "Song.mp3", or "Song 2.mp3" when that name is taken.
    private func unique(_ url: URL) -> URL {
        if !fm.fileExists(atPath: url.path) { return url }
        let dir = url.deletingLastPathComponent()
        let stem = url.deletingPathExtension().lastPathComponent
        let ext = url.pathExtension
        var n = 2
        while true {
            let candidate = dir.appendingPathComponent(ext.isEmpty ? "\(stem) \(n)" : "\(stem) \(n).\(ext)")
            if !fm.fileExists(atPath: candidate.path) { return candidate }
            n += 1
        }
    }

    // MARK: - Files

    private func fileURL(_ path: String) -> URL {
        path.contains("://") ? (URL(string: path) ?? URL(fileURLWithPath: path)) : URL(fileURLWithPath: path)
    }

    /// Only files can be deleted: a Music library song belongs to the Music app.
    private func delete(_ path: String) -> Bool {
        if path.contains("://") && !path.hasPrefix("file://") { return false }
        do { try fm.removeItem(at: fileURL(path)); return true } catch { return false }
    }

    @objc func deleteFile(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else { call.reject("path is required"); return }
        work.async { call.resolve(["deleted": self.delete(path)]) }
    }

    @objc func deleteFiles(_ call: CAPPluginCall) {
        let paths = call.getArray("paths", String.self) ?? []
        work.async { call.resolve(["deleted": paths.filter { self.delete($0) }]) }
    }

    /// The part between the markers, as a song of its own in MPTree's Cuts/
    /// folder. iOS writes it as AAC (.m4a): an MP3 is encoded again, which the
    /// Android version avoids by keeping the original codec.
    @objc func cutTrack(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else { call.reject("path is required"); return }
        let start = call.getInt("startMs") ?? 0
        let end = call.getInt("endMs") ?? 0
        let name = call.getString("name") ?? "Cut"
        guard end > start else { call.reject("The cut is empty"); return }
        let asset = AVURLAsset(url: fileURL(path))
        guard let export = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetAppleM4A) else {
            call.reject("This song can't be cut", "UNSUPPORTED_FORMAT")
            return
        }
        let dir = docs.appendingPathComponent("Cuts", isDirectory: true)
        try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
        let safe = name.replacingOccurrences(of: "/", with: "-").replacingOccurrences(of: ":", with: "-")
        let out = unique(dir.appendingPathComponent(safe + ".m4a"))
        export.outputURL = out
        export.outputFileType = .m4a
        export.timeRange = CMTimeRange(start: CMTime(value: CMTimeValue(start), timescale: 1000),
                                       end: CMTime(value: CMTimeValue(end), timescale: 1000))
        export.exportAsynchronously {
            if export.status == .completed {
                call.resolve([
                    "id": "docs/Cuts/" + out.lastPathComponent,
                    "uri": out.path,
                    "path": out.path,
                    "title": name,
                    "duration": end - start,
                ])
            } else {
                call.reject(export.error?.localizedDescription ?? "The cut could not be saved")
            }
        }
    }

    /// Lyrics in a "song.lrc" or "song.txt" next to the file, as on Android,
    /// and otherwise those in the file's own tags.
    @objc func getLyrics(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else { call.reject("path is required"); return }
        work.async {
            let url = self.fileURL(path)
            if url.isFileURL {
                let stem = url.deletingPathExtension()
                for ext in ["lrc", "LRC", "txt", "TXT"] {
                    let side = stem.appendingPathExtension(ext)
                    if let text = try? String(contentsOf: side, encoding: .utf8), !text.isEmpty {
                        call.resolve(["lyrics": text, "source": side.lastPathComponent])
                        return
                    }
                }
            }
            let tagged = AVURLAsset(url: url).lyrics ?? ""
            call.resolve(tagged.isEmpty ? ["lyrics": ""] : ["lyrics": tagged, "source": "tags"])
        }
    }

    @objc func openAppSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
            call.resolve()
        }
    }

    @objc func setAsRingtone(_ call: CAPPluginCall) {
        call.reject("An iPhone has no ringtones for apps", "UNSUPPORTED")
    }
}
