import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { captureRequests, restGet, server } from '../msw.ts'

const student = { homebase_id: 7, name: 'jane smith', role_id: 1 }
const manager = { homebase_id: 1, name: 'pat manager', role_id: 3 }

// The router is a module singleton holding the current route and the guard,
// so load a fresh copy for every test.
async function freshRouter() {
  vi.resetModules()
  setActivePinia(createPinia())
  const { default: router } = await import('../../src/router/index.ts')
  const { useAppStore } = await import('../../src/stores/app.ts')
  return { router, app: useAppStore() }
}

beforeEach(() => {
  // Views are lazy-loaded; every test that navigates resolves at least one.
  server.use(restGet('profiles', { homebase_id: 7 }))
})

describe('route guards', () => {
  it('sends signed-out users to /login', async () => {
    const { router } = await freshRouter()
    await router.push('/dashboard')
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('restores a saved session after checking the profile still exists', async () => {
    const requests = captureRequests()
    localStorage.setItem('employee', JSON.stringify(student))
    const { router, app } = await freshRouter()

    await router.push('/login')

    expect(router.currentRoute.value.path).toBe('/dashboard')
    expect(app.currentEmployee).toEqual(student)
    expect(new URL(requests[0].url).searchParams.get('homebase_id')).toBe('eq.7')
  })

  it('drops a saved session whose profile is gone', async () => {
    server.use(restGet('profiles', { code: 'PGRST116', message: 'no rows' }, 406))
    localStorage.setItem('employee', JSON.stringify(student))
    const { router, app } = await freshRouter()

    await router.push('/dashboard')

    expect(router.currentRoute.value.path).toBe('/login')
    expect(app.currentEmployee).toBeNull()
    expect(localStorage.getItem('employee')).toBeNull()
  })

  it('keeps students out of /mgmt', async () => {
    localStorage.setItem('employee', JSON.stringify(student))
    const { router } = await freshRouter()
    await router.push('/mgmt')
    expect(router.currentRoute.value.path).toBe('/dashboard')
  })

  it('managers only reach /dashboard while viewing as a student, and leaving ends it', async () => {
    localStorage.setItem('employee', JSON.stringify(manager))
    const { router, app } = await freshRouter()

    await router.push('/dashboard')
    expect(router.currentRoute.value.path).toBe('/mgmt')

    app.viewAsStudent(student)
    await router.push('/dashboard')
    expect(router.currentRoute.value.path).toBe('/dashboard')

    await router.push('/mgmt')
    expect(app.isImpersonating).toBe(false)
  })
})
