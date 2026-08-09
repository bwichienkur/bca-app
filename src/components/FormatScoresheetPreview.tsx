"use client";

import { Fragment, useEffect } from "react";
import {
  FORMAT_GAME_TYPE_OPTIONS,
  FORMAT_MULTIPLIER_OPTIONS,
  summarizeFormatModel,
  type FormatGame,
  type FormatGameKind,
  type FormatPlayerRef,
  type FormatTemplateModel,
} from "@/lib/lms-format-template";
import { r6HotChartRows } from "@/lib/race-charts";

const GAME_MARK_COUNT = 11;

function playerSlotLabel(ref: FormatPlayerRef): string {
  return `${ref.side === "H" ? "Home" : "Away"}${ref.index}`;
}

function kindLabel(kind: FormatGameKind): string {
  if (kind === "R") return "Race";
  if (kind === "D") return "Scotch";
  return "Singles";
}

function gameTypeLabel(value: string): string | null {
  const match = FORMAT_GAME_TYPE_OPTIONS.find((row) => row.value === value);
  if (!match || match.value === "0") return null;
  return match.label;
}

function multiplierLabel(value: string): string | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 1) return null;
  const match = FORMAT_MULTIPLIER_OPTIONS.find((row) => row.value === value);
  return match?.label ?? `${Math.round(n * 100)}%`;
}

/** True when the template is a night of singles races (Tuesday 9-Ball style). */
function isRaceMatchNight(model: FormatTemplateModel): boolean {
  const games = model.rounds.flatMap((round) => round.games);
  if (games.length === 0) return false;
  return games.every((game) => game.kind === "R" || game.kind === "S");
}

function homeAwayFromGame(game: FormatGame): {
  homeLabel: string;
  awayLabel: string;
} {
  const breakNames = game.breakPlayers.map(playerSlotLabel).join(" / ");
  const otherNames = game.otherPlayers.map(playerSlotLabel).join(" / ");
  if (game.breakTeam === 1) {
    return { homeLabel: breakNames, awayLabel: otherNames };
  }
  return { homeLabel: otherNames, awayLabel: breakNames };
}

function BlankLine({ label, wide }: { label: string; wide?: boolean }) {
  return (
    <div className={["flex min-w-0 items-end gap-2", wide ? "flex-1" : ""].join(" ")}>
      <span className="shrink-0 text-[11px] font-semibold text-[var(--ink)]">
        {label}
      </span>
      <span className="mb-0.5 min-w-[6rem] flex-1 border-b border-[var(--ink)]/50" />
    </div>
  );
}

function MarkCell() {
  return (
    <td className="border border-[var(--ink)]/70 bg-white p-0">
      <div className="mx-auto h-5 w-full min-w-[1.1rem] sm:h-6" />
    </td>
  );
}

function PlayerRaceRow({
  side,
  name,
  shaded,
}: {
  side: "Home" | "Visitor";
  name: string;
  shaded?: boolean;
}) {
  return (
    <tr className={shaded ? "bg-[var(--ink)]/[0.06]" : "bg-white"}>
      <td className="border border-[var(--ink)]/70 px-1.5 py-1 align-middle sm:px-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--muted)]">
          {side}
        </p>
        <p className="font-[family-name:var(--font-display)] text-sm font-semibold leading-tight text-[var(--ink)]">
          {name}
        </p>
        <p className="mt-0.5 text-[10px] text-[var(--muted)]">
          Fargo ______
        </p>
      </td>
      <td className="w-12 border border-[var(--ink)]/70 bg-white px-1 py-1 text-center align-middle sm:w-14">
        <div className="mx-auto h-7 w-8 rounded-sm border border-[var(--ink)]/40 bg-[#fbf8f1] sm:h-8 sm:w-9" />
      </td>
      {Array.from({ length: GAME_MARK_COUNT }).map((_, i) => (
        <MarkCell key={i} />
      ))}
      <td className="w-10 border border-[var(--ink)]/70 bg-white px-1 py-1 align-middle sm:w-12">
        <div className="mx-auto h-7 w-8 rounded-sm border border-[var(--ink)]/40 bg-[#fbf8f1] sm:h-8 sm:w-9" />
      </td>
    </tr>
  );
}

