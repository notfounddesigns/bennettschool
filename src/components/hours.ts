import Alpine from 'alpinejs';
import {
  fetchHoursByProfile,
  fetchTimeclockHoursSinceJuly1,
  fetchDuplicateHours,
  type HoursByProfileRow,
  type TimeclockHoursSinceJuly1Row,
  type DuplicateHoursRow,
} from '../lib/api';
import type { AppStore } from '../lib/store';

function app(): AppStore {
  return Alpine.store('app') as AppStore;
}

const TYPE_LABELS: Record<number, string> = {
  1: 'In Person',
  2: 'DE',
  3: 'In Person',
};

export function hoursTabData() {
  return {
    subTab: 'byProfile' as 'byProfile' | 'sinceJuly1' | 'duplicates',
    loaded: false,
    loading: false,

    byProfile: [] as HoursByProfileRow[],
    sinceJuly1: [] as TimeclockHoursSinceJuly1Row[],
    duplicates: [] as DuplicateHoursRow[],

    async load() {
      if (this.loaded || this.loading) return;
      this.loading = true;
      app().showLoading();
      try {
        const [byProfile, sinceJuly1, duplicates] = await Promise.all([
          fetchHoursByProfile(),
          fetchTimeclockHoursSinceJuly1(),
          fetchDuplicateHours(),
        ]);
        this.byProfile = byProfile;
        this.sinceJuly1 = sinceJuly1;
        this.duplicates = duplicates;
        this.loaded = true;
      } catch {
        app().showSnackbar('Failed to load hours data', 'error');
      } finally {
        this.loading = false;
        app().hideLoading();
      }
    },

    typeLabel(typeId: number): string {
      return TYPE_LABELS[typeId] ?? `Type ${typeId}`;
    },
  };
}
