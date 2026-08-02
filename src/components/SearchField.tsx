"use client";

import { Search, X } from "lucide-react";
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
      <Search
        className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]"
        aria-hidden
      />
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => commit(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        className={[
          "ui-focus w-full rounded-[var(--radius-sm)] border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface-2)_85%,transparent)] py-3 pl-11 text-sm text-[var(--ink)] outline-none backdrop-blur-sm transition placeholder:text-[var(--muted)]",
          hasValue ? "pr-20" : "pr-4",
        ].join(" ")}
      />
      {hasValue ? (
        <button
          type="button"
          onClick={() => {
            commit("");
            inputRef.current?.focus();
          }}
          className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 text-xs font-semibold text-[var(--muted)] transition hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
        >
          <X className="h-3 w-3" aria-hidden />
          Clear
        </button>
      ) : null}
    </label>
  );
}
