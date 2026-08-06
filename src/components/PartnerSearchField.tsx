"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { PlayerSearchResult } from "@/lib/types";

export type PartnerPick = {
  displayName: string;
  ratingAtSignup: number | null;
  fargoPlayerId: string | null;
  readableId: string | null;
};

type PartnerSearchFieldProps = {
  label: string;
  value: PartnerPick;
  onChange: (next: PartnerPick) => void;
  placeholder?: string;
};

const MIN_QUERY = 2;
const DEBOUNCE_MS = 280;

function playerLabel(player: PlayerSearchResult): string {
  const ordered = [player.firstName, player.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return ordered || player.name || "Unknown";
}

function selectedLabel(value: PartnerPick): string {
  if (!value.displayName) return "";
  return `${value.displayName}${
    value.ratingAtSignup != null ? ` · ${value.ratingAtSignup}` : ""
  }`;
}

export function PartnerSearchField({
  label,
  value,
  onChange,
  placeholder = "Search name or Fargo ID…",
}: PartnerSearchFieldProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);
  const [query, setQuery] = useState(() => selectedLabel(value));
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  // Sync from parent only when a real Fargo pick (or clear) is applied.
  useEffect(() => {
    if (value.fargoPlayerId) {
      setQuery(selectedLabel(value));
      return;
    }
    if (!value.displayName) {
      setQuery("");
    }
  }, [value.displayName, value.fargoPlayerId, value.ratingAtSignup]);

  useEffect(() => {
    const q = query.trim();
    // Skip lookup only after an actual Fargo selection is showing.
    if (
      value.fargoPlayerId &&
      selectedLabel(value) === query.trim()
    ) {
      setLoading(false);
      return;
    }
    if (q.length < MIN_QUERY) {
      requestId.current += 1;
      setResults([]);
      setError(null);
      setLoading(false);
      setSearched(false);
      return;
    }

    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      void fetch(`/api/players/search?q=${encodeURIComponent(q)}`)
        .then(async (res) => {
          const data = (await res.json()) as {
            players?: PlayerSearchResult[];
            error?: string;
          };
          if (!res.ok) {
            throw new Error(data.error || "Search failed");
          }
          if (id !== requestId.current) return;
          setResults(data.players ?? []);
          setSearched(true);
          setOpen(true);
        })
        .catch((err: unknown) => {
          if (id !== requestId.current) return;
          setResults([]);
          setSearched(true);
          setOpen(true);
          setError(err instanceof Error ? err.message : "Search failed");
        })
        .finally(() => {
          if (id === requestId.current) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [query, value]);

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const commitFreeText = (raw: string) => {
    const displayName = raw.trim();
    onChange({
      displayName,
      ratingAtSignup: null,
      fargoPlayerId: null,
      readableId: null,
    });
  };

  const pick = (player: PlayerSearchResult) => {
    const next: PartnerPick = {
      displayName: playerLabel(player),
      ratingAtSignup: player.effectiveRating ?? player.rating ?? null,
      fargoPlayerId: player.id || null,
      readableId: player.readableId,
    };
    onChange(next);
    setQuery(selectedLabel(next));
    setOpen(false);
    setResults([]);
    setError(null);
    setSearched(false);
  };

  const showMenu =
    open &&
    (loading ||
      results.length > 0 ||
      Boolean(error) ||
      (searched && query.trim().length >= MIN_QUERY));

  return (
    <div ref={rootRef} className="relative min-w-0">
      <label className="block min-w-0">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
          {label}
        </span>
        <input
          className="w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:ring-2 focus:ring-[var(--felt-soft)]"
          value={query}
          placeholder={placeholder}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            // Clear a prior Fargo pick as soon as the user edits the field.
            if (value.fargoPlayerId || value.displayName !== next.trim()) {
              onChange({
                displayName: next.trim(),
                ratingAtSignup: null,
                fargoPlayerId: null,
                readableId: null,
              });
            }
            setOpen(true);
          }}
          onFocus={() => {
            if (
              results.length > 0 ||
              error ||
              (searched && query.trim().length >= MIN_QUERY)
            ) {
              setOpen(true);
            }
          }}
          onBlur={() => {
            // Keep free-text names for partners not found in Fargo.
            window.setTimeout(() => {
              if (!value.fargoPlayerId) commitFreeText(query);
            }, 120);
          }}
        />
      </label>
      {loading ? (
        <p className="mt-1 text-[11px] text-[var(--muted)]">Searching Fargo…</p>
      ) : null}
      {showMenu ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] py-1 shadow-[var(--shadow)]"
        >
          {error ? (
            <li className="px-3 py-2 text-xs text-[var(--danger)]">{error}</li>
          ) : null}
          {!loading && !error && searched && results.length === 0 ? (
            <li className="px-3 py-2 text-xs text-[var(--muted)]">
              No Fargo players found. You can still type a name.
            </li>
          ) : null}
          {results.slice(0, 8).map((player) => {
            const name = playerLabel(player);
            const rating = player.effectiveRating ?? player.rating;
            const meta = [
              player.readableId ? `#${player.readableId}` : null,
              rating != null ? String(rating) : null,
              player.location?.trim() || null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={player.id}>
                <button
                  type="button"
                  role="option"
                  className="flex w-full flex-col px-3 py-2 text-left transition hover:bg-[var(--surface-2)]"
                  onMouseDown={(event) => {
                    // Prevent input blur from racing the pick.
                    event.preventDefault();
                    pick(player);
                  }}
                >
                  <span className="text-sm font-semibold text-[var(--ink)]">
                    {name}
                  </span>
                  {meta ? (
                    <span className="text-[11px] text-[var(--muted)]">
                      {meta}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
