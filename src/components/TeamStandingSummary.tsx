"use client";

import type { ReactNode } from "react";
import { SectionCard } from "./SectionCard";

type StandingCell = {
  label: string;
  value: string;
};

type TeamStandingSummaryProps = {
  cells: StandingCell[];
  teamName?: string;
  /** Denser layout for narrow / side-by-side contexts. */
  compact?: boolean;
  /**
   * When true (default outside compact), blue header is its own card and
   * stats sit in a separate card below — matching other Team sections.
   */
  splitHeader?: boolean;
};

function isNameLabel(label: string): boolean {
  const h = label.trim().toLowerCase();
  return h === "team" || h === "name";
}

function isRankLabel(label: string): boolean {
  const h = label.trim().toLowerCase();
  return h === "#" || h === "rank" || h === "rk" || h === "pos";
}

function parseRatio(value: string): { forValue: string; againstValue: string } | null {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  return { forValue: match[1], againstValue: match[2] };
}

function friendlyLabel(label: string): string {
  const h = label.trim().toLowerCase();
  if (h === "rds") return "Rounds";
  if (h === "wks") return "Weeks";
  if (h === "pts" || h === "points") return "Points";
  if (h === "gms" || h === "games") return "Games";
  if (h === "win%" || h === "win %") return "Win %";
  if (h.includes("pts") && h.includes("for") && h.includes("against")) {
    return "Points";
  }
  if (h.includes("gms") && h.includes("for") && h.includes("against")) {
    return "Games";
  }
  if (h.includes("for") && h.includes("against")) {
    return label.replace(/\s*for\s*\/\s*against/i, "").trim() || label;
  }
  return label;
}

function isGamesStat(label: string): boolean {
  const h = label.trim().toLowerCase();
  return (
    h === "gms" ||
    h === "games" ||
    (h.includes("gms") && h.includes("for")) ||
    (h.includes("games") && h.includes("for"))
  );
}

function StatIcon({ kind }: { kind: string }) {
  const h = kind.trim().toLowerCase();
  const common = "h-3.5 w-3.5 shrink-0 text-[var(--chalk)]";
  if (h.includes("round") || h === "rds") {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.85" />
        <path
          d="M12 8v4l2.5 1.5"
          stroke="currentColor"
          strokeWidth="1.85"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (h.includes("point") || h === "pts") {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 3l2.2 6.6H21l-5.4 4 2.1 6.5L12 16.8 6.3 20l2.1-6.5L3 9.6h6.8L12 3z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (h.includes("week") || h === "wks") {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect
          x="3"
          y="5"
          width="18"
          height="16"
          rx="2"
          stroke="currentColor"
          strokeWidth="1.85"
        />
        <path d="M3 10h18" stroke="currentColor" strokeWidth="1.85" />
        <path
          d="M8 3v4M16 3v4"
          stroke="currentColor"
          strokeWidth="1.85"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (h.includes("win")) {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M8 20V10M12 20V4M16 20v-6"
          stroke="currentColor"
          strokeWidth="1.85"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </svg>
  );
}

function GamesMeter({
  forValue,
  againstValue,
  compact,
}: {
  forValue: string;
  againstValue: string;
  compact: boolean;
}) {
  const forNum = Number(forValue);
  const againstNum = Number(againstValue);
  const total =
    Number.isFinite(forNum) && Number.isFinite(againstNum)
      ? Math.max(forNum + againstNum, 0)
      : 0;
  const pct = total > 0 ? Math.round((forNum / total) * 100) : 0;

  return (
    <div className={compact ? "px-3 py-3.5" : "px-4 py-4 sm:px-5"}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            Games
          </p>
          <p
            className={[
              "mt-1.5 font-semibold tabular-nums leading-none",
              compact ? "text-xl" : "text-2xl",
            ].join(" ")}
          >
            <span className="text-[var(--ink)]">{forValue}</span>
            <span className="mx-1.5 text-[var(--muted)]">–</span>
            <span className="text-[var(--muted)]">{againstValue}</span>
          </p>
          <p className="mt-1.5 text-[10px] text-[var(--muted)]">for · against</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            Win rate
          </p>
          <p
            className={[
              "mt-1.5 font-[family-name:var(--font-display)] font-semibold tabular-nums leading-none text-[var(--felt-deep)]",
              compact ? "text-xl" : "text-2xl",
            ].join(" ")}
          >
            {total > 0 ? `${pct}%` : "—"}
          </p>
        </div>
      </div>
      <div
        className="mt-3.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)]"
        role="meter"
        aria-label="Games win rate"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={total > 0 ? pct : 0}
      >
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,var(--felt-soft),var(--chalk))] transition-[width] duration-500 ease-out"
          style={{ width: `${total > 0 ? pct : 0}%` }}
        />
      </div>
    </div>
  );
}

function StatChip({
  label,
  value,
  compact,
}: {
  label: string;
  value: string;
  compact: boolean;
}) {
  return (
    <div className={["min-w-0", compact ? "px-2.5 py-2.5" : "px-3 py-3"].join(" ")}>
      <div className="flex items-center justify-center gap-1.5 text-[var(--muted)]">
        <StatIcon kind={label} />
        <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em]">
          {label}
        </p>
      </div>
      <p
        className={[
          "mt-2 text-center font-[family-name:var(--font-display)] font-semibold tabular-nums leading-none text-[var(--ink)]",
          compact ? "text-lg" : "text-xl",
        ].join(" ")}
      >
        {value || "—"}
      </p>
    </div>
  );
}

