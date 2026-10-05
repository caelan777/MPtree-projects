// Sign in with Google, for the MPTree account. Stands where AccountPlugin.java
// stands on Android.
//
// A computer has no Google account of its own to ask, so this is the flow
// Google prescribes for installed apps: the person's own browser opens on
// Google's sign-in page, and Google sends the answer back to a port on this
// computer that MPTree listens on for as long as that takes. Only the
// drive.appdata scope is asked for, as on Android: MPTree's own folder in the
// person's Drive and nothing else.
//
// What is kept: the refresh token, in the Windows Credential Manager. The
// access token lives in memory only.
//
// The client id and secret come from src-tauri/google-oauth.json at build time
// (see build.rs). They must belong to the same Google Cloud project as the
// Android app's client, or this computer would get an app folder of its own
// and never see the phones.

use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use base64::Engine;
use serde::Serialize;
use sha2::{Digest, Sha256};

const CLIENT_ID: Option<&str> = option_env!("MPTREE_GOOGLE_CLIENT_ID");
const CLIENT_SECRET: Option<&str> = option_env!("MPTREE_GOOGLE_CLIENT_SECRET");
const SCOPE: &str = "https://www.googleapis.com/auth/drive.appdata";
const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const KEY_SERVICE: &str = "MPTree";
const KEY_USER: &str = "google-refresh-token";
/// How long the browser page may stay unanswered before sign-in gives up.
const WAIT: Duration = Duration::from_secs(300);

/// The access token and when it stops working.
#[derive(Default, Clone)]
pub struct Access(pub Arc<Mutex<Option<(String, Instant)>>>);

#[derive(Serialize, Default)]
pub struct SignIn {
    #[serde(skip_serializing_if = "Option::is_none")]
    token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    cancelled: Option<bool>,
}

// Errors go to the window as "CODE: what happened"; AccountDesktop.ts turns the
// part before the colon back into the `code` the sync engine looks at.
fn creds() -> Result<(&'static str, &'static str), String> {
    match (CLIENT_ID, CLIENT_SECRET) {
        (Some(id), Some(secret)) if !id.is_empty() => Ok((id, secret)),
        _ => Err("UNAVAILABLE: This build has no Google sign-in set up".into()),
    }
}

fn keyring() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEY_SERVICE, KEY_USER).map_err(|e| format!("AUTH_FAILED: {e}"))
}

fn encode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

fn decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                    out.push(v);
                    i += 3;
                    continue;
                }
                out.push(b'%');
            }
            b'+' => out.push(b' '),
            b => out.push(b),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

fn param(query: &str, name: &str) -> Option<String> {
    query.split('&').find_map(|kv| {
        let (k, v) = kv.split_once('=')?;
        (k == name).then(|| decode(v))
    })
}

const DONE_PAGE: &str = "<!doctype html><meta charset=utf-8><title>MPTree</title>\
<body style=\"font:16px 'Segoe UI',sans-serif;background:#fff;color:#0b0b0d;display:flex;align-items:center;justify-content:center;height:100vh;margin:0\">\
<div style=\"text-align:center\"><h1 style=\"font-size:22px;margin:0 0 8px\">MPTree</h1><p style=\"margin:0;color:#555\">__MSG__</p></div>";

