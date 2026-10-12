package com.caelan.mptree;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.io.File;

/**
 * The home-screen widgets, all four drawn here.
 *
 * <ul>
 *   <li>the plain one, black or white, for everyone;</li>
 *   <li>the record, the pocket player and the big player, part of MPTree Pro.</li>
 * </ul>
 *
 * A widget never touches the player. It shows what MusicPlayerService last
 * wrote down ("mptree_native_now_playing" in the CapacitorStorage preferences,
 * and the cover as a small file in the cache), and its buttons send the same
 * broadcasts the notification's buttons send.
 *
 * What it looks like comes from the app: the window writes "mptree_widget"
 * with whether Pro is on, black or white for the plain widget, and the
 * colours of the look in use. So there is no table of colours on this side,
 * and a Pro look carries over to the widgets by itself.
 */
public final class Widgets {

    private Widgets() {}

    static final int BASIC = 0, VINYL = 1, POD = 2, PLAYER = 3;

    static final Class<?>[] PROVIDERS = {
            NowPlayingWidgetProvider.class, VinylWidgetProvider.class,
            PodWidgetProvider.class, PlayerWidgetProvider.class,
    };

    private static final String PREFS      = "CapacitorStorage";
    private static final String KEY_NOW    = "mptree_native_now_playing";
    private static final String KEY_LOOK   = "mptree_widget";
    /** The current cover, small, written by MusicPlayerService. */
    static final String ART_FILE = "widget_art.jpg";
    static final int ART_PX = 256;

    // ── What there is to show ────────────────────────────────────────────────

    private static final class Now {
        String title, artist = "";
        boolean hasTrack, playing;
        int position, duration;
    }

    private static final class Look {
        boolean pro, basicWhite;
        int card = 0xFF141414, bg = 0xFF000000, text = 0xFFFFFFFF, muted = 0xFF777777;
        /** A dark body wants the light progress bar, and the other way round. */
        boolean dark() {
            return 0.299 * Color.red(card) + 0.587 * Color.green(card) + 0.114 * Color.blue(card) < 128;
        }
    }

    private static Now readNow(Context c, SharedPreferences prefs) {
        Now n = new Now();
        n.title = c.getString(R.string.not_playing);
        try {
            String json = prefs.getString(KEY_NOW, null);
            if (json == null) return n;
            JSONObject o = new JSONObject(json);
            if (o.optString("path", "").isEmpty()) return n;
            n.hasTrack = true;
            n.title    = o.optString("title", "Unknown");
            n.artist   = o.optString("artist", "");
            n.playing  = o.optBoolean("isPlaying", false);
            n.position = o.optInt("position", 0);
            n.duration = o.optInt("duration", 0);
        } catch (Exception ignored) { /* shows "Not playing" */ }
        return n;
    }

    private static Look readLook(SharedPreferences prefs) {
        Look l = new Look();
        try {
            String json = prefs.getString(KEY_LOOK, null);
            if (json == null) return l;
            JSONObject o = new JSONObject(json);
            l.pro        = o.optBoolean("pro", false);
            l.basicWhite = "white".equals(o.optString("basic", "black"));
            l.card  = colour(o.optString("card", ""),  l.card);
            l.bg    = colour(o.optString("bg", ""),    l.bg);
            l.text  = colour(o.optString("text", ""),  l.text);
            l.muted = colour(o.optString("muted", ""), l.muted);
        } catch (Exception ignored) { /* the black look */ }
        return l;
    }

    private static int colour(String css, int fallback) {
        try { return css.isEmpty() ? fallback : Color.parseColor(css); }
        catch (Exception e) { return fallback; }
    }

    private static Bitmap readArt(Context c) {
        File f = new File(c.getCacheDir(), ART_FILE);
        return f.exists() ? BitmapFactory.decodeFile(f.getAbsolutePath()) : null;
    }

    // ── Updating ─────────────────────────────────────────────────────────────

