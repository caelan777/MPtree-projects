// Files for the MPTree account: fingerprints, and songs moving in and out.
// Stands where SyncPlugin.java stands on Android, and answers the same way, so
// src/sync/engine.ts does not know which of the two it is talking to.
//
// Errors go to the window as "CODE: what happened" (FULL, INCOMPLETE, NETWORK);
// SyncDesktop.ts turns the part before the colon back into `code`.

use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, UNIX_EPOCH};

use base64::Engine;
use serde::Serialize;
use tauri::{Emitter, Manager};

const DRIVE: &str = "https://www.googleapis.com";
const B64: base64::engine::GeneralPurpose = base64::engine::general_purpose::STANDARD;

fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn temp_file(app: &tauri::AppHandle, tid: &str) -> Result<PathBuf, String> {
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("sync");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let safe: String = tid.chars().map(|c| if c.is_ascii_alphanumeric() || c == '_' || c == '-' { c } else { '_' }).collect();
    Ok(dir.join(format!("{safe}.part")))
}

/// Half-received songs from a run that was closed in the middle of one. Nothing
/// picks them up again (the song is asked for anew), so they would only pile up.
pub fn clear_parts(app: &tauri::AppHandle) {
    let Ok(dir) = app.path().app_cache_dir().map(|d| d.join("sync")) else { return };
    let Ok(list) = fs::read_dir(dir) else { return };
    for entry in list.flatten() {
        if entry.path().extension().is_some_and(|e| e == "part") {
            let _ = fs::remove_file(entry.path());
        }
    }
}

/// Where songs from the other devices land, as Music/MPTree does on a phone.
pub fn incoming_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().audio_dir().map_err(|e| e.to_string())?.join("MPTree"))
}

fn io_err(what: &str, e: std::io::Error) -> String {
    // 112 is ERROR_DISK_FULL, 39 ERROR_HANDLE_DISK_FULL.
    if matches!(e.raw_os_error(), Some(112) | Some(39)) {
        "FULL: ENOSPC".into()
    } else {
        format!("{what}: {e}")
    }
}

#[derive(Serialize)]
pub struct DeviceId {
    id: String,
    /// The first start of this install.
    fresh: bool,
}

#[tauri::command]
pub fn sync_device_id(app: tauri::AppHandle) -> Result<DeviceId, String> {
    let file = data_dir(&app)?.join("device-id");
    if let Ok(id) = fs::read_to_string(&file) {
        let id = id.trim().to_string();
        if !id.is_empty() {
            return Ok(DeviceId { id, fresh: false });
        }
    }
    // No file: the first start of this install. The id is made from what
    // Windows calls this computer and who is logged in, so an MPTree that was
    // removed with its data and installed again is the same device on the
    // account: it keeps its place, and what was deleted on it stays deleted.
    // Android does the same with its ANDROID_ID (SyncPlugin.java).
    let id = machine_id().unwrap_or_else(|| uuid::Uuid::new_v4().simple().to_string()[..16].to_string());
    fs::write(&file, &id).map_err(|e| e.to_string())?;
    Ok(DeviceId { id, fresh: true })
}

#[cfg(windows)]
#[link(name = "advapi32")]
extern "system" {
    fn RegGetValueW(key: isize, sub: *const u16, value: *const u16, flags: u32, kind: *mut u32, data: *mut u8, size: *mut u32) -> i32;
}

/// Sixteen hex digits that stand for this Windows installation and this user
/// on it. Not the machine's own id: a hash of it, which cannot be turned back.
fn machine_id() -> Option<String> {
    #[cfg(windows)]
    {
        use sha2::{Digest, Sha256};
        let wide = |s: &str| s.encode_utf16().chain(std::iter::once(0)).collect::<Vec<u16>>();
        let mut buf = [0u16; 128];
        let mut size = (buf.len() * 2) as u32;
        // HKEY_LOCAL_MACHINE, a string, and the 64-bit view of the registry.
        let ok = unsafe {
            RegGetValueW(0x8000_0002u32 as i32 as isize, wide("SOFTWARE\\Microsoft\\Cryptography").as_ptr(), wide("MachineGuid").as_ptr(),
                0x2 | 0x0001_0000, std::ptr::null_mut(), buf.as_mut_ptr() as *mut u8, &mut size)
        };
        if ok != 0 {
            return None;
        }
        let guid = String::from_utf16_lossy(&buf[..(size as usize / 2).min(buf.len())]);
        let guid = guid.trim_end_matches('\0').trim();
        if guid.len() < 8 {
            return None;
        }
        let user = std::env::var("USERNAME").unwrap_or_default().to_lowercase();
        let hash = Sha256::digest(format!("mptree-device:{}:{user}", guid.to_lowercase()).as_bytes());
        return Some(hash.iter().take(8).map(|b| format!("{b:02x}")).collect());
    }
    #[allow(unreachable_code)]
    None
}

