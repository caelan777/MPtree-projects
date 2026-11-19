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
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.widget.RemoteViews;

import androidx.core.content.ContextCompat;

import org.json.JSONObject;

/**
 * MPTree's four home screen widgets, drawn here and nowhere else:
 *
 *   Bar    4 x 1   cover, title and artist, previous, play/pause, next
 *   Card   4 x 2   the same, larger, with the time and a timeline
 *   Record 2 x 2   the cover on a record, with play/pause
 *   Pill   2 x 1   play/pause and what is playing
 *
 * Each is its own widget in the phone's widget list, because a widget on the
 * home screen cannot change its size: Bar is the old NowPlayingWidgetProvider,
 * so widgets placed before keep working. The colour ("Same as app", Black,
 * White or Clear) and whether the cover shows are chosen in the app (Settings,
 * Home screen widget) and kept in the "mptree_widget" preferences; they apply to
 * every MPTree widget at once.
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
    private static final Class<?>[] PROVIDERS = {
        NowPlayingWidgetProvider.class, CardWidgetProvider.class, RecordWidgetProvider.class, PillWidgetProvider.class,
    };
    private static final int[] LAYOUTS = {
        R.layout.widget_now_playing, R.layout.widget_card, R.layout.widget_record, R.layout.widget_pill,
    };

    // The cover of what plays, a copy of the service's (which recycles its own).
    private static Bitmap art;
    private static String artPath;
    private static int artVersion = 0;
    private static String lastKey = null;

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
    static final class Colours { int bg, text, sub, accent, accentFg, bgAlpha; }

    private static Colours of(int bg, int text, int sub, int accent, int accentFg, int alpha) {
        Colours c = new Colours();
        c.bg = bg; c.text = text; c.sub = sub; c.accent = accent; c.accentFg = accentFg; c.bgAlpha = alpha;
        return c;
    }

    static Colours colours(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        switch (p.getString("colour", "app")) {
            case "black": return of(0xFF111111, 0xFFFFFFFF, 0xFF9A9A9A, 0xFFFFFFFF, 0xFF000000, 255);
            case "white": return of(0xFFFFFFFF, 0xFF111111, 0xFF666666, 0xFF111111, 0xFFFFFFFF, 255);
            case "clear": {
                boolean dark = darkTextOnWallpaper(ctx);
                int fg = dark ? 0xFF111111 : 0xFFFFFFFF;
                return of(0x00000000, fg, dark ? 0xFF3A3A3A : 0xFFE6E6E6, fg, dark ? 0xFFFFFFFF : 0xFF000000, 0);
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
            int version = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getInt("version", 0);
            String key = st.has + "|" + st.path + "|" + st.title + "|" + st.artist + "|" + st.playing + "|" + artVersion + "|" + version;
            boolean full = force || !key.equals(lastKey);
            AppWidgetManager m = AppWidgetManager.getInstance(ctx);
            for (int kind = 0; kind < PROVIDERS.length; kind++) {
                int[] ids = m.getAppWidgetIds(new ComponentName(ctx, PROVIDERS[kind]));
                if (ids == null || ids.length == 0) continue;
                if (full) {
                    RemoteViews v = build(ctx, kind, st);
                    for (int id : ids) m.updateAppWidget(id, v);
                } else if (kind == CARD && st.has) {
                    RemoteViews v = new RemoteViews(ctx.getPackageName(), LAYOUTS[CARD]);
                    timeline(v, st, null);
                    for (int id : ids) m.partiallyUpdateAppWidget(id, v);
                }
            }
            lastKey = key;
        } catch (Exception ignored) { /* a widget is never worth a crash */ }
    }

    /** For a provider's own onUpdate: the system asks after placing or a reboot. */
    public static synchronized void update(Context ctx, AppWidgetManager m, int[] ids, int kind) {
        try {
            RemoteViews v = build(ctx, kind, read(ctx));
            for (int id : ids) m.updateAppWidget(id, v);
        } catch (Exception ignored) { /* stays as it was */ }
    }

    private static RemoteViews build(Context ctx, int kind, State st) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), LAYOUTS[kind]);
        Colours c = colours(ctx);
        boolean coverOn = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("cover", true);

        v.setInt(R.id.w_bg, "setColorFilter", c.bg | 0xFF000000);
        v.setInt(R.id.w_bg, "setImageAlpha", c.bgAlpha);
        v.setTextViewText(R.id.w_title, st.title);
        v.setTextColor(R.id.w_title, c.text);
        v.setTextViewText(R.id.w_artist, st.has ? st.artist : ctx.getString(R.string.widget_tap_to_open));
        v.setTextColor(R.id.w_artist, c.sub);
        v.setInt(R.id.w_play_bg, "setColorFilter", c.accent);
        v.setImageViewResource(R.id.w_play, st.playing ? R.drawable.ic_w_pause : R.drawable.ic_w_play);
        v.setInt(R.id.w_play, "setColorFilter", c.accentFg);

        float d = Math.min(ctx.getResources().getDisplayMetrics().density, 2.5f);
        Bitmap a = coverOn && art != null && st.path != null && st.path.equals(artPath) ? art : null;
        if (kind == RECORD) {
            v.setImageViewBitmap(R.id.w_disc, disc(ctx, a, Math.round(96 * d)));
        } else if (kind == BAR || kind == CARD) {
            int px = Math.round((kind == CARD ? 100 : 48) * d);
            v.setImageViewBitmap(R.id.w_cover, a != null ? rounded(a, px, px * 0.16f) : markTile(ctx, px, px * 0.16f, c));
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
            timeline(v, st, c);
        }

        PendingIntent open = openApp(ctx);
        v.setOnClickPendingIntent(R.id.widget_root, open);
        v.setOnClickPendingIntent(R.id.w_play_box, st.has
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
        Intent intent = new Intent(act);
        intent.setPackage(ctx.getPackageName());
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

    /** No cover (or the cover is off): the MPTree mark on the accent. */
    private static Bitmap markTile(Context ctx, int px, float r, Colours c) {
        Bitmap out = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(out);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(c.accent);
        cv.drawRoundRect(new RectF(0, 0, px, px), r, r, p);
        drawMark(ctx, cv, px / 2f, px / 2f, px * 0.3f, c.accentFg);
        return out;
    }

    /** A record seen from above: the cover printed on it when there is one,
     *  black with grooves when not, and a white label with the mark. */
    private static Bitmap disc(Context ctx, Bitmap a, int px) {
        Bitmap out = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(out);
        float R = px / 2f;
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        if (a != null) {
            Path clip = new Path();
            clip.addCircle(R, R, R, Path.Direction.CW);
            cv.save();
            cv.clipPath(clip);
            cv.drawBitmap(a, null, new RectF(0, 0, px, px), p);
            cv.restore();
        } else {
            p.setColor(0xFF111111);
            cv.drawCircle(R, R, R, p);
            p.setStyle(Paint.Style.STROKE);
            p.setStrokeWidth(Math.max(1f, px * 0.004f));
            p.setColor(0xFF242424);
            for (float k = 0.42f; k < 0.97f; k += 0.06f) cv.drawCircle(R, R, R * k, p);
            p.setStyle(Paint.Style.FILL);
        }
        p.setShader(null);
        p.setColor(0x55000000);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(Math.max(1f, px * 0.012f));
        cv.drawCircle(R, R, R - p.getStrokeWidth() / 2, p);
        p.setStyle(Paint.Style.FILL);
        p.setColor(0xFFFFFFFF);
        cv.drawCircle(R, R, R * 0.28f, p);
        drawMark(ctx, cv, R, R, R * 0.17f, 0xFF000000);
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
