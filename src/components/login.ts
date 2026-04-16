import Alpine from 'alpinejs';
import { loginEmployee } from '../lib/api';
import type { AppStore } from '../lib/store';
import type { DashboardStore } from './dashboard';
import type { MgmtStore } from './mgmt';

export function loginData() {
  return {
    name: '',
    password: '',
    error: '',
    loading: false,

    async submit() {
      this.error = '';
      const name = (this.name as string).trim();
      const password = this.password as string;

      if (!name) { this.error = 'Please enter your first and last name.'; return; }
      if (!password) { this.error = 'Please enter your password.'; return; }

      const parts = name.split(' ').filter(Boolean);
      if (parts.length < 2) { this.error = 'Please enter your first and last name.'; return; }

      const [first, last] = parts;
      this.loading = true;

      try {
        const data = await loginEmployee(first, last, password);
        const store = Alpine.store('app') as AppStore;
        store.setEmployee(data.employee);

        if (data.result === 'first_time') {
          store.showScreen('setpass');
          return;
        }

        const isManager = data.employee.job.level === 'Manager';
        if (isManager) {
          store.showScreen('mgmt');
          await (Alpine.store('mgmt') as MgmtStore).load();
        } else {
          store.showScreen('dashboard');
          await (Alpine.store('dashboard') as DashboardStore).load(data.employee.id);
        }
      } catch (e: unknown) {
        this.error = e instanceof Error ? e.message : 'Network error. Please try again.';
      } finally {
        this.password = '';
        this.loading = false;
      }
    },
  };
}
