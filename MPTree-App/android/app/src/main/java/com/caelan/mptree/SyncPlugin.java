package com.caelan.mptree;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.StatFs;
import android.provider.Settings;
import android.view.WindowManager;
import android.util.Base64;
import android.webkit.MimeTypeMap;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.CRC32;

/**
 * The file side of the MPTree account: everything src/sync needs that a
 * WebView cannot do well by itself.
 *
 * Songs are big, so they never cross the JS bridge whole. Going to or coming
 * from Drive they stream straight between the file and the network here; going
 * phone to phone (WebRTC, in JS) they cross in chunks of about a megabyte.
 * A song that arrives is written to a temp file first and only then published
 * into Music/MPTree, so a transfer that breaks off leaves nothing half-written
 * in the library.
 *
 * The same song has a different path on every phone, so phones name songs by a
 * fingerprint instead: the size in bytes and a checksum of 16 KB from the
 * middle of the file. Cheap to take, and two different songs practically never
 * share both.
 */
@CapacitorPlugin(name = "Sync")
public class SyncPlugin extends Plugin {

    private static final String DRIVE = "https://www.googleapis.com";
    private final ExecutorService io = Executors.newFixedThreadPool(3);

    private File tempDir() {
        File d = new File(getContext().getCacheDir(), "sync");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    private File tempFile(String tid) {
        return new File(tempDir(), tid.replaceAll("[^A-Za-z0-9_-]", "_") + ".part");
    }

    // ── Which phone this is ─────────────────────────────────────────────────
    // Android's own id for this app on this phone. It stays the same when
    // MPTree is uninstalled and installed again, so a reinstall does not use up
    // one of the account's three places; a factory reset gives a new one. Kept
    // in the no-backup folder too, so a phone that already had an id keeps it,
    // and Android's backup never carries it to another phone.
    @PluginMethod
    public void deviceId(PluginCall call) {
        try {
            File f = new File(getContext().getNoBackupFilesDir(), "mptree-device-id");
            String id = null;
            if (f.exists()) id = new String(readAll(new FileInputStream(f)), StandardCharsets.UTF_8).trim();
            if (id == null || id.isEmpty()) {
                String android = Settings.Secure.getString(getContext().getContentResolver(), Settings.Secure.ANDROID_ID);
                id = android != null && android.length() >= 8
                        ? android.toLowerCase()
                        : UUID.randomUUID().toString().replace("-", "").substring(0, 16);
                try (FileOutputStream os = new FileOutputStream(f)) { os.write(id.getBytes(StandardCharsets.UTF_8)); }
            }
            JSObject r = new JSObject();
            r.put("id", id);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("No device id: " + e.getMessage());
        }
    }

    // ── Network ─────────────────────────────────────────────────────────────
    /** online: there is a network. unmetered: it does not count against a data
     *  plan, which in practice means wifi. */
    @PluginMethod
    public void network(PluginCall call) {
        JSObject r = new JSObject();
        boolean online = false, unmetered = false;
        try {
            ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
            Network n = cm.getActiveNetwork();
            NetworkCapabilities caps = n != null ? cm.getNetworkCapabilities(n) : null;
            if (caps != null) {
                online = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
                unmetered = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED);
            }
        } catch (Exception ignored) { }
        r.put("online", online);
        r.put("unmetered", unmetered);
        call.resolve(r);
    }

    // ── Room ────────────────────────────────────────────────────────────────
    /** Bytes free where songs go, so a phone is not filled to the brim. */
    @PluginMethod
    public void freeSpace(PluginCall call) {
        JSObject r = new JSObject();
        try {
            StatFs st = new StatFs(android.os.Environment.getExternalStorageDirectory().getPath());
            r.put("bytes", st.getAvailableBytes());
        } catch (Exception e) {
            r.put("bytes", -1);
        }
        call.resolve(r);
    }

    /** Keeps the screen on while songs move: with the screen off Android
     *  pauses the app, and the song on its way with it. */
    @PluginMethod
    public void keepScreenOn(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        getActivity().runOnUiThread(() -> {
            if (on) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            call.resolve();
        });
    }

    // ── Fingerprints ────────────────────────────────────────────────────────
    private JSONObject fpCache;

    private File fpCacheFile() { return new File(getContext().getNoBackupFilesDir(), "mptree-fingerprints.json"); }

    private static String fingerprint(File f, long size) throws Exception {
        CRC32 crc = new CRC32();
        int len = (int) Math.min(16 * 1024, size);
        long from = Math.max(0, size / 2 - len / 2);
        byte[] buf = new byte[len];
        try (RandomAccessFile raf = new RandomAccessFile(f, "r")) {
            raf.seek(from);
            raf.readFully(buf);
        }
        crc.update(buf);
        return Long.toString(size, 36) + "-" + Long.toHexString(crc.getValue());
    }

