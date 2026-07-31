"use client";

import { DEFAULT_PREFERENCES, PREFERENCES_STORAGE_KEY } from "./constants";
import type { UserPreferences } from "./types";

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
