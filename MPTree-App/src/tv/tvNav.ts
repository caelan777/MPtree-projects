import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";

// ─── THE REMOTE ──────────────────────────────────────────────────────────────
//
// MPTree on a TV has no touch screen: the arrows move a highlight, OK presses.
// Copied in spirit from the TV launcher (TV/src/nav.ts), not shared with it:
// see "Keep it simple" in the workspace CLAUDE.md.
//
// Anything that can be pressed can take the highlight: buttons, text fields,
// and whatever has tabIndex 0. The arrows go to whatever is nearest in that
// direction, by where things are on screen, so no screen needs a hand-made map.
// Only what is actually on top counts: when a sheet is open, the screen under
// it is out of reach, without the sheet having to say so. What a sheet has
// further down, scrolled out of sight, counts too: moving to it scrolls it in
// (Settings could not be scrolled down with the remote before).

/** A TV: Android with no touch screen. `?tv` in the address forces it, to work
 *  on the TV screen in a browser. */
export function isTvDevice(): boolean {
  if (typeof window === "undefined") return false;
  if (new URLSearchParams(window.location.search).has("tv")) return true;
  return Capacitor.getPlatform() === "android" && (navigator.maxTouchPoints === 0 || window.matchMedia("(pointer: none)").matches);
}

export type Dir = "left" | "right" | "up" | "down";
const ARROWS: Record<string, Dir> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };

const SELECTOR = "button:not([disabled]), input:not([disabled]), textarea, select, [tabindex='0'], [role='button']";

/** On top: the middle of it is not covered by something else (a sheet, a veil). */
function onTop(el: HTMLElement, r: DOMRect): boolean {
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
  const hit = document.elementFromPoint(x, y);
  return !!hit && (hit === el || el.contains(hit) || hit.contains(el));
}

/** The nearest box around `el` that scrolls up and down, if any. */
function scroller(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight + 1) return p;
  }
  return null;
}

/** Scrolled out of sight inside a box that is itself on top: reachable. */
function scrolledAway(el: HTMLElement, r: DOMRect): boolean {
  const box = scroller(el);
  if (!box) return false;
  const b = box.getBoundingClientRect();
  const outside = r.bottom <= b.top + 2 || r.top >= b.bottom - 2;
  return outside && onTop(box, b);
}

function focusables(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(SELECTOR)].filter(el => {
    if (el.closest("[inert], [aria-hidden='true']")) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && (onTop(el, r) || scrolledAway(el, r));
  });
}

export function focusEl(el: HTMLElement | null | undefined): void {
  if (!el) return;
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: "nearest", inline: "nearest" });
}

/** The element marked data-tv-default inside `root`, else its first focusable. */
export function focusFirst(root: ParentNode = document): void {
  const el = root.querySelector<HTMLElement>("[data-tv-default]") ?? root.querySelector<HTMLElement>(SELECTOR);
  focusEl(el);
}

export function move(dir: Dir): void {
  const cur = document.activeElement as HTMLElement | null;
  // data-tv-stop="down": nothing that way (the player's buttons don't fall into the list).
  if (cur?.dataset.tvStop?.split(" ").includes(dir)) return;
  const all = focusables();
  if (!cur || cur === document.body || !all.includes(cur)) {
    // Nothing highlighted yet, or it went away: start on what is on top.
    const first = all.find(el => el.hasAttribute("data-tv-default")) ?? all[0];
    focusEl(first);
    return;
  }
  const a = cur.getBoundingClientRect();
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of all) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect();
    let primary: number, orth: number;
    if (dir === "left" || dir === "right") {
      primary = dir === "right" ? b.left - a.right : a.left - b.right;
      orth = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom));
    } else {
      primary = dir === "down" ? b.top - a.bottom : a.top - b.bottom;
      orth = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right));
    }
    if (primary < -8) continue;
    const score = Math.max(0, primary) + orth * (dir === "left" || dir === "right" ? 2.5 : 0.4);
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (best) {
    // Coming into a group (the player, the list) from outside lands on its
    // entry: the play button, the song that is playing.
    const group = best.closest<HTMLElement>("[data-tv-group]");
    if (group && !group.contains(cur)) {
      const entry = group.querySelector<HTMLElement>("[data-tv-entry]");
      if (entry && all.includes(entry)) best = entry;
    }
    focusEl(best);
  }
}

/** The arrows move the highlight, OK presses. Lists handle Up and Down
 *  themselves (they stop the key before it gets here). */
export function useTvRemote(on: boolean): void {
  useEffect(() => {
    if (!on) return;
    const down = (e: KeyboardEvent) => {
      const dir = ARROWS[e.key];
      if (dir) { e.preventDefault(); move(dir); return; }
      const cur = document.activeElement as HTMLElement | null;
      const ok = e.key === "Enter" || e.keyCode === 23 || e.key === "Select";
      // OK with nothing highlighted (a new screen just came up): highlight its first button.
      if (ok && (!cur || cur === document.body)) { e.preventDefault(); move("down"); return; }
      // Buttons press themselves on Enter; anything else that took the highlight is clicked.
      if (ok && cur && cur !== document.body && !(cur instanceof HTMLButtonElement) && !(cur instanceof HTMLInputElement) && !(cur instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        cur.click();
      }
    };
    window.addEventListener("keydown", down);
    document.documentElement.classList.add("tv-mode");
    return () => { window.removeEventListener("keydown", down); document.documentElement.classList.remove("tv-mode"); };
  }, [on]);
}
