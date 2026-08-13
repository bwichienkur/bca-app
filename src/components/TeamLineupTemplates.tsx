"use client";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_PLAYERS_PER_TEAM } from "@/lib/constants";
import {
  loadTeamLineupPresets,
  removeTeamLineupPreset,
  saveTeamLineupPreset,
} from "@/lib/lineup-sync";
import type { DivisionTeam, LineupPreset, RosterPlayer } from "@/lib/types";
import {
  AccentRecordCard,
  accentRecordListClass,
} from "./AccentRecordCard";
import { DraggableLineupList } from "./DraggableLineupList";
import { EmptyState } from "./EmptyState";
import { IconAddButton, PanelHeader, PanelHeaderCount } from "./PanelHeader";

const DEFAULT_LINEUP_NAME = "Default lineup";

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

function isDefaultLineupName(name: string): boolean {
  return name.trim().toLowerCase() === DEFAULT_LINEUP_NAME.toLowerCase();
}

function findDefaultPreset(presets: LineupPreset[]): LineupPreset | null {
  return presets.find((preset) => isDefaultLineupName(preset.name)) ?? null;
}

function nextAdditionalName(presets: LineupPreset[]): string {
  const used = new Set(presets.map((preset) => preset.name.trim().toLowerCase()));
  let n = 2;
  while (used.has(`lineup ${n}`)) n += 1;
  return `Lineup ${n}`;
}

