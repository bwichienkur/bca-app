"use client";

import type { ReactNode } from "react";

export type IconSubTabItem<T extends string> = {
  id: T;
  label: string;
  icon: (props: { className?: string }) => ReactNode;
  /** Optional count shown under/beside the label (e.g. Upcoming 18). */
  count?: number;
  ariaLabel?: string;
};

type IconSubTabsProps<T extends string> = {
  "aria-label": string;
  items: IconSubTabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  columns?: number;
};

function IconShell({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function StandingSubIcon({ className }: { className?: string }) {
  return (
    <IconShell className={className}>
      <path d="M8 20V10" />
      <path d="M12 20V4" />
      <path d="M16 20v-6" />
    </IconShell>
  );
}

export function RosterSubIcon({ className }: { className?: string }) {
  return (
    <IconShell className={className}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="3" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a3 3 0 0 1 0 5.74" />
    </IconShell>
  );
}

export function LineupsSubIcon({ className }: { className?: string }) {
  return (
    <IconShell className={className}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </IconShell>
  );
}

export function UpcomingSubIcon({ className }: { className?: string }) {
  return (
    <IconShell className={className}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="M12 14v3" />
      <path d="m10.5 15.5 1.5-1.5 1.5 1.5" />
    </IconShell>
  );
}

export function PastSubIcon({ className }: { className?: string }) {
  return (
    <IconShell className={className}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M12 7v5l3 2" />
    </IconShell>
  );
}

export function MatchupSubIcon({ className }: { className?: string }) {
  return (
    <IconShell className={className}>
      <circle cx="7" cy="8" r="3" />
      <circle cx="17" cy="8" r="3" />
      <path d="M2.5 19a4.5 4.5 0 0 1 9 0" />
      <path d="M12.5 19a4.5 4.5 0 0 1 9 0" />
    </IconShell>
  );
}

export function RoundsSubIcon({ className }: { className?: string }) {
  return (
    <IconShell className={className}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 3v3.5M12 17.5V21M3 12h3.5M17.5 12H21" />
    </IconShell>
  );
}

export function IconSubTabs<T extends string>({
  "aria-label": ariaLabel,
  items,
  value,
  onChange,
  columns,
}: IconSubTabsProps<T>) {
  const cols = columns ?? items.length;
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="grid gap-0.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] p-0.5"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {items.map((item) => {
        const selected = value === item.id;
        const Icon = item.icon;
        const count = item.count ?? 0;
        const showCount = item.count != null;
        const label = showCount ? `${item.label}, ${count}` : item.label;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-label={item.ariaLabel ?? label}
            onClick={() => onChange(item.id)}
            className={[
              "relative flex flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1.5 transition",
              selected
                ? "bg-[var(--felt)] text-white shadow-sm"
                : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]",
            ].join(" ")}
          >
            <Icon className="h-4 w-4" />
            <span className="text-[9px] font-semibold leading-none tracking-wide sm:text-[10px]">
              {item.label}
            </span>
            {showCount ? (
              <span
                className={[
                  "absolute right-0.5 top-0.5 inline-flex min-w-3.5 items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none tabular-nums",
                  selected
                    ? "bg-white text-[var(--felt)]"
                    : "bg-[var(--surface-3)] text-[var(--ink)]",
                ].join(" ")}
              >
                {count > 99 ? "99+" : count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
