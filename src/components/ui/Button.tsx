import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-[var(--felt)] text-white shadow-[0_0_0_1px_rgba(91,140,255,0.35),0_8px_24px_rgba(91,140,255,0.18)] hover:bg-[var(--felt-soft)] hover:shadow-[0_0_0_1px_rgba(91,140,255,0.45),0_12px_28px_rgba(91,140,255,0.25)]",
  secondary:
    "border border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--ink)] hover:bg-[var(--surface-3)] hover:border-white/20",
  ghost:
    "border border-transparent bg-transparent text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]",
  danger:
    "bg-[var(--danger-strong)] text-white shadow-[0_8px_24px_rgba(239,68,68,0.2)] hover:brightness-110",
};

export function Button({
  children,
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: Variant;
}) {
  return (
    <button
      {...props}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold tracking-tight transition duration-200",
        "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        "ui-focus",
        VARIANTS[variant],
        className ?? "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
