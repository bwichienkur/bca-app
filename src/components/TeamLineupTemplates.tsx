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

function findDefaultPreset(presets: LineupPreset[]): LineupPreset | null {
  return (
    presets.find(
      (preset) =>
        preset.name.trim().toLowerCase() === DEFAULT_LINEUP_NAME.toLowerCase(),
    ) ?? null
  );
}

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
  const [lineupIds, setLineupIds] = useState<(string | null)[]>(() =>
    emptyIds(slots),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setStatus(null);

    void loadTeamLineupPresets({ teamId: team.id, divisionId })
      .then(async (result) => {
        if (cancelled) return;

        const existing = findDefaultPreset(result.presets);
        if (existing) {
          setLineupIds(idsFromPreset(team, existing, slots));
          setEditingId(existing.id);
          setLoading(false);
          return;
        }

        // Every team gets a Default lineup — seed from roster order.
        const seededIds = defaultTopIds(team, slots);
        setLineupIds(seededIds);

        const playerIds = seededIds.filter((id): id is string => Boolean(id));
        if (playerIds.length !== slots || !team.players.length) {
          setEditingId(null);
          setLoading(false);
          return;
        }

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
          const created = findDefaultPreset(saved.presets);
          setEditingId(created?.id ?? preset.id);
        } catch {
          if (cancelled) return;
          setEditingId(null);
          setStatus("Couldn't create the default lineup yet. Tap Save to retry.");
        } finally {
          if (!cancelled) setLoading(false);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setLineupIds(defaultTopIds(team, slots));
        setEditingId(null);
        setStatus("Couldn't load the default lineup.");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  // Seed/load once per team + division; roster edits mid-session stay local until Save.
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
    const nextId = presetId(team.id, DEFAULT_LINEUP_NAME);
    const previousId = editingId;
    const preset: LineupPreset = {
      id: nextId,
      name: DEFAULT_LINEUP_NAME,
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
        const saved = findDefaultPreset(result.presets);
        setEditingId(saved?.id ?? nextId);
        setStatus("Default lineup saved.");
      })
      .catch(() => setStatus("Couldn't save lineup."))
      .finally(() => setSaving(false));
  };

  if (!team.players.length) {
    return (
      <EmptyState
        title="No roster yet"
        body="Once this team has players, you can build and save a default lineup here."
      />
    );
  }

  const header = (
    <SectionCard
      eyebrow="Team"
      title="Lineups"
      description={`Edit this team’s default ${slots}-player order for league night. Load it from Handicap or Score.`}
      badge={{ label: "Filled", value: loading ? "—" : `${filled}/${slots}` }}
    />
  );

  return (
    <section className="space-y-3">
      {embedded ? (
        header
      ) : (
        <div>
          <h3 className="font-[family-name:var(--font-display)] text-xl text-[var(--felt-deep)]">
            Default lineup
          </h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Edit the default {slots}-player order for league night. Load it from
            Handicap or Score with the Load menu.
          </p>
        </div>
      )}

      {loading ? (
        <p className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-4 py-6 text-center text-sm text-[var(--muted)]">
          Loading default lineup…
        </p>
      ) : (
        <section className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-3 py-3 sm:px-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                Default lineup
              </p>
              <p className="mt-0.5 text-sm text-[var(--muted)]">
                Drag to reorder, or pick players for each slot.
              </p>
            </div>
            <button
              type="button"
              disabled={!complete || saving}
              onClick={savePreset}
              className="rounded-[var(--radius)] bg-[var(--felt)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--felt-soft)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>

          {status ? (
            <p className="border-b border-[var(--line)] px-3 py-2 text-xs text-[var(--felt-deep)] sm:px-4">
              {status}
            </p>
          ) : null}

          <div className="p-3 sm:p-4">
            <DraggableLineupList
              bare
              slotPrefix="#"
              lineupIds={
                lineupIds.length === slots ? lineupIds : emptyIds(slots)
              }
              roster={roster}
              onChange={onChange}
              onMove={onMove}
            />
          </div>
        </section>
      )}
    </section>
  );
}