/// The computer's name, for the list of devices on the account page.
#[tauri::command]
pub fn host_name() -> String {
    std::env::var("COMPUTERNAME").unwrap_or_else(|_| "Windows PC".into())
}

#[cfg(windows)]
#[link(name = "kernel32")]
extern "system" {
    fn GetDiskFreeSpaceExW(dir: *const u16, free_to_caller: *mut u64, total: *mut u64, total_free: *mut u64) -> i32;
}

/// Bytes free where songs go; -1 when unknown.
#[tauri::command]
pub fn sync_free_space(app: tauri::AppHandle) -> i64 {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        if let Ok(dir) = app.path().audio_dir() {
            let wide: Vec<u16> = dir.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
            let mut free = 0u64;
            let ok = unsafe { GetDiskFreeSpaceExW(wide.as_ptr(), &mut free, std::ptr::null_mut(), std::ptr::null_mut()) };
            if ok != 0 {
                return free.min(i64::MAX as u64) as i64;
            }
        }
    }
    let _ = app;
    -1
}

fn base36(mut n: u64) -> String {
    if n == 0 {
        return "0".into();
    }
    let mut out = Vec::new();
    while n > 0 {
        out.push(b"0123456789abcdefghijklmnopqrstuvwxyz"[(n % 36) as usize]);
        n /= 36;
    }
    out.reverse();
    String::from_utf8(out).unwrap()
}

/// Must give the very same answer as `fingerprint` in SyncPlugin.java, or the
/// phones and this computer would not recognise each other's songs: the size
/// in base 36, a dash, and the CRC-32 of the 16 KB in the middle of the file.
fn fingerprint(path: &Path, size: u64) -> std::io::Result<String> {
    let len = size.min(16 * 1024);
    let from = (size / 2).saturating_sub(len / 2);
    let mut buf = vec![0u8; len as usize];
    let mut f = File::open(path)?;
    f.seek(SeekFrom::Start(from))?;
    f.read_exact(&mut buf)?;
    Ok(format!("{}-{:x}", base36(size), crc32fast::hash(&buf)))
}

#[derive(Serialize)]
pub struct Fingerprint {
    path: String,
    size: u64,
    fp: String,
}

/// Fingerprints taken, with the size and the time the file had then. The
/// engine asks for every song's on every round; the answer only changes when
/// the file does. SyncPlugin.java keeps the same kind of list.
fn taken() -> &'static Mutex<HashMap<String, (u64, u64, String)>> {
    static TAKEN: OnceLock<Mutex<HashMap<String, (u64, u64, String)>>> = OnceLock::new();
    TAKEN.get_or_init(Default::default)
}

#[tauri::command]
pub async fn sync_fingerprints(paths: Vec<String>) -> Result<Vec<Fingerprint>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        paths
            .into_iter()
            .filter_map(|p| {
                let meta = fs::metadata(&p).ok()?;
                if !meta.is_file() {
                    return None;
                }
                let changed = meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0);
                let hit = taken().lock().unwrap().get(&p).filter(|(s, c, _)| *s == meta.len() && *c == changed).map(|(_, _, fp)| fp.clone());
                let fp = match hit {
                    Some(fp) => fp,
                    None => {
                        let fp = fingerprint(Path::new(&p), meta.len()).ok()?;
                        taken().lock().unwrap().insert(p.clone(), (meta.len(), changed, fp.clone()));
                        fp
                    }
                };
                Some(Fingerprint { path: p, size: meta.len(), fp })
            })
            .collect()
    })
    .await
    .map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct Chunk {
    data: String,
    size: u64,
}

#[tauri::command]
pub async fn sync_read_chunk(path: String, offset: u64, length: u64) -> Result<Chunk, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut f = File::open(&path).map_err(|e| format!("Read failed: {e}"))?;
        let size = f.metadata().map_err(|e| format!("Read failed: {e}"))?.len();
        let n = length.min(size.saturating_sub(offset));
        let mut buf = vec![0u8; n as usize];
        f.seek(SeekFrom::Start(offset)).map_err(|e| format!("Read failed: {e}"))?;
        f.read_exact(&mut buf).map_err(|e| format!("Read failed: {e}"))?;
        Ok(Chunk { data: B64.encode(buf), size })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn sync_begin_file(app: tauri::AppHandle, tid: String) -> Result<(), String> {
    File::create(temp_file(&app, &tid)?).map(|_| ()).map_err(|e| io_err("Could not start file", e))
}

