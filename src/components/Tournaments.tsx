"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  BRACKET_FORMAT_OPTIONS,
  defaultTeamSize,
  entryNoun,
  EVENT_TYPE_OPTIONS,
  FL_REGIONS,
  formatEntryFee,
  formatStartsAt,
  GAME_TYPE_OPTIONS,
  HANDICAP_SYSTEM_OPTIONS,
  maxEntriesLabel,
  ORGANIZER_STATUS_OPTIONS,
  PAY_METHOD_OPTIONS,
  REGISTRATION_MODE_OPTIONS,
  RULESET_OPTIONS,
  STATUS_LABELS,
  TABLE_SIZE_OPTIONS,
  UNRATED_POLICY_OPTIONS,
} from "@/lib/tournaments/options";
import type {
  CreateTournamentInput,
  EventType,
  GameType,
  RobustnessStatus,
  TournamentListItem,
  TournamentMessage,
  TournamentRegistration,
  TournamentStatus,
} from "@/lib/tournaments/types";
import type { AuthUser } from "./LoginScreen";
import { DateTimeField } from "./DateTimeField";
import { EmptyState } from "./EmptyState";
import { LoadingState } from "./LoadingState";
import { PlayerDetail } from "./PlayerDetail";
import { SearchField } from "./SearchField";
import { SectionCard } from "./SectionCard";
import { SelectField } from "./SelectField";

type View = "browse" | "create" | "edit" | "detail";
type DetailSubTab = "overview" | "signups" | "field" | "manage";
type FieldBoardFilter = "all" | "not-checked-in" | "unpaid";

type EventFormState = Omit<CreateTournamentInput, "status"> & {
  status: TournamentStatus;
};

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

function robustnessLabel(status: RobustnessStatus | null | undefined): string {
  if (status === "established") return "Established";
  if (status === "preliminary") return "Preliminary";
  return "Starter";
}

function robustnessClass(status: RobustnessStatus | null | undefined): string {
  if (status === "established") {
    return "bg-[var(--felt)]/20 text-[var(--felt-deep)]";
  }
  if (status === "preliminary") {
    return "bg-[var(--amber)]/15 text-[var(--amber)]";
  }
  return "bg-[var(--surface-2)] text-[var(--muted)]";
}

type PlayerLiveStats = {
  rating: number | null;
  robustness: number | null;
  robustnessStatus: RobustnessStatus;
};

function registrationPlayerId(reg: TournamentRegistration): string | null {
  return reg.fargoPlayerId?.trim() || null;
}

function fargoBandText(t: TournamentListItem): string {
  if (t.minFargo == null && t.maxFargo == null) return "Open";
  return `${t.minFargo ?? "—"} – ${t.maxFargo ?? "—"}`;
}

/** Max Fargo cap for headers — "Open" when uncapped. */
function fargoCapText(t: Pick<TournamentListItem, "maxFargo">): string {
  return t.maxFargo != null ? String(t.maxFargo) : "Open";
}

function gameTypeLabel(gameType: GameType): string {
  return GAME_TYPE_OPTIONS.find((o) => o.value === gameType)?.label ?? gameType;
}

function isHandicapped(handicapSystem: string): boolean {
  return handicapSystem !== "none";
}

function handicapShort(handicapSystem: string): string {
  return isHandicapped(handicapSystem) ? "Handicapped" : "Scratch";
}

/** Key facts for the blue event header / list cards. */
function eventKeyFacts(t: Pick<
  TournamentListItem,
  "gameType" | "handicapSystem" | "maxFargo" | "startsAt"
>): string {
  return [
    gameTypeLabel(t.gameType),
    handicapShort(t.handicapSystem),
    t.maxFargo != null ? `Cap ${t.maxFargo}` : "Open Fargo",
  ].join(" · ");
}

function entryShapeText(t: TournamentListItem): string {
  if (t.eventType === "scotch-doubles") return "2-player pairs";
  if (t.eventType === "teams") return `${t.teamSize}-player teams`;
  return "Singles";
}

function raceText(t: TournamentListItem): string {
  if (!t.winnersRaceTo) return "—";
  return t.losersRaceTo
    ? `W ${t.winnersRaceTo} / L ${t.losersRaceTo}`
    : `Race to ${t.winnersRaceTo}`;
}

function StatTile({
  label,
  value,
  delayClass = "",
}: {
  label: string;
  value: string;
  delayClass?: string;
}) {
  return (
    <div
      className={[
        "animate-rise min-w-0 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)]/70 px-3 py-3",
        delayClass,
      ].join(" ")}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-1.5 break-words font-[family-name:var(--font-display)] text-xl font-semibold leading-tight tracking-tight text-[var(--ink)] sm:text-2xl">
        {value}
      </p>
    </div>
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
    <div className="block min-w-0">
      <span className={labelClass}>{label}</span>
      {children}
    </div>
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
        "overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]",
        className,
      ].join(" ")}
    >
      {children}
    </section>
  );
}

type TeammateDraft = {
  displayName: string;
  ratingAtSignup: string;
};

