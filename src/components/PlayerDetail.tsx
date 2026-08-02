"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  FargoLeagueTeam,
  FargoPlayerMatch,
  FargoPlayerProfile,
  FargoStatsByRating,
  FargoStatsOverall,
} from "@/lib/fargo-player";

type PlayerDetailProps = {
  playerId: string;
  fallbackName?: string;
  onBack: () => void;
};

type DetailPayload = {
  player: FargoPlayerProfile;
  teams: FargoLeagueTeam[];
  error?: string;
};

type MatchesPayload = {
  matches: FargoPlayerMatch[];
  total: number;
  page: number;
  totalPages: number;
  error?: string;
};

function statusLabel(status: FargoPlayerProfile["robustnessStatus"]): string {
  if (status === "established") return "Established";
  if (status === "preliminary") return "Preliminary";
  return "Starter";
}

function statusClass(status: FargoPlayerProfile["robustnessStatus"]): string {
  if (status === "established") {
    return "bg-[var(--felt)]/20 text-[var(--felt-deep)]";
  }
  if (status === "preliminary") {
    return "bg-[var(--amber)]/15 text-[var(--amber)]";
  }
  return "bg-[var(--surface-2)] text-[var(--muted)]";
}

function temporalLabel(temporalType: number): string {
  return temporalType === 1 ? "Recent" : "All-time";
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatMonth(entry: {
  month: number;
  year: number;
  timestamp: string;
}): string {
  if (entry.month && entry.year) {
    const date = new Date(Date.UTC(entry.year, entry.month - 1, 1));
    return date.toLocaleDateString(undefined, {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  return formatDate(entry.timestamp);
}

function winPct(wins: number, loses: number): number {
  const total = wins + loses;
  if (total <= 0) return 0;
  return Math.round((wins / total) * 100);
}

function pickOverall(
  stats: FargoStatsOverall[],
  temporalType: number,
): FargoWinLossView | null {
  const row = stats.find((item) => item.temporalType === temporalType);
  if (!row?.winLoss) return null;
  return {
    wins: row.winLoss.wins,
    loses: row.winLoss.loses,
    label: temporalLabel(temporalType),
  };
}

type FargoWinLossView = {
  wins: number;
  loses: number;
  label: string;
};

function pickByRating(
  stats: FargoStatsByRating[],
  temporalType: number,
): FargoStatsByRating | null {
  return stats.find((item) => item.temporalType === temporalType) ?? null;
}

function RatingSparkline({
  values,
}: {
  values: number[];
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const width = 240;
  const height = 56;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / span) * (height - 8) - 4;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-14 w-full max-w-sm text-[var(--felt-deep)]"
      role="img"
      aria-label="Rating history sparkline"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

function StatPill({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="min-w-0 flex-1 rounded-2xl border border-[var(--line)] bg-[var(--surface)]/90 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-1 font-[family-name:var(--font-display)] text-xl tabular-nums text-[var(--felt-deep)]">
        {value}
      </p>
    </div>
  );
}

export function PlayerDetail({
  playerId,
  fallbackName,
  onBack,
}: PlayerDetailProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [player, setPlayer] = useState<FargoPlayerProfile | null>(null);
  const [teams, setTeams] = useState<FargoLeagueTeam[]>([]);

  const [matchesLoading, setMatchesLoading] = useState(true);
  const [matchesError, setMatchesError] = useState<string | null>(null);
  const [matches, setMatches] = useState<FargoPlayerMatch[]>([]);
  const [matchesTotal, setMatchesTotal] = useState(0);
  const [matchesPage, setMatchesPage] = useState(1);
  const [matchesTotalPages, setMatchesTotalPages] = useState(1);
  const [statsWindow, setStatsWindow] = useState<0 | 1>(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPlayer(null);
    setTeams([]);

    void fetch(`/api/players/${encodeURIComponent(playerId)}`)
      .then(async (response) => {
        const payload = (await response.json()) as DetailPayload;
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load player.");
        }
        if (cancelled) return;
        setPlayer(payload.player);
        setTeams(payload.teams ?? []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load player.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [playerId]);

  useEffect(() => {
    let cancelled = false;
    setMatchesLoading(true);
    setMatchesError(null);

    void fetch(
      `/api/players/${encodeURIComponent(playerId)}/matches?page=${matchesPage}&limit=25`,
    )
      .then(async (response) => {
        const payload = (await response.json()) as MatchesPayload;
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load matches.");
        }
        if (cancelled) return;
        setMatches(payload.matches ?? []);
        setMatchesTotal(payload.total ?? 0);
        setMatchesTotalPages(payload.totalPages ?? 1);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setMatches([]);
        setMatchesError(
          err instanceof Error ? err.message : "Failed to load matches.",
        );
      })
      .finally(() => {
        if (!cancelled) setMatchesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [playerId, matchesPage]);

  const overall = useMemo(
    () => (player ? pickOverall(player.statsOverall, statsWindow) : null),
    [player, statsWindow],
  );
  const byRating = useMemo(
    () => (player ? pickByRating(player.statsByRating, statsWindow) : null),
    [player, statsWindow],
  );
  const historyValues = useMemo(
    () => (player?.ratingHistory ?? []).map((entry) => entry.rating),
    [player],
  );

  const uniqueTeams = useMemo(() => {
    const seen = new Set<string>();
    return teams.filter((team) => {
      const key = `${team.leagueId}:${team.divisionId}:${team.teamId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [teams]);

  return (
    <section className="space-y-4 md:space-y-5">
      <div className="sticky top-[5.75rem] z-10 -mx-1 space-y-3 bg-[color-mix(in_srgb,var(--paper)_94%,transparent)] px-1 py-2 backdrop-blur sm:top-[3.75rem]">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--felt-deep)] underline-offset-2 hover:underline"
        >
          <span aria-hidden>←</span> Back to search
        </button>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--amber)]">
              Player
            </p>
            <h3 className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--felt-deep)]">
              {player?.name || fallbackName || "Player details"}
            </h3>
            {player ? (
              <p className="mt-1 text-sm text-[var(--muted)]">
                {[
                  player.readableId ? `#${player.readableId}` : null,
                  player.membershipNumber || player.membershipId,
                  player.location,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}
          </div>
          {player ? (
            <div className="shrink-0 text-right">
              <p className="font-[family-name:var(--font-display)] text-3xl tabular-nums leading-none text-[var(--felt-deep)]">
                {player.effectiveRating ?? "—"}
              </p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                Rating
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-[var(--muted)]">
          Loading player stats…
        </p>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger-bg)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      {player ? (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <span
              className={[
                "inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]",
                statusClass(player.robustnessStatus),
              ].join(" ")}
            >
              {statusLabel(player.robustnessStatus)}
              {player.robustness != null ? ` · ${player.robustness}` : ""}
            </span>
            {player.provisionalRating != null ? (
              <span className="inline-flex rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                Provisional · {player.provisionalRating}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <StatPill label="Effective" value={player.effectiveRating ?? "—"} />
            <StatPill label="Rating" value={player.rating ?? "—"} />
            <StatPill label="Robustness" value={player.robustness ?? "—"} />
            <StatPill
              label="Provisional"
              value={player.provisionalRating ?? "—"}
            />
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h4 className="font-[family-name:var(--font-display)] text-lg text-[var(--felt-deep)]">
                  Overall record
                </h4>
                <p className="text-sm text-[var(--muted)]">
                  Wins and losses from FargoRate.
                </p>
              </div>
              <div className="inline-flex rounded-full border border-[var(--line)] bg-[var(--surface)] p-0.5">
                {(
                  [
                    [0, "All-time"],
                    [1, "Recent"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setStatsWindow(value)}
                    className={[
                      "rounded-full px-3 py-1 text-xs font-semibold transition",
                      statsWindow === value
                        ? "bg-[var(--felt)] text-white"
                        : "text-[var(--muted)] hover:text-[var(--ink)]",
                    ].join(" ")}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {overall ? (
              <div className="grid grid-cols-3 gap-2">
                <StatPill label="Wins" value={overall.wins} />
                <StatPill label="Losses" value={overall.loses} />
                <StatPill
                  label="Win %"
                  value={`${winPct(overall.wins, overall.loses)}%`}
                />
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)]">
                No overall stats available.
              </p>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <h4 className="font-[family-name:var(--font-display)] text-lg text-[var(--felt-deep)]">
                Stats by opponent rating
              </h4>
              <p className="text-sm text-[var(--muted)]">
                {temporalLabel(statsWindow)} results by rating band.
              </p>
            </div>

            {byRating?.buckets?.length ? (
              <ul className="space-y-2">
                {byRating.buckets.map((bucket) => {
                  const total = bucket.winLoss.wins + bucket.winLoss.loses;
                  const pct = winPct(bucket.winLoss.wins, bucket.winLoss.loses);
                  return (
                    <li
                      key={`${statsWindow}-${bucket.bucket}`}
                      className="rounded-2xl border border-[var(--line)] bg-[var(--surface)]/80 px-3 py-2.5"
                    >
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-semibold tabular-nums text-[var(--ink)]">
                          {bucket.bucket}s
                        </span>
                        <span className="tabular-nums text-[var(--muted)]">
                          {bucket.winLoss.wins}–{bucket.winLoss.loses}
                          {total > 0 ? ` · ${pct}%` : ""}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)]">
                        <div
                          className="h-full rounded-full bg-[var(--felt)] transition-[width] duration-300"
                          style={{ width: `${total > 0 ? pct : 0}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-[var(--muted)]">
                No rating-band stats available.
              </p>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <h4 className="font-[family-name:var(--font-display)] text-lg text-[var(--felt-deep)]">
                Rating history
              </h4>
              <p className="text-sm text-[var(--muted)]">
                Monthly rating snapshots.
              </p>
            </div>

            {player.ratingHistory.length ? (
              <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)]/80 px-4 py-3">
                <div className="flex items-end justify-between gap-3">
                  <RatingSparkline values={historyValues} />
                  <div className="shrink-0 text-right text-xs text-[var(--muted)]">
                    <p>
                      {formatMonth(player.ratingHistory[0])} →{" "}
                      {formatMonth(
                        player.ratingHistory[player.ratingHistory.length - 1],
                      )}
                    </p>
                    <p className="mt-1 tabular-nums">
                      {Math.round(historyValues[0] ?? 0)} →{" "}
                      {Math.round(historyValues[historyValues.length - 1] ?? 0)}
                    </p>
                  </div>
                </div>
                <ul className="mt-3 max-h-48 space-y-1.5 overflow-y-auto border-t border-[var(--line)] pt-3">
                  {[...player.ratingHistory].reverse().map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="text-[var(--muted)]">
                        {formatMonth(entry)}
                      </span>
                      <span className="tabular-nums font-medium text-[var(--ink)]">
                        {entry.rating.toFixed(1)}
                        <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                          rob {Math.round(entry.robustness)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)]">
                No rating history available.
              </p>
            )}
          </div>

          {uniqueTeams.length ? (
            <div className="space-y-3">
              <div>
                <h4 className="font-[family-name:var(--font-display)] text-lg text-[var(--felt-deep)]">
                  League teams
                </h4>
                <p className="text-sm text-[var(--muted)]">
                  Active LMS memberships linked to this player.
                </p>
              </div>
              <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-[1.3rem] border border-[var(--line)] bg-[var(--surface)]/90">
                {uniqueTeams.map((team) => (
                  <li
                    key={`${team.leagueId}-${team.divisionId}-${team.teamId}`}
                    className="px-4 py-3"
                  >
                    <p className="font-medium text-[var(--ink)]">
                      {team.teamName}
                    </p>
                    <p className="mt-0.5 text-sm text-[var(--muted)]">
                      {team.leagueName} · {team.divisionName}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h4 className="font-[family-name:var(--font-display)] text-lg text-[var(--felt-deep)]">
                  Match history
                </h4>
                <p className="text-sm text-[var(--muted)]">
                  {matchesTotal
                    ? `${matchesTotal.toLocaleString()} matches on record`
                    : "Recent results against opponents"}
                </p>
              </div>
              {matchesTotalPages > 1 ? (
                <p className="text-xs tabular-nums text-[var(--muted)]">
                  Page {matchesPage} of {matchesTotalPages}
                </p>
              ) : null}
            </div>

            {matchesError ? (
              <div className="rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger-bg)] px-4 py-3 text-sm text-[var(--danger)]">
                {matchesError}
              </div>
            ) : null}

            {matchesLoading && !matches.length ? (
              <p className="py-4 text-center text-sm text-[var(--muted)]">
                Loading matches…
              </p>
            ) : null}

            {!matchesLoading && !matchesError && !matches.length ? (
              <p className="text-sm text-[var(--muted)]">No matches found.</p>
            ) : null}

            {matches.length ? (
              <ul
                className={[
                  "divide-y divide-[var(--line)] overflow-hidden rounded-[1.3rem] border border-[var(--line)] bg-[var(--surface)]/90 transition-opacity",
                  matchesLoading ? "opacity-60" : "opacity-100",
                ].join(" ")}
              >
                {matches.map((match) => (
                  <li
                    key={match.id}
                    className="flex items-start justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-[var(--ink)]">
                        vs {match.opponentName}
                        {match.opponentReadableId
                          ? ` (#${match.opponentReadableId})`
                          : ""}
                      </p>
                      <p className="mt-0.5 text-sm text-[var(--muted)]">
                        {[
                          formatDate(match.datePlayed),
                          match.event,
                          match.isLeague
                            ? "League"
                            : match.isTournament
                              ? "Tournament"
                              : match.isThirdParty
                                ? "Third-party"
                                : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={[
                          "font-[family-name:var(--font-display)] text-xl tabular-nums leading-none",
                          match.result === "win"
                            ? "text-[var(--felt-deep)]"
                            : match.result === "loss"
                              ? "text-[var(--danger)]"
                              : "text-[var(--muted)]",
                        ].join(" ")}
                      >
                        {match.playerScore}–{match.opponentScore}
                      </p>
                      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                        {match.result}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}

            {matchesTotalPages > 1 ? (
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={matchesPage <= 1 || matchesLoading}
                  onClick={() => setMatchesPage((page) => Math.max(1, page - 1))}
                  className="rounded-full bg-[var(--surface-2)] px-3.5 py-1.5 text-sm font-semibold text-[var(--ink)] transition hover:bg-[var(--surface-3)] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={matchesPage >= matchesTotalPages || matchesLoading}
                  onClick={() =>
                    setMatchesPage((page) =>
                      Math.min(matchesTotalPages, page + 1),
                    )
                  }
                  className="rounded-full bg-[var(--surface-2)] px-3.5 py-1.5 text-sm font-semibold text-[var(--ink)] transition hover:bg-[var(--surface-3)] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  Next
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
