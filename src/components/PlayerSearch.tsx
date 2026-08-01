"use client";

import { useEffect, useRef, useState } from "react";
import type { PlayerSearchResult } from "@/lib/types";
import { EmptyState } from "./EmptyState";
import { LoadingState } from "./LoadingState";

const MIN_QUERY = 2;
const DEBOUNCE_MS = 320;

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

export function PlayerSearch() {
  const [query, setQuery] = useState("");
  const [players, setPlayers] = useState<PlayerSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY) {
      requestId.current += 1;
      setPlayers([]);
      setError(null);
      setLoading(false);
      setSearched(false);
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
          setPlayers(payload.players ?? []);
          setSearched(true);
        })
        .catch((err: unknown) => {
          if (id !== requestId.current) return;
          setPlayers([]);
          setSearched(true);
          setError(err instanceof Error ? err.message : "Search failed");
        })
        .finally(() => {
          if (id === requestId.current) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [query]);

  return (
    <section className="space-y-4">
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

      <label className="block max-w-xl">
        <span className="sr-only">Search players</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name or ID…"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-base text-[var(--ink)] outline-none ring-[var(--felt-soft)] transition placeholder:text-[var(--muted)] focus:ring-2"
        />
      </label>

      {error ? (
        <div className="rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger-bg)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      {loading ? <LoadingState label="Searching FairMatch…" /> : null}

      {!loading && query.trim().length > 0 && query.trim().length < MIN_QUERY ? (
        <p className="text-sm text-[var(--muted)]">
          Type at least {MIN_QUERY} characters to search.
        </p>
      ) : null}

      {!loading && searched && !error && players.length === 0 ? (
        <EmptyState
          title="No players found"
          body="Try a fuller name, last name first, or a membership ID."
        />
      ) : null}

      {!loading && players.length > 0 ? (
        <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-[1.3rem] border border-[var(--line)] bg-[var(--surface)]/90">
          {players.map((player) => (
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
                  {player.robustness != null ? ` · ${player.robustness}` : ""}
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
      ) : null}
    </section>
  );
}
