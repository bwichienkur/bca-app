"use client";

import { MetricCard } from "@/components/ui/MetricCard";
import { StatBadge } from "@/components/ui/StatBadge";

type StandingCell = {
  label: string;
  value: string;
};

type TeamStandingSummaryProps = {
  cells: StandingCell[];
  teamName?: string;
  /** Denser layout for narrow / side-by-side contexts. */
  compact?: boolean;
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

export function TeamStandingSummary({
  cells,
  teamName,
  compact = false,
}: TeamStandingSummaryProps) {
  const rankCell = cells.find((cell) => isRankLabel(cell.label));
  const stats = cells.filter(
    (cell) => !isNameLabel(cell.label) && !isRankLabel(cell.label),
  );

  return (
    <section className="ui-card overflow-hidden">
      <div className="flex items-stretch">
        <div className="w-1 shrink-0 bg-[linear-gradient(180deg,var(--felt),color-mix(in_srgb,var(--felt)_40%,transparent))]" />
        <div
          className={[
            "min-w-0 flex-1",
            compact ? "px-3 py-3.5" : "px-4 py-5 md:px-6",
          ].join(" ")}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                Team standing
              </p>
              {teamName ? (
                <h3
                  className={[
                    "mt-1.5 break-words font-semibold tracking-tight text-[var(--ink)]",
                    compact ? "text-lg" : "text-xl md:text-2xl",
                  ].join(" ")}
                >
                  {teamName}
                </h3>
              ) : null}
            </div>
            {rankCell ? (
              <div
                className={[
                  "shrink-0 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--felt)_30%,transparent)] bg-[color-mix(in_srgb,var(--felt)_10%,var(--surface))] text-center",
                  compact ? "px-3 py-2" : "px-4 py-2.5",
                ].join(" ")}
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                  Rank
                </p>
                <p
                  className={[
                    "mt-0.5 font-semibold tabular-nums leading-none text-[var(--felt)]",
                    compact ? "text-2xl" : "text-3xl",
                  ].join(" ")}
                >
                  #{rankCell.value || "—"}
                </p>
              </div>
            ) : null}
          </div>

          <div
            className={[
              "mt-4 grid gap-2.5",
              compact
                ? "grid-cols-2"
                : "grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4",
            ].join(" ")}
          >
            {stats.map((cell) => {
              const ratio = parseRatio(cell.value);
              const label = friendlyLabel(cell.label);

              if (ratio) {
                return (
                  <MetricCard key={cell.label} label={label} compact={compact}>
                    <div className="mt-1.5 grid grid-cols-[1fr_auto_1fr] items-end gap-1.5">
                      <div className="rounded-lg bg-[color-mix(in_srgb,var(--success)_14%,transparent)] px-1.5 py-1">
                        <p
                          className={[
                            "font-semibold tabular-nums leading-none text-[var(--success)]",
                            compact ? "text-base" : "text-lg",
                          ].join(" ")}
                        >
                          {ratio.forValue}
                        </p>
                        <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-[color-mix(in_srgb,var(--success)_70%,var(--muted))]">
                          For
                        </p>
                      </div>
                      <span className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                        vs
                      </span>
                      <div className="rounded-lg bg-[var(--danger-bg)] px-1.5 py-1 text-right">
                        <p
                          className={[
                            "font-semibold tabular-nums leading-none text-[var(--danger)]",
                            compact ? "text-base" : "text-lg",
                          ].join(" ")}
                        >
                          {ratio.againstValue}
                        </p>
                        <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-[color-mix(in_srgb,var(--danger)_70%,var(--muted))]">
                          Against
                        </p>
                      </div>
                    </div>
                  </MetricCard>
                );
              }

              const isWinPct = label.toLowerCase().includes("win");

              if (isWinPct && cell.value) {
                return (
                  <MetricCard key={cell.label} label={label} compact={compact}>
                    <div className="mt-1.5 flex items-end gap-2">
                      <p
                        className={[
                          "font-semibold tabular-nums leading-none text-[var(--ink)]",
                          compact ? "text-xl" : "text-2xl",
                        ].join(" ")}
                      >
                        {cell.value}
                      </p>
                      <StatBadge tone="primary">Win rate</StatBadge>
                    </div>
                  </MetricCard>
                );
              }

              return (
                <MetricCard
                  key={cell.label}
                  label={label}
                  value={cell.value}
                  compact={compact}
                />
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
