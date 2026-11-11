import { Image, Moon, Settings as Gear, Speaker as SpeakerIcon, Sun } from "lucide-react";
import type { Speaker } from "../speaker";

export type Page = "home" | "apps" | "settings";

type Props = {
  name: string;
  page: Page;
  onPage: (p: Page) => void;
  /** Whether the screen is dark right now; the button switches to the other. */
  dark: boolean;
  /** What the Dark/Light button does, in words: "Dark until sunrise", "Always light". */
  darkOk: string;
  /** Null where there is no light and dark: Cinema is always dark. */
  onToggleDark: (() => void) | null;
  onSaver: () => void;
  /** The TV's own Android settings: Wi-Fi, picture, sound. */
  onAndroidSettings: () => void;
  /** The living-room speaker, the small button after Apps. */
  speaker: Speaker;
  /** What OK does on the focused thing, shown in the middle. */
  hint: string | null;
};

/** Your name (MPTree TV's own settings), Home, Apps and the speaker on the left;
 *  the TV's Settings, Dark (not on Cinema) and Screensaver on the right, in words.
 *  In the middle: what OK does right now. The same on every page. */
export function TopBar({ name, page, onPage, dark, darkOk, onToggleDark, onSaver, onAndroidSettings, speaker, hint }: Props) {
  const sp = speaker.busy ? "Connecting…" : speaker.state === "connected" ? "Speaker on" : "Speaker";
  return (
    <>
      <div className="top">
        <div className="grp">
          <button className={"f acc" + (page === "settings" ? " on" : "")} data-f="" data-ok="Open MPTree TV settings" onClick={() => onPage("settings")}>
            <span className="av">{(name.trim()[0] ?? "?").toUpperCase()}</span>
            {name.trim() || "Account"}
          </button>
          <div className="seg">
            <button className={"f" + (page === "home" ? " on" : "")} data-f="" data-ok="Go to Home" onClick={() => onPage("home")}>Home</button>
            <button className={"f" + (page === "apps" ? " on" : "")} data-f="" data-ok="See all apps" onClick={() => onPage("apps")}>Apps</button>
          </div>
          <button className={"f spk" + (speaker.state === "connected" ? " on" : "")} data-f=""
            data-ok={speaker.state === "connected" ? "The living-room speaker is connected" : "Switch on Bluetooth and connect the living-room speaker"}
            onClick={speaker.connect}>
            <SpeakerIcon size={24} />{sp}
          </button>
        </div>
        <div className="grp">
          <button className="f tb" data-f="" data-ok="Open the TV's settings: Wi-Fi, picture, sound" onClick={onAndroidSettings}>
            <Gear size={30} />Settings
          </button>
          {onToggleDark && (
            <button className="f tb" data-f="" data-ok={darkOk} onClick={onToggleDark}>
              {dark ? <Sun size={30} /> : <Moon size={28} />}{dark ? "Light" : "Dark"}
            </button>
          )}
          <button className="f tb" data-f="" data-ok="Start the screensaver" onClick={onSaver}>
            <Image size={28} />Screensaver
          </button>
        </div>
      </div>
      {hint && (
        <div className="rhint" aria-live="polite"><kbd>OK</kbd><b>{hint}</b></div>
      )}
    </>
  );
}
