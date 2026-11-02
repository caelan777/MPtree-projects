import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { App as CapApp } from "@capacitor/app";
import { Launcher, type TvApp } from "./launcher";
import { DEFAULTS, LAYOUTS, defaultDock, haOn, loadSettings, saveSettings, type LayoutId, type Settings } from "./settings";
import { useHaExtras, useHomeAssistant, type Ha } from "./ha";
import { useOpenWeather } from "./weather";
import { homeOf } from "./home";
import { MPTREE, tvMusic, useTvMedia, type ShuffleAll } from "./music";
import { useMptreeStats } from "./stats";
import { focusEl, focusFirst, focusOne, useOkHint, useRemote } from "./nav";
import { STAGE_H, STAGE_W, nextSunChange, sunIsDown } from "./theme";
import { HA, STATS_URL } from "./homeConfig";
import { clock } from "./format";
import { TopBar, type Page } from "./components/TopBar";
import { HomeView, type Side } from "./components/HomeView";
import { AppsView } from "./components/AppsView";
import { SettingsView } from "./components/SettingsView";
import { Saver } from "./components/Saver";
import { HeatingPanel } from "./components/HeatingPanel";
import { MusicPanel } from "./components/MusicPanel";
import { Intro } from "./components/Intro";

/** The Home row holds this many apps; "All apps" comes after them. */
const DOCK_MAX = 6;
const PLAY_STORE = "com.android.vending";
/** The launcher starting this soon after the TV itself started is the TV turning on. */
const BOOT_WINDOW_MS = 5 * 60_000;

