# Tableside

Web app for browsing public FargoRate LMS league data — standings, players, ratings, schedules, and handicaps. Works on phone and desktop.

Defaults to **Palm Beach County BCA Pool League**.

## Features

- Top-level BCA / FargoRate login + Settings for default league, division, and team
- When signed in, memberships are discovered from your LMS roster (preferred league first; saved team is verified in one call) and League · Division · My team selectors filter to those teams (reports still show the full division)
- Typeahead selectors for league, division, and my team
- Team standings with clickable rows → player stats + roster panel
- Search filters on Teams, Players, and Ratings
- Schedule filtered by selected team
- Handicap calculator based on your team and this week’s opponent
- Score tab lists matches for your selected team only (login required)
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

Local cache in `localStorage` (always):

- `tableside.preferences.v1` — league, division, my team
- `tableside.membership.v1` — last discovered roster memberships (instant filter on return visits)
- `tableside.lineups.v1` — local fallback for saved scoring/handicap lineups
- `tableside.scoring.draft.v1.*` — local scoresheet drafts (also synced when Redis is configured)

When signed in and Upstash Redis is configured, preferences and team lineups also sync server-side (see below).

### Membership discovery (after login)

Uses the same LMS player-schedule endpoint as the official BCAPL scoring app:

`GET /api/divisions/{anyId}/ScheduledMatchesForPlayerBCAPL?playerId=…`

LMS ignores the division id and returns scheduled matches for **all active sessions** that player is on (typically one fast call). Tableside then roster-checks only the candidate teams from those matches to resolve league / division / team filters.

Also:

1. Reuses the last membership snapshot from `localStorage` / Redis when present
2. Verifies your saved team with one roster call when prefs already include team + division
3. Falls back to a preferred-league public roster scan only if the player-schedule call returns nothing

Settings → **Refresh my teams** re-runs that same global player-schedule discovery (there is no separate league-only scan).

## Upstash Redis (Vercel)

One free [Upstash Redis](https://upstash.com/) database powers both Score draft sync and LMS response caching. Without these env vars, the app still works (local drafts + direct LMS fetches).

In the [Upstash console](https://console.upstash.com/), create a Redis database (free tier), then copy the REST URL and token into Vercel project env (or `.env.local`):

```bash
UPSTASH_REDIS_REST_URL=https://xxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxxxxxxx
```

Vercel KV REST names are also accepted (`KV_REST_API_URL` / `KV_REST_API_TOKEN`).

### League operator stuck-match submit (optional)

Player `POST /api/verticalmatch` can ghost-lock a match (`already scored` / HTTP 201 while `hasBeenPlayed` stays false). When these env vars are set, Score can fall back to LMS League Operator score entry (`/api/scoringinternal/recordscoresvertical`):

```bash
LMS_OPERATOR_EMAIL=operator@example.com
LMS_OPERATOR_PASSWORD=********
```

Use the **LMS web** operator login (not the BCAPL player Auth0 password). On a stuck submit, Tableside auto-tries this path and also shows **Submit via league operator**.

The same credentials power the **LMS** nav tab. That tab is visible only to **League Operators** (sign in with the League Operator option using LMS web credentials) and **Bright**. It has its own league/division pickers (independent from play context) for operator work: upcoming/missed matches, teams, players, locations, schedule, full division settings (scoring / report / handicap / scoresheet layout / advanced template), Create Playoff, and Create Division.

Optional allowlists (server-only):

```bash
LMS_TAB_ALLOWLIST_EMAILS=other@example.com
LMS_TAB_ALLOWLIST_LMS_IDS=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### Tournament entry fees (Stripe)

Optional. When set, organizers can choose **Pay online (Stripe)** on an event and players are sent to Stripe Checkout for the entry fee after signup (or via **Pay entry fee** on their entry).

```bash
STRIPE_SECRET_KEY=sk_live_…
STRIPE_WEBHOOK_SECRET=whsec_…
APP_URL=https://your-app.example.com
```

Point a Stripe webhook at `POST /api/stripe/webhook` for `checkout.session.completed` (and optionally `checkout.session.async_payment_succeeded`). `APP_URL` (or `NEXT_PUBLIC_APP_URL`) is used for Checkout success/cancel redirects.

### Score drafts
Keyed by match id, TTL 60 days, last-write-wins with ~3s polling while a scoresheet is open.

### Login / settings preferences
Keyed by LMS player id (`tableside:prefs:v1:{lmsId}`), TTL 180 days. On sign-in the app loads shared prefs from Redis (league / division / team defaults) and merges them over localStorage; changes in Settings or the context selectors push back up.

### Team lineup templates
Saved scoring / handicap lineup presets are stored per team (`tableside:scoring:lineups:v1:{teamId}`), TTL 1 year, so captains and teammates share the same presets. localStorage remains a fallback when Redis is unavailable.

### Membership cache
Discovered roster memberships are cached in Redis (`membership-v6:{lmsId}`) to speed up post-login filter setup.

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
