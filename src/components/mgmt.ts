import Alpine from 'alpinejs';
import {
  fetchEmployeeTable,
  fetchLastSync,
  loadStudents,
  syncHoursByDate,
  submitHours,
  submitGradeEntry,
  setEmployeePassword,
  type MgmtEmployee,
  type SyncRecord,
  type HomebaseEmployee,
  type HoursType,
} from '../lib/api';
import { toTitleCase, todayIso, formatSimpleDate } from '../lib/helpers';
import type { AppStore } from '../lib/store';

function app(): AppStore {
  return Alpine.store('app') as AppStore;
}

export interface MgmtStore {
  loading: boolean;
  employees: MgmtEmployee[];
  lastSync: SyncRecord | null;
  load(): Promise<void>;
  formatLastSync(): string;
  exportCsv(): void;
}

export function createMgmtStore(): MgmtStore {
  return {
    loading: false,
    employees: [],
    lastSync: null,

    async load() {
      app().showLoading();
      try {
        const [employees, lastSync] = await Promise.all([
          fetchEmployeeTable(),
          fetchLastSync(),
        ]);
        this.employees = employees;
        this.lastSync = lastSync;
      } catch {
        app().showSnackbar('Failed to load employees', 'error');
      } finally {
        app().hideLoading();
      }
    },

    formatLastSync() {
      if (!this.lastSync) return 'No syncs recorded yet.';
      return `Most recent synced date: ${formatSimpleDate(this.lastSync.date_synced)}`;
    },

    exportCsv() {
      const headers = ['Name', 'In Person Hrs', 'DE Hrs', 'Total Hrs', 'Hrs to Graduate', '% Complete'];
      const rows = this.employees.map(emp => [
        emp.name ?? '',
        emp.in_person_hrs,
        emp.de_hrs,
        String(emp.total_hrs ?? 0),
        String(emp.hrs_to_graduate ?? 0),
        String(emp.percent_complete ?? 0),
      ]);
      const csv = [headers, ...rows]
        .map(r => r.map(c => `"${String(c).replaceAll('"', '""')}"`).join(','))
        .join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `students_${todayIso()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
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
