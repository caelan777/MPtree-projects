import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { App as CapApp } from "@capacitor/app";
import { Launcher, type TvApp } from "./launcher";
import { DEFAULTS, defaultDock, loadSettings, saveSettings, type Settings } from "./settings";
import { useHomeAssistant } from "./ha";
import { useMptreeStats } from "./stats";
import { focusFirst, useRemote } from "./nav";
import { STAGE_H, STAGE_W } from "./theme";
import { TopBar, type Page } from "./components/TopBar";
import { HomeView } from "./components/HomeView";
import { AppsView } from "./components/AppsView";
import { SettingsView } from "./components/SettingsView";
import { Saver } from "./components/Saver";

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
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const s = settings ?? DEFAULTS;

  const ha = useHomeAssistant(s.haUrl, s.haToken);
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
  useEffect(() => {
    const back = CapApp.addListener("backButton", () => {
      if (pageRef.current !== "home") setPage("home");
      // On Home, Back does nothing: this is the home screen, there is nothing behind it.
    });
    const home = Launcher.addListener("home", () => {
      setSaver(false);
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
    if (!s.saverMinutes) return;
    const t = window.setInterval(() => {
      if (!document.hidden && Date.now() - lastKey.current > s.saverMinutes * 60_000) setSaver(true);
    }, 15_000);
    return () => window.clearInterval(t);
  }, [s.saverMinutes]);

  const goPage = useCallback((p: Page) => setPage(p), []);

  return (
    <div className="stage" style={{ transform: `scale(${scale})` }}>
      <TopBar name={s.name} page={page} onPage={goPage} onSaver={() => setSaver(true)} />
      {page === "home" && (
        <HomeView
          now={now} ha={ha} stats={stats} statsError={statsError} dock={dockApps}
          onOpenApp={openApp} onAddApp={() => setPage("apps")} onSettings={() => setPage("settings")} toast={toast}
        />
      )}
      {page === "apps" && <AppsView apps={apps} dock={dock} onOpenApp={openApp} onTogglePin={togglePin} onGetApps={getApps} />}
      {page === "settings" && settings && (
        <SettingsView settings={settings} onChange={change} ha={ha} statsError={statsError} hasStats={!!stats} />
      )}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
      {saver && <Saver now={now} ha={ha} stats={stats} />}
    </div>
  );
}
