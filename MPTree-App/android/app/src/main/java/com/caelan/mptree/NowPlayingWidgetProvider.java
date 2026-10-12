package com.caelan.mptree;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/**
 * The plain home-screen widget: title, artist and three buttons, in black or
 * white. The one widget that is not part of MPTree Pro.
 *
 * It is also what the other three are built on. A provider here does nothing
 * but ask for a redraw; what each widget looks like, and where its taps go,
 * is all in {@link Widgets}.
 *
 * A redraw comes two ways: MusicPlayerService asks for one whenever what is
 * playing changes, and Android asks now and then by itself (updatePeriodMillis
 * in the provider's XML), which covers a widget placed while nothing plays.
 */
public class NowPlayingWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        Widgets.updateAll(context);
    }
}
