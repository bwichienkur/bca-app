/** LMS advanced format template (DSL) helpers for the visual scoresheet builder. */

export type FormatGameKind = "S" | "R" | "D";

export type FormatPlayerRef = {
  side: "H" | "A";
  index: number;
};

export type FormatGame = {
  id: string;
  kind: FormatGameKind;
  /** Break-side players (listed first in DSL). */
  breakPlayers: FormatPlayerRef[];
  /** Other-side players. */
  otherPlayers: FormatPlayerRef[];
  /** 1 = home breaks, 2 = away breaks. */
  breakTeam: 1 | 2;
  gameType: string;
  multiplier: string;
  raceLength: string;
};

export type FormatRound = {
  id: string;
  games: FormatGame[];
};

export type FormatTemplateModel = {
  playerCount: number;
  rounds: FormatRound[];
};

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

export function emptyGame(kind: FormatGameKind = "S"): FormatGame {
  return {
    id: nextId("game"),
    kind,
    breakPlayers: [{ side: "H", index: 1 }],
    otherPlayers: [{ side: "A", index: 1 }],
    breakTeam: 1,
    gameType: kind === "R" ? "9" : "0",
    multiplier: "1.00",
    raceLength: "7",
  };
}

export function emptyRound(): FormatRound {
  return { id: nextId("round"), games: [emptyGame("S")] };
}

export function defaultFormatModel(playerCount = 5, rounds = 5): FormatTemplateModel {
  const count = clampPlayerCount(playerCount);
  const model: FormatTemplateModel = {
    playerCount: count,
    rounds: Array.from({ length: Math.max(1, rounds) }, () => emptyRound()),
  };
  // Simple Hn vs An pairing for a usable starter.
  model.rounds = model.rounds.map((round, roundIndex) => ({
    ...round,
    games: Array.from({ length: count }, (_, i) => {
      const n = i + 1;
      const homeBreaks = roundIndex % 2 === 0;
      return {
        ...emptyGame("S"),
        breakPlayers: [{ side: homeBreaks ? "H" : "A", index: n }],
        otherPlayers: [{ side: homeBreaks ? "A" : "H", index: n }],
        breakTeam: homeBreaks ? 1 : 2,
      };
    }),
  }));
  return model;
}

export function clampPlayerCount(value: number): number {
  if (!Number.isFinite(value)) return 5;
  return Math.min(10, Math.max(1, Math.round(value)));
}

function parsePlayerToken(token: string): FormatPlayerRef | null {
  const match = /^([HA])(\d+)$/i.exec(token.trim());
  if (!match) return null;
  return {
    side: match[1]!.toUpperCase() as "H" | "A",
    index: Number(match[2]),
  };
}

function formatPlayer(ref: FormatPlayerRef): string {
  return `${ref.side}${ref.index}`;
}

export function parseFormatTemplate(raw: string | null | undefined): FormatTemplateModel {
  const text = (raw ?? "").trim();
  if (!text) return defaultFormatModel(5, 1);

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let playerCount = 0;
  for (const line of lines) {
    const match = /^PLAYER\s+H(\d+)$/i.exec(line);
    if (match) playerCount = Math.max(playerCount, Number(match[1]));
  }
  if (playerCount < 1) playerCount = 5;

  const rounds: FormatRound[] = [];
  let current: FormatRound | null = null;

  for (const line of lines) {
    if (/^MATCH\b/i.test(line) || /^PLAYER\b/i.test(line)) continue;

    const roundMatch = /^ROUND\s+(\d+)/i.exec(line);
    if (roundMatch) {
      current = { id: nextId("round"), games: [] };
      rounds.push(current);
      continue;
    }

    const gameMatch = /^GAME\s+([SRD])\b(.*)$/i.exec(line);
    if (!gameMatch) continue;
    if (!current) {
      current = { id: nextId("round"), games: [] };
      rounds.push(current);
    }

    const kind = gameMatch[1]!.toUpperCase() as FormatGameKind;
    const rest = gameMatch[2] ?? "";
    const tokens = rest.split(/\s+/).filter(Boolean);

    let breakTeam: 1 | 2 = 1;
    let gameType = "0";
    let multiplier = "1.00";
    let raceLength = "7";
    const players: FormatPlayerRef[] = [];

    for (const token of tokens) {
      const b = /^B([12])$/i.exec(token);
      if (b) {
        breakTeam = Number(b[1]) as 1 | 2;
        continue;
      }
      const gt = /^GT(\d+)$/i.exec(token);
      if (gt) {
        gameType = gt[1]!;
        continue;
      }
      const m = /^M([\d.]+)$/i.exec(token);
      if (m) {
        const n = Number(m[1]);
        multiplier = Number.isFinite(n) ? n.toFixed(2) : "1.00";
        continue;
      }
      const rl = /^RL(\d+)$/i.exec(token);
      if (rl) {
        raceLength = rl[1]!;
        continue;
      }
      const player = parsePlayerToken(token);
      if (player) players.push(player);
    }

    // Singles: one per side. Scotch / multi-slot races: split evenly.
    const maxSlots =
      kind === "D"
        ? Math.max(2, Math.ceil(players.length / 2))
        : Math.max(1, Math.floor(players.length / 2) || 1);
    const breakPlayers = players.slice(0, maxSlots);
    const otherPlayers = players.slice(maxSlots, maxSlots * 2);

    if (breakPlayers.length === 0) {
      breakPlayers.push({ side: breakTeam === 1 ? "H" : "A", index: 1 });
    }
    if (otherPlayers.length === 0) {
      otherPlayers.push({ side: breakTeam === 1 ? "A" : "H", index: 1 });
    }

    current.games.push({
      id: nextId("game"),
      kind,
      breakPlayers,
      otherPlayers,
      breakTeam,
      gameType,
      multiplier,
      raceLength,
    });
  }

  if (rounds.length === 0) return defaultFormatModel(playerCount, 1);
  return { playerCount: clampPlayerCount(playerCount), rounds };
}

