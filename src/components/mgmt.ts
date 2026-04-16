import Alpine from 'alpinejs';
import {
  fetchEmployeeTable,
  fetchLastSync,
  loadStudents,
  syncHoursByDate,
  submitDeHours,
  submitGradeEntry,
  setEmployeePassword,
  type MgmtEmployee,
  type SyncRecord,
  type HomebaseEmployee,
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
      this.loading = true;
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
        this.loading = false;
      }
    },

    formatLastSync() {
      if (!this.lastSync) return 'No syncs recorded yet.';
      return `Hours up to date as of ${formatSimpleDate(this.lastSync.date_synced)}`;
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

// ── DE Hours Modal ────────────────────────────────────────────────────────

export function deModalData() {
  return {
    open: false,
    loading: false,
    error: '',
    students: [] as HomebaseEmployee[],
    studentsLoading: false,

    studentId: '',
    date: todayIso(),
    module: '',
    platform: '',
    hours: '',
    verified: '',

    async openModal() {
      this.error = '';
      this.studentId = '';
      this.module = '';
      this.platform = '';
      this.hours = '';
      this.verified = '';
      this.date = todayIso();
      this.studentsLoading = true;
      this.open = true;

      try {
        this.students = await loadStudents();
      } catch {
        this.students = [];
      } finally {
        this.studentsLoading = false;
      }

      const dialog = document.getElementById('de-modal') as HTMLDialogElement;
      dialog?.showModal();
    },

    closeModal() {
      this.open = false;
      const dialog = document.getElementById('de-modal') as HTMLDialogElement;
      dialog?.close();
    },

    async submit() {
      if (!this.studentId || !this.date || !this.module || !this.platform || !this.hours || !this.verified) {
        this.error = 'All fields are required.';
        return;
      }

      this.loading = true;
      try {
        await submitDeHours({
          student_id: Number(this.studentId),
          date: this.date,
          module: this.module,
          platform: this.platform,
          hours: this.hours,
          verified: this.verified === 'true',
        });
        this.closeModal();
        const mgmt = Alpine.store('mgmt') as MgmtStore;
        await mgmt.load();
      } catch {
        this.error = 'Could not save. Please try again.';
      } finally {
        this.loading = false;
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

      this.loading = true;
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
        this.loading = false;
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

      this.loading = true;
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
        this.loading = false;
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
      this.loading = true;
      try {
        await setEmployeePassword(this.employeeId, this.employeeName, 'Welcome123');
        this.closeDialog();
        app().showSnackbar(`Password reset for ${toTitleCase(this.employeeName)}.`, 'success');
      } catch {
        app().showSnackbar('Failed to reset password. Please try again.', 'error');
      } finally {
        this.loading = false;
      }
    },
  };
}
