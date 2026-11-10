import { http, HttpResponse, type JsonBodyType } from 'msw'
import { setupServer } from 'msw/node'

export const SUPABASE_URL = 'http://supabase.test'
export const REST = `${SUPABASE_URL}/rest/v1`
export const FN = `${SUPABASE_URL}/functions/v1`

// Default handlers shared by every test. Individual tests add their own with
// server.use(...), which take precedence and are reset after each test.
export const server = setupServer(
  // Audit writes are fire-and-forget throughout the app; accept them silently.
  http.post(`${REST}/audit_log`, () => new HttpResponse(null, { status: 201 })),
)

// Records every request MSW sees, so tests can assert on what was sent.
// Listeners are cleared after each test in setup.ts.
export function captureRequests() {
  const requests: Request[] = []
  server.events.on('request:start', ({ request }) => { requests.push(request.clone()) })
  return requests
}

// A PostgREST GET on `table` that responds with `body`. For supabase-js
// `.single()` / `.maybeSingle()` calls pass an object; otherwise an array.
export function restGet(table: string, body: JsonBodyType, status = 200) {
  return http.get(`${REST}/${table}`, () => HttpResponse.json(body, { status }))
}

export { http, HttpResponse }
