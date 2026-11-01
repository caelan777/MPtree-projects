import { useState, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight, Home as HouseIcon, LayoutTemplate, Minus, Plus, Rows3, Trash2, Tv, X } from "lucide-react";
import { LAYOUTS, type LayoutId, type Settings } from "../settings";
import type { Ha } from "../ha";
import { HA } from "../homeConfig";
import { Launcher, type TvApp } from "../launcher";
import { clock } from "../format";
import { ago, type MptreeStats } from "../stats";
import { AppTile } from "./AppTile";
import { Logo } from "./Logo";
import { StatsCard } from "./layouts/parts";
import { focusFirst } from "../nav";

type Props = {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  ha: Ha;
  stats: MptreeStats | null;
  statsError: string | null;
  toast: (m: string) => void;
  /** Shows MPTree's screensaver straight away, to see what it looks like. */
  onSaverNow: () => void;
  apps: TvApp[];
  /** The apps on Home, in order (package names). */
  dock: string[];
  dockMax: number;
  onSetDock: (next: string[]) => void;
  now: Date;
};

type Section = "look" | "apps" | "ha" | "numbers" | "tv";
const SECTIONS: { id: Section; name: string; icon: ReactNode }[] = [
  { id: "look", name: "Look", icon: <LayoutTemplate size={34} /> },
  { id: "apps", name: "Apps on Home", icon: <Rows3 size={34} /> },
  { id: "ha", name: "Home Assistant", icon: <HouseIcon size={34} /> },
  { id: "numbers", name: "MPTree numbers", icon: <Logo size={34} /> },
  { id: "tv", name: "This TV", icon: <Tv size={34} /> },
];

/** Minutes the screensaver can wait. 0 is never. */
const SAVER_STEPS = [0, 5, 10, 15, 20, 30, 45, 60];

/** Settings: the sections on the left (Up and Down pick one, Right goes in), the
 *  chosen one on the right. Every control shows its choices at once: segmented
 *  buttons, real switches, − and + for minutes. */
export function SettingsView(props: Props) {
  const [section, setSection] = useState<Section>("look");
  const enter = () => requestAnimationFrame(() => focusFirst(document.querySelector(".set-main") ?? document));
  return (
    <div className="page settings">
      <nav className="set-nav" data-group="">
        {SECTIONS.map(x => (
          <button
            key={x.id} className={"f it" + (section === x.id ? " on" : "")} data-f=""
            data-current={section === x.id ? "" : undefined} data-default={section === x.id ? "" : undefined}
            data-ok={`Go into ${x.name}`}
            onFocus={() => setSection(x.id)} onClick={enter}
            onKeyDown={e => { if (e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); enter(); } }}
          >
            {x.icon}{x.name}
          </button>
        ))}
      </nav>
      <div className="set-main">
        {section === "look" && <Look {...props} />}
        {section === "apps" && <AppsOnHome {...props} />}
        {section === "ha" && <HomeAssistant {...props} />}
        {section === "numbers" && <Numbers {...props} />}
        {section === "tv" && <ThisTv {...props} />}
      </div>
    </div>
  );
}

// ── small controls ───────────────────────────────────────────────────────────

