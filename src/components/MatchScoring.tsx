"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import {
  applyQuickWin,
  buildVerticalMatchPayload,
  clearDraft,
  emptyDraft,
  gameKey,
  gameWinner,
  isGameScored,
  loadDraft,
  playerDisplayName,
  saveDraft,
  syncLineupToGames,
  tallyDraft,
  type GameScoreState,
  type ScoringDraft,
  type ScoringMatchDetail,
  type ScoringMatchSummary,
  type ScoringPlayer,
  type WinAdornment,
} from "@/lib/scoring";
import { EmptyState } from "./EmptyState";
import { LoadingState } from "./LoadingState";

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
  if (!game || !isGameScored(game)) return "—";
  const adorn = game.winAdornment;
  const winner = gameWinner(game);
  if (adorn && winner) {
    return winner === 1
      ? `${adorn} – ${game.teamTwoScore}`
      : `${game.teamOneScore} – ${adorn}`;
  }
  return `${game.teamOneScore} – ${game.teamTwoScore}`;
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
          ? syncLineupToGames(saved, data.match)
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

  const updateDraft = (updater: (prev: ScoringDraft) => ScoringDraft) => {
    setDraft((prev) => {
      if (!prev || !match) return prev;
      const next = updater(prev);
      saveDraft(next);
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

  const rounds = match?.matchFormat?.rounds ?? [];
  const currentRound =
    rounds.find((round) => round.roundNumber === activeRound) ?? rounds[0];

  const padGame =
    activeGame && draft
      ? draft.games[gameKey(activeGame.roundNumber, activeGame.gameIndex)]
      : null;

  const setGameScore = (
    roundNumber: number,
    gameIndex: number,
    next: GameScoreState,
  ) => {
    updateDraft((prev) => ({
      ...prev,
      games: {
        ...prev.games,
        [gameKey(roundNumber, gameIndex)]: next,
      },
    }));
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
    return (
      <section className="animate-panel space-y-4">
        <div className="sticky top-[3.25rem] z-30 -mx-1 space-y-3 bg-[color-mix(in_srgb,var(--paper)_92%,transparent)] px-1 py-2 backdrop-blur">
          <div className="flex items-start justify-between gap-3">
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
              className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)]"
            >
              {reviewMode ? "← Back to sheet" : "← Matches"}
            </button>
            <button
              type="button"
              onClick={() => void onLogout()}
              className="text-xs font-medium text-[var(--muted)] underline-offset-2 hover:underline"
            >
              Sign out
            </button>
          </div>

          <div className="overflow-hidden rounded-[1.35rem] border border-[var(--line)] bg-[linear-gradient(135deg,rgba(20,92,69,0.96),rgba(13,61,46,0.98))] px-4 py-4 text-white shadow-[var(--shadow)] md:px-5">
            <p className="text-[11px] uppercase tracking-[0.14em] text-white/65">
              {formatMatchDate(match.datePlayed)} · {match.location}
            </p>
            <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className="min-w-0 text-right">
                <p className="truncate font-[family-name:var(--font-display)] text-lg leading-tight md:text-xl">
                  {match.teamOneName}
                </p>
                {match.mySide === 1 ? (
                  <p className="text-[11px] text-[var(--amber)]">Your team</p>
                ) : null}
              </div>
              <div className="rounded-2xl bg-black/25 px-3 py-2 text-center">
                <p className="font-[family-name:var(--font-display)] text-2xl tabular-nums leading-none">
                  {totals?.teamOneWins ?? 0}
                  <span className="mx-1 text-white/45">:</span>
                  {totals?.teamTwoWins ?? 0}
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-white/55">
                  {totals?.scored ?? 0}/{totals?.total ?? 0} games
                </p>
              </div>
              <div className="min-w-0">
                <p className="truncate font-[family-name:var(--font-display)] text-lg leading-tight md:text-xl">
                  {match.teamTwoName}
                </p>
                {match.mySide === 2 ? (
                  <p className="text-[11px] text-[var(--amber)]">Your team</p>
                ) : null}
              </div>
            </div>
          </div>
        </div>

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
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="space-y-4">
              <LineupEditor
                match={match}
                draft={draft}
                onChangeLineup={(side, index, playerId) => {
                  updateDraft((prev) => {
                    const lineupKey =
                      side === 1 ? "teamOneLineup" : "teamTwoLineup";
                    const nextLineup = [...prev[lineupKey]];
                    nextLineup[index] = playerId;
                    const synced = syncLineupToGames(
                      { ...prev, [lineupKey]: nextLineup },
                      match,
                    );
                    return synced;
                  });
                }}
              />

              <div className="flex gap-2 overflow-x-auto pb-1">
                {rounds.map((round) => {
                  const active = round.roundNumber === activeRound;
                  const roundGames = round.games.map(
                    (game) => draft.games[gameKey(round.roundNumber, game.index)],
                  );
                  const done = roundGames.filter(isGameScored).length;
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
                        "shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold transition",
                        active
                          ? "bg-[var(--felt)] text-white shadow-sm"
                          : "bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--surface-2)]",
                      ].join(" ")}
                    >
                      R{round.roundNumber}
                      <span className="ml-1.5 text-[11px] opacity-70">
                        {done}/{round.games.length}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-2">
                {currentRound?.games.map((game) => {
                  const state =
                    draft.games[gameKey(currentRound.roundNumber, game.index)];
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
                  const winner = state ? gameWinner(state) : null;
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
                        "grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl border px-3 py-3 text-left transition md:px-4",
                        selected
                          ? "border-[var(--felt)] bg-[color-mix(in_srgb,var(--felt)_14%,var(--surface))]"
                          : "border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--surface-2)]",
                      ].join(" ")}
                    >
                      <div className="min-w-0">
                        <p
                          className={[
                            "truncate text-sm font-semibold",
                            winner === 1
                              ? "text-[var(--felt-deep)]"
                              : "text-[var(--ink)]",
                          ].join(" ")}
                        >
                          {p1 ? playerDisplayName(p1) : `H${game.playerOne.index}`}
                        </p>
                        <p className="text-[11px] text-[var(--muted)]">
                          {state?.breakingTeam === 1 ? "Breaks" : "·"}
                        </p>
                      </div>
                      <div className="rounded-xl bg-[var(--surface-2)] px-2.5 py-1.5 text-center">
                        <p className="text-sm font-semibold tabular-nums">
                          {scoreLabel(state)}
                        </p>
                        <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
                          G{game.index}
                        </p>
                      </div>
                      <div className="min-w-0 text-right">
                        <p
                          className={[
                            "truncate text-sm font-semibold",
                            winner === 2
                              ? "text-[var(--felt-deep)]"
                              : "text-[var(--ink)]",
                          ].join(" ")}
                        >
                          {p2 ? playerDisplayName(p2) : `A${game.playerTwo.index}`}
                        </p>
                        <p className="text-[11px] text-[var(--muted)]">
                          {state?.breakingTeam === 2 ? "Breaks" : "·"}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

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

function LineupEditor({
  match,
  draft,
  onChangeLineup,
}: {
  match: ScoringMatchDetail;
  draft: ScoringDraft;
  onChangeLineup: (
    side: 1 | 2,
    index: number,
    playerId: string | null,
  ) => void;
}) {
  const [open, setOpen] = useState(false);
  const slots = Math.max(
    draft.teamOneLineup.length,
    draft.teamTwoLineup.length,
    5,
  );

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--amber)]">
            Lineups
          </p>
          <p className="mt-0.5 text-sm text-[var(--muted)]">
            Set H1–H{slots} / A1–A{slots}. Pairings follow the match format.
          </p>
        </div>
        <span className="text-xs font-semibold text-[var(--muted)]">
          {open ? "Hide ▴" : "Edit ▾"}
        </span>
      </button>
      {open ? (
        <div className="grid gap-3 border-t border-[var(--line)] px-4 py-4 md:grid-cols-2">
          <LineupSide
            label={match.teamOneName}
            prefix="H"
            players={match.teamOnePlayers}
            lineup={draft.teamOneLineup}
            onChange={(index, id) => onChangeLineup(1, index, id)}
          />
          <LineupSide
            label={match.teamTwoName}
            prefix="A"
            players={match.teamTwoPlayers}
            lineup={draft.teamTwoLineup}
            onChange={(index, id) => onChangeLineup(2, index, id)}
          />
        </div>
      ) : null}
    </div>
  );
}

function LineupSide({
  label,
  prefix,
  players,
  lineup,
  onChange,
}: {
  label: string;
  prefix: string;
  players: ScoringPlayer[];
  lineup: (string | null)[];
  onChange: (index: number, playerId: string | null) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-[var(--ink)]">{label}</p>
      {lineup.map((playerId, index) => (
        <label key={`${prefix}-${index}`} className="flex items-center gap-2">
          <span className="w-7 shrink-0 text-xs font-semibold text-[var(--muted)]">
            {prefix}
            {index + 1}
          </span>
          <select
            value={playerId ?? ""}
            onChange={(event) =>
              onChange(index, event.target.value || null)
            }
            className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-2 text-sm outline-none ring-[var(--felt)] focus:ring-2"
          >
            <option value="">Unassigned</option>
            {players.map((player) => (
              <option key={player.id} value={player.id}>
                {playerDisplayName(player)}
                {player.fargoRating != null ? ` (${player.fargoRating})` : ""}
              </option>
            ))}
          </select>
        </label>
      ))}
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
  if (!open || !game) {
    return (
      <aside className="hidden rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface)]/50 p-5 text-sm text-[var(--muted)] lg:block">
        Tap a game to open the score pad.
      </aside>
    );
  }

  const p1 = findPlayer(match.teamOnePlayers, game.teamOnePlayerId);
  const p2 = findPlayer(match.teamTwoPlayers, game.teamTwoPlayerId);

  const bump = (side: 1 | 2, delta: number) => {
    const key = side === 1 ? "teamOneScore" : "teamTwoScore";
    const current = game[key] ?? 0;
    const next = Math.max(
      match.minScore,
      Math.min(match.maxScore, current + delta),
    );
    onChange({
      ...game,
      [key]: next,
      winAdornment: "",
      isWinZip: false,
    });
  };

  const quick = (winner: 1 | 2, adornment: WinAdornment = "") => {
    onChange(
      applyQuickWin(game, winner, {
        maxScore: match.maxScore,
        maxLosingScore: match.maxLosingScore,
        adornment,
      }),
    );
  };

  const body = (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--amber)]">
            Round {roundNumber} · Game {gameIndex}
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {p1 ? playerDisplayName(p1) : "Home"} vs{" "}
            {p2 ? playerDisplayName(p2) : "Away"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-[var(--line)] px-2.5 py-1 text-xs font-semibold text-[var(--muted)] lg:hidden"
        >
          Close
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[1, 2].map((side) => {
          const score = side === 1 ? game.teamOneScore : game.teamTwoScore;
          const name =
            side === 1
              ? p1
                ? playerDisplayName(p1)
                : match.teamOneName
              : p2
                ? playerDisplayName(p2)
                : match.teamTwoName;
          const breaking = game.breakingTeam === side;
          return (
            <div
              key={side}
              className="rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-3"
            >
              <p className="truncate text-xs font-semibold text-[var(--muted)]">
                {name}
                {breaking ? " · break" : ""}
              </p>
              <p className="mt-2 font-[family-name:var(--font-display)] text-4xl tabular-nums text-[var(--felt-deep)]">
                {game.winAdornment && gameWinner(game) === side
                  ? game.winAdornment
                  : (score ?? "–")}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => bump(side as 1 | 2, -1)}
                  className="flex-1 rounded-xl bg-[var(--surface)] py-2 text-lg font-semibold"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => bump(side as 1 | 2, 1)}
                  className="flex-1 rounded-xl bg-[var(--surface)] py-2 text-lg font-semibold"
                >
                  +
                </button>
              </div>
              <button
                type="button"
                onClick={() => quick(side as 1 | 2)}
                className="mt-2 w-full rounded-xl bg-[var(--felt)] py-2.5 text-sm font-semibold text-white"
              >
                WIN
              </button>
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
            const active = game.winAdornment === adornment;
            return (
              <button
                key={label}
                type="button"
                onClick={() => {
                  const winner = gameWinner(game);
                  if (!winner) {
                    onChange({
                      ...game,
                      winAdornment: adornment,
                      isWinZip: adornment === "WZ",
                    });
                    return;
                  }
                  quick(winner, adornment);
                }}
                className={[
                  "rounded-xl py-2.5 text-sm font-semibold",
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
            onChange({
              ...game,
              breakingTeam: game.breakingTeam === 1 ? 2 : 1,
            })
          }
          className="flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] py-2.5 text-sm font-semibold"
        >
          Swap break
        </button>
        <button
          type="button"
          onClick={() =>
            onChange({
              ...game,
              teamOneScore: null,
              teamTwoScore: null,
              winAdornment: "",
              isWinZip: false,
            })
          }
          className="flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] py-2.5 text-sm font-semibold text-[var(--muted)]"
        >
          Clear
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden animate-rise rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm lg:block">
        {body}
      </aside>
      <div className="fixed inset-x-0 bottom-0 z-40 lg:hidden">
        <button
          type="button"
          aria-label="Dismiss score pad"
          className="absolute inset-x-0 bottom-0 top-[-40vh] bg-black/45"
          onClick={onClose}
        />
        <div className="relative animate-rise rounded-t-[1.5rem] border border-[var(--line)] bg-[var(--paper-2)] px-4 pb-[calc(1rem+var(--safe-bottom))] pt-4 shadow-[var(--shadow)]">
          {body}
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
          {totals.teamOneWins}–{totals.teamTwoWins} · {totals.scored} of{" "}
          {totals.total} games scored
          {incomplete ? " · some games still open" : ""}
        </p>
      </div>

      <div className="space-y-3">
        {(match.matchFormat?.rounds ?? []).map((round) => (
          <div key={round.roundNumber}>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              Round {round.roundNumber}
            </p>
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
                return (
                  <div
                    key={game.index}
                    className="flex items-center justify-between gap-3 rounded-xl bg-[var(--surface-2)] px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      {p1 ? playerDisplayName(p1) : `H${game.playerOne.index}`}{" "}
                      vs{" "}
                      {p2 ? playerDisplayName(p2) : `A${game.playerTwo.index}`}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {scoreLabel(state)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
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
