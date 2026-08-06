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

function playerLabel(player: PlayerSearchResult): string {
  const ordered = [player.firstName, player.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return ordered || player.name || "Unknown";
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
  const [query, setQuery] = useState(
    value.displayName
      ? `${value.displayName}${
          value.ratingAtSignup != null ? ` · ${value.ratingAtSignup}` : ""
        }`
      : "",
  );
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!value.displayName) {
      setQuery("");
      return;
    }
    setQuery(
      `${value.displayName}${
        value.ratingAtSignup != null ? ` · ${value.ratingAtSignup}` : ""
      }`,
    );
  }, [value.displayName, value.ratingAtSignup]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    // Don't re-search when the field is showing a selected player label.
    if (
      value.displayName &&
      q.startsWith(value.displayName) &&
      (value.ratingAtSignup == null || q.includes(String(value.ratingAtSignup)))
    ) {
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void fetch(`/api/players/search?q=${encodeURIComponent(q)}`)
        .then(async (res) => {
          const data = (await res.json()) as {
            players?: PlayerSearchResult[];
          };
          if (id !== requestId.current) return;
          setResults(data.players ?? []);
          setOpen(true);
        })
        .catch(() => {
          if (id !== requestId.current) return;
          setResults([]);
        })
        .finally(() => {
          if (id === requestId.current) setLoading(false);
        });
    }, 280);
    return () => window.clearTimeout(timer);
  }, [query, value.displayName, value.ratingAtSignup]);

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pick = (player: PlayerSearchResult) => {
    const next: PartnerPick = {
      displayName: playerLabel(player),
      ratingAtSignup: player.effectiveRating ?? player.rating ?? null,
      fargoPlayerId: player.id || null,
      readableId: player.readableId,
    };
    onChange(next);
    setQuery(
      `${next.displayName}${
        next.ratingAtSignup != null ? ` · ${next.ratingAtSignup}` : ""
      }`,
    );
    setOpen(false);
    setResults([]);
  };

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
            onChange({
              displayName: next.trim(),
              ratingAtSignup: null,
              fargoPlayerId: null,
              readableId: null,
            });
            setOpen(true);
          }}
          onFocus={() => {
            if (results.length) setOpen(true);
          }}
        />
      </label>
      {loading ? (
        <p className="mt-1 text-[11px] text-[var(--muted)]">Searching…</p>
      ) : null}
      {open && results.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] py-1 shadow-[var(--shadow)]"
        >
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
                  onClick={() => pick(player)}
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
