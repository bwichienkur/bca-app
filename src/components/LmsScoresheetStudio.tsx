"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  applyFormatPreset,
  defaultFormatPicks,
  FARGO_HC_OPTIONS,
  FORMAT_PRESETS,
  GAME_KIND_OPTIONS,
  generateLeagueFormat,
  RACE_MODEL_OPTIONS,
  STRUCTURE_OPTIONS,
  TEAM_SCORING_OPTIONS,
  type FormatGeneratorPicks,
  type FormatPresetId,
  type FargoHcMode,
  type MatchStructure,
  type RaceModel,
  type TeamScoringMode,
} from "@/lib/format-generator";
import type { FormatGameKind } from "@/lib/lms-format-template";
import type { PointSystem } from "@/lib/handicap";
import {
  parseRaceChartId,
  raceChartMeta,
  type RaceChartBase,
  type RaceChartId,
  type RaceChartIntensity,
} from "@/lib/race-charts";
import { FormatScoresheetPreview } from "./FormatScoresheetPreview";
import { SelectField } from "./SelectField";

const CHART_BASE_OPTIONS: RaceChartBase[] = [
  2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
];
const CHART_INTENSITY_OPTIONS: Array<{
  id: RaceChartIntensity;
  label: string;
  description: string;
}> = [
  {
    id: "hot",
    label: "Hot",
    description: "Most handicap — closest to even odds",
  },
  {
    id: "medium",
    label: "Medium",
    description: "Moderate spot for the underdog",
  },
  {
    id: "mild",
    label: "Mild",
    description: "Lightest handicap",
  },
];

function chartIdFromParts(
  base: RaceChartBase,
  intensity: RaceChartIntensity,
): RaceChartId {
  return parseRaceChartId(`r${base}-${intensity}`);
}

const btnPrimary =
  "inline-flex items-center justify-center rounded-[var(--radius)] bg-[var(--felt)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50";
const btnGhost =
  "inline-flex items-center justify-center rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--ink)] disabled:opacity-50";
const inputClass =
  "w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none ring-[var(--felt)] focus:ring-2";

function ChoiceCard({
  selected,
  title,
  description,
  onClick,
}: {
  selected: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-[var(--radius)] border px-3 py-2.5 text-left transition",
        selected
          ? "border-[var(--felt)] bg-[color-mix(in_srgb,var(--felt)_12%,var(--surface))] shadow-sm"
          : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--felt)]/50",
      ].join(" ")}
    >
      <p className="text-sm font-semibold text-[var(--ink)]">{title}</p>
      <p className="mt-0.5 text-xs text-[var(--muted)]">{description}</p>
    </button>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
      {children}
    </p>
  );
}

