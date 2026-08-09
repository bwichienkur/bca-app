"use client";

import { useMemo, useState } from "react";
import { normalizeTeamName } from "@/lib/matchups";
import { isUpcomingScheduleDate, parseScheduleDate } from "@/lib/schedule";
import { rankForTeam, teamRanksFromReport } from "@/lib/standings";
import type { ScheduleDay, ScheduleMatch, TableReport } from "@/lib/types";
import { EmptyState } from "./EmptyState";
import {
  IconSubTabs,
  PastSubIcon,
  UpcomingSubIcon,
} from "./IconSubTabs";
import { MatchListCard } from "./MatchListCard";
import { PanelHeader, PanelHeaderCount } from "./PanelHeader";
import { SubTabCard } from "./SubTabCard";

type ScheduleListProps = {
  days: ScheduleDay[];
  teamName?: string | null;
  divisionName?: string | null;
  /** Division standings — used for Home/Away rank badges. */
  teamReport?: TableReport | null;
  onMatchClick?: (match: ScheduleMatch, day: ScheduleDay) => void;
};

type ScheduleView = "upcoming" | "past";

type FlatMatch = {
  key: string;
  day: ScheduleDay;
  match: ScheduleMatch;
  upcoming: boolean;
};

function formatScheduleDate(value: string): string {
  const date = parseScheduleDate(value);
  if (!date) return value;
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function ScheduleList({
  days,
  teamName,
  divisionName,
  teamReport = null,
  onMatchClick,
}: ScheduleListProps) {
  const [view, setView] = useState<ScheduleView>("upcoming");
  const teamRanks = useMemo(
    () => teamRanksFromReport(teamReport),
    [teamReport],
  );

  const teamDays = useMemo(() => {
    if (!teamName) return days;
    const target = normalizeTeamName(teamName);
    return days
      .map((day) => ({
        ...day,
        matches: day.matches.filter(
          (match) =>
            normalizeTeamName(match.home) === target ||
            normalizeTeamName(match.away) === target,
        ),
      }))
      .filter((day) => day.matches.length > 0);
  }, [days, teamName]);

  const { upcomingMatches, pastMatches } = useMemo(() => {
    const upcoming: FlatMatch[] = [];
    const past: FlatMatch[] = [];
    for (const day of teamDays) {
      const isUpcoming = isUpcomingScheduleDate(day.date);
      day.matches.forEach((match, index) => {
        const item: FlatMatch = {
          key: `${day.date}-${index}-${match.matchId ?? match.home}`,
          day,
          match,
          upcoming: isUpcoming,
        };
        if (isUpcoming) upcoming.push(item);
        else past.push(item);
      });
    }
    return {
      upcomingMatches: upcoming,
      pastMatches: [...past].reverse(),
    };
  }, [teamDays]);

  const visibleMatches =
    view === "upcoming" ? upcomingMatches : pastMatches;
  const myTeam = teamName ? normalizeTeamName(teamName) : null;

  if (!teamDays.length) {
    return (
      <EmptyState
        title={teamName ? "No matches for this team" : "No scheduled matches"}
        body={
          teamName
            ? "Pick another team or clear the team filter."
            : "Schedule data wasn’t available for this division."
        }
      />
    );
  }

  return (
    <section className="animate-rise">
      <SubTabCard
        className="rounded-none border-0 shadow-none"
        tabs={
          <IconSubTabs
            aria-label="Schedule time range"
            value={view}
            onChange={setView}
            className="rounded-none border-0 bg-transparent p-0"
            items={[
              {
                id: "upcoming",
                label: "Upcoming",
                icon: UpcomingSubIcon,
                count: upcomingMatches.length,
              },
              {
                id: "past",
                label: "Past",
                icon: PastSubIcon,
                count: pastMatches.length,
              },
            ]}
          />
        }
      >
        <PanelHeader
          title="Your schedule"
          description={
            <>
              {teamName ? (
                <>
                  Upcoming and past matchups for{" "}
                  <span className="font-medium text-[var(--ink)]">
                    {teamName}
                  </span>
                </>
              ) : (
                "Division schedule"
              )}
              {divisionName ? <> · {divisionName}</> : null}
              . Use Score to open a scoresheet.
            </>
          }
          action={
            <PanelHeaderCount
              label={view === "upcoming" ? "Upcoming" : "Past"}
              value={String(visibleMatches.length)}
            />
          }
        />
        {!visibleMatches.length ? (
          <EmptyState
            title={
              view === "upcoming" ? "No upcoming matches" : "No past matches"
            }
            body={
              view === "upcoming"
                ? "Matches stay here through their scheduled day, then move to Past."
                : "Past match days will show up here after they pass."
            }
          />
        ) : (
          <div className="space-y-2.5">
            {visibleMatches.map((item, index) => {
              const { match, day } = item;
              const isMyMatch = Boolean(
                myTeam &&
                  (normalizeTeamName(match.home) === myTeam ||
                    normalizeTeamName(match.away) === myTeam),
              );
              return (
                <MatchListCard
                  key={item.key}
                  className="animate-rise"
                  style={{ animationDelay: `${Math.min(index, 6) * 0.04}s` }}
                  homeName={match.home}
                  awayName={match.away}
                  meta={formatScheduleDate(day.date)}
                  location={match.location || undefined}
                  ctaLabel="View"
                  isMyMatch={isMyMatch}
                  homeRank={rankForTeam(teamRanks, match.home)}
                  awayRank={rankForTeam(teamRanks, match.away)}
                  emphasizeHome={
                    Boolean(
                      myTeam && normalizeTeamName(match.home) === myTeam,
                    )
                  }
                  emphasizeAway={
                    Boolean(
                      myTeam && normalizeTeamName(match.away) === myTeam,
                    )
                  }
                  onClick={() => onMatchClick?.(match, day)}
                />
              );
            })}
          </div>
        )}
      </SubTabCard>
    </section>
  );
}
