package com.caelan.mptree.tv;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

// Back is left to @capacitor/app: as long as the page listens for "backButton"
// (App.tsx always does), Back never closes the launcher. Apps and Settings go
// back to Home; on Home it does nothing, since a home screen has nothing behind it.
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LauncherPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
