import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { fetchStudentDashboard, type StudentDashboard } from '../lib/api.ts'
import { fmtFloat } from '../lib/helpers.ts'
import { useAppStore } from './app.ts'

// TEMPORARY (mirrors production): set to false to hide the hour totals and
// graduation progress on the student dashboard and disable the Hours/Grades
// buttons. No other change is needed.
const SHOW_STUDENT_METRICS = true

export const useDashboardStore = defineStore('dashboard', () => {
  const app = useAppStore()
  const data = ref<StudentDashboard | null>(null)
  const loadedFor = ref<number | null>(null)
  const error = ref('')
  const showMetrics = SHOW_STUDENT_METRICS

  const hrsRemaining = computed(() => {
    if (!data.value) return '— h remaining'
    if (data.value.hrsToGrad <= 0) return 'Graduated 🎉🎉'
    return `${fmtFloat(data.value.hrsToGrad)} h remaining`
  })
  const formattedInPersonHrs = computed(() => data.value ? fmtFloat(data.value.currentMonthHrs) : '—')
  const formattedDeHrs = computed(() => data.value ? fmtFloat(data.value.currentMonthDeHrs) : '—')
  const formattedTotalHrs = computed(() => data.value ? fmtFloat(data.value.totalHrsAll) : '—')

  async function load(homebaseId: number) {
    app.showLoading()
    error.value = ''
    // Don't flash a previous student's numbers while a manager switches students.
    if (loadedFor.value !== homebaseId) data.value = null
    try {
      data.value = await fetchStudentDashboard(homebaseId)
      loadedFor.value = homebaseId
    } catch {
      error.value = 'Failed to load dashboard data.'
    } finally {
      app.hideLoading()
    }
  }

  function reset() {
    data.value = null
    loadedFor.value = null
    error.value = ''
  }

  return {
    data,
    loadedFor,
    error,
    showMetrics,
    hrsRemaining,
    formattedInPersonHrs,
    formattedDeHrs,
    formattedTotalHrs,
    load,
    reset,
  }
})
