"use client";

import {
  memo,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  fetchRemoteDraft,
  fetchRemoteDraftSummaries,
  newerDraft,
  pushRemoteDraft,
} from "@/lib/draft-sync";
import {
  applyFormatRaceTargets,
  formatScoringSummary,
  formatUsesWinLoseMatchups,
  padRaceLimits,
  raceScoreOptions,
  resolveScoringFormat,
} from "@/lib/division-scoring-config";
import type { LeagueScoringFormat } from "@/lib/scoring-formats";
import { raceChartMeta } from "@/lib/race-charts";
import {
  applyQuickWin,
  applyRaceScore,
  buildVerticalMatchPayload,
  computeMatchHandicaps,
  draftHasStartedPlay,
  emptyDraft,
  gameKey,
  gamePlayStatus,
  gameWinner,
  loadDraft,
  MATCH_POINTS_ROUND,
  MATCH_POINTS_TAB_LABEL,
  normalizeDraftScores,
  playerDisplayName,
  RACE_SCORE_OPTIONS,
  saveDraft,
  summarizeDraftForBoard,
  syncLineupToGames,
  tallyAllRoundPoints,
  tallyAllRoundsByGameWins,
  tallyDraft,
  tallyMatchPointsRound,
  teamRaceWinnerSide,
  type DraftBoardSummary,
  type GameScoreState,
  type RoundPointsTally,
  type ScoringDraft,
  type ScoringMatchDetail,
  type ScoringMatchSummary,
  type ScoringPlayer,
  type WinAdornment,
} from "@/lib/scoring";
import {
  tallyPlayerNight,
  type PlayerNightStat,
} from "@/lib/format-score-preview";
import { loadTeamLineupPresets } from "@/lib/lineup-sync";
import { canAccessLmsClient } from "@/lib/lms-access";
import {
  combineScoreMatchupsForNight,
  computeMatchupStandingScores,
  roleLabel,
  type CombinedHalfKind,
  type CombinedScoreMatchup,
} from "@/lib/combined-night-matchup";
import {
  comboNightHint,
  comboPartLabel,
  comboRoleForDivisionName,
  findKnownComboForDivisionName,
  mergeCombinedStandings,
} from "@/lib/division-combos";
import {
  scoringSideForDivision,
  standingSideForDivision,
} from "@/lib/division-link-config";
import type { DivisionLink } from "@/lib/division-links";
import type { NightHalfStatus } from "@/lib/night-standing";
import { rankForTeam, teamRanksFromReport } from "@/lib/standings";
import type { LineupPreset, TableReport } from "@/lib/types";
import {
  AccentRecordCard,
  accentRecordListClass,
} from "./AccentRecordCard";
import { BackButton } from "./BackButton";
import { EmptyState } from "./EmptyState";
import {
  IconSubTabs,
  LineupsSubIcon,
  MatchesSubIcon,
  MatchupSubIcon,
  RoundsSubIcon,
  StatsSubIcon,
} from "./IconSubTabs";
import { LoadingState } from "./LoadingState";
import type { AuthUser } from "./LoginScreen";
import { DraggableLineupList } from "./DraggableLineupList";
import { LoadLineupMenu } from "./LoadLineupMenu";
import { MatchListCard, type MatchBoardStatus } from "./MatchListCard";
import { MatchScoreboard } from "./MatchScoreboard";
import { PanelHeader, PanelHeaderCount } from "./PanelHeader";
import { SelectField } from "./SelectField";
import { SubTabCard } from "./SubTabCard";

type MatchScoringProps = {
  divisionId: string | null;
  divisionName: string | null;
  /** Sister LMS division for a combined night (e.g. Beyond Teams). */
  linkedDivisionId?: string | null;
  linkedDivisionName?: string | null;
  /** Active Tableside division link (standing + race HC overrides). */
  divisionLink?: DivisionLink | null;
  teamId: string | null;
  teamName: string | null;
  /** Explicit prefs format id, or null for auto. */
  scoringFormatId?: string | null;
  user: AuthUser | null;
  authLoading?: boolean;
  onRequestLogin: () => void;
  onRequestContext: () => void;
};

type SaveStatus = "idle" | "saving" | "saved" | "local";

type SheetPane = "lineup" | "scoring" | "performance";

type View =
  | { mode: "list" }
  | { mode: "combined"; pairKey: string }
  | { mode: "sheet"; matchId: string; fromCombined?: string }
  | { mode: "review"; matchId: string; fromCombined?: string };

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

/** Local YYYY-MM-DD for grouping a division night. */
function matchNightKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10) || value;
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todayNightKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function pickDefaultNightKey(keys: string[]): string | null {
  if (keys.length === 0) return null;
  const sorted = [...keys].sort();
  const today = todayNightKey();
  if (sorted.includes(today)) return today;
  const upcoming = sorted.find((key) => key >= today);
  if (upcoming) return upcoming;
  return sorted[sorted.length - 1] ?? null;
}

function boardSummaryOptions(format: LeagueScoringFormat) {
  const limits = padRaceLimits(format, { maxScore: 0, maxLosingScore: -1 });
  return {
    teamPointMode: format.teamPointMode,
    includeMatchPointsRound: format.matchPointsRound,
    maxScore: limits.maxWin,
    maxLosingScore: limits.maxLoss,
  } as const;
}

function winnerOptionsForFormat(
  format: LeagueScoringFormat,
  match?: Pick<ScoringMatchDetail, "maxScore" | "maxLosingScore"> | null,
) {
  const limits = padRaceLimits(
    format,
    match ?? { maxScore: 0, maxLosingScore: -1 },
  );
  return {
    maxScore: limits.maxWin,
    maxLosingScore: limits.maxLoss,
    raceTargetOne: limits.raceTargetOne,
    raceTargetTwo: limits.raceTargetTwo,
  };
}

function mergeBoardSummary(
  remote: DraftBoardSummary | undefined,
  local: ScoringDraft | null,
  format: LeagueScoringFormat,
): DraftBoardSummary | null {
  if (!local && !remote) return null;
  if (!local) return remote ?? null;
  const fromLocal = summarizeDraftForBoard(
    local,
    null,
    boardSummaryOptions(format),
  );
  if (!remote) return fromLocal;
  if (remote.submittedAt) return remote;
  const localTs = Date.parse(fromLocal.updatedAt);
  const remoteTs = Date.parse(remote.updatedAt);
  if (Number.isNaN(localTs)) return remote;
  if (Number.isNaN(remoteTs) || localTs >= remoteTs) return fromLocal;
  return remote;
}

function boardStatusFor(
  match: ScoringMatchSummary,
  summary: DraftBoardSummary | null,
  draft?: ScoringDraft | null,
  format?: LeagueScoringFormat | null,
): MatchBoardStatus {
  // LMS is the source of truth for "submitted to Fargo".
  // A Tableside-only submittedAt without hasBeenPlayed is a sync issue, not Complete.
  if (match.hasBeenPlayed) return "complete";
  // Live only when a game has points or a winner — empty drafts stay Not started.
  const winnerOpts = format ? winnerOptionsForFormat(format, match) : undefined;
  if (draftHasStartedPlay(draft, winnerOpts)) return "in_progress";
  if (
    summary &&
    ((summary.gamesStarted ?? 0) > 0 || summary.gamesScored > 0)
  ) {
    return "in_progress";
  }
  if (summary?.submittedAt) return "in_progress";
  return "not_started";
}

