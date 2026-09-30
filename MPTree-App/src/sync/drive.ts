import { CapacitorHttp } from "@capacitor/core";

// ─── THE DRIVE APP FOLDER ────────────────────────────────────────────────────
//
// The MPTree account lives in the person's own Google Drive, in its app folder:
// hidden from their other files, and readable only by MPTree. These are the
// few calls the account needs, made from the phone straight to Google. The
// small JSON files go through here; songs stream natively (SyncPlugin.java).
//
// Requests go through CapacitorHttp, which on Android is the phone's own HTTP
// stack, so the WebView's cross-origin rules do not come into it.

const API = "https://www.googleapis.com";

export type DriveFile = {
  id: string;
  name: string;
  modifiedTime: string;
  size?: string;
  appProperties?: Record<string, string>;
};

export class DriveError extends Error {
  status: number;
  reason: string;
  constructor(status: number, reason: string) {
    super(`Drive ${status}${reason ? ": " + reason : ""}`);
    this.status = status;
    this.reason = reason;
  }
}

export type Drive = {
  about(): Promise<{ email: string; name: string; photo?: string }>;
  list(): Promise<DriveFile[]>;
  read<T>(id: string): Promise<T>;
  /** Creates the file when id is absent. Resolves its id. */
  write(name: string, body: unknown, id?: string): Promise<string>;
  remove(id: string): Promise<void>;
};

export type Tokens = {
  get(): Promise<string>;
  /** Called with a token Drive refused; resolves a fresh one. */
  renew(bad: string): Promise<string>;
};

export function openDrive(tokens: Tokens, dev: boolean): Drive {
  return import.meta.env.DEV && dev ? devDrive() : realDrive(tokens);
}

function realDrive(tokens: Tokens): Drive {
  async function call<T>(method: string, url: string, data?: unknown, retried = false): Promise<T> {
    const token = await tokens.get();
    const res = await CapacitorHttp.request({
      method, url, data,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(data !== undefined ? { "Content-Type": "application/json; charset=UTF-8" } : {}),
      },
    });
    if (res.status === 401 && !retried) {
      await tokens.renew(token);
      return call<T>(method, url, data, true);
    }
    if (res.status < 200 || res.status >= 300) {
      const body = res.data as { error?: { errors?: { reason?: string }[]; message?: string } } | string;
      const reason = typeof body === "object" ? (body?.error?.errors?.[0]?.reason ?? body?.error?.message ?? "") : String(body ?? "");
      throw new DriveError(res.status, reason);
    }
    let out = res.data as unknown;
    // A JSON file can come back as text when Drive stores it as plain text.
    if (typeof out === "string" && /^\s*[[{]/.test(out)) { try { out = JSON.parse(out); } catch { /* leave it */ } }
    return out as T;
  }

  return {
    async about() {
      const r = await call<{ user: { displayName: string; emailAddress: string; photoLink?: string } }>(
        "GET", `${API}/drive/v3/about?fields=user(displayName,emailAddress,photoLink)`);
      return { email: r.user.emailAddress, name: r.user.displayName, photo: r.user.photoLink };
    },
    async list() {
      const files: DriveFile[] = [];
      let page = "";
      do {
        const r = await call<{ files: DriveFile[]; nextPageToken?: string }>("GET",
          `${API}/drive/v3/files?spaces=appDataFolder&pageSize=1000` +
          `&fields=nextPageToken,files(id,name,modifiedTime,size,appProperties)` +
          (page ? `&pageToken=${encodeURIComponent(page)}` : ""));
        files.push(...r.files);
        page = r.nextPageToken ?? "";
      } while (page);
      return files;
    },
    read<T>(id: string) {
      return call<T>("GET", `${API}/drive/v3/files/${id}?alt=media`);
    },
    async write(name, body, id) {
      let fileId = id;
      if (!fileId) {
        const made = await call<{ id: string }>("POST", `${API}/drive/v3/files?fields=id`,
          { name, parents: ["appDataFolder"], mimeType: "application/json" });
        fileId = made.id;
      }
      await call("PATCH", `${API}/upload/drive/v3/files/${fileId}?uploadType=media&fields=id`, body);
      return fileId;
    },
    async remove(id) {
      try { await call("DELETE", `${API}/drive/v3/files/${id}`); }
      catch (e) { if (!(e instanceof DriveError && e.status === 404)) throw e; }
    },
  };
}

// ── A Drive on the dev server ─────────────────────────────────────────────────
// Held in the dev server's memory (vite.config.ts), so http://localhost and
// http://127.0.0.1 play two phones on one account. Never used in a build that
// ships: the dev account only exists under import.meta.env.DEV.

type DevStore = Record<string, DriveFile & { body: unknown }>;

function devDrive(): Drive {
  const load = async (): Promise<DevStore> => (await fetch("/__dev_drive")).json();
  const save = (s: DevStore) => fetch("/__dev_drive", { method: "POST", body: JSON.stringify(s) });
  return {
    async about() { return { email: "dev@example.com", name: "Dev" }; },
    async list() {
      return Object.values(await load()).map(f => ({ id: f.id, name: f.name, modifiedTime: f.modifiedTime, size: f.size, appProperties: f.appProperties }));
    },
    async read<T>(id: string) {
      const f = (await load())[id];
      if (!f) throw new DriveError(404, "notFound");
      return f.body as T;
    },
    async write(name, body, id) {
      const s = await load();
      const fileId = id ?? Math.random().toString(36).slice(2);
      s[fileId] = { id: fileId, name, modifiedTime: new Date().toISOString() + Math.random(), body };
      await save(s);
      return fileId;
    },
    async remove(id) { const s = await load(); delete s[id]; await save(s); },
  };
}
