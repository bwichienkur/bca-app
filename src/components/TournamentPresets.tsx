"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  BRACKET_FORMAT_OPTIONS,
  BREAK_FORMAT_OPTIONS,
  CREATE_STATUS_OPTIONS,
  defaultTeamSize,
  DRAW_TYPE_OPTIONS,
  EVENT_TYPE_OPTIONS,
  FL_REGIONS,
  formatEntryFee,
  GAME_TYPE_OPTIONS,
  HANDICAP_SYSTEM_OPTIONS,
  maxEntriesLabel,
  MIN_ROBUSTNESS_OPTIONS,
  PAY_METHOD_OPTIONS,
  REGISTRATION_MODE_OPTIONS,
  RULESET_OPTIONS,
  TABLE_SIZE_OPTIONS,
  UNRATED_POLICY_OPTIONS,
} from "@/lib/tournaments/options";
import type {
  EventType,
  TournamentEntryTeam,
  TournamentEntryTeamMember,
  TournamentTemplate,
  TournamentTemplateForm,
} from "@/lib/tournaments/types";
import { EmptyState } from "./EmptyState";
import { LoadingState } from "./LoadingState";
import {
  PartnerSearchField,
  type PartnerPick,
} from "./PartnerSearchField";
import { SelectField } from "./SelectField";

const fieldClass =
  "w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:ring-2 focus:ring-[var(--felt-soft)]";
const labelClass =
  "mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]";

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="block min-w-0">
      <span className={labelClass}>{label}</span>
      {children}
    </div>
  );
}

function emptyPartner(): PartnerPick {
  return {
    displayName: "",
    ratingAtSignup: null,
    fargoPlayerId: null,
    readableId: null,
  };
}

function emptyTemplateForm(): TournamentTemplateForm {
  return {
    title: "",
    description: "",
    gameType: "9-ball",
    eventType: "singles",
    bracketFormat: "double-elimination",
    breakFormat: "winner-break",
    drawType: "seeded",
    handicapSystem: "fargo-medium",
    handicapNotes: "",
    rulesetPreset: "bca",
    winnersRaceTo: 7,
    losersRaceTo: 5,
    maxFargo: null,
    minRobustnessStatus: null,
    unratedPolicy: "message-organizer",
    maxPlayers: 32,
    teamSize: 1,
    entryFeeCents: 2000,
    addedMoneyCents: 0,
    payMethod: "door",
    venmoHandle: null,
    zelleHandle: null,
    cashAppHandle: null,
    payoutNotes: "",
    registrationMode: "approval",
    reportedToFargo: false,
    tableSize: "9ft",
    venueName: "",
    venueAddress: "",
    city: "",
    region: "Palm Beach",
    organizerPhone: null,
    status: "open",
  };
}

function kindLabel(kind: TournamentEntryTeam["kind"]): string {
  return kind === "scotch-doubles" ? "Scotch doubles" : "Teams";
}

/** Captain + teammate Fargo total (only rated players). */
function teamFargoTotal(
  captainFargo: number | null | undefined,
  members: Array<{ ratingAtSignup: number | null }>,
): { sum: number; ratedCount: number } {
  const ratings = [
    captainFargo,
    ...members.map((m) => m.ratingAtSignup),
  ].filter((n): n is number => n != null && Number.isFinite(n));
  return {
    sum: ratings.reduce((acc, n) => acc + n, 0),
    ratedCount: ratings.length,
  };
}

function templateSummary(form: TournamentTemplateForm): string {
  const game =
    GAME_TYPE_OPTIONS.find((o) => o.value === form.gameType)?.label ??
    form.gameType;
  const event =
    EVENT_TYPE_OPTIONS.find((o) => o.value === form.eventType)?.label ??
    form.eventType;
  const venue = [form.venueName, form.city].filter(Boolean).join(", ");
  return [
    game,
    event,
    formatEntryFee(form.entryFeeCents),
    venue || null,
  ]
    .filter(Boolean)
    .join(" · ");
}

type SignInGateProps = {
  title: string;
  body: string;
  onRequestLogin: () => void;
};

