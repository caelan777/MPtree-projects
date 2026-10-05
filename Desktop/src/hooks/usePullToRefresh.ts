import { useState } from "react";
import type React from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PullToRefreshDeps {
  scrollRef:       React.RefObject<HTMLDivElement | null>;
  pageSwipeLocked: React.MutableRefObject<"horizontal" | "vertical" | null>;
  onRefresh:       () => Promise<unknown>;
  // Page-swipe handlers to forward touch events to
  onPageTouchStart: (e: React.TouchEvent) => void;
  onPageTouchMove:  (e: React.TouchEvent) => void;
  onPageTouchEnd:   () => void;
}

export interface PullToRefreshReturn {
  pullDist:     number;
  refreshing:   boolean;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove:  (e: React.TouchEvent) => void;
  onTouchEnd:   () => Promise<void>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePullToRefresh({
  scrollRef,
  pageSwipeLocked,
  onRefresh,
  onPageTouchStart,
  onPageTouchMove,
  onPageTouchEnd,
}: PullToRefreshDeps): PullToRefreshReturn {
  const [pullStartY,  setPullY]      = useState<number | null>(null);
  const [pullDist,    setPullDist]   = useState(0);
  const [refreshing,  setRefreshing] = useState(false);

  const onTouchStart = (e: React.TouchEvent) => {
    onPageTouchStart(e);
    if (scrollRef.current?.scrollTop === 0) {
      setPullY(e.touches[0].clientY);
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    onPageTouchMove(e);
    if (pageSwipeLocked.current === "horizontal") return;
    if (pullStartY === null) return;
    const d = e.touches[0].clientY - pullStartY;
    if (d > 0 && scrollRef.current?.scrollTop === 0) {
      setPullDist(Math.min(d * 0.4, 80));
    }
  };

  const onTouchEnd = async () => {
    onPageTouchEnd();
    if (pullDist > 60 && !refreshing) {
      setRefreshing(true);
      await onRefresh();
      setRefreshing(false);
    }
    setPullY(null);
    setPullDist(0);
  };

  return {
    pullDist,
    refreshing,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  };
}