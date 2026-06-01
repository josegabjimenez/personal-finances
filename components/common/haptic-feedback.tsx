"use client";

import * as React from "react";
import { haptic, type HapticStyle } from "@/lib/haptic";

const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  '[role="button"]',
  "summary",
  "[data-haptic]",
].join(",");

function resolveStyle(element: Element): HapticStyle {
  return element.getAttribute("data-haptic") === "medium" ? "medium" : "light";
}

function isDisabled(element: Element) {
  return Boolean(
    element.closest(
      '[data-haptic="off"], [disabled], [aria-disabled="true"], [data-disabled]'
    )
  );
}

function findInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const element = target.closest(INTERACTIVE_SELECTOR);
  if (!element || isDisabled(element)) return null;
  return element;
}

export function HapticFeedback({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!event.isPrimary || event.button !== 0) return;
      const element = findInteractiveTarget(event.target);
      if (!element) return;
      haptic(resolveStyle(element));
    }

    function handleKeyboardClick(event: MouseEvent) {
      if (event.detail !== 0) return;
      const element = findInteractiveTarget(event.target);
      if (!element) return;
      haptic(resolveStyle(element));
    }

    document.addEventListener("pointerdown", handlePointerDown, { passive: true });
    document.addEventListener("click", handleKeyboardClick, { passive: true });

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("click", handleKeyboardClick);
    };
  }, []);

  return <>{children}</>;
}
