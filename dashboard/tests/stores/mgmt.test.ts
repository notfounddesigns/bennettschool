import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { captureRequests, http, HttpResponse, REST, restGet, server } from '../msw.ts'
import type { MgmtEmployee, NeedsReviewEntry, TimeclockStatusEntry } from '../../src/lib/api.ts'

// Everything goes through MSW except the realtime subscription, which opens a
// websocket — stub just that one function.
vi.mock('../../src/lib/api.ts', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/lib/api.ts')>(),
  subscribeToTimeclock: vi.fn(() => ({ unsubscribe: () => Promise.resolve('ok') })),
}))

const { useMgmtStore } = await import('../../src/stores/mgmt.ts')
const { useAppStore } = await import('../../src/stores/app.ts')

const emp = (homebase_id: number, name: string, extra: Partial<MgmtEmployee> = {}): MgmtEmployee => ({
  homebase_id, name, role_id: 1, role_name: 'Student', total_hrs: 100, hrs_to_graduate: 1400, percent_complete: 7, ...extra,
})

const punch = (homebase_id: number, date: string, extra: Partial<TimeclockStatusEntry> = {}): TimeclockStatusEntry => ({
  homebase_id, name: `student ${homebase_id}`, date,
  clock_in: `${date}T14:00:00Z`, clock_out: null,
  is_clocked_in: false, on_break: false, break_start: null, break_end: null, worked_hours: 8,
  ...extra,
})

beforeEach(() => {
  setActivePinia(createPinia())
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-09T12:00:00-06:00'))
})
afterEach(() => { vi.useRealTimers() })

describe('groupedStudents', () => {
  it('gives every active student a group, with today\'s status and yesterday\'s hours', () => {
    const mgmt = useMgmtStore()
    mgmt.employees = [emp(1, 'amy adams'), emp(2, 'bob brown'), emp(3, 'cal cole')]
    mgmt.currentStudents = [
      punch(1, '2026-11-09', { is_clocked_in: true, on_break: true }),
      punch(1, '2026-11-08', { worked_hours: 6.5 }),
      punch(2, '2026-11-09', { is_clocked_in: true }),
      // A punch for someone not in the employee list is ignored.
      punch(99, '2026-11-09', { is_clocked_in: true }),
    ]

    const groups = mgmt.groupedStudents

    expect(groups.map(g => g.homebase_id)).toEqual([1, 2, 3])
    expect(groups.map(g => g.status)).toEqual(['On Break', 'Clocked In', 'Clocked Out'])
    expect(groups[0].prevDayHrs).toBe(6.5)
    expect(groups[0].historyEntries).toHaveLength(1)
    expect(groups[2].todayEntry).toBeNull()
  })

  it('sorts clocked-in students first, then by name', () => {
    const mgmt = useMgmtStore()
    mgmt.employees = [emp(1, 'amy'), emp(2, 'zed'), emp(3, 'bea')]
    mgmt.currentStudents = [punch(2, '2026-11-09', { is_clocked_in: true, name: 'zed' })]

    expect(mgmt.groupedStudents.map(g => g.name)).toEqual(['zed', 'amy', 'bea'])
  })
})

