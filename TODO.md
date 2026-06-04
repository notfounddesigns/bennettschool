# TODO

## Bugs

- [ ] The main table in the Timeclock view does not show all of the students in the DB.

---

## Incomplete Features

- [ ] The "Needs Attention" detail pane should display:
  - [ ] Any students that did not have a clock-in for the previous day
  - [ ] Any students that had a clock-in but no clock-out for the previous day
  - [ ] Anything else?

---

## Refactor / Code Quality

- [ ] Refactor student rows in main table on Timeclock view
  - Parent row
    - Student Info (one col)
      - Student Initial Avatar + Student Name
      - Role
      - Graduation progress bar (same as table col from Dashboard view)
    - Total Hours (one col)
      - In Person Hours (total time punch hours)
      - DE Hours
    - Hours remaining to graduate
    - Clocked In Status
    - Action Buttons
      - Edit Student: only student name edit, maybe can reuse the "Add Student" dialog?
      - Remove Student: dialog prompt for confirmation
      - Reset PW: dialog prompt for confirmation of resetting to default password
      - Reset Pin: dialog for user to enter a new pin (will be used w/ student present so no need to set to a default pin)
  - Child rows (displays when user clicks the dropdown arrow on the parent row)
    - Date
    - Clock In Time (In-Place Edit Button)
    - Clock Out Time (In-Place Edit Button)
    - Hours Worked
    - DE Hours (In-Place Edit Button)

- [ ] Replace usage of "homebase_id" with "student_id"

- [ ] Update "Add Student" / "Edit Student" dialog to include: Role (pulled from DB - Student, CIT, Admin, iPad Kiosk)

---

## New Features

- [x] Bring over Time Punch Overview and Needs Attention banner from Dashboard view to Timeclock view (replaces current banner)

- [ ] Toolbar (space between Overview Banner and Table)
  - [x] Search text field (client-side), search by Name. Left aligned
  - [x] Add New Student button. Right aligned. Opens dialog to type in new student name and click Save (or Cancel - does nothing)
  - [x] Export button. Right aligned
  
- [ ] Student Row (in table) buttons (on each row)
  - [ ] Edit student (edit student name). Small edit button next to student name.
  - [ ] Remove student, not fully removed from DB but updated in the table to 'Removed'. Small remove student button (trash icon) to left of student initial avatar.
  - [ ] Reset Pin. Small reset pin button to left of student initial avatar.

- [ ] Edit hours - In Place
  - [ ] Show small edit button next to clock-in, clock-out, & DE hours cols
  - [ ] During edit, hide edit button and show a small cancel and save button
  - [ ] Auto updates the table to recalc hours worked

- [ ] Create a new Auth user in Supabase for the Timeclock iPad kiosk station to authenticate with
  - [ ] Any timepunch updates that are not authenticated with this user should be blocked

- [ ] Export to include daily hours instead of monthly for state reporting.
  - Also, create daily cron job?

- [ ] Logging system for Audit purposes
