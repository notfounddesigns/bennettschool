import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { StudentDashboard } from '../../src/lib/api.ts'

// This file mocks the API module directly instead of going through MSW — handy
// when the store's own logic is what's under test, not the HTTP shape.
vi.mock('../../src/lib/api.ts', () => ({
  fetchStudentDashboard: vi.fn(),
  logAuditEvent: vi.fn(() => Promise.resolve()),
}))

const { fetchStudentDashboard } = await import('../../src/lib/api.ts')
const { useDashboardStore } = await import('../../src/stores/dashboard.ts')
const { useAppStore } = await import('../../src/stores/app.ts')

function dashboard(overrides: Partial<StudentDashboard> = {}): StudentDashboard {
  return {
    totalHrsAll: 512.25,
    hrsToGrad: 987.75,
    percentComplete: 34,
    currentMonthHrs: 40,
    currentMonthDeHrs: 6.5,
    inPersonHrsList: [],
    deHrsList: [],
    timeclockHrsList: [],
    grades: [],
    ...overrides,
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.mocked(fetchStudentDashboard).mockReset()
})

describe('formatted values', () => {
  it('show dashes before data loads', () => {
    const store = useDashboardStore()
    expect(store.formattedTotalHrs).toBe('—')
    expect(store.hrsRemaining).toBe('— h remaining')
  })

  it('format loaded hours to 2 decimals', async () => {
    vi.mocked(fetchStudentDashboard).mockResolvedValue(dashboard())
    const store = useDashboardStore()
    await store.load(7)
    expect(store.formattedTotalHrs).toBe('512.25')
    expect(store.formattedInPersonHrs).toBe('40.00')
    expect(store.formattedDeHrs).toBe('6.50')
    expect(store.hrsRemaining).toBe('987.75 h remaining')
  })

  it('celebrates when no hours remain', async () => {
    vi.mocked(fetchStudentDashboard).mockResolvedValue(dashboard({ hrsToGrad: 0 }))
    const store = useDashboardStore()
    await store.load(7)
    expect(store.hrsRemaining).toMatch(/^Graduated/)
  })
})

describe('load', () => {
  it('toggles the global loading overlay', async () => {
    let resolve!: (d: StudentDashboard) => void
    vi.mocked(fetchStudentDashboard).mockReturnValue(new Promise(r => { resolve = r }))
    const app = useAppStore()
    const store = useDashboardStore()

    const pending = store.load(7)
    expect(app.globalLoading).toBe(true)
    resolve(dashboard())
    await pending
    expect(app.globalLoading).toBe(false)
  })

  it('clears the previous student\'s numbers while loading a different student', async () => {
    vi.mocked(fetchStudentDashboard).mockResolvedValueOnce(dashboard())
    const store = useDashboardStore()
    await store.load(7)

    vi.mocked(fetchStudentDashboard).mockReturnValueOnce(new Promise(() => {}))
    void store.load(8)
    expect(store.data).toBeNull()
  })

  it('keeps the same student\'s numbers visible while refreshing', async () => {
    vi.mocked(fetchStudentDashboard).mockResolvedValueOnce(dashboard())
    const store = useDashboardStore()
    await store.load(7)

    vi.mocked(fetchStudentDashboard).mockReturnValueOnce(new Promise(() => {}))
    void store.load(7)
    expect(store.data).not.toBeNull()
  })

  it('sets an error message and hides the overlay on failure', async () => {
    vi.mocked(fetchStudentDashboard).mockRejectedValue(new Error('nope'))
    const app = useAppStore()
    const store = useDashboardStore()
    await store.load(7)
    expect(store.error).toBe('Failed to load dashboard data.')
    expect(app.globalLoading).toBe(false)
  })
})
