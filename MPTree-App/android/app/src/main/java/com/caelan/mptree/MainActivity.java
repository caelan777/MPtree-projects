package com.caelan.mptree;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

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
    }

    // The navigation bar used to be hidden (immersive mode). It stays now:
    // hidden, it came back over the player on every swipe from the bottom.
    // Capacitor's SystemBars keeps the page clear of it (safe-area insets),
    // and SystemPlugin.setNavBar matches its colour to the theme.
}