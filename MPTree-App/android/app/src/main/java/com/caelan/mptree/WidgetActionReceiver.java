package com.caelan.mptree;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import androidx.core.content.ContextCompat;

/**
 * A widget's button. It used to be a broadcast only the running player heard,
 * so with MPTree closed (the player not running) nothing happened. Now the
 * button starts the player itself, which carries on with the last song.
 * Starting it from a tap on a widget is allowed in the background.
 */
public class WidgetActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        Intent start = new Intent(context, MusicPlayerService.class);
        start.setAction(intent.getAction());
        try { ContextCompat.startForegroundService(context, start); } catch (Exception ignored) { /* not allowed now */ }
    }
}
