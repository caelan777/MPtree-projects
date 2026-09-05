package com.caelan.mptree;

import android.Manifest;
import android.app.Activity;
import android.app.RecoverableSecurityException;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Intent;
import android.content.IntentSender;
import android.database.Cursor;
import android.net.Uri;
import android.provider.Settings;
import android.content.ContentValues;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMuxer;
import android.media.MediaScannerConnection;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;

import java.io.OutputStream;
import java.nio.ByteBuffer;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

@CapacitorPlugin(
        name = "MusicScanner",
        permissions = {
                @Permission(strings = { Manifest.permission.READ_MEDIA_AUDIO }, alias = "audio33"),
                @Permission(strings = { Manifest.permission.READ_EXTERNAL_STORAGE }, alias = "audioLegacy")
        }
)
public class MusicScannerPlugin extends Plugin {

    // Two separate aliases (not one alias with both strings!) because on
    // API 33+ READ_EXTERNAL_STORAGE is capped via maxSdkVersion in the
    // manifest and will never report granted — bundling both into one
    // alias would make the alias permanently "denied" on new Android.
    private String currentAlias() {
        return Build.VERSION.SDK_INT >= 33 ? "audio33" : "audioLegacy";
    }

    // ── scan ──────────────────────────────────────────────────────────────

    @PluginMethod
    public void scan(PluginCall call) {
        String alias = currentAlias();
        if (getPermissionState(alias) != PermissionState.GRANTED) {
            requestPermissionForAlias(alias, call, "permsCallback");
            return;
        }
        doScan(call);
    }

    @PermissionCallback
    private void permsCallback(PluginCall call) {
        if (getPermissionState(currentAlias()) == PermissionState.GRANTED) {
            doScan(call);
        } else {
            call.reject("Permission to read audio files was denied");
        }
    }

    private void doScan(PluginCall call) {
        try {
            List<Song> songs = MusicScanner.getDeviceSongs(getContext());

            JSArray songsArray = new JSArray();
            for (Song song : songs) {
                songsArray.put(song.toJSObject());
            }

            JSObject ret = new JSObject();
            ret.put("songs", songsArray);
            call.resolve(ret);

        } catch (Exception e) {
            call.reject("Failed to scan music from device", e);
        }
    }

    // ── scanFolder ────────────────────────────────────────────────────────
    //
    // Tells Android's MediaScannerConnection to index every audio file in the
    // given absolute folder path.  This is essential after copying backup audio
    // files to external storage: without it, MediaStore won't know about them
    // until the system's own background scanner runs (which can take a long
    // time), so MusicScanner.scan() wouldn't find the restored songs.
    //
    // Supported audio extensions are kept in sync with what MediaStore
    // typically indexes — covering the formats supported by Android's
    // MediaPlayer (what AudioPlayerPlugin uses under the hood).

    private static final String[] AUDIO_EXTENSIONS = {
            ".mp3", ".m4a", ".flac", ".ogg", ".wav",
            ".aac", ".opus", ".wma", ".aiff", ".alac"
    };