/** Three (or so) choices side by side; the chosen one is grey. OK picks. */
function Segmented<T extends string>({ value, options, onPick }: { value: T; options: [T, string][]; onPick: (v: T) => void }) {
  return (
    <div className="segc">
      {options.map(([v, label]) => (
        <button key={v} className={"f" + (v === value ? " on" : "")} data-f="" data-ok={v === value ? `${label} is chosen` : `Use ${label}`} onClick={() => onPick(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

/** A row with a switch: black is on. OK flips it. */
function Switch({ on, title, sub, onFlip }: { on: boolean; title: string; sub: string; onFlip: () => void }) {
  return (
    <button className="f swrow" data-f="" data-ok={on ? `Turn off: ${title}` : `Turn on: ${title}`} onClick={onFlip}>
      <span>{title}<span className="ss">{sub}</span></span>
      <span className={"sw" + (on ? " on" : "")} aria-label={on ? "on" : "off"} />
    </button>
  );
}

/** A text field that saves when you leave it, so typing with the remote's
 *  on-screen keyboard does not save half an address on every letter. */
function Field({ id, label, value, placeholder, hint, secret, ok, onSave }: {
  id: string; label: string; value: string; placeholder?: string; hint?: string; secret?: boolean; ok?: string; onSave: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id} data-f="" value={draft} type={secret ? "password" : "text"} placeholder={placeholder}
        data-ok={ok ?? `Type the ${label.toLowerCase()}`}
        autoComplete="off" autoCapitalize="off" spellCheck={false}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { if (draft.trim() !== value) onSave(draft.trim()); }}
        onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      />
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

function Status({ good, title, sub, children }: { good: boolean; title: string; sub: string; children?: ReactNode }) {
  return (
    <div className={"setstatus" + (good ? "" : " bad")}>
      <span className="ok">{good ? <Check size={34} strokeWidth={3} /> : <X size={34} strokeWidth={3} />}</span>
      <div><div className="big">{title}</div><div className="ss">{sub}</div></div>
      {children}
    </div>
  );
}

// ── Look ─────────────────────────────────────────────────────────────────────

function Look({ settings: s, onChange, toast, onSaverNow }: Props) {
  const i = SAVER_STEPS.indexOf(s.saverMinutes);
  const at = i < 0 ? 2 : i;
  const minutes = (m: number) => (m ? `${m} min` : "Never");
  return (
    <>
      <h3>Look</h3>
      <div className="lead">How Home looks, when it goes dark, and the screensaver.</div>
      <div className="lgrid">
        {LAYOUTS.map(l => {
          const inUse = s.layout === l.id && !s.layoutDaily;
          return (
            <button
              key={l.id} className={"f lpick" + (inUse ? " on" : "")} data-f=""
              data-ok={inUse ? `${l.name} is in use` : `Use ${l.name}`}
              onClick={() => { onChange({ layout: l.id as LayoutId, layoutDaily: false }); toast(`${l.name} it is`); }}
            >
              <span className={"thumb t-" + l.id} aria-hidden="true"><i /><i /><i /><i /><i /></span>
              <span className="nm">{l.name}{inUse && <span className="ck"><Check size={18} strokeWidth={3} /></span>}</span>
              <span className="sub">{l.about}</span>
            </button>
          );
        })}
      </div>
      <div className="row2">
        <div className="ctrl">
          <div className="tt">Dark mode</div><div className="ss">Dark from sunset to sunrise, or always one</div>
          <Segmented value={s.theme} options={[["auto", "With the sun"], ["light", "Light"], ["dark", "Dark"]]} onPick={v => onChange({ theme: v, themeOverride: null })} />
        </div>
        <div className="ctrl">
          <div className="tt">Screensaver</div><div className="ss">Starts when the remote is left alone</div>
          <Segmented value={s.saverStyle} options={[["photos", "Photos"], ["plain", "Plain"], ["tv", "TV's own"]]} onPick={v => onChange({ saverStyle: v })} />
        </div>
      </div>
      <div className="row2">
        <Switch on={s.layoutDaily} title="A different layout each day" sub="The five in turn" onFlip={() => onChange({ layoutDaily: !s.layoutDaily })} />
        <Switch on={s.cinemaAfterDark} title="Cinema after dark" sub="Whatever the layout by day" onFlip={() => onChange({ cinemaAfterDark: !s.cinemaAfterDark })} />
      </div>
      {s.saverStyle !== "tv" ? (
        <div className="swrow plain">
          <span>Screensaver starts after<span className="ss">Set Android's own screensaver later than this, or to never</span></span>
          <span className="step">
            <button className="f" data-f="" data-ok={at > 0 ? `Make it ${minutes(SAVER_STEPS[at - 1])}` : "It is already never"} onClick={() => at > 0 && onChange({ saverMinutes: SAVER_STEPS[at - 1] })} aria-label="Sooner"><Minus size={28} /></button>
            <b>{minutes(s.saverMinutes)}</b>
            <button className="f" data-f="" data-ok={at < SAVER_STEPS.length - 1 ? `Make it ${minutes(SAVER_STEPS[at + 1])}` : "This is the longest"} onClick={() => at < SAVER_STEPS.length - 1 && onChange({ saverMinutes: SAVER_STEPS[at + 1] })} aria-label="Later"><Plus size={28} /></button>
            <button className="f pill" data-f="" data-ok="Show the screensaver now" onClick={onSaverNow}>Show now</button>
          </span>
        </div>
      ) : (
        <div className="lead">The TV's own screensaver starts when Android's settings say. MPTree's waits.</div>
      )}
    </>
  );
}

// ── Apps on Home ─────────────────────────────────────────────────────────────

function AppsOnHome({ apps, dock, dockMax, onSetDock, toast }: Props) {
  const [chosen, setChosen] = useState<string | null>(dock[0] ?? null);
  const onHome = dock.map(p => apps.find(a => a.packageName === p)).filter((a): a is TvApp => !!a);
  const others = apps.filter(a => !dock.includes(a.packageName)).sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));
  const sel = onHome.find(a => a.packageName === chosen) ?? null;
  const at = sel ? dock.indexOf(sel.packageName) : -1;

  const moveBy = (by: number) => {
    if (!sel) return;
    const to = at + by;
    if (to < 0 || to >= dock.length) return;
    const next = [...dock];
    next.splice(at, 1);
    next.splice(to, 0, sel.packageName);
    onSetDock(next);
  };
  const remove = () => {
    if (!sel) return;
    onSetDock(dock.filter(p => p !== sel.packageName));
    toast(`${sel.label} taken off Home`);
    setChosen(dock.filter(p => p !== sel.packageName)[Math.max(0, at - 1)] ?? null);
    requestAnimationFrame(() => focusFirst(document.querySelector(".slots") ?? document));
  };
  const add = (a: TvApp) => {
    if (dock.length >= dockMax) { toast(`Home holds ${dockMax} apps. Remove one first.`); return; }
    onSetDock([...dock, a.packageName]);
    setChosen(a.packageName);
    toast(`${a.label} is on Home, in place ${dock.length + 1}`);
  };

  return (
    <>
      <h3>Apps on Home</h3>
      <div className="lead">The {dockMax} apps at the bottom of Home, in this order. Choose one to move it or remove it.</div>
      <div className="slots">
        {Array.from({ length: dockMax }, (_, i) => {
          const a = onHome[i];
          if (!a) return <div key={"e" + i} className="slot empty"><span>Empty</span></div>;
          return (
            <div key={a.packageName} className={"slot" + (a.packageName === chosen ? " chosen" : "")}>
              <AppTile app={a} onOpen={() => setChosen(a.packageName)} ok={a.packageName === chosen ? `${a.label} is chosen` : `Choose ${a.label}`} isDefault={a.packageName === chosen} />
            </div>
          );
        })}
      </div>
      {sel ? (
        <div className="slotbar">
          <b>{sel.label}</b>
          <button className="f pill" data-f="" data-ok={at > 0 ? `Move ${sel.label} one place left` : `${sel.label} is already first`} onClick={() => moveBy(-1)}><ChevronLeft size={26} />Move left</button>
          <button className="f pill" data-f="" data-ok={at < dock.length - 1 ? `Move ${sel.label} one place right` : `${sel.label} is already last`} onClick={() => moveBy(1)}>Move right<ChevronRight size={26} /></button>
          <button className="f pill" data-f="" data-ok={`Take ${sel.label} off Home`} onClick={remove}><Trash2 size={24} />Remove from Home</button>
        </div>
      ) : (
        <div className="lead">{onHome.length ? "Choose an app above." : "No apps on Home yet. Add one below."}</div>
      )}
      <div className="lbl">{dock.length < dockMax ? "Add one of these" : `Home is full. Remove one to add another of these`}</div>
      <div className="agrid small">
        {others.map(a => (
          <AppTile key={a.packageName} app={a} onOpen={() => add(a)} ok={dock.length < dockMax ? `Put ${a.label} on Home` : "Home is full: remove one first"} />
        ))}
      </div>
      <div className="lead">Holding OK on an app in Apps still works too.</div>
    </>
  );
}

// ── Home Assistant ───────────────────────────────────────────────────────────

function HomeAssistant({ settings: s, onChange, ha, toast }: Props) {
  const host = s.haUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const count = Object.keys(ha.states).length;
  const good = ha.status === "ok";
  const title = good ? "Connected" : ha.status === "loading" ? "Connecting…" : ha.status === "unset" ? "Not set up yet" : "Not connected";
  const sub = good
    ? `${count} things · last checked ${ha.checkedAt ? clock(new Date(ha.checkedAt)) : "just now"} · ${host}`
    : ha.status === "unset" ? "Add the address and a token below." : ha.error ?? "";

  // What each part of Home uses, and whether Home Assistant has it.
  const shuffle = ha.states[HA.shuffleScript] ? HA.shuffleScript
    : Object.values(ha.states).find(e => e.entity_id.startsWith("script.") && /shuffle/i.test(String(e.attributes.friendly_name ?? e.entity_id)))?.entity_id ?? HA.shuffleScript;
  const player = Object.values(ha.states).find(e => e.entity_id.startsWith("media_player.") && (e.state === "playing" || e.state === "paused"))?.entity_id;
  const uses: [string, string, boolean][] = [
    ["Sunset lights", HA.sunsetScript, !!ha.states[HA.sunsetScript]],
    ["All lights off", HA.allLights, !!ha.states[HA.allLights]],
    ["Alarm", HA.alarm, !!ha.states[HA.alarm]],
    ["Heating", HA.heating, !!ha.states[HA.heating]],
    ["Inside", HA.insideTemp, !!ha.states[HA.insideTemp]],
    [`Weather, ${HA.outsideLabel}`, HA.weather, !!ha.states[HA.weather]],
    ["Shuffle music", shuffle, !!ha.states[shuffle]],
    ["Now playing", player ?? "any speaker that plays", true],
  ];

  return (
    <>
      <h3>Home Assistant</h3>
      <Status good={good} title={title} sub={sub}>
        <button className="f pill" data-f="" data-default="" data-ok="Check the connection now"
          onClick={() => ha.refresh().then(r => toast(r.ok ? `Connected, ${r.count} things found` : r.error))}>Check now</button>
      </Status>
      <div className="row2">
        <Field id="haUrl" label="Address" value={s.haUrl} placeholder="http://homeassistant.local:8123"
          hint="The address you open Home Assistant with at home." onSave={v => onChange({ haUrl: v })} />
        <Field id="haToken" label="Token" value="" secret ok={s.haToken ? "Type a new token to replace the saved one" : "Paste the token"}
          placeholder={s.haToken ? "Saved on this TV · type to replace" : "Paste a long-lived token"}
          hint="Your profile, Security, Long-lived access tokens. Never shown, and it stays on this TV."
          onSave={v => { if (v) { onChange({ haToken: v }); toast("New token saved"); } }} />
      </div>
      <div className="lbl">What Home shows</div>
      <div className="ents">
        {uses.map(([what, id, found]) => (
          <div key={what} className="ent"><span>{what}</span><span className={found ? "" : "miss"}>{found ? id : `${id} · not found`}</span></div>
        ))}
      </div>
    </>
  );
}

// ── MPTree numbers ───────────────────────────────────────────────────────────

function Numbers({ settings: s, onChange, stats, statsError, now }: Props) {
  const good = !!stats;
  const title = good ? "Numbers loaded" : !s.statsUrl ? "Not set up yet" : statsError ? "Can't read the numbers" : "Loading…";
  const sub = good
    ? `Collected on your PC ${stats.collectedAt ? ago(stats.collectedAt, now.getTime()) : ""}. Read again every hour.`
    : !s.statsUrl ? "Add the address of the numbers file below." : statsError ?? "";
  return (
    <>
      <h3>MPTree numbers</h3>
      <div className="lead">Installs, rating, downloads and visitors, as collected on your PC.</div>
      <Status good={good} title={title} sub={sub} />
      {good && <StatsCard stats={stats} error={null} now={now} />}
      <Field id="statsUrl" label="Numbers file" value={s.statsUrl} placeholder="http://…/data.json"
        hint="The address of a copy of Dashboard/data.json, which node Dashboard/collect.mjs writes on your PC."
        onSave={v => onChange({ statsUrl: v })} />
      <div className="lead">Coming later: reading them from your MPTree account instead, the way your phone syncs, so no address is needed.</div>
    </>
  );
}

// ── This TV ──────────────────────────────────────────────────────────────────

function ThisTv({ settings: s, onChange, onSaverNow }: Props) {
  return (
    <>
      <h3>This TV</h3>
      <Field id="name" label="Your name" value={s.name} ok="Type your name" hint="Shown at the top left." onSave={v => onChange({ name: v })} />
      <button className="f swrow" data-f="" data-ok="Show the screensaver now" onClick={onSaverNow}>
        <span>Show the screensaver now<span className="ss">To see what it looks like. Any key ends it.</span></span><span className="val">OK</span>
      </button>
      <button className="f swrow" data-f="" data-ok="Open Android settings" onClick={() => Launcher.openSystemSettings()}>
        <span>Android settings<span className="ss">Wi-Fi, picture, sound, the TV itself</span></span><span className="val">Open</span>
      </button>
      <div className="lead">MPTree TV {__APP_VERSION__}</div>
    </>
  );
}
