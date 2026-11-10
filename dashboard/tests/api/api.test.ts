import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { captureRequests, FN, http, HttpResponse, REST, restGet, server } from '../msw.ts'
import {
  clearAutoClosedFlags,
  fetchAllGrades,
  fetchCurrentMonthHours,
  fetchNeedsReviewEntries,
  fetchStudentDashboard,
  loginEmployee,
  submitDeHours,
} from '../../src/lib/api.ts'
import { SUPABASE_URL } from '../../src/lib/supabase.ts'

it('the app is pointed at the fake test host, not a real Supabase project', () => {
  expect(SUPABASE_URL).toBe('http://supabase.test')
})

describe('loginEmployee', () => {
  it('lowercases the name and returns the edge function result', async () => {
    const requests = captureRequests()
    server.use(http.post(`${FN}/auth-login`, () =>
      HttpResponse.json({ result: 'ok', student: { homebase_id: 1, name: 'jane smith', role_id: 1 } })))

    const result = await loginEmployee('Jane', 'SMITH', 'pw')

    expect(result.student.homebase_id).toBe(1)
    expect(await requests[0].json()).toEqual({ first_name: 'jane', last_name: 'smith', password: 'pw' })
    expect(requests[0].headers.get('authorization')).toBe('Bearer test-anon-key')
  })

  it.each([
    ['nested data.error', { data: { error: 'Wrong password' } }, 'Wrong password'],
    ['flat error', { error: 'No such student' }, 'No such student'],
    ['no message', {}, 'Login failed. Please try again.'],
  ])('surfaces the server message on failure (%s)', async (_label, body, message) => {
    server.use(http.post(`${FN}/auth-login`, () => HttpResponse.json(body, { status: 401 })))
    await expect(loginEmployee('a', 'b', 'c')).rejects.toThrow(message)
  })
})

describe('fetchStudentDashboard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-15T12:00:00-06:00'))
  })
  afterEach(() => { vi.useRealTimers() })

  function mockDashboard(overrides: Partial<Record<string, unknown>> = {}) {
    server.use(
      restGet('profiles_view', { homebase_id: 7, name: 'jane', total_hrs: 500, hrs_to_graduate: 1000, percent_complete: 33 }),
      restGet('hours', [
        { homebase_id: 7, date: '2026-11-03T00:00:00', hours: 4 },
        { homebase_id: 7, date: '2026-10-30T00:00:00', hours: 8 },
      ]),
      restGet('timeclock_entries', [
        // Same date as a legacy hours row — the timeclock value should win.
        { homebase_id: 7, date: '2026-11-03', hours_worked: 6.5 },
        { homebase_id: 7, date: '2026-11-10', hours_worked: 7 },
      ]),
      restGet('de_hours', [
        { id: 1, homebase_id: 7, date: '2026-11-02', hours: 2, module: 'M1', platform: 'Milady', verified: true },
        { id: 2, homebase_id: 7, date: '2026-11-04', hours: -1, module: 'adj', platform: '', verified: true },
        { id: 3, homebase_id: 7, date: '2026-10-01', hours: 3, module: 'M0', platform: 'Milady', verified: false },
      ]),
      restGet('grades', [{ id: 9, date: '2026-11-01', project: 'Cut', category: 'Practical', score: 92, notes: null }]),
      ...Object.entries(overrides).map(([table, body]) => restGet(table, body as never)),
    )
  }

  it('merges in-person hours, hides negative DE rows and totals the current month', async () => {
    mockDashboard()
    const d = await fetchStudentDashboard(7)

    expect(d.inPersonHrsList).toEqual([
      { date: '2026-11-10', hours: 7 },
      { date: '2026-11-03', hours: 6.5 },
      { date: '2026-10-30', hours: 8 },
    ])
    expect(d.deHrsList.map(h => h.id)).toEqual([1, 3])
    expect(d.currentMonthHrs).toBe(13.5)
    expect(d.currentMonthDeHrs).toBe(2)
    expect(d.totalHrsAll).toBe(500)
    expect(d.hrsToGrad).toBe(1000)
    expect(d.grades).toHaveLength(1)
  })

  it('only asks for active grades', async () => {
    const requests = captureRequests()
    mockDashboard()
    await fetchStudentDashboard(7)

    const grades = requests.find(r => new URL(r.url).pathname.endsWith('/grades'))!
    expect(new URL(grades.url).searchParams.get('is_active')).toBe('eq.true')
  })

  it('throws if any query fails', async () => {
    mockDashboard()
    server.use(restGet('hours', { message: 'boom' }, 500))
    await expect(fetchStudentDashboard(7)).rejects.toThrow('Failed to load dashboard')
  })
})

describe('fetchCurrentMonthHours', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-15T12:00:00-06:00'))
  })
  afterEach(() => { vi.useRealTimers() })

  it('pages past the 1000-row PostgREST cap and groups by student', async () => {
    const offsets: string[] = []
    const firstPage = Array.from({ length: 1000 }, () => ({ homebase_id: 1, date: '2026-11-02', hours: 0.01 }))

    server.use(
      http.get(`${REST}/hours`, ({ request }) => {
        const offset = new URL(request.url).searchParams.get('offset') ?? '0'
        offsets.push(offset)
        return HttpResponse.json(offset === '0' ? firstPage : [{ homebase_id: 2, date: '2026-11-05', hours: 3 }])
      }),
      restGet('timeclock_entries', [{ homebase_id: 2, date: '2026-11-06', hours_worked: 5 }]),
      restGet('de_hours', [{ homebase_id: 1, date: '2026-11-07', hours: 1.5 }]),
    )

    const result = await fetchCurrentMonthHours()

    expect(offsets).toEqual(['0', '1000'])
    // 1000 rows on the same date collapse to one entry per date (last write wins).
    expect(result.get(1)).toEqual({ inPerson: 0.01, de: 1.5 })
    expect(result.get(2)).toEqual({ inPerson: 8, de: 0 })
  })
})

