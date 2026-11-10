# Client Side
- [ ] clockInOut	Stubbed — needs `homebase_id` (not `entry.latest`) so it works for "Not In" students. Requires clock-in/out server functions first.
- [ ] revokeAccess	Stubbed. Decision needed: clear PIN, set disabled flag, or both.
- [ ] deleteUser	Stubbed. Should receive `homebase_id`, not a timeclock entry.
- [ ] Break management	No UI to manually start or end a break for a student.
- [ ] Edit error feedback	`commitEdit` silently swallows errors — needs a snackbar on failure.

# Server Side
- [ ] Clock in	Insert a `time_logs` row (`event_type = 'clock_in'`) for a given `student_id` — client-side done; needs `get_student_by_pin` RPC so PIN lookup works first.
- [ ] Clock out	Insert a `time_logs` row (`event_type = 'clock_out'`) for the student — client-side done.
- [ ] Revoke access	Decision needed: set `student_details.is_active = false`, or set `pin_hash` to an invalid value, or both.
- [ ] Delete student	Set `student_details.is_active = false` (soft delete) or hard-delete `profiles` row (cascades to `student_details` via uuid FK).

# UI gaps
- [ ] Hours column header is ambiguous — today's worked hours for active/clocked-out students, all-time total for "Not In". Add a tooltip or sub-label.
- [ ] History rows are read-only — no inline edit. Wire `startEdit` to history rows once `session_id` is available on `TimeclockEntry`.

# Implementation Tasks

Schema: `profiles`, `student_details`, `student_pins`, `kiosk_devices`, `time_logs`, `legacy_hours` — see `supabase/schema/db_schema.md`.

## Database — Blocking (do these first)

- [ ] Create RPC `get_student_by_pin(p_raw_pin text) returns json`: join `profiles` + `student_details` where `crypt(p_raw_pin, pin_hash) = pin_hash` and `is_active = true`; return `{homebase_id: student_id::int, name}` or `null` — called by kiosk `getStudentByPin`
- [ ] Create RPC `fn_set_student_pin(p_student_id int, p_raw_pin text) returns void`: update `student_details.pin_hash = crypt(p_raw_pin, gen_salt('bf', 8))` where `student_id = p_student_id` — called by admin and kiosk `setStudentPin`
- [ ] Create admin `auth.users` account(s) in Supabase dashboard; insert matching `profiles` rows with `role = 'admin'`
- [ ] Configure Supabase Auth JWT to include `role` claim from `profiles.role` so RLS works

## Database — Missing Tables (restore stubbed features)

- [ ] `sync_log`: `id int8 identity`, `synced_at timestamptz default now()`, `date_synced date`, `inserted int`, `synced_by text` — restores `fetchLastSync` and sync timestamps in the dashboard
- [ ] `grades`: `id int8 identity`, `student_id numeric`, `date date`, `project text`, `category text`, `score numeric`, `notes text` — restores `submitGradeEntry` and grade history

## Edge Functions

- [ ] Update `auth-login`: call `get_student_by_pin` RPC instead of plaintext `profiles.pin` lookup
- [ ] `override-punch` edge function: rewrite for `time_logs` — `session_id` is now the UUID of the `clock_in` row; update `recorded_at` on that row for `clock_in` corrections, or find the subsequent `clock_out` row for `clock_out` corrections
- [ ] Update `sync-hours-by-date`: confirm it targets `legacy_hours` (not an old `hours` table)
- [ ] Kiosk device auth: add `device_token text not null unique` to `kiosk_devices`; validate `x-device-token` header on clock edge functions

## API Layer — Done

- [x] `validateCachedEmployee`: queries `profiles.student_id` ✓
- [x] `fetchEmployeeTable`: queries `profiles` + `student_details` + `legacy_hours` directly ✓
- [x] `fetchStudentDashboard`: queries `profiles` + `student_details` + `legacy_hours` directly ✓
- [x] `fetchCurrentStudents`: derives session state from `time_logs` events ✓
- [x] `fetchTimeclockHistory`: queries `time_logs`, builds sessions client-side ✓
- [x] `fetchOverviewStats`: queries `legacy_hours` ✓
- [x] `subscribeToTimeclock`: listens on `time_logs` ✓
- [x] `submitHours`: inserts into `legacy_hours` (`student_id`, `date`, `hours`) ✓
- [x] `setStudentPin`: calls `fn_set_student_pin` RPC ✓
- [x] `overridePunch`: `session_id` type updated to `string` (UUID) ✓
- [x] `fetchLastSync`: returns `null` until `sync_log` is created ✓
- [x] `submitGradeEntry`: throws until `grades` is created ✓
- [x] `syncHoursByDate`: calls edge function; `sync_log` insert removed ✓
- [x] `getStudentByPin` (kiosk): calls `get_student_by_pin` RPC ✓
- [x] `getActiveSession`: derives state from today's `time_logs` events ✓
- [x] `clockIn/clockOut/startBreak/endBreak`: insert events into `time_logs`; all take `homebaseId: number` ✓

## Timeclock Component — Done

- [x] `doClockOut`: `clockOut(student.homebase_id)` ✓
- [x] `doStartBreak`: `startBreak(student.homebase_id)` ✓
- [x] `doEndBreak`: `endBreak(student.homebase_id)` ✓

## Frontend

- [ ] Student login flow: confirm `auth-login` returns `homebase_id` and `name` compatible with current session storage
- [ ] Admin kiosk device management UI: list, register, deactivate devices from `kiosk_devices`
- [ ] PIN lockout: surface `locked_until` from `get_student_by_pin` RPC response to kiosk UI
- [ ] History rows: `session_id` is now a UUID string — verify `startEdit` / `overridePunch` handle string IDs

---

# Supabase DB Schema Redesign

- Update to match what is in ./supabase/schema/db_schema.md