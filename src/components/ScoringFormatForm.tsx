"use client";

import { useMemo, useState } from "react";
import {
  FORMAT_PALM_BEACH_5,
  LEAGUE_SCORING_FORMATS,
  type LeagueScoringFormat,
  type RaceMode,
  type ScoringFormatListItem,
  type TeamPointMode,
} from "@/lib/scoring-formats";
import {
  RACE_CHART_OPTIONS,
  type RaceChartId,
} from "@/lib/race-charts";
import { SelectField } from "./SelectField";

const inputClass =
  "w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none ring-[var(--felt)] focus:ring-2";
const btnPrimary =
  "inline-flex items-center justify-center rounded-[var(--radius)] bg-[var(--felt)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50";
const btnGhost =
  "inline-flex items-center justify-center rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--ink)] disabled:opacity-50";
const btnDelete =
  "inline-flex items-center justify-center rounded-[var(--radius)] border border-[var(--danger)]/40 bg-[var(--danger-bg)] px-3 py-2 text-sm font-semibold text-[var(--danger)] disabled:opacity-50";

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

function blankFormat(): LeagueScoringFormat {
  return {
    ...FORMAT_PALM_BEACH_5,
    id: "",
    label: "",
    description: "",
  };
}

type ScoringFormatFormProps = {
  leagueId: string;
  initial: ScoringFormatListItem | null;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onNotice: (message: string | null) => void;
  onError: (message: string | null) => void;
  onSaved: (formats: ScoringFormatListItem[]) => void;
  onDeleted: (formats: ScoringFormatListItem[]) => void;
};

