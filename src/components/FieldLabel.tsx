"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type FieldInfoItem = { label: string; description: string };

function canHover(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

export function FieldInfo({
  label,
  summary,
  items,
}: {
  label: string;
  /** One-line field explanation when there are no option rows. */
  summary?: string;
  items?: FieldInfoItem[];
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [tipStyle, setTipStyle] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const tipRef = useRef<HTMLSpanElement | null>(null);
  const closeTimer = useRef<number | null>(null);
  /** Ignore the click that follows a pointerdown close (backdrop / toggle race). */
  const ignoreClickUntil = useRef(0);
  const tipId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  const cancelClose = () => {
    if (closeTimer.current != null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const closeTip = () => {
    cancelClose();
    ignoreClickUntil.current = Date.now() + 450;
    setOpen(false);
  };

  const toggleTip = () => {
    cancelClose();
    setOpen((value) => {
      if (value) {
        ignoreClickUntil.current = Date.now() + 450;
        return false;
      }
      return true;
    });
  };

  const scheduleClose = () => {
    if (!canHover()) return;
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 140);
  };

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;

    const updatePosition = () => {
      const rect = buttonRef.current!.getBoundingClientRect();
      const tipWidth = Math.min(288, window.innerWidth - 16);
      const tipMaxHeight = Math.min(280, window.innerHeight * 0.45);
      let left = rect.left + rect.width / 2 - tipWidth / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - tipWidth - 8));

      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpward = spaceBelow < 140 && rect.top > spaceBelow;

      setTipStyle({
        position: "fixed",
        left,
        width: tipWidth,
        maxHeight: tipMaxHeight,
        top: openUpward ? undefined : rect.bottom + 8,
        bottom: openUpward
          ? Math.max(8, window.innerHeight - rect.top + 8)
          : undefined,
        zIndex: 10060,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, summary, items?.length]);

  useEffect(() => {
    if (!open) return;

    const isInside = (target: EventTarget | null) => {
      if (!(target instanceof Node)) return false;
      if (rootRef.current?.contains(target)) return true;
      if (tipRef.current?.contains(target)) return true;
      return false;
    };

    const onPointerDown = (event: Event) => {
      if (isInside(event.target)) return;
      closeTip();
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeTip();
    };

    // Capture so a stopPropagation on a card/button still dismisses the tip.
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("mousedown", onPointerDown, true);
    document.addEventListener("touchstart", onPointerDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("mousedown", onPointerDown, true);
      document.removeEventListener("touchstart", onPointerDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const tip =
    open && mounted
      ? createPortal(
          <>
            <button
              type="button"
              aria-label="Dismiss info"
              className="fixed inset-0 z-[10055] cursor-default bg-transparent"
              onPointerDown={(event) => {
                event.preventDefault();
                closeTip();
              }}
              onClick={(event) => {
                event.preventDefault();
              }}
            />
            <span
              ref={tipRef}
              id={tipId}
              role="tooltip"
              style={tipStyle}
              className="overflow-y-auto rounded-[var(--radius)] border border-[var(--line-strong)] bg-[var(--surface)] p-3 text-left shadow-[var(--shadow)]"
              onMouseEnter={cancelClose}
              onMouseLeave={scheduleClose}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--felt-deep)]">
                {label}
              </p>
              {summary ? (
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--ink)]">
                  {summary}
                </p>
              ) : null}
              {items?.length ? (
                <ul
                  className={summary ? "mt-2.5 space-y-2" : "mt-1.5 space-y-2"}
                >
                  {items.map((item) => (
                    <li key={item.label} className="text-xs leading-snug">
                      <span className="font-semibold text-[var(--ink)]">
                        {item.label}
                      </span>
                      <span className="text-[var(--muted)]">
                        {" "}
                        — {item.description}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </span>
          </>,
          document.body,
        )
      : null;

  return (
    <span
      ref={rootRef}
      className="relative inline-flex"
      onMouseEnter={() => {
        if (!canHover()) return;
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        ref={buttonRef}
        type="button"
        className={[
          "inline-flex size-5 items-center justify-center rounded-full transition",
          open
            ? "relative z-[10065] bg-[var(--felt)] text-white shadow-sm"
            : "bg-[color-mix(in_srgb,var(--felt)_14%,var(--surface))] text-[var(--felt-deep)] ring-1 ring-[color-mix(in_srgb,var(--felt)_35%,var(--line))] hover:bg-[color-mix(in_srgb,var(--felt)_22%,var(--surface))]",
        ].join(" ")}
        aria-label={`About ${label}`}
        aria-expanded={open}
        aria-controls={tipId}
        onPointerDown={(event) => {
          // Handle on pointerdown so a backdrop dismiss + ghost click can't
          // immediately reopen the tip on touch devices.
          event.preventDefault();
          event.stopPropagation();
          toggleTip();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (Date.now() < ignoreClickUntil.current) return;
        }}
      >
        <svg viewBox="0 0 16 16" className="size-3" fill="none" aria-hidden>
          <circle
            cx="8"
            cy="8"
            r="6.25"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M8 7.25v4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <circle cx="8" cy="5" r="0.85" fill="currentColor" />
        </svg>
      </button>
      {tip}
    </span>
  );
}

export function FieldLabel({
  children,
  info,
}: {
  children: ReactNode;
  info?: { summary?: string; items?: FieldInfoItem[] };
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
        {children}
      </span>
      {info ? (
        <FieldInfo
          label={typeof children === "string" ? children : "field"}
          summary={info.summary}
          items={info.items}
        />
      ) : null}
    </span>
  );
}
