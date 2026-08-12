"use client";

import { useEffect, useMemo, useState } from "react";
import type { DivisionLink, DivisionLinkValidation } from "@/lib/division-links";
import { findSisterDivision } from "@/lib/division-combos";
import {
  defaultDivisionLinkConfig,
  linkConfigNightHint,
  linkConfigStandingFormula,
  normalizeDivisionLinkConfig,
  standingRawColumnHeaders,
  STANDING_METRIC_OPTIONS,
  type DivisionLinkConfig,
  type DivisionLinkScoringSide,
  type DivisionLinkStandingSide,
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
        <span className="text-[var(--muted)]">Role</span>
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
 * Popup form to create/edit a Tableside-only division link.
 * Never writes to LMS.
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
  const [primaryDivisionId, setPrimaryDivisionId] = useState(
    initialLink?.primaryDivisionId ?? "",
  );
  const [linkedDivisionId, setLinkedDivisionId] = useState(
    initialLink?.linkedDivisionId ?? "",
  );
  const [config, setConfig] = useState<DivisionLinkConfig>(() =>
    normalizeDivisionLinkConfig(
      initialLink?.config,
      initialLink?.primaryDivisionName ?? "Singles",
      initialLink?.linkedDivisionName ?? "Teams",
    ),
  );
  const [validation, setValidation] = useState<DivisionLinkValidation | null>(
    null,
  );

  useEffect(() => {
    setTab("divisions");
    setLinkName(initialLink?.name ?? "");
    setPrimaryDivisionId(initialLink?.primaryDivisionId ?? "");
    setLinkedDivisionId(initialLink?.linkedDivisionId ?? "");
    setConfig(
      normalizeDivisionLinkConfig(
        initialLink?.config,
        initialLink?.primaryDivisionName ?? "Singles",
        initialLink?.linkedDivisionName ?? "Teams",
      ),
    );
    setValidation(null);
  }, [initialLink]);

  const primaryDivision =
    divisions.find((d) => d.id === primaryDivisionId) ??
    (initialLink && initialLink.primaryDivisionId === primaryDivisionId
      ? {
          id: initialLink.primaryDivisionId,
          name: initialLink.primaryDivisionName,
        }
      : null);
  const linkedDivision =
    divisions.find((d) => d.id === linkedDivisionId) ??
    (initialLink && initialLink.linkedDivisionId === linkedDivisionId
      ? {
          id: initialLink.linkedDivisionId,
          name: initialLink.linkedDivisionName,
        }
      : null);

  const sisterSuggestion = useMemo(() => {
    if (!primaryDivision) return null;
    return findSisterDivision(primaryDivision, divisions)?.sister ?? null;
  }, [primaryDivision, divisions]);

  const primaryOptions = useMemo(
    () =>
      divisions
        .filter((d) => d.id !== linkedDivisionId)
        .map((d) => ({
          id: d.id,
          label: d.name,
          value: d,
        })),
    [divisions, linkedDivisionId],
  );
  const linkedOptions = useMemo(
    () =>
      divisions
        .filter((d) => d.id !== primaryDivisionId)
        .map((d) => ({
          id: d.id,
          label: d.name,
          value: d,
        })),
    [divisions, primaryDivisionId],
  );

  const tabs: IconSubTabItem<LinkFormTab>[] = [
    { id: "divisions", label: "Divisions", icon: OverviewSubIcon },
    { id: "standing", label: "Standing", icon: StatsSubIcon },
    { id: "race", label: "Race HC", icon: RoundsSubIcon },
  ];

  const applyDefaultsFromNames = (
    primaryName: string,
    linkedName: string,
  ) => {
    setConfig(defaultDivisionLinkConfig(primaryName, linkedName));
  };

  const maybePrefillLinkName = (divisionName: string) => {
    if (linkName.trim()) return;
    const season =
      divisionName.match(/\(?\s*(20\d{2}\.\d)\s*\)?/i)?.[1] ?? "";
    if (season) setLinkName(`Beyond Monday ${season}`);
  };

  const runValidate = async () => {
    if (!primaryDivisionId || !linkedDivisionId) {
      onError("Pick two divisions to link.");
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
            primaryDivisionId,
            primaryDivisionName: primaryDivision?.name ?? primaryDivisionId,
            linkedDivisionId,
            linkedDivisionName: linkedDivision?.name ?? linkedDivisionId,
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
      onError("Name the link (players will see this in League).");
      return;
    }
    if (!primaryDivisionId || !linkedDivisionId) {
      onError("Pick two divisions to link.");
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
          primaryDivisionId,
          primaryDivisionName: primaryDivision?.name ?? primaryDivisionId,
          linkedDivisionId,
          linkedDivisionName: linkedDivision?.name ?? linkedDivisionId,
          config,
        }),
      });
      setValidation(data.validation);
      onNotice(
        "Division link saved in Tableside only — LMS was not updated.",
      );
      onSaved(data.link);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Failed to save link.");
    } finally {
      onBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-[var(--radius)] border border-[var(--amber)]/35 bg-[color-mix(in_srgb,var(--amber)_12%,transparent)] px-3 py-2 text-sm text-[var(--amber)]">
        Tableside-only. Linking does not change LMS. Configure how each half
        feeds combined standings and which race chart Score uses.
      </div>

      <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]">
        <div className="border-b border-[var(--line)] bg-[var(--surface-2)] p-0.5">
          <IconSubTabs
            aria-label="Division link settings"
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
                <span className="font-medium text-[var(--ink)]">Link name</span>
                <input
                  className={inputClass}
                  value={linkName}
                  placeholder="e.g. Beyond Monday 2026.2"
                  onChange={(e) => setLinkName(e.target.value)}
                />
              </label>

              <Typeahead
                label="First division"
                placeholder="Search divisions…"
                emptyText="No divisions match"
                value={toOption(primaryDivision)}
                options={primaryOptions}
                onChange={(option) => {
                  const nextId = option?.value.id ?? "";
                  setPrimaryDivisionId(nextId);
                  setValidation(null);
                  if (option) {
                    maybePrefillLinkName(option.value.name);
                    if (linkedDivision) {
                      applyDefaultsFromNames(
                        option.value.name,
                        linkedDivision.name,
                      );
                    }
                  }
                  if (nextId && linkedDivisionId === nextId) {
                    setLinkedDivisionId("");
                  }
                }}
              />

              <div className="space-y-1.5">
                <Typeahead
                  label="Second division"
                  placeholder="Search divisions…"
                  emptyText="No divisions match"
                  value={toOption(linkedDivision)}
                  options={linkedOptions}
                  onChange={(option) => {
                    setLinkedDivisionId(option?.value.id ?? "");
                    setValidation(null);
                    if (option && primaryDivision) {
                      applyDefaultsFromNames(
                        primaryDivision.name,
                        option.value.name,
                      );
                    }
                  }}
                />
                {sisterSuggestion && linkedDivisionId !== sisterSuggestion.id ? (
                  <button
                    type="button"
                    className="text-xs font-semibold text-[var(--felt-deep)] underline-offset-2 hover:underline"
                    onClick={() => {
                      setLinkedDivisionId(sisterSuggestion.id);
                      setValidation(null);
                      if (primaryDivision) {
                        maybePrefillLinkName(primaryDivision.name);
                        applyDefaultsFromNames(
                          primaryDivision.name,
                          sisterSuggestion.name,
                        );
                        if (!linkName.trim()) {
                          const season =
                            primaryDivision.name.match(
                              /\(?\s*(20\d{2}\.\d)\s*\)?/i,
                            )?.[1] ?? "";
                          setLinkName(
                            season
                              ? `Beyond Monday ${season}`
                              : "Beyond Monday",
                          );
                        }
                      }
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
                  {!validation.ok &&
                  (validation.missingInPrimary.length ||
                    validation.missingInLinked.length) ? (
                    <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
                      {validation.missingInPrimary.map((item) => (
                        <li key={`p-${item}`}>Missing in first: {item}</li>
                      ))}
                      {validation.missingInLinked.map((item) => (
                        <li key={`l-${item}`}>Missing in second: {item}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === "standing" ? (
            <div className="space-y-3">
              <p className="text-sm text-[var(--muted)]">
                Pick each half’s LMS standings column and a multiplier. League
                standings will show those raw columns plus a{" "}
                <span className="font-medium text-[var(--ink)]">STANDING</span>{" "}
                total used to rank the combined league.
              </p>
              <StandingSideFields
                title={primaryDivision?.name || "First division"}
                side={config.standing.primary}
                onChange={(primary) =>
                  setConfig((prev) => ({
                    ...prev,
                    standing: { ...prev.standing, primary },
                  }))
                }
              />
              <StandingSideFields
                title={linkedDivision?.name || "Second division"}
                side={config.standing.linked}
                onChange={(linked) =>
                  setConfig((prev) => ({
                    ...prev,
                    standing: { ...prev.standing, linked },
                  }))
                }
              />
              <div className="space-y-1.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--muted)]">
                <p className="font-semibold text-[var(--ink)]">
                  {linkConfigStandingFormula(config)}
                </p>
                <p>
                  Output columns:{" "}
                  <span className="font-medium text-[var(--ink)]">
                    # · TEAM · STANDING ·{" "}
                    {
                      standingRawColumnHeaders(
                        config.standing.primary,
                        config.standing.linked,
                      )[0]
                    }{" "}
                    ·{" "}
                    {
                      standingRawColumnHeaders(
                        config.standing.primary,
                        config.standing.linked,
                      )[1]
                    }{" "}
                    · WKS
                  </span>
                </p>
                <p>{linkConfigNightHint(config)}</p>
              </div>
              <button
                type="button"
                className={btnGhost}
                disabled={!primaryDivision || !linkedDivision}
                onClick={() => {
                  if (!primaryDivision || !linkedDivision) return;
                  applyDefaultsFromNames(
                    primaryDivision.name,
                    linkedDivision.name,
                  );
                }}
              >
                Reset Beyond defaults (SETS×1 + RDS×2)
              </button>
            </div>
          ) : null}

          {tab === "race" ? (
            <div className="space-y-3">
              <p className="text-sm text-[var(--muted)]">
                Race handicap overrides for the Tableside Score pad. Beyond
                Singles should use official{" "}
                <span className="font-medium text-[var(--ink)]">R5 Hot</span>;
                Teams usually stays fixed race / no chart.
              </p>
              <ScoringSideFields
                title={primaryDivision?.name || "First division"}
                side={config.scoring.primary}
                onChange={(primary) =>
                  setConfig((prev) => ({
                    ...prev,
                    scoring: { ...prev.scoring, primary },
                  }))
                }
              />
              <ScoringSideFields
                title={linkedDivision?.name || "Second division"}
                side={config.scoring.linked}
                onChange={(linked) =>
                  setConfig((prev) => ({
                    ...prev,
                    scoring: { ...prev.scoring, linked },
                  }))
                }
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={btnGhost}
          disabled={busy || !primaryDivisionId || !linkedDivisionId}
          onClick={() => void runValidate()}
        >
          Check match
        </button>
        <button
          type="button"
          className={btnPrimary}
          disabled={
            busy ||
            !primaryDivisionId ||
            !linkedDivisionId ||
            !linkName.trim()
          }
          onClick={() => void saveLink()}
        >
          {initialLink ? "Update link" : "Save link"}
        </button>
      </div>
    </div>
  );
}
