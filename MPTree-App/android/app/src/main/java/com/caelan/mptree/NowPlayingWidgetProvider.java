package com.caelan.mptree;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

import org.json.JSONObject;

/**
 * Home-screen "Now Playing" widget. Read-only on disk: it never touches
 * MediaPlayer or the MediaSession directly. It just renders whatever
 * MusicPlayerService.persistNowPlaying() last wrote to the
 * "CapacitorStorage" SharedPreferences (key "mptree_native_now_playing"),
 * and its three buttons rebroadcast the exact same
 * ACTION_PLAY / ACTION_PAUSE / ACTION_NEXT / ACTION_PREV intents the
 * notification already sends — so MusicPlayerService's existing
 * actionReceiver handles them with zero new wiring on the service side.
 *
 * Updates arrive two ways:
 *   1. Pushed live — MusicPlayerService broadcasts ACTION_APPWIDGET_UPDATE
 *      with this widget's ids every time persistNowPlaying() runs (track
 *      change, play/pause, and once a second while playing), which the
 *      system routes straight into onUpdate() below. The base
 *      AppWidgetProvider.onReceive() already handles dispatching that
 *      action, so no onReceive override is needed here.
 *   2. The slow system refresh cycle (updatePeriodMillis in the provider
 *      info XML) as a fallback safety net in case the service isn't
 *      running when the widget is first placed.
 */
public class NowPlayingWidgetProvider extends AppWidgetProvider {

    private static final String PREFS_NAME = "CapacitorStorage";
    private static final String PREFS_KEY  = "mptree_native_now_playing";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int widgetId : appWidgetIds) {
            updateOne(context, appWidgetManager, widgetId);
        }
    }

    private void updateOne(Context context, AppWidgetManager appWidgetManager, int widgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_now_playing);

        String title    = "Not playing";
        String artist   = "";
        boolean playing = false;
        boolean hasTrack = false;

        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String json = prefs.getString(PREFS_KEY, null);
        if (json != null) {
            try {
                JSONObject obj = new JSONObject(json);
                String path = obj.optString("path", "");
                if (!path.isEmpty()) {
                    hasTrack = true;
                    title  = obj.optString("title", "Unknown");
                    artist = obj.optString("artist", "Unknown");
                    playing = obj.optBoolean("isPlaying", false);
                }
            } catch (Exception ignored) { /* fall through to default "Not playing" */ }
        }

        views.setTextViewText(R.id.widget_title, title);
        views.setTextViewText(R.id.widget_artist, artist);
        views.setImageViewResource(R.id.widget_play_pause,
                playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play);

        // Buttons are visually present but inert-looking (still wired, just
        // won't do anything useful) when nothing has ever played — avoids a
        // confusing empty "Pause" state on first widget placement.
        views.setBoolean(R.id.widget_prev,       "setEnabled", hasTrack);
        views.setBoolean(R.id.widget_play_pause, "setEnabled", hasTrack);
        views.setBoolean(R.id.widget_next,       "setEnabled", hasTrack);

        views.setOnClickPendingIntent(R.id.widget_prev,
                buildServiceActionIntent(context, MusicPlayerService.ACTION_PREV, 10));
        views.setOnClickPendingIntent(R.id.widget_play_pause,
                buildServiceActionIntent(context,
                        playing ? MusicPlayerService.ACTION_PAUSE : MusicPlayerService.ACTION_PLAY, 11));
        views.setOnClickPendingIntent(R.id.widget_next,
                buildServiceActionIntent(context, MusicPlayerService.ACTION_NEXT, 12));

        Intent openApp = new Intent(context, MainActivity.class);
        openApp.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openPI = PendingIntent.getActivity(context, 13, openApp,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_root, openPI);

        appWidgetManager.updateAppWidget(widgetId, views);
    }

    /** Mirrors MusicPlayerService.buildActionIntent — same broadcast actions
     *  the notification's buttons already send, so the existing
     *  actionReceiver in the service needs no changes to handle these. */
    private PendingIntent buildServiceActionIntent(Context context, String action, int requestCode) {
        Intent intent = new Intent(action);
        intent.setPackage(context.getPackageName());
        return PendingIntent.getBroadcast(context, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}