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
  updateGradeEntry,
  fetchPunchPhotos,
  getPunchPhotoUrl,
  setEmployeePassword,
  clearStudentPassword,
  exportStudents,
  setStudentPin,
  updateStudentName,
  removeStudent,
  updateTimeclockEntry,
  addTimeclockEntry,
  subscribeToTimeclock,
  fetchRoles,
  updateStudentRole,
  fetchNeedsAttentionItems,
  updateNeedsAttentionItem,
  fetchAuditLog,
  logAuditEvent,
  type NeedsAttentionRecord,
  type NeedsAttentionType,
  type AuditLogRecord,
  type AuditAction,
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
  open: boolean;
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

async function logAudit(action: AuditAction, opts: {
  targetId?: string | number | null;
  targetName?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
} = {}): Promise<void> {
  const actor = app().currentEmployee;
  try {
    await logAuditEvent({
      actor_id: actor?.homebase_id ?? null,
      actor_name: actor?.name ?? null,
      action,
      target_id: opts.targetId ?? null,
      target_name: opts.targetName ?? null,
      description: opts.description ?? null,
      metadata: opts.metadata ?? null,
    });
  } catch {
    // Logging must never block or fail the parent action.
  }
}

const ACTION_LABELS: Record<AuditAction, string> = {
  login: 'Signed in',
  logout: 'Signed out',
  grade_update: 'Edited a grade entry',
  timeclock_edit: 'Edited a timeclock entry',
  timeclock_add: 'Added a timeclock entry',
  role_change: 'Updated a student profile',
  pin_reset: 'Reset a PIN',
  password_reset: 'Set a password',
  password_clear: 'Reset a password',
  student_removed: 'Removed a student',
  student_reactivated: 'Reactivated a student',
  needs_attention_resolved: 'Resolved a Needs Attention item',
  needs_attention_resolve_all: 'Resolved all Needs Attention items',
};

const ATTENTION_TYPE_LABELS: Record<NeedsAttentionType, string> = {
  no_clock_in: 'No clock-in yesterday',
  no_clock_out: 'No clock-out yesterday',
  no_break_end: 'Break not ended yesterday',
  no_timepunch_image: 'Missing punch photo yesterday',
  timepunch_image_mismatch: 'Punch photo mismatch',
};

export interface MgmtStore {
  loading: boolean;
  employees: MgmtEmployee[];
  currentStudents: TimeclockStatusEntry[];
  deHours: Record<string, number>;
  allGrades: Record<number, GradeEntry[]>;
  lastSync: SyncRecord | null;
  overviewStats: OverviewStats | null;
  needsAttentionItems: NeedsAttentionRecord[];
  auditLog: AuditLogRecord[];
  expandedId: number | null;
  load(): Promise<void>;
  formatLastSync(): string;
  resolveAttention(id: string): Promise<void>;
  resolveAllAttention(): Promise<void>;
  attentionTypeLabel(type: NeedsAttentionType): string;
  auditActionLabel(action: AuditAction): string;
  auditTimestamp(iso: string): string;
  handleRowClick(group: StudentGroup): void;
  readonly groupedStudents: StudentGroup[];
  readonly clockedInCount: number;
  readonly unresolvedAttentionItems: NeedsAttentionRecord[];
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
    needsAttentionItems: [],
    auditLog: [],
    expandedId: null,

    attentionTypeLabel(type: NeedsAttentionType): string {
      return ATTENTION_TYPE_LABELS[type] ?? type;
    },

    auditActionLabel(action: AuditAction): string {
      return ACTION_LABELS[action] ?? action;
    },

    auditTimestamp(iso: string): string {
      return new Date(iso).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    },

    async resolveAttention(id: string) {
      const items = this.needsAttentionItems as NeedsAttentionRecord[];
      const item = items.find(i => i.id === id);
      if (!item) return;
      try {
        await updateNeedsAttentionItem(id, { is_resolved: true });
        item.is_resolved = true;
        item.resolved_at = new Date().toISOString();
        void logAudit('needs_attention_resolved', {
          targetId: item.id,
          targetName: item.student_name,
          description: `Resolved "${this.attentionTypeLabel(item.type)}" for ${toTitleCase(item.student_name)}`,
        });
      } catch {
        app().showSnackbar('Failed to resolve item', 'error');
      }
    },

    async resolveAllAttention() {
      const unresolved = (this.needsAttentionItems as NeedsAttentionRecord[]).filter(i => !i.is_resolved);
      if (unresolved.length === 0) return;
      try {
        await Promise.all(unresolved.map(i => updateNeedsAttentionItem(i.id, { is_resolved: true })));
        const now = new Date().toISOString();
        for (const item of unresolved) {
          item.is_resolved = true;
          item.resolved_at = now;
        }
        void logAudit('needs_attention_resolve_all', {
          description: `Resolved ${unresolved.length} Needs Attention item${unresolved.length === 1 ? '' : 's'}`,
        });
      } catch {
        app().showSnackbar('Failed to resolve items', 'error');
      }
    },

