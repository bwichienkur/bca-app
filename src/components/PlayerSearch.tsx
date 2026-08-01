"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PlayerSearchResult } from "@/lib/types";
import { useViewportAnchor } from "@/lib/use-viewport-anchor";
import { EmptyState } from "./EmptyState";

const MIN_QUERY = 2;
const DEBOUNCE_MS = 320;
const PAGE_SIZE = 8;

function statusLabel(status: PlayerSearchResult["robustnessStatus"]): string {
  if (status === "established") return "Established";
  if (status === "preliminary") return "Preliminary";
  return "Starter";
}

function statusClass(status: PlayerSearchResult["robustnessStatus"]): string {
  if (status === "established") {
    return "bg-[var(--felt)]/20 text-[var(--felt-deep)]";
  }
  if (status === "preliminary") {
    return "bg-[var(--amber)]/15 text-[var(--amber)]";
  }
  return "bg-[var(--surface-2)] text-[var(--muted)]";
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
    // Keep the sticky search chrome in view after paging.
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
    <section className="space-y-3 md:space-y-4">
      {/* Sticky under report tabs so typing never loses the search box */}
      <div
        ref={searchAnchor.ref}
        className="sticky top-[5.75rem] z-10 -mx-1 space-y-3 bg-[color-mix(in_srgb,var(--paper)_94%,transparent)] px-1 py-2 backdrop-blur sm:top-[3.75rem]"
      >
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--amber)]">
            FairMatch
          </p>
          <h3 className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--felt-deep)]">
            Player search
          </h3>
          <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">
            Lookup any FargoRate rating by name or membership ID.
          </p>
        </div>

        <label className="relative block max-w-xl">
          <span className="sr-only">Search players</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => updateQuery(event.target.value)}
            placeholder="Name or ID…"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className={[
              "w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] py-3 text-base text-[var(--ink)] outline-none ring-[var(--felt-soft)] transition placeholder:text-[var(--muted)] focus:ring-2",
              hasQuery ? "pl-4 pr-24" : "px-4 pr-12",
            ].join(" ")}
          />
          {hasQuery && !loading ? (
            <button
              type="button"
              onClick={clearQuery}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-xs font-semibold text-[var(--muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--ink)]"
            >
              Clear
            </button>
          ) : null}
          {loading ? (
            <span
              className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-[var(--line-strong)] border-t-[var(--felt)]"
              aria-label="Searching"
            />
          ) : null}
        </label>
      </div>

      <div className="min-h-[min(48dvh,22rem)] [overflow-anchor:none]">
        {error ? (
          <div className="rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger-bg)] px-4 py-3 text-sm text-[var(--danger)]">
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
          <p className="py-6 text-center text-sm text-[var(--muted)]">
            Searching FairMatch…
          </p>
        ) : null}

        {showResults ? (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between gap-3 px-0.5">
              <p className="text-sm text-[var(--muted)]">
                <span className="tabular-nums font-semibold text-[var(--ink)]">
                  {players.length}
                </span>{" "}
                result{players.length === 1 ? "" : "s"}
                {loading ? (
                  <span className="ml-2 text-[var(--amber)]">Updating…</span>
                ) : null}
              </p>
              <div className="flex items-center gap-3">
                <p className="text-xs tabular-nums text-[var(--muted)]">
                  Page {safePage} of {totalPages}
                </p>
                <button
                  type="button"
                  onClick={clearQuery}
                  className="text-xs font-semibold text-[var(--felt-deep)] underline-offset-2 hover:underline"
                >
                  Clear search
                </button>
              </div>
            </div>

            <ul
              className={[
                "divide-y divide-[var(--line)] overflow-hidden rounded-[1.3rem] border border-[var(--line)] bg-[var(--surface)]/90 transition-opacity",
                loading ? "opacity-60" : "opacity-100",
              ].join(" ")}
            >
              {pagePlayers.map((player) => (
                <li
                  key={player.id}
                  className="flex items-start justify-between gap-4 px-4 py-3.5 md:px-5"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--ink)]">{player.name}</p>
                    <p className="mt-0.5 text-sm text-[var(--muted)]">
                      {[
                        player.readableId ? `#${player.readableId}` : null,
                        player.membershipId,
                        player.location,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <span
                      className={[
                        "mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]",
                        statusClass(player.robustnessStatus),
                      ].join(" ")}
                    >
                      {statusLabel(player.robustnessStatus)}
                      {player.robustness != null
                        ? ` · ${player.robustness}`
                        : ""}
                    </span>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-[family-name:var(--font-display)] text-2xl tabular-nums leading-none text-[var(--felt-deep)]">
                      {player.effectiveRating ?? "—"}
                    </p>
                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                      Rating
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            {totalPages > 1 ? (
              <nav
                aria-label="Search results pages"
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--line)] bg-[var(--surface)]/80 px-2.5 py-2 sm:px-3"
              >
                <button
                  type="button"
                  onClick={() => goToPage(safePage - 1)}
                  disabled={safePage <= 1}
                  className="rounded-full bg-[var(--surface-2)] px-3.5 py-1.5 text-sm font-semibold text-[var(--ink)] transition hover:bg-[var(--surface-3)] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  Previous
                </button>

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
                          "min-w-9 rounded-full px-2.5 py-1.5 text-sm font-semibold tabular-nums transition",
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

                <button
                  type="button"
                  onClick={() => goToPage(safePage + 1)}
                  disabled={safePage >= totalPages}
                  className="rounded-full bg-[var(--surface-2)] px-3.5 py-1.5 text-sm font-semibold text-[var(--ink)] transition hover:bg-[var(--surface-3)] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  Next
                </button>
              </nav>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
