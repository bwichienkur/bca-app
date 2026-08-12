"use client";

import { useEffect, useMemo, useState } from "react";
import type { DivisionLink, DivisionLinkValidation } from "@/lib/division-links";
import { findSisterDivision } from "@/lib/division-combos";
import {
  defaultNightLeg,
  defaultStandingSide,
  defaultScoringSide,
  legsNightHint,
  legsStandingFormula,
  normalizeNightLegs,
  standingRawColumnHeadersForLegs,
  STANDING_METRIC_OPTIONS,
  type DivisionLinkScoringSide,
  type DivisionLinkStandingSide,
  type NightLeg,
  type StandingScoreMetric,
} from "@/lib/division-link-config";
import { LEAGUE_SCORING_FORMATS } from "@/lib/scoring-formats";
import { RACE_CHART_OPTIONS, type RaceChartId } from "@/lib/race-charts";
import {
  IconSubTabs,
  OverviewSubIcon,
  RoundsSubIcon,
  StatsSubIcon,
  type IconSubTabItem,
} from "./IconSubTabs";
import { Typeahead, type TypeaheadOption } from "./Typeahead";

const inputClass =
  "w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none ring-[var(--felt)] focus:ring-2";
const selectClass = inputClass;
const btnPrimary =
  "inline-flex items-center justify-center rounded-[var(--radius)] bg-[var(--felt)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50";
const btnGhost =
  "inline-flex items-center justify-center rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--ink)] disabled:opacity-50";
const btnDelete =
  "inline-flex items-center justify-center rounded-[var(--radius)] border border-[var(--danger)]/40 bg-[var(--danger-bg)] px-3 py-2 text-sm font-semibold text-[var(--danger)] disabled:opacity-50";

type DivisionOption = { id: string; name: string };
type LinkFormTab = "divisions" | "standing" | "race";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  if (!response.ok) {
    throw new Error(payload?.error || `Request failed (${response.status})`);
  }
  return payload as T;
}

function toOption(
  division: DivisionOption | null | undefined,
): TypeaheadOption<DivisionOption> | null {
  if (!division) return null;
  return {
    id: division.id,
    label: division.name,
    value: division,
  };
}

function emptyLegDraft(index: number): NightLeg {
  return defaultNightLeg({
    divisionId: "",
    divisionName: "",
    index,
  });
}

function StandingSideFields({
  title,
  side,
  onChange,
}: {
  title: string;
  side: DivisionLinkStandingSide;
  onChange: (next: DivisionLinkStandingSide) => void;
}) {
  return (
    <fieldset className="space-y-2 rounded-[var(--radius)] border border-[var(--line)] p-3">
      <legend className="px-1 text-sm font-semibold text-[var(--ink)]">
        {title}
      </legend>
      <label className="block space-y-1 text-sm">
        <span className="text-[var(--muted)]">Role hint</span>
        <select
          className={selectClass}
          value={side.role}
          onChange={(e) =>
            onChange({
              ...side,
              role: e.target.value === "teams" ? "teams" : "singles",
            })
          }
        >
          <option value="singles">Singles</option>
          <option value="teams">Teams</option>
        </select>
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-[var(--muted)]">
          Main scoring column (from LMS standings)
        </span>
        <select
          className={selectClass}
          value={side.metric}
          onChange={(e) =>
            onChange({
              ...side,
              metric: e.target.value as StandingScoreMetric,
            })
          }
        >
          {STANDING_METRIC_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label} — {opt.hint}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1 text-sm">
          <span className="text-[var(--muted)]">
            Multiplier into STANDING
          </span>
          <input
            type="number"
            min={0}
            step={0.5}
            className={inputClass}
            value={side.multiplier}
            onChange={(e) =>
              onChange({
                ...side,
                multiplier: Number(e.target.value),
              })
            }
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-[var(--muted)]">Max / night (hint)</span>
          <input
            type="number"
            min={0}
            step={1}
            className={inputClass}
            value={side.maxNightPoints}
            onChange={(e) =>
              onChange({
                ...side,
                maxNightPoints: Number(e.target.value),
              })
            }
          />
        </label>
      </div>
    </fieldset>
  );
}

