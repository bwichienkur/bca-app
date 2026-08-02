import type { ReactNode } from "react";

export function DashboardWidget({
  title,
  children,
  action,
  className,
  padding = "default",
}: {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
  padding?: "default" | "compact" | "none";
}) {
  const pad =
    padding === "none"
      ? ""
      : padding === "compact"
        ? "p-4"
        : "p-5 md:p-6";

  return (
    <section
      className={[
        "ui-glass overflow-hidden rounded-[var(--radius)]",
        className ?? "",
      ].join(" ")}
    >
      {title || action ? (
        <div
          className={[
            "flex items-center justify-between gap-3 border-b border-[var(--line)]",
            padding === "none" ? "px-5 py-4" : "mb-0 px-5 py-4 md:px-6",
          ].join(" ")}
        >
          {title ? (
            <h3 className="text-sm font-semibold tracking-tight text-[var(--ink)]">
              {title}
            </h3>
          ) : (
            <span />
          )}
          {action}
        </div>
      ) : null}
      <div className={pad}>{children}</div>
    </section>
  );
}
