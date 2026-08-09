"use client";

import { useEffect } from "react";
import {
  FORMAT_GAME_TYPE_OPTIONS,
  FORMAT_MULTIPLIER_OPTIONS,
  summarizeFormatModel,
  type FormatGame,
  type FormatGameKind,
  type FormatPlayerRef,
  type FormatTemplateModel,
} from "@/lib/lms-format-template";

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

function GameRow({
  game,
  gameIndex,
}: {
  game: FormatGame;
  gameIndex: number;
}) {
  const breakNames = game.breakPlayers.map(playerSlotLabel).join(" / ");
  const otherNames = game.otherPlayers.map(playerSlotLabel).join(" / ");
  const homeIsBreak = game.breakTeam === 1;
  const homeNames = homeIsBreak ? breakNames : otherNames;
  const awayNames = homeIsBreak ? otherNames : breakNames;
  const gt = gameTypeLabel(game.gameType);
  const mult = multiplierLabel(game.multiplier);
  const raceTo =
    game.kind === "R" ? Number(game.raceLength) || 7 : null;

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
            {homeNames}
          </p>
          {homeIsBreak ? (
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--felt-deep)]">
              Break
            </p>
          ) : (
            <p className="text-[10px] text-[var(--muted)]">—</p>
          )}
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
            {awayNames}
          </p>
          {!homeIsBreak ? (
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--felt-deep)]">
              Break
            </p>
          ) : (
            <p className="text-[10px] text-[var(--muted)]">—</p>
          )}
        </div>
      </div>

      {raceTo != null ? (
        <div className="mt-2 space-y-1.5 border-t border-dashed border-[var(--ink)]/15 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <RaceTrack length={raceTo} />
            <div className="flex justify-end">
              <RaceTrack length={raceTo} />
            </div>
          </div>
          <p className="text-center text-[10px] text-[var(--muted)]">
            Mark each race game won · first to {raceTo}
          </p>
        </div>
      ) : null}

      {game.kind === "D" ? (
        <p className="mt-1.5 text-[10px] text-[var(--muted)]">
          Scotch doubles — both players share the score boxes above.
        </p>
      ) : null}
    </li>
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

  const homeLineup = Array.from(
    { length: model.playerCount },
    (_, i) => `Home${i + 1}`,
  );
  const awayLineup = Array.from(
    { length: model.playerCount },
    (_, i) => `Away${i + 1}`,
  );
  const summary = summarizeFormatModel(model);
  const totalGames = model.rounds.reduce(
    (sum, round) => sum + round.games.length,
    0,
  );

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
          className="w-full max-w-2xl overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] bg-[linear-gradient(145deg,rgba(29,110,158,0.98),rgba(19,78,115,0.96))] px-4 py-3 text-white">
            <div className="min-w-0">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
                {title}
              </h2>
              <p className="mt-0.5 text-xs text-white/75">{summary}</p>
            </div>
            <button
              type="button"
              className="rounded-[var(--radius)] border border-white/25 bg-white/10 px-3 py-1.5 text-sm font-semibold text-white"
              onClick={onClose}
            >
              Close
            </button>
          </div>

          <div className="max-h-[min(80dvh,52rem)] space-y-3 overflow-y-auto bg-[color-mix(in_srgb,var(--surface)_70%,#f3efe6)] p-3 sm:p-4">
            {/* Paper scoresheet */}
            <article className="overflow-hidden rounded-sm border-2 border-[var(--ink)]/80 bg-[#fbf8f1] text-[var(--ink)] shadow-sm">
              <header className="border-b-2 border-[var(--ink)]/80 px-3 py-3 sm:px-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
                      Match scoresheet
                    </p>
                    <p className="mt-0.5 font-[family-name:var(--font-display)] text-lg font-semibold leading-tight">
                      Home vs Away
                    </p>
                  </div>
                  <div className="text-right text-[11px] text-[var(--muted)]">
                    <p>{model.playerCount} / side</p>
                    <p>
                      {model.rounds.length} rounds · {totalGames} games
                    </p>
                  </div>
                </div>

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

                <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--ink)]/20 pt-3">
                  <div className="flex items-end justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                      Home total
                    </span>
                    <div className="h-9 w-14 rounded-sm border border-[var(--ink)]/40 bg-white" />
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                      Away total
                    </span>
                    <div className="h-9 w-14 rounded-sm border border-[var(--ink)]/40 bg-white" />
                  </div>
                </div>
              </header>

              {model.rounds.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-[var(--muted)]">
                  No rounds in this template yet.
                </p>
              ) : (
                model.rounds.map((round, roundIndex) => (
                  <section
                    key={round.id}
                    className="border-b-2 border-[var(--ink)]/80 last:border-b-0"
                  >
                    <div className="flex items-center justify-between gap-2 bg-[var(--ink)]/[0.06] px-3 py-2 sm:px-4">
                      <h3 className="text-sm font-bold uppercase tracking-[0.12em]">
                        Round {roundIndex + 1}
                      </h3>
                      <div className="flex items-center gap-3 text-[11px]">
                        <span className="inline-flex items-center gap-1.5">
                          H
                          <span className="inline-block h-6 w-8 rounded-sm border border-[var(--ink)]/35 bg-white" />
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          A
                          <span className="inline-block h-6 w-8 rounded-sm border border-[var(--ink)]/35 bg-white" />
                        </span>
                      </div>
                    </div>
                    {round.games.length === 0 ? (
                      <p className="px-3 py-4 text-xs text-[var(--muted)] sm:px-4">
                        No games in this round.
                      </p>
                    ) : (
                      <ul>
                        {round.games.map((game, gameIndex) => (
                          <GameRow
                            key={game.id}
                            game={game}
                            gameIndex={gameIndex}
                          />
                        ))}
                      </ul>
                    )}
                  </section>
                ))
              )}

              <footer className="border-t-2 border-[var(--ink)]/80 px-3 py-3 text-[10px] text-[var(--muted)] sm:px-4">
                Sandbox preview · lineup slots are Home1… / Away1… · Singles,
                Race (with race track), and Scotch doubles are laid out from the
                template.
              </footer>
            </article>
          </div>
        </div>
      </div>
    </div>
  );
}
