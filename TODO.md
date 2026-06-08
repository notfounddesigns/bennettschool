# TODO

## New Features

- [x] Ability to Edit (inline edit, same as for hours) a student's grade details
  - [x] Can edit Project Name, Category, or Score

- [ ] "Clear All" button for "Needs Attention" items
  
- [ ] Create a new Auth user in Supabase for the Timeclock iPad kiosk station to authenticate with
  - [ ] Timeclock punch pin entry screen is blocked if not authenticated
  - [ ] Any time punch updates that are not authenticated with this user should be blocked

- [ ] Take picture (from front facing camera on iPad) on a student time punch (clock in/out, start/end break)
  - [ ] Store picture in supabase db table
  
- [ ] UI for admin to view the images associated with a student's time punch

- [ ] Export to include daily hours instead of monthly for state reporting.
  - Also, create daily cron job?

- [ ] Logging system for Audit purposes

## Incomplete Features

- [ ] Ability to store a "Needs Attention" detail item in a supabase db table w/ CRUD capabilites

---

## Bugs

- [ ] When signing out, the leftover name is still present in the name text input

---

## Refactor / Code Quality

---

---

## DB Changes

- [ ] Replace usage of "homebase_id" with "student_id"
