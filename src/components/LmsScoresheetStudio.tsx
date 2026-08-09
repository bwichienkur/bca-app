"use client";

import { useMemo, useState } from "react";
import {
  defaultFormatPicks,
  generateLeagueFormat,
  HANDICAP_MODE_OPTIONS,
  NIGHT_STYLE_OPTIONS,
  type FormatGeneratorPicks,
  type HandicapMode,
  type NightStyle,
} from "@/lib/format-generator";
import { FormatScoresheetPreview } from "./FormatScoresheetPreview";
import { SelectField } from "./SelectField";

const btnPrimary =
  "inline-flex items-center justify-center rounded-[var(--radius)] bg-[var(--felt)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50";
const btnGhost =
  "inline-flex items-center justify-center rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--ink)] disabled:opacity-50";
const inputClass =
  "w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none ring-[var(--felt)] focus:ring-2";

function ChoiceCard({
  selected,
  title,
  description,
  onClick,
}: {
  selected: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-[var(--radius)] border px-3 py-2.5 text-left transition",
        selected
          ? "border-[var(--felt)] bg-[color-mix(in_srgb,var(--felt)_12%,var(--surface))] shadow-sm"
          : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--felt)]/50",
      ].join(" ")}
    >
      <p className="text-sm font-semibold text-[var(--ink)]">{title}</p>
      <p className="mt-0.5 text-xs text-[var(--muted)]">{description}</p>
    </button>
  );
}

