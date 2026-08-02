import type { ReportTab } from "@/lib/types";
import type { ReactNode } from "react";

type IconProps = { className?: string };

function IconShell({
  className,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function SearchIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </IconShell>
  );
}

function MyTeamIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="3" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a3 3 0 0 1 0 5.74" />
    </IconShell>
  );
}

function StandingsIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <path d="M8 20V10" />
      <path d="M12 20V4" />
      <path d="M16 20v-6" />
    </IconShell>
  );
}

function PlayersIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="3" />
    </IconShell>
  );
}

function ScheduleIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
    </IconShell>
  );
}

function HandicapIcon({ className }: IconProps) {
  // International-style accessibility / disability mark (wheelchair)
  return (
    <IconShell className={className}>
      <circle cx="14" cy="4.5" r="2" />
      <path d="M12 8.5h3.2l1.6 5.2" />
      <path d="M9.2 20.5a4.2 4.2 0 1 1 3.3-6.7" />
      <path d="m14.8 13.7 2.4 6.3" />
      <path d="M11.5 14.2h5.2" />
    </IconShell>
  );
}

function ScoreIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <path d="M8 7h8" />
      <path d="M8 12h8" />
      <path d="M8 17h5" />
      <rect x="3" y="4" width="18" height="16" rx="2" />
    </IconShell>
  );
}

const NAV_ICONS: Record<
  Exclude<ReportTab, "search">,
  (props: IconProps) => ReactNode
> = {
  "my-team": MyTeamIcon,
  standings: StandingsIcon,
  players: PlayersIcon,
  schedule: ScheduleIcon,
  handicap: HandicapIcon,
  score: ScoreIcon,
};

export function NavTabIcon({
  id,
  className,
}: {
  id: Exclude<ReportTab, "search">;
  className?: string;
}) {
  const Icon = NAV_ICONS[id];
  return <Icon className={className} />;
}
