"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { PlayerSelect } from "./PlayerSelect";

export type LineupListPlayer = {
  id: string;
  label: string;
  rating: number | null;
};

type DragState = { from: number };

function GripIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 16"
      width="10"
      height="14"
      aria-hidden
      className={className}
    >
      <circle cx="3.5" cy="3" r="1.4" fill="currentColor" />
      <circle cx="8.5" cy="3" r="1.4" fill="currentColor" />
      <circle cx="3.5" cy="8" r="1.4" fill="currentColor" />
      <circle cx="8.5" cy="8" r="1.4" fill="currentColor" />
      <circle cx="3.5" cy="13" r="1.4" fill="currentColor" />
      <circle cx="8.5" cy="13" r="1.4" fill="currentColor" />
    </svg>
  );
}

function moveSlotPreview<T>(
  lineup: T[],
  from: number,
  to: number,
): T[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= lineup.length ||
    to >= lineup.length
  ) {
    return lineup;
  }
  const next = [...lineup];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function GhostRow({
  player,
  slotLabel,
  floating,
  style,
}: {
  player: LineupListPlayer;
  slotLabel: string;
  floating?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      style={style}
      className={[
        "flex items-center gap-2 rounded-xl border px-2.5 py-2 shadow-[var(--shadow)]",
        floating
          ? "pointer-events-none border-[var(--felt)] bg-[color-mix(in_srgb,var(--surface)_82%,var(--felt))] opacity-90 backdrop-blur-sm"
          : "border-dashed border-[var(--felt)] bg-[color-mix(in_srgb,var(--felt)_16%,var(--surface))] opacity-80",
      ].join(" ")}
    >
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--felt-deep)]">
        <GripIcon />
      </span>
      <span className="w-6 shrink-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
        {slotLabel}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--ink)]">
        {player.label}
        {player.rating != null ? (
          <span className="ml-1.5 tabular-nums text-[var(--felt-deep)]">
            {player.rating}
          </span>
        ) : null}
      </span>
    </div>
  );
}

