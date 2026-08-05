import {
  saveAppUser,
  type AppUser,
  type LinkedDigitalPoolAccount,
} from "@/lib/app-auth";
import {
  digitalPoolGraphql,
  refreshDigitalPoolToken,
} from "@/lib/digital-pool";
import type {
  BracketFormat,
  GameType,
  HandicapSystem,
  Tournament,
  TournamentRegistration,
} from "@/lib/tournaments/types";

export type DigitalPoolPushResult = {
  tournamentId: number;
  slug: string;
  playerCount: number;
  tableCount: number;
  matchCount: number;
  builderUrl: string;
  publicUrl: string;
};

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "tableside-event"
  );
}

function nextPowerOfTwo(n: number): number {
  let p = 2;
  while (p < n) p *= 2;
  return Math.min(512, p);
}

function mapGameType(game: GameType): string {
  switch (game) {
    case "8-ball":
      return "8_ball";
    case "9-ball":
      return "9_ball";
    case "10-ball":
      return "10_ball";
    default:
      return "mixed";
  }
}

function mapPlayerType(eventType: Tournament["eventType"]): string {
  if (eventType === "scotch-doubles") return "scotch-doubles";
  if (eventType === "teams") return "teams";
  return "singles";
}

function mapTournamentType(format: BracketFormat): string {
  if (format === "single-elimination") return "single_elimination";
  if (format === "round-robin") return "round_robin";
  return "double_elimination";
}

function mapHandicap(system: HandicapSystem): string {
  if (system === "fargo-hot") return "fargo_hot_column";
  if (system === "fargo-medium") return "fargo_hot_column";
  if (system === "fargo-mild") return "fargo_hot_column";
  if (system === "none") return "none";
  return "fargo_hot_column";
}

function mapRuleFormat(preset: Tournament["rulesetPreset"]): string {
  if (preset === "wpa") return "wpa";
  if (preset === "house") return "local";
  return "bca";
}

function mapBreakFormat(format: Tournament["breakFormat"]): string {
  if (format === "loser-break") return "loser_break";
  if (format === "alternate-break") return "alternate_break";
  return "winner_break";
}

function mapDrawType(drawType: Tournament["drawType"]): string {
  if (drawType === "random") return "random";
  if (drawType === "custom") return "custom";
  return "seeded";
}

function mapTableSize(size: Tournament["tableSize"]): string | null {
  if (size === "7ft") return "7 Foot";
  if (size === "8ft") return "8 Foot";
  if (size === "9ft") return "9 Foot";
  return null;
}

/** Players to send: checked-in + paid approved first; else all approved. */
export function selectFieldForPush(
  registrations: TournamentRegistration[],
): TournamentRegistration[] {
  const approved = registrations.filter((r) => r.status === "approved");
  const ready = approved.filter((r) => r.checkedIn && r.paid);
  return (ready.length >= 2 ? ready : approved).slice().sort((a, b) => {
    const ra = a.ratingAtSignup ?? -1;
    const rb = b.ratingAtSignup ?? -1;
    return rb - ra;
  });
}

async function ensureDigitalPoolAuth(
  appUser: AppUser,
): Promise<{ token: string; link: LinkedDigitalPoolAccount }> {
  const link = appUser.digitalPool;
  if (!link?.refreshToken) {
    throw new Error(
      "Connect Digital Pool in Settings before pushing a bracket.",
    );
  }

  const freshEnough =
    link.idToken &&
    link.idTokenExpiresAt &&
    link.idTokenExpiresAt - Date.now() > 60_000;

  if (freshEnough && link.idToken) {
    return { token: link.idToken, link };
  }

  const auth = await refreshDigitalPoolToken(link.refreshToken);
  const nextLink: LinkedDigitalPoolAccount = {
    ...link,
    refreshToken: auth.refreshToken,
    idToken: auth.idToken,
    idTokenExpiresAt: auth.expiresAt,
  };
  await saveAppUser({ ...appUser, digitalPool: nextLink });
  return { token: auth.idToken, link: nextLink };
}

type SeededPlayer = {
  id: number;
  name: string;
  seed: number;
  skill_level: number | null;
};