export function LmsScoresheetStudio() {
  const [picks, setPicks] = useState<FormatGeneratorPicks>(() =>
    defaultFormatPicks(),
  );
  const [showDsl, setShowDsl] = useState(false);
  const [paperOpen, setPaperOpen] = useState(false);
  const [copied, setCopied] = useState<"dsl" | "hints" | null>(null);

  const result = useMemo(() => generateLeagueFormat(picks), [picks]);

  const patch = (partial: Partial<FormatGeneratorPicks>) =>
    setPicks((prev) => {
      const next = { ...prev, ...partial };
      if (next.structure === "doubles") next.playersPerTeam = 2;
      return next;
    });

  const applyPreset = (id: FormatPresetId) => {
    setPicks((prev) => applyFormatPreset(id, prev));
  };

  const copyText = async (text: string, which: "dsl" | "hints") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      // ignore
    }
  };

  const hintsText = [
    `NumberOfPlayers=${result.divisionHints.NumberOfPlayers}`,
    `NumberOfRounds=${result.divisionHints.NumberOfRounds}`,
    `PointsForWin=${result.divisionHints.PointsForWin}`,
    `UseHandicap=${result.divisionHints.UseHandicap}`,
    `HandicapMode=${result.divisionHints.HandicapMode}`,
    `FargoHandicapType=${result.divisionHints.FargoHandicapType}`,
    `HandicapPercentage=${result.divisionHints.HandicapPercentage}`,
    `MaximumAllowedHandicap=${result.divisionHints.MaximumAllowedHandicap}`,
    `MatchWinForRound=${result.divisionHints.MatchWinForRound}`,
    "",
    ...result.divisionHints.notes,
    "",
    "FormatTemplate:",
    result.dsl,
  ].join("\n");

  const playerOptions =
    picks.structure === "doubles"
      ? [{ value: "2", label: "2 (doubles)" }]
      : [2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }));

  const showFixedRace =
    picks.raceModel === "fixed" ||
    (picks.raceModel === "none" && picks.gameKind === "S");
  const showFargoChart = picks.raceModel === "fargo-chart";
  const chartMeta = raceChartMeta(picks.raceChartId);
  const showHcDetails = picks.fargoHc !== "none";
  const showRoundPointsExtras = picks.teamScoring === "round-points";

  return (
    <section className="space-y-4">
      <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)]/50 px-3 py-2.5">
        <p className="text-sm font-semibold text-[var(--ink)]">
          Scoring & handicap format
        </p>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          Structure, race, and Fargo HC are independent. Presets are shortcuts —
          mix any combination below. We generate an LMS template plus app scoring
          rules so Score and Handicap stay aligned.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_1fr]">
        <div className="space-y-4">
          <div className="space-y-2">
            <SectionLabel>Presets (optional)</SectionLabel>
            <div className="grid gap-1.5">
              {FORMAT_PRESETS.map((preset) => (
                <ChoiceCard
                  key={preset.id}
                  selected={false}
                  title={preset.label}
                  description={preset.description}
                  onClick={() => applyPreset(preset.id)}
                />
              ))}
            </div>
          </div>

          <label className="block space-y-1.5">
            <SectionLabel>Players per side</SectionLabel>
            <SelectField
              aria-label="Players per side"
              value={String(picks.playersPerTeam)}
              options={playerOptions}
              onChange={(value) =>
                patch({ playersPerTeam: Number(value) || 4 })
              }
              disabled={picks.structure === "doubles"}
            />
          </label>

          {picks.structure === "round-robin" ? (
            <label className="block space-y-1.5">
              <SectionLabel>Rounds</SectionLabel>
              <SelectField
                aria-label="Rounds"
                value={String(picks.rounds ?? picks.playersPerTeam)}
                options={[1, 2, 3, 4, 5, 6].map((n) => ({
                  value: String(n),
                  label: String(n),
                }))}
                onChange={(value) =>
                  patch({ rounds: Number(value) || picks.playersPerTeam })
                }
              />
            </label>
          ) : null}

          <div className="space-y-2">
            <SectionLabel>Structure</SectionLabel>
            <div className="grid gap-1.5">
              {STRUCTURE_OPTIONS.map((option) => (
                <ChoiceCard
                  key={option.id}
                  selected={picks.structure === option.id}
                  title={option.label}
                  description={option.description}
                  onClick={() =>
                    patch({ structure: option.id as MatchStructure })
                  }
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <SectionLabel>Game kind</SectionLabel>
            <div className="grid gap-1.5">
              {GAME_KIND_OPTIONS.map((option) => (
                <ChoiceCard
                  key={option.id}
                  selected={picks.gameKind === option.id}
                  title={option.label}
                  description={option.description}
                  onClick={() =>
                    patch({ gameKind: option.id as FormatGameKind })
                  }
                />
              ))}
            </div>
          </div>

          <label className="block space-y-1.5">
            <SectionLabel>Ball</SectionLabel>
            <SelectField
              aria-label="Game ball"
              value={picks.gameBall}
              options={[
                { value: "8", label: "8-Ball" },
                { value: "9", label: "9-Ball" },
                { value: "10", label: "10-Ball" },
                { value: "any", label: "Any / unspecified" },
              ]}
              onChange={(value) =>
                patch({
                  gameBall:
                    value === "8" || value === "10" || value === "any"
                      ? value
                      : "9",
                })
              }
            />
          </label>

          <div className="space-y-2">
            <SectionLabel>Race</SectionLabel>
            <div className="grid gap-1.5">
              {RACE_MODEL_OPTIONS.map((option) => (
                <ChoiceCard
                  key={option.id}
                  selected={picks.raceModel === option.id}
                  title={option.label}
                  description={option.description}
                  onClick={() => patch({ raceModel: option.id as RaceModel })}
                />
              ))}
            </div>
          </div>

          {showFixedRace ? (
            <label className="block space-y-1.5">
              <SectionLabel>
                {picks.gameKind === "S" ? "Score pad / race length" : "Race to"}
              </SectionLabel>
              <SelectField
                aria-label="Fixed race to"
                value={String(picks.fixedRaceTo)}
                options={[5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 21].map((n) => ({
                  value: String(n),
                  label: String(n),
                }))}
                onChange={(value) =>
                  patch({ fixedRaceTo: Number(value) || 7 })
                }
              />
            </label>
          ) : null}

          {showFargoChart ? (
            <div className="space-y-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-3">
              <label className="block space-y-1.5">
                <SectionLabel>Chart (even race)</SectionLabel>
                <SelectField
                  aria-label="Fargo race chart base"
                  value={String(chartMeta.base)}
                  options={CHART_BASE_OPTIONS.map((n) => ({
                    value: String(n),
                    label: `R${n}`,
                  }))}
                  onChange={(value) => {
                    const base = (Number(value) || 6) as RaceChartBase;
                    patch({
                      raceChartId: chartIdFromParts(base, chartMeta.intensity),
                    });
                  }}
                />
              </label>
              <div className="space-y-2">
                <SectionLabel>Intensity</SectionLabel>
                <div className="grid gap-1.5">
                  {CHART_INTENSITY_OPTIONS.map((option) => (
                    <ChoiceCard
                      key={option.id}
                      selected={chartMeta.intensity === option.id}
                      title={option.label}
                      description={option.description}
                      onClick={() =>
                        patch({
                          raceChartId: chartIdFromParts(
                            chartMeta.base,
                            option.id,
                          ),
                        })
                      }
                    />
                  ))}
                </div>
              </div>
              <p className="text-xs text-[var(--muted)]">
                Using {chartMeta.label}. Score and paper preview look up
                race-to from this chart.
              </p>
            </div>
          ) : null}

          <div className="space-y-2">
            <SectionLabel>Fargo handicap</SectionLabel>
            <div className="grid gap-1.5">
              {FARGO_HC_OPTIONS.map((option) => (
                <ChoiceCard
                  key={option.id}
                  selected={picks.fargoHc === option.id}
                  title={option.label}
                  description={option.description}
                  onClick={() => patch({ fargoHc: option.id as FargoHcMode })}
                />
              ))}
            </div>
          </div>

          {showHcDetails ? (
            <div className="space-y-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-3">
              <label className="block space-y-1.5">
                <SectionLabel>Rating basis</SectionLabel>
                <SelectField
                  aria-label="Fargo rating basis"
                  value={picks.fargoRatingBasis}
                  options={[
                    { value: "0", label: "Fargo Rating" },
                    { value: "1", label: "Effective Rating" },
                  ]}
                  onChange={(value) =>
                    patch({ fargoRatingBasis: value === "1" ? "1" : "0" })
                  }
                />
              </label>
              <label className="block space-y-1.5">
                <SectionLabel>Handicap %</SectionLabel>
                <SelectField
                  aria-label="Handicap percent"
                  value={String(picks.handicapPercent)}
                  options={[50, 60, 70, 75, 80, 90, 100].map((n) => ({
                    value: String(n),
                    label: `${n}%`,
                  }))}
                  onChange={(value) =>
                    patch({ handicapPercent: Number(value) || 100 })
                  }
                />
              </label>
              <label className="block space-y-1.5">
                <SectionLabel>HC cap</SectionLabel>
                <SelectField
                  aria-label="Handicap cap"
                  value={String(picks.handicapCap)}
                  options={[0, 10, 20, 30, 40, 50, 75, 100].map((n) => ({
                    value: String(n),
                    label: String(n),
                  }))}
                  onChange={(value) =>
                    patch({ handicapCap: Number(value) || 50 })
                  }
                />
              </label>
            </div>
          ) : null}

          <div className="space-y-2">
            <SectionLabel>Team scoring</SectionLabel>
            <div className="grid gap-1.5">
              {TEAM_SCORING_OPTIONS.map((option) => (
                <ChoiceCard
                  key={option.id}
                  selected={picks.teamScoring === option.id}
                  title={option.label}
                  description={option.description}
                  onClick={() =>
                    patch({ teamScoring: option.id as TeamScoringMode })
                  }
                />
              ))}
            </div>
          </div>

          {showRoundPointsExtras ? (
            <div className="space-y-3">
              <label className="block space-y-1.5">
                <SectionLabel>Point system</SectionLabel>
                <SelectField
                  aria-label="Point system"
                  value={picks.pointSystem}
                  options={[
                    { value: "1", label: "1" },
                    { value: "10", label: "10" },
                    { value: "17", label: "17" },
                    { value: "TRIOS", label: "TRIOS" },
                  ]}
                  onChange={(value) =>
                    patch({ pointSystem: value as PointSystem })
                  }
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-[var(--ink)]">
                <input
                  type="checkbox"
                  checked={picks.matchPointsRound}
                  onChange={(event) =>
                    patch({ matchPointsRound: event.target.checked })
                  }
                  className="size-4 accent-[var(--felt)]"
                />
                Include match-points round
              </label>
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]">
            <div className="border-b border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 sm:px-4">
              <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--felt-deep)]">
                {result.title}
              </p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                {result.scoringSummary}
              </p>
            </div>

            {result.warnings.length ? (
              <ul className="space-y-1 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--amber)_10%,var(--surface))] px-3 py-2.5 text-xs text-[var(--ink)] sm:px-4">
                {result.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}

            <ul className="space-y-1.5 border-b border-[var(--line)] px-3 py-3 text-sm text-[var(--ink)] sm:px-4">
              {result.bullets.map((bullet) => (
                <li key={bullet} className="flex gap-2">
                  <span className="text-[var(--felt)]" aria-hidden>
                    ·
                  </span>
                  <span className="min-w-0">{bullet}</span>
                </li>
              ))}
            </ul>

            <div className="space-y-3 px-3 py-3 sm:px-4">
              <SectionLabel>Night matchups</SectionLabel>
              <div className="space-y-2">
                {result.matchups.map((block) => (
                  <div
                    key={block.round}
                    className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)]/40 px-3 py-2"
                  >
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--amber)]">
                      Round {block.round}
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {block.games.map((game, index) => (
                        <li
                          key={`${block.round}-${index}`}
                          className="flex flex-wrap items-center gap-2 text-sm"
                        >
                          <span className="font-medium text-[var(--ink)]">
                            {game.label}
                          </span>
                          <span className="rounded-md bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
                            {game.kind}
                          </span>
                          {game.raceLength ? (
                            <span className="rounded-md bg-[color-mix(in_srgb,var(--felt)_14%,transparent)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--felt-deep)]">
                              {picks.raceModel === "fargo-chart"
                                ? `Race from ${chartMeta.label}`
                                : `Race to ${game.raceLength}`}
                            </span>
                          ) : null}
                          <span className="text-[10px] font-semibold text-[var(--muted)]">
                            {game.homeBreaks ? "Home breaks" : "Away breaks"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-[var(--line)] px-3 py-3 sm:px-4">
              <button
                type="button"
                className={btnPrimary}
                onClick={() => void copyText(result.dsl, "dsl")}
              >
                {copied === "dsl" ? "DSL copied" : "Copy LMS template"}
              </button>
              <button
                type="button"
                className={btnGhost}
                onClick={() => void copyText(hintsText, "hints")}
              >
                {copied === "hints" ? "Hints copied" : "Copy LMS field hints"}
              </button>
              <button
                type="button"
                className={btnGhost}
                onClick={() => setShowDsl((v) => !v)}
              >
                {showDsl ? "Hide DSL" : "Show DSL"}
              </button>
              <button
                type="button"
                className={btnGhost}
                onClick={() => setPaperOpen(true)}
              >
                Paper-style preview
              </button>
            </div>

            {showDsl ? (
              <div className="border-t border-[var(--line)] px-3 py-3 sm:px-4">
                <textarea
                  readOnly
                  aria-label="Generated LMS format template"
                  className={`${inputClass} min-h-[14rem] font-mono text-xs leading-relaxed`}
                  value={result.dsl}
                />
              </div>
            ) : null}
          </div>

          <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-3 text-xs text-[var(--muted)] sm:px-4">
            <p className="font-semibold text-[var(--ink)]">How to use in LMS</p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-4">
              <li>Copy LMS template into Division → Format → advanced template.</li>
              <li>
                Set players / rounds / points / handicap from the hints (or paste
                the hint block).
              </li>
              <li>
                In the app, Score and Handicap follow the same race + Fargo HC
                picks when the division signals match (or set scoring format in
                Account).
              </li>
            </ol>
          </div>
        </div>
      </div>

      <FormatScoresheetPreview
        open={paperOpen}
        onClose={() => setPaperOpen(false)}
        model={result.model}
        title="Paper-style preview"
        raceChartId={
          picks.raceModel === "fargo-chart" ? picks.raceChartId : undefined
        }
      />
    </section>
  );
}
