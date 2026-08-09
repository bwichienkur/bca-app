"use client";

import { useEffect, useMemo, useState } from "react";
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
  type FormatRound,
  type FormatTemplateModel,
} from "@/lib/lms-format-template";
import { SelectField } from "./SelectField";

const btnPrimary =
  "inline-flex items-center justify-center rounded-[var(--radius)] bg-[var(--felt)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50";
const btnGhost =
  "inline-flex items-center justify-center rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--ink)] disabled:opacity-50";
const btnDelete =
  "inline-flex items-center justify-center rounded-[var(--radius)] bg-[#b42318] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50";

type LmsFormatTemplateBuilderProps = {
  initialTemplate: string;
  playerCountHint?: number;
  onCancel: () => void;
  onApply: (template: string, meta: { playerCount: number; rounds: number }) => void;
};

function kindLabel(kind: FormatGameKind): string {
  if (kind === "R") return "Singles race";
  if (kind === "D") return "Scotch game";
  return "Singles game";
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

export function LmsFormatTemplateBuilder({
  initialTemplate,
  playerCountHint,
  onCancel,
  onApply,
}: LmsFormatTemplateBuilderProps) {
  const [model, setModel] = useState<FormatTemplateModel>(() => {
    const parsed = parseFormatTemplate(initialTemplate);
    if (!initialTemplate.trim() && playerCountHint) {
      return defaultFormatModel(playerCountHint, Math.max(1, parsed.rounds.length));
    }
    return parsed;
  });
  const [showDsl, setShowDsl] = useState(false);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onCancel]);

  const dsl = useMemo(() => serializeFormatTemplate(model), [model]);
  const summary = useMemo(() => summarizeFormatModel(model), [model]);

  const setPlayerCount = (next: number) => {
    const count = clampPlayerCount(next);
    setModel((prev) => ({
      ...prev,
      playerCount: count,
      rounds: prev.rounds.map((round) => ({
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
    }));
  };

  const updateRound = (roundId: string, updater: (round: FormatRound) => FormatRound) => {
    setModel((prev) => ({
      ...prev,
      rounds: prev.rounds.map((round) =>
        round.id === roundId ? updater(round) : round,
      ),
    }));
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

  const homeOptions = playerOptions(model.playerCount, "H");
  const awayOptions = playerOptions(model.playerCount, "A");
  const allPlayerOptions = [...homeOptions, ...awayOptions];

  return (
    <div
      className="fixed inset-0 z-[90] overflow-y-auto bg-black/55"
      role="dialog"
      aria-modal="true"
      aria-label="Create scoresheet"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="flex min-h-full justify-center px-3 py-6">
        <div
          className="w-full max-w-3xl rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] bg-[linear-gradient(145deg,rgba(29,110,158,0.98),rgba(19,78,115,0.96))] px-4 py-3 text-white">
            <div className="min-w-0">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
                Create scoresheet
              </h2>
              <p className="mt-0.5 text-xs text-white/75">{summary}</p>
            </div>
            <button
              type="button"
              className="rounded-[var(--radius)] border border-white/25 bg-white/10 px-3 py-1.5 text-sm font-semibold text-white"
              onClick={onCancel}
            >
              Close
            </button>
          </div>

          <div className="space-y-4 p-3 sm:p-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-[10rem] flex-1 space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                  Players per team
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
                className={btnPrimary}
                onClick={() =>
                  setModel((prev) => ({
                    ...prev,
                    rounds: [...prev.rounds, emptyRound()],
                  }))
                }
              >
                + Add round
              </button>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {(
                [
                  ["S", "Singles game"],
                  ["R", "Singles race"],
                  ["D", "Scotch game"],
                ] as const
              ).map(([kind, label]) => (
                <button
                  key={kind}
                  type="button"
                  className={btnGhost}
                  disabled={model.rounds.length === 0}
                  onClick={() => {
                    const last = model.rounds[model.rounds.length - 1];
                    if (!last) return;
                    updateRound(last.id, (round) => ({
                      ...round,
                      games: [...round.games, emptyGame(kind)],
                    }));
                  }}
                >
                  + {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-[var(--muted)]">
              Palette buttons add a game to the last round. Use each round’s own
              controls to add games there, or rearrange by editing player slots.
            </p>

            <div className="space-y-3">
              {model.rounds.map((round, roundIndex) => (
                <section
                  key={round.id}
                  className="space-y-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)]/50 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[var(--ink)]">
                      Round {roundIndex + 1}
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
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
                          className={btnGhost}
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
                          setModel((prev) => ({
                            ...prev,
                            rounds: prev.rounds.filter((r) => r.id !== round.id),
                          }))
                        }
                      >
                        Remove round
                      </button>
                    </div>
                  </div>

                  {round.games.length === 0 ? (
                    <p className="text-xs text-[var(--muted)]">
                      No games yet. Add singles, race, or scotch.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {round.games.map((game, gameIndex) => (
                        <li
                          key={game.id}
                          className="space-y-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-[var(--ink)]">
                              {kindLabel(game.kind)} · Game {gameIndex + 1}
                            </p>
                            <button
                              type="button"
                              className={btnDelete}
                              onClick={() =>
                                updateRound(round.id, (current) => ({
                                  ...current,
                                  games: current.games.filter(
                                    (g) => g.id !== game.id,
                                  ),
                                }))
                              }
                            >
                              Remove
                            </button>
                          </div>

                          <div className="grid gap-2 sm:grid-cols-2">
                            <label className="space-y-1">
                              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                                Game type
                              </span>
                              <SelectField
                                aria-label="Game type"
                                value={game.gameType}
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
                                Points multiplier
                              </span>
                              <SelectField
                                aria-label="Points multiplier"
                                value={game.multiplier}
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
                                  value={game.raceLength}
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
                            <label className="space-y-1">
                              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                                Breaking side
                              </span>
                              <SelectField
                                aria-label="Breaking side"
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
                          </div>

                          <div className="grid gap-2 sm:grid-cols-2">
                            {(game.kind === "D"
                              ? [0, 1]
                              : [0]
                            ).map((slot) => (
                              <label key={`break-${slot}`} className="space-y-1">
                                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                                  {game.kind === "D"
                                    ? `Breaking player ${slot + 1}`
                                    : "Breaking player"}
                                </span>
                                <SelectField
                                  aria-label={`Breaking player ${slot + 1}`}
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
                            {(game.kind === "D"
                              ? [0, 1]
                              : [0]
                            ).map((slot) => (
                              <label key={`other-${slot}`} className="space-y-1">
                                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                                  {game.kind === "D"
                                    ? `Other player ${slot + 1}`
                                    : "Other player"}
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
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
            </div>

            <div className="space-y-2 border-t border-[var(--line)] pt-3">
              <button
                type="button"
                className={btnGhost}
                onClick={() => setShowDsl((v) => !v)}
              >
                {showDsl ? "Hide" : "Show"} advanced template text
              </button>
              {showDsl ? (
                <pre className="max-h-56 overflow-auto rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] p-3 text-[11px] leading-relaxed text-[var(--ink)]">
                  {dsl}
                </pre>
              ) : null}
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className={btnGhost} onClick={onCancel}>
                Cancel
              </button>
              <button
                type="button"
                className={btnPrimary}
                onClick={() =>
                  onApply(dsl, {
                    playerCount: model.playerCount,
                    rounds: model.rounds.length,
                  })
                }
              >
                Use this scoresheet
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
