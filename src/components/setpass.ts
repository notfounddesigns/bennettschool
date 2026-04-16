import Alpine from 'alpinejs';
import { setEmployeePassword } from '../lib/api';
import type { AppStore } from '../lib/store';
import type { DashboardStore } from './dashboard';
import type { MgmtStore } from './mgmt';

export function setpassData() {
  return {
    newPassword: '',
    confirmPassword: '',
    error: '',
    success: '',
    loading: false,

    async submit() {
      this.error = '';
      this.success = '';

      const np = this.newPassword as string;
      const cp = this.confirmPassword as string;

      if (np.length < 8) { this.error = 'Password must be at least 8 characters.'; return; }
      if (np !== cp)     { this.error = 'Passwords do not match.'; return; }

      const store = Alpine.store('app') as AppStore;
      const emp = store.currentEmployee;
      if (!emp) {
        this.error = 'Session expired. Please sign in again.';
        store.showScreen('login');
        return;
      }

      this.loading = true;
      try {
        const fullName = `${emp.first_name} ${emp.last_name}`;
        await setEmployeePassword(emp.id, fullName, np);
        this.success = 'Password saved! Taking you to your dashboard…';

        setTimeout(async () => {
          const isManager = emp.job.level === 'Manager';
          if (isManager) {
            store.showScreen('mgmt');
            await (Alpine.store('mgmt') as MgmtStore).load();
          } else {
            store.showScreen('dashboard');
            await (Alpine.store('dashboard') as DashboardStore).load(emp.id);
          }
        }, 1200);
      } catch (e: unknown) {
        this.error = e instanceof Error ? e.message : 'Network error. Please try again.';
      } finally {
        this.newPassword = '';
        this.confirmPassword = '';
        this.loading = false;
      }
    },
  };
}