    /** { paths } to { items: [{ path, size, fp }] }. Files that cannot be read
     *  are left out. Answers from a cache for files that have not changed. */
    @PluginMethod
    public void fingerprints(PluginCall call) {
        JSArray paths = call.getArray("paths");
        io.execute(() -> {
            try {
                synchronized (this) {
                    if (fpCache == null) {
                        File cf = fpCacheFile();
                        fpCache = cf.exists()
                                ? new JSONObject(new String(readAll(new FileInputStream(cf)), StandardCharsets.UTF_8))
                                : new JSONObject();
                    }
                    JSONObject next = new JSONObject();
                    boolean changed = false;
                    JSArray items = new JSArray();
                    for (int i = 0; paths != null && i < paths.length(); i++) {
                        String p = paths.getString(i);
                        File f = new File(p);
                        if (!f.isFile()) continue;
                        long size = f.length();
                        String key = p + "|" + size + "|" + f.lastModified();
                        String fp = fpCache.optString(key, null);
                        if (fp == null) {
                            try { fp = fingerprint(f, size); } catch (Exception e) { continue; }
                            changed = true;
                        }
                        next.put(key, fp);
                        JSObject it = new JSObject();
                        it.put("path", p);
                        it.put("size", size);
                        it.put("fp", fp);
                        items.put(it);
                    }
                    // Only what was asked about is kept, so songs that left the
                    // phone leave the cache too.
                    if (changed || next.length() != fpCache.length()) {
                        fpCache = next;
                        try (FileOutputStream os = new FileOutputStream(fpCacheFile())) {
                            os.write(next.toString().getBytes(StandardCharsets.UTF_8));
                        }
                    }
                    JSObject r = new JSObject();
                    r.put("items", items);
                    call.resolve(r);
                }
            } catch (Exception e) {
                call.reject("Fingerprints failed: " + e.getMessage());
            }
        });
    }

    // ── Reading a song, a piece at a time ───────────────────────────────────
    @PluginMethod
    public void readChunk(PluginCall call) {
        String path = call.getString("path");
        long offset = call.getLong("offset", 0L);
        int length = call.getInt("length", 1024 * 1024);
        io.execute(() -> {
            try (RandomAccessFile raf = new RandomAccessFile(path, "r")) {
                long size = raf.length();
                int n = (int) Math.max(0, Math.min(length, size - offset));
                byte[] buf = new byte[n];
                raf.seek(offset);
                raf.readFully(buf);
                JSObject r = new JSObject();
                r.put("data", Base64.encodeToString(buf, Base64.NO_WRAP));
                r.put("size", size);
                call.resolve(r);
            } catch (Exception e) {
                call.reject("Read failed: " + e.getMessage());
            }
        });
    }

