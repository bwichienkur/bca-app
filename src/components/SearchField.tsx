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
  /**
   * Compact full-width field for use inside a DataTable toolbar
   * (no max-width, denser padding, quieter chrome).
   */
  embedded?: boolean;
  /** Larger padding / text for primary search screens. */
  size?: "default" | "large";
  /** Show a spinner in the icon slot (e.g. remote search). */
  loading?: boolean;
  className?: string;
};

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder = "Filter…",
  label = "Search",
  onBeforeChange,
  anchorRef,
  embedded = false,
  size = "default",
  loading = false,
  className,
}: SearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hasValue = value.trim().length > 0;
  const large = size === "large";

  const commit = (next: string) => {
    onBeforeChange?.();
    onChange(next);
  };

  return (
    <label
      ref={anchorRef as Ref<HTMLLabelElement>}
      className={[
        "relative block w-full",
        embedded || large ? "" : "max-w-md",
        className ?? "",
      ].join(" ")}
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
          "w-full text-[var(--ink)] outline-none ring-[var(--felt-soft)] transition placeholder:text-[var(--muted)] focus:ring-2",
          large ? "py-3 text-base" : "text-sm",
          !large && (embedded ? "py-2" : "py-2.5"),
          embedded || large
            ? "rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]"
            : "rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)]",
          hasValue
            ? large
              ? "pl-4 pr-24"
              : "pl-3.5 pr-20"
            : large
              ? "pl-4 pr-11"
              : "pl-3.5 pr-10",
        ].join(" ")}
      />

      {hasValue && !loading ? (
        <button
          type="button"
          onClick={() => {
            commit("");
            inputRef.current?.focus();
          }}
          className={[
            "absolute top-1/2 -translate-y-1/2 rounded-full px-2.5 py-1 text-xs font-semibold text-[var(--muted)] transition hover:text-[var(--ink)]",
            large ? "right-10" : "right-9",
            embedded || large
              ? "bg-[var(--surface-2)] hover:bg-[var(--surface-3)]"
              : "bg-[var(--surface)] hover:bg-[var(--surface-3)]",
          ].join(" ")}
        >
          Clear
        </button>
      ) : null}

      <span
        className={[
          "pointer-events-none absolute top-1/2 flex -translate-y-1/2 items-center justify-center text-[var(--muted)]",
          large ? "right-3.5" : "right-3",
        ].join(" ")}
        aria-hidden={!loading}
        aria-label={loading ? "Searching" : undefined}
      >
        {loading ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--line-strong)] border-t-[var(--felt)]" />
        ) : (
          <SearchIcon className={large ? "h-[1.125rem] w-[1.125rem]" : "h-4 w-4"} />
        )}
      </span>
    </label>
  );
}