function sortTeamPresets(presets: LineupPreset[]): LineupPreset[] {
  return [...presets].sort((a, b) => {
    const aDefault = isDefaultLineupName(a.name);
    const bDefault = isDefaultLineupName(b.name);
    if (aDefault !== bDefault) return aDefault ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
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

/** Same control chrome as LMS operator list rows. */
const btnEdit =
  "inline-flex items-center justify-center rounded-[var(--radius)] bg-[#a16207] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50";
const btnDelete =
  "inline-flex items-center justify-center rounded-[var(--radius)] bg-[#b42318] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50";

function ChevronIcon({
  className,
  open,
}: {
  className?: string;
  open: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={[
        className,
        "transition-transform",
        open ? "rotate-90" : "",
      ].join(" ")}
      aria-hidden
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function lineupMembers(
  team: DivisionTeam,
  preset: LineupPreset,
  slots: number,
): Array<{ name: string; rating: number | null; slot: number }> {
  return idsFromPreset(team, preset, slots).map((id, index) => {
    const player = id
      ? (team.players.find((item) => item.id === id) ?? null)
      : null;
    return {
      slot: index + 1,
      name: player ? playerLabel(player) : "Empty slot",
      rating: player?.fargoRating ?? null,
    };
  });
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
  const [presetName, setPresetName] = useState(DEFAULT_LINEUP_NAME);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setStatus(null);
    setMode("library");
    setExpandedId(null);

    void loadTeamLineupPresets({ teamId: team.id, divisionId })
      .then(async (result) => {
        if (cancelled) return;

        let nextPresets = result.presets;
        const existingDefault = findDefaultPreset(nextPresets);

        if (!existingDefault && team.players.length >= slots) {
          const seededIds = defaultTopIds(team, slots);
          const playerIds = seededIds.filter((id): id is string => Boolean(id));
          if (playerIds.length === slots) {
            const preset: LineupPreset = {
              id: presetId(team.id, DEFAULT_LINEUP_NAME),
              name: DEFAULT_LINEUP_NAME,
              divisionId,
              teamId: team.id,
              playerIds,
              updatedAt: new Date().toISOString(),
            };
            try {
              const saved = await saveTeamLineupPreset(preset);
              if (cancelled) return;
              nextPresets = saved.presets;
            } catch {
              /* library still usable without seeded default */
            }
          }
        }

        if (cancelled) return;
        setPresets(nextPresets);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setPresets([]);
        setStatus("Couldn't load saved lineups.");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // Seed/load once per team + division.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- team identity is team.id
  }, [team.id, divisionId, slots]);

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

  const teamPresets = useMemo(
    () =>
      sortTeamPresets(
        presets.filter(
          (preset) =>
            preset.divisionId === divisionId && preset.teamId === team.id,
        ),
      ),
    [divisionId, presets, team.id],
  );

  const filled = lineupIds.filter(Boolean).length;
  const complete = filled === slots && lineupIds.every(Boolean);
  const editingDefault = isDefaultLineupName(presetName);
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
    setPresetName(nextAdditionalName(teamPresets));
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
    const name = editingDefault
      ? DEFAULT_LINEUP_NAME
      : presetName.trim() || nextAdditionalName(teamPresets);
    if (!editingDefault && isDefaultLineupName(name)) {
      setStatus(`Use a different name — “${DEFAULT_LINEUP_NAME}” is reserved.`);
      return;
    }
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

    setSaving(true);
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
      .catch(() => setStatus("Couldn't save lineup."))
      .finally(() => setSaving(false));
  };

  const deletePreset = (preset: LineupPreset) => {
    if (isDefaultLineupName(preset.name)) {
      setStatus(`“${DEFAULT_LINEUP_NAME}” can’t be deleted.`);
      return;
    }
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
    <PanelHeader
      title="Lineups"
      info={{
        summary: `Save ${slots}-player orders for league night. Load them from Handicap or Score. Default is used first; add more for alternate nights.`,
      }}
      action={
        mode === "library" ? (
          <IconAddButton label="Add lineup" onClick={openNew} />
        ) : (
          <PanelHeaderCount label="Filled" value={`${filled}/${slots}`} />
        )
      }
    />
  );

  const library = (
    <div className="space-y-3">
      {status && mode === "library" ? (
        <p className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--felt-deep)]">
          {status}
        </p>
      ) : null}

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
        <ul className={accentRecordListClass}>
          {teamPresets.map((preset) => {
            const members = lineupMembers(team, preset, slots);
            const filledCount = idsFromPreset(team, preset, slots).filter(
              Boolean,
            ).length;
            const isDefault = isDefaultLineupName(preset.name);
            const expanded = expandedId === preset.id;
            return (
              <li key={preset.id}>
                <AccentRecordCard>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId((prev) =>
                            prev === preset.id ? null : preset.id,
                          )
                        }
                        className="inline-flex shrink-0 items-center self-center rounded p-1 text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
                        aria-expanded={expanded}
                        aria-label={
                          expanded
                            ? `Collapse ${preset.name}`
                            : `Expand ${preset.name}`
                        }
                      >
                        <ChevronIcon open={expanded} className="h-5 w-5" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[var(--ink)]">
                          {preset.name}
                          {isDefault ? (
                            <span className="ml-2 text-xs text-[var(--muted)]">
                              PRIMARY
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-[var(--muted)]">
                          {filledCount}/{slots} players
                          {isDefault ? " · used first" : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => viewPreset(preset)}
                          className={btnEdit}
                        >
                          View
                        </button>
                        {!isDefault ? (
                          <button
                            type="button"
                            onClick={() => deletePreset(preset)}
                            className={btnDelete}
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {expanded ? (
                      <ul
                        className={`${accentRecordListClass} mt-3 border-t border-[var(--line)] pt-3`}
                      >
                        {members.map((member) => (
                          <li key={`${preset.id}-${member.slot}`}>
                            <AccentRecordCard showRail={false}>
                              <div className="flex items-center justify-between gap-3">
                                <span className="min-w-0 flex-1 text-sm font-medium text-[var(--ink)]">
                                  <span className="mr-2 text-[var(--muted)]">
                                    #{member.slot}
                                  </span>
                                  {member.name}
                                </span>
                                <span
                                  className={[
                                    "shrink-0 text-sm tabular-nums",
                                    member.rating == null
                                      ? "font-semibold text-[var(--amber)]"
                                      : "text-[var(--muted)]",
                                  ].join(" ")}
                                >
                                  {member.rating != null
                                    ? member.rating
                                    : "Empty"}
                                </span>
                              </div>
                            </AccentRecordCard>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </AccentRecordCard>
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
          className={btnEdit}
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
                if (editingDefault && editingId) return;
                setPresetName(event.target.value);
                setStatus(null);
              }}
              readOnly={Boolean(editingDefault && editingId)}
              placeholder="Lineup name"
              className="w-full flex-1 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:ring-2 focus:ring-[var(--felt-soft)] read-only:opacity-70"
            />
            <button
              type="button"
              disabled={!complete || saving}
              onClick={savePreset}
              className="rounded-[var(--radius)] bg-[var(--felt)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--felt-soft)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? "Saving…" : isUpdate ? "Update" : "Save"}
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
      {embedded ? (
        header
      ) : (
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
