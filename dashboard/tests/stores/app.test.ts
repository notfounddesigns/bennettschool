import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { captureRequests } from '../msw.ts'
import { MANAGER_ROLE_ID, useAppStore } from '../../src/stores/app.ts'

const student = { homebase_id: 7, name: 'jane smith', role_id: 1 }
const manager = { homebase_id: 1, name: 'pat manager', role_id: MANAGER_ROLE_ID }

beforeEach(() => { setActivePinia(createPinia()) })

describe('session persistence', () => {
  it('setEmployee stores the user in localStorage and readStoredEmployee reads it back', () => {
    const app = useAppStore()
    app.setEmployee(student)
    expect(JSON.parse(localStorage.getItem('employee')!)).toEqual(student)
    expect(app.readStoredEmployee()).toEqual(student)
  })

  it('discards a corrupt stored session', () => {
    localStorage.setItem('employee', '{not json')
    expect(useAppStore().readStoredEmployee()).toBeNull()
    expect(localStorage.getItem('employee')).toBeNull()
  })

  it('clearEmployee also ends impersonation', () => {
    const app = useAppStore()
    app.setEmployee(manager)
    app.viewAsStudent(student)
    app.clearEmployee()
    expect(app.currentEmployee).toBeNull()
    expect(app.isImpersonating).toBe(false)
    expect(localStorage.getItem('employee')).toBeNull()
  })
})

describe('identity', () => {
  it('a manager viewing as a student sees the student, but is still a manager', () => {
    const app = useAppStore()
    app.setEmployee(manager)
    app.viewAsStudent(student)

    expect(app.isManager).toBe(true)
    expect(app.activeEmployee).toEqual(student)
    expect(app.displayName).toBe('Jane Smith')
    expect(app.avatarInitials).toBe('JS')

    app.exitImpersonation()
    expect(app.displayName).toBe('Pat Manager')
  })

  it('impersonation is never persisted', () => {
    const app = useAppStore()
    app.setEmployee(manager)
    app.viewAsStudent(student)
    expect(JSON.parse(localStorage.getItem('employee')!)).toEqual(manager)
  })
})

describe('showSnackbar', () => {
  it('hides itself after the duration', () => {
    vi.useFakeTimers()
    try {
      const app = useAppStore()
      app.showSnackbar('Saved', 'success', 1000)
      expect(app.snackbar).toEqual({ message: 'Saved', type: 'success', visible: true })
      vi.advanceTimersByTime(999)
      expect(app.snackbar.visible).toBe(true)
      vi.advanceTimersByTime(1)
      expect(app.snackbar.visible).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('audit', () => {
  it('writes an audit_log row attributed to the real (not impersonated) user', async () => {
    const requests = captureRequests()
    const app = useAppStore()
    app.setEmployee(manager)
    app.viewAsStudent(student)

    app.audit('view_as_student', { targetId: 7, targetName: 'jane smith' })

    await vi.waitFor(() => expect(requests).toHaveLength(1))
    expect(await requests[0].json()).toEqual({
      actor_id: 1,
      actor_name: 'pat manager',
      action: 'view_as_student',
      target_id: '7',
      target_name: 'jane smith',
      description: null,
      metadata: null,
    })
  })
})