function TuesdayRaceScoresheet({ model }: { model: FormatTemplateModel }) {
  const matchups = model.rounds.flatMap((round, roundIndex) =>
    round.games.map((game, gameIndex) => ({
      key: `${round.id}-${game.id}`,
      roundIndex,
      gameIndex,
      game,
      ...homeAwayFromGame(game),
    })),
  );
  const chartRows = r6HotChartRows();

  return (
    <article className="overflow-hidden rounded-sm border-2 border-[var(--ink)]/85 bg-[#fbf8f1] text-[var(--ink)] shadow-sm">
      <header className="space-y-2.5 border-b-2 border-[var(--ink)]/85 px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
              Tuesday 9-Ball · R6 Hot
            </p>
            <p className="mt-0.5 font-[family-name:var(--font-display)] text-lg font-semibold leading-tight">
              Match scoresheet
            </p>
          </div>
          <p className="max-w-[14rem] text-right text-[10px] leading-snug text-[var(--muted)]">
            Circle the TOTAL for the match winner
          </p>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <BlankLine label="Home Team:" wide />
          <BlankLine label="Date:" />
          <BlankLine label="Visiting Team:" wide />
        </div>

        <p className="rounded-sm border border-[var(--ink)]/20 bg-white/70 px-2 py-1.5 text-[11px] leading-snug text-[var(--ink)]">
          <span className="font-semibold">Break:</span> players lag for the
          opening break, then <span className="font-semibold">alternate</span>{" "}
          thereafter. Mark an X under each game for the winner. Fill{" "}
          <span className="font-semibold">Race to</span> from the R6 Hot chart
          using Fargo difference.
        </p>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-left">
          <thead>
            <tr className="bg-[var(--ink)]/[0.08]">
              <th className="border border-[var(--ink)]/70 px-1.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] sm:px-2">
                Player / Fargo
              </th>
              <th className="border border-[var(--ink)]/70 px-1 py-1.5 text-center text-[10px] font-bold uppercase tracking-[0.08em]">
                Race
                <br />
                to
              </th>
              <th
                className="border border-[var(--ink)]/70 px-1 py-1.5 text-center text-[10px] font-bold uppercase tracking-[0.1em]"
                colSpan={GAME_MARK_COUNT}
              >
                Games (X = win)
              </th>
              <th className="border border-[var(--ink)]/70 px-1 py-1.5 text-center text-[10px] font-bold uppercase tracking-[0.1em]">
                Total
              </th>
            </tr>
            <tr className="bg-[var(--ink)]/[0.04]">
              <th className="border border-[var(--ink)]/70" />
              <th className="border border-[var(--ink)]/70" />
              {Array.from({ length: GAME_MARK_COUNT }).map((_, i) => (
                <th
                  key={i}
                  className="border border-[var(--ink)]/70 px-0 py-0.5 text-center text-[9px] font-semibold tabular-nums text-[var(--muted)]"
                >
                  {i + 1}
                </th>
              ))}
              <th className="border border-[var(--ink)]/70" />
            </tr>
          </thead>
          <tbody>
            {matchups.map((matchup, index) => (
              <Fragment key={matchup.key}>
                {index > 0 ? (
                  <tr aria-hidden>
                    <td
                      colSpan={GAME_MARK_COUNT + 3}
                      className="h-2 border-x border-[var(--ink)]/70 bg-[var(--ink)]/15 p-0"
                    />
                  </tr>
                ) : null}
                <PlayerRaceRow
                  side="Home"
                  name={matchup.homeLabel}
                  shaded
                />
                <PlayerRaceRow
                  side="Visitor"
                  name={matchup.awayLabel}
                />
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="grid gap-3 border-t-2 border-[var(--ink)]/85 px-3 py-3 sm:grid-cols-[1.1fr_1fr] sm:px-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em]">
            Race Chart — R6 Hot
          </p>
          <p className="mt-0.5 text-[10px] text-[var(--muted)]">
            Higher rating plays the higher number · lower plays the lower
          </p>
          <table className="mt-2 w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-[var(--ink)]/[0.06]">
                <th className="border border-[var(--ink)]/50 px-2 py-1 text-left font-semibold">
                  Rating dif
                </th>
                <th className="border border-[var(--ink)]/50 px-2 py-1 text-left font-semibold">
                  Play this
                </th>
              </tr>
            </thead>
            <tbody>
              {chartRows.map((row) => (
                <tr key={row.ratingDiff}>
                  <td className="border border-[var(--ink)]/40 px-2 py-0.5 tabular-nums">
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

        <div className="space-y-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em]">
              Match totals
            </p>
            <div className="mt-2 space-y-2">
              <div className="flex items-end justify-between gap-2">
                <span className="text-[12px] font-semibold">
                  Home team matches won
                </span>
                <span className="inline-block h-8 w-12 rounded-sm border border-[var(--ink)]/50 bg-white" />
              </div>
              <div className="flex items-end justify-between gap-2">
                <span className="text-[12px] font-semibold">
                  Visiting team matches won
                </span>
                <span className="inline-block h-8 w-12 rounded-sm border border-[var(--ink)]/50 bg-white" />
              </div>
            </div>
          </div>
          <div className="space-y-2 border-t border-[var(--ink)]/20 pt-2">
            <BlankLine label="Home sig:" wide />
            <BlankLine label="Visitor sig:" wide />
          </div>
          <p className="text-[10px] leading-snug text-[var(--muted)]">
            Sandbox preview · lineup slots Home1… / Away1… · race-to filled from
            chart after Fargos are known.
          </p>
        </div>
      </footer>
    </article>
  );
}

function ScoreBox({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      {label ? (
        <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
          {label}
        </span>
      ) : null}
      <div className="h-8 w-10 rounded-sm border border-[var(--ink)]/35 bg-white sm:h-9 sm:w-11" />
    </div>
  );
}

function RaceTrack({ length }: { length: number }) {
  const n = Math.max(1, Math.min(21, Math.round(length) || 7));
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
        Race {n}
      </span>
      {Array.from({ length: n }).map((_, i) => (
        <span
          key={i}
          className="inline-block h-3.5 w-3.5 rounded-[2px] border border-[var(--ink)]/40 bg-white"
          aria-hidden
        />
      ))}
    </div>
  );
}

function GenericGameRow({
  game,
  gameIndex,
}: {
  game: FormatGame;
  gameIndex: number;
}) {
  const { homeLabel, awayLabel } = homeAwayFromGame(game);
  const homeIsBreak = game.breakTeam === 1;
  const gt = gameTypeLabel(game.gameType);
  const mult = multiplierLabel(game.multiplier);
  const raceTo = game.kind === "R" ? Number(game.raceLength) || 7 : null;

  return (
    <li className="border-b border-[var(--ink)]/15 px-3 py-2.5 last:border-b-0 sm:px-4">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--ink)]">
          G{gameIndex + 1}
        </span>
        <span className="rounded-sm bg-[var(--ink)]/8 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--ink)]">
          {kindLabel(game.kind)}
        </span>
        {gt ? (
          <span className="rounded-sm bg-[color-mix(in_srgb,var(--felt)_16%,transparent)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--felt-deep)]">
            {gt}
          </span>
        ) : null}
        {mult ? (
          <span className="rounded-sm bg-[var(--ink)]/8 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
            {mult}
          </span>
        ) : null}
        <span className="text-[10px] font-semibold text-[var(--muted)]">
          {homeIsBreak ? "Home" : "Away"} breaks
        </span>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="min-w-0">
          <p className="truncate font-[family-name:var(--font-display)] text-sm font-semibold text-[var(--ink)]">
            {homeLabel}
          </p>
        </div>
        <div className="flex items-end gap-2">
          <ScoreBox label="H" />
          <span className="pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            vs
          </span>
          <ScoreBox label="A" />
        </div>
        <div className="min-w-0 text-right">
          <p className="truncate font-[family-name:var(--font-display)] text-sm font-semibold text-[var(--ink)]">
            {awayLabel}
          </p>
        </div>
      </div>

      {raceTo != null ? (
        <div className="mt-2 border-t border-dashed border-[var(--ink)]/15 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <RaceTrack length={raceTo} />
            <div className="flex justify-end">
              <RaceTrack length={raceTo} />
            </div>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function GenericScoresheet({ model }: { model: FormatTemplateModel }) {
  const totalGames = model.rounds.reduce(
    (sum, round) => sum + round.games.length,
    0,
  );
  const homeLineup = Array.from(
    { length: model.playerCount },
    (_, i) => `Home${i + 1}`,
  );
  const awayLineup = Array.from(
    { length: model.playerCount },
    (_, i) => `Away${i + 1}`,
  );

  return (
    <article className="overflow-hidden rounded-sm border-2 border-[var(--ink)]/80 bg-[#fbf8f1] text-[var(--ink)] shadow-sm">
      <header className="border-b-2 border-[var(--ink)]/80 px-3 py-3 sm:px-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
          Match scoresheet
        </p>
        <p className="mt-0.5 font-[family-name:var(--font-display)] text-lg font-semibold leading-tight">
          Home vs Away
        </p>
        <p className="mt-1 text-[11px] text-[var(--muted)]">
          {model.playerCount} / side · {model.rounds.length} rounds ·{" "}
          {totalGames} games
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-sm border border-[var(--ink)]/25 bg-white/70 px-2.5 py-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--felt-deep)]">
              Home lineup
            </p>
            <ol className="mt-1 space-y-0.5 text-sm">
              {homeLineup.map((name, i) => (
                <li key={name} className="flex gap-2">
                  <span className="w-5 tabular-nums text-[var(--muted)]">
                    {i + 1}.
                  </span>
                  <span className="font-medium">{name}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-sm border border-[var(--ink)]/25 bg-white/70 px-2.5 py-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--felt-deep)]">
              Away lineup
            </p>
            <ol className="mt-1 space-y-0.5 text-sm">
              {awayLineup.map((name, i) => (
                <li key={name} className="flex gap-2">
                  <span className="w-5 tabular-nums text-[var(--muted)]">
                    {i + 1}.
                  </span>
                  <span className="font-medium">{name}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </header>

      {model.rounds.map((round, roundIndex) => (
        <section
          key={round.id}
          className="border-b-2 border-[var(--ink)]/80 last:border-b-0"
        >
          <div className="bg-[var(--ink)]/[0.06] px-3 py-2 sm:px-4">
            <h3 className="text-sm font-bold uppercase tracking-[0.12em]">
              Round {roundIndex + 1}
            </h3>
          </div>
          <ul>
            {round.games.map((game, gameIndex) => (
              <GenericGameRow
                key={game.id}
                game={game}
                gameIndex={gameIndex}
              />
            ))}
          </ul>
        </section>
      ))}
    </article>
  );
}

export function FormatScoresheetPreview({
  model,
  open,
  onClose,
  title = "Scoresheet preview",
}: {
  model: FormatTemplateModel;
  open: boolean;
  onClose: () => void;
  title?: string;
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

  const summary = summarizeFormatModel(model);
  const tuesdayStyle = isRaceMatchNight(model);

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
          className="w-full max-w-3xl overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] bg-[linear-gradient(145deg,rgba(29,110,158,0.98),rgba(19,78,115,0.96))] px-4 py-3 text-white">
            <div className="min-w-0">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
                {title}
              </h2>
              <p className="mt-0.5 text-xs text-white/75">
                {tuesdayStyle
                  ? `${summary} · Tuesday / R6 Hot layout`
                  : summary}
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

          <div className="max-h-[min(82dvh,56rem)] space-y-3 overflow-y-auto bg-[color-mix(in_srgb,var(--surface)_70%,#f3efe6)] p-3 sm:p-4">
            {tuesdayStyle ? (
              <TuesdayRaceScoresheet model={model} />
            ) : (
              <GenericScoresheet model={model} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
