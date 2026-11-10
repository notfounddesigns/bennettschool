import { afterAll, afterEach, beforeAll, expect } from 'vitest'
import { server, SUPABASE_URL } from './msw.ts'

// Hard stop: never run tests against a real Supabase project. If env loading
// ever changes and picks up dashboard/.env, every test file fails here before
// a single request is made.
if (import.meta.env.VITE_SUPABASE_URL !== SUPABASE_URL) {
  throw new Error(
    `Refusing to run tests: VITE_SUPABASE_URL is "${import.meta.env.VITE_SUPABASE_URL}", expected "${SUPABASE_URL}".`,
  )
}

// Requests with no matching handler are blocked by MSW. App code often
// swallows the resulting network error, so collect them and fail the test
// explicitly instead of letting it pass by accident.
const unhandled: string[] = []
beforeAll(() => server.listen({
  onUnhandledRequest(request) {
    unhandled.push(`${request.method} ${request.url}`)
    // Throwing is what blocks the request; returning (or only logging) lets
    // MSW pass it through to the real network.
    throw new Error(`[msw] Blocked unhandled request: ${request.method} ${request.url}`)
  },
}))

afterEach(() => {
  server.resetHandlers()
  server.events.removeAllListeners()
  localStorage.clear()
  const leaked = unhandled.splice(0)
  expect(leaked, 'Requests with no MSW handler (add one with server.use)').toEqual([])
})

afterAll(() => server.close())
