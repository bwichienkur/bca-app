"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  formatCalcuttaMoney,
  lotLabel,
  summarizeCalcutta,
} from "@/lib/tournaments/calcutta";
import type {
  CalcuttaLot,
  TournamentCalcutta,
  TournamentRegistration,
} from "@/lib/tournaments/types";
import { EmptyState } from "./EmptyState";
import { LoadingState } from "./LoadingState";
import { SectionCard } from "./SectionCard";

type TournamentCalcuttaPanelProps = {
  tournamentId: string;
  registrations: TournamentRegistration[];
  isOrganizer: boolean;
  /** Compact sold board for Overview; full ledger for organizer tab. */
  variant?: "board" | "manage";
};

type LotFilter = "unsold" | "sold" | "all";

function dollarsInput(cents: number | null): string {
  if (cents == null) return "";
  const dollars = cents / 100;
  return dollars % 1 === 0 ? String(dollars) : dollars.toFixed(2);
}

function parseDollars(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function isLotSold(lot: CalcuttaLot): boolean {
  return lot.soldPriceCents != null && lot.soldPriceCents > 0;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)]/70 px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-1.5 font-[family-name:var(--font-display)] text-xl font-semibold tabular-nums text-[var(--ink)]">
        {value}
      </p>
    </div>
  );
}

const fieldClass =
  "w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:ring-2 focus:ring-[var(--felt-soft)]";

const compactFieldClass =
  "w-full rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:ring-2 focus:ring-[var(--felt-soft)]";

function LotExpandIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className={[
        "h-4 w-4 transition-transform",
        open ? "rotate-180" : "",
      ].join(" ")}
    >
      <path
        d="M5 7.5 10 12.5 15 7.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TournamentCalcuttaPanel({
  tournamentId,
  registrations,
  isOrganizer,
  variant = "manage",
}: TournamentCalcuttaPanelProps) {
  const [calcutta, setCalcutta] = useState<TournamentCalcutta | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [lotFilter, setLotFilter] = useState<LotFilter>("unsold");
  const [activeLotId, setActiveLotId] = useState<string | null>(null);
  const [draftBuyer, setDraftBuyer] = useState("");
  const [draftPrice, setDraftPrice] = useState("");
  const [expandedLotId, setExpandedLotId] = useState<string | null>(null);
  const [lotsListMinHeight, setLotsListMinHeight] = useState(0);
  const priceInputRef = useRef<HTMLInputElement | null>(null);
  const buyerInputRef = useRef<HTMLInputElement | null>(null);
  const lotsSectionRef = useRef<HTMLElement | null>(null);
  const lotsListRef = useRef<HTMLDivElement | null>(null);
  const lotFilterAnchorTop = useRef<number | null>(null);

  const approved = useMemo(
    () => registrations.filter((reg) => reg.status === "approved"),
    [registrations],
  );
  const regById = useMemo(() => {
    const map = new Map<string, TournamentRegistration>();
    for (const reg of approved) map.set(reg.id, reg);
    return map;
  }, [approved]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tournaments/${encodeURIComponent(tournamentId)}/calcutta`,
      );
      const data = (await res.json()) as {
        calcutta?: TournamentCalcutta | null;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Failed to load Calcutta.");
      setCalcutta(data.calcutta ?? null);
    } catch (err) {
      setCalcutta(null);
      setError(err instanceof Error ? err.message : "Failed to load Calcutta.");
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    setLotsListMinHeight(0);
    void load();
  }, [load]);

  const summary = useMemo(
    () => (calcutta ? summarizeCalcutta(calcutta) : null),
    [calcutta],
  );

  const unsoldLots = useMemo(
    () => (calcutta ? calcutta.lots.filter((lot) => !isLotSold(lot)) : []),
    [calcutta],
  );

  const filteredLots = useMemo(() => {
    if (!calcutta) return [];
    if (lotFilter === "unsold") return calcutta.lots.filter((lot) => !isLotSold(lot));
    if (lotFilter === "sold") return calcutta.lots.filter((lot) => isLotSold(lot));
    return calcutta.lots;
  }, [calcutta, lotFilter]);

  const changeLotFilter = (next: LotFilter) => {
    if (next === lotFilter) return;
    lotFilterAnchorTop.current =
      lotsSectionRef.current?.getBoundingClientRect().top ?? null;
    setLotFilter(next);
  };

  // Keep the Lots header pinned in the viewport when the list shrinks/grows,
  // and ratchet a min-height so the page doesn't collapse under the scroll.
  useLayoutEffect(() => {
    const list = lotsListRef.current;
    if (list) {
      const height = list.scrollHeight;
      if (height > 0) {
        setLotsListMinHeight((prev) => Math.max(prev, height));
      }
    }

    const section = lotsSectionRef.current;
    const anchor = lotFilterAnchorTop.current;
    if (section && anchor != null) {
      const delta = section.getBoundingClientRect().top - anchor;
      if (Math.abs(delta) > 0.5) {
        window.scrollBy(0, delta);
      }
      lotFilterAnchorTop.current = null;
    }
  }, [filteredLots.length, lotFilter]);

  const activeLot = useMemo(() => {
    if (!calcutta || !activeLotId) return null;
    return (
      calcutta.lots.find((lot) => lot.registrationId === activeLotId) ?? null
    );
  }, [activeLotId, calcutta]);

  const syncDraftFromLot = useCallback((lot: CalcuttaLot | null) => {
    if (!lot) {
      setDraftBuyer("");
      setDraftPrice("");
      return;
    }
    setDraftBuyer(lot.buyerName);
    setDraftPrice(dollarsInput(lot.soldPriceCents));
  }, []);

  // Keep an active lot for the call strip: current selection, else first unsold.
  useEffect(() => {
    if (!calcutta) return;
    if (
      activeLotId &&
      calcutta.lots.some((lot) => lot.registrationId === activeLotId)
    ) {
      return;
    }
    const nextId = unsoldLots[0]?.registrationId ?? calcutta.lots[0]?.registrationId ?? null;
    setActiveLotId(nextId);
  }, [activeLotId, calcutta, unsoldLots]);

  useEffect(() => {
    syncDraftFromLot(activeLot);
  }, [activeLot, syncDraftFromLot]);

  const save = async (
    next: TournamentCalcutta,
    successMsg?: string,
  ): Promise<TournamentCalcutta | null> => {
    if (!isOrganizer) return null;
    setSaving(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(
        `/api/tournaments/${encodeURIComponent(tournamentId)}/calcutta`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        },
      );
      const data = (await res.json()) as {
        calcutta?: TournamentCalcutta;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Failed to save Calcutta.");
      if (data.calcutta) {
        setCalcutta(data.calcutta);
        setNote(successMsg ?? "Calcutta saved.");
        return data.calcutta;
      }
      setCalcutta(next);
      setNote(successMsg ?? "Calcutta saved.");
      return next;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save Calcutta.");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const patchLot = (
    registrationId: string,
    patch: Partial<CalcuttaLot>,
  ): TournamentCalcutta | null => {
    if (!calcutta) return null;
    const lots = calcutta.lots.map((row) =>
      row.registrationId === registrationId ? { ...row, ...patch } : row,
    );
    const next = { ...calcutta, lots };
    setCalcutta(next);
    return next;
  };

  const selectLot = (registrationId: string) => {
    setActiveLotId(registrationId);
    if (lotFilter === "sold") changeLotFilter("all");
    requestAnimationFrame(() => {
      priceInputRef.current?.focus();
      priceInputRef.current?.select();
    });
  };

  const markSold = async () => {
    if (!calcutta || !activeLot) return;
    const cents = parseDollars(draftPrice);
    if (cents == null || cents <= 0) {
      setError("Enter a sold price.");
      priceInputRef.current?.focus();
      return;
    }
    const buyerName = draftBuyer.trim();
    if (!buyerName) {
      setError("Enter the buyer name.");
      buyerInputRef.current?.focus();
      return;
    }

    const lots = calcutta.lots.map((row) =>
      row.registrationId === activeLot.registrationId
        ? { ...row, buyerName, soldPriceCents: cents }
        : row,
    );
    const next = { ...calcutta, lots, status: "live" as const };
    setCalcutta(next);
    const saved = await save(
      next,
      `Sold ${lotLabel(regById.get(activeLot.registrationId), activeLot.registrationId)} · ${formatCalcuttaMoney(cents)}`,
    );
    const source = saved ?? next;
    const nextUnsold = source.lots.find(
      (lot) =>
        lot.registrationId !== activeLot.registrationId && !isLotSold(lot),
    );
    if (nextUnsold) {
      setActiveLotId(nextUnsold.registrationId);
      changeLotFilter("unsold");
      requestAnimationFrame(() => {
        priceInputRef.current?.focus();
      });
    } else {
      changeLotFilter("sold");
    }
  };

  const clearSale = async (registrationId: string) => {
    const next = patchLot(registrationId, {
      soldPriceCents: null,
      buyerName: "",
    });
    if (!next) return;
    await save(next, "Sale cleared.");
    setActiveLotId(registrationId);
    changeLotFilter("unsold");
  };

  if (loading) {
    return <LoadingState label="Loading Calcutta…" />;
  }

  if (error && !calcutta) {
    return <EmptyState title="Calcutta unavailable" body={error} />;
  }

  if (!calcutta) {
    if (variant === "board") return null;
    return (
      <EmptyState
        title="No Calcutta yet"
        body="Enable a Calcutta to track the player/team auction ledger for this event."
      />
    );
  }

  if (variant === "board") {
    if (!calcutta.enabled) return null;
    return (
      <section className="space-y-3">
        <SectionCard
          eyebrow="Side pot"
          title="Calcutta"
          description={`${summary?.soldCount ?? 0}/${summary?.lotCount ?? 0} sold · net ${formatCalcuttaMoney(summary?.netPotCents ?? 0)}`}
          badge={{
            label: "Pot",
            value: formatCalcuttaMoney(summary?.netPotCents ?? 0).replace(
              /^\$/,
              "",
            ),
          }}
        />

        <div className="grid grid-cols-3 gap-2">
          <Stat
            label="Gross pot"
            value={formatCalcuttaMoney(summary?.grossPotCents ?? 0)}
          />
          <Stat
            label="Sold"
            value={`${summary?.soldCount ?? 0}/${summary?.lotCount ?? 0}`}
          />
          <Stat
            label="Min bid"
            value={formatCalcuttaMoney(calcutta.minBidCents)}
          />
        </div>

        <section className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]">
          <div className="border-b border-[var(--line)] px-3 py-2.5 sm:px-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
              Sold board
            </p>
          </div>
          <ul className="divide-y divide-[var(--line)]">
            {calcutta.lots.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-[var(--muted)]">
                No approved entries yet.
              </li>
            ) : (
              calcutta.lots.map((lot) => {
                const sold = isLotSold(lot);
                return (
                  <li
                    key={lot.registrationId}
                    className="flex items-start justify-between gap-3 px-3 py-3 sm:px-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[var(--ink)]">
                        {lotLabel(
                          regById.get(lot.registrationId),
                          lot.registrationId,
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                        {sold
                          ? `Buyer: ${lot.buyerName || "—"}${
                              lot.buyBackHalf ? " · half buy-back" : ""
                            }`
                          : "Unsold"}
                      </p>
                    </div>
                    <p
                      className={[
                        "shrink-0 font-[family-name:var(--font-display)] text-lg tabular-nums",
                        sold ? "text-[var(--felt-deep)]" : "text-[var(--muted)]",
                      ].join(" ")}
                    >
                      {sold
                        ? formatCalcuttaMoney(lot.soldPriceCents ?? 0)
                        : "—"}
                    </p>
                  </li>
                );
              })
            )}
          </ul>
        </section>
      </section>
    );
  }

  const activeReg = activeLot
    ? regById.get(activeLot.registrationId)
    : undefined;

  // Organizer manage view — auction ledger (buyer + hammer price)
  return (
    <div className="space-y-3">
      <SectionCard
        eyebrow="Side pot"
        title="Calcutta"
        description={`${summary?.soldCount ?? 0}/${summary?.lotCount ?? 0} sold · net ${formatCalcuttaMoney(summary?.netPotCents ?? 0)}`}
        badge={{
          label: "Pot",
          value: formatCalcuttaMoney(summary?.netPotCents ?? 0).replace(
            /^\$/,
            "",
          ),
        }}
      />

      <details className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]">
        <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-[var(--muted)] sm:px-4 [&::-webkit-details-marker]:hidden">
          Settings · min {formatCalcuttaMoney(calcutta.minBidCents)} · house{" "}
          {calcutta.houseCutPercent}%
          {calcutta.enabled ? " · public" : ""}
        </summary>
        <div className="space-y-3 border-t border-[var(--line)] p-3 sm:p-4">
          <label className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
            <input
              type="checkbox"
              checked={calcutta.enabled}
              onChange={(event) => {
                const next = { ...calcutta, enabled: event.target.checked };
                setCalcutta(next);
                void save(
                  next,
                  event.target.checked
                    ? "Public board on."
                    : "Public board off.",
                );
              }}
            />
            Show public board on Overview
          </label>

          <div className="grid gap-2 sm:grid-cols-3">
            <label className="block min-w-0 text-sm">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                Min bid ($)
              </span>
              <input
                inputMode="decimal"
                value={dollarsInput(calcutta.minBidCents)}
                onChange={(event) => {
                  const cents = parseDollars(event.target.value);
                  setCalcutta({
                    ...calcutta,
                    minBidCents: cents ?? 0,
                  });
                }}
                className={fieldClass}
              />
            </label>
            <label className="block min-w-0 text-sm">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                House cut (%)
              </span>
              <input
                inputMode="decimal"
                value={String(calcutta.houseCutPercent)}
                onChange={(event) => {
                  const n = Number(event.target.value);
                  setCalcutta({
                    ...calcutta,
                    houseCutPercent: Number.isFinite(n)
                      ? Math.min(100, Math.max(0, n))
                      : 0,
                  });
                }}
                className={fieldClass}
              />
            </label>
            <label className="flex items-end gap-2 pb-2 text-sm font-semibold text-[var(--ink)]">
              <input
                type="checkbox"
                checked={calcutta.allowBuyBackHalf}
                onChange={(event) =>
                  setCalcutta({
                    ...calcutta,
                    allowBuyBackHalf: event.target.checked,
                  })
                }
              />
              Allow buy-back half
            </label>
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={() => void save(calcutta, "Settings saved.")}
            className="rounded-[var(--radius)] bg-[var(--felt)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
      </details>

      {note ? (
        <p className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--felt-deep)]">
          {note}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-[var(--radius)] border border-[var(--danger)]/40 bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      {approved.length === 0 ? (
        <p className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-4 py-6 text-center text-sm text-[var(--muted)] shadow-[var(--shadow)]">
          Approve signups first — Calcutta lots follow the field board.
        </p>
      ) : (
        <>
          {activeLot ? (
            <section className="sticky top-0 z-20 space-y-2.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[var(--shadow)] sm:p-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                    Now selling
                    {unsoldLots.length > 0
                      ? ` · ${unsoldLots.length} left`
                      : " · all sold"}
                  </p>
                  <p className="mt-0.5 font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-[var(--ink)]">
                    {lotLabel(activeReg, activeLot.registrationId)}
                    {activeReg?.ratingAtSignup != null ? (
                      <span className="ml-1.5 text-sm font-normal tabular-nums text-[var(--muted)]">
                        {activeReg.ratingAtSignup}
                      </span>
                    ) : null}
                  </p>
                </div>
                <p className="text-xs tabular-nums text-[var(--muted)]">
                  Min {formatCalcuttaMoney(calcutta.minBidCents)}
                </p>
              </div>

              <form
                className="grid grid-cols-[1fr_5.5rem_auto] items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void markSold();
                }}
              >
                <label className="block min-w-0">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                    Buyer
                  </span>
                  <input
                    ref={buyerInputRef}
                    value={draftBuyer}
                    onChange={(event) => setDraftBuyer(event.target.value)}
                    placeholder="Buyer name"
                    autoComplete="off"
                    className={compactFieldClass}
                  />
                </label>
                <label className="block min-w-0">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                    Sold $
                  </span>
                  <input
                    ref={priceInputRef}
                    inputMode="decimal"
                    value={draftPrice}
                    onChange={(event) => setDraftPrice(event.target.value)}
                    placeholder={dollarsInput(calcutta.minBidCents) || "0"}
                    className={`${compactFieldClass} tabular-nums`}
                  />
                </label>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-[var(--radius)] bg-[linear-gradient(180deg,#2f8fc2_0%,var(--felt)_45%,var(--felt-soft)_100%)] px-3.5 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {saving ? "…" : "Sold"}
                </button>
              </form>
            </section>
          ) : null}

          <section
            ref={lotsSectionRef}
            className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-3 py-2.5 sm:px-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                Lots
              </p>
              <div
                role="group"
                aria-label="Lot filter"
                className="inline-flex gap-0.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] p-0.5"
              >
                {(
                  [
                    ["unsold", `Unsold ${unsoldLots.length}`],
                    [
                      "sold",
                      `Sold ${summary?.soldCount ?? 0}`,
                    ],
                    ["all", `All ${calcutta.lots.length}`],
                  ] as const
                ).map(([id, label]) => {
                  const selected = lotFilter === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => changeLotFilter(id)}
                      className={[
                        "rounded-md px-2 py-1 text-[11px] font-semibold transition",
                        selected
                          ? "bg-[var(--felt)] text-white shadow-sm"
                          : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]",
                      ].join(" ")}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              ref={lotsListRef}
              style={
                lotsListMinHeight > 0
                  ? { minHeight: lotsListMinHeight }
                  : undefined
              }
            >
            {filteredLots.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-[var(--muted)]">
                {lotFilter === "unsold"
                  ? "Every lot is sold."
                  : lotFilter === "sold"
                    ? "No sales recorded yet."
                    : "No lots yet."}
              </p>
            ) : (
              <ul className="divide-y divide-[var(--line)]">
                {filteredLots.map((lot) => {
                  const reg = regById.get(lot.registrationId);
                  const sold = isLotSold(lot);
                  const active = lot.registrationId === activeLotId;
                  const expanded = lot.registrationId === expandedLotId;
                  const lotIndex =
                    calcutta.lots.findIndex(
                      (row) => row.registrationId === lot.registrationId,
                    ) + 1;
                  return (
                    <li
                      key={lot.registrationId}
                      className={[
                        "px-3 py-2 sm:px-4",
                        active
                          ? "bg-[color-mix(in_srgb,var(--felt)_10%,transparent)]"
                          : "",
                      ].join(" ")}
                    >
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => selectLot(lot.registrationId)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <p className="truncate font-[family-name:var(--font-display)] text-sm font-semibold text-[var(--ink)]">
                            <span className="mr-1.5 text-[10px] font-semibold tabular-nums text-[var(--muted)]">
                              {lotIndex}
                            </span>
                            {lotLabel(reg, lot.registrationId)}
                            {reg?.ratingAtSignup != null ? (
                              <span className="ml-1.5 font-normal tabular-nums text-[var(--muted)]">
                                {reg.ratingAtSignup}
                              </span>
                            ) : null}
                          </p>
                          {sold || active ? (
                            <p className="mt-0.5 truncate text-[11px] text-[var(--muted)]">
                              {sold
                                ? lot.buyerName || "Buyer not named"
                                : "Up next"}
                              {lot.buyBackHalf ? " · ½ buy-back" : ""}
                            </p>
                          ) : null}
                        </button>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <p
                            className={[
                              "min-w-[2.5rem] text-right text-sm font-semibold tabular-nums",
                              sold
                                ? "text-[var(--felt-deep)]"
                                : "text-[var(--muted)]",
                            ].join(" ")}
                          >
                            {sold
                              ? formatCalcuttaMoney(lot.soldPriceCents ?? 0)
                              : "—"}
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedLotId(
                                expanded ? null : lot.registrationId,
                              )
                            }
                            className={[
                              "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius)] text-[var(--felt)] transition hover:bg-[color-mix(in_srgb,var(--felt)_14%,transparent)]",
                              expanded ? "bg-[color-mix(in_srgb,var(--felt)_14%,transparent)]" : "",
                            ].join(" ")}
                            aria-expanded={expanded}
                            aria-label={
                              expanded
                                ? `Hide details for ${lotLabel(reg, lot.registrationId)}`
                                : `Show details for ${lotLabel(reg, lot.registrationId)}`
                            }
                            title={expanded ? "Hide details" : "Details"}
                          >
                            <LotExpandIcon open={expanded} />
                          </button>
                        </div>
                      </div>

                      {expanded ? (
                        <div className="mt-2 space-y-2 border-t border-[var(--line)] pt-2">
                          <div className="grid grid-cols-[1fr_5.5rem] gap-2">
                            <label className="block min-w-0">
                              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                                Buyer
                              </span>
                              <input
                                value={lot.buyerName}
                                onChange={(event) => {
                                  patchLot(lot.registrationId, {
                                    buyerName: event.target.value,
                                  });
                                }}
                                onBlur={(event) => {
                                  const next = patchLot(lot.registrationId, {
                                    buyerName: event.target.value,
                                  });
                                  if (next) void save(next);
                                }}
                                className={compactFieldClass}
                              />
                            </label>
                            <label className="block min-w-0">
                              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                                Sold $
                              </span>
                              <input
                                inputMode="decimal"
                                value={dollarsInput(lot.soldPriceCents)}
                                onChange={(event) => {
                                  patchLot(lot.registrationId, {
                                    soldPriceCents: parseDollars(
                                      event.target.value,
                                    ),
                                  });
                                }}
                                onBlur={(event) => {
                                  const next = patchLot(lot.registrationId, {
                                    soldPriceCents: parseDollars(
                                      event.target.value,
                                    ),
                                  });
                                  if (next) void save(next);
                                }}
                                className={`${compactFieldClass} tabular-nums`}
                              />
                            </label>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-[var(--ink)]">
                            {calcutta.allowBuyBackHalf ? (
                              <label className="inline-flex items-center gap-1.5">
                                <input
                                  type="checkbox"
                                  checked={lot.buyBackHalf}
                                  onChange={(event) => {
                                    const next = patchLot(lot.registrationId, {
                                      buyBackHalf: event.target.checked,
                                    });
                                    if (next) void save(next);
                                  }}
                                />
                                Buy-back half
                              </label>
                            ) : null}
                            <label className="inline-flex items-center gap-1.5">
                              <input
                                type="checkbox"
                                checked={lot.buyerPaid}
                                onChange={(event) => {
                                  const next = patchLot(lot.registrationId, {
                                    buyerPaid: event.target.checked,
                                  });
                                  if (next) void save(next);
                                }}
                              />
                              Buyer paid
                            </label>
                            {calcutta.allowBuyBackHalf && lot.buyBackHalf ? (
                              <label className="inline-flex items-center gap-1.5">
                                <input
                                  type="checkbox"
                                  checked={lot.playerPaidBuyBack}
                                  onChange={(event) => {
                                    const next = patchLot(lot.registrationId, {
                                      playerPaidBuyBack: event.target.checked,
                                    });
                                    if (next) void save(next);
                                  }}
                                />
                                Player paid half
                              </label>
                            ) : null}
                            {sold ? (
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() =>
                                  void clearSale(lot.registrationId)
                                }
                                className="text-[var(--danger)]"
                              >
                                Clear sale
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            </div>
          </section>
        </>
      )}

    </div>
  );
}
