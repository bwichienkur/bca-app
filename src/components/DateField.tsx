"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

type DateFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  "aria-label"?: string;
  /** Inclusive YYYY-MM-DD lower bound. */
  min?: string;
  /** Inclusive YYYY-MM-DD upper bound. */
  max?: string;
};

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Parse `YYYY-MM-DD` into parts. */
function parseDate(value: string): {
  year: number;
  month: number;
  day: number;
} | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  return { year, month, day };
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function formatDisplay(value: string): string {
  const parts = parseDate(value);
  if (!parts) return "";
  const d = new Date(parts.year, parts.month - 1, parts.day);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function startWeekday(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

function dateKey(year: number, month: number, day: number): string {
  return formatDate(year, month, day);
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
    </svg>
  );
}

export function DateField({
  value,
  onChange,
  placeholder = "Pick date",
  disabled,
  required,
  id,
  "aria-label": ariaLabel,
  min,
  max,
}: DateFieldProps) {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});

  const parsed = parseDate(value);
  const now = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(
    () => parsed?.year ?? now.getFullYear(),
  );
  const [viewMonth, setViewMonth] = useState(
    () => parsed?.month ?? now.getMonth() + 1,
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const next = parseDate(value);
    if (next) {
      setViewYear(next.year);
      setViewMonth(next.month);
    }
  }, [open, value]);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;

    const updatePosition = () => {
      const rect = buttonRef.current!.getBoundingClientRect();
      const panelWidth = Math.min(320, window.innerWidth - 16);
      const panelHeight = Math.min(360, window.innerHeight * 0.8);
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpward = spaceBelow < panelHeight + 12 && rect.top > spaceBelow;
      const left = Math.min(
        Math.max(8, rect.left),
        window.innerWidth - panelWidth - 8,
      );
      setPanelStyle({
        position: "fixed",
        left,
        width: panelWidth,
        top: openUpward ? undefined : rect.bottom + 6,
        bottom: openUpward
          ? Math.max(8, window.innerHeight - rect.top + 6)
          : undefined,
        maxHeight: panelHeight,
        zIndex: 10000,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, [open]);

  const monthLabel = new Date(viewYear, viewMonth - 1, 1).toLocaleString(
    undefined,
    { month: "long", year: "numeric" },
  );

  const cells = useMemo(() => {
    const total = daysInMonth(viewYear, viewMonth);
    const start = startWeekday(viewYear, viewMonth);
    const items: Array<{ day: number | null; key: string }> = [];
    for (let i = 0; i < start; i += 1) {
      items.push({ day: null, key: `e-${i}` });
    }
    for (let day = 1; day <= total; day += 1) {
      items.push({ day, key: `d-${day}` });
    }
    while (items.length % 7 !== 0) {
      items.push({ day: null, key: `t-${items.length}` });
    }
    return items;
  }, [viewMonth, viewYear]);

  const isDisabledDay = (day: number) => {
    const key = dateKey(viewYear, viewMonth, day);
    if (min && key < min) return true;
    if (max && key > max) return true;
    return false;
  };

  const commitDay = (day: number) => {
    if (isDisabledDay(day)) return;
    onChange(formatDate(viewYear, viewMonth, day));
    setOpen(false);
  };

  const clear = () => {
    onChange("");
    setOpen(false);
  };

  const shiftMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth - 1 + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth() + 1);
  };

  const panel =
    open && mounted
      ? createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-label={ariaLabel ?? "Choose date"}
            style={panelStyle}
            className="overflow-hidden rounded-[var(--radius)] border border-[var(--line-strong)] bg-[var(--surface)] shadow-[var(--shadow)]"
          >
            <div className="border-b border-[var(--line)] bg-[linear-gradient(145deg,rgba(29,110,158,0.98),rgba(19,78,115,0.96))] px-3 py-2.5 text-white">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() => shiftMonth(-1)}
                  className="flex h-8 w-8 items-center justify-center rounded-[var(--radius)] text-white/80 transition hover:bg-black/20 hover:text-white"
                >
                  ‹
                </button>
                <p className="font-[family-name:var(--font-display)] text-base font-semibold tracking-tight">
                  {monthLabel}
                </p>
                <button
                  type="button"
                  aria-label="Next month"
                  onClick={() => shiftMonth(1)}
                  className="flex h-8 w-8 items-center justify-center rounded-[var(--radius)] text-white/80 transition hover:bg-black/20 hover:text-white"
                >
                  ›
                </button>
              </div>
            </div>

            <div className="space-y-3 p-3">
              <div className="grid grid-cols-7 gap-1">
                {WEEKDAYS.map((day) => (
                  <div
                    key={day}
                    className="py-1 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]"
                  >
                    {day}
                  </div>
                ))}
                {cells.map((cell) => {
                  if (cell.day == null) {
                    return <div key={cell.key} className="h-9" />;
                  }
                  const selected =
                    parsed != null &&
                    parsed.year === viewYear &&
                    parsed.month === viewMonth &&
                    parsed.day === cell.day;
                  const isToday =
                    now.getFullYear() === viewYear &&
                    now.getMonth() + 1 === viewMonth &&
                    now.getDate() === cell.day;
                  const dayDisabled = isDisabledDay(cell.day);
                  return (
                    <button
                      key={cell.key}
                      type="button"
                      disabled={dayDisabled}
                      onClick={() => commitDay(cell.day!)}
                      className={[
                        "h-9 rounded-[var(--radius)] text-sm tabular-nums transition",
                        dayDisabled
                          ? "cursor-not-allowed text-[var(--muted)] opacity-35"
                          : selected
                            ? "bg-[var(--felt)] font-semibold text-white"
                            : isToday
                              ? "bg-[var(--surface-3)] font-semibold text-[var(--felt-deep)] hover:bg-[var(--felt-soft)] hover:text-white"
                              : "text-[var(--ink)] hover:bg-[var(--surface-3)]",
                      ].join(" ")}
                    >
                      {cell.day}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-[var(--line)] pt-3">
                <button
                  type="button"
                  onClick={clear}
                  className="rounded-[var(--radius)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-[var(--radius)] bg-[var(--felt)] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--felt-soft)]"
                >
                  Done
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className="relative w-full min-w-0">
      <div className="relative">
        <button
          ref={buttonRef}
          id={id}
          type="button"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={ariaLabel}
          aria-required={required || undefined}
          onClick={() => {
            if (disabled) return;
            setOpen((current) => !current);
          }}
          className={[
            "flex h-[2.625rem] w-full min-w-0 items-center gap-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] py-2 pl-3 text-left text-sm outline-none transition hover:border-[var(--line-strong)] focus:ring-2 focus:ring-[var(--felt-soft)] disabled:opacity-50",
            value ? "pr-16 text-[var(--ink)]" : "pr-10 text-[var(--muted)]",
          ].join(" ")}
        >
          <span className="min-w-0 flex-1 truncate">
            {value ? formatDisplay(value) : placeholder}
          </span>
        </button>
        <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-0.5">
          {value && !disabled ? (
            <button
              type="button"
              tabIndex={-1}
              aria-label={`Clear ${ariaLabel ?? "date"}`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                clear();
              }}
              className="pointer-events-auto inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius)] text-[var(--muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--ink)]"
            >
              <span aria-hidden className="text-base leading-none">
                ×
              </span>
            </button>
          ) : null}
          <span className="inline-flex h-7 w-7 items-center justify-center text-[var(--muted)]">
            <CalendarIcon />
          </span>
        </div>
      </div>
      {required ? (
        <input
          tabIndex={-1}
          aria-hidden
          required
          value={value}
          onChange={() => undefined}
          className="pointer-events-none absolute h-0 w-0 opacity-0"
        />
      ) : null}
      {panel}
    </div>
  );
}