/** Pair seeds for first round: 1 vs N, 2 vs N-1, … with byes as null challenger2. */
function buildFirstRoundMatches(
  players: SeededPlayer[],
  bracketSize: number,
  tournamentId: number,
): Array<Record<string, unknown>> {
  const slots: Array<SeededPlayer | null> = [...players];
  while (slots.length < bracketSize) slots.push(null);

  // Standard seeding positions for power-of-two brackets.
  const order = seedingOrder(bracketSize);
  const placed = order.map((seedNum) => {
    const player = slots.find((p) => p && p.seed === seedNum) ?? null;
    return player;
  });

  const matches: Array<Record<string, unknown>> = [];
  let matchNumber = 1;
  for (let i = 0; i < placed.length; i += 2) {
    const a = placed[i];
    const b = placed[i + 1];
    const isBye = !a || !b;
    matches.push({
      tournament_id: tournamentId,
      identifier: `W${matchNumber}`,
      round: 1,
      match_number: matchNumber,
      stage_number: 1,
      status: isBye && (a || b) ? "COMPLETED" : "NOT_STARTED",
      is_bye: isBye && Boolean(a || b),
      challenger1_id: a?.id ?? null,
      challenger1_name: a?.name ?? null,
      challenger1_seed: a?.seed ?? null,
      challenger1_skill_level: a?.skill_level ?? null,
      challenger1_is_winner: isBye && Boolean(a) ? true : null,
      challenger2_id: b?.id ?? null,
      challenger2_name: b?.name ?? null,
      challenger2_seed: b?.seed ?? null,
      challenger2_skill_level: b?.skill_level ?? null,
      challenger2_is_winner: isBye && Boolean(b) && !a ? true : null,
    });
    matchNumber += 1;
  }
  return matches;
}

function seedingOrder(bracketSize: number): number[] {
  // Build classic bracket seed order: [1, N, N/2+1, N/2, ...]
  let seeds = [1, 2];
  while (seeds.length < bracketSize) {
    const next: number[] = [];
    const size = seeds.length * 2;
    for (const s of seeds) {
      next.push(s);
      next.push(size + 1 - s);
    }
    seeds = next;
  }
  return seeds;
}