    get clockedInCount(): number {
      return new Set(
        (this.currentStudents as TimeclockStatusEntry[])
          .filter(s => s.is_clocked_in)
          .map(s => s.homebase_id)
      ).size;
    },

    get unresolvedAttentionItems(): NeedsAttentionRecord[] {
      return (this.needsAttentionItems as NeedsAttentionRecord[]).filter(i => !i.is_resolved);
    },

    async load() {
      app().showLoading();
      try {
        const [employees, students, lastSync, overviewStats, deHours, allGrades, needsAttentionItems, auditLog] = await Promise.all([
          fetchEmployeeTable(),
          fetchCurrentStudents(),
          fetchLastSync(),
          fetchOverviewStats(),
          fetchDeHoursByDate(),
          fetchAllGrades(),
          fetchNeedsAttentionItems(),
          fetchAuditLog(),
        ]);
        this.employees = employees;
        this.currentStudents = students;
        this.lastSync = lastSync;
        this.overviewStats = overviewStats;
        this.deHours = deHours;
        this.allGrades = allGrades;
        this.needsAttentionItems = needsAttentionItems;
        this.auditLog = auditLog;

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

    handleRowClick(group: StudentGroup) {
      // Accordion: collapse if already open, otherwise open only this row.
      this.expandedId = this.expandedId === group.homebase_id ? null : group.homebase_id;
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
            open: this.expandedId === homebase_id,
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

// ── Punch Photos Modal ─────────────────────────────────────────────────────

export function punchPhotosModalData() {
  return {
    open: false,
    loading: false,
    photos: [] as Array<{ label: string; url: string }>,

    async openModal(homebaseId: number, clockIn: string) {
      this.open = true;
      this.loading = true;
      this.photos = [];
      const dialog = document.getElementById('punch-photos-modal') as HTMLDialogElement;
      dialog?.showModal();

      try {
        const data = await fetchPunchPhotos(homebaseId, clockIn);
        const items: Array<{ label: string; path: string | null }> = [];
        if (data) {
          items.push({ label: 'Clock In', path: data.clock_in_photo_path });
          items.push({ label: 'Clock Out', path: data.clock_out_photo_path });
          data.timeclock_breaks.forEach((b, i) => {
            const n = data.timeclock_breaks.length > 1 ? ` ${i + 1}` : '';
            items.push({ label: `Break${n} Start`, path: b.break_start_photo_path });
            items.push({ label: `Break${n} End`, path: b.break_end_photo_path });
          });
        }
        const resolved = await Promise.all(
          items
            .filter((item): item is { label: string; path: string } => !!item.path)
            .map(async item => ({ label: item.label, url: await getPunchPhotoUrl(item.path) }))
        );
        this.photos = resolved.filter((p): p is { label: string; url: string } => !!p.url);
      } finally {
        this.loading = false;
      }
    },

    closeModal() {
      this.open = false;
      this.photos = [];
      const dialog = document.getElementById('punch-photos-modal') as HTMLDialogElement;
      dialog?.close();
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
        const synced_by = `${emp.name}`;
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
        await clearStudentPassword(this.employeeId);
        void logAudit('password_clear', {
          targetId: this.employeeId,
          targetName: this.employeeName,
          description: `Reset password for ${toTitleCase(this.employeeName)}`,
        });
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
        void logAudit('role_change', {
          targetId: this.homebaseId,
          targetName: trimmed,
          description: `Updated profile for ${toTitleCase(trimmed)} (role: ${this.roles.find(r => r.id === this.roleId)?.role_name ?? this.roleId})`,
        });
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
        void logAudit('student_removed', {
          targetId: this.homebaseId,
          targetName: this.studentName,
          description: `Removed ${this.displayName} from the roster`,
        });
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
        void logAudit('timeclock_edit', {
          targetId: homebaseId,
          description: `Edited ${field === 'clock_in' ? 'clock-in' : 'clock-out'} time for ${date}`,
          metadata: { field, date, newValue: newDate.toISOString() },
        });
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

// ── Grade Row (in-place edit for project, category, score) ───────────────────

export function gradeRowData() {
  return {
    editField: null as null | 'project' | 'category' | 'score',
    editValue: '',
    saving: false,

    startEdit(field: 'project' | 'category' | 'score', current: string | number) {
      this.editValue = String(current);
      this.editField = field;
    },

    cancel() {
      this.editField = null;
      this.editValue = '';
    },

    async save(homebaseId: number, grade: GradeEntry) {
      const field = this.editField;
      if (!field) return;

      let updates: Partial<{ project: string; category: string; score: number }>;
      if (field === 'score') {
        const score = parseFloat(this.editValue);
        if (isNaN(score) || score < 0) { this.cancel(); return; }
        if (score === grade.score) { this.cancel(); return; }
        updates = { score };
      } else {
        const value = this.editValue.trim();
        if (!value || value === grade[field]) { this.cancel(); return; }
        updates = { [field]: value };
      }

      this.saving = true;
      app().showLoading();
      try {
        await updateGradeEntry(homebaseId, { date: grade.date, project: grade.project, category: grade.category }, updates);
        void logAudit('grade_update', {
          targetId: homebaseId,
          description: `Edited ${field} on a grade entry (${grade.project} / ${grade.category}, ${grade.date})`,
          metadata: { field, date: grade.date, before: grade[field], after: updates[field] },
        });
        this.cancel();
        await (Alpine.store('mgmt') as MgmtStore).load();
      } catch {
        app().showSnackbar('Could not update grade. Please try again.', 'error');
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
    type: 'timepunch' as 'timepunch' | 'de_hours' | 'grades',
    loading: false,
    error: '',
    date: todayIso(),
    clockIn: '',
    clockOut: '',
    breakStart: '',
    breakEnd: '',
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

    // Read-only worked-hours calculation: (clock out − clock in) − break duration.
    get workedHours() {
      const toMin = (t: string): number | null => {
        if (!t) return null;
        const [h, m] = t.split(':').map(Number);
        if (isNaN(h) || isNaN(m)) return null;
        return h * 60 + m;
      };
      const ci = toMin(this.clockIn);
      const co = toMin(this.clockOut);
      if (ci == null || co == null || co <= ci) return '';
      let worked = co - ci;
      const bs = toMin(this.breakStart);
      const be = toMin(this.breakEnd);
      if (bs != null && be != null && be > bs) worked -= be - bs;
      if (worked <= 0) return '';
      return (worked / 60).toFixed(2);
    },

    init() {
      window.addEventListener('open-add-entry', (e: Event) => {
        const { id, name } = (e as CustomEvent<{ id: number; name: string }>).detail;
        this.homebaseId = id;
        this.studentName = name;
        this.type = 'timepunch';
        this.error = '';
        this.date = todayIso();
        this.clockIn = '';
        this.clockOut = '';
        this.breakStart = '';
        this.breakEnd = '';
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
      if (this.type === 'timepunch') {
        if (!this.date || !this.clockIn || !this.clockOut) {
          this.error = 'Date, Clock In, and Clock Out are required.';
          return;
        }
        const toIso = (t: string): string => {
          const [h, m] = t.split(':').map(Number);
          const [y, mo, d] = this.date.split('-').map(Number);
          return new Date(y, mo - 1, d, h, m).toISOString();
        };
        const clockInIso = toIso(this.clockIn);
        const clockOutIso = toIso(this.clockOut);
        if (clockOutIso <= clockInIso) {
          this.error = 'Clock Out must be after Clock In.';
          return;
        }
        const hasBreakStart = !!this.breakStart;
        const hasBreakEnd = !!this.breakEnd;
        if (hasBreakStart !== hasBreakEnd) {
          this.error = 'Both Break Start and Break End are required to record a break.';
          return;
        }
        let breakStartIso: string | null = null;
        let breakEndIso: string | null = null;
        if (hasBreakStart && hasBreakEnd) {
          breakStartIso = toIso(this.breakStart);
          breakEndIso = toIso(this.breakEnd);
          if (breakEndIso <= breakStartIso) {
            this.error = 'Break End must be after Break Start.';
            return;
          }
          if (breakStartIso < clockInIso || breakEndIso > clockOutIso) {
            this.error = 'Break must fall within Clock In and Clock Out.';
            return;
          }
        }
        this.loading = true;
        app().showLoading();
        try {
          await addTimeclockEntry({
            homebase_id: this.homebaseId,
            date: this.date,
            clock_in: clockInIso,
            clock_out: clockOutIso,
            break_start: breakStartIso,
            break_end: breakEndIso,
          });
          void logAudit('timeclock_add', {
            targetId: this.homebaseId,
            targetName: this.studentName,
            description: `Added a timeclock entry for ${this.date} (${this.workedHours} hrs)`,
            metadata: {
              id: this.homebaseId,
              name: this.studentName,
              date: this.date,
              clock_in: clockInIso,
              clock_out: clockOutIso,
              break_start: breakStartIso,
              break_end: breakEndIso,
              worked_hours: this.workedHours,
            },
          });
          this.closeDialog();
          app().showSnackbar('Timepunch added.', 'success');
          const mgmt = Alpine.store('mgmt') as MgmtStore;
          await mgmt.load();
        } catch (err: unknown) {
          this.error = err instanceof Error ? err.message : 'Could not save. Please try again.';
        } finally {
          this.loading = false;
          app().hideLoading();
        }
      } else if (this.type === 'de_hours') {
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
          const mgmt = Alpine.store('mgmt') as MgmtStore;
          await mgmt.load();
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
      if (!/^\d{6}$/.test(this.pin)) {
        this.error = 'PIN must be exactly 6 digits (numbers only).';
        return;
      }
      this.loading = true;
      this.error = '';
      try {
        await setStudentPin(this.employeeId, this.pin);
        void logAudit('pin_reset', {
          targetId: this.employeeId,
          targetName: this.employeeName,
          description: `Set PIN for ${toTitleCase(this.employeeName)}`,
        });
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
