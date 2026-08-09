/** Tableside-owned leagues (create-your-own), separate from FargoRate LMS. */

export type LeagueSystem = "bca" | "apa" | "tap" | "custom";

export type TablesideLeague = {
  id: string;
  name: string;
  system: LeagueSystem;
  region: string;
  city: string;
  description: string;
  ownerUserId: string;
  ownerName: string | null;
  ownerEmail: string | null;
  createdAt: string;
  updatedAt: string;
  status: "active" | "archived";
};

export type CreateTablesideLeagueInput = {
  name: string;
  system: LeagueSystem;
  region?: string;
  city?: string;
  description?: string;
};

export const LEAGUE_SYSTEM_OPTIONS: {
  id: LeagueSystem;
  label: string;
  hint: string;
}[] = [
  {
    id: "bca",
    label: "BCA / Fargo-style",
    hint: "Race charts and Fargo ratings when you connect later",
  },
  {
    id: "apa",
    label: "APA-style",
    hint: "Skill levels and APA-style team formats (coming)",
  },
  {
    id: "tap",
    label: "TAP-style",
    hint: "TAP scoring conventions (coming)",
  },
  {
    id: "custom",
    label: "Custom",
    hint: "Your own rules — wire formats as you grow",
  },
];
