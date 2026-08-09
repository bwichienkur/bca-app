"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { createPortal } from "react-dom";
import { LMS_BASE } from "@/lib/constants";
import {
  AccentRecordCard,
  accentRecordListClass,
} from "./AccentRecordCard";
import { DateField } from "./DateField";
import {
  IconSubTabs,
  OverviewSubIcon,
  type IconSubTabItem,
} from "./IconSubTabs";
import { LoadingState } from "./LoadingState";
import type { AuthUser } from "./LoginScreen";
import { SearchField } from "./SearchField";
import { LmsDivisionSettingsForm } from "./LmsDivisionSettingsForm";
import { SelectField } from "./SelectField";

type LmsSubTab =
  | "home"
  | "teams"
  | "players"
  | "locations"
  | "schedule"
  | "settings"
  | "playoff"
  | "division";

type Screen =
  | { type: "list" }
  | { type: "edit-location"; id: string | null }
  | { type: "edit-team"; id: string | null }
  | { type: "edit-player"; id: string | null }
  | { type: "edit-match"; matchId: string | null }
  | { type: "edit-settings"; divisionId: string }
  | { type: "create-division" }
  | { type: "create-playoff" };

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

const inputClass =
  "w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none ring-[var(--felt)] focus:ring-2";
const btnPrimary =
  "inline-flex items-center justify-center rounded-[var(--radius)] bg-[var(--felt)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50";
const btnGhost =
  "inline-flex items-center justify-center rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--ink)] disabled:opacity-50";
/** Dark amber so white label stays readable */
const btnEdit =
  "inline-flex items-center justify-center rounded-[var(--radius)] bg-[#a16207] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50";
/** Strong red with white label */
const btnDelete =
  "inline-flex items-center justify-center rounded-[var(--radius)] bg-[#b42318] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50";
const btnRemove =
  "inline-flex min-h-11 min-w-[5.5rem] items-center justify-center rounded-[var(--radius)] bg-[#b42318] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50";
const btnAdd = btnPrimary;

const SKILL_LEVELS = [
  { value: "Platinum", label: "Platinum" },
  { value: "Gold", label: "Gold" },
  { value: "Silver", label: "Silver" },
] as const;

