export function StatBadge({
  children,
  tone = "neutral",
}: {
  children: string;
  tone?: "neutral" | "primary" | "success" | "warning" | "danger";
}) {
  const tones = {
    neutral: "bg-[var(--surface-2)] text-[var(--ink-secondary)] border-[var(--line)]",
    primary: "bg-[color-mix(in_srgb,var(--felt)_18%,transparent)] text-[var(--chalk)] border-[color-mix(in_srgb,var(--felt)_35%,transparent)]",
    success: "bg-[color-mix(in_srgb,var(--success)_16%,transparent)] text-[var(--success)] border-[color-mix(in_srgb,var(--success)_30%,transparent)]",
    warning: "bg-[color-mix(in_srgb,var(--amber)_14%,transparent)] text-[var(--amber)] border-[color-mix(in_srgb,var(--amber)_30%,transparent)]",
    danger: "bg-[var(--danger-bg)] text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)]",
  } as const;

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide",
        tones[tone],
      ].join(" ")}
    >
      {children}
    </span>
  );
}
