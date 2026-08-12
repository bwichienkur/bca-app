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
  scoringSideFromFormat,
  standingRawColumnHeadersForLegs,
  suggestNightNameFromDivision,
  STANDING_METRIC_OPTIONS,
  type DivisionLinkScoringSide,
  type DivisionLinkStandingSide,
  type NightLeg,
  type StandingScoreMetric,
} from "@/lib/division-link-config";
import {
  FORMAT_PALM_BEACH_5,
  getScoringFormat,
  LEAGUE_SCORING_FORMATS,
  type LeagueScoringFormat,
  type RaceMode,
  type TeamPointMode,
} from "@/lib/scoring-formats";
import { RACE_CHART_OPTIONS, type RaceChartId } from "@/lib/race-charts";
import { FieldLabel } from "./FieldLabel";
import {
  IconSubTabs,
  OverviewSubIcon,
  RoundsSubIcon,
  StatsSubIcon,
  type IconSubTabItem,
} from "./IconSubTabs";
import { SelectField } from "./SelectField";
import { Typeahead, type TypeaheadOption } from "./Typeahead";

const inputClass =
  "w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none ring-[var(--felt)] focus:ring-2";
const btnPrimary =
  "inline-flex items-center justify-center rounded-[var(--radius)] bg-[var(--felt)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50";
const btnGhost =
  "inline-flex items-center justify-center rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--ink)] disabled:opacity-50";
const btnDelete =
  "inline-flex items-center justify-center rounded-[var(--radius)] border border-[var(--danger)]/40 bg-[var(--danger-bg)] px-3 py-2 text-sm font-semibold text-[var(--danger)] disabled:opacity-50";

type DivisionOption = { id: string; name: string };
type LinkFormTab = "divisions" | "standing" | "playstyle";

