"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  BRACKET_FORMAT_OPTIONS,
  EVENT_TYPE_OPTIONS,
  FL_REGIONS,
  formatEntryFee,
  formatStartsAt,
  GAME_TYPE_OPTIONS,
  HANDICAP_SYSTEM_OPTIONS,
  PAY_METHOD_OPTIONS,
  REGISTRATION_MODE_OPTIONS,
  RULESET_OPTIONS,
  STATUS_LABELS,
  TABLE_SIZE_OPTIONS,
  UNRATED_POLICY_OPTIONS,
} from "@/lib/tournaments/options";
import type {
  CreateTournamentInput,
  GameType,
  TournamentListItem,
  TournamentMessage,
  TournamentRegistration,
  TournamentStatus,
} from "@/lib/tournaments/types";
import type { AuthUser } from "./LoginScreen";
import { EmptyState } from "./EmptyState";
import { LoadingState } from "./LoadingState";
import { SearchField } from "./SearchField";
import { SectionCard } from "./SectionCard";

type View = "browse" | "create" | "detail";

type DetailPayload = {
  tournament: TournamentListItem;
  registrations: TournamentRegistration[];
  messages: TournamentMessage[];
  isOrganizer: boolean;
};

type TournamentsProps = {
  user: AuthUser | null;
  authLoading: boolean;
  playerFargo: number | null;
  onRequestLogin: () => void;
};

const fieldClass =
  "w-full rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:ring-2 focus:ring-[var(--felt-soft)]";
const labelClass =
  "mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]";

function statusTone(status: TournamentStatus): string {
  switch (status) {
    case "open":
      return "bg-[var(--felt)] text-white";
    case "full":
      return "bg-[var(--amber)] text-[#1a140c]";
    case "draft":
      return "bg-[var(--surface-3)] text-[var(--muted)]";
    case "closed":
    case "completed":
      return "bg-[var(--surface-2)] text-[var(--muted)]";
    case "canceled":
      return "bg-[var(--danger-bg)] text-[var(--danger)]";
    default:
      return "bg-[var(--surface-2)] text-[var(--muted)]";
  }
}

function handicapLabel(value: string): string {
  return (
    HANDICAP_SYSTEM_OPTIONS.find((o) => o.value === value)?.label ?? value
  );
}

async function compressImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const max = 720;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process image.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.72);
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

function SurfaceCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={[
        "overflow-hidden rounded-[1.35rem] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]",
        className,
      ].join(" ")}
    >
      {children}
    </section>
  );
}

const emptyForm = (): CreateTournamentInput => ({
  title: "",
  description: "",
  thumbnailUrl: null,
  gameType: "9-ball",
  eventType: "singles",
  bracketFormat: "double-elimination",
  handicapSystem: "fargo-medium",
  handicapNotes: "",
  rulesetPreset: "bca",
  winnersRaceTo: 7,
  losersRaceTo: 5,
  minFargo: null,
  maxFargo: null,
  unratedPolicy: "message-organizer",
  maxPlayers: 32,
  entryFeeCents: 2000,
  payMethod: "door",
  payoutNotes: "",
  registrationMode: "approval",
  reportedToFargo: false,
  tableSize: "7ft",
  venueName: "",
  venueAddress: "",
  city: "",
  region: "Palm Beach",
  startsAt: "",
  checkInAt: null,
  organizerPhone: null,
  status: "open",
});

