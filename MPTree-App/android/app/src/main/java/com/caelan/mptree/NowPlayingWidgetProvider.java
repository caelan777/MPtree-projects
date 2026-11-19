package com.caelan.mptree;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/** The Bar widget, 4 x 1: cover, title, artist and the three buttons. Keeps its old
 *  name, so widgets placed before 1.5.6 are this one and keep working. Drawn by WidgetRenderer, like the other three. */
public class NowPlayingWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        WidgetRenderer.update(context, appWidgetManager, appWidgetIds, WidgetRenderer.BAR);
    }
}
