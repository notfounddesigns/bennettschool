import Alpine from 'alpinejs';
import { fetchCompareData, type CompareRow } from '../lib/api';
import type { AppStore } from '../lib/store';

function app(): AppStore {
  return Alpine.store('app') as AppStore;
}

export function compareTableData() {
  return {
    rows: [] as CompareRow[],
    loading: false,
    search: '',
    sortCol: 'date' as string,
    sortDir: 'desc' as 'asc' | 'desc',

    async load() {
      this.loading = true;
      app().showLoading();
      try {
        this.rows = await fetchCompareData();
      } catch {
        app().showSnackbar('Failed to load compare data', 'error');
      } finally {
        this.loading = false;
        app().hideLoading();
      }
    },

    toggleSort(col: string) {
      if (this.sortCol === col) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortCol = col;
        this.sortDir = 'asc';
      }
    },

    get sortedRows(): CompareRow[] {
      const col = this.sortCol;
      const numericCols = ['internal_hours', 'external_hours', 'diff'];
      return [...this.rows].sort((a: any, b: any) => {
        const va = numericCols.includes(col) ? (a[col] as number) : a[col];
        const vb = numericCols.includes(col) ? (b[col] as number) : b[col];
        const cmp = typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : String(va).localeCompare(String(vb));
        return this.sortDir === 'asc' ? cmp : -cmp;
      });
    },

    get filteredRows(): CompareRow[] {
      const q = this.search.trim().toLowerCase();
      if (!q) return this.sortedRows;
      return this.sortedRows.filter(r => r.name.toLowerCase().includes(q));
    },

    diffColor(diff: number): string {
      if (Math.abs(diff) < 0.1) return 'text-sage';
      if (diff > 0) return 'text-blush';
      return 'text-app-error';
    },

    sortIcon(col: string): string {
      if (this.sortCol !== col) return '⇅';
      return this.sortDir === 'asc' ? '↑' : '↓';
    },

    sortIconClass(col: string): string {
      return this.sortCol === col ? 'text-blush' : 'opacity-30';
    },
  };
}
