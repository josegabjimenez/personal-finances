"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

const THRESHOLD = 80;

export function PullToRefresh() {
  const router = useRouter();
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startYRef = useRef<number | null>(null);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      if (window.scrollY === 0) {
        startYRef.current = e.touches[0].clientY;
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (startYRef.current === null) return;
      const dy = e.touches[0].clientY - startYRef.current;
      if (dy > 0) {
        pullRef.current = Math.min(dy, THRESHOLD);
        setPullDistance(pullRef.current);
      }
    }

    function onTouchEnd() {
      if (pullRef.current >= THRESHOLD && !refreshingRef.current) {
        refreshingRef.current = true;
        setIsRefreshing(true);
        router.refresh();
        setTimeout(() => {
          refreshingRef.current = false;
          setIsRefreshing(false);
        }, 1500);
      }
      startYRef.current = null;
      pullRef.current = 0;
      setPullDistance(0);
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [router]);

  const visible = pullDistance > 8 || isRefreshing;
  const ready = pullDistance >= THRESHOLD;

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 z-50 flex justify-center"
      style={{ top: "calc(env(safe-area-inset-top) + 0.5rem)" }}
    >
      <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-md">
        <RefreshCw
          className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
        />
        {isRefreshing
          ? "Refreshing…"
          : ready
            ? "Release to refresh"
            : "Pull to refresh"}
      </div>
    </div>
  );
}
