// The part of MPTree for Windows that a window cannot do by itself: reading a
// folder of music, its tags and covers, and letting the window play the files.
// Playback itself is in the window (src/desktop/AudioPlayerDesktop.ts).

mod account;
mod media;
mod sync;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, UNIX_EPOCH};

use base64::Engine;
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::tag::Accessor;
use serde::Serialize;
use tauri::{Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use walkdir::WalkDir;

// What WebView2 can decode. A format outside this list would show in the
// library and then refuse to play.
const AUDIO_EXTENSIONS: [&str; 8] = ["mp3", "m4a", "aac", "flac", "wav", "ogg", "opus", "weba"];

/// The same shape as `Song` in src/types.ts.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Song {
    id: String,
    title: String,
    artist: String,
    uri: String,
    date_added: u64,
    duration: u64,
    album: String,
    track: u32,
    disc: u32,
    year: u32,
    genre: String,
}

fn is_audio(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| AUDIO_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

fn read_song(path: &Path) -> Song {
    let uri = path.to_string_lossy().to_string();
    let stem = path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let date_added = std::fs::metadata(path)
        .ok()
        .and_then(|m| m.created().or_else(|_| m.modified()).ok())
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let mut song = Song {
        id: uri.clone(),
        title: stem,
        artist: String::new(),
        uri,
        date_added,
        duration: 0,
        album: String::new(),
        track: 0,
        disc: 0,
        year: 0,
        genre: String::new(),
    };

    // A file with broken or missing tags still belongs in the library, under
    // its file name.
    // By its name first; then by what it really is, for a download saved under
    // the wrong name; and a Matroska file, which lofty does not read at all,
    // at least says how long it is.
    let tagged = lofty::read_from_path(path).ok().or_else(|| {
        lofty::probe::Probe::open(path).ok()?.guess_file_type().ok()?.read().ok()
    });
    if tagged.is_none() {
        song.duration = media::matroska_duration(path).unwrap_or(0);
    }
    if let Some(file) = tagged {
        song.duration = file.properties().duration().as_millis() as u64;
        if let Some(tag) = file.primary_tag().or_else(|| file.first_tag()) {
            if let Some(t) = tag.title().filter(|t| !t.trim().is_empty()) {
                song.title = t.to_string();
            }
            song.artist = tag.artist().map(|a| a.to_string()).unwrap_or_default();
            song.album = tag.album().map(|a| a.to_string()).unwrap_or_default();
            song.genre = tag.genre().map(|g| g.to_string()).unwrap_or_default();
            song.track = tag.track().unwrap_or(0);
            song.disc = tag.disk().unwrap_or(0);
            song.year = tag.year().unwrap_or(0);
        }
    }
    song
}

// Folders that hold programs and their data, never somebody's music. Skipping
// them is what keeps a scan of the whole user folder short.
const SKIP_DIRS: [&str; 8] = ["appdata", "node_modules", "target", "$recycle.bin", "windows", "program files", "program files (x86)", "programdata"];

fn worth_entering(entry: &walkdir::DirEntry) -> bool {
    if !entry.file_type().is_dir() || entry.depth() == 0 {
        return true;
    }
    let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
    !name.starts_with('.') && !SKIP_DIRS.contains(&name.as_str())
}

/// Every song under `folder`. With no folder chosen it looks through the whole
/// user folder (Music, Downloads, Desktop, Documents and the rest), and leaves
/// out anything under half a minute, which there is a sound effect, not a song.
/// Tags already read, with the size and the time the file had then. The sync
/// engine scans on every round and the window on every return to it; without
/// this each of those read every file on the disk again.
#[derive(Default)]
struct Tags {
    known: Arc<Mutex<HashMap<PathBuf, (u64, u64, Song)>>>,
    /// One scan at a time: the second one waits and finds the tags read.
    turn: tauri::async_runtime::Mutex<()>,
}

/// Size and time of change, and whether the file is on this disk at all.
/// A file that OneDrive (or any cloud folder) keeps online only has a name
/// here and nothing behind it: reading its tags would download it, and a
/// library of them would download in full on the first scan.
fn on_disk(path: &Path) -> Option<(u64, u64)> {
    let meta = std::fs::metadata(path).ok()?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        // OFFLINE, RECALL_ON_OPEN, RECALL_ON_DATA_ACCESS
        if meta.file_attributes() & (0x1000 | 0x0004_0000 | 0x0040_0000) != 0 {
            return None;
        }
    }
    let changed = meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0);
    Some((meta.len(), changed))
}

