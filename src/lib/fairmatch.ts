import type { PlayerSearchResult } from "./types";

export const FAIRMATCH_DASHBOARD_BASE = "https://dashboard.fargorate.com";

type FairMatchIndexPlayer = {
  id?: string;
  readableId?: string | number | null;
  membershipId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  location?: string | null;
  rating?: string | number | null;
  robustness?: string | number | null;
  provisionalRating?: string | number | null;
  effectiveRating?: string | number | null;
};

type FairMatchIndexResponse = {
  value?: FairMatchIndexPlayer[];
};

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

function robustnessStatus(
  robustness: number | null,
): PlayerSearchResult["robustnessStatus"] {
  if (robustness == null || robustness <= 0) return "starter";
  if (robustness < 200) return "preliminary";
  return "established";
}

function mapPlayer(player: FairMatchIndexPlayer): PlayerSearchResult | null {
  const id = player.id?.trim();
  if (!id) return null;

  const firstName = (player.firstName ?? "").trim();
  const lastName = (player.lastName ?? "").trim();
  const name = [firstName, lastName].filter(Boolean).join(" ") || "Unknown";
  const robustness = toNumber(player.robustness);
  const effectiveRating =
    toNumber(player.effectiveRating) ?? toNumber(player.rating);

  return {
    id,
    readableId: String(player.readableId ?? "").trim() || null,
    membershipId: (player.membershipId ?? "").trim() || null,
    firstName,
    lastName,
    name,
    location: (player.location ?? "").trim() || null,
    rating: toNumber(player.rating),
    effectiveRating,
    provisionalRating: toNumber(player.provisionalRating),
    robustness,
    robustnessStatus: robustnessStatus(robustness),
  };
}

/** Search FairMatch / FargoRate player index by name or ID. */
export async function searchFairMatchPlayers(
  query: string,
): Promise<PlayerSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const url = `${FAIRMATCH_DASHBOARD_BASE}/api/indexsearch?q=${encodeURIComponent(q)}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Tableside/1.0",
    },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error(`FairMatch search failed (${response.status})`);
  }

  const data = (await response.json()) as FairMatchIndexResponse;
  return (data.value ?? [])
    .map(mapPlayer)
    .filter((player): player is PlayerSearchResult => Boolean(player));
}
