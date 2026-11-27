package com.caelan.mptree;

import android.app.PendingIntent;
import android.app.WallpaperColors;
import android.app.WallpaperManager;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

import androidx.core.content.ContextCompat;

import org.json.JSONObject;

import java.io.File;

/**
 * MPTree's four home screen widgets, drawn here and nowhere else:
 *
 *   Bar    4 x 1   cover, title and artist, previous, play/pause, next
 *   Card   4 x 2   the same, larger, with the time and a timeline      (Pro)
 *   Record 2 x 2   the record the app has on, with the song's cover     (Pro)
 *   Pill   2 x 1   play/pause and what is playing
 *
 * Each is its own widget in the phone's widget list, because a widget on the
 * home screen cannot change its size: Bar is the old NowPlayingWidgetProvider,
 * so widgets placed before keep working. Previous and next only show where
 * the widget is wide enough for them; made larger, Record and Pill get them.
 * The colour ("Same as app", Black, White or Clear glass, which is Pro) is
 * chosen in the app (Settings, Home screen widget) and kept in the
 * "mptree_widget" preferences, with the app's own colours, its record and
 * whether Pro is on. Each widget keeps the colour that was chosen when it was
 * put on the home screen ("colour_<id>"): choosing another one in the app is
 * for the next widget, and no longer changes the ones already there (Caelan,
 * 27 Nov: a widget turned clear when Clear was tapped in the app).
 *
 * Nothing here touches the player. What plays is read from what
 * MusicPlayerService.persistNowPlaying() wrote, and the buttons send the same
 * broadcasts as the notification's. The service asks for a refresh on every
 * change and once a second while playing; when only the time moved, just the
 * Card's timeline is sent (a partial update), and the pictures are only made
 * again when the song, the cover or the colours change.
 */
public final class WidgetRenderer {
    public static final int BAR = 0, CARD = 1, RECORD = 2, PILL = 3;
    public static final String PREFS = "mptree_widget";
    public static final String RECORD_FILE = "widget_record.png";
    private static final Class<?>[] PROVIDERS = {
        NowPlayingWidgetProvider.class, CardWidgetProvider.class, RecordWidgetProvider.class, PillWidgetProvider.class,
    };
    private static final int[] LAYOUTS = {
        R.layout.widget_now_playing, R.layout.widget_card, R.layout.widget_record, R.layout.widget_pill,
    };
    /** How wide (dp) a widget has to be for previous and next. */
    private static final int[] ROOM_FOR_SKIPS = { 220, 220, 150, 220 };

    // The cover of what plays, a copy of the service's (which recycles its own).
    private static Bitmap art;
    private static String artPath;
    private static int artVersion = 0;
    // The record the app has on, as it drew it.
    private static Bitmap record;
    private static int recordVersion = -1;
    private static String lastKey = null;
    private static int lastHeight = 0;

    private WidgetRenderer() {}

    public static Class<?> provider(int kind) { return PROVIDERS[kind]; }

    public static int kindOf(String name) {
        switch (name == null ? "" : name) {
            case "card": return CARD;
            case "record": return RECORD;
            case "pill": return PILL;
            default: return BAR;
        }
    }

    /** The service has the cover for `path` (or found none). */
    public static synchronized void setArt(Context ctx, String path, Bitmap source) {
        Bitmap next = null;
        try {
            if (source != null && !source.isRecycled()) next = square(source, 320);
        } catch (Throwable ignored) { next = null; }
        art = next;
        artPath = next != null ? path : null;
        artVersion++;
        refreshAll(ctx, true);
    }

    // ── what plays ───────────────────────────────────────────────────────────
    static final class State {
        boolean has, playing;
        String path, title, artist;
        long position, duration, updatedAt;
    }