    @PluginMethod
    public void scanFolder(PluginCall call) {
        String folderPath = call.getString("path");
        if (folderPath == null || folderPath.isEmpty()) {
            call.reject("path is required");
            return;
        }

        File folder = new File(folderPath);
        if (!folder.exists() || !folder.isDirectory()) {
            // Folder doesn't exist yet (e.g. no music was copied) — not an error.
            call.resolve();
            return;
        }

        File[] files = folder.listFiles();
        if (files == null || files.length == 0) {
            call.resolve();
            return;
        }

        // Collect paths of audio files only (skip .nomedia sentinel, etc.).
        List<String> audioPaths = new ArrayList<>();
        for (File f : files) {
            if (!f.isFile()) continue;
            String name = f.getName().toLowerCase();
            for (String ext : AUDIO_EXTENSIONS) {
                if (name.endsWith(ext)) {
                    audioPaths.add(f.getAbsolutePath());
                    break;
                }
            }
        }

        if (audioPaths.isEmpty()) {
            call.resolve();
            return;
        }

        String[] pathsArray = audioPaths.toArray(new String[0]);

        // AtomicInteger tracks how many scan callbacks have fired so we
        // know when the last file is done and can resolve the JS call.
        final AtomicInteger remaining = new AtomicInteger(pathsArray.length);

        // FIX: MediaScannerConnection.scanFile is NOT guaranteed to invoke its
        // callback for every path (locked/corrupt files, provider hiccups). If
        // even one callback never fires, the counter never reaches zero and the
        // JS promise hangs forever — freezing the restore flow on "Indexing
        // music…". Guard with a one-shot resolve: whichever happens first,
        // "all callbacks done" or a timeout, resolves the call exactly once.
        final AtomicBoolean resolved = new AtomicBoolean(false);
        final Handler timeoutHandler = new Handler(Looper.getMainLooper());

        // Scale the timeout with the number of files, capped so a huge library
        // can't wedge the UI. ~40ms/file, floor 4s, ceiling 30s.
        final long timeoutMs = Math.min(30_000L, Math.max(4_000L, pathsArray.length * 40L));

        final Runnable timeoutRunnable = () -> {
            if (resolved.compareAndSet(false, true)) {
                // Timed out — some files may not be indexed yet, but they'll be
                // picked up by the system's own background scan eventually. We
                // resolve so the restore flow can complete rather than hang.
                call.resolve();
            }
        };
        timeoutHandler.postDelayed(timeoutRunnable, timeoutMs);

        MediaScannerConnection.scanFile(
                getContext(),
                pathsArray,
                null, // let MediaScanner detect MIME types automatically
                (scannedPath, uri) -> {
                    // This callback fires once per file.  When the counter hits
                    // zero every file has been processed (successfully or not).
                    if (remaining.decrementAndGet() == 0) {
                        if (resolved.compareAndSet(false, true)) {
                            timeoutHandler.removeCallbacks(timeoutRunnable);
                            call.resolve();
                        }
                    }
                }
        );
    }

    // ── deleteFile ─────────────────────────────────────────────────────────
    //
    // Permanently deletes an audio file from the device via MediaStore.
    //
    // Why native: on Android 10+ (scoped storage) the JS @capacitor/filesystem
    // deleteFile CANNOT remove files it didn't create — the shared Music store
    // is owned by MediaStore, so the JS delete silently fails and the song only
    // disappears from the app's bin while the actual file stays on the phone.
    // Deleting through the MediaStore ContentResolver is the supported path.
    //
    // On Android 11+ MediaStore.createDeleteRequest() shows a system
    // confirmation dialog. On Android 10 a file the app doesn't own throws a
    // RecoverableSecurityException whose IntentSender we launch to get consent.
    //
    // Resolves { deleted: true } on success, { deleted: false } if the user
    // cancelled the confirmation, or rejects on hard error.

    private static final int DELETE_REQUEST_CODE = 51234;
    private PluginCall pendingDeleteCall;

    @PluginMethod
    public void deleteFile(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) { call.reject("path is required"); return; }
        if (path.startsWith("file://")) path = path.substring("file://".length());

        Uri mediaUri = findAudioUriForPath(path);
        ContentResolver resolver = getContext().getContentResolver();

