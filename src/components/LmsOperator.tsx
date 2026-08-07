"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { LMS_BASE } from "@/lib/constants";
import type { DivisionSummary } from "@/lib/types";
import {
  IconSubTabs,
  OverviewSubIcon,
  type IconSubTabItem,
} from "./IconSubTabs";
import { LoadingState } from "./LoadingState";
import type { AuthUser } from "./LoginScreen";
import { SectionCard } from "./SectionCard";
import { SelectField } from "./SelectField";

type LmsSubTab = "dashboard" | "playoff" | "division";

type OperatorMatch = {
  matchId: string;
  teamOne: string;
  teamTwo: string;
  datePlayed: string | null;
  displayDate: string | null;
  location: string | null;
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

type LmsOperatorProps = {
  leagueId: string | null;
  leagueName: string | null;
  divisionId: string | null;
  divisionName: string | null;
  divisions: DivisionSummary[];
  user: AuthUser | null;
  authLoading: boolean;
  onRequestLogin: () => void;
  onRequestContext: () => void;
};

function DashboardIcon({ className }: { className?: string }) {
  return <OverviewSubIcon className={className} />;
}

function PlayoffIcon({ className }: { className?: string }) {
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
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M12 12v2" />
      <path d="M9 8h6" />
    </svg>
  );
}

