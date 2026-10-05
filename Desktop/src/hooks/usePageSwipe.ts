import { useState, useRef } from "react";
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
}: PageSwipeDeps): PageSwipeReturn {
  const [pageDragX,    setPageDragX]    = useState(0);
  const [pageDragging, setPageDragging] = useState(false);

  const pageSwipeStartX   = useRef<number | null>(null);
  const pageSwipeStartY   = useRef<number | null>(null);
  const pageSwipeLocked   = useRef<"horizontal" | "vertical" | null>(null);
  const pageSwipeLastX    = useRef<number>(0);
  const pageSwipeLastTime = useRef<number>(0);
  const pageSwipeVelocity = useRef<number>(0); // px/ms, signed

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