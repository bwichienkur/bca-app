import type { ReactNode } from "react";

type TeamSectionCardProps = {
  eyebrow: string;
  title: string;
  description?: string;
  badge?: { label: string; value: string };
  children: ReactNode;
  /** Edge-to-edge body for tables; otherwise padded content. */
  flush?: boolean;
};

/** Standing-style shell: felt header band + dark content body. */
export function TeamSectionCard({
  eyebrow,
  title,
  description,
  badge,
  children,
  flush = false,
}: TeamSectionCardProps) {
  return (
    <section className="overflow-hidden rounded-[1.35rem] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]">
      <div className="relative overflow-hidden bg-[linear-gradient(145deg,rgba(29,110,158,0.98),rgba(19,78,115,0.96))] px-4 py-4 text-white sm:px-5 sm:py-5">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(120% 80% at 100% 0%, rgba(224,163,90,0.28), transparent 55%)",
          }}
        />
        <div className="relative flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/65">
              {eyebrow}
            </p>
            <h3 className="mt-1.5 break-words font-[family-name:var(--font-display)] text-2xl font-semibold leading-[1.15] tracking-tight text-white sm:text-3xl">
              {title}
            </h3>
            {description ? (
              <p className="mt-2 text-xs text-white/70">{description}</p>
            ) : null}
          </div>
          {badge ? (
            <div className="shrink-0 rounded-2xl bg-black/25 px-3.5 py-2.5 text-center ring-1 ring-white/15">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/65">
                {badge.label}
              </p>
              <p className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tabular-nums leading-none">
                {badge.value}
              </p>
            </div>
          ) : null}
        </div>
      </div>
      <div className={flush ? "min-w-0" : "space-y-4 p-3 sm:p-4"}>
        {children}
      </div>
    </section>
  );
}
