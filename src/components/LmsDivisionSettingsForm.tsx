"use client";

import { useMemo, useState, type ReactNode } from "react";
import { LmsFormatTemplateBuilder } from "./LmsFormatTemplateBuilder";
import { SelectField } from "./SelectField";

const inputClass =
  "w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none ring-[var(--felt)] focus:ring-2";
const btnPrimary =
  "inline-flex items-center justify-center rounded-[var(--radius)] bg-[var(--felt)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50";
const btnGhost =
  "inline-flex items-center justify-center rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--ink)] disabled:opacity-50";
const btnDelete =
  "inline-flex items-center justify-center rounded-[var(--radius)] bg-[#b42318] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50";

type FormatTemplate = { id: string; name: string; template: string };

type SettingsTab = "general" | "scoring" | "reporting" | "handicap" | "format";

const YES_NO = [
  { value: "1", label: "Yes" },
  { value: "0", label: "No" },
];

const GAME_TYPES = [
  { value: "0", label: "8-Ball" },
  { value: "1", label: "9-Ball" },
  { value: "2", label: "10-Ball" },
  { value: "3", label: "Other" },
];

const TABLE_SIZES = [
  { value: "0", label: "7-foot" },
  { value: "1", label: "8-foot" },
  { value: "2", label: "9-foot" },
  { value: "3", label: "10-foot" },
];

const TIME_ZONES = [
  "Eastern Standard Time",
  "Central Standard Time",
  "Mountain Standard Time",
  "Pacific Standard Time",
  "Alaskan Standard Time",
  "Hawaiian Standard Time",
  "Atlantic Standard Time",
  "Arizona",
];

const HANDICAP_MODES = [
  { value: "0", label: "Fixed" },
  { value: "1", label: "Calculated by match" },
  { value: "2", label: "Calculated by round (Fargo)" },
  { value: "3", label: "Other / custom" },
];

const FARGO_HANDICAP_TYPES = [
  { value: "0", label: "Fargo Rating" },
  { value: "1", label: "Effective Rating" },
];

const HANDICAP_PERCENTAGES = [
  "50%",
  "60%",
  "70%",
  "75%",
  "80%",
  "90%",
  "100%",
];

const ROUND_OR_MATCH = [
  { value: "0", label: "Match" },
  { value: "1", label: "Round" },
];

const TEAM_STANDINGS_OPTIONS = [
  { id: "0,1", label: "Points Per Set" },
  { id: "1,1", label: "Matches Won" },
  { id: "2,1", label: "Total Points" },
  { id: "3,1", label: "Rounds Won" },
  { id: "4,1", label: "Games Won" },
  { id: "5,1", label: "Sets Won" },
  { id: "6,1", label: "Rounds Won %" },
];

const PLAYER_STANDINGS_OPTIONS = [
  { id: "2,1", label: "Total Points" },
  { id: "3,1", label: "Win Percentage" },
  { id: "4,1", label: "Average" },
  { id: "5,1", label: "Games Won" },
  { id: "6,1", label: "Average Points" },
  { id: "7,1", label: "Sets Won" },
  { id: "8,1", label: "Set Win Percentage" },
];

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0 space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
        {label}
      </span>
      <div className="min-w-0">{children}</div>
    </label>
  );
}

function asStr(value: unknown, fallback = ""): string {
  if (value == null) return fallback;
  return String(value);
}

function parseStandings(value: unknown): string[] {
  const raw = asStr(value).trim();
  if (!raw) return [];
  return raw.split("|").map((part) => part.trim()).filter(Boolean);
}

function joinStandings(ids: string[]): string {
  return ids.join("|");
}

