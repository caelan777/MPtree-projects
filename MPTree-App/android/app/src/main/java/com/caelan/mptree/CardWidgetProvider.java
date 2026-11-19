package com.caelan.mptree;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

/** The Card widget, 4 x 2: larger, with the time and a timeline. Drawn by WidgetRenderer, like the other three. */
public class CardWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        WidgetRenderer.update(context, appWidgetManager, appWidgetIds, WidgetRenderer.CARD);
    }

    /** Made larger or smaller: previous and next come and go with the room. */
    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager appWidgetManager, int appWidgetId, Bundle newOptions) {
        WidgetRenderer.resized(context, appWidgetManager, appWidgetId, WidgetRenderer.CARD);
    }
}