export function DraggableLineupList({
  title,
  subtitle,
  slotPrefix,
  lineupIds,
  roster,
  onChange,
  onMove,
  footer,
  actions,
  disabled = false,
}: {
  title: string;
  subtitle: string;
  slotPrefix: string;
  lineupIds: (string | null)[];
  roster: LineupListPlayer[];
  onChange: (index: number, playerId: string | null) => void;
  onMove: (from: number, to: number) => void;
  footer?: ReactNode;
  /** Compact controls shown beside the filled badge (e.g. Load menu). */
  actions?: ReactNode;
  disabled?: boolean;
}) {
  const slots = lineupIds.length;
  const filled = lineupIds.filter(Boolean).length;
  const listRef = useRef<HTMLOListElement>(null);
  const onMoveRef = useRef(onMove);
  const [mounted, setMounted] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dropTo, setDropTo] = useState<number>(-1);
  const dropToRef = useRef(-1);
  const [ghost, setGhost] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const playerById = useMemo(() => {
    const map = new Map<string, LineupListPlayer>();
    for (const player of roster) map.set(player.id, player);
    return map;
  }, [roster]);

  const lineupPlayers = useMemo(
    () =>
      lineupIds.map((id) => (id ? playerById.get(id) ?? null : null)),
    [lineupIds, playerById],
  );

  const dragFrom = drag?.from ?? -1;
  const dragTo = drag ? (dropTo >= 0 ? dropTo : dragFrom) : -1;
  const draggedPlayer = dragFrom >= 0 ? lineupPlayers[dragFrom] : null;

  const previewIds = useMemo(() => {
    if (!drag || dragFrom < 0 || dragTo < 0) return lineupIds;
    return moveSlotPreview(lineupIds, dragFrom, dragTo);
  }, [drag, dragFrom, dragTo, lineupIds]);

  const previewPlayers = useMemo(
    () =>
      previewIds.map((id) => (id ? playerById.get(id) ?? null : null)),
    [previewIds, playerById],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);

  useEffect(() => {
    dropToRef.current = dropTo;
  }, [dropTo]);

  const unlockBodyScroll = () => {
    document.body.style.touchAction = "";
    document.body.style.userSelect = "";
    document.body.style.overflow = "";
  };

  const clearDrag = () => {
    unlockBodyScroll();
    setDrag(null);
    setDropTo(-1);
    setGhost(null);
  };

  const indexFromClientY = (clientY: number): number | null => {
    const list = listRef.current;
    if (!list) return null;
    const items = Array.from(list.querySelectorAll<HTMLElement>("[data-slot]"));
    if (!items.length) return null;
    let closest = 0;
    let closestDistance = Number.POSITIVE_INFINITY;
    items.forEach((item, index) => {
      const rect = item.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      const distance = Math.abs(clientY - mid);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = index;
      }
    });
    return closest;
  };

  useEffect(() => {
    if (!drag || dragFrom < 0) return;

    document.body.style.touchAction = "none";
    document.body.style.userSelect = "none";
    document.body.style.overflow = "hidden";

    const onPointerMove = (event: PointerEvent) => {
      event.preventDefault();
      setGhost((current) =>
        current
          ? { ...current, x: event.clientX, y: event.clientY }
          : current,
      );
      const next = indexFromClientY(event.clientY);
      if (next == null) return;
      setDropTo(next);
    };

    const onPointerUp = (event: PointerEvent) => {
      event.preventDefault();
      const target =
        dropToRef.current >= 0
          ? dropToRef.current
          : (indexFromClientY(event.clientY) ?? dragFrom);
      if (target !== dragFrom) {
        onMoveRef.current(dragFrom, target);
      }
      clearDrag();
    };

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      unlockBodyScroll();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, dragFrom]);

  useEffect(() => () => unlockBodyScroll(), []);

  const onGripPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    index: number,
    rowEl: HTMLElement | null,
  ) => {
    if (disabled || !lineupPlayers[index] || drag) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = (rowEl ?? event.currentTarget).getBoundingClientRect();
    setGhost({
      x: event.clientX,
      y: event.clientY,
      width: rect.width,
      height: rowEl?.offsetHeight ?? rect.height,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    });
    setDrag({ from: index });
    setDropTo(index);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(12);
      } catch {
        // ignore
      }
    }
  };

  return (
    <div className="min-w-0 overflow-hidden rounded-[1.3rem] border border-[var(--line)] bg-[var(--surface)] p-3 shadow-sm sm:p-3.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1 overflow-hidden">
          <h4 className="truncate font-[family-name:var(--font-display)] text-lg text-[var(--felt-deep)]">
            {title}
          </h4>
          <p className="truncate text-xs text-[var(--muted)]">{subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {actions}
          <span
            className={[
              "rounded-full px-2.5 py-1 text-xs font-semibold",
              filled === slots
                ? "bg-[var(--felt)] text-white"
                : "bg-[var(--surface-2)] text-[var(--muted)]",
            ].join(" ")}
          >
            {filled}/{slots}
          </span>
        </div>
      </div>

      <ol
        ref={listRef}
        className="min-w-0 divide-y divide-[var(--line)] overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-2)]"
      >
        {Array.from({ length: slots }).map((_, index) => {
          const player = previewPlayers[index];
          const isLandingGhost =
            Boolean(drag) &&
            dragFrom !== dragTo &&
            dragTo === index &&
            Boolean(draggedPlayer);
          const isLiftedSource =
            Boolean(drag) && dragFrom === dragTo && index === dragFrom;

          return (
            <li key={`${slotPrefix}-${index}`} data-slot={index} className="relative">
              {isLandingGhost && draggedPlayer ? (
                <div className="px-2 py-1.5">
                  <GhostRow
                    player={draggedPlayer}
                    slotLabel={`${slotPrefix}${index + 1}`}
                  />
                </div>
              ) : (
                <div
                  data-lineup-card
                  className={[
                    "flex min-w-0 items-center gap-1.5 px-2 py-1.5 transition duration-150 sm:gap-2 sm:px-2.5",
                    isLiftedSource
                      ? "z-20 bg-[var(--surface-3)] opacity-30"
                      : "z-0",
                  ].join(" ")}
                >
                  {player && !disabled ? (
                    <button
                      type="button"
                      aria-label={`Drag ${slotPrefix}${index + 1}`}
                      onPointerDown={(event) => {
                        const row = event.currentTarget.closest(
                          "[data-lineup-card]",
                        ) as HTMLElement | null;
                        onGripPointerDown(event, index, row);
                      }}
                      className="touch-none inline-flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded-md text-[var(--felt-deep)] transition hover:bg-[var(--surface-3)] active:cursor-grabbing"
                    >
                      <GripIcon />
                    </button>
                  ) : (
                    <span
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--muted)]"
                      aria-hidden
                    >
                      <GripIcon />
                    </span>
                  )}

                  <span className="w-6 shrink-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                    {slotPrefix}
                    {index + 1}
                  </span>

                  <div className="min-w-0 flex-1">
                    <PlayerSelect
                      value={previewIds[index] ?? ""}
                      options={roster}
                      placeholder="Open slot…"
                      disabled={disabled}
                      compact
                      onChange={(id) => onChange(index, id || null)}
                    />
                  </div>

                  {player && !disabled ? (
                    <div className="flex shrink-0 items-center">
                      <button
                        type="button"
                        aria-label="Move up"
                        disabled={index === 0 || Boolean(drag)}
                        onClick={() => onMove(index, index - 1)}
                        className="inline-flex h-7 w-6 items-center justify-center rounded-md text-[10px] text-[var(--muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--ink)] disabled:opacity-25"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        aria-label="Move down"
                        disabled={index >= slots - 1 || Boolean(drag)}
                        onClick={() => onMove(index, index + 1)}
                        className="inline-flex h-7 w-6 items-center justify-center rounded-md text-[10px] text-[var(--muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--ink)] disabled:opacity-25"
                      >
                        ▼
                      </button>
                    </div>
                  ) : (
                    <span className="w-12 shrink-0" aria-hidden />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <p className="mt-2 text-[11px] text-[var(--muted)]">
        {disabled
          ? "Lineup is locked for this scoresheet."
          : "Drag ⠿ to reorder, or use ▲ ▼ · handicaps follow Fargo"}
      </p>
      {footer}

      {mounted &&
      drag &&
      draggedPlayer &&
      ghost &&
      typeof document !== "undefined"
        ? createPortal(
            <GhostRow
              player={draggedPlayer}
              slotLabel={`${slotPrefix}${(dragTo >= 0 ? dragTo : dragFrom) + 1}`}
              floating
              style={{
                position: "fixed",
                left: ghost.x - ghost.offsetX,
                top: ghost.y - ghost.offsetY,
                width: ghost.width,
                minHeight: ghost.height,
                zIndex: 200,
                transform: "scale(1.02) rotate(-0.8deg)",
              }}
            />,
            document.body,
          )
        : null}
    </div>
  );
}
