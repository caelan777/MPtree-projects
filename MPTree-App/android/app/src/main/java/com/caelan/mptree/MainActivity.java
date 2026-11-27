package com.caelan.mptree;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {

    /** What another app asked for as it opened MPTree, until the app takes it
     *  (SystemPlugin.takeAction). The MPTree TV launcher's Shuffle music button
     *  sends "shuffle": shuffle all songs. */
    static volatile String pendingAction = null;

    private static void takeActionFrom(Intent intent) {
        if (intent == null) return;
        String action = intent.getStringExtra("mptree_action");
        if (action != null) {
            pendingAction = action;
            intent.removeExtra("mptree_action");
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        takeActionFrom(intent);
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {

        registerPlugin(MusicScannerPlugin.class);
        registerPlugin(AudioPlayerPlugin.class);
        registerPlugin(SystemPlugin.class);
        registerPlugin(BillingPlugin.class);
        registerPlugin(AccountPlugin.class);
        registerPlugin(SyncPlugin.class);
        registerPlugin(AdsPlugin.class);
        registerPlugin(BackupPlugin.class);
        super.onCreate(savedInstanceState);
        takeActionFrom(getIntent());
    }

    /**
     * The remote's search button, on a TV: MPTree searches its own songs by
     * voice instead of Android opening its global search. (Remotes whose
     * microphone button is the Google Assistant button go to the Assistant;
     * the microphone next to the search field in MPTree works on every TV.)
     */
    @Override
    public boolean onSearchRequested() {
        if (bridge != null && SystemPlugin.isTv(this)) {
            PluginHandle h = bridge.getPlugin("System");
            if (h != null && h.getInstance() instanceof SystemPlugin) {
                ((SystemPlugin) h.getInstance()).searchKey();
                return true;
            }
        }
        return super.onSearchRequested();
    }

    // The navigation bar used to be hidden (immersive mode). It stays now:
    // hidden, it came back over the player on every swipe from the bottom.
    // Capacitor's SystemBars keeps the page clear of it (safe-area insets),
    // and SystemPlugin.setNavBar matches its colour to the theme.
}