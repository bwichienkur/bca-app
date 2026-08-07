import type {
  BracketFormat,
  BreakFormat,
  DrawType,
  EventType,
  GameType,
  HandicapSystem,
  PayMethod,
  RegistrationMode,
  RobustnessStatus,
  RulesetPreset,
  TournamentStatus,
  UnratedPolicy,
} from "@/lib/tournaments/types";

const ROBUSTNESS_RANK: Record<RobustnessStatus, number> = {
  starter: 0,
  preliminary: 1,
  established: 2,
};

export function meetsMinRobustness(
  status: RobustnessStatus | null | undefined,
  min: RobustnessStatus | null | undefined,
): boolean {
  if (!min) return true;
  const actual = status ?? "starter";
  return ROBUSTNESS_RANK[actual] >= ROBUSTNESS_RANK[min];
}

export function robustnessStatusLabel(status: RobustnessStatus): string {
  if (status === "established") return "Established";
  if (status === "preliminary") return "Preliminary";
  return "Starter";
}

export function minRobustnessLabel(
  min: RobustnessStatus | null | undefined,
): string {
  if (!min) return "Any";
  if (min === "established") return "Established only";
  if (min === "preliminary") return "Preliminary or higher";
  return "Any";
}

export const GAME_TYPE_OPTIONS: { value: GameType; label: string }[] = [
  { value: "8-ball", label: "8-Ball" },
  { value: "9-ball", label: "9-Ball" },
  { value: "10-ball", label: "10-Ball" },
  { value: "mixed", label: "Mixed / Other" },
];

export const EVENT_TYPE_OPTIONS: { value: EventType; label: string }[] = [
  { value: "singles", label: "Singles" },
  { value: "scotch-doubles", label: "Scotch Doubles" },
  { value: "teams", label: "Teams" },
];

export const BRACKET_FORMAT_OPTIONS: { value: BracketFormat; label: string }[] = [
  { value: "single-elimination", label: "Single Elimination" },
  { value: "double-elimination", label: "Double Elimination" },
  { value: "round-robin", label: "Round Robin" },
  { value: "group-then-elim", label: "Groups → Elimination" },
];

/** Digital Pool break_format options. */
export const BREAK_FORMAT_OPTIONS: { value: BreakFormat; label: string }[] = [
  { value: "winner-break", label: "Winner break" },
  { value: "loser-break", label: "Loser break" },
  { value: "alternate-break", label: "Alternate break" },
];

/** Digital Pool draw_type options. */
export const DRAW_TYPE_OPTIONS: { value: DrawType; label: string }[] = [
  { value: "random", label: "Random" },
  { value: "seeded", label: "Seeded" },
  { value: "custom", label: "Custom" },
];

export const HANDICAP_SYSTEM_OPTIONS: {
  value: HandicapSystem;
  label: string;
  hint: string;
}[] = [
  { value: "fargo-hot", label: "Fargo Hot", hint: "Stronger race adjustments" },
  { value: "fargo-medium", label: "Fargo Medium", hint: "Balanced adjustments" },
  { value: "fargo-mild", label: "Fargo Mild", hint: "Lighter adjustments" },
  { value: "none", label: "None", hint: "Scratch / no handicap" },
  { value: "custom", label: "Custom", hint: "Describe in notes" },
];

export const UNRATED_POLICY_OPTIONS: { value: UnratedPolicy; label: string }[] = [
  { value: "message-organizer", label: "Message organizer" },
  { value: "provisional", label: "Allow provisional / estimated" },
  { value: "cap-at-max", label: "Cap at max Fargo" },
];

export const MIN_ROBUSTNESS_OPTIONS: {
  value: "" | RobustnessStatus;
  label: string;
}[] = [
  { value: "", label: "Any robustness" },
  { value: "preliminary", label: "Preliminary or higher" },
  { value: "established", label: "Established only" },
];

export const PAY_METHOD_OPTIONS: { value: PayMethod; label: string }[] = [
  { value: "door", label: "Pay at door" },
  { value: "venmo", label: "Venmo" },
  { value: "zelle", label: "Zelle" },
  { value: "cashapp", label: "Cash App" },
  { value: "stripe", label: "Pay online (Stripe)" },
];