function effectiveLegFormat(
  side: DivisionLinkScoringSide,
  catalog: readonly LeagueScoringFormat[],
): LeagueScoringFormat {
  if (side.format) return side.format;
  if (side.scoringFormatId) {
    return getScoringFormat(side.scoringFormatId, catalog);
  }
  return FORMAT_PALM_BEACH_5;
}

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
  showLegType,
}: {
  title: string;
  side: DivisionLinkStandingSide;
  onChange: (next: DivisionLinkStandingSide) => void;
  showLegType: boolean;
}) {
  return (
    <fieldset className="space-y-3 rounded-[var(--radius)] border border-[var(--line)] p-3">
      <legend className="px-1 text-sm font-semibold text-[var(--ink)]">
        {title}
      </legend>
      {showLegType ? (
        <label className="block space-y-1.5 text-sm">
          <FieldLabel
            info={{
              summary:
                "Tags this half as Singles or Teams for combined-night standings labels (e.g. S-SETS / T-RDS). Does not change how Score plays the match.",
            }}
          >
            Leg type
          </FieldLabel>
          <SelectField
            aria-label={`${title} leg type`}
            value={side.role}
            options={[
              { value: "singles", label: "Singles" },
              { value: "teams", label: "Teams" },
            ]}
            onChange={(value) =>
              onChange({
                ...side,
                role: value === "teams" ? "teams" : "singles",
              })
            }
          />
        </label>
      ) : null}
      <label className="block space-y-1.5 text-sm">
        <FieldLabel
          info={{
            summary:
              "Which LMS standings column feeds this leg’s contribution to the combined STANDING total.",
            items: STANDING_METRIC_OPTIONS.map((opt) => ({
              label: opt.label,
              description: opt.hint,
            })),
          }}
        >
          LMS column
        </FieldLabel>
        <SelectField
          aria-label={`${title} LMS column`}
          value={side.metric}
          options={STANDING_METRIC_OPTIONS.map((opt) => ({
            value: opt.id,
            label: opt.label,
          }))}
          onChange={(value) =>
            onChange({
              ...side,
              metric: value as StandingScoreMetric,
            })
          }
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1.5 text-sm">
          <FieldLabel
            info={{
              summary:
                "Multiplies the LMS column into STANDING. Beyond Teams often uses ×2 so a round win is worth 2 standing points.",
            }}
          >
            Multiplier
          </FieldLabel>
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
        <label className="block space-y-1.5 text-sm">
          <FieldLabel
            info={{
              summary:
                "Soft cap used only in night-hint copy (e.g. “up to 3 sets”). Does not clamp Score.",
            }}
          >
            Max / night
          </FieldLabel>
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
  formats,
}: {
  title: string;
  side: DivisionLinkScoringSide;
  onChange: (next: DivisionLinkScoringSide) => void;
  formats: readonly LeagueScoringFormat[];
}) {
  const catalog = formats.length ? formats : LEAGUE_SCORING_FORMATS;
  const format = effectiveLegFormat(side, catalog);
  const templateValue = side.scoringFormatId ?? format.id;

  const commitFormat = (
    next: LeagueScoringFormat,
    raceChartId?: RaceChartId | null,
  ) => {
    onChange(
      scoringSideFromFormat(
        next,
        raceChartId !== undefined ? raceChartId : side.raceChartId,
      ),
    );
  };

  const raceChartOptions = [
    { value: "", label: "Format default" },
    ...RACE_CHART_OPTIONS.map((chart) => ({
      value: chart.id,
      label: chart.shortLabel || chart.label,
    })),
  ];

  return (
    <fieldset className="space-y-3 rounded-[var(--radius)] border border-[var(--line)] p-3">
      <legend className="px-1 text-sm font-semibold text-[var(--ink)]">
        {title}
      </legend>

      <label className="block space-y-1.5 text-sm">
        <FieldLabel
          info={{
            summary:
              "Loads a reusable template from Manage → Templates. After loading, edit the fields below — those values are saved on this night and shape the Score pad.",
          }}
        >
          Template
        </FieldLabel>
        <SelectField
          aria-label={`${title} template`}
          value={templateValue}
          options={catalog.map((row) => ({
            value: row.id,
            label: row.label,
          }))}
          onChange={(value) => {
            const next = getScoringFormat(value, catalog);
            onChange(
              scoringSideFromFormat(
                next,
                next.raceMode === "fargo-race-chart"
                  ? (next.raceChartId ?? null)
                  : null,
              ),
            );
          }}
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1.5 text-sm">
          <FieldLabel
            info={{
              summary:
                "Lineup size on the Score pad — how many singles slots each team fills.",
            }}
          >
            Players
          </FieldLabel>
          <input
            type="number"
            min={1}
            className={inputClass}
            value={format.playersPerTeam}
            onChange={(e) =>
              commitFormat({
                ...format,
                playersPerTeam: Number(e.target.value) || 1,
              })
            }
          />
        </label>
        <label className="block space-y-1.5 text-sm">
          <FieldLabel
            info={{
              summary:
                "LMS ROUND count on the scoresheet. Tuesday / Beyond Singles: one player race per round. Paradise: several games per round. Beyond Teams: usually 1 round (RR matchups inside it).",
            }}
          >
            Rounds
          </FieldLabel>
          <input
            type="number"
            min={1}
            className={inputClass}
            value={format.matchesPerNight}
            onChange={(e) =>
              commitFormat({
                ...format,
                matchesPerNight: Number(e.target.value) || 1,
              })
            }
          />
        </label>
      </div>

      <label className="block space-y-1.5 text-sm">
        <FieldLabel
          info={{
            summary:
              "What earns the team a point on the night. Not the LMS total-points / R6 round (that is matchWinCountsAsRound on the match).",
            items: [
              {
                label: "Round win",
                description:
                  "Team scores when it clinches the round (Paradise / Palm Beach; Beyond Teams after race-to-N). LMS standings: Rounds Won.",
              },
              {
                label: "Set win",
                description:
                  "Team scores when a player wins their GAME R race (Tuesday, Beyond Singles). LMS standings: Sets Won. Beyond Teams uses GAME S matchup wins toward Team race-to instead.",
              },
            ],
          }}
        >
          Team points
        </FieldLabel>
        <SelectField
          aria-label={`${title} team points`}
          value={format.teamPointMode}
          options={[
            { value: "round-points", label: "Round win" },
            { value: "match-win", label: "Set win" },
          ]}
          onChange={(value) =>
            commitFormat({
              ...format,
              teamPointMode: value as TeamPointMode,
            })
          }
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1.5 text-sm">
          <FieldLabel
            info={{
              summary:
                "Points awarded per scored unit (one set win, or one Beyond Teams matchup win). Almost always 1.",
            }}
          >
            Pts / unit
          </FieldLabel>
          <input
            type="number"
            min={1}
            className={inputClass}
            value={format.pointsPerMatchWin}
            onChange={(e) =>
              commitFormat({
                ...format,
                pointsPerMatchWin: Number(e.target.value) || 1,
              })
            }
          />
        </label>
        <label className="block space-y-1.5 text-sm">
          <FieldLabel
            info={{
              summary:
                "Optional first-to target for the team night (e.g. Beyond Teams first to 9 matchup wins). Leave empty for Tuesday / Beyond Singles.",
            }}
          >
            Team race-to
          </FieldLabel>
          <input
            type="number"
            min={0}
            className={inputClass}
            value={format.teamRaceTo ?? ""}
            placeholder="—"
            onChange={(e) => {
              const raw = e.target.value.trim();
              commitFormat({
                ...format,
                teamRaceTo: raw ? Number(raw) || undefined : undefined,
              });
            }}
          />
        </label>
      </div>

      <label className="block space-y-1.5 text-sm">
        <FieldLabel
          info={{
            summary:
              "How each player contest reaches a winner on the pad (points pad or Fargo race-to).",
            items: [
              {
                label: "Fixed",
                description:
                  "Same target for everyone: Paradise game points to 10 / max loss 7, or Beyond Teams win/lose (1).",
              },
              {
                label: "Fargo chart",
                description:
                  "GAME R player races with asymmetric race-tos from a chart (Tuesday R6 Hot, Beyond Singles R5 Hot). Winning that race is a set.",
              },
            ],
          }}
        >
          Race model
        </FieldLabel>
        <SelectField
          aria-label={`${title} race model`}
          value={format.raceMode}
          options={[
            { value: "fixed-race", label: "Fixed" },
            { value: "fargo-race-chart", label: "Fargo chart" },
          ]}
          onChange={(value) => {
            const raceMode = value as RaceMode;
            const next: LeagueScoringFormat = {
              ...format,
              raceMode,
              raceChartId:
                raceMode === "fargo-race-chart"
                  ? format.raceChartId ?? side.raceChartId ?? "r6-hot"
                  : undefined,
              fixedRaceWin:
                raceMode === "fixed-race" ? format.fixedRaceWin ?? 10 : undefined,
              fixedRaceMaxLoss:
                raceMode === "fixed-race"
                  ? format.fixedRaceMaxLoss ?? 0
                  : undefined,
            };
            commitFormat(
              next,
              raceMode === "fargo-race-chart"
                ? (next.raceChartId ?? "r6-hot")
                : null,
            );
          }}
        />
      </label>

      {format.raceMode === "fixed-race" ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1.5 text-sm">
            <FieldLabel
              info={{
                summary:
                  "Fixed target to finish a contest. Paradise: points to 10 per game. Beyond Teams: 1 (each GAME S is win/lose).",
              }}
            >
              Race win
            </FieldLabel>
            <input
              type="number"
              min={1}
              className={inputClass}
              value={format.fixedRaceWin ?? 10}
              onChange={(e) =>
                commitFormat({
                  ...format,
                  fixedRaceWin: Number(e.target.value) || 1,
                })
              }
            />
          </label>
          <label className="block space-y-1.5 text-sm">
            <FieldLabel
              info={{
                summary:
                  "Stop scoring after this many losses (Palm Beach max loss 7). Use 0 when every game is win/lose.",
              }}
            >
              Max loss
            </FieldLabel>
            <input
              type="number"
              min={0}
              className={inputClass}
              value={format.fixedRaceMaxLoss ?? 0}
              onChange={(e) =>
                commitFormat({
                  ...format,
                  fixedRaceMaxLoss: Number(e.target.value) || 0,
                })
              }
            />
          </label>
        </div>
      ) : (
        <label className="block space-y-1.5 text-sm">
          <FieldLabel
            info={{
              summary:
                "Fargo chart stamped onto each Score pad race (overrides LMS RL placeholders). Hot = most handicap.",
            }}
          >
            Race chart
          </FieldLabel>
          <SelectField
            aria-label={`${title} race chart`}
            value={side.raceChartId ?? format.raceChartId ?? ""}
            options={raceChartOptions}
            onChange={(value) => {
              const chart = (value || null) as RaceChartId | null;
              commitFormat(
                {
                  ...format,
                  raceChartId: chart ?? format.raceChartId,
                },
                chart,
              );
            }}
          />
        </label>
      )}

      <label className="block space-y-1.5 text-sm">
        <FieldLabel
          info={{
            summary:
              "Expected-points scale for RoundBased handicap display. Affects HC math, not race-to.",
            items: [
              {
                label: "1",
                description: "Win/lose matchups (Tuesday, Beyond Teams).",
              },
              {
                label: "10",
                description: "Palm Beach expected-points nights.",
              },
              {
                label: "17",
                description:
                  "Beyond Singles — LMS RL17 sheet capacity, not race-to 17.",
              },
            ],
          }}
        >
          HC system
        </FieldLabel>
        <SelectField
          aria-label={`${title} HC system`}
          value={format.pointSystem}
          options={[
            { value: "1", label: "1" },
            { value: "10", label: "10" },
            { value: "17", label: "17" },
          ]}
          onChange={(value) =>
            commitFormat({
              ...format,
              pointSystem: value as LeagueScoringFormat["pointSystem"],
            })
          }
        />
      </label>

      <p className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--muted)]">
        Total-points / R6 round is not configured here — Score reads LMS{" "}
        <span className="font-medium text-[var(--ink)]">
          matchWinCountsAsRound
        </span>{" "}
        on the match (on for Paradise / Hold my Beer).
      </p>
    </fieldset>
  );
}

