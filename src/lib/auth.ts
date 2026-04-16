import Alpine from 'alpinejs';
import { validateCachedEmployee } from './api';
import type { AppStore } from './store';
import type { DashboardStore } from '../components/dashboard';
import type { MgmtStore } from '../components/mgmt';

function store(): AppStore {
  return Alpine.store('app') as AppStore;
}

export function handleLogout(): void {
  store().clearEmployee();
  store().showScreen('login');
}

export async function restoreSession(): Promise<boolean> {
  const raw = localStorage.getItem('employee');
  if (!raw) return false;

  try {
    const emp = JSON.parse(raw);
    const valid = await validateCachedEmployee(emp.id);
    if (!valid) {
      localStorage.removeItem('employee');
      return false;
    }
    store().setEmployee(emp);

    const isManager = emp.job?.level === 'Manager';
    if (isManager) {
      store().showScreen('mgmt');
      await (Alpine.store('mgmt') as MgmtStore).load();
    } else {
      store().showScreen('dashboard');
      await (Alpine.store('dashboard') as DashboardStore).load(emp.id);
    }
    return true;
  } catch {
    localStorage.removeItem('employee');
    return false;
  }
}
