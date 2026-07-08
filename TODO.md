# TODO

## New Features

- [x] Add the option for adding timepunch hours to the 'Add DE hours or grade' modal
  - Timepunch hours should be the default selection
  - Needs these inputs:
    - Date
    - Clock In
    - Clock Out
    - Break Start
    - Break End
    - Hours Worked (Read-only calculation based off time punch & break data entered)
  - Create audit log message
  
- [ ] Update the student dashboard UI
  - [x] Update UI to match screenshot design
  - [x] Combine In Person hours and DE hours into 1 table with a type (In Person or DE) col
  - [ ] Update API call for Student's Hours to pull from internal timeclock system (show time in / time out, break start / break end)
- [x] Ability to Edit (inline edit, same as for hours) a student's grade details
  - [x] Can edit Project Name, Category, or Score

- [x] "Clear All" button for "Needs Attention" items

- [x] Take picture (from front facing camera on iPad) on a student time punch (clock in/out, start/end break)
  - [x] Store picture in supabase db table
  
- [x] UI for admin to view the images associated with a student's time punch

- [ ] Export to include daily hours instead of monthly for state reporting.
  - Also, create daily cron job?

#### No longer doing  
- [-] Create a new Auth user in Supabase for the Timeclock iPad kiosk station to authenticate with
  - [-] Timeclock punch pin entry screen is blocked if not authenticated
  - [-] Any time punch updates that are not authenticated with this user should be blocked

- [x] Take picture (from front facing camera on iPad) on a student time punch (clock in/out, start/end break)
  - [x] Store picture in supabase db table
  
- [x] UI for admin to view the images associated with a student's time punch

- [ ] Create TODO items for system cutover (Homebase -> Internal Timeclock System)
  - [ ] Shooting for July 1 "system cutover"
  - [ ] All students will ONLY clock in/out & start/end break with internal timeclock system
  - [ ] Remove any/all API calls to Homebase and any functions/triggers that pull in hours from the Homebase API
  - [ ] Decide how to store / reference existing Homebase hours along with new / ongoing hours calculated by internal Timeclock system

- [ ] Logging system for Audit purposes

## UI / UI

- [x] Time punch data table under student needs a max height and ability to scroll

## Incomplete Features

- [ ] Need some protection logic around time punches
  - [ ] Need a lower limit and upper limit for time punches, i.e. if a user attempts to record a time punch before 7a or after 7p it is flagged for "Needs Attention". For now, the time punch is still allowed
  - [ ] Need a function to run nightly to check for students that did not clock out.
    - Should run nightly at 9p CST
    - If any students are found to still be clocked in, they are automatically clocked out with their clock out time being 5p (same day)
    - This should be flagged for a "Needs Attention" so a manager can correctly adjust the timesheet

---

## Bugs

- [x] When signing out, the leftover name is still present in the name text input

- [ ] Non-unique "match" updates — updateGradeEntry matches on (homebase_id, date, project, category) and      updateTimeclockEntry on (homebase_id, clock_in). Neither is a unique key, so a single edit can silently update multiple rows. Grades are the real exposure (a student can have duplicate date/project/category rows).

- [x] student dashboard "recent hours" reads a dead table — fixed: fetchStudentDashboard now queries `hours` instead of `hours_new` (dead table left in place)

---

## Refactor / Code Quality

- [ ] Find areas in the codebase that can be refactored for code quality, maintainability, or performance related reasons
  - [ ] Can `index.html` be split into smaller components?
  - [ ] Can any of the `component` or `lib` `*.ts` files be split into smaller modules?
  - [ ] Analyze `api.ts`, do any of the API calls to the DB need to be refactore for performance or maintainability?

---

## DB Changes

- [ ] Replace usage of "homebase_id" with "student_id"
