# AGENTS.md — AI Agent Guide for bennettschool

## Project Summary

TypeScript + Alpine.js student portal for Bennett Cosmetology School. Built with Vite and Tailwind CSS 4. Backend is Supabase (database + edge functions). There is also an internal timeclock kiosk (`timeclock.html`) served at a separate subdomain.

## File Map

| Path | Role |
|---|---|
| `index.html` | Main app HTML — screens, modals, topbar. Use search to find elements by `id` or `x-data`. |
| `timeclock.html` | Timeclock kiosk HTML. |
| `src/main.ts` | Entry point: registers Alpine stores and all `Alpine.data(...)` component functions. |
| `src/timeclock.ts` | Timeclock entry point. |
| `src/style.css` | Tailwind CSS imports and any custom base styles. |
| `src/lib/api.ts` | All Supabase queries and edge function calls. Add new API functions here. |
| `src/lib/auth.ts` | Session restore (`restoreSession`) and logout (`handleLogout`). |
| `src/lib/helpers.ts` | Pure utility functions: `fmtFloat`, `escHtml`, `formatSimpleDate`, `scoreToLetter`, etc. |
| `src/lib/store.ts` | Alpine `app` store — holds `currentEmployee`, active `screen`, snackbar state. |
| `src/lib/supabase.ts` | Supabase client, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `PROXY`, `AUTH_HEADERS`. |
| `src/components/login.ts` | Login screen Alpine data function. |
| `src/components/setpass.ts` | Set-password screen Alpine data function. |
| `src/components/dashboard.ts` | Student dashboard Alpine store + display data. |
| `src/components/mgmt.ts` | Management dashboard Alpine store + all modal data functions. |
| `src/components/compare.ts` | Compare table Alpine data. |
| `src/components/timeclock.ts` | Timeclock kiosk Alpine data. |
| `src/scripts/` | Standalone one-off scripts (full-sync, hours-export). Not part of the app bundle. |
| `src/sql/` | Database migration SQL files. |
| `public/` | Static assets (favicon, icons, logo). |
| `vite.config.ts` | Vite config — two entry points (`index.html`, `timeclock.html`), Tailwind plugin. |
| `vercel.json` | Routing rules — redirects `timeclock.bscdecatur.com/` to `/timeclock.html`. |

## Architecture Rules

- **Build step required.** Run `npm run dev` for local dev, `npm run build` to produce the `dist/` bundle.
- **TypeScript everywhere.** All source files in `src/` are `.ts`. Do not add `.js` files.
- **Alpine.js for reactivity.** Use Alpine stores (`Alpine.store`) and component data (`Alpine.data`). Do not reach for the DOM directly when Alpine can handle it.
- **Tailwind CSS for styling.** Use Tailwind utility classes. CSS custom properties are no longer the primary token system.
- **Modular source.** Logic belongs in `src/lib/` or `src/components/`. Do not add inline `<script>` blocks to HTML files.
- **Single Supabase client.** Import `supabase` from `src/lib/supabase.ts`. Never call `createClient` elsewhere.

## Key Conventions

### Screen System

The active screen is driven by the `screen` property on the Alpine `app` store. Switch screens by calling `$store.app.showScreen('login' | 'setpass' | 'dashboard' | 'mgmt')` in Alpine expressions, or `(Alpine.store('app') as AppStore).showScreen(...)` from TypeScript. Never toggle visibility directly.

Existing screens: `login`, `setpass`, `dashboard`, `mgmt`

### Snackbar / Toast

Call `Alpine.store('app').showSnackbar(message, type, duration)` from TypeScript, or `$store.app.showSnackbar(...)` from an Alpine expression. `type` is `'default'`, `'success'`, or `'error'`.

### HTML Escaping

Always use `escHtml(str)` (from `src/lib/helpers.ts`) before inserting user-supplied or API-returned strings into `innerHTML`.

### Number Formatting

Use `fmtFloat(val, precision=2)` (from `src/lib/helpers.ts`) for all hour values. Do not call `.toFixed()` directly.

## Data Flow

```
Login → auth-login edge fn → Student object → localStorage + app store
  ↓
restoreSession() or login success
  ├─ isManager (role_id === 3)? → showScreen('mgmt')      → MgmtStore.load()
  └─ student?                   → showScreen('dashboard') → DashboardStore.load(homebase_id)
```

## Supabase Edge Function Calls

All edge function calls go through the `PROXY` constant (`${SUPABASE_URL}/functions/v1`) defined in `src/lib/supabase.ts`. Always include `AUTH_HEADERS` (an `Authorization` header using the Supabase anon key plus `Content-Type: application/json`). It is exported from `src/lib/supabase.ts`. The `homebaseFetch(path)` helper in `src/lib/api.ts` wraps the HomeBase proxy endpoint.

## What to Avoid

- Do not modify the Supabase URL or anon key constants without confirming with the user — they point to the live project.
- Do not add `console.log` debugging statements to committed code.
- Do not introduce new npm dependencies without checking for security advisories first.
