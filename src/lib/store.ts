import type { Student } from './api';
import { getInitials, toTitleCase } from './helpers';

export type Screen = 'login' | 'setpass' | 'dashboard' | 'mgmt';
export type SnackbarType = 'default' | 'success' | 'error';

export interface SnackbarState {
  message: string;
  type: SnackbarType;
  visible: boolean;
}

export interface AppStore {
  currentEmployee: Student | null;
  // When a manager is "viewing as" a student, this holds that student. The
  // real logged-in manager stays in currentEmployee (and localStorage) so the
  // session is never overwritten. null = not impersonating.
  impersonating: Student | null;
  screen: Screen;
  snackbar: SnackbarState;
  globalLoading: boolean;
  readonly avatarInitials: string;
  readonly displayName: string;
  readonly isImpersonating: boolean;
  // The identity the UI should reflect: the impersonated student if any,
  // otherwise the logged-in employee.
  readonly activeEmployee: Student | null;

  setEmployee(emp: Student): void;
  clearEmployee(): void;
  viewAsStudent(student: Student): void;
  exitImpersonation(): void;
  showScreen(s: Screen): void;
  showSnackbar(message: string, type?: SnackbarType, duration?: number): void;
  showLoading(): void;
  hideLoading(): void;
}

let _snackbarTimer: ReturnType<typeof setTimeout> | null = null;

export function createAppStore(): AppStore {
  return {
    currentEmployee: null,
    impersonating: null,
    screen: 'login' as Screen,
    globalLoading: false,
    snackbar: {
      message: '',
      type: 'default' as SnackbarType,
      visible: false,
    },

    get activeEmployee(): Student | null {
      return this.impersonating ?? this.currentEmployee;
    },

    get isImpersonating(): boolean {
      return this.impersonating !== null;
    },

    get avatarInitials(): string {
      if (!this.activeEmployee) return '??';
      const name = toTitleCase(
        `${this.activeEmployee.name}`,
      );
      return getInitials(name);
    },

    get displayName(): string {
      if (!this.activeEmployee) return '';
      return toTitleCase(`${this.activeEmployee.name}`);
    },

    setEmployee(emp: Student) {
      this.currentEmployee = emp;
      localStorage.setItem('employee', JSON.stringify(emp));
    },

    clearEmployee() {
      this.currentEmployee = null;
      this.impersonating = null;
      localStorage.removeItem('employee');
    },

    // Enter "view as student" mode. Does not touch currentEmployee/localStorage,
    // so a page refresh drops back to the manager's own session.
    viewAsStudent(student: Student) {
      this.impersonating = student;
      this.screen = 'dashboard';
    },

    exitImpersonation() {
      this.impersonating = null;
      this.screen = 'mgmt';
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
