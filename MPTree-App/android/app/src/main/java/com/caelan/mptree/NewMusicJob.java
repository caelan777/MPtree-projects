package com.caelan.mptree;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.os.Build;
import android.provider.MediaStore;

import androidx.core.app.NotificationCompat;

/**
 * New music on the phone, even with MPTree closed. Android wakes this job when
 * something is added to its music (a download, a copy, Bluetooth); it counts
 * the songs added since MPTree was last opened and shows one notification,
 * "3 new songs", whose number the launcher puts on the icon. Opening MPTree
 * marks them seen (SystemPlugin.takeNewSongs) and takes the notification away.
 * A job that waits for a change runs once, so each run sets up the next.
 */
public class NewMusicJob extends JobService {
    private static final int JOB_ID = 7410;
    private static final int NOTE_ID = 7411;
    private static final String CHANNEL = "new_music";
    static final String PREFS = "mptree_newmusic";

    /** Waits for the next change to the phone's music. */
    public static void schedule(Context ctx) {
        try {
            SharedPreferences p = ctx.getSharedPreferences(PREFS, MODE_PRIVATE);
            // Counting starts from the first time: what is there already is not new.
            if (!p.contains("seen")) p.edit().putLong("seen", System.currentTimeMillis() / 1000).apply();
            JobScheduler js = ctx.getSystemService(JobScheduler.class);
            if (js == null) return;
            JobInfo job = new JobInfo.Builder(JOB_ID, new ComponentName(ctx, NewMusicJob.class))
                .addTriggerContentUri(new JobInfo.TriggerContentUri(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, JobInfo.TriggerContentUri.FLAG_NOTIFY_FOR_DESCENDANTS))
                .setTriggerContentUpdateDelay(5000)
                .setTriggerContentMaxDelay(60000)
                .build();
            js.schedule(job);
        } catch (Exception ignored) { /* no new-music notes, then */ }
    }

    /** Songs added since `seenSec`. */
    static int countSince(Context ctx, long seenSec) {
        try (Cursor c = ctx.getContentResolver().query(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                new String[] { MediaStore.Audio.Media._ID },
                MediaStore.Audio.Media.IS_MUSIC + " != 0 AND " + MediaStore.Audio.Media.DATE_ADDED + " > ?",
                new String[] { String.valueOf(seenSec) }, null)) {
            return c == null ? 0 : c.getCount();
        } catch (Exception e) { return 0; }
    }

    /** Opening MPTree: everything so far is seen, and the note goes. */
    static long markSeen(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, MODE_PRIVATE);
        long before = p.getLong("seen", System.currentTimeMillis() / 1000);
        p.edit().putLong("seen", System.currentTimeMillis() / 1000).apply();
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm != null) nm.cancel(NOTE_ID);
        return before;
    }

    @Override
    public boolean onStartJob(JobParameters params) {
        Context ctx = getApplicationContext();
        long seen = ctx.getSharedPreferences(PREFS, MODE_PRIVATE).getLong("seen", System.currentTimeMillis() / 1000);
        int n = countSince(ctx, seen);
        if (n > 0 && ctx.getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean("notify", true)) notifyNew(ctx, n);
        schedule(ctx);
        return false;
    }

    @Override
    public boolean onStopJob(JobParameters params) { return true; }

    private static void notifyNew(Context ctx, int n) {
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, ctx.getString(R.string.channel_new_music), NotificationManager.IMPORTANCE_DEFAULT);
            ch.setShowBadge(true);
            nm.createNotificationChannel(ch);
        }
        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(ctx, 14, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String text = ctx.getResources().getQuantityString(R.plurals.new_songs, n, n);
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_mptree)
            .setContentTitle(text)
            .setContentText(ctx.getString(R.string.new_songs_sub))
            .setNumber(n)
            .setBadgeIconType(NotificationCompat.BADGE_ICON_SMALL)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(pi);
        try { nm.notify(NOTE_ID, b.build()); } catch (SecurityException ignored) { /* notifications not allowed */ }
    }
}