    // ── Writing a song that arrives ─────────────────────────────────────────
    @PluginMethod
    public void beginFile(PluginCall call) {
        String tid = call.getString("tid");
        io.execute(() -> {
            try {
                new FileOutputStream(tempFile(tid)).close();
                call.resolve();
            } catch (Exception e) {
                call.reject("Could not start file: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void appendChunk(PluginCall call) {
        String tid = call.getString("tid");
        String data = call.getString("data", "");
        io.execute(() -> {
            try (FileOutputStream os = new FileOutputStream(tempFile(tid), true)) {
                os.write(Base64.decode(data, Base64.DEFAULT));
                call.resolve();
            } catch (Exception e) {
                call.reject(isFull(e) ? "ENOSPC" : "Write failed: " + e.getMessage(), isFull(e) ? "FULL" : null);
            }
        });
    }

    /** Publishes the temp file into Music/MPTree and resolves { path }. With
     *  size, a file that did not arrive whole is thrown away instead. */
    @PluginMethod
    public void finishFile(PluginCall call) {
        String tid = call.getString("tid");
        String name = safeName(call.getString("name", "song.mp3"));
        long size = call.getLong("size", -1L);
        io.execute(() -> {
            File tmp = tempFile(tid);
            try {
                if (size >= 0 && tmp.length() != size) {
                    tmp.delete();
                    call.reject("Incomplete: " + tmp.length() + " of " + size, "INCOMPLETE");
                    return;
                }
                String title = name.contains(".") ? name.substring(0, name.lastIndexOf('.')) : name;
                JSObject out = MusicScannerPlugin.publishToMusic(getContext(), tmp, name, title, 0, mimeFor(name));
                call.resolve(out);
            } catch (Exception e) {
                call.reject(isFull(e) ? "ENOSPC" : "Could not save: " + e.getMessage(), isFull(e) ? "FULL" : null);
            } finally {
                tmp.delete();
            }
        });
    }

    @PluginMethod
    public void abortFile(PluginCall call) {
        tempFile(call.getString("tid", "x")).delete();
        call.resolve();
    }

    // ── Drive, for songs that wait there ────────────────────────────────────
    // A resumable upload, streamed from the file. Resolves { id }.
    @PluginMethod
    public void driveUpload(PluginCall call) {
        String token = call.getString("token");
        String path = call.getString("path");
        String name = call.getString("name");
        String tid = call.getString("tid", "");
        JSObject props = call.getObject("appProperties", new JSObject());
        io.execute(() -> {
            HttpURLConnection c = null;
            try {
                File f = new File(path);
                long size = f.length();
                JSONObject meta = new JSONObject();
                meta.put("name", name);
                meta.put("parents", new JSONArray().put("appDataFolder"));
                meta.put("appProperties", props);
                byte[] body = meta.toString().getBytes(StandardCharsets.UTF_8);

                c = (HttpURLConnection) new URL(DRIVE + "/upload/drive/v3/files?uploadType=resumable&fields=id").openConnection();
                c.setRequestMethod("POST");
                c.setDoOutput(true);
                c.setRequestProperty("Authorization", "Bearer " + token);
                c.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
                c.setRequestProperty("X-Upload-Content-Type", "application/octet-stream");
                c.setRequestProperty("X-Upload-Content-Length", String.valueOf(size));
                c.setFixedLengthStreamingMode(body.length);
                try (OutputStream os = c.getOutputStream()) { os.write(body); }
                int code = c.getResponseCode();
                if (code != 200) { failHttp(call, c, code); return; }
                String session = c.getHeaderField("Location");
                c.disconnect();

                c = (HttpURLConnection) new URL(session).openConnection();
                c.setRequestMethod("PUT");
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/octet-stream");
                c.setFixedLengthStreamingMode(size);
                try (OutputStream os = c.getOutputStream(); InputStream is = new FileInputStream(f)) {
                    copy(is, os, tid, size);
                }
                code = c.getResponseCode();
                if (code != 200 && code != 201) { failHttp(call, c, code); return; }
                JSONObject res = new JSONObject(new String(readAll(c.getInputStream()), StandardCharsets.UTF_8));
                JSObject r = new JSObject();
                r.put("id", res.optString("id"));
                call.resolve(r);
            } catch (Exception e) {
                call.reject("Upload failed: " + e.getMessage(), "NETWORK");
            } finally {
                if (c != null) c.disconnect();
            }
        });
    }

    /** Downloads a Drive file into the temp file for tid. Resolves { size };
     *  finishFile then publishes it. */
    @PluginMethod
    public void driveDownload(PluginCall call) {
        String token = call.getString("token");
        String fileId = call.getString("fileId");
        String tid = call.getString("tid");
        long total = call.getLong("size", -1L);
        io.execute(() -> {
            HttpURLConnection c = null;
            try {
                c = (HttpURLConnection) new URL(DRIVE + "/drive/v3/files/" + fileId + "?alt=media").openConnection();
                c.setRequestProperty("Authorization", "Bearer " + token);
                int code = c.getResponseCode();
                if (code != 200) { failHttp(call, c, code); return; }
                File tmp = tempFile(tid);
                try (InputStream is = c.getInputStream(); OutputStream os = new FileOutputStream(tmp)) {
                    copy(is, os, tid, total);
                }
                JSObject r = new JSObject();
                r.put("size", tmp.length());
                call.resolve(r);
            } catch (Exception e) {
                tempFile(tid).delete();
                call.reject(isFull(e) ? "ENOSPC" : "Download failed: " + e.getMessage(), isFull(e) ? "FULL" : "NETWORK");
            } finally {
                if (c != null) c.disconnect();
            }
        });
    }

    // ── Helpers ─────────────────────────────────────────────────────────────
    private void copy(InputStream is, OutputStream os, String tid, long total) throws Exception {
        byte[] buf = new byte[64 * 1024];
        long done = 0, told = 0;
        int n;
        while ((n = is.read(buf)) > 0) {
            os.write(buf, 0, n);
            done += n;
            if (!tid.isEmpty() && done - told >= 256 * 1024) {
                told = done;
                JSObject p = new JSObject();
                p.put("tid", tid);
                p.put("done", done);
                p.put("total", total);
                notifyListeners("progress", p);
            }
        }
    }

    /** Rejects with the HTTP status as the code and Google's reason in the
     *  message, so JS can tell an expired token (401) from a full Drive. */
    private void failHttp(PluginCall call, HttpURLConnection c, int code) {
        String reason = "";
        try {
            InputStream es = c.getErrorStream();
            if (es != null) reason = new String(readAll(es), StandardCharsets.UTF_8);
        } catch (Exception ignored) { }
        call.reject("HTTP " + code + " " + reason, String.valueOf(code));
    }

    private static byte[] readAll(InputStream is) throws Exception {
        try (InputStream in = is; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[16 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toByteArray();
        }
    }

    private static boolean isFull(Exception e) {
        String m = String.valueOf(e.getMessage()).toLowerCase();
        return m.contains("enospc") || m.contains("no space");
    }

    private static String safeName(String name) {
        String s = name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        if (s.isEmpty() || s.startsWith(".")) s = "song" + s;
        return s.length() > 120 ? s.substring(s.length() - 120) : s;
    }

    private static String mimeFor(String name) {
        String ext = name.contains(".") ? name.substring(name.lastIndexOf('.') + 1).toLowerCase() : "";
        String m = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
        return m != null && m.startsWith("audio/") ? m : "audio/mpeg";
    }
}
