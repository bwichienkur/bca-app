"use client";

import {
  DEFAULT_PREFERENCES,
  LINEUP_PRESETS_STORAGE_KEY,
  PREFERENCES_STORAGE_KEY,
} from "./constants";
import type { LineupPreset, UserPreferences } from "./types";

export function loadPreferences(): UserPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;

  try {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return {
      leagueId: parsed.leagueId || DEFAULT_PREFERENCES.leagueId,
      leagueName: parsed.leagueName || DEFAULT_PREFERENCES.leagueName,
      divisionId: parsed.divisionId ?? null,
      divisionName: parsed.divisionName ?? null,
      playerId: parsed.playerId ?? null,
      playerName: parsed.playerName ?? null,
      teamId: parsed.teamId ?? null,
      teamName: parsed.teamName ?? null,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(prefs: UserPreferences): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(prefs));
}

export function loadLineupPresets(): LineupPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LINEUP_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LineupPreset[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLineupPresets(presets: LineupPreset[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    LINEUP_PRESETS_STORAGE_KEY,
    JSON.stringify(presets),
  );
}

export function upsertLineupPreset(preset: LineupPreset): LineupPreset[] {
  const existing = loadLineupPresets().filter((item) => item.id !== preset.id);
  const next = [preset, ...existing].slice(0, 40);
  saveLineupPresets(next);
  return next;
}

export function deleteLineupPreset(id: string): LineupPreset[] {
  const next = loadLineupPresets().filter((item) => item.id !== id);
  saveLineupPresets(next);
  return next;
}