#[tauri::command]
pub async fn sync_append_chunk(app: tauri::AppHandle, tid: String, data: String) -> Result<(), String> {
    let tmp = temp_file(&app, &tid)?;
    tauri::async_runtime::spawn_blocking(move || {
        // Android's decoder takes line breaks in its stride; so does this.
        let clean: String = data.chars().filter(|c| !c.is_whitespace()).collect();
        let bytes = B64.decode(clean).map_err(|e| format!("Write failed: {e}"))?;
        OpenOptions::new()
            .append(true)
            .create(true)
            .open(tmp)
            .and_then(|mut f| f.write_all(&bytes))
            .map_err(|e| io_err("Write failed", e))
    })
    .await
    .map_err(|e| e.to_string())?
}

pub fn safe_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if c.is_control() || "<>:\"/\\|?*".contains(c) { '_' } else { c })
        .collect();
    let mut cleaned = cleaned.trim().trim_end_matches(['.', ' ']).to_string();
    // Names Windows keeps for itself, whatever comes after the dot: a song
    // called "Con.mp3" on a phone cannot be a file called that here.
    let stem = cleaned.split('.').next().unwrap_or("").trim().to_ascii_uppercase();
    let taken = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (stem.len() == 4 && (stem.starts_with("COM") || stem.starts_with("LPT")) && stem.as_bytes()[3].is_ascii_digit());
    if taken {
        cleaned.insert(0, '_');
    }
    // And not longer than Windows lets a path be, with the folder in front.
    if cleaned.chars().count() > 150 {
        let ext = cleaned.rsplit_once('.').map(|(_, e)| e.to_string()).filter(|e| e.len() <= 5);
        let keep = 150 - ext.as_ref().map(|e| e.len() + 1).unwrap_or(0);
        cleaned = cleaned.chars().take(keep).collect::<String>().trim_end().to_string();
        if let Some(ext) = ext {
            cleaned = format!("{cleaned}.{ext}");
        }
    }
    if cleaned.is_empty() { "song.mp3".into() } else { cleaned }
}

/// For each path: "here" when the file is there, "gone" when it is not but
/// its disk is, "away" when the disk itself is not there (a stick taken out, a
/// share that is offline). The engine asks this about songs the scan no longer
/// lists, before it concludes they were deleted.
#[tauri::command]
pub async fn sync_path_states(paths: Vec<String>) -> Result<Vec<&'static str>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        // The disk first, and each disk once: asking a share that is offline
        // about every one of its files would wait for the network every time.
        let mut disks: HashMap<PathBuf, bool> = HashMap::new();
        paths
            .iter()
            .map(|p| {
                let path = Path::new(p);
                let disk = path.ancestors().last().filter(|d| !d.as_os_str().is_empty() && *d != path);
                let there = match disk {
                    Some(d) => *disks.entry(d.to_path_buf()).or_insert_with(|| d.exists()),
                    None => true,
                };
                if !there {
                    "away"
                } else if path.is_file() {
                    "here"
                } else {
                    "gone"
                }
            })
            .collect()
    })
    .await
    .map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct Saved {
    path: String,
    uri: String,
}

/// Publishes into Music/MPTree. INCOMPLETE when `size` is given and the file is
/// not that size, FULL when the disk is.
#[tauri::command]
pub async fn sync_finish_file(app: tauri::AppHandle, tid: String, name: String, size: Option<i64>) -> Result<Saved, String> {
    let tmp = temp_file(&app, &tid)?;
    let dir = incoming_dir(&app)?;
    let scope = app.asset_protocol_scope();
    tauri::async_runtime::spawn_blocking(move || {
        let have = fs::metadata(&tmp).map(|m| m.len()).unwrap_or(0);
        if let Some(want) = size.filter(|s| *s >= 0) {
            if have != want as u64 {
                let _ = fs::remove_file(&tmp);
                return Err(format!("INCOMPLETE: {have} of {want}"));
            }
        }
        fs::create_dir_all(&dir).map_err(|e| io_err("Could not save", e))?;
        // Never over a file that is already there: "song (2).mp3".
        let name = safe_name(&name);
        let (stem, ext) = match name.rsplit_once('.') {
            Some((s, e)) => (s.to_string(), format!(".{e}")),
            None => (name.clone(), String::new()),
        };
        let mut dest = dir.join(&name);
        let mut n = 2;
        while dest.exists() {
            dest = dir.join(format!("{stem} ({n}){ext}"));
            n += 1;
        }
        // The cache and the Music folder can be on different drives, where a
        // rename is refused.
        if fs::rename(&tmp, &dest).is_err() {
            fs::copy(&tmp, &dest).map_err(|e| io_err("Could not save", e))?;
            let _ = fs::remove_file(&tmp);
        }
        let _ = scope.allow_directory(&dir, false);
        let path = dest.to_string_lossy().to_string();
        Ok(Saved { uri: path.clone(), path })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn sync_abort_file(app: tauri::AppHandle, tid: String) {
    if let Ok(tmp) = temp_file(&app, &tid) {
        let _ = fs::remove_file(tmp);
    }
}

#[derive(Serialize, Clone)]
struct Progress<'a> {
    tid: &'a str,
    done: u64,
    total: i64,
}

/// Reads through to `inner` and says how far it is every 256 KB.
struct Told<'a, R: Read> {
    inner: R,
    app: &'a tauri::AppHandle,
    tid: &'a str,
    total: i64,
    done: u64,
    told: u64,
}

impl<R: Read> Read for Told<'_, R> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        let n = self.inner.read(buf)?;
        self.done += n as u64;
        if !self.tid.is_empty() && self.done - self.told >= 256 * 1024 {
            self.told = self.done;
            let _ = self.app.emit("sync-progress", Progress { tid: self.tid, done: self.done, total: self.total });
        }
        Ok(n)
    }
}

