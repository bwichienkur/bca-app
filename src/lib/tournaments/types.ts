export type GameType = "8-ball" | "9-ball" | "10-ball" | "mixed";
export type EventType = "singles" | "scotch-doubles" | "teams";
export type BracketFormat =
  | "single-elimination"
  | "double-elimination"
  | "round-robin"
  | "group-then-elim";
export type HandicapSystem =
  | "none"
  | "fargo-hot"
  | "fargo-medium"
  | "fargo-mild"
  | "custom";
export type RulesetPreset = "bca" | "wpa" | "house";
export type UnratedPolicy = "cap-at-max" | "provisional" | "message-organizer";
/** Minimum Fargo robustness required to sign up. null = any. */
export type RobustnessStatus = "starter" | "preliminary" | "established";
export type RegistrationMode = "open" | "approval" | "invite-only";
export type PayMethod = "door" | "venmo" | "zelle" | "cashapp" | "in-app-later";
export type TournamentStatus =
  | "draft"
  | "open"
  | "full"
  | "closed"
  | "completed"
  | "canceled";
export type RegistrationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "withdrawn"
  | "waitlisted";

export type Tournament = {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  gameType: GameType;
  eventType: EventType;
  bracketFormat: BracketFormat;
  handicapSystem: HandicapSystem;
  handicapNotes: string;
  rulesetPreset: RulesetPreset;
  winnersRaceTo: number | null;
  losersRaceTo: number | null;
  /** @deprecated Prefer maxFargo only; kept for older events. */
  minFargo: number | null;
  maxFargo: number | null;
  /** null = any robustness; "preliminary" / "established" gate signup. */
  minRobustnessStatus: RobustnessStatus | null;
  unratedPolicy: UnratedPolicy;
  /** Max entries (singles players, doubles pairs, or teams). */
  maxPlayers: number;
  /** Players per entry, including the captain. Singles=1, scotch=2, teams configurable. */
  teamSize: number;
  entryFeeCents: number;
  payMethod: PayMethod;
  /** Where to send payment (optional handles). */
  venmoHandle: string | null;
  zelleHandle: string | null;
  cashAppHandle: string | null;
  payoutNotes: string;
  registrationMode: RegistrationMode;
  reportedToFargo: boolean;
  tableSize: "7ft" | "8ft" | "9ft" | "mixed";
  venueName: string;
  venueAddress: string;
  city: string;
  region: string;
  startsAt: string;
  checkInAt: string | null;
  organizerUserId: string;
  organizerName: string;
  organizerEmail: string | null;
  organizerPhone: string | null;
  /** Linked Digital Pool tournament after a successful push. */
  digitalPoolTournamentId: number | null;
  digitalPoolSlug: string | null;
  digitalPoolPushedAt: string | null;
  status: TournamentStatus;
  createdAt: string;
  updatedAt: string;
};

export type RegistrationTeammate = {
  displayName: string;
  ratingAtSignup: number | null;
};

export type TournamentRegistration = {
  id: string;
  tournamentId: string;
  userId: string | null;
  fargoPlayerId: string | null;
  displayName: string;
  email: string | null;
  phone: string | null;
  ratingAtSignup: number | null;
  robustnessAtSignup: number | null;
  robustnessStatusAtSignup: RobustnessStatus | null;
  isGuest: boolean;
  /** Required for team events; optional label for scotch doubles. */
  teamName: string | null;
  /** Additional players on the entry (partner / teammates). Captain is displayName. */
  teammates: RegistrationTeammate[];
  status: RegistrationStatus;
  paid: boolean;
  checkedIn: boolean;
  checkedInAt: string | null;
  noteToOrganizer: string;
  createdAt: string;
  updatedAt: string;
};

export type TournamentMessage = {
  id: string;
  tournamentId: string;
  registrationId: string | null;
  fromName: string;
  fromEmail: string | null;
  fromPhone: string | null;
  body: string;
  createdAt: string;
};

export type CreateTournamentInput = {
  title: string;
  description?: string;
  thumbnailUrl?: string | null;
  gameType: GameType;
  eventType: EventType;
  bracketFormat: BracketFormat;
  handicapSystem: HandicapSystem;
  handicapNotes?: string;
  rulesetPreset?: RulesetPreset;
  winnersRaceTo?: number | null;
  losersRaceTo?: number | null;
  minFargo?: number | null;
  maxFargo?: number | null;
  minRobustnessStatus?: RobustnessStatus | null;
  unratedPolicy?: UnratedPolicy;
  maxPlayers: number;
  teamSize?: number;
  entryFeeCents?: number;
  payMethod?: PayMethod;
  venmoHandle?: string | null;
  zelleHandle?: string | null;
  cashAppHandle?: string | null;
  payoutNotes?: string;
  registrationMode?: RegistrationMode;
  reportedToFargo?: boolean;
  tableSize?: Tournament["tableSize"];
  venueName: string;
  venueAddress?: string;
  city: string;
  region?: string;
  startsAt: string;
  checkInAt?: string | null;
  organizerPhone?: string | null;
  status?: Extract<TournamentStatus, "draft" | "open">;
};

export type TournamentListItem = Tournament & {
  approvedCount: number;
  pendingCount: number;
  spotsLeft: number;
};

/** Organizer-run player/team auction side pot (Calcutta). */
export type CalcuttaStatus = "setup" | "live" | "settled";

export type CalcuttaPayoutTier = {
  place: number;
  percent: number;
};

export type CalcuttaLot = {
  registrationId: string;
  buyerName: string;
  /** Winning hammer price in cents; null = unsold. */
  soldPriceCents: number | null;
  buyBackHalf: boolean;
  buyerPaid: boolean;
  playerPaidBuyBack: boolean;
  /** Finishing place for Calcutta payout (1 = first). */
  place: number | null;
  notes: string;
};

export type TournamentCalcutta = {
  tournamentId: string;
  enabled: boolean;
  status: CalcuttaStatus;
  minBidCents: number;
  houseCutPercent: number;
  allowBuyBackHalf: boolean;
  payoutTiers: CalcuttaPayoutTier[];
  lots: CalcuttaLot[];
  updatedAt: string;
};

export type CalcuttaSummary = {
  grossPotCents: number;
  houseCutCents: number;
  netPotCents: number;
  soldCount: number;
  lotCount: number;
  payouts: Array<{
    place: number;
    percent: number;
    amountCents: number;
    registrationId: string | null;
    buyerName: string | null;
    buyBackHalf: boolean;
  }>;
};