function scoreLabel(
  game: GameScoreState | undefined,
  options?: Parameters<typeof gameWinner>[1],
): string {
  const s1 = game?.teamOneScore ?? 0;
  const s2 = game?.teamTwoScore ?? 0;
  const adorn = game?.winAdornment ?? "";
  const winner = gameWinner(game, {
    maxScore: options?.maxScore,
    maxLosingScore: options?.maxLosingScore,
    raceTargetOne: options?.raceTargetOne ?? game?.raceTargetOne,
    raceTargetTwo: options?.raceTargetTwo ?? game?.raceTargetTwo,
  });
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

/** Scoring-cookie LMS id (real account, not impersonation target). */
function scoringSessionLmsId(user: AuthUser | null): string {
  if (!user) return "";
  if (user.impersonating && user.actor?.lmsId) return user.actor.lmsId.trim();
  return (user.lmsId || "").trim();
}

function scoringSessionName(user: AuthUser | null): string {
  if (!user) return "";
  if (user.impersonating && user.actor) {
    return (user.actor.name || "").trim();
  }
  return (user.name || "").trim();
}

function stampGameScorer(
  game: GameScoreState,
  lmsId: string,
  name: string,
): GameScoreState {
  const scoredBy = lmsId.trim();
  if (!scoredBy) return game;
  return {
    ...game,
    scoredBy,
    scoredByName: name.trim() || null,
  };
}

function resolveScorerName(
  match: ScoringMatchDetail,
  updatedBy: string | null | undefined,
  updatedByName: string | null | undefined,
): string {
  const stored = (updatedByName || "").trim();
  if (stored) return stored;
  const id = (updatedBy || "").trim();
  if (!id) return "Another scorer";
  const player =
    findPlayer(match.teamOnePlayers, id) ||
    findPlayer(match.teamTwoPlayers, id);
  if (player) return playerDisplayName(player);
  return "Another scorer";
}

function linkScoringOverrides(
  link: DivisionLink | null | undefined,
  matchDivisionId: string | null | undefined,
): {
  linkFormatId: string | null;
  linkRaceChartId: import("@/lib/race-charts").RaceChartId | null;
} {
  if (!link || !matchDivisionId) {
    return { linkFormatId: null, linkRaceChartId: null };
  }
  const side = scoringSideForDivision(link.config, {
    divisionId: matchDivisionId,
    primaryDivisionId: link.primaryDivisionId,
    linkedDivisionId: link.linkedDivisionId,
  });
  return {
    linkFormatId: side.scoringFormatId ?? null,
    linkRaceChartId: side.raceChartId ?? null,
  };
}

function formatForMatchHalf(
  match: Pick<
    ScoringMatchSummary,
    "divisionId" | "divisionName" | "numberOfSets" | "pointsForWin" | "matchWinCountsAsRound"
  >,
  args: {
    scoringFormatId?: string | null;
    divisionLink?: DivisionLink | null;
    fallbackDivisionName?: string | null;
  },
): LeagueScoringFormat {
  const linkOverrides = linkScoringOverrides(
    args.divisionLink,
    match.divisionId,
  );
  return resolveScoringFormat({
    prefsFormatId: args.scoringFormatId,
    divisionName: match.divisionName || args.fallbackDivisionName,
    playersPerTeam: match.numberOfSets || null,
    pointsForWin: match.pointsForWin ?? null,
    matchWinCountsAsRound: match.matchWinCountsAsRound ?? null,
    linkFormatId: linkOverrides.linkFormatId,
    linkRaceChartId: linkOverrides.linkRaceChartId,
  });
}

function nightStatusFromBoard(
  match: ScoringMatchSummary,
  summary: DraftBoardSummary | null,
  draft: ScoringDraft | null,
  format?: LeagueScoringFormat | null,
): NightHalfStatus {
  const status = boardStatusFor(match, summary, draft, format);
  if (status === "complete") return "complete";
  if (status === "in_progress") return "in_progress";
  return "not_started";
}

export function MatchScoring({
  divisionId,
  divisionName,
  linkedDivisionId = null,
  linkedDivisionName = null,
  divisionLink = null,
  teamId,
  teamName,
  scoringFormatId = null,
  user,
  authLoading = false,
  onRequestLogin,
  onRequestContext,
}: MatchScoringProps) {
  const [matches, setMatches] = useState<ScoringMatchSummary[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [teamReport, setTeamReport] = useState<TableReport | null>(null);

  const [view, setView] = useState<View>({ mode: "list" });
  const [match, setMatch] = useState<ScoringMatchDetail | null>(null);
  const [draft, setDraft] = useState<ScoringDraft | null>(null);
  const [loadingMatch, setLoadingMatch] = useState(false);
  const [activeRound, setActiveRound] = useState(1);
  const [sheetTab, setSheetTab] = useState<SheetPane>("scoring");
  const [activeGame, setActiveGame] = useState<{
    roundNumber: number;
    gameIndex: number;
  } | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [submitNeedsReview, setSubmitNeedsReview] = useState(false);
  const [operatorSubmitAvailable, setOperatorSubmitAvailable] = useState(false);
  const [draftSummaries, setDraftSummaries] = useState<
    Record<string, DraftBoardSummary>
  >({});
  const [selectedNightKey, setSelectedNightKey] = useState<string | null>(null);
  const [sharedDrafts, setSharedDrafts] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<
    null | "reset" | "submit" | "unlock-resubmit"
  >(null);
  /** After confirm, allow editing a match LMS already has as played. */
  const [resubmitUnlocked, setResubmitUnlocked] = useState(false);
  const resubmitUnlockedRef = useRef(false);
  const [, startTransition] = useTransition();
  const saveTimerRef = useRef<number | null>(null);
  const dirtyRef = useRef(false);
  const baseUpdatedAtRef = useRef<string | null>(null);
  const draftRef = useRef<ScoringDraft | null>(null);
  const pushSeqRef = useRef(0);
  const sheetLockedRef = useRef(false);

  const matchesUrl = (
    divId: string,
    selectedTeamId: string | null,
    selectedTeamName: string | null,
  ) => {
    const params = new URLSearchParams({
      divisionId: divId,
      mine: "0",
    });
    if (selectedTeamId) params.set("teamId", selectedTeamId);
    if (selectedTeamName) params.set("teamName", selectedTeamName);
    return `/api/scoring/matches?${params.toString()}`;
  };

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    resubmitUnlockedRef.current = resubmitUnlocked;
  }, [resubmitUnlocked]);

  useEffect(() => {
    if (!user) {
      setOperatorSubmitAvailable(false);
      return;
    }
    let cancelled = false;
    void fetch("/api/scoring/submit/operator")
      .then((response) => response.json())
      .then((data: { configured?: boolean }) => {
        if (!cancelled) setOperatorSubmitAvailable(Boolean(data.configured));
      })
      .catch(() => {
        if (!cancelled) setOperatorSubmitAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const persistDraft = (next: ScoringDraft) => {
    if (sheetLockedRef.current) return;
    saveDraft(next);
    dirtyRef.current = true;
    setSaveStatus("saving");
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
          setSaveStatus("saved");
          setSyncNote(
            "Another device saved first — loaded their scores. Re-open a game to change it (you’ll be asked to confirm any mismatch).",
          );
          return;
        }
        if (remote.draft) {
          baseUpdatedAtRef.current = remote.draft.updatedAt;
        } else {
          baseUpdatedAtRef.current = next.updatedAt;
        }
        dirtyRef.current = false;
        setSaveStatus(remote.shared ? "saved" : "local");
        setSyncNote(null);
      })
      .catch(() => {
        // Keep local draft; shared store may be offline/unconfigured.
        dirtyRef.current = false;
        setSaveStatus("local");
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
      setDraftSummaries({});
      setSelectedNightKey(null);
      return;
    }
    let cancelled = false;
    async function load() {
      setLoadingMatches(true);
      setListError(null);
      try {
        const urls = [matchesUrl(divisionId!, teamId, teamName)];
        if (linkedDivisionId) {
          urls.push(matchesUrl(linkedDivisionId, null, teamName));
        }
        const results = await Promise.all(
          urls.map((url) =>
            fetchJson<{ matches: ScoringMatchSummary[] }>(url),
          ),
        );
        if (cancelled) return;
        const byId = new Map<string, ScoringMatchSummary>();
        for (const data of results) {
          for (const match of data.matches) byId.set(match.id, match);
        }
        const merged = Array.from(byId.values());
        setMatches(merged);
        try {
          const remote = await fetchRemoteDraftSummaries(
            merged.map((item) => item.id),
          );
          if (!cancelled) {
            setSharedDrafts(remote.shared);
            setDraftSummaries(remote.summaries);
          }
        } catch {
          // Board still works with LMS status + local drafts.
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
  }, [user, divisionId, linkedDivisionId, teamId, teamName]);

  useEffect(() => {
    if (!divisionId) {
      setTeamReport(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const primary = await fetchJson<TableReport>(
          `/api/reports/teams?divisionId=${divisionId}`,
        );
        if (cancelled) return;
        if (!linkedDivisionId || !divisionLink) {
          setTeamReport(primary);
          return;
        }
        const linked = await fetchJson<TableReport>(
          `/api/reports/teams?divisionId=${linkedDivisionId}`,
        ).catch(() => null);
        if (cancelled) return;
        if (!linked) {
          setTeamReport(primary);
          return;
        }
        const primaryRole =
          divisionLink.config.standing.primary.role ??
          comboRoleForDivisionName(divisionLink.primaryDivisionName);
        setTeamReport(
          mergeCombinedStandings({
            singles:
              primaryRole === "singles" ? primary : linked,
            teams: primaryRole === "teams" ? primary : linked,
            config: divisionLink.config,
          }),
        );
      } catch {
        if (!cancelled) setTeamReport(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [divisionId, linkedDivisionId, divisionLink]);

  const teamRanks = useMemo(
    () => teamRanksFromReport(teamReport),
    [teamReport],
  );

  const nightKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const match of matches) keys.add(matchNightKey(match.datePlayed));
    return Array.from(keys).sort();
  }, [matches]);

  useEffect(() => {
    if (nightKeys.length === 0) {
      setSelectedNightKey(null);
      return;
    }
    setSelectedNightKey((current) => {
      if (current && nightKeys.includes(current)) return current;
      return pickDefaultNightKey(nightKeys);
    });
  }, [nightKeys]);

  const nightMatches = useMemo(() => {
    if (!selectedNightKey) return [];
    const rows = matches.filter(
      (match) => matchNightKey(match.datePlayed) === selectedNightKey,
    );
    const partOrder = (name: string) => {
      const label = (comboPartLabel(name) ?? "").toLowerCase();
      if (label === "singles") return 0;
      if (label === "teams") return 1;
      return 2;
    };
    rows.sort((a, b) => {
      const part = partOrder(a.divisionName) - partOrder(b.divisionName);
      if (part !== 0) return part;
      const aMine = a.mySide != null ? 0 : 1;
      const bMine = b.mySide != null ? 0 : 1;
      if (aMine !== bMine) return aMine - bMine;
      // Keep completed matches on the board, just after live/open ones.
      if (a.hasBeenPlayed !== b.hasBeenPlayed) {
        return a.hasBeenPlayed ? 1 : -1;
      }
      const loc = (a.location || "").localeCompare(b.location || "");
      if (loc !== 0) return loc;
      return a.teamOneName.localeCompare(b.teamOneName);
    });
    return rows;
  }, [matches, selectedNightKey]);

  // Live-refresh draft scores + match list while viewing the night board.
  useEffect(() => {
    if (!user || !divisionId || view.mode !== "list") return;
    let cancelled = false;
    const refreshScores = async (ids: string[]) => {
      if (ids.length === 0) return;
      try {
        const remote = await fetchRemoteDraftSummaries(ids);
        if (cancelled) return;
        setSharedDrafts(remote.shared);
        setDraftSummaries((prev) => ({ ...prev, ...remote.summaries }));
      } catch {
        // keep last known scores
      }
    };
    const refreshMatches = async () => {
      try {
        const urls = [matchesUrl(divisionId, teamId, teamName)];
        if (linkedDivisionId) {
          urls.push(matchesUrl(linkedDivisionId, null, teamName));
        }
        const results = await Promise.all(
          urls.map((url) =>
            fetchJson<{ matches: ScoringMatchSummary[] }>(url),
          ),
        );
        if (cancelled) return;
        const byId = new Map<string, ScoringMatchSummary>();
        for (const data of results) {
          for (const match of data.matches) byId.set(match.id, match);
        }
        const merged = Array.from(byId.values());
        setMatches(merged);
        await refreshScores(merged.map((item) => item.id));
      } catch {
        // keep last known board
      }
    };
    const scoreTimer = window.setInterval(() => {
      void refreshScores(nightMatches.map((item) => item.id));
    }, 5000);
    const matchTimer = window.setInterval(() => {
      void refreshMatches();
    }, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(scoreTimer);
      window.clearInterval(matchTimer);
    };
  }, [
    user,
    divisionId,
    linkedDivisionId,
    teamId,
    teamName,
    view.mode,
    nightMatches,
  ]);

  const summaryForMatch = (item: ScoringMatchSummary) => {
    const format = formatForMatchHalf(item, {
      scoringFormatId,
      divisionLink,
      fallbackDivisionName: divisionName,
    });
    return mergeBoardSummary(
      draftSummaries[item.id],
      loadDraft(item.id),
      format,
    );
  };

  const nightMatchups = useMemo(() => {
    if (!selectedNightKey) return [] as CombinedScoreMatchup[];
    return combineScoreMatchupsForNight({
      nightKey: selectedNightKey,
      matches: nightMatches,
      linked: Boolean(linkedDivisionId),
    });
  }, [selectedNightKey, nightMatches, linkedDivisionId]);

  const openMatch = async (
    matchId: string,
    options?: { fromCombined?: string },
  ) => {
    setLoadingMatch(true);
    setSheetError(null);
    setSubmitMessage(null);
    setSyncNote(null);
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
      } catch {
        // Fall back to localStorage-only.
      }

      let chosen = newerDraft(remoteDraft, local, "a");
      let choseLmsResult = false;

      const matchDivisionId =
        data.match.divisionId ?? divisionId ?? null;
      const linkOverrides = linkScoringOverrides(
        divisionLink,
        matchDivisionId,
      );
      const formatForMatch = resolveScoringFormat({
        prefsFormatId: scoringFormatId,
        // Prefer LMS half name over Tableside link display name.
        divisionName: data.match.divisionName ?? divisionName,
        playersPerTeam:
          data.match.matchFormat?.teamOnePlayers.length ||
          data.match.numberOfSets ||
          null,
        pointsForWin: data.match.pointsForWin ?? null,
        matchWinCountsAsRound: data.match.matchWinCountsAsRound ?? null,
        linkFormatId: linkOverrides.linkFormatId,
        linkRaceChartId: linkOverrides.linkRaceChartId,
      });
      const openWinnerOpts = winnerOptionsForFormat(formatForMatch, data.match);
      const chosenScored = chosen
        ? tallyDraft(chosen, openWinnerOpts).scored
        : 0;

      // Completed matches with no Tableside draft: hydrate players + scores from LMS.
      if (chosenScored === 0) {
        try {
          const lms = await fetchJson<{
            draft: ScoringDraft | null;
            summary?: DraftBoardSummary | null;
          }>(`/api/scoring/matches/${matchId}/result`);
          if (lms.draft && tallyDraft(lms.draft, openWinnerOpts).scored > 0) {
            chosen = lms.draft;
            choseLmsResult = true;
            if (!submittedAt && data.match.hasBeenPlayed) {
              submittedAt = lms.summary?.submittedAt ?? new Date().toISOString();
              setSyncNote("Scores loaded from LMS.");
            }
            if (lms.summary) {
              setDraftSummaries((prev) => ({
                ...prev,
                [matchId]: lms.summary!,
              }));
            }
          }
        } catch {
          // Keep empty / local draft when LMS result is unavailable.
        }
      }

      const canManageAnySheet =
        Boolean(user) &&
        canAccessLmsClient(user) &&
        !user?.impersonating;
      const canEditSheet = data.match.mySide != null || canManageAnySheet;
      // Only LMS hasBeenPlayed is a hard lock. Tableside submittedAt without
      // LMS confirmation must stay editable so the sheet can be re-sent.
      const lmsSubmitted = Boolean(data.match.hasBeenPlayed);
      const falseTablesideLock = Boolean(submittedAt && !lmsSubmitted);
      setResubmitUnlocked(false);
      if (falseTablesideLock) {
        submittedAt = null;
        setSyncNote(
          "Tableside marked this submitted, but LMS/Fargo still shows it unscored. Review the sheet and submit again.",
        );
        void fetch("/api/scoring/submit/unlock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchId }),
        }).catch(() => undefined);
      } else if (submittedAt) {
        setSyncNote("This match was already submitted from Tableside.");
      }
      const submittedLocked = lmsSubmitted;
      const locked = submittedLocked || !canEditSheet;
      sheetLockedRef.current = locked;

      // When we load someone else's shared draft, keep their updatedAt so the
      // poll loop and discrepancy checks don't think we just authored it.
      const adoptedRemote =
        Boolean(remoteDraft) &&
        Boolean(chosen) &&
        !choseLmsResult &&
        chosen!.updatedAt === remoteDraft!.updatedAt;
      const synced = chosen
        ? syncLineupToGames(normalizeDraftScores(chosen), data.match)
        : emptyDraft(data.match);
      let nextDraft = applyFormatRaceTargets(
        data.match,
        synced,
        formatForMatch,
      );
      if (adoptedRemote && remoteDraft) {
        nextDraft = { ...nextDraft, updatedAt: remoteDraft.updatedAt };
      }

      baseUpdatedAtRef.current = remoteDraft?.updatedAt ?? null;
      dirtyRef.current = false;
      setMatch(data.match);
      setDraft(nextDraft);
      draftRef.current = nextDraft;
      setActiveRound(data.match.matchFormat?.rounds[0]?.roundNumber ?? 1);
      setActiveGame(null);
      setSheetTab("scoring");
      setView({
        mode: "sheet",
        matchId,
        fromCombined: options?.fromCombined,
      });
      if (!locked) {
        saveDraft(nextDraft);
        // Only seed an empty shared store on open. Any re-push here rewrites
        // updatedBy to the opener and skips the score-mismatch popup — even
        // when a stale local draft merely has a newer timestamp.
        if (!remoteDraft) {
          void pushRemoteDraft(nextDraft, baseUpdatedAtRef.current)
            .then((remote) => {
              if (remote.shared) setSharedDrafts(true);
              if (remote.draft) {
                baseUpdatedAtRef.current = remote.draft.updatedAt;
              }
              if (remote.submittedAt && data.match.hasBeenPlayed) {
                sheetLockedRef.current = true;
              }
            })
            .catch(() => undefined);
        } else {
          setSharedDrafts(true);
        }
        setDraftSummaries((prev) => ({
          ...prev,
          [matchId]: summarizeDraftForBoard(
            nextDraft,
            null,
            boardSummaryOptions(formatForMatch),
          ),
        }));
      } else {
        // Keep a local copy for the night board even when the sheet is locked.
        // Don't push remote drafts for other teams' matches (view-only).
        saveDraft(nextDraft);
        setDraftSummaries((prev) => ({
          ...prev,
          [matchId]:
            prev[matchId] ??
            summarizeDraftForBoard(
              nextDraft,
              submittedLocked
                ? (submittedAt ?? new Date().toISOString())
                : null,
              boardSummaryOptions(formatForMatch),
            ),
        }));
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
    if (view.mode !== "sheet" && view.mode !== "review") return;
    if (!view.matchId || !match) return;
    const matchId = view.matchId;
    const activeMatch = match;
    const timer = window.setInterval(() => {
      if (dirtyRef.current || saveTimerRef.current != null) return;
      void fetchRemoteDraft(matchId)
        .then((remote) => {
          if (!remote.shared) return;
          setSharedDrafts(true);
          // Only LMS hasBeenPlayed is a hard lock. Ignore Tableside-only
          // submittedAt so a false lock cannot re-lock an open sheet.
          // Don't re-lock while the user unlocked for an intentional resubmit.
          if (
            remote.submittedAt &&
            activeMatch.hasBeenPlayed &&
            !resubmitUnlockedRef.current
          ) {
            sheetLockedRef.current = true;
          } else if (remote.submittedAt && !activeMatch.hasBeenPlayed) {
            void fetch("/api/scoring/submit/unlock", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ matchId }),
            }).catch(() => undefined);
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

  const scoringFormat = useMemo(() => {
    const matchDivisionId = match?.divisionId ?? divisionId ?? null;
    const linkOverrides = linkScoringOverrides(divisionLink, matchDivisionId);
    return resolveScoringFormat({
      prefsFormatId: scoringFormatId,
      divisionName: match?.divisionName ?? divisionName,
      playersPerTeam:
        match?.matchFormat?.teamOnePlayers.length ||
        match?.numberOfSets ||
        null,
      pointsForWin: match?.pointsForWin ?? null,
      matchWinCountsAsRound: match?.matchWinCountsAsRound ?? null,
      linkFormatId: linkOverrides.linkFormatId,
      linkRaceChartId: linkOverrides.linkRaceChartId,
    });
  }, [
    scoringFormatId,
    divisionName,
    divisionId,
    divisionLink,
    match?.divisionId,
    match?.divisionName,
    match?.matchFormat?.teamOnePlayers.length,
    match?.numberOfSets,
    match?.pointsForWin,
    match?.matchWinCountsAsRound,
  ]);

  // Keep race-chart targets in sync with lineups / format.
  useEffect(() => {
    if (!match || !draft) return;
    const stamped = applyFormatRaceTargets(match, draft, scoringFormat);
    if (stamped === draft) return;
    draftRef.current = stamped;
    setDraft(stamped);
    if (!sheetLockedRef.current) saveDraft(stamped);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-stamp on lineup/format/match identity
  }, [
    match?.id,
    scoringFormat.id,
    scoringFormat.raceMode,
    scoringFormat.fixedRaceWin,
    draft?.teamOneLineup,
    draft?.teamTwoLineup,
  ]);

  const winnerOpts = useMemo(
    () => winnerOptionsForFormat(scoringFormat, match),
    [scoringFormat, match],
  );

  const totals = useMemo(
    () => (draft ? tallyDraft(draft, winnerOpts) : null),
    [draft, winnerOpts],
  );

  const hideRoundHandicap = formatUsesWinLoseMatchups(scoringFormat);

  // Handicaps depend only on lineups — keep stable across score taps.
  // Win/lose race-to-N formats are scratch (no round HC).
  const roundHandicaps = useMemo(
    () =>
      match && draft && !hideRoundHandicap
        ? computeMatchHandicaps(match, draft)
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lineup refs stay stable when only games change
    [match, draft?.teamOneLineup, draft?.teamTwoLineup, hideRoundHandicap],
  );

  const roundPointTallies = useMemo(
    () =>
      match && draft
        ? tallyAllRoundPoints(match, draft, roundHandicaps)
        : [],
    [match, draft, roundHandicaps],
  );

  const includeMatchPointsRound =
    scoringFormat.matchPointsRound && match?.matchWinCountsAsRound !== false;
  const matchWinTeamPoints = scoringFormat.teamPointMode === "match-win";

  const matchWinRoundTallies = useMemo(
    () =>
      match && draft && matchWinTeamPoints
        ? tallyAllRoundsByGameWins(match, draft, winnerOpts)
        : [],
    [match, draft, matchWinTeamPoints, winnerOpts],
  );

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
    if (matchWinTeamPoints) {
      return {
        teamOne: totals?.teamOneWins ?? 0,
        teamTwo: totals?.teamTwoWins ?? 0,
      };
    }
    let teamOne = 0;
    let teamTwo = 0;
    for (const round of roundPointTallies) {
      if (round.roundWinner === 1) teamOne += 1;
      if (round.roundWinner === 2) teamTwo += 1;
    }
    if (matchPointsTally?.roundWinner === 1) teamOne += 1;
    if (matchPointsTally?.roundWinner === 2) teamTwo += 1;
    return { teamOne, teamTwo };
  }, [matchPointsTally, matchWinTeamPoints, roundPointTallies, totals]);

  const raceClinched = useMemo(
    () =>
      teamRaceWinnerSide(
        roundWins.teamOne,
        roundWins.teamTwo,
        scoringFormat.teamRaceTo,
      ),
    [roundWins.teamOne, roundWins.teamTwo, scoringFormat.teamRaceTo],
  );

  /** Standing match pts for a Teams race sheet (LMS RDS × multiplier, usually 2). */
  const teamsStandingAward = useMemo(() => {
    if (!matchWinTeamPoints || !scoringFormat.teamRaceTo) return null;
    if (divisionLink && match) {
      const side = standingSideForDivision(divisionLink.config, {
        divisionId: match.divisionId,
        primaryDivisionId: divisionLink.primaryDivisionId,
        linkedDivisionId: divisionLink.linkedDivisionId,
      });
      if (side.role === "teams" && side.metric === "rds") {
        return side.multiplier > 0 ? side.multiplier : side.maxNightPoints;
      }
    }
    return 2;
  }, [divisionLink, match, matchWinTeamPoints, scoringFormat.teamRaceTo]);

  const standingMatchPoints = useMemo(() => {
    if (teamsStandingAward == null) return null;
    const award = teamsStandingAward;
    return {
      teamOne: raceClinched === 1 ? award : 0,
      teamTwo: raceClinched === 2 ? award : 0,
    };
  }, [raceClinched, teamsStandingAward]);

  // Close the pad if the open matchup becomes locked after a race clinch.
  useEffect(() => {
    if (!activeGame || !draft || !raceClinched) return;
    const state =
      draft.games[gameKey(activeGame.roundNumber, activeGame.gameIndex)];
    if (gameWinner(state, winnerOpts)) return;
    setActiveGame(null);
  }, [activeGame, draft, raceClinched, winnerOpts]);

  // Live point totals from played rounds only (totals tab is awarded later).
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

  const playerNight = useMemo(() => {
    if (!match || !draft) {
      return { home: [] as PlayerNightStat[], away: [] as PlayerNightStat[] };
    }
    const tallied = tallyPlayerNight(match, draft);
    const byId = new Map(
      [...tallied.home, ...tallied.away].map((stat) => [stat.playerId, stat]),
    );
    const fromLineup = (
      lineup: (string | null)[],
      side: 1 | 2,
    ): PlayerNightStat[] =>
      lineup.flatMap((id, index) => {
        if (!id) return [];
        const stat = byId.get(id);
        if (!stat) return [];
        return [{ ...stat, side, slotIndex: index + 1 }];
      });
    return {
      home: fromLineup(draft.teamOneLineup, 1),
      away: fromLineup(draft.teamTwoLineup, 2),
    };
  }, [match, draft]);

  const setGameScore = (
    roundNumber: number,
    gameIndex: number,
    next: GameScoreState,
    options?: { immediate?: boolean },
  ) => {
    // Keep the score pad snappy; heavy sheet recalcs can land in a transition.
    startTransition(() => {
      updateDraft(
        (prev) => ({
          ...prev,
          games: {
            ...prev.games,
            [gameKey(roundNumber, gameIndex)]: next,
          },
        }),
        { immediate: options?.immediate ?? true },
      );
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

  const finishSuccessfulSubmit = async (
    via: string | undefined,
    currentMatch: ScoringMatchDetail,
    currentDraft: ScoringDraft,
  ) => {
    const submittedAt = new Date().toISOString();
    // Keep local + shared drafts so the night board still shows scores.
    saveDraft(currentDraft);
    sheetLockedRef.current = true;
    setResubmitUnlocked(false);
    setSubmitMessage(
      via === "operator"
        ? "Match submitted via league operator score entry."
        : "Match submitted to LMS.",
    );
    setSubmitNeedsReview(false);
    setDraftSummaries((prev) => ({
      ...prev,
      [currentMatch.id]: summarizeDraftForBoard(
        currentDraft,
        submittedAt,
        boardSummaryOptions(scoringFormat),
      ),
    }));
    setView({ mode: "list" });
    setMatch(null);
    setDraft(null);
    if (divisionId) {
      const urls = [matchesUrl(divisionId, teamId, teamName)];
      if (linkedDivisionId) {
        urls.push(matchesUrl(linkedDivisionId, null, teamName));
      }
      const results = await Promise.all(
        urls.map((url) =>
          fetchJson<{ matches: ScoringMatchSummary[] }>(url),
        ),
      );
      const byId = new Map<string, ScoringMatchSummary>();
      for (const data of results) {
        for (const item of data.matches) byId.set(item.id, item);
      }
      const merged = Array.from(byId.values());
      setMatches(merged);
      try {
        const remote = await fetchRemoteDraftSummaries(
          merged.map((item) => item.id),
        );
        setSharedDrafts(remote.shared);
        setDraftSummaries(remote.summaries);
      } catch {
        // list still refreshed from LMS
      }
    }
  };

  const submitMatch = async (options?: { preferOperator?: boolean }) => {
    if (!match || !draft || !user) return;
    if (user.impersonating) {
      setSheetError(
        "Exit view-as before submitting to LMS. You can still save game scores to the shared draft.",
      );
      setConfirmDialog(null);
      return;
    }
    const canManageAnySheet = canAccessLmsClient(user);
    const canEditSheet = match.mySide != null || canManageAnySheet;
    if (!canEditSheet) {
      setSheetError("You can only submit scores for your team’s matches.");
      setConfirmDialog(null);
      return;
    }
    const isResubmit = Boolean(match.hasBeenPlayed);
    if (sheetLockedRef.current || (isResubmit && !resubmitUnlocked)) {
      setSheetError("This scoresheet is already submitted and locked.");
      setConfirmDialog(null);
      return;
    }

    setConfirmDialog(null);
    setSubmitting(true);
    setSheetError(null);
    setSubmitMessage(null);
    setSubmitNeedsReview(false);
    const currentMatch = match;
    const currentDraft = draft;
    // Resubmits must go through league operator entry — player verticalmatch
    // rejects already-scored matches. LO / Bright editing another team's sheet
    // also uses operator entry.
    const preferOperator =
      Boolean(options?.preferOperator) ||
      isResubmit ||
      match.mySide == null;
    try {
      const payload = buildVerticalMatchPayload({
        match: currentMatch,
        draft: currentDraft,
        scoreKeeper: user.lmsId,
      });
      const response = await fetch("/api/scoring/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload,
          preferOperator,
          resubmit: isResubmit,
        }),
      });
      const result = (await response.json().catch(() => null)) as {
        ok?: boolean;
        verifiedPlayed?: boolean | null;
        via?: string;
        stuck?: boolean;
        operatorConfigured?: boolean;
        error?: string;
      } | null;

      if (typeof result?.operatorConfigured === "boolean") {
        setOperatorSubmitAvailable(result.operatorConfigured);
      }

      if (response.ok && result?.verifiedPlayed) {
        await finishSuccessfulSubmit(
          result.via,
          currentMatch,
          currentDraft,
        );
        return;
      }

      setSubmitNeedsReview(true);
      if (result?.stuck || preferOperator) {
        setSubmitMessage(
          operatorSubmitAvailable || result?.operatorConfigured
            ? "Player submit is stuck in LMS (scores not recorded). Try league operator submit, or keep this draft."
            : "Player submit is stuck in LMS (scores not recorded). Ask a league operator to enter scores, or keep this draft.",
        );
      } else {
        setSubmitMessage(
          "LMS accepted the request, but the match still shows as unscored. Keep this draft open and verify in LMS before leaving the table.",
        );
      }
      if (!response.ok) {
        setSheetError(result?.error || `Submit failed (${response.status}).`);
      }
    } catch (err) {
      setSubmitNeedsReview(true);
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
        body="Sign in with FargoRate (or create a Tableside account and connect Fargo in Settings). Scoring submits to LMS for your division night."
        action={
          <button
            type="button"
            onClick={onRequestLogin}
            className="rounded-[var(--radius)] bg-[var(--felt)] px-4 py-2.5 text-sm font-semibold text-white"
          >
            Go to login
          </button>
        }
      />
    );
  }

  if (!user.lmsId || user.scoringReady === false) {
    return (
      <EmptyState
        title="Reconnect FargoRate to score"
        body="Your session needs a live FargoRate connection. Open Settings → Connected accounts and reconnect."
      />
    );
  }

  if (!divisionId) {
    return (
      <EmptyState
        title="Choose a division to score"
        body="Pick your division from the context card (from the teams you belong to), then open Score."
        action={
          <button
            type="button"
            onClick={onRequestContext}
            className="rounded-[var(--radius)] bg-[var(--felt)] px-4 py-2.5 text-sm font-semibold text-white"
          >
            Choose division
          </button>
        }
      />
    );
  }

  if (view.mode === "combined") {
    const matchup =
      nightMatchups.find((row) => row.key === view.pairKey) ?? null;
    if (!matchup) {
      return (
        <section className="animate-rise space-y-3 p-3 sm:p-4">
          <BackButton onClick={() => setView({ mode: "list" })} />
          <EmptyState
            title="Matchup not found"
            body="That combined night entry is no longer on the board."
            action={
              <button
                type="button"
                className="rounded-[var(--radius)] bg-[var(--felt)] px-4 py-2.5 text-sm font-semibold text-white"
                onClick={() => setView({ mode: "list" })}
              >
                Back to night board
              </button>
            }
          />
        </section>
      );
    }
    return (
      <CombinedNightHub
        matchup={matchup}
        onBack={() => setView({ mode: "list" })}
        onOpenHalf={(matchId) =>
          void openMatch(matchId, { fromCombined: matchup.key })
        }
      />
    );
  }

  if (
    (view.mode === "sheet" || view.mode === "review") &&
    (loadingMatch || !match || !draft)
  ) {
    return <LoadingState label="Opening scoresheet…" />;
  }

  if ((view.mode === "sheet" || view.mode === "review") && match && draft) {
    const reviewMode = view.mode === "review";
    const fromCombined = view.fromCombined;
    const canManageAnySheet =
      Boolean(user) &&
      canAccessLmsClient(user) &&
      !user?.impersonating;
    const canEditSheet = match.mySide != null || canManageAnySheet;
    // Lock only when LMS/Fargo has the match as played — not on Redis submittedAt.
    const isResubmit = Boolean(match.hasBeenPlayed);
    const submittedLocked = isResubmit && !resubmitUnlocked;
    const viewOnly = !canEditSheet;
    const sheetLocked = submittedLocked || viewOnly;
    sheetLockedRef.current = sheetLocked;
    const combinedPair = fromCombined
      ? (nightMatchups.find((row) => row.key === fromCombined) ?? null)
      : null;
    const halfTabs =
      combinedPair && combinedPair.halves.length > 1
        ? combinedPair.halves.map((half) => ({
            id: half.match.id,
            label: combinedHalfTabLabel(half.kind),
            icon: combinedHalfTabIcon(half.kind),
          }))
        : null;

    return (
      <section className="animate-panel w-full min-w-0 space-y-2.5 overflow-x-hidden">
        <div className="flex items-center justify-between gap-3">
          <BackButton
            onClick={() => {
              if (reviewMode) {
                setView({
                  mode: "sheet",
                  matchId: match.id,
                  fromCombined,
                });
              } else {
                setView({ mode: "list" });
                setActiveGame(null);
              }
            }}
          />
        </div>

        {halfTabs && !reviewMode ? (
          <div className="px-3 sm:px-4">
            <IconSubTabs
              aria-label="Scoresheet half"
              value={match.id}
              onChange={(id) => {
                if (id === match.id) return;
                setActiveGame(null);
                void openMatch(id, { fromCombined });
              }}
              columns={2}
              items={halfTabs}
            />
          </div>
        ) : null}

        <MatchScoreboard
          dateLabel={formatMatchDate(match.datePlayed)}
          location={match.location}
          teamOneName={match.teamOneName}
          teamTwoName={match.teamTwoName}
          mySide={match.mySide}
          roundWins={roundWins}
          roundsAvailable={
            matchWinTeamPoints
              ? Math.max(totals?.total ?? 0, rounds.length)
              : roundsAvailable
          }
          includeMatchPointsRound={includeMatchPointsRound}
          matchWinTeamPoints={matchWinTeamPoints}
          teamRaceTo={scoringFormat.teamRaceTo}
          standingMatchPoints={standingMatchPoints}
          standingPtsHint={
            teamsStandingAward != null
              ? `RDS × ${teamsStandingAward}`
              : null
          }
          formatHint={formatScoringSummary(scoringFormat)}
          pointTotals={matchPointTotals}
          gameWins={{
            teamOne: totals?.teamOneWins ?? 0,
            teamTwo: totals?.teamTwoWins ?? 0,
          }}
          gamesPlayed={totals?.scored ?? 0}
          gamesTotal={totals?.total ?? 0}
          isHandicapped={match.isHandicapped && !hideRoundHandicap}
          handicapTotals={handicapTotals}
        />

        {!sheetLocked ? (
          <p
            className={[
              "text-xs font-semibold",
              saveStatus === "saving"
                ? "text-[var(--amber)]"
                : saveStatus === "local"
                  ? "text-[var(--muted)]"
                  : "text-[var(--felt-deep)]",
            ].join(" ")}
            aria-live="polite"
          >
            {saveStatus === "saving"
              ? "Saving…"
              : saveStatus === "saved"
                ? sharedDrafts
                  ? "Saved · syncing across devices"
                  : "Saved"
                : saveStatus === "local"
                  ? "Saved on this device only"
                  : sharedDrafts
                    ? "Draft sync ready"
                    : "Save each game from the score pad"}
          </p>
        ) : null}

        {sheetError ? (
          <div className="space-y-2 rounded-[var(--radius)] border border-[var(--danger)]/30 bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger)]">
            <p>{sheetError}</p>
            {submitNeedsReview ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void submitMatch()}
                  disabled={submitting}
                  className="rounded-full bg-[var(--danger-strong)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {submitting ? "Retrying…" : "Retry submit"}
                </button>
                {operatorSubmitAvailable ? (
                  <button
                    type="button"
                    onClick={() => void submitMatch({ preferOperator: true })}
                    disabled={submitting}
                    className="rounded-full border border-[var(--danger)]/40 bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                  >
                    {submitting ? "Submitting…" : "Submit via league operator"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setSheetError(null);
                    setSubmitNeedsReview(false);
                  }}
                  className="rounded-full border border-[var(--danger)]/40 px-3 py-1.5 text-xs font-semibold"
                >
                  Keep draft
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        {submitMessage ? (
          <div
            className={[
              "space-y-2 rounded-[var(--radius)] px-3 py-2 text-sm",
              submitNeedsReview
                ? "border border-[var(--amber)]/40 bg-[color-mix(in_srgb,var(--amber)_12%,transparent)] text-[var(--amber)]"
                : "border border-[var(--felt)]/35 bg-[color-mix(in_srgb,var(--felt)_18%,transparent)] text-[var(--felt-deep)]",
            ].join(" ")}
          >
            <p>{submitMessage}</p>
            {submitNeedsReview ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void submitMatch()}
                  disabled={submitting}
                  className="rounded-full bg-[var(--felt)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {submitting ? "Retrying…" : "Retry submit"}
                </button>
                {operatorSubmitAvailable ? (
                  <button
                    type="button"
                    onClick={() => void submitMatch({ preferOperator: true })}
                    disabled={submitting}
                    className="rounded-full border border-[var(--amber)]/45 bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] disabled:opacity-50"
                  >
                    {submitting ? "Submitting…" : "Submit via league operator"}
                  </button>
                ) : null}
                <a
                  href="https://lms.fargorate.com"
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-[var(--amber)]/45 px-3 py-1.5 text-xs font-semibold text-[var(--amber)]"
                >
                  Open LMS
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setSubmitMessage(null);
                    setSubmitNeedsReview(false);
                  }}
                  className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)]"
                >
                  Keep draft
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        {syncNote ? (
          <p className="rounded-[var(--radius)] border border-[var(--amber)]/35 bg-[color-mix(in_srgb,var(--amber)_12%,transparent)] px-3 py-2 text-sm text-[var(--amber)]">
            {syncNote}
          </p>
        ) : null}

        {viewOnly ? (
          <p className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--muted)]">
            View only — you can score matches for your team. Set{" "}
            <span className="font-medium text-[var(--ink)]">My team</span> in
            context if this should be yours.
          </p>
        ) : submittedLocked ? (
          <div className="space-y-2 rounded-[var(--radius)] border border-[var(--amber)]/35 bg-[color-mix(in_srgb,var(--amber)_12%,transparent)] px-3 py-2 text-sm text-[var(--amber)]">
            <p>
              This scoresheet has been submitted to LMS. Editing is locked —
              unlock to fix a mistake, then resubmit.
            </p>
            <button
              type="button"
              onClick={() => setConfirmDialog("unlock-resubmit")}
              className="rounded-full border border-[var(--amber)]/45 bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)]"
            >
              Edit &amp; resubmit
            </button>
          </div>
        ) : isResubmit && resubmitUnlocked ? (
          <p className="rounded-[var(--radius)] border border-[var(--amber)]/35 bg-[color-mix(in_srgb,var(--amber)_12%,transparent)] px-3 py-2 text-sm text-[var(--amber)]">
            Editing unlocked for resubmit. Changes stay in Tableside until you
            review and resubmit — that overwrites the scores in LMS.
          </p>
        ) : null}

        {reviewMode ? (
          <ReviewPanel
            match={match}
            draft={draft}
            scoringFormat={scoringFormat}
            submitting={submitting}
            locked={sheetLocked}
            isResubmit={isResubmit && resubmitUnlocked}
            onEdit={() =>
              setView({ mode: "sheet", matchId: match.id, fromCombined })
            }
            onSubmit={() => setConfirmDialog("submit")}
          />
        ) : (
          <SubTabCard
            tabs={
              <IconSubTabs
                aria-label="Scoresheet sections"
                value={sheetTab}
                onChange={(id) => {
                  setSheetTab(id);
                  if (id !== "scoring") setActiveGame(null);
                }}
                columns={3}
                className="border-0 bg-transparent p-0"
                items={[
                  {
                    id: "lineup" as const,
                    label: "Lineup",
                    icon: LineupsSubIcon,
                  },
                  {
                    id: "scoring" as const,
                    label: "Scoring",
                    icon: MatchesSubIcon,
                  },
                  {
                    id: "performance" as const,
                    label: "Performance",
                    icon: StatsSubIcon,
                  },
                ]}
              />
            }
            contentClassName="p-3 sm:p-3.5"
          >
            {sheetTab === "lineup" ? (
              <div className="space-y-3">
                <p className="text-xs text-[var(--muted)]">
                  {sheetLocked
                    ? "View lineups for both teams."
                    : "Set Home and Away lineups — drag to reorder, or load a saved team lineup."}
                </p>
                <LineupEditor
                  match={match}
                  draft={draft}
                  divisionId={divisionId ?? ""}
                  readOnly={sheetLocked}
                  alwaysExpanded
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
              </div>
            ) : null}

            {sheetTab === "performance" ? (
              <ScoringPerformanceBoard
                homeName={match.teamOneName}
                awayName={match.teamTwoName}
                home={playerNight.home}
                away={playerNight.away}
              />
            ) : null}

            {sheetTab === "scoring" ? (
          <div className="grid w-full min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="w-full min-w-0 space-y-4 overflow-x-hidden">
              <div
                role="tablist"
                aria-label="Rounds"
                className="grid gap-0.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] p-0.5"
                style={{
                  gridTemplateColumns: `repeat(${
                    rounds.length + (includeMatchPointsRound ? 1 : 0)
                  }, minmax(0, 1fr))`,
                }}
              >
                {rounds.map((round) => {
                  const active = round.roundNumber === activeRound;
                  const pointsTally =
                    roundPointTallies.find(
                      (item) => item.roundNumber === round.roundNumber,
                    ) ?? null;
                  const matchWinsTally =
                    matchWinRoundTallies.find(
                      (item) => item.roundNumber === round.roundNumber,
                    ) ?? null;
                  const tally = matchWinTeamPoints
                    ? matchWinsTally
                    : pointsTally;
                  const done = tally?.gamesComplete ?? 0;
                  const decided = tally?.roundWinner != null;
                  const myWin =
                    decided && tally!.roundWinner === match.mySide;
                  const myLoss =
                    decided &&
                    Boolean(match.mySide) &&
                    tally!.roundWinner !== match.mySide;
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
                      role="tab"
                      aria-selected={active}
                      onClick={() => {
                        startTransition(() => {
                          setActiveRound(round.roundNumber);
                          setActiveGame(null);
                        });
                      }}
                      className={[
                        "min-w-0 rounded-md px-1 py-1.5 text-center transition",
                        active
                          ? "bg-[var(--felt)] text-white shadow-sm"
                          : myWin
                            ? "text-[var(--felt-deep)] hover:bg-[var(--surface)]"
                            : myLoss
                              ? "text-[var(--danger)] hover:bg-[var(--surface)]"
                              : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]",
                      ].join(" ")}
                    >
                      <p className="text-[11px] font-semibold leading-none sm:text-xs">
                        R{round.roundNumber}
                      </p>
                      <p
                        className={[
                          "mt-0.5 truncate text-[10px] font-semibold tabular-nums leading-none",
                          active ? "text-white/85" : "",
                        ].join(" ")}
                      >
                        {winnerLabel ?? `${done}/${round.games.length}`}
                      </p>
                    </button>
                  );
                })}
                {includeMatchPointsRound && matchPointsTally ? (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={isMatchPointsRound}
                    onClick={() => {
                      startTransition(() => {
                        setActiveRound(MATCH_POINTS_ROUND);
                        setActiveGame(null);
                      });
                    }}
                    className={[
                      "min-w-0 rounded-md px-1 py-1.5 text-center transition",
                      isMatchPointsRound
                        ? "bg-[var(--felt)] text-white shadow-sm"
                        : matchPointsTally.roundWinner === match.mySide
                          ? "text-[var(--felt-deep)] hover:bg-[var(--surface)]"
                          : match.mySide &&
                              matchPointsTally.roundWinner &&
                              matchPointsTally.roundWinner !== match.mySide
                            ? "text-[var(--danger)] hover:bg-[var(--surface)]"
                            : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]",
                    ].join(" ")}
                  >
                    <p className="text-[11px] font-semibold leading-none sm:text-xs">
                      {MATCH_POINTS_TAB_LABEL}
                    </p>
                    <p
                      className={[
                        "mt-0.5 truncate text-[10px] font-semibold tabular-nums leading-none",
                        isMatchPointsRound ? "text-white/85" : "",
                      ].join(" ")}
                    >
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
                    </p>
                  </button>
                ) : null}
              </div>

              {activeRoundPoints && !matchWinTeamPoints ? (
                <RoundPointsBoard
                  tally={activeRoundPoints}
                  teamOneName={match.teamOneName}
                  teamTwoName={match.teamTwoName}
                  mySide={match.mySide}
                  isHandicapped={match.isHandicapped}
                  matchPointsRound={isMatchPointsRound}
                />
              ) : null}
              {matchWinTeamPoints && !isMatchPointsRound ? (
                <p className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--muted)]">
                  {raceClinched
                    ? `Round won — ${teamsStandingAward ?? 2} standing match pts (RDS × ${teamsStandingAward ?? 2}). Remaining matchups are locked.`
                    : scoringFormat.teamRaceTo && scoringFormat.fixedRaceWin === 1
                      ? `Round-robin matchups · first to ${scoringFormat.teamRaceTo} wins the round (${teamsStandingAward ?? 2} standing match pts).`
                      : `Each match win is ${scoringFormat.pointsPerMatchWin} team point${scoringFormat.pointsPerMatchWin === 1 ? "" : "s"}${
                          scoringFormat.teamRaceTo
                            ? ` · first to ${scoringFormat.teamRaceTo}`
                            : ""
                        }${
                          scoringFormat.raceMode === "fargo-race-chart"
                            ? ` · ${raceChartMeta(scoringFormat.raceChartId ?? "r6-hot").label}`
                            : ""
                        }.`}
                </p>
              ) : null}

              {isMatchPointsRound ? (
                <p className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--muted)]">
                  Totals is overall match points across all played rounds (plus
                  handicap) — not an extra played round. It is only awarded when
                  the other team can no longer catch up — win ≤
                  {match.maxScore || 10} pts / loss ≤
                  {match.maxLosingScore >= 0 ? match.maxLosingScore : 7} pts per
                  game. Points ties break on game wins.
                </p>
              ) : (
                <div className="min-w-0 space-y-1.5">
                  {(currentRound?.games ?? []).map((game) => {
                    const state =
                      draft.games[
                        gameKey(currentRound!.roundNumber, game.index)
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
                      activeGame?.roundNumber === currentRound!.roundNumber &&
                      activeGame?.gameIndex === game.index;
                    const winner = gameWinner(state, winnerOpts);
                    const status = gamePlayStatus(state, winnerOpts);
                    const raceLocked = Boolean(raceClinched && !winner);
                    const rowDisabled = sheetLocked || raceLocked;
                    return (
                      <button
                        key={game.index}
                        type="button"
                        onClick={() => {
                          if (rowDisabled) return;
                          setActiveGame({
                            roundNumber: currentRound!.roundNumber,
                            gameIndex: game.index,
                          });
                        }}
                        disabled={rowDisabled}
                        className={[
                          "w-full min-w-0 overflow-hidden rounded-[var(--radius)] border px-2.5 py-2 text-left transition sm:px-3",
                          rowDisabled ? "cursor-default opacity-95" : "",
                          raceLocked
                            ? "border-[var(--line)] bg-[var(--surface-2)]/50 opacity-70"
                            : "",
                          selected
                            ? "border-[var(--felt)] ring-2 ring-[var(--felt)]/25"
                            : "",
                          !raceLocked && status === "complete"
                            ? "border-[var(--felt)]/55 bg-[color-mix(in_srgb,var(--felt)_12%,var(--surface))]"
                            : !raceLocked && status === "in-progress"
                              ? "border-[var(--amber)]/65 bg-[color-mix(in_srgb,var(--amber)_14%,var(--surface))]"
                              : !raceLocked
                                ? "border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
                                : "",
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
                              raceLocked
                                ? "bg-[var(--surface-2)]"
                                : status === "complete"
                                  ? "bg-[color-mix(in_srgb,var(--felt)_20%,var(--surface))]"
                                  : status === "in-progress"
                                    ? "bg-[color-mix(in_srgb,var(--amber)_22%,var(--surface))]"
                                    : "bg-[var(--surface-2)]",
                            ].join(" ")}
                          >
                            {raceLocked ? (
                              <>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                                  Locked
                                </p>
                                <p className="mt-0.5 text-[9px] uppercase tracking-[0.12em] text-[var(--muted)]">
                                  Not needed
                                </p>
                              </>
                            ) : (
                              <>
                                <p className="text-sm font-semibold tabular-nums leading-none">
                                  {scoreLabel(state, winnerOpts)}
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
                              </>
                            )}
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
                  {!currentRound?.games.length ? (
                    <p className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--muted)]">
                      No round-robin matchups on this sheet yet.
                    </p>
                  ) : null}
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                {sheetLocked ? (
                  <div className="space-y-2">
                    <p className="text-sm text-[var(--muted)]">
                      {viewOnly
                        ? "View only — scoring is for your team’s matches."
                        : "Scoresheet is locked after submit."}
                    </p>
                    {submittedLocked && canEditSheet ? (
                      <button
                        type="button"
                        onClick={() => setConfirmDialog("unlock-resubmit")}
                        className="rounded-[var(--radius)] bg-[var(--felt)] px-4 py-3 text-sm font-semibold text-white"
                      >
                        Edit &amp; resubmit
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setView({
                          mode: "review",
                          matchId: match.id,
                          fromCombined,
                        })
                      }
                      className="rounded-[var(--radius)] bg-[var(--felt)] px-4 py-3 text-sm font-semibold text-white"
                    >
                      {isResubmit && resubmitUnlocked
                        ? "Review & resubmit"
                        : "Review & submit"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!match || sheetLocked) return;
                        setConfirmDialog("reset");
                      }}
                      className="rounded-[var(--radius)] border border-[var(--danger-strong)]/55 bg-[var(--danger-strong)] px-4 py-3 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(214,69,61,0.25)] transition hover:brightness-110"
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
              scoringFormat={scoringFormat}
              scoringLmsId={scoringSessionLmsId(user)}
              scoringName={scoringSessionName(user)}
              roundNumber={activeGame?.roundNumber ?? activeRound}
              gameIndex={activeGame?.gameIndex ?? 1}
              onClose={() => setActiveGame(null)}
              onSave={(next, options) => {
                if (!activeGame || sheetLocked || !match) return;
                if (options?.remoteUpdatedAt) {
                  baseUpdatedAtRef.current = options.remoteUpdatedAt;
                }
                setGameScore(activeGame.roundNumber, activeGame.gameIndex, next, {
                  immediate: true,
                });
                // Stay on the sheet after save — don't auto-open the next game.
                setActiveGame(null);
              }}
              onAdoptRemote={(remoteGame, remoteUpdatedAt) => {
                if (!activeGame || sheetLocked || !match) return;
                if (remoteUpdatedAt) {
                  baseUpdatedAtRef.current = remoteUpdatedAt;
                }
                setGameScore(
                  activeGame.roundNumber,
                  activeGame.gameIndex,
                  remoteGame,
                  { immediate: true },
                );
              }}
            />
          </div>
            ) : null}
          </SubTabCard>
        )}

        {confirmDialog ? (
          <ConfirmDialog
            title={
              confirmDialog === "reset"
                ? "Reset this scoresheet?"
                : confirmDialog === "unlock-resubmit"
                  ? "Edit submitted scoresheet?"
                  : isResubmit && resubmitUnlocked
                    ? "Resubmit to LMS?"
                    : "Submit to LMS?"
            }
            body={
              confirmDialog === "reset"
                ? "All lineups and scores for this match will be cleared. This cannot be undone."
                : confirmDialog === "unlock-resubmit"
                  ? `Unlock editing for ${match.teamOneName.trim()} vs ${match.teamTwoName.trim()}? After you fix the sheet, you’ll need to resubmit to overwrite the scores already in LMS.`
                  : isResubmit && resubmitUnlocked
                    ? `Overwrite the scores already recorded in LMS for ${match.teamOneName.trim()} vs ${match.teamTwoName.trim()}? This cannot be undone from Tableside.`
                    : `Send the scoresheet for ${match.teamOneName.trim()} vs ${match.teamTwoName.trim()} to LMS? This cannot be undone from Tableside.`
            }
            confirmLabel={
              confirmDialog === "reset"
                ? "Reset sheet"
                : confirmDialog === "unlock-resubmit"
                  ? "Unlock for editing"
                  : isResubmit && resubmitUnlocked
                    ? "Resubmit"
                    : "Submit"
            }
            confirmTone={
              confirmDialog === "reset" ||
              (confirmDialog === "submit" && isResubmit && resubmitUnlocked)
                ? "danger"
                : "primary"
            }
            busy={confirmDialog === "submit" && submitting}
            onCancel={() => {
              if (submitting) return;
              setConfirmDialog(null);
            }}
            onConfirm={() => {
              if (confirmDialog === "reset") resetSheet();
              else if (confirmDialog === "unlock-resubmit") {
                setResubmitUnlocked(true);
                setConfirmDialog(null);
                setSyncNote(null);
              } else void submitMatch();
            }}
          />
        ) : null}
      </section>
    );
  }

  const nightLabel = selectedNightKey
    ? formatMatchDate(`${selectedNightKey}T12:00:00`)
    : null;
  const nightVenues = [
    ...new Set(
      nightMatches
        .map((item) => item.location?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const nightVenue =
    nightVenues.length === 1
      ? nightVenues[0]
      : nightVenues.length > 1
        ? `${nightVenues.length} venues`
        : null;
  const linkedCombo = linkedDivisionId
    ? findKnownComboForDivisionName(linkedDivisionName) ??
      findKnownComboForDivisionName(
        matches.find((item) => item.divisionId === divisionId)?.divisionName,
      ) ??
      findKnownComboForDivisionName(divisionName)
    : null;
  const nightHint = comboNightHint(
    linkedCombo,
    divisionLink?.config ?? null,
  );

  return (
    <section className="animate-rise space-y-3 p-3 sm:p-4">
      <PanelHeader
        title="Night board"
        description={
          <>
            Live scores for every match in{" "}
            {divisionName ? (
              <span className="font-medium text-[var(--ink)]">{divisionName}</span>
            ) : (
              "your division"
            )}
            {linkedDivisionId ? " · combined night" : null}
            {teamName ? (
              <>
                {" "}
                · your team{" "}
                <span className="font-medium text-[var(--ink)]">{teamName}</span>
              </>
            ) : null}
            {linkedDivisionId ? null : (
              <>
                {" · "}
                {formatScoringSummary(scoringFormat)}
              </>
            )}
            {sharedDrafts ? " · live sync on" : null}
            {nightHint ? (
              <>
                <br />
                <span className="text-[var(--muted)]">{nightHint}</span>
              </>
            ) : null}
          </>
        }
        action={
          loadingMatches ? undefined : (
            <PanelHeaderCount
              label="Matches"
              value={String(nightMatchups.length)}
            />
          )
        }
      />

      {listError ? (
        <p className="rounded-[var(--radius)] border border-[var(--danger)]/30 bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger)]">
          {listError}
        </p>
      ) : null}
      {submitMessage ? (
        <p className="rounded-[var(--radius)] border border-[var(--felt)]/35 bg-[color-mix(in_srgb,var(--felt)_18%,transparent)] px-3 py-2 text-sm text-[var(--felt-deep)]">
          {submitMessage}
        </p>
      ) : null}

      {!teamId ? (
        <p className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--muted)]">
          Set your team in context to highlight which match is yours.{" "}
          <button
            type="button"
            onClick={onRequestContext}
            className="font-semibold text-[var(--felt-deep)] underline-offset-2 hover:underline"
          >
            Set My team
          </button>
        </p>
      ) : null}

      {loadingMatches ? (
        <LoadingState label="Loading night board…" />
      ) : matches.length === 0 ? (
        <EmptyState
          title="No matches in this division"
          body="When the division schedule is available, every match that night will show here with live round scores."
        />
      ) : (
        <>
          {nightKeys.length > 1 ? (
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                Match night
              </span>
              <SelectField
                aria-label="Match night"
                value={selectedNightKey ?? nightKeys[0] ?? ""}
                onChange={setSelectedNightKey}
                options={nightKeys.map((key) => ({
                  value: key,
                  label: `${formatMatchDate(`${key}T12:00:00`)}${
                    key === todayNightKey() ? " · Tonight" : ""
                  }`,
                }))}
                buttonClassName={[
                  "rounded-[var(--radius)] border-[var(--line)] bg-[var(--surface)] px-3.5 py-2.5",
                  "font-[family-name:var(--font-display)] text-[15px] font-semibold tracking-wide text-[var(--amber)]",
                  "hover:border-[color-mix(in_srgb,var(--felt)_55%,var(--line))] hover:bg-[color-mix(in_srgb,var(--felt)_10%,var(--surface))]",
                ].join(" ")}
              />
              {nightVenue ? (
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--amber)]">
                  {nightVenue}
                </p>
              ) : null}
            </div>
          ) : nightLabel ? (
            <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                Match night
              </p>
              <p className="mt-1 font-[family-name:var(--font-display)] text-[15px] font-semibold tracking-wide text-[var(--amber)]">
                {nightLabel}
                {selectedNightKey === todayNightKey() ? " · Tonight" : ""}
              </p>
              {nightVenue ? (
                <p className="mt-1 truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--amber)]/80">
                  {nightVenue}
                </p>
              ) : null}
            </div>
          ) : null}

          {nightMatchups.length === 0 ? (
            <EmptyState
              title="No matches this night"
              body="Pick another night above, or check back when the schedule posts."
            />
          ) : (
            <div className="space-y-2.5">
              {nightMatchups.map((matchup, index) => {
                const scores = divisionLink
                  ? computeMatchupStandingScores({
                      config: divisionLink.config,
                      matchup,
                      summaryFor: (matchId) => {
                        const item = matchup.halves.find(
                          (h) => h.match.id === matchId,
                        )?.match;
                        return item ? summaryForMatch(item) : null;
                      },
                      statusFor: (item) =>
                        nightStatusFromBoard(
                          item,
                          summaryForMatch(item),
                          loadDraft(item.id),
                          formatForMatchHalf(item, {
                            scoringFormatId,
                            divisionLink,
                            fallbackDivisionName: divisionName,
                          }),
                        ),
                    })
                  : null;
                const boardStatus = scores
                  ? scores.status === "complete"
                    ? "complete"
                    : scores.status === "in_progress"
                      ? "in_progress"
                      : "not_started"
                  : (() => {
                      const first = matchup.halves[0]?.match;
                      if (!first) return "not_started" as const;
                      return boardStatusFor(
                        first,
                        summaryForMatch(first),
                        loadDraft(first.id),
                        formatForMatchHalf(first, {
                          scoringFormatId,
                          divisionLink,
                          fallbackDivisionName: divisionName,
                        }),
                      );
                    })();
                const homeRounds = scores
                  ? scores.homeStanding
                  : (summaryForMatch(matchup.halves[0]!.match)
                      ?.teamOneRoundWins ?? 0);
                const awayRounds = scores
                  ? scores.awayStanding
                  : (summaryForMatch(matchup.halves[0]!.match)
                      ?.teamTwoRoundWins ?? 0);
                return (
                  <MatchListCard
                    key={matchup.key}
                    className="animate-rise"
                    style={{
                      animationDelay: `${Math.min(index, 6) * 0.04}s`,
                    }}
                    homeName={matchup.homeName}
                    awayName={matchup.awayName}
                    badge={
                      linkedDivisionId
                        ? matchup.completePair
                          ? "Combined"
                          : roleLabel(matchup.halves[0]?.kind ?? "singles")
                        : null
                    }
                    meta={
                      scores
                        ? `Standing pts · max ${formatRawStanding(scores.standingMax)}`
                        : undefined
                    }
                    boardStatus={boardStatus}
                    isMyMatch={matchup.isMyMatch}
                    homeRounds={homeRounds}
                    awayRounds={awayRounds}
                    homeRank={rankForTeam(teamRanks, matchup.homeName)}
                    awayRank={rankForTeam(teamRanks, matchup.awayName)}
                    emphasizeHome={matchup.mySide === 1}
                    emphasizeAway={matchup.mySide === 2}
                    onClick={() => {
                      if (linkedDivisionId && matchup.halves.length > 1) {
                        const prefer =
                          matchup.halves.find((h) => h.kind === "singles") ??
                          matchup.halves[0];
                        if (prefer) {
                          void openMatch(prefer.match.id, {
                            fromCombined: matchup.key,
                          });
                        }
                        return;
                      }
                      const only = matchup.halves[0]?.match.id;
                      if (only) void openMatch(only);
                    }}
                  />
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function formatRawStanding(value: number | null | undefined): string {
  if (value == null) return "–";
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 10) / 10);
}

function combinedHalfTabLabel(kind: CombinedHalfKind): string {
  return kind === "singles" ? "Singles" : "Team";
}

function combinedHalfTabIcon(kind: CombinedHalfKind) {
  return kind === "singles" ? MatchupSubIcon : RoundsSubIcon;
}

function CombinedNightHub({
  matchup,
  onBack,
  onOpenHalf,
}: {
  matchup: CombinedScoreMatchup;
  onBack: () => void;
  onOpenHalf: (matchId: string) => void;
}) {
  const items = matchup.halves.map((half) => ({
    id: half.match.id,
    label: combinedHalfTabLabel(half.kind),
    icon: combinedHalfTabIcon(half.kind),
  }));
  const [selectedId, setSelectedId] = useState(
    () => items[0]?.id ?? "",
  );

  return (
    <section className="animate-panel w-full min-w-0 space-y-3 overflow-x-hidden p-3 sm:p-4">
      <BackButton onClick={onBack} />
      {items.length > 0 ? (
        <IconSubTabs
          aria-label="Scoresheet half"
          value={selectedId || items[0]!.id}
          onChange={(id) => {
            setSelectedId(id);
            onOpenHalf(id);
          }}
          columns={Math.min(items.length, 2)}
          items={items}
        />
      ) : null}
    </section>
  );
}

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
          "min-w-0 overflow-hidden rounded-[var(--radius)] px-2.5 py-2",
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
        "w-full min-w-0 overflow-hidden rounded-[var(--radius)] border px-3 py-2.5 sm:px-4",
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
              ? "Match points (totals)"
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

function ScoringPerformanceBoard({
  homeName,
  awayName,
  home,
  away,
}: {
  homeName: string;
  awayName: string;
  home: PlayerNightStat[];
  away: PlayerNightStat[];
}) {
  const column = (title: string, stats: PlayerNightStat[]) => (
    <div className="min-w-0 space-y-2">
      <div className="flex items-baseline justify-between gap-2 px-0.5">
        <p className="font-[family-name:var(--font-display)] text-base text-[var(--ink)]">
          {title}
        </p>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
          W-L · pts
        </p>
      </div>
      {stats.length === 0 ? (
        <p className="rounded-[var(--radius)] border border-dashed border-[var(--line)] px-3 py-4 text-sm text-[var(--muted)]">
          Set the lineup to see player performance.
        </p>
      ) : (
        <ul className={accentRecordListClass}>
          {stats.map((stat) => {
            const sideLabel = `${stat.side === 1 ? "H" : "A"}${stat.slotIndex}`;
            return (
              <li key={`${stat.side}-${stat.slotIndex}-${stat.playerId}`}>
                <AccentRecordCard>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--ink)]">
                        <span className="mr-1.5 text-[var(--muted)]">
                          {sideLabel}
                        </span>
                        {stat.name}
                      </p>
                      <p className="mt-0.5 text-xs tabular-nums text-[var(--muted)]">
                        {stat.fargo != null ? `Fargo ${stat.fargo}` : "No Fargo"}
                        {stat.games > 0
                          ? ` · ${stat.games} game${stat.games === 1 ? "" : "s"}`
                          : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-[family-name:var(--font-display)] text-lg leading-none tabular-nums text-[var(--felt-deep)]">
                        {stat.wins}-{stat.losses}
                      </p>
                      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                        {stat.points} pts
                      </p>
                    </div>
                  </div>
                </AccentRecordCard>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--muted)]">
        Player W-L and points from scored games on this sheet.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {column(homeName, home)}
        {column(awayName, away)}
      </div>
    </div>
  );
}

function LineupEditor({
  match,
  draft,
  divisionId,
  readOnly = false,
  alwaysExpanded = false,
  onChangeLineup,
  onMoveLineup,
  onReplaceLineup,
}: {
  match: ScoringMatchDetail;
  draft: ScoringDraft;
  divisionId: string;
  readOnly?: boolean;
  /** When true, skip the collapse chrome (used inside the Lineup sheet tab). */
  alwaysExpanded?: boolean;
  onChangeLineup: (
    side: 1 | 2,
    index: number,
    playerId: string | null,
  ) => void;
  onMoveLineup: (side: 1 | 2, from: number, to: number) => void;
  onReplaceLineup: (side: 1 | 2, next: (string | null)[]) => void;
}) {
  const [open, setOpen] = useState(alwaysExpanded);
  const [presets, setPresets] = useState<LineupPreset[]>([]);
  const [mobileSide, setMobileSide] = useState<1 | 2>(
    match.mySide === 2 ? 2 : 1,
  );

  const slots = Math.max(
    draft.teamOneLineup.length,
    draft.teamTwoLineup.length,
    1,
  );
  const filledOne = draft.teamOneLineup.filter(Boolean).length;
  const filledTwo = draft.teamTwoLineup.filter(Boolean).length;

  const mySide = match.mySide;

  useEffect(() => {
    setMobileSide(mySide === 2 ? 2 : 1);
  }, [match.id, mySide]);
  const myTeamId =
    mySide === 1 ? match.teamOneId : mySide === 2 ? match.teamTwoId : null;
  const myPlayers =
    mySide === 1
      ? match.teamOnePlayers
      : mySide === 2
        ? match.teamTwoPlayers
        : [];

  useEffect(() => {
    if (!myTeamId) {
      setPresets([]);
      return;
    }
    let cancelled = false;
    void loadTeamLineupPresets({ teamId: myTeamId, divisionId }).then(
      (result) => {
        if (!cancelled) setPresets(result.presets);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [myTeamId, divisionId]);

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

  const applyPreset = (preset: LineupPreset) => {
    if (!mySide) return;
    const ids = Array.from({ length: slots }, (_, index) => {
      const id = preset.playerIds[index] ?? null;
      return id && myPlayers.some((player) => player.id === id) ? id : null;
    });
    onReplaceLineup(mySide, ids);
  };

  const loadActionsFor = (side: 1 | 2) =>
    mySide === side && myTeamId && !readOnly ? (
      <LoadLineupMenu presets={teamPresets} onLoad={applyPreset} />
    ) : null;

  const showBody = alwaysExpanded || open;

  return (
    <div className="min-w-0 space-y-3">
      {alwaysExpanded ? (
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
          {filledOne + filledTwo}/{slots * 2} filled
          {readOnly ? " · view only" : " · drag ⠿ or ▲▼ · Load from Team"}
        </p>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex w-full min-w-0 items-center justify-between gap-3 overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-3 text-left sm:px-4"
        >
          <div className="min-w-0 flex-1 overflow-hidden">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--amber)]">
              Lineups
            </p>
            <p className="mt-0.5 text-xs text-[var(--muted)] sm:text-sm">
              {filledOne + filledTwo}/{slots * 2} filled
              {readOnly
                ? " · view only"
                : " · drag ⠿ or ▲▼ · Load from Team"}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
            {open ? "Collapse ▴" : readOnly ? "View ▾" : "Change ▾"}
          </span>
        </button>
      )}

      {showBody ? (
        <div className="space-y-4">
          {/* Mobile: one team at a time, same toggle pattern as schedule match detail */}
          <div className="space-y-3 md:hidden">
            <div
              role="tablist"
              aria-label="Lineup teams"
              className="grid grid-cols-2 gap-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] p-1"
            >
              {(
                [
                  {
                    id: 1 as const,
                    label: "Home",
                    teamName: match.teamOneName,
                    filled: filledOne,
                    isMyTeam: mySide === 1,
                  },
                  {
                    id: 2 as const,
                    label: "Away",
                    teamName: match.teamTwoName,
                    filled: filledTwo,
                    isMyTeam: mySide === 2,
                  },
                ]
              ).map((side) => {
                const selected = mobileSide === side.id;
                return (
                  <button
                    key={side.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setMobileSide(side.id)}
                    className={[
                      "min-w-0 rounded-[var(--radius)] px-2.5 py-2.5 text-left transition",
                      selected
                        ? "bg-[var(--felt)] text-white shadow-sm"
                        : "text-[var(--ink)] hover:bg-[var(--surface)]",
                    ].join(" ")}
                  >
                    <p
                      className={[
                        "text-[10px] font-semibold uppercase tracking-[0.12em]",
                        selected ? "text-white/75" : "text-[var(--muted)]",
                      ].join(" ")}
                    >
                      {side.label}
                      {side.isMyTeam ? " · Mine" : ""}
                      <span
                        className={[
                          "ml-1.5 tabular-nums",
                          selected ? "text-white/80" : "text-[var(--muted)]",
                        ].join(" ")}
                      >
                        {side.filled}/{slots}
                      </span>
                    </p>
                    <p className="mt-0.5 truncate text-sm font-semibold leading-tight">
                      {side.teamName}
                    </p>
                  </button>
                );
              })}
            </div>

            {mobileSide === 1 ? (
              <DraggableLineupList
                title={match.teamOneName}
                subtitle={`Home · H1–H${slots}${mySide === 1 ? " · Your team" : ""}`}
                slotPrefix="H"
                lineupIds={draft.teamOneLineup}
                roster={rosterFor(match.teamOnePlayers)}
                disabled={readOnly}
                actions={loadActionsFor(1)}
                onChange={(index, id) => onChangeLineup(1, index, id)}
                onMove={(from, to) => onMoveLineup(1, from, to)}
              />
            ) : (
              <DraggableLineupList
                title={match.teamTwoName}
                subtitle={`Away · A1–A${slots}${mySide === 2 ? " · Your team" : ""}`}
                slotPrefix="A"
                lineupIds={draft.teamTwoLineup}
                roster={rosterFor(match.teamTwoPlayers)}
                disabled={readOnly}
                actions={loadActionsFor(2)}
                onChange={(index, id) => onChangeLineup(2, index, id)}
                onMove={(from, to) => onMoveLineup(2, from, to)}
              />
            )}
          </div>

          {/* Desktop / tablet: both teams side by side */}
          <div className="hidden min-w-0 gap-4 md:grid md:grid-cols-2">
            <DraggableLineupList
              title={match.teamOneName}
              subtitle={`Home · H1–H${slots}${mySide === 1 ? " · Your team" : ""}`}
              slotPrefix="H"
              lineupIds={draft.teamOneLineup}
              roster={rosterFor(match.teamOnePlayers)}
              disabled={readOnly}
              actions={loadActionsFor(1)}
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
              actions={loadActionsFor(2)}
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

/** Custom listbox so the open menu can use felt blue (native <select> menus cannot). */
function RaceScoreSelect({
  label,
  value,
  options,
  emphasized = false,
  onChange,
}: {
  label: string;
  value: number;
  options: number[];
  emphasized?: boolean;
  onChange: (value: number) => void;
}) {
  const listId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const [highlight, setHighlight] = useState(() =>
    Math.max(0, options.indexOf(value)),
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;

    const updatePosition = () => {
      const rect = buttonRef.current!.getBoundingClientRect();
      const menuWidth = 120;
      const menuHeight = Math.min(224, window.innerHeight * 0.4);
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpward = spaceBelow < menuHeight + 12 && rect.top > spaceBelow;
      const left = Math.max(
        8,
        Math.min(rect.left + rect.width / 2 - menuWidth / 2, window.innerWidth - menuWidth - 8),
      );
      setMenuStyle({
        position: "fixed",
        left,
        width: menuWidth,
        top: openUpward ? undefined : rect.bottom + 6,
        bottom: openUpward
          ? Math.max(8, window.innerHeight - rect.top + 6)
          : undefined,
        maxHeight: menuHeight,
        zIndex: 200,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setHighlight(Math.max(0, options.indexOf(value)));
  }, [open, options, value]);

  const choose = (next: number) => {
    onChange(next);
    setOpen(false);
  };

  const menu =
    open && mounted
      ? createPortal(
          <ul
            ref={menuRef}
            id={listId}
            role="listbox"
            aria-label={label}
            style={menuStyle}
            className="overflow-y-auto rounded-[var(--radius)] border border-[var(--line-strong)] bg-[var(--surface-2)] py-1 shadow-[var(--shadow)]"
          >
            {options.map((option, index) => {
              const selected = option === value;
              const active = index === highlight;
              return (
                <li key={option}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() => setHighlight(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(option)}
                    className={[
                      "flex w-full items-center justify-center gap-2 px-3 py-2 font-[family-name:var(--font-display)] text-2xl tabular-nums",
                      active ? "bg-[var(--surface-3)]" : "",
                      selected
                        ? "font-semibold text-[var(--felt-deep)]"
                        : "font-normal text-[var(--ink)]",
                    ].join(" ")}
                  >
                    <span>{option}</span>
                    {selected ? (
                      <span className="text-sm text-[var(--felt)]">✓</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body,
        )
      : null;

  return (
    <div className="relative block">
      <span className="sr-only">{label}</span>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={label}
        onClick={() => setOpen((next) => !next)}
        onKeyDown={(event) => {
          if (
            event.key === "ArrowDown" ||
            event.key === "Enter" ||
            event.key === " "
          ) {
            event.preventDefault();
            setOpen(true);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        className={[
          "relative w-full rounded-[var(--radius)] px-2 py-1 text-center outline-none ring-[var(--felt-soft)] transition focus-visible:ring-2",
          emphasized
            ? "bg-[color-mix(in_srgb,var(--felt)_18%,transparent)]"
            : "hover:bg-[var(--surface-3)]/60",
        ].join(" ")}
      >
        <span
          className={[
            "font-[family-name:var(--font-display)] text-5xl leading-none tabular-nums tracking-tight sm:text-6xl",
            emphasized ? "text-[var(--felt-deep)]" : "text-[var(--ink)]",
          ].join(" ")}
        >
          {value}
        </span>
        <span
          aria-hidden
          className="ml-1 align-super text-[11px] text-[var(--muted)]"
        >
          {open ? "▴" : "▾"}
        </span>
      </button>
      {menu}
    </div>
  );
}

function gameScoreEqual(a: GameScoreState, b: GameScoreState): boolean {
  return (
    a.teamOneScore === b.teamOneScore &&
    a.teamTwoScore === b.teamTwoScore &&
    a.winAdornment === b.winAdornment &&
    a.isWinZip === b.isWinZip &&
    a.breakingTeam === b.breakingTeam &&
    a.teamOnePlayerId === b.teamOnePlayerId &&
    a.teamTwoPlayerId === b.teamTwoPlayerId &&
    a.teamOneHandicap === b.teamOneHandicap &&
    a.teamTwoHandicap === b.teamTwoHandicap
  );
}

/**
 * True when the shared draft has a real result for this game.
 * Explicit 0–0 (or empty) is treated as unscored — not a conflict.
 */
function gameHasEnteredScore(game: GameScoreState | null | undefined): boolean {
  if (!game) return false;
  if (game.teamOneScore == null && game.teamTwoScore == null) return false;
  const one = game.teamOneScore ?? 0;
  const two = game.teamTwoScore ?? 0;
  return one !== 0 || two !== 0;
}

/** Compare the result fields that define a scored game for conflict checks. */
function gameResultsDiffer(a: GameScoreState, b: GameScoreState): boolean {
  return (
    a.teamOneScore !== b.teamOneScore ||
    a.teamTwoScore !== b.teamTwoScore ||
    a.winAdornment !== b.winAdornment ||
    a.isWinZip !== b.isWinZip
  );
}

function formatGameScoreLabel(game: GameScoreState): string {
  const one = game.teamOneScore == null ? "—" : String(game.teamOneScore);
  const two = game.teamTwoScore == null ? "—" : String(game.teamTwoScore);
  const adornment = game.winAdornment ? ` ${game.winAdornment}` : "";
  return `${one} – ${two}${adornment}`;
}

function ScorePad({
  open,
  match,
  game,
  scoringFormat,
  scoringLmsId,
  scoringName,
  roundNumber,
  gameIndex,
  onClose,
  onSave,
  onAdoptRemote,
}: {
  open: boolean;
  match: ScoringMatchDetail;
  game: GameScoreState | null | undefined;
  scoringFormat: LeagueScoringFormat;
  /** Real scoring-session LMS id used for shared-draft authorship. */
  scoringLmsId: string;
  scoringName: string;
  roundNumber: number;
  gameIndex: number;
  onClose: () => void;
  onSave: (
    next: GameScoreState,
    options?: { remoteUpdatedAt?: string | null },
  ) => void;
  onAdoptRemote: (
    remoteGame: GameScoreState,
    remoteUpdatedAt?: string | null,
  ) => void;
}) {
  const [local, setLocal] = useState<GameScoreState | null>(game ?? null);
  const [baseline, setBaseline] = useState<GameScoreState | null>(game ?? null);
  const [mounted, setMounted] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [checkingRemote, setCheckingRemote] = useState(false);
  const [scoreConflict, setScoreConflict] = useState<{
    remoteGame: GameScoreState;
    remoteUpdatedAt: string | null;
    remoteUpdatedBy: string | null;
    remoteUpdatedByName: string | null;
  } | null>(null);
  const [spacerPx, setSpacerPx] = useState(104);
  const scoresRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Resync when opening/switching games — edits stay local until Save.
  useEffect(() => {
    if (!open) return;
    setLocal(game ?? null);
    setBaseline(game ?? null);
    setDiscardOpen(false);
    setScoreConflict(null);
    setCheckingRemote(false);
    // Intentionally omit `game` so parent draft echoes don't clobber local taps.
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

  if (!open || !game || !local || !baseline) {
    return (
      <aside className="hidden rounded-[var(--radius)] border border-dashed border-[var(--line)] bg-[var(--surface)]/50 p-5 text-sm text-[var(--muted)] lg:block">
        Tap a game to open the score pad.
      </aside>
    );
  }

  const dirty = !gameScoreEqual(local, baseline);
  const p1 = findPlayer(match.teamOnePlayers, local.teamOnePlayerId);
  const p2 = findPlayer(match.teamTwoPlayers, local.teamTwoPlayerId);
  const localLimits = padRaceLimits(
    scoringFormat,
    match,
    local.raceTargetOne,
    local.raceTargetTwo,
  );
  const raceTargetOne = localLimits.raceTargetOne;
  const raceTargetTwo = localLimits.raceTargetTwo;
  const maxWin = localLimits.maxWin;
  const maxLoss = localLimits.maxLoss;
  const chartMode = localLimits.chartMode;
  const winnerOpts = {
    maxScore: maxWin,
    maxLosingScore: maxLoss,
    raceTargetOne,
    raceTargetTwo,
  };
  const winner = gameWinner(local, winnerOpts);

  const commit = (next: GameScoreState) => {
    setLocal(next);
  };

  const requestClose = () => {
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    onClose();
  };

  const commitSave = (
    next: GameScoreState,
    remoteUpdatedAt?: string | null,
  ) => {
    onSave(stampGameScorer(next, scoringLmsId, scoringName), {
      remoteUpdatedAt,
    });
  };

  const saveGame = () => {
    if (checkingRemote || scoreConflict) return;
    const pending = local;
    setCheckingRemote(true);
    void (async () => {
      try {
        const remote = await fetchRemoteDraft(match.id);
        if (remote.shared) {
          const remoteGame =
            remote.draft?.games[gameKey(roundNumber, gameIndex)];
          // Prefer per-game scoredBy. Fall back to draft updatedBy only when
          // the game has no author yet (legacy scores) so editing your own
          // prior save does not prompt. Server merge backfills unchanged
          // games from the previous draft writer so other players' scores
          // keep their authorship after you overwrite a different game.
          const remoteAuthor = (
            remoteGame?.scoredBy ||
            remote.updatedBy ||
            ""
          ).trim();
          const sameAuthor =
            Boolean(scoringLmsId) &&
            Boolean(remoteAuthor) &&
            remoteAuthor === scoringLmsId;
          if (
            remoteGame &&
            gameHasEnteredScore(remoteGame) &&
            gameResultsDiffer(remoteGame, pending) &&
            !sameAuthor
          ) {
            setScoreConflict({
              remoteGame,
              remoteUpdatedAt: remote.draft?.updatedAt ?? null,
              remoteUpdatedBy:
                remoteGame.scoredBy ?? remote.updatedBy ?? null,
              remoteUpdatedByName:
                remoteGame.scoredByName ?? remote.updatedByName ?? null,
            });
            return;
          }
          if (remote.draft?.updatedAt) {
            commitSave(pending, remote.draft.updatedAt);
            return;
          }
        }
        commitSave(pending);
      } catch {
        // Shared store unreachable — save locally / best-effort push.
        commitSave(pending);
      } finally {
        setCheckingRemote(false);
      }
    })();
  };

  const scoreOptionsFor = (side: 1 | 2) => {
    if (chartMode && raceTargetOne != null && raceTargetTwo != null) {
      const target = side === 1 ? raceTargetOne : raceTargetTwo;
      const otherTarget = side === 1 ? raceTargetTwo : raceTargetOne;
      const other =
        side === 1 ? (local.teamTwoScore ?? 0) : (local.teamOneScore ?? 0);
      const options = raceScoreOptions(target);
      if (other >= otherTarget) {
        return options.filter((value) => value < target);
      }
      return options;
    }
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
        raceTargetOne,
        raceTargetTwo,
        allowedScores: scoreOptionsFor(side),
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
        raceTargetOne,
        raceTargetTwo,
        adornment: local.winAdornment,
      }),
    );
  };

  const sideMeta = (side: 1 | 2) => {
    const score =
      side === 1 ? (local.teamOneScore ?? 0) : (local.teamTwoScore ?? 0);
    const player = side === 1 ? p1 : p2;
    const name = player
      ? playerDisplayName(player)
      : side === 1
        ? match.teamOneName
        : match.teamTwoName;
    const options = scoreOptionsFor(side);
    const selectValue = options.includes(score) ? score : 0;
    const raceTo =
      chartMode && raceTargetOne != null && raceTargetTwo != null
        ? side === 1
          ? raceTargetOne
          : raceTargetTwo
        : maxWin;
    return {
      score,
      name,
      rating: player?.fargoRating ?? null,
      breaking: local.breakingTeam === side,
      isWinner: winner === side,
      options,
      selectValue,
      raceTo,
      progress: Math.min(1, score / Math.max(raceTo, 1)),
    };
  };

  const left = sideMeta(1);
  const right = sideMeta(2);

  const setAdornment = (code: WinAdornment) => {
    const currentWinner = gameWinner(local, winnerOpts);
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
        raceTargetOne,
        raceTargetTwo,
        adornment: code,
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
        className="shrink-0 bg-black/55"
        style={{ height: spacerPx }}
        onClick={requestClose}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-[1.35rem] border-t border-[var(--line)] bg-[var(--paper-2)] shadow-[var(--shadow)]">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3.5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--amber)]">
                Round {roundNumber} · Game {gameIndex}
              </p>
              {dirty ? (
                <span className="rounded-md bg-[color-mix(in_srgb,var(--amber)_18%,transparent)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--amber)]">
                  Unsaved
                </span>
              ) : null}
            </div>
            <p className="mt-1.5 font-[family-name:var(--font-display)] text-lg leading-tight text-[var(--felt-deep)]">
              {left.name}
              <span className="mx-1.5 text-[var(--muted)]">vs</span>
              {right.name}
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {chartMode &&
              raceTargetOne != null &&
              raceTargetTwo != null ? (
                <>
                  Race {raceTargetOne}–{raceTargetTwo}
                  <span className="text-[var(--line-strong)]"> · </span>
                  {raceChartMeta(scoringFormat.raceChartId ?? "r6-hot").label}
                </>
              ) : (
                <>
                  Race to {maxWin}
                  <span className="text-[var(--line-strong)]"> · </span>
                  max loss {maxLoss}
                </>
              )}
              {winner ? (
                <>
                  <span className="text-[var(--line-strong)]"> · </span>
                  <span className="font-medium text-[var(--felt-deep)]">
                    Complete
                  </span>
                </>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close score pad"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-lg leading-none text-[var(--muted)] transition hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain [overflow-anchor:none] px-4 py-4">
          <div
            ref={scoresRef}
            className={[
              "overflow-hidden rounded-[var(--radius)] border bg-[var(--surface)] shadow-sm",
              winner
                ? "border-[var(--felt)]/40"
                : "border-[var(--line)]",
            ].join(" ")}
          >
            <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2 border-b border-[var(--line)] px-3 py-3 sm:px-4">
              {([left, right] as const).map((side, index) => (
                <div
                  key={index === 0 ? "home" : "away"}
                  className={[
                    "min-w-0",
                    index === 1 ? "text-right" : "",
                    index === 0 ? "" : "col-start-3",
                  ].join(" ")}
                >
                  <p className="truncate text-sm font-semibold text-[var(--ink)]">
                    {side.name}
                  </p>
                  <div
                    className={[
                      "mt-1 flex flex-wrap items-center gap-1.5",
                      index === 1 ? "justify-end" : "",
                    ].join(" ")}
                  >
                    {side.rating != null ? (
                      <span className="text-[11px] font-semibold tabular-nums text-[var(--felt)]">
                        Fargo {side.rating}
                      </span>
                    ) : (
                      <span className="text-[11px] text-[var(--muted)]">—</span>
                    )}
                    {side.breaking ? (
                      <span className="rounded-md bg-[color-mix(in_srgb,var(--amber)_20%,transparent)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--amber)]">
                        Break
                      </span>
                    ) : null}
                    {side.isWinner ? (
                      <span className="rounded-md bg-[color-mix(in_srgb,var(--felt)_22%,transparent)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--felt-deep)]">
                        Winner
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
              <div className="col-start-2 row-start-1 self-center px-1 pt-1 text-center text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                vs
              </div>
            </div>

            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1 px-2 py-4 sm:px-3">
              {([1, 2] as const).map((side) => {
                const meta = side === 1 ? left : right;
                return (
                  <div
                    key={side}
                    className={[
                      "min-w-0",
                      side === 2 ? "col-start-3" : "",
                      meta.isWinner
                        ? "rounded-[var(--radius)] bg-[color-mix(in_srgb,var(--felt)_12%,transparent)]"
                        : "",
                    ].join(" ")}
                  >
                    <RaceScoreSelect
                      label={`Score for ${meta.name}`}
                      value={meta.selectValue}
                      options={meta.options}
                      emphasized={meta.isWinner}
                      onChange={(next) => setScore(side, next)}
                    />
                    <div className="mx-auto mt-2 h-1 w-[72%] overflow-hidden rounded-full bg-[var(--surface-3)]">
                      <div
                        className={[
                          "h-full rounded-full transition-[width] duration-300",
                          meta.isWinner
                            ? "bg-[var(--felt-deep)]"
                            : "bg-[var(--felt)]",
                        ].join(" ")}
                        style={{ width: `${meta.progress * 100}%` }}
                      />
                    </div>
                    <p className="mt-1 text-center text-[10px] tabular-nums text-[var(--muted)]">
                      {meta.score}/{meta.raceTo}
                    </p>
                  </div>
                );
              })}
              <div className="col-start-2 row-start-1 self-center pb-6 text-center font-[family-name:var(--font-display)] text-2xl text-[var(--muted)]">
                –
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-[var(--line)] bg-[var(--surface-2)]/70 px-3 py-3 sm:px-4">
              {([1, 2] as const).map((side) => {
                const meta = side === 1 ? left : right;
                return (
                  <div key={side} className="min-w-0 space-y-2">
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        aria-label={`Decrease ${meta.name} score`}
                        onClick={() => bump(side, -1)}
                        className="rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] py-2.5 text-lg font-semibold text-[var(--muted)] transition hover:border-[var(--ink)]/30 hover:bg-[var(--surface-3)] hover:text-[var(--ink)] active:scale-[0.98]"
                      >
                        −
                      </button>
                      <button
                        type="button"
                        aria-label={`Increase ${meta.name} score`}
                        onClick={() => bump(side, 1)}
                        className="rounded-lg border border-[var(--felt)]/45 bg-[color-mix(in_srgb,var(--felt)_28%,var(--surface))] py-2.5 text-lg font-semibold text-[var(--felt-deep)] transition hover:border-[var(--felt)]/70 hover:bg-[color-mix(in_srgb,var(--felt)_40%,var(--surface))] active:scale-[0.98]"
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => quickWin(side)}
                      className={[
                        "w-full rounded-lg py-2 text-xs font-semibold transition active:scale-[0.98]",
                        meta.isWinner
                          ? "bg-[var(--felt)] text-white shadow-sm"
                          : "border border-[var(--felt)]/50 bg-[color-mix(in_srgb,var(--felt)_16%,transparent)] text-[var(--felt-deep)] hover:border-[var(--felt)] hover:bg-[color-mix(in_srgb,var(--felt)_28%,transparent)]",
                      ].join(" ")}
                    >
                      {meta.isWinner ? "Winner ✓" : "Mark winner"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {winner ? (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                How they won
              </p>
              <div
                role="group"
                aria-label="Win adornment"
                className="grid grid-cols-4 gap-0.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] p-0.5"
              >
                {(
                  [
                    {
                      code: "" as WinAdornment,
                      label: "CLR",
                      hint: "No adornment",
                    },
                    {
                      code: "BR" as WinAdornment,
                      label: "BR",
                      hint: "Break and run",
                    },
                    {
                      code: "TR" as WinAdornment,
                      label: "TR",
                      hint: "Table run",
                    },
                    {
                      code: "WZ" as WinAdornment,
                      label: "ZP",
                      hint: "Win zip (10–0)",
                    },
                  ] as const
                ).map((item) => {
                  const active = local.winAdornment === item.code;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      title={item.hint}
                      aria-label={item.hint}
                      aria-pressed={active}
                      onClick={() => setAdornment(item.code)}
                      className={[
                        "rounded-lg px-1 py-2 text-center text-[11px] font-semibold transition sm:text-xs",
                        active
                          ? item.code === ""
                            ? "bg-[var(--surface-3)] text-[var(--ink)] shadow-sm"
                            : "bg-[var(--amber)] text-[#1a1208] shadow-sm"
                          : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]",
                      ].join(" ")}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() =>
                commit({
                  ...local,
                  breakingTeam: local.breakingTeam === 1 ? 2 : 1,
                })
              }
              className="rounded-[var(--radius)] border border-[var(--amber)]/40 bg-[color-mix(in_srgb,var(--amber)_12%,var(--surface))] px-3 py-2.5 text-sm font-semibold text-[var(--amber)] transition hover:border-[var(--amber)]/65 hover:bg-[color-mix(in_srgb,var(--amber)_20%,var(--surface))]"
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
              className="rounded-[var(--radius)] border border-[var(--danger)]/35 bg-[color-mix(in_srgb,var(--danger)_10%,var(--surface))] px-3 py-2.5 text-sm font-semibold text-[var(--danger)] transition hover:border-[var(--danger)]/55 hover:bg-[color-mix(in_srgb,var(--danger)_16%,var(--surface))]"
            >
              Reset 0–0
            </button>
          </div>
        </div>

        <div className="shrink-0 border-t border-[var(--line)] bg-[var(--paper-2)] px-4 py-3 pb-[calc(0.75rem+var(--safe-bottom))]">
          <button
            type="button"
            onClick={saveGame}
            disabled={!dirty || checkingRemote}
            className={[
              "w-full rounded-[var(--radius)] px-4 py-3.5 text-sm font-semibold transition enabled:active:scale-[0.99]",
              dirty
                ? "bg-[var(--felt)] text-white shadow-sm"
                : "cursor-default border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)]",
            ].join(" ")}
          >
            {checkingRemote
              ? "Checking…"
              : dirty
                ? "Save game"
                : "Saved ✓"}
          </button>
        </div>
      </div>

      {scoreConflict ? (
        <ConfirmDialog
          title="Score mismatch"
          body={
            <div className="space-y-3">
              <p>
                <span className="font-semibold text-[var(--ink)]">
                  {resolveScorerName(
                    match,
                    scoreConflict.remoteUpdatedBy,
                    scoreConflict.remoteUpdatedByName,
                  )}
                </span>{" "}
                already saved a different score for{" "}
                <span className="font-semibold text-[var(--ink)]">
                  R{roundNumber} · G{gameIndex}
                </span>
                . Confirm the discrepancy before overwriting.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                    Their score
                  </p>
                  <p className="mt-1 font-[family-name:var(--font-display)] text-lg font-semibold tabular-nums text-[var(--felt-deep)]">
                    {formatGameScoreLabel(scoreConflict.remoteGame)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                    Saved by{" "}
                    {resolveScorerName(
                      match,
                      scoreConflict.remoteUpdatedBy,
                      scoreConflict.remoteUpdatedByName,
                    )}
                  </p>
                </div>
                <div className="rounded-[var(--radius)] border border-[var(--amber)]/40 bg-[color-mix(in_srgb,var(--amber)_10%,var(--surface))] px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--amber)]">
                    Your score
                  </p>
                  <p className="mt-1 font-[family-name:var(--font-display)] text-lg font-semibold tabular-nums text-[var(--ink)]">
                    {formatGameScoreLabel(local)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                    {match.teamOneName.trim()} – {match.teamTwoName.trim()}
                  </p>
                </div>
              </div>
            </div>
          }
          cancelLabel="Cancel"
          confirmLabel="Overwrite"
          confirmTone="danger"
          onCancel={() => {
            const adopted = scoreConflict.remoteGame;
            const remoteUpdatedAt = scoreConflict.remoteUpdatedAt;
            setScoreConflict(null);
            setLocal(adopted);
            setBaseline(adopted);
            onAdoptRemote(adopted, remoteUpdatedAt);
          }}
          onConfirm={() => {
            const remoteUpdatedAt = scoreConflict.remoteUpdatedAt;
            setScoreConflict(null);
            commitSave(local, remoteUpdatedAt);
          }}
        />
      ) : null}

      {discardOpen ? (
        <ConfirmDialog
          title="Discard unsaved changes?"
          body="Score edits for this game haven’t been saved. Leave without saving?"
          confirmLabel="Discard"
          confirmTone="danger"
          onCancel={() => setDiscardOpen(false)}
          onConfirm={() => {
            setDiscardOpen(false);
            onClose();
          }}
        />
      ) : null}
    </div>
  );

  return (
    <>
      <aside className="hidden rounded-[var(--radius)] border border-dashed border-[var(--line)] bg-[var(--surface)]/50 p-5 text-sm text-[var(--muted)] lg:block">
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
  cancelLabel = "Cancel",
  confirmTone = "primary",
  busy = false,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
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
        className="w-full max-w-md rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h4
          id="score-confirm-title"
          className="font-[family-name:var(--font-display)] text-xl text-[var(--felt-deep)]"
        >
          {title}
        </h4>
        <div id="score-confirm-body" className="mt-2 text-sm text-[var(--muted)]">
          {typeof body === "string" ? <p>{body}</p> : body}
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-4 py-2.5 text-sm font-semibold text-[var(--ink)] disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={[
              "rounded-[var(--radius)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50",
              confirmTone === "danger"
                ? "border border-[var(--danger-strong)]/55 bg-[var(--danger-strong)] shadow-[0_0_0_1px_rgba(214,69,61,0.25)] transition hover:brightness-110"
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
  scoringFormat,
  submitting,
  locked = false,
  isResubmit = false,
  onEdit,
  onSubmit,
}: {
  match: ScoringMatchDetail;
  draft: ScoringDraft;
  scoringFormat: LeagueScoringFormat;
  submitting: boolean;
  locked?: boolean;
  isResubmit?: boolean;
  onEdit: () => void;
  onSubmit: () => void;
}) {
  const winnerOpts = winnerOptionsForFormat(scoringFormat, match);
  const matchWinTeamPoints = scoringFormat.teamPointMode === "match-win";
  const hideRoundHandicap = formatUsesWinLoseMatchups(scoringFormat);
  const totals = tallyDraft(draft, winnerOpts);
  const raceClinched = teamRaceWinnerSide(
    totals.teamOneWins,
    totals.teamTwoWins,
    scoringFormat.teamRaceTo,
  );
  // LMS AllScoresRequired=0 for Beyond Teams — race clinch is enough to submit.
  const incomplete = raceClinched
    ? false
    : totals.scored < totals.total;
  const roundTallies = matchWinTeamPoints
    ? []
    : tallyAllRoundPoints(match, draft);
  const roundWins = matchWinTeamPoints
    ? { teamOne: totals.teamOneWins, teamTwo: totals.teamTwoWins }
    : roundTallies.reduce(
        (acc, round) => ({
          teamOne: acc.teamOne + (round.roundWinner === 1 ? 1 : 0),
          teamTwo: acc.teamTwo + (round.roundWinner === 2 ? 1 : 0),
        }),
        { teamOne: 0, teamTwo: 0 },
      );
  const hcOne = roundTallies.reduce((sum, round) => sum + round.teamOneHandicap, 0);
  const hcTwo = roundTallies.reduce((sum, round) => sum + round.teamTwoHandicap, 0);

  return (
    <div className="space-y-4 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-4 md:p-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--amber)]">
          Review
        </p>
        <h4 className="mt-1 font-[family-name:var(--font-display)] text-xl text-[var(--felt-deep)]">
          {locked
            ? "Submitted scoresheet"
            : isResubmit
              ? "Ready to resubmit to LMS?"
              : "Ready to send to LMS?"}
        </h4>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {matchWinTeamPoints
            ? scoringFormat.teamRaceTo
              ? raceClinched
                ? `Race ${totals.teamOneWins}–${totals.teamTwoWins} (to ${scoringFormat.teamRaceTo}) · round won`
                : `Race ${totals.teamOneWins}–${totals.teamTwoWins} · first to ${scoringFormat.teamRaceTo}`
              : `Match wins ${roundWins.teamOne}–${roundWins.teamTwo}`
            : `Rounds ${roundWins.teamOne}–${roundWins.teamTwo}`}{" "}
          · {totals.scored} of {totals.total} matchups scored
          {incomplete && !locked ? " · finish the race first" : ""}
          {raceClinched && !locked
            ? " · remaining matchups not required"
            : ""}
          {match.isHandicapped && !hideRoundHandicap
            ? ` · HC ${hcOne}–${hcTwo}`
            : ""}
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
                  const complete = gameWinner(state, winnerOpts) != null;
                  return (
                    <div
                      key={game.index}
                      className="flex items-center justify-between gap-3 rounded-[var(--radius)] bg-[var(--surface-2)] px-3 py-2 text-sm"
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
                          {scoreLabel(state, winnerOpts)}
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
          className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-4 py-3 text-sm font-semibold"
        >
          {locked ? "Back to sheet" : "Keep editing"}
        </button>
        {!locked ? (
          <button
            type="button"
            disabled={submitting || incomplete}
            onClick={onSubmit}
            className="rounded-[var(--radius)] bg-[var(--felt)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {submitting
              ? isResubmit
                ? "Resubmitting…"
                : "Submitting…"
              : isResubmit
                ? "Resubmit to LMS"
                : "Submit to LMS"}
          </button>
        ) : null}
      </div>
      {locked ? (
        <p className="text-xs text-[var(--muted)]">
          Unlock the sheet from the scoresheet view to edit and resubmit.
        </p>
      ) : incomplete ? (
        <p className="text-xs text-[var(--muted)]">
          {scoringFormat.teamRaceTo
            ? `Reach ${scoringFormat.teamRaceTo} matchup wins to clinch the round before submitting.`
            : "Score every game before submitting — LMS expects a complete scoresheet."}
        </p>
      ) : (
        <p className="text-xs text-[var(--muted)]">
          {isResubmit
            ? "Next step asks you to confirm, then overwrites the scores already in LMS."
            : raceClinched
              ? "Race is clinched — remaining matchups are not required. Confirm to send to LMS."
              : "Next step asks you to confirm, then sends through the same LMS endpoint as the official BCAPL scoring app."}
        </p>
      )}
    </div>
  );
}
