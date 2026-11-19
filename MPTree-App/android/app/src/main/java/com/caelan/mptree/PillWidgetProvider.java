package com.caelan.mptree;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

/** The Pill widget, 2 x 1: play/pause and what is playing. Drawn by WidgetRenderer, like the other three. */
public class PillWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        WidgetRenderer.update(context, appWidgetManager, appWidgetIds, WidgetRenderer.PILL);
    }

    /** Made larger or smaller: previous and next come and go with the room. */
    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager appWidgetManager, int appWidgetId, Bundle newOptions) {
        WidgetRenderer.resized(context, appWidgetManager, appWidgetId, WidgetRenderer.PILL);
    }
}
