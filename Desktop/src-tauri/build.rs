// The Google sign-in client for the MPTree account lives in google-oauth.json,
// next to this file and out of the repository:
//
//   { "client_id": "....apps.googleusercontent.com", "client_secret": "..." }
//
// Without it the app still builds; signing in then says it is not set up.
fn main() {
    println!("cargo:rerun-if-changed=google-oauth.json");
    if let Ok(text) = std::fs::read_to_string("google-oauth.json") {
        let field = |name: &str| -> Option<String> {
            let at = text.find(&format!("\"{name}\""))?;
            let rest = &text[at + name.len() + 2..];
            let start = rest.find('"')? + 1;
            let end = rest[start..].find('"')? + start;
            Some(rest[start..end].to_string())
        };
        if let (Some(id), Some(secret)) = (field("client_id"), field("client_secret")) {
            println!("cargo:rustc-env=MPTREE_GOOGLE_CLIENT_ID={id}");
            println!("cargo:rustc-env=MPTREE_GOOGLE_CLIENT_SECRET={secret}");
        }
    }
    tauri_build::build()
}
