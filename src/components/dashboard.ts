import Alpine from 'alpinejs';
import { fetchStudentDashboard, type StudentDashboard, type HourEntry, type DeEntry, type GradeEntry } from '../lib/api';
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
    get inPersonRowsHtml() {
      const dash = Alpine.store('dashboard') as DashboardStore;
      return renderInPersonRows(dash.data?.inPersonHrsList ?? []);
    },
    get deRowsHtml() {
      const dash = Alpine.store('dashboard') as DashboardStore;
      return renderDeRows(dash.data?.deHrsList ?? []);
    },
    get gradesHtml() {
      const dash = Alpine.store('dashboard') as DashboardStore;
      return renderGradesTable(dash.data?.grades ?? []);
    },
  };
}

// ── HTML render helpers ───────────────────────────────────────────────────

export function renderInPersonRows(list: HourEntry[]): string {
  if (list.length === 0) {
    return '<li class="empty-state text-center py-8 text-muted text-sm">No in person hours recorded yet.</li>';
  }
  return list
    .map(
      e => `
      <li class="flex justify-between items-center py-[11px] border-b border-app-border text-[13px] gap-2 last:border-b-0">
        <div class="flex flex-col gap-0.5">
          <span class="font-medium text-charcoal">${formatSimpleDate(e.date)}</span>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <span class="text-xs font-semibold text-muted bg-cream px-2.5 py-0.5 rounded-full border border-app-border">${e.hours}h</span>
        </div>
      </li>`,
    )
    .join('');
}

export function renderDeRows(list: DeEntry[]): string {
  if (list.length === 0) {
    return '<li class="empty-state text-center py-8 text-muted text-sm">No DE hours recorded yet.</li>';
  }
  return list
    .map(
      e => `
      <li class="flex justify-between items-center py-[11px] border-b border-app-border text-[13px] gap-2 last:border-b-0">
        <div class="flex flex-col gap-0.5">
          <span class="font-medium text-charcoal">${formatSimpleDate(e.date)}</span>
          <span class="text-muted text-xs">${e.module} · ${e.platform}</span>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <span class="text-xs font-semibold text-muted bg-cream px-2.5 py-0.5 rounded-full border border-app-border">${e.hours}h</span>
          <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full tracking-wide ${e.verified ? 'bg-sage-light text-[#2D6A55]' : 'bg-[#FEF3C7] text-[#92400E]'}">${e.verified ? 'Verified' : 'Unverified'}</span>
        </div>
      </li>`,
    )
    .join('');
}

export function renderGradesTable(grades: GradeEntry[]): string {
  if (grades.length === 0) {
    return '<p class="text-center py-8 text-muted text-sm">No grades recorded yet.</p>';
  }

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
        <td class="px-4 py-2.5 text-[13px] text-muted border-b border-app-border last:border-b-0">${g.notes ?? '—'}</td>
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
