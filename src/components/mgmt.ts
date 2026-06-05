import Alpine from 'alpinejs';
import {
  fetchEmployeeTable,
  fetchCurrentStudents,
  fetchLastSync,
  fetchOverviewStats,
  fetchDeHoursByDate,
  fetchAllGrades,
  loadStudents,
  syncHoursByDate,
  submitHours,
  submitGradeEntry,
  setEmployeePassword,
  exportStudents,
  setStudentPin,
  updateStudentName,
  removeStudent,
  updateTimeclockEntry,
  subscribeToTimeclock,
  fetchRoles,
  updateStudentRole,
  type MgmtEmployee,
  type SyncRecord,
  type HomebaseEmployee,
  type HoursType,
  type OverviewStats,
  type TimeclockStatusEntry,
  type Role,
  type GradeEntry,
} from '../lib/api';

export interface StudentGroup {
  homebase_id: number;
  name: string;
  initials: string;
  role_id: number;
  role_name: string;
  totalInPersonHrs: number;
  totalDeHrs: number;
  hrsToGraduate: number;
  percentComplete: number;
  todayEntry: TimeclockStatusEntry | null;
  historyEntries: TimeclockStatusEntry[];
  deHoursByDate: Record<string, number>;
  grades: GradeEntry[];
}

function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let _timeclockChannel: ReturnType<typeof subscribeToTimeclock> | null = null;
import { toTitleCase, todayIso, formatSimpleDate } from '../lib/helpers';
import type { AppStore } from '../lib/store';

function app(): AppStore {
  return Alpine.store('app') as AppStore;
}

export interface NeedsAttentionItem {
  homebase_id: number;
  name: string;
  reason: 'no_clockin' | 'no_clockout';
}

export interface MgmtStore {
  loading: boolean;
  employees: MgmtEmployee[];
  currentStudents: TimeclockStatusEntry[];
  deHours: Record<string, number>;
  allGrades: Record<number, GradeEntry[]>;
  lastSync: SyncRecord | null;
  overviewStats: OverviewStats | null;
  dismissedAttentionIds: number[];
  load(): Promise<void>;
  formatLastSync(): string;
  dismissAttention(id: number): void;
  readonly groupedStudents: StudentGroup[];
  readonly clockedInCount: number;
  readonly needsAttentionStudents: NeedsAttentionItem[];
  readonly todayTimeclockStats: { hours: number; students: number };
  readonly yesterdayTimeclockStats: { hours: number; students: number };
}

