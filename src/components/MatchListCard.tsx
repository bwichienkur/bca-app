"use client";

import type { CSSProperties } from "react";
import { ChevronRight } from "lucide-react";
import { StatBadge } from "./ui/StatBadge";

type MatchListCardProps = {
  homeName: string;
  awayName: string;
  meta?: string;
  location?: string;
  status?: string;
  ctaLabel?: string;
  emphasizeHome?: boolean;
  emphasizeAway?: boolean;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
};

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
}: MatchListCardProps) {
  const metaLine = [meta, location].filter(Boolean).join(" · ");

  return (
    <button
      type="button"
      onClick={onClick}
      style={style}
      className={[
        "ui-card ui-card-interactive group block w-full px-5 py-5 text-left",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felt)]/50",
        className ?? "",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {metaLine ? (
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
              {metaLine}
            </p>
          ) : null}

          <div className={metaLine ? "mt-3 space-y-1.5" : "space-y-1.5"}>
            <p
              className={[
                "break-words text-lg font-semibold tracking-tight",
                emphasizeHome ? "text-[var(--felt-deep)]" : "text-[var(--ink)]",
              ].join(" ")}
            >
              {homeName}
            </p>
            <p className="break-words text-[15px] text-[var(--muted)]">
              <span className="mr-1.5 text-[var(--muted)]/80">vs</span>
              <span
                className={
                  emphasizeAway
                    ? "font-semibold text-[var(--felt-deep)]"
                    : "text-[var(--ink-secondary)]"
                }
              >
                {awayName}
              </span>
            </p>
          </div>

          {status ? (
            <div className="mt-3">
              <StatBadge
                tone={
                  status.toLowerCase().includes("draft")
                    ? "warning"
                    : status.toLowerCase().includes("submitted")
                      ? "success"
                      : "primary"
                }
              >
                {status}
              </StatBadge>
            </div>
          ) : null}
        </div>

        {ctaLabel ? (
          <span className="mt-0.5 shrink-0 rounded-2xl bg-[var(--felt)] px-3.5 py-2 text-xs font-semibold text-white shadow-[0_8px_20px_rgba(91,140,255,0.25)] transition group-hover:bg-[var(--felt-soft)]">
            {ctaLabel}
          </span>
        ) : (
          <ChevronRight
            className="mt-1 h-5 w-5 shrink-0 text-[var(--muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--ink)]"
            aria-hidden
          />
        )}
      </div>
    </button>
  );
}
