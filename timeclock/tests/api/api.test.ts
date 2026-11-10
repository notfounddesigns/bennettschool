import { describe, expect, it } from 'vitest'
import { captureRequests, FN, http, HttpResponse, REST, restGet, server } from '../msw.ts'
import { clockIn, endBreak, getActiveSession, getStudentByPin, loginEmployee } from '../../src/lib/api.ts'
import { SUPABASE_URL } from '../../src/lib/supabase.ts'

it('the app is pointed at the fake test host, not a real Supabase project', () => {
  expect(SUPABASE_URL).toBe('http://supabase.test')
})

describe('getStudentByPin', () => {
  it('returns the student for a known PIN', async () => {
    const requests = captureRequests()
    server.use(http.post(`${FN}/verify-pin`, () =>
      HttpResponse.json({ student: { homebase_id: 7, name: 'jane smith' } })))

    expect(await getStudentByPin('123456')).toEqual({ homebase_id: 7, name: 'jane smith' })
    expect(await requests[0].json()).toEqual({ pin: '123456' })
    expect(requests[0].headers.get('authorization')).toBe('Bearer test-anon-key')
  })

  it('returns null when the PIN is rejected', async () => {
    server.use(http.post(`${FN}/verify-pin`, () => HttpResponse.json({ error: 'nope' }, { status: 404 })))
    expect(await getStudentByPin('000000')).toBeNull()
  })
})

describe('getActiveSession', () => {
  it('returns null when the student is clocked out', async () => {
    server.use(restGet('timeclock_entries', null))
    expect(await getActiveSession(7)).toBeNull()
  })

  it('finds the open break, ignoring finished ones', async () => {
    const requests = captureRequests()
    server.use(restGet('timeclock_entries', {
      id: 'e1',
      clock_in: '2026-11-09T14:00:00Z',
      timeclock_breaks: [
        { id: 'b1', break_start: '2026-11-09T16:00:00Z', break_end: '2026-11-09T16:15:00Z' },
        { id: 'b2', break_start: '2026-11-09T18:00:00Z', break_end: null },
      ],
    }))

    expect(await getActiveSession(7)).toEqual({
      id: 'e1',
      clock_in: '2026-11-09T14:00:00Z',
      activeBreak: { id: 'b2', break_start: '2026-11-09T18:00:00Z' },
    })
    const params = new URL(requests[0].url).searchParams
    expect(params.get('homebase_id')).toBe('eq.7')
    expect(params.get('clock_out')).toBe('is.null')
  })

  it('throws on a query error', async () => {
    server.use(restGet('timeclock_entries', { message: 'boom' }, 500))
    await expect(getActiveSession(7)).rejects.toThrow('Failed to fetch session')
  })
})

describe('punches', () => {
  it('clockIn inserts an entry for the student', async () => {
    const requests = captureRequests()
    server.use(http.post(`${REST}/timeclock_entries`, () => new HttpResponse(null, { status: 201 })))

    await clockIn(7, '7/123.jpg')

    expect(await requests[0].json()).toEqual({ homebase_id: 7, clock_in_photo_path: '7/123.jpg' })
  })

  it('endBreak stamps break_end on that break only', async () => {
    const requests = captureRequests()
    server.use(http.patch(`${REST}/timeclock_breaks`, () => new HttpResponse(null, { status: 204 })))

    await endBreak('b2', null)

    const body = await requests[0].json()
    expect(Date.parse(body.break_end)).not.toBeNaN()
    expect(body.break_end_photo_path).toBeNull()
    expect(new URL(requests[0].url).searchParams.get('id')).toBe('eq.b2')
  })

  it('throws a friendly error when the insert is rejected', async () => {
    server.use(http.post(`${REST}/timeclock_entries`, () => HttpResponse.json({ message: 'rls' }, { status: 403 })))
    await expect(clockIn(7, null)).rejects.toThrow('Failed to clock in')
  })
})

describe('loginEmployee', () => {
  it('surfaces a nested server error', async () => {
    server.use(http.post(`${FN}/auth-login`, () => HttpResponse.json({ data: { error: 'Wrong password' } }, { status: 401 })))
    await expect(loginEmployee('A', 'B', 'c')).rejects.toThrow('Wrong password')
  })
})
