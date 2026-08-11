"use client";

import {
  DEFAULT_PREFERENCES,
  LINEUP_PRESETS_STORAGE_KEY,
  MEMBERSHIP_STORAGE_KEY,
  PREFERENCES_STORAGE_KEY,
} from "./constants";
import type {
  LineupPreset,
  MembershipSnapshot,
  UserPreferences,
} from "./types";

type StoredMembership = {
  savedAt: number;
  membership: MembershipSnapshot;
};

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
      linkedDivisionId: parsed.linkedDivisionId ?? null,
      linkedDivisionName: parsed.linkedDivisionName ?? null,
      divisionLinkId: parsed.divisionLinkId ?? null,
      playerId: parsed.playerId ?? null,
      playerName: parsed.playerName ?? null,
      teamId: parsed.teamId ?? null,
      teamName: parsed.teamName ?? null,
      scoringFormatId: parsed.scoringFormatId ?? null,
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
  const existing = loadLineupPresets();
  const nameKey = preset.name.trim().toLowerCase();
  const matchIndex = existing.findIndex(
    (item) =>
      item.divisionId === preset.divisionId &&
      item.teamId === preset.teamId &&
      item.name.trim().toLowerCase() === nameKey,
  );

  const nextPreset: LineupPreset =
    matchIndex >= 0
      ? { ...preset, id: existing[matchIndex].id }
      : preset;

  const withoutMatch =
    matchIndex >= 0
      ? existing.filter((_, index) => index !== matchIndex)
      : existing.filter((item) => item.id !== nextPreset.id);

  const next = [nextPreset, ...withoutMatch].slice(0, 40);
  saveLineupPresets(next);
  return next;
}

export function deleteLineupPreset(id: string): LineupPreset[] {
  const next = loadLineupPresets().filter((item) => item.id !== id);
  saveLineupPresets(next);
  return next;
}

/** Client cache so selectors can filter immediately on return visits. */
export function loadStoredMembership(
  playerId: string,
): MembershipSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(MEMBERSHIP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredMembership;
    if (!parsed?.membership?.teams?.length) return null;
    if (parsed.membership.playerId !== playerId) return null;
    return parsed.membership;
  } catch {
    return null;
  }
}

export function saveStoredMembership(membership: MembershipSnapshot): void {
  if (typeof window === "undefined") return;
  if (!membership.teams.length) return;
  const payload: StoredMembership = {
    savedAt: Date.now(),
    membership,
  };
  window.localStorage.setItem(MEMBERSHIP_STORAGE_KEY, JSON.stringify(payload));
}

export function clearStoredMembership(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(MEMBERSHIP_STORAGE_KEY);
}
