"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
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
  /** Denser input; hide the field label when the parent supplies one inline. */
  compact?: boolean;
  hideLabel?: boolean;
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
  compact = false,
  hideLabel = false,
}: PartnerSearchFieldProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const requestId = useRef(0);
  const [query, setQuery] = useState(() => selectedLabel(value));
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const [mounted, setMounted] = useState(false);

  const selectedKey = value.fargoPlayerId
    ? `${value.fargoPlayerId}:${value.ratingAtSignup ?? ""}:${value.displayName}`
    : "";

  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync from parent only when a real Fargo pick (or clear) is applied.
  useEffect(() => {
    if (value.fargoPlayerId) {
      setQuery(selectedLabel(value));
      return;
    }
    if (!value.displayName) {
      setQuery("");
    }
  }, [selectedKey, value.displayName, value.fargoPlayerId, value.ratingAtSignup]);

  useEffect(() => {
    const q = query.trim();
    // Skip lookup only after an actual Fargo selection is showing.
    if (value.fargoPlayerId && selectedLabel(value) === q) {
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
    // Intentionally omit full `value` — only the selected Fargo id gates the skip.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- value.fargoPlayerId + query drive search
  }, [query, value.fargoPlayerId]);

  const showMenu =
    open &&
    (loading ||
      results.length > 0 ||
      Boolean(error) ||
      (searched && query.trim().length >= MIN_QUERY));

  const wasMenuOpen = useRef(false);
  useLayoutEffect(() => {
    if (!showMenu || !inputRef.current) {
      wasMenuOpen.current = false;
      return;
    }

    const updatePosition = () => {
      const input = inputRef.current!;
      const rect = input.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewTop = viewport?.offsetTop ?? 0;
      const viewHeight = viewport?.height ?? window.innerHeight;
      const viewBottom = viewTop + viewHeight;
      const gap = 4;
      const pad = 8;
      const spaceBelow = Math.max(0, viewBottom - rect.bottom - gap - pad);
      const spaceAbove = Math.max(0, rect.top - viewTop - gap - pad);
      // Prefer below the field; only flip up when below has almost no room.
      const openUpward = spaceBelow < 96 && spaceAbove > spaceBelow;
      const available = Math.max(openUpward ? spaceAbove : spaceBelow, 72);
      const maxHeight = Math.min(240, available);
      const width = Math.min(
        Math.max(rect.width, 220),
        (viewport?.width ?? window.innerWidth) - pad * 2,
      );
      const left = Math.min(
        Math.max(pad, rect.left),
        (viewport?.width ?? window.innerWidth) - width - pad,
      );

      setMenuStyle({
        position: "fixed",
        left,
        width,
        top: openUpward ? undefined : rect.bottom + gap,
        bottom: openUpward
          ? Math.max(pad, window.innerHeight - rect.top + gap)
          : undefined,
        maxHeight,
        zIndex: 10050,
      });
    };

    // On first open, nudge the field into view so results fit below the keyboard.
    if (!wasMenuOpen.current) {
      wasMenuOpen.current = true;
      inputRef.current.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
      window.setTimeout(updatePosition, 280);
    }
    updatePosition();
    const vv = window.visualViewport;
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    vv?.addEventListener("resize", updatePosition);
    vv?.addEventListener("scroll", updatePosition);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      vv?.removeEventListener("resize", updatePosition);
      vv?.removeEventListener("scroll", updatePosition);
    };
  }, [showMenu, results.length, loading, error]);

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
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

  const showLabel = !hideLabel && !compact;
  const inputClass = compact
    ? "w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:ring-2 focus:ring-[var(--felt-soft)]"
    : "w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:ring-2 focus:ring-[var(--felt-soft)]";

  const menu =
    mounted && showMenu
      ? createPortal(
          <ul
            ref={menuRef}
            id={listId}
            role="listbox"
            style={menuStyle}
            className="overflow-auto rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] py-1 shadow-[var(--shadow)]"
          >
            {error ? (
              <li className="px-3 py-2 text-xs text-[var(--danger)]">
                {error}
              </li>
            ) : null}
            {loading ? (
              <li className="px-3 py-2 text-xs text-[var(--muted)]">
                Searching Fargo…
              </li>
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
          </ul>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <label className="block min-w-0">
        {showLabel ? (
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
            {label}
          </span>
        ) : (
          <span className="sr-only">{label}</span>
        )}
        <span className="relative block min-w-0">
          <input
            ref={inputRef}
            className={inputClass}
            value={query}
            placeholder={placeholder}
            aria-label={label}
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
          {loading && compact ? (
            <span
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-medium text-[var(--muted)]"
              aria-hidden
            >
              …
            </span>
          ) : null}
        </span>
      </label>
      {loading && !compact ? (
        <p className="mt-1 text-[11px] text-[var(--muted)]">Searching Fargo…</p>
      ) : null}
      {menu}
    </div>
  );
}
