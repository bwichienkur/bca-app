"use client";

import { useMemo, useState } from "react";
import {
  clampPlayerCount,
  defaultFormatModel,
  emptyGame,
  emptyRound,
  FORMAT_GAME_TYPE_OPTIONS,
  FORMAT_MULTIPLIER_OPTIONS,
  FORMAT_RACE_LENGTH_OPTIONS,
  parseFormatTemplate,
  serializeFormatTemplate,
  summarizeFormatModel,
  type FormatGame,
  type FormatGameKind,
  type FormatPlayerRef,
  type FormatTemplateModel,
} from "@/lib/lms-format-template";
import { FormatScoresheetPreview } from "./FormatScoresheetPreview";
import { SelectField } from "./SelectField";

const inputClass =
  "w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none ring-[var(--felt)] focus:ring-2";
const btnPrimary =
  "inline-flex items-center justify-center rounded-[var(--radius)] bg-[var(--felt)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50";
const btnGhost =
  "inline-flex items-center justify-center rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--ink)] disabled:opacity-50";
const btnDelete =
  "inline-flex items-center justify-center rounded-[var(--radius)] bg-[#b42318] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50";

export function playerSlotLabel(ref: FormatPlayerRef): string {
  return `${ref.side === "H" ? "Home" : "Away"}${ref.index}`;
}

function kindLabel(kind: FormatGameKind): string {
  if (kind === "R") return "Race";
  if (kind === "D") return "Scotch";
  return "Singles";
}

function playerOptions(count: number, side: "H" | "A") {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return {
      value: `${side}${n}`,
      label: `${side === "H" ? "Home" : "Away"}${n}`,
    };
  });
}

function refValue(ref: FormatPlayerRef): string {
  return `${ref.side}${ref.index}`;
}

function parseRef(value: string): FormatPlayerRef {
  const side = value.startsWith("A") ? "A" : "H";
  const index = Number(value.slice(1)) || 1;
  return { side, index };
}

type LmsScoresheetStudioProps = {
  /** Optional starting player count for a blank sandbox. */
  playerCountHint?: number;
};