fn answer(stream: &mut std::net::TcpStream, message: &str) {
    let body = DONE_PAGE.replace("__MSG__", message);
    let _ = write!(
        stream,
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
}

/// Waits for Google to send the browser back. Ok(None) when the person closed
/// the page, said no, or never answered.
fn wait_for_code(listener: &TcpListener, state: &str) -> Result<Option<String>, String> {
    listener.set_nonblocking(true).map_err(|e| format!("AUTH_FAILED: {e}"))?;
    let until = Instant::now() + WAIT;
    while Instant::now() < until {
        let Ok((mut stream, _)) = listener.accept() else {
            std::thread::sleep(Duration::from_millis(150));
            continue;
        };
        let _ = stream.set_nonblocking(false);
        let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
        let mut buf = [0u8; 4096];
        let n = stream.read(&mut buf).unwrap_or(0);
        let request = String::from_utf8_lossy(&buf[..n]);
        // "GET /?code=...&state=... HTTP/1.1"
        let target = request.split_whitespace().nth(1).unwrap_or("");
        let Some((_, query)) = target.split_once('?') else {
            // The browser asking for a favicon, not Google's answer.
            let _ = write!(stream, "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
            continue;
        };
        if param(query, "state").as_deref() != Some(state) {
            answer(&mut stream, "This page is not from the sign-in MPTree started.");
            continue;
        }
        if let Some(code) = param(query, "code") {
            answer(&mut stream, "Signed in. You can close this tab and go back to MPTree.");
            return Ok(Some(code));
        }
        answer(&mut stream, "Not signed in. You can close this tab.");
        return Ok(None);
    }
    Ok(None)
}

fn token_request(form: &[(&str, &str)]) -> Result<serde_json::Value, String> {
    match ureq::post(TOKEN_URL).timeout(Duration::from_secs(30)).send_form(form) {
        Ok(r) => r.into_json().map_err(|e| format!("AUTH_FAILED: {e}")),
        // Google answers 400 invalid_grant when the grant was taken away.
        Err(ureq::Error::Status(400, _)) | Err(ureq::Error::Status(401, _)) => Err("NEEDS_SIGN_IN: Sign in again".into()),
        Err(ureq::Error::Status(code, _)) => Err(format!("AUTH_FAILED: Google answered {code}")),
        Err(e) => Err(format!("NETWORK: {e}")),
    }
}

fn remember(access: &Access, json: &serde_json::Value) -> Result<String, String> {
    let token = json["access_token"].as_str().ok_or("AUTH_FAILED: No access token")?.to_string();
    let lasts = json["expires_in"].as_u64().unwrap_or(3600);
    *access.0.lock().unwrap() = Some((token.clone(), Instant::now() + Duration::from_secs(lasts)));
    Ok(token)
}

fn sign_in_blocking(access: &Access) -> Result<SignIn, String> {
    let (id, secret) = creds()?;
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| format!("AUTH_FAILED: {e}"))?;
    let port = listener.local_addr().map_err(|e| format!("AUTH_FAILED: {e}"))?.port();
    let redirect = format!("http://127.0.0.1:{port}");

    // PKCE: the code Google hands back is only worth something together with
    // the verifier, which never leaves this process.
    let verifier = format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple());
    let challenge = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let state = uuid::Uuid::new_v4().simple().to_string();

    let url = format!(
        "{AUTH_URL}?client_id={}&redirect_uri={}&response_type=code&scope={}&code_challenge={}&code_challenge_method=S256&state={}&access_type=offline&prompt=consent",
        encode(id), encode(&redirect), encode(SCOPE), challenge, state
    );
    open::that(&url).map_err(|e| format!("AUTH_FAILED: Could not open the browser: {e}"))?;

    let Some(code) = wait_for_code(&listener, &state)? else {
        return Ok(SignIn { cancelled: Some(true), ..Default::default() });
    };
    let json = token_request(&[
        ("client_id", id),
        ("client_secret", secret),
        ("code", &code),
        ("code_verifier", &verifier),
        ("grant_type", "authorization_code"),
        ("redirect_uri", &redirect),
    ])?;
    if let Some(refresh) = json["refresh_token"].as_str() {
        keyring()?.set_password(refresh).map_err(|e| format!("AUTH_FAILED: {e}"))?;
    }
    Ok(SignIn { token: Some(remember(access, &json)?), ..Default::default() })
}

fn token_blocking(access: &Access) -> Result<String, String> {
    if let Some((token, until)) = access.0.lock().unwrap().as_ref() {
        if *until > Instant::now() + Duration::from_secs(60) {
            return Ok(token.clone());
        }
    }
    let (id, secret) = creds()?;
    let refresh = keyring()?.get_password().map_err(|_| "NEEDS_SIGN_IN: Sign in again".to_string())?;
    let json = token_request(&[
        ("client_id", id),
        ("client_secret", secret),
        ("refresh_token", &refresh),
        ("grant_type", "refresh_token"),
    ])?;
    remember(access, &json)
}

#[tauri::command]
pub async fn google_sign_in(access: tauri::State<'_, Access>) -> Result<SignIn, String> {
    // The wait for the browser is long; keep it off the window's thread.
    let access = access.inner().clone();
    tauri::async_runtime::spawn_blocking(move || sign_in_blocking(&access))
        .await
        .map_err(|e| format!("AUTH_FAILED: {e}"))?
}

/// The token for the account that is signed in. Never opens the browser:
/// answers NEEDS_SIGN_IN when the grant is gone.
#[tauri::command]
pub async fn google_token(access: tauri::State<'_, Access>) -> Result<String, String> {
    let access = access.inner().clone();
    tauri::async_runtime::spawn_blocking(move || token_blocking(&access))
        .await
        .map_err(|e| format!("AUTH_FAILED: {e}"))?
}

/// Forget the access token, so the next one asked for is fresh.
#[tauri::command]
pub fn google_clear_token(access: tauri::State<'_, Access>) {
    *access.0.lock().unwrap() = None;
}

/// Forgets this computer's grant only. Revoking it on Google's side would sign
/// out every device on the account (docs/account.md).
#[tauri::command]
pub fn google_sign_out(access: tauri::State<'_, Access>) {
    *access.0.lock().unwrap() = None;
    if let Ok(entry) = keyring() {
        let _ = entry.delete_credential();
    }
}

/// Whether this build can sign in at all.
#[tauri::command]
pub fn google_available() -> bool {
    creds().is_ok()
}
