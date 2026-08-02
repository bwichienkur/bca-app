"use client";

import { useMemo, useState } from "react";
import { normalizeTeamName } from "@/lib/matchups";
import { isUpcomingScheduleDate, parseScheduleDate } from "@/lib/schedule";
import type { ScheduleDay, ScheduleMatch } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "./EmptyState";
import { MatchListCard } from "./MatchListCard";

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

  const description = (
    <>
      {teamName ? (
        <>
          Upcoming and past matchups for{" "}
          <span className="font-medium text-[var(--ink)]">{teamName}</span>
        </>
      ) : (
        "Division schedule"
      )}
      {divisionName ? <> · {divisionName}</> : null}
      . Use Score to open a scoresheet.
    </>
  );

  if (!teamDays.length) {
    return (
      <section className="animate-rise space-y-6">
        <PageHeader
          eyebrow="Schedule"
          title="Your schedule"
          description={description}
        />
        <EmptyState
          title={teamName ? "No matches for this team" : "No scheduled matches"}
          body={
            teamName
              ? "Pick another team or clear the team filter."
              : "Schedule data wasn’t available for this division."
          }
        />
      </section>
    );
  }

  return (
    <section className="animate-rise space-y-6">
      <PageHeader
        eyebrow="Schedule"
        title="Your schedule"
        description={description}
      />

      <div className="flex flex-wrap items-center gap-2">
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
              onClick={() => setView(item.id)}
              className={[
                "ui-focus rounded-full border px-4 py-2 text-sm font-semibold transition",
                active
                  ? "border-[color-mix(in_srgb,var(--felt)_40%,transparent)] bg-[color-mix(in_srgb,var(--felt)_18%,transparent)] text-[var(--chalk)]"
                  : "border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]",
              ].join(" ")}
            >
              {item.label}
              <span
                className={[
                  "ml-1.5 tabular-nums",
                  active ? "text-[var(--ink-secondary)]" : "text-[var(--muted)]",
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
          title={view === "upcoming" ? "No upcoming matches" : "No past matches"}
          body={
            view === "upcoming"
              ? "Matches stay here through their scheduled day, then move to Past."
              : "Past match days will show up here after they pass."
          }
        />
      ) : (
        <div className="space-y-3">
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
    </section>
  );
}
