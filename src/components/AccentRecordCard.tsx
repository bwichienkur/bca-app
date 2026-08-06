import type { ReactNode } from "react";

/** Shared Events list chrome: spaced cards with a felt accent rail. */
export const accentRecordListClass = "space-y-2";

export const accentRecordCardClass =
  "flex items-stretch overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_88%,transparent)]";

export const accentRecordCardInteractiveClass =
  "transition hover:border-[color-mix(in_srgb,var(--felt)_45%,var(--line))] hover:bg-[color-mix(in_srgb,var(--felt)_8%,var(--surface))]";

export const accentRecordRailClass =
  "w-1 shrink-0 self-stretch bg-[var(--felt)]";

export const accentRecordBodyClass =
  "min-w-0 flex-1 px-3 py-2.5 sm:px-3.5";

type AccentRecordCardProps = {
  children: ReactNode;
  /** Override the left rail color (defaults to felt blue). */
  railClassName?: string;
  /** Soft hover treatment for tappable rows. */
  interactive?: boolean;
  className?: string;
};

export function AccentRecordCard({
  children,
  railClassName = accentRecordRailClass,
  interactive = false,
  className = "",
}: AccentRecordCardProps) {
  return (
    <div
      className={[
        accentRecordCardClass,
        interactive ? accentRecordCardInteractiveClass : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className={railClassName} aria-hidden />
      <div className={accentRecordBodyClass}>{children}</div>
    </div>
  );
}
