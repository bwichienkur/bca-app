"use client";

import { Fragment, useEffect } from "react";
import {
  FORMAT_GAME_TYPE_OPTIONS,
  summarizeFormatModel,
  type FormatGame,
  type FormatTemplateModel,
} from "@/lib/lms-format-template";
import {
  DEFAULT_RACE_CHART_ID,
  raceChartMeta,
  raceChartRows,
  type RaceChartId,
} from "@/lib/race-charts";

const GAME_MARK_COUNT = 11;

export type SheetLayoutKind =
  | "tuesday-race"
  | "team-race-list"
  | "matrix"
  | "doubles"
  | "generic";

function playerSlotLabel(side: "H" | "A", index: number): string {
  return `${side === "H" ? "Home" : "Away"}${index}`;
}

function refsLabel(
  refs: FormatGame["breakPlayers"],
  fallbackSide: "H" | "A",
): string {
  if (!refs.length) return fallbackSide === "H" ? "Home1" : "Away1";
  return refs.map((ref) => playerSlotLabel(ref.side, ref.index)).join(" / ");
}

function homeIndex(game: FormatGame): number {
  const home =
    game.breakTeam === 1 ? game.breakPlayers[0] : game.otherPlayers[0];
  return home?.side === "H" ? home.index : game.otherPlayers[0]?.index ?? 1;
}

function awayIndex(game: FormatGame): number {
  const away =
    game.breakTeam === 1 ? game.otherPlayers[0] : game.breakPlayers[0];
  return away?.side === "A" ? away.index : game.breakPlayers[0]?.index ?? 1;
}

function isMultiPlayerGame(game: FormatGame): boolean {
  return game.kind === "D" || game.breakPlayers.length > 1 || game.otherPlayers.length > 1;
}

export function detectSheetLayout(model: FormatTemplateModel): SheetLayoutKind {
  const games = model.rounds.flatMap((round) => round.games);
  if (!games.length) return "generic";

  if (games.every(isMultiPlayerGame)) return "doubles";

  const onePerRound = model.rounds.every((round) => round.games.length <= 1);
  const allRace = games.every((game) => game.kind === "R");
  const allSinglesRaceOrS = games.every(
    (game) => game.kind === "R" || game.kind === "S",
  );

  if (onePerRound && allRace) return "tuesday-race";
  if (!onePerRound && allRace) return "team-race-list";
  if (!onePerRound && allSinglesRaceOrS) return "matrix";
  if (onePerRound && allSinglesRaceOrS) return "tuesday-race";
  return "generic";
}

function layoutTitle(kind: SheetLayoutKind, chartId?: RaceChartId): string {
  switch (kind) {
    case "tuesday-race":
      return `Slot races · ${raceChartMeta(chartId ?? DEFAULT_RACE_CHART_ID).label}`;
    case "team-race-list":
      return "Team Race scoresheet";
    case "matrix":
      return "League matrix scoresheet";
    case "doubles":
      return "Doubles race scoresheet";
    default:
      return "Match scoresheet";
  }
}

function BlankLine({ label, wide }: { label: string; wide?: boolean }) {
  return (
    <div className={["flex min-w-0 items-end gap-2", wide ? "flex-1" : ""].join(" ")}>
      <span className="shrink-0 text-[11px] font-semibold text-[var(--ink)]">
        {label}
      </span>
      <span className="mb-0.5 min-w-[5rem] flex-1 border-b border-[var(--ink)]/50" />
    </div>
  );
}

function MarkCells({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <td key={i} className="border border-[var(--ink)]/70 bg-white p-0">
          <div className="mx-auto h-5 w-full min-w-[1rem] sm:h-6" />
        </td>
      ))}
    </>
  );
}

/* ---------- Slot / Tuesday-style race sheet ---------- */

