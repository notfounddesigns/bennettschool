import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { JsonBodyType } from 'msw'
import { captureRequests, FN, http, HttpResponse, REST, restGet, server } from '../msw.ts'
import { useTimeclockStore } from '../../src/stores/timeclock.ts'

const MANAGER = { homebase_id: 1, name: 'pat manager', role_id: 3 }
const STUDENT = { homebase_id: 7, name: 'jane smith' }

beforeEach(() => { setActivePinia(createPinia()) })
afterEach(() => { useTimeclockStore().destroy() })

function mockPinLookup(session: JsonBodyType = null) {
  server.use(
    http.post(`${FN}/verify-pin`, async ({ request }) => {
      const { pin } = await request.json() as { pin: string }
      return pin === '123456'
        ? HttpResponse.json({ student: STUDENT })
        : HttpResponse.json({ error: 'not found' }, { status: 404 })
    }),
    restGet('timeclock_entries', session),
  )
}

async function enterPin(tc: ReturnType<typeof useTimeclockStore>, pin: string) {
  for (const d of pin) tc.appendDigit(d)
  await vi.waitFor(() => expect(tc.state).not.toBe('loading'))
}

describe('PIN entry', () => {
  it('ignores digits past 6 and deletes the last digit', () => {
    const tc = useTimeclockStore()
    tc.appendDigit('1')
    tc.appendDigit('2')
    tc.deleteDigit()
    expect(tc.pin).toBe('1')
  })

  it('a known PIN shows the action screen with the current status', async () => {
    mockPinLookup({ id: 'e1', clock_in: '2026-11-09T14:00:00Z', timeclock_breaks: [] })
    const tc = useTimeclockStore()

    await enterPin(tc, '123456')

    expect(tc.state).toBe('actions')
    expect(tc.student).toEqual(STUDENT)
    expect(tc.studentInitials).toBe('JS')
    expect(tc.clockStatus).toBe('clocked_in')
    expect(tc.statusLabel).toMatch(/^Clocked in since 8:00\sAM$/u)
  })

  it('an unknown PIN shows an error, then resets to the pad after 2.5s', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    try {
      mockPinLookup()
      const tc = useTimeclockStore()

      await enterPin(tc, '999999')

      expect(tc.state).toBe('error')
      expect(tc.errorMsg).toBe('PIN not recognized. Please try again.')
      expect(tc.showingCountdown).toBe(true)
      vi.advanceTimersByTime(2500)
      expect(tc.state).toBe('idle')
      expect(tc.pin).toBe('')
    } finally {
      vi.useRealTimers()
    }
  })

  it('keyboard: digits and Backspace work on the pad, Escape resets', () => {
    const tc = useTimeclockStore()
    tc.locked = false
    tc.onKeydown(new KeyboardEvent('keydown', { key: '4' }))
    tc.onKeydown(new KeyboardEvent('keydown', { key: '2' }))
    tc.onKeydown(new KeyboardEvent('keydown', { key: 'Backspace' }))
    expect(tc.pin).toBe('4')
    tc.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(tc.pin).toBe('')
  })

  it('keyboard input is ignored while the kiosk is locked', () => {
    const tc = useTimeclockStore()
    tc.onKeydown(new KeyboardEvent('keydown', { key: '4' }))
    expect(tc.pin).toBe('')
  })
})

