import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
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
} from '../lib/api'
import { getInitials, formatTime } from '../lib/helpers'

type ClockState = 'idle' | 'loading' | 'actions' | 'success' | 'error'
type ClockStatus = 'clocked_out' | 'clocked_in' | 'on_break'

const INACTIVITY_MS = 7000
const MANAGER_ROLE_ID = 3
const KIOSK_MANAGER_KEY = 'kiosk_manager'

export const useTimeclockStore = defineStore('timeclock', () => {
  // ── Manager gate ──────────────────────────────────────────────────────────
  // The kiosk stays locked until a manager (role_id === 3) signs in. The
  // unlocked manager is cached so the device stays ready across reloads.
  const locked = ref(true)
  const manager = ref<Student | null>(null)
  const loginName = ref('')
  const loginPassword = ref('')
  const loginError = ref('')
  const unlocking = ref(false)

  const pin = ref('')
  const state = ref<ClockState>('idle')
  const student = ref<TimeclockStudent | null>(null)
  const session = ref<ActiveSession | null>(null)
  const actionLoading = ref(false)
  const successMsg = ref('')
  const errorMsg = ref('')

  const currentTime = ref('')
  const currentDate = ref('')

  // Unified countdown bar — used before every reset to PIN pad
  const showingCountdown = ref(false)
  const countdownProgress = ref(100)

  let _clockInterval: ReturnType<typeof setInterval> | null = null
  let _inactivityTimer: ReturnType<typeof setTimeout> | null = null
  let _countdownInterval: ReturnType<typeof setInterval> | null = null

  // Front-facing camera, kept warm so punches can auto-capture instantly.
  // The hidden <video>/<canvas> live in App.vue and are registered here.
  let _videoEl: HTMLVideoElement | null = null
  let _canvasEl: HTMLCanvasElement | null = null
  let _cameraStream: MediaStream | null = null
  let _cameraReady = false

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  function init(video: HTMLVideoElement | null, canvas: HTMLCanvasElement | null) {
    _videoEl = video
    _canvasEl = canvas
    const tick = () => {
      const now = new Date()
      currentTime.value = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      currentDate.value = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    }
    tick()
    _clockInterval = setInterval(tick, 1000)
    void _restoreUnlock()
  }

  function destroy() {
    if (_clockInterval) { clearInterval(_clockInterval); _clockInterval = null }
    _clearCountdown()
    _clearInactivity()
    _stopCamera()
  }

  // ── Manager gate ──────────────────────────────────────────────────────────

  async function _restoreUnlock() {
    const raw = localStorage.getItem(KIOSK_MANAGER_KEY)
    if (!raw) return
    try {
      const cached = JSON.parse(raw) as Student
      if (cached.role_id !== MANAGER_ROLE_ID) throw new Error('not a manager')
      const valid = await validateCachedEmployee(cached.homebase_id)
      if (!valid) throw new Error('stale session')
      manager.value = cached
      _onUnlocked()
    } catch {
      localStorage.removeItem(KIOSK_MANAGER_KEY)
    }
  }

  async function unlock() {
    loginError.value = ''
    const name = loginName.value.trim().replace(/[‘’]/g, "'")
    const password = loginPassword.value
    if (!name) { loginError.value = 'Please enter your first and last name.'; return }
    if (!password) { loginError.value = 'Please enter your password.'; return }

    const parts = name.split(' ').filter(Boolean)
    if (parts.length < 2) { loginError.value = 'Please enter your first and last name.'; return }
    const [first, last] = parts

    unlocking.value = true
    try {
      const data = await loginEmployee(first, last, password)
      if (data.result === 'first_time') {
        loginError.value = 'Set up your password in the main app before unlocking the kiosk.'
        return
      }
      if (data.student.role_id !== MANAGER_ROLE_ID) {
        loginError.value = 'Manager access is required to unlock the kiosk.'
        return
      }
      manager.value = data.student
      localStorage.setItem(KIOSK_MANAGER_KEY, JSON.stringify(data.student))
      void logAuditEvent({
        actor_id: data.student.homebase_id,
        actor_name: data.student.name,
        action: 'login',
        target_id: data.student.homebase_id,
        target_name: data.student.name,
        description: `${data.student.name} unlocked the timeclock kiosk`,
      }).catch(() => {})
      _onUnlocked()
    } catch (e: unknown) {
      loginError.value = e instanceof Error ? e.message : 'Network error. Please try again.'
    } finally {
      loginPassword.value = ''
      unlocking.value = false
    }
  }

  function lock() {
    const emp = manager.value
    if (emp) {
      void logAuditEvent({
        actor_id: emp.homebase_id,
        actor_name: emp.name,
        action: 'logout',
        target_id: emp.homebase_id,
        target_name: emp.name,
        description: `${emp.name} locked the timeclock kiosk`,
      }).catch(() => {})
    }
    localStorage.removeItem(KIOSK_MANAGER_KEY)
    manager.value = null
    locked.value = true
    loginName.value = ''
    loginPassword.value = ''
    loginError.value = ''
    reset()
    _stopCamera()
  }

  function _onUnlocked() {
    locked.value = false
    loginName.value = ''
    loginPassword.value = ''
    loginError.value = ''
    void _startCamera()
  }

  // ── Punch photo capture ───────────────────────────────────────────────────

  async function _startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      _cameraStream = stream
      const video = _videoEl!
      video.srcObject = stream
      await video.play()
      _cameraReady = true
    } catch {
      _cameraReady = false
    }
  }

  function _stopCamera() {
    if (_cameraStream) {
      _cameraStream.getTracks().forEach(t => t.stop())
      _cameraStream = null
    }
    _cameraReady = false
  }

  async function _capturePunchPhoto(homebaseId: number): Promise<string | null> {
    if (!_cameraReady) return null
    try {
      const video = _videoEl!
      const canvas = _canvasEl!
      if (!video.videoWidth || !video.videoHeight) return null
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8))
      if (!blob) return null
      return await uploadPunchPhoto(homebaseId, blob)
    } catch {
      return null
    }
  }

  // ── Computed ──────────────────────────────────────────────────────────────

  const clockStatus = computed<ClockStatus>(() => {
    if (!session.value) return 'clocked_out'
    if (session.value.activeBreak) return 'on_break'
    return 'clocked_in'
  })

  const studentInitials = computed(() => student.value ? getInitials(student.value.name) : '')

  const statusLabel = computed(() => {
    if (clockStatus.value === 'clocked_out') return 'Currently clocked out'
    if (clockStatus.value === 'on_break') {
      const t = formatTime(new Date(session.value!.activeBreak!.break_start))
      return `On break since ${t}`
    }
    const t = formatTime(new Date(session.value!.clock_in))
    return `Clocked in since ${t}`
  })

  // ── Unified countdown ─────────────────────────────────────────────────────
  // Drives the draining progress bar shown before every reset to PIN pad.

  function _startCountdown(ms: number, onComplete: () => void) {
    _clearCountdown()
    showingCountdown.value = true
    countdownProgress.value = 100
    let elapsed = 0
    const step = 50
    _countdownInterval = setInterval(() => {
      elapsed += step
      countdownProgress.value = Math.max(0, 100 - (elapsed / ms) * 100)
      if (elapsed >= ms) {
        _clearCountdown()
        onComplete()
      }
    }, step)
  }

  function _clearCountdown() {
    if (_countdownInterval) { clearInterval(_countdownInterval); _countdownInterval = null }
    showingCountdown.value = false
    countdownProgress.value = 100
  }

  // ── Inactivity timer (actions screen only) ────────────────────────────────

  function _startInactivity() {
    _clearInactivity()
    _inactivityTimer = setTimeout(() => {
      _inactivityTimer = null
      _startCountdown(3000, () => reset())
    }, INACTIVITY_MS)
  }

  function _clearInactivity() {
    if (_inactivityTimer) { clearTimeout(_inactivityTimer); _inactivityTimer = null }
  }

  // ── PIN pad ───────────────────────────────────────────────────────────────

  function appendDigit(d: string) {
    if (pin.value.length >= 6 || state.value === 'loading') return
    pin.value += d
    if (pin.value.length === 6) void lookupPin()
  }

  function deleteDigit() {
    if (state.value !== 'idle') return
    pin.value = pin.value.slice(0, -1)
  }

  function onKeydown(e: KeyboardEvent) {
    if (locked.value) return
    if (state.value === 'success' || state.value === 'error') return
    if (state.value === 'actions') {
      if (e.key === 'Escape') reset()
      return
    }
    if (e.key >= '0' && e.key <= '9') appendDigit(e.key)
    else if (e.key === 'Backspace') deleteDigit()
    else if (e.key === 'Escape') reset()
  }

  // ── PIN lookup ────────────────────────────────────────────────────────────

  async function lookupPin() {
    state.value = 'loading'
    try {
      const s = await getStudentByPin(pin.value)
      if (!s) {
        showError('PIN not recognized. Please try again.')
        return
      }
      const sess = await getActiveSession(s.homebase_id)
      student.value = s
      session.value = sess
      state.value = 'actions'
      _startInactivity()
    } catch {
      showError('Something went wrong. Please try again.')
    }
  }

  // ── Clock actions ─────────────────────────────────────────────────────────

  async function doClockIn() {
    _clearInactivity()
    _clearCountdown()
    actionLoading.value = true
    try {
      const photoPath = await _capturePunchPhoto(student.value!.homebase_id)
      await clockIn(student.value!.homebase_id, photoPath)
      showSuccess('You have been clocked in!')
    } catch {
      showError('Failed to clock in. Please try again.')
    } finally {
      actionLoading.value = false
    }
  }

  async function doClockOut() {
    _clearInactivity()
    _clearCountdown()
    actionLoading.value = true
    try {
      const photoPath = await _capturePunchPhoto(student.value!.homebase_id)
      await clockOut(session.value!.id, photoPath)
      showSuccess('You have been clocked out. Have a great day!')
    } catch {
      showError('Failed to clock out. Please try again.')
    } finally {
      actionLoading.value = false
    }
  }

  async function doStartBreak() {
    _clearInactivity()
    _clearCountdown()
    actionLoading.value = true
    try {
      const photoPath = await _capturePunchPhoto(student.value!.homebase_id)
      await startBreak(session.value!.id, photoPath)
      showSuccess('Your break has started.')
    } catch {
      showError('Failed to start break. Please try again.')
    } finally {
      actionLoading.value = false
    }
  }

  async function doEndBreak() {
    _clearInactivity()
    _clearCountdown()
    actionLoading.value = true
    try {
      const photoPath = await _capturePunchPhoto(student.value!.homebase_id)
      await endBreak(session.value!.activeBreak!.id, photoPath)
      showSuccess(`Welcome back, ${student.value!.name}!`)
    } catch {
      showError('Failed to end break. Please try again.')
    } finally {
      actionLoading.value = false
    }
  }

  // ── State transitions ─────────────────────────────────────────────────────

  function showSuccess(msg: string) {
    successMsg.value = msg
    state.value = 'success'
    _startCountdown(3000, () => reset())
  }

  function showError(msg: string) {
    errorMsg.value = msg
    state.value = 'error'
    _startCountdown(2500, () => reset())
  }

  function reset() {
    _clearInactivity()
    _clearCountdown()
    pin.value = ''
    state.value = 'idle'
    student.value = null
    session.value = null
    successMsg.value = ''
    errorMsg.value = ''
    actionLoading.value = false
  }

  return {
    locked, manager, loginName, loginPassword, loginError, unlocking,
    pin, state, student, session, actionLoading, successMsg, errorMsg,
    currentTime, currentDate, showingCountdown, countdownProgress,
    clockStatus, studentInitials, statusLabel,
    init, destroy, unlock, lock,
    appendDigit, deleteDigit, onKeydown,
    doClockIn, doClockOut, doStartBreak, doEndBreak, reset,
  }
})
