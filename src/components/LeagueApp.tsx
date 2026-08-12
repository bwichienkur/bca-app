"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { readAppUrlState, writeAppUrlState } from "@/lib/app-url";
import {
  defaultTabForPillar,
  LEAGUE_SECTIONS,
  pillarForTab,
  pillarShowsPlayContext,
  tabBelongsToPillar,
} from "@/lib/app-nav";
import { DEFAULT_LEAGUE_ID } from "@/lib/constants";
import {
  comboNightHint,
  findKnownComboForDivisionName,
  mergeCombinedSchedule,
  mergeCombinedStandings,
} from "@/lib/division-combos";
import {
  buildLinkedDivisionPickerOptions,
  findLinkById,
  findLinkForDivision,
  type DivisionLink,
  type PickerDivisionOption,
} from "@/lib/division-links";
import { canAccessLmsFromPublicUser, isSuperadminClient } from "@/lib/lms-access";
import { scheduleHasMatchTonight } from "@/lib/match-night";
import { normalizeTeamName } from "@/lib/matchups";
import { enrichPlayersWithRatings } from "@/lib/players";
import {
  clearStoredMembership,
  loadPreferences,
  loadStoredMembership,
  savePreferences,
  saveStoredMembership,
} from "@/lib/preferences";
import {
  fetchSharedPreferences,
  pushSharedPreferences,
} from "@/lib/prefs-sync";
import { resolveScoringFormat } from "@/lib/division-scoring-config";
import { useViewportAnchor } from "@/lib/use-viewport-anchor";
import type {
  AppPillar,
  DivisionSummary,
  DivisionTeam,
  LeagueSummary,
  MembershipSnapshot,
  PlayersByTeamReport,
  ReportTab,
  ScheduleDay,
  ScheduleMatch,
  TableReport,
  UserPreferences,
} from "@/lib/types";
import { PillarBottomNav, PillarSideNav } from "./AppShellNav";
import { DataTable } from "./DataTable";
import { EmptyState } from "./EmptyState";
import { HandicapCalculator } from "./HandicapCalculator";
import {
  IconSubTabs,
  LineupsSubIcon,
  RosterSubIcon,
  StandingSubIcon,
} from "./IconSubTabs";
import { LoadingState } from "./LoadingState";
import { LmsOperator } from "./LmsOperator";
import { LoginScreen, type AuthUser } from "./LoginScreen";
import { ManageCreateLeague } from "./ManageCreateLeague";
import { MatchScoring } from "./MatchScoring";
import { NavTabIcon, SearchIcon } from "./NavIcons";
import { PlayerSearch } from "./PlayerSearch";
import { ScheduleList } from "./ScheduleList";
import { ScheduleMatchDetail } from "./ScheduleMatchDetail";
import { SearchField } from "./SearchField";
import { SettingsScreen } from "./SettingsScreen";
import { PanelHeader, PanelHeaderCount } from "./PanelHeader";
import { SubTabCard } from "./SubTabCard";
import { TeamDetail } from "./TeamDetail";
import { TeamLineupTemplates } from "./TeamLineupTemplates";
import { TeamStandingSummary } from "./TeamStandingSummary";
import { Tournaments } from "./Tournaments";
import { Typeahead, type TypeaheadOption } from "./Typeahead";

type AppScreen = "main" | "login";
type MyTeamSubTab = "standing" | "roster" | "lineups";

function ResyncIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 0 0-15.5-6.36" />
      <path d="M3 4v5h5" />
      <path d="M3 12a9 9 0 0 0 15.5 6.36" />
      <path d="M21 20v-5h-5" />
    </svg>
  );
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(payload?.error || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

function filterRows(rows: string[][], query: string): string[][] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => row.some((cell) => cell.toLowerCase().includes(q)));
}

function teamNameIndex(headers: string[]): number {
  const index = headers.findIndex((header) =>
    ["team", "name"].includes(header.toLowerCase()),
  );
  return index >= 0 ? index : 0;
}

function standingCellsForTeam(
  teamReport: TableReport | null,
  teamName: string | null | undefined,
) {
  if (!teamReport || !teamName) return null;
  const nameIndex = teamNameIndex(teamReport.headers);
  const row = teamReport.rows.find(
    (item) =>
      normalizeTeamName(item[nameIndex] ?? "") ===
      normalizeTeamName(teamName),
  );
  if (!row) return null;
  return teamReport.headers.map((header, index) => ({
    label: header,
    value: row[index] ?? "—",
  }));
}

