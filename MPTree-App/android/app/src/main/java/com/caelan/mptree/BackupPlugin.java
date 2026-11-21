package com.caelan.mptree;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Environment;
import android.os.StatFs;
import android.provider.OpenableColumns;

import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.zip.Deflater;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipOutputStream;

/**
 * A backup to and from the person's own cloud: Google Drive, OneDrive or
 * Dropbox, through their apps on the phone. MPTree signs in to nothing and
 * holds no keys: a backup goes to the app the way the share sheet sends a
 * file, and comes back the way a file is opened from it.
 *
 * A backup is a zip of a folder (storage.ts zipBackupFolder): a
 * mptree_backup_<time>.json and a music/ folder with the songs. Coming back
 * it is copied here first, so a cloud app that streams the file is read once,
 * then only the songs that were picked are unpacked, into Music/MPTree.
 */
@CapacitorPlugin(name = "Backup")
public class BackupPlugin extends Plugin {

    private static final Map<String, String> APPS = new HashMap<>();
    static {
        APPS.put("drive", "com.google.android.apps.docs");
        APPS.put("onedrive", "com.microsoft.skydrive");
        APPS.put("dropbox", "com.dropbox.android");
    }

    private boolean installed(String pkg) {
        try {
            getContext().getPackageManager().getPackageInfo(pkg, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    /** Its page in the Play Store, to get the app. */
    private void openStore(String pkg) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + pkg));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        } catch (ActivityNotFoundException e) {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=" + pkg));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try { getContext().startActivity(i); } catch (Exception ignored) {}
        }
    }

    /** Which of the three apps are on this phone. */
    @PluginMethod
    public void clouds(PluginCall call) {
        JSObject r = new JSObject();
        for (Map.Entry<String, String> e : APPS.entrySet()) r.put(e.getKey(), installed(e.getValue()));
        call.resolve(r);
    }

    /** The app's page in the Play Store, for one that is not on this phone. */
    @PluginMethod
    public void getApp(PluginCall call) {
        String pkg = APPS.get(call.getString("app", ""));
        if (pkg == null) { call.reject("bad arguments"); return; }
        openStore(pkg);
        call.resolve();
    }

    /** Hands the zip at `path` to the app, which asks where in it to save it.
     *  Without the app: its Play Store page. */
    @PluginMethod
    public void sendTo(PluginCall call) {
        String path = call.getString("path");
        String pkg = APPS.get(call.getString("app", ""));
        if (path == null || pkg == null) { call.reject("bad arguments"); return; }
        JSObject r = new JSObject();
        if (!installed(pkg)) {
            openStore(pkg);
            r.put("sent", false);
            r.put("store", true);
            call.resolve(r);
            return;
        }
        try {
            if (path.startsWith("file://")) path = Uri.parse(path).getPath();
            File file = new File(path);
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".shareprovider", file);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("application/zip");
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.putExtra(Intent.EXTRA_TITLE, file.getName());
            send.setClipData(ClipData.newRawUri(file.getName(), uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            send.setPackage(pkg);
            // Some of them only say they take any file.
            if (send.resolveActivity(getContext().getPackageManager()) == null) send.setType("*/*");
            getActivity().startActivity(send);
            r.put("sent", true);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("send failed: " + e.getMessage());
        }
    }

    private Intent openDocument() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        return i;
    }

    /** Lets the person pick a backup: in the app given (its own picker), or
     *  anywhere on the phone. Copies it here and says what is in it. */
    @PluginMethod
    public void pick(PluginCall call) {
        String app = call.getString("app");
        String pkg = app == null ? null : APPS.get(app);
        Intent intent;
        if (pkg != null) {
            if (!installed(pkg)) {
                openStore(pkg);
                JSObject r = new JSObject();
                r.put("cancelled", true);
                r.put("store", true);
                call.resolve(r);
                return;
            }
            intent = new Intent(Intent.ACTION_GET_CONTENT);
            intent.setType("*/*");
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setPackage(pkg);
            if (intent.resolveActivity(getContext().getPackageManager()) == null) intent = openDocument();
        } else {
            intent = openDocument();
        }
        try {
            startActivityForResult(call, intent, "picked");
        } catch (ActivityNotFoundException e) {
            startActivityForResult(call, openDocument(), "picked");
        }
    }

    @ActivityCallback
    private void picked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            JSObject r = new JSObject();
            r.put("cancelled", true);
            call.resolve(r);
            return;
        }
        Uri uri = data.getData();
        new Thread(() -> readPicked(call, uri)).start();
    }

    private File restoreDir() {
        return new File(getContext().getCacheDir(), "restore");
    }

    private void progress(String phase, long done, long total) {
        JSObject p = new JSObject();
        p.put("phase", phase);
        p.put("done", done);
        p.put("total", total);
        notifyListeners("progress", p);
    }

    private long sizeOf(Uri uri) {
        try (Cursor c = getContext().getContentResolver().query(uri, new String[]{OpenableColumns.SIZE}, null, null, null)) {
            if (c != null && c.moveToFirst() && !c.isNull(0)) return c.getLong(0);
        } catch (Exception ignored) {}
        return -1;
    }

    private static String baseName(String name) {
        int slash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
        return slash >= 0 ? name.substring(slash + 1) : name;
    }

    /** A song of the backup: anything under a music/ folder in the zip. */
    private static boolean isSong(ZipEntry e) {
        if (e.isDirectory()) return false;
        String name = "/" + e.getName().replace('\\', '/');
        String base = baseName(name);
        return name.contains("/music/") && !base.isEmpty() && !base.startsWith(".");
    }

    private static String readText(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[64 * 1024];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }

    private static boolean isFull(IOException e) {
        String m = String.valueOf(e.getMessage()).toLowerCase();
        return m.contains("enospc") || m.contains("no space");
    }

    private void readPicked(PluginCall call, Uri uri) {
        ContentResolver cr = getContext().getContentResolver();
        File dir = restoreDir();
        deleteTree(dir);
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        File copy = new File(dir, "backup.bin");
        long total = sizeOf(uri);
        try (InputStream in = cr.openInputStream(uri); OutputStream out = new FileOutputStream(copy)) {
            if (in == null) { call.reject("could not open"); return; }
            byte[] buf = new byte[256 * 1024];
            long done = 0, said = 0;
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                done += n;
                long now = System.currentTimeMillis();
                if (now - said > 250) { said = now; progress("read", done, total); }
            }
            progress("read", done, total > 0 ? total : done);
        } catch (IOException e) {
            deleteTree(dir);
            call.reject(isFull(e) ? "full" : "read failed: " + e.getMessage());
            return;
        } catch (SecurityException e) {
            deleteTree(dir);
            call.reject("read failed: " + e.getMessage());
            return;
        }

        boolean zip = false;
        try (InputStream in = new FileInputStream(copy)) {
            zip = in.read() == 'P' && in.read() == 'K';
        } catch (IOException ignored) {}

        JSObject r = new JSObject();
        try {
            if (!zip) {
                // A backup from before 1.6.3: the .json on its own.
                try (InputStream in = new FileInputStream(copy)) { r.put("json", readText(in)); }
                deleteTree(dir);
                r.put("kind", "json");
                call.resolve(r);
                return;
            }
            String json = null;
            JSArray names = new JSArray();
            try (ZipFile zf = new ZipFile(copy)) {
                Enumeration<? extends ZipEntry> all = zf.entries();
                while (all.hasMoreElements()) {
                    ZipEntry e = all.nextElement();
                    if (e.isDirectory()) continue;
                    String base = baseName(e.getName());
                    if (json == null && base.startsWith("mptree_backup") && base.endsWith(".json")) {
                        try (InputStream in = zf.getInputStream(e)) { json = readText(in); }
                    } else if (isSong(e)) {
                        names.put(base);
                    }
                }
            }
            if (json == null) {
                deleteTree(dir);
                call.reject("not a backup");
                return;
            }
            r.put("kind", "zip");
            r.put("json", json);
            r.put("zip", copy.getAbsolutePath());
            r.put("names", names);
            call.resolve(r);
        } catch (IOException e) {
            deleteTree(dir);
            call.reject("not a backup");
        }
    }

    /** Unpacks the songs named (file names, as pick listed them) from the
     *  zip into `to`, a folder under the phone's storage such as
     *  "Music/MPTree/MPTree_Backup_1700000000000". */
    @PluginMethod
    public void unpack(PluginCall call) {
        String zipPath = call.getString("zip");
        String to = call.getString("to");
        JSArray list = call.getArray("names");
        if (zipPath == null || to == null || list == null) { call.reject("bad arguments"); return; }
        new Thread(() -> {
            Set<String> want = new HashSet<>();
            try {
                for (int i = 0; i < list.length(); i++) want.add(list.getString(i));
            } catch (Exception e) {
                call.reject("bad names");
                return;
            }
            File dest = new File(Environment.getExternalStorageDirectory(), to);
            try (ZipFile zf = new ZipFile(zipPath)) {
                List<ZipEntry> songs = new ArrayList<>();
                long bytes = 0;
                Enumeration<? extends ZipEntry> all = zf.entries();
                while (all.hasMoreElements()) {
                    ZipEntry e = all.nextElement();
                    if (isSong(e) && want.contains(baseName(e.getName()))) {
                        songs.add(e);
                        bytes += Math.max(0, e.getSize());
                    }
                }
                //noinspection ResultOfMethodCallIgnored
                dest.mkdirs();
                long free = new StatFs(dest.getAbsolutePath()).getAvailableBytes();
                if (bytes > free) {
                    JSObject err = new JSObject();
                    err.put("need", bytes);
                    err.put("free", free);
                    call.reject("full", "full", err);
                    return;
                }
                byte[] buf = new byte[256 * 1024];
                int done = 0;
                progress("unpack", 0, songs.size());
                for (ZipEntry e : songs) {
                    // The name only, never a path from the zip: nothing can
                    // land outside the folder.
                    File out = new File(dest, baseName(e.getName()));
                    try (InputStream in = zf.getInputStream(e); OutputStream os = new FileOutputStream(out)) {
                        int n;
                        while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
                    }
                    done++;
                    progress("unpack", done, songs.size());
                }
                JSObject r = new JSObject();
                r.put("folder", dest.getAbsolutePath());
                r.put("files", done);
                call.resolve(r);
            } catch (IOException e) {
                call.reject(isFull(e) ? "full" : "unpack failed: " + e.getMessage());
            }
        }).start();
    }

    // ── Making a backup ──────────────────────────────────────────────────────
    // The songs go straight from where they are into the zip in Download.
    // Up to 1.6.3 they were copied into a folder there first and that folder
    // was zipped, so a backup needed twice its size free on the phone for a
    // while, and "not enough storage" came far sooner than it had to (Caelan,
    // 21 Nov). The room is looked at first, on the phone: it is the phone that
    // has to hold the zip. The cloud app looks at its own room itself.
    private volatile boolean packStop = false;

    private static File downloads() {
        return Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
    }

    private static long need(JSArray paths, long jsonBytes) {
        long sum = jsonBytes;
        for (int i = 0; i < paths.length(); i++) {
            File f = new File(paths.optString(i, ""));
            if (f.isFile()) sum += f.length();
        }
        // The zip's own bookkeeping, and a little to spare.
        return sum + sum / 100 + 4L * 1024 * 1024;
    }

    private static long free() {
        try {
            File d = downloads();
            //noinspection ResultOfMethodCallIgnored
            d.mkdirs();
            return new StatFs(d.getAbsolutePath()).getAvailableBytes();
        } catch (Exception e) { return Long.MAX_VALUE; }
    }

    /** What a backup of these songs needs on the phone, and what is free. */
    @PluginMethod
    public void room(PluginCall call) {
        JSArray paths = call.getArray("paths", new JSArray());
        new Thread(() -> {
            JSObject r = new JSObject();
            r.put("need", need(paths, 0));
            r.put("free", free());
            call.resolve(r);
        }).start();
    }

    /** Packs `json` (as mptree_backup_<at>.json) and the songs at `paths` into
     *  Download/<name>.zip, the same zip storage.ts used to make from a
     *  folder, so every MPTree from 1.6.3 on can restore it. */
    @PluginMethod
    public void pack(PluginCall call) {
        final String name = call.getString("name", "");
        final String json = call.getString("json", "");
        final String at   = call.getString("at", String.valueOf(System.currentTimeMillis()));
        final JSArray paths = call.getArray("paths", new JSArray());
        if (name.isEmpty() || name.contains("/") || name.contains("\\")) { call.reject("bad name"); return; }
        packStop = false;
        new Thread(() -> {
            byte[] text = json.getBytes(StandardCharsets.UTF_8);
            long needed = need(paths, text.length), room = free();
            if (needed > room) {
                JSObject err = new JSObject();
                err.put("need", needed);
                err.put("free", room);
                call.reject("full", "full", err);
                return;
            }
            File out = new File(downloads(), name + ".zip");
            int total = paths.length(), done = 0, failed = 0;
            Set<String> taken = new HashSet<>();
            byte[] buf = new byte[256 * 1024];
            try (ZipOutputStream zos = new ZipOutputStream(new BufferedOutputStream(new FileOutputStream(out), 256 * 1024))) {
                zos.putNextEntry(new ZipEntry(name + "/mptree_backup_" + at + ".json"));
                zos.write(text);
                zos.closeEntry();
                // Songs are packed already: squeezing them again only costs time.
                zos.setLevel(Deflater.NO_COMPRESSION);
                progress("pack", 0, total);
                for (int i = 0; i < total; i++) {
                    if (packStop) break;
                    File f = new File(paths.optString(i, ""));
                    String base = baseName(f.getName());
                    // Two songs of one name: the backup can hold one of them,
                    // as the folder could.
                    if (!f.isFile() || base.isEmpty() || !taken.add(base)) { failed++; }
                    else {
                        try (InputStream in = new FileInputStream(f)) {
                            zos.putNextEntry(new ZipEntry(name + "/music/" + base));
                            int n;
                            while ((n = in.read(buf)) > 0) {
                                if (packStop) break;
                                zos.write(buf, 0, n);
                            }
                            zos.closeEntry();
                        } catch (IOException e) {
                            if (isFull(e)) throw e;
                            failed++;
                        }
                    }
                    done++;
                    progress("pack", done, total);
                }
            } catch (IOException e) {
                //noinspection ResultOfMethodCallIgnored
                out.delete();
                if (isFull(e)) {
                    JSObject err = new JSObject();
                    err.put("need", needed);
                    err.put("free", free());
                    call.reject("full", "full", err);
                } else {
                    call.reject("pack failed: " + e.getMessage());
                }
                return;
            }
            JSObject r = new JSObject();
            if (packStop) {
                //noinspection ResultOfMethodCallIgnored
                out.delete();
                r.put("stopped", true);
                call.resolve(r);
                return;
            }
            r.put("uri", Uri.fromFile(out).toString());
            r.put("size", out.length());
            r.put("failed", failed);
            call.resolve(r);
        }).start();
    }

    /** Stop button while a backup is being packed. */
    @PluginMethod
    public void stopPack(PluginCall call) {
        packStop = true;
        call.resolve();
    }

    /** The copy of the backup is no longer needed. */
    @PluginMethod
    public void discard(PluginCall call) {
        deleteTree(restoreDir());
        call.resolve();
    }

    private static void deleteTree(File f) {
        if (f == null || !f.exists()) return;
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteTree(k);
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }
}
