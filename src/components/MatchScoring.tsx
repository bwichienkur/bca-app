"use client";

import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import {
  applyQuickWin,
  applyRaceScore,
  buildVerticalMatchPayload,
  clearDraft,
  computeMatchHandicaps,
  emptyDraft,
  gameKey,
  gameWinner,
  loadDraft,
  MATCH_POINTS_ROUND,
  normalizeDraftScores,
  playerDisplayName,
  RACE_SCORE_OPTIONS,
  saveDraft,
  syncLineupToGames,
  tallyAllRoundPoints,
  tallyDraft,
  tallyMatchPointsRound,
  type GameScoreState,
  type RoundPointsTally,
  type ScoringDraft,
  type ScoringMatchDetail,
  type ScoringMatchSummary,
  type ScoringPlayer,
  type WinAdornment,
} from "@/lib/scoring";
import { EmptyState } from "./EmptyState";
import { LoadingState } from "./LoadingState";
import { PlayerSelect } from "./PlayerSelect";

type ScoringUser = {
  lmsId: string;
  readableId: string | null;
  name: string | null;
  email: string | null;
};

type MatchScoringProps = {
  divisionId: string | null;
  divisionName: string | null;
};

type View =
  | { mode: "list" }
  | { mode: "sheet"; matchId: string }
  | { mode: "review"; matchId: string };

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  if (!response.ok) {
    throw new Error(payload?.error || `Request failed (${response.status})`);
  }
  return payload as T;
}

function formatMatchDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function scoreLabel(game: GameScoreState | undefined): string {
  const s1 = game?.teamOneScore ?? 0;
  const s2 = game?.teamTwoScore ?? 0;
  const adorn = game?.winAdornment ?? "";
  const winner = gameWinner(game);
  if (adorn && winner) {
    return winner === 1 ? `${adorn} – ${s2}` : `${s1} – ${adorn}`;
  }
  return `${s1} – ${s2}`;
}

function ratingLabel(player: ScoringPlayer | null): string {
  if (!player || player.fargoRating == null) return "";
  return String(player.fargoRating);
}

function findPlayer(
  players: ScoringPlayer[],
  id: string | null,
): ScoringPlayer | null {
  if (!id) return null;
  return players.find((p) => p.id === id) ?? null;
}

