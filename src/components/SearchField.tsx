"use client";

import { useRef, type Ref } from "react";

type SearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  /** Called immediately before the value changes (for scroll anchoring). */
  onBeforeChange?: () => void;
  /** Element kept stable in the viewport when filter results shrink. */
  anchorRef?: Ref<HTMLElement | null>;
};

export function SearchField({
  value,
  onChange,
  placeholder = "Filter…",
  label = "Search",
  onBeforeChange,
  anchorRef,
}: SearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hasValue = value.trim().length > 0;

  const commit = (next: string) => {
    onBeforeChange?.();
    onChange(next);
  };

  return (
    <label
      ref={anchorRef as Ref<HTMLLabelElement>}
      className="relative block w-full max-w-md"
    >
      <span className="sr-only">{label}</span>
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => commit(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        className={[
          "w-full rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] py-2.5 text-sm text-[var(--ink)] outline-none ring-[var(--felt-soft)] transition placeholder:text-[var(--muted)] focus:ring-2",
          hasValue ? "pl-4 pr-20" : "px-4",
        ].join(" ")}
      />
      {hasValue ? (
        <button
          type="button"
          onClick={() => {
            commit("");
            inputRef.current?.focus();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-[var(--surface)] px-2.5 py-1 text-xs font-semibold text-[var(--muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--ink)]"
        >
          Clear
        </button>
      ) : null}
    </label>
  );
}
