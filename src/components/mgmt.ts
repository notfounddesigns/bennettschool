import Alpine from 'alpinejs';
import {
  fetchEmployeeTable,
  fetchCurrentStudents,
  fetchLastSync,
  fetchOverviewStats,
  loadStudents,
  syncHoursByDate,
  submitHours,
  submitGradeEntry,
  setEmployeePassword,
  exportStudents,
  setStudentPin,
  subscribeToTimeclock,
  type MgmtEmployee,
  type SyncRecord,
  type HomebaseEmployee,
  type HoursType,
  type OverviewStats,
  type TimeclockStatusEntry,
} from '../lib/api';

let _timeclockChannel: ReturnType<typeof subscribeToTimeclock> | null = null;
import { toTitleCase, todayIso, formatSimpleDate } from '../lib/helpers';
import type { AppStore } from '../lib/store';

function app(): AppStore {
  return Alpine.store('app') as AppStore;
}

export interface MgmtStore {
  loading: boolean;
  employees: MgmtEmployee[];
  currentStudents: TimeclockStatusEntry[];
  lastSync: SyncRecord | null;
  overviewStats: OverviewStats | null;
  load(): Promise<void>;
  formatLastSync(): string;
}

export function createMgmtStore(): MgmtStore {
  return {
    loading: false,
    employees: [],
    currentStudents: [],
    lastSync: null,
    overviewStats: null,

    async load() {
      app().showLoading();
      try {
        const [employees, students, lastSync, overviewStats] = await Promise.all([
          fetchEmployeeTable(),
          fetchCurrentStudents(),
          fetchLastSync(),
          fetchOverviewStats(),
        ]);
        this.employees = employees;
        this.currentStudents = students;
        this.lastSync = lastSync;
        this.overviewStats = overviewStats;

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
    studentsLoading: false,
    studentId: '',

    async openModal() {
      app().showLoading();
      this.error = '';
      this.studentId = '';
      this.studentsLoading = true;
      this.open = true;

      try {
        const all = await loadStudents();
        const mgmt = Alpine.store('mgmt') as MgmtStore;
        const existingIds = new Set(mgmt.employees.map(e => e.homebase_id));
        this.students = all.filter(s => !existingIds.has(s.id));
      } catch {
        this.students = [];
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
      } catch {
        this.error = 'Failed to set PIN. Please try again.';
      } finally {
        this.loading = false;
      }
    },
  };
}
