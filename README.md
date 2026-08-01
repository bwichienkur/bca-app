# Tableside

Web app for browsing public FargoRate LMS league data — standings, players, ratings, schedules, and handicaps. Works on phone and desktop.

Defaults to **Palm Beach County BCA Pool League**.

## Features

- Typeahead selectors for league, division, and my team
- Team standings with clickable rows → player stats + roster panel
- Search filters on Teams, Players, and Ratings
- Schedule filtered by selected team
- Handicap calculator based on your team and this week’s opponent
- 5-player lineups (division format), drag-to-reorder, saved lineup presets

## Data source

Public endpoints on [FargoRate LMS](https://lms.fargorate.com/publicreport/alldivisions):

| Data | LMS endpoint |
| --- | --- |
| Leagues & divisions | `GET /PublicReport/GetDivisions` |
| Team standings | `GET /PublicReport/GenerateTeamStandingsReport/{divisionId}` |
| Player standings | `GET /PublicReport/GeneratePlayerStandingsReport/{divisionId}` |
| Players by team | `GET /PublicReport/GeneratePlayerStandingsByTeamReport/{divisionId}` |
| Player list / ratings | `GET /PublicReport/GeneratePlayerListReport/{divisionId}` |
| Schedule | `POST /PublicReport/GenerateDivisionScheduleReport` |
| Division format | `GET /api/divisions/{id}/format` |
| Teams / rosters | `GET /api/matches/{id}`, `GET /api/teams/{id}/players` |

## Develop

```bash
npm install
npm run dev
```

## Preferences

Stored in `localStorage`:

- `tableside.preferences.v1` — league, division, my team
- `tableside.lineups.v1` — saved handicap lineups
- `tableside.scoring.draft.v1.*` — local scoresheet drafts (also synced when Redis is configured)

## Multi-device Score drafts (Upstash Redis)

Score drafts can sync across phones/tablets via a free [Upstash Redis](https://upstash.com/) database (also works with Vercel KV REST credentials). Without these env vars, Score still works with browser `localStorage` only.

In the [Upstash console](https://console.upstash.com/), create a Redis database (free tier), then copy the REST URL and token into Vercel project env (or `.env.local`):

```bash
UPSTASH_REDIS_REST_URL=https://xxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxxxxxxx
```

Vercel KV REST names are also accepted:

```bash
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
```

Drafts are keyed by match id, TTL 60 days, last-write-wins with ~3s polling while a scoresheet is open. LMS submit still happens once from any device.