export function TeamStandingSummary({
  cells,
  teamName,
  compact = false,
  splitHeader = !compact,
}: TeamStandingSummaryProps) {
  const rankCell = cells.find((cell) => isRankLabel(cell.label));
  const stats = cells.filter(
    (cell) => !isNameLabel(cell.label) && !isRankLabel(cell.label),
  );

  const gamesStat =
    stats.find((cell) => {
      const ratio = parseRatio(cell.value);
      return ratio && isGamesStat(cell.label);
    }) ??
    stats.find((cell) => parseRatio(cell.value) != null);

  const gamesRatio = gamesStat ? parseRatio(gamesStat.value) : null;
  const otherStats = stats.filter((cell) => cell !== gamesStat);

  const chipTopBorder = gamesRatio
    ? "border-t border-[var(--line)]"
    : splitHeader
      ? ""
      : "border-t border-[var(--line)]";

  let chips: ReactNode = null;
  if (otherStats.length) {
    chips = (
      <div
        className={[
          "grid divide-x divide-[var(--line)] bg-[var(--surface-2)]/55",
          chipTopBorder,
          otherStats.length === 1
            ? "grid-cols-1"
            : otherStats.length === 2
              ? "grid-cols-2"
              : "grid-cols-3",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {otherStats.map((cell) => (
          <StatChip
            key={cell.label}
            label={friendlyLabel(cell.label)}
            value={cell.value}
            compact={compact}
          />
        ))}
      </div>
    );
  } else if (!gamesRatio && stats.length) {
    chips = (
      <div
        className={[
          "grid divide-x divide-[var(--line)] bg-[var(--surface-2)]/55",
          chipTopBorder,
          compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {stats.map((cell) => (
          <StatChip
            key={cell.label}
            label={friendlyLabel(cell.label)}
            value={cell.value}
            compact={compact}
          />
        ))}
      </div>
    );
  }

  const nameFromCells = cells.find((cell) => isNameLabel(cell.label))?.value;
  const resolvedTeamName = teamName?.trim() || nameFromCells?.trim() || "";
  const hasHeader = Boolean(resolvedTeamName || rankCell);
  const hasBody = Boolean(gamesRatio || chips);

  const statsBody = (
    <>
      {gamesRatio ? (
        <GamesMeter
          forValue={gamesRatio.forValue}
          againstValue={gamesRatio.againstValue}
          compact={compact}
        />
      ) : null}
      {chips}
    </>
  );

  if (splitHeader) {
    return (
      <div className="space-y-3">
        {hasHeader ? (
          <SectionCard
            eyebrow="Team"
            title={
              resolvedTeamName ||
              (rankCell ? `#${rankCell.value || "—"}` : "Standing")
            }
            description="Current place in the division"
            badge={
              resolvedTeamName && rankCell
                ? { label: "Rank", value: `#${rankCell.value || "—"}` }
                : undefined
            }
          />
        ) : null}
        {hasBody ? (
          <section className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]">
            {statsBody}
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]">
      {hasHeader ? (
        <div
          className={[
            "relative overflow-hidden bg-[linear-gradient(145deg,rgba(29,110,158,0.98),rgba(19,78,115,0.96))] text-white",
            compact ? "px-3 py-3.5" : "px-4 py-4 sm:px-5 sm:py-5",
          ].join(" ")}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              background:
                "radial-gradient(120% 80% at 100% 0%, rgba(224,163,90,0.28), transparent 55%)",
            }}
          />
          <div className="relative flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/65">
                Team
              </p>
              {resolvedTeamName ? (
                <>
                  <h3
                    className={[
                      "mt-1.5 break-words font-[family-name:var(--font-display)] font-semibold leading-[1.15] tracking-tight text-white",
                      compact ? "text-xl" : "text-2xl sm:text-3xl",
                    ].join(" ")}
                  >
                    {resolvedTeamName}
                  </h3>
                  <p className="mt-2 text-xs text-white/70">
                    Current place in the division
                  </p>
                </>
              ) : (
                <>
                  <p
                    className={[
                      "mt-1.5 font-[family-name:var(--font-display)] font-semibold tabular-nums leading-none tracking-tight",
                      compact ? "text-4xl" : "text-5xl",
                    ].join(" ")}
                  >
                    #{rankCell?.value || "—"}
                  </p>
                  <p className="mt-2 text-xs text-white/70">
                    Current place in the division
                  </p>
                </>
              )}
            </div>
            {resolvedTeamName && rankCell ? (
              <div
                className={[
                  "shrink-0 rounded-[var(--radius)] bg-black/25 text-center ring-1 ring-white/15",
                  compact ? "px-2.5 py-2" : "px-3.5 py-2.5",
                ].join(" ")}
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/65">
                  Rank
                </p>
                <p
                  className={[
                    "mt-1 font-[family-name:var(--font-display)] font-semibold tabular-nums leading-none",
                    compact ? "text-2xl" : "text-3xl",
                  ].join(" ")}
                >
                  #{rankCell.value || "—"}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {statsBody}
    </section>
  );
}