function StandingsPicker({
  label,
  selected,
  options,
  onChange,
}: {
  label: string;
  selected: string[];
  options: { id: string; label: string }[];
  onChange: (next: string[]) => void;
}) {
  const selectedSet = new Set(selected);
  const available = options.filter((option) => !selectedSet.has(option.id));
  const selectedRows = selected
    .map((id) => options.find((option) => option.id === id))
    .filter(Boolean) as { id: string; label: string }[];

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
        {label}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] p-2">
          <p className="mb-1.5 text-[11px] font-semibold text-[var(--ink)]">
            Selected order
          </p>
          <ul className="space-y-1">
            {selectedRows.length === 0 ? (
              <li className="text-xs text-[var(--muted)]">None selected</li>
            ) : (
              selectedRows.map((row, index) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-2 rounded bg-[var(--surface)] px-2 py-1.5 text-xs"
                >
                  <span className="min-w-0 flex-1 truncate">{row.label}</span>
                  <span className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      className={btnGhost}
                      disabled={index === 0}
                      onClick={() => {
                        const next = [...selected];
                        [next[index - 1], next[index]] = [
                          next[index],
                          next[index - 1],
                        ];
                        onChange(next);
                      }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className={btnGhost}
                      disabled={index === selected.length - 1}
                      onClick={() => {
                        const next = [...selected];
                        [next[index], next[index + 1]] = [
                          next[index + 1],
                          next[index],
                        ];
                        onChange(next);
                      }}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className={btnDelete}
                      onClick={() =>
                        onChange(selected.filter((id) => id !== row.id))
                      }
                    >
                      −
                    </button>
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>
        <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] p-2">
          <p className="mb-1.5 text-[11px] font-semibold text-[var(--ink)]">
            Available
          </p>
          <ul className="space-y-1">
            {available.length === 0 ? (
              <li className="text-xs text-[var(--muted)]">All selected</li>
            ) : (
              available.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 rounded bg-[var(--surface)] px-2 py-1.5 text-left text-xs hover:bg-[var(--felt-soft)] hover:text-white"
                    onClick={() => onChange([...selected, row.id])}
                  >
                    <span>{row.label}</span>
                    <span aria-hidden>+</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function LmsDivisionSettingsForm({
  settings,
  templates,
  busy,
  onChange,
  onSave,
}: {
  settings: Record<string, unknown>;
  templates: FormatTemplate[];
  busy: boolean;
  onChange: (next: Record<string, unknown>) => void;
  onSave: () => void;
}) {
  const [tab, setTab] = useState<SettingsTab>("general");
  const [builderOpen, setBuilderOpen] = useState(false);
  const nameLen = asStr(settings.Name).length;

  const teamSelected = useMemo(
    () => parseStandings(settings.TeamStandings),
    [settings.TeamStandings],
  );
  const playerSelected = useMemo(
    () => parseStandings(settings.PlayerStandings),
    [settings.PlayerStandings],
  );

  const patch = (partial: Record<string, unknown>) =>
    onChange({ ...settings, ...partial });

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: "general", label: "General" },
    { id: "scoring", label: "Scoring" },
    { id: "reporting", label: "Report" },
    { id: "handicap", label: "Handicap" },
    { id: "format", label: "Format" },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={[
              "rounded-[var(--radius)] px-2 py-2 text-xs font-semibold",
              tab === item.id
                ? "bg-[var(--felt)] text-white"
                : "border border-[var(--line)] bg-[var(--surface-2)] text-[var(--muted)]",
            ].join(" ")}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "general" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={`Division name (${nameLen} / 255)`}>
            <input
              className={inputClass}
              maxLength={255}
              value={asStr(settings.Name)}
              onChange={(e) => patch({ Name: e.target.value })}
            />
          </Field>
          <Field label="Description">
            <input
              className={inputClass}
              value={asStr(settings.Description)}
              onChange={(e) => patch({ Description: e.target.value })}
            />
          </Field>
          <Field label="Game type">
            <SelectField
              aria-label="Game type"
              value={asStr(settings.GameType, "0")}
              options={GAME_TYPES}
              onChange={(value) => patch({ GameType: value })}
            />
          </Field>
          <Field label="Table size">
            <SelectField
              aria-label="Table size"
              value={asStr(settings.TableSize, "2")}
              options={TABLE_SIZES}
              onChange={(value) => patch({ TableSize: value })}
            />
          </Field>
          <Field label="Players per team">
            <input
              className={inputClass}
              value={asStr(settings.NumberOfPlayers)}
              onChange={(e) => patch({ NumberOfPlayers: e.target.value })}
            />
          </Field>
          <Field label="Cost per player">
            <input
              className={inputClass}
              value={asStr(settings.CostPerPlayer)}
              onChange={(e) => patch({ CostPerPlayer: e.target.value })}
            />
          </Field>
          <Field label="Test division?">
            <SelectField
              aria-label="Test division"
              value={asStr(settings.IsTestDivision, "0")}
              options={YES_NO}
              onChange={(value) => patch({ IsTestDivision: value })}
            />
          </Field>
          <Field label="Time zone">
            <SelectField
              aria-label="Time zone"
              value={asStr(settings.TimeZoneName, "Central Standard Time")}
              options={TIME_ZONES.map((zone) => ({
                value: zone,
                label: zone,
              }))}
              onChange={(value) => patch({ TimeZoneName: value })}
            />
          </Field>
          <Field label="Look-ahead days">
            <input
              className={inputClass}
              value={asStr(settings.LookAheadDays, "7")}
              onChange={(e) => patch({ LookAheadDays: e.target.value })}
            />
          </Field>
          <Field label="Playoff division?">
            <SelectField
              aria-label="Playoff division"
              value={
                settings.IsPlayoff === true || asStr(settings.IsPlayoff) === "true"
                  ? "1"
                  : "0"
              }
              options={YES_NO}
              onChange={(value) =>
                patch({ IsPlayoff: value === "1" })
              }
            />
          </Field>
        </div>
      ) : null}

      {tab === "scoring" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Points for game win">
            <input
              className={inputClass}
              value={asStr(settings.PointsForWin)}
              onChange={(e) => patch({ PointsForWin: e.target.value })}
            />
          </Field>
          <Field label="Rounds">
            <input
              className={inputClass}
              value={asStr(settings.NumberOfRounds)}
              onChange={(e) => patch({ NumberOfRounds: e.target.value })}
            />
          </Field>
          <Field label="Games per round">
            <input
              className={inputClass}
              value={asStr(settings.NumberOfGamesPerRound)}
              onChange={(e) => patch({ NumberOfGamesPerRound: e.target.value })}
            />
          </Field>
          <Field label="Will all games be played?">
            <SelectField
              aria-label="All scores required"
              value={asStr(settings.AllScoresRequired, "1")}
              options={YES_NO}
              onChange={(value) => patch({ AllScoresRequired: value })}
            />
          </Field>
          <Field label="Division round or match">
            <SelectField
              aria-label="Match win for round"
              value={asStr(settings.MatchWinForRound, "1")}
              options={ROUND_OR_MATCH}
              onChange={(value) => patch({ MatchWinForRound: value })}
            />
          </Field>
          <Field label="Allow tied rounds">
            <SelectField
              aria-label="Allow tied rounds"
              value={asStr(settings.AllowTiedRound, "0")}
              options={YES_NO}
              onChange={(value) => patch({ AllowTiedRound: value })}
            />
          </Field>
          <Field label="Allow tied matches">
            <SelectField
              aria-label="Allow tied matches"
              value={asStr(settings.AllowTiedMatch, "1")}
              options={YES_NO}
              onChange={(value) => patch({ AllowTiedMatch: value })}
            />
          </Field>
          <Field label="Use half for tied round">
            <SelectField
              aria-label="Use half for tied round"
              value={asStr(settings.UseHalfForTiedRound, "0")}
              options={YES_NO}
              onChange={(value) => patch({ UseHalfForTiedRound: value })}
            />
          </Field>
          <Field label="Player plays one opponent per round">
            <SelectField
              aria-label="One opponent per round"
              value={asStr(settings.PlayerPlaysOneOpponentPerRound, "1")}
              options={YES_NO}
              onChange={(value) =>
                patch({ PlayerPlaysOneOpponentPerRound: value })
              }
            />
          </Field>
          <Field label="Split scotch game">
            <SelectField
              aria-label="Split scotch game"
              value={asStr(settings.SplitScotchGame, "0")}
              options={YES_NO}
              onChange={(value) => patch({ SplitScotchGame: value })}
            />
          </Field>
          <Field label="Count sub stats">
            <SelectField
              aria-label="Count sub stats"
              value={asStr(settings.CountSubStats, "0")}
              options={YES_NO}
              onChange={(value) => patch({ CountSubStats: value })}
            />
          </Field>
        </div>
      ) : null}

      {tab === "reporting" ? (
        <div className="space-y-4">
          <StandingsPicker
            label="Team standings order"
            selected={teamSelected}
            options={TEAM_STANDINGS_OPTIONS}
            onChange={(next) => patch({ TeamStandings: joinStandings(next) })}
          />
          <StandingsPicker
            label="Player standings order"
            selected={playerSelected}
            options={PLAYER_STANDINGS_OPTIONS}
            onChange={(next) => patch({ PlayerStandings: joinStandings(next) })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Hide player PI">
              <SelectField
                aria-label="Hide player PI"
                value={asStr(settings.HidePlayerPI, "0")}
                options={YES_NO}
                onChange={(value) => patch({ HidePlayerPI: value })}
              />
            </Field>
            <Field label="Display unpaid fees">
              <SelectField
                aria-label="Display unpaid fees"
                value={asStr(settings.DisplayUnpaidFees, "0")}
                options={YES_NO}
                onChange={(value) => patch({ DisplayUnpaidFees: value })}
              />
            </Field>
            <Field label="Include forfeits in player standings">
              <SelectField
                aria-label="Include forfeits"
                value={asStr(settings.IncludeForfeitsInPlayerStandings, "1")}
                options={YES_NO}
                onChange={(value) =>
                  patch({ IncludeForfeitsInPlayerStandings: value })
                }
              />
            </Field>
          </div>
        </div>
      ) : null}

      {tab === "handicap" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Use handicap scoring">
            <SelectField
              aria-label="Use handicap"
              value={asStr(settings.UseHandicap, "1")}
              options={YES_NO}
              onChange={(value) => patch({ UseHandicap: value })}
            />
          </Field>
          <Field label="Handicap type (Fargo)">
            <SelectField
              aria-label="Fargo handicap type"
              value={asStr(settings.FargoHandicapType, "0")}
              options={FARGO_HANDICAP_TYPES}
              onChange={(value) => patch({ FargoHandicapType: value })}
            />
          </Field>
          <Field label="Handicap mode">
            <SelectField
              aria-label="Handicap mode"
              value={asStr(settings.HandicapMode, "2")}
              options={HANDICAP_MODES}
              onChange={(value) => patch({ HandicapMode: value })}
            />
          </Field>
          <Field label="Handicap percentage">
            <SelectField
              aria-label="Handicap percentage"
              value={asStr(settings.HandicapPercentage, "100%")}
              options={HANDICAP_PERCENTAGES.map((value) => ({
                value,
                label: value,
              }))}
              onChange={(value) => patch({ HandicapPercentage: value })}
            />
          </Field>
          <Field label="Maximum allowed handicap">
            <input
              className={inputClass}
              value={asStr(settings.MaximumAllowedHandicap, "50")}
              onChange={(e) =>
                patch({ MaximumAllowedHandicap: e.target.value })
              }
            />
          </Field>
          <Field label="Weeks for handicap">
            <input
              className={inputClass}
              value={asStr(settings.NumberOfWeeksForHandicap, "0")}
              onChange={(e) =>
                patch({ NumberOfWeeksForHandicap: e.target.value })
              }
            />
          </Field>
          <Field label="Include handicap in team standings">
            <SelectField
              aria-label="Include handicap in team standings"
              value={asStr(settings.IncludeHandicapInTeamStandings, "1")}
              options={YES_NO}
              onChange={(value) =>
                patch({ IncludeHandicapInTeamStandings: value })
              }
            />
          </Field>
          <Field label="Round decimal handicaps">
            <SelectField
              aria-label="Round decimal handicaps"
              value={asStr(settings.RoundDecimalHandicaps, "0")}
              options={YES_NO}
              onChange={(value) => patch({ RoundDecimalHandicaps: value })}
            />
          </Field>
        </div>
      ) : null}

      {tab === "format" ? (
        <div className="space-y-3">
          <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)]/40 p-3">
            <p className="text-sm font-semibold text-[var(--ink)]">
              Visual scoresheet builder
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Build rounds and games with player slots, then we translate that
              into the LMS advanced template language for you.
            </p>
            <button
              type="button"
              className={`${btnPrimary} mt-3 w-full sm:w-auto`}
              onClick={() => setBuilderOpen(true)}
            >
              Open scoresheet builder
            </button>
          </div>

          <Field label="Start from LMS template">
            <SelectField
              aria-label="Format template"
              value=""
              options={[
                { value: "", label: "Choose a template…" },
                ...templates.map((template) => ({
                  value: template.id,
                  label: template.name,
                })),
              ]}
              onChange={(value) => {
                const template = templates.find((row) => row.id === value);
                if (!template) return;
                patch({ FormatTemplate: template.template });
              }}
            />
          </Field>

          <details className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-3">
            <summary className="cursor-pointer text-sm font-semibold text-[var(--ink)]">
              Advanced template text (optional)
            </summary>
            <div className="mt-3 space-y-3">
              <p className="text-xs text-[var(--muted)]">
                This is the same language LMS saves. Prefer the visual builder
                unless you need a raw edit.
              </p>
              <textarea
                id="lms-format-template"
                className={`${inputClass} min-h-40 font-mono text-xs`}
                value={asStr(settings.FormatTemplate)}
                onChange={(e) => patch({ FormatTemplate: e.target.value })}
              />
            </div>
          </details>

          <details className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-3">
            <summary className="cursor-pointer text-sm font-semibold text-[var(--ink)]">
              Legacy scoresheet layout (rarely used)
            </summary>
            <div className="mt-3 space-y-3">
              <p className="text-xs text-[var(--muted)]">
                Most modern divisions leave this empty and use the advanced
                template above. Clearing archives the legacy layout.
              </p>
              <textarea
                id="lms-scoresheet-layout"
                className={`${inputClass} min-h-24 font-mono text-xs`}
                value={asStr(settings.ScoresheetLayout)}
                onChange={(e) =>
                  patch({ ScoresheetLayout: e.target.value || null })
                }
                placeholder="Empty means no legacy scoresheet layout"
              />
              <button
                type="button"
                className={btnDelete}
                disabled={!asStr(settings.ScoresheetLayout)}
                onClick={() => patch({ ScoresheetLayout: null })}
              >
                Archive / clear scoresheet layout
              </button>
            </div>
          </details>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="BCAPL format code">
              <input
                className={inputClass}
                value={asStr(settings.BCAPLFormat)}
                onChange={(e) => patch({ BCAPLFormat: e.target.value })}
              />
            </Field>
            <Field label="Match format">
              <input
                className={inputClass}
                value={asStr(settings.MatchFormat, "0")}
                onChange={(e) => patch({ MatchFormat: e.target.value })}
              />
            </Field>
          </div>
        </div>
      ) : null}

      {builderOpen ? (
        <LmsFormatTemplateBuilder
          initialTemplate={asStr(settings.FormatTemplate)}
          playerCountHint={Number(settings.NumberOfPlayers) || undefined}
          onCancel={() => setBuilderOpen(false)}
          onApply={(template, meta) => {
            patch({
              FormatTemplate: template,
              NumberOfPlayers: String(meta.playerCount),
              NumberOfRounds: String(meta.rounds),
            });
            setBuilderOpen(false);
          }}
        />
      ) : null}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={Boolean(settings.ForceChanges)}
          onChange={(e) => patch({ ForceChanges: e.target.checked })}
          className="h-4 w-4 accent-[var(--felt)]"
        />
        Force changes on already-played scoresheets
      </label>
      <button
        type="button"
        className={btnPrimary}
        disabled={busy}
        onClick={onSave}
      >
        Save settings
      </button>
    </div>
  );
}