export function createMgmtStore(): MgmtStore {
  return {
    loading: false,
    employees: [],
    currentStudents: [],
    deHours: {},
    allGrades: {},
    lastSync: null,
    overviewStats: null,
    dismissedAttentionIds: [],

    dismissAttention(id: number) {
      this.dismissedAttentionIds = [...(this.dismissedAttentionIds as number[]), id];
    },

    get clockedInCount(): number {
      return new Set(
        (this.currentStudents as TimeclockStatusEntry[])
          .filter(s => s.is_clocked_in)
          .map(s => s.homebase_id)
      ).size;
    },

    get needsAttentionStudents(): NeedsAttentionItem[] {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
      const prevDay = localDateStr(d);

      const prevEntries = (this.currentStudents as TimeclockStatusEntry[]).filter(s => s.date === prevDay);
      const prevByStudent = new Map<number, TimeclockStatusEntry[]>();
      for (const e of prevEntries) {
        if (!prevByStudent.has(e.homebase_id)) prevByStudent.set(e.homebase_id, []);
        prevByStudent.get(e.homebase_id)!.push(e);
      }

      const dismissed = new Set(this.dismissedAttentionIds as number[]);
      const result: NeedsAttentionItem[] = [];
      for (const emp of this.employees as MgmtEmployee[]) {
        if (dismissed.has(emp.homebase_id)) continue;
        const entries = prevByStudent.get(emp.homebase_id) ?? [];
        if (entries.length === 0) {
          result.push({ homebase_id: emp.homebase_id, name: emp.name, reason: 'no_clockin' });
        } else if (entries.some(e => e.clock_out === null)) {
          result.push({ homebase_id: emp.homebase_id, name: emp.name, reason: 'no_clockout' });
        }
      }
      return result;
    },

    async load() {
      app().showLoading();
      try {
        const [employees, students, lastSync, overviewStats, deHours, allGrades] = await Promise.all([
          fetchEmployeeTable(),
          fetchCurrentStudents(),
          fetchLastSync(),
          fetchOverviewStats(),
          fetchDeHoursByDate(),
          fetchAllGrades(),
        ]);
        this.employees = employees;
        this.currentStudents = students;
        this.lastSync = lastSync;
        this.overviewStats = overviewStats;
        this.deHours = deHours;
        this.allGrades = allGrades;

        if (!_timeclockChannel) {
          _timeclockChannel = subscribeToTimeclock(async () => {
            const mgmt = Alpine.store('mgmt') as MgmtStore;
            mgmt.currentStudents = await fetchCurrentStudents();
          });
        }
      } catch {
        app().showSnackbar('Failed to load employees', 'error');
      } finally {
        app().hideLoading();
      }
    },

    formatLastSync() {
      if (!this.lastSync) return 'No syncs recorded yet.';
      return `Last synced: ${formatSimpleDate(this.lastSync.date_synced)} — ${this.lastSync.inserted} records`;
    },

    get groupedStudents(): StudentGroup[] {
      const today = localDateStr();

      // Build employee name lookup for students without timeclock entries
      const empMap = new Map<number, MgmtEmployee>();
      for (const emp of this.employees) empMap.set(emp.homebase_id, emp);

      // Group timeclock entries by homebase_id; skip inactive students
      const groups = new Map<number, TimeclockStatusEntry[]>();
      for (const entry of this.currentStudents) {
        if (!empMap.has(entry.homebase_id)) continue;
        if (!groups.has(entry.homebase_id)) groups.set(entry.homebase_id, []);
        groups.get(entry.homebase_id)!.push(entry);
      }

      // Ensure all active employees appear even if they have no timeclock entries
      for (const emp of this.employees) {
        if (!groups.has(emp.homebase_id)) groups.set(emp.homebase_id, []);
      }

      return Array.from(groups.entries())
        .map(([homebase_id, entries]) => {
          const sorted = [...entries].sort((a, b) =>
            new Date(b.clock_in).getTime() - new Date(a.clock_in).getTime()
          );
          const todayEntry = sorted.find(e => e.date === today) ?? null;
          const historyEntries = sorted.filter(e => e.date !== today);
          const name = entries[0]?.name ?? empMap.get(homebase_id)?.name ?? `Student ${homebase_id}`;
          const initials = name.split(' ').map(p => p[0] ?? '').slice(0, 2).join('').toUpperCase();
          const deHoursByDate: Record<string, number> = {};
          for (const e of entries) {
            const val = (this.deHours as Record<string, number>)[`${homebase_id}|${e.date}`];
            if (val) deHoursByDate[e.date] = val;
          }
          const emp = empMap.get(homebase_id);
          return {
            homebase_id,
            name,
            initials,
            role_id: emp?.role_id ?? 1,
            role_name: emp?.role_name ?? '',
            totalInPersonHrs: parseFloat(emp?.in_person_hrs ?? '0') || 0,
            totalDeHrs: parseFloat(emp?.de_hrs ?? '0') || 0,
            hrsToGraduate: emp?.hrs_to_graduate ?? 0,
            percentComplete: emp?.percent_complete ?? 0,
            todayEntry,
            historyEntries,
            deHoursByDate,
            grades: (this.allGrades as Record<number, GradeEntry[]>)[homebase_id] ?? [],
          };
        })
        .sort((a, b) => {
          const aActive = a.todayEntry?.is_clocked_in ? 1 : 0;
          const bActive = b.todayEntry?.is_clocked_in ? 1 : 0;
          if (aActive !== bActive) return bActive - aActive;
          return a.name.localeCompare(b.name);
        });
    },

    get todayTimeclockStats(): { hours: number; students: number } {
      const today = localDateStr();
      const entries: TimeclockStatusEntry[] = this.currentStudents.filter((s: TimeclockStatusEntry) => s.date === today);
      return {
        hours: entries.reduce((sum, s) => sum + (s.worked_hours ?? 0), 0),
        students: new Set(entries.map(s => s.homebase_id)).size,
      };
    },

    get yesterdayTimeclockStats(): { hours: number; students: number } {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const yesterday = localDateStr(d);
      const entries: TimeclockStatusEntry[] = this.currentStudents.filter((s: TimeclockStatusEntry) => s.date === yesterday);
      return {
        hours: entries.reduce((sum, s) => sum + (s.worked_hours ?? 0), 0),
        students: new Set(entries.map(s => s.homebase_id)).size,
      };
    },

  };
}

