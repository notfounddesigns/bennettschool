import Alpine from 'alpinejs';
import { fetchStudentDashboard, changeStudentPin, setStudentPin, studentHasPin, logAuditEvent, type StudentDashboard, type HourEntry, type DeEntry, type GradeEntry } from '../lib/api';
import { fmtFloat, formatSimpleDate, scoreToLetter } from '../lib/helpers';
import type { AppStore } from '../lib/store';

function app(): AppStore {
  return Alpine.store('app') as AppStore;
}

// ── Store ─────────────────────────────────────────────────────────────────

export interface DashboardStore {
  loading: boolean;
  data: StudentDashboard | null;
  error: string;
  load(employeeId: number): Promise<void>;
  readonly hrsRemaining: string;
  readonly formattedInPersonHrs: string;
  readonly formattedDeHrs: string;
  readonly formattedTotalHrs: string;
}

export function createDashboardStore(): DashboardStore {
  return {
    loading: false,
    data: null,
    error: '',

    async load(employeeId: number) {
      app().showLoading();
      this.error = '';
      try {
        this.data = await fetchStudentDashboard(employeeId);
      } catch {
        this.error = 'Failed to load dashboard data.';
      } finally {
        app().hideLoading();
      }
    },

    get hrsRemaining() {
      if (!this.data) return '— h remaining';
      return `${fmtFloat(this.data.hrsToGrad - this.data.totalHrsAll)} h remaining`;
    },

    get formattedInPersonHrs() {
      return this.data ? fmtFloat(this.data.inPersonHrs) : '—';
    },

    get formattedDeHrs() {
      return this.data ? fmtFloat(this.data.deHrs) : '—';
    },

    get formattedTotalHrs() {
      return this.data ? fmtFloat(this.data.totalHrsAll) : '—';
    },
  };
}

// ── Alpine.data component for dashboard display (x-html rendering) ────────

export function dashboardDisplayData() {
  return {
    activeTab: 'hours' as 'hours' | 'grades',

    get hoursHtml() {
      const dash = Alpine.store('dashboard') as DashboardStore;
      return renderHoursTable(dash.data?.inPersonHrsList ?? [], dash.data?.deHrsList ?? []);
    },
    get gradesHtml() {
      const dash = Alpine.store('dashboard') as DashboardStore;
      return renderGradesTable(dash.data?.grades ?? []);
    },
  };
}

// ── HTML render helpers ───────────────────────────────────────────────────

interface CombinedHourRow {
  date: string;
  type: 'In Person' | 'DE';
  hours: number;
}

