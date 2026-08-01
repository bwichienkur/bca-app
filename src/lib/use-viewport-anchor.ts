"use client";

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type RefObject,
} from "react";

/**
 * Snapshot an element's viewport Y before a state update, then restore it after
 * layout. Prevents the page from jumping when search/filter results shrink
 * (common on mobile when a long list collapses under a filter field).
 */
export function useViewportAnchor<T extends HTMLElement = HTMLElement>(): {
  ref: RefObject<T | null>;
  mark: () => void;
} {
  const ref = useRef<T | null>(null);
  const pendingTop = useRef<number | null>(null);

  const mark = useCallback(() => {
    pendingTop.current = ref.current?.getBoundingClientRect().top ?? null;
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    const top = pendingTop.current;
    if (!el || top == null) return;

    const restore = () => {
      const node = ref.current;
      if (!node) return;
      const delta = node.getBoundingClientRect().top - top;
      if (Math.abs(delta) > 0.5) {
        window.scrollBy(0, delta);
      }
    };

    restore();
    // iOS Safari sometimes adjusts scroll again after the first paint.
    const frame = window.requestAnimationFrame(restore);
    pendingTop.current = null;

    return () => window.cancelAnimationFrame(frame);
  });

  return useMemo(() => ({ ref, mark }), [mark]);
}
