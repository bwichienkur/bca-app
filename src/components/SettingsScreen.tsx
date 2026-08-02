"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  DivisionSummary,
  LeagueSummary,
  MembershipSnapshot,
  MembershipTeam,
  UserPreferences,
} from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
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
  const [leagueQuery, setLeagueQuery] = useState(
    prefs.leagueName.split(" ").slice(0, 2).join(" ") || "Palm Beach",
  );
  const [publicLeagues, setPublicLeagues] = useState<LeagueSummary[]>([]);
  const [loadingLeagues, setLoadingLeagues] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const handle = window.setTimeout(async () => {
      setLoadingLeagues(true);
      try {
        const response = await fetch(
          `/api/leagues?q=${encodeURIComponent(leagueQuery)}`,
          { signal: controller.signal },
        );
        if (!response.ok) return;
        const data = (await response.json()) as { leagues: LeagueSummary[] };
        if (!controller.signal.aborted) setPublicLeagues(data.leagues);
      } catch {
        // Ignore aborted / network errors while typing.
      } finally {
        if (!controller.signal.aborted) setLoadingLeagues(false);
      }
    }, 220);
    return () => {
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [leagueQuery]);

  const leagues = useMemo(() => {
    const byId = new Map<string, LeagueSummary>();
    for (const league of publicLeagues) byId.set(league.id, league);
    for (const league of membership?.leagues ?? []) byId.set(league.id, league);
    return Array.from(byId.values());
  }, [membership?.leagues, publicLeagues]);
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
    leagues.find((league) => league.id === leagueId) ??
    publicLeagues.find((league) => league.id === leagueId) ??
    null;
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
    <section className="animate-rise mx-auto max-w-2xl space-y-8">
      <PageHeader
        eyebrow="Settings"
        title="Your defaults"
        description={
          <>
            Signed in as{" "}
            <span className="font-medium text-[var(--ink)]">
              {user.name ?? user.email ?? "Player"}
            </span>
            . Defaults apply when you open Tableside and limit Score to your
            team.
          </>
        }
        actions={
          <Button type="button" variant="secondary" onClick={onClose}>
            Done
          </Button>
        }
      />

      {loadingMembership ? (
        <LoadingState label="Finding your leagues, divisions, and teams…" />
      ) : membershipError ? (
        <Card className="space-y-3 border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[var(--danger-bg)] p-5">
          <p className="text-sm text-[var(--danger)]">{membershipError}</p>
          <Button type="button" variant="secondary" onClick={onRefreshMembership}>
            Try again
          </Button>
        </Card>
      ) : (
        <Card className="space-y-6 p-5 md:p-6">
          <SectionHeader
            eyebrow="Context"
            title="League & team"
            description="These defaults filter reports and unlock scoring for your team."
          />

          <div className="space-y-4">
            <Typeahead
              label="Default league"
              placeholder={
                loadingLeagues ? "Searching leagues…" : "Your leagues"
              }
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
              onQueryChange={
                membership?.leagues.length ? undefined : setLeagueQuery
              }
              onChange={(option) => {
                setLeagueId(option?.value.id ?? "");
                setDivisionId(null);
                setTeamId(null);
                setStatus(null);
              }}
            />

            {!membership?.teams.length ? (
              <p className="text-sm leading-relaxed text-[var(--muted)]">
                No active-session teams were found for your LMS player id. Tap
                Refresh my teams, or browse public reports without Score
                filters.
              </p>
            ) : (
              <>
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
                    const nextDivisionId = option?.value.id ?? null;
                    setDivisionId(nextDivisionId);
                    const soleTeam =
                      (membership?.teams ?? []).find(
                        (team) => team.divisionId === nextDivisionId,
                      ) ?? null;
                    setTeamId(soleTeam?.teamId ?? null);
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
              </>
            )}
          </div>

          {status ? (
            <p className="text-sm text-[var(--chalk)]">{status}</p>
          ) : null}

          <div className="flex flex-wrap gap-2 border-t border-[var(--line)] pt-5">
            <Button
              type="button"
              onClick={save}
              disabled={!membership?.teams.length}
            >
              Save defaults
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={onRefreshMembership}
            >
              Refresh my teams
            </Button>
          </div>
        </Card>
      )}

      <Card className="p-5 md:p-6">
        <SectionHeader
          eyebrow="Account"
          title="Session"
          description="Sign out to clear scoring access on this device."
        />
        <div className="mt-5">
          <Button type="button" variant="danger" onClick={onSignOut}>
            Sign out
          </Button>
        </div>
      </Card>
    </section>
  );
}
