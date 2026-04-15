# AGENTS.md — AI Agent Guide for bennettschool

## Project Summary

Vanilla HTML/CSS/JS student portal for Bennett Cosmetology School. No build system. Three files do everything: `index.html`, `styles.css`, `app.js`. Backend is Supabase (database + edge functions) with HomeBase as the upstream HR/scheduling source.

## File Map

| File | Role |
|---|---|
| `index.html` | All markup — screens, modals, topbar. Very large; use search to find elements by `id`. |
| `styles.css` | All styles — CSS custom properties at `:root`, then components. |
| `app.js` | All logic — divided into clearly labeled sections with `// ── SECTION ──` banners. |

## Architecture Rules

- **No build step.** Do not introduce npm, bundlers, TypeScript, or compiled assets. Any dependency must be loaded from a CDN `<script>` tag in `index.html`.
- **Single-file per concern.** Keep all HTML in `index.html`, all styles in `styles.css`, all JS in `app.js`. Do not split into modules.
- **No frameworks.** The project uses vanilla DOM APIs. Do not add React, Vue, Alpine, etc.
- **Supabase SDK on CDN.** The Supabase client is `supabase.createClient(...)` initialized in `DOMContentLoaded`. Use `_supabaseClient` (the module-level variable) for all queries.

## Key Conventions

### CSS Custom Properties

Design tokens live in `:root` in `styles.css`. Always use them — never hardcode colors or spacing:

```
--background, --cream, --charcoal, --blush, --blush-light
--sage, --sage-light, --error, --error-light, --muted, --border
--shadow, --shadow-lg, --radius, --radius-sm
```

### Screen System

Screens are `.screen` divs with a unique `id="screen-{name}"`. Only the `.active` screen is visible. Switch screens with `showScreen(id)` — never toggle visibility directly.

Existing screens: `login`, `setpass`, `dashboard`, `mgmt`

### Alerts and Loading States

- `setAlert(elementId, message, type)` — shows/hides an alert element. `type` is `'error'` or `'success'`.
- `setLoading(btnId, boolean)` — disables button and shows spinner.
- `showSnackbar(message, type, duration)` — bottom toast. `type`: `'default'`, `'success'`, `'error'`.

### HTML Escaping

Always use `escHtml(str)` before inserting user-supplied or API-returned strings into `innerHTML`.

### Number Formatting

Use `fmtFloat(val, precision=2)` for all hour values. Do not use `.toFixed()` directly.

## Data Flow

```
Login → auth-login edge fn → employee object → localStorage
  ↓
renderDashboard(emp)
  ├─ isManager? → loadEmployeeTable() → Supabase profiles+hours → renderEmployeeTable()
  └─ student?   → fetchStudentDashboard(userId) → Supabase profiles+hours → renderHrsLogEntries()
```

## Supabase Edge Function Calls

All calls go through the `PROXY` constant (`${SUPABASE_URL}/functions/v1`). Always include `AUTH_HEADERS` (Bearer token + Content-Type). The `homebaseFetch(path)` helper wraps the HomeBase proxy.

## Known Gaps / TODOs

- `submitGrades()` in `app.js` is stubbed — always shows an error. It needs a real Supabase insert.
- The grades section in `fetchStudentDashboard` always passes an empty array to `renderHrsLogEntries` — grades data fetch is not yet wired up.

## What to Avoid

- Do not add a `package.json`, `.env` file, or any server-side code.
- Do not modify the Supabase URL or anon key constants without confirming with the user — they point to the live project.
- Do not inline large data structures or HTML strings in `app.js`; use template literals the same way existing render functions do.
- Do not add `console.log` debugging statements to committed code.
