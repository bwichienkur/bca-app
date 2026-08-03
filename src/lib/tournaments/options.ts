import type {
  BracketFormat,
  EventType,
  GameType,
  HandicapSystem,
  PayMethod,
  RegistrationMode,
  RulesetPreset,
  TournamentStatus,
  UnratedPolicy,
} from "@/lib/tournaments/types";

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

export const PAY_METHOD_OPTIONS: { value: PayMethod; label: string }[] = [
  { value: "door", label: "Pay at door" },
  { value: "venmo", label: "Venmo" },
  { value: "in-app-later", label: "In-app later (coming soon)" },
];

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