const emptyForm = (): EventFormState => ({
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
  teamSize: 1,
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

function emptyTeammates(count: number): TeammateDraft[] {
  return Array.from({ length: Math.max(0, count) }, () => ({
    displayName: "",
    ratingAtSignup: "",
  }));
}

function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function tournamentToForm(t: TournamentListItem): EventFormState {
  return {
    title: t.title,
    description: t.description,
    thumbnailUrl: t.thumbnailUrl,
    gameType: t.gameType,
    eventType: t.eventType,
    bracketFormat: t.bracketFormat,
    handicapSystem: t.handicapSystem,
    handicapNotes: t.handicapNotes,
    rulesetPreset: t.rulesetPreset,
    winnersRaceTo: t.winnersRaceTo,
    losersRaceTo: t.losersRaceTo,
    minFargo: t.minFargo,
    maxFargo: t.maxFargo,
    unratedPolicy: t.unratedPolicy,
    maxPlayers: t.maxPlayers,
    teamSize: t.teamSize,
    entryFeeCents: t.entryFeeCents,
    payMethod: t.payMethod,
    payoutNotes: t.payoutNotes,
    registrationMode: t.registrationMode,
    reportedToFargo: t.reportedToFargo,
    tableSize: t.tableSize,
    venueName: t.venueName,
    venueAddress: t.venueAddress,
    city: t.city,
    region: t.region,
    startsAt: toLocalInputValue(t.startsAt),
    checkInAt: toLocalInputValue(t.checkInAt),
    organizerPhone: t.organizerPhone,
    status: t.status === "full" ? "open" : t.status,
  };
}

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
  const [form, setForm] = useState<EventFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [regNote, setRegNote] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teammates, setTeammates] = useState<TeammateDraft[]>([]);
  const [resolvedFargo, setResolvedFargo] = useState<number | null>(playerFargo);
  const [fargoLoading, setFargoLoading] = useState(false);
  const [messageBody, setMessageBody] = useState("");
  const [messageName, setMessageName] = useState("");
  const [detailSubTab, setDetailSubTab] = useState<DetailSubTab>("overview");
  const [houseRulesOpen, setHouseRulesOpen] = useState(false);
  const [fieldFilter, setFieldFilter] = useState<FieldBoardFilter>("all");
  const [fieldQuery, setFieldQuery] = useState("");
  const [inspectPlayer, setInspectPlayer] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [playerStats, setPlayerStats] = useState<
    Record<string, PlayerLiveStats>
  >({});
  const [, startDetailTransition] = useTransition();

  useEffect(() => {
    if (!user) {
      setResolvedFargo(null);
      setFargoLoading(false);
      return;
    }
    // Prefer roster Fargo immediately; refresh from Fargo profile when possible.
    setResolvedFargo(playerFargo);
    const lookupId = user.readableId?.trim();
    if (!lookupId) return;
    let cancelled = false;
    setFargoLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/players/${encodeURIComponent(lookupId)}`);
        const data = (await res.json()) as {
          player?: { effectiveRating?: number | null; provisionalRating?: number | null };
        };
        if (cancelled || !res.ok) return;
        const rating =
          data.player?.effectiveRating ?? data.player?.provisionalRating ?? null;
        if (rating != null) setResolvedFargo(rating);
      } catch {
        /* keep roster fallback */
      } finally {
        if (!cancelled) setFargoLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [playerFargo, user]);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (region) params.set("region", region);
      if (gameType) params.set("gameType", gameType);
      if (eligibleOnly && resolvedFargo != null) {
        params.set("eligibleForFargo", String(resolvedFargo));
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
  }, [eligibleOnly, gameType, q, region, resolvedFargo]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const openDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    setView("detail");
    setDetailLoading(true);
    setActionMsg(null);
    setError(null);
    setRegNote("");
    setTeamName("");
    setDetailSubTab("overview");
    setHouseRulesOpen(false);
    setFieldFilter("all");
    setFieldQuery("");
    try {
      const res = await fetch(`/api/tournaments/${id}`);
      const data = (await res.json()) as DetailPayload & { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to load event.");
      const tournament = data.tournament;
      setDetail({
        tournament,
        registrations: data.registrations ?? [],
        messages: data.messages ?? [],
        isOrganizer: Boolean(data.isOrganizer),
      });
      const mateCount = Math.max(0, (tournament.teamSize ?? defaultTeamSize(tournament.eventType)) - 1);
      setTeammates(
        tournament.eventType === "singles" ? [] : emptyTeammates(mateCount || (tournament.eventType === "scotch-doubles" ? 1 : 4)),
      );
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

  const buildFormPayload = () => ({
    ...form,
    title: form.title.trim(),
    venueName: form.venueName.trim(),
    city: form.city.trim(),
    entryFeeCents: Math.round(Number(form.entryFeeCents) || 0),
    maxPlayers: Math.max(2, Math.floor(Number(form.maxPlayers) || 2)),
    teamSize: Math.max(1, Math.floor(Number(form.teamSize) || 1)),
    startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : "",
    checkInAt: form.checkInAt ? new Date(form.checkInAt).toISOString() : null,
    minFargo:
      form.minFargo === null || form.minFargo === ("" as unknown as number)
        ? null
        : Number(form.minFargo),
    maxFargo:
      form.maxFargo === null || form.maxFargo === ("" as unknown as number)
        ? null
        : Number(form.maxFargo),
  });

  const startEdit = (tournament: TournamentListItem) => {
    setEditingId(tournament.id);
    setForm(tournamentToForm(tournament));
    setError(null);
    setActionMsg(null);
    setView("edit");
  };

  const leaveForm = () => {
    const returnId = editingId ?? selectedId;
    setForm(emptyForm());
    setEditingId(null);
    setError(null);
    if (returnId && (view === "edit" || selectedId)) {
      void openDetail(returnId);
      return;
    }
    setView("browse");
  };

  const onSaveForm = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) {
      onRequestLogin();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = buildFormPayload();
      const isEdit = view === "edit" && Boolean(editingId);
      const res = await fetch(
        isEdit ? `/api/tournaments/${editingId}` : "/api/tournaments",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = (await res.json()) as {
        tournament?: TournamentListItem;
        error?: string;
      };
      if (!res.ok || !data.tournament) {
        throw new Error(
          data.error || (isEdit ? "Failed to update event." : "Failed to create event."),
        );
      }
      const savedId = data.tournament.id;
      setForm(emptyForm());
      setEditingId(null);
      await loadEvents();
      await openDetail(savedId);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : view === "edit"
            ? "Failed to update event."
            : "Failed to create event.",
      );
    } finally {
      setSaving(false);
    }
  };

  const onRegister = async () => {
    if (!user || !selectedId || !detail) {
      onRequestLogin();
      return;
    }
    setSaving(true);
    setActionMsg(null);
    try {
      const eventType = detail.tournament.eventType;
      const payloadTeammates =
        eventType === "singles"
          ? []
          : teammates
              .filter((t) => t.displayName.trim())
              .map((t) => ({
                displayName: t.displayName.trim(),
                ratingAtSignup:
                  t.ratingAtSignup.trim() === ""
                    ? null
                    : Number(t.ratingAtSignup),
              }));

      const res = await fetch(`/api/tournaments/${selectedId}/registrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: user.name ?? user.email ?? "Player",
          noteToOrganizer: regNote,
          teamName: eventType === "teams" || eventType === "scotch-doubles"
            ? teamName.trim() || null
            : null,
          teammates: payloadTeammates,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Registration failed.");
      setActionMsg("Registration submitted.");
      setRegNote("");
      setTeamName("");
      await refreshDetail();
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setSaving(false);
    }
  };

  const onUpdateRegistration = async (
    registrationId: string,
    patch: {
      status?: TournamentRegistration["status"];
      paid?: boolean;
      checkedIn?: boolean;
    },
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

  const statsForRegistration = (reg: TournamentRegistration) => {
    const playerId = registrationPlayerId(reg);
    const live = playerId ? playerStats[playerId] : undefined;
    return {
      playerId,
      rating: live?.rating ?? reg.ratingAtSignup,
      robustness: live?.robustness ?? reg.robustnessAtSignup,
      robustnessStatus:
        live?.robustnessStatus ??
        reg.robustnessStatusAtSignup ??
        ("starter" as RobustnessStatus),
    };
  };

  const setTournamentStatus = async (
    id: string,
    status: TournamentStatus,
    successMsg: string,
  ) => {
    setSaving(true);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/tournaments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not update event.");
      setActionMsg(successMsg);
      await refreshDetail();
    } catch (err) {
      setActionMsg(
        err instanceof Error ? err.message : "Could not update event.",
      );
    } finally {
      setSaving(false);
    }
  };

  const sortedRegistrations = useMemo(() => {
    const regs = detail?.registrations ?? [];
    const rank = (status: TournamentRegistration["status"]) => {
      if (status === "pending") return 0;
      if (status === "approved") return 1;
      if (status === "waitlisted") return 2;
      return 3;
    };
    return [...regs].sort((a, b) => {
      const byStatus = rank(a.status) - rank(b.status);
      if (byStatus !== 0) return byStatus;
      return a.createdAt.localeCompare(b.createdAt);
    });
  }, [detail?.registrations]);

  const pendingRegistrations = useMemo(
    () => sortedRegistrations.filter((r) => r.status === "pending"),
    [sortedRegistrations],
  );
  const otherRegistrations = useMemo(
    () => sortedRegistrations.filter((r) => r.status !== "pending"),
    [sortedRegistrations],
  );

  const loadedPlayerIdsRef = useRef(new Set<string>());

  useEffect(() => {
    if (!detail?.isOrganizer || detailSubTab !== "signups") return;
    const ids = [
      ...new Set(
        detail.registrations
          .map((r) => registrationPlayerId(r))
          .filter((id): id is string => Boolean(id)),
      ),
    ].filter((id) => !loadedPlayerIdsRef.current.has(id));
    if (!ids.length) return;
    for (const id of ids) loadedPlayerIdsRef.current.add(id);

    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        ids.map(async (id) => {
          try {
            const res = await fetch(`/api/players/${encodeURIComponent(id)}`);
            const data = (await res.json()) as {
              player?: {
                effectiveRating?: number | null;
                provisionalRating?: number | null;
                robustness?: number | null;
                robustnessStatus?: RobustnessStatus;
              };
            };
            if (!res.ok || !data.player) return null;
            return [
              id,
              {
                rating:
                  data.player.effectiveRating ??
                  data.player.provisionalRating ??
                  null,
                robustness: data.player.robustness ?? null,
                robustnessStatus: data.player.robustnessStatus ?? "starter",
              } satisfies PlayerLiveStats,
            ] as const;
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;
      setPlayerStats((prev) => {
        const next = { ...prev };
        for (const entry of entries) {
          if (entry) next[entry[0]] = entry[1];
        }
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [detail, detailSubTab]);

  const fieldEntries = useMemo(() => {
    const approved = (detail?.registrations ?? []).filter(
      (r) => r.status === "approved",
    );
    const q = fieldQuery.trim().toLowerCase();
    return approved
      .filter((r) => {
        if (fieldFilter === "not-checked-in" && r.checkedIn) return false;
        if (fieldFilter === "unpaid" && r.paid) return false;
        if (!q) return true;
        const hay = [
          r.displayName,
          r.teamName ?? "",
          ...(r.teammates ?? []).map((m) => m.displayName),
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        const aKey = (a.teamName || a.displayName).toLowerCase();
        const bKey = (b.teamName || b.displayName).toLowerCase();
        return aKey.localeCompare(bKey);
      });
  }, [detail?.registrations, fieldFilter, fieldQuery]);

  const fieldStats = useMemo(() => {
    const approved = (detail?.registrations ?? []).filter(
      (r) => r.status === "approved",
    );
    return {
      approved: approved.length,
      checkedIn: approved.filter((r) => r.checkedIn).length,
      paid: approved.filter((r) => r.paid).length,
    };
  }, [detail?.registrations]);

  if (inspectPlayer) {
    return (
      <PlayerDetail
        playerId={inspectPlayer.id}
        fallbackName={inspectPlayer.name}
        onBack={() => setInspectPlayer(null)}
      />
    );
  }

  if (view === "create" || view === "edit") {
    const isEdit = view === "edit";
    return (
      <div className="space-y-4 animate-panel">
        <button
          type="button"
          onClick={leaveForm}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--line-strong)]"
        >
          <span aria-hidden>←</span>
          {isEdit ? "Back to event" : "All events"}
        </button>

        <SectionCard
          eyebrow="Events"
          title={isEdit ? "Edit event" : "Create event"}
          description={
            isEdit
              ? "Update format, eligibility, venue, or close registration."
              : "Set the format, Fargo band, entry, and venue. Players can browse and sign up from Events."
          }
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
            <form onSubmit={onSaveForm} className="space-y-5 p-3 sm:p-4">
              {error ? (
                <p className="rounded-xl border border-[var(--danger)]/40 bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger)]">
                  {error}
                </p>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                {isEdit ? (
                  <div className="sm:col-span-2">
                    <Field label="Status">
                      <SelectField
                        aria-label="Status"
                        value={
                          form.status === "full" ? "open" : form.status
                        }
                        options={ORGANIZER_STATUS_OPTIONS}
                        onChange={(status) =>
                          setForm((p) => ({ ...p, status }))
                        }
                      />
                    </Field>
                  </div>
                ) : null}
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
                  <SelectField
                    aria-label="Game"
                    value={form.gameType}
                    options={GAME_TYPE_OPTIONS}
                    onChange={(gameType) =>
                      setForm((p) => ({ ...p, gameType }))
                    }
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
                  <SelectField
                    aria-label="Unrated players"
                    value={form.unratedPolicy ?? "message-organizer"}
                    options={UNRATED_POLICY_OPTIONS}
                    onChange={(unratedPolicy) =>
                      setForm((p) => ({ ...p, unratedPolicy }))
                    }
                  />
                </Field>
                <Field label={maxEntriesLabel(form.eventType)}>
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
                {form.eventType !== "singles" ? (
                  <Field
                    label={
                      form.eventType === "scotch-doubles"
                        ? "Players per pair"
                        : "Players per team"
                    }
                  >
                    <input
                      required
                      type="number"
                      min={form.eventType === "scotch-doubles" ? 2 : 2}
                      max={12}
                      className={fieldClass}
                      value={form.teamSize ?? defaultTeamSize(form.eventType)}
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
                <Field label="Payment">
                  <SelectField
                    aria-label="Payment"
                    value={form.payMethod ?? "door"}
                    options={PAY_METHOD_OPTIONS}
                    onChange={(payMethod) =>
                      setForm((p) => ({ ...p, payMethod }))
                    }
                  />
                </Field>
                <Field label="Registration">
                  <SelectField
                    aria-label="Registration"
                    value={form.registrationMode ?? "approval"}
                    options={REGISTRATION_MODE_OPTIONS}
                    onChange={(registrationMode) =>
                      setForm((p) => ({ ...p, registrationMode }))
                    }
                  />
                </Field>
                <Field label="Ruleset">
                  <SelectField
                    aria-label="Ruleset"
                    value={form.rulesetPreset ?? "bca"}
                    options={RULESET_OPTIONS}
                    onChange={(rulesetPreset) =>
                      setForm((p) => ({ ...p, rulesetPreset }))
                    }
                  />
                </Field>
                <Field label="Table size">
                  <SelectField
                    aria-label="Table size"
                    value={form.tableSize ?? "7ft"}
                    options={TABLE_SIZE_OPTIONS}
                    onChange={(tableSize) =>
                      setForm((p) => ({ ...p, tableSize }))
                    }
                  />
                </Field>
                <Field label="Starts">
                  <DateTimeField
                    required
                    aria-label="Starts"
                    value={form.startsAt}
                    onChange={(startsAt) =>
                      setForm((p) => ({ ...p, startsAt }))
                    }
                    placeholder="Pick start date & time"
                  />
                </Field>
                <Field label="Check-in">
                  <DateTimeField
                    aria-label="Check-in"
                    value={form.checkInAt ?? ""}
                    onChange={(checkInAt) =>
                      setForm((p) => ({
                        ...p,
                        checkInAt: checkInAt || null,
                      }))
                    }
                    placeholder="Optional check-in time"
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
                  <SelectField
                    aria-label="Region"
                    value={form.region ?? "Palm Beach"}
                    options={FL_REGIONS.map((r) => ({ value: r, label: r }))}
                    onChange={(region) => setForm((p) => ({ ...p, region }))}
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
                  {saving
                    ? isEdit
                      ? "Saving…"
                      : "Publishing…"
                    : isEdit
                      ? "Save changes"
                      : "Publish event"}
                </button>
                <button
                  type="button"
                  onClick={leaveForm}
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
    const isOrganizer = Boolean(detail?.isOrganizer);
    const activeTab: DetailSubTab = isOrganizer ? detailSubTab : "overview";
    const gameLabel = t ? gameTypeLabel(t.gameType) : "";
    const formatLabel =
      t
        ? (BRACKET_FORMAT_OPTIONS.find((o) => o.value === t.bracketFormat)
            ?.label ?? t.bracketFormat)
        : "";
    const paymentLabel =
      t
        ? (PAY_METHOD_OPTIONS.find((o) => o.value === t.payMethod)?.label ??
          t.payMethod)
        : "";

    const overviewSignup = t ? (
      <>
        {actionMsg ? (
          <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--felt-deep)]">
            {actionMsg}
          </p>
        ) : null}

        {myRegistration ? (
          <SurfaceCard>
            <div className="space-y-2 p-3 sm:p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                Your entry
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[var(--felt)] px-2.5 py-1 text-[11px] font-semibold capitalize text-white">
                  {myRegistration.status}
                </span>
                <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)]">
                  {myRegistration.paid ? "Paid" : "Unpaid"}
                </span>
                {myRegistration.checkedIn ? (
                  <span className="rounded-full bg-[var(--felt)] px-2.5 py-1 text-[11px] font-semibold text-white">
                    Checked in
                  </span>
                ) : null}
                <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)]">
                  {myRegistration.ratingAtSignup != null
                    ? `Fargo ${myRegistration.ratingAtSignup}`
                    : "Unrated"}
                </span>
              </div>
              {myRegistration.teamName || myRegistration.teammates?.length ? (
                <div>
                  <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--ink)]">
                    {myRegistration.teamName || myRegistration.displayName}
                  </p>
                  {myRegistration.teammates?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {myRegistration.teammates.map((mate) => (
                        <span
                          key={`${mate.displayName}-${mate.ratingAtSignup ?? "x"}`}
                          className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink)]"
                        >
                          {mate.displayName}
                          {mate.ratingAtSignup != null
                            ? ` · ${mate.ratingAtSignup}`
                            : ""}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </SurfaceCard>
        ) : t.status === "open" ? (
          <SurfaceCard>
            <div className="space-y-3 p-3 sm:p-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                  {t.eventType === "teams"
                    ? "Register your team"
                    : t.eventType === "scotch-doubles"
                      ? "Register your pair"
                      : "Sign up"}
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {entryShapeText(t)}
                  {t.minFargo != null || t.maxFargo != null
                    ? ` · Fargo ${fargoBandText(t)}`
                    : ""}
                </p>
              </div>
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
                  <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)]/60 px-3 py-2.5">
                    <p className={labelClass}>Your Fargo</p>
                    <p className="text-sm font-semibold text-[var(--ink)]">
                      {fargoLoading
                        ? "Looking up…"
                        : resolvedFargo != null
                          ? resolvedFargo
                          : "Unrated"}
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--muted)]">
                      From your FargoRate account — locked at signup.
                    </p>
                  </div>

                  {resolvedFargo == null && !fargoLoading ? (
                    <p className="text-xs text-[var(--muted)]">
                      No Fargo on file. You can still request a spot
                      {t.unratedPolicy === "message-organizer"
                        ? " — message the organizer if needed"
                        : ""}
                      .
                    </p>
                  ) : null}

                  {t.eventType === "teams" ? (
                    <Field label="Team name">
                      <input
                        required
                        className={fieldClass}
                        value={teamName}
                        onChange={(e) => setTeamName(e.target.value)}
                        placeholder="Team name"
                      />
                    </Field>
                  ) : null}

                  {t.eventType === "scotch-doubles" ? (
                    <Field label="Pair name (optional)">
                      <input
                        className={fieldClass}
                        value={teamName}
                        onChange={(e) => setTeamName(e.target.value)}
                        placeholder="e.g. Smith / Lee"
                      />
                    </Field>
                  ) : null}

                  {t.eventType !== "singles"
                    ? teammates.map((mate, index) => (
                        <div
                          key={`mate-${index}`}
                          className="grid gap-2 sm:grid-cols-[1fr_7rem]"
                        >
                          <Field
                            label={
                              t.eventType === "scotch-doubles"
                                ? "Partner name"
                                : `Teammate ${index + 1}`
                            }
                          >
                            <input
                              className={fieldClass}
                              value={mate.displayName}
                              onChange={(e) =>
                                setTeammates((prev) =>
                                  prev.map((row, i) =>
                                    i === index
                                      ? { ...row, displayName: e.target.value }
                                      : row,
                                  ),
                                )
                              }
                              placeholder={
                                t.eventType === "scotch-doubles"
                                  ? "Partner full name"
                                  : "Player name"
                              }
                            />
                          </Field>
                          <Field label="Fargo">
                            <input
                              type="number"
                              min={0}
                              className={fieldClass}
                              value={mate.ratingAtSignup}
                              onChange={(e) =>
                                setTeammates((prev) =>
                                  prev.map((row, i) =>
                                    i === index
                                      ? {
                                          ...row,
                                          ratingAtSignup: e.target.value,
                                        }
                                      : row,
                                  ),
                                )
                              }
                              placeholder="Opt."
                            />
                          </Field>
                        </div>
                      ))
                    : null}

                  {t.eventType === "teams" ? (
                    <button
                      type="button"
                      onClick={() =>
                        setTeammates((prev) => [
                          ...prev,
                          { displayName: "", ratingAtSignup: "" },
                        ])
                      }
                      className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)]"
                    >
                      Add teammate
                    </button>
                  ) : null}

                  <Field label="Note to organizer">
                    <textarea
                      className={`${fieldClass} min-h-[72px] resize-y`}
                      value={regNote}
                      onChange={(e) => setRegNote(e.target.value)}
                      placeholder="Venmo handle, questions…"
                    />
                  </Field>
                  <button
                    type="button"
                    disabled={saving || fargoLoading}
                    onClick={() => void onRegister()}
                    className="rounded-full bg-[var(--felt)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {saving
                      ? "Submitting…"
                      : t.eventType === "teams"
                        ? "Request team spot"
                        : t.eventType === "scotch-doubles"
                          ? "Request pair spot"
                          : "Request spot"}
                  </button>
                </>
              )}
            </div>
          </SurfaceCard>
        ) : null}

        {(t.unratedPolicy === "message-organizer" || !user) &&
        !myRegistration ? (
          <SurfaceCard>
            <form onSubmit={onSendMessage} className="space-y-3 p-3 sm:p-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                  Message organizer
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  For unrated players or questions before signup.
                </p>
              </div>
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
                className="rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-4 py-2 text-sm font-semibold text-[var(--ink)] disabled:opacity-50"
              >
                Send message
              </button>
            </form>
          </SurfaceCard>
        ) : null}
      </>
    ) : null;

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
            setDetailSubTab("overview");
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
              description={
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-white/90">
                    {formatStartsAt(t.startsAt)}
                  </p>
                  <p>
                    {gameTypeLabel(t.gameType)}
                    {" · "}
                    {handicapShort(t.handicapSystem)}
                    {" · "}
                    {t.maxFargo != null
                      ? `Fargo cap ${t.maxFargo}`
                      : "Open Fargo"}
                  </p>
                </div>
              }
              badge={{
                label: "Fargo",
                value: fargoCapText(t),
              }}
            />

            {isOrganizer ? (
              <div
                role="tablist"
                aria-label="Event organizer sections"
                className="grid grid-cols-4 gap-0.5 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-0.5"
              >
                {(
                  [
                    { id: "overview" as const, label: "Overview" },
                    {
                      id: "signups" as const,
                      label:
                        t.pendingCount > 0
                          ? `Signups (${t.pendingCount})`
                          : "Signups",
                    },
                    { id: "field" as const, label: "Field" },
                    { id: "manage" as const, label: "Manage" },
                  ] as const
                ).map((item) => {
                  const selected = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() =>
                        startDetailTransition(() => setDetailSubTab(item.id))
                      }
                      className={[
                        "rounded-lg px-1.5 py-1.5 text-center text-[11px] font-semibold transition sm:px-2 sm:text-sm",
                        selected
                          ? "bg-[var(--felt)] text-white shadow-sm"
                          : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]",
                      ].join(" ")}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {activeTab === "overview" ? (
              <div className="space-y-4">
                <SurfaceCard>
                  {t.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={t.thumbnailUrl}
                      alt=""
                      className="h-44 w-full object-cover sm:h-56"
                    />
                  ) : (
                    <div className="relative h-28 overflow-hidden bg-[linear-gradient(145deg,rgba(29,110,158,0.55),rgba(19,78,115,0.85))] sm:h-32">
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 opacity-40"
                        style={{
                          background:
                            "radial-gradient(120% 80% at 100% 0%, rgba(224,163,90,0.35), transparent 55%)",
                        }}
                      />
                      <div className="relative flex h-full items-end px-4 py-3">
                        <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-white/90">
                          Match night
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="space-y-3 p-3 sm:p-4">
                    <p className="text-sm text-[var(--muted)]">
                      <span
                        className={[
                          "mr-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold",
                          statusTone(t.status),
                        ].join(" ")}
                      >
                        {STATUS_LABELS[t.status]}
                      </span>
                      {formatEntryFee(t.entryFeeCents)}
                      {" · "}
                      {t.approvedCount}/{t.maxPlayers}{" "}
                      {entryNoun(t.eventType)} in
                    </p>
                    {t.description ? (
                      <p className="text-sm leading-relaxed text-[var(--ink)]">
                        {t.description}
                      </p>
                    ) : null}
                    <p className="text-xs text-[var(--muted)]">
                      {entryShapeText(t)}
                      {" · "}
                      Fargo {fargoBandText(t)}
                      {" · "}
                      {t.tableSize} tables
                    </p>
                  </div>
                </SurfaceCard>

                <div>
                  <p className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                    The rack
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <StatTile label="Game" value={gameLabel} />
                    <StatTile
                      label="Format"
                      value={formatLabel}
                      delayClass="animate-delay-1"
                    />
                    <StatTile
                      label="Handicap"
                      value={handicapLabel(t.handicapSystem)}
                      delayClass="animate-delay-1"
                    />
                    <StatTile
                      label="Race"
                      value={raceText(t)}
                      delayClass="animate-delay-2"
                    />
                  </div>
                </div>

                <SurfaceCard>
                  <button
                    type="button"
                    onClick={() => setHouseRulesOpen((open) => !open)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left sm:px-4"
                  >
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                        House rules
                      </p>
                      <p className="mt-1 text-sm text-[var(--ink)]">
                        Payment, tables, organizer
                      </p>
                    </div>
                    <span className="text-[var(--muted)]" aria-hidden>
                      {houseRulesOpen ? "▴" : "▾"}
                    </span>
                  </button>
                  {houseRulesOpen ? (
                    <div className="space-y-3 border-t border-[var(--line)] px-3 py-3 sm:px-4">
                      <dl className="grid gap-3 sm:grid-cols-2">
                        {[
                          ["Fargo band", fargoBandText(t)],
                          ["Tables", t.tableSize],
                          ["Payment", paymentLabel],
                          ["Organizer", t.organizerName],
                          [
                            "Registration",
                            REGISTRATION_MODE_OPTIONS.find(
                              (o) => o.value === t.registrationMode,
                            )?.label ?? t.registrationMode,
                          ],
                          [
                            "Ruleset",
                            RULESET_OPTIONS.find(
                              (o) => o.value === t.rulesetPreset,
                            )?.label ?? t.rulesetPreset,
                          ],
                        ].map(([label, value]) => (
                          <div key={label}>
                            <dt className={labelClass}>{label}</dt>
                            <dd className="text-sm text-[var(--ink)]">
                              {value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                      {t.payoutNotes ? (
                        <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--muted)]">
                          {t.payoutNotes}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </SurfaceCard>

                {overviewSignup}
              </div>
            ) : null}

            {isOrganizer && activeTab === "signups" ? (
              <div className="space-y-4">
                <SectionCard
                  eyebrow="Organizer"
                  title="Signups"
                  description="Review Fargo and robustness, open player stats, then approve or reject."
                  badge={{
                    label: "Pending",
                    value: String(t.pendingCount),
                  }}
                />
                {actionMsg ? (
                  <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--felt-deep)]">
                    {actionMsg}
                  </p>
                ) : null}

                <div>
                  <p className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                    Requests
                    {pendingRegistrations.length
                      ? ` · ${pendingRegistrations.length}`
                      : ""}
                  </p>
                  {pendingRegistrations.length === 0 ? (
                    <SurfaceCard>
                      <p className="px-4 py-6 text-center text-sm text-[var(--muted)]">
                        No pending requests.
                      </p>
                    </SurfaceCard>
                  ) : (
                    <ul className="space-y-3">
                      {pendingRegistrations.map((reg) => {
                        const stats = statsForRegistration(reg);
                        return (
                          <li key={reg.id}>
                            <SurfaceCard className="animate-rise">
                              <div className="space-y-3 p-3 sm:p-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0 flex-1">
                                    <p className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-[var(--ink)]">
                                      {reg.teamName || reg.displayName}
                                    </p>
                                    <p className="mt-0.5 text-sm text-[var(--muted)]">
                                      {reg.displayName}
                                      {reg.email ? ` · ${reg.email}` : ""}
                                    </p>
                                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                                      <span className="rounded-full bg-[var(--amber)] px-2.5 py-1 text-[11px] font-semibold text-[#1a140c]">
                                        Pending
                                      </span>
                                      <span
                                        className={[
                                          "rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]",
                                          robustnessClass(stats.robustnessStatus),
                                        ].join(" ")}
                                      >
                                        {robustnessLabel(stats.robustnessStatus)}
                                        {stats.robustness != null
                                          ? ` · ${Math.round(stats.robustness)}`
                                          : ""}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="shrink-0 text-right">
                                    <p className="font-[family-name:var(--font-display)] text-3xl font-semibold tabular-nums leading-none text-[var(--felt-deep)]">
                                      {stats.rating ?? "—"}
                                    </p>
                                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                                      Fargo
                                    </p>
                                  </div>
                                </div>

                                {reg.teammates?.length ? (
                                  <div className="flex flex-wrap gap-1.5">
                                    {reg.teammates.map((mate) => (
                                      <span
                                        key={`${reg.id}-${mate.displayName}`}
                                        className="rounded-full border border-[var(--line)] bg-[var(--surface-2)]/70 px-2.5 py-1 text-[11px] font-semibold text-[var(--ink)]"
                                      >
                                        {mate.displayName}
                                        {mate.ratingAtSignup != null
                                          ? ` · ${mate.ratingAtSignup}`
                                          : ""}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}

                                {reg.noteToOrganizer ? (
                                  <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)]/60 px-3 py-2 text-xs text-[var(--ink)]">
                                    {reg.noteToOrganizer}
                                  </p>
                                ) : null}

                                <div className="flex flex-wrap gap-2">
                                  {stats.playerId ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setInspectPlayer({
                                          id: stats.playerId!,
                                          name: reg.displayName,
                                        })
                                      }
                                      className="rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-2 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--line-strong)]"
                                    >
                                      Player details
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    disabled={saving}
                                    onClick={() =>
                                      void onUpdateRegistration(reg.id, {
                                        status: "approved",
                                      })
                                    }
                                    className="rounded-full bg-[var(--felt)] px-3.5 py-2 text-xs font-semibold text-white"
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
                                    className="rounded-full border border-[var(--line)] px-3.5 py-2 text-xs font-semibold text-[var(--danger)]"
                                  >
                                    Reject
                                  </button>
                                </div>
                              </div>
                            </SurfaceCard>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {otherRegistrations.length > 0 ? (
                  <div>
                    <p className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                      Reviewed
                    </p>
                    <SurfaceCard>
                      <ul className="divide-y divide-[var(--line)]">
                        {otherRegistrations.map((reg) => {
                          const stats = statsForRegistration(reg);
                          return (
                            <li
                              key={reg.id}
                              className="flex flex-wrap items-start justify-between gap-3 px-3 py-3.5 sm:px-4"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--ink)]">
                                  {reg.teamName || reg.displayName}
                                </p>
                                <p className="mt-0.5 text-xs text-[var(--muted)]">
                                  {reg.displayName}
                                  {stats.rating != null
                                    ? ` · Fargo ${stats.rating}`
                                    : " · Unrated"}
                                  {stats.robustness != null
                                    ? ` · Rob ${Math.round(stats.robustness)}`
                                    : ""}
                                </p>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  <span
                                    className={[
                                      "rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize",
                                      reg.status === "approved"
                                        ? "bg-[var(--felt)] text-white"
                                        : "bg-[var(--surface-2)] text-[var(--muted)]",
                                    ].join(" ")}
                                  >
                                    {reg.status}
                                  </span>
                                  <span
                                    className={[
                                      "rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]",
                                      robustnessClass(stats.robustnessStatus),
                                    ].join(" ")}
                                  >
                                    {robustnessLabel(stats.robustnessStatus)}
                                  </span>
                                  {reg.status === "approved" ? (
                                    <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)]">
                                      {reg.paid ? "Paid" : "Unpaid"}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {stats.playerId ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setInspectPlayer({
                                        id: stats.playerId!,
                                        name: reg.displayName,
                                      })
                                    }
                                    className="rounded-full border border-[var(--line)] px-3 py-1.5 text-[11px] font-semibold text-[var(--ink)]"
                                  >
                                    Details
                                  </button>
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
                            </li>
                          );
                        })}
                      </ul>
                    </SurfaceCard>
                  </div>
                ) : null}
              </div>
            ) : null}

            {isOrganizer && activeTab === "field" ? (
              <div className="space-y-4">
                <SectionCard
                  eyebrow="Organizer"
                  title="Field board"
                  description="Night-of check-in and door/Venmo paid tracking for approved entries."
                  badge={{
                    label: "In",
                    value: `${fieldStats.checkedIn}/${fieldStats.approved || 0}`,
                  }}
                />

                <div className="grid grid-cols-3 gap-2">
                  <StatTile label="Approved" value={String(fieldStats.approved)} />
                  <StatTile
                    label="Checked in"
                    value={String(fieldStats.checkedIn)}
                    delayClass="animate-delay-1"
                  />
                  <StatTile
                    label="Paid"
                    value={String(fieldStats.paid)}
                    delayClass="animate-delay-2"
                  />
                </div>

                <SurfaceCard>
                  <div className="space-y-3 border-b border-[var(--line)] px-3 py-3 sm:px-4">
                    <SearchField
                      embedded
                      value={fieldQuery}
                      onChange={setFieldQuery}
                      placeholder="Find entry or player…"
                      label="Search field board"
                    />
                    <div
                      role="group"
                      aria-label="Field board filters"
                      className="grid grid-cols-3 gap-0.5 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-0.5"
                    >
                      {(
                        [
                          { id: "all" as const, label: "All" },
                          {
                            id: "not-checked-in" as const,
                            label: "Not in",
                          },
                          { id: "unpaid" as const, label: "Unpaid" },
                        ] as const
                      ).map((item) => {
                        const selected = fieldFilter === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setFieldFilter(item.id)}
                            className={[
                              "rounded-lg px-2 py-1.5 text-center text-xs font-semibold transition",
                              selected
                                ? "bg-[var(--felt)] text-white shadow-sm"
                                : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]",
                            ].join(" ")}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {actionMsg ? (
                    <p className="mx-3 mt-3 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--felt-deep)] sm:mx-4">
                      {actionMsg}
                    </p>
                  ) : null}

                  <ul className="divide-y divide-[var(--line)]">
                    {fieldEntries.length === 0 ? (
                      <li className="px-4 py-6 text-center text-sm text-[var(--muted)]">
                        {fieldStats.approved === 0
                          ? "No approved entries yet — approve signups first."
                          : "No entries match this filter."}
                      </li>
                    ) : (
                      fieldEntries.map((reg) => (
                        <li
                          key={reg.id}
                          className="space-y-3 px-3 py-3.5 sm:px-4"
                        >
                          <div className="min-w-0">
                            <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--ink)]">
                              {reg.teamName || reg.displayName}
                            </p>
                            <p className="mt-0.5 text-xs text-[var(--muted)]">
                              {reg.displayName}
                              {reg.ratingAtSignup != null
                                ? ` · ${reg.ratingAtSignup}`
                                : ""}
                              {reg.checkedInAt
                                ? ` · In ${formatStartsAt(reg.checkedInAt)}`
                                : ""}
                            </p>
                            {reg.teammates?.length ? (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {reg.teammates.map((mate) => (
                                  <span
                                    key={`${reg.id}-field-${mate.displayName}`}
                                    className="rounded-full border border-[var(--line)] bg-[var(--surface-2)]/70 px-2.5 py-1 text-[11px] font-semibold text-[var(--ink)]"
                                  >
                                    {mate.displayName}
                                    {mate.ratingAtSignup != null
                                      ? ` · ${mate.ratingAtSignup}`
                                      : ""}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() =>
                                void onUpdateRegistration(reg.id, {
                                  checkedIn: !reg.checkedIn,
                                })
                              }
                              className={[
                                "rounded-xl px-3 py-2.5 text-sm font-semibold transition disabled:opacity-50",
                                reg.checkedIn
                                  ? "bg-[var(--felt)] text-white"
                                  : "border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]",
                              ].join(" ")}
                            >
                              {reg.checkedIn ? "Checked in" : "Check in"}
                            </button>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() =>
                                void onUpdateRegistration(reg.id, {
                                  paid: !reg.paid,
                                })
                              }
                              className={[
                                "rounded-xl px-3 py-2.5 text-sm font-semibold transition disabled:opacity-50",
                                reg.paid
                                  ? "bg-[var(--amber)] text-[#1a140c]"
                                  : "border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]",
                              ].join(" ")}
                            >
                              {reg.paid ? "Paid" : "Mark paid"}
                            </button>
                          </div>
                        </li>
                      ))
                    )}
                  </ul>
                </SurfaceCard>
              </div>
            ) : null}

            {isOrganizer && activeTab === "manage" ? (
              <div className="space-y-4">
                <SectionCard
                  eyebrow="Organizer"
                  title="Manage"
                  description="Edit the flyer, close registration, or review messages."
                />
                <SurfaceCard>
                  <div className="flex flex-wrap gap-2 p-3 sm:p-4">
                    <button
                      type="button"
                      onClick={() => startEdit(t)}
                      className="rounded-full bg-[var(--felt)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--felt-soft)]"
                    >
                      Edit event
                    </button>
                    {t.status === "open" || t.status === "full" ? (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() =>
                          void setTournamentStatus(
                            t.id,
                            "closed",
                            "Registration closed.",
                          )
                        }
                        className="rounded-full border border-[var(--line)] px-4 py-2.5 text-sm font-semibold text-[var(--ink)] disabled:opacity-50"
                      >
                        Close registration
                      </button>
                    ) : t.status === "closed" || t.status === "draft" ? (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() =>
                          void setTournamentStatus(
                            t.id,
                            "open",
                            "Registration reopened.",
                          )
                        }
                        className="rounded-full border border-[var(--line)] px-4 py-2.5 text-sm font-semibold text-[var(--ink)] disabled:opacity-50"
                      >
                        Reopen registration
                      </button>
                    ) : null}
                  </div>
                </SurfaceCard>

                {actionMsg ? (
                  <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--felt-deep)]">
                    {actionMsg}
                  </p>
                ) : null}

                {t.payoutNotes ? (
                  <SurfaceCard>
                    <div className="space-y-1 px-3 py-3 sm:px-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                        Payout notes
                      </p>
                      <p className="text-sm text-[var(--ink)]">{t.payoutNotes}</p>
                    </div>
                  </SurfaceCard>
                ) : null}

                <SurfaceCard>
                  <div className="border-b border-[var(--line)] px-3 py-3 sm:px-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                      Messages
                    </p>
                  </div>
                  {detail.messages.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-[var(--muted)]">
                      No messages yet.
                    </p>
                  ) : (
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
                  )}
                </SurfaceCard>
              </div>
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
                setEditingId(null);
                setForm(emptyForm());
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
            <SelectField
              aria-label="Filter by region"
              value={region}
              placeholder="All regions"
              options={[
                { value: "", label: "All regions" },
                ...FL_REGIONS.map((r) => ({ value: r, label: r })),
              ]}
              onChange={setRegion}
            />
            <SelectField
              aria-label="Filter by game"
              value={gameType}
              placeholder="All games"
              options={[
                { value: "", label: "All games" },
                ...GAME_TYPE_OPTIONS,
              ]}
              onChange={(next) => setGameType(next as GameType | "")}
            />
            <label className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--ink)]">
              <input
                type="checkbox"
                checked={eligibleOnly}
                onChange={(e) => setEligibleOnly(e.target.checked)}
                disabled={resolvedFargo == null}
              />
              Eligible for my Fargo
              {resolvedFargo != null ? ` (${resolvedFargo})` : ""}
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
                  onClick={() => {
                    setEditingId(null);
                    setForm(emptyForm());
                    setView("create");
                  }}
                  className="rounded-xl bg-[var(--felt)] px-4 py-2.5 text-sm font-semibold text-white"
                >
                  Create event
                </button>
              }
            />
          ) : (
            <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius)] border border-[var(--line)]">
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
                      <p className="mt-0.5 text-xs font-medium text-[var(--ink)]">
                        {formatStartsAt(event.startsAt)}
                      </p>
                      <p className="mt-1 text-[11px] text-[var(--muted)]">
                        {eventKeyFacts(event)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                        {event.venueName}, {event.city}
                        {" · "}
                        {formatEntryFee(event.entryFeeCents)}
                        {" · "}
                        {event.spotsLeft} {entryNoun(event.eventType)} left
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