export function LeagueApp() {
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [leagueQuery, setLeagueQuery] = useState("Palm Beach");
  const [leagues, setLeagues] = useState<LeagueSummary[]>([]);
  const [divisions, setDivisions] = useState<DivisionSummary[]>([]);
  const [divisionLinks, setDivisionLinks] = useState<DivisionLink[]>([]);
  const [divisionLinksReady, setDivisionLinksReady] = useState(false);
  const [selectedLeague, setSelectedLeague] = useState<LeagueSummary | null>(
    null,
  );
  const [selectedDivision, setSelectedDivision] =
    useState<DivisionSummary | null>(null);
  const urlHadExplicitTabRef = useRef(false);
  const didAutoNightLandRef = useRef(false);
  const [tab, setTabState] = useState<ReportTab>(() => {
    if (typeof window === "undefined") return "events";
    const state = readAppUrlState();
    urlHadExplicitTabRef.current = Boolean(state.tab || state.eventId);
    return state.tab ?? "events";
  });
  const [deepLinkEventId, setDeepLinkEventId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return readAppUrlState().eventId;
  });
  const deepLinkEventIdRef = useRef(deepLinkEventId);
  deepLinkEventIdRef.current = deepLinkEventId;
  const [playerSearchQuery, setPlayerSearchQuery] = useState("");
  const [screen, setScreen] = useState<AppScreen>("main");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const showManagePillar = canAccessLmsFromPublicUser(
    user?.impersonating && user.actor
      ? {
          email: user.actor.email,
          lmsId: user.actor.lmsId,
          leagueOperator: user.leagueOperator,
        }
      : user,
  );
  const activePillar = pillarForTab(tab);
  const [membership, setMembership] = useState<MembershipSnapshot | null>(null);
  const [loadingMembership, setLoadingMembership] = useState(false);
  const [membershipError, setMembershipError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [loadingLeagues, setLoadingLeagues] = useState(false);
  const [loadingDivisions, setLoadingDivisions] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [loadingContext, setLoadingContext] = useState(false);
  const [teamReport, setTeamReport] = useState<TableReport | null>(null);
  const [playerReport, setPlayerReport] = useState<TableReport | null>(null);
  const [playersByTeam, setPlayersByTeam] =
    useState<PlayersByTeamReport | null>(null);
  const [playerList, setPlayerList] = useState<TableReport | null>(null);
  const [schedule, setSchedule] = useState<ScheduleDay[] | null>(null);
  const [divisionTeams, setDivisionTeams] = useState<DivisionTeam[]>([]);
  const [filterQuery, setFilterQuery] = useState("");
  const [selectedTeamName, setSelectedTeamName] = useState<string | null>(null);
  const [selectedScheduleMatch, setSelectedScheduleMatch] = useState<{
    match: ScheduleMatch;
    date: string;
  } | null>(null);
  const [contextOpen, setContextOpen] = useState(true);
  const [myTeamSubTab, setMyTeamSubTab] = useState<MyTeamSubTab>("standing");
  const [refreshToken, setRefreshToken] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const didAutoCollapseContext = useRef(false);

  const setTab = useCallback((next: ReportTab) => {
    setTabState(next);
    if (next !== "events") {
      setDeepLinkEventId(null);
      writeAppUrlState({ tab: next, eventId: null }, "replace");
      return;
    }
    writeAppUrlState(
      { tab: next, eventId: deepLinkEventIdRef.current },
      "replace",
    );
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (tab === "account" && !user) {
      setScreen("login");
    }
  }, [authLoading, tab, user]);

  const onDeepLinkEventIdChange = useCallback((eventId: string | null) => {
    const nextId = eventId?.trim() || null;
    setTabState("events");
    setDeepLinkEventId(nextId);
    writeAppUrlState(
      { tab: "events", eventId: nextId },
      nextId ? "push" : "replace",
    );
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const state = readAppUrlState();
      setTabState(state.tab ?? "events");
      setDeepLinkEventId(state.eventId);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Stripe Connect return/refresh → Account to sync account status.
  useEffect(() => {
    if (typeof window === "undefined" || authLoading) return;
    const params = new URLSearchParams(window.location.search);
    const stripe = params.get("stripe");
    if (stripe !== "return" && stripe !== "refresh") return;
    if (user) setTab("account");
    else setScreen("login");
  }, [authLoading, user, setTab]);
  const teamReportKeyRef = useRef<string | null>(null);
  const playerReportKeyRef = useRef<string | null>(null);
  const scheduleKeyRef = useRef<string | null>(null);
  const [, startTransition] = useTransition();
  const filterAnchor = useViewportAnchor<HTMLDivElement>();

  const hasMatchTonight = useMemo(
    () => scheduleHasMatchTonight(schedule, prefs?.teamName),
    [schedule, prefs?.teamName],
  );

  const leagueDefaultOptions = useMemo(
    () => ({
      hasDivision: Boolean(selectedDivision?.id ?? prefs?.divisionId),
      hasTeam: Boolean(prefs?.teamName),
      canManage: showManagePillar,
      hasMatchTonight,
    }),
    [
      selectedDivision?.id,
      prefs?.divisionId,
      prefs?.teamName,
      showManagePillar,
      hasMatchTonight,
    ],
  );

  const selectPillar = useCallback(
    (pillar: AppPillar) => {
      if (tabBelongsToPillar(tab, pillar)) return;
      const next = defaultTabForPillar(pillar, leagueDefaultOptions);
      startTransition(() => setTab(next));
    },
    [tab, leagueDefaultOptions, setTab, startTransition],
  );

  // Match night: if the user opened the app on the default Home tab (no deep
  // link), jump to Score once the schedule confirms a match tonight.
  useEffect(() => {
    if (didAutoNightLandRef.current || urlHadExplicitTabRef.current) return;
    if (!hasMatchTonight || !selectedDivision) return;
    if (tab !== "events") return;
    didAutoNightLandRef.current = true;
    startTransition(() => setTab("score"));
  }, [hasMatchTonight, selectedDivision, tab, setTab, startTransition]);

  const persist = (next: UserPreferences) => {
    setPrefs(next);
    savePreferences(next);
    if (user) void pushSharedPreferences(next);
  };

  const loadMembership = async (options?: {
    fresh?: boolean;
    prefsOverride?: UserPreferences | null;
  }) => {
    const base = options?.prefsOverride ?? prefs;
    const scopedLeagueId =
      (base?.leagueId || DEFAULT_LEAGUE_ID).trim() || DEFAULT_LEAGUE_ID;
    setLoadingMembership(true);
    setMembershipError(null);
    try {
      const params = new URLSearchParams({ leagueId: scopedLeagueId });
      if (options?.fresh) params.set("fresh", "1");
      if (base?.divisionId) params.set("divisionId", base.divisionId);
      if (base?.teamId) params.set("teamId", base.teamId);
      if (base?.teamName) params.set("teamName", base.teamName);
      const data = await fetchJson<{ membership: MembershipSnapshot }>(
        `/api/scoring/membership?${params.toString()}`,
      );
      setMembership(data.membership);
      if (data.membership.teams.length) {
        saveStoredMembership(data.membership);
      }
      return data.membership;
    } catch (err) {
      setMembershipError(
        err instanceof Error ? err.message : "Failed to load memberships.",
      );
      return null;
    } finally {
      setLoadingMembership(false);
    }
  };

  const applyMembershipDefaults = (
    nextMembership: MembershipSnapshot,
    basePrefs: UserPreferences,
    playerName?: string | null,
  ) => {
    const bright =
      Boolean(user) &&
      isSuperadminClient(user) &&
      !user?.impersonating;

    const preferredTeam =
      nextMembership.teams.find((team) => team.teamId === basePrefs.teamId) ??
      nextMembership.teams.find(
        (team) => team.divisionId === basePrefs.divisionId,
      ) ??
      nextMembership.teams[0] ??
      null;
    const preferredDivision =
      nextMembership.divisions.find(
        (division) =>
          division.id === (preferredTeam?.divisionId ?? basePrefs.divisionId),
      ) ??
      nextMembership.divisions[0] ??
      null;
    const preferredLeague =
      nextMembership.leagues.find(
        (league) =>
          league.id === (preferredDivision?.leagueId ?? basePrefs.leagueId),
      ) ??
      nextMembership.leagues[0] ??
      null;

    if (bright) {
      // Keep Bright's chosen league/division/team (may not be in membership)
      // so linked Beyond testing isn't reset by membership refresh.
      const league =
        nextMembership.leagues.find((item) => item.id === basePrefs.leagueId) ??
        preferredLeague;
      if (league) {
        setSelectedLeague(league);
        setLeagueQuery(league.name);
      }
      if (basePrefs.divisionId && basePrefs.divisionName) {
        setSelectedDivision({
          id: basePrefs.divisionId,
          name: basePrefs.divisionName,
          year: "",
          leagueId: basePrefs.leagueId,
          leagueName: basePrefs.leagueName,
          state: league?.state ?? "",
          reportUrl: "",
        });
      } else if (preferredDivision) {
        setSelectedDivision(preferredDivision);
      }
      persist({
        ...basePrefs,
        playerId: nextMembership.playerId,
        playerName: playerName ?? basePrefs.playerName,
        leagueId: basePrefs.leagueId || preferredLeague?.id || basePrefs.leagueId,
        leagueName:
          basePrefs.leagueName ||
          preferredLeague?.name ||
          basePrefs.leagueName,
        divisionId: basePrefs.divisionId ?? preferredDivision?.id ?? null,
        divisionName: basePrefs.divisionName ?? preferredDivision?.name ?? null,
        teamId: basePrefs.teamId ?? preferredTeam?.teamId ?? null,
        teamName: basePrefs.teamName ?? preferredTeam?.teamName ?? null,
      });
      return;
    }

    if (preferredLeague) {
      setSelectedLeague(preferredLeague);
      setLeagues(nextMembership.leagues);
      setLeagueQuery(preferredLeague.name);
    }
    if (preferredDivision) {
      setSelectedDivision(preferredDivision);
      setDivisions(
        nextMembership.divisions.filter(
          (division) => division.leagueId === preferredDivision.leagueId,
        ),
      );
    } else {
      setSelectedDivision(null);
      setDivisions([]);
    }

    const nextPrefs: UserPreferences = {
      ...basePrefs,
      playerId: nextMembership.playerId,
      playerName: playerName ?? basePrefs.playerName,
      leagueId: preferredLeague?.id ?? basePrefs.leagueId,
      leagueName: preferredLeague?.name ?? basePrefs.leagueName,
      divisionId: preferredDivision?.id ?? null,
      divisionName: preferredDivision?.name ?? null,
      teamId: preferredTeam?.teamId ?? null,
      teamName: preferredTeam?.teamName ?? null,
    };
    persist(nextPrefs);
  };

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setMembership(null);
    setMembershipError(null);
    clearStoredMembership();
    setScreen("main");
  };

  const refreshCachedData = async () => {
    setRefreshing(true);
    setError(null);
    try {
      await fetchJson<{ ok: boolean }>("/api/cache/lms/refresh", {
        method: "POST",
      });
      // Clear client-held report state so loaders don't keep stale UI.
      setTeamReport(null);
      setPlayerReport(null);
      setPlayerList(null);
      setSchedule(null);
      setPlayersByTeam(null);
      setDivisionTeams([]);

      const leagueQ = selectedLeague?.name ?? leagueQuery;
      const leagueData = await fetchJson<{ leagues: LeagueSummary[] }>(
        `/api/leagues?q=${encodeURIComponent(leagueQ)}`,
      );
      setLeagues(leagueData.leagues);
      if (selectedLeague) {
        const still =
          leagueData.leagues.find((item) => item.id === selectedLeague.id) ??
          null;
        if (still) setSelectedLeague(still);
        const divisionData = await fetchJson<{
          divisions: DivisionSummary[];
        }>(`/api/leagues/${selectedLeague.id}/divisions`);
        setDivisions(divisionData.divisions);
        if (selectedDivision) {
          const nextDivision =
            divisionData.divisions.find(
              (item) => item.id === selectedDivision.id,
            ) ?? null;
          if (nextDivision) setSelectedDivision(nextDivision);
        }
      }
      setRefreshToken((value) => value + 1);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to refresh league data.",
      );
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      const saved = loadPreferences();
      setPrefs(saved);
      setLeagueQuery(saved.leagueName.split(" ").slice(0, 2).join(" "));
      setBooting(true);
      setError(null);
      try {
        const sessionData = await fetchJson<{ user: AuthUser | null }>(
          "/api/auth/session",
        );
        if (cancelled) return;
        setUser(sessionData.user);
        setAuthLoading(false);

        let effectivePrefs = saved;
        const hasFargo = Boolean(sessionData.user?.lmsId);
        if (sessionData.user && hasFargo) {
          const shared = await fetchSharedPreferences();
          if (cancelled) return;
          if (shared) {
            effectivePrefs = {
              ...saved,
              ...shared,
              playerId: sessionData.user.lmsId,
              playerName: sessionData.user.name ?? shared.playerName,
            };
            setPrefs(effectivePrefs);
            savePreferences(effectivePrefs);
            setLeagueQuery(
              effectivePrefs.leagueName.split(" ").slice(0, 2).join(" "),
            );
          } else {
            void pushSharedPreferences({
              ...saved,
              playerId: sessionData.user.lmsId,
              playerName: sessionData.user.name ?? saved.playerName,
            });
          }
        }

        // Instant filter from last successful membership scan.
        const cachedMembership =
          sessionData.user?.lmsId
            ? loadStoredMembership(sessionData.user.lmsId)
            : null;
        if (sessionData.user && cachedMembership?.teams.length) {
          setMembership(cachedMembership);
          applyMembershipDefaults(
            cachedMembership,
            effectivePrefs,
            sessionData.user.name,
          );
        } else {
          const data = await fetchJson<{ leagues: LeagueSummary[] }>(
            `/api/leagues?q=${encodeURIComponent(effectivePrefs.leagueName)}`,
          );
          if (cancelled) return;
          setLeagues(data.leagues);
          const league =
            data.leagues.find((item) => item.id === effectivePrefs.leagueId) ??
            data.leagues[0] ??
            null;
          setSelectedLeague(league);
          if (league) {
            const divisionData = await fetchJson<{
              divisions: DivisionSummary[];
            }>(`/api/leagues/${league.id}/divisions`);
            if (cancelled) return;
            setDivisions(divisionData.divisions);
            const division =
              divisionData.divisions.find(
                (item) => item.id === effectivePrefs.divisionId,
              ) ?? null;
            if (division) {
              setSelectedDivision(division);
            }
          }
        }

        // Refresh membership in the background.
        if (sessionData.user) {
          void loadMembership({
            fresh: false,
            prefsOverride: effectivePrefs,
          }).then((nextMembership) => {
            if (cancelled || !nextMembership?.teams.length) return;
            applyMembershipDefaults(
              nextMembership,
              loadPreferences(),
              sessionData.user!.name,
            );
          });
        }
      } catch (err) {
        if (!cancelled) {
          setAuthLoading(false);
          setError(err instanceof Error ? err.message : "Failed to start app");
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const membershipReady = Boolean(
    user && membership && membership.teams.length,
  );
  /** Bright (not view-as): browse every league division/team, not only membership. */
  const brightBrowseAll = Boolean(
    user && isSuperadminClient(user) && !user.impersonating,
  );
  const useMembershipCatalog = membershipReady && !brightBrowseAll;

  useEffect(() => {
    if (booting || (user && !brightBrowseAll)) return;
    const controller = new AbortController();
    const handle = window.setTimeout(async () => {
      setLoadingLeagues(true);
      try {
        const data = await fetchJson<{ leagues: LeagueSummary[] }>(
          `/api/leagues?q=${encodeURIComponent(leagueQuery)}`,
        );
        if (!controller.signal.aborted) setLeagues(data.leagues);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Failed to load leagues");
        }
      } finally {
        if (!controller.signal.aborted) setLoadingLeagues(false);
      }
    }, 220);
    return () => {
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [leagueQuery, booting, user, brightBrowseAll]);

  // Bright: always load the full public division list for the selected league
  // so sister Beyond divisions (and every team) are available to link/test.
  useEffect(() => {
    if (!brightBrowseAll || !selectedLeague) return;
    let cancelled = false;
    setLoadingDivisions(true);
    void fetchJson<{ divisions: DivisionSummary[] }>(
      `/api/leagues/${selectedLeague.id}/divisions`,
    )
      .then((data) => {
        if (!cancelled) setDivisions(data.divisions);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load divisions",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDivisions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [brightBrowseAll, selectedLeague?.id]);

  // Tableside-only named division links for the selected league.
  useEffect(() => {
    const leagueId = selectedLeague?.id ?? prefs?.leagueId ?? null;
    if (!leagueId) {
      setDivisionLinks([]);
      setDivisionLinksReady(true);
      return;
    }
    let cancelled = false;
    setDivisionLinksReady(false);
    void fetchJson<{ links: DivisionLink[] }>(
      `/api/division-links?leagueId=${encodeURIComponent(leagueId)}`,
    )
      .then((data) => {
        if (!cancelled) {
          setDivisionLinks(data.links ?? []);
          setDivisionLinksReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDivisionLinks([]);
          setDivisionLinksReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedLeague?.id, prefs?.leagueId, refreshToken]);

  // When Tableside links load, resolve the player's selection to the named link.
  useEffect(() => {
    if (!prefs?.divisionId || !divisionLinksReady) return;
    const link =
      findLinkById(divisionLinks, prefs.divisionLinkId) ??
      findLinkForDivision(divisionLinks, prefs.divisionId);

    // Named link was deleted in operator — restore LMS division naming.
    // Only runs when we had a divisionLinkId (not legacy sister-link prefs).
    if (!link && prefs.divisionLinkId) {
      const restoredName =
        divisions.find((d) => d.id === prefs.divisionId)?.name ??
        membership?.divisions.find((d) => d.id === prefs.divisionId)?.name ??
        prefs.divisionName;
      persist({
        ...prefs,
        divisionName: restoredName,
        linkedDivisionId: null,
        linkedDivisionName: null,
        divisionLinkId: null,
      });
      if (selectedDivision && restoredName) {
        setSelectedDivision({ ...selectedDivision, name: restoredName });
      }
      return;
    }

    if (!link) return;
    const already =
      prefs.divisionLinkId === link.id &&
      prefs.linkedDivisionId === link.linkedDivisionId &&
      prefs.divisionName === link.name;
    if (already) {
      if (selectedDivision && selectedDivision.name !== link.name) {
        setSelectedDivision({ ...selectedDivision, name: link.name });
      }
      return;
    }
    persist({
      ...prefs,
      divisionId: link.primaryDivisionId,
      divisionName: link.name,
      linkedDivisionId: link.linkedDivisionId,
      linkedDivisionName: link.linkedDivisionName,
      divisionLinkId: link.id,
    });
    setSelectedDivision((prev) =>
      prev
        ? {
            ...prev,
            id: link.primaryDivisionId,
            name: link.name,
          }
        : prev,
    );
    // persist/selectedDivision intentionally not in deps — avoid loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    divisionLinks,
    divisionLinksReady,
    prefs?.divisionId,
    prefs?.divisionLinkId,
  ]);

  useEffect(() => {
    if (!selectedDivision) return;
    let cancelled = false;

    async function loadDivisionBundle() {
      setLoadingContext(true);
      setPlayersByTeam(null);
      setDivisionTeams([]);
      try {
        const [byTeam, calculator] = await Promise.all([
          fetchJson<PlayersByTeamReport>(
            `/api/reports/players-by-team?divisionId=${selectedDivision!.id}`,
          ),
          fetchJson<{ teams: DivisionTeam[] }>(
            `/api/divisions/${selectedDivision!.id}/calculator`,
          ),
        ]);
        if (cancelled) return;
        setPlayersByTeam(byTeam);
        setDivisionTeams(calculator.teams);
      } catch {
        // Non-fatal for reports that don't need team context.
      } finally {
        if (!cancelled) setLoadingContext(false);
      }
    }

    void loadDivisionBundle();
    return () => {
      cancelled = true;
    };
  }, [selectedDivision, prefs?.teamId, refreshToken]);

  useEffect(() => {
    if (!selectedDivision) return;
    if (
      tab === "handicap" ||
      tab === "search" ||
      tab === "score" ||
      tab === "events" ||
      tab === "lms" ||
      tab === "create-league" ||
      tab === "account"
    ) {
      setLoadingReport(false);
      return;
    }

    let cancelled = false;
    async function loadReport() {
      const id = selectedDivision!.id;
      const linkedId = prefs?.linkedDivisionId ?? "";
      const cacheKey = `${id}:${linkedId}:${refreshToken}`;
      const needsTeams = tab === "standings" || tab === "my-team";
      const needsPlayers = tab === "players";
      const needsSchedule = tab === "schedule";

      const hasTeams = Boolean(teamReport) && teamReportKeyRef.current === cacheKey;
      const hasPlayers =
        Boolean(playerReport) && playerReportKeyRef.current === cacheKey;
      const hasSchedule =
        Boolean(schedule) && scheduleKeyRef.current === cacheKey;

      if (
        (needsTeams && hasTeams) ||
        (needsPlayers && hasPlayers) ||
        (needsSchedule && hasSchedule)
      ) {
        setLoadingReport(false);
        return;
      }

      // Keep current UI up while refetching if we already have something to show.
      const hasSoftContent =
        (needsTeams && Boolean(teamReport)) ||
        (needsPlayers && Boolean(playerReport)) ||
        (needsSchedule && Boolean(schedule));
      if (!hasSoftContent) setLoadingReport(true);
      setError(null);
      try {
        if (needsTeams) {
          const linkedId = prefs?.linkedDivisionId ?? null;
          const activeLink =
            findLinkById(divisionLinks, prefs?.divisionLinkId) ??
            findLinkForDivision(divisionLinks, id);
          const primaryLmsName =
            activeLink?.primaryDivisionName ?? selectedDivision!.name;
          const linkedLmsName =
            activeLink?.linkedDivisionName ?? prefs?.linkedDivisionName ?? null;
          const [primary, linked] = await Promise.all([
            fetchJson<TableReport>(`/api/reports/teams?divisionId=${id}`),
            linkedId
              ? fetchJson<TableReport>(
                  `/api/reports/teams?divisionId=${linkedId}`,
                ).catch(() => null)
              : Promise.resolve(null),
          ]);
          if (!cancelled) {
            // Use LMS division names (not the Tableside link display name)
            // so Beyond Singles/Teams roles still resolve.
            const combo =
              findKnownComboForDivisionName(primaryLmsName) ??
              findKnownComboForDivisionName(linkedLmsName);
            const linkConfig = activeLink?.config ?? null;
            const primaryRole =
              linkConfig?.standing.primary.role ??
              combo?.roleFromName(primaryLmsName) ??
              null;
            const data =
              linked && primaryRole
                ? mergeCombinedStandings({
                    singles: primaryRole === "singles" ? primary : linked,
                    teams: primaryRole === "teams" ? primary : linked,
                    combo: combo ?? undefined,
                    config: linkConfig,
                  })
                : primary;
            setTeamReport(data);
            teamReportKeyRef.current = cacheKey;
          }
        } else if (needsPlayers) {
          const [players, ratings] = await Promise.all([
            fetchJson<TableReport>(`/api/reports/players?divisionId=${id}`),
            fetchJson<TableReport>(
              `/api/reports/player-list?divisionId=${id}`,
            ).catch(() => null),
          ]);
          if (!cancelled) {
            setPlayerReport(players);
            setPlayerList(ratings);
            playerReportKeyRef.current = cacheKey;
          }
        } else if (needsSchedule) {
          const linkedId = prefs?.linkedDivisionId ?? null;
          const activeLink =
            findLinkById(divisionLinks, prefs?.divisionLinkId) ??
            findLinkForDivision(divisionLinks, id);
          const primaryLmsName =
            activeLink?.primaryDivisionName ?? selectedDivision!.name;
          const linkedLmsName =
            activeLink?.linkedDivisionName ??
            prefs?.linkedDivisionName ??
            "Linked";
          const [scheduleData, linkedSchedule, teams] = await Promise.all([
            fetchJson<{ days: ScheduleDay[] }>(
              `/api/reports/schedule?divisionId=${id}`,
            ),
            linkedId
              ? fetchJson<{ days: ScheduleDay[] }>(
                  `/api/reports/schedule?divisionId=${linkedId}`,
                ).catch(() => null)
              : Promise.resolve(null),
            fetchJson<TableReport>(
              `/api/reports/teams?divisionId=${id}`,
            ).catch(() => null),
          ]);
          if (!cancelled) {
            const days =
              linkedId && linkedSchedule?.days
                ? mergeCombinedSchedule({
                    primary: {
                      divisionId: id,
                      divisionName: primaryLmsName,
                      days: scheduleData.days,
                    },
                    linked: {
                      divisionId: linkedId,
                      divisionName: linkedLmsName,
                      days: linkedSchedule.days,
                    },
                  })
                : scheduleData.days;
            setSchedule(days);
            scheduleKeyRef.current = cacheKey;
            if (teams) {
              setTeamReport(teams);
              teamReportKeyRef.current = cacheKey;
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load report");
        }
      } finally {
        if (!cancelled) setLoadingReport(false);
      }
    }

    void loadReport();
    return () => {
      cancelled = true;
    };
    // teamReport/playerReport/schedule intentionally omitted — cache keys gate refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedDivision,
    tab,
    refreshToken,
    prefs?.linkedDivisionId,
    prefs?.divisionLinkId,
    divisionLinks,
  ]);

  useEffect(() => {
    setFilterQuery("");
    // Standings / schedule drill-ins are opt-in via click only — never carry
    // a selection across tabs or division changes.
    setSelectedTeamName(null);
    setSelectedScheduleMatch(null);
  }, [tab, selectedDivision?.id]);

  const chooseLeague = async (league: LeagueSummary) => {
    setSelectedLeague(league);
    setSelectedDivision(null);
    setSelectedTeamName(null);
    setLoadingDivisions(true);
    setError(null);
    try {
      if (useMembershipCatalog) {
        setDivisions(
          membership!.divisions.filter(
            (division) => division.leagueId === league.id,
          ),
        );
      } else {
        const data = await fetchJson<{ divisions: DivisionSummary[] }>(
          `/api/leagues/${league.id}/divisions`,
        );
        setDivisions(data.divisions);
      }
      persist({
        ...(prefs ?? {
          playerId: user?.lmsId ?? null,
          playerName: user?.name ?? null,
          teamId: null,
          teamName: null,
          divisionId: null,
          divisionName: null,
          linkedDivisionId: null,
          linkedDivisionName: null,
          leagueId: league.id,
          leagueName: league.name,
        }),
        leagueId: league.id,
        leagueName: league.name,
        divisionId: null,
        divisionName: null,
        linkedDivisionId: null,
        linkedDivisionName: null,
        divisionLinkId: null,
        teamId: null,
        teamName: null,
        playerId: user?.lmsId ?? prefs?.playerId ?? null,
        playerName: user?.name ?? prefs?.playerName ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load divisions");
    } finally {
      setLoadingDivisions(false);
    }
  };

  const chooseDivisionOption = (option: PickerDivisionOption) => {
    const link = option.link ?? null;
    const primaryId = link?.primaryDivisionId ?? option.id;
    const primary =
      divisions.find((item) => item.id === primaryId) ??
      membership?.divisions.find((item) => item.id === primaryId) ??
      null;
    const displayName = link?.name ?? option.name;
    const selected: DivisionSummary = primary
      ? { ...primary, name: displayName }
      : {
          id: primaryId,
          name: displayName,
          year: option.year,
          leagueId: option.leagueId,
          leagueName: option.leagueName,
          state: option.state,
          reportUrl: option.reportUrl,
        };

    setSelectedDivision(selected);
    setSelectedTeamName(null);
    setTab("standings");
    setTeamReport(null);
    setPlayerReport(null);
    setPlayerList(null);
    setSchedule(null);
    startTransition(() => undefined);
    const base = prefs ?? {
      leagueId: selected.leagueId,
      leagueName: selected.leagueName,
      divisionId: null,
      divisionName: null,
      linkedDivisionId: null,
      linkedDivisionName: null,
      divisionLinkId: null,
      playerId: user?.lmsId ?? null,
      playerName: user?.name ?? null,
      teamId: null,
      teamName: null,
    };
    const linkDivisionIds = new Set(
      link
        ? [link.primaryDivisionId, link.linkedDivisionId]
        : [primaryId],
    );
    const membershipTeams =
      membership?.teams.filter((team) =>
        linkDivisionIds.has(team.divisionId),
      ) ?? [];
    const keepTeam =
      prefs?.teamId &&
      membershipTeams.some((team) => team.teamId === prefs.teamId)
        ? { teamId: prefs.teamId, teamName: prefs.teamName }
        : membershipTeams[0]
          ? {
              teamId: membershipTeams[0].teamId,
              teamName: membershipTeams[0].teamName,
            }
          : { teamId: null, teamName: null };

    persist({
      ...base,
      leagueId: selected.leagueId,
      leagueName: selected.leagueName,
      divisionId: primaryId,
      divisionName: displayName,
      linkedDivisionId: link?.linkedDivisionId ?? null,
      linkedDivisionName: link?.linkedDivisionName ?? null,
      divisionLinkId: link?.id ?? null,
      ...keepTeam,
      playerId: user?.lmsId ?? base.playerId,
      playerName: user?.name ?? base.playerName,
    });
  };

  const setMyTeam = (team: DivisionTeam) => {
    if (!prefs || !selectedDivision) return;
    setTab("my-team");
    persist({
      ...prefs,
      divisionId: selectedDivision.id,
      divisionName: selectedDivision.name,
      teamId: team.id,
      teamName: team.name,
    });
  };

  const clearLeague = () => {
    setSelectedLeague(null);
    setSelectedDivision(null);
    setSelectedTeamName(null);
    setDivisions([]);
    setDivisionTeams([]);
    setTeamReport(null);
    setPlayerReport(null);
    setPlayerList(null);
    setSchedule(null);
    setPlayersByTeam(null);
    if (prefs) {
      persist({
        ...prefs,
        divisionId: null,
        divisionName: null,
        linkedDivisionId: null,
        linkedDivisionName: null,
        divisionLinkId: null,
        teamId: null,
        teamName: null,
      });
    }
  };

  const clearDivision = () => {
    setSelectedDivision(null);
    setSelectedTeamName(null);
    setDivisionTeams([]);
    setTeamReport(null);
    setPlayerReport(null);
    setPlayerList(null);
    setSchedule(null);
    setPlayersByTeam(null);
    if (prefs) {
      persist({
        ...prefs,
        divisionId: null,
        divisionName: null,
        linkedDivisionId: null,
        linkedDivisionName: null,
        divisionLinkId: null,
        teamId: null,
        teamName: null,
      });
    }
  };

  const clearMyTeam = () => {
    setSelectedTeamName(null);
    if (prefs) {
      persist({
        ...prefs,
        teamId: null,
        teamName: null,
      });
    }
  };

  const leagueOptions: TypeaheadOption<LeagueSummary>[] = useMemo(() => {
    const source = useMembershipCatalog ? membership!.leagues : leagues;
    return source.map((league) => ({
      id: league.id,
      label: league.name,
      meta: `${league.state} · ${league.divisionCount} divisions`,
      value: league,
    }));
  }, [useMembershipCatalog, membership, leagues]);

  const divisionOptions: TypeaheadOption<PickerDivisionOption>[] = useMemo(() => {
    const source = useMembershipCatalog
      ? membership!.divisions.filter(
          (division) =>
            !selectedLeague || division.leagueId === selectedLeague.id,
        )
      : divisions;
    // Bright / public catalog should include every LMS division so links can
    // replace member pairs even when the player is only on one half.
    const catalog =
      brightBrowseAll || !useMembershipCatalog
        ? divisions.length
          ? divisions
          : source
        : source;
    const options = buildLinkedDivisionPickerOptions(catalog, divisionLinks);
    // Membership users only see a named link when they belong to at least one half.
    const memberDivisionIds =
      useMembershipCatalog && !brightBrowseAll
        ? new Set(membership!.divisions.map((d) => d.id))
        : null;
    return options
      .filter((option) => {
        if (!option.link || !memberDivisionIds) return true;
        return (
          memberDivisionIds.has(option.link.primaryDivisionId) ||
          memberDivisionIds.has(option.link.linkedDivisionId)
        );
      })
      .map((option) => ({
        id: option.id,
        label: option.name,
        meta: option.link
          ? "Combined night · Tableside link"
          : `${option.year} · ${option.leagueName}`,
        value: option,
      }));
  }, [
    useMembershipCatalog,
    brightBrowseAll,
    membership,
    divisions,
    selectedLeague,
    divisionLinks,
  ]);

  const teamOptions: TypeaheadOption<DivisionTeam>[] = useMemo(() => {
    if (useMembershipCatalog && selectedDivision) {
      const linkedIds = new Set(
        [
          selectedDivision.id,
          prefs?.divisionId,
          prefs?.linkedDivisionId,
        ].filter((id): id is string => Boolean(id)),
      );
      const mine = membership!.teams.filter((team) =>
        linkedIds.has(team.divisionId),
      );
      return mine.map((team) => {
        const full =
          divisionTeams.find((item) => item.id === team.teamId) ?? null;
        const value: DivisionTeam = full ?? {
          id: team.teamId,
          name: team.teamName,
          isBye: false,
          locationId: null,
          players: [],
        };
        return {
          id: team.teamId,
          label: team.teamName,
          meta: full
            ? `${full.players.length} players`
            : "Your team",
          value,
        };
      });
    }
    return divisionTeams
      .filter((team) => !team.isBye)
      .map((team) => ({
        id: team.id,
        label: team.name,
        meta: `${team.players.length} players`,
        value: team,
      }));
  }, [
    useMembershipCatalog,
    membership,
    selectedDivision,
    divisionTeams,
    prefs?.divisionId,
    prefs?.linkedDivisionId,
  ]);

  /** Followed team from the top League / Division / My team section */
  const myTeam =
    divisionTeams.find(
      (team) =>
        team.id === prefs?.teamId ||
        (Boolean(prefs?.teamName) &&
          normalizeTeamName(team.name) ===
            normalizeTeamName(prefs?.teamName ?? "")),
    ) ?? null;

  const scoringFormat = useMemo(
    () =>
      resolveScoringFormat({
        prefsFormatId: prefs?.scoringFormatId,
        divisionName: selectedDivision?.name ?? prefs?.divisionName,
      }),
    [
      prefs?.scoringFormatId,
      prefs?.divisionName,
      selectedDivision?.name,
    ],
  );

  const detailTeam =
    divisionTeams.find(
      (team) =>
        normalizeTeamName(team.name) ===
        normalizeTeamName(selectedTeamName ?? ""),
    ) ?? null;

  useEffect(() => {
    if (didAutoCollapseContext.current) return;
    if (selectedDivision && prefs?.teamName) {
      setContextOpen(false);
      didAutoCollapseContext.current = true;
    }
  }, [selectedDivision, prefs?.teamName]);

  const filteredTeamRows = useMemo(() => {
    if (!teamReport) return [];
    return filterRows(teamReport.rows, filterQuery);
  }, [teamReport, filterQuery]);

  const playersWithRatings = useMemo(() => {
    if (!playerReport) return null;
    return enrichPlayersWithRatings(playerReport, playerList);
  }, [playerReport, playerList]);

  const filteredPlayerRows = useMemo(() => {
    if (!playersWithRatings) return [];
    return filterRows(playersWithRatings.rows, filterQuery);
  }, [playersWithRatings, filterQuery]);

  const myStandingCells = useMemo(
    () => standingCellsForTeam(teamReport, prefs?.teamName),
    [teamReport, prefs?.teamName],
  );
  const myStandingRank = useMemo(() => {
    const rank = myStandingCells?.find((cell) => {
      const label = cell.label.trim().toLowerCase();
      return (
        label === "#" ||
        label === "rank" ||
        label === "rk" ||
        label === "pos"
      );
    })?.value;
    return rank ? `#${rank}` : null;
  }, [myStandingCells]);

  const findDivisionTeam = (name: string) =>
    divisionTeams.find(
      (team) => normalizeTeamName(team.name) === normalizeTeamName(name),
    ) ?? null;

  if (!prefs || booting) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-6xl items-center justify-center px-5">
        <LoadingState label="Connecting to FargoRate LMS…" />
      </main>
    );
  }

  if (screen === "login") {
    return (
      <main className="relative mx-auto min-h-dvh w-full max-w-7xl px-4 pb-[calc(1.5rem+var(--safe-bottom))] pt-4 md:px-6 lg:px-8">
        <header className="mb-6">
          <h1 className="font-[family-name:var(--font-display)] text-2xl leading-none tracking-tight text-[var(--felt-deep)] md:text-3xl">
            Tableside
          </h1>
        </header>
        <LoginScreen
          onCancel={() => setScreen("main")}
          onSuccess={(nextUser) => {
            setUser(nextUser);
            setScreen("main");
            const basePrefs = prefs ?? loadPreferences();
            if (!nextUser.lmsId) {
              // Tableside-only account — Account pillar to connect Fargo / Digital Pool.
              setTab("account");
              return;
            }
            void (async () => {
              // Prefer Redis/local cache; only scan the preferred league.
              const nextMembership = await loadMembership({
                fresh: false,
                prefsOverride: basePrefs,
              });
              if (nextMembership?.teams.length) {
                applyMembershipDefaults(
                  nextMembership,
                  basePrefs,
                  nextUser.name,
                );
                setTab(
                  defaultTabForPillar("league", {
                    hasDivision: true,
                    hasTeam: true,
                    hasMatchTonight: false,
                  }),
                );
              } else {
                setTab("account");
              }
            })();
          }}
        />
      </main>
    );
  }

  const showPlayContext = pillarShowsPlayContext(activePillar);
  const openAccount = () => {
    if (!user) {
      setScreen("login");
      return;
    }
    startTransition(() => setTab("account"));
  };

  const selectLeagueSection = (next: ReportTab) => {
    startTransition(() => setTab(next));
    if (
      (next === "schedule" || next === "my-team" || next === "score") &&
      !prefs.teamName
    ) {
      setContextOpen(true);
    }
  };

  return (
    <>
    <main className="relative mx-auto min-h-dvh w-full max-w-7xl px-4 pb-[calc(4.75rem+var(--safe-bottom))] pt-4 md:px-6 md:pb-[calc(1.5rem+var(--safe-bottom))] lg:px-8">
      <div className="md:flex md:items-start md:gap-6 lg:gap-8">
        <PillarSideNav
          activePillar={activePillar}
          showManage
          onSelectPillar={selectPillar}
          activeSection={
            activePillar === "league" || activePillar === "manage" ? tab : null
          }
          onSelectSection={selectLeagueSection}
        />

        <div className="min-w-0 flex-1 overflow-x-clip">
      <header className="animate-rise mb-3 flex min-w-0 items-center justify-between gap-2 md:mb-4 md:gap-3">
        <div className="min-w-0">
          <h1 className="min-w-0 shrink truncate font-[family-name:var(--font-display)] text-2xl leading-none tracking-tight text-[var(--felt-deep)] md:text-3xl">
            Tableside
          </h1>
          <p className="mt-1 hidden text-xs text-[var(--muted)] sm:block">
            {activePillar === "home"
              ? "Discover events nearby"
              : activePillar === "league"
                ? "Your league night tools"
                : activePillar === "manage"
                  ? "Run and create leagues"
                  : "Profile and connections"}
          </p>
        </div>
        <div className="flex min-w-0 items-center justify-end gap-1.5 sm:gap-2">
          {user ? (
            <button
              type="button"
              onClick={openAccount}
              title={`Account · ${user.name ?? user.email ?? "player"}`}
              aria-label="Open account"
              aria-current={tab === "account" ? "page" : undefined}
              className={[
                "flex min-w-0 max-w-[2.25rem] items-center gap-2 rounded-full border p-1 transition sm:max-w-[14rem] sm:px-2.5 sm:py-1.5",
                tab === "account"
                  ? "border-[var(--felt)] bg-[var(--felt)] text-white"
                  : "border-[var(--felt)]/25 bg-[color-mix(in_srgb,var(--felt)_10%,var(--surface))]",
              ].join(" ")}
            >
              <span
                className={[
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold uppercase sm:h-6 sm:w-6",
                  tab === "account"
                    ? "bg-white/20 text-white"
                    : "bg-[var(--felt)] text-white",
                ].join(" ")}
              >
                {(user.name ?? user.email ?? "?").trim().charAt(0) || "?"}
              </span>
              <span
                className={[
                  "hidden min-w-0 truncate text-xs font-semibold sm:inline",
                  tab === "account" ? "text-white" : "text-[var(--felt-deep)]",
                ].join(" ")}
              >
                {user.name ?? user.email ?? "Signed in"}
              </span>
            </button>
          ) : null}
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => {
                setPlayerSearchQuery("");
                startTransition(() => setTab("search"));
              }}
              title="Search players"
              aria-label="Search players"
              aria-current={tab === "search" ? "page" : undefined}
              className={[
                "inline-flex h-9 w-9 items-center justify-center rounded-full border transition",
                tab === "search"
                  ? "border-[var(--felt)] bg-[var(--felt)] text-white"
                  : "border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]",
              ].join(" ")}
            >
              <SearchIcon className="h-4 w-4" />
            </button>
            {activePillar === "league" ? (
              <button
                type="button"
                onClick={() => void refreshCachedData()}
                disabled={refreshing}
                title="Resync league data from FargoRate"
                aria-label={
                  refreshing ? "Resyncing league data" : "Resync league data"
                }
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--felt)] text-white transition hover:bg-[var(--felt-soft)] disabled:opacity-60"
              >
                <ResyncIcon
                  className={["h-4 w-4", refreshing ? "animate-spin" : ""].join(
                    " ",
                  )}
                />
              </button>
            ) : null}
            {!user ? (
              <button
                type="button"
                onClick={() => setScreen("login")}
                className="rounded-full bg-[var(--felt)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--felt-soft)]"
              >
                Login
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {user?.impersonating ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-[var(--amber)]/40 bg-[color-mix(in_srgb,var(--amber)_14%,var(--surface))] px-4 py-3 text-sm text-[var(--ink)]">
          <p>
            Viewing as{" "}
            <span className="font-semibold">
              {user.name ?? "player"}
            </span>
            {user.actor ? (
              <span className="text-[var(--muted)]">
                {" "}
                · signed in as {user.actor.name ?? user.actor.email ?? "you"}
              </span>
            ) : null}
            . LMS submit is locked.
          </p>
          <button
            type="button"
            onClick={() => {
              void (async () => {
                try {
                  const response = await fetch("/api/auth/impersonate", {
                    method: "DELETE",
                  });
                  const payload = (await response.json().catch(() => null)) as {
                    user?: AuthUser;
                    error?: string;
                  } | null;
                  if (!response.ok || !payload?.user) {
                    throw new Error(payload?.error || "Could not exit view-as.");
                  }
                  setUser(payload.user);
                  void loadMembership({
                    fresh: true,
                    prefsOverride: {
                      ...(prefs ?? loadPreferences()),
                      playerId: payload.user.lmsId,
                      playerName: payload.user.name,
                    },
                  }).then((next) => {
                    if (next?.teams.length) {
                      applyMembershipDefaults(
                        next,
                        loadPreferences(),
                        payload.user!.name,
                      );
                    }
                  });
                } catch (err) {
                  setError(
                    err instanceof Error
                      ? err.message
                      : "Could not exit view-as.",
                  );
                }
              })();
            }}
            className="rounded-[var(--radius)] bg-[var(--felt)] px-3 py-1.5 text-xs font-semibold text-white"
          >
            Exit view-as
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-[var(--radius)] border border-[var(--danger)]/30 bg-[var(--danger-bg)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      {showPlayContext && user && loadingMembership ? (
        <p className="mb-3 text-xs text-[var(--muted)]">
          Loading your active BCAPL sessions…
        </p>
      ) : showPlayContext &&
        user &&
        membership &&
        !membership.teams.length ? (
        <p className="mb-3 text-xs text-[var(--muted)]">
          No team memberships found in this league yet. Open Account to scan
          another league or find all your teams.
        </p>
      ) : null}

      {showPlayContext ? (
      <section className="animate-rise animate-delay-1 relative z-40 mb-2 overflow-visible rounded-[var(--radius)] border border-white/10 bg-[linear-gradient(135deg,rgba(29,110,158,0.98),rgba(19,78,115,0.96))] text-white shadow-[var(--shadow)]">
        <button
          type="button"
          onClick={() => setContextOpen((open) => !open)}
          aria-expanded={contextOpen}
          className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left md:px-6 md:py-5"
        >
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/65">
              {selectedLeague?.name ??
                selectedDivision?.leagueName ??
                "League · Division · My team"}
            </p>
            <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl leading-tight md:text-3xl">
              {selectedDivision?.name ?? "Choose your division"}
            </h2>
            {contextOpen ? (
              <p className="mt-2 text-sm text-white/70">
                {brightBrowseAll
                  ? "Bright mode: every division and team in the league is available. Named links are configured in LMS → Edit division → Link."
                  : user
                    ? "Pick from your active sessions. Linked nights appear as one named division."
                    : "Set league, division, and my team for schedule & handicap."}
              </p>
            ) : prefs.teamName ? (
              <p className="mt-2 text-sm text-white/80">
                Following <span className="font-semibold">{prefs.teamName}</span>
              </p>
            ) : (
              <p className="mt-2 text-sm text-white/70">
                Set my team to personalize schedule & handicap.
              </p>
            )}
          </div>
          <span className="shrink-0 self-center rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/85">
            {contextOpen ? "Collapse ▴" : "Change ▾"}
          </span>
        </button>

        {contextOpen ? (
          <div className="border-t border-white/15 px-4 pb-4 pt-3 md:px-6 md:pb-5">
            <div className="grid gap-4 md:grid-cols-3">
              <Typeahead
                tone="felt"
                label="League"
                placeholder={
                  user
                    ? loadingMembership
                      ? "Loading your leagues…"
                      : "Your leagues"
                    : loadingLeagues
                      ? "Searching leagues…"
                      : "Search leagues"
                }
                value={
                  selectedLeague
                    ? {
                        id: selectedLeague.id,
                        label: selectedLeague.name,
                        meta: `${selectedLeague.state} · ${selectedLeague.divisionCount} divisions`,
                        value: selectedLeague,
                      }
                    : null
                }
                options={leagueOptions}
                onQueryChange={
                  brightBrowseAll || !user ? setLeagueQuery : undefined
                }
                onChange={(option) => {
                  if (option) void chooseLeague(option.value);
                  else clearLeague();
                }}
              />
              <Typeahead
                tone="felt"
                label="Division"
                placeholder={
                  !selectedLeague
                    ? "Pick a league first"
                    : loadingDivisions
                      ? "Loading divisions…"
                      : brightBrowseAll
                        ? "All divisions in this league"
                        : user
                          ? "Your divisions"
                          : "Type to find your division"
                }
                value={
                  selectedDivision
                    ? (() => {
                        const link =
                          findLinkById(divisionLinks, prefs?.divisionLinkId) ??
                          findLinkForDivision(
                            divisionLinks,
                            selectedDivision.id,
                          );
                        const option =
                          divisionOptions.find((item) =>
                            link
                              ? item.value.link?.id === link.id
                              : item.value.id === selectedDivision.id,
                          )?.value ?? null;
                        return {
                          id: option?.id ?? selectedDivision.id,
                          label: option?.name ?? selectedDivision.name,
                          meta: option?.link
                            ? "Combined night · Tableside link"
                            : `${selectedDivision.year}`,
                          value:
                            option ??
                            ({
                              ...selectedDivision,
                            } satisfies PickerDivisionOption),
                        };
                      })()
                    : null
                }
                options={divisionOptions}
                disabled={!selectedLeague || loadingDivisions}
                onChange={(option) => {
                  if (option) chooseDivisionOption(option.value);
                  else clearDivision();
                }}
                emptyText="No divisions match"
              />
              <Typeahead
                tone="felt"
                label="My team"
                placeholder={
                  !selectedDivision
                    ? "Pick a division first"
                    : loadingContext
                      ? "Loading teams…"
                      : brightBrowseAll
                        ? "Any team in this division"
                        : user
                          ? "Your teams in this division"
                          : "Set your team for schedule & handicap"
                }
                value={
                  myTeam
                    ? {
                        id: myTeam.id,
                        label: myTeam.name,
                        meta: `${myTeam.players.length} players`,
                        value: myTeam,
                      }
                    : null
                }
                options={teamOptions}
                disabled={!selectedDivision || loadingContext}
                onChange={(option) => {
                  if (option) {
                    setMyTeam(option.value);
                    setContextOpen(false);
                  } else {
                    clearMyTeam();
                  }
                }}
                emptyText="No teams loaded yet"
              />
            </div>

          </div>
        ) : null}
      </section>
      ) : null}

      <section className="animate-rise animate-delay-2 min-w-0">
        {activePillar === "league" ? (
          <SubTabCard
            className="animate-panel"
            contentClassName={
              tab === "score" ||
              tab === "handicap" ||
              tab === "my-team" ||
              tab === "schedule"
                ? "p-0"
                : "min-w-0 space-y-3 p-3 sm:p-4 [overflow-anchor:none]"
            }
            tabs={
              <IconSubTabs
                aria-label="League sections"
                value={tab}
                onChange={selectLeagueSection}
                columns={3}
                className="rounded-none border-0 bg-transparent p-0"
                items={LEAGUE_SECTIONS.map((section) => ({
                  id: section.id,
                  label: section.shortLabel ?? section.label,
                  icon: ({ className }: { className?: string }) => (
                    <NavTabIcon
                      id={
                        section.id as Exclude<
                          ReportTab,
                          "search" | "account" | "create-league"
                        >
                      }
                      className={className}
                    />
                  ),
                }))}
              />
            }
          >
            {tab === "score" ? (
              <MatchScoring
                divisionId={selectedDivision?.id ?? null}
                divisionName={selectedDivision?.name ?? null}
                linkedDivisionId={prefs.linkedDivisionId ?? null}
                linkedDivisionName={prefs.linkedDivisionName ?? null}
                divisionLink={
                  findLinkById(divisionLinks, prefs.divisionLinkId) ??
                  findLinkForDivision(divisionLinks, prefs.divisionId) ??
                  null
                }
                teamId={prefs.teamId}
                teamName={prefs.teamName}
                scoringFormatId={prefs.scoringFormatId}
                user={user}
                authLoading={authLoading}
                onRequestLogin={() => setScreen("login")}
                onRequestContext={() => setContextOpen(true)}
              />
            ) : !selectedDivision ? (
              <EmptyState
                title="Choose a division to continue"
                body="Home and Search work without a division. League tools need league, division, and team from the context card."
                action={
                  <button
                    type="button"
                    onClick={() => setContextOpen(true)}
                    className="rounded-[var(--radius)] bg-[var(--felt)] px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    Choose division
                  </button>
                }
              />
            ) : tab === "handicap" ? (
              <HandicapCalculator
                divisionId={selectedDivision.id}
                divisionName={selectedDivision.name}
                prefs={prefs}
                refreshToken={refreshToken}
              />
            ) : loadingReport ? (
              <LoadingState label="Pulling report from LMS…" />
            ) : tab === "my-team" ? (
              prefs.teamName ? (
                <section className="space-y-3">
                  <div className="px-3 pt-3 sm:px-4 sm:pt-4">
                    <PanelHeader
                      title="Your team"
                      description={
                        <>
                          Standing, roster, and lineup templates for{" "}
                          <span className="font-medium text-[var(--ink)]">
                            {prefs.teamName}
                          </span>
                          {selectedDivision?.name || prefs.divisionName
                            ? <> · {selectedDivision?.name || prefs.divisionName}</>
                            : null}
                          .
                        </>
                      }
                    />
                  </div>
                  <SubTabCard
                    className="rounded-none border-0 shadow-none"
                    tabs={
                      <IconSubTabs
                        aria-label="My team sections"
                        value={myTeamSubTab}
                        onChange={(id) =>
                          startTransition(() => setMyTeamSubTab(id))
                        }
                        className="rounded-none border-0 bg-transparent p-0"
                        items={[
                          {
                            id: "standing",
                            label: "Standing",
                            icon: StandingSubIcon,
                          },
                          {
                            id: "roster",
                            label: "Roster",
                            icon: RosterSubIcon,
                          },
                          {
                            id: "lineups",
                            label: "Lineups",
                            icon: LineupsSubIcon,
                          },
                        ]}
                      />
                    }
                  >
                    <div
                      className={
                        myTeamSubTab === "standing"
                          ? "min-w-0 space-y-3"
                          : "hidden"
                      }
                      aria-hidden={myTeamSubTab !== "standing"}
                    >
                      <PanelHeader
                        title="Standing"
                        description="Current place in the division"
                        action={
                          myStandingRank ? (
                            <PanelHeaderCount
                              label="Rank"
                              value={myStandingRank}
                            />
                          ) : undefined
                        }
                      />
                      {myStandingCells ? (
                        <TeamStandingSummary
                          cells={myStandingCells}
                          hideHeader
                        />
                      ) : (
                        <EmptyState
                          title="Standing unavailable"
                          body="Team standings will show here once the division report loads."
                        />
                      )}
                    </div>

                    <div
                      className={
                        myTeamSubTab === "roster"
                          ? "min-w-0 space-y-3"
                          : "hidden"
                      }
                      aria-hidden={myTeamSubTab !== "roster"}
                    >
                      <PanelHeader
                        title="Roster"
                        description={
                          myTeam?.players.length
                            ? `${myTeam.players.length} rostered · avg Fargo ${Math.round(
                                myTeam.players.reduce(
                                  (sum, player) => sum + player.fargoRating,
                                  0,
                                ) / myTeam.players.length,
                              )}`
                            : "Player statistics and Fargo ratings"
                        }
                        action={
                          myTeam?.players.length ? (
                            <PanelHeaderCount
                              label="Players"
                              value={String(myTeam.players.length)}
                            />
                          ) : undefined
                        }
                      />
                      <TeamDetail
                        teamName={prefs.teamName}
                        team={myTeam}
                        playersByTeam={playersByTeam}
                        isMyTeam
                        embedded
                      />
                    </div>

                    <div
                      className={
                        myTeamSubTab === "lineups" ? "min-w-0" : "hidden"
                      }
                      aria-hidden={myTeamSubTab !== "lineups"}
                    >
                      {myTeam && selectedDivision ? (
                        <TeamLineupTemplates
                          divisionId={selectedDivision.id}
                          team={myTeam}
                          slots={scoringFormat.playersPerTeam}
                          embedded
                        />
                      ) : (
                        <div className="space-y-3">
                          <PanelHeader
                            title="Lineups"
                            description={`Save ${scoringFormat.playersPerTeam}-player orders for league night. Load them from Handicap or Score.`}
                          />
                          <EmptyState
                            title="Team roster needed"
                            body="Lineup templates need your team’s roster from this division."
                          />
                        </div>
                      )}
                    </div>
                  </SubTabCard>
                </section>
              ) : (
                <EmptyState
                  title="Set your team"
                  body="Pick My team on the context card to see roster, standing, and lineup templates."
                  action={
                    <button
                      type="button"
                      onClick={() => setContextOpen(true)}
                      className="rounded-[var(--radius)] bg-[var(--felt)] px-4 py-2.5 text-sm font-semibold text-white"
                    >
                      Set my team
                    </button>
                  }
                />
              )
            ) : tab === "standings" && teamReport ? (
              selectedTeamName ? (
                <TeamDetail
                  teamName={selectedTeamName}
                  team={detailTeam}
                  playersByTeam={playersByTeam}
                  isMyTeam={
                    normalizeTeamName(prefs.teamName ?? "") ===
                    normalizeTeamName(selectedTeamName)
                  }
                  onClose={() => setSelectedTeamName(null)}
                  onSetAsMyTeam={
                    detailTeam ? () => setMyTeam(detailTeam) : undefined
                  }
                />
              ) : (
                <section className="min-h-[min(50dvh,24rem)] space-y-3 [overflow-anchor:none]">
                  <PanelHeader
                    title="Team standings"
                    description={
                      prefs.linkedDivisionId
                        ? "Combined night standings — Singles sets + Teams rounds×2 (configurable on the LMS Links form). Tap a team for details."
                        : "Tap a team to view player statistics. Use back to return to the league grid."
                    }
                    action={
                      <PanelHeaderCount
                        label="Teams"
                        value={String(filteredTeamRows.length)}
                      />
                    }
                  />
                  <DataTable
                    headers={teamReport.headers}
                    rows={filteredTeamRows}
                    stickyFirst
                    compact
                    toolbar={
                      <SearchField
                        embedded
                        value={filterQuery}
                        anchorRef={filterAnchor.ref}
                        onBeforeChange={filterAnchor.mark}
                        onChange={setFilterQuery}
                        placeholder="Filter teams…"
                      />
                    }
                    isRowSelected={(row) =>
                      Boolean(
                        prefs.teamName &&
                          normalizeTeamName(
                            row[teamNameIndex(teamReport.headers)] ?? "",
                          ) === normalizeTeamName(prefs.teamName),
                      )
                    }
                    onRowClick={(row) => {
                      const name =
                        row[teamNameIndex(teamReport.headers)]?.trim() ?? "";
                      const matched = divisionTeams.find(
                        (team) =>
                          normalizeTeamName(team.name) ===
                          normalizeTeamName(name),
                      );
                      setSelectedTeamName(matched?.name ?? name);
                    }}
                    emptyText="No teams match your filter."
                  />
                </section>
              )
            ) : tab === "players" && playersWithRatings ? (
              <section className="min-h-[min(50dvh,24rem)] space-y-3 [overflow-anchor:none]">
                <PanelHeader
                  title="Division players"
                  description={
                    <>
                      Standings and Fargo ratings for everyone in{" "}
                      <span className="font-medium text-[var(--ink)]">
                        {selectedDivision.name}
                      </span>
                      . Filter the grid below to find someone quickly.
                    </>
                  }
                  action={
                    <PanelHeaderCount
                      label="Players"
                      value={String(filteredPlayerRows.length)}
                    />
                  }
                />
                <DataTable
                  headers={playersWithRatings.headers}
                  rows={filteredPlayerRows}
                  stickyFirst
                  compact
                  toolbar={
                    <SearchField
                      embedded
                      value={filterQuery}
                      anchorRef={filterAnchor.ref}
                      onBeforeChange={filterAnchor.mark}
                      onChange={setFilterQuery}
                      placeholder="Filter players…"
                    />
                  }
                  emptyText="No players match your filter."
                />
              </section>
            ) : tab === "schedule" && schedule ? (
              !prefs.teamName ? (
                <EmptyState
                  title="Set My team for schedule"
                  body="Schedule always uses your selected team from the context card."
                  action={
                    <button
                      type="button"
                      onClick={() => setContextOpen(true)}
                      className="rounded-[var(--radius)] bg-[var(--felt)] px-4 py-2.5 text-sm font-semibold text-white"
                    >
                      Set my team
                    </button>
                  }
                />
              ) : selectedScheduleMatch ? (
                <ScheduleMatchDetail
                  key={`${selectedScheduleMatch.date}-${selectedScheduleMatch.match.matchId ?? selectedScheduleMatch.match.home}-${selectedScheduleMatch.match.away}`}
                  date={selectedScheduleMatch.date}
                  match={selectedScheduleMatch.match}
                  homeTeam={findDivisionTeam(selectedScheduleMatch.match.home)}
                  awayTeam={findDivisionTeam(selectedScheduleMatch.match.away)}
                  playersByTeam={playersByTeam}
                  homeStandingCells={standingCellsForTeam(
                    teamReport,
                    selectedScheduleMatch.match.home,
                  )}
                  awayStandingCells={standingCellsForTeam(
                    teamReport,
                    selectedScheduleMatch.match.away,
                  )}
                  myTeamName={prefs.teamName}
                  onClose={() => setSelectedScheduleMatch(null)}
                />
              ) : (
                <ScheduleList
                  days={schedule}
                  teamName={prefs.teamName}
                  divisionName={
                    selectedDivision?.name ?? prefs.divisionName
                  }
                  teamReport={teamReport}
                  onMatchClick={(match, day) =>
                    setSelectedScheduleMatch({ match, date: day.date })
                  }
                />
              )
            ) : (
              <EmptyState title="Nothing to show yet" />
            )}
          </SubTabCard>
        ) : (
          <div className="animate-panel min-w-0 space-y-0 [overflow-anchor:none]">
            {tab === "create-league" ? (
              <ManageCreateLeague
                signedIn={Boolean(user)}
                onRequestLogin={() => setScreen("login")}
                canOpenLms={showManagePillar}
                onOpenLms={() => startTransition(() => setTab("lms"))}
              />
            ) : tab === "account" && user ? (
              <SettingsScreen
                user={user}
                prefs={prefs}
                membership={membership}
                loadingMembership={loadingMembership}
                membershipError={membershipError}
                onClose={() =>
                  startTransition(() =>
                    setTab(defaultTabForPillar("league", leagueDefaultOptions)),
                  )
                }
                onUserUpdate={(nextUser) => {
                  setUser(nextUser);
                  if (!nextUser.lmsId) return;
                  const nextPrefs = {
                    ...(prefs ?? loadPreferences()),
                    playerId: nextUser.lmsId,
                    playerName: nextUser.name,
                  };
                  setPrefs(nextPrefs);
                  savePreferences(nextPrefs);
                  void loadMembership({
                    fresh: true,
                    prefsOverride: nextPrefs,
                  }).then((next) => {
                    if (next?.teams.length) {
                      applyMembershipDefaults(
                        next,
                        nextPrefs,
                        nextUser.name,
                      );
                    }
                  });
                }}
                onRefreshMembership={() => {
                  const current = user;
                  if (!current?.lmsId) return;
                  const nextPrefs = {
                    ...(prefs ?? loadPreferences()),
                    playerId: current.lmsId,
                    playerName: current.name,
                  };
                  void loadMembership({
                    fresh: true,
                    prefsOverride: nextPrefs,
                  }).then((next) => {
                    if (next?.teams.length) {
                      applyMembershipDefaults(
                        next,
                        nextPrefs,
                        current.name,
                      );
                    }
                  });
                }}
                onSave={(next) => {
                  persist(next);
                  const league =
                    membership?.leagues.find(
                      (item) => item.id === next.leagueId,
                    ) ??
                    leagues.find((item) => item.id === next.leagueId) ??
                    null;
                  const division =
                    membership?.divisions.find(
                      (item) => item.id === next.divisionId,
                    ) ??
                    divisions.find((item) => item.id === next.divisionId) ??
                    null;
                  if (league) {
                    setSelectedLeague(league);
                    if (!brightBrowseAll) {
                      setLeagues(membership?.leagues ?? [league]);
                    }
                    setLeagueQuery(league.name);
                  }
                  if (division) {
                    setSelectedDivision(division);
                    if (!brightBrowseAll) {
                      setDivisions(
                        (membership?.divisions ?? []).filter(
                          (item) => item.leagueId === division.leagueId,
                        ),
                      );
                    }
                  }
                  startTransition(() =>
                    setTab(
                      defaultTabForPillar("league", {
                        ...leagueDefaultOptions,
                        hasDivision: Boolean(division ?? selectedDivision),
                        hasTeam: Boolean(next.teamName),
                      }),
                    ),
                  );
                }}
                onSignOut={() => void signOut()}
              />
            ) : tab === "search" ? (
              <PlayerSearch initialQuery={playerSearchQuery} />
            ) : tab === "events" ? (
              <Tournaments
                user={user}
                authLoading={authLoading}
                playerFargo={
                  prefs.playerId
                    ? (myTeam?.players.find((p) => p.id === prefs.playerId)
                        ?.fargoRating ?? null)
                    : null
                }
                deepLinkEventId={deepLinkEventId}
                onDeepLinkEventIdChange={onDeepLinkEventIdChange}
                onRequestLogin={() => setScreen("login")}
                onFindPlayer={(name) => {
                  setPlayerSearchQuery(name);
                  startTransition(() => setTab("search"));
                }}
              />
            ) : tab === "lms" ? (
              showManagePillar ? (
                <LmsOperator
                  leagueId={prefs.leagueId}
                  leagueName={prefs.leagueName}
                  divisionId={selectedDivision?.id ?? prefs.divisionId}
                  divisionName={selectedDivision?.name ?? prefs.divisionName}
                  user={user}
                  authLoading={authLoading}
                  onRequestLogin={() => setScreen("login")}
                />
              ) : (
                <EmptyState
                  title="Fargo LMS tools"
                  body="Connect a League Operator login in Account to manage FargoRate divisions. You can still create a Tableside league from the Create tab without LMS."
                  action={
                    <div className="flex flex-wrap justify-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          startTransition(() => setTab("create-league"))
                        }
                        className="rounded-[var(--radius)] bg-[var(--felt)] px-4 py-2.5 text-sm font-semibold text-white"
                      >
                        Create a league
                      </button>
                      <button
                        type="button"
                        onClick={openAccount}
                        className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold text-[var(--ink)]"
                      >
                        {user ? "Open Account" : "Sign in"}
                      </button>
                    </div>
                  }
                />
              )
            ) : (
              <EmptyState title="Nothing to show yet" />
            )}
          </div>
        )}
      </section>
        </div>
      </div>

    </main>
      <PillarBottomNav
        activePillar={activePillar}
        showManage
        onSelectPillar={selectPillar}
      />
    </>
  );
}