function DivisionIcon({ className }: { className?: string }) {
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
      <path d="M12 3v18" />
      <path d="M5 8h14" />
      <path d="M7 12h10" />
      <path d="M9 16h6" />
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

function MatchList({
  title,
  empty,
  matches,
  loading,
}: {
  title: string;
  empty: string;
  matches: OperatorMatch[];
  loading: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--ink)]">
          {title}
        </h4>
        <span className="text-xs font-semibold tabular-nums text-[var(--muted)]">
          {loading ? "…" : matches.length}
        </span>
      </div>
      {loading ? (
        <p className="text-sm text-[var(--muted)]">Loading…</p>
      ) : matches.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">{empty}</p>
      ) : (
        <ul className="divide-y divide-[var(--line)] rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]">
          {matches.map((match) => (
            <li key={match.matchId || `${match.teamOne}-${match.teamTwo}`} className="px-3 py-2.5">
              <p className="text-sm font-semibold text-[var(--ink)]">
                {match.teamOne}{" "}
                <span className="font-medium text-[var(--muted)]">vs</span>{" "}
                {match.teamTwo}
              </p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                {formatMatchDate(match.displayDate ?? match.datePlayed)}
                {match.location ? ` · ${match.location}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
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

const inputClass =
  "w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none ring-[var(--felt)] focus:ring-2";

const SKILL_LEVELS = [
  { value: "Platinum", label: "Platinum" },
  { value: "Gold", label: "Gold" },
  { value: "Silver", label: "Silver" },
] as const;

export function LmsOperator({
  leagueId,
  leagueName,
  divisionId,
  divisionName,
  divisions,
  user,
  authLoading,
  onRequestLogin,
  onRequestContext,
}: LmsOperatorProps) {
  const [subTab, setSubTab] = useState<LmsSubTab>("dashboard");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  const [nextMatches, setNextMatches] = useState<OperatorMatch[]>([]);
  const [missedMatches, setMissedMatches] = useState<OperatorMatch[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchesError, setMatchesError] = useState<string | null>(null);

  const [playoffLoading, setPlayoffLoading] = useState(false);
  const [playoffError, setPlayoffError] = useState<string | null>(null);
  const [playoffName, setPlayoffName] = useState("");
  const [playoffSkill, setPlayoffSkill] = useState<string>("Gold");
  const [playoffDivisions, setPlayoffDivisions] = useState<PlayoffDivision[]>(
    [],
  );
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [playoffBusy, setPlayoffBusy] = useState(false);
  const [playoffResult, setPlayoffResult] = useState<string | null>(null);

  const [sourceDivisionId, setSourceDivisionId] = useState(divisionId ?? "");
  const [divisionNameInput, setDivisionNameInput] = useState("");
  const [divisionDescription, setDivisionDescription] = useState("");
  const [includeTeams, setIncludeTeams] = useState(true);
  const [includePlayers, setIncludePlayers] = useState(false);
  const [divisionBusy, setDivisionBusy] = useState(false);
  const [divisionError, setDivisionError] = useState<string | null>(null);
  const [divisionResult, setDivisionResult] = useState<string | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);

  const subItems: IconSubTabItem<LmsSubTab>[] = useMemo(
    () => [
      { id: "dashboard", label: "Home", icon: DashboardIcon },
      { id: "playoff", label: "Playoff", icon: PlayoffIcon },
      { id: "division", label: "Division", icon: DivisionIcon },
    ],
    [],
  );

  const selectedTeams = useMemo(() => {
    const teams: PlayoffTeam[] = [];
    for (const division of playoffDivisions) {
      for (const team of division.teams) {
        if (selectedTeamIds.has(team.id)) teams.push(team);
      }
    }
    return teams;
  }, [playoffDivisions, selectedTeamIds]);

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
            error instanceof Error ? error.message : "Could not check LO status.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  useEffect(() => {
    if (divisionId) setSourceDivisionId(divisionId);
  }, [divisionId]);

  useEffect(() => {
    if (!user || !configured || !divisionId || subTab !== "dashboard") return;
    let cancelled = false;
    setMatchesLoading(true);
    setMatchesError(null);
    void (async () => {
      try {
        const [next, missed] = await Promise.all([
          fetchJson<{ matches: OperatorMatch[] }>(
            `/api/lms/operator/matches?divisionId=${encodeURIComponent(divisionId)}&kind=next`,
          ),
          fetchJson<{ matches: OperatorMatch[] }>(
            `/api/lms/operator/matches?divisionId=${encodeURIComponent(divisionId)}&kind=missed`,
          ),
        ]);
        if (cancelled) return;
        setNextMatches(next.matches ?? []);
        setMissedMatches(missed.matches ?? []);
      } catch (error) {
        if (!cancelled) {
          setMatchesError(
            error instanceof Error ? error.message : "Failed to load matches.",
          );
        }
      } finally {
        if (!cancelled) setMatchesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, configured, divisionId, subTab]);

  useEffect(() => {
    if (!user || !configured || !leagueId || subTab !== "playoff") return;
    let cancelled = false;
    setPlayoffLoading(true);
    setPlayoffError(null);
    void (async () => {
      try {
        const data = await fetchJson<{
          leagueName: string;
          divisions: PlayoffDivision[];
        }>(
          `/api/lms/operator/playoff?leagueId=${encodeURIComponent(leagueId)}`,
        );
        if (cancelled) return;
        setPlayoffDivisions(data.divisions ?? []);
        if (!playoffName) {
          setPlayoffName(
            `${data.leagueName || leagueName || "League"} Playoffs`,
          );
        }
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
    // playoffName intentionally omitted — only seed once when empty
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, configured, leagueId, leagueName, subTab]);

  useEffect(() => {
    if (
      !user ||
      !configured ||
      !sourceDivisionId ||
      subTab !== "division"
    ) {
      return;
    }
    let cancelled = false;
    setSettingsLoading(true);
    setDivisionError(null);
    void (async () => {
      try {
        const data = await fetchJson<{
          name: string | null;
          description: string | null;
        }>(
          `/api/lms/operator/division?divisionId=${encodeURIComponent(sourceDivisionId)}`,
        );
        if (cancelled) return;
        const sourceName = data.name?.trim() || "Division";
        setDivisionNameInput((current) =>
          current.trim() ? current : `${sourceName} (new)`,
        );
        setDivisionDescription((current) =>
          current.trim() ? current : data.description?.trim() || "",
        );
      } catch (error) {
        if (!cancelled) {
          setDivisionError(
            error instanceof Error
              ? error.message
              : "Failed to load source division.",
          );
        }
      } finally {
        if (!cancelled) setSettingsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, configured, sourceDivisionId, subTab]);

  function toggleTeam(teamId: string) {
    setSelectedTeamIds((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  }

  function toggleDivisionTeams(division: PlayoffDivision, selectAll: boolean) {
    setSelectedTeamIds((prev) => {
      const next = new Set(prev);
      for (const team of division.teams) {
        if (selectAll) next.add(team.id);
        else next.delete(team.id);
      }
      return next;
    });
  }

  async function createPlayoff() {
    if (!leagueId) return;
    setPlayoffBusy(true);
    setPlayoffResult(null);
    setPlayoffError(null);
    try {
      const result = await fetchJson<{
        ok: boolean;
        message?: string | null;
        redirectUrl?: string | null;
      }>("/api/lms/operator/playoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leagueId,
          name: playoffName.trim(),
          skillLevel: playoffSkill,
          selectedTeams,
        }),
      });
      setPlayoffResult(
        result.redirectUrl
          ? `Playoff created. Open in LMS: ${LMS_BASE}${result.redirectUrl.startsWith("/") ? result.redirectUrl : `/${result.redirectUrl}`}`
          : result.message || "Playoff created.",
      );
      setSelectedTeamIds(new Set());
    } catch (error) {
      setPlayoffError(
        error instanceof Error ? error.message : "Playoff creation failed.",
      );
    } finally {
      setPlayoffBusy(false);
    }
  }

  async function createDivision() {
    if (!leagueId || !sourceDivisionId) return;
    setDivisionBusy(true);
    setDivisionResult(null);
    setDivisionError(null);
    try {
      const result = await fetchJson<{
        ok: boolean;
        messages?: string[];
        redirectUrl?: string | null;
      }>("/api/lms/operator/division", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leagueId,
          sourceDivisionId,
          name: divisionNameInput.trim(),
          description: divisionDescription.trim(),
          includeTeams,
          includePlayers,
        }),
      });
      setDivisionResult(
        result.redirectUrl
          ? `Division created. Open in LMS: ${LMS_BASE}${result.redirectUrl.startsWith("/") ? result.redirectUrl : `/${result.redirectUrl}`}`
          : "Division created.",
      );
    } catch (error) {
      setDivisionError(
        error instanceof Error ? error.message : "Division creation failed.",
      );
    } finally {
      setDivisionBusy(false);
    }
  }

  if (authLoading) {
    return <LoadingState label="Checking sign-in…" />;
  }

  if (!user) {
    return (
      <SectionCard
        eyebrow="LMS"
        title="League operator tools"
        description="Sign in to use upcoming/missed matches, create playoffs, and create divisions."
      >
        <button
          type="button"
          onClick={onRequestLogin}
          className="rounded-[var(--radius)] bg-[var(--felt)] px-4 py-2.5 text-sm font-semibold text-white"
        >
          Sign in
        </button>
      </SectionCard>
    );
  }

  if (configured === false) {
    return (
      <SectionCard
        eyebrow="LMS"
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
          className="inline-flex rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold text-[var(--ink)]"
        >
          Open LMS
        </a>
      </SectionCard>
    );
  }

  if (configured == null) {
    return <LoadingState label="Checking league operator…" />;
  }

  if (!leagueId) {
    return (
      <SectionCard
        eyebrow="LMS"
        title="Choose a league"
        description="Pick a league in context before using operator tools."
      >
        <button
          type="button"
          onClick={onRequestContext}
          className="rounded-[var(--radius)] bg-[var(--felt)] px-4 py-2.5 text-sm font-semibold text-white"
        >
          Choose league
        </button>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-4">
      <SectionCard
        eyebrow="LMS"
        title={leagueName || "League operator"}
        description="Operator dashboard for upcoming/missed matches, playoffs, and new divisions."
        badge={
          divisionName
            ? { label: "Division", value: String(divisionName).slice(0, 18) }
            : undefined
        }
      >
        <IconSubTabs
          aria-label="LMS operator sections"
          items={subItems}
          value={subTab}
          onChange={setSubTab}
          columns={3}
        />
      </SectionCard>

      {subTab === "dashboard" ? (
        !divisionId ? (
          <SectionCard
            eyebrow="Dashboard"
            title="Choose a division"
            description="Upcoming and missed matches use the selected division."
          >
            <button
              type="button"
              onClick={onRequestContext}
              className="rounded-[var(--radius)] bg-[var(--felt)] px-4 py-2.5 text-sm font-semibold text-white"
            >
              Choose division
            </button>
          </SectionCard>
        ) : (
          <section className="space-y-5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-3 sm:p-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSubTab("playoff")}
                className="rounded-[var(--radius)] bg-[var(--felt)] px-3 py-2 text-sm font-semibold text-white"
              >
                Create playoff
              </button>
              <button
                type="button"
                onClick={() => setSubTab("division")}
                className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm font-semibold text-[var(--ink)]"
              >
                Create division
              </button>
              <a
                href={`${LMS_BASE}/Division/DivisionDetail?DivisionId=${encodeURIComponent(divisionId)}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-[var(--radius)] border border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--ink)]"
              >
                Open in LMS
              </a>
            </div>
            {matchesError ? (
              <p className="text-sm text-[var(--danger,#b42318)]">{matchesError}</p>
            ) : null}
            <div className="grid gap-5 lg:grid-cols-2">
              <MatchList
                title="Upcoming matches"
                empty="No upcoming matches."
                matches={nextMatches}
                loading={matchesLoading}
              />
              <MatchList
                title="Missed matches"
                empty="No missed matches."
                matches={missedMatches}
                loading={matchesLoading}
              />
            </div>
          </section>
        )
      ) : null}

      {subTab === "playoff" ? (
        <section className="space-y-4 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-3 sm:p-4">
          <div>
            <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--ink)]">
              Create playoff
            </h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Same flow as LMS Create Playoff — name, skill level, and teams from
              this league.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Playoff name">
              <input
                className={inputClass}
                value={playoffName}
                onChange={(e) => setPlayoffName(e.target.value)}
                placeholder="e.g. Thursday Paradise Playoffs"
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
              {selectedTeams.length}
            </span>
          </p>

          {playoffLoading ? (
            <LoadingState label="Loading teams…" />
          ) : playoffError ? (
            <p className="text-sm text-[var(--danger,#b42318)]">{playoffError}</p>
          ) : (
            <div className="space-y-3">
              {playoffDivisions.map((division) => {
                const allSelected =
                  division.teams.length > 0 &&
                  division.teams.every((t) => selectedTeamIds.has(t.id));
                return (
                  <details
                    key={division.name}
                    className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] open:bg-[var(--surface)]"
                    open={
                      Boolean(divisionId) &&
                      division.teams.some((t) => t.divisionId === divisionId)
                    }
                  >
                    <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-semibold text-[var(--ink)] [&::-webkit-details-marker]:hidden">
                      <div className="flex items-center justify-between gap-2">
                        <span>{division.name}</span>
                        <span className="text-xs font-medium text-[var(--muted)]">
                          {division.teams.length} teams
                        </span>
                      </div>
                    </summary>
                    <div className="space-y-2 border-t border-[var(--line)] px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() =>
                          toggleDivisionTeams(division, !allSelected)
                        }
                        className="text-xs font-semibold text-[var(--felt)]"
                      >
                        {allSelected ? "Clear division" : "Select all"}
                      </button>
                      <ul className="space-y-1.5">
                        {division.teams.map((team) => {
                          const checked = selectedTeamIds.has(team.id);
                          return (
                            <li key={team.id}>
                              <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--ink)]">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleTeam(team.id)}
                                  className="h-4 w-4 accent-[var(--felt)]"
                                />
                                <span>{team.name}</span>
                                <span className="text-xs text-[var(--muted)]">
                                  ({team.numberOfPlayers})
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </details>
                );
              })}
            </div>
          )}

          {playoffResult ? (
            <p className="text-sm text-[var(--felt)]">{playoffResult}</p>
          ) : null}

          <button
            type="button"
            disabled={
              playoffBusy ||
              playoffLoading ||
              !playoffName.trim() ||
              selectedTeams.length < 2
            }
            onClick={() => void createPlayoff()}
            className="rounded-[var(--radius)] bg-[var(--felt)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {playoffBusy ? "Creating…" : "Create playoff"}
          </button>
        </section>
      ) : null}

      {subTab === "division" ? (
        <section className="space-y-4 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-3 sm:p-4">
          <div>
            <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--ink)]">
              Create division
            </h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Copy settings from an existing division (LMS Create Division
              wizard shortcut). Schedule starts empty — add it in LMS after
              create.
            </p>
          </div>

          <Field label="Copy settings from">
            <SelectField
              aria-label="Source division"
              value={sourceDivisionId}
              options={
                divisions.length > 0
                  ? divisions.map((d) => ({
                      value: d.id,
                      label: d.name,
                    }))
                  : sourceDivisionId
                    ? [
                        {
                          value: sourceDivisionId,
                          label: divisionName || "Current division",
                        },
                      ]
                    : []
              }
              onChange={(value) => {
                setSourceDivisionId(value);
                setDivisionNameInput("");
                setDivisionDescription("");
                setDivisionResult(null);
              }}
              placeholder="Choose division…"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="New division name">
              <input
                className={inputClass}
                value={divisionNameInput}
                onChange={(e) => setDivisionNameInput(e.target.value)}
                placeholder="e.g. Thursday - Paradise (2026.3)"
              />
            </Field>
            <Field label="Description">
              <input
                className={inputClass}
                value={divisionDescription}
                onChange={(e) => setDivisionDescription(e.target.value)}
                placeholder="Optional"
              />
            </Field>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-[var(--ink)]">
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
            <label className="flex items-center gap-2 text-sm text-[var(--ink)]">
              <input
                type="checkbox"
                checked={includePlayers}
                disabled={!includeTeams}
                onChange={(e) => setIncludePlayers(e.target.checked)}
                className="h-4 w-4 accent-[var(--felt)]"
              />
              Copy player rosters onto those teams
            </label>
          </div>

          {settingsLoading ? (
            <p className="text-sm text-[var(--muted)]">Loading source settings…</p>
          ) : null}
          {divisionError ? (
            <p className="whitespace-pre-wrap text-sm text-[var(--danger,#b42318)]">
              {divisionError}
            </p>
          ) : null}
          {divisionResult ? (
            <p className="text-sm text-[var(--felt)]">{divisionResult}</p>
          ) : null}

          <button
            type="button"
            disabled={
              divisionBusy ||
              settingsLoading ||
              !sourceDivisionId ||
              !divisionNameInput.trim()
            }
            onClick={() => void createDivision()}
            className="rounded-[var(--radius)] bg-[var(--felt)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {divisionBusy ? "Creating…" : "Create division"}
          </button>
        </section>
      ) : null}
    </div>
  );
}
