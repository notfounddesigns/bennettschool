# TODO

## New Features

- [x] Add Button ('+' icon) in "Actions" col on Timeclock view
  - [x] Opens dialog with a dropdown for selecting what to add. Options: DE Hours, Grades
  - [x] DE Hours selected, fields for adding DE Hours show below. Fields: Student (text, required), Date (required), Hours (number, required), Module (text, not required), Platform (text, not required)
  - [x] Grades selected, fields for adding Grades show below. Fields: Student (text, required), Date (required), Score (number, required), Project (text, not required), Category (text, not required), Notes (text, not required).
  
- [ ] Create a new Auth user in Supabase for the Timeclock iPad kiosk station to authenticate with
  - [ ] Timeclock punch pin entry screen is blocked if not authenticated
  - [ ] Any time punch updates that are not authenticated with this user should be blocked

- [ ] Export to include daily hours instead of monthly for state reporting.
  - Also, create daily cron job?

- [ ] Logging system for Audit purposes

## Incomplete Features

- [x] The "Needs Attention" detail pane should display:
  - [x] Any students that did not have a clock-in for the previous day
  - [x] Any students that had a clock-in but no clock-out for the previous day
  - [ ] Anything else?
  - [x] A way to hide or ignore a needs attention entry

---

## Bugs

---

## Refactor / Code Quality

- [x] Time Punch Overview updates:
  - [x] Add current number of students that are clocked in
  - [x] Yesterday, Last 7, & Month to date hours should pull from the timeclock_entries table (minus timeclock_breaks)

---

---

## DB Changes

- [ ] Replace usage of "homebase_id" with "student_id"
