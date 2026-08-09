"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  LEAGUE_SYSTEM_OPTIONS,
  type LeagueSystem,
  type TablesideLeague,
} from "@/lib/leagues/types";
import { EmptyState } from "./EmptyState";
import { LoadingState } from "./LoadingState";
import { SectionCard } from "./SectionCard";
import { SelectField } from "./SelectField";

type ManageCreateLeagueProps = {
  signedIn: boolean;
  onRequestLogin: () => void;
  canOpenLms: boolean;
  onOpenLms: () => void;
};

export function ManageCreateLeague({
  signedIn,
  onRequestLogin,
  canOpenLms,
  onOpenLms,
}: ManageCreateLeagueProps) {
  const [leagues, setLeagues] = useState<TablesideLeague[]>([]);
  const [loading, setLoading] = useState(signedIn);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [system, setSystem] = useState<LeagueSystem>("custom");
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!signedIn) {
      setLeagues([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetch("/api/leagues", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as {
          leagues?: TablesideLeague[];
          error?: string;
        } | null;
        if (!response.ok) {
          throw new Error(payload?.error || "Could not load leagues.");
        }
        if (!cancelled) setLeagues(payload?.leagues ?? []);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load leagues.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!signedIn) {
      onRequestLogin();
      return;
    }
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch("/api/leagues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, system, region, city, description }),
      });
      const payload = (await response.json().catch(() => null)) as {
        league?: TablesideLeague;
        error?: string;
      } | null;
      if (!response.ok || !payload?.league) {
        throw new Error(payload?.error || "Could not create league.");
      }
      setLeagues((prev) => [payload.league!, ...prev]);
      setName("");
      setDescription("");
      setStatus(`Created “${payload.league.name}”. Divisions and schedules come next.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create league.");
    } finally {
      setSaving(false);
    }
  };

  if (!signedIn) {
    return (
      <section className="animate-rise space-y-4">
        <SectionCard
          eyebrow="Manage"
          title="Create a league"
          description="Start a Tableside league for BCA, APA, TAP, or your own rules — without waiting on an LMS operator seat."
        />
        <EmptyState
          title="Sign in to create a league"
          body="Use a Tableside account. You can connect FargoRate or League Operator later for Score and LMS tools."
          action={
            <button
              type="button"
              onClick={onRequestLogin}
              className="rounded-[var(--radius)] bg-[var(--felt)] px-4 py-2.5 text-sm font-semibold text-white"
            >
              Sign in
            </button>
          }
        />
      </section>
    );
  }

  return (
    <section className="animate-rise space-y-4">
      <SectionCard
        eyebrow="Manage"
        title="Create a league"
        description="Tableside-owned leagues for multi-system play. APA/TAP adapters and full division builders will plug in here."
        badge={{ label: "Yours", value: String(leagues.length) }}
      />

      <form
        onSubmit={(event) => void onSubmit(event)}
        className="space-y-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow)] sm:p-5"
      >
        <div className="space-y-1.5">
          <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
            League name
          </label>
          <input
            required
            minLength={3}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Coastal Tuesday 9-Ball"
            className="w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--paper)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none ring-[var(--felt)] focus:ring-2"
          />
        </div>

        <div className="space-y-1.5">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
            System
          </span>
          <SelectField
            aria-label="League system"
            value={system}
            onChange={(value) => setSystem(value as LeagueSystem)}
            options={LEAGUE_SYSTEM_OPTIONS.map((option) => ({
              value: option.id,
              label: option.label,
            }))}
          />
          <p className="text-[11px] text-[var(--muted)]">
            {LEAGUE_SYSTEM_OPTIONS.find((option) => option.id === system)?.hint}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              Region
            </label>
            <input
              value={region}
              onChange={(event) => setRegion(event.target.value)}
              placeholder="Florida"
              className="w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--paper)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none ring-[var(--felt)] focus:ring-2"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              City / area
            </label>
            <input
              value={city}
              onChange={(event) => setCity(event.target.value)}
              placeholder="Palm Beach"
              className="w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--paper)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none ring-[var(--felt)] focus:ring-2"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
            Description
          </label>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            placeholder="Night, format notes, who can join…"
            className="w-full resize-y rounded-[var(--radius)] border border-[var(--line)] bg-[var(--paper)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none ring-[var(--felt)] focus:ring-2"
          />
        </div>

        {error ? (
          <p className="text-sm text-[var(--danger)]">{error}</p>
        ) : null}
        {status ? (
          <p className="text-sm text-[var(--felt-deep)]">{status}</p>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="submit"
            disabled={saving || name.trim().length < 3}
            className="rounded-[var(--radius)] bg-[var(--felt)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create league"}
          </button>
          {canOpenLms ? (
            <button
              type="button"
              onClick={onOpenLms}
              className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-4 py-2.5 text-sm font-semibold text-[var(--ink)]"
            >
              Open Fargo LMS
            </button>
          ) : null}
        </div>
      </form>

      <div className="space-y-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
          Your Tableside leagues
        </h3>
        {loading ? (
          <LoadingState label="Loading your leagues…" />
        ) : leagues.length === 0 ? (
          <EmptyState
            title="No leagues yet"
            body="Create one above. You’ll add divisions, teams, and scoring formats in follow-up steps."
          />
        ) : (
          <ul className="space-y-2">
            {leagues.map((league) => {
              const systemLabel =
                LEAGUE_SYSTEM_OPTIONS.find(
                  (option) => option.id === league.system,
                )?.label ?? league.system;
              return (
                <li
                  key={league.id}
                  className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3.5 py-3"
                >
                  <p className="text-sm font-semibold text-[var(--ink)]">
                    {league.name}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {systemLabel}
                    {league.city || league.region
                      ? ` · ${[league.city, league.region].filter(Boolean).join(", ")}`
                      : ""}
                  </p>
                  {league.description ? (
                    <p className="mt-1.5 text-sm text-[var(--muted)]">
                      {league.description}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
