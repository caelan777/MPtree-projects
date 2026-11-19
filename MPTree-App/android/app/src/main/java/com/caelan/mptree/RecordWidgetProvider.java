package com.caelan.mptree;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/** The Record widget, 2 x 2: the cover on a record, with play/pause. Drawn by WidgetRenderer, like the other three. */
public class RecordWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        WidgetRenderer.update(context, appWidgetManager, appWidgetIds, WidgetRenderer.RECORD);
    }
}
