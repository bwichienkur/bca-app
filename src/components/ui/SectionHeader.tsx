import type { ReactNode } from "react";

export function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "flex flex-wrap items-end justify-between gap-3",
        className ?? "",
      ].join(" ")}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
            {eyebrow}
          </p>
        ) : null}
        <h3
          className={[
            "font-semibold tracking-tight text-[var(--ink)]",
            eyebrow ? "mt-1.5 text-xl md:text-2xl" : "text-xl md:text-2xl",
          ].join(" ")}
        >
          {title}
        </h3>
        {description ? (
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
