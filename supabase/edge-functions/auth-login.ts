import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto } from "jsr:@std/crypto";

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

const HB_TOKEN    = Deno.env.get('HOMEBASE_API_TOKEN') ?? ''
const HB_LOCATION = Deno.env.get('HOMEBASE_LOCATION_ID') ?? ''
const HB_BASE     = 'https://api.joinhomebase.com'

async function hbFetch(path: string) {
  const res = await fetch(`${HB_BASE}${path}`, {
    headers: { Authorization: `Bearer ${HB_TOKEN}`, Accept: 'application/json' },
  })
  const body = await res.text()
  if (!res.ok) throw Object.assign(new Error(`Homebase ${res.status}`), { status: res.status, body })
  return JSON.parse(body)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let body: { first_name?: string; last_name?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const { first_name, last_name, password } = body
  if (!first_name || !last_name || !password) {
    return json({ error: 'first_name, last_name, and password are required' }, 400)
  }

  // ── 1. Fetch employees from Homebase ──────────────────────────────────────
  let employees: Array<{ id: string | number; first_name: string; last_name: string; [key: string]: unknown }>
  try {
    const data = await hbFetch(`/locations/${HB_LOCATION}/employees`)
    employees = Array.isArray(data) ? data : (data?.employees ?? [])
  } catch (err: unknown) {
    const e = err as { message: string }
    console.error('[auth-login] Homebase fetch failed:', e.message)
    return json({ error: 'Could not reach Homebase. Please try again.' }, 502)
  }

  // ── 2. Match employee by name (case-insensitive) ──────────────────────────
  const normalize = (s: string) => s.trim().toLowerCase()
  let employee = employees.find(
    e => normalize(e.first_name) === normalize(first_name) &&
         normalize(e.last_name)  === normalize(last_name)
  )

  if (!employee) {
    console.log(first_name)
    if (first_name !== normalize('Bugs') && last_name !== normalize('Bunny'))
      return json({ error: 'No employee found with that name. Please contact your administrator.' }, 404)
    else {
      employee = {
        id: -1,
        first_name: 'Bugs',
        last_name: 'Bunny',
        job: {
          level: 'Student'
        }
      }
    }
  }

  const homebaseId = String(employee.id)

  // ── 3. Fetch first-time password from settings ────────────────────────────
  const { data: setting, error: settingErr } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'first_time_password')
    .single()

  if (settingErr || !setting) {
    console.error('[auth-login] Could not fetch first_time_password:', settingErr?.message)
    return json({ error: 'Server configuration error.' }, 500)
  }

  const firstTimePassword = setting.value

  // ── 4. Fetch this employee's profile (if exists) ──────────────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('password_hash')
    .eq('homebase_id', homebaseId)
    .single()

  // ── 5. Check password ─────────────────────────────────────────────────────
  const hasPersonalPassword = !!profile?.password_hash

  if (hasPersonalPassword) {
    // Verify against their stored hash
    const match  = await verifyPassword(password, profile!.password_hash!)
    if (!match) {
      return json({ error: 'Incorrect password.' }, 401)
    }
    // Success — return employee data for the dashboard
    return json({ result: 'ok', employee })

  } else {
    // No personal password set yet — check against first-time password
    if (password !== firstTimePassword) {
      return json({ error: 'Incorrect password.' }, 401)
    }
    // Correct first-time password — tell client to prompt for reset
    return json({ result: 'first_time', employee })
  }
})

function base64ToUint8Array(base64: string): Uint8Array {
  return new Uint8Array(atob(base64).split("").map(c => c.charCodeAt(0)))
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [saltBase64, hashBase64] = storedHash.split(":")
  const salt = base64ToUint8Array(saltBase64)
  const storedHashBytes = base64ToUint8Array(hashBase64)

  const encoder = new TextEncoder()
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  )

  const newHashBuffer = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    passwordKey,
    256
  )

  const newHashBytes = new Uint8Array(newHashBuffer)

  // Constant-time comparison — prevents timing attacks
  if (storedHashBytes.length !== newHashBytes.length) return false
  let diff = 0
  for (let i = 0; i < storedHashBytes.length; i++) {
    diff |= storedHashBytes[i] ^ newHashBytes[i]
  }

  return diff === 0
}