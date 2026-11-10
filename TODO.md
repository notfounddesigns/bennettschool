# TODO

## New Features

- [ ] Click outside to close modals

- [ ] Create TODO items for system cutover (Homebase -> Internal Timeclock System)
  - [ ] Shooting for July 1 "system cutover"
  - [ ] All students will ONLY clock in/out & start/end break with internal timeclock system
  - [ ] Remove any/all API calls to Homebase and any functions/triggers that pull in hours from the Homebase API
  - [ ] Decide how to store / reference existing Homebase hours along with new / ongoing hours calculated by internal Timeclock system

---

## UI / UI

---

## Incomplete Features

- [ ] Need some protection logic around time punches
  - [ ] Need a lower limit and upper limit for time punches, i.e. if a user attempts to record a time punch before 7a or after 7p it is flagged for "Needs Attention". For now, the time punch is still allowed
  - [ ] Need a function to run nightly to check for students that did not clock out.
    - Should run nightly at 9p CST
    - If any students are found to still be clocked in, they are automatically clocked out with their clock out time being 5p (same day)
    - This should be flagged for a "Needs Attention" so a manager can correctly adjust the timesheet

---

## Bugs

- [ ] Non-unique "match" updates — updateGradeEntry matches on (homebase_id, date, project, category) and      updateTimeclockEntry on (homebase_id, clock_in). Neither is a unique key, so a single edit can silently update multiple rows. Grades are the real exposure (a student can have duplicate date/project/category rows).

- [ ] **Edit Timepunch DE field always opens empty** — The per-day DE lookup that should prefill it (`deHours` in `createMgmtStore`) is never populated, so `deTotal` is always 0. Any value typed is saved as a brand-new DE row for the full amount instead of an adjustment, so editing a punch on a day that already has DE hours double-counts them. (`src/components/mgmt.ts` — `deHours`, `submitEditTimepunch`)

- [ ] **Student dashboard counts soft-deleted DE hours** — `fetchStudentDashboard` reads `de_hours` without `.eq('is_active', true)`, so DE entries an admin removed still appear in the student's Hours table and This Month DE total. The admin views do filter on `is_active`. (`src/lib/api.ts` — `fetchStudentDashboard`)

- [ ] **Timeclock history silently capped at 1,000 rows** — `fetchCurrentStudents` selects all of `timeclock_status` with no date bound or paging, and PostgREST returns at most 1,000 rows. As history grows, older punches drop out of the student drawer's Timeclock tab, and eventually today's entries could too, which would break the status pills and Prev Day Hrs. Bound by date or page the query. (`src/lib/api.ts` — `fetchCurrentStudents`)

- [ ] **Saving any entry closes the student drawer** — Every add/edit dialog calls `mgmt.load()` on success, and `load()` resets `selectedStudent` to null, so the admin is kicked out of the student they were working in after each save. Refresh in place instead, as the DE/grade deletes already do. (`src/components/mgmt.ts` — `load`, `addEntryModalData`)

---

## Refactor / Code Quality

- [ ] Find areas in the codebase that can be refactored for code quality, maintainability, or performance related reasons
  - [ ] Can `index.html` be split into smaller components?
  - [ ] Can any of the `component` or `lib` `*.ts` files be split into smaller modules?
  - [ ] Analyze `api.ts`, do any of the API calls to the DB need to be refactore for performance or maintainability?

---

## DB Changes

- [ ] Replace usage of "homebase_id" with "student_id"
