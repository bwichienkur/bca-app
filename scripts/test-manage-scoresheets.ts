/**
 * Integration test: Manage Scoresheets list + clear on Test Bright 8 Ball.
 * Awards points, verifies played, clears via operatorResetMatchResults, verifies open.
 */
import { readFileSync, existsSync } from "fs";

function loadEnv(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (!process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^"|"$/g, "");
  }
}
loadEnv(".env.local");
loadEnv(".env");

const DIV_ID = "62124038-aea7-42f2-8c82-b4a5000d8532";
const DIV_NAME = "Test Bright 8 Ball";

async function main() {
  const op = await import("../src/lib/lms-operator");
  const manage = await import("../src/lib/lms-operator-manage");
  const session = await op.loginLeagueOperator();

  const listed = await manage.operatorListScoresheets(session, DIV_ID);
  console.log(`[list] ${DIV_NAME}: ${listed.length} match(es)`);
  if (listed.length === 0) throw new Error("expected at least one scoresheet");
  for (const m of listed) {
    console.log(
      `  - ${m.homeTeamName} vs ${m.awayTeamName} played=${m.hasBeenPlayed}`,
    );
  }

  const match = listed[0]!;
  const matchId = match.matchId;

  // Ensure clean start
  if (match.hasBeenPlayed) {
    await manage.operatorResetMatchResults(session, matchId);
    console.log("[reset] cleared pre-existing scores");
  }

  // Load team ids from schedule
  const schedule = await manage.operatorListSchedule(session, DIV_ID);
  const sched = schedule.find((m) => m.matchId === matchId);
  if (!sched) throw new Error("schedule row missing for match");

  const award = await op.operatorWebFetch(
    session,
    "/DivisionScoreEntry/AwardPointsBCAPL",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        matchId,
        teamOneId: sched.homeTeamId,
        teamOneGames: 5,
        teamOneRounds: 3,
        teamOneSets: 0,
        teamOnePoints: 0,
        teamOneMatchPoints: 10,
        teamTwoId: sched.awayTeamId,
        teamTwoGames: 2,
        teamTwoRounds: 2,
        teamTwoSets: 0,
        teamTwoPoints: 0,
        teamTwoMatchPoints: 0,
      }),
    },
  );
  if (!award.ok) throw new Error(`award failed: ${award.status}`);
  console.log("[award] points recorded");

  const afterAward = await manage.operatorListScoresheets(session, DIV_ID);
  const awarded = afterAward.find((m) => m.matchId === matchId);
  if (!awarded?.hasBeenPlayed) {
    throw new Error("expected hasBeenPlayed after award");
  }
  console.log("[list] after award: played=true");

  await manage.operatorResetMatchResults(session, matchId);
  console.log("[clear] ResetMatchResultsBCAPL ok");

  let clearFailed = false;
  try {
    await manage.operatorResetMatchResults(session, matchId);
  } catch (error) {
    clearFailed = true;
    console.log(
      "[clear] second clear rejected as expected:",
      error instanceof Error ? error.message : error,
    );
  }
  if (!clearFailed) {
    console.log("[clear] second clear returned ok (acceptable)");
  }

  const afterClear = await manage.operatorListScoresheets(session, DIV_ID);
  const cleared = afterClear.find((m) => m.matchId === matchId);
  if (cleared?.hasBeenPlayed) {
    throw new Error("expected hasBeenPlayed=false after clear");
  }
  console.log("[list] after clear: played=false");
  console.log("PASS");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
