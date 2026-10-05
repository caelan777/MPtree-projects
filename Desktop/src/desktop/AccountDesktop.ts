import { WebPlugin } from "@capacitor/core";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AccountPlugin, SyncPlugin, SystemPlugin } from "../plugins";

// The Windows side of the MPTree account. The work is in Rust
// (src-tauri/src/account.rs and sync.rs); this is the thin layer that makes it
// answer exactly as the Android plugins do.

/** Rust rejects with "CODE: what happened". The sync engine reads `code`. */
async function call<R>(cmd: string, args?: Record<string, unknown>): Promise<R> {
  try {
    return await invoke<R>(cmd, args);
  } catch (e) {
    const text = String(e);
    const m = /^([A-Z_0-9]+): (.*)$/s.exec(text);
    throw Object.assign(new Error(m ? m[2] : text), m ? { code: m[1] } : {});
  }
}

export const AccountDesktop: AccountPlugin = {
  /** Opens the browser on Google's sign-in page and waits for the answer. */
  signIn:     () => call<{ token?: string; cancelled?: boolean }>("google_sign_in"),
  getToken:   async () => ({ token: await call<string>("google_token") }),
  clearToken: () => call<void>("google_clear_token"),
  signOut:    () => call<void>("google_sign_out"),
};

export class SyncDesktop extends WebPlugin {
  constructor() {
    super();
    listen<{ tid: string; done: number; total: number }>("sync-progress", e => this.notifyListeners("progress", e.payload))
      .catch(() => {});
  }

  deviceId() { return call<{ id: string; fresh?: boolean }>("sync_device_id"); }
  /** A computer's connection is not counted by the megabyte. */
  async network() { return { online: navigator.onLine, unmetered: true }; }
  async freeSpace() { return { bytes: await call<number>("sync_free_space") }; }
  async keepScreenOn() {}
  async fingerprints(o: { paths: string[] }) { return { items: await call<{ path: string; size: number; fp: string }[]>("sync_fingerprints", o) }; }
  async pathStates(o: { paths: string[] }) { return { states: await call<string[]>("sync_path_states", o) }; }
  readChunk(o: { path: string; offset: number; length: number }) { return call<{ data: string; size: number }>("sync_read_chunk", o); }
  beginFile(o: { tid: string }) { return call<void>("sync_begin_file", o); }
  appendChunk(o: { tid: string; data: string }) { return call<void>("sync_append_chunk", o); }
  finishFile(o: { tid: string; name: string; size?: number }) { return call<{ path: string | null; uri: string }>("sync_finish_file", o); }
  abortFile(o: { tid: string }) { return call<void>("sync_abort_file", o); }
  driveUpload(o: { token: string; path: string; name: string; tid?: string; appProperties: Record<string, string> }) {
    return call<{ id: string }>("sync_drive_upload", o);
  }
  driveDownload(o: { token: string; fileId: string; tid: string; size?: number }) {
    return call<{ size: number }>("sync_drive_download", o);
  }
}

export const makeSyncDesktop = () => new SyncDesktop() as unknown as SyncPlugin;

/** What a computer can answer of what the phone's System plugin is asked. */
export const SystemDesktop: SystemPlugin = {
  getDeviceInfo: async () => ({
    manufacturer: "Windows",
    model: await invoke<string>("host_name").catch(() => "Windows PC"),
    androidVersion: "", sdk: 0,
  }),
  setTextZoom:   async () => {},
  openExternal:  ({ url }) => call<void>("open_external", { url }),
  checkPlayUpdate:   async () => ({ available: false }),
  startPlayUpdate:   async () => {},
  getAppIcon:        async () => ({ icon: "classic" }),
  setAppIcon:        async () => {},
  pinPhotoShortcut:  async () => ({ supported: false }),
};
