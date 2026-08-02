"use client";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_PLAYERS_PER_TEAM } from "@/lib/constants";
import {
  loadTeamLineupPresets,
  removeTeamLineupPreset,
  saveTeamLineupPreset,
} from "@/lib/lineup-sync";
import type { DivisionTeam, LineupPreset, RosterPlayer } from "@/lib/types";
import { DraggableLineupList } from "./DraggableLineupList";
import { EmptyState } from "./EmptyState";

function playerLabel(player: RosterPlayer): string {
  return `${player.firstName} ${player.lastName}`.trim();
}

function presetId(teamId: string, name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${teamId}:${slug || "lineup"}`;
}

function emptyIds(slots: number): (string | null)[] {
  return Array.from({ length: slots }, () => null);
}

function idsFromPreset(
  team: DivisionTeam,
  preset: LineupPreset,
  slots: number,
): (string | null)[] {
  const byId = new Map(team.players.map((player) => [player.id, player]));
  return Array.from({ length: slots }, (_, index) => {
    const id = preset.playerIds[index] ?? null;
    return id && byId.has(id) ? id : null;
  });
}

function defaultTopIds(team: DivisionTeam, slots: number): (string | null)[] {
  const top = [...team.players]
    .sort((a, b) => b.fargoRating - a.fargoRating)
    .slice(0, slots);
  return Array.from({ length: slots }, (_, index) => top[index]?.id ?? null);
}

type TeamLineupTemplatesProps = {
  divisionId: string;
  team: DivisionTeam;
  slots?: number;
  /** When true, page already shows the section title/description. */
  embedded?: boolean;
};

export function TeamLineupTemplates({
  divisionId,
  team,
  slots = DEFAULT_PLAYERS_PER_TEAM,
  embedded = false,
}: TeamLineupTemplatesProps) {
  const [presets, setPresets] = useState<LineupPreset[]>([]);
  const [lineupIds, setLineupIds] = useState<(string | null)[]>(() =>
    defaultTopIds(team, slots),
  );
  const [presetName, setPresetName] = useState("Default lineup");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadTeamLineupPresets({ teamId: team.id, divisionId }).then(
      (result) => {
        if (cancelled) return;
        setPresets(result.presets);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [team.id, divisionId]);

  useEffect(() => {
    setLineupIds((current) => {
      if (current.length === slots) return current;
      return Array.from(
        { length: slots },
        (_, index) => current[index] ?? null,
      );
    });
  }, [slots]);

  const roster = useMemo(
    () =>
      [...team.players]
        .sort((a, b) => b.fargoRating - a.fargoRating)
        .map((player) => ({
          id: player.id,
          label: playerLabel(player),
          rating: player.fargoRating,
        })),
    [team.players],
  );

  const teamPresets = presets.filter(
    (preset) =>
      preset.divisionId === divisionId && preset.teamId === team.id,
  );

  const filled = lineupIds.filter(Boolean).length;
  const complete = filled === slots && lineupIds.every(Boolean);

  const onChange = (index: number, playerId: string | null) => {
    setLineupIds((current) => {
      const next = [...current];
      if (playerId) {
        const existing = next.findIndex((id) => id === playerId);
        if (existing >= 0 && existing !== index) next[existing] = null;
      }
      next[index] = playerId;
      return next;
    });
    setStatus(null);
  };

  const onMove = (from: number, to: number) => {
    setLineupIds((current) => {
      if (
        from < 0 ||
        to < 0 ||
        from >= current.length ||
        to >= current.length ||
        from === to
      ) {
        return current;
      }
      const next = [...current];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const savePreset = () => {
    if (!complete) {
      setStatus(`Fill all ${slots} slots before saving.`);
      return;
    }
    const name = presetName.trim() || "Default lineup";
    const preset: LineupPreset = {
      id: presetId(team.id, name),
      name,
      divisionId,
      teamId: team.id,
      playerIds: lineupIds.filter((id): id is string => Boolean(id)),
      updatedAt: new Date().toISOString(),
    };
    void saveTeamLineupPreset(preset)
      .then((result) => {
        setPresets(result.presets);
        setPresetName(name);
        setStatus(
          result.shared
            ? `Saved “${name}” for the team — available on Handicap and Score.`
            : `Saved “${name}” on this device — available on Handicap and Score.`,
        );
      })
      .catch(() => setStatus("Couldn't save lineup."));
  };

  const loadPreset = (preset: LineupPreset) => {
    setLineupIds(idsFromPreset(team, preset, slots));
    setPresetName(preset.name);
    setStatus(`Loaded “${preset.name}” into the editor.`);
  };

  const deletePreset = (preset: LineupPreset) => {
    void removeTeamLineupPreset({
      teamId: team.id,
      divisionId,
      presetId: preset.id,
    }).then((result) => {
      setPresets(result.presets);
      setStatus(`Deleted “${preset.name}”.`);
    });
  };

  if (!team.players.length) {
    return (
      <EmptyState
        title="No roster yet"
        body="Once this team has players, you can build and save lineup templates here."
      />
    );
  }

  return (
    <section className="space-y-4">
      {embedded ? null : (
        <div>
          <h3 className="font-[family-name:var(--font-display)] text-xl text-[var(--felt-deep)]">
            Lineup templates
          </h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Save {slots}-player orders for league night. Load them from Handicap
            or Score with the Load menu.
          </p>
        </div>
      )}

      <DraggableLineupList
        title="Draft lineup"
        subtitle="Drag ⠿ or ▲▼ to reorder · handicaps follow Fargo"
        slotPrefix="#"
        lineupIds={lineupIds.length === slots ? lineupIds : emptyIds(slots)}
        roster={roster}
        onChange={onChange}
        onMove={onMove}
      />

      <div className="space-y-3 rounded-[1.3rem] border border-[var(--line)] bg-[var(--surface)] p-3 sm:p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={presetName}
            onChange={(event) => {
              setPresetName(event.target.value);
              setStatus(null);
            }}
            placeholder="Template name"
            className="w-full flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:ring-2 focus:ring-[var(--felt-soft)]"
          />
          <button
            type="button"
            disabled={!complete}
            onClick={savePreset}
            className="rounded-full bg-[var(--felt)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--felt-soft)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {teamPresets.some(
              (preset) =>
                preset.name.trim().toLowerCase() ===
                presetName.trim().toLowerCase(),
            )
              ? "Update template"
              : "Save template"}
          </button>
        </div>
        {status ? (
          <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--felt-deep)]">
            {status}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--amber)]">
          Saved templates
          {loading ? "" : ` · ${teamPresets.length}`}
        </p>
        {teamPresets.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--line)] px-3 py-4 text-center text-sm text-[var(--muted)]">
            No templates yet — fill the draft, name it, then save.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-2)]">
            {teamPresets.map((preset) => {
              const names = idsFromPreset(team, preset, slots)
                .map((id) => {
                  if (!id) return "—";
                  const player = team.players.find((item) => item.id === id);
                  return player ? playerLabel(player) : "—";
                })
                .join(" · ");
              return (
                <li key={preset.id} className="px-3 py-3 sm:px-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--ink)]">
                        {preset.name}
                      </p>
                      <p className="mt-1 line-clamp-2 text-[11px] text-[var(--muted)]">
                        {names}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => loadPreset(preset)}
                        className="rounded-full bg-[var(--felt)] px-3 py-1.5 text-[11px] font-semibold text-white"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deletePreset(preset)}
                        className="rounded-full border border-[var(--line)] px-3 py-1.5 text-[11px] font-semibold text-[var(--danger)]"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
