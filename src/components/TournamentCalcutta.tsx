"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  formatCalcuttaMoney,
  lotLabel,
  summarizeCalcutta,
} from "@/lib/tournaments/calcutta";
import type {
  CalcuttaStatus,
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

const STATUS_OPTIONS: Array<{ id: CalcuttaStatus; label: string }> = [
  { id: "setup", label: "Setup" },
  { id: "live", label: "Live" },
  { id: "settled", label: "Settled" },
];

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
    void load();
  }, [load]);

  const summary = useMemo(
    () => (calcutta ? summarizeCalcutta(calcutta) : null),
    [calcutta],
  );

  const save = async (next: TournamentCalcutta, successMsg?: string) => {
    if (!isOrganizer) return;
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
      if (data.calcutta) setCalcutta(data.calcutta);
      setNote(successMsg ?? "Calcutta saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save Calcutta.");
    } finally {
      setSaving(false);
    }
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
          description={
            calcutta.status === "settled"
              ? "Auction settled — payouts below."
              : calcutta.status === "live"
                ? "Auction in progress. Sold board updates as the organizer records bids."
                : "Calcutta is set up for this event."
          }
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
                const sold = lot.soldPriceCents != null;
                return (
                  <li
                    key={lot.registrationId}
                    className="flex items-start justify-between gap-3 px-3 py-3 sm:px-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[var(--ink)]">
                        {lotLabel(regById.get(lot.registrationId), lot.registrationId)}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                        {sold
                          ? `Buyer: ${lot.buyerName || "—"}${
                              lot.buyBackHalf ? " · half buy-back" : ""
                            }`
                          : "Unsold"}
                        {lot.place != null ? ` · Place ${lot.place}` : ""}
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

        {summary && summary.payouts.some((p) => p.amountCents > 0) ? (
          <section className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]">
            <div className="border-b border-[var(--line)] px-3 py-2.5 sm:px-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                Payout schedule
              </p>
            </div>
            <ul className="divide-y divide-[var(--line)]">
              {summary.payouts.map((row) => (
                <li
                  key={row.place}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--ink)]">
                      {row.place}
                      {row.place === 1
                        ? "st"
                        : row.place === 2
                          ? "nd"
                          : row.place === 3
                            ? "rd"
                            : "th"}{" "}
                      · {row.percent}%
                    </p>
                    <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                      {row.registrationId
                        ? `${lotLabel(regById.get(row.registrationId), row.registrationId)}${
                            row.buyBackHalf ? " (split w/ player)" : ""
                          }`
                        : "Place not assigned yet"}
                      {row.buyerName ? ` · ${row.buyerName}` : ""}
                    </p>
                  </div>
                  <p className="shrink-0 tabular-nums font-semibold text-[var(--ink)]">
                    {formatCalcuttaMoney(row.amountCents)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </section>
    );
  }

  // Organizer manage view
  return (
    <div className="space-y-4">
      <SectionCard
        eyebrow="Side pot"
        title="Calcutta"
        description="Organizer ledger for the player/team auction. Record hammer prices, buy-backs, and finishing places — pot payouts update live."
        badge={{
          label: "Pot",
          value: formatCalcuttaMoney(summary?.netPotCents ?? 0).replace(
            /^\$/,
            "",
          ),
        }}
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label="Gross pot"
          value={formatCalcuttaMoney(summary?.grossPotCents ?? 0)}
        />
        <Stat
          label="House cut"
          value={formatCalcuttaMoney(summary?.houseCutCents ?? 0)}
        />
        <Stat
          label="Net pot"
          value={formatCalcuttaMoney(summary?.netPotCents ?? 0)}
        />
        <Stat
          label="Sold"
          value={`${summary?.soldCount ?? 0}/${summary?.lotCount ?? 0}`}
        />
      </div>

      <section className="space-y-3 overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[var(--shadow)] sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
            <input
              type="checkbox"
              checked={calcutta.enabled}
              onChange={(event) =>
                setCalcutta({ ...calcutta, enabled: event.target.checked })
              }
            />
            Calcutta enabled (public board)
          </label>
          <div
            role="group"
            aria-label="Calcutta status"
            className="inline-flex gap-0.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] p-0.5"
          >
            {STATUS_OPTIONS.map((item) => {
              const selected = calcutta.status === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCalcutta({ ...calcutta, status: item.id })}
                  className={[
                    "rounded-md px-2.5 py-1 text-xs font-semibold transition",
                    selected
                      ? "bg-[var(--felt)] text-white"
                      : "text-[var(--muted)] hover:text-[var(--ink)]",
                  ].join(" ")}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

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
              className="w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:ring-2 focus:ring-[var(--felt-soft)]"
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
              className="w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:ring-2 focus:ring-[var(--felt-soft)]"
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

        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
            Payout % by place
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {calcutta.payoutTiers.map((tier, index) => (
              <label key={tier.place} className="block min-w-0 text-sm">
                <span className="mb-1 block text-[11px] text-[var(--muted)]">
                  {tier.place}
                  {tier.place === 1
                    ? "st"
                    : tier.place === 2
                      ? "nd"
                      : tier.place === 3
                        ? "rd"
                        : "th"}{" "}
                  (%)
                </span>
                <input
                  inputMode="decimal"
                  value={String(tier.percent)}
                  onChange={(event) => {
                    const n = Number(event.target.value);
                    const payoutTiers = calcutta.payoutTiers.map((row, i) =>
                      i === index
                        ? {
                            ...row,
                            percent: Number.isFinite(n)
                              ? Math.max(0, n)
                              : 0,
                          }
                        : row,
                    );
                    setCalcutta({ ...calcutta, payoutTiers });
                  }}
                  className="w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:ring-2 focus:ring-[var(--felt-soft)]"
                />
              </label>
            ))}
          </div>
        </div>

        <button
          type="button"
          disabled={saving}
          onClick={() => void save(calcutta, "Settings saved.")}
          className="rounded-[var(--radius)] bg-[var(--felt)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
      </section>

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

      <section className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-3 py-3 sm:px-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
              Auction ledger
            </p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              One lot per approved entry. Record hammer price and settlement.
            </p>
          </div>
          <button
            type="button"
            disabled={saving || approved.length === 0}
            onClick={() => void save(calcutta, "Ledger saved.")}
            className="rounded-[var(--radius)] bg-[var(--felt)] px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save ledger"}
          </button>
        </div>

        {approved.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-[var(--muted)]">
            Approve signups first — Calcutta lots follow the field board.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {calcutta.lots.map((lot, index) => {
              const reg = regById.get(lot.registrationId);
              return (
                <li key={lot.registrationId} className="space-y-2.5 px-3 py-3.5 sm:px-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--ink)]">
                        {lotLabel(reg, lot.registrationId)}
                      </p>
                      {reg ? (
                        <p className="mt-0.5 text-xs text-[var(--muted)]">
                          {reg.displayName}
                          {reg.ratingAtSignup != null
                            ? ` · Fargo ${reg.ratingAtSignup}`
                            : ""}
                        </p>
                      ) : null}
                    </div>
                    <p className="text-xs tabular-nums text-[var(--muted)]">
                      Lot {index + 1}
                    </p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="block min-w-0 text-sm">
                      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                        Buyer
                      </span>
                      <input
                        value={lot.buyerName}
                        onChange={(event) => {
                          const lots = calcutta.lots.map((row) =>
                            row.registrationId === lot.registrationId
                              ? { ...row, buyerName: event.target.value }
                              : row,
                          );
                          setCalcutta({ ...calcutta, lots });
                        }}
                        placeholder="Buyer name"
                        className="w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:ring-2 focus:ring-[var(--felt-soft)]"
                      />
                    </label>
                    <label className="block min-w-0 text-sm">
                      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                        Sold price ($)
                      </span>
                      <input
                        inputMode="decimal"
                        value={dollarsInput(lot.soldPriceCents)}
                        onChange={(event) => {
                          const cents = parseDollars(event.target.value);
                          const lots = calcutta.lots.map((row) =>
                            row.registrationId === lot.registrationId
                              ? { ...row, soldPriceCents: cents }
                              : row,
                          );
                          setCalcutta({ ...calcutta, lots });
                        }}
                        placeholder={dollarsInput(calcutta.minBidCents)}
                        className="w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:ring-2 focus:ring-[var(--felt-soft)]"
                      />
                    </label>
                    <label className="block min-w-0 text-sm">
                      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                        Finish place
                      </span>
                      <input
                        inputMode="numeric"
                        value={lot.place == null ? "" : String(lot.place)}
                        onChange={(event) => {
                          const raw = event.target.value.trim();
                          const place =
                            raw === ""
                              ? null
                              : Math.max(1, Math.floor(Number(raw)) || 1);
                          const lots = calcutta.lots.map((row) =>
                            row.registrationId === lot.registrationId
                              ? { ...row, place }
                              : row,
                          );
                          setCalcutta({ ...calcutta, lots });
                        }}
                        placeholder="—"
                        className="w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:ring-2 focus:ring-[var(--felt-soft)]"
                      />
                    </label>
                    <label className="block min-w-0 text-sm">
                      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                        Notes
                      </span>
                      <input
                        value={lot.notes}
                        onChange={(event) => {
                          const lots = calcutta.lots.map((row) =>
                            row.registrationId === lot.registrationId
                              ? { ...row, notes: event.target.value }
                              : row,
                          );
                          setCalcutta({ ...calcutta, lots });
                        }}
                        placeholder="Optional"
                        className="w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:ring-2 focus:ring-[var(--felt-soft)]"
                      />
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-3 text-xs font-semibold text-[var(--ink)]">
                    {calcutta.allowBuyBackHalf ? (
                      <label className="inline-flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={lot.buyBackHalf}
                          onChange={(event) => {
                            const lots = calcutta.lots.map((row) =>
                              row.registrationId === lot.registrationId
                                ? {
                                    ...row,
                                    buyBackHalf: event.target.checked,
                                  }
                                : row,
                            );
                            setCalcutta({ ...calcutta, lots });
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
                          const lots = calcutta.lots.map((row) =>
                            row.registrationId === lot.registrationId
                              ? { ...row, buyerPaid: event.target.checked }
                              : row,
                          );
                          setCalcutta({ ...calcutta, lots });
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
                            const lots = calcutta.lots.map((row) =>
                              row.registrationId === lot.registrationId
                                ? {
                                    ...row,
                                    playerPaidBuyBack: event.target.checked,
                                  }
                                : row,
                            );
                            setCalcutta({ ...calcutta, lots });
                          }}
                        />
                        Player paid half
                      </label>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {summary && summary.payouts.length ? (
        <section className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]">
          <div className="border-b border-[var(--line)] px-3 py-2.5 sm:px-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
              Projected payouts
            </p>
          </div>
          <ul className="divide-y divide-[var(--line)]">
            {summary.payouts.map((row) => (
              <li
                key={row.place}
                className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--ink)]">
                    Place {row.place} · {row.percent}%
                  </p>
                  <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                    {row.registrationId
                      ? `${lotLabel(regById.get(row.registrationId), row.registrationId)}${
                          row.buyBackHalf ? " · split with player" : ""
                        }${row.buyerName ? ` · ${row.buyerName}` : ""}`
                      : "Assign a finish place on a sold lot"}
                  </p>
                </div>
                <p className="shrink-0 tabular-nums font-semibold text-[var(--felt-deep)]">
                  {formatCalcuttaMoney(row.amountCents)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
