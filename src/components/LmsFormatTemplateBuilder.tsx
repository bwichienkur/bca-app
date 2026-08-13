"use client";

import { useEffect, useMemo, useState } from "react";
import {
  clampPlayerCount,
  clampRoundCount,
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
import {
  SCORESHEET_PRESETS,
  getScoresheetPreset,
  type ScoresheetPresetId,
} from "@/lib/lms-scoresheet-presets";
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

function GameCard({
  game,
  gameIndex,
  roundId,
  allPlayerOptions,
  onUpdate,
  onRemove,
}: {
  game: FormatGame;
  gameIndex: number;
  roundId: string;
  allPlayerOptions: Array<{ value: string; label: string }>;
  onUpdate: (
    roundId: string,
    gameId: string,
    updater: (game: FormatGame) => FormatGame,
  ) => void;
  onRemove: () => void;
}) {
  return (
    <li className="space-y-2.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--ink)]">
          {kindLabel(game.kind)} · Game {gameIndex + 1}
        </p>
        <button type="button" className={btnDelete} onClick={onRemove}>
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
              onUpdate(roundId, game.id, (g) => ({ ...g, gameType: value }))
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
              onUpdate(roundId, game.id, (g) => ({ ...g, multiplier: value }))
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
                onUpdate(roundId, game.id, (g) => ({
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
              onUpdate(roundId, game.id, (g) => ({
                ...g,
                breakTeam: value === "2" ? 2 : 1,
              }))
            }
          />
        </label>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {(game.kind === "D" ? [0, 1] : [0]).map((slot) => (
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
                onUpdate(roundId, game.id, (g) => {
                  const next = [...g.breakPlayers];
                  next[slot] = parseRef(value);
                  return { ...g, breakPlayers: next };
                })
              }
            />
          </label>
        ))}
        {(game.kind === "D" ? [0, 1] : [0]).map((slot) => (
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
                onUpdate(roundId, game.id, (g) => {
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
  );
}

/**
 * Full-page scoresheet builder: one round at a time via tabs.
 * Opened from Division → Format (replaces the old stacked modal).
 */
export function LmsFormatTemplateBuilder({
  initialTemplate,
  playerCountHint,
  onCancel,
  onApply,
}: LmsFormatTemplateBuilderProps) {
  const [model, setModel] = useState<FormatTemplateModel>(() => {
    const parsed = parseFormatTemplate(initialTemplate);
    if (!initialTemplate.trim() && playerCountHint) {
      return defaultFormatModel(
        playerCountHint,
        Math.max(1, parsed.rounds.length),
      );
    }
    return parsed.rounds.length > 0
      ? parsed
      : defaultFormatModel(playerCountHint || parsed.playerCount || 3, 1);
  });
  const [activeRoundId, setActiveRoundId] = useState(
    () => model.rounds[0]?.id ?? "",
  );
  const [presetId, setPresetId] = useState<string>("");
  const [showDsl, setShowDsl] = useState(false);

  useEffect(() => {
    if (!model.rounds.some((round) => round.id === activeRoundId)) {
      setActiveRoundId(model.rounds[0]?.id ?? "");
    }
  }, [model.rounds, activeRoundId]);

  const dsl = useMemo(() => serializeFormatTemplate(model), [model]);
  const summary = useMemo(() => summarizeFormatModel(model), [model]);
  const activeRoundIndex = model.rounds.findIndex(
    (round) => round.id === activeRoundId,
  );
  const activeRound: FormatRound | null =
    activeRoundIndex >= 0 ? model.rounds[activeRoundIndex]! : null;

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

  const updateRound = (
    roundId: string,
    updater: (round: FormatRound) => FormatRound,
  ) => {
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

  const addRound = () => {
    const round = emptyRound();
    setModel((prev) => ({
      ...prev,
      rounds: [...prev.rounds, round],
    }));
    setActiveRoundId(round.id);
    setPresetId("");
  };

  /** Grow/shrink rounds for Paradise (5), Tuesday (4), Beyond Singles (3), Teams (1), etc. */
  const setRoundCount = (nextCount: number) => {
    const count = clampRoundCount(nextCount);
    setModel((prev) => {
      const rounds = [...prev.rounds];
      while (rounds.length < count) rounds.push(emptyRound());
      if (rounds.length > count) rounds.length = count;
      return { ...prev, rounds };
    });
    setPresetId("");
  };

  const applyPreset = (id: ScoresheetPresetId) => {
    const preset = getScoresheetPreset(id);
    if (!preset) return;
    const next = preset.build();
    setModel(next);
    setActiveRoundId(next.rounds[0]?.id ?? "");
    setPresetId(id);
  };

  const removeActiveRound = () => {
    if (!activeRound || model.rounds.length <= 1) return;
    const index = activeRoundIndex;
    const nextId =
      model.rounds[index + 1]?.id ?? model.rounds[index - 1]?.id ?? "";
    setModel((prev) => ({
      ...prev,
      rounds: prev.rounds.filter((r) => r.id !== activeRound.id),
    }));
    setActiveRoundId(nextId);
    setPresetId("");
  };

  const addGame = (kind: FormatGameKind) => {
    if (!activeRound) return;
    updateRound(activeRound.id, (round) => ({
      ...round,
      games: [...round.games, emptyGame(kind)],
    }));
  };

  const homeOptions = playerOptions(model.playerCount, "H");
  const awayOptions = playerOptions(model.playerCount, "A");
  const allPlayerOptions = [...homeOptions, ...awayOptions];

  return (
    <div className="space-y-3">
      <div className="space-y-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[var(--shadow)] sm:p-4">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
            Start from division style
          </span>
          <SelectField
            aria-label="Start from division style"
            value={presetId}
            options={[
              { value: "", label: "Keep current / custom…" },
              ...SCORESHEET_PRESETS.map((preset) => ({
                value: preset.id,
                label: preset.label,
              })),
            ]}
            onChange={(value) => {
              if (!value) {
                setPresetId("");
                return;
              }
              applyPreset(value as ScoresheetPresetId);
            }}
          />
          <p className="text-xs text-[var(--muted)]">
            {presetId
              ? (SCORESHEET_PRESETS.find((p) => p.id === presetId)?.description ??
                "")
              : "Load Paradise (5 rounds), Tuesday (4), Beyond Singles (3), or Beyond Teams (1), then edit tabs."}
          </p>
        </label>

        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[9rem] flex-1 space-y-1.5 sm:max-w-[12rem]">
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
              onChange={(value) => {
                setPlayerCount(Number(value));
                setPresetId("");
              }}
            />
          </label>
          <label className="min-w-[9rem] flex-1 space-y-1.5 sm:max-w-[12rem]">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              Rounds
            </span>
            <SelectField
              aria-label="Number of rounds"
              value={String(model.rounds.length)}
              options={Array.from({ length: 20 }, (_, i) => ({
                value: String(i + 1),
                label: String(i + 1),
              }))}
              onChange={(value) => setRoundCount(Number(value))}
            />
          </label>
          <p className="pb-2 text-xs text-[var(--muted)] sm:ml-auto">
            {summary}
          </p>
        </div>
      </div>

      <section className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]">
        <div className="border-b border-[var(--line)] bg-[var(--surface-2)] px-2 py-2 sm:px-3">
          <div
            role="tablist"
            aria-label="Scoresheet rounds"
            className="flex gap-1 overflow-x-auto pb-0.5"
          >
            {model.rounds.map((round, index) => {
              const selected = round.id === activeRoundId;
              return (
                <button
                  key={round.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveRoundId(round.id)}
                  className={[
                    "inline-flex shrink-0 flex-col items-center justify-center rounded-md px-3 py-1.5 transition",
                    selected
                      ? "bg-[var(--felt)] text-white shadow-sm"
                      : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]",
                  ].join(" ")}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em]">
                    Round
                  </span>
                  <span className="font-[family-name:var(--font-display)] text-base font-semibold tabular-nums leading-none">
                    {index + 1}
                  </span>
                  <span
                    className={[
                      "mt-0.5 text-[9px] font-semibold tabular-nums",
                      selected ? "text-white/75" : "text-[var(--muted)]",
                    ].join(" ")}
                  >
                    {round.games.length} game{round.games.length === 1 ? "" : "s"}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              className="inline-flex shrink-0 items-center justify-center rounded-md border border-dashed border-[var(--line-strong)] px-3 py-1.5 text-xs font-semibold text-[var(--felt-deep)] hover:bg-[var(--surface)]"
              onClick={addRound}
            >
              + Round
            </button>
          </div>
        </div>

        <div className="space-y-3 p-3 sm:p-4">
          {!activeRound ? (
            <p className="text-sm text-[var(--muted)]">
              No rounds yet. Add a round to start building games.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-[var(--ink)]">
                    Round {activeRoundIndex + 1}
                  </h3>
                  <p className="text-xs text-[var(--muted)]">
                    Edit games for this round only. Switch tabs for other rounds.
                  </p>
                </div>
                <button
                  type="button"
                  className={btnDelete}
                  disabled={model.rounds.length <= 1}
                  onClick={removeActiveRound}
                >
                  Remove round
                </button>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
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
                    onClick={() => addGame(kind)}
                  >
                    + {label}
                  </button>
                ))}
              </div>

              {activeRound.games.length === 0 ? (
                <p className="rounded-[var(--radius)] border border-dashed border-[var(--line)] px-3 py-6 text-center text-sm text-[var(--muted)]">
                  No games in this round yet. Add singles, race, or scotch.
                </p>
              ) : (
                <ul className="space-y-2">
                  {activeRound.games.map((game, gameIndex) => (
                    <GameCard
                      key={game.id}
                      game={game}
                      gameIndex={gameIndex}
                      roundId={activeRound.id}
                      allPlayerOptions={allPlayerOptions}
                      onUpdate={updateGame}
                      onRemove={() =>
                        updateRound(activeRound.id, (current) => ({
                          ...current,
                          games: current.games.filter((g) => g.id !== game.id),
                        }))
                      }
                    />
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </section>

      <div className="space-y-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[var(--shadow)] sm:p-4">
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

      <div className="sticky bottom-3 z-10 flex flex-wrap justify-end gap-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]/95 p-3 shadow-[var(--shadow)] backdrop-blur">
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
  );
}