/**
 * Create/edit a Tableside Night Format (division link).
 * Never writes to LMS. Supports 1..N legs (single-leg nights for Tuesday, etc.).
 * Use variant="page" when hosted as a full Manage page (not a popup).
 */
export function DivisionLinkForm({
  leagueId,
  divisions,
  scoringFormats,
  initialLink = null,
  variant = "page",
  busy,
  onBusy,
  onNotice,
  onError,
  onSaved,
}: {
  leagueId: string;
  divisions: DivisionOption[];
  /** Optional seed from Manage → Templates; form also fetches the league catalog. */
  scoringFormats?: readonly LeagueScoringFormat[] | null;
  initialLink?: DivisionLink | null;
  variant?: "page" | "embedded";
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
      : [emptyLegDraft(0)],
  );
  const [validation, setValidation] = useState<DivisionLinkValidation | null>(
    null,
  );
  const [formatCatalog, setFormatCatalog] = useState<LeagueScoringFormat[]>(
    () =>
      scoringFormats?.length
        ? [...scoringFormats]
        : [...LEAGUE_SCORING_FORMATS],
  );

  useEffect(() => {
    if (scoringFormats?.length) {
      setFormatCatalog([...scoringFormats]);
    }
  }, [scoringFormats]);

  useEffect(() => {
    let cancelled = false;
    void fetchJson<{ formats: LeagueScoringFormat[] }>(
      `/api/scoring-formats?leagueId=${encodeURIComponent(leagueId)}`,
    )
      .then((data) => {
        if (!cancelled && data.formats?.length) {
          setFormatCatalog(data.formats);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [leagueId]);

  useEffect(() => {
    setTab("divisions");
    setLinkName(initialLink?.name ?? "");
    setLegs(
      initialLink?.legs?.length
        ? normalizeNightLegs(initialLink.legs)
        : [emptyLegDraft(0)],
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
    { id: "playstyle", label: "Play style", icon: RoundsSubIcon },
  ];

  const updateLeg = (index: number, patch: Partial<NightLeg>) => {
    setLegs((prev) =>
      prev.map((leg, i) => (i === index ? { ...leg, ...patch } : leg)),
    );
    setValidation(null);
  };

  const maybePrefillLinkName = (divisionName: string) => {
    if (linkName.trim()) return;
    const suggested = suggestNightNameFromDivision(divisionName);
    if (suggested) setLinkName(suggested);
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
    if (filledLegs.length < 1) {
      onError("Add at least one LMS division (leg).");
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
    if (filledLegs.length < 1) {
      onError("Add at least one LMS division (leg).");
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
    <div className={variant === "page" ? "space-y-3" : "space-y-4"}>
      {variant === "embedded" ? (
        <div className="rounded-[var(--radius)] border border-[var(--amber)]/35 bg-[color-mix(in_srgb,var(--amber)_12%,transparent)] px-3 py-2 text-sm text-[var(--amber)]">
          Tableside-only Night Format. Use one leg for a single LMS division
          (e.g. Tuesday 9-Ball / R6 Hot), or add more legs for combined nights
          like Beyond. Linking does not change LMS.
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]">
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
                  placeholder="e.g. Tuesday 9 Ball 2026 · Beyond Monday 2026.2"
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
                      {legs.length > 1 ? (
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
                        placeholder="Tuesday 9-Ball / Singles / Teams…"
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
                          const usedRoles = new Set(
                            legs
                              .filter((_, i) => i !== index && _.divisionId)
                              .map((row) => row.standing.role),
                          );
                          const seeded = defaultNightLeg({
                            divisionId: nextId,
                            divisionName: nextName,
                            index,
                            usedRoles,
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
                      const usedRoles = new Set(
                        legs
                          .filter((leg) => leg.divisionId)
                          .map((leg) => leg.standing.role),
                      );
                      const seeded = defaultNightLeg({
                        divisionId: sisterSuggestion.id,
                        divisionName: sisterSuggestion.name,
                        index: index >= 0 ? index : legs.length,
                        usedRoles,
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
                standings show those columns plus a{" "}
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
                    showLegType={filledLegs.length >= 2}
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
                disabled={filledLegs.length < 1}
                onClick={applyBeyondDefaults}
              >
                Reset Beyond defaults (SETS×1 + RDS×2)
              </button>
            </div>
          ) : null}

          {tab === "playstyle" ? (
            <div className="space-y-3">
              <p className="text-sm text-[var(--muted)]">
                Configure how the Score pad looks and scores for each leg.
                Start from a template, then tune the fields — saved on this
                night (LMS is not changed).
              </p>
              {filledLegs.length < 1 ? (
                <p className="text-sm text-[var(--muted)]">
                  Add a leg under Legs before setting play style.
                </p>
              ) : null}
              {filledLegs.map((leg, index) => {
                const legIndex = legs.findIndex(
                  (row) => row.divisionId === leg.divisionId,
                );
                return (
                  <ScoringSideFields
                    key={leg.divisionId}
                    title={leg.label || leg.divisionName || `Leg ${index + 1}`}
                    side={leg.scoring}
                    formats={formatCatalog}
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
          disabled={busy || filledLegs.length < 1}
          onClick={() => void runValidate()}
        >
          Check match
        </button>
        <button
          type="button"
          className={btnPrimary}
          disabled={busy || filledLegs.length < 1 || !linkName.trim()}
          onClick={() => void saveLink()}
        >
          {initialLink ? "Update night" : "Save night"}
        </button>
      </div>
    </div>
  );
}
