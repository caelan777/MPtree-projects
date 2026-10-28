import { useState, useRef, useEffect } from "react";
import type React from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PageSwipeDeps {
  page:        "songs" | "playlists";
  setPage:     (page: "songs" | "playlists") => void;
  activeMenu:  string | null;
  selectMode:  boolean;
  filterOpen:  boolean;
  /** Blocks the page swipe entirely (e.g. a playlist detail view is open, where
   *  a horizontal swipe should NOT jump all the way back to the Songs page). */
  swipeDisabled?: boolean;
  /** The element both pages sit in. A page swipe stops the lists in it from
   *  scrolling (see the touchmove listener below). */
  areaRef:     React.RefObject<HTMLDivElement | null>;
}

export interface PageSwipeReturn {
  pageDragX:          number;
  pageDragging:       boolean;
  panelTransform:     string;
  panelTransition:    string;
  pageSwipeLocked:    React.MutableRefObject<"horizontal" | "vertical" | null>;
  onPageTouchStart:   (e: React.TouchEvent) => void;
  onPageTouchMove:    (e: React.TouchEvent) => void;
  onPageTouchEnd:     () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

const PAGE_SWIPE_THRESHOLD = 55;  // px — reduced from 90 for easier committed drags
const PAGE_SWIPE_VELOCITY  = 0.3; // px/ms — flick speed that triggers a page change
const PAGE_SWIPE_MIN_DIST  = 20;  // px — minimum travel required even on a fast flick

export function usePageSwipe({
  page,
  setPage,
  activeMenu,
  selectMode,
  filterOpen,
  swipeDisabled = false,
  areaRef,
}: PageSwipeDeps): PageSwipeReturn {
  const [pageDragX,    setPageDragX]    = useState(0);
  const [pageDragging, setPageDragging] = useState(false);

  const pageSwipeStartX   = useRef<number | null>(null);
  const pageSwipeStartY   = useRef<number | null>(null);
  const pageSwipeLocked   = useRef<"horizontal" | "vertical" | null>(null);
  const pageSwipeLastX    = useRef<number>(0);
  const pageSwipeLastTime = useRef<number>(0);
  const pageSwipeVelocity = useRef<number>(0); // px/ms, signed
  const pageRef           = useRef(page);
  useEffect(() => { pageRef.current = page; }, [page]);

  // ── A page swipe is not also a scroll ──────────────────────────────────────
  // The lists only allow vertical panning (touch-action: pan-y), but a swipe to
  // the other page is never perfectly level, so the list under the finger
  // scrolled a little along with it and kept gliding after the finger let go.
  // The next tap, on the page just arrived at, then only stopped that glide:
  // Android does not count a tap that stops a fling as a tap, so the first
  // press on the Playlists tab did nothing and only the second one worked.
  //
  // Once a swipe is decided to be sideways, its moves are cancelled here, so
  // the list never starts to scroll. React's own touch listeners are passive
  // and cannot cancel anything; this one is not. It runs before React's handler
  // for the same move, so it makes the sideways-or-not call itself, by the same
  // rule as onPageTouchMove, which then finds it already made.
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const onMove = (e: TouchEvent) => {
      const sx = pageSwipeStartX.current, sy = pageSwipeStartY.current;
      if (sx === null || sy === null || !e.cancelable) return;
      const dx = e.touches[0].clientX - sx;
      const dy = e.touches[0].clientY - sy;
      if (pageSwipeLocked.current === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        pageSwipeLocked.current = Math.abs(dx) > Math.abs(dy) * 1.3 ? "horizontal" : "vertical";
      }
      if (pageSwipeLocked.current !== "horizontal") return;
      const towardOther = pageRef.current === "songs" ? dx < 0 : dx > 0;
      if (towardOther) e.preventDefault();
    };
    el.addEventListener("touchmove", onMove, { passive: false });
    return () => el.removeEventListener("touchmove", onMove);
  }, [areaRef]);

  const onPageTouchStart = (e: React.TouchEvent) => {
    if (activeMenu || selectMode || filterOpen || swipeDisabled) return;
    const x = e.touches[0].clientX;
    pageSwipeStartX.current   = x;
    pageSwipeStartY.current   = e.touches[0].clientY;
    pageSwipeLocked.current   = null;
    pageSwipeLastX.current    = x;
    pageSwipeLastTime.current = e.timeStamp;
    pageSwipeVelocity.current = 0;
  };

  const onPageTouchMove = (e: React.TouchEvent) => {
    if (pageSwipeStartX.current === null || pageSwipeStartY.current === null) return;
    const dx = e.touches[0].clientX - pageSwipeStartX.current;
    const dy = e.touches[0].clientY - pageSwipeStartY.current;

    if (pageSwipeLocked.current === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      pageSwipeLocked.current = Math.abs(dx) > Math.abs(dy) * 1.3 ? "horizontal" : "vertical";
    }
    if (pageSwipeLocked.current !== "horizontal") return;

    // Rolling velocity estimate over the last move segment
    const dt = e.timeStamp - pageSwipeLastTime.current;
    if (dt > 0) {
      const segVelocity = (e.touches[0].clientX - pageSwipeLastX.current) / dt;
      // Exponential smoothing keeps it stable without being laggy
      pageSwipeVelocity.current = pageSwipeVelocity.current * 0.6 + segVelocity * 0.4;
    }
    pageSwipeLastX.current    = e.touches[0].clientX;
    pageSwipeLastTime.current = e.timeStamp;

    if (page === "songs" && dx < 0) {
      setPageDragging(true);
      setPageDragX(Math.max(dx, -window.innerWidth));
    } else if (page === "playlists" && dx > 0) {
      setPageDragging(true);
      setPageDragX(Math.min(dx, window.innerWidth));
    }
  };

  const onPageTouchEnd = () => {
    if (pageSwipeLocked.current === "horizontal" && pageDragging) {
      const v       = pageSwipeVelocity.current;
      const isFlick = Math.abs(v) >= PAGE_SWIPE_VELOCITY && Math.abs(pageDragX) >= PAGE_SWIPE_MIN_DIST;

      const shouldGoNext = page === "songs"     && (pageDragX < -PAGE_SWIPE_THRESHOLD || (isFlick && v < 0));
      const shouldGoPrev = page === "playlists" && (pageDragX >  PAGE_SWIPE_THRESHOLD || (isFlick && v > 0));

      if (shouldGoNext) setPage("playlists");
      else if (shouldGoPrev) setPage("songs");
    }
    pageSwipeStartX.current   = null;
    pageSwipeStartY.current   = null;
    pageSwipeLocked.current   = null;
    pageSwipeVelocity.current = 0;
    setPageDragging(false);
    setPageDragX(0);
  };

  // Compute panel transform strings here (moved from App.tsx inline)
  const panelTransform = (() => {
    const base = page === "playlists" ? 0 : 100;
    if (!pageDragging) return `translateX(${base}%)`;
    return `translateX(calc(${base}% + ${pageDragX}px))`;
  })();
  const panelTransition = pageDragging
    ? "none"
    : "transform 0.28s cubic-bezier(0.22,0.61,0.36,1)";

  return {
    pageDragX,
    pageDragging,
    panelTransform,
    panelTransition,
    pageSwipeLocked,
    onPageTouchStart,
    onPageTouchMove,
    onPageTouchEnd,
  };
}