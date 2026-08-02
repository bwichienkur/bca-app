"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  User,
  X,
} from "lucide-react";
import type { PlayerSearchResult } from "@/lib/types";
import { useViewportAnchor } from "@/lib/use-viewport-anchor";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatBadge } from "@/components/ui/StatBadge";
import { EmptyState } from "./EmptyState";
import { LoadingState } from "./LoadingState";

const MIN_QUERY = 2;
const DEBOUNCE_MS = 320;
const PAGE_SIZE = 8;

function statusTone(
  status: PlayerSearchResult["robustnessStatus"],
): "primary" | "warning" | "neutral" {
  if (status === "established") return "primary";
  if (status === "preliminary") return "warning";
  return "neutral";
}

function statusLabel(status: PlayerSearchResult["robustnessStatus"]): string {
  if (status === "established") return "Established";
  if (status === "preliminary") return "Preliminary";
  return "Starter";
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
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push("…");
    out.push(sorted[i]);
  }
  return out;
}

export function PlayerSearch() {
  const [query, setQuery] = useState("");
  const [players, setPlayers] = useState<PlayerSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [page, setPage] = useState(1);
  const requestId = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchAnchor = useViewportAnchor<HTMLDivElement>();

  const updateQuery = (next: string) => {
    searchAnchor.mark();
    setQuery(next);
  };

  const markSearchAnchor = searchAnchor.mark;

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY) {
      requestId.current += 1;
      markSearchAnchor();
      setPlayers([]);
      setError(null);
      setLoading(false);
      setSearched(false);
      setPage(1);
      return;
    }

    const timer = window.setTimeout(() => {
      const id = ++requestId.current;
      setLoading(true);
      setError(null);

      void fetch(`/api/players/search?q=${encodeURIComponent(q)}`)
        .then(async (response) => {
          const payload = (await response.json()) as {
            players?: PlayerSearchResult[];
            error?: string;
          };
          if (!response.ok) {
            throw new Error(payload.error || "Search failed");
          }
          if (id !== requestId.current) return;
          markSearchAnchor();
          setPlayers(payload.players ?? []);
          setPage(1);
          setSearched(true);
        })
        .catch((err: unknown) => {
          if (id !== requestId.current) return;
          markSearchAnchor();
          setPlayers([]);
          setPage(1);
          setSearched(true);
          setError(err instanceof Error ? err.message : "Search failed");
        })
        .finally(() => {
          if (id === requestId.current) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [query, markSearchAnchor]);

  const totalPages = Math.max(1, Math.ceil(players.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagePlayers = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return players.slice(start, start + PAGE_SIZE);
  }, [players, safePage]);

  const goToPage = (next: number) => {
    const clamped = Math.min(Math.max(1, next), totalPages);
    searchAnchor.mark();
    setPage(clamped);
    requestAnimationFrame(() => {
      searchAnchor.ref.current?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    });
  };

  const clearQuery = () => {
    updateQuery("");
    inputRef.current?.focus();
  };

  const showResults = searched && !error && players.length > 0;
  const showEmpty = searched && !error && !loading && players.length === 0;
  const showHint =
    query.trim().length > 0 && query.trim().length < MIN_QUERY && !loading;
  const hasQuery = query.trim().length > 0;

  return (
    <section className="space-y-6">
      <div
        ref={searchAnchor.ref}
        className="sticky top-[5.75rem] z-10 -mx-1 space-y-5 bg-[color-mix(in_srgb,var(--paper)_94%,transparent)] px-1 py-2 backdrop-blur sm:top-[3.75rem]"
      >
        <PageHeader
          eyebrow="Search"
          title="Player search"
          description="Look up any FargoRate rating by name or membership ID."
        />

        <label className="relative block max-w-xl">
          <span className="sr-only">Search players</span>
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]"
            aria-hidden
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => updateQuery(event.target.value)}
            placeholder="Name or ID…"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className={[
              "ui-focus w-full rounded-[var(--radius-sm)] border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface-2)_85%,transparent)] py-3.5 text-base text-[var(--ink)] outline-none backdrop-blur-sm transition placeholder:text-[var(--muted)]",
              hasQuery ? "pl-11 pr-24" : "pl-11 pr-12",
            ].join(" ")}
          />
          {hasQuery && !loading ? (
            <button
              type="button"
              onClick={clearQuery}
              className="ui-focus absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--surface-3)] px-2.5 py-1 text-xs font-semibold text-[var(--muted)] transition hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
            >
              <X className="h-3 w-3" aria-hidden />
              Clear
            </button>
          ) : null}
          {loading ? (
            <Loader2
              className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--chalk)]"
              aria-label="Searching"
            />
          ) : null}
        </label>
      </div>

      <div className="min-h-[min(48dvh,22rem)] [overflow-anchor:none]">
        {error ? (
          <div className="rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[var(--danger-bg)] px-4 py-3 text-sm text-[var(--danger)]">
            {error}
          </div>
        ) : null}

        {showHint ? (
          <p className="text-sm text-[var(--muted)]">
            Type at least {MIN_QUERY} characters to search.
          </p>
        ) : null}

        {showEmpty ? (
          <EmptyState
            title="No players found"
            body="Try a fuller name, last name first, or a membership ID."
          />
        ) : null}

        {loading && !showResults && !showEmpty && !error && !showHint ? (
          <LoadingState label="Searching FairMatch…" />
        ) : null}

        {showResults ? (
          <div className="space-y-4">
            <div className="flex items-baseline justify-between gap-3 px-0.5">
              <p className="text-sm text-[var(--muted)]">
                <span className="tabular-nums font-semibold text-[var(--ink)]">
                  {players.length}
                </span>{" "}
                result{players.length === 1 ? "" : "s"}
                {loading ? (
                  <span className="ml-2 text-[var(--chalk)]">Updating…</span>
                ) : null}
              </p>
              <div className="flex items-center gap-3">
                <p className="text-xs tabular-nums text-[var(--muted)]">
                  Page {safePage} of {totalPages}
                </p>
                <button
                  type="button"
                  onClick={clearQuery}
                  className="text-xs font-semibold text-[var(--chalk)] underline-offset-2 hover:underline"
                >
                  Clear search
                </button>
              </div>
            </div>

            <ul
              className={[
                "grid gap-3 transition-opacity sm:grid-cols-2",
                loading ? "opacity-60" : "opacity-100",
              ].join(" ")}
            >
              {pagePlayers.map((player) => (
                <li key={player.id}>
                  <Card className="flex h-full items-start justify-between gap-4 p-4 md:p-5">
                    <div className="min-w-0">
                      <div className="flex items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-[var(--muted)]">
                          <User className="h-4 w-4" aria-hidden />
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-[var(--ink)]">
                            {player.name}
                          </p>
                          <p className="mt-0.5 text-sm text-[var(--muted)]">
                            {[
                              player.readableId ? `#${player.readableId}` : null,
                              player.membershipId,
                              player.location,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3">
                        <StatBadge tone={statusTone(player.robustnessStatus)}>
                          {`${statusLabel(player.robustnessStatus)}${player.robustness != null ? ` · ${player.robustness}` : ""}`}
                        </StatBadge>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-[family-name:var(--font-display)] text-2xl tabular-nums leading-none text-[var(--chalk)]">
                        {player.effectiveRating ?? "—"}
                      </p>
                      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                        Rating
                      </p>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>

            {totalPages > 1 ? (
              <nav
                aria-label="Search results pages"
                className="ui-glass flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 sm:px-3"
              >
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => goToPage(safePage - 1)}
                  disabled={safePage <= 1}
                  className="!rounded-full !px-3.5 !py-1.5 !text-sm"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                  Previous
                </Button>

                <div className="flex flex-wrap items-center justify-center gap-1">
                  {pageNumbers(safePage, totalPages).map((item, index) =>
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
                        aria-current={item === safePage ? "page" : undefined}
                        onClick={() => goToPage(item)}
                        className={[
                          "ui-focus min-w-9 rounded-full px-2.5 py-1.5 text-sm font-semibold tabular-nums transition",
                          item === safePage
                            ? "bg-[var(--felt)] text-white shadow-sm"
                            : "bg-[var(--surface-2)] text-[var(--muted)] hover:bg-[var(--surface-3)] hover:text-[var(--ink)]",
                        ].join(" ")}
                      >
                        {item}
                      </button>
                    ),
                  )}
                </div>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => goToPage(safePage + 1)}
                  disabled={safePage >= totalPages}
                  className="!rounded-full !px-3.5 !py-1.5 !text-sm"
                >
                  Next
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </Button>
              </nav>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
