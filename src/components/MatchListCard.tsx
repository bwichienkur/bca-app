"use client";

import type { CSSProperties } from "react";

export type MatchBoardStatus = "not_started" | "in_progress" | "complete";

type MatchListCardProps = {
  homeName: string;
  awayName: string;
  /** Uppercase meta line (date, location, etc.). */
  meta?: string;
  location?: string;
  status?: string;
  /** Pill CTA; when omitted, a chevron is shown. */
  ctaLabel?: string;
  emphasizeHome?: boolean;
  emphasizeAway?: boolean;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  /** Night-board scoreboard extras */
  boardStatus?: MatchBoardStatus;
  isMyMatch?: boolean;
  homeRounds?: number | null;
  awayRounds?: number | null;
  homeGames?: number | null;
  awayGames?: number | null;
  showScores?: boolean;
};

function statusTone(status: MatchBoardStatus): string {
  if (status === "complete") {
    return "bg-[var(--surface-3)] text-[var(--muted)]";
  }
  if (status === "in_progress") {
    return "bg-[var(--amber)] text-[#1a140c]";
  }
  return "bg-[var(--surface-2)] text-[var(--muted)]";
}

function statusLabel(status: MatchBoardStatus): string {
  if (status === "complete") return "Complete";
  if (status === "in_progress") return "Live";
  return "Not started";
}

function TeamScoreRow({
  name,
  emphasize,
  rounds,
  showScores,
}: {
  name: string;
  emphasize?: boolean;
  rounds: number | null;
  showScores: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <p
        className={[
          "min-w-0 flex-1 truncate font-[family-name:var(--font-display)] text-lg leading-snug",
          emphasize
            ? "font-semibold text-[var(--felt-deep)]"
            : "text-[var(--ink)]",
        ].join(" ")}
      >
        {name}
      </p>
      {showScores ? (
        <p
          className={[
            "shrink-0 font-[family-name:var(--font-display)] text-3xl font-semibold tabular-nums leading-none",
            emphasize ? "text-[var(--felt-deep)]" : "text-[var(--ink)]",
          ].join(" ")}
        >
          {rounds ?? "–"}
        </p>
      ) : null}
    </div>
  );
}

export function MatchListCard({
  homeName,
  awayName,
  meta,
  location,
  status,
  ctaLabel,
  emphasizeHome,
  emphasizeAway,
  onClick,
  className,
  style,
  boardStatus,
  isMyMatch = false,
  homeRounds = null,
  awayRounds = null,
  homeGames = null,
  awayGames = null,
  showScores = false,
}: MatchListCardProps) {
  const metaLine = [meta, location].filter(Boolean).join(" · ");
  const hasBoard = boardStatus != null;

  return (
    <button
      type="button"
      onClick={onClick}
      style={style}
      className={[
        "group block w-full rounded-2xl border text-left shadow-sm transition",
        isMyMatch
          ? "border-[color-mix(in_srgb,var(--felt)_70%,var(--line))] bg-[color-mix(in_srgb,var(--felt)_14%,var(--surface))]"
          : "border-[var(--line)] bg-[var(--surface)]",
        "px-4 py-3.5",
        "hover:border-[color-mix(in_srgb,var(--felt)_55%,var(--line))] hover:bg-[color-mix(in_srgb,var(--felt)_10%,var(--surface))]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felt-soft)]",
        className ?? "",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {isMyMatch ? (
              <span className="rounded-full bg-[var(--felt)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">
                My match
              </span>
            ) : null}
            {boardStatus ? (
              <span
                className={[
                  "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]",
                  statusTone(boardStatus),
                ].join(" ")}
              >
                {statusLabel(boardStatus)}
              </span>
            ) : null}
            {metaLine ? (
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--amber)]">
                {metaLine}
              </p>
            ) : null}
          </div>

          <div className="mt-2.5 space-y-1.5">
            <TeamScoreRow
              name={homeName}
              emphasize={emphasizeHome}
              rounds={homeRounds}
              showScores={showScores}
            />
            <TeamScoreRow
              name={awayName}
              emphasize={emphasizeAway}
              rounds={awayRounds}
              showScores={showScores}
            />
          </div>

          {showScores && homeGames != null && awayGames != null ? (
            <p className="mt-2 text-[11px] text-[var(--muted)]">
              Games {homeGames}–{awayGames}
            </p>
          ) : showScores ? (
            <p className="mt-2 text-[11px] text-[var(--muted)]">Round wins</p>
          ) : null}

          {!hasBoard && status ? (
            <p className="mt-2 text-xs text-[var(--muted)]">{status}</p>
          ) : null}
        </div>

        {ctaLabel ? (
          <span className="mt-1 shrink-0 rounded-full bg-[var(--felt)] px-3 py-1.5 text-xs font-semibold text-white transition group-hover:bg-[var(--felt-soft)]">
            {ctaLabel}
          </span>
        ) : (
          <span
            className="mt-1 shrink-0 text-[var(--amber)] transition group-hover:translate-x-0.5"
            aria-hidden
          >
            →
          </span>
        )}
      </div>
    </button>
  );
}