        // Android 11+ : system delete-request dialog (works for any file).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            if (mediaUri == null) { resolveDeleted(call, tryPlainFileDelete(path)); return; }
            try {
                List<Uri> uris = new ArrayList<>();
                uris.add(mediaUri);
                android.app.PendingIntent pi = MediaStore.createDeleteRequest(resolver, uris);
                launchConsent(call, pi.getIntentSender());
            } catch (Exception e) {
                call.reject("Delete request failed: " + e.getMessage());
            }
            return;
        }

        // Android 10 and below.
        if (mediaUri == null) { resolveDeleted(call, tryPlainFileDelete(path)); return; }
        try {
            int rows = resolver.delete(mediaUri, null, null);
            resolveDeleted(call, rows > 0);
        } catch (SecurityException sec) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                    && sec instanceof RecoverableSecurityException) {
                try {
                    IntentSender sender = ((RecoverableSecurityException) sec)
                            .getUserAction().getActionIntent().getIntentSender();
                    launchConsent(call, sender);
                } catch (Exception e) {
                    call.reject("Delete permission request failed: " + e.getMessage());
                }
            } else {
                call.reject("No permission to delete this file");
            }
        } catch (Exception e) {
            call.reject("Could not delete file: " + e.getMessage());
        }
    }

    private void launchConsent(PluginCall call, IntentSender sender) {
        try {
            pendingDeleteCall = call;
            bridge.getActivity().startIntentSenderForResult(
                    sender, DELETE_REQUEST_CODE, null, 0, 0, 0);
        } catch (Exception e) {
            pendingDeleteCall = null;
            call.reject("Could not launch delete confirmation: " + e.getMessage());
        }
    }

    @Override
    protected void handleOnActivityResult(int requestCode, int resultCode, Intent data) {
        super.handleOnActivityResult(requestCode, resultCode, data);
        if (requestCode == DELETE_REQUEST_CODE && pendingDeleteCall != null) {
            boolean ok = resultCode == Activity.RESULT_OK;
            resolveDeleted(pendingDeleteCall, ok);
            pendingDeleteCall = null;
        }
    }

    private void resolveDeleted(PluginCall call, boolean deleted) {
        JSObject ret = new JSObject();
        ret.put("deleted", deleted);
        call.resolve(ret);
    }

    private boolean tryPlainFileDelete(String path) {
        try {
            File f = new File(path);
            return !f.exists() || f.delete();
        } catch (Exception e) {
            return false;
        }
    }

    /** Looks up the MediaStore content:// URI for a given absolute file path,
     *  or null if the file isn't indexed. */
    private Uri findAudioUriForPath(String path) {
        Uri collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
        String[] projection = { MediaStore.Audio.Media._ID };
        String selection = MediaStore.Audio.Media.DATA + " = ?";
        String[] args = { path };
        Cursor cursor = null;
        try {
            cursor = getContext().getContentResolver()
                    .query(collection, projection, selection, args, null);
            if (cursor != null && cursor.moveToFirst()) {
                long id = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID));
                return ContentUris.withAppendedId(collection, id);
            }
        } catch (Exception ignored) {
        } finally {
            if (cursor != null) cursor.close();
        }
        return null;
    }

    // ── cutTrack ─────────────────────────────────────────────────────────────
    //
    // Losslessly exports a time segment [startMs, endMs] of an audio file to a
    // NEW real file on the device, in Music/MPTree, and registers it with
    // MediaStore so it shows up as a normal song in the library on next scan.
    //
    // Uses MediaExtractor + MediaMuxer, which COPIES the compressed samples in
    // the requested range without re-encoding — fast, and no quality loss. The
    // output container is chosen from the source: MP4/M4A/AAC → .m4a,
    // otherwise we still try an .m4a mux (works for AAC/MP3-in-MP4). Raw .mp3
    // and other non-MP4-muxable codecs fall back to a clear error so the JS
    // side can keep the old metadata-only "cut" behaviour for those.
    //
    // Runs off the main thread. Resolves { uri, path, title, duration } for the
    // new file, or rejects with a message.
    @PluginMethod
    public void cutTrack(PluginCall call) {
        final String sourcePath = normalizePath(call.getString("path"));
        // Read as int, not long: Capacitor's getLong returns the default for
        // plain JS integers, which made every cut arrive as [0, 0] and trip the
        // "Invalid cut range" guard below. Milliseconds fit in an int easily
        // (max ~24 days), and this matches how seekTo etc. read ms elsewhere.
        final long startMs = call.getInt("startMs", 0);
        final long endMs   = call.getInt("endMs", 0);
        final String outName = call.getString("name", "Cut");

        if (sourcePath == null) { call.reject("path is required"); return; }
        if (endMs <= startMs)   { call.reject("Invalid cut range"); return; }

        new Thread(() -> {
            try {
                JSObject result = doCutTrack(sourcePath, startMs, endMs, outName);
                call.resolve(result);
            } catch (UnsupportedOperationException uoe) {
                call.reject("UNSUPPORTED_FORMAT", uoe.getMessage());
            } catch (Exception e) {
                call.reject("Cut export failed: " + e.getMessage());
            }
        }).start();
    }

    private String normalizePath(String p) {
        if (p == null) return null;
        if (p.startsWith("file://")) return p.substring("file://".length());
        return p;
    }

    private JSObject doCutTrack(String sourcePath, long startMs, long endMs, String outName) throws Exception {
        // Sanitize the output filename (no path separators / illegal chars).
        String safe = outName.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
        if (safe.isEmpty()) safe = "Cut";

        // Pick a lossless strategy based on the source codec.
        String mime = detectAudioMime(sourcePath);
        if (mime == null) throw new Exception("No audio track found");

        if (mime.contains("mp4a") || mime.contains("aac")) {
            File tmp = cutAacToM4a(sourcePath, startMs, endMs);
            JSObject out = publishToMusic(tmp, safe + ".m4a", outName, endMs - startMs, "audio/mp4");
            try { tmp.delete(); } catch (Exception ignored) {}
            return out;
        } else if (mime.contains("mpeg") || mime.contains("mp3")) {
            File tmp = cutMp3(sourcePath, startMs, endMs);
            JSObject out = publishToMusic(tmp, safe + ".mp3", outName, endMs - startMs, "audio/mpeg");
            try { tmp.delete(); } catch (Exception ignored) {}
            return out;
        }

        // FLAC / OGG / WAV / etc.: no cheap lossless file cut here, so tell JS to
        // keep the in-app metadata-only cut instead of failing outright.
        throw new UnsupportedOperationException(
                "This audio format can't be exported to a file yet. Kept as an in-app cut instead.");
    }

    /** MIME of the first audio track, or null if there is none. */
    private String detectAudioMime(String sourcePath) throws Exception {
        MediaExtractor extractor = new MediaExtractor();
        try {
            extractor.setDataSource(sourcePath);
            for (int i = 0; i < extractor.getTrackCount(); i++) {
                String mime = extractor.getTrackFormat(i).getString(MediaFormat.KEY_MIME);
                if (mime != null && mime.startsWith("audio/")) return mime;
            }
            return null;
        } finally {
            extractor.release();
        }
    }

    /** Lossless AAC/M4A cut: copy the compressed samples in [startMs,endMs] into a new .m4a. */
    private File cutAacToM4a(String sourcePath, long startMs, long endMs) throws Exception {
        MediaExtractor extractor = new MediaExtractor();
        extractor.setDataSource(sourcePath);

        int audioTrackIndex = -1;
        MediaFormat audioFormat = null;
        for (int i = 0; i < extractor.getTrackCount(); i++) {
            MediaFormat fmt = extractor.getTrackFormat(i);
            String mime = fmt.getString(MediaFormat.KEY_MIME);
            if (mime != null && mime.startsWith("audio/")) { audioTrackIndex = i; audioFormat = fmt; break; }
        }
        if (audioTrackIndex < 0) { extractor.release(); throw new Exception("No audio track found"); }
        extractor.selectTrack(audioTrackIndex);

        // Temp file first, then publish to MediaStore — muxing straight to a
        // MediaStore FD is finicky across API levels.
        File tmp = File.createTempFile("mptree_cut", ".m4a", getContext().getCacheDir());
        MediaMuxer muxer = new MediaMuxer(tmp.getAbsolutePath(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
        int outTrack = muxer.addTrack(audioFormat);
        muxer.start();

        int maxChunk = 256 * 1024;
        if (audioFormat.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)) {
            int declared = audioFormat.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE);
            if (declared > 0) maxChunk = declared;
        }
        ByteBuffer buffer = ByteBuffer.allocate(maxChunk);
        android.media.MediaCodec.BufferInfo info = new android.media.MediaCodec.BufferInfo();

        long startUs = startMs * 1000L, endUs = endMs * 1000L;
        extractor.seekTo(startUs, MediaExtractor.SEEK_TO_CLOSEST_SYNC);

        long firstSampleUs = -1;
        while (true) {
            long sampleTime = extractor.getSampleTime();
            if (sampleTime < 0) break;
            if (sampleTime > endUs) break;
            int size = extractor.readSampleData(buffer, 0);
            if (size < 0) break;
            if (sampleTime >= startUs) {
                if (firstSampleUs < 0) firstSampleUs = sampleTime;
                info.offset = 0;
                info.size = size;
                info.presentationTimeUs = sampleTime - firstSampleUs; // re-base to 0
                info.flags = (extractor.getSampleFlags() & MediaExtractor.SAMPLE_FLAG_SYNC) != 0
                        ? android.media.MediaCodec.BUFFER_FLAG_KEY_FRAME : 0;
                muxer.writeSampleData(outTrack, buffer, info);
            }
            extractor.advance();
        }
        try { muxer.stop(); } catch (Exception ignored) {}
        muxer.release();
        extractor.release();
        return tmp;
    }

    /**
     * Lossless MP3 cut. MP3 is a stream of self-contained frames, so we copy the
     * whole frames whose playback time falls in [startMs,endMs] byte-for-byte into
     * a new .mp3 — no re-encode, no quality loss. Cuts land on frame boundaries
     * (~26ms), which is inaudible here. Throws if the stream can't be parsed, so
     * the caller falls back to the in-app metadata cut.
     */
    private File cutMp3(String sourcePath, long startMs, long endMs) throws Exception {
        File src = new File(sourcePath);
        long len = src.length();
        if (len <= 0 || len > 200L * 1024 * 1024) throw new Exception("MP3 too large or empty");
        byte[] data = new byte[(int) len];
        try (java.io.FileInputStream is = new java.io.FileInputStream(src)) {
            int off = 0, n;
            while (off < data.length && (n = is.read(data, off, data.length - off)) > 0) off += n;
        }

        int pos = 0;
        // Skip an ID3v2 tag if present (size is stored as a 28-bit synchsafe int).
        if (data.length > 10 && data[0] == 'I' && data[1] == 'D' && data[2] == '3') {
            int size = ((data[6] & 0x7F) << 21) | ((data[7] & 0x7F) << 14)
                     | ((data[8] & 0x7F) << 7) | (data[9] & 0x7F);
            pos = 10 + size;
            if ((data[5] & 0x10) != 0) pos += 10; // footer present
            if (pos < 0 || pos > data.length) pos = 0;
        }

        double tMs = 0;
        int startByte = -1, endByte = data.length;
        int i = pos;
        while (i + 4 <= data.length) {
            // Frame sync = 11 set bits (0xFF, top 3 bits of next byte).
            if ((data[i] & 0xFF) != 0xFF || (data[i + 1] & 0xE0) != 0xE0) { i++; continue; }
            int[] frame = parseMp3Frame(data, i); // {frameLenBytes, durationUs}
            if (frame == null || frame[0] < 4 || i + frame[0] > data.length) { i++; continue; }
            if (startByte < 0 && tMs >= startMs) startByte = i;
            if (tMs >= endMs) { endByte = i; break; }
            tMs += frame[1] / 1000.0;
            i += frame[0];
        }
        if (startByte < 0) startByte = pos;
        if (endByte <= startByte) throw new Exception("Empty MP3 cut range");

        File tmp = File.createTempFile("mptree_cut", ".mp3", getContext().getCacheDir());
        try (java.io.FileOutputStream os = new java.io.FileOutputStream(tmp)) {
            os.write(data, startByte, endByte - startByte);
        }
        return tmp;
    }

    /** Parse one MPEG-audio Layer III frame header. Returns {frameLenBytes, durationUs} or null. */
    private int[] parseMp3Frame(byte[] d, int i) {
        int b1 = d[i + 1] & 0xFF, b2 = d[i + 2] & 0xFF;
        int versionBits = (b1 >> 3) & 0x3; // 3=MPEG1, 2=MPEG2, 0=MPEG2.5, 1=reserved
        int layerBits   = (b1 >> 1) & 0x3; // 1=Layer III
        if (versionBits == 1 || layerBits != 1) return null;
        int bitrateIdx = (b2 >> 4) & 0xF;
        int srIdx      = (b2 >> 2) & 0x3;
        int padding    = (b2 >> 1) & 0x1;
        if (bitrateIdx == 0 || bitrateIdx == 15 || srIdx == 3) return null;

        boolean v1 = versionBits == 3;
        int[] brV1 = {0,32,40,48,56,64,80,96,112,128,160,192,224,256,320};
        int[] brV2 = {0,8,16,24,32,40,48,56,64,80,96,112,128,144,160};
        int bitrate = (v1 ? brV1[bitrateIdx] : brV2[bitrateIdx]) * 1000;

        int[] srV1  = {44100,48000,32000};
        int[] srV2  = {22050,24000,16000};
        int[] srV25 = {11025,12000,8000};
        int sampleRate = versionBits == 3 ? srV1[srIdx] : versionBits == 2 ? srV2[srIdx] : srV25[srIdx];

        int samplesPerFrame = v1 ? 1152 : 576;
        int frameLen = v1 ? 144 * bitrate / sampleRate + padding
                          : 72 * bitrate / sampleRate + padding;
        int durationUs = (int) (samplesPerFrame * 1_000_000L / sampleRate);
        return new int[]{ frameLen, durationUs };
    }

    /** Copies `tmp` into the shared Music/MPTree collection via MediaStore and
     *  returns { uri, path, title, duration }. Uses the modern IS_PENDING flow
     *  on API 29+, and a direct file write + scan on older devices. */
    private JSObject publishToMusic(File tmp, String fileName, String title, long durationMs, String mimeType) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Audio.Media.DISPLAY_NAME, fileName);
            values.put(MediaStore.Audio.Media.MIME_TYPE, mimeType);
            values.put(MediaStore.Audio.Media.TITLE, title);
            values.put(MediaStore.Audio.Media.RELATIVE_PATH, Environment.DIRECTORY_MUSIC + "/MPTree");
            values.put(MediaStore.Audio.Media.IS_MUSIC, 1);
            values.put(MediaStore.Audio.Media.IS_PENDING, 1);

            Uri collection = MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
            Uri item = resolver.insert(collection, values);
            if (item == null) throw new Exception("Could not create MediaStore entry");

            try (OutputStream os = resolver.openOutputStream(item);
                 java.io.FileInputStream is = new java.io.FileInputStream(tmp)) {
                if (os == null) throw new Exception("Could not open output stream");
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = is.read(buf)) > 0) os.write(buf, 0, n);
            }

            values.clear();
            values.put(MediaStore.Audio.Media.IS_PENDING, 0);
            resolver.update(item, values, null, null);

            // Resolve the real on-disk path for the app's file-path-based player.
            String realPath = queryPathForUri(item);
            JSObject out = new JSObject();
            out.put("uri", realPath != null ? realPath : item.toString());
            out.put("path", realPath);
            out.put("contentUri", item.toString());
            out.put("title", title);
            out.put("duration", durationMs);
            return out;
        } else {
            // Legacy: write straight into the public Music/MPTree dir + scan.
            File musicDir = new File(
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC), "MPTree");
            if (!musicDir.exists()) musicDir.mkdirs();
            File dest = new File(musicDir, fileName);
            try (java.io.FileInputStream is = new java.io.FileInputStream(tmp);
                 java.io.FileOutputStream os = new java.io.FileOutputStream(dest)) {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = is.read(buf)) > 0) os.write(buf, 0, n);
            }
            final String destPath = dest.getAbsolutePath();
            MediaScannerConnection.scanFile(getContext(), new String[]{ destPath }, null, null);
            JSObject out = new JSObject();
            out.put("uri", destPath);
            out.put("path", destPath);
            out.put("title", title);
            out.put("duration", durationMs);
            return out;
        }
    }

    private String queryPathForUri(Uri uri) {
        Cursor c = null;
        try {
            c = getContext().getContentResolver().query(
                    uri, new String[]{ MediaStore.Audio.Media.DATA }, null, null, null);
            if (c != null && c.moveToFirst()) {
                return c.getString(c.getColumnIndexOrThrow(MediaStore.Audio.Media.DATA));
            }
        } catch (Exception ignored) {
        } finally {
            if (c != null) c.close();
        }
        return null;
    }

    // ── openAppSettings ──────────────────────────────────────────────────────
    // Opens this app's "App info" screen in system Settings, so the user can
    // grant the media permission after choosing "Don't ask again" (at which
    // point the in-app prompt no longer appears).
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.fromParts("package", getContext().getPackageName(), null));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open settings: " + e.getMessage());
        }
    }

    // ── getLyrics ────────────────────────────────────────────────────────────
    //
    // Lyrics come off the device, never off the internet. MPTree is an offline
    // player and its privacy policy says the update check is the only request it
    // makes; fetching lyrics from a server would quietly make that untrue.
    //
    // So we read a sidecar file sitting next to the audio: "song.mp3" pairs with
    // "song.lrc", the de facto standard, or "song.txt". Lyrics embedded in the
    // file's own ID3 frames are NOT read: that means hand-parsing USLT frames,
    // which is a real chunk of work, and the sidecar covers how lyrics are
    // actually distributed. Better to do one thing correctly than two badly.
    @PluginMethod
    public void getLyrics(PluginCall call) {
        String path = call.getString("path");
        JSObject ret = new JSObject();
        ret.put("lyrics", "");
        if (path == null || path.isEmpty()) { call.resolve(ret); return; }

        try {
            int dot = path.lastIndexOf('.');
            String base = dot > 0 ? path.substring(0, dot) : path;
            String[] candidates = { base + ".lrc", base + ".LRC", base + ".txt", base + ".TXT" };

            for (String c : candidates) {
                File f = new File(c);
                if (!f.exists() || !f.canRead()) continue;
                // A lyrics file this large is not lyrics.
                if (f.length() > 512 * 1024) continue;

                StringBuilder sb = new StringBuilder();
                java.io.BufferedReader r = new java.io.BufferedReader(
                        new java.io.InputStreamReader(new java.io.FileInputStream(f), "UTF-8"));
                try {
                    String line;
                    while ((line = r.readLine()) != null) sb.append(line).append('\n');
                } finally {
                    try { r.close(); } catch (Exception ignored) {}
                }
                ret.put("lyrics", sb.toString());
                ret.put("source", f.getName());
                break;
            }
            call.resolve(ret);
        } catch (Exception e) {
            call.resolve(ret);
        }
    }

    // ── setAsRingtone ────────────────────────────────────────────────────────
    //
    // Two gates stand between us and setting a ringtone, and they fail in
    // different ways, so JS is told which one it hit:
    //
    //   needsPermission  Android treats writing system settings as special. It
    //                    is not a runtime permission dialog; the user has to
    //                    flip a switch on a dedicated Settings screen. We open
    //                    it for them and report back so the UI can explain why
    //                    nothing happened yet.
    //   ok:false         The file is not in MediaStore (a cut track that was
    //                    never scanned, say), so there is no content URI to
    //                    hand to RingtoneManager.
    @PluginMethod
    public void setAsRingtone(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) { call.reject("path is required"); return; }

        JSObject ret = new JSObject();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                && !Settings.System.canWrite(getContext())) {
            try {
                Intent intent = new Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            } catch (Exception ignored) {
                // Some devices have no such screen. Reporting the state is still
                // more useful than throwing.
            }
            ret.put("ok", false);
            ret.put("needsPermission", true);
            call.resolve(ret);
            return;
        }

        try {
            ContentResolver resolver = getContext().getContentResolver();
            Uri collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;

            Long id = null;
            Cursor c = resolver.query(collection, new String[]{ MediaStore.Audio.Media._ID },
                    MediaStore.Audio.Media.DATA + "=?", new String[]{ path }, null);
            if (c != null) {
                try { if (c.moveToFirst()) id = c.getLong(0); } finally { c.close(); }
            }
            if (id == null) {
                ret.put("ok", false);
                ret.put("needsPermission", false);
                ret.put("reason", "notIndexed");
                call.resolve(ret);
                return;
            }

            Uri songUri = ContentUris.withAppendedId(collection, id);

            // Mark it ringtone-eligible. Harmless if it already is, and on some
            // OEM builds the picker will not show a track without this.
            try {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Audio.Media.IS_RINGTONE, true);
                resolver.update(songUri, values, null, null);
            } catch (Exception ignored) {
                // Not fatal: setActualDefaultRingtoneUri below is what matters.
            }

            android.media.RingtoneManager.setActualDefaultRingtoneUri(
                    getContext(), android.media.RingtoneManager.TYPE_RINGTONE, songUri);

            ret.put("ok", true);
            ret.put("needsPermission", false);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not set ringtone: " + e.getMessage(), e);
        }
    }
}