import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import {
  getStudentByPin,
  getActiveSession,
  clockIn,
  clockOut,
  startBreak,
  endBreak,
  getInitials,
  formatTime,
  type TimeclockStudent,
  type ActiveSession,
} from '../lib/api'

type ClockState = 'idle' | 'loading' | 'actions' | 'success' | 'error'
type ClockStatus = 'clocked_out' | 'clocked_in' | 'on_break'

const INACTIVITY_MS = 7000

export const useTimeclockStore = defineStore('timeclock', () => {
  const pin = ref('')
  const state = ref<ClockState>('idle')
  const student = ref<TimeclockStudent | null>(null)
  const session = ref<ActiveSession | null>(null)
  const actionLoading = ref(false)
  const successMsg = ref('')
  const errorMsg = ref('')
  const currentTime = ref('')
  const currentDate = ref('')
  const showingCountdown = ref(false)
  const countdownProgress = ref(100)

  let _clockInterval: ReturnType<typeof setInterval> | null = null
  let _inactivityTimer: ReturnType<typeof setTimeout> | null = null
  let _countdownInterval: ReturnType<typeof setInterval> | null = null

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

  // ── Clock ─────────────────────────────────────────────────────────────────

  function initClock() {
    const tick = () => {
      const now = new Date()
      currentTime.value = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      currentDate.value = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    }
    tick()
    _clockInterval = setInterval(tick, 1000)
  }

  function destroyClock() {
    if (_clockInterval) { clearInterval(_clockInterval); _clockInterval = null }
    _clearCountdown()
    _clearInactivity()
  }

  // ── Countdown ─────────────────────────────────────────────────────────────

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

  // ── Inactivity ────────────────────────────────────────────────────────────

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
    if (pin.value.length >= 4 || state.value === 'loading') return
    pin.value += d
    if (pin.value.length === 4) lookupPin()
  }

  function deleteDigit() {
    if (state.value !== 'idle') return
    pin.value = pin.value.slice(0, -1)
  }

  function onKeydown(e: KeyboardEvent) {
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
      if (!s) { showError('PIN not recognized. Please try again.'); return }
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
    _clearInactivity(); _clearCountdown()
    actionLoading.value = true
    try {
      await clockIn(student.value!.homebase_id)
      showSuccess('You have been clocked in!')
    } catch {
      showError('Failed to clock in. Please try again.')
    } finally {
      actionLoading.value = false
    }
  }

  async function doClockOut() {
    _clearInactivity(); _clearCountdown()
    actionLoading.value = true
    try {
      await clockOut(session.value!.id)
      showSuccess('You have been clocked out. Have a great day!')
    } catch {
      showError('Failed to clock out. Please try again.')
    } finally {
      actionLoading.value = false
    }
  }

  async function doStartBreak() {
    _clearInactivity(); _clearCountdown()
    actionLoading.value = true
    try {
      await startBreak(session.value!.id)
      showSuccess('Your break has started.')
    } catch {
      showError('Failed to start break. Please try again.')
    } finally {
      actionLoading.value = false
    }
  }

  async function doEndBreak() {
    _clearInactivity(); _clearCountdown()
    actionLoading.value = true
    try {
      await endBreak(session.value!.activeBreak!.id)
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
    _clearInactivity(); _clearCountdown()
    pin.value = ''
    state.value = 'idle'
    student.value = null
    session.value = null
    successMsg.value = ''
    errorMsg.value = ''
    actionLoading.value = false
  }

  return {
    pin, state, student, session, actionLoading, successMsg, errorMsg,
    currentTime, currentDate, showingCountdown, countdownProgress,
    clockStatus, studentInitials, statusLabel,
    initClock, destroyClock,
    appendDigit, deleteDigit, onKeydown,
    doClockIn, doClockOut, doStartBreak, doEndBreak, reset,
  }
})