export function MatchScoring({ divisionId, divisionName }: MatchScoringProps) {
  const [user, setUser] = useState<ScoringUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const [matches, setMatches] = useState<ScoringMatchSummary[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [view, setView] = useState<View>({ mode: "list" });
  const [match, setMatch] = useState<ScoringMatchDetail | null>(null);
  const [draft, setDraft] = useState<ScoringDraft | null>(null);
  const [loadingMatch, setLoadingMatch] = useState(false);
  const [activeRound, setActiveRound] = useState(1);
  const [activeGame, setActiveGame] = useState<{
    roundNumber: number;
    gameIndex: number;
  } | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [draftMatchIds, setDraftMatchIds] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();
  const saveTimerRef = useRef<number | null>(null);

  const scheduleSaveDraft = (next: ScoringDraft) => {
    if (saveTimerRef.current != null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveDraft(next);
      saveTimerRef.current = null;
    }, 280);
  };

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const data = await fetchJson<{ user: ScoringUser | null }>(
          "/api/scoring/session",
        );
        if (!cancelled) setUser(data.user);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setBooting(false);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user || !divisionId) {
      setMatches([]);
      return;
    }
    let cancelled = false;
    async function load() {
      setLoadingMatches(true);
      setListError(null);
      try {
        const data = await fetchJson<{ matches: ScoringMatchSummary[] }>(
          `/api/scoring/matches?divisionId=${encodeURIComponent(divisionId!)}`,
        );
        if (!cancelled) {
          setMatches(data.matches);
          const ids = new Set<string>();
          for (const item of data.matches) {
            if (loadDraft(item.id)) ids.add(item.id);
          }
          setDraftMatchIds(ids);
        }
      } catch (err) {
        if (!cancelled) {
          setListError(
            err instanceof Error ? err.message : "Failed to load matches.",
          );
        }
      } finally {
        if (!cancelled) setLoadingMatches(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [user, divisionId]);

  const openMatch = async (matchId: string) => {
    setLoadingMatch(true);
    setSheetError(null);
    setSubmitMessage(null);
    try {
      const data = await fetchJson<{ match: ScoringMatchDetail }>(
        `/api/scoring/matches/${matchId}`,
      );
      const saved = loadDraft(matchId);
      const nextDraft =
        saved && saved.matchId === matchId
          ? syncLineupToGames(normalizeDraftScores(saved), data.match)
          : emptyDraft(data.match);
      setMatch(data.match);
      setDraft(nextDraft);
      setActiveRound(data.match.matchFormat?.rounds[0]?.roundNumber ?? 1);
      setActiveGame(null);
      setView({ mode: "sheet", matchId });
      saveDraft(nextDraft);
      setDraftMatchIds((prev) => new Set(prev).add(matchId));
    } catch (err) {
      setListError(
        err instanceof Error ? err.message : "Failed to open match.",
      );
    } finally {
      setLoadingMatch(false);
    }
  };

  const updateDraft = (
    updater: (prev: ScoringDraft) => ScoringDraft,
    options?: { immediate?: boolean },
  ) => {
    setDraft((prev) => {
      if (!prev || !match) return prev;
      const next = updater(prev);
      if (options?.immediate) {
        if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
        saveDraft(next);
      } else {
        scheduleSaveDraft(next);
      }
      return next;
    });
  };

  const onLogin = async (event: FormEvent) => {
    event.preventDefault();
    setLoggingIn(true);
    setAuthError(null);
    try {
      const data = await fetchJson<{ user: ScoringUser }>(
        "/api/scoring/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        },
      );
      setUser(data.user);
      setPassword("");
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoggingIn(false);
    }
  };

  const onLogout = async () => {
    await fetch("/api/scoring/logout", { method: "POST" });
    setUser(null);
    setMatches([]);
    setMatch(null);
    setDraft(null);
    setView({ mode: "list" });
  };

  const totals = useMemo(
    () => (draft ? tallyDraft(draft) : null),
    [draft],
  );

  // Handicaps depend only on lineups — keep stable across score taps.
  const roundHandicaps = useMemo(
    () => (match && draft ? computeMatchHandicaps(match, draft) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lineup refs stay stable when only games change
    [match, draft?.teamOneLineup, draft?.teamTwoLineup],
  );

  const roundPointTallies = useMemo(
    () =>
      match && draft
        ? tallyAllRoundPoints(match, draft, roundHandicaps)
        : [],
    [match, draft, roundHandicaps],
  );

  const includeMatchPointsRound = match?.matchWinCountsAsRound !== false;

  const matchPointsTally = useMemo(() => {
    if (!match || !draft || !includeMatchPointsRound) return null;
    return tallyMatchPointsRound({
      match,
      draft,
      roundTallies: roundPointTallies,
    });
  }, [draft, includeMatchPointsRound, match, roundPointTallies]);

  const isMatchPointsRound = activeRound === MATCH_POINTS_ROUND;

  const activeRoundPoints = useMemo(() => {
    if (isMatchPointsRound) return matchPointsTally;
    return (
      roundPointTallies.find((item) => item.roundNumber === activeRound) ??
      null
    );
  }, [
    activeRound,
    isMatchPointsRound,
    matchPointsTally,
    roundPointTallies,
  ]);

  const handicapTotals = useMemo(() => {
    return roundHandicaps.reduce(
      (acc, round) => ({
        teamOne: acc.teamOne + round.teamOne,
        teamTwo: acc.teamTwo + round.teamTwo,
      }),
      { teamOne: 0, teamTwo: 0 },
    );
  }, [roundHandicaps]);

  const roundWins = useMemo(() => {
    let teamOne = 0;
    let teamTwo = 0;
    for (const round of roundPointTallies) {
      if (round.roundWinner === 1) teamOne += 1;
      if (round.roundWinner === 2) teamTwo += 1;
    }
    if (matchPointsTally?.roundWinner === 1) teamOne += 1;
    if (matchPointsTally?.roundWinner === 2) teamTwo += 1;
    return { teamOne, teamTwo };
  }, [matchPointsTally, roundPointTallies]);

  // Live point totals from R1–R5 only (R6 is awarded later, not a separate sum).
  const matchPointTotals = useMemo(
    () =>
      roundPointTallies.reduce(
        (acc, round) => ({
          teamOne: acc.teamOne + round.teamOneTotal,
          teamTwo: acc.teamTwo + round.teamTwoTotal,
        }),
        { teamOne: 0, teamTwo: 0 },
      ),
    [roundPointTallies],
  );

  const rounds = match?.matchFormat?.rounds ?? [];
  const roundsAvailable =
    rounds.length + (includeMatchPointsRound ? 1 : 0);
  const currentRound = isMatchPointsRound
    ? null
    : (rounds.find((round) => round.roundNumber === activeRound) ??
      rounds[0]);

  const padGame =
    activeGame && draft
      ? draft.games[gameKey(activeGame.roundNumber, activeGame.gameIndex)]
      : null;

  const setGameScore = (
    roundNumber: number,
    gameIndex: number,
    next: GameScoreState,
  ) => {
    // Keep the score pad snappy; heavy sheet recalcs can land in a transition.
    startTransition(() => {
      updateDraft((prev) => ({
        ...prev,
        games: {
          ...prev.games,
          [gameKey(roundNumber, gameIndex)]: next,
        },
      }));
    });
  };

  const submitMatch = async () => {
    if (!match || !draft || !user) return;
    setSubmitting(true);
    setSheetError(null);
    setSubmitMessage(null);
    try {
      const payload = buildVerticalMatchPayload({
        match,
        draft,
        scoreKeeper: user.lmsId,
      });
      const result = await fetchJson<{
        ok: boolean;
        verifiedPlayed: boolean | null;
      }>("/api/scoring/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload }),
      });

      if (result.verifiedPlayed) {
        clearDraft(match.id);
        setSubmitMessage("Match submitted to LMS.");
        setView({ mode: "list" });
        setMatch(null);
        setDraft(null);
        // refresh list
        if (divisionId) {
          const data = await fetchJson<{ matches: ScoringMatchSummary[] }>(
            `/api/scoring/matches?divisionId=${encodeURIComponent(divisionId)}`,
          );
          setMatches(data.matches);
        }
      } else {
        setSubmitMessage(
          "LMS accepted the request, but the match still shows as unscored. Double-check the scoresheet in LMS before leaving the table.",
        );
      }
    } catch (err) {
      setSheetError(err instanceof Error ? err.message : "Submit failed.");
    } finally {
      setSubmitting(false);
    }
  };

  if (booting) {
    return <LoadingState label="Checking scoring session…" />;
  }

  if (!user) {
    return (
      <section className="animate-rise mx-auto max-w-lg space-y-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--amber)]">
            Score
          </p>
          <h3 className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--felt-deep)]">
            Tableside scoring
          </h3>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Sign in with your FargoRate / BCAPL account to score your matches
            and submit them to LMS.
          </p>
        </div>

        <form
          onSubmit={onLogin}
          className="space-y-4 rounded-[1.4rem] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm"
        >
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              Email
            </span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-3 outline-none ring-[var(--felt)] focus:ring-2"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              Password
            </span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-3 outline-none ring-[var(--felt)] focus:ring-2"
            />
          </label>
          {authError ? (
            <p className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger)]">
              {authError}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={loggingIn}
            className="w-full rounded-xl bg-[var(--felt)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--felt-soft)] disabled:opacity-60"
          >
            {loggingIn ? "Signing in…" : "Sign in to score"}
          </button>
        </form>
      </section>
    );
  }

  if (!divisionId) {
    return (
      <EmptyState
        title="Choose a division to score"
        body="Pick your division above, then open Score to see your upcoming matches."
      />
    );
  }

  if (view.mode !== "list" && (loadingMatch || !match || !draft)) {
    return <LoadingState label="Opening scoresheet…" />;
  }

  if (view.mode !== "list" && match && draft) {
    const reviewMode = view.mode === "review";
    const actionBtnClass =
      "rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)]";
    return (
      <section className="animate-panel w-full min-w-0 space-y-2.5 overflow-x-hidden">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              if (reviewMode) {
                setView({ mode: "sheet", matchId: match.id });
              } else {
                setView({ mode: "list" });
                setActiveGame(null);
              }
            }}
            className={actionBtnClass}
          >
            {reviewMode ? "← Back to sheet" : "← Matches"}
          </button>
          <button
            type="button"
            onClick={() => void onLogout()}
            className={actionBtnClass}
          >
            Sign out
          </button>
        </div>

        <MatchScoreboard
          dateLabel={formatMatchDate(match.datePlayed)}
          location={match.location}
          teamOneName={match.teamOneName}
          teamTwoName={match.teamTwoName}
          mySide={match.mySide}
          roundWins={roundWins}
          roundsAvailable={roundsAvailable}
          includeMatchPointsRound={includeMatchPointsRound}
          pointTotals={matchPointTotals}
          gameWins={{
            teamOne: totals?.teamOneWins ?? 0,
            teamTwo: totals?.teamTwoWins ?? 0,
          }}
          gamesPlayed={totals?.scored ?? 0}
          gamesTotal={totals?.total ?? 0}
          isHandicapped={match.isHandicapped}
          handicapTotals={handicapTotals}
        />

        {sheetError ? (
          <p className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger)]">
            {sheetError}
          </p>
        ) : null}
        {submitMessage ? (
          <p className="rounded-xl border border-[var(--felt)]/35 bg-[color-mix(in_srgb,var(--felt)_18%,transparent)] px-3 py-2 text-sm text-[var(--felt-deep)]">
            {submitMessage}
          </p>
        ) : null}

        {match.hasBeenPlayed ? (
          <p className="rounded-xl border border-[var(--amber)]/35 bg-[color-mix(in_srgb,var(--amber)_12%,transparent)] px-3 py-2 text-sm text-[var(--amber)]">
            LMS already has a scoresheet for this match. You can still review
            locally, but submit may be rejected.
          </p>
        ) : null}

        {reviewMode ? (
          <ReviewPanel
            match={match}
            draft={draft}
            submitting={submitting}
            onEdit={() => setView({ mode: "sheet", matchId: match.id })}
            onSubmit={() => void submitMatch()}
          />
        ) : (
          <div className="grid w-full min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="w-full min-w-0 space-y-4 overflow-x-hidden">
              <LineupEditor
                match={match}
                draft={draft}
                onChangeLineup={(side, index, playerId) => {
                  updateDraft((prev) => {
                    const lineupKey =
                      side === 1 ? "teamOneLineup" : "teamTwoLineup";
                    const nextLineup = [...prev[lineupKey]];
                    nextLineup[index] = playerId;
                    return syncLineupToGames(
                      { ...prev, [lineupKey]: nextLineup },
                      match,
                    );
                  });
                }}
                onMoveLineup={(side, from, to) => {
                  updateDraft((prev) => {
                    const lineupKey =
                      side === 1 ? "teamOneLineup" : "teamTwoLineup";
                    const nextLineup = [...prev[lineupKey]];
                    if (
                      from < 0 ||
                      to < 0 ||
                      from >= nextLineup.length ||
                      to >= nextLineup.length ||
                      from === to
                    ) {
                      return prev;
                    }
                    const [item] = nextLineup.splice(from, 1);
                    nextLineup.splice(to, 0, item);
                    return syncLineupToGames(
                      { ...prev, [lineupKey]: nextLineup },
                      match,
                    );
                  });
                }}
              />

              <div
                className={[
                  "grid gap-1",
                  includeMatchPointsRound ? "grid-cols-6" : "grid-cols-5",
                ].join(" ")}
              >
                {rounds.map((round) => {
                  const active = round.roundNumber === activeRound;
                  const tally =
                    roundPointTallies.find(
                      (item) => item.roundNumber === round.roundNumber,
                    ) ?? null;
                  const done = tally?.gamesComplete ?? 0;
                  const decided = tally?.roundWinner != null;
                  const winnerLabel = decided
                    ? tally!.roundWinner === match.mySide
                      ? "W"
                      : match.mySide
                        ? "L"
                        : tally!.roundWinner === 1
                          ? "H"
                          : "A"
                    : tally?.roundComplete
                      ? "T"
                      : null;
                  return (
                    <button
                      key={round.roundNumber}
                      type="button"
                      onClick={() => {
                        startTransition(() => {
                          setActiveRound(round.roundNumber);
                          setActiveGame(null);
                        });
                      }}
                      className={[
                        "min-w-0 rounded-xl px-0.5 py-1.5 text-center transition",
                        active
                          ? "bg-[var(--felt)] text-white shadow-sm"
                          : decided && tally!.roundWinner === match.mySide
                            ? "bg-[color-mix(in_srgb,var(--felt)_22%,var(--surface))] text-[var(--felt-deep)]"
                            : decided &&
                                match.mySide &&
                                tally!.roundWinner !== match.mySide
                              ? "bg-[color-mix(in_srgb,var(--danger)_16%,var(--surface))] text-[var(--danger)]"
                              : "bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--surface-2)]",
                      ].join(" ")}
                    >
                      <span className="block text-[11px] font-semibold leading-none">
                        R{round.roundNumber}
                      </span>
                      <span className="mt-0.5 block truncate text-[9px] font-semibold tabular-nums leading-none opacity-80">
                        {winnerLabel ?? `${done}/${round.games.length}`}
                      </span>
                    </button>
                  );
                })}
                {includeMatchPointsRound && matchPointsTally ? (
                  <button
                    type="button"
                    onClick={() => {
                      startTransition(() => {
                        setActiveRound(MATCH_POINTS_ROUND);
                        setActiveGame(null);
                      });
                    }}
                    className={[
                      "min-w-0 rounded-xl px-0.5 py-1.5 text-center transition",
                      isMatchPointsRound
                        ? "bg-[var(--felt)] text-white shadow-sm"
                        : matchPointsTally.roundWinner === match.mySide
                          ? "bg-[color-mix(in_srgb,var(--felt)_22%,var(--surface))] text-[var(--felt-deep)]"
                          : match.mySide &&
                              matchPointsTally.roundWinner &&
                              matchPointsTally.roundWinner !== match.mySide
                            ? "bg-[color-mix(in_srgb,var(--danger)_16%,var(--surface))] text-[var(--danger)]"
                            : "bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--surface-2)]",
                    ].join(" ")}
                  >
                    <span className="block text-[11px] font-semibold leading-none">
                      R6
                    </span>
                    <span className="mt-0.5 block truncate text-[9px] font-semibold tabular-nums leading-none opacity-80">
                      {matchPointsTally.roundWinner
                        ? matchPointsTally.roundWinner === match.mySide
                          ? "W"
                          : match.mySide
                            ? "L"
                            : matchPointsTally.roundWinner === 1
                              ? "H"
                              : "A"
                        : matchPointsTally.roundComplete
                          ? "T"
                          : `${matchPointsTally.gamesComplete}/${matchPointsTally.gamesTotal}`}
                    </span>
                  </button>
                ) : null}
              </div>

              {activeRoundPoints ? (
                <RoundPointsBoard
                  tally={activeRoundPoints}
                  teamOneName={match.teamOneName}
                  teamTwoName={match.teamTwoName}
                  mySide={match.mySide}
                  isHandicapped={match.isHandicapped}
                  matchPointsRound={isMatchPointsRound}
                />
              ) : null}

              {isMatchPointsRound ? (
                <p className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--muted)]">
                  Round 6 is total points across all games (plus handicap). It
                  is only awarded when the other team can no longer catch up —
                  win ≤{match.maxScore || 10} pts / loss ≤
                  {match.maxLosingScore >= 0 ? match.maxLosingScore : 7} pts
                  per game. Points ties break on game wins.
                </p>
              ) : (
                <div className="min-w-0 space-y-1.5">
                  {currentRound?.games.map((game) => {
                    const state =
                      draft.games[
                        gameKey(currentRound.roundNumber, game.index)
                      ];
                    const p1 = findPlayer(
                      match.teamOnePlayers,
                      state?.teamOnePlayerId ?? null,
                    );
                    const p2 = findPlayer(
                      match.teamTwoPlayers,
                      state?.teamTwoPlayerId ?? null,
                    );
                    const selected =
                      activeGame?.roundNumber === currentRound.roundNumber &&
                      activeGame?.gameIndex === game.index;
                    const winner = gameWinner(state);
                    const complete = winner != null;
                    return (
                      <button
                        key={game.index}
                        type="button"
                        onClick={() =>
                          setActiveGame({
                            roundNumber: currentRound.roundNumber,
                            gameIndex: game.index,
                          })
                        }
                        className={[
                          "w-full min-w-0 overflow-hidden rounded-xl border px-2.5 py-2 text-left transition sm:px-3",
                          selected
                            ? "border-[var(--felt)] bg-[color-mix(in_srgb,var(--felt)_14%,var(--surface))]"
                            : complete
                              ? "border-[var(--felt)]/35 bg-[var(--surface)]"
                              : "border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--surface-2)]",
                        ].join(" ")}
                      >
                        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                          <div className="min-w-0 overflow-hidden">
                            <p
                              className={[
                                "truncate text-[13px] font-semibold leading-snug sm:text-sm",
                                winner === 1
                                  ? "text-[var(--felt-deep)]"
                                  : "text-[var(--ink)]",
                              ].join(" ")}
                            >
                              {p1
                                ? playerDisplayName(p1)
                                : `H${game.playerOne.index}`}
                            </p>
                            <p className="truncate text-[10px] leading-tight text-[var(--muted)] sm:text-[11px]">
                              {ratingLabel(p1) ? (
                                <span className="font-semibold text-[var(--felt)]">
                                  {ratingLabel(p1)}
                                </span>
                              ) : (
                                "—"
                              )}
                              {state?.breakingTeam === 1 ? " · Breaks" : ""}
                            </p>
                          </div>
                          <div className="shrink-0 rounded-lg bg-[var(--surface-2)] px-2.5 py-1 text-center">
                            <p className="text-sm font-semibold tabular-nums leading-none">
                              {scoreLabel(state)}
                            </p>
                            <p className="mt-0.5 text-[9px] uppercase tracking-[0.12em] text-[var(--muted)]">
                              {complete ? "Final" : `G${game.index}`}
                            </p>
                          </div>
                          <div className="min-w-0 overflow-hidden text-right">
                            <p
                              className={[
                                "truncate text-[13px] font-semibold leading-snug sm:text-sm",
                                winner === 2
                                  ? "text-[var(--felt-deep)]"
                                  : "text-[var(--ink)]",
                              ].join(" ")}
                            >
                              {p2
                                ? playerDisplayName(p2)
                                : `A${game.playerTwo.index}`}
                            </p>
                            <p className="truncate text-[10px] leading-tight text-[var(--muted)] sm:text-[11px]">
                              {ratingLabel(p2) ? (
                                <span className="font-semibold text-[var(--felt)]">
                                  {ratingLabel(p2)}
                                </span>
                              ) : (
                                "—"
                              )}
                              {state?.breakingTeam === 2 ? " · Breaks" : ""}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setView({ mode: "review", matchId: match.id })}
                  className="rounded-xl bg-[var(--felt)] px-4 py-3 text-sm font-semibold text-white"
                >
                  Review & submit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!match) return;
                    const fresh = emptyDraft(match);
                    setDraft(fresh);
                    saveDraft(fresh);
                  }}
                  className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm font-semibold text-[var(--muted)]"
                >
                  Reset sheet
                </button>
              </div>
            </div>

            <ScorePad
              open={Boolean(activeGame && padGame)}
              match={match}
              game={padGame}
              roundNumber={activeGame?.roundNumber ?? activeRound}
              gameIndex={activeGame?.gameIndex ?? 1}
              onClose={() => setActiveGame(null)}
              onChange={(next) => {
                if (!activeGame) return;
                setGameScore(
                  activeGame.roundNumber,
                  activeGame.gameIndex,
                  next,
                );
              }}
            />
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="animate-rise space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--amber)]">
            Score
          </p>
          <h3 className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--felt-deep)]">
            Your matches
          </h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Signed in as{" "}
            <span className="font-medium text-[var(--ink)]">
              {user.name ?? user.email ?? "Player"}
            </span>
            {divisionName ? (
              <>
                {" "}
                · {divisionName}
              </>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void onLogout()}
          className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)]"
        >
          Sign out
        </button>
      </div>

      {listError ? (
        <p className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger)]">
          {listError}
        </p>
      ) : null}
      {submitMessage ? (
        <p className="rounded-xl border border-[var(--felt)]/35 bg-[color-mix(in_srgb,var(--felt)_18%,transparent)] px-3 py-2 text-sm text-[var(--felt-deep)]">
          {submitMessage}
        </p>
      ) : null}

      {loadingMatches ? (
        <LoadingState label="Loading your matches…" />
      ) : matches.length === 0 ? (
        <EmptyState
          title="No matches for your teams"
          body="When your team is scheduled in this division, those matches will show up here ready to score."
        />
      ) : (
        <div className="space-y-2">
          {matches.map((item, index) => {
            const draftExists = draftMatchIds.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => void openMatch(item.id)}
                className="animate-rise flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3.5 text-left transition hover:bg-[var(--surface-2)]"
                style={{ animationDelay: `${Math.min(index, 6) * 0.04}s` }}
              >
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--amber)]">
                    {formatMatchDate(item.datePlayed)} · {item.location}
                  </p>
                  <p className="mt-1 truncate font-[family-name:var(--font-display)] text-lg text-[var(--ink)]">
                    {item.teamOneName}{" "}
                    <span className="text-[var(--muted)]">vs</span>{" "}
                    {item.teamTwoName}
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {item.hasBeenPlayed
                      ? "Submitted on LMS"
                      : draftExists
                        ? "Draft in progress"
                        : "Ready to score"}
                    {item.mySide ? " · Your match" : null}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-[var(--felt)] px-3 py-1.5 text-xs font-semibold text-white">
                  {item.hasBeenPlayed ? "View" : "Score"}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

const MatchScoreboard = memo(function MatchScoreboard({
  dateLabel,
  location,
  teamOneName,
  teamTwoName,
  mySide,
  roundWins,
  roundsAvailable,
  includeMatchPointsRound,
  pointTotals,
  gameWins,
  gamesPlayed,
  gamesTotal,
  isHandicapped,
  handicapTotals,
}: {
  dateLabel: string;
  location: string;
  teamOneName: string;
  teamTwoName: string;
  mySide: 1 | 2 | null;
  roundWins: { teamOne: number; teamTwo: number };
  roundsAvailable: number;
  includeMatchPointsRound: boolean;
  pointTotals: { teamOne: number; teamTwo: number };
  gameWins: { teamOne: number; teamTwo: number };
  gamesPlayed: number;
  gamesTotal: number;
  isHandicapped: boolean;
  handicapTotals: { teamOne: number; teamTwo: number };
}) {
  const roundsDecided = roundWins.teamOne + roundWins.teamTwo;
  const progress =
    gamesTotal > 0 ? Math.min(1, gamesPlayed / gamesTotal) : 0;

  const teamHeader = (side: 1 | 2, name: string, align: "left" | "right") => {
    const mine = mySide === side;
    return (
      <div
        className={[
          "min-w-0",
          align === "right" ? "text-right" : "text-left",
        ].join(" ")}
      >
        <p className="font-[family-name:var(--font-display)] text-[15px] leading-snug break-words sm:text-lg">
          {name.trim()}
        </p>
        <p
          className={[
            "mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
            mine ? "text-[var(--amber)]" : "text-white/50",
          ].join(" ")}
        >
          {mine ? "Your team" : side === 1 ? "Home" : "Away"}
        </p>
      </div>
    );
  };

  const metricRow = ({
    label,
    one,
    two,
    emphasis,
    hint,
  }: {
    label: string;
    one: number;
    two: number;
    emphasis: "hero" | "secondary" | "tertiary";
    hint?: string;
  }) => {
    const oneLeads = one > two;
    const twoLeads = two > one;
    const valueClass =
      emphasis === "hero"
        ? "font-[family-name:var(--font-display)] text-[2.35rem] leading-none tracking-tight sm:text-[2.75rem]"
        : emphasis === "secondary"
          ? "font-[family-name:var(--font-display)] text-[1.35rem] leading-none tabular-nums sm:text-[1.55rem]"
          : "text-sm font-semibold leading-none tabular-nums sm:text-[15px]";
    const leadClass = "text-white";
    const trailClass =
      emphasis === "hero" ? "text-white/70" : "text-white/55";
    const labelClass =
      emphasis === "hero"
        ? "text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--amber)]"
        : emphasis === "secondary"
          ? "text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55"
          : "text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40";

    return (
      <div
        className={[
          "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2",
          emphasis === "hero" ? "py-1" : emphasis === "secondary" ? "pt-2.5" : "pt-1.5",
        ].join(" ")}
      >
        <div className="min-w-0 text-right">
          <p
            className={[
              "tabular-nums",
              valueClass,
              oneLeads ? leadClass : trailClass,
            ].join(" ")}
          >
            {one}
          </p>
        </div>
        <div className="flex w-[4.5rem] flex-col items-center justify-center text-center sm:w-20">
          <p className={labelClass}>{label}</p>
          {hint ? (
            <p className="mt-0.5 text-[9px] tabular-nums text-white/40">
              {hint}
            </p>
          ) : null}
        </div>
        <div className="min-w-0 text-left">
          <p
            className={[
              "tabular-nums",
              valueClass,
              twoLeads ? leadClass : trailClass,
            ].join(" ")}
          >
            {two}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full overflow-hidden rounded-[1.35rem] border border-[var(--line)] bg-[linear-gradient(145deg,rgba(24,102,74,0.98),rgba(11,52,38,0.99))] px-3 py-3 text-white shadow-[var(--shadow)] sm:px-4 md:px-5 md:py-3.5">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-[11px] uppercase tracking-[0.14em] text-white/60">
          {dateLabel}
          {location ? ` · ${location}` : ""}
        </p>
        {includeMatchPointsRound ? (
          <p className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">
            R1–5 + pts
          </p>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        {teamHeader(1, teamOneName, "left")}
        {teamHeader(2, teamTwoName, "right")}
      </div>

      <div className="mt-3 rounded-2xl bg-black/30 px-2.5 py-2.5 ring-1 ring-white/10 sm:px-3.5 sm:py-3">
        {metricRow({
          label: "Rounds",
          one: roundWins.teamOne,
          two: roundWins.teamTwo,
          emphasis: "hero",
          hint:
            roundsAvailable > 0
              ? `${roundsDecided}/${roundsAvailable}`
              : undefined,
        })}

        <div className="mx-auto mt-2 h-px w-[min(100%,16rem)] bg-gradient-to-r from-transparent via-white/18 to-transparent" />

        {metricRow({
          label: "Points",
          one: pointTotals.teamOne,
          two: pointTotals.teamTwo,
          emphasis: "secondary",
        })}

        {metricRow({
          label: "Games",
          one: gameWins.teamOne,
          two: gameWins.teamTwo,
          emphasis: "tertiary",
        })}
      </div>

      <div className="mt-2.5 space-y-1.5">
        <div className="h-1 overflow-hidden rounded-full bg-black/35">
          <div
            className="h-full rounded-full bg-[color-mix(in_srgb,var(--amber)_75%,white)] transition-[width] duration-300"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[10px] tabular-nums text-white/55">
          <p>
            {gamesPlayed}/{gamesTotal} games scored
          </p>
          {isHandicapped &&
          (handicapTotals.teamOne > 0 || handicapTotals.teamTwo > 0) ? (
            <p>
              HC {handicapTotals.teamOne}–{handicapTotals.teamTwo}
            </p>
          ) : (
            <p className="text-white/35">Match scoreboard</p>
          )}
        </div>
      </div>
    </div>
  );
});

const RoundPointsBoard = memo(function RoundPointsBoard({
  tally,
  teamOneName,
  teamTwoName,
  mySide,
  isHandicapped,
  matchPointsRound = false,
}: {
  tally: RoundPointsTally;
  teamOneName: string;
  teamTwoName: string;
  mySide: 1 | 2 | null;
  isHandicapped: boolean;
  matchPointsRound?: boolean;
}) {
  const label = matchPointsRound ? "match points" : "the round";
  const gamesLeft = tally.gamesRemaining;
  const resultLabel = (() => {
    if (tally.roundWinner) {
      const clinchSuffix =
        tally.clinchedEarly && gamesLeft > 0
          ? ` · clinched (${gamesLeft} game${gamesLeft === 1 ? "" : "s"} left)`
          : "";
      if (mySide && tally.roundWinner === mySide) {
        return `We won ${label}${clinchSuffix}`;
      }
      if (mySide && tally.roundWinner !== mySide) {
        return `Opponent won ${label}${clinchSuffix}`;
      }
      const name =
        tally.roundWinner === 1
          ? teamOneName.trim()
          : teamTwoName.trim();
      return `${name} won ${label}${clinchSuffix}`;
    }
    if (tally.roundComplete) {
      return matchPointsRound
        ? "Match points tied on points and games"
        : "Round tied on points and games";
    }
    return matchPointsRound
      ? `${tally.gamesComplete}/${tally.gamesTotal} games scored across rounds`
      : `${tally.gamesComplete}/${tally.gamesTotal} games scored`;
  })();

  const resultTone = tally.roundWinner
    ? mySide && tally.roundWinner === mySide
      ? "text-[var(--felt-deep)]"
      : mySide
        ? "text-[var(--danger)]"
        : "text-[var(--felt-deep)]"
    : tally.roundComplete
      ? "text-[var(--amber)]"
      : "text-[var(--muted)]";

  const chaseLine = (() => {
    if (tally.roundWinner || gamesLeft <= 0) return null;
    const formatNeed = (side: 1 | 2, name: string) => {
      const need =
        side === 1 ? tally.pointsNeeded.teamOne : tally.pointsNeeded.teamTwo;
      if (need == null) return null;
      const maxAvail = gamesLeft * tally.maxWinPoints;
      if (need > maxAvail) {
        return `${name}: can’t catch up`;
      }
      return `${name}: need ${need} pt${need === 1 ? "" : "s"}`;
    };
    const one = formatNeed(1, mySide === 1 ? "You" : "Home");
    const two = formatNeed(2, mySide === 2 ? "You" : "Away");
    const parts = [one, two].filter(Boolean);
    if (!parts.length) return null;
    return `${parts.join(" · ")} from ${gamesLeft} game${gamesLeft === 1 ? "" : "s"} (win ≤${tally.maxWinPoints} / loss ≤${tally.maxLossPoints})`;
  })();

  const sideCard = (
    side: 1 | 2,
    name: string,
    gamePoints: number,
    handicap: number,
    total: number,
    gameWins: number,
  ) => {
    const won = tally.roundWinner === side;
    const isMine = mySide === side;
    const need =
      side === 1 ? tally.pointsNeeded.teamOne : tally.pointsNeeded.teamTwo;
    return (
      <div
        className={[
          "min-w-0 overflow-hidden rounded-xl px-2.5 py-2",
          won
            ? "bg-[color-mix(in_srgb,var(--felt)_22%,var(--surface-2))]"
            : "bg-[var(--surface-2)]",
        ].join(" ")}
      >
        <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
          {isMine ? "Your team" : side === 1 ? "Home" : "Away"}
        </p>
        <p className="mt-0.5 truncate text-xs font-semibold text-[var(--ink)] sm:text-sm">
          {name.trim()}
        </p>
        <p className="mt-1.5 font-[family-name:var(--font-display)] text-2xl tabular-nums leading-none text-[var(--felt-deep)]">
          {total}
        </p>
        <p className="mt-0.5 text-[11px] tabular-nums text-[var(--muted)]">
          {gamePoints} pts
          {isHandicapped ? (
            handicap > 0 ? (
              <span className="text-[var(--amber)]"> +{handicap} HC</span>
            ) : (
              <span> +0 HC</span>
            )
          ) : null}
          <span className="text-[var(--muted)]"> · {gameWins}g</span>
        </p>
        {!tally.roundWinner && need != null && gamesLeft > 0 ? (
          <p
            className={[
              "mt-1 text-[11px] font-semibold",
              need > gamesLeft * tally.maxWinPoints
                ? "text-[var(--danger)]"
                : "text-[var(--amber)]",
            ].join(" ")}
          >
            {need > gamesLeft * tally.maxWinPoints
              ? "Can’t catch up"
              : `Need ${need} pt${need === 1 ? "" : "s"}`}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <div
      className={[
        "w-full min-w-0 overflow-hidden rounded-2xl border px-3 py-2.5 sm:px-4",
        tally.roundWinner
          ? tally.roundWinner === mySide
            ? "border-[var(--felt)]/45 bg-[color-mix(in_srgb,var(--felt)_12%,var(--surface))]"
            : mySide
              ? "border-[var(--danger)]/35 bg-[color-mix(in_srgb,var(--danger)_10%,var(--surface))]"
              : "border-[var(--felt)]/35 bg-[var(--surface)]"
          : "border-[var(--line)] bg-[var(--surface)]",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--amber)]">
            {matchPointsRound
              ? "Match points (R6)"
              : `Round ${tally.roundNumber} points`}
          </p>
          <p className={["mt-0.5 text-sm font-semibold", resultTone].join(" ")}>
            {resultLabel}
          </p>
        </div>
        <div className="rounded-full bg-[var(--surface-2)] px-3 py-1 text-sm font-semibold tabular-nums text-[var(--ink)]">
          {tally.teamOneTotal}–{tally.teamTwoTotal}
        </div>
      </div>

      {chaseLine ? (
        <p className="mt-2 text-[11px] leading-snug text-[var(--muted)]">
          {chaseLine}
        </p>
      ) : null}

      <div className="mt-2 grid grid-cols-2 gap-2">
        {sideCard(
          1,
          teamOneName,
          tally.teamOneGamePoints,
          tally.teamOneHandicap,
          tally.teamOneTotal,
          tally.teamOneGameWins,
        )}
        {sideCard(
          2,
          teamTwoName,
          tally.teamTwoGamePoints,
          tally.teamTwoHandicap,
          tally.teamTwoTotal,
          tally.teamTwoGameWins,
        )}
      </div>

      {isHandicapped &&
      (tally.teamOneHandicap > 0 || tally.teamTwoHandicap > 0) ? (
        <p className="mt-1.5 text-[11px] text-[var(--muted)]">
          {tally.teamOneHandicap > 0
            ? `${teamOneName.trim()} handicap +${tally.teamOneHandicap} included in total`
            : `${teamTwoName.trim()} handicap +${tally.teamTwoHandicap} included in total`}
        </p>
      ) : null}

      {tally.roundComplete &&
      !tally.roundWinner &&
      tally.teamOneTotal === tally.teamTwoTotal ? (
        <p className="mt-1.5 text-[11px] text-[var(--muted)]">
          Points tied {tally.teamOneTotal}–{tally.teamTwoTotal}; game wins also
          tied {tally.teamOneGameWins}–{tally.teamTwoGameWins}.
        </p>
      ) : null}
    </div>
  );
});

function LineupEditor({
  match,
  draft,
  onChangeLineup,
  onMoveLineup,
}: {
  match: ScoringMatchDetail;
  draft: ScoringDraft;
  onChangeLineup: (
    side: 1 | 2,
    index: number,
    playerId: string | null,
  ) => void;
  onMoveLineup: (side: 1 | 2, from: number, to: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const slots = Math.max(
    draft.teamOneLineup.length,
    draft.teamTwoLineup.length,
    5,
  );
  const filledOne = draft.teamOneLineup.filter(Boolean).length;
  const filledTwo = draft.teamTwoLineup.filter(Boolean).length;

  return (
    <div className="min-w-0 space-y-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full min-w-0 items-center justify-between gap-3 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3 text-left sm:px-4"
      >
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--amber)]">
            Lineups
          </p>
          <p className="mt-0.5 text-xs text-[var(--muted)] sm:text-sm">
            {filledOne + filledTwo}/{slots * 2} filled · ▲▼ to reorder
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
          {open ? "Collapse ▴" : "Change ▾"}
        </span>
      </button>
      {open ? (
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          <ScoringLineupSide
            title={match.teamOneName}
            subtitle={`Home · H1–H${slots}`}
            prefix="H"
            players={match.teamOnePlayers}
            lineup={draft.teamOneLineup}
            onChange={(index, id) => onChangeLineup(1, index, id)}
            onMove={(from, to) => onMoveLineup(1, from, to)}
          />
          <ScoringLineupSide
            title={match.teamTwoName}
            subtitle={`Away · A1–A${slots}`}
            prefix="A"
            players={match.teamTwoPlayers}
            lineup={draft.teamTwoLineup}
            onChange={(index, id) => onChangeLineup(2, index, id)}
            onMove={(from, to) => onMoveLineup(2, from, to)}
          />
        </div>
      ) : null}
    </div>
  );
}

function ScoringLineupSide({
  title,
  subtitle,
  prefix,
  players,
  lineup,
  onChange,
  onMove,
}: {
  title: string;
  subtitle: string;
  prefix: string;
  players: ScoringPlayer[];
  lineup: (string | null)[];
  onChange: (index: number, playerId: string | null) => void;
  onMove: (from: number, to: number) => void;
}) {
  const slots = lineup.length;
  const filled = lineup.filter(Boolean).length;
  const sortedRoster = useMemo(
    () =>
      [...players]
        .filter((player) => player.showOnRoster !== false)
        .sort((a, b) => (b.fargoRating ?? 0) - (a.fargoRating ?? 0)),
    [players],
  );
  const options = useMemo(
    () =>
      sortedRoster.map((player) => ({
        id: player.id,
        label: playerDisplayName(player),
        rating: player.fargoRating,
      })),
    [sortedRoster],
  );

  return (
    <div className="min-w-0 overflow-hidden rounded-[1.3rem] border border-[var(--line)] bg-[var(--surface)] p-3 shadow-sm sm:p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 overflow-hidden">
          <h4 className="truncate font-[family-name:var(--font-display)] text-lg text-[var(--felt-deep)]">
            {title}
          </h4>
          <p className="truncate text-xs text-[var(--muted)]">{subtitle}</p>
        </div>
        <span
          className={[
            "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
            filled === slots
              ? "bg-[var(--felt)] text-white"
              : "bg-[var(--surface-2)] text-[var(--muted)]",
          ].join(" ")}
        >
          {filled}/{slots}
        </span>
      </div>
      <ol className="min-w-0 space-y-2">
        {lineup.map((playerId, index) => {
          const player = findPlayer(players, playerId);
          return (
            <li key={`${prefix}-${index}`} className="min-w-0">
              <div className="min-w-0 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-2.5 sm:px-3">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                    {prefix}
                    {index + 1}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    {player ? (
                      <>
                        <button
                          type="button"
                          aria-label="Move up"
                          disabled={index === 0}
                          onClick={() => onMove(index, index - 1)}
                          className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--ink)] disabled:opacity-30"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          aria-label="Move down"
                          disabled={index >= slots - 1}
                          onClick={() => onMove(index, index + 1)}
                          className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--ink)] disabled:opacity-30"
                        >
                          ▼
                        </button>
                        <span className="ml-0.5 min-w-[2rem] text-right tabular-nums text-xs font-semibold text-[var(--felt)]">
                          {player.fargoRating ?? "—"}
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
                <PlayerSelect
                  value={playerId ?? ""}
                  options={options}
                  placeholder="Open slot…"
                  onChange={(id) => onChange(index, id || null)}
                />
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-[11px] text-[var(--muted)]">
        ▲ ▼ reorder · handicaps follow Fargo
      </p>
    </div>
  );
}

function ScorePad({
  open,
  match,
  game,
  roundNumber,
  gameIndex,
  onClose,
  onChange,
}: {
  open: boolean;
  match: ScoringMatchDetail;
  game: GameScoreState | null | undefined;
  roundNumber: number;
  gameIndex: number;
  onClose: () => void;
  onChange: (next: GameScoreState) => void;
}) {
  const [local, setLocal] = useState<GameScoreState | null>(game ?? null);
  const [, startPadTransition] = useTransition();
  const maxWin = match.maxScore > 0 ? match.maxScore : 10;
  const maxLoss = match.maxLosingScore >= 0 ? match.maxLosingScore : 7;

  // Resync when opening/switching games — not on every parent score echo.
  useEffect(() => {
    if (!open) return;
    setLocal(game ?? null);
    // Intentionally omit `game` so parent transitions don't clobber local taps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, roundNumber, gameIndex]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !game || !local) {
    return (
      <aside className="hidden rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface)]/50 p-5 text-sm text-[var(--muted)] lg:block">
        Tap a game to open the score pad.
      </aside>
    );
  }

  const p1 = findPlayer(match.teamOnePlayers, local.teamOnePlayerId);
  const p2 = findPlayer(match.teamTwoPlayers, local.teamTwoPlayerId);
  const winner = gameWinner(local, {
    maxScore: maxWin,
    maxLosingScore: maxLoss,
  });

  const commit = (next: GameScoreState) => {
    setLocal(next);
    startPadTransition(() => onChange(next));
  };

  const setScore = (side: 1 | 2, value: number) => {
    commit(
      applyRaceScore(local, side, value, {
        maxScore: maxWin,
        maxLosingScore: maxLoss,
      }),
    );
  };

  const scoreOptionsFor = (side: 1 | 2) => {
    const other =
      side === 1 ? (local.teamTwoScore ?? 0) : (local.teamOneScore ?? 0);
    if (other === maxWin) {
      return RACE_SCORE_OPTIONS.filter((value) => value !== maxWin);
    }
    return [...RACE_SCORE_OPTIONS];
  };

  return (
    <>
      <aside className="hidden rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface)]/50 p-5 text-sm text-[var(--muted)] lg:block">
        Score pad open — use the full-screen editor.
      </aside>
      <div
        className="fixed inset-x-0 bottom-0 z-50 flex flex-col bg-[var(--paper-2)] shadow-[var(--shadow)]"
        style={{ top: "var(--score-pad-top, 6.5rem)" }}
        role="dialog"
        aria-modal="true"
        aria-label={`Round ${roundNumber} game ${gameIndex} score pad`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--amber)]">
              Round {roundNumber} · Game {gameIndex}
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {p1 ? playerDisplayName(p1) : "Home"}
              {p1?.fargoRating != null ? ` (${p1.fargoRating})` : ""} vs{" "}
              {p2 ? playerDisplayName(p2) : "Away"}
              {p2?.fargoRating != null ? ` (${p2.fargoRating})` : ""}
            </p>
            {!winner ? (
              <p className="mt-1 text-xs text-[var(--amber)]">
                In progress — first to {maxWin} wins (loser ≤{maxLoss})
              </p>
            ) : (
              <p className="mt-1 text-xs text-[var(--felt-deep)]">
                Game complete
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)]"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-[calc(1rem+var(--safe-bottom))]">
          <div className="grid grid-cols-2 gap-3">
            {[1, 2].map((side) => {
              const score =
                side === 1
                  ? (local.teamOneScore ?? 0)
                  : (local.teamTwoScore ?? 0);
              const name =
                side === 1
                  ? p1
                    ? playerDisplayName(p1)
                    : match.teamOneName
                  : p2
                    ? playerDisplayName(p2)
                    : match.teamTwoName;
              const breaking = local.breakingTeam === side;
              const isWinner = winner === side;
              const options = scoreOptionsFor(side as 1 | 2);
              const selectValue = options.includes(
                score as (typeof RACE_SCORE_OPTIONS)[number],
              )
                ? score
                : 0;
              return (
                <div
                  key={side}
                  className={[
                    "rounded-2xl border p-3",
                    isWinner
                      ? "border-[var(--felt)]/50 bg-[color-mix(in_srgb,var(--felt)_16%,var(--surface-2))]"
                      : "border-[var(--line)] bg-[var(--surface-2)]",
                  ].join(" ")}
                >
                  <p className="truncate text-xs font-semibold text-[var(--muted)]">
                    {name}
                    {breaking ? " · break" : ""}
                  </p>
                  {side === 1 && p1?.fargoRating != null ? (
                    <p className="mt-1 text-[11px] font-semibold text-[var(--felt)]">
                      Fargo {p1.fargoRating}
                    </p>
                  ) : null}
                  {side === 2 && p2?.fargoRating != null ? (
                    <p className="mt-1 text-[11px] font-semibold text-[var(--felt)]">
                      Fargo {p2.fargoRating}
                    </p>
                  ) : null}
                  <label className="mt-3 block">
                    <span className="sr-only">Score for {name}</span>
                    <select
                      value={selectValue}
                      onChange={(event) =>
                        setScore(side as 1 | 2, Number(event.target.value))
                      }
                      className={[
                        "w-full appearance-none rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3 text-center font-[family-name:var(--font-display)] text-4xl tabular-nums outline-none ring-[var(--felt)] focus:ring-2",
                        isWinner
                          ? "text-[var(--felt-deep)]"
                          : "text-[var(--ink)]",
                      ].join(" ")}
                    >
                      {options.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                  {isWinner ? (
                    <p className="mt-2 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--felt-deep)]">
                      {local.winAdornment
                        ? `Winner · ${local.winAdornment}`
                        : "Winner"}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
              Win adornment
            </p>
            <div className="grid grid-cols-4 gap-2">
              {(["", "BR", "TR", "WZ"] as WinAdornment[]).map((adornment) => {
                const label = adornment || "CLR";
                const active = local.winAdornment === adornment;
                return (
                  <button
                    key={label}
                    type="button"
                    disabled={!winner && adornment !== ""}
                    onClick={() => {
                      const currentWinner = gameWinner(local, {
                        maxScore: maxWin,
                        maxLosingScore: maxLoss,
                      });
                      if (!currentWinner) {
                        commit({
                          ...local,
                          winAdornment: "",
                          isWinZip: false,
                        });
                        return;
                      }
                      commit(
                        applyQuickWin(local, currentWinner, {
                          maxScore: maxWin,
                          maxLosingScore: maxLoss,
                          adornment,
                        }),
                      );
                    }}
                    className={[
                      "rounded-xl py-2.5 text-sm font-semibold disabled:opacity-35",
                      active
                        ? "bg-[var(--amber)] text-[#1a1208]"
                        : "bg-[var(--surface-2)] text-[var(--ink)]",
                    ].join(" ")}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                commit({
                  ...local,
                  breakingTeam: local.breakingTeam === 1 ? 2 : 1,
                })
              }
              className="flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] py-2.5 text-sm font-semibold"
            >
              Swap break
            </button>
            <button
              type="button"
              onClick={() =>
                commit({
                  ...local,
                  teamOneScore: 0,
                  teamTwoScore: 0,
                  winAdornment: "",
                  isWinZip: false,
                })
              }
              className="flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] py-2.5 text-sm font-semibold text-[var(--muted)]"
            >
              Reset 0–0
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function ReviewPanel({
  match,
  draft,
  submitting,
  onEdit,
  onSubmit,
}: {
  match: ScoringMatchDetail;
  draft: ScoringDraft;
  submitting: boolean;
  onEdit: () => void;
  onSubmit: () => void;
}) {
  const totals = tallyDraft(draft);
  const incomplete = totals.scored < totals.total;
  const roundTallies = tallyAllRoundPoints(match, draft);
  const roundWins = roundTallies.reduce(
    (acc, round) => ({
      teamOne: acc.teamOne + (round.roundWinner === 1 ? 1 : 0),
      teamTwo: acc.teamTwo + (round.roundWinner === 2 ? 1 : 0),
    }),
    { teamOne: 0, teamTwo: 0 },
  );
  const hcOne = roundTallies.reduce((sum, round) => sum + round.teamOneHandicap, 0);
  const hcTwo = roundTallies.reduce((sum, round) => sum + round.teamTwoHandicap, 0);

  return (
    <div className="space-y-4 rounded-[1.4rem] border border-[var(--line)] bg-[var(--surface)] p-4 md:p-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--amber)]">
          Review
        </p>
        <h4 className="mt-1 font-[family-name:var(--font-display)] text-xl text-[var(--felt-deep)]">
          Ready to send to LMS?
        </h4>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Rounds {roundWins.teamOne}–{roundWins.teamTwo} · games{" "}
          {totals.teamOneWins}–{totals.teamTwoWins} · {totals.scored} of{" "}
          {totals.total} complete
          {incomplete ? " · finish every game first" : ""}
          {match.isHandicapped ? ` · HC ${hcOne}–${hcTwo}` : ""}
        </p>
      </div>

      <div className="space-y-3">
        {(match.matchFormat?.rounds ?? []).map((round) => {
          const tally =
            roundTallies.find(
              (item) => item.roundNumber === round.roundNumber,
            ) ?? null;
          return (
            <div key={round.roundNumber}>
              <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                  Round {round.roundNumber}
                </p>
                {tally ? (
                  <p className="text-xs font-semibold tabular-nums text-[var(--ink)]">
                    {tally.teamOneTotal}–{tally.teamTwoTotal}
                    {tally.teamOneHandicap > 0 || tally.teamTwoHandicap > 0
                      ? ` (incl HC ${tally.teamOneHandicap}–${tally.teamTwoHandicap})`
                      : ""}
                    {tally.roundWinner === 1
                      ? ` · ${match.teamOneName.trim()} won${tally.clinchedEarly ? " (clinched)" : ""}`
                      : tally.roundWinner === 2
                        ? ` · ${match.teamTwoName.trim()} won${tally.clinchedEarly ? " (clinched)" : ""}`
                        : tally.roundComplete
                          ? " · tied"
                          : " · in progress"}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                {round.games.map((game) => {
                  const state =
                    draft.games[gameKey(round.roundNumber, game.index)];
                  const p1 = findPlayer(
                    match.teamOnePlayers,
                    state?.teamOnePlayerId ?? null,
                  );
                  const p2 = findPlayer(
                    match.teamTwoPlayers,
                    state?.teamTwoPlayerId ?? null,
                  );
                  const complete = gameWinner(state) != null;
                  return (
                    <div
                      key={game.index}
                      className="flex items-center justify-between gap-3 rounded-xl bg-[var(--surface-2)] px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate">
                        {p1 ? playerDisplayName(p1) : `H${game.playerOne.index}`}
                        {p1?.fargoRating != null ? ` (${p1.fargoRating})` : ""}{" "}
                        vs{" "}
                        {p2 ? playerDisplayName(p2) : `A${game.playerTwo.index}`}
                        {p2?.fargoRating != null ? ` (${p2.fargoRating})` : ""}
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="font-semibold tabular-nums">
                          {scoreLabel(state)}
                        </span>
                        <span className="mt-0.5 block text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
                          {complete ? "Won" : "Open"}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-4 py-3 text-sm font-semibold"
        >
          Keep editing
        </button>
        <button
          type="button"
          disabled={submitting || incomplete}
          onClick={onSubmit}
          className="rounded-xl bg-[var(--felt)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Submit to LMS"}
        </button>
      </div>
      {incomplete ? (
        <p className="text-xs text-[var(--muted)]">
          Score every game before submitting — LMS expects a complete
          scoresheet.
        </p>
      ) : (
        <p className="text-xs text-[var(--muted)]">
          This sends the scoresheet through the same LMS endpoint as the
          official BCAPL scoring app.
        </p>
      )}
    </div>
  );
}
