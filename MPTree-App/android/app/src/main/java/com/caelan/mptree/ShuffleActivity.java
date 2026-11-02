package com.caelan.mptree;

import android.app.Activity;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;

/**
 * Shuffle all songs, without MPTree's screen: the MPTree TV launcher's Shuffle
 * music button starts this. It has no window (a see-through theme) and closes
 * straight away; while it is up, MPTree counts as in front, which is what lets it
 * start its player in the foreground. The player then shuffles the songs the app
 * saved for it (MusicPlayerService.PREF_TV_LIBRARY) and plays.
 *
 * Before the app has run once on this TV nothing is saved yet: then MPTree opens
 * and shuffles the usual way (the "shuffle" action, MainActivity.pendingAction).
 */
public class ShuffleActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (!MusicPlayerService.hasTvLibrary(this) || !startShuffle()) openApp();
        finish();
        overridePendingTransition(0, 0);
    }

    private boolean startShuffle() {
        Intent s = new Intent(this, MusicPlayerService.class).setAction(MusicPlayerService.ACTION_SHUFFLE_ALL);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(s);
            else startService(s);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private void openApp() {
        Intent i = new Intent(this, MainActivity.class)
                .putExtra("mptree_action", "shuffle")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        try { startActivity(i); } catch (Exception ignored) { }
    }
}
