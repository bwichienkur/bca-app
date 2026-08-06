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
import { createPortal } from "react-dom";
import {
  BRACKET_FORMAT_OPTIONS,
  BREAK_FORMAT_OPTIONS,
  CREATE_STATUS_OPTIONS,
  defaultTeamSize,
  DRAW_TYPE_OPTIONS,
  entryNoun,
  EVENT_TYPE_OPTIONS,
  FL_REGIONS,
  formatEntryFee,
  formatStartsAt,
  GAME_TYPE_OPTIONS,
  HANDICAP_SYSTEM_OPTIONS,
  maxEntriesLabel,
  meetsMinRobustness,
  MIN_ROBUSTNESS_OPTIONS,
  minRobustnessLabel,
  ORGANIZER_STATUS_OPTIONS,
  PAY_METHOD_OPTIONS,
  REGISTRATION_MODE_OPTIONS,
  robustnessStatusLabel,
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
  TournamentEntryTeam,
  TournamentListItem,
  TournamentMessage,
  TournamentRegistration,
  TournamentStatus,
  TournamentTemplate,
  TournamentTemplateForm,
} from "@/lib/tournaments/types";

type HandicapFilter = "" | "handicapped" | "scratch";
import { BackButton } from "./BackButton";
import {
  IconSubTabs,
  LineupsSubIcon,
  OverviewSubIcon,
  RosterSubIcon,
} from "./IconSubTabs";
import type { AuthUser } from "./LoginScreen";
import { DateField } from "./DateField";
import { DateTimeField } from "./DateTimeField";
import { EmptyState } from "./EmptyState";
import { LoadingState } from "./LoadingState";
import {
  PartnerSearchField,
  type PartnerPick,
} from "./PartnerSearchField";
import { PlayerDetail } from "./PlayerDetail";
import { SearchField } from "./SearchField";
import { SectionCard } from "./SectionCard";
import { SelectField } from "./SelectField";
import { TournamentCalcuttaPanel } from "./TournamentCalcutta";
import {
  EntryTeamsPresetsPanel,
  TemplatesPresetsPanel,
} from "./TournamentPresets";

type View = "browse" | "create" | "edit" | "detail";
type BrowseSubTab = "browse" | "teams" | "templates";
type DetailSubTab = "overview" | "signups" | "field" | "calcutta" | "manage";
type OverviewDetailTab = "when" | "match" | "pay" | "contact" | "entry";
type FieldBoardFilter = "all" | "not-checked-in" | "unpaid";
type SignupStatusFilter =
  | "pending"
  | "approved"
  | "waitlisted"
  | "rejected";
type SignupQueueSort = "oldest" | "fargo";

const EVENTS_PAGE_SIZE = 10;

function eventsPageNumbers(
  current: number,
  total: number,
): Array<number | "…"> {
  if (total <= 5) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }
  const pages = new Set<number>([1, total, current]);
  if (current - 1 > 1) pages.add(current - 1);
  if (current + 1 < total) pages.add(current + 1);
  const sorted = [...pages].sort((a, b) => a - b);
  const out: Array<number | "…"> = [];
  for (let i = 0; i < sorted.length; i += 1) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push("…");
    out.push(sorted[i]);
  }
  return out;
}

const SIGNUP_STATUS_FILTERS: Array<{
  value: SignupStatusFilter;
  label: string;
}> = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "waitlisted", label: "Waitlist" },
  { value: "rejected", label: "Rejected" },
];

const SIGNUP_QUEUE_SORT_OPTIONS: Array<{
  value: SignupQueueSort;
  label: string;
}> = [
  { value: "oldest", label: "Oldest first" },
  { value: "fargo", label: "Highest Fargo" },
];

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
  /** Jump to Players search and look up a signup name (no Fargo id). */
  onFindPlayer?: (name: string) => void;
  /** Open this event from a shared URL (`?tab=events&event=`). */
  deepLinkEventId?: string | null;
  onDeepLinkEventIdChange?: (eventId: string | null) => void;
};

const fieldClass =
  "w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:ring-2 focus:ring-[var(--felt-soft)]";
const labelClass =
  "mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]";

/** Premium solid text actions for signup request rows. */
const signupActionBtn =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-[var(--radius)] px-3 text-[11px] font-semibold tracking-[0.04em] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_1px_2px_rgba(0,0,0,0.35)] transition-[filter,transform] hover:brightness-110 active:translate-y-px disabled:opacity-50";
const signupApproveBtn = `${signupActionBtn} bg-[linear-gradient(180deg,#2f8fc2_0%,var(--felt)_45%,var(--felt-soft)_100%)] text-white`;
const signupWaitlistBtn = `${signupActionBtn} bg-[linear-gradient(180deg,#edc48a_0%,var(--amber)_48%,#c4893f_100%)] text-[#1a140c]`;
const signupRejectBtn = `${signupActionBtn} bg-[linear-gradient(180deg,#e0726a_0%,#c44a42_48%,#9e342e_100%)] text-white`;
const signupRevertBtn = `${signupActionBtn} bg-[linear-gradient(180deg,#3d4b58_0%,#2a3540_48%,#222b35_100%)] text-[var(--ink)]`;
const signupInlineIconBtn =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius)] text-[var(--felt-deep)] transition hover:bg-[color-mix(in_srgb,var(--chalk)_18%,transparent)] hover:text-[var(--chalk)]";
const signupBulkBtn =
  "inline-flex h-9 flex-1 items-center justify-center rounded-[var(--radius)] px-3.5 text-[11px] font-semibold tracking-[0.04em] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_1px_2px_rgba(0,0,0,0.35)] transition-[filter,transform] hover:brightness-110 active:translate-y-px disabled:opacity-50 sm:flex-none";
const signupBulkApproveBtn = `${signupBulkBtn} bg-[linear-gradient(180deg,#2f8fc2_0%,var(--felt)_45%,var(--felt-soft)_100%)] text-white`;
const signupBulkWaitlistBtn = `${signupBulkBtn} bg-[linear-gradient(180deg,#edc48a_0%,var(--amber)_48%,#c4893f_100%)] text-[#1a140c]`;
const signupBulkRejectBtn = `${signupBulkBtn} bg-[linear-gradient(180deg,#e0726a_0%,#c44a42_48%,#9e342e_100%)] text-white`;
const fieldToggleBtn =
  "inline-flex h-7 w-[2.65rem] shrink-0 items-center justify-center rounded-[var(--radius)] px-1.5 text-[11px] font-semibold transition disabled:opacity-50";
const fieldToggleIdle = `${fieldToggleBtn} border border-[var(--line)] bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--ink)]`;
const fieldToggleCheckedIn = `${fieldToggleBtn} bg-[var(--felt)] text-white`;
const fieldTogglePaid = `${fieldToggleBtn} bg-[var(--amber)] text-[#1a140c]`;
const manageActionTile =
  "flex w-full items-center gap-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-3 text-left transition hover:bg-[var(--surface-3)] disabled:cursor-not-allowed disabled:opacity-50";
const manageActionIcon =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius)] shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]";

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

function TabIconShell({
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

function OverviewTabIcon({ className }: { className?: string }) {
  return (
    <TabIconShell className={className}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </TabIconShell>
  );
}

function SignupsTabIcon({ className }: { className?: string }) {
  return (
    <TabIconShell className={className}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="3" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a3 3 0 0 1 0 5.74" />
    </TabIconShell>
  );
}

function FieldTabIcon({ className }: { className?: string }) {
  return (
    <TabIconShell className={className}>
      <path d="M9 11 12 14l8-8" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </TabIconShell>
  );
}

function CalcuttaTabIcon({ className }: { className?: string }) {
  return (
    <TabIconShell className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.5 0-2.5 1-2.5 2.2 0 2.3 5 1.2 5 4.1 0 1.4-1.2 2.5-3 2.5-1.2 0-2.2-.5-2.8-1.5" />
      <path d="M12 6.5v1.2M12 16.3V17.5" />
    </TabIconShell>
  );
}

function ManageTabIcon({ className }: { className?: string }) {
  return (
    <TabIconShell className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" />
    </TabIconShell>
  );
}

function WhenDetailIcon({ className }: { className?: string }) {
  return (
    <TabIconShell className={className}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="M8 14h2M12 14h2M16 14h.01M8 17h2M12 17h2" />
    </TabIconShell>
  );
}

function MatchDetailIcon({ className }: { className?: string }) {
  return (
    <TabIconShell className={className}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 3v3.5M12 17.5V21M3 12h3.5M17.5 12H21" />
    </TabIconShell>
  );
}

function PayDetailIcon({ className }: { className?: string }) {
  return (
    <TabIconShell className={className}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18" />
      <path d="M14.5 14.2c-.4-.7-1.1-1-1.9-1-1.1 0-1.9.7-1.9 1.6 0 1.6 3.8.9 3.8 2.9 0 1-.9 1.8-2.2 1.8-.9 0-1.6-.4-2-1.1" />
    </TabIconShell>
  );
}

function ContactDetailIcon({ className }: { className?: string }) {
  return (
    <TabIconShell className={className}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="9.5" cy="7" r="3" />
      <path d="M19 8v6" />
      <path d="M22 11h-6" />
    </TabIconShell>
  );
}

function EntryDetailIcon({ className }: { className?: string }) {
  return (
    <TabIconShell className={className}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </TabIconShell>
  );
}

function EditEventIcon({ className }: { className?: string }) {
  return (
    <TabIconShell className={className}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </TabIconShell>
  );
}

function CloseRegistrationIcon({ className }: { className?: string }) {
  return (
    <TabIconShell className={className}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </TabIconShell>
  );
}

function ReopenRegistrationIcon({ className }: { className?: string }) {
  return (
    <TabIconShell className={className}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 7.5-2" />
      <path d="M16 4v3h3" />
    </TabIconShell>
  );
}

function DigitalPoolPushIcon({ className }: { className?: string }) {
  return (
    <TabIconShell className={className}>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </TabIconShell>
  );
}

function RemoveEventIcon({ className }: { className?: string }) {
  return (
    <TabIconShell className={className}>
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M7 7l1 13h8l1-13" />
    </TabIconShell>
  );
}

function MessageIcon({ className }: { className?: string }) {
  return (
    <TabIconShell className={className}>
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4 3v-3H6.5A2.5 2.5 0 0 1 4 13.5v-7z" />
    </TabIconShell>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <TabIconShell className={className}>
      <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.5" />
    </TabIconShell>
  );
}

function FieldEstimatedFargoInput({
  disabled,
  onSave,
}: {
  disabled?: boolean;
  onSave: (rating: number) => void | Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [savingLocal, setSavingLocal] = useState(false);

  const submit = async () => {
    const parsed = Number(value.trim());
    if (!Number.isFinite(parsed)) return;
    const rounded = Math.round(parsed);
    if (rounded < 0 || rounded > 900) return;
    setSavingLocal(true);
    try {
      await onSave(rounded);
      setValue("");
    } finally {
      setSavingLocal(false);
    }
  };

  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={900}
        step={1}
        value={value}
        disabled={disabled || savingLocal}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Est."
        aria-label="Estimated Fargo"
        className="h-7 w-14 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-1.5 text-center text-[11px] font-semibold tabular-nums text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:ring-2 focus:ring-[var(--felt-soft)] disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={disabled || savingLocal || value.trim() === ""}
        className="h-7 rounded-[var(--radius)] bg-[var(--surface-3)] px-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--ink)] transition hover:bg-[var(--felt)] hover:text-white disabled:opacity-40"
      >
        Set
      </button>
    </form>
  );
}

const ORGANIZER_TAB_ICONS: Record<
  DetailSubTab,
  (props: { className?: string }) => ReactNode
> = {
  overview: OverviewTabIcon,
  signups: SignupsTabIcon,
  field: FieldTabIcon,
  calcutta: CalcuttaTabIcon,
  manage: ManageTabIcon,
};

const OVERVIEW_DETAIL_TABS = [
  { id: "when" as const, label: "When" },
  { id: "match" as const, label: "Match" },
  { id: "pay" as const, label: "Pay" },
  { id: "contact" as const, label: "Contact" },
  { id: "entry" as const, label: "Entry" },
] as const;

const OVERVIEW_DETAIL_TAB_ICONS: Record<
  OverviewDetailTab,
  (props: { className?: string }) => ReactNode
> = {
  when: WhenDetailIcon,
  match: MatchDetailIcon,
  pay: PayDetailIcon,
  contact: ContactDetailIcon,
  entry: EntryDetailIcon,
};

function registrationCardTitle(reg: TournamentRegistration): string {
  return reg.teamName?.trim() || reg.displayName;
}

function signupStatusBadge(
  status: TournamentRegistration["status"],
): ReactNode {
  if (status === "pending") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--amber)]">
        <span
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--amber)]"
          aria-hidden
        />
        Pending
      </span>
    );
  }
  if (status === "approved") {
    return (
      <span className="inline-flex shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--felt)]">
        Approved
      </span>
    );
  }
  if (status === "waitlisted") {
    return (
      <span className="inline-flex shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--amber)]">
        Waitlist
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--danger)]">
        Rejected
      </span>
    );
  }
  if (status === "withdrawn") {
    return (
      <span className="inline-flex shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
        Withdrawn
      </span>
    );
  }
  return null;
}