export function Tournaments({
  user,
  authLoading,
  playerFargo,
  onRequestLogin,
}: TournamentsProps) {
  const [view, setView] = useState<View>("browse");
  const [events, setEvents] = useState<TournamentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("");
  const [gameType, setGameType] = useState<GameType | "">("");
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [form, setForm] = useState<CreateTournamentInput>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [regNote, setRegNote] = useState("");
  const [regRating, setRegRating] = useState("");
  const [guestMode, setGuestMode] = useState(false);
  const [messageBody, setMessageBody] = useState("");
  const [messageName, setMessageName] = useState("");

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (region) params.set("region", region);
      if (gameType) params.set("gameType", gameType);
      if (eligibleOnly && playerFargo != null) {
        params.set("eligibleForFargo", String(playerFargo));
      }
      const res = await fetch(`/api/tournaments?${params.toString()}`);
      const data = (await res.json()) as {
        tournaments?: TournamentListItem[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Failed to load events.");
      setEvents(data.tournaments ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load events.");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [eligibleOnly, gameType, playerFargo, q, region]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const openDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    setView("detail");
    setDetailLoading(true);
    setActionMsg(null);
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${id}`);
      const data = (await res.json()) as DetailPayload & { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to load event.");
      setDetail({
        tournament: data.tournament,
        registrations: data.registrations ?? [],
        messages: data.messages ?? [],
        isOrganizer: Boolean(data.isOrganizer),
      });
    } catch (err) {
      setDetail(null);
      setError(err instanceof Error ? err.message : "Failed to load event.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const refreshDetail = useCallback(async () => {
    if (!selectedId) return;
    await openDetail(selectedId);
    await loadEvents();
  }, [loadEvents, openDetail, selectedId]);

  const myRegistration = useMemo(() => {
    if (!user || !detail) return null;
    return (
      detail.registrations.find(
        (r) =>
          r.userId === user.lmsId &&
          r.status !== "withdrawn" &&
          r.status !== "rejected",
      ) ?? null
    );
  }, [detail, user]);

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) {
      onRequestLogin();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: CreateTournamentInput = {
        ...form,
        title: form.title.trim(),
        venueName: form.venueName.trim(),
        city: form.city.trim(),
        entryFeeCents: Math.round(Number(form.entryFeeCents) || 0),
        maxPlayers: Math.max(2, Math.floor(Number(form.maxPlayers) || 2)),
        startsAt: form.startsAt
          ? new Date(form.startsAt).toISOString()
          : "",
        checkInAt: form.checkInAt
          ? new Date(form.checkInAt).toISOString()
          : null,
        minFargo:
          form.minFargo === null || form.minFargo === ("" as unknown as number)
            ? null
            : Number(form.minFargo),
        maxFargo:
          form.maxFargo === null || form.maxFargo === ("" as unknown as number)
            ? null
            : Number(form.maxFargo),
      };
      const res = await fetch("/api/tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        tournament?: TournamentListItem;
        error?: string;
      };
      if (!res.ok || !data.tournament) {
        throw new Error(data.error || "Failed to create event.");
      }
      setForm(emptyForm());
      await loadEvents();
      await openDetail(data.tournament.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create event.");
    } finally {
      setSaving(false);
    }
  };

  const onRegister = async () => {
    if (!user || !selectedId) {
      onRequestLogin();
      return;
    }
    setSaving(true);
    setActionMsg(null);
    try {
      const rating =
        regRating.trim() === ""
          ? playerFargo
          : Number(regRating);
      const res = await fetch(`/api/tournaments/${selectedId}/registrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: user.name ?? user.email ?? "Player",
          ratingAtSignup:
            rating == null || Number.isNaN(rating) ? null : rating,
          isGuest: guestMode || rating == null,
          noteToOrganizer: regNote,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Registration failed.");
      setActionMsg("Registration submitted.");
      setRegNote("");
      await refreshDetail();
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setSaving(false);
    }
  };

  const onUpdateRegistration = async (
    registrationId: string,
    patch: { status?: TournamentRegistration["status"]; paid?: boolean },
  ) => {
    if (!selectedId) return;
    setSaving(true);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/tournaments/${selectedId}/registrations`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId, ...patch }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Update failed.");
      await refreshDetail();
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setSaving(false);
    }
  };

  const onSendMessage = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedId) return;
    setSaving(true);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/tournaments/${selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromName: messageName.trim() || user?.name || user?.email || "Player",
          fromEmail: user?.email ?? null,
          body: messageBody,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not send message.");
      setMessageBody("");
      setActionMsg("Message sent to the organizer.");
      if (detail?.isOrganizer) await refreshDetail();
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : "Could not send message.");
    } finally {
      setSaving(false);
    }
  };

  const onThumbnail = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImage(file);
      setForm((prev) => ({ ...prev, thumbnailUrl: dataUrl }));
    } catch {
      setError("Could not process thumbnail image.");
    }
  };

  if (view === "create") {
    return (
      <div className="space-y-4 animate-panel">
        <button
          type="button"
          onClick={() => {
            setView("browse");
            setError(null);
          }}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--line-strong)]"
        >
          <span aria-hidden>←</span>
          All events
        </button>

        <SectionCard
          eyebrow="Events"
          title="Create event"
          description="Set the format, Fargo band, entry, and venue. Players can browse and sign up from Events."
        />

        {!user && !authLoading ? (
          <EmptyState
            title="Sign in to create an event"
            body="Use your FargoRate / LMS scoring login so you can manage signups as the organizer."
            action={
              <button
                type="button"
                onClick={onRequestLogin}
                className="rounded-xl bg-[var(--felt)] px-4 py-2.5 text-sm font-semibold text-white"
              >
                Sign in
              </button>
            }
          />
        ) : (
          <SurfaceCard>
            <form onSubmit={onCreate} className="space-y-5 p-3 sm:p-4">
              {error ? (
                <p className="rounded-xl border border-[var(--danger)]/40 bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger)]">
                  {error}
                </p>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field label="Event title">
                    <input
                      required
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
                      className={`${fieldClass} min-h-[88px] resize-y`}
                      value={form.description}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, description: e.target.value }))
                      }
                      placeholder="House rules, payout notes, what to bring…"
                    />
                  </Field>
                </div>
                <Field label="Game">
                  <select
                    className={fieldClass}
                    value={form.gameType}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        gameType: e.target.value as CreateTournamentInput["gameType"],
                      }))
                    }
                  >
                    {GAME_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Event type">
                  <select
                    className={fieldClass}
                    value={form.eventType}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        eventType: e.target.value as CreateTournamentInput["eventType"],
                      }))
                    }
                  >
                    {EVENT_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Bracket">
                  <select
                    className={fieldClass}
                    value={form.bracketFormat}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        bracketFormat: e.target
                          .value as CreateTournamentInput["bracketFormat"],
                      }))
                    }
                  >
                    {BRACKET_FORMAT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Handicap">
                  <select
                    className={fieldClass}
                    value={form.handicapSystem}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        handicapSystem: e.target
                          .value as CreateTournamentInput["handicapSystem"],
                      }))
                    }
                  >
                    {HANDICAP_SYSTEM_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
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
                <Field label="Min Fargo">
                  <input
                    type="number"
                    min={0}
                    className={fieldClass}
                    value={form.minFargo ?? ""}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        minFargo:
                          e.target.value === "" ? null : Number(e.target.value),
                      }))
                    }
                    placeholder="Optional"
                  />
                </Field>
                <Field label="Max Fargo">
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
                    placeholder="Optional"
                  />
                </Field>
                <Field label="Unrated players">
                  <select
                    className={fieldClass}
                    value={form.unratedPolicy}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        unratedPolicy: e.target
                          .value as CreateTournamentInput["unratedPolicy"],
                      }))
                    }
                  >
                    {UNRATED_POLICY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Max players">
                  <input
                    required
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
                <Field label="Payment">
                  <select
                    className={fieldClass}
                    value={form.payMethod}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        payMethod: e.target
                          .value as CreateTournamentInput["payMethod"],
                      }))
                    }
                  >
                    {PAY_METHOD_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Registration">
                  <select
                    className={fieldClass}
                    value={form.registrationMode}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        registrationMode: e.target
                          .value as CreateTournamentInput["registrationMode"],
                      }))
                    }
                  >
                    {REGISTRATION_MODE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Ruleset">
                  <select
                    className={fieldClass}
                    value={form.rulesetPreset}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        rulesetPreset: e.target
                          .value as CreateTournamentInput["rulesetPreset"],
                      }))
                    }
                  >
                    {RULESET_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Table size">
                  <select
                    className={fieldClass}
                    value={form.tableSize}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        tableSize: e.target
                          .value as CreateTournamentInput["tableSize"],
                      }))
                    }
                  >
                    {TABLE_SIZE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Starts">
                  <input
                    required
                    type="datetime-local"
                    className={fieldClass}
                    value={form.startsAt}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, startsAt: e.target.value }))
                    }
                  />
                </Field>
                <Field label="Check-in">
                  <input
                    type="datetime-local"
                    className={fieldClass}
                    value={form.checkInAt ?? ""}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        checkInAt: e.target.value || null,
                      }))
                    }
                  />
                </Field>
                <Field label="Venue">
                  <input
                    required
                    className={fieldClass}
                    value={form.venueName}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, venueName: e.target.value }))
                    }
                    placeholder="Cue & Brew"
                  />
                </Field>
                <Field label="City">
                  <input
                    required
                    className={fieldClass}
                    value={form.city}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, city: e.target.value }))
                    }
                    placeholder="West Palm Beach"
                  />
                </Field>
                <Field label="Region">
                  <select
                    className={fieldClass}
                    value={form.region}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, region: e.target.value }))
                    }
                  >
                    {FL_REGIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
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
                    <input
                      className={fieldClass}
                      value={form.payoutNotes}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, payoutNotes: e.target.value }))
                      }
                      placeholder="80% payout, added money, green fees…"
                    />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Thumbnail">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={onThumbnail}
                      className="block w-full text-sm text-[var(--muted)] file:mr-3 file:rounded-full file:border-0 file:bg-[var(--felt)] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
                    />
                  </Field>
                  {form.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={form.thumbnailUrl}
                      alt=""
                      className="mt-2 h-28 w-full rounded-xl object-cover"
                    />
                  ) : null}
                </div>
                <label className="flex items-center gap-2 text-sm text-[var(--ink)] sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={Boolean(form.reportedToFargo)}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        reportedToFargo: e.target.checked,
                      }))
                    }
                  />
                  Results reported to FargoRate
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-full bg-[var(--felt)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--felt-soft)] disabled:opacity-50"
                >
                  {saving ? "Publishing…" : "Publish event"}
                </button>
                <button
                  type="button"
                  onClick={() => setView("browse")}
                  className="rounded-full border border-[var(--line)] px-4 py-2.5 text-sm font-semibold text-[var(--muted)]"
                >
                  Cancel
                </button>
              </div>
            </form>
          </SurfaceCard>
        )}
      </div>
    );
  }

  if (view === "detail") {
    const t = detail?.tournament;
    return (
      <div className="space-y-4 animate-panel">
        <button
          type="button"
          onClick={() => {
            setView("browse");
            setDetail(null);
            setSelectedId(null);
            setError(null);
            setActionMsg(null);
          }}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--line-strong)]"
        >
          <span aria-hidden>←</span>
          All events
        </button>

        {detailLoading || !t ? (
          <LoadingState label="Loading event…" />
        ) : (
          <>
            <SectionCard
              eyebrow="Events"
              title={t.title}
              description={`${formatStartsAt(t.startsAt)} · ${t.venueName}, ${t.city}`}
              badge={{
                label: "Spots",
                value: String(t.spotsLeft),
              }}
            />

            <SurfaceCard>
              {t.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={t.thumbnailUrl}
                  alt=""
                  className="h-40 w-full object-cover sm:h-52"
                />
              ) : null}
              <div className="space-y-4 p-3 sm:p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={[
                      "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                      statusTone(t.status),
                    ].join(" ")}
                  >
                    {STATUS_LABELS[t.status]}
                  </span>
                  <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)]">
                    {formatEntryFee(t.entryFeeCents)}
                  </span>
                  <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)]">
                    {t.approvedCount}/{t.maxPlayers} in
                  </span>
                </div>

                {t.description ? (
                  <p className="text-sm leading-relaxed text-[var(--ink)]">
                    {t.description}
                  </p>
                ) : null}

                <dl className="grid gap-3 sm:grid-cols-2">
                  {[
                    ["Game", GAME_TYPE_OPTIONS.find((o) => o.value === t.gameType)?.label ?? t.gameType],
                    ["Format", BRACKET_FORMAT_OPTIONS.find((o) => o.value === t.bracketFormat)?.label ?? t.bracketFormat],
                    ["Handicap", handicapLabel(t.handicapSystem)],
                    [
                      "Fargo band",
                      t.minFargo == null && t.maxFargo == null
                        ? "Open"
                        : `${t.minFargo ?? "—"} – ${t.maxFargo ?? "—"}`,
                    ],
                    [
                      "Race",
                      t.winnersRaceTo
                        ? `W ${t.winnersRaceTo}${t.losersRaceTo ? ` / L ${t.losersRaceTo}` : ""}`
                        : "—",
                    ],
                    ["Tables", t.tableSize],
                    ["Payment", PAY_METHOD_OPTIONS.find((o) => o.value === t.payMethod)?.label ?? t.payMethod],
                    ["Organizer", t.organizerName],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className={labelClass}>{label}</dt>
                      <dd className="text-sm text-[var(--ink)]">{value}</dd>
                    </div>
                  ))}
                </dl>

                {t.payoutNotes ? (
                  <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--muted)]">
                    {t.payoutNotes}
                  </p>
                ) : null}

                {actionMsg ? (
                  <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--felt-deep)]">
                    {actionMsg}
                  </p>
                ) : null}

                {myRegistration ? (
                  <p className="text-sm text-[var(--ink)]">
                    Your status:{" "}
                    <span className="font-semibold capitalize">
                      {myRegistration.status}
                    </span>
                    {myRegistration.paid ? " · Paid" : " · Unpaid"}
                  </p>
                ) : t.status === "open" ? (
                  <div className="space-y-3 rounded-[1.2rem] border border-[var(--line)] bg-[var(--surface-2)]/60 p-3">
                    <p className="text-sm font-semibold text-[var(--ink)]">
                      Sign up
                    </p>
                    {!user ? (
                      <button
                        type="button"
                        onClick={onRequestLogin}
                        className="rounded-full bg-[var(--felt)] px-4 py-2.5 text-sm font-semibold text-white"
                      >
                        Sign in to register
                      </button>
                    ) : (
                      <>
                        <Field label="Fargo at signup">
                          <input
                            className={fieldClass}
                            value={regRating}
                            onChange={(e) => setRegRating(e.target.value)}
                            placeholder={
                              playerFargo != null
                                ? String(playerFargo)
                                : "Leave blank if unrated"
                            }
                          />
                        </Field>
                        <label className="flex items-center gap-2 text-sm text-[var(--ink)]">
                          <input
                            type="checkbox"
                            checked={guestMode}
                            onChange={(e) => setGuestMode(e.target.checked)}
                          />
                          Unrated / guest signup
                        </label>
                        <Field label="Note to organizer">
                          <textarea
                            className={`${fieldClass} min-h-[72px] resize-y`}
                            value={regNote}
                            onChange={(e) => setRegNote(e.target.value)}
                            placeholder="Venmo handle, partner name, questions…"
                          />
                        </Field>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void onRegister()}
                          className="rounded-full bg-[var(--felt)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          {saving ? "Submitting…" : "Request spot"}
                        </button>
                      </>
                    )}
                  </div>
                ) : null}

                {(t.unratedPolicy === "message-organizer" || !user) && (
                  <form
                    onSubmit={onSendMessage}
                    className="space-y-3 rounded-[1.2rem] border border-[var(--line)] bg-[var(--surface-2)]/40 p-3"
                  >
                    <p className="text-sm font-semibold text-[var(--ink)]">
                      Message organizer
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      For unrated players or questions before signup.
                    </p>
                    {!user ? (
                      <Field label="Your name">
                        <input
                          required
                          className={fieldClass}
                          value={messageName}
                          onChange={(e) => setMessageName(e.target.value)}
                        />
                      </Field>
                    ) : null}
                    <Field label="Message">
                      <textarea
                        required
                        className={`${fieldClass} min-h-[72px] resize-y`}
                        value={messageBody}
                        onChange={(e) => setMessageBody(e.target.value)}
                      />
                    </Field>
                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--ink)] disabled:opacity-50"
                    >
                      Send message
                    </button>
                  </form>
                )}
              </div>
            </SurfaceCard>

            {detail?.isOrganizer ? (
              <>
                <SectionCard
                  eyebrow="Organizer"
                  title="Signups"
                  description="Approve players, mark door/Venmo paid, and review messages."
                  badge={{
                    label: "Pending",
                    value: String(t.pendingCount),
                  }}
                />
                <SurfaceCard>
                  <ul className="divide-y divide-[var(--line)]">
                    {detail.registrations.length === 0 ? (
                      <li className="px-4 py-6 text-center text-sm text-[var(--muted)]">
                        No signups yet.
                      </li>
                    ) : (
                      detail.registrations.map((reg) => (
                        <li key={reg.id} className="space-y-2 px-3 py-3 sm:px-4">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--ink)]">
                                {reg.displayName}
                              </p>
                              <p className="mt-0.5 text-xs text-[var(--muted)]">
                                {reg.ratingAtSignup != null
                                  ? `Fargo ${reg.ratingAtSignup}`
                                  : "Unrated"}
                                {reg.email ? ` · ${reg.email}` : ""}
                                {reg.paid ? " · Paid" : " · Unpaid"}
                                {" · "}
                                <span className="capitalize">{reg.status}</span>
                              </p>
                              {reg.noteToOrganizer ? (
                                <p className="mt-1 text-xs text-[var(--ink)]">
                                  {reg.noteToOrganizer}
                                </p>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {reg.status === "pending" ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={saving}
                                    onClick={() =>
                                      void onUpdateRegistration(reg.id, {
                                        status: "approved",
                                      })
                                    }
                                    className="rounded-full bg-[var(--felt)] px-3 py-1.5 text-[11px] font-semibold text-white"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    disabled={saving}
                                    onClick={() =>
                                      void onUpdateRegistration(reg.id, {
                                        status: "rejected",
                                      })
                                    }
                                    className="rounded-full border border-[var(--line)] px-3 py-1.5 text-[11px] font-semibold text-[var(--danger)]"
                                  >
                                    Reject
                                  </button>
                                </>
                              ) : null}
                              {reg.status === "approved" ? (
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() =>
                                    void onUpdateRegistration(reg.id, {
                                      paid: !reg.paid,
                                    })
                                  }
                                  className="rounded-full border border-[var(--line)] px-3 py-1.5 text-[11px] font-semibold text-[var(--ink)]"
                                >
                                  {reg.paid ? "Mark unpaid" : "Mark paid"}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      ))
                    )}
                  </ul>
                </SurfaceCard>

                {detail.messages.length > 0 ? (
                  <SurfaceCard>
                    <div className="border-b border-[var(--line)] px-3 py-3 sm:px-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                        Messages
                      </p>
                    </div>
                    <ul className="divide-y divide-[var(--line)]">
                      {detail.messages.map((msg) => (
                        <li key={msg.id} className="px-3 py-3 sm:px-4">
                          <p className="text-sm font-semibold text-[var(--ink)]">
                            {msg.fromName}
                          </p>
                          <p className="mt-1 text-sm text-[var(--muted)]">
                            {msg.body}
                          </p>
                          <p className="mt-1 text-[11px] text-[var(--muted)]">
                            {formatStartsAt(msg.createdAt)}
                            {msg.fromEmail ? ` · ${msg.fromEmail}` : ""}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </SurfaceCard>
                ) : null}
              </>
            ) : null}
          </>
        )}

        {error ? (
          <p className="rounded-xl border border-[var(--danger)]/40 bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger)]">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-panel">
      <SectionCard
        eyebrow="Events"
        title="Tournaments"
        description="Browse local brackets by venue and Fargo band, or create your own night."
      />

      <SurfaceCard>
        <div className="space-y-3 border-b border-[var(--line)] px-3 py-3 sm:px-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
              Find an event
            </p>
            <button
              type="button"
              onClick={() => {
                setView("create");
                setError(null);
              }}
              className="rounded-full bg-[var(--felt)] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--felt-soft)]"
            >
              Create event
            </button>
          </div>
          <SearchField
            embedded
            value={q}
            onChange={setQ}
            placeholder="Search title, venue, city…"
            label="Search events"
          />
          <div className="grid gap-2 sm:grid-cols-3">
            <select
              className={fieldClass}
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            >
              <option value="">All regions</option>
              {FL_REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <select
              className={fieldClass}
              value={gameType}
              onChange={(e) =>
                setGameType(e.target.value as GameType | "")
              }
            >
              <option value="">All games</option>
              {GAME_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--ink)]">
              <input
                type="checkbox"
                checked={eligibleOnly}
                onChange={(e) => setEligibleOnly(e.target.checked)}
                disabled={playerFargo == null}
              />
              Eligible for my Fargo
              {playerFargo != null ? ` (${playerFargo})` : ""}
            </label>
          </div>
        </div>

        <div className="p-3 sm:p-4">
          {loading ? (
            <LoadingState label="Loading events…" />
          ) : error ? (
            <EmptyState title="Could not load events" body={error} />
          ) : events.length === 0 ? (
            <EmptyState
              title="No events yet"
              body="Be the first to post a local tournament night."
              action={
                <button
                  type="button"
                  onClick={() => setView("create")}
                  className="rounded-xl bg-[var(--felt)] px-4 py-2.5 text-sm font-semibold text-white"
                >
                  Create event
                </button>
              }
            />
          ) : (
            <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-[1.2rem] border border-[var(--line)]">
              {events.map((event) => (
                <li key={event.id}>
                  <button
                    type="button"
                    onClick={() => void openDetail(event.id)}
                    className="flex w-full gap-3 px-3 py-3 text-left transition hover:bg-[var(--surface-2)]/70 sm:px-4"
                  >
                    {event.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={event.thumbnailUrl}
                        alt=""
                        className="h-16 w-16 shrink-0 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(145deg,rgba(29,110,158,0.55),rgba(19,78,115,0.75))] text-xs font-semibold text-white/80">
                        Event
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--ink)]">
                          {event.title}
                        </p>
                        <span
                          className={[
                            "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                            statusTone(event.status),
                          ].join(" ")}
                        >
                          {STATUS_LABELS[event.status]}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                        {formatStartsAt(event.startsAt)} · {event.venueName},{" "}
                        {event.city}
                      </p>
                      <p className="mt-1 text-[11px] text-[var(--muted)]">
                        {GAME_TYPE_OPTIONS.find((o) => o.value === event.gameType)
                          ?.label ?? event.gameType}
                        {" · "}
                        {handicapLabel(event.handicapSystem)}
                        {" · "}
                        {formatEntryFee(event.entryFeeCents)}
                        {" · "}
                        {event.spotsLeft} spots left
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SurfaceCard>
    </div>
  );
}
