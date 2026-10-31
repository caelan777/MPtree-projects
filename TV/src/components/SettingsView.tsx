import { useState } from "react";
import { LAYOUTS, type Settings } from "../settings";
import type { Ha } from "../ha";
import { Launcher } from "../launcher";

type Props = {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  ha: Ha;
  statsError: string | null;
  hasStats: boolean;
  toast: (m: string) => void;
  /** Shows MPTree's screensaver straight away, to see what it looks like. */
  onSaverNow: () => void;
};

const SAVER_STEPS = [5, 10, 20, 30, 0];
const THEMES: Settings["theme"][] = ["auto", "light", "dark"];
const SAVERS: Settings["saverStyle"][] = ["photos", "plain", "tv"];
const SAVER_LABEL: Record<Settings["saverStyle"], [string, string]> = {
  photos: ["photos", "MPTree's, over photos of places around the world: clock, your home, the numbers"],
  plain: ["plain", "MPTree's on white: clock, your home, the numbers"],
  tv: ["the TV's own", "Android's own screensaver. When it starts is set in Android settings."],
};
const THEME_LABEL: Record<Settings["theme"], string> = { auto: "with the sun", light: "always light", dark: "always dark" };

/** A text field that saves when you leave it, so typing with the remote's
 *  on-screen keyboard does not save half an address on every letter. */
function Field({ id, label, value, hint, secret, onSave }: {
  id: string; label: string; value: string; hint: string; secret?: boolean; onSave: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id} data-f="" value={draft} type={secret ? "password" : "text"}
        autoComplete="off" autoCapitalize="off" spellCheck={false}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { if (draft !== value) onSave(draft.trim()); }}
        onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      />
      <span className="hint">{hint}</span>
    </div>
  );
}

export function SettingsView({ settings, onChange, ha, statsError, hasStats, toast, onSaverNow }: Props) {
  const haLine =
    ha.status === "ok" ? <><b>Connected.</b> {Object.keys(ha.states).length} things found.</>
    : ha.status === "loading" ? "Connecting…"
    : ha.status === "error" ? <><b>Not connected.</b> {ha.error}</>
    : "Not set up yet.";
  const nextSaver = SAVER_STEPS[(SAVER_STEPS.indexOf(settings.saverMinutes) + 1) % SAVER_STEPS.length];

  return (
    <div className="page">
      <div className="form">
        <div className="lab">Layout</div>
        <div className="lgrid">
          {LAYOUTS.map(l => (
            <button
              key={l.id} className={"f lpick" + (settings.layout === l.id ? " on" : "")} data-f=""
              data-default={settings.layout === l.id ? "" : undefined}
              onClick={() => { onChange({ layout: l.id, layoutDaily: false }); toast(`${l.name} it is`); }}
            >
              <span className={"thumb t-" + l.id} aria-hidden="true"><i /><i /><i /><i /><i /></span>
              <span className="nm">{l.name}{settings.layout === l.id && !settings.layoutDaily ? <span className="cur"> · now</span> : null}</span>
              <span className="sub">{l.about}</span>
            </button>
          ))}
        </div>
        <button className="f opt" data-f="" onClick={() => onChange({ layoutDaily: !settings.layoutDaily })}>
          <span>A different one each day<div className="sub">Takes the five in turn, one a day</div></span>
          <span className="val">{settings.layoutDaily ? "on" : "off"}</span>
        </button>
        <button className="f opt" data-f="" onClick={() => onChange({ cinemaAfterDark: !settings.cinemaAfterDark })}>
          <span>Cinema after dark<div className="sub">From sunset to sunrise, whatever the layout by day</div></span>
          <span className="val">{settings.cinemaAfterDark ? "on" : "off"}</span>
        </button>

        <div className="lab" style={{ marginTop: 30 }}>You</div>
        <Field id="name" label="Name" value={settings.name} hint="Shown at the top left." onSave={v => onChange({ name: v })} />

        <div className="lab" style={{ marginTop: 30 }}>Home Assistant</div>
        <Field
          id="haUrl" label="Address" value={settings.haUrl}
          hint="The address you open Home Assistant with at home, for example http://homeassistant.local:8123"
          onSave={v => onChange({ haUrl: v })}
        />
        <Field
          id="haToken" label="Token" value={settings.haToken} secret
          hint="In Home Assistant: your profile, Security, Long-lived access tokens, Create token. It stays on this TV."
          onSave={v => onChange({ haToken: v })}
        />
        <div className="status">{haLine}</div>
        <button
          className="f opt" data-f=""
          onClick={() => ha.refresh().then(r => toast(r.ok ? `Connected, ${r.count} things found` : r.error))}
        >
          <span>Check the connection</span><span className="val">OK</span>
        </button>

        <div className="lab" style={{ marginTop: 30 }}>MPTree numbers</div>
        <Field
          id="statsUrl" label="Numbers file" value={settings.statsUrl}
          hint="The address of a copy of Dashboard/data.json. Read once an hour."
          onSave={v => onChange({ statsUrl: v })}
        />
        <div className="status">{!settings.statsUrl ? "Not set up yet." : hasStats ? <b>Loaded.</b> : statsError ?? "Loading…"}</div>

        <div className="lab" style={{ marginTop: 30 }}>This TV</div>
        <button
          className="f opt" data-f=""
          onClick={() => onChange({ theme: THEMES[(THEMES.indexOf(settings.theme) + 1) % THEMES.length], themeOverride: null })}
        >
          <span>Dark mode<div className="sub">With the sun: dark from sunset to sunrise. The moon or sun button at the top switches it for a while.</div></span>
          <span className="val">{THEME_LABEL[settings.theme]}</span>
        </button>
        <button className="f opt" data-f="" onClick={() => onChange({ saverStyle: SAVERS[(SAVERS.indexOf(settings.saverStyle) + 1) % SAVERS.length] })}>
          <span>Screensaver<div className="sub">{SAVER_LABEL[settings.saverStyle][1]}</div></span>
          <span className="val">{SAVER_LABEL[settings.saverStyle][0]}</span>
        </button>
        {settings.saverStyle !== "tv" && (
          <>
            <button className="f opt" data-f="" onClick={() => onChange({ saverMinutes: nextSaver })}>
              <span>Starts after<div className="sub">When the remote has been left alone. Set Android's own screensaver later than this, or to never.</div></span>
              <span className="val">{settings.saverMinutes ? `${settings.saverMinutes} min` : "never"}</span>
            </button>
            <button className="f opt" data-f="" onClick={onSaverNow}>
              <span>Show it now</span><span className="val">OK</span>
            </button>
          </>
        )}
        <button className="f opt" data-f="" onClick={() => Launcher.openSystemSettings()}>
          <span>Android settings<div className="sub">Wi-Fi, picture, sound, the TV itself</div></span>
          <span className="val">Open</span>
        </button>
        <div className="status">MPTree TV {__APP_VERSION__}</div>
      </div>
    </div>
  );
}
