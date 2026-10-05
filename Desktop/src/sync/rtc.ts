import { Sync } from "../plugins";

// ─── PHONE TO PHONE ──────────────────────────────────────────────────────────
//
// Two phones on one account pass songs to each other over a WebRTC data
// channel. There is no MPTree server in between: the phones find each other
// through small notes in the Drive app folder (the offer and the answer, see
// engine.ts), and Google's public STUN server tells each phone its own address.
// On the same wifi that always works. Across networks it usually does, but a
// mobile carrier can put a phone behind a kind of router no STUN answer gets
// through, and without a relay server of our own that is where it stops: the
// engine then falls back to passing the song through Drive.
//
// The talk on the channel, both ways at once:
//   { t: "want", fps }             the songs I would like from you
//   { t: "file", fp, size, name }  then the bytes, then { t: "end", fp }
//   { t: "done" }                  I have sent all you asked for
//   { t: "bye" }                   I heard your done and saved all you sent
// Each side closes once it has said bye and heard bye. Closing any sooner can
// cut off the last piece of a song still on its way.

const STUN = [{ urls: "stun:stun.l.google.com:19302" }];
const PIECE = 64 * 1024;          // one channel message
const READ = 1024 * 1024;         // one read from the file
const FLUSH = 1024 * 1024;        // written to the temp file this often
const HIGH_WATER = 4 * 1024 * 1024;
const QUIET_LIMIT = 30_000;       // nothing heard for this long: give up

export type Offer = { sdp: string; sid: string };

export type SongOut = { fp: string; path: string; size: number; name: string };

export type TransferHooks = {
  /** The songs to ask the other phone for. */
  want: string[];
  /** A song the other phone asked for, or null if it is not here after all. */
  find(fp: string): SongOut | null;
  /** A song arrived whole and was saved into Music/MPTree. */
  onSaved(fp: string, path: string | null): void;
  onProgress(p: { dir: "in" | "out"; name: string; done: number; total: number }): void;
  /** How many songs came in and went out. */
  onEnd(result: { received: number; sent: number; error?: string }): void;
};

// ── Setting up the connection ─────────────────────────────────────────────────

/** The SDP with every ICE candidate in it, so one note each way is enough. */
async function gathered(pc: RTCPeerConnection): Promise<string> {
  if (pc.iceGatheringState !== "complete") {
    await new Promise<void>(resolve => {
      const done = () => { pc.removeEventListener("icegatheringstatechange", check); resolve(); };
      const check = () => { if (pc.iceGatheringState === "complete") done(); };
      pc.addEventListener("icegatheringstatechange", check);
      setTimeout(done, 5000);
    });
  }
  return pc.localDescription!.sdp;
}

export type Session = { pc: RTCPeerConnection; channel: Promise<RTCDataChannel> };

/** The phone with the lower id starts. */
export async function startOffer(): Promise<{ session: Session; offer: string }> {
  const pc = new RTCPeerConnection({ iceServers: STUN });
  const dc = pc.createDataChannel("mptree", { ordered: true });
  dc.binaryType = "arraybuffer";
  const channel = new Promise<RTCDataChannel>((resolve, reject) => {
    dc.onopen = () => resolve(dc);
    pc.onconnectionstatechange = () => { if (pc.connectionState === "failed") reject(new Error("failed")); };
  });
  await pc.setLocalDescription(await pc.createOffer());
  return { session: { pc, channel }, offer: await gathered(pc) };
}

export async function acceptAnswer(session: Session, answer: string): Promise<void> {
  await session.pc.setRemoteDescription({ type: "answer", sdp: answer });
}

export async function answerOffer(offer: string): Promise<{ session: Session; answer: string }> {
  const pc = new RTCPeerConnection({ iceServers: STUN });
  const channel = new Promise<RTCDataChannel>((resolve, reject) => {
    pc.ondatachannel = e => { e.channel.binaryType = "arraybuffer"; e.channel.onopen = () => resolve(e.channel); if (e.channel.readyState === "open") resolve(e.channel); };
    pc.onconnectionstatechange = () => { if (pc.connectionState === "failed") reject(new Error("failed")); };
  });
  await pc.setRemoteDescription({ type: "offer", sdp: offer });
  await pc.setLocalDescription(await pc.createAnswer());
  return { session: { pc, channel }, answer: await gathered(pc) };
}

