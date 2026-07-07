import {
  getStudentByPin,
  getActiveSession,
  clockIn,
  clockOut,
  startBreak,
  endBreak,
  uploadPunchPhoto,
  loginEmployee,
  validateCachedEmployee,
  logAuditEvent,
  type TimeclockStudent,
  type ActiveSession,
  type Student,
} from '../lib/api';
import { getInitials, formatTime } from '../lib/helpers';

type ClockState = 'idle' | 'loading' | 'actions' | 'success' | 'error';
type ClockStatus = 'clocked_out' | 'clocked_in' | 'on_break';

const INACTIVITY_MS = 7000;
const MANAGER_ROLE_ID = 3;
const KIOSK_MANAGER_KEY = 'kiosk_manager';

export function timeclockData() {
  return {
    // ── Manager gate ────────────────────────────────────────────────────────
    // The kiosk stays locked until a manager (role_id === 3) signs in. The
    // unlocked manager is cached so the device stays ready across reloads.
    locked: true,
    manager: null as Student | null,
    loginName: '',
    loginPassword: '',
    loginError: '',
    unlocking: false,

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

    // Front-facing camera, kept warm so punches can auto-capture instantly
    _cameraStream: null as MediaStream | null,
    _cameraReady: false,

    init() {
      const tick = () => {
        const now = new Date();
        this.currentTime = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        this.currentDate = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
      };
      tick();
      this._clockInterval = setInterval(tick, 1000);
      void this._restoreUnlock();
    },

    // ── Manager gate ──────────────────────────────────────────────────────────

    async _restoreUnlock() {
      const raw = localStorage.getItem(KIOSK_MANAGER_KEY);
      if (!raw) return;
      try {
        const manager = JSON.parse(raw) as Student;
        if (manager.role_id !== MANAGER_ROLE_ID) throw new Error('not a manager');
        const valid = await validateCachedEmployee(manager.homebase_id);
        if (!valid) throw new Error('stale session');
        this.manager = manager;
        this._onUnlocked();
      } catch {
        localStorage.removeItem(KIOSK_MANAGER_KEY);
      }
    },

    async unlock() {
      this.loginError = '';
      const name = this.loginName.trim();
      const password = this.loginPassword;
      if (!name) { this.loginError = 'Please enter your first and last name.'; return; }
      if (!password) { this.loginError = 'Please enter your password.'; return; }

      const parts = name.split(' ').filter(Boolean);
      if (parts.length < 2) { this.loginError = 'Please enter your first and last name.'; return; }
      const [first, last] = parts;

      this.unlocking = true;
      try {
        const data = await loginEmployee(first, last, password);
        if (data.result === 'first_time') {
          this.loginError = 'Set up your password in the main app before unlocking the kiosk.';
          return;
        }
        if (data.student.role_id !== MANAGER_ROLE_ID) {
          this.loginError = 'Manager access is required to unlock the kiosk.';
          return;
        }
        this.manager = data.student;
        localStorage.setItem(KIOSK_MANAGER_KEY, JSON.stringify(data.student));
        void logAuditEvent({
          actor_id: data.student.homebase_id,
          actor_name: data.student.name,
          action: 'login',
          target_id: data.student.homebase_id,
          target_name: data.student.name,
          description: `${data.student.name} unlocked the timeclock kiosk`,
        }).catch(() => {});
        this._onUnlocked();
      } catch (e: unknown) {
        this.loginError = e instanceof Error ? e.message : 'Network error. Please try again.';
      } finally {
        this.loginPassword = '';
        this.unlocking = false;
      }
    },

    lock() {
      const emp = this.manager;
      if (emp) {
        void logAuditEvent({
          actor_id: emp.homebase_id,
          actor_name: emp.name,
          action: 'logout',
          target_id: emp.homebase_id,
          target_name: emp.name,
          description: `${emp.name} locked the timeclock kiosk`,
        }).catch(() => {});
      }
      localStorage.removeItem(KIOSK_MANAGER_KEY);
      this.manager = null;
      this.locked = true;
      this.loginName = '';
      this.loginPassword = '';
      this.loginError = '';
      this.reset();
      this._stopCamera();
    },

    _onUnlocked() {
      this.locked = false;
      this.loginName = '';
      this.loginPassword = '';
      this.loginError = '';
      this._startCamera();
    },

    destroy() {
      if (this._clockInterval) clearInterval(this._clockInterval);
      this._clearCountdown();
      this._clearInactivity();
      this._stopCamera();
    },

    // ── Punch photo capture ─────────────────────────────────────────────────

    async _startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        this._cameraStream = stream;
        const video = document.getElementById('punch-video') as HTMLVideoElement;
        video.srcObject = stream;
        await video.play();
        this._cameraReady = true;
      } catch {
        this._cameraReady = false;
      }
    },

    _stopCamera() {
      if (this._cameraStream) {
        this._cameraStream.getTracks().forEach(t => t.stop());
        this._cameraStream = null;
      }
      this._cameraReady = false;
    },

    async _capturePunchPhoto(homebaseId: number): Promise<string | null> {
      if (!this._cameraReady) return null;
      try {
        const video = document.getElementById('punch-video') as HTMLVideoElement;
        const canvas = document.getElementById('punch-canvas') as HTMLCanvasElement;
        if (!video.videoWidth || !video.videoHeight) return null;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
        if (!blob) return null;
        return await uploadPunchPhoto(homebaseId, blob);
      } catch {
        return null;
      }
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
      if (this.locked) return;
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
        const photoPath = await this._capturePunchPhoto(this.student!.homebase_id);
        await clockIn(this.student!.homebase_id, photoPath);
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
        const photoPath = await this._capturePunchPhoto(this.student!.homebase_id);
        await clockOut(this.session!.id, photoPath);
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
        const photoPath = await this._capturePunchPhoto(this.student!.homebase_id);
        await startBreak(this.session!.id, photoPath);
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
        const photoPath = await this._capturePunchPhoto(this.student!.homebase_id);
        await endBreak(this.session!.activeBreak!.id, photoPath);
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
