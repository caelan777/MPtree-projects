import { Image, Moon, Settings as Gear, Sun } from "lucide-react";

export type Page = "home" | "apps" | "settings";

type Props = {
  name: string;
  page: Page;
  onPage: (p: Page) => void;
  /** Whether the screen is dark right now; the button switches to the other. */
  dark: boolean;
  onToggleDark: () => void;
  onSaver: () => void;
};

/** Account, Home and Apps on the left; Settings, the dark mode switch and the screensaver on the right.
 *  The same on every page, so Home is always one press up and left away. */
export function TopBar({ name, page, onPage, dark, onToggleDark, onSaver }: Props) {
  return (
    <div className="top">
      <div className="grp">
        <button className="f acc" data-f="" onClick={() => onPage("settings")}>
          <span className="av">{(name.trim()[0] ?? "?").toUpperCase()}</span>
          {name.trim() || "Account"}
        </button>
        <div className="seg">
          <button className={"f" + (page === "home" ? " on" : "")} data-f="" onClick={() => onPage("home")}>Home</button>
          <button className={"f" + (page === "apps" ? " on" : "")} data-f="" onClick={() => onPage("apps")}>Apps</button>
        </div>
      </div>
      <div className="grp">
        <button className={"f ib" + (page === "settings" ? " on" : "")} data-f="" onClick={() => onPage("settings")} aria-label="Settings">
          <Gear size={34} />
        </button>
        <button className="f ib" data-f="" onClick={onToggleDark} aria-label={dark ? "Light mode" : "Dark mode"}>
          {dark ? <Sun size={34} /> : <Moon size={32} />}
        </button>
        <button className="f ib" data-f="" onClick={onSaver} aria-label="Screensaver">
          <Image size={32} />
        </button>
      </div>
    </div>
  );
}