// ── Hours Modal ────────────────────────────────────────────────────────

export function hoursModalData() {
  return {
    open: false,
    loading: false,
    error: '',
    students: [] as HomebaseEmployee[],
    types: [ { id: 1, name: 'In Person' }, { id: 2, name: 'DE' } ] as HoursType[],
    studentsLoading: false,

    studentId: '',
    typeId: '',
    date: todayIso(),
    module: '',
    platform: '',
    hours: '',
    verified: '',

    async openModal(prefill?: { studentId?: string; typeId?: string } | null) {
      app().showLoading();
      this.error = '';
      this.studentId = prefill?.studentId ?? '';
      this.typeId = prefill?.typeId ?? this.types[0].id.toString();
      this.module = '';
      this.platform = '';
      this.hours = '';
      this.verified = 'true';
      this.date = todayIso();
      this.studentsLoading = true;
      this.open = true;

      try {
        this.students = await loadStudents();
      } catch {
        this.students = [];
      } finally {
        this.studentsLoading = false;
        app().hideLoading();
      }

      const dialog = document.getElementById('hours-modal') as HTMLDialogElement;
      dialog?.showModal();
    },

    closeModal() {
      this.open = false;
      const dialog = document.getElementById('hours-modal') as HTMLDialogElement;
      dialog?.close();
    },

    async submit() {
      // All fields are required, but only enforce platform/module/verified if DE hours
      if (this.typeId === '2') {
        if (!this.studentId || !this.typeId || !this.date || !this.module || !this.platform || !this.hours || !this.verified) {
          this.error = 'All fields are required.';
          return;
        }
      } else {
        if (!this.studentId || !this.typeId || !this.date || !this.hours) {
          this.error = 'All fields are required.';
          return;
        }
      }
      app().showLoading();
    try {
        await submitHours({
          homebase_id: Number(this.studentId),
          type_id: Number(this.typeId),
          date: this.date,
          module: this.module,
          platform: this.platform,
          hours: this.hours,
          verified: this.verified === 'true',
        });
        this.closeModal();
        const mgmt = Alpine.store('mgmt') as MgmtStore;
        await mgmt.load();
        // add catch for 409 Conflict (duplicate entry) and show specific message
        // add type for err
      } catch (err: any) {
        this.error = err.message || 'An error occurred while submitting hours.';
      } finally {
        app().hideLoading();
      }
    },
  };
}

// ── Grades Modal ──────────────────────────────────────────────────────────

export function gradesModalData() {
  return {
    open: false,
    loading: false,
    error: '',
    students: [] as HomebaseEmployee[],
    studentsLoading: false,

    studentId: '',
    date: todayIso(),
    project: '',
    category: '',
    score: '',
    notes: '',

    async openModal() {
      app().showLoading();
      this.error = '';
      this.studentId = '';
      this.project = '';
      this.category = '';
      this.score = '';
      this.notes = '';
      this.date = todayIso();
      this.studentsLoading = true;
      this.open = true;

      try {
        this.students = await loadStudents();
      } catch {
        this.students = [];
      } finally {
        this.studentsLoading = false;
        app().hideLoading();
      }

      const dialog = document.getElementById('grades-modal') as HTMLDialogElement;
      dialog?.showModal();
    },

    closeModal() {
      this.open = false;
      const dialog = document.getElementById('grades-modal') as HTMLDialogElement;
      dialog?.close();
    },

    async submit() {
      this.error = '';
      if (!this.studentId || !this.date || !this.project || !this.category || !this.score) {
        this.error = 'All fields except notes are required.';
        return;
      }

      app().showLoading();
      try {
        await submitGradeEntry({
          homebase_id: Number(this.studentId),
          date: this.date,
          project: this.project,
          category: this.category,
          score: Number(this.score),
          notes: this.notes || null,
        });
        this.closeModal();
        app().showSnackbar('Grade saved.', 'success');
      } catch {
        this.error = 'Could not save. Please try again.';
      } finally {
        app().hideLoading();
      }
    },
  };
}