function TuesdayRaceScoresheet({
  model,
  chartId = DEFAULT_RACE_CHART_ID,
}: {
  model: FormatTemplateModel;
  chartId?: RaceChartId;
}) {
  const matchups = model.rounds.flatMap((round) =>
    round.games.map((game) => ({
      key: game.id,
      home: refsLabel(
        game.breakTeam === 1 ? game.breakPlayers : game.otherPlayers,
        "H",
      ),
      away: refsLabel(
        game.breakTeam === 1 ? game.otherPlayers : game.breakPlayers,
        "A",
      ),
    })),
  );
  const chart = raceChartMeta(chartId);
  const chartRows = raceChartRows(chartId);

  return (
    <article className="overflow-hidden rounded-sm border-2 border-[var(--ink)]/85 bg-[#fbf8f1] text-[var(--ink)] shadow-sm">
      <header className="space-y-2.5 border-b-2 border-[var(--ink)]/85 px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
              Slot races · {chart.label}
            </p>
            <p className="mt-0.5 font-[family-name:var(--font-display)] text-lg font-semibold">
              Match scoresheet
            </p>
          </div>
          <p className="max-w-[14rem] text-right text-[10px] text-[var(--muted)]">
            Circle the TOTAL for the match winner
          </p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <BlankLine label="Home Team:" wide />
          <BlankLine label="Date:" />
          <BlankLine label="Visiting Team:" wide />
        </div>
        <p className="rounded-sm border border-[var(--ink)]/20 bg-white/70 px-2 py-1.5 text-[11px] leading-snug">
          <span className="font-semibold">Break:</span> lag for the opening
          break, then <span className="font-semibold">alternate</span>. Mark X
          for each game won. Fill Race to from the {chart.label} chart.
        </p>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse">
          <thead>
            <tr className="bg-[var(--ink)]/[0.08]">
              <th className="border border-[var(--ink)]/70 px-2 py-1.5 text-left text-[10px] font-bold uppercase tracking-[0.1em]">
                Player / Fargo
              </th>
              <th className="border border-[var(--ink)]/70 px-1 py-1.5 text-center text-[10px] font-bold uppercase">
                Race to
              </th>
              <th
                className="border border-[var(--ink)]/70 px-1 py-1.5 text-center text-[10px] font-bold uppercase"
                colSpan={GAME_MARK_COUNT}
              >
                Games (X = win)
              </th>
              <th className="border border-[var(--ink)]/70 px-1 py-1.5 text-center text-[10px] font-bold uppercase">
                Total
              </th>
            </tr>
            <tr className="bg-[var(--ink)]/[0.04]">
              <th className="border border-[var(--ink)]/70" />
              <th className="border border-[var(--ink)]/70" />
              {Array.from({ length: GAME_MARK_COUNT }).map((_, i) => (
                <th
                  key={i}
                  className="border border-[var(--ink)]/70 py-0.5 text-center text-[9px] font-semibold text-[var(--muted)]"
                >
                  {i + 1}
                </th>
              ))}
              <th className="border border-[var(--ink)]/70" />
            </tr>
          </thead>
          <tbody>
            {matchups.map((m, index) => (
              <Fragment key={m.key}>
                {index > 0 ? (
                  <tr aria-hidden>
                    <td
                      colSpan={GAME_MARK_COUNT + 3}
                      className="h-2 border-x border-[var(--ink)]/70 bg-[var(--ink)]/15 p-0"
                    />
                  </tr>
                ) : null}
                <tr className="bg-[var(--ink)]/[0.06]">
                  <td className="border border-[var(--ink)]/70 px-2 py-1">
                    <p className="text-[10px] font-bold uppercase text-[var(--muted)]">
                      Home
                    </p>
                    <p className="text-sm font-semibold">{m.home}</p>
                    <p className="text-[10px] text-[var(--muted)]">Fargo ______</p>
                  </td>
                  <td className="border border-[var(--ink)]/70 px-1">
                    <div className="mx-auto h-7 w-8 border border-[var(--ink)]/40 bg-white" />
                  </td>
                  <MarkCells count={GAME_MARK_COUNT} />
                  <td className="border border-[var(--ink)]/70 px-1">
                    <div className="mx-auto h-7 w-8 border border-[var(--ink)]/40 bg-white" />
                  </td>
                </tr>
                <tr>
                  <td className="border border-[var(--ink)]/70 px-2 py-1">
                    <p className="text-[10px] font-bold uppercase text-[var(--muted)]">
                      Visitor
                    </p>
                    <p className="text-sm font-semibold">{m.away}</p>
                    <p className="text-[10px] text-[var(--muted)]">Fargo ______</p>
                  </td>
                  <td className="border border-[var(--ink)]/70 px-1">
                    <div className="mx-auto h-7 w-8 border border-[var(--ink)]/40 bg-white" />
                  </td>
                  <MarkCells count={GAME_MARK_COUNT} />
                  <td className="border border-[var(--ink)]/70 px-1">
                    <div className="mx-auto h-7 w-8 border border-[var(--ink)]/40 bg-white" />
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="grid gap-3 border-t-2 border-[var(--ink)]/85 px-3 py-3 sm:grid-cols-2 sm:px-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em]">
            Race Chart — {chart.label}
          </p>
          <table className="mt-2 w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-[var(--ink)]/[0.06]">
                <th className="border border-[var(--ink)]/50 px-2 py-1 text-left">
                  Rating dif
                </th>
                <th className="border border-[var(--ink)]/50 px-2 py-1 text-left">
                  Play this
                </th>
              </tr>
            </thead>
            <tbody>
              {chartRows.map((row) => (
                <tr key={row.ratingDiff}>
                  <td className="border border-[var(--ink)]/40 px-2 py-0.5">
                    {row.ratingDiff}
                  </td>
                  <td className="border border-[var(--ink)]/40 px-2 py-0.5 font-semibold">
                    {row.playThis}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em]">
            Match totals
          </p>
          <div className="flex items-end justify-between gap-2">
            <span className="text-[12px] font-semibold">Home matches won</span>
            <span className="h-8 w-12 border border-[var(--ink)]/50 bg-white" />
          </div>
          <div className="flex items-end justify-between gap-2">
            <span className="text-[12px] font-semibold">
              Visiting matches won
            </span>
            <span className="h-8 w-12 border border-[var(--ink)]/50 bg-white" />
          </div>
          <BlankLine label="Home sig:" wide />
          <BlankLine label="Visitor sig:" wide />
        </div>
      </footer>
    </article>
  );
}

/* ---------- 5-player team race list ---------- */

function TeamRaceListScoresheet({ model }: { model: FormatTemplateModel }) {
  const maxRace = model.rounds
    .flatMap((r) => r.games)
    .reduce((max, game) => Math.max(max, Number(game.raceLength) || 0), 0);
  let gameNo = 0;
  const rows = model.rounds.flatMap((round, roundIndex) =>
    round.games.map((game) => {
      gameNo += 1;
      const h = homeIndex(game);
      const a = awayIndex(game);
      return {
        key: game.id,
        gameNo,
        round: roundIndex + 1,
        homePos: h,
        awayPos: a,
        homeBreaks: game.breakTeam === 1,
      };
    }),
  );

  return (
    <article className="overflow-hidden rounded-sm border-2 border-[var(--ink)]/85 bg-[#fbf8f1] text-[var(--ink)] shadow-sm">
      <header className="space-y-2 border-b-2 border-[var(--ink)]/85 px-3 py-3 sm:px-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
          {model.playerCount}-Player Team Race
          {maxRace > 0 ? ` · Max Race to ${maxRace}` : ""}
        </p>
        <p className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Match scoresheet
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <BlankLine label="Division:" wide />
          <BlankLine label="Date:" />
        </div>
        <p className="text-[11px] text-[var(--muted)]">
          Superscript <span className="font-semibold text-[var(--ink)]">B</span>{" "}
          = break. Every home player faces every visitor once.
        </p>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-[11px]">
          <thead>
            <tr className="bg-[var(--ink)]/[0.08]">
              <th className="border border-[var(--ink)]/70 px-1 py-1">Game</th>
              <th className="border border-[var(--ink)]/70 px-1 py-1">Rnd</th>
              <th className="border border-[var(--ink)]/70 px-1 py-1">Pos</th>
              <th className="border border-[var(--ink)]/70 px-2 py-1 text-left">
                Home name
              </th>
              <th className="border border-[var(--ink)]/70 px-1 py-1">Fargo</th>
              <th className="border border-[var(--ink)]/70 px-1 py-1">W/L</th>
              <th className="border border-[var(--ink)]/70 px-1 py-1">Score</th>
              <th className="border border-[var(--ink)]/70 px-1 py-1">Pos</th>
              <th className="border border-[var(--ink)]/70 px-2 py-1 text-left">
                Visitor name
              </th>
              <th className="border border-[var(--ink)]/70 px-1 py-1">Fargo</th>
              <th className="border border-[var(--ink)]/70 px-1 py-1">W/L</th>
              <th className="border border-[var(--ink)]/70 px-1 py-1">Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                className={row.round % 2 === 0 ? "bg-[var(--ink)]/[0.04]" : ""}
              >
                <td className="border border-[var(--ink)]/60 px-1 py-1 text-center tabular-nums">
                  {row.gameNo}
                </td>
                <td className="border border-[var(--ink)]/60 px-1 py-1 text-center">
                  {row.round}
                </td>
                <td className="border border-[var(--ink)]/60 px-1 py-1 text-center font-semibold">
                  {row.homePos}
                  {row.homeBreaks ? (
                    <sup className="ml-0.5 font-bold text-[var(--felt-deep)]">
                      B
                    </sup>
                  ) : null}
                </td>
                <td className="border border-[var(--ink)]/60 px-2 py-1">
                  Home{row.homePos}
                </td>
                <td className="border border-[var(--ink)]/60 px-1 py-1">
                  <div className="mx-auto h-5 w-8 border border-[var(--ink)]/30 bg-white" />
                </td>
                <td className="border border-[var(--ink)]/60 px-1 py-1">
                  <div className="mx-auto h-5 w-6 border border-[var(--ink)]/30 bg-white" />
                </td>
                <td className="border border-[var(--ink)]/60 px-1 py-1">
                  <div className="mx-auto h-5 w-8 border border-[var(--ink)]/30 bg-white" />
                </td>
                <td className="border border-[var(--ink)]/60 px-1 py-1 text-center font-semibold">
                  {row.awayPos}
                  {!row.homeBreaks ? (
                    <sup className="ml-0.5 font-bold text-[var(--felt-deep)]">
                      B
                    </sup>
                  ) : null}
                </td>
                <td className="border border-[var(--ink)]/60 px-2 py-1">
                  Away{row.awayPos}
                </td>
                <td className="border border-[var(--ink)]/60 px-1 py-1">
                  <div className="mx-auto h-5 w-8 border border-[var(--ink)]/30 bg-white" />
                </td>
                <td className="border border-[var(--ink)]/60 px-1 py-1">
                  <div className="mx-auto h-5 w-6 border border-[var(--ink)]/30 bg-white" />
                </td>
                <td className="border border-[var(--ink)]/60 px-1 py-1">
                  <div className="mx-auto h-5 w-8 border border-[var(--ink)]/30 bg-white" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="grid gap-3 border-t-2 border-[var(--ink)]/85 px-3 py-3 sm:grid-cols-2 sm:px-4">
        <div className="space-y-2 text-[12px]">
          <div className="flex flex-wrap items-end gap-3">
            <BlankLine label="Home Fargo Rate:" wide />
            <BlankLine label="Race to:" />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <BlankLine label="Visitor Fargo Rate:" wide />
            <BlankLine label="Race to:" />
          </div>
        </div>
        <div className="space-y-2">
          <BlankLine label="Home captain:" wide />
          <BlankLine label="Visitor captain:" wide />
        </div>
      </footer>
    </article>
  );
}

/* ---------- Matrix (8-ball / 9-ball points nights) ---------- */

function MatrixScoresheet({ model }: { model: FormatTemplateModel }) {
  const n = model.playerCount;
  const roundCount = model.rounds.length;
  const gt = model.rounds[0]?.games[0]?.gameType;
  const gtLabel =
    FORMAT_GAME_TYPE_OPTIONS.find((row) => row.value === gt)?.label ?? "League";

  /** For home player h (1..n), round r → away opponent from template. */
  const opponentFor = (home: number, roundIndex: number): {
    away: number;
    homeBreaks: boolean;
  } => {
    const game =
      model.rounds[roundIndex]?.games.find((g) => homeIndex(g) === home) ??
      model.rounds[roundIndex]?.games[home - 1];
    if (!game) {
      return {
        away: ((home - 1 + roundIndex) % n) + 1,
        homeBreaks: roundIndex % 2 === 0,
      };
    }
    return { away: awayIndex(game), homeBreaks: game.breakTeam === 1 };
  };

  const TeamTable = ({
    side,
  }: {
    side: "home" | "visitor";
  }) => {
    const title = side === "home" ? "Home Team" : "Visiting Team";
    return (
      <div className="min-w-0 overflow-hidden rounded-sm border border-[var(--ink)]/70">
        <div className="border-b border-[var(--ink)]/70 bg-[var(--ink)]/[0.06] px-2 py-1.5">
          <BlankLine label={`${title}:`} wide />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-[var(--ink)]/[0.04]">
                <th className="border border-[var(--ink)]/50 px-1 py-1">#</th>
                <th className="border border-[var(--ink)]/50 px-1 py-1">Rating</th>
                <th className="border border-[var(--ink)]/50 px-2 py-1 text-left">
                  Name
                </th>
                {Array.from({ length: roundCount }).map((_, r) => (
                  <th
                    key={r}
                    className="border border-[var(--ink)]/50 px-1 py-1 text-center"
                  >
                    {r + 1}
                  </th>
                ))}
                <th className="border border-[var(--ink)]/50 px-1 py-1">Total</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: n }).map((_, i) => {
                const slot = i + 1;
                const displayNo = side === "home" ? slot : n + slot;
                const name =
                  side === "home" ? `Home${slot}` : `Away${slot}`;
                return (
                  <tr key={displayNo}>
                    <td className="border border-[var(--ink)]/50 px-1 py-1 text-center font-semibold">
                      {displayNo}
                    </td>
                    <td className="border border-[var(--ink)]/50 px-1 py-1">
                      <div className="mx-auto h-5 w-8 border border-[var(--ink)]/30 bg-white" />
                    </td>
                    <td className="border border-[var(--ink)]/50 px-2 py-1 font-medium">
                      {name}
                    </td>
                    {Array.from({ length: roundCount }).map((_, r) => {
                      const { away, homeBreaks } = opponentFor(slot, r);
                      const homeNo = slot;
                      const awayNo = n + away;
                      const label =
                        side === "home"
                          ? `${homeNo}-${awayNo}`
                          : `${awayNo}-${homeNo}`;
                      const showsB =
                        side === "home" ? homeBreaks : !homeBreaks;
                      // Visitor row uses visitor slot as "home" of that side's perspective
                      const visitorMatch =
                        side === "visitor"
                          ? (() => {
                              // Find game where awayIndex === slot
                              const game = model.rounds[r]?.games.find(
                                (g) => awayIndex(g) === slot,
                              );
                              if (!game) {
                                return {
                                  label: `${n + slot}-${((slot - 1 - r + n * 10) % n) + 1}`,
                                  showsB: r % 2 === 1,
                                };
                              }
                              const h = homeIndex(game);
                              return {
                                label: `${n + slot}-${h}`,
                                showsB: game.breakTeam === 2,
                              };
                            })()
                          : { label, showsB };
                      const cell = side === "home" ? { label, showsB } : visitorMatch;
                      return (
                        <td
                          key={r}
                          className="border border-[var(--ink)]/50 px-1 py-1 text-center tabular-nums"
                        >
                          <span className="relative inline-block min-w-[2.2rem]">
                            {cell.showsB ? (
                              <span className="absolute -top-1 left-1/2 -translate-x-1/2 text-[8px] font-bold text-[var(--felt-deep)]">
                                B
                              </span>
                            ) : null}
                            <span className="inline-block pt-1">{cell.label}</span>
                          </span>
                          <div className="mx-auto mt-0.5 h-4 w-7 border border-[var(--ink)]/25 bg-white" />
                        </td>
                      );
                    })}
                    <td className="border border-[var(--ink)]/50 px-1 py-1">
                      <div className="mx-auto h-5 w-8 border border-[var(--ink)]/30 bg-white" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="space-y-1.5 border-t border-[var(--ink)]/50 px-2 py-2 text-[10px]">
          <p className="font-semibold">Total team rating ______</p>
          <p className="text-[var(--muted)]">
            Subtract lower team rating from higher to determine round handicap
          </p>
          <div className="grid grid-cols-[auto_repeat(6,minmax(0,1fr))] gap-1 pt-1">
            <span className="font-semibold">Score</span>
            {Array.from({ length: roundCount + 1 }).map((_, i) => (
              <div
                key={`s-${i}`}
                className="h-5 border border-[var(--ink)]/30 bg-white"
              />
            ))}
            <span className="font-semibold">Handicap</span>
            {Array.from({ length: roundCount + 1 }).map((_, i) => (
              <div
                key={`h-${i}`}
                className="h-5 border border-[var(--ink)]/30 bg-white"
              />
            ))}
            <span className="font-semibold">Total</span>
            {Array.from({ length: roundCount + 1 }).map((_, i) => (
              <div
                key={`t-${i}`}
                className="h-5 border border-[var(--ink)]/30 bg-white"
              />
            ))}
            <span className="font-semibold">Rounds won</span>
            {Array.from({ length: roundCount + 1 }).map((_, i) => (
              <div
                key={`w-${i}`}
                className="flex h-5 items-center justify-center border border-[var(--ink)]/40 font-bold"
              >
                W
              </div>
            ))}
          </div>
          <BlankLine label="Captain:" wide />
        </div>
      </div>
    );
  };

  return (
    <article className="overflow-hidden rounded-sm border-2 border-[var(--ink)]/85 bg-[#fbf8f1] text-[var(--ink)] shadow-sm">
      <header className="space-y-2 border-b-2 border-[var(--ink)]/85 px-3 py-3 sm:px-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
          {gtLabel} League Score Sheet
        </p>
        <p className="font-[family-name:var(--font-display)] text-lg font-semibold">
          {n}-player matrix · {roundCount} rounds
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <BlankLine label="Division:" wide />
          <BlankLine label="Date:" />
        </div>
        <p className="text-[11px] text-[var(--muted)]">
          Cell shows matchup numbers · <span className="font-semibold">B</span>{" "}
          = break · score box under each matchup
        </p>
      </header>
      <div className="grid gap-3 p-3 lg:grid-cols-2">
        <TeamTable side="home" />
        <TeamTable side="visitor" />
      </div>
    </article>
  );
}

/* ---------- Doubles race ---------- */

function DoublesScoresheet({ model }: { model: FormatTemplateModel }) {
  const game = model.rounds[0]?.games[0];
  const raceTo = Number(game?.raceLength) || 17;
  const marks = Math.min(17, Math.max(raceTo, 11));
  const home = game
    ? refsLabel(
        game.breakTeam === 1 ? game.breakPlayers : game.otherPlayers,
        "H",
      )
    : "Home1 / Home2";
  const away = game
    ? refsLabel(
        game.breakTeam === 1 ? game.otherPlayers : game.breakPlayers,
        "A",
      )
    : "Away1 / Away2";

  return (
    <article className="overflow-hidden rounded-sm border-2 border-[var(--ink)]/85 bg-[#fbf8f1] text-[var(--ink)] shadow-sm">
      <header className="space-y-2 border-b-2 border-[var(--ink)]/85 px-3 py-3 sm:px-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
          Doubles League Score Sheet
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <BlankLine label="Division:" wide />
          <BlankLine label="Date:" />
        </div>
      </header>

      <div className="overflow-x-auto p-3">
        <table className="w-full min-w-[36rem] border-collapse text-[11px]">
          <thead>
            <tr className="bg-[var(--ink)]/[0.08]">
              <th className="border border-[var(--ink)]/70 px-2 py-1.5 text-left">
                Team
              </th>
              <th className="border border-[var(--ink)]/70 px-1 py-1.5">Race</th>
              {Array.from({ length: marks }).map((_, i) => (
                <th
                  key={i}
                  className="border border-[var(--ink)]/70 px-0 py-1 text-center text-[9px]"
                >
                  G{i + 1}
                </th>
              ))}
              <th className="border border-[var(--ink)]/70 px-1 py-1.5">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-[var(--ink)]/70 px-2 py-2">
                <p className="text-[10px] font-bold uppercase text-[var(--muted)]">
                  (H)
                </p>
                <p className="font-semibold">{home}</p>
              </td>
              <td className="border border-[var(--ink)]/70 px-1">
                <div className="mx-auto h-7 w-8 border border-[var(--ink)]/40 bg-white" />
              </td>
              <MarkCells count={marks} />
              <td className="border border-[var(--ink)]/70 px-1">
                <div className="mx-auto h-7 w-8 border border-[var(--ink)]/40 bg-white" />
              </td>
            </tr>
            <tr className="bg-[var(--ink)]/[0.06]">
              <td className="border border-[var(--ink)]/70 px-2 py-2">
                <p className="text-[10px] font-bold uppercase text-[var(--muted)]">
                  (V)
                </p>
                <p className="font-semibold">{away}</p>
              </td>
              <td className="border border-[var(--ink)]/70 px-1">
                <div className="mx-auto h-7 w-8 border border-[var(--ink)]/40 bg-white" />
              </td>
              <MarkCells count={marks} />
              <td className="border border-[var(--ink)]/70 px-1">
                <div className="mx-auto h-7 w-8 border border-[var(--ink)]/40 bg-white" />
              </td>
            </tr>
          </tbody>
        </table>
        <div className="mt-3 space-y-1 text-[12px]">
          <BlankLine label="Home team total match points:" wide />
          <BlankLine label="Visiting team total match points:" wide />
        </div>
      </div>

      <section className="border-t-2 border-[var(--ink)]/85 px-3 py-3 sm:px-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em]">
          9 Ball — One Game (11 total points)
        </p>
        <table className="mt-2 w-full max-w-lg border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="border border-[var(--ink)]/50 px-2 py-1" />
              {Array.from({ length: 11 }).map((_, i) => (
                <th
                  key={i}
                  className="border border-[var(--ink)]/50 px-0 py-1 text-center text-[9px]"
                >
                  {i + 1}
                </th>
              ))}
              <th className="border border-[var(--ink)]/50 px-1 py-1">Total</th>
            </tr>
          </thead>
          <tbody>
            {(["H", "V"] as const).map((side) => (
              <tr key={side} className={side === "V" ? "bg-[var(--ink)]/[0.06]" : ""}>
                <td className="border border-[var(--ink)]/50 px-2 py-1 font-semibold">
                  ({side})
                </td>
                <MarkCells count={11} />
                <td className="border border-[var(--ink)]/50 px-1">
                  <div className="mx-auto h-5 w-8 border border-[var(--ink)]/30 bg-white" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 space-y-2">
          <BlankLine label="Home signature:" wide />
          <BlankLine label="Visitor signature:" wide />
        </div>
      </section>
    </article>
  );
}

/* ---------- Generic fallback ---------- */

function GenericScoresheet({ model }: { model: FormatTemplateModel }) {
  return (
    <article className="overflow-hidden rounded-sm border-2 border-[var(--ink)]/80 bg-[#fbf8f1] p-4 text-[var(--ink)]">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
        Generic scoresheet
      </p>
      <p className="mt-1 font-[family-name:var(--font-display)] text-lg font-semibold">
        Home vs Away · {summarizeFormatModel(model)}
      </p>
      <ul className="mt-3 space-y-2 text-sm">
        {model.rounds.map((round, ri) => (
          <li
            key={round.id}
            className="rounded-sm border border-[var(--ink)]/25 bg-white/70 px-3 py-2"
          >
            <p className="text-[11px] font-bold uppercase text-[var(--muted)]">
              Round {ri + 1}
            </p>
            <ul className="mt-1 space-y-1">
              {round.games.map((game, gi) => (
                <li key={game.id}>
                  G{gi + 1}:{" "}
                  {refsLabel(
                    game.breakTeam === 1
                      ? game.breakPlayers
                      : game.otherPlayers,
                    "H",
                  )}{" "}
                  vs{" "}
                  {refsLabel(
                    game.breakTeam === 1
                      ? game.otherPlayers
                      : game.breakPlayers,
                    "A",
                  )}{" "}
                  · {game.kind}
                  {game.breakTeam === 1 ? " · Home breaks" : " · Away breaks"}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </article>
  );
}

function renderLayout(
  model: FormatTemplateModel,
  kind: SheetLayoutKind,
  chartId?: RaceChartId,
) {
  switch (kind) {
    case "tuesday-race":
      return <TuesdayRaceScoresheet model={model} chartId={chartId} />;
    case "team-race-list":
      return <TeamRaceListScoresheet model={model} />;
    case "matrix":
      return <MatrixScoresheet model={model} />;
    case "doubles":
      return <DoublesScoresheet model={model} />;
    default:
      return <GenericScoresheet model={model} />;
  }
}

export function FormatScoresheetPreview({
  model,
  open,
  onClose,
  title = "Scoresheet preview",
  raceChartId,
}: {
  model: FormatTemplateModel;
  open: boolean;
  onClose: () => void;
  title?: string;
  raceChartId?: RaceChartId;
}) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const kind = detectSheetLayout(model);
  const summary = summarizeFormatModel(model);
  const chartId = raceChartId ?? DEFAULT_RACE_CHART_ID;

  return (
    <div
      className="fixed inset-0 z-[90] overflow-y-auto bg-black/55"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex min-h-full justify-center px-3 py-6">
        <div
          className="w-full max-w-5xl overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] bg-[linear-gradient(145deg,rgba(29,110,158,0.98),rgba(19,78,115,0.96))] px-4 py-3 text-white">
            <div className="min-w-0">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
                {title}
              </h2>
              <p className="mt-0.5 text-xs text-white/75">
                {layoutTitle(kind, chartId)} · {summary}
              </p>
            </div>
            <button
              type="button"
              className="rounded-[var(--radius)] border border-white/25 bg-white/10 px-3 py-1.5 text-sm font-semibold text-white"
              onClick={onClose}
            >
              Close
            </button>
          </div>
          <div className="max-h-[min(84dvh,58rem)] overflow-y-auto bg-[color-mix(in_srgb,var(--surface)_70%,#f3efe6)] p-3 sm:p-4">
            {renderLayout(model, kind, chartId)}
          </div>
        </div>
      </div>
    </div>
  );
}
