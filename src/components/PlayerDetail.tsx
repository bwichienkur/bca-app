"use client";

import {
  startTransition,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  FargoLeagueTeam,
  FargoMatchType,
  FargoOpponentRecord,
  FargoPlayerMatch,
  FargoPlayerProfile,
  FargoStatsByRating,
  FargoStatsOverall,
  OpponentSort,
} from "@/lib/fargo-player";
import { SearchField } from "./SearchField";
import { SectionCard } from "./SectionCard";

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
  buckets: Array<{ bucket: number; count: number }>;
  matchTypes?: Array<{ type: FargoMatchType; count: number }>;
  ratingsComplete?: boolean;
  error?: string;
};

type DetailSection = "stats" | "leagues" | "matches" | "opponents";
type StatsSubTab = "overview" | "performance";

const SECTIONS: Array<{ id: DetailSection; label: string }> = [
  { id: "stats", label: "Stats" },
  { id: "leagues", label: "Leagues" },
  { id: "matches", label: "Matches" },
  { id: "opponents", label: "Opponents" },
];

const STATS_SUBTABS: Array<{ id: StatsSubTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "performance", label: "By Rating" },
];

type OpponentsPayload = {
  opponents: FargoOpponentRecord[];
  total: number;
  page: number;
  totalPages: number;
  error?: string;
};

const OPPONENT_SORTS: Array<{ id: OpponentSort; label: string }> = [
  { id: "wins", label: "Most wins" },
  { id: "losses", label: "Most losses" },
  { id: "played", label: "Most played" },
  { id: "winpct", label: "Best win %" },
  { id: "name", label: "Name" },
];

function statusLabel(status: FargoPlayerProfile["robustnessStatus"]): string {
  if (status === "established") return "Established";
  if (status === "preliminary") return "Preliminary";
  return "Starter";
}

function statusClass(status: FargoPlayerProfile["robustnessStatus"]): string {
  if (status === "established") {
    return "bg-[var(--felt)] text-white";
  }
  if (status === "preliminary") {
    return "bg-[var(--amber)]/15 text-[var(--amber)]";
  }
  return "bg-[var(--surface-2)] text-[var(--muted)]";
}

function temporalLabel(temporalType: number): string {
  return temporalType === 1 ? "Recent" : "Past 12 months";
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
): { wins: number; loses: number } | null {
  const row = stats.find((item) => item.temporalType === temporalType);
  if (!row?.winLoss) return null;
  return { wins: row.winLoss.wins, loses: row.winLoss.loses };
}

function pickByRating(
  stats: FargoStatsByRating[],
  temporalType: number,
): FargoStatsByRating | null {
  return stats.find((item) => item.temporalType === temporalType) ?? null;
}

function pageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 5) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }
  const pages = new Set<number>([1, total, current]);
  if (current - 1 > 1) pages.add(current - 1);
  if (current + 1 < total) pages.add(current + 1);
  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    if (i > 0 && sorted[i]! - sorted[i - 1]! > 1) out.push("…");
    out.push(sorted[i]!);
  }
  return out;
}