#[tauri::command]
async fn scan(app: tauri::AppHandle, tags: tauri::State<'_, Tags>, folder: String) -> Result<Vec<Song>, String> {
    let _turn = tags.turn.lock().await;
    let known = tags.known.clone();
    let everywhere = folder.is_empty();
    let root = if everywhere {
        app.path().home_dir().map_err(|e| e.to_string())?
    } else {
        PathBuf::from(folder)
    };

    // Songs that arrived from the other devices on the account are part of the
    // library whichever folder was chosen.
    let incoming = sync::incoming_dir(&app).ok().filter(|d| d.is_dir());

    let progress = app.clone();
    let songs = tauri::async_runtime::spawn_blocking(move || {
        // First the names, which is quick; then the tags, which is the slow
        // part and the part the loading screen counts.
        let mut paths: Vec<PathBuf> = WalkDir::new(&root)
            .follow_links(false)
            .into_iter()
            .filter_entry(worth_entering)
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file() && is_audio(e.path()))
            .map(|e| e.into_path())
            .collect();
        if let Some(d) = incoming.as_ref().filter(|d| !d.starts_with(&root)) {
            paths.extend(
                WalkDir::new(d)
                    .into_iter()
                    .filter_map(|e| e.ok())
                    .filter(|e| e.file_type().is_file() && is_audio(e.path()))
                    .map(|e| e.into_path()),
            );
        }
        // Each file with what it is now; the ones that are online only fall out.
        let paths: Vec<(PathBuf, u64, u64)> = paths
            .into_iter()
            .filter_map(|p| on_disk(&p).map(|(size, changed)| (p, size, changed)))
            .collect();
        let total = paths.len();
        let done = AtomicUsize::new(0);
        let keep = |s: &Song| {
            if !everywhere || s.duration >= 30_000 {
                return true;
            }
            let path = Path::new(&s.uri);
            // A song from another device on the account always belongs here.
            if incoming.as_ref().is_some_and(|d| path.starts_with(d)) {
                return true;
            }
            // A length that could not be read is not a short one: a download
            // saved as .mp3 that is another format inside, say. A file that
            // size is a song, not a sound effect.
            s.duration == 0 && std::fs::metadata(path).map(|m| m.len() > 500 * 1024).unwrap_or(false)
        };
        let mut found: Vec<Song> = Vec::with_capacity(total);
        std::thread::scope(|scope| {
            let workers: Vec<_> = paths
                .chunks(total.div_ceil(4).max(1))
                .map(|part| {
                    let (done, progress, keep, known) = (&done, &progress, &keep, &known);
                    scope.spawn(move || {
                        part.iter()
                            .map(|(p, size, changed)| {
                                let hit = known.lock().unwrap().get(p).filter(|(s, c, _)| s == size && c == changed).map(|(_, _, song)| song.clone());
                                let song = hit.unwrap_or_else(|| {
                                    let song = read_song(p);
                                    known.lock().unwrap().insert(p.clone(), (*size, *changed, song.clone()));
                                    song
                                });
                                let n = done.fetch_add(1, Ordering::Relaxed) + 1;
                                if n % 20 == 0 || n == total {
                                    let _ = progress.emit("scan-progress", (n, total));
                                }
                                song
                            })
                            .filter(|s| keep(s))
                            .collect::<Vec<_>>()
                    })
                })
                .collect();
            for w in workers {
                found.extend(w.join().unwrap_or_default());
            }
        });
        found
    })
    .await
    .map_err(|e| e.to_string())?;

    // The window may only load files from folders a song was found in.
    let scope = app.asset_protocol_scope();
    let mut seen = std::collections::HashSet::new();
    for song in &songs {
        if let Some(dir) = Path::new(&song.uri).parent() {
            if seen.insert(dir.to_path_buf()) {
                let _ = scope.allow_directory(dir, false);
            }
        }
    }
    Ok(songs)
}

/// The embedded cover as a data URL, or "" when the file has none.
#[tauri::command]
async fn album_art(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Ok(file) = lofty::read_from_path(&path) else { return String::new() };
        let Some(tag) = file.primary_tag().or_else(|| file.first_tag()) else { return String::new() };
        let Some(pic) = tag.pictures().first() else { return String::new() };
        let mime = pic.mime_type().map(|m| m.as_str().to_string()).unwrap_or_else(|| "image/jpeg".into());
        format!("data:{};base64,{}", mime, base64::engine::general_purpose::STANDARD.encode(pic.data()))
    })
    .await
    .map_err(|e| e.to_string())
}