export function LmsScoresheetStudio() {
  const [picks, setPicks] = useState<FormatGeneratorPicks>(() =>
    defaultFormatPicks(),
  );
  const [showDsl, setShowDsl] = useState(false);
  const [paperOpen, setPaperOpen] = useState(false);
  const [copied, setCopied] = useState<"dsl" | "hints" | null>(null);

  const result = useMemo(() => generateLeagueFormat(picks), [picks]);

  const patch = (partial: Partial<FormatGeneratorPicks>) =>
    setPicks((prev) => {
      const next = { ...prev, ...partial };
      if (next.nightStyle === "doubles") next.playersPerTeam = 2;
      if (next.nightStyle === "tuesday-races" && next.handicapMode === "round-hc") {
        next.handicapMode = "r6-hot";
      }
      return next;
    });

  const copyText = async (text: string, which: "dsl" | "hints") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      // ignore
    }
  };

  const hintsText = [
    `NumberOfPlayers=${result.divisionHints.NumberOfPlayers}`,
    `NumberOfRounds=${result.divisionHints.NumberOfRounds}`,
    `PointsForWin=${result.divisionHints.PointsForWin}`,
    `UseHandicap=${result.divisionHints.UseHandicap}`,
    `HandicapMode=${result.divisionHints.HandicapMode}`,
    `MatchWinForRound=${result.divisionHints.MatchWinForRound}`,
    "",
    ...result.divisionHints.notes,
    "",
    "FormatTemplate:",
    result.dsl,
  ].join("\n");

  const playerOptions =
    picks.nightStyle === "doubles"
      ? [{ value: "2", label: "2 (doubles)" }]
      : [3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }));

  return (
    <section className="space-y-4">
      <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)]/50 px-3 py-2.5">
        <p className="text-sm font-semibold text-[var(--ink)]">
          Scoring & handicap format
        </p>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          Pick team size, night style, and handicap. We generate a consistent LMS
          scoresheet template plus the app scoring rules — so Score and Handicap
          tabs match what you put in LMS.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_1fr]">
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              Players per side
            </span>
            <SelectField
              aria-label="Players per side"
              value={String(picks.playersPerTeam)}
              options={playerOptions}
              onChange={(value) =>
                patch({ playersPerTeam: Number(value) || 4 })
              }
              disabled={picks.nightStyle === "doubles"}
            />
          </label>

          {picks.nightStyle === "matrix" || picks.nightStyle === "team-race" ? (
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                Game
              </span>
              <SelectField
                aria-label="Game ball"
                value={picks.gameBall ?? "9"}
                options={[
                  { value: "9", label: "9-Ball" },
                  { value: "8", label: "8-Ball" },
                ]}
                onChange={(value) =>
                  patch({ gameBall: value === "8" ? "8" : "9" })
                }
              />
            </label>
          ) : null}

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              Night style
            </p>
            <div className="grid gap-1.5">
              {NIGHT_STYLE_OPTIONS.map((option) => (
                <ChoiceCard
                  key={option.id}
                  selected={picks.nightStyle === option.id}
                  title={option.label}
                  description={option.description}
                  onClick={() =>
                    patch({ nightStyle: option.id as NightStyle })
                  }
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              Handicap
            </p>
            <div className="grid gap-1.5">
              {HANDICAP_MODE_OPTIONS.filter((option) => {
                if (
                  picks.nightStyle === "tuesday-races" &&
                  option.id === "round-hc"
                ) {
                  return false;
                }
                if (
                  picks.nightStyle === "matrix" &&
                  option.id === "r6-hot"
                ) {
                  return false;
                }
                return true;
              }).map((option) => (
                <ChoiceCard
                  key={option.id}
                  selected={picks.handicapMode === option.id}
                  title={option.label}
                  description={option.description}
                  onClick={() =>
                    patch({ handicapMode: option.id as HandicapMode })
                  }
                />
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]">
            <div className="border-b border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 sm:px-4">
              <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--felt-deep)]">
                {result.title}
              </p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                {result.scoringSummary}
              </p>
            </div>

            <ul className="space-y-1.5 border-b border-[var(--line)] px-3 py-3 text-sm text-[var(--ink)] sm:px-4">
              {result.bullets.map((bullet) => (
                <li key={bullet} className="flex gap-2">
                  <span className="text-[var(--felt)]" aria-hidden>
                    ·
                  </span>
                  <span className="min-w-0">{bullet}</span>
                </li>
              ))}
            </ul>

            <div className="space-y-3 px-3 py-3 sm:px-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                Night matchups
              </p>
              <div className="space-y-2">
                {result.matchups.map((block) => (
                  <div
                    key={block.round}
                    className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)]/40 px-3 py-2"
                  >
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--amber)]">
                      Round {block.round}
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {block.games.map((game, index) => (
                        <li
                          key={`${block.round}-${index}`}
                          className="flex flex-wrap items-center gap-2 text-sm"
                        >
                          <span className="font-medium text-[var(--ink)]">
                            {game.label}
                          </span>
                          <span className="rounded-md bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
                            {game.kind}
                          </span>
                          {game.raceLength ? (
                            <span className="rounded-md bg-[color-mix(in_srgb,var(--felt)_14%,transparent)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--felt-deep)]">
                              {picks.handicapMode === "r6-hot"
                                ? "Race from R6 Hot"
                                : `Race to ${game.raceLength}`}
                            </span>
                          ) : null}
                          <span className="text-[10px] font-semibold text-[var(--muted)]">
                            {game.homeBreaks ? "Home breaks" : "Away breaks"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-[var(--line)] px-3 py-3 sm:px-4">
              <button
                type="button"
                className={btnPrimary}
                onClick={() => void copyText(result.dsl, "dsl")}
              >
                {copied === "dsl" ? "DSL copied" : "Copy LMS template"}
              </button>
              <button
                type="button"
                className={btnGhost}
                onClick={() => void copyText(hintsText, "hints")}
              >
                {copied === "hints" ? "Hints copied" : "Copy LMS field hints"}
              </button>
              <button
                type="button"
                className={btnGhost}
                onClick={() => setShowDsl((v) => !v)}
              >
                {showDsl ? "Hide DSL" : "Show DSL"}
              </button>
              <button
                type="button"
                className={btnGhost}
                onClick={() => setPaperOpen(true)}
              >
                Paper-style preview
              </button>
            </div>

            {showDsl ? (
              <div className="border-t border-[var(--line)] px-3 py-3 sm:px-4">
                <textarea
                  readOnly
                  aria-label="Generated LMS format template"
                  className={`${inputClass} min-h-[14rem] font-mono text-xs leading-relaxed`}
                  value={result.dsl}
                />
              </div>
            ) : null}
          </div>

          <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-3 text-xs text-[var(--muted)] sm:px-4">
            <p className="font-semibold text-[var(--ink)]">How to use in LMS</p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-4">
              <li>Copy LMS template into Division → Format → advanced template.</li>
              <li>
                Set players / rounds / points / handicap from the hints (or paste
                the hint block).
              </li>
              <li>
                In the app, Score and Handicap follow the same night style when
                the division signals match (or set scoring format in Account).
              </li>
            </ol>
          </div>
        </div>
      </div>

      <FormatScoresheetPreview
        open={paperOpen}
        onClose={() => setPaperOpen(false)}
        model={result.model}
        title="Paper-style preview"
      />
    </section>
  );
}