function RatingSparkline({ values }: { values: number[] }) {
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

function StatsWindowToggle({
  value,
  onChange,
}: {
  value: 0 | 1;
  onChange: (next: 0 | 1) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Stats window"
      className="grid w-full grid-cols-2 gap-0.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] p-0.5"
    >
      {(
        [
          [0, "12 months"],
          [1, "Recent"],
        ] as const
      ).map(([option, label]) => {
        const selected = value === option;
        return (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option)}
            className={[
              "rounded-md px-2 py-1.5 text-center text-xs font-semibold transition",
              selected
                ? "bg-[var(--felt)] text-white shadow-sm"
                : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]",
            ].join(" ")}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

type FilterOption<T extends string | number | null> = {
  id: string;
  label: string;
  meta?: string;
  value: T;
};

/** Themed listbox — native <select> menus cannot use app surface/felt colors. */
function ThemedFilterSelect<T extends string | number | null>({
  value,
  options,
  onChange,
  ariaLabel,
  emptyLabel,
}: {
  value: T;
  options: FilterOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  emptyLabel: string;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected =
    options.find((option) => option.value === value) ?? options[0] ?? null;
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent | TouchEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onScroll() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const index = Math.max(
      0,
      options.findIndex((option) => option.value === value),
    );
    setHighlight(index);
  }, [open, options, value]);

  return (
    <div
      ref={rootRef}
      className={["relative min-w-0", open ? "z-30" : ""].join(" ")}
    >
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => setOpen((next) => !next)}
        onKeyDown={(event) => {
          if (
            event.key === "ArrowDown" ||
            event.key === "Enter" ||
            event.key === " "
          ) {
            event.preventDefault();
            setOpen(true);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        className="flex w-full items-center justify-between gap-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-4 py-2.5 text-left text-sm text-[var(--ink)] outline-none ring-[var(--felt-soft)] transition focus:ring-2"
      >
        <span className="min-w-0 truncate font-medium">
          {selected?.label ?? emptyLabel}
          {selected?.meta ? (
            <span className="ml-1.5 font-normal text-[var(--muted)]">
              {selected.meta}
            </span>
          ) : null}
        </span>
        <span aria-hidden className="shrink-0 text-[var(--muted)]">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute mt-1 max-h-72 w-full overflow-y-auto rounded-[var(--radius)] border border-[var(--line-strong)] bg-[var(--surface-2)] py-1 text-[var(--ink)] shadow-[var(--shadow)] [background-color:var(--surface-2)]"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const active = index === highlight;
            return (
              <li key={option.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setHighlight(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={[
                    "flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm",
                    active ? "bg-[var(--surface-3)]" : "bg-[var(--surface-2)]",
                    isSelected
                      ? "font-semibold text-[var(--felt-deep)]"
                      : "text-[var(--ink)]",
                  ].join(" ")}
                >
                  <span>
                    <span className="block">{option.label}</span>
                    {option.meta ? (
                      <span className="mt-0.5 block text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">
                        {option.meta}
                      </span>
                    ) : null}
                  </span>
                  {isSelected ? (
                    <span className="text-[var(--felt)]">✓</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

const MATCH_TYPE_LABELS: Record<FargoMatchType, string> = {
  league: "League",
  tournament: "Tournament",
  thirdparty: "Third-party",
  other: "Other",
};

export function PlayerDetail({
  playerId,
  fallbackName,
  onBack,
}: PlayerDetailProps) {
  const [section, setSection] = useState<DetailSection>("stats");
  const [statsSubTab, setStatsSubTab] = useState<StatsSubTab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [player, setPlayer] = useState<FargoPlayerProfile | null>(null);
  const [teams, setTeams] = useState<FargoLeagueTeam[]>([]);
  const [statsWindow, setStatsWindow] = useState<0 | 1>(0);

  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchesError, setMatchesError] = useState<string | null>(null);
  const [matches, setMatches] = useState<FargoPlayerMatch[]>([]);
  const [matchesTotal, setMatchesTotal] = useState(0);
  const [matchesPage, setMatchesPage] = useState(1);
  const [matchesTotalPages, setMatchesTotalPages] = useState(1);
  const [matchQuery, setMatchQuery] = useState("");
  const [debouncedMatchQuery, setDebouncedMatchQuery] = useState("");
  const [matchBucket, setMatchBucket] = useState<number | null>(null);
  const [matchType, setMatchType] = useState<FargoMatchType | null>(null);
  const [bucketCounts, setBucketCounts] = useState<
    Array<{ bucket: number; count: number }>
  >([]);
  const [matchTypeCounts, setMatchTypeCounts] = useState<
    Array<{ type: FargoMatchType; count: number }>
  >([]);
  const [ratingsWarming, setRatingsWarming] = useState(false);

  const [opponentsLoading, setOpponentsLoading] = useState(false);
  const [opponentsError, setOpponentsError] = useState<string | null>(null);
  const [opponents, setOpponents] = useState<FargoOpponentRecord[]>([]);
  const [opponentsTotal, setOpponentsTotal] = useState(0);
  const [opponentsPage, setOpponentsPage] = useState(1);
  const [opponentsTotalPages, setOpponentsTotalPages] = useState(1);
  const [opponentQuery, setOpponentQuery] = useState("");
  const [debouncedOpponentQuery, setDebouncedOpponentQuery] = useState("");
  const [opponentSort, setOpponentSort] = useState<OpponentSort>("wins");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPlayer(null);
    setTeams([]);
    setSection("stats");
    setStatsSubTab("overview");
    setMatchQuery("");
    setDebouncedMatchQuery("");
    setMatchBucket(null);
    setMatchType(null);
    setMatchesPage(1);
    setOpponentQuery("");
    setDebouncedOpponentQuery("");
    setOpponentSort("wins");
    setOpponentsPage(1);

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
    if (section !== "matches") return;
    let cancelled = false;
    // Warm opponent-rating cache when Matches is opened so bucket filters stay usable.
    setRatingsWarming(true);
    void fetch(
      `/api/players/${encodeURIComponent(playerId)}/matches?prefetch=1`,
    )
      .catch(() => null)
      .finally(() => {
        if (!cancelled) setRatingsWarming(false);
      });
    return () => {
      cancelled = true;
    };
  }, [section, playerId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedMatchQuery(matchQuery.trim());
      setMatchesPage(1);
    }, 280);
    return () => window.clearTimeout(timer);
  }, [matchQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedOpponentQuery(opponentQuery.trim());
      setOpponentsPage(1);
    }, 280);
    return () => window.clearTimeout(timer);
  }, [opponentQuery]);

  useEffect(() => {
    if (section !== "opponents") return;

    let cancelled = false;
    setOpponentsLoading(true);
    setOpponentsError(null);

    const params = new URLSearchParams({
      page: String(opponentsPage),
      limit: "20",
      sort: opponentSort,
    });
    if (debouncedOpponentQuery) params.set("q", debouncedOpponentQuery);

    void fetch(
      `/api/players/${encodeURIComponent(playerId)}/opponents?${params.toString()}`,
    )
      .then(async (response) => {
        const payload = (await response.json()) as OpponentsPayload;
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load opponents.");
        }
        if (cancelled) return;
        setOpponents(payload.opponents ?? []);
        setOpponentsTotal(payload.total ?? 0);
        setOpponentsTotalPages(payload.totalPages ?? 1);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setOpponents([]);
        setOpponentsError(
          err instanceof Error ? err.message : "Failed to load opponents.",
        );
      })
      .finally(() => {
        if (!cancelled) setOpponentsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    section,
    playerId,
    opponentsPage,
    debouncedOpponentQuery,
    opponentSort,
  ]);

  useEffect(() => {
    if (section !== "matches") return;

    let cancelled = false;
    setMatchesLoading(true);
    setMatchesError(null);

    const params = new URLSearchParams({
      page: String(matchesPage),
      limit: "20",
    });
    if (debouncedMatchQuery) params.set("q", debouncedMatchQuery);
    if (matchBucket != null) params.set("bucket", String(matchBucket));
    if (matchType) params.set("matchType", matchType);

    void fetch(
      `/api/players/${encodeURIComponent(playerId)}/matches?${params.toString()}`,
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
        setBucketCounts(payload.buckets ?? []);
        setMatchTypeCounts(payload.matchTypes ?? []);
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
  }, [
    section,
    playerId,
    matchesPage,
    debouncedMatchQuery,
    matchBucket,
    matchType,
  ]);

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

  const goToMatchesPage = (next: number) => {
    setMatchesPage(Math.min(Math.max(1, next), matchesTotalPages));
  };

  const goToOpponentsPage = (next: number) => {
    setOpponentsPage(Math.min(Math.max(1, next), opponentsTotalPages));
  };

  const opponentSortOptions = useMemo<FilterOption<OpponentSort>[]>(
    () =>
      OPPONENT_SORTS.map((item) => ({
        id: item.id,
        label: item.label,
        value: item.id,
      })),
    [],
  );

  const bucketOptions = useMemo<FilterOption<number | null>[]>(() => {
    const rows = bucketCounts.length
      ? bucketCounts.filter(({ count }) => count !== 0)
      : [200, 300, 400, 500, 600, 700, 800, 900].map((bucket) => ({
          bucket,
          count: -1,
        }));

    return [
      { id: "all", label: "All ratings", value: null },
      ...rows.map(({ bucket, count }) => ({
        id: String(bucket),
        label: `${bucket}–${bucket + 99}`,
        meta: count >= 0 ? `${count} matches` : undefined,
        value: bucket,
      })),
    ];
  }, [bucketCounts]);

  const matchTypeOptions = useMemo<FilterOption<FargoMatchType | null>[]>(
    () => [
      { id: "all", label: "All types", value: null },
      ...(matchTypeCounts.length
        ? matchTypeCounts.filter(({ count }) => count > 0)
        : (
            [
              "league",
              "tournament",
              "thirdparty",
              "other",
            ] as FargoMatchType[]
          ).map((type) => ({ type, count: -1 }))
      ).map(({ type, count }) => ({
        id: type,
        label: MATCH_TYPE_LABELS[type],
        meta: count >= 0 ? `${count} matches` : undefined,
        value: type,
      })),
    ],
    [matchTypeCounts],
  );

  const playerMeta = player
    ? [
        player.readableId ? `#${player.readableId}` : null,
        player.membershipNumber || player.membershipId,
        player.location,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <section className="space-y-4 md:space-y-5">
      <div className="sticky top-[5.75rem] z-40 -mx-1 space-y-3 bg-[color-mix(in_srgb,var(--paper)_94%,transparent)] px-1 py-2 backdrop-blur sm:top-[3.75rem]">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--line-strong)]"
        >
          <span aria-hidden>←</span>
          Back to search
        </button>

        <SectionCard
          eyebrow="Player"
          title={player?.name || fallbackName || "Player details"}
          description={playerMeta}
          badge={
            player
              ? {
                  label: "Rating",
                  value: String(player.effectiveRating ?? "—"),
                }
              : undefined
          }
        >
          {player ? (
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={[
                  "inline-flex shrink-0 rounded-[var(--radius)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]",
                  statusClass(player.robustnessStatus),
                ].join(" ")}
              >
                {statusLabel(player.robustnessStatus)}
                {player.robustness != null ? ` · ${player.robustness}` : ""}
              </span>
              {player.provisionalRating != null ? (
                <span className="inline-flex shrink-0 rounded-[var(--radius)] bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                  Provisional · {player.provisionalRating}
                </span>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">Loading profile…</p>
          )}
        </SectionCard>

        <div
          role="tablist"
          aria-label="Player detail sections"
          className="grid w-full grid-cols-4 gap-0.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] p-0.5"
        >
          {SECTIONS.map((item) => {
            const selected = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() =>
                  startTransition(() => setSection(item.id))
                }
                className={[
                  "min-w-0 rounded-md px-1 py-1.5 text-center text-[11px] font-semibold leading-tight transition sm:px-2 sm:text-sm",
                  selected
                    ? "bg-[var(--felt)] text-white shadow-sm"
                    : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]",
                ].join(" ")}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-[var(--muted)]">
          Loading player stats…
        </p>
      ) : null}

      {error ? (
        <div className="rounded-[var(--radius)] border border-[var(--danger)]/30 bg-[var(--danger-bg)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      {player && section === "stats" ? (
        <div className="space-y-3">
          <div
            role="tablist"
            aria-label="Stats views"
            className="grid w-full grid-cols-2 gap-0.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] p-0.5"
          >
            {STATS_SUBTABS.map((item) => {
              const selected = statsSubTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() =>
                    startTransition(() => setStatsSubTab(item.id))
                  }
                  className={[
                    "rounded-md px-2 py-1.5 text-center text-xs font-semibold transition sm:text-sm",
                    selected
                      ? "bg-[var(--felt)] text-white shadow-sm"
                      : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]",
                  ].join(" ")}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {statsSubTab === "overview" ? (
            <>
              <SectionCard
                eyebrow="Record"
                title="Overall"
                description={`${temporalLabel(statsWindow)} wins and losses from FargoRate.`}
                badge={
                  overall
                    ? {
                        label: "Win %",
                        value: `${winPct(overall.wins, overall.loses)}%`,
                      }
                    : undefined
                }
              >
                <StatsWindowToggle
                  value={statsWindow}
                  onChange={setStatsWindow}
                />
                {overall ? (
                  <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--line)]">
                    <div className="bg-[var(--surface)] px-3 py-3 sm:px-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                        Wins
                      </p>
                      <p className="mt-1.5 font-[family-name:var(--font-display)] text-2xl tabular-nums text-[var(--ink)]">
                        {overall.wins}
                      </p>
                    </div>
                    <div className="bg-[var(--surface)] px-3 py-3 sm:px-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                        Losses
                      </p>
                      <p className="mt-1.5 font-[family-name:var(--font-display)] text-2xl tabular-nums text-[var(--ink)]">
                        {overall.loses}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--muted)]">
                    No overall stats available.
                  </p>
                )}
              </SectionCard>

              <SectionCard
                eyebrow="History"
                title="Rating"
                description="Monthly rating snapshots."
                badge={
                  historyValues.length
                    ? {
                        label: "Latest",
                        value: String(
                          Math.round(
                            historyValues[historyValues.length - 1] ?? 0,
                          ),
                        ),
                      }
                    : undefined
                }
                flush
              >
                {player.ratingHistory.length ? (
                  <>
                    <div className="flex items-end justify-between gap-3 px-3 py-3 sm:px-4">
                      <RatingSparkline values={historyValues} />
                      <div className="shrink-0 text-right text-xs text-[var(--muted)]">
                        <p>
                          {formatMonth(player.ratingHistory[0]!)} →{" "}
                          {formatMonth(
                            player.ratingHistory[
                              player.ratingHistory.length - 1
                            ]!,
                          )}
                        </p>
                        <p className="mt-1 tabular-nums">
                          {Math.round(historyValues[0] ?? 0)} →{" "}
                          {Math.round(
                            historyValues[historyValues.length - 1] ?? 0,
                          )}
                        </p>
                      </div>
                    </div>
                    <ul className="max-h-48 divide-y divide-[var(--line)] overflow-y-auto border-t border-[var(--line)]">
                      {[...player.ratingHistory].reverse().map((entry) => (
                        <li
                          key={entry.id}
                          className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm sm:px-4"
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
                  </>
                ) : (
                  <p className="px-3 py-4 text-sm text-[var(--muted)] sm:px-4">
                    No rating history available.
                  </p>
                )}
              </SectionCard>
            </>
          ) : (
            <SectionCard
              eyebrow="Performance"
              title="By rating"
              description={`${temporalLabel(statsWindow)} results by opponent rating band.`}
            >
              <StatsWindowToggle
                value={statsWindow}
                onChange={setStatsWindow}
              />

              {byRating?.buckets?.length ? (
                <ul className="space-y-2">
                  {byRating.buckets.map((bucket) => {
                    const total = bucket.winLoss.wins + bucket.winLoss.loses;
                    const pct = winPct(
                      bucket.winLoss.wins,
                      bucket.winLoss.loses,
                    );
                    return (
                      <li
                        key={`${statsWindow}-${bucket.bucket}`}
                        className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5"
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
            </SectionCard>
          )}
        </div>
      ) : null}

      {player && section === "leagues" ? (
        <SectionCard
          eyebrow="Leagues"
          title="Active"
          description="Divisions with upcoming matches for this player."
          badge={{
            label: "Teams",
            value: String(teams.length),
          }}
          flush
        >
          {teams.length ? (
            <ul className="divide-y divide-[var(--line)]">
              {teams.map((team) => (
                <li
                  key={`${team.leagueId}-${team.divisionId}-${team.teamId}`}
                  className="px-3 py-3 sm:px-4"
                >
                  <p className="font-[family-name:var(--font-display)] text-base font-semibold text-[var(--ink)]">
                    {team.teamName}
                  </p>
                  <p className="mt-0.5 text-sm text-[var(--muted)]">
                    {team.leagueName}
                  </p>
                  <p className="mt-0.5 text-sm text-[var(--felt-deep)]">
                    {team.divisionName}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-4 text-sm text-[var(--muted)] sm:px-4">
              No active league divisions found.
            </p>
          )}
        </SectionCard>
      ) : null}

      {player && section === "matches" ? (
        <SectionCard
          eyebrow="Matches"
          title="History"
          description={
            <>
              {matchesTotal
                ? `${matchesTotal.toLocaleString()} match${matchesTotal === 1 ? "" : "es"}`
                : "Search and filter results"}
              {ratingsWarming ? (
                <span className="ml-2 text-[var(--amber)]">
                  Loading opponent ratings…
                </span>
              ) : null}
              {matchesTotalPages > 1 ? (
                <span className="ml-2 tabular-nums text-white/55">
                  · Page {matchesPage} of {matchesTotalPages}
                </span>
              ) : null}
            </>
          }
          badge={
            matchesTotal
              ? { label: "Total", value: String(matchesTotal) }
              : undefined
          }
        >
          <div className="space-y-2">
            <SearchField
              value={matchQuery}
              onChange={setMatchQuery}
              label="Search matches"
              placeholder="Search opponent or event…"
              className="max-w-none"
            />

            <div className="grid grid-cols-2 gap-2">
              <ThemedFilterSelect
                ariaLabel="Match type"
                emptyLabel="All types"
                value={matchType}
                options={matchTypeOptions}
                onChange={(next) => {
                  setMatchType(next);
                  setMatchesPage(1);
                }}
              />
              <ThemedFilterSelect
                ariaLabel="Opponent Fargo range"
                emptyLabel="All ratings"
                value={matchBucket}
                options={bucketOptions}
                onChange={(next) => {
                  setMatchBucket(next);
                  setMatchesPage(1);
                }}
              />
            </div>
          </div>

          {matchesError ? (
            <div className="rounded-[var(--radius)] border border-[var(--danger)]/30 bg-[var(--danger-bg)] px-4 py-3 text-sm text-[var(--danger)]">
              {matchesError}
            </div>
          ) : null}

          {matchesLoading && !matches.length ? (
            <p className="py-4 text-center text-sm text-[var(--muted)]">
              {matchBucket != null
                ? "Filtering by opponent rating…"
                : "Loading matches…"}
            </p>
          ) : null}

          {!matchesLoading && !matchesError && !matches.length ? (
            <p className="text-sm text-[var(--muted)]">No matches found.</p>
          ) : null}

          {matches.length ? (
            <ul
              className={[
                "divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] transition-opacity",
                matchesLoading ? "opacity-60" : "opacity-100",
              ].join(" ")}
            >
              {matches.map((match) => (
                <li
                  key={match.id}
                  className="flex items-start justify-between gap-3 px-3 py-3 sm:px-4"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--ink)]">
                      vs {match.opponentName}
                      {match.opponentRating != null ? (
                        <span className="ml-2 tabular-nums text-[var(--felt-deep)]">
                          {Math.round(match.opponentRating)}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-sm text-[var(--muted)]">
                      {[
                        formatDate(match.datePlayed),
                        match.event,
                        match.opponentReadableId
                          ? `#${match.opponentReadableId}`
                          : null,
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
            <nav
              aria-label="Match history pages"
              className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-2 sm:px-3"
            >
              <button
                type="button"
                onClick={() => goToMatchesPage(matchesPage - 1)}
                disabled={matchesPage <= 1 || matchesLoading}
                className="rounded-[var(--radius)] bg-[var(--surface)] px-3.5 py-1.5 text-sm font-semibold text-[var(--ink)] transition hover:bg-[var(--surface-3)] disabled:cursor-not-allowed disabled:opacity-35"
              >
                Previous
              </button>

              <div className="flex flex-wrap items-center justify-center gap-1">
                {pageNumbers(matchesPage, matchesTotalPages).map(
                  (item, index) =>
                    item === "…" ? (
                      <span
                        key={`ellipsis-${index}`}
                        className="px-1 text-sm text-[var(--muted)]"
                        aria-hidden
                      >
                        …
                      </span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        aria-label={`Page ${item}`}
                        aria-current={item === matchesPage ? "page" : undefined}
                        onClick={() => goToMatchesPage(item)}
                        disabled={matchesLoading}
                        className={[
                          "min-w-9 rounded-[var(--radius)] px-2.5 py-1.5 text-sm font-semibold tabular-nums transition",
                          item === matchesPage
                            ? "bg-[var(--felt)] text-white shadow-sm"
                            : "bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--surface-3)] hover:text-[var(--ink)]",
                        ].join(" ")}
                      >
                        {item}
                      </button>
                    ),
                )}
              </div>

              <button
                type="button"
                onClick={() => goToMatchesPage(matchesPage + 1)}
                disabled={matchesPage >= matchesTotalPages || matchesLoading}
                className="rounded-[var(--radius)] bg-[var(--surface)] px-3.5 py-1.5 text-sm font-semibold text-[var(--ink)] transition hover:bg-[var(--surface-3)] disabled:cursor-not-allowed disabled:opacity-35"
              >
                Next
              </button>
            </nav>
          ) : null}
        </SectionCard>
      ) : null}

      {player && section === "opponents" ? (
        <SectionCard
          eyebrow="Record"
          title="Opponents"
          description={
            <>
              Career wins and losses against each player.
              {opponentsTotalPages > 1 ? (
                <span className="ml-2 tabular-nums text-white/55">
                  · Page {opponentsPage} of {opponentsTotalPages}
                </span>
              ) : null}
            </>
          }
          badge={
            opponentsTotal
              ? { label: "Faced", value: String(opponentsTotal) }
              : undefined
          }
        >
          <div className="space-y-2">
            <SearchField
              value={opponentQuery}
              onChange={setOpponentQuery}
              label="Search opponents"
              placeholder="Search opponent name or ID…"
              className="max-w-none"
            />
            <ThemedFilterSelect
              ariaLabel="Sort opponents"
              emptyLabel="Most wins"
              value={opponentSort}
              options={opponentSortOptions}
              onChange={(next) => {
                setOpponentSort(next);
                setOpponentsPage(1);
              }}
            />
          </div>

          {opponentsError ? (
            <div className="rounded-[var(--radius)] border border-[var(--danger)]/30 bg-[var(--danger-bg)] px-4 py-3 text-sm text-[var(--danger)]">
              {opponentsError}
            </div>
          ) : null}

          {opponentsLoading && !opponents.length ? (
            <p className="py-4 text-center text-sm text-[var(--muted)]">
              Aggregating opponent records…
            </p>
          ) : null}

          {!opponentsLoading && !opponentsError && !opponents.length ? (
            <p className="text-sm text-[var(--muted)]">No opponents found.</p>
          ) : null}

          {opponents.length ? (
            <ul
              className={[
                "divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] transition-opacity",
                opponentsLoading ? "opacity-60" : "opacity-100",
              ].join(" ")}
            >
              {opponents.map((row) => {
                const pct = winPct(row.wins, row.losses);
                return (
                  <li
                    key={row.key}
                    className="flex items-start justify-between gap-3 px-3 py-3 sm:px-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-[var(--ink)]">
                        {row.opponentName}
                        {row.opponentRating != null ? (
                          <span className="ml-2 tabular-nums text-[var(--felt-deep)]">
                            {Math.round(row.opponentRating)}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-sm text-[var(--muted)]">
                        {[
                          row.opponentReadableId
                            ? `#${row.opponentReadableId}`
                            : null,
                          `${row.played} played`,
                          row.lastPlayed
                            ? `Last ${formatDate(row.lastPlayed)}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-[family-name:var(--font-display)] text-xl tabular-nums leading-none text-[var(--ink)]">
                        <span className="text-[var(--felt-deep)]">{row.wins}</span>
                        <span className="mx-1 text-[var(--muted)]">–</span>
                        <span className="text-[var(--danger)]">{row.losses}</span>
                      </p>
                      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                        {row.wins + row.losses > 0 ? `${pct}% win` : "No W/L"}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {opponentsTotalPages > 1 ? (
            <nav
              aria-label="Opponent records pages"
              className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-2 sm:px-3"
            >
              <button
                type="button"
                onClick={() => goToOpponentsPage(opponentsPage - 1)}
                disabled={opponentsPage <= 1 || opponentsLoading}
                className="rounded-[var(--radius)] bg-[var(--surface)] px-3.5 py-1.5 text-sm font-semibold text-[var(--ink)] transition hover:bg-[var(--surface-3)] disabled:cursor-not-allowed disabled:opacity-35"
              >
                Previous
              </button>

              <div className="flex flex-wrap items-center justify-center gap-1">
                {pageNumbers(opponentsPage, opponentsTotalPages).map(
                  (item, index) =>
                    item === "…" ? (
                      <span
                        key={`ellipsis-${index}`}
                        className="px-1 text-sm text-[var(--muted)]"
                        aria-hidden
                      >
                        …
                      </span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        aria-label={`Page ${item}`}
                        aria-current={
                          item === opponentsPage ? "page" : undefined
                        }
                        onClick={() => goToOpponentsPage(item)}
                        disabled={opponentsLoading}
                        className={[
                          "min-w-9 rounded-[var(--radius)] px-2.5 py-1.5 text-sm font-semibold tabular-nums transition",
                          item === opponentsPage
                            ? "bg-[var(--felt)] text-white shadow-sm"
                            : "bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--surface-3)] hover:text-[var(--ink)]",
                        ].join(" ")}
                      >
                        {item}
                      </button>
                    ),
                )}
              </div>

              <button
                type="button"
                onClick={() => goToOpponentsPage(opponentsPage + 1)}
                disabled={
                  opponentsPage >= opponentsTotalPages || opponentsLoading
                }
                className="rounded-[var(--radius)] bg-[var(--surface)] px-3.5 py-1.5 text-sm font-semibold text-[var(--ink)] transition hover:bg-[var(--surface-3)] disabled:cursor-not-allowed disabled:opacity-35"
              >
                Next
              </button>
            </nav>
          ) : null}
        </SectionCard>
      ) : null}
    </section>
  );
}
