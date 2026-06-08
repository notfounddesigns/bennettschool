# TODO

## New Features

- [x] Allow students to set / reset their pin for the Timeclock system
  - (Manual, done by me) Set a default pin for all students that do not currently have a pin
  - On student dashboard, UI/UX for student's to set / reset their pin
    - Enter current (default if never logged in to Timeclock system) pin
    - Enter New Pin
    - Confirm New Pin
  - Log user that changed pin and when pin was changed

- [x] # of "Needs Attention" items next to the "Needs Attention" label. 

- [x] "Resolve All" button for "Needs Attention" items
  
- [ ] Create a new Auth user in Supabase for the Timeclock iPad kiosk station to authenticate with
  - [ ] Timeclock punch pin entry screen is blocked if not authenticated
  - [ ] Any time punch updates that are not authenticated with this user should be blocked

- [ ] Take picture (from front facing camera on iPad) on a student time punch (clock in/out, start/end break)
  - [ ] Store picture in supabase db table
  
- [ ] UI for admin to view the images associated with a student's time punch

- [ ] Export to include daily hours instead of monthly for state reporting.
  - Also, create daily cron job?

- [x] Logging system for Audit purposes

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

---

---

## DB Changes

- [ ] Replace usage of "homebase_id" with "student_id"
