/**
 * Division scoresheet presets → FormatTemplateModel / DSL.
 * Covers Paradise / Palm Beach, Tuesday 9-Ball, Beyond Singles & Teams.
 */

import {
  clampPlayerCount,
  emptyGame,
  type FormatGame,
  type FormatTemplateModel,
} from "@/lib/lms-format-template";

export type ScoresheetPresetId =
  | "palm-beach-8ball-5"
  | "tuesday-r6-hot"
  | "beyond-singles-hot5"
  | "beyond-teams-rr9"
  | "team-race-5"
  | "matrix-9ball-5"
  | "matrix-8ball-5"
  | "matrix-8ball-3"
  | "doubles-race";

export type ScoresheetPreset = {
  id: ScoresheetPresetId;
  label: string;
  description: string;
  build: () => FormatTemplateModel;
};

function game(
  kind: FormatGame["kind"],
  home: number,
  away: number,
  homeBreaks: boolean,
  extras?: Partial<FormatGame>,
): FormatGame {
  return {
    ...emptyGame(kind),
    breakPlayers: [{ side: homeBreaks ? "H" : "A", index: homeBreaks ? home : away }],
    otherPlayers: [{ side: homeBreaks ? "A" : "H", index: homeBreaks ? away : home }],
    breakTeam: homeBreaks ? 1 : 2,
    ...extras,
  };
}

/** Classic slot rotation: round r, Home i vs Away ((i-1+r)%n)+1 */
export function buildRoundRobinTemplate(options: {
  players: number;
  rounds: number;
  kind: FormatGame["kind"];
  /** Round 1 alternating breaks; later rounds whole-side breaks (race sheet). */
  raceSheetBreaks?: boolean;
  gameType?: string;
  raceLength?: string;
}): FormatTemplateModel {
  const n = clampPlayerCount(options.players);
  const rounds = Math.max(1, options.rounds);
  return {
    playerCount: n,
    rounds: Array.from({ length: rounds }, (_, roundIndex) => ({
      id: `preset-round-${roundIndex + 1}`,
      games: Array.from({ length: n }, (_, i) => {
        const home = i + 1;
        const away = ((i + roundIndex) % n) + 1;
        let homeBreaks: boolean;
        if (options.raceSheetBreaks) {
          homeBreaks =
            roundIndex === 0 ? i % 2 === 0 : roundIndex % 2 === 0;
        } else {
          // Matrix sheets: home breaks odd rounds (1,3,5), visitor even.
          homeBreaks = roundIndex % 2 === 0;
        }
        return game(options.kind, home, away, homeBreaks, {
          gameType: options.gameType ?? (options.kind === "R" ? "9" : "0"),
          raceLength: options.raceLength ?? "7",
        });
      }),
    })),
  };
}

export function buildTuesdayRacesTemplate(players = 4): FormatTemplateModel {
  const n = clampPlayerCount(players);
  return {
    playerCount: n,
    rounds: Array.from({ length: n }, (_, i) => {
      const slot = i + 1;
      return {
        id: `tue-round-${slot}`,
        games: [
          game("R", slot, slot, true, {
            gameType: "9",
            raceLength: "6",
          }),
        ],
      };
    }),
  };
}

/** Beyond Singles: one GAME R per player slot (Hot 5 chart; RL5 capacity). */
export function buildBeyondSinglesTemplate(players = 3): FormatTemplateModel {
  const n = clampPlayerCount(players);
  return {
    playerCount: n,
    rounds: Array.from({ length: n }, (_, i) => {
      const slot = i + 1;
      return {
        id: `beyond-s-round-${slot}`,
        games: [
          game("R", slot, slot, true, {
            gameType: "9",
            raceLength: "5",
          }),
        ],
      };
    }),
  };
}

/**
 * Beyond Teams: one LMS ROUND with enough GAME S matchups for a race-to-N
 * (3-man RR cycles). Remaining games can stay unscored (AllScoresRequired=0).
 */
