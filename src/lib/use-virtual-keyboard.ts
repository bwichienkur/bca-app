"use client";

import { useEffect, useState } from "react";

/**
 * True while a mobile virtual keyboard is likely open.
 * Uses Visual Viewport shrinkage + editable-element focus as signals.
 */
export function useVirtualKeyboardOpen(thresholdPx = 120): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let focusedEditable = false;

    const isEditable = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        return !(target as HTMLInputElement).readOnly;
      }
      return target.isContentEditable;
    };

    const measure = () => {
      const vv = window.visualViewport;
      const touchUi =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(hover: none), (pointer: coarse)").matches;
      if (!vv) {
        setOpen(touchUi && focusedEditable);
        return;
      }
      // Layout height minus visible viewport (and scroll offset) ≈ keyboard.
      const covered =
        window.innerHeight - vv.height - Math.max(0, vv.offsetTop);
      // Prefer viewport shrinkage; also hide immediately on touch when an
      // editable is focused so the nav doesn't cover typeahead results.
      setOpen(covered > thresholdPx || (touchUi && focusedEditable));
    };

    const onFocusIn = (event: FocusEvent) => {
      focusedEditable = isEditable(event.target);
      measure();
    };
    const onFocusOut = () => {
      // Defer so focus moving between fields doesn't flash the nav.
      window.setTimeout(() => {
        focusedEditable = isEditable(document.activeElement);
        measure();
      }, 0);
    };

    measure();
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    window.addEventListener("resize", measure);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, [thresholdPx]);

  return open;
}
