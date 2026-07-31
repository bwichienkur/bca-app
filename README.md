# Tableside

Mobile-friendly web app for browsing public FargoRate LMS league data — standings, players, ratings, and schedules.

Defaults to **Palm Beach County BCA Pool League**, with the ability to pick any public league/division and save your division as a default.

## Features

- Search all public LMS leagues
- Select a division (optionally set as default)
- Team standings
- Player standings
- Player standings by team
- Player ratings list
- Division schedule (match links open on FargoRate LMS)
- **Handicap calculator** (FargoRate leaguecalc logic): pick who you are, auto-load this week’s matchup, choose lineups (default 5/side), see per-round handicaps

## Data source

Public endpoints on [FargoRate LMS](https://lms.fargorate.com/publicreport/alldivisions):

| Data | LMS endpoint |
| --- | --- |
| Leagues & divisions | `GET /PublicReport/GetDivisions` |
| Team standings | `GET /PublicReport/GenerateTeamStandingsReport/{divisionId}` |
| Player standings | `GET /PublicReport/GeneratePlayerStandingsReport/{divisionId}` |
| Players by team | `GET /PublicReport/GeneratePlayerStandingsByTeamReport/{divisionId}` |
| Player list / ratings | `GET /PublicReport/GeneratePlayerListReport/{divisionId}` |
| Schedule | `POST /PublicReport/GenerateDivisionScheduleReport` (`divisionId`) |

This app proxies those endpoints through Next.js API routes and parses HTML reports into structured JSON for the UI.

## Develop

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Build

```bash
npm run build
npm start
```

## Preferences

Defaults are stored in `localStorage` under `tableside.preferences.v1`:

- Default league (pre-seeded to Palm Beach County BCA Pool League)
- Default division (set by the user)