/// Lyrics from a file next to the song (song.lrc, then song.txt), as on Android.
#[tauri::command]
fn lyrics(path: String) -> String {
    let p = Path::new(&path);
    for ext in ["lrc", "txt"] {
        if let Ok(text) = std::fs::read_to_string(p.with_extension(ext)) {
            return text;
        }
    }
    String::new()
}

/// Moves the files to the Recycle Bin. Returns the ones that went.
#[tauri::command]
fn trash_files(paths: Vec<String>) -> Vec<String> {
    // A network drive or a stick has no Recycle Bin. MPTree only gets here
    // after saying the song goes for good, so there it does.
    paths
        .into_iter()
        .filter(|p| trash::delete(p).is_ok() || (Path::new(p).is_file() && std::fs::remove_file(p).is_ok()))
        .collect()
}

#[derive(Serialize)]
struct Cut {
    uri: String,
    title: String,
    duration: u64,
}

/// A piece of a song as a file of its own, in Music/MPTree, where the songs
/// from the other devices land too. MP3 and WAV only (see media.rs); anything
/// else answers UNSUPPORTED_FORMAT and the window keeps the cut as markers.
#[tauri::command]
async fn cut_track(app: tauri::AppHandle, path: String, start_ms: u64, end_ms: u64, name: String) -> Result<Cut, String> {
    let dir = sync::incoming_dir(&app)?;
    let scope = app.asset_protocol_scope();
    tauri::async_runtime::spawn_blocking(move || {
        let src = PathBuf::from(&path);
        let ext = src.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
        if ext != "mp3" && ext != "wav" {
            return Err(media::UNSUPPORTED.to_string());
        }
        // Songs are a few megabytes; a "song" that is not gets the markers.
        if std::fs::metadata(&src).map(|m| m.len()).unwrap_or(u64::MAX) > 400 * 1024 * 1024 {
            return Err(media::UNSUPPORTED.to_string());
        }
        let bytes = std::fs::read(&src).map_err(|e| format!("READ_FAILED: {e}"))?;
        let (out, duration) = if ext == "mp3" { media::cut_mp3(&bytes, start_ms, end_ms)? } else { media::cut_wav(&bytes, start_ms, end_ms)? };

        std::fs::create_dir_all(&dir).map_err(|e| format!("WRITE_FAILED: {e}"))?;
        let stem = sync::safe_name(name.trim());
        let stem = if stem.is_empty() { "Cut".to_string() } else { stem };
        let mut dest = dir.join(format!("{stem}.{ext}"));
        let mut n = 2;
        while dest.exists() {
            dest = dir.join(format!("{stem} ({n}).{ext}"));
            n += 1;
        }
        std::fs::write(&dest, out).map_err(|e| format!("WRITE_FAILED: {e}"))?;

        // The name it was given as its title, and the artist it had. Not
        // being able to write them is not a reason to lose the cut.
        if ext == "mp3" {
            use lofty::config::WriteOptions;
            use lofty::tag::{Tag, TagExt, TagType};
            let mut tag = Tag::new(TagType::Id3v2);
            tag.set_title(name.trim().to_string());
            let artist = lofty::read_from_path(&src).ok().and_then(|f| f.primary_tag().or_else(|| f.first_tag()).and_then(|t| t.artist().map(|a| a.to_string())));
            if let Some(artist) = artist.filter(|a| !a.trim().is_empty()) {
                tag.set_artist(artist);
            }
            let _ = tag.save_to_path(&dest, WriteOptions::default());
        }
        if let Some(parent) = dest.parent() {
            let _ = scope.allow_directory(parent, false);
        }
        Ok(Cut { uri: dest.to_string_lossy().to_string(), title: name.trim().to_string(), duration })
    })
    .await
    .map_err(|e| e.to_string())?
}

// ── The round button ───────────────────────────────────────────────────────
// A round logo that floats on the screen, above other windows. It is there
// while MPTree is minimised and while it is in its small form; a click on it
// brings MPTree up small, in the shape of the phone app, beside the button, and
// another click puts it away. It can be dragged anywhere, and dropped on the X
// that shows while it is dragged to take it away. Settings switches it on and
// off. Making the window wide (maximise, or drag it wider than the phone layout
// goes) ends the small form, and the button goes until the next minimise.

