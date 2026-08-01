"use client";

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
}: TypeaheadProps<T>) {
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

  return (
    <div
      ref={rootRef}
      className={["relative w-full", open ? "z-[80]" : "z-10"].join(" ")}
    >
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
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
            "w-full rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] px-4 py-3 text-[var(--ink)] outline-none ring-[var(--felt-soft)] transition placeholder:text-[var(--muted)] focus:ring-2 disabled:opacity-50",
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
              className="flex h-8 w-8 items-center justify-center rounded-full text-lg leading-none text-[var(--muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--ink)]"
            >
              ×
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
            className="flex h-8 w-8 items-center justify-center rounded-full text-sm text-[var(--muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--ink)] disabled:opacity-50"
          >
            {open ? "▴" : "▾"}
          </button>
        </div>
      </div>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-[90] mt-1 max-h-72 w-full overflow-y-auto rounded-2xl border border-[var(--line-strong)] bg-[var(--surface-2)] py-1 shadow-[var(--shadow)] [background-color:var(--surface-2)]"
        >
          {filtered.length === 0 ? (
            <li className="bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--muted)]">
              {emptyText}
            </li>
          ) : (
            filtered.map((option, index) => {
              const active = index === highlight;
              const selected = value?.id === option.id;
              return (
                <li key={option.id} className="bg-[var(--surface-2)]">
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() => setHighlight(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(option)}
                    className={[
                      "flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm",
                      active
                        ? "bg-[var(--surface-3)]"
                        : "bg-[var(--surface-2)]",
                      selected
                        ? "font-semibold text-[var(--felt-deep)]"
                        : "text-[var(--ink)]",
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
                      <span className="text-[var(--felt)]">✓</span>
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
