import type { AppPillar, ReportTab } from "@/lib/types";
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

function EventsIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <path d="M8 4v3" />
      <path d="M16 4v3" />
      <path d="M5 9h14" />
      <path d="M6 7h12a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" />
      <path d="m9.5 14 1.5 1.5 3.5-3.5" />
    </IconShell>
  );
}

function LmsIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18" />
      <path d="M8 13h3" />
      <path d="M8 17h8" />
    </IconShell>
  );
}

function HomePillarIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z" />
    </IconShell>
  );
}

function LeaguePillarIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v18" />
      <path d="M3 12h18" />
      <path d="M5.5 7.5c2.2 1.4 4.3 2.1 6.5 2.1s4.3-.7 6.5-2.1" />
      <path d="M5.5 16.5c2.2-1.4 4.3-2.1 6.5-2.1s4.3.7 6.5 2.1" />
    </IconShell>
  );
}

function ManagePillarIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <path d="M12 3v3" />
      <path d="M12 18v3" />
      <path d="m5.6 5.6 2.1 2.1" />
      <path d="m16.3 16.3 2.1 2.1" />
      <path d="M3 12h3" />
      <path d="M18 12h3" />
      <path d="m5.6 18.4 2.1-2.1" />
      <path d="m16.3 7.7 2.1-2.1" />
      <circle cx="12" cy="12" r="3.2" />
    </IconShell>
  );
}

function AccountPillarIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" />
    </IconShell>
  );
}

type LeafNavId = Exclude<ReportTab, "search" | "account" | "create-league">;

const NAV_ICONS: Record<LeafNavId, (props: IconProps) => ReactNode> = {
  "my-team": MyTeamIcon,
  standings: StandingsIcon,
  players: PlayersIcon,
  schedule: ScheduleIcon,
  handicap: HandicapIcon,
  events: EventsIcon,
  score: ScoreIcon,
  lms: LmsIcon,
};

const PILLAR_ICONS: Record<AppPillar, (props: IconProps) => ReactNode> = {
  home: HomePillarIcon,
  league: LeaguePillarIcon,
  manage: ManagePillarIcon,
  account: AccountPillarIcon,
};

export function NavTabIcon({
  id,
  className,
}: {
  id: LeafNavId;
  className?: string;
}) {
  const Icon = NAV_ICONS[id];
  return <Icon className={className} />;
}

export function PillarIcon({
  id,
  className,
}: {
  id: AppPillar;
  className?: string;
}) {
  const Icon = PILLAR_ICONS[id];
  return <Icon className={className} />;
}
