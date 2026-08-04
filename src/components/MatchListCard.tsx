"use client";

import type { CSSProperties, ReactNode } from "react";

export type MatchBoardStatus = "not_started" | "in_progress" | "complete";

type MatchListCardProps = {
  homeName: string;
  awayName: string;
  /** Uppercase meta line (date, location, etc.). */
  meta?: string;
  location?: string;
  status?: string;
  /**
   * Accessible label for the trailing action control.
   * Board cards pick an icon from status; schedule cards use a chevron.
   */
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
  /** When omitted on board cards, scores always show (including 0–0). */
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

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function ScorePadIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8" />
      <path d="M8 12h8" />
      <path d="M8 16h5" />
    </svg>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

function actionIcon(
  boardStatus: MatchBoardStatus | undefined,
  isMyMatch: boolean,
  ctaLabel: string | undefined,
): { icon: ReactNode; label: string } {
  if (boardStatus === "complete") {
    return {
      icon: <EyeIcon className="h-4 w-4" />,
      label: ctaLabel ?? "View",
    };
  }
  if (boardStatus === "in_progress" || (boardStatus != null && isMyMatch)) {
    return {
      icon: <ScorePadIcon className="h-4 w-4" />,
      label: ctaLabel ?? (isMyMatch ? "Score" : "Open"),
    };
  }
  return {
    icon: <ChevronIcon className="h-4 w-4" />,
    label: ctaLabel ?? "Open",
  };
}

function ScoreBox({
  value,
  emphasize,
  muted,
}: {
  value: number;
  emphasize?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={[
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
        "bg-black/25 ring-1",
        muted
          ? "ring-white/10 opacity-55"
          : emphasize
            ? "ring-[color-mix(in_srgb,var(--felt)_60%,white)]"
            : "ring-white/15",
      ].join(" ")}
    >
      <span
        className={[
          "font-[family-name:var(--font-display)] text-lg font-semibold tabular-nums leading-none",
          muted
            ? "text-[var(--muted)]"
            : emphasize
              ? "text-[var(--felt-deep)]"
              : "text-[var(--ink)]",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}

function TeamName({
  name,
  emphasize,
}: {
  name: string;
  emphasize?: boolean;
}) {
  return (
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
  showScores,
}: MatchListCardProps) {
  const hasBoard = boardStatus != null;
  const displayScores = showScores ?? hasBoard;
  const scoresMuted = boardStatus === "not_started";
  // Board cards hoist venue to the night header; schedule keeps meta/location.
  const headerMeta = hasBoard
    ? null
    : [meta, location].filter(Boolean).join(" · ") || null;
  const { icon, label } = actionIcon(boardStatus, isMyMatch, ctaLabel);

  return (
    <button
      type="button"
      onClick={onClick}
      style={style}
      aria-label={`${label}: ${homeName} vs ${awayName}`}
      className={[
        "group grid w-full grid-cols-[minmax(0,1fr)_auto] text-left transition",
        "rounded-2xl border",
        isMyMatch
          ? "border-[color-mix(in_srgb,var(--felt)_70%,var(--line))] bg-[color-mix(in_srgb,var(--felt)_14%,var(--surface))]"
          : "border-[var(--line)] bg-[var(--surface)]",
        "hover:border-[color-mix(in_srgb,var(--felt)_55%,var(--line))] hover:bg-[color-mix(in_srgb,var(--felt)_10%,var(--surface))]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felt-soft)]",
        className ?? "",
      ].join(" ")}
    >
      {/* Header — status chips */}
      <div className="flex min-h-9 min-w-0 flex-wrap items-center gap-1.5 border-b border-[var(--line)] px-3.5 py-2">
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
        {headerMeta ? (
          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--amber)]">
            {headerMeta}
          </p>
        ) : null}
      </div>
      <div className="flex items-center justify-center border-b border-[var(--line)] py-2 pr-3.5">
        <span
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--felt)] text-white transition group-hover:bg-[var(--felt-soft)]"
          aria-hidden
        >
          {icon}
        </span>
      </div>

      {/* Home row */}
      <div className="flex min-w-0 items-center px-3.5 py-2.5">
        <TeamName name={homeName} emphasize={emphasizeHome} />
      </div>
      <div className="flex items-center justify-center py-2.5 pr-3.5">
        {displayScores ? (
          <ScoreBox
            value={homeRounds ?? 0}
            emphasize={emphasizeHome}
            muted={scoresMuted}
          />
        ) : null}
      </div>

      {/* Away row */}
      <div className="flex min-w-0 items-center border-t border-[var(--line)] px-3.5 py-2.5">
        <TeamName name={awayName} emphasize={emphasizeAway} />
      </div>
      <div className="flex items-center justify-center border-t border-[var(--line)] py-2.5 pr-3.5">
        {displayScores ? (
          <ScoreBox
            value={awayRounds ?? 0}
            emphasize={emphasizeAway}
            muted={scoresMuted}
          />
        ) : null}
      </div>

      {!hasBoard && status ? (
        <p className="col-span-2 border-t border-[var(--line)] px-3.5 py-2 text-xs text-[var(--muted)]">
          {status}
        </p>
      ) : null}
    </button>
  );
}
