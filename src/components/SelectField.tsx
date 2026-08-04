"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

export type SelectOption<T extends string = string> = {
  value: T;
  label: string;
};

type SelectFieldProps<T extends string = string> = {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  "aria-label"?: string;
  /** Extra classes for the closed trigger button. */
  buttonClassName?: string;
};

export function SelectField<T extends string = string>({
  value,
  options,
  onChange,
  placeholder = "Select…",
  disabled,
  required,
  id,
  "aria-label": ariaLabel,
  buttonClassName,
}: SelectFieldProps<T>) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const [mounted, setMounted] = useState(false);

  const selected = options.find((option) => option.value === value) ?? null;

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;

    const updatePosition = () => {
      const rect = buttonRef.current!.getBoundingClientRect();
      const menuHeight = Math.min(280, window.innerHeight * 0.45);
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpward = spaceBelow < menuHeight + 12 && rect.top > spaceBelow;
      setMenuStyle({
        position: "fixed",
        left: Math.max(8, rect.left),
        width: Math.min(Math.max(rect.width, 180), window.innerWidth - 16),
        top: openUpward ? undefined : rect.bottom + 6,
        bottom: openUpward
          ? Math.max(8, window.innerHeight - rect.top + 6)
          : undefined,
        maxHeight: menuHeight,
        zIndex: 10050,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, options.length]);

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
      options.findIndex((option) => option.value === value),
    );
    setHighlight(index);
  }, [open, options, value]);

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
            {options.length === 0 ? (
              <li className="px-3 py-2.5 text-sm text-[var(--muted)]">
                No options
              </li>
            ) : (
              options.map((option, index) => {
                const active = index === highlight;
                const isSelected = option.value === value;
                return (
                  <li key={option.value} className="bg-[var(--surface-2)]">
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => {
                        onChange(option.value);
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
                      {isSelected ? (
                        <span className="text-[var(--felt)]">✓</span>
                      ) : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        ref={buttonRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        aria-required={required || undefined}
        onClick={() => {
          if (disabled) return;
          setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
            event.preventDefault();
            setOpen(true);
            return;
          }
          if (!open) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setHighlight((index) =>
              Math.min(index + 1, Math.max(options.length - 1, 0)),
            );
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlight((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter") {
            event.preventDefault();
            const option = options[highlight];
            if (option) {
              onChange(option.value);
              setOpen(false);
            }
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        className={[
          "flex w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-left text-sm outline-none transition hover:border-[var(--line-strong)] focus:ring-2 focus:ring-[var(--felt-soft)] disabled:opacity-50",
          selected ? "text-[var(--ink)]" : "text-[var(--muted)]",
          buttonClassName ?? "",
        ].join(" ")}
      >
        <span className="min-w-0 flex-1 truncate">
          {selected?.label ?? placeholder}
        </span>
        <span className="shrink-0 text-[var(--muted)]" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>
      {menu}
    </div>
  );
}
