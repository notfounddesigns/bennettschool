import { ref } from 'vue'
import { defineStore } from 'pinia'
import {
  fetchEmployeeTable,
  fetchCurrentStudents,
  fetchLastSync,
  fetchOverviewStats,
  subscribeToTimeclock,
  type MgmtEmployee,
  type SyncRecord,
  type OverviewStats,
  type TimeclockStatusEntry,
} from '../lib/api'
import { formatSimpleDate } from '../lib/helpers'
import { useAppStore } from './app'

let _timeclockChannel: ReturnType<typeof subscribeToTimeclock> | null = null
let _hoursRefreshInterval: ReturnType<typeof setInterval> | null = null

export const useMgmtStore = defineStore('mgmt', () => {
  const app = useAppStore()
  const loading = ref(false)
  const employees = ref<MgmtEmployee[]>([])
  const currentStudents = ref<TimeclockStatusEntry[]>([])
  const lastSync = ref<SyncRecord | null>(null)
  const overviewStats = ref<OverviewStats | null>(null)

  function formatLastSync(): string {
    if (!lastSync.value) return 'No syncs recorded yet.'
    return `Last synced: ${formatSimpleDate(lastSync.value.date_synced)} — ${lastSync.value.inserted} records`
  }

  async function load() {
    app.showLoading()
    loading.value = true
    try {
      const [emps, students, sync, stats] = await Promise.all([
        fetchEmployeeTable(),
        fetchCurrentStudents(),
        fetchLastSync(),
        fetchOverviewStats(),
      ])
      employees.value = emps
      currentStudents.value = students
      lastSync.value = sync
      overviewStats.value = stats

      if (!_timeclockChannel) {
        _timeclockChannel = subscribeToTimeclock(async () => {
          currentStudents.value = await fetchCurrentStudents()
        })
      }
      if (!_hoursRefreshInterval) {
        _hoursRefreshInterval = setInterval(async () => {
          currentStudents.value = await fetchCurrentStudents()
        }, 60_000)
      }
    } catch {
      app.showSnackbar('Failed to load employees', 'error')
    } finally {
      loading.value = false
      app.hideLoading()
    }
  }

  return { loading, employees, currentStudents, lastSync, overviewStats, formatLastSync, load }
})
