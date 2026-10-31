import { useEffect } from "react";

// Moving around with the remote. Anything marked `data-f` can take focus; the
// arrow keys move focus to the nearest such element in that direction, by where
// things actually are on screen, so layouts never need a hand-made focus map.
//
// Two extras, both driven by holding a key:
//   data-hold  Holding left or right fires a "tvhold" event instead of moving
//              (the heating tile changes its temperature this way). A short
//              press still moves focus.
//   data-long  Holding OK fires "tvlong" (the Apps page pins an app this way).
//              A short press still clicks.

export type Dir = "left" | "right" | "up" | "down";

const ARROWS: Record<string, Dir> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };

/** Android TV sends the remote's OK as Enter; some remotes send DPAD_CENTER (23). */
export function isOk(e: KeyboardEvent): boolean {
  return e.key === "Enter" || e.keyCode === 23 || e.key === "Select";
}

function focusables(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>("[data-f]")].filter(el => {
    if (el.closest("[inert]") || el.closest("[aria-hidden='true']")) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

export function focusEl(el: HTMLElement | null | undefined): void {
  if (!el) return;
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: "nearest", inline: "nearest" });
}

/** Focus the element marked `data-default` in a container, else its first focusable. */
export function focusFirst(root: ParentNode = document): void {
  const el = root.querySelector<HTMLElement>("[data-default]") ?? root.querySelector<HTMLElement>("[data-f]");
  focusEl(el);
}

export function move(dir: Dir): void {
  const cur = document.activeElement as HTMLElement | null;
  const all = focusables();
  if (!cur || !all.includes(cur)) { focusFirst(); return; }
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
    // Sideways, stay on the same row if at all possible. Up and down may drift
    // sideways more: going up from the app row should reach the tiles, not the top bar.
    const score = Math.max(0, primary) + orth * (dir === "left" || dir === "right" ? 2.5 : 1);
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (best) focusEl(best);
}

/**
 * Wires the remote to the page. `onKey` sees every key first and can return
 * true to say it handled it (the screensaver uses this to swallow the key that
 * wakes it).
 */
export function useRemote(onKey?: (e: KeyboardEvent) => boolean): void {
  useEffect(() => {
    let pendingDir: Dir | null = null;
    let held = false;
    let okDown = false;
    let okRepeats = 0;
    let longFired = false;

    const down = (e: KeyboardEvent) => {
      if (onKey?.(e)) { e.preventDefault(); return; }
      const cur = document.activeElement as HTMLElement | null;
      const dir = ARROWS[e.key];
      const typing = cur instanceof HTMLInputElement;

      if (dir) {
        if (typing && (dir === "left" || dir === "right")) return;
        e.preventDefault();
        if (cur?.hasAttribute("data-hold") && (dir === "left" || dir === "right")) {
          if (!e.repeat) { pendingDir = dir; held = false; return; }
          held = true;
          cur.dispatchEvent(new CustomEvent("tvhold", { detail: dir }));
          return;
        }
        move(dir);
        return;
      }

      if (isOk(e) && cur?.hasAttribute("data-long")) {
        e.preventDefault();
        if (!e.repeat) { okDown = true; okRepeats = 0; longFired = false; return; }
        if (++okRepeats >= 3 && !longFired) {
          longFired = true;
          cur.dispatchEvent(new CustomEvent("tvlong"));
        }
      }
    };

    const up = (e: KeyboardEvent) => {
      const cur = document.activeElement as HTMLElement | null;
      if (pendingDir && ARROWS[e.key] === pendingDir) {
        if (!held) move(pendingDir);
        pendingDir = null;
        held = false;
      }
      if (okDown && isOk(e)) {
        okDown = false;
        if (!longFired) cur?.click();
      }
    };

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [onKey]);
}
