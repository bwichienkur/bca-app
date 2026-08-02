import type { ReactNode } from "react";

export function MetricCard({
  label,
  value,
  children,
  compact = false,
  className,
}: {
  label: string;
  value?: string;
  /** Custom value slot (e.g. ratio breakdown). Overrides `value` when set. */
  children?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={[
        "rounded-[var(--radius-sm)] border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)]",
        compact ? "px-2.5 py-2" : "px-3.5 py-3",
        className ?? "",
      ].join(" ")}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </p>
      {children ?? (
        <p
          className={[
            "mt-1.5 font-semibold tabular-nums leading-none tracking-tight text-[var(--ink)]",
            compact ? "text-xl" : "text-2xl",
          ].join(" ")}
        >
          {value || "—"}
        </p>
      )}
    </div>
  );
}