export function ScoringFormatForm({
  leagueId,
  initial,
  busy,
  onBusy,
  onNotice,
  onError,
  onSaved,
  onDeleted,
}: ScoringFormatFormProps) {
  const isNew = !initial;
  const [draft, setDraft] = useState<LeagueScoringFormat>(() =>
    initial ? { ...initial } : blankFormat(),
  );
  const [templateId, setTemplateId] = useState(FORMAT_PALM_BEACH_5.id);
  const [saveAsCopy, setSaveAsCopy] = useState(false);

  const templateOptions = useMemo(
    () =>
      LEAGUE_SCORING_FORMATS.map((format) => ({
        value: format.id,
        label: format.label,
      })),
    [],
  );

  const raceChartOptions = useMemo(
    () =>
      RACE_CHART_OPTIONS.map((chart) => ({
        value: chart.id,
        label: chart.label,
      })),
    [],
  );

  const canDelete =
    Boolean(initial) &&
    (initial?.source === "custom" || initial?.source === "override");

  const deleteLabel =
    initial?.source === "override" ? "Reset to built-in" : "Delete";

  async function save() {
    onError(null);
    onNotice(null);
    if (!draft.label.trim()) {
      onError("Label is required.");
      return;
    }
    onBusy(true);
    try {
      const payload: Partial<LeagueScoringFormat> & { id?: string | null } = {
        ...draft,
        id: isNew || saveAsCopy ? undefined : draft.id,
        label: draft.label.trim(),
        description: draft.description.trim(),
      };
      const data = await fetchJson<{
        formats: ScoringFormatListItem[];
      }>("/api/scoring-formats", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leagueId, format: payload }),
      });
      onSaved(data.formats ?? []);
      onNotice(
        saveAsCopy || isNew
          ? "Play style saved."
          : initial?.source === "built-in"
            ? "Built-in override saved for this league."
            : "Play style updated.",
      );
    } catch (error) {
      onError(error instanceof Error ? error.message : "Save failed.");
    } finally {
      onBusy(false);
    }
  }

  async function remove() {
    if (!initial?.id) return;
    onError(null);
    onNotice(null);
    onBusy(true);
    try {
      const data = await fetchJson<{
        formats: ScoringFormatListItem[];
        resetBuiltIn?: boolean;
      }>(
        `/api/scoring-formats?leagueId=${encodeURIComponent(leagueId)}&formatId=${encodeURIComponent(initial.id)}`,
        { method: "DELETE" },
      );
      onDeleted(data.formats ?? []);
      onNotice(
        data.resetBuiltIn
          ? "Built-in override cleared."
          : "Play style deleted.",
      );
    } catch (error) {
      onError(error instanceof Error ? error.message : "Delete failed.");
    } finally {
      onBusy(false);
    }
  }

  return (
    <div className="space-y-4 px-4 py-4">
      <p className="text-sm text-[var(--muted)]">
        Templates seed a Night Format → Play style tab. Configure the live night
        there. Built-ins can be overridden for this league; custom templates are
        league-only.
      </p>

      {isNew ? (
        <label className="block space-y-1 text-sm">
          <span className="text-[var(--muted)]">Start from template</span>
          <SelectField
            aria-label="Start from template"
            value={templateId}
            options={templateOptions}
            onChange={(value) => {
              setTemplateId(value);
              const template =
                LEAGUE_SCORING_FORMATS.find((row) => row.id === value) ??
                FORMAT_PALM_BEACH_5;
              setDraft({
                ...template,
                id: "",
                label: `${template.label} (copy)`,
              });
            }}
          />
        </label>
      ) : null}

      <label className="block space-y-1 text-sm">
        <span className="text-[var(--muted)]">Label</span>
        <input
          className={inputClass}
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          placeholder="e.g. Thursday 9-Ball (R6 Hot)"
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="text-[var(--muted)]">Description</span>
        <textarea
          className={`${inputClass} min-h-[72px]`}
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          placeholder="Short note shown in Settings / Night Format."
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1 text-sm">
          <span className="text-[var(--muted)]">Players / team</span>
          <input
            type="number"
            min={1}
            className={inputClass}
            value={draft.playersPerTeam}
            onChange={(e) =>
              setDraft({
                ...draft,
                playersPerTeam: Number(e.target.value) || 1,
              })
            }
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-[var(--muted)]">Rounds</span>
          <input
            type="number"
            min={1}
            className={inputClass}
            value={draft.matchesPerNight}
            onChange={(e) =>
              setDraft({
                ...draft,
                matchesPerNight: Number(e.target.value) || 1,
              })
            }
          />
        </label>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="text-[var(--muted)]">Team points</span>
        <SelectField
          aria-label="Team points"
          value={draft.teamPointMode}
          options={[
            { value: "round-points", label: "Round win" },
            { value: "match-win", label: "Set win" },
          ]}
          onChange={(value) =>
            setDraft({
              ...draft,
              teamPointMode: value as TeamPointMode,
            })
          }
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1 text-sm">
          <span className="text-[var(--muted)]">Pts / unit</span>
          <input
            type="number"
            min={1}
            className={inputClass}
            value={draft.pointsPerMatchWin}
            onChange={(e) =>
              setDraft({
                ...draft,
                pointsPerMatchWin: Number(e.target.value) || 1,
              })
            }
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-[var(--muted)]">Team race-to (optional)</span>
          <input
            type="number"
            min={0}
            className={inputClass}
            value={draft.teamRaceTo ?? ""}
            placeholder="e.g. 9"
            onChange={(e) => {
              const raw = e.target.value.trim();
              setDraft({
                ...draft,
                teamRaceTo: raw ? Number(raw) || undefined : undefined,
              });
            }}
          />
        </label>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="text-[var(--muted)]">Race model</span>
        <SelectField
          aria-label="Race model"
          value={draft.raceMode}
          options={[
            { value: "fixed-race", label: "Fixed" },
            { value: "fargo-race-chart", label: "Fargo chart" },
          ]}
          onChange={(value) => {
            const raceMode = value as RaceMode;
            setDraft({
              ...draft,
              raceMode,
              raceChartId:
                raceMode === "fargo-race-chart"
                  ? draft.raceChartId ?? "r6-hot"
                  : undefined,
              fixedRaceWin:
                raceMode === "fixed-race"
                  ? draft.fixedRaceWin ?? 10
                  : undefined,
              fixedRaceMaxLoss:
                raceMode === "fixed-race"
                  ? draft.fixedRaceMaxLoss ?? 0
                  : undefined,
            });
          }}
        />
      </label>

      {draft.raceMode === "fixed-race" ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1 text-sm">
            <span className="text-[var(--muted)]">Win target</span>
            <input
              type="number"
              min={1}
              className={inputClass}
              value={draft.fixedRaceWin ?? 10}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  fixedRaceWin: Number(e.target.value) || 1,
                })
              }
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-[var(--muted)]">Max loss</span>
            <input
              type="number"
              min={0}
              className={inputClass}
              value={draft.fixedRaceMaxLoss ?? 0}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  fixedRaceMaxLoss: Number(e.target.value) || 0,
                })
              }
            />
          </label>
        </div>
      ) : (
        <label className="block space-y-1 text-sm">
          <span className="text-[var(--muted)]">Race chart</span>
          <SelectField
            aria-label="Race chart"
            value={draft.raceChartId ?? "r6-hot"}
            options={raceChartOptions}
            onChange={(value) =>
              setDraft({
                ...draft,
                raceChartId: value as RaceChartId,
              })
            }
          />
        </label>
      )}

      <label className="block space-y-1 text-sm">
        <span className="text-[var(--muted)]">Points for win</span>
        <SelectField
          aria-label="Points for win"
          value={draft.pointSystem}
          options={[
            { value: "1", label: "1" },
            { value: "10", label: "10" },
            { value: "17", label: "17" },
          ]}
          onChange={(value) =>
            setDraft({
              ...draft,
              pointSystem: value as LeagueScoringFormat["pointSystem"],
            })
          }
        />
      </label>

      <p className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--muted)]">
        Total-points / R6 round comes from LMS on the match (
        matchWinCountsAsRound), not from this template.
      </p>

      {!isNew && initial?.source === "built-in" ? (
        <label className="flex items-start gap-2 text-sm text-[var(--ink)]">
          <input
            type="checkbox"
            className="mt-1"
            checked={saveAsCopy}
            onChange={(e) => setSaveAsCopy(e.target.checked)}
          />
          <span>
            Save as a new custom style instead of overriding this built-in
          </span>
        </label>
      ) : null}

      {initial && !isNew ? (
        <p className="text-xs text-[var(--muted)]">
          Id: <span className="font-mono text-[var(--ink)]">{initial.id}</span>
          {initial.source === "built-in"
            ? " · built-in (saving overrides for this league)"
            : initial.source === "override"
              ? " · league override of built-in"
              : " · custom"}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          className={btnPrimary}
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : "Save play style"}
        </button>
        {canDelete ? (
          <button
            type="button"
            className={btnDelete}
            disabled={busy}
            onClick={() => void remove()}
          >
            {deleteLabel}
          </button>
        ) : null}
        <button
          type="button"
          className={btnGhost}
          disabled={busy}
          onClick={() => {
            if (initial) setDraft({ ...initial });
            else setDraft(blankFormat());
          }}
        >
          Reset form
        </button>
      </div>
    </div>
  );
}
