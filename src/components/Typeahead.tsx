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
}: TypeaheadProps<T>) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    if (!open) setQuery(value?.label ?? "");
  }, [value, open]);

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
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

  return (
    <div ref={rootRef} className="relative w-full">
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </label>
      <div className="relative">
        <input
          disabled={disabled}
          value={open ? query : (value?.label ?? query)}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          onFocus={() => {
            setOpen(true);
            setQuery(value?.label ?? "");
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            onQueryChange?.(event.target.value);
            if (!event.target.value) onChange(null);
          }}
          onKeyDown={(event) => {
            if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
              setOpen(true);
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
              if (option) {
                onChange(option);
                setOpen(false);
              }
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          className="w-full rounded-2xl border border-[var(--line)] bg-white/90 px-4 py-3 pr-10 outline-none ring-[var(--felt-soft)] transition focus:ring-2 disabled:opacity-50"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)]">
          ▾
        </span>
      </div>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-40 mt-1 max-h-72 w-full overflow-y-auto rounded-2xl border border-[var(--line)] bg-white py-1 shadow-[var(--shadow)]"
        >
          {filtered.length === 0 ? (
            <li className="px-4 py-3 text-sm text-[var(--muted)]">{emptyText}</li>
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
                    onClick={() => {
                      onChange(option);
                      setOpen(false);
                    }}
                    className={[
                      "flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm",
                      active ? "bg-[var(--paper-2)]" : "bg-white",
                      selected ? "font-semibold text-[var(--felt-deep)]" : "text-[var(--ink)]",
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
