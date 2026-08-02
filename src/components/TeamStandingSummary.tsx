"use client";

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

function StatCell({
  label,
  value,
  compact,
}: {
  label: string;
  value: string;
  compact: boolean;
}) {
  const ratio = parseRatio(value);

  return (
    <div className={compact ? "px-3 py-2.5" : "px-4 py-3"}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
        {label}
      </p>
      {ratio ? (
        <div className="mt-1.5">
          <p
            className={[
              "font-semibold tabular-nums leading-none",
              compact ? "text-lg" : "text-xl",
            ].join(" ")}
          >
            <span className="text-[var(--ink)]">{ratio.forValue}</span>
            <span className="mx-1 text-[var(--muted)]">–</span>
            <span className="text-[var(--muted)]">{ratio.againstValue}</span>
          </p>
          <p className="mt-1 text-[10px] text-[var(--muted)]">for · against</p>
        </div>
      ) : (
        <p
          className={[
            "mt-1.5 font-semibold tabular-nums leading-none text-[var(--ink)]",
            compact ? "text-xl" : "text-2xl",
          ].join(" ")}
        >
          {value || "—"}
        </p>
      )}
    </div>
  );
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
    <section className="overflow-hidden rounded-[1.3rem] border border-[var(--line)] bg-[var(--surface)] shadow-sm">
      <div
        className={[
          "flex items-start justify-between gap-3",
          compact ? "px-3 pt-3 pb-2.5" : "px-4 pt-4 pb-3 sm:px-5",
        ].join(" ")}
      >
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--amber)]">
            Team standing
          </p>
          {teamName ? (
            <h3
              className={[
                "mt-1 break-words font-[family-name:var(--font-display)] leading-tight text-[var(--felt-deep)]",
                compact ? "text-lg" : "text-xl sm:text-2xl",
              ].join(" ")}
            >
              {teamName}
            </h3>
          ) : null}
        </div>
        {rankCell ? (
          <div className="shrink-0 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              Rank
            </p>
            <p
              className={[
                "mt-0.5 font-[family-name:var(--font-display)] font-semibold tabular-nums leading-none text-[var(--ink)]",
                compact ? "text-2xl" : "text-3xl",
              ].join(" ")}
            >
              #{rankCell.value || "—"}
            </p>
          </div>
        ) : null}
      </div>

      {stats.length ? (
        <div
          className={[
            "grid border-t border-[var(--line)] bg-[var(--surface-2)]",
            compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4",
          ].join(" ")}
        >
          {stats.map((cell, index) => {
            const label = friendlyLabel(cell.label);
            const mobileRightEdge = index % 2 === 0;
            const mobileNeedsBottom =
              index < stats.length - (stats.length % 2 || 2);

            return (
              <div
                key={cell.label}
                className={[
                  mobileRightEdge ? "border-r border-[var(--line)]" : "",
                  mobileNeedsBottom ? "border-b border-[var(--line)]" : "",
                  !compact
                    ? [
                        "sm:border-b-0",
                        index < stats.length - 1
                          ? "sm:border-r sm:border-[var(--line)]"
                          : "sm:border-r-0",
                      ].join(" ")
                    : "",
                ].join(" ")}
              >
                <StatCell label={label} value={cell.value} compact={compact} />
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
