"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  LEAGUE_SCORING_FORMATS,
  getScoringFormat,
  inferScoringFormatFromDivisionName,
} from "@/lib/scoring-formats";
import type {
  DivisionSummary,
  LeagueSummary,
  MembershipSnapshot,
  MembershipTeam,
  PlayerSearchResult,
  UserPreferences,
} from "@/lib/types";
import type { AuthUser } from "./LoginScreen";
import { LoadingState } from "./LoadingState";
import { SelectField } from "./SelectField";
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
  onUserUpdate?: (user: AuthUser) => void;
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
  onUserUpdate,
}: SettingsScreenProps) {
  const [leagueId, setLeagueId] = useState(prefs.leagueId);
  const [divisionId, setDivisionId] = useState(prefs.divisionId);
  const [teamId, setTeamId] = useState(prefs.teamId);
  const [scoringFormatId, setScoringFormatId] = useState<string>(
    prefs.scoringFormatId ?? "auto",
  );
  const [status, setStatus] = useState<string | null>(null);
  const [leagueQuery, setLeagueQuery] = useState(
    prefs.leagueName.split(" ").slice(0, 2).join(" ") || "Palm Beach",
  );
  const [publicLeagues, setPublicLeagues] = useState<LeagueSummary[]>([]);
  const [loadingLeagues, setLoadingLeagues] = useState(false);
  const [linkProvider, setLinkProvider] = useState<
    null | "fargo" | "digital-pool" | "operator"
  >(null);
  const [linkEmail, setLinkEmail] = useState("");
  const [linkPassword, setLinkPassword] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [viewAsQuery, setViewAsQuery] = useState("");
  const [viewAsResults, setViewAsResults] = useState<PlayerSearchResult[]>([]);
  const [viewAsLoading, setViewAsLoading] = useState(false);
  const [viewAsError, setViewAsError] = useState<string | null>(null);
  const [viewAsBusy, setViewAsBusy] = useState(false);

  const fargoLinked = Boolean(user.fargoLinked ?? user.lmsId);
  const digitalPoolLinked = Boolean(user.digitalPoolLinked);
  const stripeLinked = Boolean(user.stripeLinked);
  const stripeChargesEnabled = Boolean(user.stripeChargesEnabled);
  const operatorLinked = Boolean(user.leagueOperator);
  const scoringReady = Boolean(user.scoringReady ?? user.lmsId);
  const canImpersonate = Boolean(user.canImpersonate);
  const impersonating = Boolean(user.impersonating);
  const showViewAs = canImpersonate || impersonating;

  const refreshStripeStatus = async () => {
    const response = await fetch("/api/auth/link/stripe");
    const payload = (await response.json().catch(() => null)) as {
      user?: AuthUser;
      error?: string;
    } | null;
    if (!response.ok || !payload?.user) {
      throw new Error(payload?.error || "Could not refresh Stripe status.");
    }
    onUserUpdate?.(payload.user);
    return payload.user;
  };

  const connectStripe = async () => {
    setLinkBusy(true);
    setLinkError(null);
    setStatus(null);
    try {
      const response = await fetch("/api/auth/link/stripe", { method: "POST" });
      const payload = (await response.json().catch(() => null)) as {
        url?: string;
        user?: AuthUser;
        error?: string;
      } | null;
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error || "Could not start Stripe Connect.");
      }
      if (payload.user) onUserUpdate?.(payload.user);
      setStatus("Redirecting to Stripe…");
      window.location.assign(payload.url);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not start Stripe Connect.";
      setLinkError(message);
      setStatus(null);
      setLinkBusy(false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const stripe = params.get("stripe");
    if (stripe !== "return" && stripe !== "refresh") return;

    let cancelled = false;
    setLinkBusy(true);
    setLinkError(null);
    void (async () => {
      try {
        const next = await refreshStripeStatus();
        if (cancelled) return;
        setStatus(
          next.stripeChargesEnabled
            ? "Stripe connected — ready for tournament entry fees."
            : stripe === "refresh"
              ? "Stripe setup incomplete — continue connecting to finish."
              : "Stripe linked — finish any remaining steps if payouts aren’t ready yet.",
        );
      } catch (err) {
        if (!cancelled) {
          setLinkError(
            err instanceof Error
              ? err.message
              : "Could not refresh Stripe status.",
          );
        }
      } finally {
        if (!cancelled) setLinkBusy(false);
      }
    })();

    params.delete("stripe");
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`,
    );

    return () => {
      cancelled = true;
    };
    // Run once on mount when returning from Stripe Connect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (!user.lmsId) {
      setStatus("Connect FargoRate before saving Score defaults.");
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
      scoringFormatId:
        scoringFormatId === "auto" ? null : scoringFormatId,
    };
    onSave(next);
    setStatus("Defaults saved.");
  };

  const submitLink = async (event: FormEvent) => {
    event.preventDefault();
    if (!linkProvider) return;
    setLinkBusy(true);
    setLinkError(null);
    try {
      const endpoint =
        linkProvider === "fargo"
          ? "/api/auth/link/fargo"
          : linkProvider === "operator"
            ? "/api/auth/link/operator"
            : "/api/auth/link/digital-pool";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: linkEmail,
          password: linkPassword,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        user?: AuthUser;
        error?: string;
      } | null;
      if (!response.ok || !payload?.user) {
        throw new Error(payload?.error || "Could not link account.");
      }
      onUserUpdate?.(payload.user);
      setLinkProvider(null);
      setLinkEmail("");
      setLinkPassword("");
      setStatus(
        linkProvider === "fargo"
          ? "FargoRate connected."
          : linkProvider === "operator"
            ? "League Operator connected."
            : "Digital Pool connected.",
      );
      if (linkProvider === "fargo") onRefreshMembership();
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "Could not link.");
    } finally {
      setLinkBusy(false);
    }
  };

  useEffect(() => {
    if (!canImpersonate) return;
    const q = viewAsQuery.trim();
    if (q.length < 2) {
      setViewAsResults([]);
      setViewAsLoading(false);
      setViewAsError(null);
      return;
    }
    let cancelled = false;
    setViewAsLoading(true);
    setViewAsError(null);
    const timer = window.setTimeout(() => {
      void fetch(`/api/players/search?q=${encodeURIComponent(q)}`)
        .then(async (response) => {
          const payload = (await response.json().catch(() => null)) as {
            players?: PlayerSearchResult[];
            error?: string;
          } | null;
          if (cancelled) return;
          if (!response.ok) {
            throw new Error(payload?.error || "Player search failed.");
          }
          setViewAsResults(payload?.players ?? []);
        })
        .catch((err) => {
          if (cancelled) return;
          setViewAsResults([]);
          setViewAsError(
            err instanceof Error ? err.message : "Player search failed.",
          );
        })
        .finally(() => {
          if (!cancelled) setViewAsLoading(false);
        });
    }, 320);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [canImpersonate, viewAsQuery]);

  const startViewAs = async (player: PlayerSearchResult) => {
    setViewAsBusy(true);
    setViewAsError(null);
    setStatus(null);
    try {
      const name = [player.firstName, player.lastName]
        .map((part) => part.trim())
        .filter(Boolean)
        .join(" ");
      const response = await fetch("/api/auth/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lmsId: player.id,
          name: name || player.name || null,
          readableId: player.readableId,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        user?: AuthUser;
        error?: string;
      } | null;
      if (!response.ok || !payload?.user) {
        throw new Error(payload?.error || "Could not start view-as.");
      }
      onUserUpdate?.(payload.user);
      setViewAsQuery("");
      setViewAsResults([]);
      setStatus(`Viewing as ${payload.user.name ?? "player"}.`);
      onRefreshMembership();
    } catch (err) {
      setViewAsError(
        err instanceof Error ? err.message : "Could not start view-as.",
      );
    } finally {
      setViewAsBusy(false);
    }
  };

  const stopViewAs = async () => {
    setViewAsBusy(true);
    setViewAsError(null);
    setStatus(null);
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
      onUserUpdate?.(payload.user);
      setStatus("Back to your account.");
      onRefreshMembership();
    } catch (err) {
      setViewAsError(
        err instanceof Error ? err.message : "Could not exit view-as.",
      );
    } finally {
      setViewAsBusy(false);
    }
  };

  const unlink = async (
    provider: "fargo" | "digital-pool" | "operator" | "stripe",
  ) => {
    setLinkBusy(true);
    setLinkError(null);
    try {
      const response = await fetch("/api/auth/unlink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const payload = (await response.json().catch(() => null)) as {
        user?: AuthUser;
        error?: string;
      } | null;
      if (!response.ok || !payload?.user) {
        throw new Error(payload?.error || "Could not unlink account.");
      }
      onUserUpdate?.(payload.user);
      setStatus(
        provider === "fargo"
          ? "FargoRate disconnected."
          : provider === "operator"
            ? "League Operator disconnected."
            : provider === "stripe"
              ? "Stripe disconnected."
              : "Digital Pool disconnected.",
      );
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "Could not unlink.");
    } finally {
      setLinkBusy(false);
    }
  };

  return (
    <section className="animate-rise mx-auto max-w-2xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--amber)]">
            Account
          </p>
          <h2 className="mt-1 font-[family-name:var(--font-display)] text-3xl text-[var(--felt-deep)]">
            Your defaults
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Signed in as{" "}
            <span className="font-medium text-[var(--ink)]">
              {impersonating
                ? `${user.name ?? "Player"} (view-as)`
                : (user.name ?? user.email ?? "Player")}
            </span>
            {impersonating && user.actor ? (
              <>
                {" "}
                · real account{" "}
                <span className="font-medium text-[var(--ink)]">
                  {user.actor.name ?? user.actor.email ?? "you"}
                </span>
              </>
            ) : null}
            . Connect FargoRate for Score, League Operator for Manage,
            Digital Pool for brackets, and Stripe for tournament entry fees.
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

      {showViewAs ? (
        <div className="space-y-3 rounded-[var(--radius)] border border-[var(--felt)]/35 bg-[color-mix(in_srgb,var(--felt)_8%,var(--surface))] p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--felt-deep)]">
                Superadmin · View as player
              </p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                See another player’s Score / team context. Shared draft sync
                still works; LMS submit is blocked until you exit.
              </p>
            </div>
            {impersonating ? (
              <button
                type="button"
                disabled={viewAsBusy}
                onClick={() => void stopViewAs()}
                className="rounded-[var(--radius)] bg-[var(--felt)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                {viewAsBusy ? "Working…" : "Exit view-as"}
              </button>
            ) : null}
          </div>

          {impersonating ? (
            <p className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]">
              Viewing as{" "}
              <span className="font-semibold">
                {user.name ?? "player"}
              </span>
              {user.readableId ? (
                <span className="text-[var(--muted)]">
                  {" "}
                  · #{user.readableId}
                </span>
              ) : null}
            </p>
          ) : (
            <div className="space-y-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                  Find player
                </span>
                <input
                  type="search"
                  value={viewAsQuery}
                  onChange={(event) => setViewAsQuery(event.target.value)}
                  placeholder="Name…"
                  className="w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:ring-2 focus:ring-[var(--felt-soft)]"
                />
              </label>
              {viewAsLoading ? (
                <p className="text-xs text-[var(--muted)]">Searching…</p>
              ) : null}
              {viewAsResults.length > 0 ? (
                <ul className="max-h-56 space-y-1 overflow-y-auto">
                  {viewAsResults.slice(0, 8).map((player) => {
                    const name = [player.firstName, player.lastName]
                      .map((part) => part.trim())
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <li key={player.id}>
                        <button
                          type="button"
                          disabled={viewAsBusy}
                          onClick={() => void startViewAs(player)}
                          className="flex w-full items-center justify-between gap-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-left text-sm transition hover:border-[var(--felt)]/40 hover:bg-[color-mix(in_srgb,var(--felt)_6%,var(--surface))] disabled:opacity-50"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-[var(--ink)]">
                              {name || player.name || "Unknown"}
                            </span>
                            <span className="block truncate text-[11px] text-[var(--muted)]">
                              {player.rating != null
                                ? `Fargo ${player.rating}`
                                : "Unrated"}
                              {player.location ? ` · ${player.location}` : ""}
                            </span>
                          </span>
                          <span className="shrink-0 text-xs font-semibold text-[var(--felt-deep)]">
                            View as
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          )}
          {viewAsError ? (
            <p className="text-xs font-medium text-[var(--danger)]">
              {viewAsError}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-4 md:p-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            Connected accounts
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            FargoRate unlocks Score. League Operator uses a separate LMS web
            login. Digital Pool is for bracket push. Stripe receives tournament
            entry fees for events you organize.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)]/60 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--ink)]">
                FargoRate
              </p>
              <p className="truncate text-xs text-[var(--muted)]">
                {fargoLinked
                  ? scoringReady
                    ? "Connected · Score ready"
                    : "Linked · reconnect for Score"
                  : "Required for Score"}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
              {fargoLinked && !scoringReady ? (
                <button
                  type="button"
                  disabled={linkBusy}
                  onClick={() => {
                    setLinkProvider("fargo");
                    setLinkError(null);
                  }}
                  className="rounded-[var(--radius)] bg-[var(--felt)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Reconnect
                </button>
              ) : null}
              {fargoLinked ? (
                <button
                  type="button"
                  disabled={linkBusy}
                  onClick={() => void unlink("fargo")}
                  className="rounded-[var(--radius)] bg-[#b42318] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Disconnect
                </button>
              ) : (
                <button
                  type="button"
                  disabled={linkBusy}
                  onClick={() => {
                    setLinkProvider("fargo");
                    setLinkError(null);
                  }}
                  className="rounded-[var(--radius)] bg-[var(--felt)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Connect
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)]/60 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--ink)]">
                League Operator
              </p>
              <p className="truncate text-xs text-[var(--muted)]">
                {operatorLinked
                  ? "Connected · Manage unlocked"
                  : "Separate LMS web login"}
              </p>
            </div>
            <div className="flex shrink-0 justify-end">
              {operatorLinked ? (
                <button
                  type="button"
                  disabled={linkBusy}
                  onClick={() => void unlink("operator")}
                  className="rounded-[var(--radius)] bg-[#b42318] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Disconnect
                </button>
              ) : (
                <button
                  type="button"
                  disabled={linkBusy}
                  onClick={() => {
                    setLinkProvider("operator");
                    setLinkError(null);
                  }}
                  className="rounded-[var(--radius)] bg-[var(--felt)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Connect
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)]/60 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--ink)]">
                Digital Pool
              </p>
              <p className="truncate text-xs text-[var(--muted)]">
                {digitalPoolLinked ? "Connected" : "Optional · brackets"}
              </p>
            </div>
            <div className="flex shrink-0 justify-end">
              {digitalPoolLinked ? (
                <button
                  type="button"
                  disabled={linkBusy}
                  onClick={() => void unlink("digital-pool")}
                  className="rounded-[var(--radius)] bg-[#b42318] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Disconnect
                </button>
              ) : (
                <button
                  type="button"
                  disabled={linkBusy}
                  onClick={() => {
                    setLinkProvider("digital-pool");
                    setLinkError(null);
                  }}
                  className="rounded-[var(--radius)] bg-[var(--felt)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Connect
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)]/60 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--ink)]">Stripe</p>
              <p className="truncate text-xs text-[var(--muted)]">
                {stripeChargesEnabled
                  ? "Connected · ready for entry fees"
                  : stripeLinked
                    ? "Linked · finish setup to accept payments"
                    : "Optional · tournament payouts"}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
              {stripeLinked && !stripeChargesEnabled ? (
                <button
                  type="button"
                  disabled={linkBusy}
                  onClick={() => void connectStripe()}
                  className="rounded-[var(--radius)] bg-[var(--felt)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Continue
                </button>
              ) : null}
              {stripeLinked ? (
                <button
                  type="button"
                  disabled={linkBusy}
                  onClick={() => void unlink("stripe")}
                  className="rounded-[var(--radius)] bg-[#b42318] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Disconnect
                </button>
              ) : (
                <button
                  type="button"
                  disabled={linkBusy}
                  onClick={() => void connectStripe()}
                  className="rounded-[var(--radius)] bg-[var(--felt)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Connect
                </button>
              )}
            </div>
          </div>
        </div>

        {linkError && !linkProvider ? (
          <p className="text-sm text-[var(--danger)]">{linkError}</p>
        ) : null}

        {linkProvider ? (
          <form onSubmit={submitLink} className="space-y-3 border-t border-[var(--line)] pt-3">
            <p className="text-sm font-semibold text-[var(--ink)]">
              {linkProvider === "fargo"
                ? "Connect FargoRate"
                : linkProvider === "operator"
                  ? "Connect League Operator"
                  : "Connect Digital Pool"}
            </p>
            {linkProvider === "operator" ? (
              <p className="text-xs text-[var(--muted)]">
                Use your LMS website League Operator email and password
                (lms.fargorate.com) — not your FargoRate player login.
              </p>
            ) : null}
            <label className="block space-y-1">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                Email
              </span>
              <input
                type="email"
                required
                autoComplete="username"
                value={linkEmail}
                onChange={(e) => setLinkEmail(e.target.value)}
                className="w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 text-sm outline-none ring-[var(--felt)] focus:ring-2"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                Password
              </span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={linkPassword}
                onChange={(e) => setLinkPassword(e.target.value)}
                className="w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 text-sm outline-none ring-[var(--felt)] focus:ring-2"
              />
            </label>
            {linkError ? (
              <p className="text-sm text-[var(--danger)]">{linkError}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={linkBusy}
                className="rounded-full bg-[var(--felt)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {linkBusy ? "Connecting…" : "Save connection"}
              </button>
              <button
                type="button"
                disabled={linkBusy}
                onClick={() => {
                  setLinkProvider(null);
                  setLinkError(null);
                }}
                className="rounded-full border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--muted)]"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}
      </div>

      {!fargoLinked ? (
        <p className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)]/60 px-4 py-3 text-sm text-[var(--muted)]">
          Connect FargoRate above to set Score defaults and load your teams.
        </p>
      ) : loadingMembership ? (
        <LoadingState label="Finding your leagues, divisions, and teams…" />
      ) : membershipError ? (
        <div className="space-y-3 rounded-[var(--radius)] border border-[var(--danger)]/30 bg-[var(--danger-bg)] px-4 py-3 text-sm text-[var(--danger)]">
          <p>{membershipError}</p>
          <button
            type="button"
            onClick={onRefreshMembership}
            className="rounded-full bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)]"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="space-y-4 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-4 md:p-5">
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
            <p className="text-sm text-[var(--muted)]">
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

          <div className="space-y-1.5">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              Scoring format
            </span>
            <SelectField
              aria-label="League night scoring format"
              value={scoringFormatId}
              onChange={(value) => {
                setScoringFormatId(value);
                setStatus(null);
              }}
              options={[
                {
                  value: "auto",
                  label: "Auto (division + scoresheet)",
                },
                ...LEAGUE_SCORING_FORMATS.map((format) => ({
                  value: format.id,
                  label: format.label,
                })),
              ]}
            />
            <p className="text-[11px] leading-snug text-[var(--muted)]">
              {scoringFormatId === "auto"
                ? `${inferScoringFormatFromDivisionName(
                    selectedDivision?.name ?? prefs.divisionName,
                  ).description} LMS scoresheet setup (players, race vs points, match-win round) can refine this when you open a match.`
                : getScoringFormat(scoringFormatId).description}
            </p>
          </div>

          {status ? (
            <p className="text-sm text-[var(--felt-deep)]">{status}</p>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={save}
              disabled={!membership?.teams.length}
              className="rounded-[var(--radius)] bg-[var(--felt)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              Save defaults
            </button>
            <button
              type="button"
              onClick={onRefreshMembership}
              className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-4 py-3 text-sm font-semibold text-[var(--muted)]"
            >
              Refresh my teams
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onSignOut}
        className="rounded-[var(--radius)] border border-[var(--danger)]/35 bg-[var(--danger-bg)] px-4 py-3 text-sm font-semibold text-[var(--danger)]"
      >
        Sign out
      </button>
    </section>
  );
}
