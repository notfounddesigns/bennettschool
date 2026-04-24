import {
  getStudentByPin,
  getActiveSession,
  clockIn,
  clockOut,
  startBreak,
  endBreak,
  type TimeclockStudent,
  type ActiveSession,
} from '../lib/api';
import { getInitials, formatTime } from '../lib/helpers';

type ClockState = 'idle' | 'loading' | 'actions' | 'success' | 'error';
type ClockStatus = 'clocked_out' | 'clocked_in' | 'on_break';

const INACTIVITY_MS = 7000;

export function timeclockData() {
  return {
    pin: '',
    state: 'idle' as ClockState,
    student: null as TimeclockStudent | null,
    session: null as ActiveSession | null,
    actionLoading: false,
    successMsg: '',
    errorMsg: '',

    currentTime: '',
    currentDate: '',

    // Unified countdown bar — used before every reset to PIN pad
    showingCountdown: false,
    countdownProgress: 100,

    _clockInterval: null as ReturnType<typeof setInterval> | null,
    _inactivityTimer: null as ReturnType<typeof setTimeout> | null,
    _countdownInterval: null as ReturnType<typeof setInterval> | null,

    init() {
      const tick = () => {
        const now = new Date();
        this.currentTime = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        this.currentDate = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
      };
      tick();
      this._clockInterval = setInterval(tick, 1000);
    },

    destroy() {
      if (this._clockInterval) clearInterval(this._clockInterval);
      this._clearCountdown();
      this._clearInactivity();
    },

    // ── Computed ────────────────────────────────────────────────────────────

    get clockStatus(): ClockStatus {
      if (!this.session) return 'clocked_out';
      if (this.session.activeBreak) return 'on_break';
      return 'clocked_in';
    },

    get studentInitials(): string {
      return this.student ? getInitials(this.student.name) : '';
    },

    get statusLabel(): string {
      if (this.clockStatus === 'clocked_out') return 'Currently clocked out';
      if (this.clockStatus === 'on_break') {
        const t = formatTime(new Date(this.session!.activeBreak!.break_start));
        return `On break since ${t}`;
      }
      const t = formatTime(new Date(this.session!.clock_in));
      return `Clocked in since ${t}`;
    },

    // ── Unified countdown ───────────────────────────────────────────────────
    // Drives the draining progress bar shown before every reset to PIN pad.

    _startCountdown(ms: number, onComplete: () => void) {
      this._clearCountdown();
      this.showingCountdown = true;
      this.countdownProgress = 100;
      let elapsed = 0;
      const step = 50;
      this._countdownInterval = setInterval(() => {
        elapsed += step;
        this.countdownProgress = Math.max(0, 100 - (elapsed / ms) * 100);
        if (elapsed >= ms) {
          this._clearCountdown();
          onComplete();
        }
      }, step);
    },

    _clearCountdown() {
      if (this._countdownInterval) { clearInterval(this._countdownInterval); this._countdownInterval = null; }
      this.showingCountdown = false;
      this.countdownProgress = 100;
    },

    // ── Inactivity timer (actions screen only) ──────────────────────────────

    _startInactivity() {
      this._clearInactivity();
      this._inactivityTimer = setTimeout(() => {
        this._inactivityTimer = null;
        this._startCountdown(3000, () => this.reset());
      }, INACTIVITY_MS);
    },

    _clearInactivity() {
      if (this._inactivityTimer) { clearTimeout(this._inactivityTimer); this._inactivityTimer = null; }
    },

    // ── PIN pad ─────────────────────────────────────────────────────────────

    appendDigit(d: string) {
      if (this.pin.length >= 4 || this.state === 'loading') return;
      this.pin += d;
      if (this.pin.length === 4) this.lookupPin();
    },

    deleteDigit() {
      if (this.state !== 'idle') return;
      this.pin = this.pin.slice(0, -1);
    },

    onKeydown(e: KeyboardEvent) {
      if (this.state === 'success' || this.state === 'error') return;
      if (this.state === 'actions') {
        if (e.key === 'Escape') this.reset();
        return;
      }
      if (e.key >= '0' && e.key <= '9') this.appendDigit(e.key);
      else if (e.key === 'Backspace') this.deleteDigit();
      else if (e.key === 'Escape') this.reset();
    },

    // ── PIN lookup ──────────────────────────────────────────────────────────

    async lookupPin() {
      this.state = 'loading';
      try {
        const student = await getStudentByPin(this.pin);
        console.log(student);
        if (!student) {
          this.showError('PIN not recognized. Please try again.');
          return;
        }
        const session = await getActiveSession(student.homebase_id);
        this.student = student;
        this.session = session;
        this.state = 'actions';
        this._startInactivity();
      } catch {
        this.showError('Something went wrong. Please try again.');
      }
    },

    // ── Clock actions ───────────────────────────────────────────────────────

    async doClockIn() {
      this._clearInactivity();
      this._clearCountdown();
      this.actionLoading = true;
      try {
        await clockIn(this.student!.homebase_id);
        this.showSuccess('You have been clocked in!');
      } catch {
        this.showError('Failed to clock in. Please try again.');
      } finally {
        this.actionLoading = false;
      }
    },

    async doClockOut() {
      this._clearInactivity();
      this._clearCountdown();
      this.actionLoading = true;
      try {
        await clockOut(this.session!.id);
        this.showSuccess('You have been clocked out. Have a great day!');
      } catch {
        this.showError('Failed to clock out. Please try again.');
      } finally {
        this.actionLoading = false;
      }
    },

    async doStartBreak() {
      this._clearInactivity();
      this._clearCountdown();
      this.actionLoading = true;
      try {
        await startBreak(this.session!.id);
        this.showSuccess('Your break has started.');
      } catch {
        this.showError('Failed to start break. Please try again.');
      } finally {
        this.actionLoading = false;
      }
    },

    async doEndBreak() {
      this._clearInactivity();
      this._clearCountdown();
      this.actionLoading = true;
      try {
        await endBreak(this.session!.activeBreak!.id);
        this.showSuccess(`Welcome back, ${this.student!.name}!`);
      } catch {
        this.showError('Failed to end break. Please try again.');
      } finally {
        this.actionLoading = false;
      }
    },

    // ── State transitions ───────────────────────────────────────────────────

    showSuccess(msg: string) {
      this.successMsg = msg;
      this.state = 'success';
      this._startCountdown(3000, () => this.reset());
    },

    showError(msg: string) {
      this.errorMsg = msg;
      this.state = 'error';
      this._startCountdown(2500, () => this.reset());
    },

    reset() {
      this._clearInactivity();
      this._clearCountdown();
      this.pin = '';
      this.state = 'idle';
      this.student = null;
      this.session = null;
      this.successMsg = '';
      this.errorMsg = '';
      this.actionLoading = false;
    },
  };
}
