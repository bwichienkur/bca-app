"use client";

import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import {
  deleteRemoteDraft,
  fetchRemoteDraft,
  fetchRemoteDraftMatchIds,
  newerDraft,
  pushRemoteDraft,
} from "@/lib/draft-sync";
import {
  applyQuickWin,
  applyRaceScore,
  buildVerticalMatchPayload,
  clearDraft,
  computeMatchHandicaps,
  emptyDraft,
  gameKey,
  gamePlayStatus,
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
import type { AuthUser } from "./LoginScreen";
import { DraggableLineupList } from "./DraggableLineupList";
import {
  deleteLineupPreset,
  loadLineupPresets,
  upsertLineupPreset,
} from "@/lib/preferences";
import type { LineupPreset } from "@/lib/types";

type MatchScoringProps = {
  divisionId: string | null;
  divisionName: string | null;
  teamId: string | null;
  teamName: string | null;
  user: AuthUser | null;
  authLoading?: boolean;
  onRequestLogin: () => void;
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

export function MatchScoring({
  divisionId,
  divisionName,
  teamId,
  teamName,
  user,
  authLoading = false,
  onRequestLogin,
}: MatchScoringProps) {
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
  const [sharedDrafts, setSharedDrafts] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [remoteSubmittedAt, setRemoteSubmittedAt] = useState<string | null>(
    null,
  );
  const [confirmDialog, setConfirmDialog] = useState<
    null | "reset" | "submit"
  >(null);
  const [, startTransition] = useTransition();
  const saveTimerRef = useRef<number | null>(null);
  const dirtyRef = useRef(false);
  const baseUpdatedAtRef = useRef<string | null>(null);
  const draftRef = useRef<ScoringDraft | null>(null);
  const pushSeqRef = useRef(0);
  const sheetLockedRef = useRef(false);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const persistDraft = (next: ScoringDraft) => {
    if (sheetLockedRef.current) return;
    saveDraft(next);
    dirtyRef.current = true;
    const seq = ++pushSeqRef.current;
    void pushRemoteDraft(next, baseUpdatedAtRef.current)
      .then((remote) => {
        if (seq !== pushSeqRef.current) return;
        if (remote.shared) setSharedDrafts(true);
        if (remote.conflict && remote.draft) {
          const merged = normalizeDraftScores(remote.draft);
          baseUpdatedAtRef.current = merged.updatedAt;
          dirtyRef.current = false;
          draftRef.current = merged;
          setDraft(merged);
          saveDraft(merged);
          setSyncNote("Another device had a newer score — loaded it.");
          return;
        }
        if (remote.draft) {
          baseUpdatedAtRef.current = remote.draft.updatedAt;
        } else {
          baseUpdatedAtRef.current = next.updatedAt;
        }
        dirtyRef.current = false;
        setSyncNote(null);
      })
      .catch(() => {
        // Keep local draft; shared store may be offline/unconfigured.
        dirtyRef.current = false;
      });
  };

  const scheduleSaveDraft = (next: ScoringDraft) => {
    if (saveTimerRef.current != null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      persistDraft(next);
      saveTimerRef.current = null;
    }, 280);
  };

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
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
        const params = new URLSearchParams({
          divisionId: divisionId!,
        });
        if (teamId) params.set("teamId", teamId);
        const data = await fetchJson<{ matches: ScoringMatchSummary[] }>(
          `/api/scoring/matches?${params.toString()}`,
        );
        if (!cancelled) {
          setMatches(data.matches);
          const ids = new Set<string>();
          for (const item of data.matches) {
            if (loadDraft(item.id)) ids.add(item.id);
          }
          try {
            const remote = await fetchRemoteDraftMatchIds(
              data.matches.map((item) => item.id),
            );
            if (!cancelled) {
              setSharedDrafts(remote.shared);
              for (const id of remote.matchIds) ids.add(id);
            }
          } catch {
            // local markers still apply
          }
          if (!cancelled) setDraftMatchIds(ids);
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
  }, [user, divisionId, teamId]);

  const openMatch = async (matchId: string) => {
    setLoadingMatch(true);
    setSheetError(null);
    setSubmitMessage(null);
    setSyncNote(null);
    setRemoteSubmittedAt(null);
    try {
      const data = await fetchJson<{ match: ScoringMatchDetail }>(
        `/api/scoring/matches/${matchId}`,
      );
      const local = loadDraft(matchId);
      let remoteDraft: ScoringDraft | null = null;
      let submittedAt: string | null = null;
      try {
        const remote = await fetchRemoteDraft(matchId);
        if (remote.shared) setSharedDrafts(true);
        remoteDraft = remote.draft;
        submittedAt = remote.submittedAt ?? null;
        if (submittedAt) {
          setSyncNote("This match was already submitted from Tableside.");
        }
      } catch {
        // Fall back to localStorage-only.
      }

      const locked = Boolean(data.match.hasBeenPlayed || submittedAt);
      sheetLockedRef.current = locked;
      setRemoteSubmittedAt(submittedAt);

      const chosen = newerDraft(remoteDraft, local, "a");
      const nextDraft = chosen
        ? syncLineupToGames(normalizeDraftScores(chosen), data.match)
        : emptyDraft(data.match);

      baseUpdatedAtRef.current = remoteDraft?.updatedAt ?? null;
      dirtyRef.current = false;
      setMatch(data.match);
      setDraft(nextDraft);
      draftRef.current = nextDraft;
      setActiveRound(data.match.matchFormat?.rounds[0]?.roundNumber ?? 1);
      setActiveGame(null);
      setView({ mode: "sheet", matchId });
      if (!locked) {
        saveDraft(nextDraft);
        // Seed shared store when we opened from local-only or empty.
        void pushRemoteDraft(nextDraft, baseUpdatedAtRef.current)
          .then((remote) => {
            if (remote.shared) setSharedDrafts(true);
            if (remote.draft) baseUpdatedAtRef.current = remote.draft.updatedAt;
            if (remote.submittedAt) {
              setRemoteSubmittedAt(remote.submittedAt);
              sheetLockedRef.current = true;
            }
          })
          .catch(() => undefined);
        setDraftMatchIds((prev) => new Set(prev).add(matchId));
      }
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
    if (sheetLockedRef.current) return;
    setDraft((prev) => {
      if (!prev || !match) return prev;
      const next: ScoringDraft = {
        ...updater(prev),
        updatedAt: new Date().toISOString(),
      };
      dirtyRef.current = true;
      draftRef.current = next;
      if (options?.immediate) {
        if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
        persistDraft(next);
      } else {
        scheduleSaveDraft(next);
      }
      return next;
    });
  };

  // Poll shared draft so a second phone/tablet stays in sync.
  useEffect(() => {
    if (view.mode === "list" || !view.matchId || !match) return;
    const matchId = view.matchId;
    const activeMatch = match;
    const timer = window.setInterval(() => {
      if (dirtyRef.current || saveTimerRef.current != null) return;
      void fetchRemoteDraft(matchId)
        .then((remote) => {
          if (!remote.shared) return;
          setSharedDrafts(true);
          if (remote.submittedAt) {
            setRemoteSubmittedAt(remote.submittedAt);
            sheetLockedRef.current = true;
          }
          if (!remote.draft) return;
          const local = draftRef.current;
          if (!local) return;
          if (remote.draft.updatedAt === local.updatedAt) {
            baseUpdatedAtRef.current = remote.draft.updatedAt;
            return;
          }
          if (Date.parse(remote.draft.updatedAt) <= Date.parse(local.updatedAt)) {
            return;
          }
          if (dirtyRef.current) return;
          const merged = syncLineupToGames(
            normalizeDraftScores(remote.draft),
            activeMatch,
          );
          baseUpdatedAtRef.current = merged.updatedAt;
          draftRef.current = merged;
          setDraft(merged);
          if (!sheetLockedRef.current) saveDraft(merged);
        })
        .catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [view, match]);

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

  const resetSheet = () => {
    if (!match || sheetLockedRef.current) return;
    const fresh: ScoringDraft = {
      ...emptyDraft(match),
      updatedAt: new Date().toISOString(),
    };
    dirtyRef.current = true;
    draftRef.current = fresh;
    setDraft(fresh);
    persistDraft(fresh);
    setActiveGame(null);
    setConfirmDialog(null);
  };

  const submitMatch = async () => {
    if (!match || !draft || !user) return;
    if (sheetLockedRef.current || match.hasBeenPlayed) {
      setSheetError("This scoresheet is already submitted and locked.");
      setConfirmDialog(null);
      return;
    }

    setConfirmDialog(null);
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
        void deleteRemoteDraft(match.id);
        sheetLockedRef.current = true;
        setRemoteSubmittedAt(new Date().toISOString());
        setSubmitMessage("Match submitted to LMS.");
        setView({ mode: "list" });
        setMatch(null);
        setDraft(null);
        setDraftMatchIds((prev) => {
          const next = new Set(prev);
          next.delete(match.id);
          return next;
        });
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

  if (authLoading) {
    return <LoadingState label="Checking scoring session…" />;
  }

  if (!user) {
    return (
      <EmptyState
        title="Sign in to score"
        body="Use Login at the top of the page with your BCA / FargoRate account. Scoring submits to LMS and only lists matches for your selected team."
        action={
          <button
            type="button"
            onClick={onRequestLogin}
            className="rounded-xl bg-[var(--felt)] px-4 py-2.5 text-sm font-semibold text-white"
          >
            Go to login
          </button>
        }
      />
    );
  }

  if (!divisionId) {
    return (
      <EmptyState
        title="Choose a division to score"
        body="Pick your division above (from the teams you belong to), then open Score."
      />
    );
  }

  if (!teamId) {
    return (
      <EmptyState
        title="Set My team to score"
        body="Score only lists matches for your selected team. Set My team in the League · Division · My team section or in Settings."
      />
    );
  }

  if (view.mode !== "list" && (loadingMatch || !match || !draft)) {
    return <LoadingState label="Opening scoresheet…" />;
  }

  if (view.mode !== "list" && match && draft) {
    const reviewMode = view.mode === "review";
    const sheetLocked = Boolean(match.hasBeenPlayed || remoteSubmittedAt);
    sheetLockedRef.current = sheetLocked;
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
        {syncNote ? (
          <p className="rounded-xl border border-[var(--amber)]/35 bg-[color-mix(in_srgb,var(--amber)_12%,transparent)] px-3 py-2 text-sm text-[var(--amber)]">
            {syncNote}
          </p>
        ) : null}

        {sheetLocked ? (
          <p className="rounded-xl border border-[var(--amber)]/35 bg-[color-mix(in_srgb,var(--amber)_12%,transparent)] px-3 py-2 text-sm text-[var(--amber)]">
            This scoresheet has been submitted
            {match.hasBeenPlayed ? " to LMS" : ""}. Editing is locked — you can
            still review lineups and scores.
          </p>
        ) : null}

        {reviewMode ? (
          <ReviewPanel
            match={match}
            draft={draft}
            submitting={submitting}
            locked={sheetLocked}
            onEdit={() => setView({ mode: "sheet", matchId: match.id })}
            onSubmit={() => setConfirmDialog("submit")}
          />
        ) : (
          <div className="grid w-full min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="w-full min-w-0 space-y-4 overflow-x-hidden">
              <LineupEditor
                match={match}
                draft={draft}
                divisionId={divisionId}
                readOnly={sheetLocked}
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
                onReplaceLineup={(side, nextLineup) => {
                  updateDraft((prev) => {
                    const lineupKey =
                      side === 1 ? "teamOneLineup" : "teamTwoLineup";
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
                    const status = gamePlayStatus(state);
                    return (
                      <button
                        key={game.index}
                        type="button"
                        onClick={() => {
                          if (sheetLocked) return;
                          setActiveGame({
                            roundNumber: currentRound.roundNumber,
                            gameIndex: game.index,
                          });
                        }}
                        disabled={sheetLocked}
                        className={[
                          "w-full min-w-0 overflow-hidden rounded-xl border px-2.5 py-2 text-left transition sm:px-3",
                          sheetLocked ? "cursor-default opacity-95" : "",
                          selected
                            ? "border-[var(--felt)] ring-2 ring-[var(--felt)]/25"
                            : "",
                          status === "complete"
                            ? "border-[var(--felt)]/55 bg-[color-mix(in_srgb,var(--felt)_12%,var(--surface))]"
                            : status === "in-progress"
                              ? "border-[var(--amber)]/65 bg-[color-mix(in_srgb,var(--amber)_14%,var(--surface))]"
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
                          <div
                            className={[
                              "shrink-0 rounded-lg px-2.5 py-1 text-center",
                              status === "complete"
                                ? "bg-[color-mix(in_srgb,var(--felt)_20%,var(--surface))]"
                                : status === "in-progress"
                                  ? "bg-[color-mix(in_srgb,var(--amber)_22%,var(--surface))]"
                                  : "bg-[var(--surface-2)]",
                            ].join(" ")}
                          >
                            <p className="text-sm font-semibold tabular-nums leading-none">
                              {scoreLabel(state)}
                            </p>
                            <p
                              className={[
                                "mt-0.5 text-[9px] uppercase tracking-[0.12em]",
                                status === "complete"
                                  ? "font-semibold text-[var(--felt-deep)]"
                                  : status === "in-progress"
                                    ? "font-semibold text-[var(--amber)]"
                                    : "text-[var(--muted)]",
                              ].join(" ")}
                            >
                              {status === "complete"
                                ? "Final"
                                : status === "in-progress"
                                  ? "Live"
                                  : `G${game.index}`}
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
                {sheetLocked ? (
                  <p className="text-sm text-[var(--muted)]">
                    Scoresheet is locked after submit.
                  </p>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setView({ mode: "review", matchId: match.id })
                      }
                      className="rounded-xl bg-[var(--felt)] px-4 py-3 text-sm font-semibold text-white"
                    >
                      Review & submit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!match || sheetLocked) return;
                        setConfirmDialog("reset");
                      }}
                      className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm font-semibold text-[var(--muted)]"
                    >
                      Reset sheet
                    </button>
                  </>
                )}
              </div>
            </div>

            <ScorePad
              open={Boolean(!sheetLocked && activeGame && padGame)}
              match={match}
              game={padGame}
              roundNumber={activeGame?.roundNumber ?? activeRound}
              gameIndex={activeGame?.gameIndex ?? 1}
              onClose={() => setActiveGame(null)}
              onChange={(next) => {
                if (!activeGame || sheetLocked) return;
                setGameScore(
                  activeGame.roundNumber,
                  activeGame.gameIndex,
                  next,
                );
              }}
            />
          </div>
        )}

        {confirmDialog ? (
          <ConfirmDialog
            title={
              confirmDialog === "reset"
                ? "Reset this scoresheet?"
                : "Submit to LMS?"
            }
            body={
              confirmDialog === "reset"
                ? "All lineups and scores for this match will be cleared. This cannot be undone."
                : `Send the scoresheet for ${match.teamOneName.trim()} vs ${match.teamTwoName.trim()} to LMS? This cannot be undone from Tableside.`
            }
            confirmLabel={confirmDialog === "reset" ? "Reset sheet" : "Submit"}
            confirmTone={confirmDialog === "reset" ? "danger" : "primary"}
            busy={confirmDialog === "submit" && submitting}
            onCancel={() => {
              if (submitting) return;
              setConfirmDialog(null);
            }}
            onConfirm={() => {
              if (confirmDialog === "reset") resetSheet();
              else void submitMatch();
            }}
          />
        ) : null}
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
            {teamName ? (
              <>
                Scoring for{" "}
                <span className="font-medium text-[var(--ink)]">{teamName}</span>
              </>
            ) : (
              "Your matches"
            )}
            {divisionName ? (
              <>
                {" "}
                · {divisionName}
              </>
            ) : null}
            {sharedDrafts ? " · multi-device draft sync on" : null}
          </p>
        </div>
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
          title={
            teamName
              ? `No matches for ${teamName}`
              : "No matches for your team"
          }
          body="When this team is scheduled in the selected division, those matches will show up here ready to score."
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
      const canCatch =
        side === 1 ? tally.canCatchUp.teamOne : tally.canCatchUp.teamTwo;
      const otherCanCatch =
        side === 1 ? tally.canCatchUp.teamTwo : tally.canCatchUp.teamOne;
      const ourTotal =
        side === 1 ? tally.teamOneTotal : tally.teamTwoTotal;
      const theirTotal =
        side === 1 ? tally.teamTwoTotal : tally.teamOneTotal;
      if (!canCatch) return `${name}: can’t catch up`;
      const need =
        side === 1 ? tally.pointsNeeded.teamOne : tally.pointsNeeded.teamTwo;
      if (need == null) return null;
      if (ourTotal > theirTotal && otherCanCatch) {
        return `${name}: can still be caught`;
      }
      if (need === 0) return `${name}: on track`;
      return `${name}: need ${need} pt${need === 1 ? "" : "s"}`;
    };
    const one = formatNeed(1, mySide === 1 ? "You" : "Home");
    const two = formatNeed(2, mySide === 2 ? "You" : "Away");
    const parts = [one, two].filter(Boolean);
    if (!parts.length) return null;
    const hcNote =
      tally.teamOneHandicap > 0 || tally.teamTwoHandicap > 0
        ? " · HC in totals"
        : "";
    return `${parts.join(" · ")} from ${gamesLeft} game${gamesLeft === 1 ? "" : "s"} (best catch-up = ${tally.maxWinPoints}–0 sweeps${hcNote})`;
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
    const canCatch =
      side === 1 ? tally.canCatchUp.teamOne : tally.canCatchUp.teamTwo;
    const otherCanCatch =
      side === 1 ? tally.canCatchUp.teamTwo : tally.canCatchUp.teamOne;
    const theirTotal =
      side === 1 ? tally.teamTwoTotal : tally.teamOneTotal;
    const aheadAndVulnerable =
      !tally.roundWinner &&
      gamesLeft > 0 &&
      canCatch &&
      total > theirTotal &&
      otherCanCatch;
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
        {!tally.roundWinner && gamesLeft > 0 ? (
          <p
            className={[
              "mt-1 text-[11px] font-semibold",
              !canCatch
                ? "text-[var(--danger)]"
                : aheadAndVulnerable
                  ? "text-[var(--amber)]"
                  : "text-[var(--felt-deep)]",
            ].join(" ")}
          >
            {!canCatch
              ? "Can’t catch up"
              : aheadAndVulnerable
                ? "Can still be caught"
                : need == null || need === 0
                  ? "On track"
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

function presetId(teamId: string, name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${teamId}:${slug || "lineup"}`;
}

function LineupEditor({
  match,
  draft,
  divisionId,
  readOnly = false,
  onChangeLineup,
  onMoveLineup,
  onReplaceLineup,
}: {
  match: ScoringMatchDetail;
  draft: ScoringDraft;
  divisionId: string;
  readOnly?: boolean;
  onChangeLineup: (
    side: 1 | 2,
    index: number,
    playerId: string | null,
  ) => void;
  onMoveLineup: (side: 1 | 2, from: number, to: number) => void;
  onReplaceLineup: (side: 1 | 2, next: (string | null)[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [presets, setPresets] = useState<LineupPreset[]>([]);
  const [presetName, setPresetName] = useState("Default lineup");
  const [presetStatus, setPresetStatus] = useState<string | null>(null);

  const slots = Math.max(
    draft.teamOneLineup.length,
    draft.teamTwoLineup.length,
    5,
  );
  const filledOne = draft.teamOneLineup.filter(Boolean).length;
  const filledTwo = draft.teamTwoLineup.filter(Boolean).length;

  const mySide = match.mySide;
  const myTeamId =
    mySide === 1 ? match.teamOneId : mySide === 2 ? match.teamTwoId : null;
  const myLineup =
    mySide === 1
      ? draft.teamOneLineup
      : mySide === 2
        ? draft.teamTwoLineup
        : null;
  const myPlayers =
    mySide === 1
      ? match.teamOnePlayers
      : mySide === 2
        ? match.teamTwoPlayers
        : [];

  useEffect(() => {
    setPresets(loadLineupPresets());
  }, []);

  const teamPresets = presets.filter(
    (preset) =>
      preset.divisionId === divisionId &&
      Boolean(myTeamId) &&
      preset.teamId === myTeamId,
  );

  const rosterFor = (players: ScoringPlayer[]) =>
    [...players]
      .filter((player) => player.showOnRoster !== false)
      .sort((a, b) => (b.fargoRating ?? 0) - (a.fargoRating ?? 0))
      .map((player) => ({
        id: player.id,
        label: playerDisplayName(player),
        rating: player.fargoRating,
      }));

  const savePreset = () => {
    if (!mySide || !myTeamId || !myLineup) {
      setPresetStatus("Sign in on your team’s match to save a lineup.");
      return;
    }
    if (myLineup.some((id) => !id)) {
      setPresetStatus(`Fill all ${slots} of your slots before saving.`);
      return;
    }
    const name = presetName.trim() || "Default lineup";
    const preset: LineupPreset = {
      id: presetId(myTeamId, name),
      name,
      divisionId,
      teamId: myTeamId,
      playerIds: myLineup.filter((id): id is string => Boolean(id)),
      updatedAt: new Date().toISOString(),
    };
    try {
      const next = upsertLineupPreset(preset);
      setPresets(next);
      setPresetName(name);
      setPresetStatus(`Saved “${name}”.`);
    } catch {
      setPresetStatus("Couldn't save lineup — local storage may be blocked.");
    }
  };

  const applyPreset = (preset: LineupPreset) => {
    if (!mySide) return;
    const ids = Array.from({ length: slots }, (_, index) => {
      const id = preset.playerIds[index] ?? null;
      return id && myPlayers.some((player) => player.id === id) ? id : null;
    });
    onReplaceLineup(mySide, ids);
    setPresetName(preset.name);
    setPresetStatus(`Loaded “${preset.name}”.`);
  };

  const removePreset = (preset: LineupPreset) => {
    setPresets(deleteLineupPreset(preset.id));
    setPresetStatus(`Deleted “${preset.name}”.`);
  };

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
            {filledOne + filledTwo}/{slots * 2} filled
            {readOnly
              ? " · view only"
              : " · drag ⠿ or ▲▼ · presets"}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
          {open ? "Collapse ▴" : readOnly ? "View ▾" : "Change ▾"}
        </span>
      </button>

      {open ? (
        <div className="space-y-4">
          {mySide && myTeamId && !readOnly ? (
            <div className="rounded-[1.3rem] border border-[var(--line)] bg-[var(--surface)] p-3 sm:p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--amber)]">
                Your lineup presets
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Same saved lineups as Handicap — load or save for{" "}
                {mySide === 1 ? match.teamOneName : match.teamTwoName}.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  value={presetName}
                  onChange={(event) => setPresetName(event.target.value)}
                  placeholder="Preset name"
                  className="w-full flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:ring-2 focus:ring-[var(--felt-soft)]"
                />
                <button
                  type="button"
                  onClick={savePreset}
                  className="rounded-full bg-[var(--felt)] px-4 py-2 text-sm font-semibold text-white"
                >
                  Save lineup
                </button>
              </div>
              {presetStatus ? (
                <p className="mt-2 text-xs text-[var(--felt-deep)]">
                  {presetStatus}
                </p>
              ) : null}
              {teamPresets.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {teamPresets.map((preset) => (
                    <li
                      key={preset.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--surface-2)] px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--ink)]">
                          {preset.name}
                        </p>
                        <p className="text-[11px] text-[var(--muted)]">
                          {preset.playerIds.length} players
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => applyPreset(preset)}
                          className="rounded-full bg-[var(--felt)] px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          Load
                        </button>
                        <button
                          type="button"
                          onClick={() => removePreset(preset)}
                          className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)]"
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-[var(--muted)]">
                  No saved lineups yet for this team.
                </p>
              )}
            </div>
          ) : null}

          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <DraggableLineupList
              title={match.teamOneName}
              subtitle={`Home · H1–H${slots}${mySide === 1 ? " · Your team" : ""}`}
              slotPrefix="H"
              lineupIds={draft.teamOneLineup}
              roster={rosterFor(match.teamOnePlayers)}
              disabled={readOnly}
              onChange={(index, id) => onChangeLineup(1, index, id)}
              onMove={(from, to) => onMoveLineup(1, from, to)}
            />
            <DraggableLineupList
              title={match.teamTwoName}
              subtitle={`Away · A1–A${slots}${mySide === 2 ? " · Your team" : ""}`}
              slotPrefix="A"
              lineupIds={draft.teamTwoLineup}
              roster={rosterFor(match.teamTwoPlayers)}
              disabled={readOnly}
              onChange={(index, id) => onChangeLineup(2, index, id)}
              onMove={(from, to) => onMoveLineup(2, from, to)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function nextRaceScore(current: number, delta: number, options: number[]): number {
  const sorted = [...options].sort((a, b) => a - b);
  if (delta > 0) {
    return sorted.find((value) => value > current) ?? sorted[sorted.length - 1] ?? current;
  }
  const lower = [...sorted].reverse().find((value) => value < current);
  return lower ?? sorted[0] ?? current;
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
  const [mounted, setMounted] = useState(false);
  const [spacerPx, setSpacerPx] = useState(104);
  const scoresRef = useRef<HTMLDivElement | null>(null);
  const [, startPadTransition] = useTransition();
  const maxWin = match.maxScore > 0 ? match.maxScore : 10;
  const maxLoss = match.maxLosingScore >= 0 ? match.maxLosingScore : 7;

  useEffect(() => {
    setMounted(true);
  }, []);

  // Resync when opening/switching games — not on every parent score echo.
  useEffect(() => {
    if (!open) return;
    setLocal(game ?? null);
    // Intentionally omit `game` so parent transitions don't clobber local taps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, roundNumber, gameIndex]);

  useLayoutEffect(() => {
    if (!open) return;

    const measure = () => {
      const tabs = document.querySelector<HTMLElement>("[data-report-tabs]");
      const viewportHeight =
        window.visualViewport?.height ?? window.innerHeight;
      const maxSpacer = Math.max(72, Math.floor(viewportHeight * 0.32));
      // Always use the tab bar's own height — never its document Y.
      // (Fixed positioning inside transformed ancestors was the old bug;
      // we portal to body, and spacer is just "room for sticky tabs".)
      const height = tabs ? Math.ceil(tabs.offsetHeight) : 104;
      setSpacerPx(Math.min(Math.max(height, 72), maxSpacer));
    };

    measure();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Keep scores at the top of the sheet if anything tries to scroll them away.
    scoresRef.current?.scrollIntoView({ block: "start" });

    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [open, roundNumber, gameIndex]);

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

  const scoreOptionsFor = (side: 1 | 2) => {
    const other =
      side === 1 ? (local.teamTwoScore ?? 0) : (local.teamOneScore ?? 0);
    if (other === maxWin) {
      return RACE_SCORE_OPTIONS.filter((value) => value !== maxWin);
    }
    return [...RACE_SCORE_OPTIONS];
  };

  const setScore = (side: 1 | 2, value: number) => {
    commit(
      applyRaceScore(local, side, value, {
        maxScore: maxWin,
        maxLosingScore: maxLoss,
      }),
    );
  };

  const bump = (side: 1 | 2, delta: number) => {
    const options = scoreOptionsFor(side);
    const current =
      side === 1 ? (local.teamOneScore ?? 0) : (local.teamTwoScore ?? 0);
    setScore(side, nextRaceScore(current, delta, options));
  };

  const quickWin = (side: 1 | 2) => {
    commit(
      applyQuickWin(local, side, {
        maxScore: maxWin,
        maxLosingScore: maxLoss,
        adornment: local.winAdornment,
      }),
    );
  };

  const sheet = (
    <div
      className="fixed inset-0 z-[100] flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={`Round ${roundNumber} game ${gameIndex} score pad`}
    >
      <button
        type="button"
        aria-label="Dismiss score pad"
        className="shrink-0 bg-black/50"
        style={{ height: spacerPx }}
        onClick={onClose}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-[1.25rem] border-t border-[var(--line)] bg-[var(--paper-2)] shadow-[var(--shadow)]">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
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

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain [overflow-anchor:none] px-4 py-4 pb-[calc(1rem+var(--safe-bottom))]">
          <div ref={scoresRef} className="grid grid-cols-2 gap-3">
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

                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => bump(side as 1 | 2, -1)}
                      className="rounded-xl bg-[var(--surface)] py-2 text-lg font-semibold active:scale-[0.98]"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      onClick={() => bump(side as 1 | 2, 1)}
                      className="rounded-xl bg-[var(--surface)] py-2 text-lg font-semibold active:scale-[0.98]"
                    >
                      +
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => quickWin(side as 1 | 2)}
                    className={[
                      "mt-2 w-full rounded-xl py-2.5 text-sm font-semibold text-white active:scale-[0.98]",
                      isWinner
                        ? "bg-[var(--felt-soft)]"
                        : "bg-[var(--felt)]",
                    ].join(" ")}
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
    </div>
  );

  return (
    <>
      <aside className="hidden rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface)]/50 p-5 text-sm text-[var(--muted)] lg:block">
        Score pad open — use the full-screen editor.
      </aside>
      {mounted ? createPortal(sheet, document.body) : null}
    </>
  );
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  confirmTone = "primary",
  busy = false,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  confirmTone?: "primary" | "danger";
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [busy, onCancel]);

  const dialog = (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/45 p-4 sm:items-center"
      role="presentation"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="score-confirm-title"
        aria-describedby="score-confirm-body"
        className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h4
          id="score-confirm-title"
          className="font-[family-name:var(--font-display)] text-xl text-[var(--felt-deep)]"
        >
          {title}
        </h4>
        <p id="score-confirm-body" className="mt-2 text-sm text-[var(--muted)]">
          {body}
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-4 py-2.5 text-sm font-semibold text-[var(--ink)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={[
              "rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50",
              confirmTone === "danger"
                ? "bg-[var(--danger)]"
                : "bg-[var(--felt)]",
            ].join(" ")}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  if (!mounted || typeof document === "undefined") return null;
  return createPortal(dialog, document.body);
}

function ReviewPanel({
  match,
  draft,
  submitting,
  locked = false,
  onEdit,
  onSubmit,
}: {
  match: ScoringMatchDetail;
  draft: ScoringDraft;
  submitting: boolean;
  locked?: boolean;
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
          {locked ? "Submitted scoresheet" : "Ready to send to LMS?"}
        </h4>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Rounds {roundWins.teamOne}–{roundWins.teamTwo} · games{" "}
          {totals.teamOneWins}–{totals.teamTwoWins} · {totals.scored} of{" "}
          {totals.total} complete
          {incomplete && !locked ? " · finish every game first" : ""}
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
          {locked ? "Back to sheet" : "Keep editing"}
        </button>
        {!locked ? (
          <button
            type="button"
            disabled={submitting || incomplete}
            onClick={onSubmit}
            className="rounded-xl bg-[var(--felt)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit to LMS"}
          </button>
        ) : null}
      </div>
      {locked ? (
        <p className="text-xs text-[var(--muted)]">
          Editing and resubmit are disabled after a scoresheet is submitted.
        </p>
      ) : incomplete ? (
        <p className="text-xs text-[var(--muted)]">
          Score every game before submitting — LMS expects a complete
          scoresheet.
        </p>
      ) : (
        <p className="text-xs text-[var(--muted)]">
          Next step asks you to confirm, then sends through the same LMS
          endpoint as the official BCAPL scoring app.
        </p>
      )}
    </div>
  );
}
