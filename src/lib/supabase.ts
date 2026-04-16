import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://wivquwyesxwcysjgtuji.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_inqQrSuwsDxQ3WnPPlxHRA_Lz9UDtA1';
export const PROXY = `${SUPABASE_URL}/functions/v1`;
export const AUTH_HEADERS: Record<string, string> = {
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
