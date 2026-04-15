# Bennett Cosmetology School — Student Portal

A web app that serves as the student and staff portal for Bennett Cosmetology School (BSC). It authenticates employees via [HomeBase](https://joinhomebase.com/) and surfaces hour-tracking and grade data stored in [Supabase](https://supabase.com/).

## Overview

| Screen | Who sees it | What it does |
|---|---|---|
| Login | Everyone | Sign in with full name + password |
| Set Password | First-time users | Required password setup on first login |
| Student Dashboard | Students | Hours stats, graduation progress, recent DE/in-person logs, grades |
| Management Dashboard | Managers | Full employee table with hours summary, DE entry, grade entry, HomeBase sync |

## Tech Stack

- **Vanilla HTML / CSS / JavaScript** — no build step, no framework, no bundler
- **Supabase JS SDK** (`@supabase/supabase-js@2`, loaded from CDN)
- **Supabase Edge Functions** — custom backend logic (auth, HomeBase proxy, sync)
- **Fonts** — DM Sans + DM Serif Display via Google Fonts

## Project Structure

```
index.html   — All HTML: screens, modals, topbar
styles.css   — All CSS: design tokens, layout, components
app.js       — All JS: auth, data fetching, rendering, helpers
favicon.ico
```

## Backend (Supabase)

### Database Tables

| Table | Description |
|---|---|
| `profiles` | Student profile: name, `homebase_id`, `total_hrs`, `hrs_to_graduate`, `percent_complete` |
| `hours` | Hour entries: `homebase_id`, `type_id` (1=in-person, 2=DE), `hours`, `date`, `module`, `platform`, `verified` |
| `de_log` | DE hours submitted via the management modal |

### Edge Functions

| Function | Method | Description |
|---|---|---|
| `auth-login` | POST | Validates name + password, returns employee object |
| `set-password` | POST | Sets password on first login |
| `homebase` | GET | Proxy to HomeBase API (e.g. `?resource=employees`) |
| `sync-hours-by-date` | POST | Pulls timecards from HomeBase for a given date and inserts into `hours` |

### Auth Flow

1. User enters full name + password → `POST /auth-login`
2. If `result === 'first_time'` → redirect to Set Password screen
3. On successful login, employee object stored in `localStorage` and used to render the appropriate dashboard

## Screens & Logic

### Student Dashboard

Fetches from Supabase directly:
- `profiles` — totals and graduation progress
- `hours` — last 7 days of entries, split by `type_id` (1 = in-person, 2 = DE)

Displays:
- Stat cards: in-person hours, DE hours, total hours, hours remaining
- Graduation progress bar (color-coded: red < 65%, orange 65–79%, green ≥ 80%)
- Recent in-person log and DE log (sorted by date)
- Grades table (date, project, category, score/letter grade, notes)

### Management Dashboard

Fetches all `profiles` + nested `hours` from Supabase.

Actions available:
- **Enter DE Hours** — modal to log DE hours for a student (`de_log` table)
- **Enter Grades** — modal (TODO: `submitGrades` not yet implemented)
- **Sync Hours** — picks a date, calls `sync-hours-by-date` to pull HomeBase timecards

## Running Locally

Open `index.html` directly in a browser or use any static file server:

```bash
npx serve .
# or
python -m http.server 8080
```

No environment variables or build steps required — Supabase credentials are embedded in `app.js`.
