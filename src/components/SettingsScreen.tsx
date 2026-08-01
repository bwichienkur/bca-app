"use client";

import { useMemo, useState } from "react";
import type {
  DivisionSummary,
  LeagueSummary,
  MembershipSnapshot,
  MembershipTeam,
  UserPreferences,
} from "@/lib/types";
import type { AuthUser } from "./LoginScreen";
import { LoadingState } from "./LoadingState";
import { Typeahead, type TypeaheadOption } from "./Typeahead";

type SettingsScreenProps = {
  user: AuthUser;
  prefs: UserPreferences;
  membership: MembershipSnapshot | null;
  loadingMembership: boolean;
  membershipError: string | null;
  onSave: (next: UserPreferences) => void;
  onRefreshMembership: () => void;
  onSignOut: () => void;
  onClose: () => void;
};

export function SettingsScreen({
  user,
  prefs,
  membership,
  loadingMembership,
  membershipError,
  onSave,
  onRefreshMembership,
  onSignOut,
  onClose,
}: SettingsScreenProps) {
  const [leagueId, setLeagueId] = useState(prefs.leagueId);
  const [divisionId, setDivisionId] = useState(prefs.divisionId);
  const [teamId, setTeamId] = useState(prefs.teamId);
  const [status, setStatus] = useState<string | null>(null);

  const leagues = membership?.leagues ?? [];
  const divisions = useMemo(
    () =>
      (membership?.divisions ?? []).filter(
        (division) => division.leagueId === leagueId,
      ),
    [membership?.divisions, leagueId],
  );
  const teams = useMemo(
    () =>
      (membership?.teams ?? []).filter(
        (team) =>
          team.leagueId === leagueId &&
          (!divisionId || team.divisionId === divisionId),
      ),
    [membership?.teams, leagueId, divisionId],
  );

  const selectedLeague =
    leagues.find((league) => league.id === leagueId) ?? null;
  const selectedDivision =
    divisions.find((division) => division.id === divisionId) ?? null;
  const selectedTeam =
    teams.find((team) => team.teamId === teamId) ?? null;

  const leagueOptions: TypeaheadOption<LeagueSummary>[] = leagues.map(
    (league) => ({
      id: league.id,
      label: league.name,
      meta: `${league.state} · ${league.divisionCount} divisions`,
      value: league,
    }),
  );

  const divisionOptions: TypeaheadOption<DivisionSummary>[] = divisions.map(
    (division) => ({
      id: division.id,
      label: division.name,
      meta: `${division.year}`,
      value: division,
    }),
  );

  const teamOptions: TypeaheadOption<MembershipTeam>[] = teams.map((team) => ({
    id: team.teamId,
    label: team.teamName,
    meta: team.divisionName,
    value: team,
  }));

  const save = () => {
    if (!selectedLeague) {
      setStatus("Choose a league from your memberships.");
      return;
    }
    const next: UserPreferences = {
      ...prefs,
      leagueId: selectedLeague.id,
      leagueName: selectedLeague.name,
      divisionId: selectedDivision?.id ?? null,
      divisionName: selectedDivision?.name ?? null,
      teamId: selectedTeam?.teamId ?? null,
      teamName: selectedTeam?.teamName ?? null,
      playerId: user.lmsId,
      playerName: user.name,
    };
    onSave(next);
    setStatus("Defaults saved.");
  };

  return (
    <section className="animate-rise mx-auto max-w-2xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--amber)]">
            Settings
          </p>
          <h2 className="mt-1 font-[family-name:var(--font-display)] text-3xl text-[var(--felt-deep)]">
            Your defaults
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Signed in as{" "}
            <span className="font-medium text-[var(--ink)]">
              {user.name ?? user.email ?? "Player"}
            </span>
            . Defaults apply when you open Tableside and limit Score to your
            team.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)]"
        >
          Done
        </button>
      </div>

      {loadingMembership ? (
        <LoadingState label="Finding your leagues and teams…" />
      ) : membershipError ? (
        <div className="space-y-3 rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger-bg)] px-4 py-3 text-sm text-[var(--danger)]">
          <p>{membershipError}</p>
          <button
            type="button"
            onClick={onRefreshMembership}
            className="rounded-full bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)]"
          >
            Try again
          </button>
        </div>
      ) : !membership?.teams.length ? (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-5 text-sm text-[var(--muted)]">
          No recent-season team memberships were found for your LMS player id.
          You can still browse public reports without Score filters.
          <button
            type="button"
            onClick={onRefreshMembership}
            className="mt-3 block rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)]"
          >
            Rescan memberships
          </button>
        </div>
      ) : (
        <div className="space-y-4 rounded-[1.4rem] border border-[var(--line)] bg-[var(--surface)] p-4 md:p-5">
          <Typeahead
            label="Default league"
            placeholder="Your leagues"
            value={
              selectedLeague
                ? {
                    id: selectedLeague.id,
                    label: selectedLeague.name,
                    meta: `${selectedLeague.state}`,
                    value: selectedLeague,
                  }
                : null
            }
            options={leagueOptions}
            onChange={(option) => {
              setLeagueId(option?.value.id ?? "");
              setDivisionId(null);
              setTeamId(null);
              setStatus(null);
            }}
          />
          <Typeahead
            label="Default division"
            placeholder={
              selectedLeague ? "Your divisions" : "Pick a league first"
            }
            disabled={!selectedLeague}
            value={
              selectedDivision
                ? {
                    id: selectedDivision.id,
                    label: selectedDivision.name,
                    meta: selectedDivision.year,
                    value: selectedDivision,
                  }
                : null
            }
            options={divisionOptions}
            onChange={(option) => {
              setDivisionId(option?.value.id ?? null);
              setTeamId(null);
              setStatus(null);
            }}
          />
          <Typeahead
            label="Default team"
            placeholder={
              selectedDivision ? "Your teams" : "Pick a division first"
            }
            disabled={!selectedDivision}
            value={
              selectedTeam
                ? {
                    id: selectedTeam.teamId,
                    label: selectedTeam.teamName,
                    meta: selectedTeam.divisionName,
                    value: selectedTeam,
                  }
                : null
            }
            options={teamOptions}
            onChange={(option) => {
              setTeamId(option?.value.teamId ?? null);
              setStatus(null);
            }}
          />

          {status ? (
            <p className="text-sm text-[var(--felt-deep)]">{status}</p>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={save}
              className="rounded-xl bg-[var(--felt)] px-4 py-3 text-sm font-semibold text-white"
            >
              Save defaults
            </button>
            <button
              type="button"
              onClick={onRefreshMembership}
              className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-4 py-3 text-sm font-semibold text-[var(--muted)]"
            >
              Rescan memberships
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onSignOut}
        className="rounded-xl border border-[var(--danger)]/35 bg-[var(--danger-bg)] px-4 py-3 text-sm font-semibold text-[var(--danger)]"
      >
        Sign out
      </button>
    </section>
  );
}