// ── Sync Confirm Dialog ────────────────────────────────────────────────────

export function syncDialogData() {
  return {
    loading: false,
    date: '',

    openDialog() {
      this.date = '';
      const dialog = document.getElementById('confirm-dialog') as HTMLDialogElement;
      dialog?.showModal();
    },

    closeDialog() {
      const dialog = document.getElementById('confirm-dialog') as HTMLDialogElement;
      dialog?.close();
    },

    async sync() {
      if (!this.date) {
        app().showSnackbar('Please select a date before syncing.', 'error');
        return;
      }

      app().showLoading();
      try {
        const emp = app().currentEmployee!;
        const synced_by = `${emp.first_name} ${emp.last_name}`;
        const { inserted } = await syncHoursByDate(this.date, synced_by);
        this.closeDialog();
        app().showSnackbar(`Success — ${inserted} timecards synced.`, 'success');

        const mgmt = Alpine.store('mgmt') as MgmtStore;
        setTimeout(() => mgmt.load(), 3500);
      } catch {
        app().showSnackbar('Error syncing hours. Please try again.', 'error');
      } finally {
        app().hideLoading();
      }
    },
  };
}

// ── Inline Hours Edit ─────────────────────────────────────────────────────

export function inlineHoursData(employeeId: number, typeId: 1 | 2) {
  return {
    mode: 'idle' as 'idle' | 'add' | 'edit',
    value: '',
    originalValue: 0,
    saving: false,

    startAdd() {
      this.value = '';
      this.originalValue = 0;
      this.mode = 'add';
    },

    startEdit(currentValue: string) {
      this.originalValue = parseFloat(currentValue) || 0;
      this.value = currentValue;
      this.mode = 'edit';
    },

    cancel() {
      this.mode = 'idle';
      this.value = '';
      this.originalValue = 0;
    },

    async save() {
      const target = parseFloat(this.value);
      if (isNaN(target) || target < 0) {
        this.cancel();
        return;
      }

      // Add: insert the entered value directly.
      // Edit: insert the delta (entered total − original total); may be negative.
      const hrs = this.mode === 'edit' ? target - this.originalValue : target;

      if (hrs === 0) {
        this.cancel();
        return;
      }
      if (this.mode === 'add' && hrs < 0) {
        this.cancel();
        return;
      }
      
      app().showLoading();
      try {
        await submitHours({
          homebase_id: employeeId,
          type_id: typeId,
          date: todayIso(),
          hours: String(hrs),
          module: '',
          platform: '',
          verified: true,
        });
        this.cancel();
        const mgmt = Alpine.store('mgmt') as MgmtStore;
        await mgmt.load();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Save failed';
        app().showSnackbar(msg, 'error');
      } finally {
        this.saving = false;
        app().hideLoading();
      }
    },
  };
}

// ── Add Student Dialog ────────────────────────────────────────────────────