/** Primary pay method that collects entry fees via Stripe Checkout. */
export function isStripePayMethod(method: PayMethod | null | undefined): boolean {
  return method === "stripe" || method === "in-app-later";
}

export function normalizePayMethod(raw: unknown): PayMethod {
  if (raw === "venmo" || raw === "zelle" || raw === "cashapp" || raw === "door") {
    return raw;
  }
  // Legacy "in-app-later" → stripe
  if (raw === "stripe" || raw === "in-app-later") {
    return "stripe";
  }
  return "door";
}

export function formatPaymentLines(t: {
  payMethod: PayMethod;
  venmoHandle?: string | null;
  zelleHandle?: string | null;
  cashAppHandle?: string | null;
}): string[] {
  const lines: string[] = [];
  const venmo = t.venmoHandle?.trim();
  const zelle = t.zelleHandle?.trim();
  const cashApp = t.cashAppHandle?.trim();
  if (t.payMethod === "stripe" || t.payMethod === "in-app-later") {
    lines.push("Pay online (Stripe)");
  }
  if (venmo) lines.push(`Venmo ${venmo.startsWith("@") ? venmo : `@${venmo}`}`);
  if (zelle) lines.push(`Zelle ${zelle}`);
  if (cashApp) {
    const tag = cashApp.startsWith("$") ? cashApp : `$${cashApp.replace(/^\$/, "")}`;
    lines.push(`Cash App ${tag}`);
  }
  if (lines.length === 0 || t.payMethod === "door") {
    if (!lines.includes("Pay at door")) lines.push("Pay at door");
  }
  return lines;
}

export const REGISTRATION_MODE_OPTIONS: {
  value: RegistrationMode;
  label: string;
}[] = [
  { value: "open", label: "Open (auto-approve)" },
  { value: "approval", label: "Approval required" },
  { value: "invite-only", label: "Invite only" },
];

export const TABLE_SIZE_OPTIONS: {
  value: "7ft" | "8ft" | "9ft" | "mixed";
  label: string;
}[] = [
  { value: "7ft", label: "7 ft" },
  { value: "8ft", label: "8 ft" },
  { value: "9ft", label: "9 ft" },
  { value: "mixed", label: "Mixed" },
];

export const RULESET_OPTIONS: { value: RulesetPreset; label: string }[] = [
  { value: "bca", label: "BCA" },
  { value: "wpa", label: "WPA" },
  { value: "house", label: "House rules" },
];

export const STATUS_LABELS: Record<TournamentStatus, string> = {
  draft: "Draft",
  open: "Open",
  full: "Full",
  closed: "Closed",
  completed: "Completed",
  canceled: "Cancelled",
};

/** Statuses an organizer can set manually (full is derived from capacity). */
export const ORGANIZER_STATUS_OPTIONS: {
  value: Exclude<TournamentStatus, "full">;
  label: string;
}[] = [
  { value: "draft", label: "Draft" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "completed", label: "Completed" },
  { value: "canceled", label: "Cancelled" },
];

/** Create-time choice: open for signups now, or keep as draft. */
export const CREATE_STATUS_OPTIONS: {
  value: Extract<TournamentStatus, "open" | "draft">;
  label: string;
}[] = [
  { value: "open", label: "Open for registration" },
  { value: "draft", label: "Draft (not open yet)" },
];

export const FL_REGIONS = [
  "Palm Beach",
  "Broward",
  "Miami-Dade",
  "Martin",
  "St. Lucie",
  "Indian River",
  "Other",
] as const;

export function formatEntryFee(cents: number): string {
  if (cents <= 0) return "Free";
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export function entryNoun(eventType: EventType, count = 0): string {
  if (eventType === "scotch-doubles") {
    return count === 1 ? "pair" : "pairs";
  }
  if (eventType === "teams") {
    return count === 1 ? "team" : "teams";
  }
  return count === 1 ? "player" : "players";
}

export function defaultTeamSize(eventType: EventType): number {
  if (eventType === "scotch-doubles") return 2;
  if (eventType === "teams") return 5;
  return 1;
}

export function maxEntriesLabel(eventType: EventType): string {
  if (eventType === "scotch-doubles") return "Max pairs";
  if (eventType === "teams") return "Max teams";
  return "Max players";
}

export function formatStartsAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
