"use client";

import { Check, ChevronDown, ChevronUp, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

export type TypeaheadOption<T = string> = {
  id: string;
  label: string;
  meta?: string;
  value: T;
};

type TypeaheadProps<T> = {
  label: string;
  placeholder?: string;
  value: TypeaheadOption<T> | null;
  options: TypeaheadOption<T>[];
  onChange: (option: TypeaheadOption<T> | null) => void;
  onQueryChange?: (query: string) => void;
  disabled?: boolean;
  emptyText?: string;
  /** Show a clear control when a value is selected. Defaults to true. */
  clearable?: boolean;
  /** Visual tone for embedding on felt/theme surfaces. */
  tone?: "default" | "felt";
};

export function Typeahead<T>({
  label,
  placeholder = "Search…",
  value,
  options,
  onChange,
  onQueryChange,
  disabled,
  emptyText = "No matches",
  clearable = true,
  tone = "default",
}: TypeaheadProps<T>) {
  const felt = tone === "felt";
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    if (!open) setQuery(value?.label ?? "");
  }, [value, open]);

  useEffect(() => {
    function onDoc(event: MouseEvent | TouchEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 80);
    return options
      .filter((option) => {
        const hay = `${option.label} ${option.meta ?? ""}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 80);
  }, [options, query]);

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  const openList = () => {
    if (disabled) return;
    setOpen(true);
    // Start with an empty query so the full list is visible and typing
    // replaces the previous selection without backspacing.
    setQuery("");
    onQueryChange?.("");
  };

  const clear = () => {
    if (disabled) return;
    setQuery("");
    onChange(null);
    onQueryChange?.("");
    setOpen(true);
    inputRef.current?.focus();
  };

  const choose = (option: TypeaheadOption<T>) => {
    onChange(option);
    setQuery(option.label);
    setOpen(false);
  };

  const showClear = clearable && Boolean(value) && !disabled;

  const inputClasses = felt
    ? [
        "border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--surface-2)_70%,transparent)] text-[var(--ink)]",
        "placeholder:text-[var(--muted)] backdrop-blur-md",
      ].join(" ")
    : [
        "border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]",
        "placeholder:text-[var(--muted)]",
      ].join(" ");

  const controlBtnClasses = felt
    ? "text-[var(--muted)] hover:bg-[color-mix(in_srgb,var(--felt)_12%,transparent)] hover:text-[var(--ink)]"
    : "text-[var(--muted)] hover:bg-[var(--surface-3)] hover:text-[var(--ink)]";

  return (
    <div
      ref={rootRef}
      className={["relative w-full", open ? "z-[80]" : "z-10"].join(" ")}
    >
      <label
        className={[
          "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em]",
          felt ? "text-[var(--ink-secondary)]" : "text-[var(--muted)]",
        ].join(" ")}
      >
        {label}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          disabled={disabled}
          value={open ? query : (value?.label ?? "")}
          placeholder={
            open && value ? value.label : placeholder
          }
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          onFocus={openList}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            setOpen(true);
            onQueryChange?.(next);
            if (!next && value) onChange(null);
          }}
          onKeyDown={(event) => {
            if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
              event.preventDefault();
              openList();
              return;
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setHighlight((index) =>
                Math.min(index + 1, Math.max(filtered.length - 1, 0)),
              );
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setHighlight((index) => Math.max(index - 1, 0));
            } else if (event.key === "Enter") {
              event.preventDefault();
              const option = filtered[highlight];
              if (option) choose(option);
            } else if (event.key === "Escape") {
              setOpen(false);
              setQuery(value?.label ?? "");
            }
          }}
          className={[
            "ui-focus w-full rounded-[var(--radius-sm)] border px-4 py-3 outline-none transition disabled:opacity-50",
            inputClasses,
            showClear ? "pr-16" : "pr-10",
          ].join(" ")}
        />
        <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
          {showClear ? (
            <button
              type="button"
              aria-label={`Clear ${label}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={clear}
              className={[
                "flex h-8 w-8 items-center justify-center rounded-full transition",
                controlBtnClasses,
              ].join(" ")}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
          <button
            type="button"
            tabIndex={-1}
            aria-label={open ? `Close ${label} options` : `Open ${label} options`}
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (open) {
                setOpen(false);
                setQuery(value?.label ?? "");
              } else {
                openList();
                inputRef.current?.focus();
              }
            }}
            className={[
              "flex h-8 w-8 items-center justify-center rounded-full transition disabled:opacity-50",
              controlBtnClasses,
            ].join(" ")}
          >
            {open ? (
              <ChevronUp className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>
      </div>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          className={[
            "absolute z-[90] mt-1.5 max-h-72 w-full overflow-y-auto rounded-[var(--radius-sm)] border py-1 shadow-[var(--shadow-sm)]",
            felt
              ? "ui-glass border-[var(--line-strong)] text-[var(--ink)]"
              : "border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)]",
          ].join(" ")}
        >
          {filtered.length === 0 ? (
            <li className="px-4 py-3 text-sm text-[var(--muted)]">
              {emptyText}
            </li>
          ) : (
            filtered.map((option, index) => {
              const active = index === highlight;
              const selected = value?.id === option.id;
              return (
                <li key={option.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() => setHighlight(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(option)}
                    className={[
                      "flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors",
                      active
                        ? "bg-[color-mix(in_srgb,var(--felt)_14%,var(--surface-2))]"
                        : "bg-transparent",
                      selected
                        ? "font-semibold text-[var(--chalk)]"
                        : "text-[var(--ink-secondary)]",
                    ].join(" ")}
                  >
                    <span>
                      <span className="block">{option.label}</span>
                      {option.meta ? (
                        <span className="mt-0.5 block text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">
                          {option.meta}
                        </span>
                      ) : null}
                    </span>
                    {selected ? (
                      <Check className="h-4 w-4 shrink-0 text-[var(--felt)]" aria-hidden />
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
