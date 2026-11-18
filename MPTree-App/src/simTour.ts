// Only in the simulator run on GitHub (VITE_SIM_TOUR=1): the app taps through
// its own screens so the screenshots show more than the welcome page. Never in
// a build that ships; the import in main.tsx is dropped when the flag is off.
const find = (text: string, exact = true): HTMLElement | null => {
  const all = [...document.querySelectorAll<HTMLElement>("button, [role=button], [aria-label], div, span")];
  return all.find(e => {
    const l = e.getAttribute("aria-label") ?? "";
    const t = (e.textContent ?? "").trim();
    return exact ? (l === text || (t === text && e.children.length <= 2)) : (t.includes(text) && e.children.length === 0);
  }) ?? null;
};
const tap = (...texts: string[]) => {
  for (const t of texts) {
    const e = find(t) ?? find(t, false);
    if (e) { e.click(); console.log("[tour] tapped", t); return; }
  }
  console.log("[tour] not found", texts.join(" / "));
};
// Seconds after start. The screenshots are taken in between (ios.yml).
const STEPS: [number, string[]][] = [
  [15, ["Next"]],
  [22, ["Enter MPTree", "Skip"]],
  [29, ["Thanks", "Skip", "Got it"]],
  [36, ["Test Song One"]],
  [46, ["Expand player"]],
  [56, ["Close", "Collapse player", "Close player"]],
];
export function startTour() {
  console.log("[tour] on");
  for (const [s, texts] of STEPS) setTimeout(() => tap(...texts), s * 1000);
}
