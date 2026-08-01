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
    <section className="overflow-hidden rounded-[1.4rem] border border-[var(--line)] bg-[linear-gradient(145deg,rgba(29,110,158,0.2),var(--surface)_40%,var(--surface-2))] shadow-[var(--shadow)]">
      <div className="flex items-stretch">
        <div className="w-1.5 shrink-0 bg-[linear-gradient(180deg,var(--felt),var(--amber))]" />
        <div
          className={[
            "min-w-0 flex-1",
            compact ? "px-3 py-3" : "px-4 py-4 md:px-5",
          ].join(" ")}
        >
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--amber)]">
                Team standing
              </p>
              {teamName ? (
                <h3
                  className={[
                    "mt-1 break-words font-[family-name:var(--font-display)] text-[var(--felt-deep)]",
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
                  "shrink-0 border border-[var(--felt)]/25 bg-[var(--surface)]/90 text-center shadow-sm",
                  compact
                    ? "rounded-xl px-3 py-1.5"
                    : "rounded-2xl px-4 py-2",
                ].join(" ")}
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                  Rank
                </p>
                <p
                  className={[
                    "mt-0.5 font-[family-name:var(--font-display)] font-bold tabular-nums leading-none text-[var(--felt)]",
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
              "mt-3 grid gap-2",
              compact
                ? "grid-cols-2"
                : "grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4",
            ].join(" ")}
          >
            {stats.map((cell) => {
              const ratio = parseRatio(cell.value);
              const label = friendlyLabel(cell.label);

              if (ratio) {
                return (
                  <div
                    key={cell.label}
                    className={[
                      "rounded-2xl border border-[var(--line)] bg-[var(--surface)]/90 shadow-sm",
                      compact ? "px-2.5 py-2" : "px-3 py-3",
                    ].join(" ")}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                      {label}
                    </p>
                    <div className="mt-1.5 grid grid-cols-[1fr_auto_1fr] items-end gap-1">
                      <div className="rounded-lg bg-emerald-500/12 px-1.5 py-1 dark:bg-emerald-400/12">
                        <p
                          className={[
                            "font-bold tabular-nums leading-none text-emerald-800 dark:text-emerald-200",
                            compact ? "text-base" : "text-lg",
                          ].join(" ")}
                        >
                          {ratio.forValue}
                        </p>
                        <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-emerald-700/80 dark:text-emerald-300/80">
                          For
                        </p>
                      </div>
                      <span className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                        vs
                      </span>
                      <div className="rounded-lg bg-rose-500/12 px-1.5 py-1 text-right dark:bg-rose-400/12">
                        <p
                          className={[
                            "font-bold tabular-nums leading-none text-rose-800 dark:text-rose-200",
                            compact ? "text-base" : "text-lg",
                          ].join(" ")}
                        >
                          {ratio.againstValue}
                        </p>
                        <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-rose-700/80 dark:text-rose-300/80">
                          Against
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={cell.label}
                  className={[
                    "rounded-2xl border border-[var(--line)] bg-[var(--surface)]/90 shadow-sm",
                    compact ? "px-2.5 py-2" : "px-3 py-3",
                  ].join(" ")}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                    {label}
                  </p>
                  <p
                    className={[
                      "mt-1.5 font-bold tabular-nums leading-none text-[var(--ink)]",
                      compact ? "text-xl" : "text-2xl",
                    ].join(" ")}
                  >
                    {cell.value || "—"}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