describe('clock actions', () => {
  it('clocking in records the punch and shows a success message', async () => {
    mockPinLookup(null)
    const requests = captureRequests()
    server.use(http.post(`${REST}/timeclock_entries`, () => new HttpResponse(null, { status: 201 })))
    const tc = useTimeclockStore()
    await enterPin(tc, '123456')
    expect(tc.clockStatus).toBe('clocked_out')

    await tc.doClockIn()

    expect(tc.state).toBe('success')
    expect(tc.successMsg).toBe('You have been clocked in!')
    const insert = requests.find(r => r.method === 'POST' && r.url.includes('timeclock_entries'))!
    // No camera in tests, so the punch is recorded without a photo.
    expect(await insert.json()).toEqual({ homebase_id: 7, clock_in_photo_path: null })
  })

  it('ending a break targets the open break', async () => {
    mockPinLookup({
      id: 'e1',
      clock_in: '2026-11-09T14:00:00Z',
      timeclock_breaks: [{ id: 'b9', break_start: '2026-11-09T18:00:00Z', break_end: null }],
    })
    const requests = captureRequests()
    server.use(http.patch(`${REST}/timeclock_breaks`, () => new HttpResponse(null, { status: 204 })))
    const tc = useTimeclockStore()
    await enterPin(tc, '123456')
    expect(tc.clockStatus).toBe('on_break')

    await tc.doEndBreak()

    expect(tc.successMsg).toBe('Welcome back, jane smith!')
    const patch = requests.find(r => r.method === 'PATCH')!
    expect(new URL(patch.url).searchParams.get('id')).toBe('eq.b9')
  })

  it('a failed punch shows an error instead of success', async () => {
    mockPinLookup(null)
    server.use(http.post(`${REST}/timeclock_entries`, () => HttpResponse.json({ message: 'rls' }, { status: 403 })))
    const tc = useTimeclockStore()
    await enterPin(tc, '123456')

    await tc.doClockIn()

    expect(tc.state).toBe('error')
    expect(tc.errorMsg).toBe('Failed to clock in. Please try again.')
  })
})

describe('manager unlock', () => {
  function mockLogin(role_id: number, result: 'ok' | 'first_time' = 'ok') {
    server.use(http.post(`${FN}/auth-login`, () =>
      HttpResponse.json({ result, student: { ...MANAGER, role_id } })))
  }

  it.each([
    ['', 'pw', 'Please enter your first and last name.'],
    ['Pat Manager', '', 'Please enter your password.'],
    ['Pat', 'pw', 'Please enter your first and last name.'],
  ])('validates input: name=%j password=%j', async (name, password, message) => {
    const tc = useTimeclockStore()
    tc.loginName = name
    tc.loginPassword = password
    await tc.unlock()
    expect(tc.loginError).toBe(message)
    expect(tc.locked).toBe(true)
  })

  it('a manager unlocks the kiosk and the session is cached', async () => {
    mockLogin(3)
    const tc = useTimeclockStore()
    tc.loginName = 'Pat Manager'
    tc.loginPassword = 'secret'

    await tc.unlock()

    expect(tc.locked).toBe(false)
    expect(tc.loginPassword).toBe('')
    expect(JSON.parse(localStorage.getItem('kiosk_manager')!)).toMatchObject({ homebase_id: 1 })
  })

  it('a non-manager cannot unlock', async () => {
    mockLogin(1)
    const tc = useTimeclockStore()
    tc.loginName = 'Jane Smith'
    tc.loginPassword = 'secret'

    await tc.unlock()

    expect(tc.locked).toBe(true)
    expect(tc.loginError).toBe('Manager access is required to unlock the kiosk.')
    expect(localStorage.getItem('kiosk_manager')).toBeNull()
  })

  it('a first-time manager is told to set a password first', async () => {
    mockLogin(3, 'first_time')
    const tc = useTimeclockStore()
    tc.loginName = 'Pat Manager'
    tc.loginPassword = 'temp'

    await tc.unlock()

    expect(tc.locked).toBe(true)
    expect(tc.loginError).toMatch(/Set up your password/)
  })

  it('lock() clears the cached manager', async () => {
    mockLogin(3)
    const tc = useTimeclockStore()
    tc.loginName = 'Pat Manager'
    tc.loginPassword = 'secret'
    await tc.unlock()

    tc.lock()

    expect(tc.locked).toBe(true)
    expect(tc.manager).toBeNull()
    expect(localStorage.getItem('kiosk_manager')).toBeNull()
  })
})
