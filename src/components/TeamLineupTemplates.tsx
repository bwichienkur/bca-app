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
import { SectionCard } from "./SectionCard";

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

type EditorMode = "library" | "editor";

type TeamLineupTemplatesProps = {
  divisionId: string;
  team: DivisionTeam;
  slots?: number;
  /** When true, page already shows context; this component owns the section header. */
  embedded?: boolean;
};

export function TeamLineupTemplates({
  divisionId,
  team,
  slots = DEFAULT_PLAYERS_PER_TEAM,
  embedded = false,
}: TeamLineupTemplatesProps) {
  const [presets, setPresets] = useState<LineupPreset[]>([]);
  const [mode, setMode] = useState<EditorMode>("library");
  const [lineupIds, setLineupIds] = useState<(string | null)[]>(() =>
    emptyIds(slots),
  );
  const [presetName, setPresetName] = useState("Default lineup");
  const [editingId, setEditingId] = useState<string | null>(null);
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
  const isUpdate = teamPresets.some(
    (preset) =>
      preset.name.trim().toLowerCase() === presetName.trim().toLowerCase(),
  );

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

  const openNew = () => {
    setLineupIds(defaultTopIds(team, slots));
    setPresetName("Default lineup");
    setEditingId(null);
    setStatus(null);
    setMode("editor");
  };

  const openPreset = (preset: LineupPreset) => {
    setLineupIds(idsFromPreset(team, preset, slots));
    setPresetName(preset.name);
    setEditingId(preset.id);
    setStatus(null);
    setMode("editor");
  };

  const backToLibrary = () => {
    setMode("library");
    setStatus(null);
  };

  const savePreset = () => {
    if (!complete) {
      setStatus(`Fill all ${slots} slots before saving.`);
      return;
    }
    const name = presetName.trim() || "Default lineup";
    const nextId = presetId(team.id, name);
    const previousId = editingId;
    const preset: LineupPreset = {
      id: nextId,
      name,
      divisionId,
      teamId: team.id,
      playerIds: lineupIds.filter((id): id is string => Boolean(id)),
      updatedAt: new Date().toISOString(),
    };

    void saveTeamLineupPreset(preset)
      .then(async (result) => {
        if (previousId && previousId !== nextId) {
          result = await removeTeamLineupPreset({
            teamId: team.id,
            divisionId,
            presetId: previousId,
          });
        }
        setPresets(result.presets);
        setPresetName(name);
        setEditingId(nextId);
        setStatus(null);
        setMode("library");
      })
      .catch(() => setStatus("Couldn't save lineup."));
  };

  const deletePreset = (preset: LineupPreset) => {
    void removeTeamLineupPreset({
      teamId: team.id,
      divisionId,
      presetId: preset.id,
    }).then((result) => {
      setPresets(result.presets);
      if (editingId === preset.id) {
        setEditingId(null);
        setMode("library");
      }
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

  const header = (
    <SectionCard
      eyebrow="My team"
      title="Lineups"
      description={`Save ${slots}-player orders for league night. Load them from Handicap or Score.`}
      badge={
        mode === "editor"
          ? { label: "Filled", value: `${filled}/${slots}` }
          : {
              label: "Saved",
              value: loading ? "—" : String(teamPresets.length),
            }
      }
    />
  );

  const library = (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--amber)]">
          Saved lineups
          {loading ? "" : ` · ${teamPresets.length}`}
        </p>
        <button
          type="button"
          onClick={openNew}
          className="rounded-full bg-[var(--felt)] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--felt-soft)]"
        >
          New lineup
        </button>
      </div>

      {loading ? (
        <p className="rounded-[1.3rem] border border-[var(--line)] bg-[var(--surface)] px-4 py-6 text-center text-sm text-[var(--muted)]">
          Loading saved lineups…
        </p>
      ) : teamPresets.length === 0 ? (
        <EmptyState
          title="No lineups yet"
          body="Create a lineup for league night. You can load it from Handicap or Score."
          action={
            <button
              type="button"
              onClick={openNew}
              className="rounded-xl bg-[var(--felt)] px-4 py-2.5 text-sm font-semibold text-white"
            >
              Create lineup
            </button>
          }
        />
      ) : (
        <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-[1.35rem] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]">
          {teamPresets.map((preset) => {
            const names = idsFromPreset(team, preset, slots)
              .map((id) => {
                if (!id) return "—";
                const player = team.players.find((item) => item.id === id);
                return player ? playerLabel(player) : "—";
              })
              .join(" · ");
            return (
              <li key={preset.id} className="px-3 py-3 sm:px-4">
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => openPreset(preset)}
                    className="min-w-0 flex-1 rounded-lg text-left transition hover:opacity-90"
                  >
                    <p className="truncate font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--ink)]">
                      {preset.name}
                    </p>
                    <p className="mt-1 line-clamp-2 text-[11px] text-[var(--muted)]">
                      {names}
                    </p>
                  </button>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openPreset(preset)}
                      className="rounded-full bg-[var(--felt)] px-3 py-1.5 text-[11px] font-semibold text-white"
                    >
                      Open
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
  );

  const editor = (
    <div className="space-y-3">
      <button
        type="button"
        onClick={backToLibrary}
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--line-strong)]"
      >
        <span aria-hidden>←</span>
        Saved lineups
      </button>

      <section className="overflow-hidden rounded-[1.35rem] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]">
        <div className="space-y-2.5 border-b border-[var(--line)] px-3 py-3 sm:px-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
              {editingId ? "Edit lineup" : "New lineup"}
            </p>
            <span
              className={[
                "rounded-full px-2.5 py-1 text-xs font-semibold",
                complete
                  ? "bg-[var(--felt)] text-white"
                  : "bg-[var(--surface-2)] text-[var(--muted)]",
              ].join(" ")}
            >
              {filled}/{slots}
            </span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={presetName}
              onChange={(event) => {
                setPresetName(event.target.value);
                setStatus(null);
              }}
              placeholder="Lineup name"
              className="w-full flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:ring-2 focus:ring-[var(--felt-soft)]"
            />
            <button
              type="button"
              disabled={!complete}
              onClick={savePreset}
              className="rounded-full bg-[var(--felt)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--felt-soft)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isUpdate ? "Update" : "Save"}
            </button>
          </div>
          {status ? (
            <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--felt-deep)]">
              {status}
            </p>
          ) : null}
        </div>

        <div className="p-3 sm:p-4">
          <DraggableLineupList
            bare
            slotPrefix="#"
            lineupIds={lineupIds.length === slots ? lineupIds : emptyIds(slots)}
            roster={roster}
            onChange={onChange}
            onMove={onMove}
          />
        </div>
      </section>
    </div>
  );

  return (
    <section className="space-y-3">
      {embedded ? header : (
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
      {mode === "library" ? library : editor}
    </section>
  );
}
