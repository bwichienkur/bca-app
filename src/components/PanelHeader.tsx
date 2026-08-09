import type { ReactNode } from "react";

/** Events-style muted subheader used inside subtab cards (not the blue hero band). */
export function PanelHeader({
  title,
  description,
  action,
  className = "",
}: {
  title: string;
  description?: ReactNode;
  /** Right-aligned control (e.g. + icon, count). Vertically centered with the text block. */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "flex items-center justify-between gap-3",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
          {title}
        </p>
        {description ? (
          <div className="mt-0.5 text-xs text-[var(--muted)]">{description}</div>
        ) : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  );
}

/** Compact felt + control for section subheaders. */
export function IconAddButton({
  onClick,
  label,
  disabled,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--felt)] text-white transition hover:bg-[var(--felt-soft)] disabled:opacity-50"
    >
      <svg viewBox="0 0 20 20" fill="none" aria-hidden className="h-4 w-4">
        <path
          d="M10 4v12M4 10h12"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

/** Compact count block for the right side of a PanelHeader. */
export function PanelHeaderCount({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="text-right">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-0.5 font-[family-name:var(--font-display)] text-2xl font-semibold tabular-nums leading-none text-[var(--ink)]">
        {value}
      </p>
    </div>
  );
}
