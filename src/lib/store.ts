import type { Employee } from './api';
import { getInitials, toTitleCase } from './helpers';

export type Screen = 'login' | 'setpass' | 'dashboard' | 'mgmt';
export type SnackbarType = 'default' | 'success' | 'error';

export interface SnackbarState {
  message: string;
  type: SnackbarType;
  visible: boolean;
}

export interface AppStore {
  currentEmployee: Employee | null;
  screen: Screen;
  snackbar: SnackbarState;
  globalLoading: boolean;
  readonly avatarInitials: string;
  readonly displayName: string;

  setEmployee(emp: Employee): void;
  clearEmployee(): void;
  showScreen(s: Screen): void;
  showSnackbar(message: string, type?: SnackbarType, duration?: number): void;
  showLoading(): void;
  hideLoading(): void;
}

let _snackbarTimer: ReturnType<typeof setTimeout> | null = null;

export function createAppStore(): AppStore {
  return {
    currentEmployee: null,
    screen: 'login' as Screen,
    globalLoading: false,
    snackbar: {
      message: '',
      type: 'default' as SnackbarType,
      visible: false,
    },

    get avatarInitials(): string {
      if (!this.currentEmployee) return '??';
      const name = toTitleCase(
        `${this.currentEmployee.first_name} ${this.currentEmployee.last_name}`,
      );
      return getInitials(name);
    },

    get displayName(): string {
      if (!this.currentEmployee) return '';
      return toTitleCase(`${this.currentEmployee.first_name} ${this.currentEmployee.last_name}`);
    },

    setEmployee(emp: Employee) {
      this.currentEmployee = emp;
      localStorage.setItem('employee', JSON.stringify(emp));
    },

    clearEmployee() {
      this.currentEmployee = null;
      localStorage.removeItem('employee');
    },

    showScreen(s: Screen) {
      this.screen = s;
    },

    showSnackbar(message: string, type: SnackbarType = 'default', duration = 3000) {
      if (_snackbarTimer) clearTimeout(_snackbarTimer);
      this.snackbar.message = message;
      this.snackbar.type = type;
      this.snackbar.visible = true;
      _snackbarTimer = setTimeout(() => {
        this.snackbar.visible = false;
      }, duration);
    },

    showLoading() {
      this.globalLoading = true;
    },

    hideLoading() {
      this.globalLoading = false;
    },
  };
}
