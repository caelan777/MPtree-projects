package com.caelan.mptree;

import android.accounts.Account;
import android.accounts.AccountManager;
import android.app.Activity;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;

import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.AuthorizationClient;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.ClearTokenRequest;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.Scope;

import java.util.Collections;
import java.util.List;

/**
 * Sign in with Google, for the MPTree account.
 *
 * There is no MPTree server. The account is the person's own Google Drive, and
 * only its app folder: a hidden corner that MPTree alone can read and that the
 * person's other files cannot be seen from. So the one thing asked for is the
 * drive.appdata scope, and what comes back is a short-lived access token that
 * src/sync uses to talk to Drive directly.
 *
 * Signing in starts with Android's own account chooser, so another Google
 * account can be picked (or added) each time; left to itself, Google Play
 * services would quietly take the account used last. Then Play services shows
 * the consent screen once per account and remembers the grant: after the
 * first time a token comes back without any UI.
 * Which app is asking is known from the package name and signing certificate,
 * which is why the OAuth client in Google Cloud lists both signing keys.
 */
@CapacitorPlugin(name = "Account")
public class AccountPlugin extends Plugin {

    static final String DRIVE_APPDATA = "https://www.googleapis.com/auth/drive.appdata";
    private static final List<Scope> SCOPES = Collections.singletonList(new Scope(DRIVE_APPDATA));

    private ActivityResultLauncher<IntentSenderRequest> consent;
    private ActivityResultLauncher<Intent> chooser;
    /** The signIn() call waiting for the account chooser or consent screen. */
    private PluginCall pending;

    @Override
    public void load() {
        // Registered here because plugins load inside the activity's onCreate,
        // the last moment Android allows it.
        consent = getActivity().registerForActivityResult(
                new ActivityResultContracts.StartIntentSenderForResult(), res -> {
                    PluginCall call = pending;
                    pending = null;
                    if (call == null) return;
                    if (res.getResultCode() != Activity.RESULT_OK || res.getData() == null) {
                        JSObject r = new JSObject();
                        r.put("cancelled", true);
                        call.resolve(r);
                        return;
                    }
                    try {
                        answer(call, client().getAuthorizationResultFromIntent(res.getData()));
                    } catch (Exception e) {
                        call.reject("Sign-in failed: " + e.getMessage(), "AUTH_FAILED");
                    }
                });
        chooser = getActivity().registerForActivityResult(
                new ActivityResultContracts.StartActivityForResult(), this::chosen);
    }

    /** The account chooser closed: on to the consent screen for that account. */
    private void chosen(ActivityResult res) {
        PluginCall call = pending;
        pending = null;
        if (call == null) return;
        Intent data = res.getData();
        String name = data == null ? null : data.getStringExtra(AccountManager.KEY_ACCOUNT_NAME);
        if (res.getResultCode() != Activity.RESULT_OK || name == null) {
            JSObject r = new JSObject();
            r.put("cancelled", true);
            call.resolve(r);
            return;
        }
        authorize(call, new Account(name, "com.google"), true);
    }

    @SuppressWarnings("deprecation")
    private Intent chooserIntent() {
        String[] types = { "com.google" };
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? AccountManager.newChooseAccountIntent(null, null, types, null, null, null, null)
                : AccountManager.newChooseAccountIntent(null, null, types, true, null, null, null, null);
    }

    private AuthorizationClient client() {
        return Identity.getAuthorizationClient(getActivity());
    }

    private static Account account(String email) {
        return email == null || email.isEmpty() ? null : new Account(email, "com.google");
    }

    private void answer(PluginCall call, AuthorizationResult result) {
        String token = result.getAccessToken();
        if (token == null) { call.reject("No access token", "AUTH_FAILED"); return; }
        JSObject r = new JSObject();
        r.put("token", token);
        call.resolve(r);
    }

    private void authorize(PluginCall call, Account acc, boolean interactive) {
        AuthorizationRequest.Builder req = AuthorizationRequest.builder().setRequestedScopes(SCOPES);
        if (acc != null) req.setAccount(acc);
        client().authorize(req.build())
                .addOnSuccessListener(result -> {
                    if (!result.hasResolution()) { answer(call, result); return; }
                    if (!interactive) { call.reject("Sign in again", "NEEDS_SIGN_IN"); return; }
                    PendingIntent pi = result.getPendingIntent();
                    if (pi == null) { call.reject("Nothing to show", "AUTH_FAILED"); return; }
                    pending = call;
                    consent.launch(new IntentSenderRequest.Builder(pi.getIntentSender()).build());
                })
                .addOnFailureListener(e -> call.reject("Sign-in failed: " + e.getMessage(), "AUTH_FAILED"));
    }

    /** Shows the account chooser, then Google's consent screen when needed.
     *  Resolves { token } or { cancelled: true }. */
    @PluginMethod
    public void signIn(PluginCall call) {
        pending = call;
        try {
            chooser.launch(chooserIntent());
        } catch (Exception e) {
            // No chooser on this device: Play services picks, as before.
            pending = null;
            authorize(call, null, true);
        }
    }

    /** A fresh token without any UI, for the account signed in with. Rejects
     *  with NEEDS_SIGN_IN when the grant is gone (revoked from the Google
     *  account page, for one). */
    @PluginMethod
    public void getToken(PluginCall call) { authorize(call, account(call.getString("email")), false); }

    /** Forgets a token Drive refused, so the next getToken fetches a new one. */
    @PluginMethod
    public void clearToken(PluginCall call) {
        String token = call.getString("token");
        if (token == null) { call.resolve(); return; }
        client().clearToken(ClearTokenRequest.builder().setToken(token).build())
                .addOnCompleteListener(t -> call.resolve());
    }

    /** Signing out forgets this phone's token and nothing more. Taking the
     *  access away on Google's side (revokeAccess) would sign out every other
     *  phone on the account too, since the grant is one per Google account. */
    @PluginMethod
    public void signOut(PluginCall call) {
        String token = call.getString("token");
        if (token == null) { call.resolve(); return; }
        client().clearToken(ClearTokenRequest.builder().setToken(token).build())
                .addOnCompleteListener(t -> call.resolve());
    }
}