export function serializeFormatTemplate(model: FormatTemplateModel): string {
  const count = clampPlayerCount(model.playerCount);
  const lines: string[] = ["MATCH M"];
  for (let i = 1; i <= count; i += 1) lines.push(`PLAYER H${i}`);
  for (let i = 1; i <= count; i += 1) lines.push(`PLAYER A${i}`);

  model.rounds.forEach((round, roundIndex) => {
    lines.push(`ROUND ${roundIndex + 1}`);
    for (const game of round.games) {
      const parts = [`GAME ${game.kind}`];
      const breakPlayers = normalizePlayers(game.breakPlayers, game.kind, count);
      const otherPlayers = normalizePlayers(game.otherPlayers, game.kind, count);
      for (const p of breakPlayers) parts.push(formatPlayer(p));
      for (const p of otherPlayers) parts.push(formatPlayer(p));
      parts.push(`B${game.breakTeam === 2 ? 2 : 1}`);
      parts.push(`GT${game.gameType || "0"}`);
      const mult = Number(game.multiplier);
      parts.push(`M${Number.isFinite(mult) ? mult.toFixed(2) : "1.00"}`);
      if (game.kind === "R") {
        parts.push(`RL${game.raceLength || "7"}`);
      }
      lines.push(parts.join(" "));
    }
  });

  return `${lines.join("\n")}\n`;
}

function normalizePlayers(
  players: FormatPlayerRef[],
  kind: FormatGameKind,
  playerCount: number,
): FormatPlayerRef[] {
  // Scotch needs 2+; doubles races (kind R with two slots) keep both players.
  const needed =
    kind === "D"
      ? Math.max(2, players.length || 2)
      : Math.max(1, players.length || 1);
  const out: FormatPlayerRef[] = [];
  for (let i = 0; i < needed; i += 1) {
    const src = players[i];
    if (src) {
      out.push({
        side: src.side === "A" ? "A" : "H",
        index: Math.min(playerCount, Math.max(1, src.index || 1)),
      });
    } else if (out[0]) {
      out.push({ ...out[0] });
    } else {
      out.push({ side: "H", index: 1 });
    }
  }
  return out;
}

export function summarizeFormatModel(model: FormatTemplateModel): string {
  const games = model.rounds.reduce((sum, round) => sum + round.games.length, 0);
  return `${model.playerCount} players · ${model.rounds.length} rounds · ${games} games`;
}

export const FORMAT_GAME_TYPE_OPTIONS = [
  { value: "0", label: "Any" },
  { value: "8", label: "8-Ball" },
  { value: "9", label: "9-Ball" },
  { value: "10", label: "10-Ball" },
] as const;

export const FORMAT_MULTIPLIER_OPTIONS = [
  { value: "1.00", label: "100% (default)" },
  { value: "0.50", label: "50%" },
  { value: "1.50", label: "150%" },
  { value: "2.00", label: "200%" },
  { value: "2.50", label: "250%" },
  { value: "3.00", label: "300%" },
] as const;

/** Includes even lengths (RL6 Tuesday chart capacity, RL4, …). */
export const FORMAT_RACE_LENGTH_OPTIONS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "13",
  "15",
  "17",
  "19",
  "21",
].map((value) => ({ value, label: `Race to ${value}` }));

/** Soft UI bound for round count (LMS sheets vary: 1, 3, 4, 5, …). */
export function clampRoundCount(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(20, Math.max(1, Math.round(value)));
}
