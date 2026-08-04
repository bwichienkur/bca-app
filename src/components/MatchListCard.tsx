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

function ScoreBox({
  value,
  emphasize,
}: {
  value: number;
  emphasize?: boolean;
}) {
  return (
    <div
      className={[
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
        "bg-black/25 ring-1",
        emphasize
          ? "ring-[color-mix(in_srgb,var(--felt)_60%,white)]"
          : "ring-white/15",
      ].join(" ")}
    >
      <span
        className={[
          "font-[family-name:var(--font-display)] text-lg font-semibold tabular-nums leading-none",
          emphasize ? "text-[var(--felt-deep)]" : "text-[var(--ink)]",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}

function TeamRow({
  name,
  score,
  emphasize,
  showScore,
}: {
  name: string;
  score: number;
  emphasize?: boolean;
  showScore: boolean;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_2.25rem] items-center gap-x-3">
      <p
        className={[
          "min-w-0 truncate font-[family-name:var(--font-display)] text-[15px] leading-tight",
          emphasize
            ? "font-semibold text-[var(--felt-deep)]"
            : "font-medium text-[var(--ink)]",
        ].join(" ")}
      >
        {name}
      </p>
      {showScore ? <ScoreBox value={score} emphasize={emphasize} /> : <span />}
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
        "group block w-full rounded-2xl border text-left transition",
        isMyMatch
          ? "border-[color-mix(in_srgb,var(--felt)_70%,var(--line))] bg-[color-mix(in_srgb,var(--felt)_14%,var(--surface))]"
          : "border-[var(--line)] bg-[var(--surface)]",
        "px-3.5 py-2.5",
        "hover:border-[color-mix(in_srgb,var(--felt)_55%,var(--line))] hover:bg-[color-mix(in_srgb,var(--felt)_10%,var(--surface))]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felt-soft)]",
        className ?? "",
      ].join(" ")}
    >
      <div className="flex min-h-7 items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {isMyMatch ? (
            <span className="rounded-full bg-[var(--felt)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">
              My match
            </span>
          ) : null}
          {boardStatus ? (
            <span
              className={[
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
                statusTone(boardStatus),
              ].join(" ")}
            >
              {statusLabel(boardStatus)}
            </span>
          ) : null}
          {metaLine ? (
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--amber)]">
              {metaLine}
            </p>
          ) : null}
        </div>
        {ctaLabel ? (
          <span className="inline-flex h-7 shrink-0 items-center justify-center rounded-full bg-[var(--felt)] px-3 text-[11px] font-semibold text-white transition group-hover:bg-[var(--felt-soft)]">
            {ctaLabel}
          </span>
        ) : (
          <span
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-[var(--amber)] transition group-hover:translate-x-0.5"
            aria-hidden
          >
            →
          </span>
        )}
      </div>

      <div className="mt-2 space-y-1.5">
        <TeamRow
          name={homeName}
          score={homeRounds ?? 0}
          emphasize={emphasizeHome}
          showScore={showScores}
        />
        <TeamRow
          name={awayName}
          score={awayRounds ?? 0}
          emphasize={emphasizeAway}
          showScore={showScores}
        />
      </div>

      {!hasBoard && status ? (
        <p className="mt-1.5 text-xs text-[var(--muted)]">{status}</p>
      ) : null}
    </button>
  );
}
