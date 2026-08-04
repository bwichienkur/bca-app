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

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

type EditorMode = "library" | "viewer" | "editor";

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

  const viewingPlayers = useMemo(() => {
    return lineupIds.map((id) => {
      if (!id) return null;
      return team.players.find((player) => player.id === id) ?? null;
    });
  }, [lineupIds, team.players]);

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

  const viewPreset = (preset: LineupPreset) => {
    setLineupIds(idsFromPreset(team, preset, slots));
    setPresetName(preset.name);
    setEditingId(preset.id);
    setStatus(null);
    setMode("viewer");
  };

  const editCurrent = () => {
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
        setMode("viewer");
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
      eyebrow="Team"
      title="Lineups"
      description={`Save ${slots}-player orders for league night. Load them from Handicap or Score.`}
      badge={
        mode === "library"
          ? {
              label: "Saved",
              value: loading ? "—" : String(teamPresets.length),
            }
          : { label: "Filled", value: `${filled}/${slots}` }
      }
    />
  );

  const library = (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-1.5 rounded-[var(--radius)] bg-[var(--felt)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--felt-soft)]"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Add
        </button>
      </div>

      {loading ? (
        <p className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-4 py-6 text-center text-sm text-[var(--muted)]">
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
              className="inline-flex items-center gap-1.5 rounded-[var(--radius)] bg-[var(--felt)] px-4 py-2.5 text-sm font-semibold text-white"
            >
              <PlusIcon className="h-4 w-4" />
              Add
            </button>
          }
        />
      ) : (
        <ul className="space-y-2.5">
          {teamPresets.map((preset) => {
            const names = idsFromPreset(team, preset, slots)
              .map((id) => {
                if (!id) return "—";
                const player = team.players.find((item) => item.id === id);
                return player ? playerLabel(player) : "—";
              })
              .join(" · ");
            return (
              <li
                key={preset.id}
                className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-3 shadow-[var(--shadow)] sm:px-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => viewPreset(preset)}
                    className="min-w-0 flex-1 rounded-[var(--radius)] text-left transition hover:opacity-90"
                  >
                    <p className="truncate font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--ink)]">
                      {preset.name}
                    </p>
                    <p className="mt-1 line-clamp-2 text-[11px] text-[var(--muted)]">
                      {names}
                    </p>
                  </button>
                  <div className="flex shrink-0 flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => viewPreset(preset)}
                      aria-label={`View ${preset.name}`}
                      title="View lineup"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius)] bg-[var(--felt)] text-white transition hover:bg-[var(--felt-soft)]"
                    >
                      <EyeIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deletePreset(preset)}
                      aria-label={`Delete ${preset.name}`}
                      title="Delete lineup"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--danger)] transition hover:border-[var(--line-strong)]"
                    >
                      <TrashIcon className="h-4 w-4" />
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

  const viewer = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={backToLibrary}
          className="inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--line-strong)]"
        >
          <span aria-hidden>←</span>
          Saved lineups
        </button>
        <button
          type="button"
          onClick={editCurrent}
          className="rounded-[var(--radius)] bg-[var(--felt)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--felt-soft)]"
        >
          Edit
        </button>
      </div>

      <section className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-3 py-3 sm:px-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
              Lineup
            </p>
            <p className="mt-0.5 truncate font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--ink)]">
              {presetName}
            </p>
          </div>
          <span
            className={[
              "shrink-0 rounded-[var(--radius)] px-2.5 py-1 text-xs font-semibold",
              complete
                ? "bg-[var(--felt)] text-white"
                : "bg-[var(--surface-2)] text-[var(--muted)]",
            ].join(" ")}
          >
            {filled}/{slots}
          </span>
        </div>

        <ol className="divide-y divide-[var(--line)]">
          {viewingPlayers.map((player, index) => (
            <li
              key={`${editingId ?? "lineup"}-${index}`}
              className="flex items-center gap-3 px-3 py-3 sm:px-4"
            >
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--muted)]">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--ink)]">
                  {player ? playerLabel(player) : "Empty slot"}
                </p>
                {player ? (
                  <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                    Fargo {player.fargoRating}
                  </p>
                ) : (
                  <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                    No player assigned
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );

  const editor = (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => {
          if (editingId) {
            setMode("viewer");
            setStatus(null);
            return;
          }
          backToLibrary();
        }}
        className="inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--line-strong)]"
      >
        <span aria-hidden>←</span>
        {editingId ? "View lineup" : "Saved lineups"}
      </button>

      <section className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]">
        <div className="space-y-2.5 border-b border-[var(--line)] px-3 py-3 sm:px-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
              {editingId ? "Edit lineup" : "New lineup"}
            </p>
            <span
              className={[
                "rounded-[var(--radius)] px-2.5 py-1 text-xs font-semibold",
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
              className="w-full flex-1 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:ring-2 focus:ring-[var(--felt-soft)]"
            />
            <button
              type="button"
              disabled={!complete}
              onClick={savePreset}
              className="rounded-[var(--radius)] bg-[var(--felt)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--felt-soft)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isUpdate ? "Update" : "Save"}
            </button>
          </div>
          {status ? (
            <p className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--felt-deep)]">
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
      {mode === "library" ? library : mode === "viewer" ? viewer : editor}
    </section>
  );
}
