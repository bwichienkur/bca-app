import type { ReactNode } from "react";

/** Shared shell: icon subtabs + content in one bordered card (Events / LMS / League). */
export function SubTabCard({
  tabs,
  children,
  className = "",
  contentClassName = "space-y-3 p-3 sm:p-4",
}: {
  tabs: ReactNode;
  children: ReactNode;
  className?: string;
  /** Override padding/spacing on the content pane (e.g. `p-0` for full-bleed). */
  contentClassName?: string;
}) {
  return (
    <section
      className={[
        "overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="border-b border-[var(--line)] bg-[var(--surface-2)] p-0.5">
        {tabs}
      </div>
      <div className={contentClassName}>{children}</div>
    </section>
  );
}
