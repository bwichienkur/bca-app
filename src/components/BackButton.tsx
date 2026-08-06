"use client";

type BackButtonProps = {
  onClick: () => void;
  label?: string;
  className?: string;
};

/** Shared rectangular back control used across detail/drill-in screens. */
export function BackButton({
  onClick,
  label = "Back",
  className = "",
}: BackButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--line-strong)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span aria-hidden>←</span>
      {label}
    </button>
  );
}
