"use client";

import type { CSSProperties } from "react";

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
};

function TeamLine({
  name,
  emphasize,
  prefix,
}: {
  name: string;
  emphasize?: boolean;
  prefix?: string;
}) {
  return (
    <p
      className={[
        "break-words leading-snug",
        prefix
          ? "text-sm text-[var(--muted)]"
          : "font-[family-name:var(--font-display)] text-lg text-[var(--ink)]",
        emphasize ? "font-semibold text-[var(--felt-deep)]" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {prefix ? (
        <>
          <span className="mr-1.5 text-[var(--muted)]">{prefix}</span>
          <span
            className={
              emphasize
                ? "font-semibold text-[var(--felt-deep)]"
                : "text-[var(--ink)]"
            }
          >
            {name}
          </span>
        </>
      ) : (
        name
      )}
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
}: MatchListCardProps) {
  const metaLine = [meta, location].filter(Boolean).join(" · ");

  return (
    <button
      type="button"
      onClick={onClick}
      style={style}
      className={[
        "group block w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3.5 text-left shadow-sm transition",
        "hover:border-[color-mix(in_srgb,var(--felt)_55%,var(--line))] hover:bg-[color-mix(in_srgb,var(--felt)_10%,var(--surface))]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felt-soft)]",
        className ?? "",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          {metaLine ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--amber)]">
              {metaLine}
            </p>
          ) : null}

          <div className={metaLine ? "mt-2 space-y-1" : "space-y-1"}>
            <TeamLine name={homeName} emphasize={emphasizeHome} />
            <TeamLine name={awayName} emphasize={emphasizeAway} prefix="vs" />
          </div>

          {status ? (
            <p className="mt-2 text-xs text-[var(--muted)]">{status}</p>
          ) : null}
        </div>

        {ctaLabel ? (
          <span className="shrink-0 rounded-full bg-[var(--felt)] px-3 py-1.5 text-xs font-semibold text-white transition group-hover:bg-[var(--felt-soft)]">
            {ctaLabel}
          </span>
        ) : (
          <span
            className="shrink-0 text-[var(--amber)] transition group-hover:translate-x-0.5"
            aria-hidden
          >
            →
          </span>
        )}
      </div>
    </button>
  );
}