function SignInGate({ title, body, onRequestLogin }: SignInGateProps) {
  return (
    <EmptyState
      title={title}
      body={body}
      action={
        <button
          type="button"
          onClick={onRequestLogin}
          className="rounded-[var(--radius)] bg-[var(--felt)] px-4 py-2.5 text-sm font-semibold text-white"
        >
          Sign in
        </button>
      }
    />
  );
}

/* ─── Entry teams (pairs / teams) ─── */

type EntryTeamsPresetsPanelProps = {
  signedIn: boolean;
  authLoading: boolean;
  captainLabel: string;
  captainFargo: number | null;
  onRequestLogin: () => void;
};

export function EntryTeamsPresetsPanel({
  signedIn,
  authLoading,
  captainLabel,
  captainFargo,
  onRequestLogin,
}: EntryTeamsPresetsPanelProps) {
  const [teams, setTeams] = useState<TournamentEntryTeam[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] =
    useState<TournamentEntryTeam["kind"]>("scotch-doubles");
  const [members, setMembers] = useState<PartnerPick[]>([emptyPartner()]);

  const loadTeams = useCallback(async () => {
    if (!signedIn) {
      setTeams([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tournaments/entry-teams");
      const data = (await res.json()) as {
        teams?: TournamentEntryTeam[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Failed to load teams.");
      setTeams(data.teams ?? []);
    } catch (err) {
      setTeams([]);
      setError(err instanceof Error ? err.message : "Failed to load teams.");
    } finally {
      setLoading(false);
    }
  }, [signedIn]);

  useEffect(() => {
    if (signedIn) void loadTeams();
  }, [loadTeams, signedIn]);

  const resetComposer = () => {
    setEditingId(null);
    setComposing(false);
    setName("");
    setKind("scotch-doubles");
    setMembers([emptyPartner()]);
    setMsg(null);
  };

  const startCreate = () => {
    setEditingId(null);
    setComposing(true);
    setName("");
    setKind("scotch-doubles");
    setMembers([emptyPartner()]);
    setMsg(null);
  };

  const startEdit = (team: TournamentEntryTeam) => {
    setEditingId(team.id);
    setComposing(true);
    setName(team.name);
    setKind(team.kind);
    setMembers(
      team.members.length > 0
        ? team.members.map((m) => ({ ...m }))
        : [emptyPartner()],
    );
    setMsg(null);
  };

  const onSave = async () => {
    if (!signedIn) {
      onRequestLogin();
      return;
    }
    const trimmed = name.trim();
    const nextMembers: TournamentEntryTeamMember[] = members
      .map((mate) => ({
        displayName: mate.displayName.trim(),
        ratingAtSignup: mate.ratingAtSignup,
        fargoPlayerId: mate.fargoPlayerId,
        readableId: mate.readableId,
      }))
      .filter((mate) => mate.displayName);
    if (!trimmed) {
      setMsg(
        kind === "scotch-doubles"
          ? "Name this pair before saving."
          : "Name this team before saving.",
      );
      return;
    }
    if (nextMembers.length < 1) {
      setMsg(
        kind === "scotch-doubles"
          ? "Add a partner before saving."
          : "Add at least one teammate before saving.",
      );
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/tournaments/entry-teams", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId || undefined,
          name: trimmed,
          kind,
          members:
            kind === "scotch-doubles" ? nextMembers.slice(0, 1) : nextMembers,
        }),
      });
      const data = (await res.json()) as {
        teams?: TournamentEntryTeam[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Failed to save team.");
      setTeams(data.teams ?? []);
      setMsg(`Saved “${trimmed}”.`);
      setComposing(false);
      setEditingId(null);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed to save team.");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (teamId: string) => {
    if (!signedIn) return;
    const current = teams.find((item) => item.id === teamId);
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(
        `/api/tournaments/entry-teams?id=${encodeURIComponent(teamId)}`,
        { method: "DELETE" },
      );
      const data = (await res.json()) as {
        teams?: TournamentEntryTeam[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Failed to delete team.");
      setTeams(data.teams ?? []);
      if (editingId === teamId) resetComposer();
      setMsg(current ? `Deleted “${current.name}”.` : "Team deleted.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed to delete team.");
    } finally {
      setBusy(false);
    }
  };

  if (!signedIn && !authLoading) {
    return (
      <SignInGate
        title="Sign in to manage teams"
        body="Save scotch doubles pairs and team lineups to reuse when you enter events."
        onRequestLogin={onRequestLogin}
      />
    );
  }

  const compactFieldClass =
    "w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:ring-2 focus:ring-[var(--felt-soft)]";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            Entry teams
          </p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            You stay captain · reuse on event Entry
          </p>
        </div>
        {!composing ? (
          <button
            type="button"
            onClick={startCreate}
            className="rounded-[var(--radius)] bg-[var(--felt)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--felt-soft)]"
          >
            + New
          </button>
        ) : null}
      </div>

      {msg ? (
        <p className="text-xs text-[var(--felt-deep)]">{msg}</p>
      ) : null}
      {error ? (
        <p className="rounded-[var(--radius)] border border-[var(--danger)]/40 bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      {composing ? (
        <div className="space-y-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)]/50 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              {editingId ? "Edit team" : "New team"}
            </p>
            <p className="truncate text-[11px] text-[var(--muted)]">
              Cap{" "}
              <span className="font-semibold text-[var(--ink)]">
                {captainLabel}
                {captainFargo != null ? ` · ${captainFargo}` : ""}
              </span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0">
              <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                Kind
              </span>
              <SelectField
                aria-label="Team kind"
                value={kind}
                options={[
                  { value: "scotch-doubles", label: "Scotch doubles" },
                  { value: "teams", label: "Teams" },
                ]}
                buttonClassName="bg-[var(--surface)] !px-2.5 !py-1.5"
                onChange={(next) => {
                  const value = next as TournamentEntryTeam["kind"];
                  setKind(value);
                  setMembers((prev) =>
                    value === "scotch-doubles"
                      ? [prev[0] ?? emptyPartner()]
                      : prev.length > 0
                        ? prev
                        : [emptyPartner()],
                  );
                }}
              />
            </div>
            <div className="min-w-0">
              <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                {kind === "scotch-doubles" ? "Pair name" : "Team name"}
              </span>
              <input
                className={compactFieldClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={
                  kind === "scotch-doubles" ? "e.g. Smith / Lee" : "Team name"
                }
              />
            </div>
          </div>

          <ul className="divide-y divide-[var(--line)] overflow-visible rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)]">
            {members.map((mate, index) => {
              const slotLabel =
                kind === "scotch-doubles" ? "Partner" : `T${index + 1}`;
              return (
                <li
                  key={`preset-mate-${index}`}
                  className="flex min-w-0 items-center gap-1.5 px-2 py-1.5"
                >
                  <span className="w-12 shrink-0 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                    {slotLabel}
                  </span>
                  <PartnerSearchField
                    compact
                    hideLabel
                    label={
                      kind === "scotch-doubles"
                        ? "Partner"
                        : `Teammate ${index + 1}`
                    }
                    value={mate}
                    onChange={(next) =>
                      setMembers((prev) =>
                        prev.map((row, i) => (i === index ? next : row)),
                      )
                    }
                    placeholder="Name or Fargo ID…"
                  />
                  {kind === "teams" && members.length > 1 ? (
                    <button
                      type="button"
                      aria-label={`Remove teammate ${index + 1}`}
                      onClick={() =>
                        setMembers((prev) =>
                          prev.filter((_, i) => i !== index),
                        )
                      }
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius)] text-[var(--muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--ink)]"
                    >
                      ×
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {(() => {
            const { sum, ratedCount } = teamFargoTotal(captainFargo, members);
            if (ratedCount === 0) return null;
            return (
              <div className="flex items-baseline justify-between gap-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                  Team Fargo
                </p>
                <p className="text-sm font-semibold tabular-nums text-[var(--ink)]">
                  {sum.toLocaleString()}
                  <span className="ml-1.5 text-[11px] font-medium text-[var(--muted)]">
                    · {ratedCount} rated
                  </span>
                </p>
              </div>
            );
          })()}

          <div className="flex flex-wrap items-center gap-1.5">
            {kind === "teams" ? (
              <button
                type="button"
                onClick={() =>
                  setMembers((prev) => [...prev, emptyPartner()])
                }
                className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ink)]"
              >
                + Teammate
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => void onSave()}
              className="rounded-[var(--radius)] bg-[var(--felt)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Saving…" : editingId ? "Update" : "Save"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={resetComposer}
              className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--muted)]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <LoadingState label="Loading saved teams…" />
      ) : teams.length === 0 && !composing ? (
        <EmptyState
          title="No saved teams yet"
          body="Create a pair or team here, then load it from an event’s Entry tab when you sign up."
          action={
            <button
              type="button"
              onClick={startCreate}
              className="rounded-[var(--radius)] bg-[var(--felt)] px-4 py-2.5 text-sm font-semibold text-white"
            >
              + New team
            </button>
          }
        />
      ) : teams.length > 0 ? (
        <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)]/30">
          {teams.map((team) => {
            const mateSum = team.members
              .map((m) => m.ratingAtSignup)
              .filter((n): n is number => n != null)
              .reduce((acc, n) => acc + n, 0);
            const mateRated = team.members.filter(
              (m) => m.ratingAtSignup != null,
            ).length;
            return (
            <li
              key={team.id}
              className="flex min-w-0 items-center gap-2 px-2.5 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--ink)]">
                  {team.name}
                  {mateRated > 0 ? (
                    <span className="ml-1.5 text-[11px] font-semibold tabular-nums text-[var(--felt-deep)]">
                      Σ {mateSum.toLocaleString()}
                    </span>
                  ) : null}
                </p>
                <p className="truncate text-[11px] text-[var(--muted)]">
                  {kindLabel(team.kind)} ·{" "}
                  {team.members
                    .map(
                      (m) =>
                        `${m.displayName}${
                          m.ratingAtSignup != null
                            ? ` ${m.ratingAtSignup}`
                            : ""
                        }`,
                    )
                    .join(", ")}
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => startEdit(team)}
                className="shrink-0 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-[11px] font-semibold text-[var(--ink)] disabled:opacity-50"
              >
                Edit
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onDelete(team.id)}
                className="shrink-0 rounded-[var(--radius)] px-1.5 py-1 text-[11px] font-semibold text-[var(--muted)] disabled:opacity-50"
              >
                Del
              </button>
            </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

/* ─── Create-event templates ─── */

type TemplatesPresetsPanelProps = {
  signedIn: boolean;
  authLoading: boolean;
  onRequestLogin: () => void;
  onUseTemplate: (template: TournamentTemplate) => void;
};

export function TemplatesPresetsPanel({
  signedIn,
  authLoading,
  onRequestLogin,
  onUseTemplate,
}: TemplatesPresetsPanelProps) {
  const [templates, setTemplates] = useState<TournamentTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [form, setForm] = useState<TournamentTemplateForm>(emptyTemplateForm);

  const loadTemplates = useCallback(async () => {
    if (!signedIn) {
      setTemplates([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tournaments/templates");
      const data = (await res.json()) as {
        templates?: TournamentTemplate[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Failed to load templates.");
      setTemplates(data.templates ?? []);
    } catch (err) {
      setTemplates([]);
      setError(
        err instanceof Error ? err.message : "Failed to load templates.",
      );
    } finally {
      setLoading(false);
    }
  }, [signedIn]);

  useEffect(() => {
    if (signedIn) void loadTemplates();
  }, [loadTemplates, signedIn]);

  const resetComposer = () => {
    setComposing(false);
    setEditingId(null);
    setTemplateName("");
    setForm(emptyTemplateForm());
    setMsg(null);
  };

  const startCreate = () => {
    setComposing(true);
    setEditingId(null);
    setTemplateName("");
    setForm(emptyTemplateForm());
    setMsg(null);
  };

  const startEdit = (template: TournamentTemplate) => {
    setComposing(true);
    setEditingId(template.id);
    setTemplateName(template.name);
    setForm({ ...template.form });
    setMsg(null);
  };

  const onSave = async () => {
    if (!signedIn) {
      onRequestLogin();
      return;
    }
    const name = templateName.trim() || form.title.trim();
    if (!name) {
      setMsg("Name this template before saving.");
      return;
    }
    if (!form.venueName.trim() || !form.city.trim()) {
      setMsg("Venue and city are required for a template.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/tournaments/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId || undefined,
          name,
          form: {
            ...form,
            title: form.title.trim(),
            description: form.description.trim(),
            venueName: form.venueName.trim(),
            venueAddress: form.venueAddress.trim(),
            city: form.city.trim(),
            venmoHandle: form.venmoHandle?.trim() || null,
            zelleHandle: form.zelleHandle?.trim() || null,
            cashAppHandle: form.cashAppHandle?.trim() || null,
            organizerPhone: form.organizerPhone?.trim() || null,
          },
        }),
      });
      const data = (await res.json()) as {
        templates?: TournamentTemplate[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Failed to save template.");
      setTemplates(data.templates ?? []);
      setMsg(`Saved template “${name}”.`);
      setComposing(false);
      setEditingId(null);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed to save template.");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (templateId: string) => {
    if (!signedIn) return;
    const current = templates.find((item) => item.id === templateId);
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(
        `/api/tournaments/templates?id=${encodeURIComponent(templateId)}`,
        { method: "DELETE" },
      );
      const data = (await res.json()) as {
        templates?: TournamentTemplate[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Failed to delete template.");
      setTemplates(data.templates ?? []);
      if (editingId === templateId) resetComposer();
      setMsg(current ? `Deleted “${current.name}”.` : "Template deleted.");
    } catch (err) {
      setMsg(
        err instanceof Error ? err.message : "Failed to delete template.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (!signedIn && !authLoading) {
    return (
      <SignInGate
        title="Sign in to manage templates"
        body="Save create-event settings (format, venue, pay) and reuse them when you post a new night."
        onRequestLogin={onRequestLogin}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            Event templates
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Preset format, eligibility, venue, and pay settings. Dates and flyer
            stay blank when you use one.
          </p>
        </div>
        {!composing ? (
          <button
            type="button"
            onClick={startCreate}
            className="rounded-[var(--radius)] bg-[var(--felt)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--felt-soft)]"
          >
            + New template
          </button>
        ) : null}
      </div>

      {msg ? (
        <p className="text-xs text-[var(--felt-deep)]">{msg}</p>
      ) : null}
      {error ? (
        <p className="rounded-[var(--radius)] border border-[var(--danger)]/40 bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      {composing ? (
        <div className="space-y-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)]/40 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            {editingId ? "Edit template" : "New template"}
          </p>
          <Field label="Template name">
            <input
              className={fieldClass}
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder={form.title.trim() || "e.g. Friday 9-ball night"}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Default title">
                <input
                  className={fieldClass}
                  value={form.title}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, title: e.target.value }))
                  }
                  placeholder="Friday Night 9-Ball"
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Description">
                <textarea
                  className={`${fieldClass} min-h-[72px] resize-y`}
                  value={form.description}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, description: e.target.value }))
                  }
                  placeholder="House rules, payout notes…"
                />
              </Field>
            </div>
            <Field label="Registration open">
              <SelectField
                aria-label="Registration open"
                value={form.status}
                options={CREATE_STATUS_OPTIONS}
                onChange={(status) =>
                  setForm((p) => ({
                    ...p,
                    status: status === "draft" ? "draft" : "open",
                  }))
                }
              />
            </Field>
            <Field label="Game">
              <SelectField
                aria-label="Game"
                value={form.gameType}
                options={GAME_TYPE_OPTIONS}
                onChange={(gameType) => setForm((p) => ({ ...p, gameType }))}
              />
            </Field>
            <Field label="Event type">
              <SelectField
                aria-label="Event type"
                value={form.eventType}
                options={EVENT_TYPE_OPTIONS}
                onChange={(eventType: EventType) =>
                  setForm((p) => ({
                    ...p,
                    eventType,
                    teamSize: defaultTeamSize(eventType),
                  }))
                }
              />
            </Field>
            <Field label="Bracket">
              <SelectField
                aria-label="Bracket"
                value={form.bracketFormat}
                options={BRACKET_FORMAT_OPTIONS}
                onChange={(bracketFormat) =>
                  setForm((p) => ({ ...p, bracketFormat }))
                }
              />
            </Field>
            <Field label="Break format">
              <SelectField
                aria-label="Break format"
                value={form.breakFormat}
                options={BREAK_FORMAT_OPTIONS}
                onChange={(breakFormat) =>
                  setForm((p) => ({ ...p, breakFormat }))
                }
              />
            </Field>
            <Field label="Draw type">
              <SelectField
                aria-label="Draw type"
                value={form.drawType}
                options={DRAW_TYPE_OPTIONS}
                onChange={(drawType) => setForm((p) => ({ ...p, drawType }))}
              />
            </Field>
            <Field label="Handicap">
              <SelectField
                aria-label="Handicap"
                value={form.handicapSystem}
                options={HANDICAP_SYSTEM_OPTIONS.map((o) => ({
                  value: o.value,
                  label: o.label,
                }))}
                onChange={(handicapSystem) =>
                  setForm((p) => ({ ...p, handicapSystem }))
                }
              />
            </Field>
            <Field label="Winners race to">
              <input
                type="number"
                min={1}
                className={fieldClass}
                value={form.winnersRaceTo ?? ""}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    winnersRaceTo:
                      e.target.value === "" ? null : Number(e.target.value),
                  }))
                }
              />
            </Field>
            <Field label="Losers race to">
              <input
                type="number"
                min={1}
                className={fieldClass}
                value={form.losersRaceTo ?? ""}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    losersRaceTo:
                      e.target.value === "" ? null : Number(e.target.value),
                  }))
                }
              />
            </Field>
            <Field label="Fargo cap">
              <input
                type="number"
                min={0}
                className={fieldClass}
                value={form.maxFargo ?? ""}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    maxFargo:
                      e.target.value === "" ? null : Number(e.target.value),
                  }))
                }
                placeholder="Open if blank"
              />
            </Field>
            <Field label="Min robustness">
              <SelectField
                aria-label="Min robustness"
                value={form.minRobustnessStatus ?? ""}
                options={MIN_ROBUSTNESS_OPTIONS}
                onChange={(value) =>
                  setForm((p) => ({
                    ...p,
                    minRobustnessStatus:
                      value === "preliminary" || value === "established"
                        ? value
                        : null,
                  }))
                }
              />
            </Field>
            <Field label="Unrated players">
              <SelectField
                aria-label="Unrated players"
                value={form.unratedPolicy}
                options={UNRATED_POLICY_OPTIONS}
                onChange={(unratedPolicy) =>
                  setForm((p) => ({ ...p, unratedPolicy }))
                }
              />
            </Field>
            <Field label={maxEntriesLabel(form.eventType)}>
              <input
                type="number"
                min={2}
                className={fieldClass}
                value={form.maxPlayers}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    maxPlayers: Number(e.target.value),
                  }))
                }
              />
            </Field>
            {form.eventType !== "singles" ? (
              <Field
                label={
                  form.eventType === "scotch-doubles"
                    ? "Players per pair"
                    : "Players per team"
                }
              >
                <input
                  type="number"
                  min={2}
                  max={12}
                  className={fieldClass}
                  value={form.teamSize}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      teamSize: Number(e.target.value),
                    }))
                  }
                  disabled={form.eventType === "scotch-doubles"}
                />
              </Field>
            ) : null}
            <Field label="Entry fee ($)">
              <input
                type="number"
                min={0}
                step={1}
                className={fieldClass}
                value={(form.entryFeeCents ?? 0) / 100}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    entryFeeCents: Math.round(Number(e.target.value) * 100),
                  }))
                }
              />
            </Field>
            <Field label="Added money ($)">
              <input
                type="number"
                min={0}
                step={1}
                className={fieldClass}
                value={(form.addedMoneyCents ?? 0) / 100}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    addedMoneyCents: Math.round(Number(e.target.value) * 100),
                  }))
                }
              />
            </Field>
            <Field label="Primary payment">
              <SelectField
                aria-label="Primary payment"
                value={form.payMethod}
                options={PAY_METHOD_OPTIONS}
                onChange={(payMethod) => setForm((p) => ({ ...p, payMethod }))}
              />
            </Field>
            <Field label="Venmo">
              <input
                className={fieldClass}
                value={form.venmoHandle ?? ""}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    venmoHandle: e.target.value || null,
                  }))
                }
                placeholder="@handle"
              />
            </Field>
            <Field label="Zelle">
              <input
                className={fieldClass}
                value={form.zelleHandle ?? ""}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    zelleHandle: e.target.value || null,
                  }))
                }
                placeholder="Email or phone"
              />
            </Field>
            <Field label="Cash App">
              <input
                className={fieldClass}
                value={form.cashAppHandle ?? ""}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    cashAppHandle: e.target.value || null,
                  }))
                }
                placeholder="$cashtag"
              />
            </Field>
            <Field label="Registration">
              <SelectField
                aria-label="Registration"
                value={form.registrationMode}
                options={REGISTRATION_MODE_OPTIONS}
                onChange={(registrationMode) =>
                  setForm((p) => ({ ...p, registrationMode }))
                }
              />
            </Field>
            <Field label="Ruleset">
              <SelectField
                aria-label="Ruleset"
                value={form.rulesetPreset}
                options={RULESET_OPTIONS}
                onChange={(rulesetPreset) =>
                  setForm((p) => ({ ...p, rulesetPreset }))
                }
              />
            </Field>
            <Field label="Table size">
              <SelectField
                aria-label="Table size"
                value={form.tableSize}
                options={TABLE_SIZE_OPTIONS}
                onChange={(tableSize) => setForm((p) => ({ ...p, tableSize }))}
              />
            </Field>
            <Field label="Venue">
              <input
                className={fieldClass}
                value={form.venueName}
                onChange={(e) =>
                  setForm((p) => ({ ...p, venueName: e.target.value }))
                }
                placeholder="Pool hall name"
              />
            </Field>
            <Field label="City">
              <input
                className={fieldClass}
                value={form.city}
                onChange={(e) =>
                  setForm((p) => ({ ...p, city: e.target.value }))
                }
              />
            </Field>
            <Field label="Address">
              <input
                className={fieldClass}
                value={form.venueAddress}
                onChange={(e) =>
                  setForm((p) => ({ ...p, venueAddress: e.target.value }))
                }
              />
            </Field>
            <Field label="Region">
              <SelectField
                aria-label="Region"
                value={form.region}
                options={FL_REGIONS.map((r) => ({ value: r, label: r }))}
                onChange={(region) => setForm((p) => ({ ...p, region }))}
              />
            </Field>
            <Field label="Organizer phone">
              <input
                className={fieldClass}
                value={form.organizerPhone ?? ""}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    organizerPhone: e.target.value || null,
                  }))
                }
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Payout notes">
                <textarea
                  className={`${fieldClass} min-h-[64px] resize-y`}
                  value={form.payoutNotes}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, payoutNotes: e.target.value }))
                  }
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Handicap notes">
                <textarea
                  className={`${fieldClass} min-h-[64px] resize-y`}
                  value={form.handicapNotes}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, handicapNotes: e.target.value }))
                  }
                />
              </Field>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--ink)] sm:col-span-2">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--felt)]"
                checked={form.reportedToFargo}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    reportedToFargo: e.target.checked,
                  }))
                }
              />
              Reported to Fargo
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void onSave()}
              className="rounded-[var(--radius)] bg-[var(--felt)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy
                ? "Saving…"
                : editingId
                  ? "Update template"
                  : "Save template"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={resetComposer}
              className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--muted)]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <LoadingState label="Loading templates…" />
      ) : templates.length === 0 && !composing ? (
        <EmptyState
          title="No templates yet"
          body="Save your usual format, venue, and pay settings once, then use them when creating a new event."
          action={
            <button
              type="button"
              onClick={startCreate}
              className="rounded-[var(--radius)] bg-[var(--felt)] px-4 py-2.5 text-sm font-semibold text-white"
            >
              + New template
            </button>
          }
        />
      ) : templates.length > 0 ? (
        <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius)] border border-[var(--line)]">
          {templates.map((template) => (
            <li key={template.id} className="space-y-2 px-3 py-3 sm:px-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--ink)]">
                    {template.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                    {templateSummary(template.form)}
                  </p>
                  {template.form.title.trim() ? (
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Default title: {template.form.title}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onUseTemplate(template)}
                    className="rounded-[var(--radius)] bg-[var(--felt)] px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Use
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => startEdit(template)}
                    className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ink)] disabled:opacity-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onDelete(template.id)}
                    className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--muted)] disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