struct Shortcut {
    /// True while the window is in its small, phone-shaped form.
    mini: AtomicBool,
    /// When the main window last lost focus. A click on the button takes the
    /// focus first, so "was MPTree in front?" has to be asked of a moment ago.
    blurred: Mutex<Option<Instant>>,
    saved: Mutex<Saved>,
}

/// What is remembered between runs (shortcut.json in the app's data folder).
#[derive(Clone, Copy, serde::Deserialize, Serialize)]
struct Saved {
    enabled: bool,
    x: f64,
    y: f64,
    /// Which look the button wears: 0 black, 1 white, 2 record (bubble.html).
    #[serde(default)]
    style: u8,
}

impl Default for Saved {
    fn default() -> Self {
        Saved { enabled: true, x: CORNER, y: CORNER, style: 0 }
    }
}

const MINI_W: f64 = 420.0;
const MINI_H: f64 = 780.0;
/// From the screen's edge to the button and to the small window.
const CORNER: f64 = 16.0;
/// The button's window, and the circle drawn in it (bubble.html).
const BUBBLE: f64 = 64.0;
/// The Windows 11 taskbar.
const TASKBAR: f64 = 48.0;
/// Between the small window and the taskbar.
const TASKBAR_GAP: f64 = 14.0;
/// Where the phone layout ends and the wide one begins (src/themes.ts, isWide).
const WIDE_FROM: f64 = 900.0;
/// The X the button is dropped on: its window, its circle, and how near counts.
const DISMISS_W: f64 = 132.0;
const DISMISS_H: f64 = 104.0;
const DISMISS_D: f64 = 88.0;
const DISMISS_NEAR: f64 = 76.0;

// Two things Tauri has no call for: a window that is really round, and the
// part of the screen the taskbar leaves free.
#[cfg(windows)]
mod win {
    #[repr(C)]
    #[derive(Default)]
    pub struct Rect {
        pub left: i32,
        pub top: i32,
        pub right: i32,
        pub bottom: i32,
    }
    #[link(name = "gdi32")]
    extern "system" {
        pub fn CreateEllipticRgn(x1: i32, y1: i32, x2: i32, y2: i32) -> isize;
    }
    #[link(name = "kernel32")]
    extern "system" {
        pub fn CreateMutexW(attrs: *const core::ffi::c_void, owned: i32, name: *const u16) -> isize;
        pub fn CreateEventW(attrs: *const core::ffi::c_void, manual: i32, set: i32, name: *const u16) -> isize;
        pub fn OpenEventW(access: u32, inherit: i32, name: *const u16) -> isize;
        pub fn SetEvent(event: isize) -> i32;
        pub fn WaitForSingleObject(handle: isize, ms: u32) -> u32;
        pub fn GetLastError() -> u32;
    }
    #[link(name = "user32")]
    extern "system" {
        pub fn AllowSetForegroundWindow(process: u32) -> i32;
        pub fn SetWindowRgn(hwnd: isize, rgn: isize, redraw: i32) -> i32;
        pub fn SystemParametersInfoW(action: u32, param: u32, data: *mut core::ffi::c_void, ini: u32) -> i32;
    }
    pub const SPI_GETWORKAREA: u32 = 0x0030;
}

/// Windows will not make a window narrower than a title bar's worth, so these
/// windows are wider than the circle drawn in them. Cutting the window itself
/// down to the circle keeps the rest from catching clicks meant for whatever
/// is underneath. `left`, `top` and `size` are the circle, a little generous
/// so its drawn edge stays smooth.
#[cfg(windows)]
fn make_round(window: &tauri::WebviewWindow, left: f64, top: f64, size: f64) {
    let (Ok(hwnd), Ok(scale)) = (window.hwnd(), window.scale_factor()) else { return };
    let px = |v: f64| (v * scale).round() as i32;
    unsafe {
        let region = win::CreateEllipticRgn(px(left), px(top), px(left + size), px(top + size));
        win::SetWindowRgn(hwnd.0 as isize, region, 1);
    }
}
#[cfg(not(windows))]
fn make_round(_window: &tauri::WebviewWindow, _left: f64, _top: f64, _size: f64) {}

