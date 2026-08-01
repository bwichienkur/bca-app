"use client";

import {
  deleteLineupPreset,
  loadLineupPresets,
  upsertLineupPreset,
} from "./preferences";
import type { LineupPreset } from "./types";

/** Load team lineups from Redis when available; fall back to localStorage. */
export async function loadTeamLineupPresets(args: {
  teamId: string;
  divisionId: string;
}): Promise<{ presets: LineupPreset[]; shared: boolean }> {
  const local = loadLineupPresets().filter(
    (preset) =>
      preset.teamId === args.teamId && preset.divisionId === args.divisionId,
  );

  try {
    const response = await fetch(
      `/api/scoring/lineups?teamId=${encodeURIComponent(args.teamId)}&divisionId=${encodeURIComponent(args.divisionId)}`,
    );
    if (!response.ok) return { presets: local, shared: false };
    const data = (await response.json()) as {
      presets?: LineupPreset[];
      shared?: boolean;
    };
    if (!data.shared) return { presets: local, shared: false };
    const remote = Array.isArray(data.presets) ? data.presets : [];
    // Prefer Redis as source of truth; keep local cache in sync.
    for (const preset of remote) upsertLineupPreset(preset);
    return { presets: remote, shared: true };
  } catch {
    return { presets: local, shared: false };
  }
}

export async function saveTeamLineupPreset(
  preset: LineupPreset,
): Promise<{ presets: LineupPreset[]; shared: boolean }> {
  // Always keep a local cache for offline / no-Redis deploys.
  const local = upsertLineupPreset(preset).filter(
    (item) =>
      item.teamId === preset.teamId && item.divisionId === preset.divisionId,
  );

  try {
    const response = await fetch("/api/scoring/lineups", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preset }),
    });
    if (!response.ok) return { presets: local, shared: false };
    const data = (await response.json()) as {
      presets?: LineupPreset[];
      shared?: boolean;
    };
    if (!data.shared || !Array.isArray(data.presets)) {
      return { presets: local, shared: false };
    }
    const forTeam = data.presets.filter(
      (item) =>
        item.teamId === preset.teamId && item.divisionId === preset.divisionId,
    );
    return { presets: forTeam, shared: true };
  } catch {
    return { presets: local, shared: false };
  }
}

export async function removeTeamLineupPreset(args: {
  teamId: string;
  divisionId: string;
  presetId: string;
}): Promise<{ presets: LineupPreset[]; shared: boolean }> {
  const local = deleteLineupPreset(args.presetId).filter(
    (item) =>
      item.teamId === args.teamId && item.divisionId === args.divisionId,
  );

  try {
    const params = new URLSearchParams({
      teamId: args.teamId,
      presetId: args.presetId,
    });
    const response = await fetch(`/api/scoring/lineups?${params.toString()}`, {
      method: "DELETE",
    });
    if (!response.ok) return { presets: local, shared: false };
    const data = (await response.json()) as {
      presets?: LineupPreset[];
      shared?: boolean;
    };
    if (!data.shared || !Array.isArray(data.presets)) {
      return { presets: local, shared: false };
    }
    return {
      presets: data.presets.filter(
        (item) =>
          item.teamId === args.teamId && item.divisionId === args.divisionId,
      ),
      shared: true,
    };
  } catch {
    return { presets: local, shared: false };
  }
}