export function buildBeyondTeamsTemplate(
  players = 3,
  raceTo = 9,
): FormatTemplateModel {
  const n = clampPlayerCount(players);
  const target = Math.max(1, Math.round(raceTo) || 9);
  const cycles = Math.max(1, Math.ceil(target / n));
  const games: FormatGame[] = [];
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    for (let i = 0; i < n; i += 1) {
      const home = i + 1;
      const away = ((i + cycle) % n) + 1;
      games.push(
        game("S", home, away, cycle % 2 === 0, {
          gameType: "0",
          raceLength: "1",
        }),
      );
    }
  }
  return {
    playerCount: n,
    rounds: [{ id: "beyond-t-round-1", games }],
  };
}

/** Paradise / Palm Beach: 5×5 GAME S matrix (total-points round is scoring, not DSL). */
export function buildPalmBeachMatrixTemplate(
  players = 5,
  gameType: "8" | "9" = "8",
): FormatTemplateModel {
  return buildRoundRobinTemplate({
    players,
    rounds: players,
    kind: "S",
    gameType,
  });
}

export function buildDoublesRaceTemplate(raceLength = "17"): FormatTemplateModel {
  return {
    playerCount: 2,
    rounds: [
      {
        id: "doubles-1",
        games: [
          {
            ...emptyGame("D"),
            kind: "R",
            breakPlayers: [
              { side: "H", index: 1 },
              { side: "H", index: 2 },
            ],
            otherPlayers: [
              { side: "A", index: 1 },
              { side: "A", index: 2 },
            ],
            breakTeam: 1,
            gameType: "9",
            raceLength,
            multiplier: "1.00",
          },
        ],
      },
    ],
  };
}

/** Preferred test-division starters first; other sandboxes follow. */
export const SCORESHEET_PRESETS: ScoresheetPreset[] = [
  {
    id: "palm-beach-8ball-5",
    label: "Paradise / Palm Beach (5×5)",
    description: "5 rounds · 5 GAME S each · 8-ball matrix (pts night is scoring)",
    build: () => buildPalmBeachMatrixTemplate(5, "8"),
  },
  {
    id: "tuesday-r6-hot",
    label: "Tuesday 9-Ball (R6 Hot)",
    description: "4 rounds · one GAME R per slot · RL6 / R6 Hot chart",
    build: () => buildTuesdayRacesTemplate(4),
  },
  {
    id: "beyond-singles-hot5",
    label: "Beyond Singles (Hot 5)",
    description: "3 rounds · one GAME R per slot · RL5 / Hot 5 chart",
    build: () => buildBeyondSinglesTemplate(3),
  },
  {
    id: "beyond-teams-rr9",
    label: "Beyond Teams (race to 9)",
    description: "1 round · 9 GAME S RR matchups · first to 9 wins the round",
    build: () => buildBeyondTeamsTemplate(3, 9),
  },
  {
    id: "team-race-5",
    label: "5-Player Team Race",
    description: "5 rounds · 25 GAME S · team race sheet layout",
    build: () =>
      buildRoundRobinTemplate({
        players: 5,
        rounds: 5,
        kind: "S",
        raceSheetBreaks: false,
        gameType: "0",
        raceLength: "1",
      }),
  },
  {
    id: "matrix-9ball-5",
    label: "9-Ball Matrix (5)",
    description: "5 rounds · 5×5 GAME S · 9-ball",
    build: () =>
      buildRoundRobinTemplate({
        players: 5,
        rounds: 5,
        kind: "S",
        gameType: "9",
      }),
  },
  {
    id: "matrix-8ball-5",
    label: "8-Ball Matrix (5)",
    description: "5×5 round-robin matrix with break markers",
    build: () =>
      buildRoundRobinTemplate({
        players: 5,
        rounds: 5,
        kind: "S",
        gameType: "8",
      }),
  },
  {
    id: "matrix-8ball-3",
    label: "8-Ball Matrix (3)",
    description: "3 rounds · 3×3 GAME S",
    build: () =>
      buildRoundRobinTemplate({
        players: 3,
        rounds: 3,
        kind: "S",
        gameType: "8",
      }),
  },
  {
    id: "doubles-race",
    label: "Doubles Race",
    description: "1 round · home pair vs visitor pair · race to 17",
    build: () => buildDoublesRaceTemplate("17"),
  },
];

export function getScoresheetPreset(
  id: ScoresheetPresetId,
): ScoresheetPreset | undefined {
  return SCORESHEET_PRESETS.find((preset) => preset.id === id);
}
