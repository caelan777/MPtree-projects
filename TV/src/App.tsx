import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { App as CapApp } from "@capacitor/app";
import { Launcher, type TvApp } from "./launcher";
import { DEFAULTS, LAYOUTS, defaultDock, haOn, loadSettings, saveSettings, type LayoutId, type Settings } from "./settings";
import { useHaExtras, useHomeAssistant } from "./ha";
import { useMptreeStats } from "./stats";
import { focusEl, focusFirst, useOkHint, useRemote } from "./nav";
import { STAGE_H, STAGE_W, nextSunChange, sunIsDown } from "./theme";
import { HA } from "./homeConfig";
import { clock } from "./format";
import { TopBar, type Page } from "./components/TopBar";
import { HomeView } from "./components/HomeView";
import { AppsView } from "./components/AppsView";
import { SettingsView } from "./components/SettingsView";
import { Saver } from "./components/Saver";
import { HeatingPanel } from "./components/HeatingPanel";
import { MusicPanel } from "./components/MusicPanel";

/** The Home row holds this many apps, plus the "Add app" tile when there is room. */
const DOCK_MAX = 6;
const PLAY_STORE = "com.android.vending";

/** Scale the 1920×1080 stage to whatever size the TV's WebView reports. */
function useStageScale(): number {
  const calc = () => Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
  const [scale, setScale] = useState(calc);
  useEffect(() => {
    const on = () => setScale(calc());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return scale;
}

function useNow(ms: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

export default function App() {
  const scale = useStageScale();
  const now = useNow(5000);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [apps, setApps] = useState<TvApp[]>([]);
  const [page, setPage] = useState<Page>("home");
  const [saver, setSaver] = useState(false);
  const [heatOpen, setHeatOpen] = useState(false);
  const [musicOpen, setMusicOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const s = settings ?? DEFAULTS;

  // Home Assistant switched off in Settings: nothing is asked of it at all.
  const useHa = haOn(s);
  const ha = useHomeAssistant(useHa ? s.haUrl : "", useHa ? s.haToken : "");
  const extras = useHaExtras(s.haUrl, s.haToken, HA.weather, HA.sunsetScript, useHa && ha.status === "ok");
  const hint = useOkHint();
  const { stats, error: statsError } = useMptreeStats(s.statsUrl);

  // ── settings ──
  useEffect(() => { loadSettings().then(setSettings); }, []);
  const change = useCallback((patch: Partial<Settings>) => {
    setSettings(prev => {
      const next = { ...(prev ?? DEFAULTS), ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  // ── toast ──
  const toastTimer = useRef<number | undefined>(undefined);
  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 2600);
  }, []);

  // ── apps on the TV ──
  const loadApps = useCallback(() => {
    Launcher.listApps().then(r => setApps(r.apps)).catch(() => {});
  }, []);
  useEffect(() => {
    loadApps();
    const sub = Launcher.addListener("appsChanged", loadApps);
    return () => { sub.then(h => h.remove()); };
  }, [loadApps]);

  // Until the row is changed by hand, it holds the apps asked for, found by name.
  const dock = s.dockChosen ? s.dock : defaultDock(apps);
  const dockApps = dock.map(p => apps.find(a => a.packageName === p)).filter((a): a is TvApp => !!a);

  const openApp = useCallback((a: TvApp) => {
    Launcher.launch({ packageName: a.packageName }).catch(() => toast(`${a.label} would not open`));
  }, [toast]);

  const togglePin = useCallback((a: TvApp) => {
    if (dock.includes(a.packageName)) {
      change({ dock: dock.filter(p => p !== a.packageName), dockChosen: true });
      toast(`${a.label} taken off Home`);
    } else if (dockApps.length >= DOCK_MAX) {
      toast(`Home holds ${DOCK_MAX} apps. Take one off first.`);
    } else {
      change({ dock: [...dock, a.packageName], dockChosen: true });
      toast(`${a.label} is on Home`);
    }
  }, [dock, dockApps.length, change, toast]);

  /** Apps on Home, from Settings: move one place left or right, take off, or add at the end. */
  const setDock = useCallback((next: string[]) => change({ dock: next, dockChosen: true }), [change]);

  // MPTree on this TV: Shuffle music opens it, shuffling all songs (it reads "shuffle").
  const MPTREE = "com.caelan.mptree";
  const hasMptree = apps.some(a => a.packageName === MPTREE);
  const mptreeShuffle = useCallback(() => {
    Launcher.launch({ packageName: MPTREE, action: "shuffle" }).catch(() => toast("MPTree would not open"));
  }, [toast]);

  const getApps = useCallback(() => {
    if (apps.some(a => a.packageName === PLAY_STORE)) Launcher.launch({ packageName: PLAY_STORE });
    else toast("The Play Store is not on this TV");
  }, [apps, toast]);

  // ── focus: whenever the page changes, start on its first thing ──
  const ready = settings !== null && apps.length > 0;
  useLayoutEffect(() => {
    if (!ready || saver) return;
    // Inside a page (Apps, Settings) start in the page, not on the top bar.
    const id = requestAnimationFrame(() => focusFirst(document.querySelector(".page") ?? document));
    return () => cancelAnimationFrame(id);
  }, [page, ready, saver]);

  // ── Back and Home buttons ──
  const pageRef = useRef(page);
  useEffect(() => { pageRef.current = page; }, [page]);
  const heatRef = useRef(heatOpen);
  useEffect(() => { heatRef.current = heatOpen; }, [heatOpen]);
  const musicRef = useRef(musicOpen);
  useEffect(() => { musicRef.current = musicOpen; }, [musicOpen]);
  useEffect(() => {
    const back = CapApp.addListener("backButton", () => {
      if (heatRef.current) { setHeatOpen(false); requestAnimationFrame(() => focusFirst()); return; }
      if (musicRef.current) { setMusicOpen(false); requestAnimationFrame(() => focusFirst()); return; }
      if (pageRef.current !== "home") setPage("home");
      // On Home, Back does nothing: this is the home screen, there is nothing behind it.
    });
    const home = Launcher.addListener("home", () => {
      setSaver(false);
      setHeatOpen(false);
      setMusicOpen(false);
      setPage("home");
      requestAnimationFrame(() => focusFirst());
    });
    return () => { back.then(h => h.remove()); home.then(h => h.remove()); };
  }, []);

  // ── screensaver: after a while without a key, and any key ends it ──
  const lastKey = useRef(0);
  useEffect(() => { lastKey.current = Date.now(); }, []);
  const onKey = useCallback((e: KeyboardEvent) => {
    lastKey.current = Date.now();
    if (saver && e.type === "keydown") { setSaver(false); return true; }
    return false;
  }, [saver]);
  useRemote(onKey);
  useEffect(() => {
    // The TV's own screensaver (Google's photos) needs nothing from us: Android starts it.
    if (!s.saverMinutes || s.saverStyle === "tv") return;
    const t = window.setInterval(() => {
      if (!document.hidden && Date.now() - lastKey.current > s.saverMinutes * 60_000) setSaver(true);
    }, 15_000);
    return () => window.clearInterval(t);
  }, [s.saverMinutes, s.saverStyle]);

  const goPage = useCallback((p: Page) => setPage(p), []);

  // ── dark mode: automatic with the sun, or fixed in Settings ──
  const override = s.themeOverride && s.themeOverride.until > now.getTime() ? s.themeOverride : null;
  const dark = s.theme === "dark" ? true : s.theme === "light" ? false : override ? override.dark : sunIsDown(ha.states, now, HA);

  // ── which layout: chosen, one a day, or Cinema after dark ──
  const dayNumber = Math.floor((now.getTime() - now.getTimezoneOffset() * 60000) / 86_400_000);
  const layout: LayoutId = s.cinemaAfterDark && dark ? "cinema"
    : s.layoutDaily ? LAYOUTS[dayNumber % LAYOUTS.length].id
    : s.layout;
  // Cinema is always dark; the rest follow dark mode.
  const darkLook = dark || (page === "home" && layout === "cinema");
  const darkOk = s.theme !== "auto"
    ? (dark ? "Always light" : "Always dark")
    : `${dark ? "Light" : "Dark"} until ${sunIsDown(ha.states, now, HA) ? "sunrise" : "sunset"}, then automatic`;
  const toggleDark = () => {
    if (s.theme !== "auto") {
      change({ theme: dark ? "light" : "dark" });
      toast(dark ? "Always light" : "Always dark");
      return;
    }
    // In auto the switch holds until the sun next rises or sets, then auto takes over again.
    const until = nextSunChange(ha.states, new Date(), HA);
    change({ themeOverride: { dark: !dark, until } });
    toast(`${dark ? "Light" : "Dark"} until ${clock(new Date(until))}, then automatic again`);
  };
  useEffect(() => { document.body.style.background = darkLook ? "#000" : "#fff"; }, [darkLook]);

  // The screensaver button: the chosen one now. The TV's own is started by Android;
  // where a TV refuses that, MPTree's shows instead.
  const startSaver = () => {
    if (s.saverStyle !== "tv") { setSaver(true); return; }
    Launcher.startScreensaver().catch(() => setSaver(true));
  };

  const closeMusic = useCallback(() => {
    setMusicOpen(false);
    requestAnimationFrame(() => focusEl(document.querySelector<HTMLElement>(".np-main, [data-ok='Open the music controls']")));
  }, []);

  const closeHeat = useCallback(() => {
    setHeatOpen(false);
    requestAnimationFrame(() => focusEl(document.querySelector<HTMLElement>("[data-heat]")));
  }, []);

  return (
    <div className={"stage" + (darkLook ? " dark" : "")} style={{ transform: `scale(${scale})` }}>
      <div inert={heatOpen || musicOpen || undefined}>
      <TopBar name={s.name} page={page} onPage={goPage} dark={dark} darkOk={darkOk} onToggleDark={toggleDark} onSaver={startSaver}
        onAndroidSettings={() => Launcher.openSystemSettings().catch(() => toast("The TV's settings would not open"))} hint={saver || heatOpen || musicOpen ? null : hint} />
      {page === "home" && (
        <HomeView
          layout={layout} now={now} ha={ha} stats={stats} statsError={statsError} dock={dockApps}
          onOpenApp={openApp} onAddApp={() => setPage("apps")} onSettings={() => setPage("settings")}
          onOpenHeating={() => setHeatOpen(true)} onOpenMusic={() => setMusicOpen(true)} toast={toast} extras={extras} haUrl={s.haUrl}
          haOff={!useHa} mptreeShuffle={hasMptree ? mptreeShuffle : null}
        />
      )}
      {page === "apps" && <AppsView apps={apps} dock={dock} onOpenApp={openApp} onTogglePin={togglePin} onGetApps={getApps} />}
      {page === "settings" && settings && (
        <SettingsView
          settings={settings} onChange={change} ha={ha} stats={stats} statsError={statsError} toast={toast} onSaverNow={() => setSaver(true)}
          apps={apps} dock={dockApps.map(a => a.packageName)} dockMax={DOCK_MAX} onSetDock={setDock} now={now}
        />
      )}
      </div>
      {heatOpen && <HeatingPanel ha={ha} toast={toast} onClose={closeHeat} />}
      {musicOpen && <MusicPanel ha={ha} extras={extras} haUrl={s.haUrl} toast={toast} onClose={closeMusic} />}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
      {saver && <Saver now={now} ha={ha} stats={stats} photos={s.saverStyle === "photos"} />}
    </div>
  );
}
