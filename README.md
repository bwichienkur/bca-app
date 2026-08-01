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

## Upstash Redis (Vercel)

One free [Upstash Redis](https://upstash.com/) database powers both Score draft sync and LMS response caching. Without these env vars, the app still works (local drafts + direct LMS fetches).

In the [Upstash console](https://console.upstash.com/), create a Redis database (free tier), then copy the REST URL and token into Vercel project env (or `.env.local`):

```bash
UPSTASH_REDIS_REST_URL=https://xxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxxxxxxx
```

Vercel KV REST names are also accepted (`KV_REST_API_URL` / `KV_REST_API_TOKEN`).

### Score drafts
Keyed by match id, TTL 60 days, last-write-wins with ~3s polling while a scoresheet is open.

### LMS public data cache
Parsed league/division/team/player/schedule responses are cached in Redis so Vercel serverless instances skip slow LMS round-trips. Approximate TTLs:

| Data | TTL |
| --- | --- |
| League/division directory, format | 24 hours |
| Schedule, ratings list, matches | 24 hours |
| Standings, players-by-team, calculator context | 24 hours |
| Team / roster | 8 hours |

Cache keys use prefix `tableside:lms:v1:`. Failures are not cached.

Use **Refresh data** in the app header (or `POST /api/cache/lms/refresh`) to clear the LMS cache and reload from FargoRate.
