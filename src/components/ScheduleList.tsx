"use client";

import { useMemo, useState } from "react";
import {
  combineScheduleMatchupsForDay,
  type CombinedScheduleMatchup,
} from "@/lib/combined-night-matchup";
import { isUpcomingScheduleDate, parseScheduleDate } from "@/lib/schedule";
import { rankForTeam, teamRanksFromReport } from "@/lib/standings";
import { teamsMatchByName } from "@/lib/division-combos";
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
  /** Highlight this team without filtering the list (Bright browse-all). */
  highlightTeamName?: string | null;
  /** When true, show every matchup in the division (ignore teamName filter). */
  showAllTeams?: boolean;
  divisionName?: string | null;
  /** Division standings — used for Home/Away rank badges. */
  teamReport?: TableReport | null;
  onMatchClick?: (match: ScheduleMatch, day: ScheduleDay) => void;
};

type ScheduleView = "upcoming" | "past";

type FlatMatchup = {
  key: string;
  day: ScheduleDay;
  matchup: CombinedScheduleMatchup;
  /** Representative match for detail navigation (prefer Singles). */
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
  highlightTeamName = null,
  showAllTeams = false,
  divisionName,
  teamReport = null,
  onMatchClick,
}: ScheduleListProps) {
  const [view, setView] = useState<ScheduleView>("upcoming");
  const teamRanks = useMemo(
    () => teamRanksFromReport(teamReport),
    [teamReport],
  );

  const linked = useMemo(
    () => days.some((day) => day.matches.some((match) => match.partLabel)),
    [days],
  );

  const teamDays = useMemo(() => {
    if (showAllTeams || !teamName) return days;
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
  }, [days, teamName, showAllTeams]);

  const { upcomingMatchups, pastMatchups } = useMemo(() => {
    const upcoming: FlatMatchup[] = [];
    const past: FlatMatchup[] = [];
    for (const day of teamDays) {
      const isUpcoming = isUpcomingScheduleDate(day.date);
      const matchups = combineScheduleMatchupsForDay({
        date: day.date,
        matches: day.matches,
        linked,
      });
      for (const matchup of matchups) {
        const match =
          matchup.halves.find((half) => half.kind === "singles")?.match ??
          matchup.halves[0]?.match;
        if (!match) continue;
        const item: FlatMatchup = {
          key: matchup.key,
          day,
          matchup,
          match,
          upcoming: isUpcoming,
        };
        if (isUpcoming) upcoming.push(item);
        else past.push(item);
      }
    }
    return {
      upcomingMatchups: upcoming,
      pastMatchups: [...past].reverse(),
    };
  }, [teamDays, linked]);

  const visibleMatchups =
    view === "upcoming" ? upcomingMatchups : pastMatchups;
  const myTeam = highlightTeamName ?? teamName ?? null;

  if (!teamDays.length) {
    return (
      <EmptyState
        title={
          !showAllTeams && teamName
            ? "No matches for this team"
            : "No scheduled matches"
        }
        body={
          !showAllTeams && teamName
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
          title={showAllTeams ? "Division schedule" : "Your schedule"}
          description={
            <>
              {showAllTeams ? (
                <>
                  Every matchup in the division
                  {myTeam ? (
                    <>
                      {" "}
                      · following{" "}
                      <span className="font-medium text-[var(--ink)]">
                        {myTeam}
                      </span>
                    </>
                  ) : null}
                </>
              ) : teamName ? (
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
              {linked ? (
                <>
                  . One card per night opponent — Singles and Teams share the
                  scoresheet entry on Score.
                </>
              ) : (
                <>. Use Score to open a scoresheet.</>
              )}
            </>
          }
          action={
            <PanelHeaderCount
              label={view === "upcoming" ? "Upcoming" : "Past"}
              value={String(visibleMatchups.length)}
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
                count: upcomingMatchups.length,
              },
              {
                id: "past",
                label: "Past",
                icon: PastSubIcon,
                count: pastMatchups.length,
              },
            ]}
          />
        }
      >
        {!visibleMatchups.length ? (
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
            {visibleMatchups.map((item, index) => {
              const { match, day, matchup } = item;
              const isMyMatch = Boolean(
                myTeam &&
                  (teamsMatchByName(matchup.homeName, myTeam) ||
                    teamsMatchByName(matchup.awayName, myTeam)),
              );
              return (
                <MatchListCard
                  key={item.key}
                  className="animate-rise"
                  style={{
                    animationDelay: `${Math.min(index, 6) * 0.04}s`,
                  }}
                  homeName={matchup.homeName}
                  awayName={matchup.awayName}
                  badge={
                    linked
                      ? matchup.completePair
                        ? "Combined"
                        : matchup.halves[0]?.label ||
                          (matchup.halves[0]?.kind === "teams"
                            ? "Teams"
                            : "Singles")
                      : null
                  }
                  meta={formatScheduleDate(day.date)}
                  location={matchup.location || undefined}
                  ctaLabel="View"
                  isMyMatch={isMyMatch}
                  homeRank={rankForTeam(teamRanks, matchup.homeName)}
                  awayRank={rankForTeam(teamRanks, matchup.awayName)}
                  emphasizeHome={Boolean(
                    myTeam && teamsMatchByName(matchup.homeName, myTeam),
                  )}
                  emphasizeAway={Boolean(
                    myTeam && teamsMatchByName(matchup.awayName, myTeam),
                  )}
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