    /** Redraws every widget that is on a home screen. */
    public static void updateAll(Context c) {
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(c);
            SharedPreferences prefs = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            Now now = null; Look look = null; Bitmap art = null; boolean artRead = false;
            for (int kind = 0; kind < PROVIDERS.length; kind++) {
                int[] ids = mgr.getAppWidgetIds(new ComponentName(c, PROVIDERS[kind]));
                if (ids == null || ids.length == 0) continue;
                if (now == null) { now = readNow(c, prefs); look = readLook(prefs); }
                boolean locked = kind != BASIC && !look.pro;
                if (kind != BASIC && !locked && !artRead) { art = readArt(c); artRead = true; }
                mgr.updateAppWidget(ids, locked ? locked(c, look) : build(c, kind, now, look, art));
            }
        } catch (Exception ignored) { /* a widget that fails to draw must not take playback with it */ }
    }

    /**
     * Once a second while a song plays: only the bar and the time of the big
     * player move, so only those are sent, and the cover is not sent again.
     */
    public static void updateProgress(Context c, int position, int duration) {
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(c);
            int[] ids = mgr.getAppWidgetIds(new ComponentName(c, PROVIDERS[PLAYER]));
            if (ids == null || ids.length == 0) return;
            // Without Pro the widget is the locked one, which has no bar.
            if (!readLook(c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)).pro) return;
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_player);
            progress(v, position, duration);
            mgr.partiallyUpdateAppWidget(ids, v);
        } catch (Exception ignored) {}
    }

    private static void progress(RemoteViews v, int position, int duration) {
        int thousandths = duration > 0 ? (int) Math.min(1000L, position * 1000L / duration) : 0;
        v.setProgressBar(R.id.widget_progress_dark,  1000, thousandths, false);
        v.setProgressBar(R.id.widget_progress_light, 1000, thousandths, false);
        v.setTextViewText(R.id.widget_elapsed, clock(position));
        v.setTextViewText(R.id.widget_total, duration > 0 ? clock(duration) : "");
    }

    private static String clock(int ms) {
        int s = Math.max(0, ms / 1000);
        return (s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60);
    }

    // ── The four widgets ─────────────────────────────────────────────────────

    private static RemoteViews build(Context c, int kind, Now now, Look look, Bitmap art) {
        // With nothing loaded, or the player gone, a button has nobody to
        // tell: it opens MPTree, where a song can be started.
        boolean live = now.hasTrack && MusicPlayerService.running;
        PendingIntent open = open(c);
        PendingIntent prev = live ? action(c, MusicPlayerService.ACTION_PREV, 10) : open;
        PendingIntent next = live ? action(c, MusicPlayerService.ACTION_NEXT, 12) : open;
        PendingIntent toggle = !live ? open
                : action(c, now.playing ? MusicPlayerService.ACTION_PAUSE : MusicPlayerService.ACTION_PLAY, 11);
        int playIcon = now.playing ? R.drawable.ic_w_pause : R.drawable.ic_w_play;

        RemoteViews v;
        switch (kind) {
            case VINYL: {
                v = new RemoteViews(c.getPackageName(), R.layout.widget_vinyl);
                v.setImageViewBitmap(R.id.widget_disc, disc(art, 360));
                v.setViewVisibility(R.id.widget_paused, now.playing ? View.GONE : View.VISIBLE);
                tint(v, R.id.widget_paused, 0xFFFFFFFF);
                tint(v, R.id.widget_prev_bg, look.card);
                tint(v, R.id.widget_next_bg, look.card);
                tint(v, R.id.widget_prev_icon, look.text);
                tint(v, R.id.widget_next_icon, look.text);
                v.setOnClickPendingIntent(R.id.widget_disc, toggle);
                v.setOnClickPendingIntent(R.id.widget_prev, prev);
                v.setOnClickPendingIntent(R.id.widget_next, next);
                return v;
            }
            case POD: {
                v = new RemoteViews(c.getPackageName(), R.layout.widget_pod);
                tint(v, R.id.widget_bg, look.card);
                tint(v, R.id.widget_screen_bg, look.bg);
                tint(v, R.id.widget_wheel, look.bg);
                tint(v, R.id.widget_hub, look.card);
                v.setTextColor(R.id.widget_menu, look.muted);
                tint(v, R.id.widget_prev, look.muted);
                tint(v, R.id.widget_next, look.muted);
                tint(v, R.id.widget_play_pause, look.muted);
                v.setImageViewResource(R.id.widget_play_pause, playIcon);
                cover(v, art, 120, 0.16f);
                texts(v, now, look.text, look.muted);
                v.setOnClickPendingIntent(R.id.widget_screen, open);
                v.setOnClickPendingIntent(R.id.widget_menu, open);
                v.setOnClickPendingIntent(R.id.widget_hub, toggle);
                v.setOnClickPendingIntent(R.id.widget_play_pause, toggle);
                v.setOnClickPendingIntent(R.id.widget_prev, prev);
                v.setOnClickPendingIntent(R.id.widget_next, next);
                return v;
            }
            case PLAYER: {
                v = new RemoteViews(c.getPackageName(), R.layout.widget_player);
                tint(v, R.id.widget_bg, look.card);
                cover(v, art, ART_PX, 0.14f);
                texts(v, now, look.text, look.muted);
                boolean dark = look.dark();
                v.setViewVisibility(R.id.widget_progress_dark,  dark ? View.VISIBLE : View.GONE);
                v.setViewVisibility(R.id.widget_progress_light, dark ? View.GONE : View.VISIBLE);
                v.setTextColor(R.id.widget_elapsed, look.muted);
                v.setTextColor(R.id.widget_total, look.muted);
                progress(v, now.position, now.duration);
                tint(v, R.id.widget_prev, look.text);
                tint(v, R.id.widget_next, look.text);
                // The play button is the one filled shape, as in the app.
                tint(v, R.id.widget_play_bg, look.text);
                tint(v, R.id.widget_play_icon, look.card);
                v.setImageViewResource(R.id.widget_play_icon, playIcon);
                v.setOnClickPendingIntent(R.id.widget_root, open);
                v.setOnClickPendingIntent(R.id.widget_play_pause, toggle);
                v.setOnClickPendingIntent(R.id.widget_prev, prev);
                v.setOnClickPendingIntent(R.id.widget_next, next);
                return v;
            }
            default: {
                v = new RemoteViews(c.getPackageName(), R.layout.widget_now_playing);
                int body = look.basicWhite ? 0xFFFFFFFF : 0xFF000000;
                int ink  = look.basicWhite ? 0xFF111111 : 0xFFFFFFFF;
                int soft = look.basicWhite ? 0xFF666666 : 0xFFB3B3B3;
                tint(v, R.id.widget_bg, body);
                texts(v, now, ink, soft);
                tint(v, R.id.widget_prev, ink);
                tint(v, R.id.widget_next, ink);
                tint(v, R.id.widget_play_pause, ink);
                v.setImageViewResource(R.id.widget_play_pause, playIcon);
                v.setOnClickPendingIntent(R.id.widget_root, open);
                v.setOnClickPendingIntent(R.id.widget_play_pause, toggle);
                v.setOnClickPendingIntent(R.id.widget_prev, prev);
                v.setOnClickPendingIntent(R.id.widget_next, next);
                return v;
            }
        }
    }

    /** A Pro widget without Pro: it says what it is, and a tap opens MPTree. */
    private static RemoteViews locked(Context c, Look look) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_locked);
        tint(v, R.id.widget_bg, 0xFF141414);
        v.setTextColor(R.id.widget_title, 0xFFFFFFFF);
        v.setTextColor(R.id.widget_artist, 0xFF9A9A9A);
        v.setOnClickPendingIntent(R.id.widget_root, open(c));
        return v;
    }

    private static void texts(RemoteViews v, Now now, int title, int artist) {
        v.setTextViewText(R.id.widget_title, now.title);
        v.setTextViewText(R.id.widget_artist, now.artist);
        v.setTextColor(R.id.widget_title, title);
        v.setTextColor(R.id.widget_artist, artist);
    }

    /** The shapes and icons are white in their files; this is where they get a colour. */
    private static void tint(RemoteViews v, int id, int colour) {
        v.setInt(id, "setColorFilter", colour);
    }

    private static void cover(RemoteViews v, Bitmap art, int px, float corner) {
        if (art != null) v.setImageViewBitmap(R.id.widget_art, rounded(art, px, corner));
        else v.setImageViewResource(R.id.widget_art, R.drawable.album_art_logo);
    }

    // ── Drawing ──────────────────────────────────────────────────────────────

    /** A shader that fills a square of `px` with the middle of `src`. */
    private static BitmapShader fill(Bitmap src, int px) {
        BitmapShader shader = new BitmapShader(src, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP);
        float scale = px / (float) Math.min(src.getWidth(), src.getHeight());
        Matrix m = new Matrix();
        m.setScale(scale, scale);
        m.postTranslate((px - src.getWidth() * scale) / 2f, (px - src.getHeight() * scale) / 2f);
        shader.setLocalMatrix(m);
        return shader;
    }

    /** The cover as a square with rounded corners; `corner` is a part of its side. */
    private static Bitmap rounded(Bitmap src, int px, float corner) {
        Bitmap out = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setShader(fill(src, px));
        new Canvas(out).drawRoundRect(new RectF(0, 0, px, px), px * corner, px * corner, p);
        return out;
    }

    /**
     * A record: black, with grooves, and the cover as the label in the middle.
     * It cannot turn. A widget is a picture the home screen is handed, and a
     * picture a second is the most it takes.
     */
    private static Bitmap disc(Bitmap art, int px) {
        Bitmap out = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(out);
        float mid = px / 2f, r = mid - 1f;
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);

        p.setColor(0xFF0B0B0D);
        canvas.drawCircle(mid, mid, r, p);

        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(1f);
        for (float g = 0.46f; g < 0.97f; g += 0.035f) {
            // Every third groove a little lighter, like the gaps between songs.
            p.setColor(Math.round(g * 1000) % 3 == 0 ? 0xFF2C2C31 : 0xFF1A1A1E);
            canvas.drawCircle(mid, mid, r * g, p);
        }
        p.setColor(0xFF2C2C31);
        canvas.drawCircle(mid, mid, r - 0.5f, p);

        p.setStyle(Paint.Style.FILL);
        float label = r * 0.40f;
        if (art != null) {
            p.setShader(fill(art, px));
            // The shader covers the whole square; scaled about the middle it
            // puts the middle of the cover on the label.
            canvas.save();
            canvas.scale(0.40f, 0.40f, mid, mid);
            canvas.drawCircle(mid, mid, r, p);
            canvas.restore();
            p.setShader(null);
        } else {
            p.setColor(0xFFEDEDED);
            canvas.drawCircle(mid, mid, label, p);
        }
        p.setColor(0xFF0B0B0D);
        canvas.drawCircle(mid, mid, r * 0.035f, p);
        return out;
    }

    // ── Where a tap goes ─────────────────────────────────────────────────────

    private static PendingIntent action(Context c, String action, int code) {
        Intent intent = new Intent(action);
        intent.setPackage(c.getPackageName());
        return PendingIntent.getBroadcast(c, code, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent open(Context c) {
        Intent intent = new Intent(c, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, 13, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
