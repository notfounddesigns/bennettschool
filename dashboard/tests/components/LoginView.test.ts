import { beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { captureRequests, FN, http, HttpResponse, server } from '../msw.ts'
import LoginView from '../../src/views/LoginView.vue'
import { useAppStore } from '../../src/stores/app.ts'

const Stub = { template: '<div />' }
let pinia: Pinia
let router: Router

beforeEach(async () => {
  pinia = createPinia()
  setActivePinia(pinia)
  router = createRouter({
    history: createMemoryHistory(),
    routes: ['/login', '/setpass', '/dashboard', '/mgmt'].map(path => ({ path, component: Stub })),
  })
  await router.push('/login')
})

function mountLogin() {
  return mount(LoginView, { global: { plugins: [pinia, router] } })
}

async function fillAndSubmit(wrapper: ReturnType<typeof mountLogin>, name: string, password: string) {
  await wrapper.find('#login-name').setValue(name)
  await wrapper.find('#login-password').setValue(password)
  await wrapper.find('button').trigger('click')
  await flushPromises()
}

function mockLogin(result: 'ok' | 'first_time', role_id: number) {
  server.use(http.post(`${FN}/auth-login`, () =>
    HttpResponse.json({ result, student: { homebase_id: 5, name: 'jane smith', role_id } })))
}

describe('LoginView validation (no network)', () => {
  it.each([
    ['', 'pw', 'Please enter your first and last name.'],
    ['Jane Smith', '', 'Please enter your password.'],
    ['Jane', 'pw', 'Please enter your first and last name.'],
  ])('name=%j password=%j → %s', async (name, password, message) => {
    const wrapper = mountLogin()
    await fillAndSubmit(wrapper, name, password)
    expect(wrapper.text()).toContain(message)
  })
})

describe('LoginView sign-in', () => {
  it('sends a student to the dashboard and remembers them', async () => {
    mockLogin('ok', 1)
    await fillAndSubmit(mountLogin(), 'Jane Smith', 'secret')

    expect(router.currentRoute.value.path).toBe('/dashboard')
    expect(useAppStore().currentEmployee?.homebase_id).toBe(5)
  })

  it('sends a manager to management', async () => {
    mockLogin('ok', 3)
    await fillAndSubmit(mountLogin(), 'Jane Smith', 'secret')
    expect(router.currentRoute.value.path).toBe('/mgmt')
  })

  it('sends a first-time user to set a password', async () => {
    mockLogin('first_time', 1)
    await fillAndSubmit(mountLogin(), 'Jane Smith', '')
    // Password is required by the form even for first-time users.
    expect(router.currentRoute.value.path).toBe('/login')

    await fillAndSubmit(mountLogin(), 'Jane Smith', 'temp')
    expect(router.currentRoute.value.path).toBe('/setpass')
  })

  it('normalizes iPad smart apostrophes in names', async () => {
    const requests = captureRequests()
    mockLogin('ok', 1)
    await fillAndSubmit(mountLogin(), 'Shaq O’Neal', 'secret')

    const body = await requests.find(r => r.url.endsWith('/auth-login'))!.json()
    expect(body.last_name).toBe("o'neal")
  })

  it('shows the server error and clears the password field', async () => {
    server.use(http.post(`${FN}/auth-login`, () =>
      HttpResponse.json({ data: { error: 'Incorrect password.' } }, { status: 401 })))
    const wrapper = mountLogin()
    await fillAndSubmit(wrapper, 'Jane Smith', 'wrong')

    expect(wrapper.text()).toContain('Incorrect password.')
    expect((wrapper.find('#login-password').element as HTMLInputElement).value).toBe('')
    expect(router.currentRoute.value.path).toBe('/login')
  })
})