export function addStudentData() {
  return {
    open: false,
    error: '',
    students: [] as HomebaseEmployee[],
    roles: [] as Role[],
    studentsLoading: false,
    studentId: '',
    roleId: 1,

    async openModal() {
      app().showLoading();
      this.error = '';
      this.studentId = '';
      this.roleId = 1;
      this.studentsLoading = true;
      this.open = true;

      try {
        const [all, roles] = await Promise.all([loadStudents(), fetchRoles()]);
        const mgmt = Alpine.store('mgmt') as MgmtStore;
        const existingIds = new Set(mgmt.employees.map(e => e.homebase_id));
        this.students = all.filter(s => !existingIds.has(s.id));
        this.roles = roles;
      } catch {
        this.students = [];
        this.roles = [];
      } finally {
        this.studentsLoading = false;
        app().hideLoading();
      }

      const dialog = document.getElementById('add-student-dialog') as HTMLDialogElement;
      dialog?.showModal();
    },

    closeModal() {
      this.open = false;
      const dialog = document.getElementById('add-student-dialog') as HTMLDialogElement;
      dialog?.close();
    },

    async submit() {
      this.error = '';
      if (!this.studentId) {
        this.error = 'Please select a student.';
        return;
      }

      const student = this.students.find(s => s.id === Number(this.studentId));
      if (!student) {
        this.error = 'Student not found.';
        return;
      }

      app().showLoading();
      try {
        const name = `${student.first_name} ${student.last_name}`.toLowerCase();
        await setEmployeePassword(student.id, name, 'Welcome123');
        await updateStudentRole(student.id, this.roleId);
        this.closeModal();
        app().showSnackbar(`${toTitleCase(name)} added. Default password: Welcome123`, 'success');
        const mgmt = Alpine.store('mgmt') as MgmtStore;
        await mgmt.load();
      } catch {
        this.error = 'Could not add student. Please try again.';
      } finally {
        app().hideLoading();
      }
    },
  };
}

// ── Add Student Direct Dialog (no Homebase lookup) ────────────────────────────

export function addStudentDirectData() {
  return {
    firstName: '',
    lastName: '',
    roles: [] as Role[],
    roleId: 1,
    loading: false,
    error: '',

    async openModal() {
      this.firstName = '';
      this.lastName = '';
      this.roleId = 1;
      this.error = '';
      try {
        this.roles = await fetchRoles();
      } catch {
        this.roles = [];
      }
      const dialog = document.getElementById('add-student-direct-dialog') as HTMLDialogElement;
      dialog?.showModal();
    },

    closeModal() {
      const dialog = document.getElementById('add-student-direct-dialog') as HTMLDialogElement;
      dialog?.close();
    },

    async submit() {
      this.error = '';
      const first = this.firstName.trim();
      const last = this.lastName.trim();
      if (!first || !last) {
        this.error = !first && !last
          ? 'First and last name are required.'
          : !first
            ? 'First name is required.'
            : 'Last name is required.';
        return;
      }
      const name = `${first} ${last}`.toLowerCase();
      const homebaseId = Date.now();
      this.loading = true;
      app().showLoading();
      try {
        await setEmployeePassword(homebaseId, name, 'Welcome123');
        await updateStudentRole(homebaseId, this.roleId);
        this.closeModal();
        app().showSnackbar(`${toTitleCase(name)} added. Default password: Welcome123`, 'success');
        const mgmt = Alpine.store('mgmt') as MgmtStore;
        await mgmt.load();
      } catch {
        this.error = 'Could not add student. Please try again.';
      } finally {
        this.loading = false;
        app().hideLoading();
      }
    },
  };
}

// ── Export Dialog ─────────────────────────────────────────────────────────

export function exportDialogData() {
  return {
    monthYear: new Date().toISOString().slice(0, 7), // 'YYYY-MM'

    openDialog() {
      this.monthYear = new Date().toISOString().slice(0, 7);
      const dialog = document.getElementById('export-dialog') as HTMLDialogElement;
      dialog?.showModal();
    },

    closeDialog() {
      const dialog = document.getElementById('export-dialog') as HTMLDialogElement;
      dialog?.close();
    },

    async submit() {
      if (!this.monthYear) return;
      const [year, month] = this.monthYear.split('-').map(Number);
      const now = new Date();
      const curMonth = now.getMonth() + 1;
      const curYear = now.getFullYear();
      if (year > curYear || (year === curYear && month > curMonth)) {
        app().showSnackbar('Cannot export a future month.', 'error', 3500);
        return;
      }
      this.closeDialog();
      app().showLoading();
      try {
        const blob = await exportStudents(month, year);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bennett_${this.monthYear}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        app().showSnackbar('Export failed. Please try again.', 'error');
      } finally {
        app().hideLoading();
      }
    },
  };
}

