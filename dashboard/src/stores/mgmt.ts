import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  fetchEmployeeTable,
  fetchCurrentStudents,
  fetchCurrentMonthHours,
  fetchDeHours,
  fetchAllGrades,
  fetchNeedsReviewEntries,
  fetchAuditLog,
  clearAutoClosedFlags,
  removeGradeEntry,
  updateDeHoursEntry,
  subscribeToTimeclock,
  type MgmtEmployee,
  type TimeclockStatusEntry,
  type MonthlyHours,
  type DeEntry,
  type GradeEntry,
  type NeedsReviewEntry,
  type NeedsReviewBreak,
  type AuditLogRecord,
} from '../lib/api.ts'
import { localDateStr, toTitleCase } from '../lib/helpers.ts'
import { useAppStore } from './app.ts'

export type ClockedInStatus = 'Clocked In' | 'On Break' | 'Clocked Out'

export interface StudentGroup {
  homebase_id: number
  name: string
  initials: string
  role_id: number
  role_name: string
  totalHrs: number
  hrsToGraduate: number
  percentComplete: number
  todayEntry: TimeclockStatusEntry | null
  historyEntries: TimeclockStatusEntry[]
  prevDayHrs: number
  currentMonthHrs: number
  currentMonthDeHrs: number
  grades: GradeEntry[]
  status: ClockedInStatus
}

// Which modal is open, and for whom. Replaces the original app's window events.
export type DialogRequest =
  | { kind: 'export' }
  | { kind: 'addStudent' }
  | { kind: 'resetPassword'; id: number; name: string }
  | { kind: 'editStudent'; id: number; name: string; roleId: number }
  | { kind: 'removeStudent'; id: number; name: string }
  | { kind: 'setPin'; id: number; name: string }
  | { kind: 'punchPhotos'; homebaseId: number; clockIn: string }
  | { kind: 'addEntry'; id: number; name: string }
  | { kind: 'editTimepunch'; id: number; name: string; date: string; clockIn: string; deTotal: number }
  | { kind: 'editGrade'; id: number; name: string; grade: GradeEntry }
  | { kind: 'editDe'; id: number; name: string; de: DeEntry }

let timeclockChannel: RealtimeChannel | null = null

function statusOf(todayEntry: TimeclockStatusEntry | null): ClockedInStatus {
  if (!todayEntry) return 'Clocked Out'
  if (todayEntry.on_break) return 'On Break'
  if (todayEntry.is_clocked_in) return 'Clocked In'
  return 'Clocked Out'
}

