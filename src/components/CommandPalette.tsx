"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Clock, Search, Star } from "lucide-react";
import type { ReportTab } from "@/lib/types";
import { REPORT_TABS } from "@/lib/constants";

const RECENT_KEY = "tableside.command.recent.v1";
const FAVORITES_KEY = "tableside.command.favorites.v1";

type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  onNavigate: (tab: ReportTab) => void;
  onOpenSettings: () => void;
  onOpenLogin: () => void;
  signedIn: boolean;
};

type CommandItem = {
  id: string;
  label: string;
  hint: string;
  run: () => void;
  tabId?: ReportTab;
};

function readList(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function writeList(key: string, values: string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(values.slice(0, 8)));
  } catch {
    /* ignore quota */
  }
}

export function CommandPalette({
  open,
  onClose,
  onNavigate,
  onOpenSettings,
  onOpenLogin,
  signedIn,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [mounted, setMounted] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setHighlight(0);
      return;
    }
    setRecent(readList(RECENT_KEY));
    setFavorites(readList(FAVORITES_KEY));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const remember = (id: string) => {
    const next = [id, ...readList(RECENT_KEY).filter((item) => item !== id)];
    writeList(RECENT_KEY, next);
    setRecent(next);
  };

  const toggleFavorite = (id: string) => {
    const current = readList(FAVORITES_KEY);
    const next = current.includes(id)
      ? current.filter((item) => item !== id)
      : [id, ...current];
    writeList(FAVORITES_KEY, next);
    setFavorites(next);
  };

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const nav: CommandItem[] = REPORT_TABS.map((tab) => ({
      id: tab.id,
      label: tab.label,
      hint: tab.hint,
      tabId: tab.id,
      run: () => {
        remember(tab.id);
        onNavigate(tab.id);
      },
    }));
    const extras: CommandItem[] = [
      {
        id: "settings",
        label: signedIn ? "Settings" : "Login",
        hint: "Account",
        run: () => (signedIn ? onOpenSettings() : onOpenLogin()),
      },
    ];
    const all = [...nav, ...extras];
    if (q) {
      return all.filter((item) => item.label.toLowerCase().includes(q));
    }

    const byId = new Map(all.map((item) => [item.id, item]));
    const favoriteItems = favorites
      .map((id) => byId.get(id))
      .filter((item): item is CommandItem => Boolean(item));
    const recentItems = recent
      .filter((id) => !favorites.includes(id))
      .map((id) => byId.get(id))
      .filter((item): item is CommandItem => Boolean(item));
    const rest = all.filter(
      (item) => !favorites.includes(item.id) && !recent.includes(item.id),
    );

    const ordered: CommandItem[] = [];
    for (const item of favoriteItems) {
      ordered.push({ ...item, hint: `Favorite · ${item.hint}` });
    }
    for (const item of recentItems) {
      ordered.push({ ...item, hint: `Recent · ${item.hint}` });
    }
    ordered.push(...rest);
    return ordered;
  }, [
    query,
    onNavigate,
    onOpenLogin,
    onOpenSettings,
    signedIn,
    recent,
    favorites,
  ]);

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  if (!open || !mounted) return null;

  const runItem = (item: CommandItem) => {
    item.run();
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center bg-black/55 p-4 pt-[12vh] backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="ui-glass w-full max-w-lg overflow-hidden rounded-[22px] border border-[var(--line-strong)] shadow-[var(--shadow)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3">
          <Search className="h-4 w-4 text-[var(--muted)]" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setHighlight((index) =>
                  Math.min(index + 1, Math.max(items.length - 1, 0)),
                );
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setHighlight((index) => Math.max(index - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                const item = items[highlight];
                if (item) runItem(item);
              }
            }}
            placeholder="Jump to a page…"
            className="w-full bg-transparent text-[15px] text-[var(--ink)] outline-none placeholder:text-[var(--muted)]"
          />
          <kbd className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1 text-[10px] font-semibold text-[var(--muted)]">
            ESC
          </kbd>
        </div>
        <ul className="max-h-80 overflow-y-auto p-2">
          {items.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-[var(--muted)]">
              No matches
            </li>
          ) : (
            items.map((item, index) => {
              const isFavorite = favorites.includes(item.id);
              const isRecent = recent.includes(item.id);
              return (
                <li key={item.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => runItem(item)}
                    onMouseEnter={() => setHighlight(index)}
                    className={[
                      "flex min-w-0 flex-1 items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition",
                      index === highlight
                        ? "bg-[color-mix(in_srgb,var(--felt)_16%,transparent)]"
                        : "hover:bg-[var(--surface-2)]",
                    ].join(" ")}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {isFavorite ? (
                        <Star className="h-3.5 w-3.5 shrink-0 fill-[var(--amber)] text-[var(--amber)]" />
                      ) : isRecent && !query ? (
                        <Clock className="h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
                      ) : null}
                      <span className="truncate font-medium text-[var(--ink)]">
                        {item.label}
                      </span>
                    </span>
                    <span className="ml-3 shrink-0 text-[11px] text-[var(--muted)]">
                      {item.hint}
                    </span>
                  </button>
                  {item.tabId ? (
                    <button
                      type="button"
                      title={isFavorite ? "Remove favorite" : "Add favorite"}
                      aria-label={
                        isFavorite ? "Remove favorite" : "Add favorite"
                      }
                      onClick={() => toggleFavorite(item.id)}
                      className="ui-focus mr-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[var(--muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
                    >
                      <Star
                        className={[
                          "h-3.5 w-3.5",
                          isFavorite
                            ? "fill-[var(--amber)] text-[var(--amber)]"
                            : "",
                        ].join(" ")}
                      />
                    </button>
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