    static State read(Context ctx) {
        State s = new State();
        s.title = ctx.getString(R.string.not_playing);
        s.artist = "";
        try {
            String json = ctx.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE).getString("mptree_native_now_playing", null);
            if (json != null) {
                JSONObject o = new JSONObject(json);
                String path = o.optString("path", "");
                if (!path.isEmpty()) {
                    s.has = true;
                    s.path = path;
                    s.title = o.optString("title", "Unknown");
                    s.artist = o.optString("artist", "");
                    s.playing = o.optBoolean("isPlaying", false);
                    s.position = o.optLong("position", 0);
                    s.duration = o.optLong("duration", 0);
                    s.updatedAt = o.optLong("updatedAt", System.currentTimeMillis());
                }
            }
        } catch (Exception ignored) { /* "Not playing" */ }
        return s;
    }

    // ── colours ──────────────────────────────────────────────────────────────
    static final class Colours { int bg, text, sub, accent, accentFg, bgAlpha; boolean glass; }

    private static Colours of(int bg, int text, int sub, int accent, int accentFg, int alpha) {
        Colours c = new Colours();
        c.bg = bg; c.text = text; c.sub = sub; c.accent = accent; c.accentFg = accentFg; c.bgAlpha = alpha;
        return c;
    }

    /** The colour this widget was put on the home screen with. A widget that
     *  has none yet (just placed, or placed before widgets kept their own)
     *  takes the one chosen in the app now, and keeps it. */
    static String colourOf(Context ctx, int id) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String own = p.getString("colour_" + id, null);
        if (own != null) return own;
        String now = p.getString("colour", "app");
        p.edit().putString("colour_" + id, now).apply();
        return now;
    }

    /** Every MPTree widget on the home screen keeps the colour it has: called
     *  before the app's choice changes, so widgets placed before this version
     *  keep theirs too. */
    public static synchronized void keepColours(Context ctx) {
        try {
            AppWidgetManager m = AppWidgetManager.getInstance(ctx);
            for (Class<?> c : PROVIDERS) {
                int[] ids = m.getAppWidgetIds(new ComponentName(ctx, c));
                if (ids != null) for (int id : ids) colourOf(ctx, id);
            }
        } catch (Exception ignored) { /* they follow the new choice, as before */ }
    }

    /** Widgets taken off the home screen: their colours go too. */
    public static void forget(Context ctx, int[] ids) {
        if (ids == null) return;
        SharedPreferences.Editor ed = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        for (int id : ids) ed.remove("colour_" + id);
        ed.apply();
    }

    static Colours colours(Context ctx, String colour) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        // Clear is part of Pro; without it the widget is black.
        if ("clear".equals(colour) && !p.getBoolean("pro", false)) colour = "black";
        switch (colour) {
            case "black": return of(0xFF111111, 0xFFFFFFFF, 0xFF9A9A9A, 0xFFFFFFFF, 0xFF000000, 255);
            case "white": return of(0xFFFFFFFF, 0xFF111111, 0xFF666666, 0xFF111111, 0xFFFFFFFF, 255);
            case "clear": {
                boolean dark = darkTextOnWallpaper(ctx);
                int fg = dark ? 0xFF111111 : 0xFFFFFFFF;
                Colours c = of(0x00000000, fg, dark ? 0xFF3A3A3A : 0xFFECECEC, fg, dark ? 0xFFFFFFFF : 0xFF000000, 255);
                c.glass = true;
                return c;
            }
            default:
                // The app's own colours, which the app sends (SystemPlugin.setWidgetConfig).
                return of(p.getInt("bg", 0xFF111111), p.getInt("text", 0xFFFFFFFF), p.getInt("sub", 0xFF9A9A9A),
                    p.getInt("accent", 0xFFFFFFFF), p.getInt("accentFg", 0xFF000000), 255);
        }
    }

    /** Whether dark letters read better than light ones on the wallpaper. */
    private static boolean darkTextOnWallpaper(Context ctx) {
        try {
            if (Build.VERSION.SDK_INT >= 27) {
                WallpaperColors wc = WallpaperManager.getInstance(ctx).getWallpaperColors(WallpaperManager.FLAG_SYSTEM);
                if (wc != null) {
                    if (Build.VERSION.SDK_INT >= 31) return (wc.getColorHints() & WallpaperColors.HINT_SUPPORTS_DARK_TEXT) != 0;
                    int c = wc.getPrimaryColor().toArgb();
                    double lum = (0.2126 * Color.red(c) + 0.7152 * Color.green(c) + 0.0722 * Color.blue(c)) / 255.0;
                    return lum > 0.62;
                }
            }
        } catch (Exception ignored) { /* light letters, then */ }
        return false;
    }

    // ── updates ──────────────────────────────────────────────────────────────
    /** Every MPTree widget on the home screen. `force`: draw them again even if
     *  nothing but the time changed. */
    public static synchronized void refreshAll(Context ctx, boolean force) {
        try {
            State st = read(ctx);
            SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String key = st.has + "|" + st.path + "|" + st.title + "|" + st.artist + "|" + st.playing + "|" + artVersion + "|" + p.getInt("version", 0);
            boolean full = force || !key.equals(lastKey);
            AppWidgetManager m = AppWidgetManager.getInstance(ctx);
            for (int kind = 0; kind < PROVIDERS.length; kind++) {
                int[] ids = m.getAppWidgetIds(new ComponentName(ctx, PROVIDERS[kind]));
                if (ids == null || ids.length == 0) continue;
                for (int id : ids) {
                    if (full) { lastHeight = heightOf(ctx, id); m.updateAppWidget(id, build(ctx, kind, id, st, widthOf(m, id))); }
                    else if (kind == CARD && st.has && proOn(ctx)) {
                        RemoteViews v = new RemoteViews(ctx.getPackageName(), LAYOUTS[CARD]);
                        timeline(v, st, null);
                        m.partiallyUpdateAppWidget(id, v);
                    }
                }
            }
            lastKey = key;
        } catch (Exception ignored) { /* a widget is never worth a crash */ }
    }

    /** For a provider's own onUpdate: the system asks after placing or a reboot. */
    public static synchronized void update(Context ctx, AppWidgetManager m, int[] ids, int kind) {
        try {
            State st = read(ctx);
            for (int id : ids) { lastHeight = heightOf(ctx, id); m.updateAppWidget(id, build(ctx, kind, id, st, widthOf(m, id))); }
        } catch (Exception ignored) { /* stays as it was */ }
    }

    /** One widget, made larger or smaller on the home screen. */
    public static synchronized void resized(Context ctx, AppWidgetManager m, int id, int kind) {
        try { lastHeight = heightOf(ctx, id); m.updateAppWidget(id, build(ctx, kind, id, read(ctx), widthOf(m, id))); } catch (Exception ignored) { /* stays as it was */ }
    }

    /** How wide the widget is, in dp; 0 when the launcher does not say. */
    private static int widthOf(AppWidgetManager m, int id) {
        try {
            Bundle o = m.getAppWidgetOptions(id);
            return o == null ? 0 : o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
        } catch (Exception e) { return 0; }
    }

    /** How tall the widget is, in dp; 0 when the launcher does not say. */
    private static int heightOf(Context ctx, int id) {
        try {
            Bundle o = AppWidgetManager.getInstance(ctx).getAppWidgetOptions(id);
            return o == null ? 0 : o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
        } catch (Exception e) { return 0; }
    }

    private static boolean proOn(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("pro", false);
    }

    private static RemoteViews build(Context ctx, int kind, int id, State st, int widthDp) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), LAYOUTS[kind]);
        Colours c = colours(ctx, colourOf(ctx, id));
        // Card and Record are part of Pro. Without it they say so, and a tap opens MPTree.
        boolean locked = (kind == CARD || kind == RECORD) && !proOn(ctx);

        // Each colour sets its own picture: a launcher applies an update to the
        // widget it has, so Black after Clear kept the glass.
        if (c.glass) {
            v.setImageViewResource(R.id.w_bg, kind == PILL ? R.drawable.w_glass_pill : R.drawable.w_glass);
            v.setInt(R.id.w_bg, "setColorFilter", 0xFFFFFFFF);
            v.setInt(R.id.w_bg, "setImageAlpha", 255);
        } else {
            v.setImageViewResource(R.id.w_bg, kind == PILL ? R.drawable.w_bg_pill : R.drawable.w_bg);
            v.setInt(R.id.w_bg, "setColorFilter", c.bg | 0xFF000000);
            v.setInt(R.id.w_bg, "setImageAlpha", c.bgAlpha);
        }
        v.setTextViewText(R.id.w_title, locked ? ctx.getString(R.string.widget_pro_title) : st.title);
        v.setTextColor(R.id.w_title, c.text);
        v.setTextViewText(R.id.w_artist, locked ? ctx.getString(R.string.widget_pro_sub) : st.has ? st.artist : ctx.getString(R.string.widget_tap_to_open));
        v.setTextColor(R.id.w_artist, c.sub);
        v.setInt(R.id.w_play_bg, "setColorFilter", c.accent);
        v.setImageViewResource(R.id.w_play, locked ? R.drawable.ic_w_lock : st.playing ? R.drawable.ic_w_pause : R.drawable.ic_w_play);
        v.setInt(R.id.w_play, "setColorFilter", c.accentFg);

        float d = Math.min(ctx.getResources().getDisplayMetrics().density, 2.5f);
        // The cover, as the player shows it: the song's own, or the mark.
        Bitmap a = !locked && art != null && st.path != null && st.path.equals(artPath) ? art : null;
        if (kind == RECORD) {
            // As large as the widget allows, under the words and the buttons.
            int side = widthDp > 0 ? widthDp - 20 : 96;
            int h = lastHeight > 0 ? lastHeight - 110 : 96;
            int dp = Math.max(72, Math.min(260, Math.min(side, h)));
            v.setImageViewBitmap(R.id.w_disc, disc(ctx, a, Math.round(dp * d), locked));
        } else if (kind == BAR || kind == CARD) {
            int px = Math.round((kind == CARD ? 100 : 48) * d);
            v.setImageViewBitmap(R.id.w_cover, a != null ? rounded(a, px, px * 0.16f) : markTile(ctx, px, px * 0.16f, c));
        }
        // Previous and next, where the widget is wide enough for them.
        boolean skips = !locked && (widthDp == 0 ? (kind == BAR || kind == CARD) : widthDp >= ROOM_FOR_SKIPS[kind]);
        v.setViewVisibility(R.id.w_prev, skips ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.w_next, skips ? View.VISIBLE : View.GONE);
        if (skips) {
            v.setInt(R.id.w_prev, "setColorFilter", c.text);
            v.setInt(R.id.w_next, "setColorFilter", c.text);
            v.setInt(R.id.w_prev, "setImageAlpha", st.has ? 255 : 90);
            v.setInt(R.id.w_next, "setImageAlpha", st.has ? 255 : 90);
            v.setOnClickPendingIntent(R.id.w_prev, action(ctx, MusicPlayerService.ACTION_PREV, 10));
            v.setOnClickPendingIntent(R.id.w_next, action(ctx, MusicPlayerService.ACTION_NEXT, 12));
        }
        if (kind == CARD) {
            v.setImageViewResource(R.id.w_mark, R.drawable.ic_stat_mptree);
            v.setInt(R.id.w_mark, "setColorFilter", c.sub);
            v.setViewVisibility(R.id.w_progress, locked ? View.INVISIBLE : View.VISIBLE);
            if (locked) { v.setTextViewText(R.id.w_time, ""); v.setTextViewText(R.id.w_total, ""); }
            else timeline(v, st, c);
        }

        PendingIntent open = openApp(ctx);
        v.setOnClickPendingIntent(R.id.widget_root, open);
        v.setOnClickPendingIntent(R.id.w_play_box, st.has && !locked
            ? action(ctx, st.playing ? MusicPlayerService.ACTION_PAUSE : MusicPlayerService.ACTION_PLAY, 11)
            : open);
        return v;
    }

    /** The Card's timeline and its two times. With `c`, its colours too. */
    private static void timeline(RemoteViews v, State st, Colours c) {
        long pos = st.position;
        if (st.playing) pos += Math.max(0, System.currentTimeMillis() - st.updatedAt);
        if (st.duration > 0) pos = Math.min(pos, st.duration);
        int p = st.duration > 0 ? (int) (pos * 1000 / st.duration) : 0;
        v.setProgressBar(R.id.w_progress, 1000, p, false);
        v.setTextViewText(R.id.w_time, fmt(pos));
        v.setTextViewText(R.id.w_total, st.duration > 0 ? fmt(st.duration) : "");
        if (c != null) {
            v.setTextColor(R.id.w_time, c.sub);
            v.setTextColor(R.id.w_total, c.sub);
            if (Build.VERSION.SDK_INT >= 31) {
                v.setColorStateList(R.id.w_progress, "setProgressTintList", ColorStateList.valueOf(c.text));
                v.setColorStateList(R.id.w_progress, "setProgressBackgroundTintList", ColorStateList.valueOf((c.text & 0x00FFFFFF) | 0x40000000));
            }
        }
    }

    private static String fmt(long ms) {
        long s = ms / 1000;
        return (s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60);
    }

    // ── taps ─────────────────────────────────────────────────────────────────
    /** The same broadcasts the notification's buttons send. */
    private static PendingIntent action(Context ctx, String act, int code) {
        // To WidgetActionReceiver, which starts the player if it is not running.
        Intent intent = new Intent(ctx, WidgetActionReceiver.class);
        intent.setAction(act);
        return PendingIntent.getBroadcast(ctx, code, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent openApp(Context ctx) {
        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(ctx, 13, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    // ── pictures ─────────────────────────────────────────────────────────────
    private static Bitmap square(Bitmap src, int size) {
        int w = src.getWidth(), h = src.getHeight(), s = Math.min(w, h);
        Bitmap out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(out);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        cv.drawBitmap(src, new android.graphics.Rect((w - s) / 2, (h - s) / 2, (w - s) / 2 + s, (h - s) / 2 + s), new RectF(0, 0, size, size), p);
        return out;
    }

    private static Bitmap rounded(Bitmap a, int px, float r) {
        Bitmap out = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(out);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        BitmapShader sh = new BitmapShader(a, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP);
        android.graphics.Matrix mx = new android.graphics.Matrix();
        mx.setScale(px / (float) a.getWidth(), px / (float) a.getHeight());
        sh.setLocalMatrix(mx);
        p.setShader(sh);
        cv.drawRoundRect(new RectF(0, 0, px, px), r, r, p);
        return out;
    }

    /** No cover: the MPTree mark on the accent. */
    private static Bitmap markTile(Context ctx, int px, float r, Colours c) {
        Bitmap out = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(out);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(c.accent);
        cv.drawRoundRect(new RectF(0, 0, px, px), r, r, p);
        drawMark(ctx, cv, px / 2f, px / 2f, px * 0.3f, c.accentFg);
        return out;
    }

    /** The record the app has on, drawn by the app and kept as a file. */
    private static Bitmap appRecord(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        int version = p.getInt("recordVersion", 0);
        if (record != null && recordVersion == version) return record;
        recordVersion = version;
        record = null;
        try {
            File f = new File(ctx.getFilesDir(), RECORD_FILE);
            if (f.exists()) record = BitmapFactory.decodeFile(f.getAbsolutePath());
        } catch (Exception ignored) { record = null; }
        return record;
    }

    /** A record seen from above, the way the player draws it: the record the
     *  app has on, with the song's cover on its label; or, with the picture
     *  disc on and a cover there, the cover as the record and the mark on a
     *  white label. Locked (no Pro), the black record. */
    private static Bitmap disc(Context ctx, Bitmap a, int px, boolean locked) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        boolean picture = !locked && a != null && p.getBoolean("photoDisc", true);
        int labelBg = locked ? 0xFFFFFFFF : p.getInt("labelBg", 0xFFFFFFFF);
        int labelInk = locked ? 0xFF000000 : p.getInt("labelInk", 0xFF000000);
        Bitmap out = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(out);
        float R = px / 2f;
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        Path clip = new Path();
        clip.addCircle(R, R, R, Path.Direction.CW);
        cv.save();
        cv.clipPath(clip);
        Bitmap rec = locked ? null : appRecord(ctx);
        if (picture) {
            cv.drawBitmap(a, null, new RectF(0, 0, px, px), paint);
        } else if (rec != null) {
            cv.drawBitmap(rec, null, new RectF(0, 0, px, px), paint);
        } else {
            paint.setColor(0xFF111111);
            cv.drawCircle(R, R, R, paint);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(Math.max(1f, px * 0.004f));
            paint.setColor(0xFF242424);
            for (float k = 0.42f; k < 0.97f; k += 0.06f) cv.drawCircle(R, R, R * k, paint);
            paint.setStyle(Paint.Style.FILL);
        }
        cv.restore();
        paint.setColor(0x55000000);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(Math.max(1f, px * 0.012f));
        cv.drawCircle(R, R, R - paint.getStrokeWidth() / 2, paint);
        paint.setStyle(Paint.Style.FILL);
        float L = R * 0.3f;
        if (!picture && a != null) {
            // The song's cover on the label, as in the player.
            Path label = new Path();
            label.addCircle(R, R, L, Path.Direction.CW);
            cv.save();
            cv.clipPath(label);
            cv.drawBitmap(a, null, new RectF(R - L, R - L, R + L, R + L), paint);
            cv.restore();
        } else {
            paint.setColor(picture ? 0xFFFFFFFF : labelBg);
            cv.drawCircle(R, R, L, paint);
            drawMark(ctx, cv, R, R, L * 0.6f, picture ? 0xFF000000 : labelInk);
        }
        return out;
    }

    private static void drawMark(Context ctx, Canvas cv, float cx, float cy, float half, int colour) {
        Drawable mark = ContextCompat.getDrawable(ctx, R.drawable.ic_stat_mptree);
        if (mark == null) return;
        mark = mark.mutate();
        mark.setTint(colour);
        mark.setBounds(Math.round(cx - half), Math.round(cy - half), Math.round(cx + half), Math.round(cy + half));
        mark.draw(cv);
    }
}