export const useMgmtStore = defineStore('mgmt', () => {
  const app = useAppStore()

  const loading = ref(false)
  const loadedOnce = ref(false)
  const employees = ref<MgmtEmployee[]>([])
  const currentStudents = ref<TimeclockStatusEntry[]>([])
  const monthlyHours = ref(new Map<number, MonthlyHours>())
  const allGrades = ref<Record<number, GradeEntry[]>>({})
  const needsReviewEntries = ref<NeedsReviewEntry[]>([])
  const auditLog = ref<AuditLogRecord[]>([])

  const selectedStudentId = ref<number | null>(null)
  const deHoursList = ref<DeEntry[]>([])
  const pendingDeHoursDelete = ref<number | null>(null)
  const pendingGradeDelete = ref<number | null>(null)

  const dialog = ref<DialogRequest | null>(null)

  const needsReviewCount = computed(() => needsReviewEntries.value.length)

  const groupedStudents = computed<StudentGroup[]>(() => {
    const today = localDateStr()
    const y = new Date()
    y.setDate(y.getDate() - 1)
    const yesterday = localDateStr(y)

    const empMap = new Map<number, MgmtEmployee>()
    for (const emp of employees.value) empMap.set(emp.homebase_id, emp)

    // Timeclock entries per active student; every active student gets a group.
    const groups = new Map<number, TimeclockStatusEntry[]>()
    for (const emp of employees.value) groups.set(emp.homebase_id, [])
    for (const entry of currentStudents.value) {
      groups.get(entry.homebase_id)?.push(entry)
    }

    return [...groups.entries()]
      .map(([homebase_id, entries]) => {
        const sorted = [...entries].sort((a, b) => new Date(b.clock_in).getTime() - new Date(a.clock_in).getTime())
        const todayEntry = sorted.find(e => e.date === today) ?? null
        const historyEntries = sorted.filter(e => e.date !== today)
        const emp = empMap.get(homebase_id)
        const name = entries[0]?.name ?? emp?.name ?? `Student ${homebase_id}`
        const month = monthlyHours.value.get(homebase_id)
        return {
          homebase_id,
          name,
          initials: name.split(' ').map(p => p[0] ?? '').slice(0, 2).join('').toUpperCase(),
          role_id: emp?.role_id ?? 1,
          role_name: emp?.role_name ?? '',
          totalHrs: Number.parseFloat(String(emp?.total_hrs ?? '0')) || 0,
          hrsToGraduate: emp?.hrs_to_graduate ?? 0,
          percentComplete: emp?.percent_complete ?? 0,
          todayEntry,
          historyEntries,
          prevDayHrs: historyEntries.find(e => e.date === yesterday)?.worked_hours ?? 0,
          currentMonthHrs: month?.inPerson ?? 0,
          currentMonthDeHrs: month?.de ?? 0,
          grades: allGrades.value[homebase_id] ?? [],
          status: statusOf(todayEntry),
        }
      })
      .sort((a, b) => {
        const aActive = a.todayEntry?.is_clocked_in ? 1 : 0
        const bActive = b.todayEntry?.is_clocked_in ? 1 : 0
        if (aActive !== bActive) return bActive - aActive
        return a.name.localeCompare(b.name)
      })
  })

  const selectedGroup = computed(() =>
    selectedStudentId.value == null
      ? null
      : groupedStudents.value.find(g => g.homebase_id === selectedStudentId.value) ?? null)

  async function refreshLive() {
    const [current, review] = await Promise.all([fetchCurrentStudents(), fetchNeedsReviewEntries()])
    currentStudents.value = current
    needsReviewEntries.value = review
  }

  async function load() {
    app.showLoading()
    loading.value = true
    try {
      const [emps, current, month, grades, review, log] = await Promise.all([
        fetchEmployeeTable(),
        fetchCurrentStudents(),
        fetchCurrentMonthHours(),
        fetchAllGrades(),
        fetchNeedsReviewEntries(),
        fetchAuditLog(),
      ])
      employees.value = emps
      currentStudents.value = current
      monthlyHours.value = month
      allGrades.value = grades
      needsReviewEntries.value = review
      auditLog.value = log
      loadedOnce.value = true
      // Matches production: a reload closes the student drawer.
      selectedStudentId.value = null
      pendingGradeDelete.value = null
      pendingDeHoursDelete.value = null

      if (!timeclockChannel) {
        timeclockChannel = subscribeToTimeclock(() => { refreshLive().catch(() => {}) })
      }
    } catch {
      app.showSnackbar('Failed to load employees', 'error')
    } finally {
      loading.value = false
      app.hideLoading()
    }
  }

  async function openStudent(homebaseId: number) {
    pendingGradeDelete.value = null
    pendingDeHoursDelete.value = null
    deHoursList.value = []
    selectedStudentId.value = homebaseId
    try {
      deHoursList.value = await fetchDeHours(homebaseId)
    } catch {
      app.showSnackbar('Failed to load DE hours', 'error')
    }
  }

  function closeStudent() {
    selectedStudentId.value = null
  }

  async function deleteDeHours(homebaseId: number, studentName: string, de: DeEntry) {
    app.showLoading()
    try {
      await updateDeHoursEntry(de.id, { is_active: false })
      // Drop it locally — a full load() would close the drawer.
      deHoursList.value = deHoursList.value.filter(d => d.id !== de.id)
      app.audit('de_hours_remove', {
        targetId: homebaseId,
        targetName: studentName,
        description: `Deleted a DE hours entry (${de.hours} hrs, ${de.date})`,
        metadata: { id: de.id, date: de.date, hours: de.hours, module: de.module, platform: de.platform },
      })
      app.showSnackbar(`${de.hours} DE hours deleted.`, 'success')
    } catch {
      app.showSnackbar('Failed to delete DE hours', 'error')
    } finally {
      pendingDeHoursDelete.value = null
      app.hideLoading()
    }
  }

  async function deleteGrade(homebaseId: number, studentName: string, grade: GradeEntry) {
    app.showLoading()
    try {
      await removeGradeEntry(grade.id)
      allGrades.value = {
        ...allGrades.value,
        [homebaseId]: (allGrades.value[homebaseId] ?? []).filter(g => g.id !== grade.id),
      }
      app.audit('grade_remove', {
        targetId: homebaseId,
        targetName: studentName,
        description: `Deleted a grade entry (${grade.project} / ${grade.category}, ${grade.date})`,
        metadata: { id: grade.id, date: grade.date, project: grade.project, category: grade.category, score: grade.score },
      })
      app.showSnackbar(`Deleted grade entry -- ${grade.date} / ${grade.project} / ${grade.category})`, 'success')
    } catch {
      app.showSnackbar('Failed to delete grade', 'error')
    } finally {
      pendingGradeDelete.value = null
      app.hideLoading()
    }
  }

  // What the nightly job had to fix on this entry — one badge per problem.
  function reviewIssues(entry: NeedsReviewEntry): string[] {
    const issues: string[] = []
    if (entry.auto_closed) issues.push('Auto clock-out')
    if (entry.breaks.some(b => b.auto_closed)) issues.push('Auto break end')
    return issues.length > 0 ? issues : ['Auto-fixed']
  }

  // The auto-closed break, else the first one, so the row still reads sensibly.
  function reviewBreak(entry: NeedsReviewEntry): NeedsReviewBreak | null {
    return entry.breaks.find(b => b.auto_closed) ?? entry.breaks[0] ?? null
  }

  async function markReviewed(entryId: string) {
    const entry = needsReviewEntries.value.find(e => e.id === entryId)
    if (!entry) return
    try {
      await clearAutoClosedFlags(entryId)
      needsReviewEntries.value = needsReviewEntries.value.filter(e => e.id !== entryId)
      app.audit('timeclock_reviewed', {
        targetId: entry.homebase_id,
        targetName: entry.student_name,
        description: `Marked an auto-fixed timesheet reviewed for ${toTitleCase(entry.student_name)} (${entry.date})`,
        metadata: {
          entry_id: entry.id,
          date: entry.date,
          issues: reviewIssues(entry).join(', '),
          clock_in: entry.clock_in,
          clock_out: entry.clock_out,
        },
      })
    } catch {
      app.showSnackbar('Failed to mark this timesheet reviewed', 'error')
    }
  }

  function openDialog(req: DialogRequest) {
    dialog.value = req
  }

  function closeDialog() {
    dialog.value = null
  }

  function reset() {
    if (timeclockChannel) {
      timeclockChannel.unsubscribe().catch(() => {})
      timeclockChannel = null
    }
    loadedOnce.value = false
    employees.value = []
    currentStudents.value = []
    monthlyHours.value = new Map()
    allGrades.value = {}
    needsReviewEntries.value = []
    auditLog.value = []
    selectedStudentId.value = null
    deHoursList.value = []
    dialog.value = null
  }

  return {
    loading,
    loadedOnce,
    employees,
    currentStudents,
    allGrades,
    needsReviewEntries,
    auditLog,
    selectedStudentId,
    deHoursList,
    pendingDeHoursDelete,
    pendingGradeDelete,
    dialog,
    needsReviewCount,
    groupedStudents,
    selectedGroup,
    load,
    openStudent,
    closeStudent,
    deleteDeHours,
    deleteGrade,
    reviewIssues,
    reviewBreak,
    markReviewed,
    openDialog,
    closeDialog,
    reset,
  }
})