function SignupMessageDialog({
  name,
  body,
  onClose,
}: {
  name: string;
  body: string;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/55 p-4 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="signup-message-title"
        className="w-full max-w-md overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative overflow-hidden bg-[linear-gradient(145deg,rgba(29,110,158,0.98),rgba(19,78,115,0.96))] px-4 py-3 text-white">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              background:
                "radial-gradient(120% 80% at 100% 0%, rgba(224,163,90,0.28), transparent 55%)",
            }}
          />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--chalk)]">
                Signup message
              </p>
              <h4
                id="signup-message-title"
                className="mt-0.5 truncate font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight"
              >
                {name}
              </h4>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-[var(--radius)] bg-black/25 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/20 transition hover:bg-black/35"
            >
              Close
            </button>
          </div>
        </div>
        <div className="px-4 py-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--ink)]">
            {body}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Compact date + time parts for the signup queue timestamp column. */
function formatSignupSubmittedParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: iso, time: "" };
  return {
    date: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    time: d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }),
  };
}

/** Dense request row for organizer signup review. */
function SignupRequestRow({
  title,
  status,
  showStatus,
  submittedDate,
  submittedTime,
  rating,
  onOpenDetails,
  detailsLabel,
  teammates,
  actions,
  note,
  onShowNote,
  selectable,
  selected,
  onToggleSelect,
}: {
  title: string;
  status: TournamentRegistration["status"];
  showStatus?: boolean;
  submittedDate: string;
  submittedTime: string;
  rating: number | null;
  onOpenDetails: () => void;
  detailsLabel: string;
  teammates?: TournamentRegistration["teammates"];
  actions?: ReactNode;
  note?: string | null;
  onShowNote?: () => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const teammateHint = teammates?.length
    ? teammates
        .map((mate) =>
          mate.ratingAtSignup != null
            ? `${mate.displayName} · ${mate.ratingAtSignup}`
            : mate.displayName,
        )
        .join(", ")
    : null;

  return (
    <div
      className={[
        "px-3 py-2 sm:px-4",
        status === "pending"
          ? "bg-[color-mix(in_srgb,var(--amber)_7%,transparent)]"
          : "",
        selected ? "bg-[color-mix(in_srgb,var(--felt)_8%,transparent)]" : "",
      ].join(" ")}
    >
      <div className="flex items-start gap-1.5">
        {selectable ? (
          <label className="mt-0.5 flex h-9 w-7 shrink-0 cursor-pointer items-center justify-center">
            <input
              type="checkbox"
              checked={Boolean(selected)}
              onChange={onToggleSelect}
              aria-label={`Select ${title}`}
              className="h-4 w-4 accent-[var(--felt)]"
            />
          </label>
        ) : null}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-0.5 gap-y-0.5">
            <p className="font-[family-name:var(--font-display)] text-[14px] font-semibold leading-snug tracking-tight text-[var(--ink)]">
              <span className="break-words [overflow-wrap:anywhere]">{title}</span>
              <span className="mx-1.5 font-normal text-[var(--muted)]">·</span>
              <span className="tabular-nums text-[var(--felt-deep)]">
                {rating ?? "—"}
              </span>
            </p>
            <button
              type="button"
              onClick={onOpenDetails}
              className={signupInlineIconBtn}
              aria-label={detailsLabel}
              title="View player"
            >
              <EyeIcon className="h-3.5 w-3.5" />
            </button>
            {note ? (
              <button
                type="button"
                onClick={onShowNote}
                className={signupInlineIconBtn}
                aria-label="View signup message"
                title="Message"
              >
                <MessageIcon className="h-3.5 w-3.5" />
              </button>
            ) : null}
            {showStatus ? (
              <span className="ml-0.5">{signupStatusBadge(status)}</span>
            ) : null}
          </div>
          {teammateHint ? (
            <p className="mt-0.5 text-[11px] leading-tight text-[var(--muted)] [overflow-wrap:anywhere]">
              {teammateHint}
            </p>
          ) : null}
          {actions ? (
            <div className="mt-1.5 flex items-center justify-start gap-1">
              {actions}
            </div>
          ) : null}
        </div>

        <time
          className="w-[3.75rem] shrink-0 pt-0.5 text-right text-[10px] font-medium leading-tight tabular-nums text-[var(--muted)]"
          dateTime={`${submittedDate} ${submittedTime}`.trim()}
          title={`${submittedDate} ${submittedTime}`.trim()}
        >
          <span className="block">{submittedDate}</span>
          <span className="block">{submittedTime}</span>
        </time>
      </div>
    </div>
  );
}

type PlayerLiveStats = {
  rating: number | null;
  robustness: number | null;
  robustnessStatus: RobustnessStatus;
};

function registrationPlayerId(reg: TournamentRegistration): string | null {
  return reg.fargoPlayerId?.trim() || null;
}

/** Overview badge: just the Fargo number, or "Open" when uncapped. */
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
    t.maxFargo != null ? `Fargo cap ${t.maxFargo}` : "Open Fargo",
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

function OverviewSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
        {title}
      </p>
      {children}
    </section>
  );
}

function OverviewFact({
  label,
  value,
  wide = false,
  onCopy,
  copied = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
  onCopy?: () => void;
  copied?: boolean;
}) {
  return (
    <div className={wide ? "min-w-0 sm:col-span-2" : "min-w-0"}>
      <dt className={labelClass}>{label}</dt>
      <dd className="flex min-w-0 items-start gap-1.5">
        <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-[var(--ink)] [overflow-wrap:anywhere]">
          {value}
        </span>
        {onCopy ? (
          <button
            type="button"
            onClick={onCopy}
            aria-label={copied ? `${label} copied` : `Copy ${label.toLowerCase()}`}
            title={copied ? "Copied" : `Copy ${label.toLowerCase()}`}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius)] text-[var(--muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--felt-deep)]"
          >
            {copied ? (
              <CheckIcon className="h-3.5 w-3.5 text-[var(--felt-deep)]" />
            ) : (
              <CopyIcon className="h-3.5 w-3.5" />
            )}
          </button>
        ) : null}
      </dd>
    </div>
  );
}

