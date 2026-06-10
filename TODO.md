# TODO

## New Features

- [ ] Update the student dashboard UI
  - [x] Update UI to match screenshot design
  - [x] Combine In Person hours and DE hours into 1 table with a type (In Person or DE) col
  - [ ] Update API call for Student's Hours to pull from internal timeclock system (show time in / time out, break start / break end)
  
- [ ] Create a new Auth user in Supabase for the Timeclock iPad kiosk station to authenticate with
  - [ ] Timeclock punch pin entry screen is blocked if not authenticated
  - [ ] Any time punch updates that are not authenticated with this user should be blocked

- [ ] Take picture (from front facing camera on iPad) on a student time punch (clock in/out, start/end break)
  - [ ] Store picture in supabase db table
  
- [ ] UI for admin to view the images associated with a student's time punch

- [ ] Export to include daily hours instead of monthly for state reporting.
  - Also, create daily cron job?

- [ ] Create TODO items for system cutover (Homebase -> Internal Timeclock System)
  - [ ] Shooting for July 1 "system cutover"
  - [ ] All students will ONLY clock in/out & start/end break with internal timeclock system
  - [ ] Remove any/all API calls to Homebase and any functions/triggers that pull in hours from the Homebase API
  - [ ] Decide how to store / reference existing Homebase hours along with new / ongoing hours calculated by internal Timeclock system

## Incomplete Features

---

## Bugs

- [ ] When signing out, the leftover name is still present in the name text input

---

## Refactor / Code Quality

- [ ] Find areas in the codebase that can be refactored for code quality, maintainability, or performance related reasons
  - [ ] Can `index.html` be split into smaller components?
  - [ ] Can any of the `component` or `lib` `*.ts` files be split into smaller modules?
  - [ ] Analyze `api.ts`, do any of the API calls to the DB need to be refactore for performance or maintainability?

---

## DB Changes

- [ ] Replace usage of "homebase_id" with "student_id"
