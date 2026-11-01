package com.caelan.mptree;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;

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

    // ── Immersive navigation ─────────────────────────────────────────────────
    // Hides the Android navigation bar for a cleaner, more immersive UI.
    // A swipe from the bottom edge transiently reveals it (system-standard
    // behavior), and it auto-hides again. Re-applied whenever the window
    // regains focus, since dialogs/system UI can reset visibility flags.
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideNavigationBar();
    }

    private void hideNavigationBar() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(
                        WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            View decor = getWindow().getDecorView();
            decor.setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
    }
}