function CopyIcon({ className }: { className?: string }) {
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
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

function LinkIcon({ className }: { className?: string }) {
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
      <path d="M10 13a5 5 0 0 0 7.54.54l1.92-1.92a5 5 0 0 0-7.07-7.07l-1.17 1.17" />
      <path d="M14 11a5 5 0 0 0-7.54-.54L4.54 12.38a5 5 0 0 0 7.07 7.07l1.17-1.17" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}

async function compressImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  // Keep tall flyers readable while capping payload size.
  const max = 1400;
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
  return canvas.toDataURL("image/jpeg", 0.82);
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

function FlyerLightbox({
  src,
  title,
  onClose,
}: {
  src: string;
  title: string;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex flex-col bg-black/85 p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} flyer`}
      onClick={onClose}
    >
      <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
        <p className="min-w-0 truncate font-[family-name:var(--font-display)] text-base font-semibold text-white">
          {title}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-[var(--radius)] bg-white/12 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/20"
        >
          Close
        </button>
      </div>
      <div
        className="flex min-h-0 flex-1 items-center justify-center"
        onClick={(event) => event.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={`${title} flyer`}
          className="max-h-full max-w-full object-contain"
        />
      </div>
    </div>,
    document.body,
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

type TeammateDraft = PartnerPick;

function emptyTeammate(): TeammateDraft {
  return {
    displayName: "",
    ratingAtSignup: null,
    fargoPlayerId: null,
    readableId: null,
  };
}

const emptyForm = (): EventFormState => ({
  title: "",
  description: "",
  thumbnailUrl: null,
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
  minFargo: null,
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
  startsAt: "",
  checkInAt: null,
  organizerPhone: null,
  status: "open",
});

function formToTemplateForm(form: EventFormState): TournamentTemplateForm {
  return {
    title: form.title,
    description: form.description ?? "",
    gameType: form.gameType,
    eventType: form.eventType,
    bracketFormat: form.bracketFormat,
    breakFormat: form.breakFormat ?? "winner-break",
    drawType: form.drawType ?? "seeded",
    handicapSystem: form.handicapSystem,
    handicapNotes: form.handicapNotes ?? "",
    rulesetPreset: form.rulesetPreset ?? "bca",
    winnersRaceTo: form.winnersRaceTo ?? null,
    losersRaceTo: form.losersRaceTo ?? null,
    maxFargo: form.maxFargo ?? null,
    minRobustnessStatus: form.minRobustnessStatus ?? null,
    unratedPolicy: form.unratedPolicy ?? "message-organizer",
    maxPlayers: form.maxPlayers,
    teamSize: form.teamSize ?? 1,
    entryFeeCents: form.entryFeeCents ?? 0,
    addedMoneyCents: form.addedMoneyCents ?? 0,
    payMethod: form.payMethod ?? "door",
    venmoHandle: form.venmoHandle ?? null,
    zelleHandle: form.zelleHandle ?? null,
    cashAppHandle: form.cashAppHandle ?? null,
    payoutNotes: form.payoutNotes ?? "",
    registrationMode: form.registrationMode ?? "approval",
    reportedToFargo: Boolean(form.reportedToFargo),
    tableSize: form.tableSize ?? "9ft",
    venueName: form.venueName,
    venueAddress: form.venueAddress ?? "",
    city: form.city,
    region: form.region ?? "Palm Beach",
    organizerPhone: form.organizerPhone ?? null,
    status: form.status === "draft" ? "draft" : "open",
  };
}

function applyTemplateToForm(template: TournamentTemplate): EventFormState {
  const base = emptyForm();
  return {
    ...base,
    ...template.form,
    thumbnailUrl: null,
    startsAt: "",
    checkInAt: null,
    minFargo: null,
    status: template.form.status === "draft" ? "draft" : "open",
  };
}

function emptyTeammates(count: number): TeammateDraft[] {
  return Array.from({ length: Math.max(0, count) }, () => emptyTeammate());
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
    breakFormat: t.breakFormat ?? "winner-break",
    drawType: t.drawType ?? "seeded",
    handicapSystem: t.handicapSystem,
    handicapNotes: t.handicapNotes,
    rulesetPreset: t.rulesetPreset,
    winnersRaceTo: t.winnersRaceTo,
    losersRaceTo: t.losersRaceTo,
    minFargo: null,
    maxFargo: t.maxFargo,
    minRobustnessStatus: t.minRobustnessStatus ?? null,
    unratedPolicy: t.unratedPolicy,
    maxPlayers: t.maxPlayers,
    teamSize: t.teamSize,
    entryFeeCents: t.entryFeeCents,
    addedMoneyCents: t.addedMoneyCents ?? 0,
    payMethod: t.payMethod,
    venmoHandle: t.venmoHandle ?? null,
    zelleHandle: t.zelleHandle ?? null,
    cashAppHandle: t.cashAppHandle ?? null,
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
  onFindPlayer,
  deepLinkEventId = null,
  onDeepLinkEventIdChange,
}: TournamentsProps) {
  const [view, setView] = useState<View>("browse");
  const [browseSubTab, setBrowseSubTab] = useState<BrowseSubTab>("browse");
  const [events, setEvents] = useState<TournamentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [addressCopied, setAddressCopied] = useState(false);
  const appliedDeepLinkRef = useRef<string | null>(null);
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("");
  const [gameType, setGameType] = useState<GameType | "">("");
  const [eventTypeFilter, setEventTypeFilter] = useState<EventType | "">("");
  const [handicapFilter, setHandicapFilter] = useState<HandicapFilter>("");
  const [startsFrom, setStartsFrom] = useState("");
  const [startsTo, setStartsTo] = useState("");
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const [eligibleRobustnessOnly, setEligibleRobustnessOnly] = useState(false);
  const [eventsPage, setEventsPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [form, setForm] = useState<EventFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [regNote, setRegNote] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teammates, setTeammates] = useState<TeammateDraft[]>([]);
  const [entryTeams, setEntryTeams] = useState<TournamentEntryTeam[]>([]);
  const [selectedEntryTeamId, setSelectedEntryTeamId] = useState("");
  const [saveEntryTeam, setSaveEntryTeam] = useState(true);
  const [entryTeamBusy, setEntryTeamBusy] = useState(false);
  const [entryTeamMsg, setEntryTeamMsg] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TournamentTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateBusy, setTemplateBusy] = useState(false);
  const [templateMsg, setTemplateMsg] = useState<string | null>(null);
  const [resolvedFargo, setResolvedFargo] = useState<number | null>(playerFargo);
  const [resolvedRobustnessStatus, setResolvedRobustnessStatus] =
    useState<RobustnessStatus | null>(null);
  const [fargoLoading, setFargoLoading] = useState(false);
  const [messageBody, setMessageBody] = useState("");
  const [messageName, setMessageName] = useState("");
  const [detailSubTab, setDetailSubTab] = useState<DetailSubTab>("overview");
  const [overviewDetailTab, setOverviewDetailTab] =
    useState<OverviewDetailTab>("when");
  const [fieldFilter, setFieldFilter] = useState<FieldBoardFilter>("all");
  const [fieldQuery, setFieldQuery] = useState("");
  const [signupStatusFilter, setSignupStatusFilter] =
    useState<SignupStatusFilter>("pending");
  const [signupQueueSort, setSignupQueueSort] =
    useState<SignupQueueSort>("oldest");
  const [signupSelectedIds, setSignupSelectedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [inspectPlayer, setInspectPlayer] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [signupMessage, setSignupMessage] = useState<{
    name: string;
    body: string;
  } | null>(null);
  const [flyerPreview, setFlyerPreview] = useState<{
    src: string;
    title: string;
  } | null>(null);
  const closeFlyerPreview = useCallback(() => setFlyerPreview(null), []);
  const [playerStats, setPlayerStats] = useState<
    Record<string, PlayerLiveStats>
  >({});
  const [, startDetailTransition] = useTransition();

  useEffect(() => {
    if (!user) {
      setResolvedFargo(null);
      setResolvedRobustnessStatus(null);
      setFargoLoading(false);
      return;
    }
    // Prefer roster Fargo immediately; default robustness so the filter is usable
    // even if the profile lookup is slow or unavailable.
    setResolvedFargo(playerFargo);
    setResolvedRobustnessStatus("starter");
    const lookupIds = [user.readableId, user.lmsId]
      .map((id) => id?.trim() ?? "")
      .filter(Boolean);
    if (lookupIds.length === 0) {
      setFargoLoading(false);
      return;
    }
    let cancelled = false;
    setFargoLoading(true);
    void (async () => {
      try {
        for (const lookupId of lookupIds) {
          const res = await fetch(
            `/api/players/${encodeURIComponent(lookupId)}`,
          );
          const data = (await res.json()) as {
            player?: {
              effectiveRating?: number | null;
              provisionalRating?: number | null;
              robustnessStatus?: RobustnessStatus;
            };
          };
          if (cancelled) return;
          if (!res.ok || !data.player) continue;
          const rating =
            data.player.effectiveRating ??
            data.player.provisionalRating ??
            null;
          if (rating != null) setResolvedFargo(rating);
          setResolvedRobustnessStatus(
            data.player.robustnessStatus ?? "starter",
          );
          return;
        }
      } catch {
        /* keep starter / roster fallback */
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
      if (eventTypeFilter) params.set("eventType", eventTypeFilter);
      if (handicapFilter) params.set("handicap", handicapFilter);
      if (startsFrom) params.set("startsFrom", startsFrom);
      if (startsTo) params.set("startsTo", startsTo);
      if (eligibleOnly && resolvedFargo != null) {
        params.set("eligibleForFargo", String(resolvedFargo));
      }
      if (eligibleRobustnessOnly && resolvedRobustnessStatus) {
        params.set("eligibleForRobustness", resolvedRobustnessStatus);
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
  }, [
    eligibleOnly,
    eligibleRobustnessOnly,
    eventTypeFilter,
    gameType,
    handicapFilter,
    q,
    region,
    resolvedFargo,
    resolvedRobustnessStatus,
    startsFrom,
    startsTo,
  ]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    setEventsPage(1);
  }, [
    eligibleOnly,
    eligibleRobustnessOnly,
    eventTypeFilter,
    gameType,
    handicapFilter,
    q,
    region,
    resolvedFargo,
    resolvedRobustnessStatus,
    startsFrom,
    startsTo,
  ]);

  const eventsTotalPages = Math.max(
    1,
    Math.ceil(events.length / EVENTS_PAGE_SIZE),
  );
  const eventsSafePage = Math.min(eventsPage, eventsTotalPages);
  const pagedEvents = useMemo(() => {
    const start = (eventsSafePage - 1) * EVENTS_PAGE_SIZE;
    return events.slice(start, start + EVENTS_PAGE_SIZE);
  }, [events, eventsSafePage]);

  const goToEventsPage = useCallback(
    (next: number) => {
      setEventsPage(Math.min(Math.max(1, next), eventsTotalPages));
    },
    [eventsTotalPages],
  );

  const openDetail = useCallback(
    async (id: string, options?: { fromDeepLink?: boolean }) => {
      const eventId = id.trim();
      if (!eventId) return;
      setSelectedId(eventId);
      setView("detail");
      setDetailLoading(true);
      setActionMsg(null);
      setConfirmRemove(false);
      setError(null);
      setRegNote("");
      setTeamName("");
      setDetailSubTab("overview");
      setOverviewDetailTab("when");
      setFieldFilter("all");
      setFieldQuery("");
      setSignupStatusFilter("pending");
      setSignupSelectedIds(new Set());
      setLinkCopied(false);
      setSelectedEntryTeamId("");
      setEntryTeamMsg(null);
      setSaveEntryTeam(true);
      if (!options?.fromDeepLink) {
        onDeepLinkEventIdChange?.(eventId);
      }
      appliedDeepLinkRef.current = eventId;
      try {
        const res = await fetch(`/api/tournaments/${eventId}`);
        const data = (await res.json()) as DetailPayload & { error?: string };
        if (!res.ok) throw new Error(data.error || "Failed to load event.");
        const tournament = data.tournament;
        setDetail({
          tournament,
          registrations: data.registrations ?? [],
          messages: data.messages ?? [],
          isOrganizer: Boolean(data.isOrganizer),
        });
        const mateCount = Math.max(
          0,
          (tournament.teamSize ?? defaultTeamSize(tournament.eventType)) - 1,
        );
        setTeammates(
          tournament.eventType === "singles"
            ? []
            : emptyTeammates(mateCount || 1),
        );
      } catch (err) {
        setDetail(null);
        setError(err instanceof Error ? err.message : "Failed to load event.");
      } finally {
        setDetailLoading(false);
      }
    },
    [onDeepLinkEventIdChange],
  );

  const closeDetail = useCallback(() => {
    setView("browse");
    setDetail(null);
    setSelectedId(null);
    setError(null);
    setActionMsg(null);
    setDetailSubTab("overview");
    setLinkCopied(false);
    appliedDeepLinkRef.current = null;
    onDeepLinkEventIdChange?.(null);
  }, [onDeepLinkEventIdChange]);

  useEffect(() => {
    const nextId = deepLinkEventId?.trim() || null;
    if (!nextId) {
      if (
        appliedDeepLinkRef.current &&
        (view === "detail" || selectedId)
      ) {
        appliedDeepLinkRef.current = null;
        setView("browse");
        setDetail(null);
        setSelectedId(null);
        setDetailSubTab("overview");
      }
      return;
    }
    if (appliedDeepLinkRef.current === nextId && selectedId === nextId) {
      return;
    }
    void openDetail(nextId, { fromDeepLink: true });
  }, [deepLinkEventId, openDetail, selectedId, view]);

  const refreshDetail = useCallback(async () => {
    if (!selectedId) return;
    try {
      const res = await fetch(`/api/tournaments/${selectedId}`);
      const data = (await res.json()) as DetailPayload & { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to load event.");
      setDetail({
        tournament: data.tournament,
        registrations: data.registrations ?? [],
        messages: data.messages ?? [],
        isOrganizer: Boolean(data.isOrganizer),
      });
      await loadEvents();
    } catch (err) {
      setActionMsg(
        err instanceof Error ? err.message : "Failed to refresh event.",
      );
    }
  }, [loadEvents, selectedId]);

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
    addedMoneyCents: Math.max(0, Math.round(Number(form.addedMoneyCents) || 0)),
    maxPlayers: Math.max(2, Math.floor(Number(form.maxPlayers) || 2)),
    teamSize: Math.max(1, Math.floor(Number(form.teamSize) || 1)),
    startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : "",
    checkInAt: form.checkInAt ? new Date(form.checkInAt).toISOString() : null,
    minFargo: null,
    maxFargo:
      form.maxFargo === null || form.maxFargo === ("" as unknown as number)
        ? null
        : Number(form.maxFargo),
    breakFormat:
      form.breakFormat === "loser-break" ||
      form.breakFormat === "alternate-break"
        ? form.breakFormat
        : "winner-break",
    drawType:
      form.drawType === "random" || form.drawType === "custom"
        ? form.drawType
        : "seeded",
    venmoHandle: form.venmoHandle?.trim() || null,
    zelleHandle: form.zelleHandle?.trim() || null,
    cashAppHandle: form.cashAppHandle?.trim() || null,
  });

  const startEdit = (tournament: TournamentListItem) => {
    setEditingId(tournament.id);
    setForm(tournamentToForm(tournament));
    setSelectedTemplateId("");
    setTemplateName("");
    setTemplateMsg(null);
    setError(null);
    setActionMsg(null);
    setView("edit");
  };

  const leaveForm = () => {
    const returnId = editingId ?? selectedId;
    setForm(emptyForm());
    setEditingId(null);
    setSelectedTemplateId("");
    setTemplateName("");
    setTemplateMsg(null);
    setError(null);
    if (returnId && (view === "edit" || selectedId)) {
      void openDetail(returnId);
      return;
    }
    setView("browse");
  };

  const loadTemplates = useCallback(async () => {
    if (!user) {
      setTemplates([]);
      return;
    }
    try {
      const res = await fetch("/api/tournaments/templates");
      const data = (await res.json()) as {
        templates?: TournamentTemplate[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Failed to load templates.");
      setTemplates(data.templates ?? []);
    } catch {
      setTemplates([]);
    }
  }, [user]);

  useEffect(() => {
    if ((view === "create" || view === "edit") && user) {
      void loadTemplates();
    }
  }, [loadTemplates, user, view]);

  const applySelectedTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setTemplateMsg(null);
    if (!templateId) return;
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    setForm(applyTemplateToForm(template));
    setTemplateName(template.name);
    setTemplateMsg(`Loaded “${template.name}”. Set the date, then publish.`);
  };

  const useTemplateForCreate = (template: TournamentTemplate) => {
    setEditingId(null);
    setForm(applyTemplateToForm(template));
    setSelectedTemplateId(template.id);
    setTemplateName(template.name);
    setTemplateMsg(`Loaded “${template.name}”. Set the date, then publish.`);
    setError(null);
    setBrowseSubTab("browse");
    setView("create");
  };

  const onSaveTemplate = async () => {
    if (!user) {
      onRequestLogin();
      return;
    }
    const name =
      templateName.trim() ||
      form.title.trim() ||
      templates.find((item) => item.id === selectedTemplateId)?.name ||
      "";
    if (!name) {
      setTemplateMsg("Name this template before saving.");
      return;
    }
    setTemplateBusy(true);
    setTemplateMsg(null);
    try {
      const res = await fetch("/api/tournaments/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedTemplateId || undefined,
          name,
          form: formToTemplateForm(form),
        }),
      });
      const data = (await res.json()) as {
        templates?: TournamentTemplate[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Failed to save template.");
      const next = data.templates ?? [];
      setTemplates(next);
      const saved =
        next.find(
          (item) => item.name.trim().toLowerCase() === name.toLowerCase(),
        ) ?? next[0];
      if (saved) {
        setSelectedTemplateId(saved.id);
        setTemplateName(saved.name);
      }
      setTemplateMsg(`Saved template “${name}”.`);
    } catch (err) {
      setTemplateMsg(
        err instanceof Error ? err.message : "Failed to save template.",
      );
    } finally {
      setTemplateBusy(false);
    }
  };

  const onDeleteTemplate = async () => {
    if (!user || !selectedTemplateId) return;
    const current = templates.find((item) => item.id === selectedTemplateId);
    setTemplateBusy(true);
    setTemplateMsg(null);
    try {
      const res = await fetch(
        `/api/tournaments/templates?id=${encodeURIComponent(selectedTemplateId)}`,
        { method: "DELETE" },
      );
      const data = (await res.json()) as {
        templates?: TournamentTemplate[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Failed to delete template.");
      setTemplates(data.templates ?? []);
      setSelectedTemplateId("");
      setTemplateName("");
      setTemplateMsg(
        current ? `Deleted “${current.name}”.` : "Template deleted.",
      );
    } catch (err) {
      setTemplateMsg(
        err instanceof Error ? err.message : "Failed to delete template.",
      );
    } finally {
      setTemplateBusy(false);
    }
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

  const loadEntryTeams = useCallback(async () => {
    if (!user) {
      setEntryTeams([]);
      return;
    }
    try {
      const res = await fetch("/api/tournaments/entry-teams");
      const data = (await res.json()) as {
        teams?: TournamentEntryTeam[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Failed to load teams.");
      setEntryTeams(data.teams ?? []);
    } catch {
      setEntryTeams([]);
    }
  }, [user]);

  useEffect(() => {
    const eventType = detail?.tournament.eventType;
    if (
      view === "detail" &&
      user &&
      (eventType === "scotch-doubles" || eventType === "teams")
    ) {
      void loadEntryTeams();
    }
  }, [detail?.tournament.eventType, loadEntryTeams, user, view]);

  const applyEntryTeam = (teamId: string) => {
    setSelectedEntryTeamId(teamId);
    setEntryTeamMsg(null);
    if (!teamId) return;
    const team = entryTeams.find((item) => item.id === teamId);
    if (!team) return;
    setTeamName(team.name);
    setTeammates(
      team.members.map((member) => ({
        displayName: member.displayName,
        ratingAtSignup: member.ratingAtSignup,
        fargoPlayerId: member.fargoPlayerId,
        readableId: member.readableId,
      })),
    );
    setSaveEntryTeam(true);
    setEntryTeamMsg(`Loaded “${team.name}”.`);
  };

  const saveCurrentEntryTeam =
    async (): Promise<TournamentEntryTeam | null> => {
    const name = teamName.trim();
    const members = teammates
      .map((mate) => ({
        displayName: mate.displayName.trim(),
        ratingAtSignup: mate.ratingAtSignup,
        fargoPlayerId: mate.fargoPlayerId,
        readableId: mate.readableId,
      }))
      .filter((mate) => mate.displayName);
    if (!name) {
      setEntryTeamMsg("Name this team before saving.");
      return null;
    }
    if (members.length < 1) {
      setEntryTeamMsg("Add at least one teammate before saving.");
      return null;
    }
    setEntryTeamBusy(true);
    setEntryTeamMsg(null);
    try {
      const res = await fetch("/api/tournaments/entry-teams", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedEntryTeamId || undefined,
          name,
          members,
        }),
      });
      const data = (await res.json()) as {
        teams?: TournamentEntryTeam[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Failed to save team.");
      const next = data.teams ?? [];
      setEntryTeams(next);
      const saved =
        next.find((item) => item.name.trim().toLowerCase() === name.toLowerCase()) ??
        next[0] ??
        null;
      if (saved) {
        setSelectedEntryTeamId(saved.id);
        setEntryTeamMsg(`Saved “${saved.name}”.`);
      }
      return saved;
    } catch (err) {
      setEntryTeamMsg(
        err instanceof Error ? err.message : "Failed to save team.",
      );
      return null;
    } finally {
      setEntryTeamBusy(false);
    }
  };

  const deleteSelectedEntryTeam = async () => {
    if (!selectedEntryTeamId) return;
    setEntryTeamBusy(true);
    setEntryTeamMsg(null);
    try {
      const res = await fetch(
        `/api/tournaments/entry-teams?id=${encodeURIComponent(selectedEntryTeamId)}`,
        { method: "DELETE" },
      );
      const data = (await res.json()) as {
        teams?: TournamentEntryTeam[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Failed to delete team.");
      setEntryTeams(data.teams ?? []);
      setSelectedEntryTeamId("");
      setEntryTeamMsg("Team deleted.");
    } catch (err) {
      setEntryTeamMsg(
        err instanceof Error ? err.message : "Failed to delete team.",
      );
    } finally {
      setEntryTeamBusy(false);
    }
  };

  const onRegister = async () => {
    if (!user || !selectedId || !detail) {
      onRequestLogin();
      return;
    }
    setSaving(true);
    setActionMsg(null);
    setEntryTeamMsg(null);
    try {
      const eventType = detail.tournament.eventType;
      const payloadTeammates =
        eventType === "singles"
          ? []
          : teammates
              .filter((t) => t.displayName.trim())
              .map((t) => ({
                displayName: t.displayName.trim(),
                ratingAtSignup: t.ratingAtSignup,
              }));

      if (
        saveEntryTeam &&
        (eventType === "scotch-doubles" || eventType === "teams")
      ) {
        const saved = await saveCurrentEntryTeam();
        if (!saved) {
          throw new Error(
            "Create or complete your tournament team before entering.",
          );
        }
      }

      const res = await fetch(`/api/tournaments/${selectedId}/registrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: user.name ?? user.email ?? "Player",
          noteToOrganizer: regNote,
          teamName:
            eventType === "teams" || eventType === "scotch-doubles"
              ? teamName.trim() || null
              : null,
          teammates: payloadTeammates,
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
    patch: {
      status?: TournamentRegistration["status"];
      paid?: boolean;
      checkedIn?: boolean;
      ratingAtSignup?: number | null;
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
      setSignupSelectedIds((prev) => {
        if (!prev.has(registrationId)) return prev;
        const next = new Set(prev);
        next.delete(registrationId);
        return next;
      });
      await refreshDetail();
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setSaving(false);
    }
  };

  const onBulkUpdateRegistrations = async (
    registrationIds: string[],
    patch: { status: TournamentRegistration["status"] },
  ) => {
    if (!selectedId || registrationIds.length === 0) return;
    setSaving(true);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/tournaments/${selectedId}/registrations`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationIds, ...patch }),
      });
      const data = (await res.json()) as {
        error?: string;
        registrations?: TournamentRegistration[];
      };
      if (!res.ok) throw new Error(data.error || "Bulk update failed.");
      const count = data.registrations?.length ?? registrationIds.length;
      setSignupSelectedIds(new Set());
      await refreshDetail();
      const verb =
        patch.status === "approved"
          ? "Approved"
          : patch.status === "waitlisted"
            ? "Waitlisted"
            : patch.status === "rejected"
              ? "Rejected"
              : "Updated";
      setActionMsg(`${verb} ${count} signup${count === 1 ? "" : "s"}.`);
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : "Bulk update failed.");
      await refreshDetail();
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

  const openSignupPlayer = (reg: TournamentRegistration) => {
    const playerId = registrationPlayerId(reg);
    if (playerId) {
      setInspectPlayer({ id: playerId, name: reg.displayName });
      return;
    }
    onFindPlayer?.(reg.displayName.trim());
  };

  const openSignupMessage = (reg: TournamentRegistration) => {
    const body = reg.noteToOrganizer?.trim();
    if (!body) return;
    setSignupMessage({ name: reg.displayName, body });
  };

  const signupSubmittedParts = (reg: TournamentRegistration) =>
    formatSignupSubmittedParts(reg.createdAt);

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

  const pushToDigitalPool = async (id: string, force = false) => {
    setSaving(true);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/tournaments/${id}/digital-pool`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const data = (await res.json()) as {
        error?: string;
        digitalPool?: {
          builderUrl?: string;
          playerCount?: number;
          matchCount?: number;
          tableCount?: number;
          slug?: string;
        };
      };
      if (!res.ok) {
        if (res.status === 409 && data.digitalPool?.builderUrl) {
          setActionMsg(
            data.error ||
              "Already pushed. Open Digital Pool from the link below, or push again.",
          );
          await refreshDetail();
          return;
        }
        throw new Error(data.error || "Could not push to Digital Pool.");
      }
      const dp = data.digitalPool;
      setActionMsg(
        dp
          ? `Pushed to Digital Pool — ${dp.playerCount ?? 0} players, ${dp.tableCount ?? 0} tables, ${dp.matchCount ?? 0} first-round matches.`
          : "Pushed to Digital Pool.",
      );
      await refreshDetail();
    } catch (err) {
      setActionMsg(
        err instanceof Error ? err.message : "Could not push to Digital Pool.",
      );
    } finally {
      setSaving(false);
    }
  };

  const removeTournament = async (id: string) => {
    setSaving(true);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/tournaments/${id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not remove event.");
      setConfirmRemove(false);
      closeDetail();
      await loadEvents();
    } catch (err) {
      setActionMsg(
        err instanceof Error ? err.message : "Could not remove event.",
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
    // Oldest first within each status for first-come, first-served review.
    return [...regs].sort((a, b) => {
      const byStatus = rank(a.status) - rank(b.status);
      if (byStatus !== 0) return byStatus;
      const byCreated = a.createdAt.localeCompare(b.createdAt);
      if (byCreated !== 0) return byCreated;
      return a.id.localeCompare(b.id);
    });
  }, [detail?.registrations]);

  const signupStatusCounts = useMemo(() => {
    const counts: Record<SignupStatusFilter, number> = {
      pending: 0,
      approved: 0,
      waitlisted: 0,
      rejected: 0,
    };
    for (const r of sortedRegistrations) {
      if (
        r.status === "pending" ||
        r.status === "approved" ||
        r.status === "waitlisted" ||
        r.status === "rejected"
      ) {
        counts[r.status] += 1;
      }
    }
    return counts;
  }, [sortedRegistrations]);

  const signupStatusOptions = useMemo(
    () =>
      SIGNUP_STATUS_FILTERS.map((item) => ({
        value: item.value,
        label: `${item.label} (${signupStatusCounts[item.value]})`,
      })),
    [signupStatusCounts],
  );

  const signupQueueSortable =
    signupStatusFilter === "pending" || signupStatusFilter === "waitlisted";

  const filteredSignups = useMemo(() => {
    const list = sortedRegistrations.filter(
      (r) => r.status === signupStatusFilter,
    );
    if (!signupQueueSortable || signupQueueSort === "oldest") {
      return list;
    }

    const ratingFor = (reg: TournamentRegistration) => {
      const playerId = registrationPlayerId(reg);
      const live = playerId ? playerStats[playerId] : undefined;
      return live?.rating ?? reg.ratingAtSignup;
    };

    // Highest Fargo first; earliest submission breaks ties.
    return [...list].sort((a, b) => {
      const ratingA = ratingFor(a);
      const ratingB = ratingFor(b);
      const scoredA = ratingA != null;
      const scoredB = ratingB != null;
      if (scoredA && scoredB && ratingA !== ratingB) {
        return ratingB - ratingA;
      }
      if (scoredA !== scoredB) return scoredA ? -1 : 1;
      const byCreated = a.createdAt.localeCompare(b.createdAt);
      if (byCreated !== 0) return byCreated;
      return a.id.localeCompare(b.id);
    });
  }, [
    playerStats,
    signupQueueSort,
    signupQueueSortable,
    signupStatusFilter,
    sortedRegistrations,
  ]);

  const signupSelectable =
    signupStatusFilter === "pending" || signupStatusFilter === "waitlisted";

  const signupSelectedInView = useMemo(
    () => filteredSignups.filter((r) => signupSelectedIds.has(r.id)),
    [filteredSignups, signupSelectedIds],
  );

  const allVisibleSignupsSelected =
    signupSelectable &&
    filteredSignups.length > 0 &&
    filteredSignups.every((r) => signupSelectedIds.has(r.id));

  useEffect(() => {
    setSignupSelectedIds(new Set());
  }, [signupStatusFilter, selectedId]);

  const toggleSignupSelected = (id: string) => {
    setSignupSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllSignups = () => {
    if (allVisibleSignupsSelected) {
      setSignupSelectedIds(new Set());
      return;
    }
    setSignupSelectedIds(new Set(filteredSignups.map((r) => r.id)));
  };

  const loadedPlayerIdsRef = useRef(new Set<string>());

  useEffect(() => {
    if (
      !detail?.isOrganizer ||
      (detailSubTab !== "signups" && detailSubTab !== "field")
    ) {
      return;
    }
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
    const ratingFor = (reg: TournamentRegistration) => {
      const playerId = registrationPlayerId(reg);
      const live = playerId ? playerStats[playerId] : undefined;
      return live?.rating ?? reg.ratingAtSignup;
    };

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
        const ratingA = ratingFor(a);
        const ratingB = ratingFor(b);
        const scoredA = ratingA != null;
        const scoredB = ratingB != null;
        if (scoredA && scoredB && ratingA !== ratingB) {
          return ratingB - ratingA;
        }
        if (scoredA !== scoredB) return scoredA ? -1 : 1;
        const aKey = (a.teamName || a.displayName).toLowerCase();
        const bKey = (b.teamName || b.displayName).toLowerCase();
        return aKey.localeCompare(bKey);
      });
  }, [detail?.registrations, fieldFilter, fieldQuery, playerStats]);

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
        <BackButton onClick={leaveForm} />

        <SectionCard
          eyebrow="Events"
          title={isEdit ? "Edit event" : "Create event"}
          description={
            isEdit
              ? "Update format, eligibility, venue, or close registration."
              : "Set the format, eligibility, entry, and venue. Choose whether registration opens now or stays a draft."
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
                className="rounded-[var(--radius)] bg-[var(--felt)] px-4 py-2.5 text-sm font-semibold text-white"
              >
                Sign in
              </button>
            }
          />
        ) : (
          <SurfaceCard>
            <form onSubmit={onSaveForm} className="space-y-5 p-3 sm:p-4">
              {error ? (
                <p className="rounded-[var(--radius)] border border-[var(--danger)]/40 bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger)]">
                  {error}
                </p>
              ) : null}

              <div className="space-y-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)]/50 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                    Templates
                  </p>
                  <p className="text-[11px] text-[var(--muted)]">
                    Saved to your account
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <SelectField
                    aria-label="Saved templates"
                    value={selectedTemplateId}
                    placeholder="Choose a saved template"
                    options={[
                      { value: "", label: "Choose a saved template" },
                      ...templates.map((item) => ({
                        value: item.id,
                        label: item.name,
                      })),
                    ]}
                    onChange={applySelectedTemplate}
                  />
                  <button
                    type="button"
                    disabled={templateBusy || !selectedTemplateId}
                    onClick={() => void onDeleteTemplate()}
                    className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--ink)] disabled:opacity-40"
                  >
                    Delete
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <Field label="Template name">
                    <input
                      className={fieldClass}
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      placeholder={
                        form.title.trim() || "e.g. Friday 9-ball night"
                      }
                    />
                  </Field>
                  <div className="flex items-end">
                    <button
                      type="button"
                      disabled={templateBusy}
                      onClick={() => void onSaveTemplate()}
                      className="w-full rounded-[var(--radius)] bg-[var(--felt)] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[var(--felt-soft)] disabled:opacity-50 sm:w-auto"
                    >
                      {templateBusy ? "Saving…" : "Save template"}
                    </button>
                  </div>
                </div>
                {templateMsg ? (
                  <p className="text-xs text-[var(--felt-deep)]">{templateMsg}</p>
                ) : (
                  <p className="text-[11px] text-[var(--muted)]">
                    Load a template to fill format, venue, and pay settings.
                    Dates and flyer stay blank. Manage all templates under
                    Events → Templates.
                  </p>
                )}
              </div>

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
                ) : (
                  <div className="sm:col-span-2">
                    <Field label="Registration open">
                      <SelectField
                        aria-label="Registration open"
                        value={
                          form.status === "draft" ? "draft" : "open"
                        }
                        options={CREATE_STATUS_OPTIONS}
                        onChange={(status) =>
                          setForm((p) => ({ ...p, status }))
                        }
                      />
                    </Field>
                  </div>
                )}
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
                <Field label="Break format">
                  <SelectField
                    aria-label="Break format"
                    value={form.breakFormat ?? "winner-break"}
                    options={BREAK_FORMAT_OPTIONS}
                    onChange={(breakFormat) =>
                      setForm((p) => ({ ...p, breakFormat }))
                    }
                  />
                </Field>
                <Field label="Draw type">
                  <SelectField
                    aria-label="Draw type"
                    value={form.drawType ?? "seeded"}
                    options={DRAW_TYPE_OPTIONS}
                    onChange={(drawType) =>
                      setForm((p) => ({ ...p, drawType }))
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
                        addedMoneyCents: Math.round(
                          Number(e.target.value) * 100,
                        ),
                      }))
                    }
                  />
                </Field>
                <Field label="Primary payment">
                  <SelectField
                    aria-label="Primary payment"
                    value={form.payMethod ?? "door"}
                    options={PAY_METHOD_OPTIONS}
                    onChange={(payMethod) =>
                      setForm((p) => ({ ...p, payMethod }))
                    }
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
                    autoComplete="off"
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
                    autoComplete="off"
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
                    autoComplete="off"
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
                    value={form.tableSize ?? "9ft"}
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
                  <Field label="Flyer / thumbnail">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={onThumbnail}
                      className="block w-full text-sm text-[var(--muted)] file:mr-3 file:rounded-[var(--radius)] file:border-0 file:bg-[var(--felt)] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
                    />
                    <p className="mt-1.5 text-[11px] text-[var(--muted)]">
                      Tall flyers stay fully visible — nothing is cropped.
                    </p>
                  </Field>
                  {form.thumbnailUrl ? (
                    <div className="mt-2 overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={form.thumbnailUrl}
                        alt="Tournament flyer preview"
                        className="mx-auto max-h-[min(70dvh,40rem)] w-full object-contain"
                      />
                    </div>
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
                      : form.status === "draft"
                        ? "Saving draft…"
                        : "Publishing…"
                    : isEdit
                      ? "Save changes"
                      : form.status === "draft"
                        ? "Save draft"
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
    // Temporarily allow everyone to open Manage for feedback; other ops tabs stay organizer-only.
    const activeTab: DetailSubTab = isOrganizer
      ? detailSubTab
      : detailSubTab === "manage"
        ? "manage"
        : "overview";
    const detailTabs = isOrganizer
      ? ([
          { id: "overview" as const, label: "Overview" },
          { id: "signups" as const, label: "Signups" },
          { id: "field" as const, label: "Field" },
          { id: "calcutta" as const, label: "Calcutta" },
          { id: "manage" as const, label: "Manage" },
        ] as const)
      : ([
          { id: "overview" as const, label: "Overview" },
          { id: "manage" as const, label: "Manage" },
        ] as const);
    const gameLabel = t ? gameTypeLabel(t.gameType) : "";
    const formatLabel =
      t
        ? (BRACKET_FORMAT_OPTIONS.find((o) => o.value === t.bracketFormat)
            ?.label ?? t.bracketFormat)
        : "";
    const tableSizeLabel =
      t
        ? (TABLE_SIZE_OPTIONS.find((o) => o.value === t.tableSize)?.label ??
          t.tableSize)
        : "";
    const registrationLabel =
      t
        ? (REGISTRATION_MODE_OPTIONS.find((o) => o.value === t.registrationMode)
            ?.label ?? t.registrationMode)
        : "";
    const rulesetLabel =
      t
        ? (RULESET_OPTIONS.find((o) => o.value === t.rulesetPreset)?.label ??
          t.rulesetPreset)
        : "";
    const breakLabel =
      t
        ? (BREAK_FORMAT_OPTIONS.find((o) => o.value === t.breakFormat)?.label ??
          t.breakFormat ??
          "Winner break")
        : "";
    const drawLabel =
      t
        ? (DRAW_TYPE_OPTIONS.find((o) => o.value === t.drawType)?.label ??
          t.drawType ??
          "Seeded")
        : "";
    const addedMoneyLabel = t
      ? (() => {
          const cents = t.addedMoneyCents ?? 0;
          if (cents <= 0) return "$0";
          return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
        })()
      : "";

    const overviewSignup = t ? (
      <>
        {actionMsg ? (
          <p className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--felt-deep)]">
            {actionMsg}
          </p>
        ) : null}

        {myRegistration ? (
          <OverviewSection title="Your entry">
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
              <div className="mt-2">
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
          </OverviewSection>
        ) : t.status === "draft" ? (
          <OverviewSection title="Registration">
            <p className="text-sm text-[var(--ink)]">
              Not open yet — this event is still a draft.
            </p>
          </OverviewSection>
        ) : t.status === "open" ? (
          <OverviewSection
            title={
              t.eventType === "teams"
                ? "Register your team"
                : t.eventType === "scotch-doubles"
                  ? "Register your pair"
                  : "Sign up"
            }
          >
            <div className="space-y-3">
              <p className="text-xs text-[var(--muted)]">
                {entryShapeText(t)}
                {` · Fargo ${fargoCapText(t)}`}
                {t.minRobustnessStatus
                  ? ` · ${minRobustnessLabel(t.minRobustnessStatus)}`
                  : ""}
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
                  <dl className="grid grid-cols-1 gap-3">
                    <OverviewFact
                      label="Your Fargo"
                      value={
                        fargoLoading
                          ? "Looking up…"
                          : resolvedFargo != null
                            ? `${resolvedFargo}${
                                resolvedRobustnessStatus
                                  ? ` · ${robustnessStatusLabel(resolvedRobustnessStatus)}`
                                  : ""
                              }`
                            : "Unrated"
                      }
                    />
                  </dl>
                  <p className="text-[11px] text-[var(--muted)]">
                    From your FargoRate account — locked at signup.
                  </p>

                  {t.minRobustnessStatus &&
                  !fargoLoading &&
                  !meetsMinRobustness(
                    resolvedRobustnessStatus,
                    t.minRobustnessStatus,
                  ) ? (
                    <p className="text-xs text-[var(--danger)]">
                      This event requires{" "}
                      {minRobustnessLabel(t.minRobustnessStatus).toLowerCase()}{" "}
                      robustness
                      {resolvedRobustnessStatus
                        ? ` (yours is ${robustnessStatusLabel(resolvedRobustnessStatus).toLowerCase()})`
                        : ""}
                      .
                    </p>
                  ) : null}

                  {resolvedFargo == null && !fargoLoading ? (
                    <p className="text-xs text-[var(--muted)]">
                      No Fargo on file. You can still request a spot
                      {t.unratedPolicy === "message-organizer"
                        ? " — message the organizer if needed"
                        : ""}
                      .
                    </p>
                  ) : null}

                  {t.eventType === "scotch-doubles" ||
                  t.eventType === "teams" ? (
                    <div className="space-y-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)]/50 p-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                          Your team
                        </p>
                        <p className="truncate text-[11px] text-[var(--muted)]">
                          Cap{" "}
                          <span className="font-semibold text-[var(--ink)]">
                            {user.name ?? user.email ?? "You"}
                            {resolvedFargo != null
                              ? ` · ${resolvedFargo}`
                              : ""}
                          </span>
                        </p>
                      </div>

                      <div className="flex min-w-0 items-center gap-1.5">
                        <SelectField
                          aria-label="Saved tournament teams"
                          value={selectedEntryTeamId}
                          placeholder="Saved team…"
                          options={[
                            { value: "", label: "New team" },
                            ...entryTeams.map((team) => ({
                              value: team.id,
                              label: team.name,
                            })),
                          ]}
                          buttonClassName="bg-[var(--surface)] !px-2.5 !py-1.5"
                          onChange={applyEntryTeam}
                        />
                        <button
                          type="button"
                          disabled={entryTeamBusy || !selectedEntryTeamId}
                          onClick={() => void deleteSelectedEntryTeam()}
                          className="shrink-0 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--ink)] disabled:opacity-40"
                        >
                          Del
                        </button>
                      </div>

                      <div className="min-w-0">
                        <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                          Team name
                        </span>
                        <input
                          required
                          className="w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:ring-2 focus:ring-[var(--felt-soft)]"
                          value={teamName}
                          onChange={(e) => {
                            setTeamName(e.target.value);
                            setSelectedEntryTeamId("");
                          }}
                          placeholder="e.g. Smith / Lee"
                        />
                      </div>

                      <ul className="divide-y divide-[var(--line)] overflow-visible rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)]">
                        {teammates.map((mate, index) => (
                          <li
                            key={`mate-${index}`}
                            className="flex min-w-0 items-center gap-1.5 px-2 py-1.5"
                          >
                            <span className="w-8 shrink-0 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                              T{index + 1}
                            </span>
                            <PartnerSearchField
                              compact
                              hideLabel
                              label={`Teammate ${index + 1}`}
                              value={mate}
                              onChange={(next) => {
                                setSelectedEntryTeamId("");
                                setTeammates((prev) =>
                                  prev.map((row, i) =>
                                    i === index ? next : row,
                                  ),
                                );
                              }}
                              placeholder="Name or Fargo ID…"
                            />
                            {teammates.length > 1 ? (
                              <button
                                type="button"
                                aria-label={`Remove teammate ${index + 1}`}
                                onClick={() => {
                                  setSelectedEntryTeamId("");
                                  setTeammates((prev) =>
                                    prev.filter((_, i) => i !== index),
                                  );
                                }}
                                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius)] text-[var(--muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--ink)]"
                              >
                                ×
                              </button>
                            ) : null}
                          </li>
                        ))}
                      </ul>

                      {(() => {
                        const { sum, ratedCount } = teamFargoTotal(
                          resolvedFargo,
                          teammates,
                        );
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
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedEntryTeamId("");
                            setTeammates((prev) => [
                              ...prev,
                              emptyTeammate(),
                            ]);
                          }}
                          className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ink)]"
                        >
                          + Teammate
                        </button>
                        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--ink)]">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 accent-[var(--felt)]"
                            checked={saveEntryTeam}
                            onChange={(e) =>
                              setSaveEntryTeam(e.target.checked)
                            }
                          />
                          Save for later
                        </label>
                        <button
                          type="button"
                          disabled={entryTeamBusy}
                          onClick={() => void saveCurrentEntryTeam()}
                          className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ink)] disabled:opacity-50"
                        >
                          {entryTeamBusy ? "Saving…" : "Save only"}
                        </button>
                      </div>
                      {entryTeamMsg ? (
                        <p className="text-xs text-[var(--felt-deep)]">
                          {entryTeamMsg}
                        </p>
                      ) : null}
                    </div>
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
                    disabled={
                      saving ||
                      fargoLoading ||
                      (Boolean(t.minRobustnessStatus) &&
                        !meetsMinRobustness(
                          resolvedRobustnessStatus,
                          t.minRobustnessStatus,
                        ))
                    }
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
          </OverviewSection>
        ) : null}

        {(t.unratedPolicy === "message-organizer" || !user) &&
        !myRegistration ? (
          <OverviewSection title="Message organizer">
            <form onSubmit={onSendMessage} className="space-y-3">
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
                className="rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-4 py-2 text-sm font-semibold text-[var(--ink)] disabled:opacity-50"
              >
                Send message
              </button>
            </form>
          </OverviewSection>
        ) : null}
      </>
    ) : null;

    const copyEventLink = () => {
      if (!selectedId) return;
      const url = new URL(window.location.href);
      url.searchParams.set("tab", "events");
      url.searchParams.set("event", selectedId);
      void navigator.clipboard
        ?.writeText(url.toString())
        .then(() => {
          setLinkCopied(true);
          window.setTimeout(() => setLinkCopied(false), 1800);
        })
        .catch(() => {
          setActionMsg("Could not copy link.");
        });
    };

    const copyAddress = (address: string) => {
      void navigator.clipboard
        ?.writeText(address)
        .then(() => {
          setAddressCopied(true);
          window.setTimeout(() => setAddressCopied(false), 1800);
        })
        .catch(() => {
          setActionMsg("Could not copy address.");
        });
    };

    return (
      <div className="space-y-4 animate-panel">
        <BackButton onClick={closeDetail} />

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
              headerAction={
                selectedId ? (
                  <button
                    type="button"
                    onClick={copyEventLink}
                    aria-label={linkCopied ? "Link copied" : "Copy event link"}
                    title={linkCopied ? "Link copied" : "Copy event link"}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius)] bg-black/20 text-white/85 ring-1 ring-white/20 transition hover:bg-black/30 hover:text-white"
                  >
                    {linkCopied ? (
                      <CheckIcon className="h-4 w-4" />
                    ) : (
                      <LinkIcon className="h-4 w-4" />
                    )}
                  </button>
                ) : null
              }
            />

            <div
              role="tablist"
              aria-label={
                isOrganizer ? "Event organizer sections" : "Event sections"
              }
              className={[
                "grid gap-0.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] p-0.5",
                isOrganizer ? "grid-cols-5" : "grid-cols-2",
              ].join(" ")}
            >
              {detailTabs.map((item) => {
                const selected = activeTab === item.id;
                const Icon = ORGANIZER_TAB_ICONS[item.id];
                const pending =
                  isOrganizer && item.id === "signups" && t.pendingCount > 0
                    ? t.pendingCount
                    : 0;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-label={
                      pending > 0
                        ? `${item.label}, ${pending} pending`
                        : item.label
                    }
                    onClick={() =>
                      startDetailTransition(() => {
                        if (item.id !== "manage") setConfirmRemove(false);
                        setDetailSubTab(item.id);
                      })
                    }
                    className={[
                      "relative flex flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1.5 transition",
                      selected
                        ? "bg-[var(--felt)] text-white shadow-sm"
                        : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]",
                    ].join(" ")}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-[9px] font-semibold leading-none tracking-wide sm:text-[10px]">
                      {item.label}
                    </span>
                    {pending > 0 ? (
                      <span
                        className={[
                          "absolute right-0.5 top-0.5 inline-flex min-w-3.5 items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none",
                          selected
                            ? "bg-white text-[var(--felt)]"
                            : "bg-[var(--amber)] text-[#1a140c]",
                        ].join(" ")}
                      >
                        {pending > 9 ? "9+" : pending}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {activeTab === "overview" ? (
              <div className="space-y-4">
                <SurfaceCard>
                  {t.thumbnailUrl ? (
                    <button
                      type="button"
                      onClick={() =>
                        setFlyerPreview({
                          src: t.thumbnailUrl!,
                          title: t.title,
                        })
                      }
                      className="block w-full bg-[var(--surface-2)] text-left transition hover:opacity-95"
                      aria-label={`View full ${t.title} flyer`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={t.thumbnailUrl}
                        alt={`${t.title} flyer`}
                        className="mx-auto max-h-[min(80dvh,48rem)] w-full object-contain"
                      />
                      <p className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                        Tap to enlarge
                      </p>
                    </button>
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

                  <div className="space-y-5 border-t border-[var(--line)] p-3 sm:p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={[
                          "inline-flex rounded-[var(--radius)] px-2.5 py-1 text-[11px] font-semibold",
                          statusTone(t.status),
                        ].join(" ")}
                      >
                        {STATUS_LABELS[t.status]}
                      </span>
                      <span className="rounded-[var(--radius)] bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink)]">
                        {formatEntryFee(t.entryFeeCents)}
                      </span>
                      <span className="rounded-[var(--radius)] bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)]">
                        {t.approvedCount}/{t.maxPlayers}{" "}
                        {entryNoun(t.eventType)} in
                      </span>
                      <span className="rounded-[var(--radius)] bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)]">
                        Fargo {fargoCapText(t)}
                      </span>
                    </div>

                    {t.description ? (
                      <p className="text-sm leading-relaxed text-[var(--ink)]">
                        {t.description}
                      </p>
                    ) : null}

                    <div
                      role="tablist"
                      aria-label="Event details"
                      className="grid grid-cols-5 gap-0.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] p-0.5"
                    >
                      {OVERVIEW_DETAIL_TABS.map((item) => {
                        const selected = overviewDetailTab === item.id;
                        const Icon = OVERVIEW_DETAIL_TAB_ICONS[item.id];
                        return (
                          <button
                            key={item.id}
                            type="button"
                            role="tab"
                            aria-selected={selected}
                            aria-label={item.label}
                            onClick={() =>
                              startDetailTransition(() => {
                                setOverviewDetailTab(item.id);
                              })
                            }
                            className={[
                              "relative flex flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1.5 transition",
                              selected
                                ? "bg-[var(--felt)] text-white shadow-sm"
                                : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]",
                            ].join(" ")}
                          >
                            <Icon className="h-4 w-4" />
                            <span className="text-[9px] font-semibold leading-none tracking-wide sm:text-[10px]">
                              {item.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {overviewDetailTab === "when" ? (
                      <OverviewSection title="When & where">
                        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <OverviewFact
                            label="When"
                            value={formatStartsAt(t.startsAt)}
                          />
                          <OverviewFact
                            label="Check-in"
                            value={
                              t.checkInAt
                                ? formatStartsAt(t.checkInAt)
                                : "At start"
                            }
                          />
                          <OverviewFact label="Venue" value={t.venueName} />
                          <OverviewFact
                            label="City"
                            value={[t.city, t.region]
                              .filter(Boolean)
                              .join(", ")}
                          />
                          {t.venueAddress?.trim() ? (
                            <OverviewFact
                              label="Address"
                              value={t.venueAddress.trim()}
                              wide
                              copied={addressCopied}
                              onCopy={() =>
                                copyAddress(t.venueAddress.trim())
                              }
                            />
                          ) : null}
                        </dl>
                      </OverviewSection>
                    ) : null}

                    {overviewDetailTab === "match" ? (
                      <OverviewSection title="The match">
                        <dl className="grid grid-cols-2 gap-x-3 gap-y-3">
                          <OverviewFact label="Game" value={gameLabel} />
                          <OverviewFact label="Bracket" value={formatLabel} />
                          <OverviewFact
                            label="Entry"
                            value={entryShapeText(t)}
                          />
                          <OverviewFact
                            label="Handicap"
                            value={handicapLabel(t.handicapSystem)}
                          />
                          <OverviewFact label="Race" value={raceText(t)} />
                          <OverviewFact label="Break" value={breakLabel} />
                          <OverviewFact label="Draw" value={drawLabel} />
                          <OverviewFact
                            label="Tables"
                            value={tableSizeLabel}
                          />
                          <OverviewFact label="Ruleset" value={rulesetLabel} />
                          <OverviewFact
                            label="Fargo"
                            value={
                              t.maxFargo != null ? `Cap ${t.maxFargo}` : "Open"
                            }
                          />
                          <OverviewFact
                            label="Robustness"
                            value={minRobustnessLabel(t.minRobustnessStatus)}
                            wide
                          />
                        </dl>
                        {t.handicapNotes?.trim() ? (
                          <div className="mt-3">
                            <p className={labelClass}>Handicap notes</p>
                            <p className="text-sm leading-relaxed text-[var(--ink)]">
                              {t.handicapNotes}
                            </p>
                          </div>
                        ) : null}
                      </OverviewSection>
                    ) : null}

                    {overviewDetailTab === "pay" ? (
                      <OverviewSection title="Entry & pay">
                        <dl className="grid grid-cols-2 gap-x-3 gap-y-3">
                          <OverviewFact
                            label="Entry fee"
                            value={formatEntryFee(t.entryFeeCents)}
                          />
                          <OverviewFact
                            label="Added money"
                            value={addedMoneyLabel}
                          />
                          <OverviewFact
                            label="Registration"
                            value={registrationLabel}
                            wide
                          />
                          {t.venmoHandle?.trim() ? (
                            <OverviewFact
                              label="Venmo"
                              value={
                                t.venmoHandle.trim().startsWith("@")
                                  ? t.venmoHandle.trim()
                                  : `@${t.venmoHandle.trim()}`
                              }
                              wide
                            />
                          ) : null}
                          {t.zelleHandle?.trim() ? (
                            <OverviewFact
                              label="Zelle"
                              value={t.zelleHandle.trim()}
                              wide
                            />
                          ) : null}
                          {t.cashAppHandle?.trim() ? (
                            <OverviewFact
                              label="Cash App"
                              value={
                                t.cashAppHandle.trim().startsWith("$")
                                  ? t.cashAppHandle.trim()
                                  : `$${t.cashAppHandle.trim().replace(/^\$/, "")}`
                              }
                              wide
                            />
                          ) : null}
                          {t.payMethod === "door" ||
                          (!t.venmoHandle?.trim() &&
                            !t.zelleHandle?.trim() &&
                            !t.cashAppHandle?.trim()) ? (
                            <OverviewFact
                              label="Door"
                              value="Pay at door"
                              wide
                            />
                          ) : null}
                          {t.payMethod === "in-app-later" &&
                          (t.venmoHandle?.trim() ||
                            t.zelleHandle?.trim() ||
                            t.cashAppHandle?.trim()) ? (
                            <OverviewFact
                              label="Also"
                              value="In-app later"
                              wide
                            />
                          ) : null}
                        </dl>
                      </OverviewSection>
                    ) : null}

                    {overviewDetailTab === "contact" ? (
                      <OverviewSection title="Contact">
                        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <OverviewFact
                            label="Organizer"
                            value={t.organizerName}
                          />
                          {t.organizerPhone?.trim() ? (
                            <OverviewFact
                              label="Phone"
                              value={t.organizerPhone.trim()}
                            />
                          ) : null}
                          {t.organizerEmail?.trim() ? (
                            <OverviewFact
                              label="Email"
                              value={t.organizerEmail.trim()}
                              wide
                            />
                          ) : null}
                        </dl>
                      </OverviewSection>
                    ) : null}

                    {overviewDetailTab === "entry" ? (
                      <div className="space-y-3">{overviewSignup}</div>
                    ) : null}
                  </div>
                </SurfaceCard>

                <TournamentCalcuttaPanel
                  tournamentId={t.id}
                  registrations={detail?.registrations ?? []}
                  isOrganizer={false}
                  variant="board"
                />
              </div>
            ) : null}

            {isOrganizer && activeTab === "signups" ? (
              <div className="space-y-3">
                {actionMsg ? (
                  <p className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--felt-deep)]">
                    {actionMsg}
                  </p>
                ) : null}

                <section className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]">
                  <div className="sticky top-0 z-10 space-y-2 border-b border-[var(--line)] bg-[var(--surface)]/95 px-3 py-2.5 backdrop-blur-sm sm:px-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="min-w-[9.5rem] flex-1">
                        <SelectField
                          aria-label="Signup status filter"
                          value={signupStatusFilter}
                          options={signupStatusOptions}
                          onChange={setSignupStatusFilter}
                        />
                      </div>
                      {signupQueueSortable ? (
                        <div className="min-w-[8.5rem] flex-1">
                          <SelectField
                            aria-label="Signup sort order"
                            value={signupQueueSort}
                            options={SIGNUP_QUEUE_SORT_OPTIONS}
                            onChange={setSignupQueueSort}
                          />
                        </div>
                      ) : null}
                    </div>

                    {signupSelectable && filteredSignups.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex items-center gap-2 text-[11px] font-semibold text-[var(--muted)]">
                          <input
                            type="checkbox"
                            checked={allVisibleSignupsSelected}
                            onChange={toggleSelectAllSignups}
                            className="h-4 w-4 accent-[var(--felt)]"
                            aria-label="Select all visible signups"
                          />
                          Select all
                        </label>
                        {signupSelectedInView.length > 0 ? (
                          <span className="text-[11px] font-semibold tabular-nums text-[var(--felt-deep)]">
                            {signupSelectedInView.length} selected
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    {signupSelectedInView.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() =>
                            void onBulkUpdateRegistrations(
                              signupSelectedInView.map((r) => r.id),
                              { status: "approved" },
                            )
                          }
                          className={signupBulkApproveBtn}
                        >
                          Approve
                        </button>
                        {signupStatusFilter === "pending" ? (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() =>
                              void onBulkUpdateRegistrations(
                                signupSelectedInView.map((r) => r.id),
                                { status: "waitlisted" },
                              )
                            }
                            className={signupBulkWaitlistBtn}
                          >
                            Waitlist
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() =>
                            void onBulkUpdateRegistrations(
                              signupSelectedInView.map((r) => r.id),
                              { status: "rejected" },
                            )
                          }
                          className={signupBulkRejectBtn}
                        >
                          Reject
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {filteredSignups.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-[var(--muted)]">
                      {sortedRegistrations.length === 0
                        ? "No signups yet."
                        : signupStatusFilter === "pending"
                          ? "No pending requests."
                          : "No signups in this status."}
                    </p>
                  ) : (
                    <ul className="divide-y divide-[var(--line)]">
                      {filteredSignups.map((reg) => {
                        const stats = statsForRegistration(reg);
                        const submitted = signupSubmittedParts(reg);
                        const note = reg.noteToOrganizer?.trim() || null;
                        const actions =
                          reg.status === "pending" ? (
                            <>
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() =>
                                  void onUpdateRegistration(reg.id, {
                                    status: "approved",
                                  })
                                }
                                className={signupApproveBtn}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() =>
                                  void onUpdateRegistration(reg.id, {
                                    status: "waitlisted",
                                  })
                                }
                                className={signupWaitlistBtn}
                              >
                                Waitlist
                              </button>
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() =>
                                  void onUpdateRegistration(reg.id, {
                                    status: "rejected",
                                  })
                                }
                                className={signupRejectBtn}
                              >
                                Reject
                              </button>
                            </>
                          ) : reg.status === "waitlisted" ? (
                            <>
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() =>
                                  void onUpdateRegistration(reg.id, {
                                    status: "approved",
                                  })
                                }
                                className={signupApproveBtn}
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
                                className={signupRejectBtn}
                              >
                                Reject
                              </button>
                            </>
                          ) : reg.status === "approved" ? (
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() =>
                                void onUpdateRegistration(reg.id, {
                                  status: "pending",
                                })
                              }
                              className={signupRevertBtn}
                            >
                              Unapprove
                            </button>
                          ) : reg.status === "rejected" ? (
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() =>
                                void onUpdateRegistration(reg.id, {
                                  status: "pending",
                                })
                              }
                              className={signupRevertBtn}
                            >
                              Unreject
                            </button>
                          ) : undefined;

                        return (
                          <li key={reg.id}>
                            <SignupRequestRow
                              title={registrationCardTitle(reg)}
                              status={reg.status}
                              showStatus={signupStatusFilter !== "pending"}
                              submittedDate={submitted.date}
                              submittedTime={submitted.time}
                              rating={stats.rating}
                              onOpenDetails={() => openSignupPlayer(reg)}
                              detailsLabel={
                                stats.playerId
                                  ? `View player: ${reg.displayName}`
                                  : `Search players for ${reg.displayName}`
                              }
                              note={note}
                              onShowNote={() => openSignupMessage(reg)}
                              teammates={reg.teammates}
                              actions={actions}
                              selectable={signupSelectable}
                              selected={signupSelectedIds.has(reg.id)}
                              onToggleSelect={() =>
                                toggleSignupSelected(reg.id)
                              }
                            />
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              </div>
            ) : null}

            {isOrganizer && activeTab === "field" ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-1.5">
                  <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                      Field
                    </p>
                    <p className="font-[family-name:var(--font-display)] text-base font-semibold tabular-nums text-[var(--ink)]">
                      {fieldStats.approved}
                    </p>
                  </div>
                  <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                      In
                    </p>
                    <p className="font-[family-name:var(--font-display)] text-base font-semibold tabular-nums text-[var(--ink)]">
                      {fieldStats.checkedIn}
                    </p>
                  </div>
                  <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                      Paid
                    </p>
                    <p className="font-[family-name:var(--font-display)] text-base font-semibold tabular-nums text-[var(--ink)]">
                      {fieldStats.paid}
                    </p>
                  </div>
                </div>

                <section className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]">
                  <div className="space-y-2 border-b border-[var(--line)] px-3 py-2.5 sm:px-4">
                    <SearchField
                      embedded
                      value={fieldQuery}
                      onChange={setFieldQuery}
                      placeholder="Find player…"
                      label="Search field board"
                    />
                    <div
                      role="group"
                      aria-label="Field board filters"
                      className="grid grid-cols-3 gap-0.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] p-0.5"
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
                              "rounded-md px-2 py-1.5 text-center text-xs font-semibold transition",
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
                    <p className="mx-3 mt-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--felt-deep)] sm:mx-4">
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
                      fieldEntries.map((reg) => {
                        const stats = statsForRegistration(reg);
                        const title = registrationCardTitle(reg);
                        const hasRating = stats.rating != null;
                        const showCaptainUnderTeam =
                          Boolean(reg.teamName?.trim()) &&
                          reg.teamName!.trim() !== reg.displayName.trim();

                        return (
                          <li key={reg.id} className="px-2 py-1.5 sm:px-3">
                            <div className="flex items-center gap-1.5">
                              <div className="w-8 shrink-0 font-[family-name:var(--font-display)] text-[13px] font-semibold tabular-nums leading-none text-[var(--felt-deep)]">
                                {hasRating ? stats.rating : "—"}
                              </div>

                              <div className="flex min-w-0 flex-1 items-center gap-0.5">
                                <div className="min-w-0">
                                  <p className="font-[family-name:var(--font-display)] text-[13px] font-semibold leading-snug tracking-tight text-[var(--ink)] [overflow-wrap:anywhere]">
                                    {title}
                                  </p>
                                  {showCaptainUnderTeam ? (
                                    <p className="mt-0.5 text-[11px] leading-tight text-[var(--muted)]">
                                      {reg.displayName}
                                    </p>
                                  ) : null}
                                </div>
                                {stats.playerId ? (
                                  <button
                                    type="button"
                                    onClick={() => openSignupPlayer(reg)}
                                    className={signupInlineIconBtn}
                                    aria-label={`View player history: ${reg.displayName}`}
                                    title="Player history"
                                  >
                                    <EyeIcon className="h-3.5 w-3.5" />
                                  </button>
                                ) : null}
                                {!hasRating ? (
                                  <FieldEstimatedFargoInput
                                    disabled={saving}
                                    onSave={(rating) =>
                                      onUpdateRegistration(reg.id, {
                                        ratingAtSignup: rating,
                                      })
                                    }
                                  />
                                ) : null}
                              </div>

                              <div className="flex shrink-0 items-center gap-1">
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() =>
                                    void onUpdateRegistration(reg.id, {
                                      checkedIn: !reg.checkedIn,
                                    })
                                  }
                                  className={
                                    reg.checkedIn
                                      ? fieldToggleCheckedIn
                                      : fieldToggleIdle
                                  }
                                  aria-pressed={reg.checkedIn}
                                  aria-label={
                                    reg.checkedIn
                                      ? `Mark ${reg.displayName} not checked in`
                                      : `Check in ${reg.displayName}`
                                  }
                                  title={
                                    reg.checkedIn ? "Checked in" : "Check in"
                                  }
                                >
                                  In
                                </button>
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() =>
                                    void onUpdateRegistration(reg.id, {
                                      paid: !reg.paid,
                                    })
                                  }
                                  className={
                                    reg.paid ? fieldTogglePaid : fieldToggleIdle
                                  }
                                  aria-pressed={reg.paid}
                                  aria-label={
                                    reg.paid
                                      ? `Mark ${reg.displayName} unpaid`
                                      : `Mark ${reg.displayName} paid`
                                  }
                                  title={reg.paid ? "Paid" : "Mark paid"}
                                >
                                  {reg.paid ? "Paid" : "Pay"}
                                </button>
                              </div>
                            </div>
                          </li>
                        );
                      })
                    )}
                  </ul>
                </section>
              </div>
            ) : null}

            {isOrganizer && activeTab === "calcutta" ? (
              <TournamentCalcuttaPanel
                tournamentId={t.id}
                registrations={detail?.registrations ?? []}
                isOrganizer
                variant="manage"
              />
            ) : null}

            {activeTab === "manage" ? (
              <div className="space-y-3">
                {actionMsg ? (
                  <p className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--felt-deep)]">
                    {actionMsg}
                  </p>
                ) : null}

                <section className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]">
                  <div className="border-b border-[var(--line)] px-3 py-3 sm:px-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                      Tournament settings
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {isOrganizer
                        ? "Edit details, push the bracket to Digital Pool, or remove this event."
                        : "Preview for feedback — only the organizer can make changes."}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-3 sm:p-4">
                    <button
                      type="button"
                      disabled={!isOrganizer || saving}
                      onClick={() => startEdit(t)}
                      className={manageActionTile}
                    >
                      <span
                        className={`${manageActionIcon} bg-[linear-gradient(180deg,#2f8fc2_0%,var(--felt)_45%,var(--felt-soft)_100%)] text-white`}
                      >
                        <EditEventIcon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-[var(--ink)]">
                          Edit event
                        </span>
                        <span className="mt-0.5 block text-[11px] text-[var(--muted)]">
                          Details, fees, and rules
                        </span>
                      </span>
                    </button>

                    {t.status === "open" || t.status === "full" ? (
                      <button
                        type="button"
                        disabled={!isOrganizer || saving}
                        onClick={() =>
                          void setTournamentStatus(
                            t.id,
                            "closed",
                            "Registration closed.",
                          )
                        }
                        className={manageActionTile}
                      >
                        <span
                          className={`${manageActionIcon} bg-[linear-gradient(180deg,#3d4b58_0%,#2a3540_48%,#222b35_100%)] text-[var(--chalk)]`}
                        >
                          <CloseRegistrationIcon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-[var(--ink)]">
                            Close registration
                          </span>
                          <span className="mt-0.5 block text-[11px] text-[var(--muted)]">
                            Stop new signups
                          </span>
                        </span>
                      </button>
                    ) : t.status === "closed" || t.status === "draft" ? (
                      <button
                        type="button"
                        disabled={!isOrganizer || saving}
                        onClick={() =>
                          void setTournamentStatus(
                            t.id,
                            "open",
                            "Registration reopened.",
                          )
                        }
                        className={manageActionTile}
                      >
                        <span
                          className={`${manageActionIcon} bg-[linear-gradient(180deg,#2f8fc2_0%,var(--felt)_45%,var(--felt-soft)_100%)] text-white`}
                        >
                          <ReopenRegistrationIcon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-[var(--ink)]">
                            Reopen registration
                          </span>
                          <span className="mt-0.5 block text-[11px] text-[var(--muted)]">
                            Accept signups again
                          </span>
                        </span>
                      </button>
                    ) : (
                      <div className={`${manageActionTile} opacity-60`}>
                        <span
                          className={`${manageActionIcon} bg-[var(--surface-3)] text-[var(--muted)]`}
                        >
                          <CloseRegistrationIcon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-[var(--ink)]">
                            Registration locked
                          </span>
                          <span className="mt-0.5 block text-[11px] text-[var(--muted)]">
                            Status: {STATUS_LABELS[t.status] ?? t.status}
                          </span>
                        </span>
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={!isOrganizer || saving}
                      onClick={() =>
                        void pushToDigitalPool(
                          t.id,
                          Boolean(t.digitalPoolSlug),
                        )
                      }
                      className={manageActionTile}
                    >
                      <span
                        className={`${manageActionIcon} bg-[linear-gradient(180deg,#edc48a_0%,var(--amber)_48%,#c4893f_100%)] text-[#1a140c]`}
                      >
                        <DigitalPoolPushIcon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-[var(--ink)]">
                          {t.digitalPoolSlug
                            ? "Push again to Digital Pool"
                            : "Push to Digital Pool"}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-[var(--muted)]">
                          {user?.digitalPoolLinked
                            ? "Create bracket from checked-in / paid field"
                            : "Connect Digital Pool in Settings first"}
                        </span>
                      </span>
                    </button>

                    {!confirmRemove ? (
                      <button
                        type="button"
                        disabled={!isOrganizer || saving}
                        onClick={() => {
                          setActionMsg(null);
                          setConfirmRemove(true);
                        }}
                        className={manageActionTile}
                      >
                        <span
                          className={`${manageActionIcon} bg-[linear-gradient(180deg,#e0726a_0%,#c44a42_48%,#9e342e_100%)] text-white`}
                        >
                          <RemoveEventIcon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-[var(--ink)]">
                            Remove event
                          </span>
                          <span className="mt-0.5 block text-[11px] text-[var(--muted)]">
                            Delete permanently
                          </span>
                        </span>
                      </button>
                    ) : null}
                  </div>

                  {t.digitalPoolSlug ? (
                    <div className="space-y-2 border-t border-[var(--line)] px-3 py-3 sm:px-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                        Digital Pool
                      </p>
                      <a
                        href={`https://digitalpool.com/tournament-builder/${t.digitalPoolSlug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex text-sm font-semibold text-[var(--felt-deep)] underline-offset-2 hover:underline"
                      >
                        Open tournament builder
                      </a>
                      {t.digitalPoolPushedAt ? (
                        <p className="text-xs text-[var(--muted)]">
                          Last pushed{" "}
                          {new Date(t.digitalPoolPushedAt).toLocaleString()}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {confirmRemove ? (
                    <div className="space-y-3 border-t border-[var(--line)] px-3 py-3 sm:px-4">
                      <p className="text-sm text-[var(--ink)]">
                        Remove{" "}
                        <span className="font-semibold">{t.title}</span>? This
                        permanently deletes the event, signups, messages, and
                        Calcutta data. This cannot be undone.
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={!isOrganizer || saving}
                          onClick={() => void removeTournament(t.id)}
                          className="rounded-[var(--radius)] bg-[linear-gradient(180deg,#e0726a_0%,#c44a42_48%,#9e342e_100%)] px-4 py-2.5 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] disabled:opacity-50"
                        >
                          {saving ? "Removing…" : "Yes, remove"}
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => setConfirmRemove(false)}
                          className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-4 py-2.5 text-sm font-semibold text-[var(--ink)] disabled:opacity-50"
                        >
                          Keep event
                        </button>
                      </div>
                    </div>
                  ) : null}
                </section>

                {actionMsg ? (
                  <p className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--felt-deep)]">
                    {actionMsg}
                  </p>
                ) : null}

                <SurfaceCard>
                  <div className="border-b border-[var(--line)] px-3 py-3 sm:px-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                      Messages
                    </p>
                  </div>
                  {detail.messages.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-[var(--muted)]">
                      {isOrganizer
                        ? "No messages yet."
                        : "Messages are visible to the organizer only."}
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
          <p className="rounded-[var(--radius)] border border-[var(--danger)]/40 bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger)]">
            {error}
          </p>
        ) : null}

        {flyerPreview ? (
          <FlyerLightbox
            src={flyerPreview.src}
            title={flyerPreview.title}
            onClose={closeFlyerPreview}
          />
        ) : null}

        {signupMessage ? (
          <SignupMessageDialog
            name={signupMessage.name}
            body={signupMessage.body}
            onClose={() => setSignupMessage(null)}
          />
        ) : null}
      </div>
    );
  }


  return (
    <div className="space-y-4 animate-panel">
      <SectionCard
        eyebrow="Events"
        title="Tournaments"
        description="Browse local brackets by venue and Fargo cap, or create your own night."
      />

      <IconSubTabs
        aria-label="Events sections"
        value={browseSubTab}
        onChange={setBrowseSubTab}
        items={[
          { id: "browse", label: "Browse", icon: OverviewSubIcon },
          { id: "teams", label: "Teams", icon: RosterSubIcon },
          { id: "templates", label: "Templates", icon: LineupsSubIcon },
        ]}
      />

      {browseSubTab === "teams" ? (
        <SurfaceCard>
          <div className="p-3 sm:p-4">
            <EntryTeamsPresetsPanel
              signedIn={Boolean(user)}
              authLoading={authLoading}
              captainLabel={user?.name ?? user?.email ?? "You"}
              captainFargo={resolvedFargo}
              onRequestLogin={onRequestLogin}
            />
          </div>
        </SurfaceCard>
      ) : null}

      {browseSubTab === "templates" ? (
        <SurfaceCard>
          <div className="p-3 sm:p-4">
            <TemplatesPresetsPanel
              signedIn={Boolean(user)}
              authLoading={authLoading}
              onRequestLogin={onRequestLogin}
              onUseTemplate={useTemplateForCreate}
            />
          </div>
        </SurfaceCard>
      ) : null}

      {browseSubTab === "browse" ? (
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
                setSelectedTemplateId("");
                setTemplateName("");
                setTemplateMsg(null);
                setView("create");
                setError(null);
              }}
              className="rounded-[var(--radius)] bg-[var(--felt)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--felt-soft)]"
            >
              + Create
            </button>
          </div>
          <SearchField
            embedded
            value={q}
            onChange={setQ}
            placeholder="Search title, venue, city…"
            label="Search events"
          />
          <div className="grid grid-cols-2 gap-2">
            <DateField
              aria-label="Events from date"
              placeholder="From date"
              value={startsFrom}
              max={startsTo || undefined}
              onChange={(next) => {
                setStartsFrom(next);
                if (next && startsTo && next > startsTo) setStartsTo("");
              }}
            />
            <DateField
              aria-label="Events to date"
              placeholder="To date"
              value={startsTo}
              min={startsFrom || undefined}
              onChange={setStartsTo}
            />
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
            <SelectField
              aria-label="Filter by format"
              value={eventTypeFilter}
              placeholder="All formats"
              options={[
                { value: "", label: "All formats" },
                ...EVENT_TYPE_OPTIONS,
              ]}
              onChange={(next) => setEventTypeFilter(next as EventType | "")}
            />
            <SelectField
              aria-label="Filter by handicap"
              value={handicapFilter}
              placeholder="Handicap / scratch"
              options={[
                { value: "", label: "Any handicap" },
                { value: "handicapped", label: "Handicapped" },
                { value: "scratch", label: "Scratch" },
              ]}
              onChange={(next) => setHandicapFilter(next as HandicapFilter)}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex cursor-pointer items-center gap-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--ink)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0 accent-[var(--felt)] disabled:cursor-not-allowed"
                checked={eligibleOnly}
                onChange={(e) => setEligibleOnly(e.target.checked)}
                disabled={resolvedFargo == null}
              />
              <span className="min-w-0 leading-snug">
                Eligible for my Fargo
                {resolvedFargo != null ? ` (${resolvedFargo})` : ""}
              </span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--ink)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0 accent-[var(--felt)] disabled:cursor-not-allowed"
                checked={eligibleRobustnessOnly}
                onChange={(e) => setEligibleRobustnessOnly(e.target.checked)}
                disabled={!user || resolvedRobustnessStatus == null}
              />
              <span className="min-w-0 leading-snug">
                Eligible for my robustness
                {user
                  ? ` (${robustnessStatusLabel(
                      resolvedRobustnessStatus ?? "starter",
                    )})`
                  : ""}
              </span>
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
              title="No matching events"
              body="Try clearing a filter, or post a local tournament night."
              action={
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setForm(emptyForm());
                    setSelectedTemplateId("");
                    setTemplateName("");
                    setTemplateMsg(null);
                    setView("create");
                  }}
                  className="rounded-[var(--radius)] bg-[var(--felt)] px-4 py-2.5 text-sm font-semibold text-white"
                >
                  + Create
                </button>
              }
            />
          ) : (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between gap-3 px-0.5">
                <p className="text-sm text-[var(--muted)]">
                  <span className="tabular-nums font-semibold text-[var(--ink)]">
                    {events.length}
                  </span>{" "}
                  event{events.length === 1 ? "" : "s"}
                </p>
                {eventsTotalPages > 1 ? (
                  <p className="text-xs tabular-nums text-[var(--muted)]">
                    Page {eventsSafePage} of {eventsTotalPages}
                  </p>
                ) : null}
              </div>
              <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius)] border border-[var(--line)]">
                {pagedEvents.map((event) => (
                  <li key={event.id}>
                    <div className="flex w-full items-start gap-3 px-3 py-3 transition hover:bg-[var(--surface-2)]/70 sm:px-4">
                      {event.thumbnailUrl ? (
                        <button
                          type="button"
                          onClick={() =>
                            setFlyerPreview({
                              src: event.thumbnailUrl!,
                              title: event.title,
                            })
                          }
                          className="relative mt-0.5 h-[5.5rem] w-16 shrink-0 overflow-hidden rounded-[var(--radius)] bg-[var(--surface-2)] ring-1 ring-[var(--line)]"
                          aria-label={`View ${event.title} flyer`}
                          title="View full flyer"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={event.thumbnailUrl}
                            alt=""
                            className="h-full w-full object-contain"
                          />
                        </button>
                      ) : (
                        <div className="mt-0.5 flex h-[5.5rem] w-16 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[linear-gradient(145deg,rgba(29,110,158,0.55),rgba(19,78,115,0.75))] text-xs font-semibold text-white/80">
                          Event
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => void openDetail(event.id)}
                        className="flex min-h-[5.5rem] min-w-0 flex-1 flex-col text-left"
                      >
                        <p className="min-h-[2.5rem] font-[family-name:var(--font-display)] text-[15px] font-semibold leading-snug tracking-tight text-[var(--ink)] [overflow-wrap:anywhere]">
                          {event.title}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span
                            className={[
                              "rounded-[var(--radius)] px-2 py-0.5 text-[10px] font-semibold",
                              statusTone(event.status),
                            ].join(" ")}
                          >
                            {STATUS_LABELS[event.status]}
                          </span>
                          <span className="text-xs font-medium text-[var(--ink)]">
                            {formatStartsAt(event.startsAt)}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-[var(--muted)]">
                          {eventKeyFacts(event)}
                          {" · "}
                          {EVENT_TYPE_OPTIONS.find(
                            (o) => o.value === event.eventType,
                          )?.label ?? event.eventType}
                        </p>
                        <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                          {event.venueName}, {event.city}
                          {" · "}
                          {formatEntryFee(event.entryFeeCents)}
                          {" · "}
                          {event.spotsLeft} {entryNoun(event.eventType)} left
                        </p>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              {eventsTotalPages > 1 ? (
                <nav
                  aria-label="Events pages"
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2 shadow-[var(--shadow)] sm:px-3"
                >
                  <button
                    type="button"
                    onClick={() => goToEventsPage(eventsSafePage - 1)}
                    disabled={eventsSafePage <= 1}
                    className="rounded-[var(--radius)] bg-[var(--surface-2)] px-3.5 py-1.5 text-sm font-semibold text-[var(--ink)] transition hover:bg-[var(--surface-3)] disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    Previous
                  </button>
                  <div className="flex flex-wrap items-center justify-center gap-1">
                    {eventsPageNumbers(eventsSafePage, eventsTotalPages).map(
                      (item, index) =>
                        item === "…" ? (
                          <span
                            key={`ellipsis-${index}`}
                            className="px-1 text-sm text-[var(--muted)]"
                            aria-hidden
                          >
                            …
                          </span>
                        ) : (
                          <button
                            key={item}
                            type="button"
                            aria-label={`Page ${item}`}
                            aria-current={
                              item === eventsSafePage ? "page" : undefined
                            }
                            onClick={() => goToEventsPage(item)}
                            className={[
                              "min-w-9 rounded-[var(--radius)] px-2.5 py-1.5 text-sm font-semibold tabular-nums transition",
                              item === eventsSafePage
                                ? "bg-[var(--felt)] text-white shadow-sm"
                                : "bg-[var(--surface-2)] text-[var(--muted)] hover:bg-[var(--surface-3)] hover:text-[var(--ink)]",
                            ].join(" ")}
                          >
                            {item}
                          </button>
                        ),
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => goToEventsPage(eventsSafePage + 1)}
                    disabled={eventsSafePage >= eventsTotalPages}
                    className="rounded-[var(--radius)] bg-[var(--surface-2)] px-3.5 py-1.5 text-sm font-semibold text-[var(--ink)] transition hover:bg-[var(--surface-3)] disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    Next
                  </button>
                </nav>
              ) : null}
            </div>
          )}
        </div>
      </SurfaceCard>
      ) : null}

      {flyerPreview ? (
        <FlyerLightbox
          src={flyerPreview.src}
          title={flyerPreview.title}
          onClose={closeFlyerPreview}
        />
      ) : null}
    </div>
  );
}
