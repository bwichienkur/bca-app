"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { LMS_BASE } from "@/lib/constants";
import { LoadingState } from "./LoadingState";
import type { AuthUser } from "./LoginScreen";
import { SelectField } from "./SelectField";

type LmsSubTab =
  | "home"
  | "teams"
  | "players"
  | "locations"
  | "schedule"
  | "settings"
  | "playoff"
  | "create";

type OperatorLeague = {
  id: string;
  name: string;
  state: string | null;
  leagueNumber: string | null;
};

type OperatorDivision = { id: string; name: string };

type OperatorMatch = {
  matchId: string;
  teamOne: string;
  teamTwo: string;
  datePlayed: string | null;
  displayDate: string | null;
  location: string | null;
};

type OperatorLocation = {
  id: string;
  divisionId: string;
  name: string;
  city: string;
  state: string;
  phoneNumber: string | null;
  numberOf7FootTables: number;
  numberOf8FootTables: number;
  numberOf9FootTables: number;
  numberOf10FootTables: number;
};

type OperatorTeam = {
  id: string;
  name: string;
  locationName: string | null;
  locationId: string | null;
  numberOfPlayers: number;
  isBye: boolean;
  players: { id: string; name: string }[];
};

type OperatorPlayerRow = {
  id: string;
  name: string;
  location: string | null;
  effectiveRating: number | null;
  provisionalRating: number | null;
  fargoRating: number | null;
  robustness: number | null;
};

type OperatorPlayerDetail = {
  id: string;
  readableId: string | null;
  firstName: string;
  lastName: string;
  suffix: string | null;
  address1: string | null;
  city: string;
  state: string;
  zip: string | null;
  email1: string | null;
  phone1: string | null;
  provisionalRating: number;
  gender: string;
};

type ScheduleMatch = {
  matchId: string | null;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  date: string;
  location: string | null;
  locationId: string | null;
};

type PlayoffTeam = {
  id: string;
  name: string;
  divisionId: string;
  numberOfPlayers: number;
};

type PlayoffDivision = {
  name: string;
  id: string | null;
  teams: PlayoffTeam[];
};

type FormatTemplate = { id: string; name: string; template: string };

type LmsOperatorProps = {
  leagueId: string | null;
  leagueName: string | null;
  divisionId: string | null;
  divisionName: string | null;
  user: AuthUser | null;
  authLoading: boolean;
  onRequestLogin: () => void;
};

const CONTEXT_KEY = "tableside.lmsOperator.context.v1";
const SUB_TABS: { id: LmsSubTab; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "teams", label: "Teams" },
  { id: "players", label: "Players" },
  { id: "locations", label: "Locations" },
  { id: "schedule", label: "Schedule" },
  { id: "settings", label: "Settings" },
  { id: "playoff", label: "Playoff" },
  { id: "create", label: "New div" },
];

const SKILL_LEVELS = [
  { value: "Platinum", label: "Platinum" },
  { value: "Gold", label: "Gold" },
  { value: "Silver", label: "Silver" },
] as const;

const inputClass =
  "w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none ring-[var(--felt)] focus:ring-2";
const btnPrimary =
  "rounded-[var(--radius)] bg-[var(--felt)] px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50";
const btnGhost =
  "rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--ink)] disabled:opacity-50";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | { error?: string }
    | null;
  if (!response.ok) {
    throw new Error(
      (payload && "error" in payload && payload.error) ||
        `Request failed (${response.status})`,
    );
  }
  return payload as T;
}

function formatMatchDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function toDateInput(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function Panel({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--ink)] sm:text-xl">
            {title}
          </h3>
          {description ? (
            <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function emptyPlayerForm(): OperatorPlayerDetail {
  return {
    id: "",
    readableId: null,
    firstName: "",
    lastName: "",
    suffix: null,
    address1: null,
    city: "",
    state: "FL",
    zip: null,
    email1: null,
    phone1: null,
    provisionalRating: 400,
    gender: "M",
  };
}

export function LmsOperator({
  leagueId: seedLeagueId,
  leagueName: seedLeagueName,
  divisionId: seedDivisionId,
  divisionName: seedDivisionName,
  user,
  authLoading,
  onRequestLogin,
}: LmsOperatorProps) {
  const [subTab, setSubTab] = useState<LmsSubTab>("home");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  const [leagues, setLeagues] = useState<OperatorLeague[]>([]);
  const [divisions, setDivisions] = useState<OperatorDivision[]>([]);
  const [opLeagueId, setOpLeagueId] = useState(seedLeagueId ?? "");
  const [opLeagueName, setOpLeagueName] = useState(seedLeagueName ?? "");
  const [opDivisionId, setOpDivisionId] = useState(seedDivisionId ?? "");
  const [opDivisionName, setOpDivisionName] = useState(seedDivisionName ?? "");
  const [contextLoading, setContextLoading] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);

  const [nextMatches, setNextMatches] = useState<OperatorMatch[]>([]);
  const [missedMatches, setMissedMatches] = useState<OperatorMatch[]>([]);
  const [homeLoading, setHomeLoading] = useState(false);
  const [homeError, setHomeError] = useState<string | null>(null);

  const [locations, setLocations] = useState<OperatorLocation[]>([]);
  const [teams, setTeams] = useState<OperatorTeam[]>([]);
  const [players, setPlayers] = useState<OperatorPlayerRow[]>([]);
  const [schedule, setSchedule] = useState<ScheduleMatch[]>([]);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [locationDraft, setLocationDraft] = useState<OperatorLocation | null>(
    null,
  );
  const [teamDraft, setTeamDraft] = useState<{
    id?: string;
    name: string;
    locationId: string;
    isBye: boolean;
  } | null>(null);
  const [playerDraft, setPlayerDraft] = useState<OperatorPlayerDetail | null>(
    null,
  );
  const [assignTeamId, setAssignTeamId] = useState("");
  const [playerSearch, setPlayerSearch] = useState("");
  const [playerHits, setPlayerHits] = useState<
    {
      id: string;
      readableId: string;
      firstName: string;
      lastName: string;
      location: string | null;
      effectiveRating: string | null;
    }[]
  >([]);

  const [genStart, setGenStart] = useState("");
  const [genRounds, setGenRounds] = useState("5");
  const [genWeeks, setGenWeeks] = useState("11");
  const [matchDraft, setMatchDraft] = useState<{
    matchId?: string | null;
    teamOneId: string;
    teamTwoId: string;
    date: string;
    locationId: string;
  } | null>(null);

  const [settings, setSettings] = useState<Record<string, unknown> | null>(
    null,
  );
  const [templates, setTemplates] = useState<FormatTemplate[]>([]);

  const [playoffLoading, setPlayoffLoading] = useState(false);
  const [playoffError, setPlayoffError] = useState<string | null>(null);
  const [playoffName, setPlayoffName] = useState("");
  const [playoffSkill, setPlayoffSkill] = useState("Gold");
  const [playoffDivisions, setPlayoffDivisions] = useState<PlayoffDivision[]>(
    [],
  );
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(
    () => new Set(),
  );

  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createSourceId, setCreateSourceId] = useState("");
  const [includeTeams, setIncludeTeams] = useState(true);
  const [includePlayers, setIncludePlayers] = useState(false);

  // Restore LO context from localStorage once
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CONTEXT_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        leagueId?: string;
        leagueName?: string;
        divisionId?: string;
        divisionName?: string;
      };
      if (saved.leagueId) {
        setOpLeagueId(saved.leagueId);
        setOpLeagueName(saved.leagueName ?? "");
      }
      if (saved.divisionId) {
        setOpDivisionId(saved.divisionId);
        setOpDivisionName(saved.divisionName ?? "");
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!opLeagueId && seedLeagueId) {
      setOpLeagueId(seedLeagueId);
      setOpLeagueName(seedLeagueName ?? "");
    }
    if (!opDivisionId && seedDivisionId) {
      setOpDivisionId(seedDivisionId);
      setOpDivisionName(seedDivisionName ?? "");
    }
  }, [
    seedLeagueId,
    seedLeagueName,
    seedDivisionId,
    seedDivisionName,
    opLeagueId,
    opDivisionId,
  ]);

  useEffect(() => {
    if (!opLeagueId) return;
    try {
      localStorage.setItem(
        CONTEXT_KEY,
        JSON.stringify({
          leagueId: opLeagueId,
          leagueName: opLeagueName,
          divisionId: opDivisionId,
          divisionName: opDivisionName,
        }),
      );
    } catch {
      // ignore
    }
  }, [opLeagueId, opLeagueName, opDivisionId, opDivisionName]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setConfigured(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchJson<{ configured: boolean }>(
          "/api/lms/operator/status",
        );
        if (!cancelled) {
          setConfigured(data.configured);
          setConfigError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setConfigured(false);
          setConfigError(
            error instanceof Error
              ? error.message
              : "Could not check LO status.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  const loadLeagues = useCallback(async () => {
    setContextLoading(true);
    try {
      const data = await fetchJson<{ leagues: OperatorLeague[] }>(
        "/api/lms/operator/context",
      );
      setLeagues(data.leagues ?? []);
      if (!opLeagueId && data.leagues?.[0]) {
        setOpLeagueId(data.leagues[0].id);
        setOpLeagueName(data.leagues[0].name);
      } else if (opLeagueId) {
        const match = data.leagues.find((l) => l.id === opLeagueId);
        if (match) setOpLeagueName(match.name);
      }
    } catch (error) {
      setSectionError(
        error instanceof Error ? error.message : "Failed to load leagues.",
      );
    } finally {
      setContextLoading(false);
    }
  }, [opLeagueId]);

  const loadDivisions = useCallback(async () => {
    if (!opLeagueId) {
      setDivisions([]);
      return;
    }
    setContextLoading(true);
    try {
      const data = await fetchJson<{ divisions: OperatorDivision[] }>(
        `/api/lms/operator/context?leagueId=${encodeURIComponent(opLeagueId)}&includeArchived=${includeArchived ? "true" : "false"}`,
      );
      setDivisions(data.divisions ?? []);
      if (
        opDivisionId &&
        !(data.divisions ?? []).some((d) => d.id === opDivisionId)
      ) {
        setOpDivisionId("");
        setOpDivisionName("");
      } else if (opDivisionId) {
        const match = (data.divisions ?? []).find(
          (d) => d.id === opDivisionId,
        );
        if (match) setOpDivisionName(match.name);
      }
    } catch (error) {
      setSectionError(
        error instanceof Error ? error.message : "Failed to load divisions.",
      );
    } finally {
      setContextLoading(false);
    }
  }, [opLeagueId, includeArchived, opDivisionId]);

  useEffect(() => {
    if (!user || !configured) return;
    void loadLeagues();
  }, [user, configured, loadLeagues]);

  useEffect(() => {
    if (!user || !configured || !opLeagueId) return;
    void loadDivisions();
  }, [user, configured, opLeagueId, includeArchived, loadDivisions]);

  const refreshHome = useCallback(async () => {
    if (!opDivisionId) return;
    setHomeLoading(true);
    setHomeError(null);
    try {
      const [next, missed] = await Promise.all([
        fetchJson<{ matches: OperatorMatch[] }>(
          `/api/lms/operator/matches?divisionId=${encodeURIComponent(opDivisionId)}&kind=next`,
        ),
        fetchJson<{ matches: OperatorMatch[] }>(
          `/api/lms/operator/matches?divisionId=${encodeURIComponent(opDivisionId)}&kind=missed`,
        ),
      ]);
      setNextMatches(next.matches ?? []);
      setMissedMatches(missed.matches ?? []);
    } catch (error) {
      setHomeError(
        error instanceof Error ? error.message : "Failed to load matches.",
      );
    } finally {
      setHomeLoading(false);
    }
  }, [opDivisionId]);

  const refreshLocations = useCallback(async () => {
    if (!opDivisionId) return;
    const data = await fetchJson<{ locations: OperatorLocation[] }>(
      `/api/lms/operator/locations?divisionId=${encodeURIComponent(opDivisionId)}`,
    );
    setLocations(data.locations ?? []);
  }, [opDivisionId]);

  const refreshTeams = useCallback(async () => {
    if (!opDivisionId) return;
    const data = await fetchJson<{ teams: OperatorTeam[] }>(
      `/api/lms/operator/teams?divisionId=${encodeURIComponent(opDivisionId)}`,
    );
    setTeams(data.teams ?? []);
  }, [opDivisionId]);

  const refreshPlayers = useCallback(async () => {
    if (!opDivisionId) return;
    const data = await fetchJson<{ players: OperatorPlayerRow[] }>(
      `/api/lms/operator/players?divisionId=${encodeURIComponent(opDivisionId)}`,
    );
    setPlayers(data.players ?? []);
  }, [opDivisionId]);

  const refreshSchedule = useCallback(async () => {
    if (!opDivisionId) return;
    const data = await fetchJson<{ matches: ScheduleMatch[] }>(
      `/api/lms/operator/schedule?divisionId=${encodeURIComponent(opDivisionId)}`,
    );
    setSchedule(data.matches ?? []);
  }, [opDivisionId]);

  const refreshSettings = useCallback(async () => {
    if (!opDivisionId) return;
    const data = await fetchJson<{
      settings: Record<string, unknown>;
      templates: FormatTemplate[];
    }>(
      `/api/lms/operator/settings?divisionId=${encodeURIComponent(opDivisionId)}`,
    );
    setSettings(data.settings);
    setTemplates(data.templates ?? []);
  }, [opDivisionId]);

  useEffect(() => {
    if (!user || !configured || !opDivisionId) return;
    if (subTab === "home") void refreshHome();
  }, [user, configured, opDivisionId, subTab, refreshHome]);

  useEffect(() => {
    if (!user || !configured || !opDivisionId) return;
    const needsDivisionData = [
      "teams",
      "players",
      "locations",
      "schedule",
      "settings",
      "create",
    ].includes(subTab);
    if (!needsDivisionData) return;

    let cancelled = false;
    setSectionLoading(true);
    setSectionError(null);
    void (async () => {
      try {
        if (subTab === "locations") await refreshLocations();
        else if (subTab === "teams") {
          await Promise.all([refreshTeams(), refreshLocations()]);
        } else if (subTab === "players") {
          await Promise.all([refreshPlayers(), refreshTeams()]);
        } else if (subTab === "schedule") {
          await Promise.all([
            refreshSchedule(),
            refreshTeams(),
            refreshLocations(),
          ]);
        } else if (subTab === "settings") await refreshSettings();
        else if (subTab === "create") {
          if (!createSourceId && opDivisionId) setCreateSourceId(opDivisionId);
        }
      } catch (error) {
        if (!cancelled) {
          setSectionError(
            error instanceof Error ? error.message : "Failed to load.",
          );
        }
      } finally {
        if (!cancelled) setSectionLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    user,
    configured,
    opDivisionId,
    subTab,
    refreshLocations,
    refreshTeams,
    refreshPlayers,
    refreshSchedule,
    refreshSettings,
    createSourceId,
  ]);

  useEffect(() => {
    if (!user || !configured || !opLeagueId || subTab !== "playoff") return;
    let cancelled = false;
    setPlayoffLoading(true);
    setPlayoffError(null);
    void (async () => {
      try {
        const data = await fetchJson<{
          leagueName: string;
          divisions: PlayoffDivision[];
        }>(
          `/api/lms/operator/playoff?leagueId=${encodeURIComponent(opLeagueId)}`,
        );
        if (cancelled) return;
        setPlayoffDivisions(data.divisions ?? []);
        setPlayoffName((current) =>
          current.trim()
            ? current
            : `${data.leagueName || opLeagueName || "League"} Playoffs`,
        );
      } catch (error) {
        if (!cancelled) {
          setPlayoffError(
            error instanceof Error
              ? error.message
              : "Failed to load playoff teams.",
          );
        }
      } finally {
        if (!cancelled) setPlayoffLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, configured, opLeagueId, opLeagueName, subTab]);

  const selectedPlayoffTeams = useMemo(() => {
    const out: PlayoffTeam[] = [];
    for (const division of playoffDivisions) {
      for (const team of division.teams) {
        if (selectedTeamIds.has(team.id)) out.push(team);
      }
    }
    return out;
  }, [playoffDivisions, selectedTeamIds]);

  const scheduleByDate = useMemo(() => {
    const map = new Map<string, ScheduleMatch[]>();
    for (const match of schedule) {
      const key = toDateInput(match.date) || match.date;
      const list = map.get(key) ?? [];
      list.push(match);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [schedule]);

  async function runAction(fn: () => Promise<void>, success?: string) {
    setBusy(true);
    setNotice(null);
    setSectionError(null);
    try {
      await fn();
      if (success) setNotice(success);
    } catch (error) {
      setSectionError(
        error instanceof Error ? error.message : "Action failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) return <LoadingState label="Checking sign-in…" />;

  if (!user) {
    return (
      <Panel
        title="League operator tools"
        description="Sign in to manage leagues, divisions, teams, players, locations, and schedules."
      >
        <button type="button" onClick={onRequestLogin} className={btnPrimary}>
          Sign in
        </button>
      </Panel>
    );
  }

  if (configured === false) {
    return (
      <Panel
        title="Operator login not configured"
        description={
          configError ||
          "Set LMS_OPERATOR_EMAIL and LMS_OPERATOR_PASSWORD (LMS web league operator login) on the server."
        }
      >
        <a
          href={`${LMS_BASE}/Account/Login`}
          target="_blank"
          rel="noreferrer"
          className={btnGhost}
        >
          Open LMS
        </a>
      </Panel>
    );
  }

  if (configured == null) {
    return <LoadingState label="Checking league operator…" />;
  }

  const needsDivision = ![
    "playoff",
    "create",
  ].includes(subTab);

  return (
    <div className="space-y-3">
      {/* Header — stacks on mobile, never squeezes title to one character */}
      <header className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[linear-gradient(145deg,rgba(29,110,158,0.98),rgba(19,78,115,0.96))] px-4 py-4 text-white shadow-[var(--shadow)] sm:px-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/65">
          LMS operator
        </p>
        <h2 className="mt-1.5 break-words font-[family-name:var(--font-display)] text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
          {opLeagueName || "Choose a league"}
        </h2>
        <p className="mt-1 break-words text-sm text-white/75">
          {opDivisionName
            ? opDivisionName
            : "Select a division to manage teams, players, locations, and schedule."}
        </p>
      </header>

      {/* Independent LO league / division context */}
      <section className="space-y-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
          Managing (separate from your play context)
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="League">
            <SelectField
              aria-label="Operator league"
              value={opLeagueId}
              options={leagues.map((l) => ({
                value: l.id,
                label: l.state ? `${l.name} (${l.state})` : l.name,
              }))}
              onChange={(value) => {
                const league = leagues.find((l) => l.id === value);
                setOpLeagueId(value);
                setOpLeagueName(league?.name ?? "");
                setOpDivisionId("");
                setOpDivisionName("");
                setNotice(null);
              }}
              placeholder={contextLoading ? "Loading…" : "Choose league…"}
            />
          </Field>
          <Field label="Division">
            <SelectField
              aria-label="Operator division"
              value={opDivisionId}
              options={divisions.map((d) => ({
                value: d.id,
                label: d.name,
              }))}
              onChange={(value) => {
                const division = divisions.find((d) => d.id === value);
                setOpDivisionId(value);
                setOpDivisionName(division?.name ?? "");
                setNotice(null);
              }}
              placeholder={
                !opLeagueId
                  ? "Choose a league first…"
                  : contextLoading
                    ? "Loading…"
                    : "Choose division…"
              }
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-[var(--ink)]">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
            className="h-4 w-4 accent-[var(--felt)]"
          />
          Include archived divisions
        </label>
      </section>

      {/* Subnav — horizontal scroll chips */}
      <div className="-mx-1 overflow-x-auto px-1">
        <div
          role="tablist"
          aria-label="LMS sections"
          className="flex min-w-max gap-1.5"
        >
          {SUB_TABS.map((tab) => {
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setSubTab(tab.id);
                  setNotice(null);
                  setSectionError(null);
                }}
                className={[
                  "rounded-full px-3 py-1.5 text-xs font-semibold transition sm:text-sm",
                  active
                    ? "bg-[var(--felt)] text-white"
                    : "bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--ink)]",
                ].join(" ")}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {notice ? (
        <p className="text-sm font-medium text-[var(--felt)]">{notice}</p>
      ) : null}
      {sectionError ? (
        <p className="whitespace-pre-wrap text-sm text-[var(--danger,#b42318)]">
          {sectionError}
        </p>
      ) : null}

      {needsDivision && !opDivisionId ? (
        <Panel
          title="Choose a division"
          description="Pick which division this league operator session should manage."
        >
          <p className="text-sm text-[var(--muted)]">
            Use the league and division selectors above. This is independent
            from Team / Score play context at the top of the app.
          </p>
        </Panel>
      ) : null}

      {subTab === "home" && opDivisionId ? (
        <Panel
          title="Division home"
          description="Upcoming and missed matches from LMS."
          action={
            <a
              href={`${LMS_BASE}/Division/DivisionDetail?DivisionId=${encodeURIComponent(opDivisionId)}`}
              target="_blank"
              rel="noreferrer"
              className={btnGhost}
            >
              Open LMS
            </a>
          }
        >
          {homeError ? (
            <p className="text-sm text-[var(--danger,#b42318)]">{homeError}</p>
          ) : null}
          <div className="grid gap-4 lg:grid-cols-2">
            {(
              [
                ["Upcoming", nextMatches, "No upcoming matches."],
                ["Missed", missedMatches, "No missed matches."],
              ] as const
            ).map(([title, rows, empty]) => (
              <div key={title} className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <h4 className="text-sm font-semibold text-[var(--ink)]">
                    {title}
                  </h4>
                  <span className="text-xs tabular-nums text-[var(--muted)]">
                    {homeLoading ? "…" : rows.length}
                  </span>
                </div>
                {homeLoading ? (
                  <p className="text-sm text-[var(--muted)]">Loading…</p>
                ) : rows.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">{empty}</p>
                ) : (
                  <ul className="divide-y divide-[var(--line)] rounded-[var(--radius)] border border-[var(--line)]">
                    {rows.map((match) => (
                      <li
                        key={match.matchId || `${match.teamOne}-${match.teamTwo}`}
                        className="px-3 py-2.5"
                      >
                        <p className="text-sm font-semibold text-[var(--ink)]">
                          {match.teamOne}{" "}
                          <span className="font-medium text-[var(--muted)]">
                            vs
                          </span>{" "}
                          {match.teamTwo}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--muted)]">
                          {formatMatchDate(
                            match.displayDate ?? match.datePlayed,
                          )}
                          {match.location ? ` · ${match.location}` : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      {subTab === "locations" && opDivisionId ? (
        <Panel
          title="Locations"
          description="Add, edit, or delete venues for this division."
          action={
            <button
              type="button"
              className={btnPrimary}
              onClick={() =>
                setLocationDraft({
                  id: "",
                  divisionId: opDivisionId,
                  name: "",
                  city: "",
                  state: "",
                  phoneNumber: null,
                  numberOf7FootTables: 0,
                  numberOf8FootTables: 0,
                  numberOf9FootTables: 0,
                  numberOf10FootTables: 0,
                })
              }
            >
              Add location
            </button>
          }
        >
          {sectionLoading ? <LoadingState label="Loading locations…" /> : null}
          {locationDraft ? (
            <div className="space-y-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] p-3">
              <p className="text-sm font-semibold text-[var(--ink)]">
                {locationDraft.id ? "Edit location" : "New location"}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name">
                  <input
                    className={inputClass}
                    value={locationDraft.name}
                    onChange={(e) =>
                      setLocationDraft({
                        ...locationDraft,
                        name: e.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="Phone">
                  <input
                    className={inputClass}
                    value={locationDraft.phoneNumber ?? ""}
                    onChange={(e) =>
                      setLocationDraft({
                        ...locationDraft,
                        phoneNumber: e.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="City">
                  <input
                    className={inputClass}
                    value={locationDraft.city}
                    onChange={(e) =>
                      setLocationDraft({
                        ...locationDraft,
                        city: e.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="State">
                  <input
                    className={inputClass}
                    value={locationDraft.state}
                    onChange={(e) =>
                      setLocationDraft({
                        ...locationDraft,
                        state: e.target.value,
                      })
                    }
                  />
                </Field>
                {(
                  [
                    ["7ft", "numberOf7FootTables"],
                    ["8ft", "numberOf8FootTables"],
                    ["9ft", "numberOf9FootTables"],
                    ["10ft", "numberOf10FootTables"],
                  ] as const
                ).map(([label, key]) => (
                  <Field key={key} label={`${label} tables`}>
                    <input
                      type="number"
                      min={0}
                      className={inputClass}
                      value={locationDraft[key]}
                      onChange={(e) =>
                        setLocationDraft({
                          ...locationDraft,
                          [key]: Number(e.target.value) || 0,
                        })
                      }
                    />
                  </Field>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || !locationDraft.name.trim()}
                  className={btnPrimary}
                  onClick={() =>
                    void runAction(async () => {
                      if (locationDraft.id) {
                        await fetchJson("/api/lms/operator/locations", {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ location: locationDraft }),
                        });
                      } else {
                        await fetchJson("/api/lms/operator/locations", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            divisionId: opDivisionId,
                            location: locationDraft,
                          }),
                        });
                      }
                      setLocationDraft(null);
                      await refreshLocations();
                    }, "Location saved.")
                  }
                >
                  Save
                </button>
                <button
                  type="button"
                  className={btnGhost}
                  onClick={() => setLocationDraft(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
          <ul className="divide-y divide-[var(--line)] rounded-[var(--radius)] border border-[var(--line)]">
            {locations.map((loc) => (
              <li
                key={loc.id}
                className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--ink)]">
                    {loc.name}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {[loc.city, loc.state].filter(Boolean).join(", ") ||
                      "No city/state"}{" "}
                    ·{" "}
                    {loc.numberOf7FootTables +
                      loc.numberOf8FootTables +
                      loc.numberOf9FootTables +
                      loc.numberOf10FootTables}{" "}
                    tables
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={btnGhost}
                    onClick={() => setLocationDraft(loc)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={btnGhost}
                    disabled={busy}
                    onClick={() => {
                      if (!confirm(`Delete ${loc.name}?`)) return;
                      void runAction(async () => {
                        await fetchJson(
                          `/api/lms/operator/locations?locationId=${encodeURIComponent(loc.id)}`,
                          { method: "DELETE" },
                        );
                        await refreshLocations();
                      }, "Location deleted.");
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {subTab === "teams" && opDivisionId ? (
        <Panel
          title="Teams"
          description="Create and edit teams, and manage who is on each roster."
          action={
            <button
              type="button"
              className={btnPrimary}
              onClick={() =>
                setTeamDraft({
                  name: "",
                  locationId: locations[0]?.id ?? "",
                  isBye: false,
                })
              }
            >
              Add team
            </button>
          }
        >
          {sectionLoading ? <LoadingState label="Loading teams…" /> : null}
          {teamDraft ? (
            <div className="space-y-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] p-3">
              <p className="text-sm font-semibold">
                {teamDraft.id ? "Edit team" : "New team"}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name">
                  <input
                    className={inputClass}
                    value={teamDraft.name}
                    onChange={(e) =>
                      setTeamDraft({ ...teamDraft, name: e.target.value })
                    }
                  />
                </Field>
                <Field label="Location">
                  <SelectField
                    aria-label="Team location"
                    value={teamDraft.locationId}
                    options={locations.map((l) => ({
                      value: l.id,
                      label: l.name,
                    }))}
                    onChange={(value) =>
                      setTeamDraft({ ...teamDraft, locationId: value })
                    }
                    placeholder="Choose location…"
                  />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={teamDraft.isBye}
                  onChange={(e) =>
                    setTeamDraft({ ...teamDraft, isBye: e.target.checked })
                  }
                  className="h-4 w-4 accent-[var(--felt)]"
                />
                Bye team
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={
                    busy || !teamDraft.name.trim() || !teamDraft.locationId
                  }
                  className={btnPrimary}
                  onClick={() =>
                    void runAction(async () => {
                      if (teamDraft.id) {
                        await fetchJson("/api/lms/operator/teams", {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            divisionId: opDivisionId,
                            teamId: teamDraft.id,
                            team: teamDraft,
                          }),
                        });
                      } else {
                        await fetchJson("/api/lms/operator/teams", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            divisionId: opDivisionId,
                            team: teamDraft,
                          }),
                        });
                      }
                      setTeamDraft(null);
                      await refreshTeams();
                    }, "Team saved.")
                  }
                >
                  Save
                </button>
                <button
                  type="button"
                  className={btnGhost}
                  onClick={() => setTeamDraft(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
          <ul className="space-y-3">
            {teams.map((team) => (
              <li
                key={team.id}
                className="rounded-[var(--radius)] border border-[var(--line)] p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[var(--ink)]">
                      {team.name}
                      {team.isBye ? (
                        <span className="ml-2 text-xs text-[var(--muted)]">
                          BYE
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      {team.locationName || "No location"} ·{" "}
                      {team.numberOfPlayers} players
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={btnGhost}
                      onClick={() =>
                        setTeamDraft({
                          id: team.id,
                          name: team.name,
                          locationId: team.locationId ?? locations[0]?.id ?? "",
                          isBye: team.isBye,
                        })
                      }
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className={btnGhost}
                      disabled={busy}
                      onClick={() => {
                        if (!confirm(`Delete team ${team.name}?`)) return;
                        void runAction(async () => {
                          await fetchJson(
                            `/api/lms/operator/teams?teamId=${encodeURIComponent(team.id)}`,
                            { method: "DELETE" },
                          );
                          await refreshTeams();
                        }, "Team deleted.");
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {team.players.length ? (
                  <ul className="mt-2 space-y-1 border-t border-[var(--line)] pt-2">
                    {team.players.map((player) => (
                      <li
                        key={player.id}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <span>{player.name}</span>
                        <button
                          type="button"
                          className="text-xs font-semibold text-[var(--danger,#b42318)]"
                          disabled={busy}
                          onClick={() =>
                            void runAction(async () => {
                              await fetchJson("/api/lms/operator/players", {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                  action: "remove",
                                  teamId: team.id,
                                  playerId: player.id,
                                }),
                              });
                              await refreshTeams();
                            }, "Player removed.")
                          }
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {subTab === "players" && opDivisionId ? (
        <Panel
          title="Players"
          description="View division players, create new ones, edit info, or assign to a team."
          action={
            <button
              type="button"
              className={btnPrimary}
              onClick={() => {
                setPlayerDraft(emptyPlayerForm());
                setAssignTeamId(teams[0]?.id ?? "");
              }}
            >
              New player
            </button>
          }
        >
          {sectionLoading ? <LoadingState label="Loading players…" /> : null}

          <div className="space-y-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] p-3">
            <p className="text-sm font-semibold">Add existing player to team</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Team">
                <SelectField
                  aria-label="Assign team"
                  value={assignTeamId}
                  options={teams.map((t) => ({
                    value: t.id,
                    label: t.name,
                  }))}
                  onChange={setAssignTeamId}
                  placeholder="Choose team…"
                />
              </Field>
              <Field label="Search (min 3 chars)">
                <input
                  className={inputClass}
                  value={playerSearch}
                  onChange={(e) => setPlayerSearch(e.target.value)}
                  placeholder="Name or membership #"
                />
              </Field>
            </div>
            <button
              type="button"
              className={btnGhost}
              disabled={busy || playerSearch.trim().length < 3}
              onClick={() =>
                void runAction(async () => {
                  const data = await fetchJson<{
                    results: typeof playerHits;
                  }>(
                    `/api/lms/operator/players?q=${encodeURIComponent(playerSearch.trim())}`,
                  );
                  setPlayerHits(data.results ?? []);
                })
              }
            >
              Search
            </button>
            {playerHits.length ? (
              <ul className="divide-y divide-[var(--line)] rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]">
                {playerHits.slice(0, 12).map((hit) => (
                  <li
                    key={hit.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                  >
                    <span>
                      {hit.lastName}, {hit.firstName}{" "}
                      <span className="text-[var(--muted)]">
                        #{hit.readableId}
                        {hit.effectiveRating
                          ? ` · ${hit.effectiveRating}`
                          : ""}
                      </span>
                    </span>
                    <button
                      type="button"
                      className={btnPrimary}
                      disabled={busy || !assignTeamId}
                      onClick={() =>
                        void runAction(async () => {
                          await fetchJson("/api/lms/operator/players", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              action: "assign",
                              teamId: assignTeamId,
                              readableId: hit.readableId,
                            }),
                          });
                          await Promise.all([refreshTeams(), refreshPlayers()]);
                        }, "Player assigned.")
                      }
                    >
                      Add
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {playerDraft ? (
            <div className="space-y-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] p-3">
              <p className="text-sm font-semibold">
                {playerDraft.id ? "Edit player" : "Create player"}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="First name">
                  <input
                    className={inputClass}
                    value={playerDraft.firstName}
                    onChange={(e) =>
                      setPlayerDraft({
                        ...playerDraft,
                        firstName: e.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="Last name">
                  <input
                    className={inputClass}
                    value={playerDraft.lastName}
                    onChange={(e) =>
                      setPlayerDraft({
                        ...playerDraft,
                        lastName: e.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="City">
                  <input
                    className={inputClass}
                    value={playerDraft.city}
                    onChange={(e) =>
                      setPlayerDraft({ ...playerDraft, city: e.target.value })
                    }
                  />
                </Field>
                <Field label="State">
                  <input
                    className={inputClass}
                    value={playerDraft.state}
                    onChange={(e) =>
                      setPlayerDraft({ ...playerDraft, state: e.target.value })
                    }
                  />
                </Field>
                <Field label="Email">
                  <input
                    className={inputClass}
                    value={playerDraft.email1 ?? ""}
                    onChange={(e) =>
                      setPlayerDraft({
                        ...playerDraft,
                        email1: e.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="Phone">
                  <input
                    className={inputClass}
                    value={playerDraft.phone1 ?? ""}
                    onChange={(e) =>
                      setPlayerDraft({
                        ...playerDraft,
                        phone1: e.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="Starter rating">
                  <input
                    type="number"
                    min={250}
                    max={850}
                    className={inputClass}
                    value={playerDraft.provisionalRating}
                    onChange={(e) =>
                      setPlayerDraft({
                        ...playerDraft,
                        provisionalRating: Number(e.target.value) || 400,
                      })
                    }
                  />
                </Field>
                <Field label="Gender">
                  <SelectField
                    aria-label="Gender"
                    value={playerDraft.gender}
                    options={[
                      { value: "M", label: "M" },
                      { value: "F", label: "F" },
                    ]}
                    onChange={(value) =>
                      setPlayerDraft({ ...playerDraft, gender: value })
                    }
                  />
                </Field>
                {!playerDraft.id ? (
                  <Field label="Assign to team (optional)">
                    <SelectField
                      aria-label="New player team"
                      value={assignTeamId}
                      options={[
                        { value: "", label: "None" },
                        ...teams.map((t) => ({
                          value: t.id,
                          label: t.name,
                        })),
                      ]}
                      onChange={setAssignTeamId}
                    />
                  </Field>
                ) : null}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={btnPrimary}
                  disabled={
                    busy ||
                    !playerDraft.firstName.trim() ||
                    !playerDraft.lastName.trim() ||
                    !playerDraft.city.trim() ||
                    !playerDraft.state.trim()
                  }
                  onClick={() =>
                    void runAction(async () => {
                      if (playerDraft.id) {
                        await fetchJson("/api/lms/operator/players", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            action: "update",
                            player: playerDraft,
                          }),
                        });
                      } else {
                        await fetchJson("/api/lms/operator/players", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            action: "create",
                            player: playerDraft,
                            teamId: assignTeamId || undefined,
                          }),
                        });
                      }
                      setPlayerDraft(null);
                      await Promise.all([refreshPlayers(), refreshTeams()]);
                    }, "Player saved.")
                  }
                >
                  Save
                </button>
                <button
                  type="button"
                  className={btnGhost}
                  onClick={() => setPlayerDraft(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          <ul className="divide-y divide-[var(--line)] rounded-[var(--radius)] border border-[var(--line)]">
            {players.map((player) => (
              <li
                key={player.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--ink)]">
                    {player.name}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    Eff {player.effectiveRating ?? "—"}
                    {player.location ? ` · ${player.location}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className={btnGhost}
                  onClick={() =>
                    void runAction(async () => {
                      const data = await fetchJson<{
                        player: OperatorPlayerDetail;
                      }>(
                        `/api/lms/operator/players?playerId=${encodeURIComponent(player.id)}`,
                      );
                      setPlayerDraft(data.player);
                    })
                  }
                >
                  Edit
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {subTab === "schedule" && opDivisionId ? (
        <Panel
          title="Schedule"
          description="Generate, clear, and edit matches for this division."
        >
          {sectionLoading ? <LoadingState label="Loading schedule…" /> : null}
          <div className="space-y-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] p-3">
            <p className="text-sm font-semibold">Generate schedule</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Start date">
                <input
                  type="date"
                  className={inputClass}
                  value={genStart}
                  onChange={(e) => setGenStart(e.target.value)}
                />
              </Field>
              <Field label="Rounds">
                <input
                  type="number"
                  min={1}
                  className={inputClass}
                  value={genRounds}
                  onChange={(e) => setGenRounds(e.target.value)}
                />
              </Field>
              <Field label="Weeks">
                <input
                  type="number"
                  min={1}
                  className={inputClass}
                  value={genWeeks}
                  onChange={(e) => setGenWeeks(e.target.value)}
                />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={btnPrimary}
                disabled={busy || !genStart}
                onClick={() => {
                  if (
                    !confirm(
                      "Regenerate the schedule? This replaces the current schedule in LMS.",
                    )
                  ) {
                    return;
                  }
                  void runAction(async () => {
                    await fetchJson("/api/lms/operator/schedule", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: "generate",
                        divisionId: opDivisionId,
                        startDate: genStart,
                        numberOfRounds: Number(genRounds) || 5,
                        numberOfWeeks: Number(genWeeks) || 11,
                      }),
                    });
                    await refreshSchedule();
                  }, "Schedule generated.");
                }}
              >
                Generate
              </button>
              <button
                type="button"
                className={btnGhost}
                disabled={busy}
                onClick={() => {
                  if (!confirm("Clear the entire schedule?")) return;
                  void runAction(async () => {
                    await fetchJson("/api/lms/operator/schedule", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: "clear",
                        divisionId: opDivisionId,
                      }),
                    });
                    await refreshSchedule();
                  }, "Schedule cleared.");
                }}
              >
                Clear all
              </button>
              <button
                type="button"
                className={btnGhost}
                onClick={() =>
                  setMatchDraft({
                    teamOneId: teams[0]?.id ?? "",
                    teamTwoId: teams[1]?.id ?? "",
                    date: genStart || toDateInput(new Date().toISOString()),
                    locationId: locations[0]?.id ?? "",
                  })
                }
              >
                Add match
              </button>
            </div>
          </div>

          {matchDraft ? (
            <div className="space-y-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] p-3">
              <p className="text-sm font-semibold">
                {matchDraft.matchId ? "Edit match" : "New match"}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Home">
                  <SelectField
                    aria-label="Home team"
                    value={matchDraft.teamOneId}
                    options={teams.map((t) => ({
                      value: t.id,
                      label: t.name,
                    }))}
                    onChange={(value) =>
                      setMatchDraft({ ...matchDraft, teamOneId: value })
                    }
                  />
                </Field>
                <Field label="Away">
                  <SelectField
                    aria-label="Away team"
                    value={matchDraft.teamTwoId}
                    options={teams.map((t) => ({
                      value: t.id,
                      label: t.name,
                    }))}
                    onChange={(value) =>
                      setMatchDraft({ ...matchDraft, teamTwoId: value })
                    }
                  />
                </Field>
                <Field label="Date">
                  <input
                    type="date"
                    className={inputClass}
                    value={matchDraft.date}
                    onChange={(e) =>
                      setMatchDraft({ ...matchDraft, date: e.target.value })
                    }
                  />
                </Field>
                <Field label="Location">
                  <SelectField
                    aria-label="Match location"
                    value={matchDraft.locationId}
                    options={locations.map((l) => ({
                      value: l.id,
                      label: l.name,
                    }))}
                    onChange={(value) =>
                      setMatchDraft({ ...matchDraft, locationId: value })
                    }
                  />
                </Field>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={btnPrimary}
                  disabled={busy}
                  onClick={() =>
                    void runAction(async () => {
                      if (matchDraft.matchId) {
                        await fetchJson("/api/lms/operator/schedule", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            action: "change",
                            ...matchDraft,
                          }),
                        });
                      } else {
                        await fetchJson("/api/lms/operator/schedule", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            action: "create",
                            divisionId: opDivisionId,
                            ...matchDraft,
                          }),
                        });
                      }
                      setMatchDraft(null);
                      await refreshSchedule();
                    }, "Match saved.")
                  }
                >
                  Save match
                </button>
                <button
                  type="button"
                  className={btnGhost}
                  onClick={() => setMatchDraft(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          <div className="space-y-4">
            {scheduleByDate.map(([date, matches]) => (
              <div key={date} className="space-y-2">
                <h4 className="text-sm font-semibold text-[var(--ink)]">
                  {formatMatchDate(date)}
                </h4>
                <ul className="divide-y divide-[var(--line)] rounded-[var(--radius)] border border-[var(--line)]">
                  {matches.map((match) => (
                    <li
                      key={
                        match.matchId ||
                        `${match.homeTeamId}-${match.awayTeamId}-${match.date}`
                      }
                      className="px-3 py-2.5"
                    >
                      <p className="text-sm font-semibold">
                        {match.homeTeamName}{" "}
                        <span className="font-medium text-[var(--muted)]">
                          vs
                        </span>{" "}
                        {match.awayTeamName}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {match.location || "No location"}
                      </p>
                      {match.matchId ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className={btnGhost}
                            onClick={() =>
                              setMatchDraft({
                                matchId: match.matchId,
                                teamOneId: match.homeTeamId,
                                teamTwoId: match.awayTeamId,
                                date: toDateInput(match.date),
                                locationId:
                                  match.locationId || locations[0]?.id || "",
                              })
                            }
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className={btnGhost}
                            disabled={busy}
                            onClick={() =>
                              void runAction(async () => {
                                await fetchJson("/api/lms/operator/schedule", {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    action: "flip",
                                    matchId: match.matchId,
                                  }),
                                });
                                await refreshSchedule();
                              }, "Home/away flipped.")
                            }
                          >
                            Flip
                          </button>
                          <button
                            type="button"
                            className={btnGhost}
                            disabled={busy}
                            onClick={() => {
                              if (!confirm("Delete this match?")) return;
                              void runAction(async () => {
                                await fetchJson("/api/lms/operator/schedule", {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    action: "delete",
                                    matchId: match.matchId,
                                  }),
                                });
                                await refreshSchedule();
                              }, "Match deleted.");
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {!sectionLoading && schedule.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No matches scheduled.</p>
            ) : null}
          </div>
        </Panel>
      ) : null}

      {subTab === "settings" && opDivisionId ? (
        <Panel
          title="Division settings"
          description="Edit core settings and the match format template."
        >
          {sectionLoading || !settings ? (
            <LoadingState label="Loading settings…" />
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name">
                  <input
                    className={inputClass}
                    value={String(settings.Name ?? "")}
                    onChange={(e) =>
                      setSettings({ ...settings, Name: e.target.value })
                    }
                  />
                </Field>
                <Field label="Description">
                  <input
                    className={inputClass}
                    value={String(settings.Description ?? "")}
                    onChange={(e) =>
                      setSettings({ ...settings, Description: e.target.value })
                    }
                  />
                </Field>
                <Field label="Players per team">
                  <input
                    className={inputClass}
                    value={String(settings.NumberOfPlayers ?? "")}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        NumberOfPlayers: e.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="Cost per player">
                  <input
                    className={inputClass}
                    value={String(settings.CostPerPlayer ?? "")}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        CostPerPlayer: e.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="Rounds">
                  <input
                    className={inputClass}
                    value={String(settings.NumberOfRounds ?? "")}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        NumberOfRounds: e.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="Games per round">
                  <input
                    className={inputClass}
                    value={String(settings.NumberOfGamesPerRound ?? "")}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        NumberOfGamesPerRound: e.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="Points for win">
                  <input
                    className={inputClass}
                    value={String(settings.PointsForWin ?? "")}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        PointsForWin: e.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="Time zone">
                  <input
                    className={inputClass}
                    value={String(settings.TimeZoneName ?? "")}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        TimeZoneName: e.target.value,
                      })
                    }
                  />
                </Field>
              </div>

              <Field label="Apply format template">
                <SelectField
                  aria-label="Format template"
                  value=""
                  options={[
                    { value: "", label: "Choose a template…" },
                    ...templates.map((t) => ({
                      value: t.id,
                      label: t.name,
                    })),
                  ]}
                  onChange={(value) => {
                    const template = templates.find((t) => t.id === value);
                    if (!template) return;
                    setSettings({
                      ...settings,
                      FormatTemplate: template.template,
                    });
                  }}
                />
              </Field>
              <Field label="Format template">
                <textarea
                  className={`${inputClass} min-h-40 font-mono text-xs`}
                  value={String(settings.FormatTemplate ?? "")}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      FormatTemplate: e.target.value,
                    })
                  }
                />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(settings.ForceChanges)}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      ForceChanges: e.target.checked,
                    })
                  }
                  className="h-4 w-4 accent-[var(--felt)]"
                />
                Force changes on already-played scoresheets
              </label>
              <button
                type="button"
                className={btnPrimary}
                disabled={busy}
                onClick={() =>
                  void runAction(async () => {
                    await fetchJson("/api/lms/operator/settings", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ settings }),
                    });
                    await refreshSettings();
                    if (typeof settings.Name === "string") {
                      setOpDivisionName(settings.Name);
                    }
                  }, "Settings saved.")
                }
              >
                Save settings
              </button>
            </div>
          )}
        </Panel>
      ) : null}

      {subTab === "playoff" ? (
        <Panel
          title="Create playoff"
          description="Pick teams from any division in this league."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Playoff name">
              <input
                className={inputClass}
                value={playoffName}
                onChange={(e) => setPlayoffName(e.target.value)}
              />
            </Field>
            <Field label="Skill level">
              <SelectField
                aria-label="Skill level"
                value={playoffSkill}
                options={[...SKILL_LEVELS]}
                onChange={setPlayoffSkill}
              />
            </Field>
          </div>
          <p className="text-sm text-[var(--muted)]">
            Selected teams:{" "}
            <span className="font-semibold text-[var(--ink)]">
              {selectedPlayoffTeams.length}
            </span>
          </p>
          {playoffLoading ? (
            <LoadingState label="Loading teams…" />
          ) : playoffError ? (
            <p className="text-sm text-[var(--danger,#b42318)]">{playoffError}</p>
          ) : (
            <div className="space-y-2">
              {playoffDivisions.map((division) => (
                <details
                  key={division.name}
                  className="rounded-[var(--radius)] border border-[var(--line)]"
                >
                  <summary className="cursor-pointer px-3 py-2.5 text-sm font-semibold">
                    {division.name}{" "}
                    <span className="font-medium text-[var(--muted)]">
                      ({division.teams.length})
                    </span>
                  </summary>
                  <ul className="space-y-1.5 border-t border-[var(--line)] px-3 py-2">
                    {division.teams.map((team) => (
                      <li key={team.id}>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-[var(--felt)]"
                            checked={selectedTeamIds.has(team.id)}
                            onChange={() =>
                              setSelectedTeamIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(team.id)) next.delete(team.id);
                                else next.add(team.id);
                                return next;
                              })
                            }
                          />
                          {team.name}
                        </label>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          )}
          <button
            type="button"
            className={btnPrimary}
            disabled={
              busy ||
              playoffLoading ||
              !playoffName.trim() ||
              selectedPlayoffTeams.length < 2 ||
              !opLeagueId
            }
            onClick={() =>
              void runAction(async () => {
                const result = await fetchJson<{
                  redirectUrl?: string | null;
                }>("/api/lms/operator/playoff", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    leagueId: opLeagueId,
                    name: playoffName.trim(),
                    skillLevel: playoffSkill,
                    selectedTeams: selectedPlayoffTeams,
                  }),
                });
                setSelectedTeamIds(new Set());
                await loadDivisions();
                if (result.redirectUrl) {
                  setNotice(
                    `Playoff created. Open in LMS: ${LMS_BASE}${result.redirectUrl.startsWith("/") ? "" : "/"}${result.redirectUrl}`,
                  );
                }
              }, "Playoff created.")
            }
          >
            Create playoff
          </button>
        </Panel>
      ) : null}

      {subTab === "create" && opLeagueId ? (
        <Panel
          title="Create division"
          description="Copy settings from an existing division. Schedule starts empty."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Copy settings from">
              <SelectField
                aria-label="Source division"
                value={createSourceId || opDivisionId}
                options={divisions.map((d) => ({
                  value: d.id,
                  label: d.name,
                }))}
                onChange={(value) => {
                  setCreateSourceId(value);
                  setCreateName("");
                }}
              />
            </Field>
            <Field label="New division name">
              <input
                className={inputClass}
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. Thursday - Paradise (2026.3)"
              />
            </Field>
            <Field label="Description">
              <input
                className={inputClass}
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeTeams}
              onChange={(e) => {
                setIncludeTeams(e.target.checked);
                if (!e.target.checked) setIncludePlayers(false);
              }}
              className="h-4 w-4 accent-[var(--felt)]"
            />
            Copy locations and teams
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includePlayers}
              disabled={!includeTeams}
              onChange={(e) => setIncludePlayers(e.target.checked)}
              className="h-4 w-4 accent-[var(--felt)]"
            />
            Copy player rosters
          </label>
          <button
            type="button"
            className={btnPrimary}
            disabled={
              busy ||
              !(createSourceId || opDivisionId) ||
              !createName.trim()
            }
            onClick={() =>
              void runAction(async () => {
                const result = await fetchJson<{
                  redirectUrl?: string | null;
                }>("/api/lms/operator/division", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    leagueId: opLeagueId,
                    sourceDivisionId: createSourceId || opDivisionId,
                    name: createName.trim(),
                    description: createDescription.trim(),
                    includeTeams,
                    includePlayers,
                  }),
                });
                await loadDivisions();
                if (result.redirectUrl) {
                  setNotice(
                    `Division created. Open in LMS: ${LMS_BASE}${result.redirectUrl.startsWith("/") ? "" : "/"}${result.redirectUrl}`,
                  );
                }
              }, "Division created.")
            }
          >
            Create division
          </button>
        </Panel>
      ) : null}
    </div>
  );
}
