import { useCallback, useEffect, useState } from "react";
import { Launcher, type SpeakerState } from "./launcher";

// The living-room speaker, the Speaker button in the top bar: Bluetooth on and the
// paired speaker connected, so MPTree (and the TV) plays through it.

export type Speaker = {
  state: SpeakerState;
  /** Bluetooth is switching on and the speaker connecting. */
  busy: boolean;
  connect: () => void;
};

/** Read every few seconds while Home is in view (`on`), so the button shows
 *  when the speaker was connected or dropped some other way. */
export function useSpeaker(on: boolean, toast: (m: string) => void): Speaker {
  const [state, setState] = useState<SpeakerState>("none");
  const [busy, setBusy] = useState(false);

  const read = useCallback(() => {
    Launcher.speakerState().then(r => setState(r.state), () => setState("none"));
  }, []);

  useEffect(() => {
    if (!on) return;
    read();
    const t = window.setInterval(() => { if (!document.hidden) read(); }, 5000);
    return () => window.clearInterval(t);
  }, [on, read]);

  const connect = useCallback(() => {
    if (busy) return;
    if (state === "connected") { toast("The speaker is connected"); return; }
    setBusy(true);
    Launcher.connectSpeaker()
      .then(r => {
        if (r.connected) toast(r.name ? `${r.name} connected` : "Speaker connected");
        else {
          // Bluetooth is on but the speaker did not come: pick it on the TV's own screen.
          toast("Pick the speaker here");
          Launcher.openBluetoothSettings().catch(() => {});
        }
      }, (e: unknown) => toast(e instanceof Error ? e.message : String(e)))
      .finally(() => { setBusy(false); read(); });
  }, [busy, state, toast, read]);

  return { state, busy, connect };
}
