import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { logAuditEvent, type AuditAction, type Student } from '../lib/api.ts'
import { getInitials, toTitleCase } from '../lib/helpers.ts'

export type SnackbarType = 'default' | 'success' | 'error'

const STORAGE_KEY = 'employee'
export const MANAGER_ROLE_ID = 3

export const useAppStore = defineStore('app', () => {
  // The logged-in user (persisted).
  const currentEmployee = ref<Student | null>(null)
  // A student a manager is "viewing as". Never persisted, so a refresh drops
  // back to the manager's own session.
  const impersonating = ref<Student | null>(null)
  const globalLoading = ref(false)
  const snackbar = ref({ message: '', type: 'default' as SnackbarType, visible: false })
  const sessionRestored = ref(false)

  // The identity the UI reflects: the impersonated student if any.
  const activeEmployee = computed(() => impersonating.value ?? currentEmployee.value)
  const isImpersonating = computed(() => impersonating.value !== null)
  const isManager = computed(() => currentEmployee.value?.role_id === MANAGER_ROLE_ID)

  const avatarInitials = computed(() =>
    activeEmployee.value ? getInitials(toTitleCase(activeEmployee.value.name)) : '??')
  const displayName = computed(() =>
    activeEmployee.value ? toTitleCase(activeEmployee.value.name) : '')

  function setEmployee(emp: Student) {
    currentEmployee.value = emp
    localStorage.setItem(STORAGE_KEY, JSON.stringify(emp))
  }

  function clearEmployee() {
    currentEmployee.value = null
    impersonating.value = null
    localStorage.removeItem(STORAGE_KEY)
  }

  function readStoredEmployee(): Student | null {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as Student
    } catch {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
  }

  function viewAsStudent(student: Student) {
    impersonating.value = student
  }

  function exitImpersonation() {
    impersonating.value = null
  }

  let snackbarTimer: ReturnType<typeof setTimeout> | null = null

  function showSnackbar(message: string, type: SnackbarType = 'default', duration = 3000) {
    if (snackbarTimer) clearTimeout(snackbarTimer)
    snackbar.value = { message, type, visible: true }
    snackbarTimer = setTimeout(() => { snackbar.value.visible = false }, duration)
  }

  function showLoading() { globalLoading.value = true }
  function hideLoading() { globalLoading.value = false }

  // Writes an audit_log row as the logged-in user. Never throws or blocks the
  // action that triggered it.
  function audit(action: AuditAction, opts: {
    targetId?: string | number | null
    targetName?: string | null
    description?: string | null
    metadata?: Record<string, unknown> | null
  } = {}): void {
    const actor = currentEmployee.value
    logAuditEvent({
      actor_id: actor?.homebase_id ?? null,
      actor_name: actor?.name ?? null,
      action,
      target_id: opts.targetId ?? null,
      target_name: opts.targetName ?? null,
      description: opts.description ?? null,
      metadata: opts.metadata ?? null,
    }).catch(() => {})
  }

  return {
    currentEmployee,
    impersonating,
    globalLoading,
    snackbar,
    sessionRestored,
    activeEmployee,
    isImpersonating,
    isManager,
    avatarInitials,
    displayName,
    setEmployee,
    clearEmployee,
    readStoredEmployee,
    viewAsStudent,
    exitImpersonation,
    showSnackbar,
    showLoading,
    hideLoading,
    audit,
  }
})
