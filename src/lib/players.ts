import type { TableReport } from "./types";

export function normalizePerson(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function personKeys(name: string): string[] {
  const normalized = normalizePerson(name);
  if (!normalized) return [];

  const keys = new Set<string>([normalized]);
  const comma = name.match(/^([^,]+),\s*(.+)$/);
  if (comma) {
    keys.add(normalizePerson(`${comma[2]} ${comma[1]}`));
    keys.add(normalizePerson(`${comma[1]} ${comma[2]}`));
  }

  const parts = normalized.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1] ?? "";
    const first = parts.slice(0, -1).join(" ");
    keys.add(normalizePerson(`${last} ${first}`));
    keys.add(normalizePerson(`${last}, ${first}`));
  }

  return [...keys];
}

function ratingColumnIndex(headers: string[]): number {
  return headers.findIndex((header) => {
    const h = header.trim().toLowerCase();
    return h === "rating" || h === "fargo" || h.includes("rating");
  });
}

function nameColumnIndex(headers: string[]): number {
  return headers.findIndex((header) => {
    const h = header.trim().toLowerCase();
    return h === "name" || h === "player" || h.includes("name") || h.includes("player");
  });
}

/** Join LMS player standings with the ratings list into one sortable table. */
export function enrichPlayersWithRatings(
  players: TableReport,
  ratings: TableReport | null,
): TableReport {
  if (ratingColumnIndex(players.headers) >= 0) {
    return players;
  }

  const nameIndex = nameColumnIndex(players.headers);
  const insertAt = nameIndex >= 0 ? nameIndex + 1 : 1;
  const ratingNameIndex = ratings ? nameColumnIndex(ratings.headers) : -1;
  const ratingValueIndex = ratings ? ratingColumnIndex(ratings.headers) : -1;

  const ratingByKey = new Map<string, string>();
  if (ratings && ratingNameIndex >= 0 && ratingValueIndex >= 0) {
    for (const row of ratings.rows) {
      const name = row[ratingNameIndex] ?? "";
      const rating = (row[ratingValueIndex] ?? "").trim();
      if (!name || !rating) continue;
      for (const key of personKeys(name)) {
        if (!ratingByKey.has(key)) ratingByKey.set(key, rating);
      }
    }
  }

  const headers = [
    ...players.headers.slice(0, insertAt),
    "Rating",
    ...players.headers.slice(insertAt),
  ];

  const rows = players.rows.map((row) => {
    const playerName = nameIndex >= 0 ? (row[nameIndex] ?? "") : "";
    let rating = "—";
    for (const key of personKeys(playerName)) {
      const matched = ratingByKey.get(key);
      if (matched) {
        rating = matched;
        break;
      }
    }
    return [...row.slice(0, insertAt), rating, ...row.slice(insertAt)];
  });

  return { headers, rows };
}