function ScoringSideFields({
  title,
  side,
  onChange,
}: {
  title: string;
  side: DivisionLinkScoringSide;
  onChange: (next: DivisionLinkScoringSide) => void;
}) {
  return (
    <fieldset className="space-y-2 rounded-[var(--radius)] border border-[var(--line)] p-3">
      <legend className="px-1 text-sm font-semibold text-[var(--ink)]">
        {title}
      </legend>
      <label className="block space-y-1 text-sm">
        <span className="text-[var(--muted)]">Scoring format override</span>
        <select
          className={selectClass}
          value={side.scoringFormatId ?? ""}
          onChange={(e) =>
            onChange({
              ...side,
              scoringFormatId: e.target.value || null,
            })
          }
        >
          <option value="">Infer from division name</option>
          {LEAGUE_SCORING_FORMATS.map((format) => (
            <option key={format.id} value={format.id}>
              {format.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-[var(--muted)]">Race chart (handicap)</span>
        <select
          className={selectClass}
          value={side.raceChartId ?? ""}
          onChange={(e) =>
            onChange({
              ...side,
              raceChartId: (e.target.value || null) as RaceChartId | null,
            })
          }
        >
          <option value="">None / format default</option>
          {RACE_CHART_OPTIONS.map((chart) => (
            <option key={chart.id} value={chart.id}>
              {chart.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-[var(--muted)]">
        Overrides LMS race-tos on the Tableside Score pad only. Does not change
        LMS settings.
      </p>
    </fieldset>
  );
}

/**
 * Popup form to create/edit a Tableside Night Format (division link).
 * Never writes to LMS. Supports a configurable number of legs.
 */
export function DivisionLinkForm({
  leagueId,
  divisions,
  initialLink = null,
  busy,
  onBusy,
  onNotice,
  onError,
  onSaved,
}: {
  leagueId: string;
  divisions: DivisionOption[];
  initialLink?: DivisionLink | null;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onNotice: (message: string | null) => void;
  onError: (message: string | null) => void;
  onSaved: (link: DivisionLink) => void;
}) {
  const [tab, setTab] = useState<LinkFormTab>("divisions");
  const [linkName, setLinkName] = useState(initialLink?.name ?? "");
  const [legs, setLegs] = useState<NightLeg[]>(() =>
    initialLink?.legs?.length
      ? normalizeNightLegs(initialLink.legs)
      : [emptyLegDraft(0), emptyLegDraft(1)],
  );
  const [validation, setValidation] = useState<DivisionLinkValidation | null>(
    null,
  );

  useEffect(() => {
    setTab("divisions");
    setLinkName(initialLink?.name ?? "");
    setLegs(
      initialLink?.legs?.length
        ? normalizeNightLegs(initialLink.legs)
        : [emptyLegDraft(0), emptyLegDraft(1)],
    );
    setValidation(null);
  }, [initialLink]);

  const filledLegs = useMemo(
    () => legs.filter((leg) => leg.divisionId.trim()),
    [legs],
  );

  const sisterSuggestion = useMemo(() => {
    const first = filledLegs[0];
    if (!first) return null;
    const division = divisions.find((d) => d.id === first.divisionId);
    if (!division) return null;
    return findSisterDivision(division, divisions)?.sister ?? null;
  }, [filledLegs, divisions]);

  const tabs: IconSubTabItem<LinkFormTab>[] = [
    { id: "divisions", label: "Legs", icon: OverviewSubIcon },
    { id: "standing", label: "Standing", icon: StatsSubIcon },
    { id: "race", label: "Race HC", icon: RoundsSubIcon },
  ];

  const updateLeg = (index: number, patch: Partial<NightLeg>) => {
    setLegs((prev) =>
      prev.map((leg, i) => (i === index ? { ...leg, ...patch } : leg)),
    );
    setValidation(null);
  };

  const maybePrefillLinkName = (divisionName: string) => {
    if (linkName.trim()) return;
    const season =
      divisionName.match(/\(?\s*(20\d{2}\.\d)\s*\)?/i)?.[1] ?? "";
    if (season) setLinkName(`Beyond Monday ${season}`);
  };

  const applyBeyondDefaults = () => {
    setLegs((prev) =>
      prev.map((leg, index) => {
        if (!leg.divisionId) return leg;
        const seeded = defaultNightLeg({
          divisionId: leg.divisionId,
          divisionName: leg.divisionName || leg.label,
          index,
        });
        return {
          ...leg,
          id: seeded.id,
          label: seeded.label,
          standing: defaultStandingSide(seeded.standing.role),
          scoring: defaultScoringSide(seeded.standing.role),
        };
      }),
    );
  };

  const runValidate = async () => {
    if (filledLegs.length < 2) {
      onError("Add at least two LMS divisions (legs).");
      return null;
    }
    onBusy(true);
    onError(null);
    try {
      const data = await fetchJson<{ validation: DivisionLinkValidation }>(
        "/api/division-links",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "validate",
            legs: filledLegs,
          }),
        },
      );
      setValidation(data.validation);
      return data.validation;
    } catch (error) {
      onError(
        error instanceof Error ? error.message : "Validation failed.",
      );
      return null;
    } finally {
      onBusy(false);
    }
  };

  const saveLink = async () => {
    const name = linkName.trim();
    if (!name) {
      onError("Name the night (players will see this in League).");
      return;
    }
    if (filledLegs.length < 2) {
      onError("Add at least two LMS divisions (legs).");
      return;
    }
    onBusy(true);
    onError(null);
    onNotice(null);
    try {
      const data = await fetchJson<{
        link: DivisionLink;
        validation: DivisionLinkValidation;
      }>("/api/division-links", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: initialLink?.id,
          leagueId,
          name,
          legs: filledLegs,
        }),
      });
      setValidation(data.validation);
      onNotice(
        "Night format saved in Tableside only — LMS was not updated.",
      );
      onSaved(data.link);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Failed to save night.");
    } finally {
      onBusy(false);
    }
  };

  const rawHeaders = standingRawColumnHeadersForLegs(filledLegs);

  return (
    <div className="space-y-4">
      <div className="rounded-[var(--radius)] border border-[var(--amber)]/35 bg-[color-mix(in_srgb,var(--amber)_12%,transparent)] px-3 py-2 text-sm text-[var(--amber)]">
        Tableside-only Night Format. Add as many LMS divisions (legs) as the
        night needs. Linking does not change LMS.
      </div>

      <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]">
        <div className="border-b border-[var(--line)] bg-[var(--surface-2)] p-0.5">
          <IconSubTabs
            aria-label="Night format settings"
            items={tabs}
            value={tab}
            onChange={setTab}
            columns={3}
            className="rounded-none border-0 bg-transparent p-0"
          />
        </div>

        <div className="space-y-4 p-3 sm:p-4">
          {tab === "divisions" ? (
            <div className="grid gap-3">
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium text-[var(--ink)]">
                  Night name
                </span>
                <input
                  className={inputClass}
                  value={linkName}
                  placeholder="e.g. Beyond Monday 2026.2"
                  onChange={(e) => setLinkName(e.target.value)}
                />
              </label>

              {legs.map((leg, index) => {
                const selected =
                  divisions.find((d) => d.id === leg.divisionId) ??
                  (leg.divisionId
                    ? { id: leg.divisionId, name: leg.divisionName || leg.label }
                    : null);
                const options = divisions
                  .filter(
                    (d) =>
                      d.id === leg.divisionId ||
                      !legs.some(
                        (other, otherIndex) =>
                          otherIndex !== index && other.divisionId === d.id,
                      ),
                  )
                  .map((d) => ({
                    id: d.id,
                    label: d.name,
                    value: d,
                  }));
                return (
                  <div
                    key={`leg-${index}`}
                    className="space-y-2 rounded-[var(--radius)] border border-[var(--line)] p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[var(--ink)]">
                        Leg {index + 1}
                      </p>
                      {legs.length > 2 ? (
                        <button
                          type="button"
                          className={btnDelete}
                          disabled={busy}
                          onClick={() => {
                            setLegs((prev) =>
                              prev.filter((_, i) => i !== index),
                            );
                            setValidation(null);
                          }}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                    <label className="block space-y-1 text-sm">
                      <span className="text-[var(--muted)]">Label</span>
                      <input
                        className={inputClass}
                        value={leg.label}
                        placeholder="Singles / Teams / …"
                        onChange={(e) =>
                          updateLeg(index, { label: e.target.value })
                        }
                      />
                    </label>
                    <Typeahead
                      label="LMS division"
                      placeholder="Search divisions…"
                      emptyText="No divisions match"
                      value={toOption(selected)}
                      options={options}
                      onChange={(option) => {
                        const nextId = option?.value.id ?? "";
                        const nextName = option?.value.name ?? "";
                        if (option) {
                          maybePrefillLinkName(nextName);
                          const seeded = defaultNightLeg({
                            divisionId: nextId,
                            divisionName: nextName,
                            index,
                          });
                          updateLeg(index, {
                            divisionId: nextId,
                            divisionName: nextName,
                            id: seeded.id,
                            label: leg.label.trim() || seeded.label,
                            standing: seeded.standing,
                            scoring: seeded.scoring,
                          });
                        } else {
                          updateLeg(index, {
                            divisionId: "",
                            divisionName: "",
                          });
                        }
                      }}
                    />
                  </div>
                );
              })}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={btnGhost}
                  disabled={busy}
                  onClick={() => {
                    setLegs((prev) => [...prev, emptyLegDraft(prev.length)]);
                    setValidation(null);
                  }}
                >
                  + Add leg
                </button>
                {sisterSuggestion &&
                !legs.some((leg) => leg.divisionId === sisterSuggestion.id) ? (
                  <button
                    type="button"
                    className="text-xs font-semibold text-[var(--felt-deep)] underline-offset-2 hover:underline"
                    onClick={() => {
                      const index = legs.findIndex((leg) => !leg.divisionId);
                      const seeded = defaultNightLeg({
                        divisionId: sisterSuggestion.id,
                        divisionName: sisterSuggestion.name,
                        index: index >= 0 ? index : legs.length,
                      });
                      if (index >= 0) {
                        updateLeg(index, seeded);
                      } else {
                        setLegs((prev) => [...prev, seeded]);
                      }
                      maybePrefillLinkName(
                        filledLegs[0]?.divisionName || sisterSuggestion.name,
                      );
                    }}
                  >
                    Suggest {sisterSuggestion.name}
                  </button>
                ) : null}
              </div>

              {validation ? (
                <div
                  className={[
                    "rounded-[var(--radius)] border px-3 py-2 text-sm",
                    validation.ok
                      ? "border-[var(--felt)]/35 bg-[color-mix(in_srgb,var(--felt)_14%,transparent)] text-[var(--felt-deep)]"
                      : "border-[var(--danger)]/30 bg-[var(--danger-bg)] text-[var(--danger)]",
                  ].join(" ")}
                >
                  <p>{validation.message}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === "standing" ? (
            <div className="space-y-3">
              <p className="text-sm text-[var(--muted)]">
                Pick each leg’s LMS standings column and a multiplier. League
                standings will show those raw columns plus a{" "}
                <span className="font-medium text-[var(--ink)]">STANDING</span>{" "}
                total used to rank the combined night.
              </p>
              {filledLegs.map((leg, index) => {
                const legIndex = legs.findIndex(
                  (row) => row.divisionId === leg.divisionId,
                );
                return (
                  <StandingSideFields
                    key={leg.divisionId}
                    title={leg.label || leg.divisionName || `Leg ${index + 1}`}
                    side={leg.standing}
                    onChange={(standing) =>
                      updateLeg(legIndex >= 0 ? legIndex : index, { standing })
                    }
                  />
                );
              })}
              <div className="space-y-1.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--muted)]">
                <p className="font-semibold text-[var(--ink)]">
                  {legsStandingFormula(filledLegs)}
                </p>
                <p>
                  Output columns:{" "}
                  <span className="font-medium text-[var(--ink)]">
                    # · TEAM · STANDING
                    {rawHeaders.length
                      ? ` · ${rawHeaders.join(" · ")}`
                      : ""}{" "}
                    · WKS
                  </span>
                </p>
                <p>{legsNightHint(filledLegs)}</p>
              </div>
              <button
                type="button"
                className={btnGhost}
                disabled={filledLegs.length < 2}
                onClick={applyBeyondDefaults}
              >
                Reset Beyond defaults (SETS×1 + RDS×2)
              </button>
            </div>
          ) : null}

          {tab === "race" ? (
            <div className="space-y-3">
              <p className="text-sm text-[var(--muted)]">
                Race handicap overrides for the Tableside Score pad, per leg.
                Beyond Singles should use official{" "}
                <span className="font-medium text-[var(--ink)]">R5 Hot</span>;
                Teams usually stays fixed race / no chart.
              </p>
              {filledLegs.map((leg, index) => {
                const legIndex = legs.findIndex(
                  (row) => row.divisionId === leg.divisionId,
                );
                return (
                  <ScoringSideFields
                    key={leg.divisionId}
                    title={leg.label || leg.divisionName || `Leg ${index + 1}`}
                    side={leg.scoring}
                    onChange={(scoring) =>
                      updateLeg(legIndex >= 0 ? legIndex : index, { scoring })
                    }
                  />
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={btnGhost}
          disabled={busy || filledLegs.length < 2}
          onClick={() => void runValidate()}
        >
          Check match
        </button>
        <button
          type="button"
          className={btnPrimary}
          disabled={busy || filledLegs.length < 2 || !linkName.trim()}
          onClick={() => void saveLink()}
        >
          {initialLink ? "Update night" : "Save night"}
        </button>
      </div>
    </div>
  );
}