/** Waits for the channel, or gives up after `ms`. */
export function opened(session: Session, ms: number): Promise<RTCDataChannel> {
  return Promise.race([
    session.channel,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

export function close(session: Session | null): void {
  try { session?.pc.close(); } catch { /* already closed */ }
}

// ── base64, without choking on megabytes ──────────────────────────────────────

function toBase64(parts: Uint8Array[]): string {
  let bin = "";
  for (const p of parts) {
    for (let i = 0; i < p.length; i += 0x8000) bin += String.fromCharCode.apply(null, p.subarray(i, i + 0x8000) as unknown as number[]);
  }
  return btoa(bin);
}

function fromBase64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ── Passing songs ─────────────────────────────────────────────────────────────

export function runTransfer(dc: RTCDataChannel, session: Session, hooks: TransferHooks): () => void {
  let stopped = false;
  let received = 0, sent = 0;
  let saidDone = false, heardDone = false, saidBye = false, heardBye = false;
  let lastHeard = Date.now();
  let writing: Promise<void> = Promise.resolve();

  // What is coming in right now.
  let incoming: { fp: string; tid: string; size: number; name: string; got: number; buf: Uint8Array[]; bufLen: number; failed: boolean } | null = null;

  const send = (msg: object) => dc.send(JSON.stringify(msg));

  const finish = (error?: string) => {
    if (stopped) return;
    stopped = true;
    clearInterval(watch);
    if (incoming) { Sync.abortFile({ tid: incoming.tid }).catch(() => {}); incoming = null; }
    close(session);
    hooks.onEnd({ received, sent, error });
  };

  const maybeBye = () => {
    if (!heardDone || incoming || saidBye) return;
    saidBye = true;
    writing.then(() => { if (!stopped) send({ t: "bye" }); maybeClose(); });
  };
  const maybeClose = () => {
    if (!saidBye || !heardBye || !saidDone) return;
    const wait = () => dc.bufferedAmount === 0 || stopped ? finish() : setTimeout(wait, 50);
    wait();
  };

  const watch = setInterval(() => {
    if (Date.now() - lastHeard > QUIET_LIMIT) finish("quiet");
  }, 5000);

  const drained = () => dc.bufferedAmount < HIGH_WATER ? Promise.resolve()
    : new Promise<void>(resolve => {
        dc.bufferedAmountLowThreshold = HIGH_WATER / 2;
        dc.onbufferedamountlow = () => { dc.onbufferedamountlow = null; resolve(); };
      });

  async function sendAll(fps: string[]) {
    for (const fp of fps) {
      if (stopped) return;
      const song = hooks.find(fp);
      if (!song) continue;
      send({ t: "file", fp, size: song.size, name: song.name });
      let offset = 0;
      try {
        while (offset < song.size && !stopped) {
          const { data } = await Sync.readChunk({ path: song.path, offset, length: READ });
          const bytes = fromBase64(data);
          if (!bytes.length) break;
          for (let i = 0; i < bytes.length; i += PIECE) {
            await drained();
            if (stopped) return;
            dc.send(bytes.subarray(i, i + PIECE));
          }
          offset += bytes.length;
          hooks.onProgress({ dir: "out", name: song.name, done: offset, total: song.size });
        }
      } catch {
        // The file went away or could not be read. The other side sees a
        // short file and throws it away.
      }
      send({ t: "end", fp });
      sent++;
    }
    await drained();
    send({ t: "done" });
    saidDone = true;
    maybeClose();
  }

  const flush = (final: boolean) => {
    const cur = incoming;
    if (!cur || (!final && cur.bufLen < FLUSH)) return;
    const parts = cur.buf; cur.buf = []; cur.bufLen = 0;
    if (parts.length) {
      const data = toBase64(parts);
      writing = writing.then(() => cur.failed ? undefined : Sync.appendChunk({ tid: cur.tid, data }).catch(() => { cur.failed = true; }));
    }
  };

  dc.onmessage = (e: MessageEvent) => {
    lastHeard = Date.now();
    if (typeof e.data !== "string") {
      if (!incoming) return;
      const bytes = new Uint8Array(e.data as ArrayBuffer);
      incoming.buf.push(bytes);
      incoming.bufLen += bytes.length;
      incoming.got += bytes.length;
      hooks.onProgress({ dir: "in", name: incoming.name, done: incoming.got, total: incoming.size });
      flush(false);
      return;
    }
    let msg: { t: string; fp?: string; fps?: string[]; size?: number; name?: string };
    try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.t === "want") {
      void sendAll(msg.fps ?? []);
    } else if (msg.t === "file" && msg.fp) {
      const tid = "rtc-" + msg.fp;
      incoming = { fp: msg.fp, tid, size: msg.size ?? 0, name: msg.name ?? "song.mp3", got: 0, buf: [], bufLen: 0, failed: false };
      writing = writing.then(() => Sync.beginFile({ tid })).catch(() => { if (incoming) incoming.failed = true; });
    } else if (msg.t === "end" && incoming && incoming.fp === msg.fp) {
      flush(true);
      const cur = incoming;
      incoming = null;
      writing = writing.then(async () => {
        if (cur.failed) { await Sync.abortFile({ tid: cur.tid }).catch(() => {}); return; }
        try {
          const saved = await Sync.finishFile({ tid: cur.tid, name: cur.name, size: cur.size });
          received++;
          hooks.onSaved(cur.fp, saved.path);
        } catch { /* incomplete or no room: left out, tried again next time */ }
      });
      maybeBye();
    } else if (msg.t === "done") {
      heardDone = true;
      maybeBye();
    } else if (msg.t === "bye") {
      heardBye = true;
      maybeClose();
    }
  };
  // The other side closing after both said done is the normal end.
  dc.onclose = () => finish(saidDone && heardDone ? undefined : "closed");

  send({ t: "want", fps: hooks.want });
  return () => finish("stopped");
}
