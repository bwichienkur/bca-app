"use client";

import { useMemo, useState } from "react";
import { canonicalizeTeamKey, teamsMatchByName } from "@/lib/division-combos";
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

type NightGroup = {
  date: string;
  dateLabel: string;
  matches: FlatMatch[];
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

function partOrder(label: string | null | undefined): number {
  const l = (label ?? "").toLowerCase();
  if (l === "singles") return 0;
  if (l === "teams") return 1;
  return 2;
}

function groupByNight(items: FlatMatch[]): NightGroup[] {
  const byDate = new Map<string, FlatMatch[]>();
  for (const item of items) {
    const key = item.day.date.trim();
    const list = byDate.get(key) ?? [];
    list.push(item);
    byDate.set(key, list);
  }
  return Array.from(byDate.entries()).map(([date, matches]) => ({
    date,
    dateLabel: formatScheduleDate(date),
    matches: [...matches].sort(
      (a, b) =>
        partOrder(a.match.partLabel) - partOrder(b.match.partLabel) ||
        a.match.home.localeCompare(b.match.home),
    ),
  }));
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
    return days
      .map((day) => ({
        ...day,
        matches: day.matches.filter(
          (match) =>
            teamsMatchByName(match.home, teamName) ||
            teamsMatchByName(match.away, teamName),
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
          key: `${day.date}:${match.divisionId ?? ""}:${match.matchId ?? index}:${canonicalizeTeamKey(match.home)}-${canonicalizeTeamKey(match.away)}`,
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
  const nightGroups = useMemo(
    () => groupByNight(visibleMatches),
    [visibleMatches],
  );
  const hasLinkedParts = visibleMatches.some((item) => item.match.partLabel);
  const myTeam = teamName ?? null;

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
    <section className="animate-rise space-y-3">
      <div className="px-3 pt-3 sm:px-4 sm:pt-4">
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
              {hasLinkedParts ? (
                <>
                  . Combined night — Singles and Teams halves share a date;
                  each half has its own matchup and lineup.
                </>
              ) : (
                <>. Use Score to open a scoresheet.</>
              )}
            </>
          }
          action={
            <PanelHeaderCount
              label={view === "upcoming" ? "Upcoming" : "Past"}
              value={String(visibleMatches.length)}
            />
          }
        />
      </div>
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
          <div className="space-y-4">
            {nightGroups.map((night) => (
              <div key={night.date} className="space-y-2.5">
                {hasLinkedParts ? (
                  <div className="px-0.5">
                    <p className="font-[family-name:var(--font-display)] text-[15px] font-semibold tracking-wide text-[var(--amber)]">
                      {night.dateLabel}
                    </p>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                      Combined night · {night.matches.length} sheets
                    </p>
                  </div>
                ) : null}
                {night.matches.map((item, index) => {
                  const { match, day } = item;
                  const isMyMatch = Boolean(
                    myTeam &&
                      (teamsMatchByName(match.home, myTeam) ||
                        teamsMatchByName(match.away, myTeam)),
                  );
                  return (
                    <MatchListCard
                      key={item.key}
                      className="animate-rise"
                      style={{
                        animationDelay: `${Math.min(index, 6) * 0.04}s`,
                      }}
                      homeName={match.home}
                      awayName={match.away}
                      badge={match.partLabel ?? null}
                      meta={
                        hasLinkedParts
                          ? match.partLabel
                            ? `${match.partLabel} · own lineup`
                            : undefined
                          : formatScheduleDate(day.date)
                      }
                      location={match.location || undefined}
                      ctaLabel="View"
                      isMyMatch={isMyMatch}
                      homeRank={rankForTeam(teamRanks, match.home)}
                      awayRank={rankForTeam(teamRanks, match.away)}
                      emphasizeHome={Boolean(
                        myTeam && teamsMatchByName(match.home, myTeam),
                      )}
                      emphasizeAway={Boolean(
                        myTeam && teamsMatchByName(match.away, myTeam),
                      )}
                      onClick={() => onMatchClick?.(match, day)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </SubTabCard>
    </section>
  );
}