describe('needs review', () => {
  const entry = (extra: Partial<NeedsReviewEntry> = {}): NeedsReviewEntry => ({
    id: 'e1', homebase_id: 1, student_name: 'jane smith', date: '2026-11-08',
    clock_in: '2026-11-08T14:00:00Z', clock_out: '2026-11-09T05:59:00Z', hours_worked: 16,
    auto_closed: true, breaks: [], ...extra,
  })

  it('reviewIssues lists one badge per problem', () => {
    const mgmt = useMgmtStore()
    const brk = { id: 'b', break_start: 'x', break_end: 'y', auto_closed: true }
    expect(mgmt.reviewIssues(entry())).toEqual(['Auto clock-out'])
    expect(mgmt.reviewIssues(entry({ breaks: [brk] }))).toEqual(['Auto clock-out', 'Auto break end'])
    expect(mgmt.reviewIssues(entry({ auto_closed: false }))).toEqual(['Auto-fixed'])
  })

  it('markReviewed clears the flags, removes the row and writes an audit entry', async () => {
    const requests = captureRequests()
    server.use(
      http.patch(`${REST}/timeclock_entries`, () => new HttpResponse(null, { status: 204 })),
      http.patch(`${REST}/timeclock_breaks`, () => new HttpResponse(null, { status: 204 })),
    )
    const app = useAppStore()
    app.setEmployee({ homebase_id: 50, name: 'pat manager', role_id: 3 })
    const mgmt = useMgmtStore()
    mgmt.needsReviewEntries = [entry(), entry({ id: 'e2' })]

    await mgmt.markReviewed('e1')

    expect(mgmt.needsReviewEntries.map(e => e.id)).toEqual(['e2'])
    await vi.waitFor(() => expect(requests.map(r => `${r.method} ${new URL(r.url).pathname}`)).toContain('POST /rest/v1/audit_log'))
    const audit = await requests.find(r => r.url.includes('audit_log'))!.json()
    expect(audit).toMatchObject({ actor_id: 50, action: 'timeclock_reviewed', target_id: '1' })
  })

  it('markReviewed keeps the row and shows an error if the update fails', async () => {
    server.use(http.patch(`${REST}/timeclock_entries`, () => HttpResponse.json({ message: 'denied' }, { status: 403 })))
    const app = useAppStore()
    const mgmt = useMgmtStore()
    mgmt.needsReviewEntries = [entry()]

    await mgmt.markReviewed('e1')

    expect(mgmt.needsReviewEntries).toHaveLength(1)
    expect(app.snackbar).toMatchObject({ type: 'error', visible: true })
  })
})

describe('deleteGrade', () => {
  it('soft-deletes the grade and drops it from local state', async () => {
    const requests = captureRequests()
    server.use(http.patch(`${REST}/grades`, () => new HttpResponse(null, { status: 204 })))
    const mgmt = useMgmtStore()
    const g1 = { id: 1, date: '2026-11-01', project: 'Cut', category: 'Practical', score: 90, notes: null }
    const g2 = { ...g1, id: 2 }
    mgmt.allGrades = { 7: [g1, g2] }

    await mgmt.deleteGrade(7, 'jane', g1)

    expect(mgmt.allGrades[7].map(g => g.id)).toEqual([2])
    const patch = requests.find(r => r.method === 'PATCH')!
    expect(await patch.json()).toEqual({ is_active: false })
    expect(new URL(patch.url).searchParams.get('id')).toBe('eq.1')
  })
})

describe('load', () => {
  function mockAll() {
    server.use(
      restGet('profiles_view', [emp(1, 'amy adams')]),
      restGet('timeclock_status', [punch(1, '2026-11-09', { is_clocked_in: true })]),
      restGet('hours', []),
      restGet('timeclock_entries', []),
      restGet('de_hours', []),
      restGet('grades', []),
      restGet('timeclock_breaks', []),
      restGet('audit_log', []),
    )
  }

  it('loads everything and closes any open student drawer', async () => {
    mockAll()
    const mgmt = useMgmtStore()
    mgmt.selectedStudentId = 1

    await mgmt.load()

    expect(mgmt.loadedOnce).toBe(true)
    expect(mgmt.selectedStudentId).toBeNull()
    expect(mgmt.groupedStudents[0].status).toBe('Clocked In')
  })

  it('shows a snackbar instead of throwing when a query fails', async () => {
    mockAll()
    server.use(restGet('profiles_view', { message: 'boom' }, 500))
    const app = useAppStore()
    const mgmt = useMgmtStore()

    await mgmt.load()

    expect(mgmt.loadedOnce).toBe(false)
    expect(app.snackbar).toMatchObject({ message: 'Failed to load employees', type: 'error' })
    expect(app.globalLoading).toBe(false)
  })
})
