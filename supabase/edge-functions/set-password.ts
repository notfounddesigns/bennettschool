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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // Use service role key so we can upsert without RLS restrictions
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let body: { homebase_id?: string; password?: string; name?: string; }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const { homebase_id, password, name } = body

  if (!homebase_id || !password) {
    return json({ error: 'homebase_id and password are required' }, 400)
  }

  let userName = "";
  if (!name) userName = "Invalid Name";
  else userName = name;

  if (password.length < 8) {
    return json({ error: 'Password must be at least 8 characters.' }, 400)
  }

  // hash password to store in db
  const storedPw = await hashPassword(password)

  // Upsert into profiles — creates the row if it's the very first login
  const { error } = await supabase
    .from('profiles')
    .upsert({ homebase_id, password_hash: storedPw, name: userName }, { onConflict: 'homebase_id' })

  if (error) {
    console.error('[auth-set-password] upsert error:', error.message)
    return json({ error: 'Could not save password. Please try again.' }, 500)
  }

  return json({ result: 'ok' })
})

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
}

function base64ToUint8Array(base64: string): Uint8Array {
  return new Uint8Array(atob(base64).split("").map(c => c.charCodeAt(0)))
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const encoder = new TextEncoder()

  const passwordKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  )

  const hashBuffer = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    passwordKey,
    256
  )

  // Store as "salt:hash" so you can retrieve both later
  return `${arrayBufferToBase64(salt.buffer)}:${arrayBufferToBase64(hashBuffer)}`
}