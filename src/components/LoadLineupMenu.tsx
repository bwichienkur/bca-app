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
import type { LineupPreset } from "@/lib/types";

type LoadLineupMenuProps = {
  presets: LineupPreset[];
  onLoad: (preset: LineupPreset) => void;
  disabled?: boolean;
  /** Compact label for tight headers. */
  label?: string;
};

export function LoadLineupMenu({
  presets,
  onLoad,
  disabled = false,
  label = "Load",
}: LoadLineupMenuProps) {
  const listId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;

    const updatePosition = () => {
      const rect = buttonRef.current!.getBoundingClientRect();
      const menuHeight = Math.min(280, window.innerHeight * 0.5);
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpward = spaceBelow < menuHeight + 12 && rect.top > spaceBelow;
      setMenuStyle({
        position: "fixed",
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 260)),
        width: Math.min(260, window.innerWidth - 16),
        top: openUpward ? undefined : rect.bottom + 6,
        bottom: openUpward
          ? Math.max(8, window.innerHeight - rect.top + 6)
          : undefined,
        maxHeight: menuHeight,
        zIndex: 10000,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, presets.length]);

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target)) return;
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

  const menu =
    open && mounted
      ? createPortal(
          <div
            ref={menuRef}
            id={listId}
            role="listbox"
            aria-label="Saved lineup templates"
            style={menuStyle}
            className="overflow-hidden rounded-xl border border-[var(--line-strong)] bg-[var(--surface-2)] shadow-[var(--shadow)]"
          >
            {presets.length === 0 ? (
              <div className="px-3 py-3 text-sm text-[var(--muted)]">
                No templates yet. Save one under Team → Lineups.
              </div>
            ) : (
              <ul className="max-h-full overflow-y-auto py-1">
                {presets.map((preset) => (
                  <li key={preset.id}>
                    <button
                      type="button"
                      role="option"
                      onClick={() => {
                        onLoad(preset);
                        setOpen(false);
                      }}
                      className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-left transition hover:bg-[var(--surface-3)]"
                    >
                      <span className="truncate text-sm font-semibold text-[var(--ink)]">
                        {preset.name}
                      </span>
                      <span className="text-[11px] text-[var(--muted)]">
                        {preset.playerIds.length} players
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          if (disabled) return;
          setOpen((current) => !current);
        }}
        className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--ink)] transition hover:border-[var(--line-strong)] hover:bg-[var(--surface-3)] disabled:opacity-40"
      >
        {label}
        <span aria-hidden className="text-[var(--muted)]">
          ▾
        </span>
      </button>
      {menu}
    </div>
  );
}
