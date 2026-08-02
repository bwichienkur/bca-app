"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";
import type { ReportTab } from "@/lib/types";
import { REPORT_TABS } from "@/lib/constants";

type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  onNavigate: (tab: ReportTab) => void;
  onOpenSettings: () => void;
  onOpenLogin: () => void;
  signedIn: boolean;
};

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

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const nav = REPORT_TABS.map((tab) => ({
      id: tab.id,
      label: tab.label,
      hint: "Navigate",
      run: () => onNavigate(tab.id),
    }));
    const extras = [
      {
        id: "settings",
        label: signedIn ? "Settings" : "Login",
        hint: "Account",
        run: () => (signedIn ? onOpenSettings() : onOpenLogin()),
      },
    ];
    return [...nav, ...extras].filter((item) =>
      !q ? true : item.label.toLowerCase().includes(q),
    );
  }, [query, onNavigate, onOpenLogin, onOpenSettings, signedIn]);

  if (!open || !mounted) return null;

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
            items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    item.run();
                    onClose();
                  }}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-[var(--surface-2)]"
                >
                  <span className="font-medium text-[var(--ink)]">{item.label}</span>
                  <span className="text-[11px] text-[var(--muted)]">{item.hint}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
