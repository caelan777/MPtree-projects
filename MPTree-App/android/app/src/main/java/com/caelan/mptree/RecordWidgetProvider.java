package com.caelan.mptree;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

/** The Record widget, 2 x 2: the cover on a record, with play/pause. Drawn by WidgetRenderer, like the other three. */
public class RecordWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        WidgetRenderer.update(context, appWidgetManager, appWidgetIds, WidgetRenderer.RECORD);
    }

    /** Made larger or smaller: previous and next come and go with the room. */
    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager appWidgetManager, int appWidgetId, Bundle newOptions) {
        WidgetRenderer.resized(context, appWidgetManager, appWidgetId, WidgetRenderer.RECORD);
    }

    /** Taken off the home screen: its colour is forgotten. */
    @Override
    public void onDeleted(Context context, int[] appWidgetIds) {
        WidgetRenderer.forget(context, appWidgetIds);
    }
}