/// The screen without the taskbar, in logical pixels: (x, y, width, height).
/// A taskbar set to hide itself takes no room in Windows' own answer and then
/// slides up over whatever is there, so its height is taken off here anyway.
fn work_area(main: &tauri::WebviewWindow) -> (f64, f64, f64, f64) {
    let scale = main.scale_factor().unwrap_or(1.0);
    let screen = main
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| main.primary_monitor().ok().flatten())
        .map(|m| (m.size().width as f64 / scale, m.size().height as f64 / scale))
        .unwrap_or((1280.0, 720.0));
    #[cfg(windows)]
    {
        let mut r = win::Rect::default();
        let ok = unsafe { win::SystemParametersInfoW(win::SPI_GETWORKAREA, 0, &mut r as *mut _ as *mut _, 0) };
        if ok != 0 {
            let (x, y) = (r.left as f64 / scale, r.top as f64 / scale);
            let (w, mut h) = ((r.right - r.left) as f64 / scale, (r.bottom - r.top) as f64 / scale);
            if h >= screen.1 - 1.0 {
                h -= TASKBAR;
            }
            return (x, y, w, h);
        }
    }
    (0.0, 0.0, screen.0, screen.1 - TASKBAR)
}

fn saved_file(app: &tauri::AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_data_dir().ok()?;
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir.join("shortcut.json"))
}

fn save(app: &tauri::AppHandle) {
    let saved = *app.state::<Shortcut>().saved.lock().unwrap();
    if let (Some(file), Ok(json)) = (saved_file(app), serde_json::to_string(&saved)) {
        let _ = std::fs::write(file, json);
    }
}

fn set_mini(app: &tauri::AppHandle, on: bool) {
    if app.state::<Shortcut>().mini.swap(on, Ordering::Relaxed) != on {
        let _ = app.emit("mini", on);
    }
}

/// The button shows while MPTree is minimised or small, if it is switched on.
fn refresh_bubble(app: &tauri::AppHandle) {
    let (Some(main), Some(bubble)) = (app.get_webview_window("main"), app.get_webview_window("bubble")) else { return };
    let state = app.state::<Shortcut>();
    let enabled = state.saved.lock().unwrap().enabled;
    let wanted = enabled && (main.is_minimized().unwrap_or(false) || state.mini.load(Ordering::Relaxed));
    let _ = if wanted { bubble.show() } else { bubble.hide() };
}

/// Brings MPTree up small, beside the button.
fn show_mini(app: &tauri::AppHandle, main: &tauri::WebviewWindow) {
    let _ = main.unminimize();
    let _ = main.unmaximize();
    let (wx, wy, ww, wh) = work_area(main);
    let saved = *app.state::<Shortcut>().saved.lock().unwrap();
    let bottom = wy + wh - TASKBAR_GAP;
    let height = MINI_H.min(bottom - (wy + CORNER));
    // To the right of the button when there is room, else to its left; level
    // with it, but never off the screen or onto the taskbar.
    let right = saved.x + BUBBLE + 8.0;
    let x = if right + MINI_W <= wx + ww - 8.0 { right } else { (saved.x - 8.0 - MINI_W).max(wx + 8.0) };
    let y = saved.y.clamp(wy + CORNER, (bottom - height).max(wy + CORNER));
    let _ = main.set_size(LogicalSize::new(MINI_W, height));
    let _ = main.set_position(LogicalPosition::new(x, y));
    let _ = main.set_focus();
    // Last, not first: coming back from minimised passes through the old, wide
    // size on the way, and that would end the small form again.
    set_mini(app, true);
    refresh_bubble(app);
}

/// A click on the round button.
#[tauri::command]
fn bubble_click(app: tauri::AppHandle) {
    let Some(main) = app.get_webview_window("main") else { return };
    let state = app.state::<Shortcut>();
    let small_and_up = state.mini.load(Ordering::Relaxed) && !main.is_minimized().unwrap_or(false);
    if !small_and_up {
        show_mini(&app, &main);
        return;
    }
    let in_front = main.is_focused().unwrap_or(false)
        || state.blurred.lock().unwrap().is_some_and(|t| t.elapsed() < Duration::from_millis(600));
    if in_front {
        let _ = main.minimize();
    } else {
        // It was behind something: bring it forward instead of putting it away.
        let _ = main.set_focus();
    }
}

fn dismiss_place(main: &tauri::WebviewWindow) -> (f64, f64) {
    let (wx, wy, ww, wh) = work_area(main);
    (wx + ww / 2.0 - DISMISS_W / 2.0, wy + wh - DISMISS_H - 40.0)
}