/// For a whole song: no limit on how long it takes, only on how long nothing
/// may happen. Without one a connection that went quiet held the transfer,
/// and everything queued behind it, until MPTree was closed.
fn slow() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(30))
        .timeout_read(Duration::from_secs(90))
        .timeout_write(Duration::from_secs(90))
        .build()
}

fn http_err(e: ureq::Error) -> String {
    match e {
        ureq::Error::Status(code, _) => format!("HTTP_{code}: Drive answered {code}"),
        e => format!("NETWORK: {e}"),
    }
}

#[tauri::command]
pub async fn sync_drive_upload(
    app: tauri::AppHandle,
    token: String,
    path: String,
    name: String,
    tid: Option<String>,
    app_properties: serde_json::Value,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let file = File::open(&path).map_err(|e| format!("NETWORK: Upload failed: {e}"))?;
        let size = file.metadata().map_err(|e| format!("NETWORK: Upload failed: {e}"))?.len();
        let meta = serde_json::json!({ "name": name, "parents": ["appDataFolder"], "appProperties": app_properties });

        let started = ureq::post(&format!("{DRIVE}/upload/drive/v3/files?uploadType=resumable&fields=id"))
            .timeout(Duration::from_secs(60))
            .set("Authorization", &format!("Bearer {token}"))
            .set("X-Upload-Content-Type", "application/octet-stream")
            .set("X-Upload-Content-Length", &size.to_string())
            .send_json(meta)
            .map_err(http_err)?;
        let session = started.header("Location").ok_or("NETWORK: Upload failed: no session")?.to_string();

        let tid = tid.unwrap_or_default();
        let body = Told { inner: file, app: &app, tid: &tid, total: size as i64, done: 0, told: 0 };
        let done = slow()
            .put(&session)
            .set("Content-Type", "application/octet-stream")
            .set("Content-Length", &size.to_string())
            .send(body)
            .map_err(http_err)?;
        let json: serde_json::Value = done.into_json().map_err(|e| format!("NETWORK: Upload failed: {e}"))?;
        Ok(serde_json::json!({ "id": json["id"].as_str().unwrap_or("") }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn sync_drive_download(
    app: tauri::AppHandle,
    token: String,
    file_id: String,
    tid: String,
    size: Option<i64>,
) -> Result<serde_json::Value, String> {
    let tmp = temp_file(&app, &tid)?;
    tauri::async_runtime::spawn_blocking(move || {
        let got = slow()
            .get(&format!("{DRIVE}/drive/v3/files/{file_id}?alt=media"))
            .set("Authorization", &format!("Bearer {token}"))
            .call()
            .map_err(http_err)?;
        let mut body = Told { inner: got.into_reader(), app: &app, tid: &tid, total: size.unwrap_or(-1), done: 0, told: 0 };
        let copied = File::create(&tmp).and_then(|mut out| std::io::copy(&mut body, &mut out));
        match copied {
            Ok(n) => Ok(serde_json::json!({ "size": n })),
            Err(e) => {
                let _ = fs::remove_file(&tmp);
                let full = matches!(e.raw_os_error(), Some(112) | Some(39));
                Err(if full { "FULL: ENOSPC".into() } else { format!("NETWORK: Download failed: {e}") })
            }
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// mailto: and https: links, opened by Windows rather than inside the window.
#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("mailto:")) {
        return Err("NO_HANDLER: Not a link MPTree opens".into());
    }
    open::that(url).map_err(|e| format!("NO_HANDLER: {e}"))
}