export function LmsScoresheetStudio({
  playerCountHint,
}: LmsScoresheetStudioProps) {
  const initial = defaultFormatModel(playerCountHint || 5, playerCountHint || 5);
  const [model, setModel] = useState<FormatTemplateModel>(() => initial);
  const [dslText, setDslText] = useState(() => serializeFormatTemplate(initial));
  const [dslError, setDslError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const summary = useMemo(() => summarizeFormatModel(model), [model]);
  const allPlayerOptions = useMemo(
    () => [
      ...playerOptions(model.playerCount, "H"),
      ...playerOptions(model.playerCount, "A"),
    ],
    [model.playerCount],
  );

  const syncFromModel = (next: FormatTemplateModel) => {
    setModel(next);
    setDslText(serializeFormatTemplate(next));
    setDslError(null);
  };

  const setPlayerCount = (next: number) => {
    const count = clampPlayerCount(next);
    syncFromModel({
      ...model,
      playerCount: count,
      rounds: model.rounds.map((round) => ({
        ...round,
        games: round.games.map((game) => ({
          ...game,
          breakPlayers: game.breakPlayers.map((p) => ({
            ...p,
            index: Math.min(count, p.index),
          })),
          otherPlayers: game.otherPlayers.map((p) => ({
            ...p,
            index: Math.min(count, p.index),
          })),
        })),
      })),
    });
  };

  const updateRound = (
    roundId: string,
    updater: (
      round: FormatTemplateModel["rounds"][number],
    ) => FormatTemplateModel["rounds"][number],
  ) => {
    syncFromModel({
      ...model,
      rounds: model.rounds.map((round) =>
        round.id === roundId ? updater(round) : round,
      ),
    });
  };

  const updateGame = (
    roundId: string,
    gameId: string,
    updater: (game: FormatGame) => FormatGame,
  ) => {
    updateRound(roundId, (round) => ({
      ...round,
      games: round.games.map((game) =>
        game.id === gameId ? updater(game) : game,
      ),
    }));
  };

  const applyDslText = (raw: string) => {
    setDslText(raw);
    const parsed = parseFormatTemplate(raw);
    setModel(parsed);
    setDslError(null);
  };

  const resetDefault = () => {
    syncFromModel(defaultFormatModel(model.playerCount, model.playerCount));
  };

  const copyDsl = async () => {
    try {
      await navigator.clipboard.writeText(dslText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setDslError("Clipboard unavailable — select the DSL and copy manually.");
    }
  };

  return (
    <section className="space-y-4">
      <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)]/50 px-3 py-2.5">
        <p className="text-sm font-semibold text-[var(--ink)]">
          Scoresheet sandbox
        </p>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          Edit the sheet or paste DSL — nothing is saved to a division. Generate
          opens a paper preview (Tuesday 9-Ball / R6 Hot layout for race
          nights). {summary}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[8rem] space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
            Players / side
          </span>
          <SelectField
            aria-label="Players per team"
            value={String(model.playerCount)}
            options={Array.from({ length: 10 }, (_, i) => ({
              value: String(i + 1),
              label: String(i + 1),
            }))}
            onChange={(value) => setPlayerCount(Number(value))}
          />
        </label>
        <button
          type="button"
          className={btnGhost}
          onClick={() =>
            syncFromModel({
              ...model,
              rounds: [...model.rounds, emptyRound()],
            })
          }
        >
          + Round
        </button>
        <button type="button" className={btnGhost} onClick={resetDefault}>
          Default Home/Away sheet
        </button>
        <button
          type="button"
          className={btnPrimary}
          disabled={model.rounds.every((round) => round.games.length === 0)}
          onClick={() => setPreviewOpen(true)}
        >
          Generate
        </button>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
            Build rounds & games
          </p>
          {model.rounds.map((round, roundIndex) => (
            <article
              key={round.id}
              className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--surface-2)] px-3 py-2">
                <h3 className="text-sm font-semibold text-[var(--ink)]">
                  Round {roundIndex + 1}
                </h3>
                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      ["S", "Singles"],
                      ["R", "Race"],
                      ["D", "Scotch"],
                    ] as const
                  ).map(([kind, label]) => (
                    <button
                      key={kind}
                      type="button"
                      className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-[11px] font-semibold text-[var(--ink)]"
                      onClick={() =>
                        updateRound(round.id, (current) => ({
                          ...current,
                          games: [...current.games, emptyGame(kind)],
                        }))
                      }
                    >
                      + {label}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={btnDelete}
                    disabled={model.rounds.length <= 1}
                    onClick={() =>
                      syncFromModel({
                        ...model,
                        rounds: model.rounds.filter((r) => r.id !== round.id),
                      })
                    }
                  >
                    Remove
                  </button>
                </div>
              </div>

              {round.games.length === 0 ? (
                <p className="px-3 py-4 text-xs text-[var(--muted)]">
                  No games — add Singles, Race, or Scotch.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--line)]">
                  {round.games.map((game, gameIndex) => (
                    <li key={game.id} className="space-y-2 px-3 py-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                          G{gameIndex + 1} · {kindLabel(game.kind)}
                          {game.kind === "R"
                            ? ` · RL${game.raceLength || "7"}`
                            : ""}
                        </p>
                        <button
                          type="button"
                          className="text-[11px] font-semibold text-[#b42318]"
                          onClick={() =>
                            updateRound(round.id, (current) => ({
                              ...current,
                              games: current.games.filter(
                                (g) => g.id !== game.id,
                              ),
                            }))
                          }
                        >
                          Remove game
                        </button>
                      </div>

                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-[var(--radius)] bg-[var(--surface-2)] px-2.5 py-2">
                        <p className="truncate text-sm font-semibold text-[var(--felt-deep)]">
                          {game.breakPlayers.map(playerSlotLabel).join(" / ")}
                        </p>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                          vs
                        </span>
                        <p className="truncate text-right text-sm font-semibold text-[var(--felt-deep)]">
                          {game.otherPlayers.map(playerSlotLabel).join(" / ")}
                        </p>
                      </div>
                      <p className="text-[11px] text-[var(--muted)]">
                        {game.breakTeam === 1 ? "Home" : "Away"} breaks
                      </p>

                      <div className="grid gap-2 sm:grid-cols-2">
                        {(game.kind === "D" ? [0, 1] : [0]).map((slot) => (
                          <label key={`b-${slot}`} className="space-y-1">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                              Break {slot + 1}
                            </span>
                            <SelectField
                              aria-label={`Break player ${slot + 1}`}
                              value={refValue(
                                game.breakPlayers[slot] ?? {
                                  side: game.breakTeam === 1 ? "H" : "A",
                                  index: 1,
                                },
                              )}
                              options={allPlayerOptions}
                              onChange={(value) =>
                                updateGame(round.id, game.id, (g) => {
                                  const next = [...g.breakPlayers];
                                  next[slot] = parseRef(value);
                                  return { ...g, breakPlayers: next };
                                })
                              }
                            />
                          </label>
                        ))}
                        {(game.kind === "D" ? [0, 1] : [0]).map((slot) => (
                          <label key={`o-${slot}`} className="space-y-1">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                              Other {slot + 1}
                            </span>
                            <SelectField
                              aria-label={`Other player ${slot + 1}`}
                              value={refValue(
                                game.otherPlayers[slot] ?? {
                                  side: game.breakTeam === 1 ? "A" : "H",
                                  index: 1,
                                },
                              )}
                              options={allPlayerOptions}
                              onChange={(value) =>
                                updateGame(round.id, game.id, (g) => {
                                  const next = [...g.otherPlayers];
                                  next[slot] = parseRef(value);
                                  return { ...g, otherPlayers: next };
                                })
                              }
                            />
                          </label>
                        ))}
                        <label className="space-y-1">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                            Break side
                          </span>
                          <SelectField
                            aria-label="Break side"
                            value={String(game.breakTeam)}
                            options={[
                              { value: "1", label: "Home breaks" },
                              { value: "2", label: "Away breaks" },
                            ]}
                            onChange={(value) =>
                              updateGame(round.id, game.id, (g) => ({
                                ...g,
                                breakTeam: value === "2" ? 2 : 1,
                              }))
                            }
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                            Game type
                          </span>
                          <SelectField
                            aria-label="Game type"
                            value={game.gameType || "0"}
                            options={[...FORMAT_GAME_TYPE_OPTIONS]}
                            onChange={(value) =>
                              updateGame(round.id, game.id, (g) => ({
                                ...g,
                                gameType: value,
                              }))
                            }
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                            Point multiplier
                          </span>
                          <SelectField
                            aria-label="Point multiplier"
                            value={game.multiplier || "1.00"}
                            options={[...FORMAT_MULTIPLIER_OPTIONS]}
                            onChange={(value) =>
                              updateGame(round.id, game.id, (g) => ({
                                ...g,
                                multiplier: value,
                              }))
                            }
                          />
                        </label>
                        {game.kind === "R" ? (
                          <label className="space-y-1">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                              Race length
                            </span>
                            <SelectField
                              aria-label="Race length"
                              value={game.raceLength || "7"}
                              options={FORMAT_RACE_LENGTH_OPTIONS}
                              onChange={(value) =>
                                updateGame(round.id, game.id, (g) => ({
                                  ...g,
                                  raceLength: value,
                                }))
                              }
                            />
                          </label>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>

        <div className="space-y-2 xl:sticky xl:top-3 xl:self-start">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              LMS template DSL
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={btnGhost}
                onClick={() => void copyDsl()}
              >
                {copied ? "Copied" : "Copy DSL"}
              </button>
              <button
                type="button"
                className={btnPrimary}
                disabled={model.rounds.every((round) => round.games.length === 0)}
                onClick={() => setPreviewOpen(true)}
              >
                Generate
              </button>
            </div>
          </div>
          <textarea
            aria-label="LMS format template DSL"
            className={`${inputClass} min-h-[28rem] font-mono text-xs leading-relaxed`}
            value={dslText}
            onChange={(e) => applyDslText(e.target.value)}
            spellCheck={false}
          />
          {dslError ? (
            <p className="text-xs text-[#b42318]">{dslError}</p>
          ) : (
            <p className="text-xs text-[var(--muted)]">
              Tokens use H1/A1 in DSL; the builder and Generate preview show
              Home1 / Away1. Paste a template to rebuild the sandbox.
            </p>
          )}
        </div>
      </div>

      <FormatScoresheetPreview
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        model={model}
        title="Generated scoresheet"
      />
    </section>
  );
}
