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
export type RegistrationMode = "open" | "approval" | "invite-only";
export type PayMethod = "door" | "venmo" | "in-app-later";
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
  minFargo: number | null;
  maxFargo: number | null;
  unratedPolicy: UnratedPolicy;
  /** Max entries (singles players, doubles pairs, or teams). */
  maxPlayers: number;
  /** Players per entry, including the captain. Singles=1, scotch=2, teams configurable. */
  teamSize: number;
  entryFeeCents: number;
  payMethod: PayMethod;
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
  unratedPolicy?: UnratedPolicy;
  maxPlayers: number;
  teamSize?: number;
  entryFeeCents?: number;
  payMethod?: PayMethod;
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
