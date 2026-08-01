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
 * (common on mobile when a long list collapses under a sticky search bar).
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
    const delta = el.getBoundingClientRect().top - top;
    if (Math.abs(delta) > 1) {
      window.scrollBy(0, delta);
    }
    pendingTop.current = null;
  });

  return useMemo(() => ({ ref, mark }), [mark]);
}
