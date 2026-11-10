import { createClient } from '@supabase/supabase-js'
import axios from 'axios'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string
export const PROXY = `${SUPABASE_URL}/functions/v1`

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Edge functions. Never throws on HTTP status — callers inspect `status` so they
// can surface the server's own error message, exactly as the original app did.
export const proxyClient = axios.create({
  baseURL: PROXY,
  headers: {
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  },
  validateStatus: () => true,
})

// PostgREST inserts that need raw status codes (409 duplicate, 403, …).
export const restClient = axios.create({
  baseURL: `${SUPABASE_URL}/rest/v1`,
  headers: {
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    apikey: SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  },
  validateStatus: () => true,
})
