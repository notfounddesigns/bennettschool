# TODO

## Bugs

- [x] **`closeDEModal` is not defined** — `submitDEHours()` calls `closeDEModal()` on success, but that function does not exist. The real function is `closeModal('de')`. This throws a `ReferenceError` every time DE hours are successfully saved. (`app.js:421`)

- [x] **Dead DOM write on `stat-hours-to-grad`** — Line 198 sets `.innerHTML` to `s.hrsToGrad`, which is immediately overwritten on line 199 by `.textContent`. The `.innerHTML` assignment never renders. (`app.js:198–199`)

- [x] **Login doesn't guard against a single-word name** — `name.split(' ')` only validates that the field is non-empty, not that a last name was entered. A user typing just "Jared" sends `last_name: undefined` to the server instead of getting a clear client-side error message. (`app.js:27–30`)

- [x] **`syncHours()` sends an empty date string with no validation** — If the manager clicks Sync without selecting a date, an empty string is posted to `sync-hours-by-date`. Should validate the field before the fetch. (`app.js:479`)

- [x] **`syncHours()` error message always shows `undefined`** — The error path at line 491 does `res.result.error`, but `res` is the raw `Response` object. The parsed JSON body is `resp`. Should be `resp.error` (or removed, since `resp.result !== 'ok'` already handles the failure). (`app.js:491`)

- [x] **`syncHours()` has no try/catch** — A network error causes an uncaught exception, and `setLoading('sync-btn', false)` is never called, permanently disabling the button. (`app.js:478–496`)

- [x] **`openDEModal` does not await `loadStudents`** — The DE modal calls `loadStudents('de')` without `await`, while `openGradesModal` correctly awaits the same call. The student dropdown may render before data arrives. (`app.js:368` vs `383`)

- [x] **Employee name and ID are not HTML-escaped in the management table** — `emp.name` and `emp.homebase_id` are inserted directly into `innerHTML` without `escHtml()`. (`app.js:336–337`)

- [x] **Student name is not HTML-escaped in the `loadStudents` dropdown** — The `<option>` label is built from `s.first_name + s.last_name` without `escHtml()`. (`app.js:471`)

- [x] **Topbar never displays the logged-in user's name** — `renderDashboard` sets the avatar initials but the `topbar-user` element in the HTML is otherwise empty. The user's name is available in `_currentEmployee` but never rendered there. (`index.html:23`, `app.js:173–174`)

- [x] **Remove `hombase_id` from the management table display. This is internal data and should not be shown in the UI

- [x] **There is something making the screen have a horizontal scroll. Remove this.
---

## Incomplete Features

- [x] **`submitGrades()` is not implemented** — Currently hardcoded to show an error. Needs a Supabase insert into a grades table and should refresh the student grades view on success. (`app.js:429–432`)

- [x] **Grades are never fetched for the student dashboard** — `fetchStudentDashboard` doesn't query for grades, so `renderHrsLogEntries` always receives an empty grades array. (`app.js:210`)

- [x] **Progress bar fill color doesn't update with graduation percentage** — The inline style on `#progress-grad` sets `background: var(--blush)` at render time. JS updates the text color but not the bar's fill color to match (green/orange/red). (`app.js:201–208`, `index.html:111`)

- [x] **Management table doesn't refresh after DE hours are saved** — After a successful DE submit the modal closes but the employee hour totals in the table stay stale. Should call `loadEmployeeTable()` after a successful save.

---

## Refactor / Code Quality

- [x] **Consolidate `setAlert` and `showAlert` into one function** — Both functions show/hide alert elements and are functionally equivalent. Auth code uses `setAlert`; modals use `showAlert`. Pick one signature and remove the other. (`app.js:498–533`)

- [x] **`_subscription` variable is declared but never used** — Remove the dead variable or wire up a Supabase realtime subscription if live data updates are wanted. (`app.js:10`)

- [x] **`fmtFloat` applied twice to already-formatted strings** — `fetchStudentDashboard` returns `hrsToGrad` and `totalHrsAll` as strings already rounded by `fmtFloat`, then `renderDashboard` calls `fmtFloat(s.hrsToGrad - s.totalHrsAll)` on those strings. JS coerces them back to numbers, but the intent is unclear. Store raw numbers from the API and format only at render time. (`app.js:163–165`, `199`)

- [x] **`.screen.dashboard` uses `width: 100vw !important` with heavy padding** — The `!important` override makes responsive adjustments brittle. Use a `max-width` or a grid approach instead. (`styles.css:116`)

- [ ] **Find JS table npm package to use. Refactor the Admin dashboard students table.

- [x] Instead of displaying the "Last sync time", store what date was chosen from the dialog and display that date in the UI as "Last Sync Date" or "Hours up to date as of {Date}"

---

## New Features

- [x] **Mobile layout for the student dashboard** — The dashboard screen has `padding: 0 10rem` which clips on phones and tablets. There's already a breakpoint at 1023px for the management screen but nothing for the student view. Add responsive padding/stacking for small screens.

- [x] **Loading skeleton or spinner on the management table** — `loadEmployeeTable()` fetches async but there is no visible loading state while the query runs — the table just appears empty. Show a spinner or skeleton rows.

- [x] **Session validation on page load** — When restoring from `localStorage`, the cached employee object is used as-is with no server check. A revoked employee, or a user whose password changed, can still access the dashboard until they manually log out. Validate the session against the backend before rendering.

- [x] On the Admin dashboard, add a UI feature that shows when the last "Sync" was ran
  - Will need a new Supabase DB table to track sync runs
  - On Sync, insert a record into the new table
  - UI will display the latest run

- [x] Instead of the Hours Modal for insert Hours, add individual row (student) buttons for:
  - Add / Edit Button next to each "In Person HRS" and "DE HRS" row on the table, not the end of the row

- [ ] Button to add a new student

- [ ] Button to remove a student, not fully removed from DB but updated in the table to 'Removed'

- [x] Export feature. Exports the students table data into a spreadsheet with row header

- [x] Add feature for Admin to be able to reset a students password back to the 'Welcome123' password

[X] Automatic daily updates from Homebase in the afternoon after closing.
* Need to test over the next couple of days to make sure it works correctly

[X] Clicking into an individual student to update timecards.

[ ] Clicking into an individual student to update grades.

[X] A way to add new students.

[ ] New student view modal
  - Show an overview of the student's hours stats, a log of in-person hours, a log of DE hours.
  - Ability to switch between yesterday's hours, the past 7 days hours, and current month to date

[ ] Export to include daily hours instead of monthly for state reporting.
  - Also, create daily cron job?

[X] Changing the percentage color to match the rest of the color scheme.

[X] If we edit timecards, can those updates reflect automatically in the portal?

[ ] Is there an option to block or restrict specific users if needed?