/// The button being dragged. `x` and `y` are where its top left corner should
/// be, in screen coordinates. Answers whether it is over the X.
#[tauri::command]
fn bubble_drag(app: tauri::AppHandle, phase: String, x: f64, y: f64) -> bool {
    let (Some(main), Some(bubble), Some(dismiss)) =
        (app.get_webview_window("main"), app.get_webview_window("bubble"), app.get_webview_window("dismiss"))
    else {
        return false;
    };
    let (dx, dy) = dismiss_place(&main);
    let near = {
        let (bx, by) = (x + BUBBLE / 2.0, y + BUBBLE / 2.0);
        let (cx, cy) = (dx + DISMISS_W / 2.0, dy + DISMISS_H / 2.0);
        ((bx - cx).powi(2) + (by - cy).powi(2)).sqrt() < DISMISS_NEAR
    };
    match phase.as_str() {
        "start" => {
            let _ = dismiss.set_position(LogicalPosition::new(dx, dy));
            let _ = dismiss.show();
        }
        "move" => {
            let _ = bubble.set_position(LogicalPosition::new(x, y));
            let _ = dismiss.eval(&format!("setNear({near})"));
        }
        _ => {
            let _ = dismiss.hide();
            let _ = dismiss.eval("setNear(false)");
            let state = app.state::<Shortcut>();
            if near {
                // Dropped on the X: off, and back where it started for next time.
                state.saved.lock().unwrap().enabled = false;
                let home = *state.saved.lock().unwrap();
                let _ = bubble.set_position(LogicalPosition::new(home.x, home.y));
                let _ = app.emit("shortcut-enabled", false);
            } else {
                let (wx, wy, ww, wh) = work_area(&main);
                let mut saved = state.saved.lock().unwrap();
                saved.x = x.clamp(wx, wx + ww - BUBBLE);
                saved.y = y.clamp(wy, wy + wh - BUBBLE);
                let _ = bubble.set_position(LogicalPosition::new(saved.x, saved.y));
            }
            save(&app);
            refresh_bubble(&app);
        }
    }
    near
}

#[tauri::command]
fn shortcut_get(app: tauri::AppHandle) -> bool {
    app.state::<Shortcut>().saved.lock().unwrap().enabled
}

#[tauri::command]
fn shortcut_set(app: tauri::AppHandle, enabled: bool) {
    app.state::<Shortcut>().saved.lock().unwrap().enabled = enabled;
    save(&app);
    refresh_bubble(&app);
}

/// The button's look. With a number it is set, kept and shown at once;
/// either way the answer is the look it has now.
#[tauri::command]
fn shortcut_style(app: tauri::AppHandle, style: Option<u8>) -> u8 {
    let state = app.state::<Shortcut>();
    if let Some(next) = style.filter(|s| *s <= 2) {
        state.saved.lock().unwrap().style = next;
        save(&app);
        if let Some(bubble) = app.get_webview_window("bubble") {
            let _ = bubble.eval(&format!("setStyle({next})"));
        }
    }
    let now = state.saved.lock().unwrap().style;
    now
}

/// A click on the logo in the small window: away again, back to the button.
#[tauri::command]
fn mini_hide(app: tauri::AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.minimize();
    }
}

#[tauri::command]
fn is_mini(app: tauri::AppHandle) -> bool {
    app.state::<Shortcut>().mini.load(Ordering::Relaxed)
}

fn on_main_event(app: &tauri::AppHandle, event: &WindowEvent) {
    match event {
        WindowEvent::Resized(_) => {
            let Some(main) = app.get_webview_window("main") else { return };
            if !main.is_minimized().unwrap_or(false) {
                let scale = main.scale_factor().unwrap_or(1.0);
                let width = main.inner_size().map(|s| s.width as f64 / scale).unwrap_or(0.0);
                if width >= WIDE_FROM || main.is_maximized().unwrap_or(false) {
                    set_mini(app, false);
                }
            }
            refresh_bubble(app);
        }
        WindowEvent::Focused(false) => {
            *app.state::<Shortcut>().blurred.lock().unwrap() = Some(Instant::now());
        }
        // The button is a window too, and would keep the app alive by itself.
        WindowEvent::Destroyed => app.exit(0),
        _ => {}
    }
}

