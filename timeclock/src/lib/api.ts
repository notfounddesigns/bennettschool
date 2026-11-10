import { supabase, PROXY, AUTH_HEADERS } from './supabase'

// ── Auth types ────────────────────────────────────────────────────────────

export interface Student {
  homebase_id: number
  name: string
  role_id: number
}

export interface LoginResult {
  result: 'first_time' | 'ok'
  student: Student
  // The auth-login function nests its error under `data`; a few paths return a
  // flat `error`. Read both so real messages surface instead of a generic one.
  data?: { error?: string }
  error?: string
}

// ── Auth API ──────────────────────────────────────────────────────────────

export async function loginEmployee(
  first: string,
  last: string,
  password: string,
): Promise<{ result: 'first_time' | 'ok'; student: Student }> {
  const res = await fetch(`${PROXY}/auth-login`, {
    method: 'POST',
    headers: AUTH_HEADERS,
    body: JSON.stringify({
      first_name: first.toLowerCase(),
      last_name: last.toLowerCase(),
      password,
    }),
  })
  const result = await res.json() as LoginResult
  if (!res.ok) throw new Error(result.data?.error ?? result.error ?? 'Login failed. Please try again.')
  return result
}

export async function validateCachedEmployee(employeeId: number): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('homebase_id')
    .eq('homebase_id', employeeId)
    .single()
  return !!data
}

// ── Timeclock types ───────────────────────────────────────────────────────

export interface TimeclockStudent {
  homebase_id: number
  name: string
}

export interface ActiveBreak {
  id: string
  break_start: string
}

export interface ActiveSession {
  id: string
  clock_in: string
  activeBreak: ActiveBreak | null
}

// ── Timeclock API ─────────────────────────────────────────────────────────

export async function getStudentByPin(pin: string): Promise<TimeclockStudent | null> {
  const res = await fetch(`${PROXY}/verify-pin`, {
    method: 'POST',
    headers: AUTH_HEADERS,
    body: JSON.stringify({ pin }),
  })
  if (!res.ok) return null
  const data = await res.json() as { student: TimeclockStudent | null }
  return data.student
}

export async function getActiveSession(homebaseId: number): Promise<ActiveSession | null> {
  const { data, error } = await supabase
    .from('timeclock_entries')
    .select('id, clock_in, timeclock_breaks(id, break_start, break_end)')
    .eq('homebase_id', homebaseId)
    .is('clock_out', null)
    .order('clock_in', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error('Failed to fetch session')
  if (!data) return null

  const entry = data as {
    id: string
    clock_in: string
    timeclock_breaks: Array<{ id: string; break_start: string; break_end: string | null }>
  }

  const openBreak = entry.timeclock_breaks.find(b => !b.break_end) ?? null

  return {
    id: entry.id,
    clock_in: entry.clock_in,
    activeBreak: openBreak ? { id: openBreak.id, break_start: openBreak.break_start } : null,
  }
}

const PUNCH_PHOTOS_BUCKET = 'punch-photos'

export async function uploadPunchPhoto(homebaseId: number, photo: Blob): Promise<string | null> {
  const path = `${homebaseId}/${Date.now()}.jpg`
  const { error } = await supabase.storage
    .from(PUNCH_PHOTOS_BUCKET)
    .upload(path, photo, { contentType: 'image/jpeg' })
  if (error) return null
  return path
}

export async function clockIn(homebaseId: number, photoPath: string | null): Promise<void> {
  const { error } = await supabase
    .from('timeclock_entries')
    .insert({ homebase_id: homebaseId, clock_in_photo_path: photoPath })
  if (error) throw new Error('Failed to clock in')
}

export async function clockOut(entryId: string, photoPath: string | null): Promise<void> {
  const { error } = await supabase
    .from('timeclock_entries')
    .update({ clock_out: new Date().toISOString(), clock_out_photo_path: photoPath })
    .eq('id', entryId)
  if (error) throw new Error('Failed to clock out')
}

export async function startBreak(entryId: string, photoPath: string | null): Promise<void> {
  const { error } = await supabase
    .from('timeclock_breaks')
    .insert({ entry_id: entryId, break_start_photo_path: photoPath })
  if (error) throw new Error('Failed to start break')
}

export async function endBreak(breakId: string, photoPath: string | null): Promise<void> {
  const { error } = await supabase
    .from('timeclock_breaks')
    .update({ break_end: new Date().toISOString(), break_end_photo_path: photoPath })
    .eq('id', breakId)
  if (error) throw new Error('Failed to end break')
}

// ── Audit log ─────────────────────────────────────────────────────────────

export type AuditAction = 'login' | 'logout'

export async function logAuditEvent(entry: {
  actor_id: number | null
  actor_name: string | null
  action: AuditAction
  target_id?: string | number | null
  target_name?: string | null
  description?: string | null
  metadata?: Record<string, unknown> | null
}): Promise<void> {
  const { error } = await supabase.from('audit_log').insert({
    actor_id: entry.actor_id,
    actor_name: entry.actor_name,
    action: entry.action,
    target_id: entry.target_id != null ? String(entry.target_id) : null,
    target_name: entry.target_name ?? null,
    description: entry.description ?? null,
    metadata: entry.metadata ?? null,
  })
  if (error) throw new Error('Failed to write audit log entry')
}
