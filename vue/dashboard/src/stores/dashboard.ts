import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { fetchStudentDashboard, type StudentDashboard } from '../lib/api'
import { fmtFloat } from '../lib/helpers'
import { useAppStore } from './app'

export const useDashboardStore = defineStore('dashboard', () => {
  const app = useAppStore()
  const loading = ref(false)
  const data = ref<StudentDashboard | null>(null)
  const error = ref('')

  const hrsRemaining = computed(() => {
    if (!data.value) return '— h remaining'
    return `${fmtFloat(data.value.hrsToGrad - data.value.totalHrsAll)} h remaining`
  })

  const formattedInPersonHrs = computed(() => data.value ? fmtFloat(data.value.inPersonHrs) : '—')
  const formattedDeHrs = computed(() => data.value ? fmtFloat(data.value.deHrs) : '—')
  const formattedTotalHrs = computed(() => data.value ? fmtFloat(data.value.totalHrsAll) : '—')

  async function load(employeeId: number) {
    app.showLoading()
    error.value = ''
    try {
      data.value = await fetchStudentDashboard(employeeId)
    } catch {
      error.value = 'Failed to load dashboard data.'
    } finally {
      app.hideLoading()
    }
  }

  return { loading, data, error, hrsRemaining, formattedInPersonHrs, formattedDeHrs, formattedTotalHrs, load }
})