/** The logo intro: waiting to know whether to play it (a black screen), playing, or done. */
type IntroState = "wait" | "play" | "off";

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
  /** Home's two pages: the day (always there) and the house (with Home Assistant). */
  const [side, setSide] = useState<Side>("day");
  const [saver, setSaver] = useState(false);
  const [heatOpen, setHeatOpen] = useState(false);
  const [musicOpen, setMusicOpen] = useState(false);
  // A toast is the message and when it was shown, so the same message twice shows twice.
  const [toastMsg, setToastMsg] = useState<{ text: string; at: number } | null>(null);
  const s = settings ?? DEFAULTS;

  // Home Assistant switched off in Settings: nothing is asked of it at all.
  const useHa = haOn(s);
  const haLive = useHomeAssistant(useHa ? s.haUrl : "", useHa ? s.haToken : "");
  const extrasLive = useHaExtras(s.haUrl, s.haToken, HA.weather, HA.sunsetScript, useHa && haLive.status === "ok");
  // The weather and the sun without Home Assistant (Open-Meteo). Home Assistant's
  // own win wherever it has them; the screens can't tell where they came from.
  const wx = useOpenWeather();
  const ha: Ha = { ...haLive, states: { ...wx.states, ...(useHa ? haLive.states : {}) } };
  const extras = { ...extrasLive, hours: extrasLive.hours.length ? extrasLive.hours : wx.hours };
  const hint = useOkHint();
  const { stats } = useMptreeStats(STATS_URL);

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
  const toast = useCallback((text: string) => setToastMsg({ text, at: Date.now() }), []);
  useEffect(() => {
    if (!toastMsg) return;
    const t = window.setTimeout(() => setToastMsg(null), 2600);
    return () => window.clearTimeout(t);
  }, [toastMsg]);

  // ── apps on the TV ──
  const loadApps = useCallback(
    () => Launcher.listApps().then(r => setApps(r.apps)).catch(() => {}),
    [],
  );
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

  // Shuffle music: MPTree shuffles all its songs in the background and this screen
  // stays. An MPTree from before that could only be opened, shuffling, so that is
  // what happens with one.
  const hasMptree = apps.some(a => a.packageName === MPTREE);
  const mptreeShuffle = useCallback(async () => {
    try {
      await Launcher.shuffleMptree();
      toast("Shuffling all songs in MPTree");
    } catch {
      Launcher.launch({ packageName: MPTREE, action: "shuffle" }).catch(() => toast("MPTree would not open"));
    }
  }, [toast]);

  // ── Home's two pages ──
  const lastDayFocus = useRef<HTMLElement | null>(null);
  const goSide = useCallback((next: Side) => {
    if (next === "house") lastDayFocus.current = document.activeElement as HTMLElement | null;
    setSide(next);
    // Once the other page is reachable (no longer inert): back where you were, or its first thing.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const back = lastDayFocus.current;
      if (next === "day" && back && back.isConnected && !back.closest("[inert]")) focusEl(back);
      else focusFirst(document.querySelectorAll(".hp")[next === "house" ? 1 : 0] ?? document);
    }));
  }, []);

  const getApps = useCallback(() => {
    if (apps.some(a => a.packageName === PLAY_STORE)) Launcher.launch({ packageName: PLAY_STORE });
    else toast("The Play Store is not on this TV");
  }, [apps, toast]);

  // ── the logo intro, when the TV turns on ──
  // Started with the TV (the first minutes after it booted), or the screen coming
  // on again from standby: the Verkuijl logo, and Home only once the apps and Home
  // Assistant have been read. Opening the launcher any other way skips it.
  const [intro, setIntro] = useState<IntroState>("wait");
  const [introReady, setIntroReady] = useState(false);
  /** Goes up by one for every intro, so each one reads the apps and the house afresh. */
  const [introRun, setIntroRun] = useState(0);
  /** This intro is the TV starting (the logo stays longer), not the screen coming back on. */
  const [bootIntro, setBootIntro] = useState(false);
  useEffect(() => {
    Launcher.startInfo()
      .then(r => {
        // Started behind an app (a TV that opens YouTube by itself): no intro, or it
        // would still be standing, half done, when Home is first opened.
        if (r.sinceBootMs < BOOT_WINDOW_MS && !document.hidden) { setBootIntro(true); setIntro("play"); setIntroRun(n => n + 1); }
        else setIntro("off");
      })
      .catch(() => setIntro("off"));
  }, []);
  const loaded = settings !== null;
  const { refresh: haRefresh } = haLive;
  useEffect(() => {
    if (!introRun || !loaded) return;
    let alive = true;
    // Both, whatever each answers: a Home Assistant that is down is "read" too
    // (the house page says so), and the intro gives up waiting after a while.
    Promise.allSettled([loadApps(), useHa ? haRefresh() : Promise.resolve()])
      .then(() => { if (alive) setIntroReady(true); });
    return () => { alive = false; };
  }, [introRun, loaded, useHa, loadApps, haRefresh]);
  const endIntro = useCallback(() => setIntro("off"), []);
  // ── focus: whenever the page changes, start on its first thing ──
  // Also once the intro is over (or skipped): until then Home can't take focus.
  const ready = settings !== null && apps.length > 0 && intro === "off";
  useLayoutEffect(() => {
    if (!ready || saver) return;
    // Inside a page (Apps, Settings) start in the page, not on the top bar.
    const id = requestAnimationFrame(() => focusFirst(document.querySelector(".page") ?? document));
    return () => cancelAnimationFrame(id);
  }, [page, ready, saver]);

  // ── Back and Home buttons ──
  const pageRef = useRef(page);
  useEffect(() => { pageRef.current = page; }, [page]);
  const sideRef = useRef(side);
  useEffect(() => { sideRef.current = side; }, [side]);
  const heatRef = useRef(heatOpen);
  useEffect(() => { heatRef.current = heatOpen; }, [heatOpen]);
  const musicRef = useRef(musicOpen);
  useEffect(() => { musicRef.current = musicOpen; }, [musicOpen]);
  useEffect(() => {
    const back = CapApp.addListener("backButton", () => {
      if (heatRef.current) { setHeatOpen(false); requestAnimationFrame(() => focusOne("[data-heat]")); return; }
      if (musicRef.current) { setMusicOpen(false); requestAnimationFrame(() => focusOne("[data-ok='Open the music controls'], [data-ok^='Shuffle all songs']")); return; }
      if (pageRef.current !== "home") { setPage("home"); setSide("day"); return; }
      if (sideRef.current === "house") { goSide("day"); return; }
      // On Home, Back does nothing else: this is the home screen, there is nothing behind it.
    });
    const home = Launcher.addListener("home", () => {
      setSaver(false);
      setHeatOpen(false);
      setMusicOpen(false);
      setPage("home");
      setSide("day");
      requestAnimationFrame(() => focusFirst());
    });
    return () => { back.then(h => h.remove()); home.then(h => h.remove()); };
  }, [goSide]);

  // ── screensaver: after a while without a key, and any key ends it ──
  const lastKey = useRef(0);
  useEffect(() => { lastKey.current = Date.now(); }, []);
  const onKey = useCallback((e: KeyboardEvent) => {
    lastKey.current = Date.now();
    // During the intro the remote waits: Home is not there yet.
    if (intro !== "off") return true;
    if (saver && e.type === "keydown") { setSaver(false); return true; }
    return false;
  }, [saver, intro]);
  useRemote(onKey);
  useEffect(() => {
    // The TV's own screensaver (Google's photos) needs nothing from us: Android starts it.
    if (!s.saverMinutes || s.saverStyle === "tv") return;
    const t = window.setInterval(() => {
      if (!document.hidden && Date.now() - lastKey.current > s.saverMinutes * 60_000) setSaver(true);
    }, 15_000);
    return () => window.clearInterval(t);
  }, [s.saverMinutes, s.saverStyle]);
  // Coming back into view counts as a key: the time spent away (in an app, or with
  // the TV off) is not time the remote was left alone.
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) lastKey.current = Date.now(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // ── the TV going off and on ──
  // Off: no screensaver left standing, and the screen black, ready for the intro.
  // On, with this screen in front: the intro, then Home's first page, never the
  // screensaver. On with an app in front: nothing here (no intro behind it).
  const screenOff = useRef(false);
  useEffect(() => {
    const off = Launcher.addListener("screenOff", () => {
      screenOff.current = true;
      setSaver(false);
      setIntro(i => (i === "off" ? "wait" : i));
    });
    const on = Launcher.addListener("screenOn", () => {
      screenOff.current = false;
      setBootIntro(false);
      lastKey.current = Date.now();
      setSaver(false);
      setHeatOpen(false);
      setMusicOpen(false);
      if (document.hidden) { setIntro("off"); return; }
      setPage("home");
      setSide("day");
      setIntroReady(false);
      setIntro("play");
      setIntroRun(n => n + 1);
    });
    return () => { off.then(h => h.remove()); on.then(h => h.remove()); };
  }, []);
  // The black sheet Android lays over this screen while the TV is off (else the
  // screen comes on showing Home's last picture) comes away once this screen is in
  // view and has drawn what comes now: the intro, or Home when there is none. Not
  // while still waiting to know which: that is black anyway.
  const [inView, setInView] = useState(!document.hidden);
  useEffect(() => {
    const onVisible = () => {
      setInView(!document.hidden);
      // An app came in front during the intro (not the screen going off): the intro
      // is over, so Home is there, not the logo half way, when Home is next opened.
      if (document.hidden && !screenOff.current) setIntro(i => (i === "play" ? "off" : i));
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  useEffect(() => {
    if (!inView || intro === "wait") return;
    let b = 0;
    const a = requestAnimationFrame(() => { b = requestAnimationFrame(() => { Launcher.uncover().catch(() => {}); }); });
    return () => { cancelAnimationFrame(a); cancelAnimationFrame(b); };
  }, [inView, intro, introRun]);

  // Leaving Home and coming back starts on its first page again.
  const goPage = useCallback((p: Page) => { setPage(p); setSide("day"); }, []);

  // ── dark mode: automatic with the sun, or fixed in Settings ──
  const override = s.themeOverride && s.themeOverride.until > now.getTime() ? s.themeOverride : null;
  const dark = s.theme === "dark" ? true : s.theme === "light" ? false : override ? override.dark : sunIsDown(ha.states, now, HA);

  // ── which layout: chosen, or one a day ──
  const dayNumber = Math.floor((now.getTime() - now.getTimezoneOffset() * 60000) / 86_400_000);
  const layout: LayoutId = s.layoutDaily ? LAYOUTS[dayNumber % LAYOUTS.length].id : s.layout;
  const houseOn = useHa;
  // Cinema is always dark, so on it there is no Dark/Light button; the rest follow dark mode.
  const onCinema = page === "home" && layout === "cinema" && (side === "day" || !houseOn);
  const darkLook = dark || onCinema;
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
  useEffect(() => { document.body.style.background = darkLook || intro !== "off" ? "#000" : "#fff"; }, [darkLook, intro]);

  // The screensaver button: the chosen one now. The TV's own is started by Android;
  // where a TV refuses that, MPTree's shows instead.
  const startSaver = () => {
    if (s.saverStyle !== "tv") { setSaver(true); return; }
    Launcher.startScreensaver().catch(() => setSaver(true));
  };

  const closeMusic = useCallback(() => {
    setMusicOpen(false);
    requestAnimationFrame(() => focusOne("[data-ok='Open the music controls'], [data-ok^='Shuffle all songs']"));
  }, []);

  const closeHeat = useCallback(() => {
    setHeatOpen(false);
    requestAnimationFrame(() => focusOne("[data-heat]"));
  }, []);

  // ── the house, the music ──
  const home = homeOf(ha, extras, now, toast, !useHa);
  const tv = useTvMedia((page === "home" || page === "settings") && !saver && intro === "off");
  const music = tvMusic(tv.np, tv.control);
  // Shuffle all songs: only ever MPTree on this TV.
  const shuffle: ShuffleAll = hasMptree ? { where: "MPTree, on this TV", run: mptreeShuffle } : null;

  return (
    <div className={"stage" + (darkLook ? " dark" : "") + (page === "home" && (side === "day" || !houseOn) ? " on-" + layout : "")} style={{ transform: `scale(${scale})` }}>
      <div inert={heatOpen || musicOpen || intro !== "off" || undefined}>
      <TopBar name={s.name} page={page} onPage={goPage} dark={dark} darkOk={darkOk} onToggleDark={onCinema ? null : toggleDark} onSaver={startSaver}
        onAndroidSettings={() => Launcher.openSystemSettings().catch(() => toast("The TV's settings would not open"))} hint={saver || heatOpen || musicOpen ? null : hint} />
      {page === "home" && (
        <HomeView
          layout={layout} now={now} name={s.name} home={home} music={music} shuffle={shuffle} stats={stats} dock={dockApps}
          onOpenApp={openApp} onAllApps={() => goPage("apps")} onOpenMusic={() => setMusicOpen(true)}
          houseOn={houseOn} side={side} onSide={goSide} ha={ha}
          onOpenHeating={() => setHeatOpen(true)} onSettings={() => goPage("settings")}
        />
      )}
      {page === "apps" && <AppsView apps={apps} dock={dock} onOpenApp={openApp} onTogglePin={togglePin} onGetApps={getApps} />}
      {page === "settings" && settings && (
        <SettingsView
          settings={settings} onChange={change} ha={haLive} toast={toast} onSaverNow={() => setSaver(true)}
          apps={apps} dock={dockApps.map(a => a.packageName)} dockMax={DOCK_MAX} onSetDock={setDock} now={now} tvMediaAllowed={tv.allowed}
        />
      )}
      </div>
      {heatOpen && <HeatingPanel ha={haLive} toast={toast} onClose={closeHeat} />}
      {musicOpen && <MusicPanel music={music} shuffle={shuffle} onClose={closeMusic} />}
      {toastMsg && intro === "off" && <div className="toast" role="status">{toastMsg.text}</div>}
      {saver && intro === "off" && <Saver now={now} ha={ha} stats={stats} photos={s.saverStyle === "photos"} />}
      {intro !== "off" && <Intro key={introRun} playing={intro === "play"} ready={introReady} boot={bootIntro} onDone={endIntro} />}
    </div>
  );
}