export function renderHoursTable(inPerson: HourEntry[], de: DeEntry[]): string {
  const combined: CombinedHourRow[] = [
    ...inPerson.map(e => ({ date: e.date, type: 'In Person' as const, hours: e.hours })),
    ...de.map(e => ({ date: e.date, type: 'DE' as const, hours: e.hours })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (combined.length === 0) {
    return '<p class="text-center py-8 text-muted text-sm">No hours recorded in the last 7 days.</p>';
  }

  const rows = combined
    .map(
      e => `<tr>
        <td class="px-4 py-2.5 text-[13px] text-charcoal border-b border-app-border">${formatSimpleDate(e.date)}</td>
        <td class="px-4 py-2.5 text-[13px] border-b border-app-border">
          <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full tracking-wide ${e.type === 'In Person' ? 'bg-sage-light text-[#2D6A55]' : 'bg-[#FEF3C7] text-[#92400E]'}">${e.type}</span>
        </td>
        <td class="px-4 py-2.5 text-[13px] text-charcoal border-b border-app-border">${e.hours}h</td>
      </tr>`,
    )
    .join('');

  return `<table class="w-full border-collapse">
    <thead>
      <tr>
        <th class="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted px-4 py-2.5 text-left border-b border-app-border">Date</th>
        <th class="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted px-4 py-2.5 text-left border-b border-app-border">Type</th>
        <th class="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted px-4 py-2.5 text-left border-b border-app-border">Hours</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ── Alpine.data component for the student "Change PIN" dialog ─────────────

export function changePinData() {
  return {
    hasPin: true,          // true → "change" flow (needs current PIN); false → first-time "create" flow
    checking: true,        // resolving hasPin after the dialog opens
    currentPin: '',
    newPin: '',
    confirmPin: '',
    loading: false,
    error: '',

    init() {
      window.addEventListener('open-change-pin', () => {
        this.currentPin = '';
        this.newPin = '';
        this.confirmPin = '';
        this.error = '';
        this.checking = true;
        this.hasPin = true;
        const dialog = document.getElementById('change-pin-dialog') as HTMLDialogElement;
        dialog?.showModal();
        void this.resolveHasPin();
      });
    },

    async resolveHasPin() {
      const emp = app().currentEmployee;
      if (!emp) { this.checking = false; return; }
      try {
        this.hasPin = await studentHasPin(emp.homebase_id);
      } catch {
        // Assume they have one; the server still validates the current PIN.
        this.hasPin = true;
      } finally {
        this.checking = false;
      }
    },

    closeDialog() {
      const dialog = document.getElementById('change-pin-dialog') as HTMLDialogElement;
      dialog?.close();
    },

    async submit() {
      if (this.hasPin && !/^\d{6}$/.test(this.currentPin)) {
        this.error = 'PINs must be exactly 6 digits (numbers only).';
        return;
      }
      if (!/^\d{6}$/.test(this.newPin)) {
        this.error = 'PINs must be exactly 6 digits (numbers only).';
        return;
      }
      if (this.newPin !== this.confirmPin) {
        this.error = 'New PIN and confirmation do not match.';
        return;
      }
      const emp = app().currentEmployee;
      if (!emp) return;

      this.loading = true;
      this.error = '';
      try {
        if (this.hasPin) {
          await changeStudentPin(emp.homebase_id, this.currentPin, this.newPin);
        } else {
          await setStudentPin(emp.homebase_id, this.newPin);
        }
        void logAuditEvent({
          actor_id: emp.homebase_id,
          actor_name: emp.name,
          action: 'pin_reset',
          target_id: emp.homebase_id,
          target_name: emp.name,
          description: `${emp.name} ${this.hasPin ? 'changed' : 'created'} their timeclock PIN`,
        }).catch(() => {});
        this.closeDialog();
        app().showSnackbar(this.hasPin ? 'Your PIN has been updated.' : 'Your PIN has been created.', 'success');
      } catch (e: unknown) {
        this.error = e instanceof Error ? e.message : 'Failed to save PIN. Please try again.';
      } finally {
        this.loading = false;
      }
    },
  };
}

export function renderGradesTable(grades: GradeEntry[]): string {
  if (grades.length === 0) return '<p class="text-center py-8 text-muted text-sm">No grades recorded yet.</p>';

  const rows = grades
    .map(g => {
      const letter = scoreToLetter(g.score);
      return `<tr>
        <td class="px-4 py-2.5 text-[13px] text-charcoal border-b border-app-border">${formatSimpleDate(g.date)}</td>
        <td class="px-4 py-2.5 text-[13px] text-charcoal border-b border-app-border">${g.project}</td>
        <td class="px-4 py-2.5 text-[13px] text-charcoal border-b border-app-border">${g.category}</td>
        <td class="px-4 py-2.5 text-[13px] text-charcoal border-b border-app-border">
          <div class="flex items-center gap-2">
            <span class="grade-chip grade-${letter.toLowerCase()} flex items-center justify-center w-8 h-8 rounded-full text-[13px] font-bold">${letter}</span>
            <span class="text-muted text-xs">${g.score}</span>
          </div>
        </td>
        <td class="px-4 py-2.5 text-[13px] text-muted border-b border-app-border">${g.notes ?? '—'}</td>
      </tr>`;
    })
    .join('');

  return `<table class="w-full border-collapse">
    <thead>
      <tr>
        <th class="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted px-4 py-2.5 text-left border-b border-app-border">Date</th>
        <th class="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted px-4 py-2.5 text-left border-b border-app-border">Project</th>
        <th class="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted px-4 py-2.5 text-left border-b border-app-border">Category</th>
        <th class="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted px-4 py-2.5 text-left border-b border-app-border">Score</th>
        <th class="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted px-4 py-2.5 text-left border-b border-app-border">Notes</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}