describe('fetchAllGrades', () => {
  it('groups grades by student and drops homebase_id from each entry', async () => {
    server.use(restGet('grades', [
      { id: 1, homebase_id: 10, date: '2026-11-01', project: 'A', category: 'X', score: 90, notes: null },
      { id: 2, homebase_id: 11, date: '2026-11-01', project: 'B', category: 'Y', score: 80, notes: 'ok' },
      { id: 3, homebase_id: 10, date: '2026-10-01', project: 'C', category: 'Z', score: 70, notes: null },
    ]))

    const grades = await fetchAllGrades()

    expect(Object.keys(grades)).toEqual(['10', '11'])
    expect(grades[10].map(g => g.id)).toEqual([1, 3])
    expect(grades[10][0]).not.toHaveProperty('homebase_id')
  })
})

describe('submitDeHours', () => {
  const payload = { homebase_id: 1, date: '2026-11-01', hours: '2', module: 'M', platform: 'P', verified: false }

  it.each([
    [403, 'You do not have permission'],
    [409, 'already exists'],
    [422, 'Invalid data'],
    [429, 'Too many requests'],
    [503, 'Server error'],
    [400, 'Save failed'],
  ])('maps HTTP %i to a friendly message', async (status, message) => {
    server.use(http.post(`${REST}/de_hours`, () => new HttpResponse(null, { status })))
    await expect(submitDeHours(payload)).rejects.toThrow(message)
  })

  it('resolves on 201', async () => {
    server.use(http.post(`${REST}/de_hours`, () => new HttpResponse(null, { status: 201 })))
    await expect(submitDeHours(payload)).resolves.toBeUndefined()
  })
})

describe('fetchNeedsReviewEntries', () => {
  const entry = (id: string, homebase_id: number, date: string, auto_closed: boolean, breaks: unknown[] = []) => ({
    id, homebase_id, date, clock_in: `${date}T14:00:00Z`, clock_out: `${date}T23:00:00Z`, hours_worked: 9, auto_closed,
    timeclock_breaks: breaks,
  })

  it('returns entries with an auto-closed shift or break, deduplicated, named and sorted', async () => {
    server.use(
      restGet('timeclock_breaks', [{ entry_id: 'e2' }, { entry_id: 'e2' }, { entry_id: 'e1' }]),
      http.get(`${REST}/timeclock_entries`, ({ request }) => {
        const params = new URL(request.url).searchParams
        if (params.get('auto_closed') === 'eq.true') {
          return HttpResponse.json([entry('e1', 1, '2026-11-01', true)])
        }
        // The break-parent lookup: id=in.(e2,e1)
        expect(params.get('id')).toBe('in.(e2,e1)')
        return HttpResponse.json([
          entry('e1', 1, '2026-11-01', true),
          entry('e2', 2, '2026-11-03', false, [
            { id: 'b2', break_start: '2026-11-03T18:00:00Z', break_end: '2026-11-03T18:30:00Z', auto_closed: false },
            { id: 'b1', break_start: '2026-11-03T16:00:00Z', break_end: '2026-11-03T23:00:00Z', auto_closed: true },
          ]),
        ])
      }),
      // Student 2 has no profile row — should fall back to a placeholder name.
      restGet('profiles_view', [{ homebase_id: 1, name: 'jane smith' }]),
    )

    const rows = await fetchNeedsReviewEntries()

    expect(rows.map(r => r.id)).toEqual(['e2', 'e1'])
    expect(rows[0].student_name).toBe('Student 2')
    expect(rows[0].breaks.map(b => b.id)).toEqual(['b1', 'b2'])
    expect(rows[1].student_name).toBe('jane smith')
  })

  it('skips the follow-up queries when nothing is flagged', async () => {
    const requests = captureRequests()
    server.use(restGet('timeclock_breaks', []), restGet('timeclock_entries', []))

    expect(await fetchNeedsReviewEntries()).toEqual([])
    expect(requests.map(r => new URL(r.url).pathname)).toEqual([
      '/rest/v1/timeclock_breaks',
      '/rest/v1/timeclock_entries',
    ])
  })
})

describe('clearAutoClosedFlags', () => {
  it('clears only the auto_closed flag on the entry and its flagged breaks', async () => {
    const requests = captureRequests()
    server.use(
      http.patch(`${REST}/timeclock_entries`, () => new HttpResponse(null, { status: 204 })),
      http.patch(`${REST}/timeclock_breaks`, () => new HttpResponse(null, { status: 204 })),
    )

    await clearAutoClosedFlags('e1')

    const [entryReq, breakReq] = requests
    expect(await entryReq.json()).toEqual({ auto_closed: false })
    expect(new URL(entryReq.url).searchParams.get('id')).toBe('eq.e1')
    expect(await breakReq.json()).toEqual({ auto_closed: false })
    expect(new URL(breakReq.url).searchParams.get('entry_id')).toBe('eq.e1')
    expect(new URL(breakReq.url).searchParams.get('auto_closed')).toBe('eq.true')
  })
})
