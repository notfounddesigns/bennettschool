# Bennett Cosmetology School — Student Portal

A web app that serves as the student and staff portal for Bennett Cosmetology School (BSC). It authenticates employees and surfaces hour-tracking, timeclock, and grade data stored in [Supabase](https://supabase.com/).

## Overview

| Screen | Who sees it | What it does |
|---|---|---|
| Login | Everyone | Sign in with full name + password |
| Set Password | First-time users | Required password setup on first login |
| Student Dashboard | Students | Hours stats, graduation progress, recent DE/in-person/timeclock logs, grades |
| Management Dashboard | Managers | Full employee table with hours summary, DE entry, grade entry, timeclock management, HomeBase sync |
| Timeclock Kiosk | Students (iPad) | PIN-based clock in/out and break tracking with photo capture |

## Tech Stack

- **TypeScript** — all source code is in `src/` and compiled via Vite
- **Alpine.js** (`alpinejs@3`) — reactive UI framework; stores and component data registered in `src/main.ts`
- **Tailwind CSS 4** — utility-first styling via the `@tailwindcss/vite` plugin
- **Vite** — dev server and bundler (`npm run dev` / `npm run build`)
- **Supabase JS SDK** (`@supabase/supabase-js@2`) — database queries and auth
- **Supabase Edge Functions** — custom backend logic (auth, HomeBase proxy, sync)

## Project Structure

```
index.html          — Main app HTML (student portal + management dashboard)
timeclock.html      — Timeclock kiosk HTML
public/             — Static assets (favicon, icons, logo)
src/
  main.ts           — Main entry point: registers Alpine stores and component data
  timeclock.ts      — Timeclock entry point
  style.css         — Tailwind CSS base styles
  lib/
    api.ts          — All Supabase queries and edge function calls
    auth.ts         — Session restore and logout logic
    helpers.ts      — Utility functions (fmtFloat, escHtml, formatSimpleDate, …)
    store.ts        — Alpine app store (screen, snackbar, current employee)
    supabase.ts     — Supabase client, URL/key constants, AUTH_HEADERS
  components/
    login.ts        — Login screen Alpine data
    setpass.ts      — Set password screen Alpine data
    dashboard.ts    — Student dashboard Alpine store + display data
    mgmt.ts         — Management dashboard Alpine store + all modal data
    compare.ts      — Compare table Alpine data
    timeclock.ts    — Timeclock kiosk Alpine data
  scripts/
    full-sync.ts    — Standalone HomeBase full-sync script
    hours-export.ts — Standalone hours export script
  sql/              — Database migration SQL files
```

## Backend (Supabase)

### Database Tables

| Table | Description |
|---|---|
| `profiles` | Student profile: name, `homebase_id`, `total_hrs`, `hrs_to_graduate`, `percent_complete` |
| `profiles_view` | View joining profiles with nested hours for dashboard queries |
| `hours` | Hour entries: `homebase_id`, `type_id` (1=in-person, 2=DE), `hours`, `date`, `module`, `platform`, `verified` |
| `grades` | Grade entries: `homebase_id`, `date`, `project`, `category`, `score`, `notes` |
| `timeclock_status` | Internal timeclock entries: `homebase_id`, `date`, `clock_in`, `clock_out`, `worked_hours` |
| `needs_attention` | Flagged timeclock events requiring manager review |
| `audit_log` | Audit trail of user actions |
| `punch_photos` | Photos captured at time punch events |

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

Fetches from Supabase directly (see `fetchStudentDashboard` in `src/lib/api.ts`):
- `profiles_view` — totals and graduation progress
- `hours` — last 7 days of entries, split by `type_id` (1 = in-person, 2 = DE)
- `grades` — all grades, sorted by date descending
- `timeclock_status` — last 7 days of completed timeclock punches

Displays:
- Stat cards: in-person hours, DE hours, total hours, hours remaining
- Graduation progress bar (color-coded: red < 65%, orange 65–79%, green ≥ 80%)
- Combined hours log (in-person, DE, timeclock entries)
- Grades table (date, project, category, score/letter grade, notes)

### Management Dashboard

Fetches all profiles + hours from Supabase.

Actions available:
- **Add Entry** — modal to log timeclock hours, DE hours, or grade entries for a student
- **Sync Hours** — picks a date, calls `sync-hours-by-date` to pull HomeBase timecards
- **Export** — download student hours report
- **Needs Attention** — view and resolve flagged timeclock events
- **Audit Log** — view history of all user actions
- **Punch Photos** — view photos associated with a student's time punches

### Timeclock Kiosk (`timeclock.html`)

Served at `timeclock.bscdecatur.com` (via Vercel redirect in `vercel.json`). Students enter their PIN to clock in/out or start/end a break. A photo is captured from the front-facing camera on each punch.

## Running Locally

Install dependencies and start the Vite dev server:

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```

Supabase credentials are embedded in `src/lib/supabase.ts`. No additional environment variables are required.
