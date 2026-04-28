import { createClient } from '@supabase/supabase-js'
import axios from 'axios'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string
export const PROXY = `${SUPABASE_URL}/functions/v1`

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export const proxyClient = axios.create({
  baseURL: PROXY,
  headers: {
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  },
})