export async function pushTournamentToDigitalPool(input: {
  appUser: AppUser;
  tournament: Tournament;
  registrations: TournamentRegistration[];
  tableCount?: number;
}): Promise<DigitalPoolPushResult> {
  const { appUser, tournament } = input;
  const field = selectFieldForPush(input.registrations);
  if (field.length < 2) {
    throw new Error(
      "Need at least 2 approved players (preferably checked in and paid) before pushing to Digital Pool.",
    );
  }
  if (tournament.eventType !== "singles") {
    // Captains only for v1 — still useful; partners aren't modeled as DP doubles yet.
  }

  const { token, link } = await ensureDigitalPoolAuth(appUser);
  const organizerId = link.userId;
  const bracketSize = nextPowerOfTwo(field.length);
  const tableCount = Math.min(
    16,
    Math.max(2, input.tableCount ?? Math.ceil(field.length / 2)),
  );
  const slug = `${slugify(tournament.title)}-${Date.now().toString(36)}`;
  const start = tournament.startsAt;
  const end =
    tournament.checkInAt && tournament.checkInAt > tournament.startsAt
      ? new Date(
          new Date(tournament.startsAt).getTime() + 8 * 60 * 60 * 1000,
        ).toISOString()
      : new Date(
          new Date(tournament.startsAt).getTime() + 8 * 60 * 60 * 1000,
        ).toISOString();

  const entryFee =
    tournament.entryFeeCents > 0
      ? String(Math.round(tournament.entryFeeCents / 100))
      : "";
  const addedMoney = String(
    Math.max(0, Math.round((tournament.addedMoneyCents ?? 0) / 100)),
  );

  const created = await digitalPoolGraphql<{
    insert_tournaments: {
      returning: Array<{ id: number; name: string; slug: string }>;
    };
  }>(
    token,
    `
    mutation insert_tournaments($objects: [tournaments_insert_input!]!) {
      insert_tournaments(objects: $objects) {
        returning { id name slug }
      }
    }
    `,
    {
      objects: [
        {
          name: tournament.title,
          slug,
          description: tournament.description || null,
          organizer_id: organizerId,
          director_id: organizerId,
          start_date_time: start,
          end_date_time: end,
          player_type: mapPlayerType(tournament.eventType),
          tournament_type: mapTournamentType(tournament.bracketFormat),
          tournament_format: "standard",
          participant_times_played: 1,
          players_ranked_by: "match_wins",
          handicap_format: mapHandicap(tournament.handicapSystem),
          rule_format: mapRuleFormat(tournament.rulesetPreset),
          break_format: mapBreakFormat(tournament.breakFormat),
          game_type: mapGameType(tournament.gameType),
          max_players: bracketSize,
          max_tables: tableCount,
          rebuys_allowed: false,
          entry_fee: entryFee,
          added_money: addedMoney,
          payout_type: "custom",
          draw_type: mapDrawType(tournament.drawType),
          rating_system: "fargo",
          use_text_messaging: false,
          is_public: false,
          is_featured: false,
          tournament_stage_format: "single",
          rsvp_allowed: false,
          enable_shot_clock: false,
          show_player_skill_levels: true,
          show_player_races: true,
          show_unconfirmed_players: true,
          winners_race_to: tournament.winnersRaceTo ?? 5,
          losers_race_to: tournament.losersRaceTo ?? 4,
          consolidation_finals: tournament.bracketFormat === "double-elimination",
          players_per_table: 2,
          default_chip_amount: 3,
          redraw_every_round: false,
          autopilot_mode: false,
          autopilot_auto_approve: true,
          autopilot_auto_assign_tables: false,
          autopilot_auto_redraw: true,
          signup_cutoff_time: "start_time",
          status: "NOT_STARTED",
          progress: "0",
          is_fargo_reported: tournament.reportedToFargo,
          default_team_size:
            tournament.eventType === "singles" ? 1 : tournament.teamSize,
        },
      ],
    },
  );

  const dpTournament = created.insert_tournaments.returning[0];
  if (!dpTournament) {
    throw new Error("Digital Pool did not return a tournament id.");
  }

  const playerObjects = field.map((reg, index) => ({
    tournament_id: dpTournament.id,
    name: reg.displayName,
    email: reg.email,
    phone_number: reg.phone,
    skill_level: reg.ratingAtSignup,
    status: "CONFIRMED",
    seed: index + 1,
  }));

  const playersRes = await digitalPoolGraphql<{
    insert_tournament_players: {
      returning: Array<{
        id: number;
        name: string;
        seed: number | null;
        skill_level: number | null;
      }>;
    };
  }>(
    token,
    `
    mutation insert_tournament_players($objects: [tournament_players_insert_input!]!) {
      insert_tournament_players(objects: $objects) {
        returning { id name seed skill_level }
      }
    }
    `,
    { objects: playerObjects },
  );

  const seeded: SeededPlayer[] =
    playersRes.insert_tournament_players.returning.map((p, i) => ({
      id: p.id,
      name: p.name,
      seed: p.seed ?? i + 1,
      skill_level: p.skill_level,
    }));

  const tableSize = mapTableSize(tournament.tableSize);
  const tableObjects = Array.from({ length: tableCount }, (_, i) => ({
    tournament_id: dpTournament.id,
    label: `Table ${i + 1}`,
    slug: `table-${i + 1}-${dpTournament.id}`,
    status: "OPEN",
    ...(tableSize ? { size: tableSize } : {}),
  }));

  await digitalPoolGraphql(
    token,
    `
    mutation insert_pool_tables($objects: [pool_tables_insert_input!]!) {
      insert_pool_tables(objects: $objects) {
        returning { id }
      }
    }
    `,
    { objects: tableObjects },
  );

  const matches = buildFirstRoundMatches(
    seeded,
    bracketSize,
    dpTournament.id,
  );

  await digitalPoolGraphql(
    token,
    `
    mutation insert_tournament_brackets($objects: [tournament_brackets_insert_input!]!) {
      insert_tournament_brackets(objects: $objects) {
        returning { id }
      }
    }
    `,
    { objects: matches },
  );

  return {
    tournamentId: dpTournament.id,
    slug: dpTournament.slug,
    playerCount: seeded.length,
    tableCount,
    matchCount: matches.length,
    builderUrl: `https://digitalpool.com/tournament-builder/${dpTournament.slug}`,
    publicUrl: `https://digitalpool.com/tournaments/${dpTournament.slug}`,
  };
}
