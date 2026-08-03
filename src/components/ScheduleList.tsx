"use client";

import { useMemo, useState } from "react";
import { normalizeTeamName } from "@/lib/matchups";
import { isUpcomingScheduleDate, parseScheduleDate } from "@/lib/schedule";
import type { ScheduleDay, ScheduleMatch } from "@/lib/types";
import { EmptyState } from "./EmptyState";
import { MatchListCard } from "./MatchListCard";
import { SectionCard } from "./SectionCard";

type ScheduleListProps = {
  days: ScheduleDay[];
  teamName?: string | null;
  divisionName?: string | null;
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
  onMatchClick,
}: ScheduleListProps) {
  const [view, setView] = useState<ScheduleView>("upcoming");

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
      <SectionCard
        eyebrow="Schedule"
        title="Your schedule"
        description={
          <>
            {teamName ? (
              <>
                Upcoming and past matchups for{" "}
                <span className="font-medium text-white">{teamName}</span>
              </>
            ) : (
              "Division schedule"
            )}
            {divisionName ? <> · {divisionName}</> : null}
            . Use Score to open a scoresheet.
          </>
        }
        badge={{
          label: view === "upcoming" ? "Upcoming" : "Past",
          value: String(visibleMatches.length),
        }}
      >
        <div
          role="group"
          aria-label="Schedule time range"
          className="inline-flex rounded-full border border-[var(--line)] bg-[var(--surface-2)] p-0.5"
        >
          {(
            [
              {
                id: "upcoming" as const,
                label: "Upcoming",
                count: upcomingMatches.length,
              },
              { id: "past" as const, label: "Past", count: pastMatches.length },
            ]
          ).map((item) => {
            const active = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => setView(item.id)}
                className={[
                  "rounded-full px-3.5 py-1.5 text-sm font-semibold transition",
                  active
                    ? "bg-[var(--felt)] text-white"
                    : "text-[var(--muted)] hover:text-[var(--ink)]",
                ].join(" ")}
              >
                {item.label}
                <span
                  className={[
                    "ml-1.5 tabular-nums",
                    active ? "text-white/80" : "text-[var(--muted)]",
                  ].join(" ")}
                >
                  {item.count}
                </span>
              </button>
            );
          })}
        </div>

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
              const status = [
                item.upcoming ? "Upcoming" : "Played",
                myTeam &&
                (normalizeTeamName(match.home) === myTeam ||
                  normalizeTeamName(match.away) === myTeam)
                  ? "Your match"
                  : null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <MatchListCard
                  key={item.key}
                  className="animate-rise"
                  style={{ animationDelay: `${Math.min(index, 6) * 0.04}s` }}
                  homeName={match.home}
                  awayName={match.away}
                  meta={formatScheduleDate(day.date)}
                  location={match.location || undefined}
                  status={status}
                  ctaLabel="View"
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
      </SectionCard>
    </section>
  );
}
