/**
 * Palm Beach–style scoresheet sandbox presets → FormatTemplateModel / DSL.
 */

import {
  clampPlayerCount,
  emptyGame,
  type FormatGame,
  type FormatTemplateModel,
} from "@/lib/lms-format-template";

export type ScoresheetPresetId =
  | "tuesday-r6-hot"
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

export const SCORESHEET_PRESETS: ScoresheetPreset[] = [
  {
    id: "tuesday-r6-hot",
    label: "Tuesday 9-Ball (R6 Hot)",
    description: "4 singles races · lag then alternate · R6 Hot chart",
    build: () => buildTuesdayRacesTemplate(4),
  },
  {
    id: "team-race-5",
    label: "5-Player Team Race",
    description: "25 races · max race to 13 · round-robin list",
    build: () =>
      buildRoundRobinTemplate({
        players: 5,
        rounds: 5,
        kind: "R",
        raceSheetBreaks: true,
        gameType: "0",
        raceLength: "13",
      }),
  },
  {
    id: "matrix-9ball-5",
    label: "9-Ball Matrix (5)",
    description: "Side-by-side home/visitor · rounds 1–5 · points night",
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
    description: "3×3 round-robin · home/visitor tables",
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
    description: "Home pair vs visitor pair · race track to 17",
    build: () => buildDoublesRaceTemplate("17"),
  },
];

export function getScoresheetPreset(
  id: ScoresheetPresetId,
): ScoresheetPreset | undefined {
  return SCORESHEET_PRESETS.find((preset) => preset.id === id);
}
