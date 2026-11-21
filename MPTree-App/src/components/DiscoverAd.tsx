import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Ads } from "../plugins";
import { NATIVE_UNIT, usePro } from "../pro";
import type { T } from "../themes";

// ─── THE AD ON DISCOVER ──────────────────────────────────────────────────────
// One native ad under Popular this week, for people without Pro. The page
// leaves a gap for it; Android draws the ad itself (AdsPlugin.loadNative) and
// it follows the gap as the page scrolls. It hides whenever anything of the
// app comes over the gap (a sheet, the song card, the header card) because a
// native view always sits above the page.

const HEIGHT = 312;

const hex = (c: string, fallback: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : fallback);

export function DiscoverAd({ active, topInset, bottomInset, T }: {
  /** Discover is the page on show, with no list or card over its home. */
  active: boolean;
  /** Where the header card ends and where the player starts, from the top and bottom. */
  topInset: number;
  bottomInset: number;
  T: T;
}) {
  const pro = usePro();
  const can = !pro && NATIVE_UNIT !== "" && Capacitor.getPlatform() === "android";
  const [loaded, setLoaded] = useState(false);
  const gap = useRef<HTMLDivElement | null>(null);
  const insets = useRef({ topInset, bottomInset });
  useEffect(() => { insets.current = { topInset, bottomInset }; }, [topInset, bottomInset]);

  // Asked for once Discover is first shown, and again after Pro is lost.
  useEffect(() => {
    if (!can || !active || loaded) return;
    let gone = false;
    Ads.loadNative({
      adUnitId: NATIVE_UNIT,
      colours: {
        text: hex(T.text, "#ffffff"), muted: hex(T.muted, "#9a9a9a"), card: hex(T.card, "#141414"),
        border: hex(T.border, "#2a2a2a"), accent: hex(T.accent, "#ffffff"), onAccent: hex(T.playBtnFg, "#000000"),
      },
    }).then(r => { if (!gone) setLoaded(r.loaded); }).catch(() => {});
    return () => { gone = true; };
  }, [can, active, loaded, T]);

  // Pro bought: the ad goes for good.
  useEffect(() => {
    if (pro && loaded) Ads.destroyNative().catch(() => {}).then(() => setLoaded(false));
  }, [pro, loaded]);

  // Follows the gap every frame while the page is up, telling Android only
  // when something moved.
  useEffect(() => {
    if (!loaded) return;
    if (!active) { Ads.placeNative({ visible: false }).catch(() => {}); return; }
    let raf = 0, last = "";
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const el = gap.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const top = insets.current.topInset, bottom = window.innerHeight - insets.current.bottomInset;
      const from = Math.max(r.top, top), to = Math.min(r.bottom, bottom);
      let visible = to - from > 4 && !document.hidden;
      // Anything of the app's over the gap (a sheet, a menu) hides the ad.
      if (visible) {
        for (const f of [0.08, 0.5, 0.92]) {
          const hit = document.elementFromPoint(r.left + r.width / 2, from + (to - from) * f);
          if (!hit || !el.contains(hit)) { visible = false; break; }
        }
      }
      const key = visible ? `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(top)},${Math.round(bottom)}` : "hidden";
      if (key === last) return;
      last = key;
      Ads.placeNative(visible
        ? { visible: true, x: r.left, y: r.top, w: r.width, h: r.height, clipTop: top, clipBottom: bottom }
        : { visible: false }).catch(() => {});
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); Ads.placeNative({ visible: false }).catch(() => {}); };
  }, [loaded, active]);

  if (!loaded) return null;
  return <div ref={gap} aria-hidden="true" style={{ height: HEIGHT, margin: "18px 16px 0" }} />;
}
