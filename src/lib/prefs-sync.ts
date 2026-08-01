"use client";

import type { UserPreferences } from "./types";

/** Pull shared defaults from Redis after login (multi-device). */
export async function fetchSharedPreferences(): Promise<UserPreferences | null> {
  try {
    const response = await fetch("/api/scoring/preferences");
    if (!response.ok) return null;
    const data = (await response.json()) as {
      shared?: boolean;
      prefs?: UserPreferences | null;
    };
    if (!data.shared || !data.prefs?.leagueId) return null;
    return data.prefs;
  } catch {
    return null;
  }
}

/** Push local defaults to Redis when signed in. */
export async function pushSharedPreferences(
  prefs: UserPreferences,
): Promise<boolean> {
  try {
    const response = await fetch("/api/scoring/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefs }),
    });
    if (!response.ok) return false;
    const data = (await response.json()) as { shared?: boolean };
    return Boolean(data.shared);
  } catch {
    return false;
  }
}
