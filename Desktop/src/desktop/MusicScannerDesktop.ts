import { WebPlugin } from "@capacitor/core";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { Song } from "../types";

const KEY = "mptree_desktop_folder";

/** The folder the library is read from. Empty means the whole user folder. */
export function musicFolder(): string {
  try { return localStorage.getItem(KEY) || ""; } catch { return ""; }
}

/** Asks for a folder. Resolves the choice, or null when the dialog was closed. */
export async function chooseMusicFolder(): Promise<string | null> {
  const picked = await open({ directory: true, multiple: false, defaultPath: musicFolder() || undefined });
  if (typeof picked !== "string") return null;
  localStorage.setItem(KEY, picked);
  return picked;
}

/** Stands where the MediaStore scan stands on Android: reads a folder instead. */
export class MusicScannerDesktop extends WebPlugin {
  /** Windows has no media permission to grant. */
  async hasAccess() { return { granted: true }; }

  async scan(): Promise<{ songs: Song[] }> {
    const songs = await invoke<Song[]>("scan", { folder: musicFolder() });
    return { songs };
  }

  /** The next scan reads the disk again anyway. */
  async scanFolder(): Promise<void> {}

  async deleteFile(options: { path: string }) {
    const { deleted } = await this.deleteFiles({ paths: [options.path] });
    return { deleted: deleted.length > 0 };
  }

  /** To the Recycle Bin, so a wrong tap can be undone from Windows itself. */
  async deleteFiles(options: { paths: string[] }) {
    return { deleted: await invoke<string[]>("trash_files", { paths: options.paths }) };
  }

  async getLyrics(options: { path: string }) {
    try { return { lyrics: await invoke<string>("lyrics", { path: options.path }) }; }
    catch { return { lyrics: "" }; }
  }

  async openAppSettings(): Promise<void> {}

  async setAsRingtone() { return { ok: false }; }

  async cutTrack(): Promise<never> {
    throw Object.assign(new Error("Not on Windows yet"), { code: "UNSUPPORTED_FORMAT" });
  }
}
