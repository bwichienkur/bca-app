import type { ReactNode } from "react";

type SectionCardProps = {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  badge?: { label: string; value: string };
  /**
   * Absolute top-right control (e.g. share/link). Does not participate in the
   * title/badge flex row, so badge vertical alignment stays unchanged.
   */
  headerAction?: ReactNode;
  /** When omitted, renders a header-only title card. */
  children?: ReactNode;
  /** Edge-to-edge body for custom toolbars / nested content. */
  flush?: boolean;
  className?: string;
};

/** Standing-style shell: felt header band, optional dark content body. */
export function SectionCard({
  eyebrow,
  title,
  description,
  badge,
  headerAction,
  children,
  flush = false,
  className,
}: SectionCardProps) {
  const hasBody = children != null && children !== false;

  return (
    <section
      className={[
        "overflow-hidden rounded-[var(--radius)] border border-[var(--line)] shadow-[var(--shadow)]",
        hasBody ? "bg-[var(--surface)]" : "bg-transparent",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="relative overflow-hidden bg-[linear-gradient(145deg,rgba(29,110,158,0.98),rgba(19,78,115,0.96))] px-4 py-4 text-white sm:px-5 sm:py-5">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(120% 80% at 100% 0%, rgba(224,163,90,0.28), transparent 55%)",
          }}
        />
        {headerAction ? (
          <div className="absolute right-2.5 top-2.5 z-[1] sm:right-3 sm:top-3">
            {headerAction}
          </div>
        ) : null}
        <div
          className={[
            "relative flex min-w-0 items-center justify-between gap-3",
            // Reserve corner space horizontally only — badge stays vertically centered.
            headerAction ? "pr-8" : "",
          ].join(" ")}
        >
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/65">
              {eyebrow}
            </p>
            <h3 className="mt-1.5 break-words font-[family-name:var(--font-display)] text-2xl font-semibold leading-[1.15] tracking-tight text-white sm:text-3xl">
              {title}
            </h3>
            {description ? (
              <div className="mt-2 text-xs text-white/70">{description}</div>
            ) : null}
          </div>
          {badge ? (
            <div className="flex shrink-0 flex-col items-center justify-center rounded-[var(--radius)] bg-black/25 px-3.5 py-2.5 text-center ring-1 ring-white/15">
              <p className="text-[10px] font-semibold uppercase leading-none tracking-[0.14em] text-white/65">
                {badge.label}
              </p>
              <p className="mt-1.5 font-[family-name:var(--font-display)] text-3xl font-semibold tabular-nums leading-none">
                {badge.value}
              </p>
            </div>
          ) : null}
        </div>
      </div>
      {hasBody ? (
        <div className={flush ? "min-w-0" : "space-y-4 p-3 sm:p-4"}>
          {children}
        </div>
      ) : null}
    </section>
  );
}
