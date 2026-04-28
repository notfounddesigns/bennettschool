import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { Employee } from '../lib/api'
import { getInitials, toTitleCase } from '../lib/helpers'

export type SnackbarType = 'default' | 'success' | 'error'

export const useAppStore = defineStore('app', () => {
  const currentEmployee = ref<Employee | null>(null)
  const globalLoading = ref(false)
  const snackbar = ref({ message: '', type: 'default' as SnackbarType, visible: false })
  const sessionRestored = ref(false)

  const isManager = computed(() => currentEmployee.value?.job.level === 'Manager')

  const avatarInitials = computed(() => {
    if (!currentEmployee.value) return '??'
    return getInitials(toTitleCase(`${currentEmployee.value.first_name} ${currentEmployee.value.last_name}`))
  })

  const displayName = computed(() => {
    if (!currentEmployee.value) return ''
    return toTitleCase(`${currentEmployee.value.first_name} ${currentEmployee.value.last_name}`)
  })

  function setEmployee(emp: Employee) {
    currentEmployee.value = emp
    localStorage.setItem('employee', JSON.stringify(emp))
  }

  function clearEmployee() {
    currentEmployee.value = null
    localStorage.removeItem('employee')
  }

  let _snackbarTimer: ReturnType<typeof setTimeout> | null = null

  function showSnackbar(message: string, type: SnackbarType = 'default', duration = 3000) {
    if (_snackbarTimer) clearTimeout(_snackbarTimer)
    snackbar.value = { message, type, visible: true }
    _snackbarTimer = setTimeout(() => { snackbar.value.visible = false }, duration)
  }

  function showLoading() { globalLoading.value = true }
  function hideLoading() { globalLoading.value = false }

  return {
    currentEmployee,
    globalLoading,
    snackbar,
    sessionRestored,
    isManager,
    avatarInitials,
    displayName,
    setEmployee,
    clearEmployee,
    showSnackbar,
    showLoading,
    hideLoading,
  }
})