fn floating(app: &tauri::App, label: &str, page: &str, w: f64, h: f64) -> tauri::Result<tauri::WebviewWindow> {
    WebviewWindowBuilder::new(app, label, WebviewUrl::App(page.into()))
        .title("MPTree")
        .inner_size(w, h)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false)
        .visible(false)
        .build()
}

// ── One MPTree at a time ───────────────────────────────────────────────────
// A second start must not open a second MPTree: the two would play over each
// other, and both speak for this computer on the account. The first one holds
// a named mutex; a later one finds it taken, raises a named event and leaves,
// and the first one, waiting on that event, comes to the front.

const ONLY_ONE: &str = "Local\\net.mp-tree.desktop.one";
const SHOW_IT: &str = "Local\\net.mp-tree.desktop.show";

/// False when another MPTree was running already: it has been told to show
/// itself, and this one should end.
fn first_instance() -> bool {
    #[cfg(windows)]
    unsafe {
        let wide = |s: &str| s.encode_utf16().chain(std::iter::once(0)).collect::<Vec<u16>>();
        let mutex = win::CreateMutexW(std::ptr::null(), 0, wide(ONLY_ONE).as_ptr());
        // 183: ERROR_ALREADY_EXISTS. The handle is kept for as long as MPTree
        // runs, which is what makes the name taken.
        if mutex != 0 && win::GetLastError() == 183 {
            let event = win::OpenEventW(0x0002, 0, wide(SHOW_IT).as_ptr());
            if event != 0 {
                // Windows only lets the program in front hand the front on.
                win::AllowSetForegroundWindow(u32::MAX);
                win::SetEvent(event);
            }
            return false;
        }
    }
    true
}

/// Waits to be asked to show itself, for as long as MPTree runs.
fn answer_second_starts(app: tauri::AppHandle) {
    #[cfg(windows)]
    std::thread::spawn(move || unsafe {
        let wide: Vec<u16> = SHOW_IT.encode_utf16().chain(std::iter::once(0)).collect();
        let event = win::CreateEventW(std::ptr::null(), 0, 0, wide.as_ptr());
        if event == 0 {
            return;
        }
        loop {
            if win::WaitForSingleObject(event, u32::MAX) != 0 {
                return;
            }
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.unminimize();
                let _ = main.show();
                let _ = main.set_focus();
            }
        }
    });
    #[cfg(not(windows))]
    let _ = app;
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if !first_instance() {
        return;
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(account::Access::default())
        .manage(Tags::default())
        .setup(|app| {
            let saved: Saved = saved_file(app.handle())
                .and_then(|f| std::fs::read_to_string(f).ok())
                .and_then(|t| serde_json::from_str(&t).ok())
                .unwrap_or_default();
            app.manage(Shortcut { mini: AtomicBool::new(false), blurred: Mutex::new(None), saved: Mutex::new(saved) });

            let bubble = floating(app, "bubble", "bubble.html", 132.0, BUBBLE)?;
            let _ = bubble.set_position(LogicalPosition::new(saved.x, saved.y));
            make_round(&bubble, 2.0, 2.0, BUBBLE - 4.0);
            let dismiss = floating(app, "dismiss", "dismiss.html", DISMISS_W, DISMISS_H)?;
            make_round(&dismiss, (DISMISS_W - DISMISS_D) / 2.0 - 2.0, (DISMISS_H - DISMISS_D) / 2.0 - 2.0, DISMISS_D + 4.0);

            if let Some(main) = app.get_webview_window("main") {
                let handle = app.handle().clone();
                main.on_window_event(move |event| on_main_event(&handle, event));
            }
            answer_second_starts(app.handle().clone());
            sync::clear_parts(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scan, album_art, lyrics, trash_files, cut_track,
            bubble_click, bubble_drag, shortcut_get, shortcut_set, shortcut_style, mini_hide, is_mini,
            account::google_sign_in, account::google_cancel_sign_in, account::google_token, account::google_clear_token,
            account::google_sign_out, account::google_available,
            sync::sync_device_id, sync::host_name, sync::sync_free_space, sync::sync_fingerprints,
            sync::sync_read_chunk, sync::sync_begin_file, sync::sync_append_chunk, sync::sync_finish_file,
            sync::sync_abort_file, sync::sync_drive_upload, sync::sync_drive_download, sync::open_external,
            sync::sync_path_states,
        ])
        .run(tauri::generate_context!())
        .expect("MPTree could not start");
}