function IconShell({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

function HomeIcon({ className }: { className?: string }) {
  return <OverviewSubIcon className={className} />;
}
function TeamsIcon({ className }: { className?: string }) {
  return (
    <IconShell className={className}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="3" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a3 3 0 0 1 0 5.74" />
    </IconShell>
  );
}
function PlayersIcon({ className }: { className?: string }) {
  return (
    <IconShell className={className}>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="3" />
    </IconShell>
  );
}
function LocationsIcon({ className }: { className?: string }) {
  return (
    <IconShell className={className}>
      <path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </IconShell>
  );
}
function ScheduleIcon({ className }: { className?: string }) {
  return (
    <IconShell className={className}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
    </IconShell>
  );
}
function SettingsIcon({ className }: { className?: string }) {
  return (
    <IconShell className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </IconShell>
  );
}
function PlayoffIcon({ className }: { className?: string }) {
  return (
    <IconShell className={className}>
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M12 12v2" />
    </IconShell>
  );
}
function DivisionIcon({ className }: { className?: string }) {
  return (
    <IconShell className={className}>
      <path d="M12 3v18" />
      <path d="M5 8h14" />
      <path d="M7 12h10" />
      <path d="M9 16h6" />
    </IconShell>
  );
}
function ChevronIcon({
  className,
  open,
}: {
  className?: string;
  open: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={[
        className,
        "transition-transform",
        open ? "rotate-90" : "",
      ].join(" ")}
      aria-hidden
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

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
    <label className="block min-w-0 space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
        {label}
      </span>
      <div className="min-w-0">{children}</div>
    </label>
  );
}

function SectionHeader({
  title,
  description,
  onAdd,
}: {
  title: string;
  description?: string;
  onAdd?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
          {title}
        </p>
        {description ? (
          <p className="mt-0.5 text-xs text-[var(--muted)]">{description}</p>
        ) : null}
      </div>
      {onAdd ? (
        <button
          type="button"
          className={`${btnAdd} h-9 shrink-0 self-center px-3`}
          onClick={onAdd}
        >
          + Add
        </button>
      ) : null}
    </div>
  );
}

type PendingConfirm = {
  title: string;
  body: string;
  confirmLabel: string;
  tone?: "primary" | "danger";
  onConfirm: () => void | Promise<void>;
};

function OperatorConfirmDialog({
  pending,
  busy,
  anchorY,
  onCancel,
}: {
  pending: PendingConfirm;
  busy: boolean;
  anchorY: number | null;
  onCancel: () => void;
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

  if (!mounted) return null;

  const topPad =
    anchorY == null
      ? Math.max(24, Math.round(window.innerHeight * 0.18))
      : Math.max(12, Math.min(anchorY - 8, Math.round(window.innerHeight * 0.55)));

  return createPortal(
    <div
      className="fixed inset-0 z-[120] overflow-y-auto bg-black/50"
      role="presentation"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        className="flex min-h-full justify-center px-3 pb-10"
        style={{ paddingTop: topPad }}
      >
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="lms-confirm-title"
          aria-describedby="lms-confirm-body"
          className="w-full max-w-md rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow)]"
          onClick={(event) => event.stopPropagation()}
        >
          <h4
            id="lms-confirm-title"
            className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--felt-deep)]"
          >
            {pending.title}
          </h4>
          <p id="lms-confirm-body" className="mt-2 text-sm text-[var(--muted)]">
            {pending.body}
          </p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className={btnGhost}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void pending.onConfirm()}
              className={
                pending.tone === "primary" ? btnPrimary : btnDelete
              }
            >
              {busy ? "Working…" : pending.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function popupTopPad(anchorY: number | null): number {
  if (typeof window === "undefined") return 24;
  if (anchorY == null) {
    return Math.max(24, Math.round(window.innerHeight * 0.12));
  }
  return Math.max(
    12,
    Math.min(anchorY - 8, Math.round(window.innerHeight * 0.55)),
  );
}

function emptyLocation(divisionId: string): OperatorLocation {
  return {
    id: "",
    divisionId,
    name: "",
    city: "",
    state: "",
    phoneNumber: null,
    numberOf7FootTables: 0,
    numberOf8FootTables: 0,
    numberOf9FootTables: 0,
    numberOf10FootTables: 0,
  };
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

function isPlayoffName(name: string): boolean {
  return /playoff/i.test(name);
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
  const [screen, setScreen] = useState<Screen>({ type: "list" });
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  const [leagues, setLeagues] = useState<OperatorLeague[]>([]);
  const [divisions, setDivisions] = useState<OperatorDivision[]>([]);
  const [opLeagueId, setOpLeagueId] = useState(seedLeagueId ?? "");
  const [opLeagueName, setOpLeagueName] = useState(seedLeagueName ?? "");
  const [opDivisionId, setOpDivisionId] = useState(seedDivisionId ?? "");
  const [opDivisionName, setOpDivisionName] = useState(seedDivisionName ?? "");
  const opDivisionIdRef = useRef(opDivisionId);
  opDivisionIdRef.current = opDivisionId;
  const [contextLoading, setContextLoading] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);

  const [nextMatches, setNextMatches] = useState<OperatorMatch[]>([]);
  const [missedMatches, setMissedMatches] = useState<OperatorMatch[]>([]);
  const [homeLoading, setHomeLoading] = useState(false);

  const [locations, setLocations] = useState<OperatorLocation[]>([]);
  const [teams, setTeams] = useState<OperatorTeam[]>([]);
  const [players, setPlayers] = useState<OperatorPlayerRow[]>([]);
  const [schedule, setSchedule] = useState<ScheduleMatch[]>([]);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [listQuery, setListQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [popupAnchorY, setPopupAnchorY] = useState<number | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(
    null,
  );

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
  const [includePlayersCopy, setIncludePlayersCopy] = useState(false);

  const subItems: IconSubTabItem<LmsSubTab>[] = useMemo(
    () => [
      { id: "home", label: "Home", icon: HomeIcon },
      { id: "teams", label: "Teams", icon: TeamsIcon },
      { id: "players", label: "Players", icon: PlayersIcon },
      { id: "locations", label: "Locations", icon: LocationsIcon },
      { id: "schedule", label: "Schedule", icon: ScheduleIcon },
      { id: "settings", label: "Settings", icon: SettingsIcon },
      { id: "playoff", label: "Playoff", icon: PlayoffIcon },
      { id: "division", label: "Division", icon: DivisionIcon },
    ],
    [],
  );

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
        const data = await fetchJson<{
          configured: boolean;
          allowed?: boolean;
        }>("/api/lms/operator/status");
        if (!cancelled) {
          setConfigured(Boolean(data.configured && data.allowed !== false));
          setConfigError(
            data.configured && data.allowed === false
              ? "LMS tools are only available to league operators (and Bright)."
              : null,
          );
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

  const loadLeagues = useCallback(async (force = false) => {
    setContextLoading(true);
    try {
      const data = await fetchJson<{ leagues: OperatorLeague[] }>(
        `/api/lms/operator/context${force ? "?refresh=1" : ""}`,
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

  const loadDivisions = useCallback(async (force = false) => {
    if (!opLeagueId) {
      setDivisions([]);
      return;
    }
    setContextLoading(true);
    try {
      const data = await fetchJson<{ divisions: OperatorDivision[] }>(
        `/api/lms/operator/context?leagueId=${encodeURIComponent(opLeagueId)}&includeArchived=${includeArchived ? "true" : "false"}${force ? "&refresh=1" : ""}`,
      );
      setDivisions(data.divisions ?? []);
      const currentDivisionId = opDivisionIdRef.current;
      if (
        currentDivisionId &&
        !(data.divisions ?? []).some((d) => d.id === currentDivisionId)
      ) {
        setOpDivisionId("");
        setOpDivisionName("");
      } else if (currentDivisionId) {
        const match = (data.divisions ?? []).find(
          (d) => d.id === currentDivisionId,
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
  }, [opLeagueId, includeArchived]);

  useEffect(() => {
    if (!user || !configured) return;
    void loadLeagues();
  }, [user, configured, loadLeagues]);

  useEffect(() => {
    if (!user || !configured || !opLeagueId) return;
    void loadDivisions();
  }, [user, configured, opLeagueId, includeArchived, loadDivisions]);

  const refreshHome = useCallback(async (force = false) => {
    if (!opDivisionId) return;
    setHomeLoading(true);
    try {
      const q = force ? "&refresh=1" : "";
      const [next, missed] = await Promise.all([
        fetchJson<{ matches: OperatorMatch[] }>(
          `/api/lms/operator/matches?divisionId=${encodeURIComponent(opDivisionId)}&kind=next${q}`,
        ),
        fetchJson<{ matches: OperatorMatch[] }>(
          `/api/lms/operator/matches?divisionId=${encodeURIComponent(opDivisionId)}&kind=missed${q}`,
        ),
      ]);
      setNextMatches(next.matches ?? []);
      setMissedMatches(missed.matches ?? []);
    } catch (error) {
      setSectionError(
        error instanceof Error ? error.message : "Failed to load matches.",
      );
    } finally {
      setHomeLoading(false);
    }
  }, [opDivisionId]);

  const refreshLocations = useCallback(async (force = false) => {
    if (!opDivisionId) return;
    const q = force ? "&refresh=1" : "";
    const data = await fetchJson<{ locations: OperatorLocation[] }>(
      `/api/lms/operator/locations?divisionId=${encodeURIComponent(opDivisionId)}${q}`,
    );
    setLocations(data.locations ?? []);
  }, [opDivisionId]);

  const refreshTeams = useCallback(async (force = false) => {
    if (!opDivisionId) return;
    const q = force ? "&refresh=1" : "";
    const data = await fetchJson<{ teams: OperatorTeam[] }>(
      `/api/lms/operator/teams?divisionId=${encodeURIComponent(opDivisionId)}${q}`,
    );
    setTeams(data.teams ?? []);
  }, [opDivisionId]);

  const refreshPlayers = useCallback(async (force = false) => {
    if (!opDivisionId) return;
    const q = force ? "&refresh=1" : "";
    const data = await fetchJson<{ players: OperatorPlayerRow[] }>(
      `/api/lms/operator/players?divisionId=${encodeURIComponent(opDivisionId)}${q}`,
    );
    setPlayers(data.players ?? []);
  }, [opDivisionId]);

  const refreshSchedule = useCallback(async (force = false) => {
    if (!opDivisionId) return;
    const q = force ? "&refresh=1" : "";
    const data = await fetchJson<{ matches: ScheduleMatch[] }>(
      `/api/lms/operator/schedule?divisionId=${encodeURIComponent(opDivisionId)}${q}`,
    );
    setSchedule(data.matches ?? []);
  }, [opDivisionId]);

  const refreshSettings = useCallback(async (divisionId: string, force = false) => {
    const q = force ? "&refresh=1" : "";
    const data = await fetchJson<{
      settings: Record<string, unknown>;
      templates: FormatTemplate[];
    }>(
      `/api/lms/operator/settings?divisionId=${encodeURIComponent(divisionId)}${q}`,
    );
    setSettings(data.settings);
    setTemplates(data.templates ?? []);
  }, []);

  const refreshAllOperatorData = useCallback(async () => {
    if (!opLeagueId && !opDivisionId) return;
    setBusy(true);
    setSectionError(null);
    try {
      await fetchJson("/api/lms/operator/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leagueId: opLeagueId || undefined,
          divisionId: opDivisionId || undefined,
        }),
      });
      await loadLeagues(true);
      await loadDivisions(true);
      if (opDivisionId) {
        await Promise.all([
          refreshHome(true),
          refreshLocations(true),
          refreshTeams(true),
          refreshPlayers(true),
          refreshSchedule(true),
          refreshSettings(opDivisionId, true),
        ]);
      }
      setNotice("Operator data refreshed from LMS.");
    } catch (error) {
      setSectionError(
        error instanceof Error ? error.message : "Refresh failed.",
      );
    } finally {
      setBusy(false);
    }
  }, [
    opLeagueId,
    opDivisionId,
    loadLeagues,
    loadDivisions,
    refreshHome,
    refreshLocations,
    refreshTeams,
    refreshPlayers,
    refreshSchedule,
    refreshSettings,
  ]);

  useEffect(() => {
    setListQuery("");
    setExpandedIds(new Set());
    setScreen({ type: "list" });
    setNotice(null);
    setSectionError(null);
  }, [subTab]);

  useEffect(() => {
    if (!user || !configured || !opDivisionId) return;
    if (subTab === "home" && screen.type === "list") void refreshHome();
  }, [user, configured, opDivisionId, subTab, screen.type, refreshHome]);

  useEffect(() => {
    if (!user || !configured || !opDivisionId) return;
    if (screen.type !== "list") return;
    if (!["teams", "players", "locations", "schedule", "settings"].includes(subTab))
      return;

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
        } else if (subTab === "settings") {
          await refreshSettings(opDivisionId);
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
    screen.type,
    refreshLocations,
    refreshTeams,
    refreshPlayers,
    refreshSchedule,
    refreshSettings,
  ]);

  const editSettingsDivisionId =
    screen.type === "edit-settings" ? screen.divisionId : null;

  useEffect(() => {
    if (!editSettingsDivisionId) return;
    let cancelled = false;
    setSectionLoading(true);
    setSettings(null);
    setSectionError(null);
    void (async () => {
      try {
        await refreshSettings(editSettingsDivisionId);
      } catch (error) {
        if (!cancelled) {
          setSectionError(
            error instanceof Error ? error.message : "Failed to load settings.",
          );
        }
      } finally {
        if (!cancelled) setSectionLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editSettingsDivisionId, refreshSettings]);

  useEffect(() => {
    if (screen.type !== "create-playoff" && subTab !== "playoff") return;
    if (!user || !configured || !opLeagueId) return;
    if (screen.type !== "create-playoff" && screen.type !== "list") return;
    if (subTab !== "playoff" && screen.type !== "create-playoff") return;

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
  }, [user, configured, opLeagueId, opLeagueName, subTab, screen]);

  const q = listQuery.trim().toLowerCase();
  const filteredTeams = useMemo(
    () =>
      teams.filter(
        (t) =>
          !q ||
          t.name.toLowerCase().includes(q) ||
          (t.locationName ?? "").toLowerCase().includes(q) ||
          t.players.some((p) => p.name.toLowerCase().includes(q)),
      ),
    [teams, q],
  );
  const filteredPlayers = useMemo(
    () =>
      players.filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          (p.location ?? "").toLowerCase().includes(q),
      ),
    [players, q],
  );
  const filteredLocations = useMemo(
    () =>
      locations.filter(
        (l) =>
          !q ||
          l.name.toLowerCase().includes(q) ||
          l.city.toLowerCase().includes(q) ||
          l.state.toLowerCase().includes(q),
      ),
    [locations, q],
  );
  const filteredDivisions = useMemo(
    () => divisions.filter((d) => !q || d.name.toLowerCase().includes(q)),
    [divisions, q],
  );
  const playoffList = useMemo(
    () =>
      divisions
        .filter((d) => isPlayoffName(d.name))
        .filter((d) => !q || d.name.toLowerCase().includes(q)),
    [divisions, q],
  );

  const scheduleByDate = useMemo(() => {
    const map = new Map<string, ScheduleMatch[]>();
    for (const match of schedule) {
      const key = toDateInput(match.date) || match.date;
      if (q) {
        const hay = `${match.homeTeamName} ${match.awayTeamName} ${match.location ?? ""} ${key}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      const list = map.get(key) ?? [];
      list.push(match);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [schedule, q]);

  const selectedPlayoffTeams = useMemo(() => {
    const out: PlayoffTeam[] = [];
    for (const division of playoffDivisions) {
      for (const team of division.teams) {
        if (selectedTeamIds.has(team.id)) out.push(team);
      }
    }
    return out;
  }, [playoffDivisions, selectedTeamIds]);

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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

  function capturePopupAnchor(event?: SyntheticEvent | null) {
    const target = event?.currentTarget;
    if (target instanceof HTMLElement) {
      setPopupAnchorY(target.getBoundingClientRect().top);
      return;
    }
    setPopupAnchorY(null);
  }

  function askConfirm(
    pending: PendingConfirm,
    event?: SyntheticEvent | null,
  ) {
    capturePopupAnchor(event);
    setPendingConfirm(pending);
  }

  function goList() {
    setScreen({ type: "list" });
    setPopupAnchorY(null);
    setLocationDraft(null);
    setTeamDraft(null);
    setPlayerDraft(null);
    setMatchDraft(null);
    setPlayerHits([]);
  }

  function openEditSettings(
    division: { id: string; name: string },
    event?: SyntheticEvent | null,
  ) {
    capturePopupAnchor(event);
    setNotice(null);
    setSectionError(null);
    setSettings(null);
    setSectionLoading(true);
    setOpDivisionId(division.id);
    setOpDivisionName(division.name);
    setScreen({ type: "edit-settings", divisionId: division.id });
  }

  async function openEditLocation(
    id: string | null,
    event?: SyntheticEvent | null,
  ) {
    capturePopupAnchor(event);
    if (id) {
      const loc = locations.find((l) => l.id === id);
      setLocationDraft(loc ? { ...loc } : emptyLocation(opDivisionId));
    } else {
      setLocationDraft(emptyLocation(opDivisionId));
    }
    setScreen({ type: "edit-location", id });
  }

  async function openEditTeam(
    id: string | null,
    event?: SyntheticEvent | null,
  ) {
    capturePopupAnchor(event);
    let locs = locations;
    if (!locs.length && opDivisionId) {
      const data = await fetchJson<{ locations: OperatorLocation[] }>(
        `/api/lms/operator/locations?divisionId=${encodeURIComponent(opDivisionId)}`,
      );
      locs = data.locations ?? [];
      setLocations(locs);
    }
    if (id) {
      const team = teams.find((t) => t.id === id);
      setTeamDraft(
        team
          ? {
              id: team.id,
              name: team.name,
              locationId: team.locationId ?? locs[0]?.id ?? "",
              isBye: team.isBye,
            }
          : { name: "", locationId: locs[0]?.id ?? "", isBye: false },
      );
    } else {
      setTeamDraft({
        name: "",
        locationId: locs[0]?.id ?? "",
        isBye: false,
      });
    }
    setScreen({ type: "edit-team", id });
  }

  async function openEditPlayer(
    id: string | null,
    event?: SyntheticEvent | null,
  ) {
    capturePopupAnchor(event);
    if (id) {
      setSectionLoading(true);
      try {
        const data = await fetchJson<{ player: OperatorPlayerDetail }>(
          `/api/lms/operator/players?playerId=${encodeURIComponent(id)}`,
        );
        setPlayerDraft(data.player);
        setScreen({ type: "edit-player", id });
      } catch (error) {
        setSectionError(
          error instanceof Error ? error.message : "Failed to load player.",
        );
      } finally {
        setSectionLoading(false);
      }
    } else {
      setPlayerDraft(emptyPlayerForm());
      setAssignTeamId(teams[0]?.id ?? "");
      setScreen({ type: "edit-player", id: null });
    }
  }

  function openEditMatch(
    match: ScheduleMatch | null,
    event?: SyntheticEvent | null,
  ) {
    capturePopupAnchor(event);
    if (match) {
      setMatchDraft({
        matchId: match.matchId,
        teamOneId: match.homeTeamId,
        teamTwoId: match.awayTeamId,
        date: toDateInput(match.date),
        locationId: match.locationId || locations[0]?.id || "",
      });
      setScreen({ type: "edit-match", matchId: match.matchId });
    } else {
      setMatchDraft({
        teamOneId: teams[0]?.id ?? "",
        teamTwoId: teams[1]?.id ?? "",
        date: genStart || toDateInput(new Date().toISOString()),
        locationId: locations[0]?.id ?? "",
      });
      setScreen({ type: "edit-match", matchId: null });
    }
  }

  if (authLoading) return <LoadingState label="Checking sign-in…" />;

  if (!user) {
    return (
      <section className="space-y-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-4">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
          League operator tools
        </h2>
        <p className="text-sm text-[var(--muted)]">
          Sign in to manage leagues, divisions, teams, players, locations, and
          schedules.
        </p>
        <button type="button" onClick={onRequestLogin} className={btnPrimary}>
          Sign in
        </button>
      </section>
    );
  }

  if (configured === false) {
    const accessDenied = Boolean(
      configError?.toLowerCase().includes("only available"),
    );
    return (
      <section className="space-y-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-4">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
          {accessDenied ? "LMS access restricted" : "Operator login not configured"}
        </h2>
        <p className="text-sm text-[var(--muted)]">
          {configError ||
            "Set LMS_OPERATOR_EMAIL and LMS_OPERATOR_PASSWORD on the server."}
        </p>
        {accessDenied ? (
          <button type="button" onClick={onRequestLogin} className={btnPrimary}>
            Sign in as League Operator
          </button>
        ) : null}
      </section>
    );
  }

  if (configured == null) {
    return <LoadingState label="Checking league operator…" />;
  }

  const needsDivision = ![
    "home",
    "playoff",
    "division",
  ].includes(subTab);

  /* ---------- Edit / create popup ---------- */
  const pageTitle =
    screen.type === "edit-location"
      ? screen.id
        ? "Edit location"
        : "Add location"
      : screen.type === "edit-team"
        ? screen.id
          ? "Edit team"
          : "Add team"
        : screen.type === "edit-player"
          ? screen.id
            ? "Edit player"
            : "Add player"
          : screen.type === "edit-match"
            ? screen.matchId
              ? "Edit match"
              : "Add match"
            : screen.type === "edit-settings"
              ? "Edit division"
              : screen.type === "create-division"
                ? "Add division"
                : screen.type === "create-playoff"
                  ? "Add playoff"
                  : "";

  const editPopup =
    screen.type === "list" ? null : (
      <div
        className="fixed inset-0 z-[80] overflow-y-auto bg-black/55"
        role="dialog"
        aria-modal="true"
        aria-label={pageTitle || "Edit"}
        onClick={(event) => {
          if (event.target === event.currentTarget) goList();
        }}
      >
        <div
          className="flex min-h-full justify-center px-3 pb-10"
          style={{ paddingTop: popupTopPad(popupAnchorY) }}
          onClick={(event) => {
            if (event.target === event.currentTarget) goList();
          }}
        >
        <div className="w-full max-w-lg rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
            <h2 className="min-w-0 flex-1 break-words font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--ink)]">
              {pageTitle}
            </h2>
            <button
              type="button"
              className={btnGhost}
              onClick={goList}
              aria-label="Close"
            >
              Close
            </button>
          </div>
          <div className="space-y-3 p-3 sm:p-4">
        {notice ? (
          <p className="text-sm font-medium text-[var(--felt)]">{notice}</p>
        ) : null}
        {sectionError ? (
          <p className="whitespace-pre-wrap text-sm text-[#b42318]">
            {sectionError}
          </p>
        ) : null}

        {screen.type === "edit-location" && locationDraft ? (
          <section className="space-y-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-3 sm:p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name">
                <input
                  className={inputClass}
                  value={locationDraft.name}
                  onChange={(e) =>
                    setLocationDraft({ ...locationDraft, name: e.target.value })
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
                    setLocationDraft({ ...locationDraft, city: e.target.value })
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
                  goList();
                  await refreshLocations();
                }, "Location saved.")
              }
            >
              Save
            </button>
          </section>
        ) : null}

        {screen.type === "edit-team" && teamDraft ? (
          <section className="space-y-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-3 sm:p-4">
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
            <button
              type="button"
              disabled={busy || !teamDraft.name.trim() || !teamDraft.locationId}
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
                  goList();
                  await refreshTeams();
                }, "Team saved.")
              }
            >
              Save
            </button>
          </section>
        ) : null}

        {screen.type === "edit-player" && playerDraft ? (
          <section className="space-y-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-3 sm:p-4">
            {!playerDraft.id ? (
              <div className="space-y-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] p-3">
                <p className="text-sm font-semibold">
                  Or assign an existing player
                </p>
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
                  <Field label="Search">
                    <input
                      className={inputClass}
                      value={playerSearch}
                      onChange={(e) => setPlayerSearch(e.target.value)}
                      placeholder="Min 3 characters"
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
                  Search LMS
                </button>
                {playerHits.length ? (
                  <ul className={accentRecordListClass}>
                    {playerHits.slice(0, 12).map((hit) => (
                      <AccentRecordCard key={hit.id}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">
                              {hit.lastName}, {hit.firstName}
                            </p>
                            <p className="text-xs text-[var(--muted)]">
                              #{hit.readableId}
                              {hit.effectiveRating
                                ? ` · ${hit.effectiveRating}`
                                : ""}
                            </p>
                          </div>
                          <button
                            type="button"
                            className={btnAdd}
                            disabled={busy || !assignTeamId}
                            onClick={() =>
                              void runAction(async () => {
                                await fetchJson("/api/lms/operator/players", {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    action: "assign",
                                    teamId: assignTeamId,
                                    readableId: hit.readableId,
                                  }),
                                });
                                goList();
                                await Promise.all([
                                  refreshTeams(),
                                  refreshPlayers(),
                                ]);
                              }, "Player assigned.")
                            }
                          >
                            + Add
                          </button>
                        </div>
                      </AccentRecordCard>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
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
                    setPlayerDraft({ ...playerDraft, email1: e.target.value })
                  }
                />
              </Field>
              <Field label="Phone">
                <input
                  className={inputClass}
                  value={playerDraft.phone1 ?? ""}
                  onChange={(e) =>
                    setPlayerDraft({ ...playerDraft, phone1: e.target.value })
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
                      ...teams.map((t) => ({ value: t.id, label: t.name })),
                    ]}
                    onChange={setAssignTeamId}
                  />
                </Field>
              ) : null}
            </div>
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
                  goList();
                  await Promise.all([refreshPlayers(), refreshTeams()]);
                }, "Player saved.")
              }
            >
              Save
            </button>
          </section>
        ) : null}

        {screen.type === "edit-match" && matchDraft ? (
          <section className="space-y-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-3 sm:p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Home">
                <SelectField
                  aria-label="Home team"
                  value={matchDraft.teamOneId}
                  options={teams.map((t) => ({ value: t.id, label: t.name }))}
                  onChange={(value) =>
                    setMatchDraft({ ...matchDraft, teamOneId: value })
                  }
                />
              </Field>
              <Field label="Away">
                <SelectField
                  aria-label="Away team"
                  value={matchDraft.teamTwoId}
                  options={teams.map((t) => ({ value: t.id, label: t.name }))}
                  onChange={(value) =>
                    setMatchDraft({ ...matchDraft, teamTwoId: value })
                  }
                />
              </Field>
              <Field label="Date">
                <DateField
                  aria-label="Match date"
                  value={matchDraft.date}
                  onChange={(value) =>
                    setMatchDraft({ ...matchDraft, date: value })
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
                  goList();
                  await refreshSchedule();
                }, "Match saved.")
              }
            >
              Save
            </button>
          </section>
        ) : null}

        {screen.type === "edit-settings" ? (
          sectionLoading || !settings ? (
            <LoadingState label="Loading settings…" />
          ) : (
            <section className="space-y-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-3 sm:p-4">
              <LmsDivisionSettingsForm
                settings={settings}
                templates={templates}
                busy={busy}
                onChange={setSettings}
                onSave={() =>
                  void runAction(async () => {
                    await fetchJson("/api/lms/operator/settings", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ settings }),
                    });
                    if (typeof settings.Name === "string") {
                      setOpDivisionName(settings.Name);
                      setDivisions((prev) =>
                        prev.map((d) =>
                          d.id === screen.divisionId
                            ? { ...d, name: String(settings.Name) }
                            : d,
                        ),
                      );
                    }
                    goList();
                    await loadDivisions();
                  }, "Settings saved.")
                }
              />
            </section>
          )
        ) : null}

        {screen.type === "create-division" ? (
          <section className="space-y-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-3 sm:p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Copy settings from">
                <SelectField
                  aria-label="Source division"
                  value={createSourceId || opDivisionId}
                  options={divisions.map((d) => ({
                    value: d.id,
                    label: d.name,
                  }))}
                  onChange={setCreateSourceId}
                />
              </Field>
              <Field label="New division name">
                <input
                  className={inputClass}
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
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
                  if (!e.target.checked) setIncludePlayersCopy(false);
                }}
                className="h-4 w-4 accent-[var(--felt)]"
              />
              Copy locations and teams
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includePlayersCopy}
                disabled={!includeTeams}
                onChange={(e) => setIncludePlayersCopy(e.target.checked)}
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
                !createName.trim() ||
                !opLeagueId
              }
              onClick={() =>
                void runAction(async () => {
                  await fetchJson("/api/lms/operator/division", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      leagueId: opLeagueId,
                      sourceDivisionId: createSourceId || opDivisionId,
                      name: createName.trim(),
                      description: createDescription.trim(),
                      includeTeams,
                      includePlayers: includePlayersCopy,
                    }),
                  });
                  setCreateName("");
                  goList();
                  await loadDivisions();
                }, "Division created.")
              }
            >
              Create division
            </button>
          </section>
        ) : null}

        {screen.type === "create-playoff" ? (
          <section className="space-y-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-3 sm:p-4">
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
              Selected:{" "}
              <span className="font-semibold text-[var(--ink)]">
                {selectedPlayoffTeams.length}
              </span>
            </p>
            {playoffLoading ? (
              <LoadingState label="Loading teams…" />
            ) : playoffError ? (
              <p className="text-sm text-[#b42318]">{playoffError}</p>
            ) : (
              <div className="space-y-2">
                {playoffDivisions.map((division) => {
                  const open = expandedIds.has(`pf-${division.name}`);
                  return (
                    <AccentRecordCard key={division.name}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 text-left"
                        onClick={() => toggleExpanded(`pf-${division.name}`)}
                      >
                        <span className="inline-flex shrink-0 items-center self-center text-[var(--muted)]">
                          <ChevronIcon open={open} className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1 text-sm font-semibold">
                          {division.name}
                        </span>
                        <span className="self-center text-xs text-[var(--muted)]">
                          {division.teams.length}
                        </span>
                      </button>
                      {open ? (
                        <ul className="mt-2 space-y-1.5 border-t border-[var(--line)] pt-2">
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
                      ) : null}
                    </AccentRecordCard>
                  );
                })}
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
                  await fetchJson("/api/lms/operator/playoff", {
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
                  goList();
                  await loadDivisions();
                }, "Playoff created.")
              }
            >
              Create playoff
            </button>
          </section>
        ) : null}

          </div>
        </div>
        </div>
      </div>
    );

  /* ---------- Main list chrome ---------- */
  return (
    <div className="space-y-3">
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

      <section className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]">
        <div className="border-b border-[var(--line)] bg-[var(--surface-2)] p-0.5">
          <IconSubTabs
            aria-label="LMS sections"
            items={subItems}
            value={subTab}
            onChange={setSubTab}
            columns={4}
            className="rounded-none border-0 bg-transparent p-0"
          />
        </div>

        <div className="space-y-3 p-3 sm:p-4">
      {notice ? (
        <p className="text-sm font-medium text-[var(--felt)]">{notice}</p>
      ) : null}
      {sectionError ? (
        <p className="whitespace-pre-wrap text-sm text-[#b42318]">
          {sectionError}
        </p>
      ) : null}

      {needsDivision && !opDivisionId ? (
        <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] p-4 text-sm text-[var(--muted)]">
          Choose a division above to manage this section. Division and Playoff
          lists work from the league alone.
        </div>
      ) : null}

      {subTab === "home" ? (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                Division home
              </p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                Upcoming and missed matches. Lists are cached for 24 hours; edits
                refresh automatically.
              </p>
            </div>
            <button
              type="button"
              className={`${btnPrimary} h-9 shrink-0 self-center px-3`}
              disabled={busy || homeLoading || (!opLeagueId && !opDivisionId)}
              onClick={() => void refreshAllOperatorData()}
            >
              {busy ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          {!opDivisionId ? (
            <p className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
              Choose a division above to see upcoming and missed matches.
            </p>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                {(
                  [
                    ["Upcoming", nextMatches, "No upcoming matches."],
                    ["Missed", missedMatches, "No missed matches."],
                  ] as const
                ).map(([title, rows, empty]) => (
                  <div key={title} className="space-y-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <h4 className="text-sm font-semibold">{title}</h4>
                      <span className="text-xs tabular-nums text-[var(--muted)]">
                        {homeLoading ? "…" : rows.length}
                      </span>
                    </div>
                    {homeLoading ? (
                      <p className="text-sm text-[var(--muted)]">Loading…</p>
                    ) : rows.length === 0 ? (
                      <p className="text-sm text-[var(--muted)]">{empty}</p>
                    ) : (
                      <ul className={accentRecordListClass}>
                        {rows.map((match) => (
                          <AccentRecordCard
                            key={
                              match.matchId ||
                              `${match.teamOne}-${match.teamTwo}`
                            }
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
                          </AccentRecordCard>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
              <a
                href={`${LMS_BASE}/Division/DivisionDetail?DivisionId=${encodeURIComponent(opDivisionId)}`}
                target="_blank"
                rel="noreferrer"
                className={btnGhost}
              >
                Open LMS
              </a>
            </>
          )}
        </section>
      ) : null}

      {subTab === "teams" && opDivisionId ? (
        <section className="space-y-3">
          <SectionHeader
            title="Teams"
            description="Create and edit teams, and manage who is on each roster."
            onAdd={(event) => void openEditTeam(null, event)}
          />
          <SearchField
            label="Search teams"
            placeholder="Search teams…"
            value={listQuery}
            onChange={setListQuery}
            embedded
          />
          {sectionLoading ? <LoadingState label="Loading teams…" /> : null}
          <ul className={accentRecordListClass}>
            {filteredTeams.map((team) => {
              const open = expandedIds.has(team.id);
              return (
                <AccentRecordCard key={team.id}>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-label={open ? "Collapse roster" : "Expand roster"}
                      className="inline-flex shrink-0 items-center self-center rounded p-1 text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
                      onClick={() => toggleExpanded(team.id)}
                    >
                      <ChevronIcon open={open} className="h-5 w-5" />
                    </button>
                    <div className="min-w-0 flex-1">
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
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        className={btnEdit}
                        onClick={(event) => void openEditTeam(team.id, event)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className={btnDelete}
                        disabled={busy}
                        onClick={(event) => {
                          askConfirm(
                            {
                              title: "Delete team",
                              body: `Delete team ${team.name}? This cannot be undone.`,
                              confirmLabel: "Delete",
                              onConfirm: async () => {
                                setPendingConfirm(null);
                                await runAction(async () => {
                                  await fetchJson(
                                    `/api/lms/operator/teams?teamId=${encodeURIComponent(team.id)}&divisionId=${encodeURIComponent(opDivisionId)}`,
                                    { method: "DELETE" },
                                  );
                                  await refreshTeams();
                                }, "Team deleted.");
                              },
                            },
                            event,
                          );
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  {open ? (
                    <ul className={`${accentRecordListClass} mt-3 border-t border-[var(--line)] pt-3`}>
                      {team.players.length === 0 ? (
                        <li className="text-sm text-[var(--muted)]">
                          No players on this roster.
                        </li>
                      ) : (
                        team.players.map((player) => (
                          <li key={player.id}>
                            <AccentRecordCard showRail={false}>
                              <div className="flex items-center justify-between gap-3">
                                <span className="min-w-0 flex-1 text-sm font-medium text-[var(--ink)]">
                                  {player.name}
                                </span>
                                <button
                                  type="button"
                                  className={btnRemove}
                                  disabled={busy}
                                  onClick={(event) => {
                                    askConfirm(
                                      {
                                        title: "Remove player",
                                        body: `Remove ${player.name} from ${team.name}?`,
                                        confirmLabel: "Remove",
                                        onConfirm: async () => {
                                          setPendingConfirm(null);
                                          await runAction(async () => {
                                            await fetchJson(
                                              "/api/lms/operator/players",
                                              {
                                                method: "POST",
                                                headers: {
                                                  "Content-Type":
                                                    "application/json",
                                                },
                                                body: JSON.stringify({
                                                  action: "remove",
                                                  teamId: team.id,
                                                  playerId: player.id,
                                                }),
                                              },
                                            );
                                            await refreshTeams();
                                          }, "Player removed.");
                                        },
                                      },
                                      event,
                                    );
                                  }}
                                >
                                  Remove
                                </button>
                              </div>
                            </AccentRecordCard>
                          </li>
                        ))
                      )}
                    </ul>
                  ) : null}
                </AccentRecordCard>
              );
            })}
          </ul>
        </section>
      ) : null}

      {subTab === "players" && opDivisionId ? (
        <section className="space-y-3">
          <SectionHeader
            title="Players"
            description="View, create, and edit player info."
            onAdd={(event) => void openEditPlayer(null, event)}
          />
          <SearchField
            label="Search players"
            placeholder="Search players…"
            value={listQuery}
            onChange={setListQuery}
            embedded
          />
          {sectionLoading ? <LoadingState label="Loading players…" /> : null}
          <ul className={accentRecordListClass}>
            {filteredPlayers.map((player) => (
              <AccentRecordCard key={player.id}>
                <div className="flex items-center justify-between gap-2">
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
                    className={btnEdit}
                    onClick={(event) => void openEditPlayer(player.id, event)}
                  >
                    Edit
                  </button>
                </div>
              </AccentRecordCard>
            ))}
          </ul>
        </section>
      ) : null}

      {subTab === "locations" && opDivisionId ? (
        <section className="space-y-3">
          <SectionHeader
            title="Locations"
            description="Add, edit, or delete venues."
            onAdd={(event) => void openEditLocation(null, event)}
          />
          <SearchField
            label="Search locations"
            placeholder="Search locations…"
            value={listQuery}
            onChange={setListQuery}
            embedded
          />
          {sectionLoading ? <LoadingState label="Loading locations…" /> : null}
          <ul className={accentRecordListClass}>
            {filteredLocations.map((loc) => (
              <AccentRecordCard key={loc.id}>
                <div className="flex items-center justify-between gap-2">
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
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      className={btnEdit}
                      onClick={(event) => void openEditLocation(loc.id, event)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className={btnDelete}
                      disabled={busy}
                      onClick={(event) => {
                        askConfirm(
                          {
                            title: "Delete location",
                            body: `Delete ${loc.name}? This cannot be undone.`,
                            confirmLabel: "Delete",
                            onConfirm: async () => {
                              setPendingConfirm(null);
                              await runAction(async () => {
                                await fetchJson(
                                  `/api/lms/operator/locations?locationId=${encodeURIComponent(loc.id)}&divisionId=${encodeURIComponent(opDivisionId)}`,
                                  { method: "DELETE" },
                                );
                                await refreshLocations();
                              }, "Location deleted.");
                            },
                          },
                          event,
                        );
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </AccentRecordCard>
            ))}
          </ul>
        </section>
      ) : null}

      {subTab === "schedule" && opDivisionId ? (
        <section className="space-y-3">
          <SectionHeader
            title="Schedule"
            description="Matches grouped by date."
            onAdd={(event) => openEditMatch(null, event)}
          />
          <SearchField
            label="Search schedule"
            placeholder="Search teams or dates…"
            value={listQuery}
            onChange={setListQuery}
            embedded
          />
          <div className="min-w-0 space-y-2 overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-3">
            <p className="text-sm font-semibold">Generate schedule</p>
            <div className="grid min-w-0 gap-3 sm:grid-cols-3">
              <Field label="Start date">
                <DateField
                  aria-label="Start date"
                  value={genStart}
                  onChange={setGenStart}
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
                onClick={(event) => {
                  askConfirm(
                    {
                      title: "Generate schedule",
                      body: "Regenerate the schedule? This replaces the current schedule in LMS.",
                      confirmLabel: "Generate",
                      tone: "primary",
                      onConfirm: async () => {
                        setPendingConfirm(null);
                        await runAction(async () => {
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
                      },
                    },
                    event,
                  );
                }}
              >
                Generate
              </button>
              <button
                type="button"
                className={btnDelete}
                disabled={busy}
                onClick={(event) => {
                  askConfirm(
                    {
                      title: "Clear schedule",
                      body: "Clear the entire schedule? This cannot be undone.",
                      confirmLabel: "Clear all",
                      onConfirm: async () => {
                        setPendingConfirm(null);
                        await runAction(async () => {
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
                      },
                    },
                    event,
                  );
                }}
              >
                Clear all
              </button>
            </div>
          </div>
          {sectionLoading ? <LoadingState label="Loading schedule…" /> : null}
          <ul className={accentRecordListClass}>
            {scheduleByDate.map(([date, matches]) => {
              const open = expandedIds.has(`date-${date}`);
              return (
                <AccentRecordCard key={date}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 text-left"
                    aria-expanded={open}
                    onClick={() => toggleExpanded(`date-${date}`)}
                  >
                    <span className="inline-flex shrink-0 items-center self-center text-[var(--muted)]">
                      <ChevronIcon open={open} className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[var(--ink)]">
                        {formatMatchDate(date)}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {matches.length} match
                        {matches.length === 1 ? "" : "es"}
                      </p>
                    </div>
                  </button>
                  {open ? (
                    <ul
                      className={`${accentRecordListClass} mt-3 border-t border-[var(--line)] pt-3`}
                    >
                      {matches.map((match) => (
                        <li
                          key={
                            match.matchId ||
                            `${match.homeTeamId}-${match.awayTeamId}-${match.date}`
                          }
                        >
                          <AccentRecordCard>
                            <p className="text-sm font-semibold text-[var(--ink)]">
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
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                <button
                                  type="button"
                                  className={btnEdit}
                                  onClick={(event) =>
                                    openEditMatch(match, event)
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
                                      await fetchJson(
                                        "/api/lms/operator/schedule",
                                        {
                                          method: "POST",
                                          headers: {
                                            "Content-Type": "application/json",
                                          },
                                          body: JSON.stringify({
                                            action: "flip",
                                            matchId: match.matchId,
                                          }),
                                        },
                                      );
                                      await refreshSchedule();
                                    }, "Home/away flipped.")
                                  }
                                >
                                  Flip
                                </button>
                                <button
                                  type="button"
                                  className={btnDelete}
                                  disabled={busy}
                                  onClick={(event) => {
                                    askConfirm(
                                      {
                                        title: "Delete match",
                                        body: `Delete ${match.homeTeamName} vs ${match.awayTeamName}?`,
                                        confirmLabel: "Delete",
                                        onConfirm: async () => {
                                          setPendingConfirm(null);
                                          await runAction(async () => {
                                            await fetchJson(
                                              "/api/lms/operator/schedule",
                                              {
                                                method: "POST",
                                                headers: {
                                                  "Content-Type":
                                                    "application/json",
                                                },
                                                body: JSON.stringify({
                                                  action: "delete",
                                                  matchId: match.matchId,
                                                }),
                                              },
                                            );
                                            await refreshSchedule();
                                          }, "Match deleted.");
                                        },
                                      },
                                      event,
                                    );
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            ) : null}
                          </AccentRecordCard>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </AccentRecordCard>
              );
            })}
          </ul>
          {!sectionLoading && scheduleByDate.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No matches scheduled.</p>
          ) : null}
        </section>
      ) : null}

      {subTab === "settings" && opDivisionId ? (
        <section className="space-y-3">
          <SectionHeader
            title="Division settings"
            description="Edit core fields and the match format for the selected division."
          />
          {sectionLoading || !settings ? (
            <LoadingState label="Loading settings…" />
          ) : (
            <ul className={accentRecordListClass}>
              <AccentRecordCard>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--ink)]">
                      {String(settings.Name ?? opDivisionName)}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      {String(settings.Description ?? "No description")} ·{" "}
                      {String(settings.NumberOfPlayers ?? "—")} players ·{" "}
                      {String(settings.NumberOfRounds ?? "—")} rounds
                    </p>
                  </div>
                  <button
                    type="button"
                    className={btnEdit}
                    onClick={(event) =>
                      openEditSettings(
                        {
                          id: opDivisionId,
                          name:
                            opDivisionName ||
                            String(settings.Name ?? "Division"),
                        },
                        event,
                      )
                    }
                  >
                    Edit
                  </button>
                </div>
              </AccentRecordCard>
            </ul>
          )}
        </section>
      ) : null}

      {subTab === "division" && opLeagueId ? (
        <section className="space-y-3">
          <SectionHeader
            title="Divisions"
            description="View and edit divisions in this league, or create a new one."
            onAdd={(event) => {
              capturePopupAnchor(event);
              setCreateSourceId(opDivisionId || divisions[0]?.id || "");
              setCreateName("");
              setCreateDescription("");
              setScreen({ type: "create-division" });
            }}
          />
          <SearchField
            label="Search divisions"
            placeholder="Search divisions…"
            value={listQuery}
            onChange={setListQuery}
            embedded
          />
          <ul className={accentRecordListClass}>
            {filteredDivisions.map((division) => (
              <AccentRecordCard key={division.id}>
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => {
                      setOpDivisionId(division.id);
                      setOpDivisionName(division.name);
                    }}
                  >
                    <p className="text-sm font-semibold text-[var(--ink)]">
                      {division.name}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      {division.id === opDivisionId
                        ? "Currently managing"
                        : "Tap name to manage"}
                    </p>
                  </button>
                  <button
                    type="button"
                    className={btnEdit}
                    onClick={(event) => openEditSettings(division, event)}
                  >
                    Edit
                  </button>
                </div>
              </AccentRecordCard>
            ))}
          </ul>
        </section>
      ) : null}

      {subTab === "playoff" && opLeagueId ? (
        <section className="space-y-3">
          <SectionHeader
            title="Playoffs"
            description="Playoff divisions in this league. Create a new playoff or edit settings."
            onAdd={(event) => {
              capturePopupAnchor(event);
              setSelectedTeamIds(new Set());
              setScreen({ type: "create-playoff" });
            }}
          />
          <SearchField
            label="Search playoffs"
            placeholder="Search playoffs…"
            value={listQuery}
            onChange={setListQuery}
            embedded
          />
          {playoffList.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              No playoff divisions found yet. Use + Add to create one.
            </p>
          ) : (
            <ul className={accentRecordListClass}>
              {playoffList.map((division) => (
                <AccentRecordCard key={division.id}>
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => {
                        setOpDivisionId(division.id);
                        setOpDivisionName(division.name);
                      }}
                    >
                      <p className="text-sm font-semibold text-[var(--ink)]">
                        {division.name}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {division.id === opDivisionId
                          ? "Currently managing"
                          : "Tap name to manage"}
                      </p>
                    </button>
                    <button
                      type="button"
                      className={btnEdit}
                      onClick={(event) => openEditSettings(division, event)}
                    >
                      Edit
                    </button>
                  </div>
                </AccentRecordCard>
              ))}
            </ul>
          )}
        </section>
      ) : null}
        </div>
      </section>

      {editPopup}
      {pendingConfirm ? (
        <OperatorConfirmDialog
          pending={pendingConfirm}
          busy={busy}
          anchorY={popupAnchorY}
          onCancel={() => setPendingConfirm(null)}
        />
      ) : null}
    </div>
  );
}
