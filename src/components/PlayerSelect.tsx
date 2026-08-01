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

export type PlayerSelectOption = {
  id: string;
  label: string;
  rating: number | null;
};

type PlayerSelectProps = {
  value: string;
  options: PlayerSelectOption[];
  placeholder?: string;
  onChange: (playerId: string) => void;
  disabled?: boolean;
};

export function PlayerSelect({
  value,
  options,
  placeholder = "Open slot…",
  onChange,
  disabled,
}: PlayerSelectProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const [mounted, setMounted] = useState(false);

  const selected = options.find((option) => option.id === value) ?? null;
  const menuOptions = useMemo(
    () => [
      { id: "", label: placeholder, rating: null as number | null },
      ...options,
    ],
    [options, placeholder],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;

    const updatePosition = () => {
      const rect = buttonRef.current!.getBoundingClientRect();
      const menuHeight = Math.min(224, window.innerHeight * 0.45);
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpward = spaceBelow < menuHeight + 12 && rect.top > spaceBelow;
      setMenuStyle({
        position: "fixed",
        left: Math.max(8, rect.left),
        width: Math.min(rect.width, window.innerWidth - 16),
        top: openUpward ? undefined : rect.bottom + 6,
        bottom: openUpward
          ? Math.max(8, window.innerHeight - rect.top + 6)
          : undefined,
        maxHeight: menuHeight,
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
  }, [open, menuOptions.length]);

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const index = Math.max(
      0,
      menuOptions.findIndex((option) => option.id === value),
    );
    setHighlight(index);
  }, [open, menuOptions, value]);

  const menu =
    open && mounted
      ? createPortal(
          <ul
            ref={menuRef}
            id={listId}
            role="listbox"
            style={menuStyle}
            className="overflow-y-auto rounded-xl border border-[var(--line-strong)] bg-[var(--surface-2)] py-1 shadow-[var(--shadow)] [background-color:var(--surface-2)]"
          >
            {menuOptions.map((option, index) => {
              const active = index === highlight;
              const isSelected = option.id === value;
              return (
                <li
                  key={`${option.id || "empty"}-${index}`}
                  className="bg-[var(--surface-2)]"
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => {
                      onChange(option.id);
                      setOpen(false);
                    }}
                    className={[
                      "flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm",
                      active
                        ? "bg-[var(--surface-3)]"
                        : "bg-[var(--surface-2)]",
                      isSelected
                        ? "font-semibold text-[var(--felt-deep)]"
                        : "text-[var(--ink)]",
                    ].join(" ")}
                  >
                    <span>{option.label}</span>
                    {option.rating != null ? (
                      <span className="tabular-nums text-xs text-[var(--muted)]">
                        {option.rating}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          if (disabled) return;
          setOpen((current) => !current);
        }}
        className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-left text-sm text-[var(--ink)] outline-none transition hover:border-[var(--line-strong)] focus:ring-2 focus:ring-[var(--felt-soft)] disabled:opacity-50"
      >
        <span
          className={[
            "min-w-0 flex-1 truncate",
            selected ? "font-medium" : "text-[var(--muted)]",
          ].join(" ")}
        >
          {selected
            ? selected.rating != null
              ? `${selected.label} · ${selected.rating}`
              : selected.label
            : placeholder}
        </span>
        <span className="shrink-0 text-[var(--muted)]">▾</span>
      </button>
      {menu}
    </div>
  );
}