// ── Reset Password Dialog ──────────────────────────────────────────────────

export function resetPasswordData() {
  return {
    loading: false,
    employeeId: 0,
    employeeName: '',

    get displayName() {
      return toTitleCase(this.employeeName);
    },

    openDialog({ id, name }: { id: number; name: string }) {
      this.employeeId = id;
      this.employeeName = name;
      const dialog = document.getElementById('reset-password-dialog') as HTMLDialogElement;
      dialog?.showModal();
    },

    closeDialog() {
      const dialog = document.getElementById('reset-password-dialog') as HTMLDialogElement;
      dialog?.close();
    },

    async confirm() {
      app().showLoading();
      try {
        await setEmployeePassword(this.employeeId, this.employeeName, 'Welcome123');
        this.closeDialog();
        app().showSnackbar(`Password reset for ${toTitleCase(this.employeeName)}.`, 'success');
      } catch {
        app().showSnackbar('Failed to reset password. Please try again.', 'error');
      } finally {
        app().hideLoading();
      }
    },
  };
}

// ── Overview Panel ────────────────────────────────────────────────────────────

export function overviewPanelData() {
  return {
    vals: { yH: 0, yS: 0, wH: 0, wS: 0, mH: 0, mS: 0 } as Record<string, number>,

    init(this: any) {
      const animate = (key: string, target: number) => {
        const from = this.vals[key] as number;
        const t0 = performance.now();
        const tick = (now: number) => {
          const p = Math.min((now - t0) / 750, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          this.vals[key] = parseFloat((from + (target - from) * eased).toFixed(1));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      };

      const apply = (stats: OverviewStats | null) => {
        if (!stats) return;
        animate('yH', stats.yesterday.hours);
        animate('yS', stats.yesterday.students);
        animate('wH', stats.last7Days.hours);
        animate('wS', stats.last7Days.students);
        animate('mH', stats.mtd.hours);
        animate('mS', stats.mtd.students);
      };

      this.$watch('$store.mgmt.overviewStats', apply);
      apply((Alpine.store('mgmt') as MgmtStore).overviewStats);
    },

    fmt(n: number): string {
      return n.toFixed(1);
    },
  };
}

// ── Management Table (sortable) ───────────────────────────────────────────────

export function mgmtTableData() {
  return {
    sortCol: 'name' as string,
    sortDir: 'asc' as 'asc' | 'desc',

    toggleSort(col: string) {
      if (this.sortCol === col) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortCol = col;
        this.sortDir = 'asc';
      }
    },

    get sortedEmployees(): MgmtEmployee[] {
      const mgmt = Alpine.store('mgmt') as MgmtStore;
      const col = this.sortCol;
      const numericCols = ['total_hrs', 'hrs_to_graduate', 'percent_complete', 'in_person_hrs', 'de_hrs'];
      return [...mgmt.employees].sort((a: any, b: any) => {
        const va = numericCols.includes(col) ? parseFloat(a[col]) || 0 : a[col];
        const vb = numericCols.includes(col) ? parseFloat(b[col]) || 0 : b[col];
        const cmp = typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : String(va).localeCompare(String(vb));
        return this.sortDir === 'asc' ? cmp : -cmp;
      });
    },
  };
}

// ── Edit Student Name Dialog ──────────────────────────────────────────────────

export function editStudentNameData() {
  return {
    homebaseId: 0,
    name: '',
    roleId: 1,
    roles: [] as Role[],
    loading: false,
    error: '',

    init() {
      fetchRoles().then(r => { this.roles = r; }).catch(() => {});
      window.addEventListener('open-edit-student-name', (e: Event) => {
        const { id, name, roleId } = (e as CustomEvent<{ id: number; name: string; roleId: number }>).detail;
        this.homebaseId = id;
        this.name = name;
        this.roleId = roleId ?? 1;
        this.error = '';
        const dialog = document.getElementById('edit-student-name-dialog') as HTMLDialogElement;
        dialog?.showModal();
      });
    },

    closeDialog() {
      const dialog = document.getElementById('edit-student-name-dialog') as HTMLDialogElement;
      dialog?.close();
    },

    async submit() {
      const trimmed = this.name.trim().toLowerCase();
      if (!trimmed) {
        this.error = 'Name is required.';
        return;
      }
      this.loading = true;
      this.error = '';
      app().showLoading();
      try {
        await Promise.all([
          updateStudentName(this.homebaseId, trimmed),
          updateStudentRole(this.homebaseId, this.roleId),
        ]);
        this.closeDialog();
        app().showSnackbar('Student updated.', 'success');
        const mgmt = Alpine.store('mgmt') as MgmtStore;
        await mgmt.load();
      } catch {
        this.error = 'Could not update student. Please try again.';
      } finally {
        this.loading = false;
        app().hideLoading();
      }
    },
  };
}

// ── Remove Student Dialog ─────────────────────────────────────────────────────

export function removeStudentData() {
  return {
    homebaseId: 0,
    studentName: '',
    loading: false,

    get displayName() {
      return toTitleCase(this.studentName);
    },

    init() {
      window.addEventListener('open-remove-student', (e: Event) => {
        const { id, name } = (e as CustomEvent<{ id: number; name: string }>).detail;
        this.homebaseId = id;
        this.studentName = name;
        const dialog = document.getElementById('remove-student-dialog') as HTMLDialogElement;
        dialog?.showModal();
      });
    },

    closeDialog() {
      const dialog = document.getElementById('remove-student-dialog') as HTMLDialogElement;
      dialog?.close();
    },

    async confirm() {
      this.loading = true;
      app().showLoading();
      try {
        await removeStudent(this.homebaseId);
        this.closeDialog();
        app().showSnackbar(`${this.displayName} has been removed.`, 'success');
        const mgmt = Alpine.store('mgmt') as MgmtStore;
        await mgmt.load();
      } catch {
        app().showSnackbar('Could not remove student. Please try again.', 'error');
      } finally {
        this.loading = false;
        app().hideLoading();
      }
    },
  };
}

// ── History Row (in-place edit for clock-in, clock-out, DE hours) ─────────────

export function historyRowData() {
  return {
    editField: null as null | 'clock_in' | 'clock_out' | 'de',
    editValue: '',
    saving: false,

    startEditTime(field: 'clock_in' | 'clock_out', ts: string) {
      if (!ts) {
        this.editValue = '';
      } else {
        const d = new Date(ts);
        this.editValue = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      }
      this.editField = field;
    },

    startEditDe(current: number) {
      this.editValue = current > 0 ? String(current) : '';
      this.editField = 'de';
    },

    cancel() {
      this.editField = null;
      this.editValue = '';
    },

    async saveTime(homebaseId: number, originalClockIn: string, date: string) {
      if (!this.editValue) { this.cancel(); return; }
      const [hours, minutes] = this.editValue.split(':').map(Number);
      if (isNaN(hours) || isNaN(minutes)) { this.cancel(); return; }
      const [year, month, day] = date.split('-').map(Number);
      const newDate = new Date(year, month - 1, day, hours, minutes);
      const field = this.editField as 'clock_in' | 'clock_out';

      this.saving = true;
      app().showLoading();
      try {
        await updateTimeclockEntry(homebaseId, originalClockIn, { [field]: newDate.toISOString() });
        this.cancel();
        await (Alpine.store('mgmt') as MgmtStore).load();
      } catch {
        app().showSnackbar('Could not update time. Please try again.', 'error');
      } finally {
        this.saving = false;
        app().hideLoading();
      }
    },

    async saveDe(homebaseId: number, date: string, originalTotal: number) {
      const target = parseFloat(this.editValue);
      if (isNaN(target) || target < 0) { this.cancel(); return; }
      const delta = target - originalTotal;
      if (delta === 0) { this.cancel(); return; }

      this.saving = true;
      app().showLoading();
      try {
        await submitHours({
          homebase_id: homebaseId,
          type_id: 2,
          date,
          hours: String(delta),
          module: '',
          platform: '',
          verified: true,
        });
        this.cancel();
        await (Alpine.store('mgmt') as MgmtStore).load();
      } catch {
        app().showSnackbar('Could not update DE hours. Please try again.', 'error');
      } finally {
        this.saving = false;
        app().hideLoading();
      }
    },
  };
}

// ── Add Entry Dialog (per-student row in Timeclock view) ─────────────────────

export function addEntryModalData() {
  return {
    homebaseId: 0,
    studentName: '',
    type: 'de_hours' as 'de_hours' | 'grades',
    loading: false,
    error: '',
    date: todayIso(),
    hours: '',
    module: '',
    platform: '',
    score: '',
    project: '',
    category: '',
    notes: '',

    get displayName() {
      return toTitleCase(this.studentName);
    },

    init() {
      window.addEventListener('open-add-entry', (e: Event) => {
        const { id, name } = (e as CustomEvent<{ id: number; name: string }>).detail;
        this.homebaseId = id;
        this.studentName = name;
        this.type = 'de_hours';
        this.error = '';
        this.date = todayIso();
        this.hours = '';
        this.module = '';
        this.platform = '';
        this.score = '';
        this.project = '';
        this.category = '';
        this.notes = '';
        const dialog = document.getElementById('add-entry-dialog') as HTMLDialogElement;
        dialog?.showModal();
      });
    },

    closeDialog() {
      const dialog = document.getElementById('add-entry-dialog') as HTMLDialogElement;
      dialog?.close();
    },

    async submit() {
      this.error = '';
      if (this.type === 'de_hours') {
        if (!this.date || !this.hours) {
          this.error = 'Date and Hours are required.';
          return;
        }
        this.loading = true;
        app().showLoading();
        try {
          await submitHours({
            homebase_id: this.homebaseId,
            type_id: 2,
            date: this.date,
            hours: this.hours,
            module: this.module,
            platform: this.platform,
            verified: true,
          });
          this.closeDialog();
          app().showSnackbar('DE hours added.', 'success');
          const mgmt = Alpine.store('mgmt') as MgmtStore;
          await mgmt.load();
        } catch (err: unknown) {
          this.error = err instanceof Error ? err.message : 'Could not save. Please try again.';
        } finally {
          this.loading = false;
          app().hideLoading();
        }
      } else {
        if (!this.date || !this.score) {
          this.error = 'Date and Score are required.';
          return;
        }
        this.loading = true;
        app().showLoading();
        try {
          await submitGradeEntry({
            homebase_id: this.homebaseId,
            date: this.date,
            project: this.project,
            category: this.category,
            score: Number(this.score),
            notes: this.notes || null,
          });
          this.closeDialog();
          app().showSnackbar('Grade saved.', 'success');
        } catch {
          this.error = 'Could not save. Please try again.';
        } finally {
          this.loading = false;
          app().hideLoading();
        }
      }
    },
  };
}

// ── Set PIN Dialog ────────────────────────────────────────────────────────────

export function setPinData() {
  return {
    employeeId: 0,
    employeeName: '',
    pin: '',
    loading: false,
    error: '',

    init() {
      window.addEventListener('open-set-pin', (e: Event) => {
        const { id, name } = (e as CustomEvent<{ id: number; name: string }>).detail;
        this.employeeId = id;
        this.employeeName = name;
        this.pin = '';
        this.error = '';
        const dialog = document.getElementById('set-pin-dialog') as HTMLDialogElement;
        dialog?.showModal();
      });
    },

    closeDialog() {
      const dialog = document.getElementById('set-pin-dialog') as HTMLDialogElement;
      dialog?.close();
    },

    async submit() {
      if (!/^\d{4}$/.test(this.pin)) {
        this.error = 'PIN must be exactly 4 digits (numbers only).';
        return;
      }
      this.loading = true;
      this.error = '';
      try {
        await setStudentPin(this.employeeId, this.pin);
        this.closeDialog();
        app().showSnackbar(`PIN set for ${toTitleCase(this.employeeName)}.`, 'success');
      } catch (e: unknown) {
        this.error = e instanceof Error ? e.message : 'Failed to set PIN. Please try again.';
      } finally {
        this.loading = false;
      }
    },
  };
}
