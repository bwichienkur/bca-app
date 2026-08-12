"use client";

import {
  useMemo,
  useState,
  type ReactNode,
} from "react";
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
import { FieldLabel, type FieldInfoItem } from "./FieldLabel";
import { FormatScoreSandbox } from "./FormatScoreSandbox";
import { FormatScoresheetPreview } from "./FormatScoresheetPreview";
import {
  IconSubTabs,
  LineupsSubIcon,
  MatchesSubIcon,
} from "./IconSubTabs";
import { SelectField } from "./SelectField";
import { SubTabCard } from "./SubTabCard";

type StudioTab = "generator" | "score-preview";

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
  "inline-flex w-full items-center justify-center rounded-[var(--radius)] bg-[var(--felt)] px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50";
const btnGhost =
  "inline-flex w-full items-center justify-center rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-sm font-semibold text-[var(--ink)] disabled:opacity-50";
const inputClass =
  "w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none ring-[var(--felt)] focus:ring-2";

function SelectBlock({
  label,
  info,
  children,
}: {
  label: string;
  info?: { summary?: string; items?: FieldInfoItem[] };
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <FieldLabel info={info}>{label}</FieldLabel>
      {children}
    </div>
  );
}

export function LmsScoresheetStudio() {
  const [studioTab, setStudioTab] = useState<StudioTab>("generator");
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
      <SubTabCard
        tabs={
          <IconSubTabs
            aria-label="Format sections"
            value={studioTab}
            onChange={setStudioTab}
            columns={2}
            className="border-0 bg-transparent p-0"
            items={[
              {
                id: "generator" as const,
                label: "Generator",
                icon: LineupsSubIcon,
              },
              {
                id: "score-preview" as const,
                label: "Score preview",
                icon: MatchesSubIcon,
              },
            ]}
          />
        }
      >
        {studioTab === "score-preview" ? (
          <FormatScoreSandbox picks={picks} result={result} />
        ) : (
          <>
      <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)]/50 px-3 py-2.5">
        <p className="text-sm font-semibold text-[var(--ink)]">
          Scoring & handicap format
        </p>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          Structure, race, and Fargo HC are independent. Presets are shortcuts —
          mix any combination below. Use Score preview to try the UI.
        </p>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,20rem)_1fr]">
        <div className="space-y-3">
          <SelectBlock
            label="Preset"
            info={{
              summary: "Optional shortcut that fills the fields below.",
              items: FORMAT_PRESETS.map((preset) => ({
                label: preset.label,
                description: preset.description,
              })),
            }}
          >
            <SelectField
              aria-label="Format preset"
              value=""
              placeholder="Apply a common setup…"
              options={FORMAT_PRESETS.map((preset) => ({
                value: preset.id,
                label: preset.label,
              }))}
              onChange={(value) => {
                if (value) applyPreset(value as FormatPresetId);
              }}
            />
          </SelectBlock>

          <SelectBlock
            label="Players per side"
            info={{
              summary:
                "How many players from each team are in the lineup for the night.",
            }}
          >
            <SelectField
              aria-label="Players per side"
              value={String(picks.playersPerTeam)}
              options={playerOptions}
              onChange={(value) =>
                patch({ playersPerTeam: Number(value) || 4 })
              }
              disabled={picks.structure === "doubles"}
            />
          </SelectBlock>

          <SelectBlock
            label="Structure"
            info={{
              items: STRUCTURE_OPTIONS.map((option) => ({
                label: option.label,
                description: option.description,
              })),
            }}
          >
            <SelectField
              aria-label="Match structure"
              value={picks.structure}
              options={STRUCTURE_OPTIONS.map((option) => ({
                value: option.id,
                label: option.label,
              }))}
              onChange={(value) =>
                patch({ structure: value as MatchStructure })
              }
            />
          </SelectBlock>

          {picks.structure === "round-robin" ? (
            <SelectBlock
              label="Rounds"
              info={{
                summary:
                  "How many rounds in the matrix. Often matches players per side.",
              }}
            >
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
            </SelectBlock>
          ) : null}

          <SelectBlock
            label="Game kind"
            info={{
              items: GAME_KIND_OPTIONS.map((option) => ({
                label: option.label,
                description: option.description,
              })),
            }}
          >
            <SelectField
              aria-label="Game kind"
              value={picks.gameKind}
              options={GAME_KIND_OPTIONS.map((option) => ({
                value: option.id,
                label: option.label,
              }))}
              onChange={(value) =>
                patch({ gameKind: value as FormatGameKind })
              }
            />
          </SelectBlock>

          <SelectBlock
            label="Ball"
            info={{
              summary: "Which game is written into the LMS format template.",
              items: [
                { label: "8-Ball", description: "GAME type 8" },
                { label: "9-Ball", description: "GAME type 9" },
                { label: "10-Ball", description: "GAME type 10" },
                {
                  label: "Any",
                  description: "Unspecified / any ball in the template",
                },
              ],
            }}
          >
            <SelectField
              aria-label="Game ball"
              value={picks.gameBall}
              options={[
                { value: "8", label: "8-Ball" },
                { value: "9", label: "9-Ball" },
                { value: "10", label: "10-Ball" },
                { value: "any", label: "Any" },
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
          </SelectBlock>

          <SelectBlock
            label="Race"
            info={{
              items: RACE_MODEL_OPTIONS.map((option) => ({
                label: option.label,
                description: option.description,
              })),
            }}
          >
            <SelectField
              aria-label="Race model"
              value={picks.raceModel}
              options={RACE_MODEL_OPTIONS.map((option) => ({
                value: option.id,
                label: option.label,
              }))}
              onChange={(value) => patch({ raceModel: value as RaceModel })}
            />
          </SelectBlock>

          {showFixedRace ? (
            <SelectBlock
              label={
                picks.fixedRaceTo <= 1
                  ? "Per game"
                  : picks.gameKind === "S"
                    ? "Score pad"
                    : "Race to"
              }
              info={{
                summary:
                  picks.fixedRaceTo <= 1
                    ? "Single-game matchups: mark W/L only (1 game = 1 unit when using set/matchup wins)."
                    : picks.gameKind === "S"
                      ? "Points pad length / max race value for fixed-race games."
                      : "Same race length for every matchup (not the team race target).",
              }}
            >
              <SelectField
                aria-label="Fixed race to"
                value={String(picks.fixedRaceTo)}
                options={[1, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 21].map(
                  (n) => ({
                    value: String(n),
                    label: n === 1 ? "1 · single game" : String(n),
                  }),
                )}
                onChange={(value) =>
                  patch({ fixedRaceTo: Number(value) || 7 })
                }
              />
            </SelectBlock>
          ) : null}

          {showFargoChart ? (
            <>
              <SelectBlock
                label="Chart"
                info={{
                  summary:
                    "Even-race baseline for the Fargo chart (R6 = even races near 6–6).",
                }}
              >
                <SelectField
                  aria-label="Fargo race chart base"
                  value={String(chartMeta.base)}
                  options={CHART_BASE_OPTIONS.map((n) => ({
                    value: String(n),
                    label: `R${n}`,
                  }))}
                  onChange={(value) => {
                    const base = Number(value);
                    const nextBase = (
                      CHART_BASE_OPTIONS.includes(base as RaceChartBase)
                        ? base
                        : 6
                    ) as RaceChartBase;
                    patch({
                      raceChartId: chartIdFromParts(
                        nextBase,
                        chartMeta.intensity,
                      ),
                    });
                  }}
                />
              </SelectBlock>
              <SelectBlock
                label="Intensity"
                info={{
                  items: CHART_INTENSITY_OPTIONS.map((option) => ({
                    label: option.label,
                    description: option.description,
                  })),
                }}
              >
                <SelectField
                  aria-label="Fargo race chart intensity"
                  value={chartMeta.intensity}
                  options={CHART_INTENSITY_OPTIONS.map((option) => ({
                    value: option.id,
                    label: option.label,
                  }))}
                  onChange={(value) =>
                    patch({
                      raceChartId: chartIdFromParts(
                        chartMeta.base,
                        value as RaceChartIntensity,
                      ),
                    })
                  }
                />
              </SelectBlock>
            </>
          ) : null}

          <SelectBlock
            label="Fargo handicap"
            info={{
              items: FARGO_HC_OPTIONS.map((option) => ({
                label: option.label,
                description: option.description,
              })),
            }}
          >
            <SelectField
              aria-label="Fargo handicap"
              value={picks.fargoHc}
              options={FARGO_HC_OPTIONS.map((option) => ({
                value: option.id,
                label: option.label,
              }))}
              onChange={(value) => patch({ fargoHc: value as FargoHcMode })}
            />
          </SelectBlock>

          {showHcDetails ? (
            <>
              <SelectBlock
                label="Rating basis"
                info={{
                  items: [
                    {
                      label: "Fargo Rating",
                      description: "Use published Fargo rating",
                    },
                    {
                      label: "Effective Rating",
                      description: "Use LMS effective rating when available",
                    },
                  ],
                }}
              >
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
              </SelectBlock>
              <SelectBlock
                label="Handicap %"
                info={{
                  summary:
                    "Percent of calculated expected-points handicap awarded (LMS HandicapPercentage).",
                }}
              >
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
              </SelectBlock>
              <SelectBlock
                label="HC cap"
                info={{
                  summary:
                    "Maximum handicap games allowed (LMS MaximumAllowedHandicap).",
                }}
              >
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
              </SelectBlock>
            </>
          ) : null}

          <SelectBlock
            label="Team scoring"
            info={{
              items: TEAM_SCORING_OPTIONS.map((option) => ({
                label: option.label,
                description: option.description,
              })),
            }}
          >
            <SelectField
              aria-label="Team scoring"
              value={picks.teamScoring}
              options={TEAM_SCORING_OPTIONS.map((option) => ({
                value: option.id,
                label: option.label,
              }))}
              onChange={(value) =>
                patch({
                  teamScoring: value as TeamScoringMode,
                  ...(value !== "match-win" ? { teamRaceTo: null } : {}),
                })
              }
            />
          </SelectBlock>

          {picks.teamScoring === "match-win" ? (
            <SelectBlock
              label="Team race to"
              info={{
                summary:
                  "Optional first-to team match points (e.g. 13 on a 5×5 sheet). Each matchup still awards 1 point; this is the night target, not the per-player race.",
              }}
            >
              <SelectField
                aria-label="Team race to"
                value={
                  picks.teamRaceTo != null && picks.teamRaceTo > 0
                    ? String(picks.teamRaceTo)
                    : "off"
                }
                options={[
                  { value: "off", label: "Off" },
                  ...[7, 9, 11, 13, 15, 17].map((n) => ({
                    value: String(n),
                    label: String(n),
                  })),
                ]}
                onChange={(value) =>
                  patch({
                    teamRaceTo: value === "off" ? null : Number(value) || null,
                  })
                }
              />
            </SelectBlock>
          ) : null}

          {showRoundPointsExtras ? (
            <>
              <SelectBlock
                label="Point system"
                info={{
                  summary:
                    "Expected-points scale used with Fargo HC (1, 10, 17, or TRIOS).",
                }}
              >
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
              </SelectBlock>
              <label className="flex items-start gap-2 text-sm text-[var(--ink)]">
                <input
                  type="checkbox"
                  checked={picks.matchPointsRound}
                  onChange={(event) =>
                    patch({ matchPointsRound: event.target.checked })
                  }
                  className="mt-0.5 size-4 accent-[var(--felt)]"
                />
                <span>
                  Include overall match-points (totals)
                  <span className="mt-0.5 block text-xs text-[var(--muted)]">
                    Extra team point for night totals — shown as Tot, not a
                    played round.
                  </span>
                </span>
              </label>
            </>
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
              <FieldLabel>Night matchups</FieldLabel>
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

            <div className="border-t border-[var(--line)] px-3 py-3 sm:px-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  className={`${btnPrimary} sm:col-span-2`}
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
                  className={`${btnGhost} sm:col-span-2`}
                  onClick={() => setPaperOpen(true)}
                >
                  Paper-style preview
                </button>
              </div>
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
          </>
        )}
      </SubTabCard>
    </section>
  );
}
