import { supabase } from './supabase'
import { getInitials, formatTime } from './helpers'

// ── Types ─────────────────────────────────────────────────────────────────

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

// ── API ───────────────────────────────────────────────────────────────────

export async function getStudentByPin(pin: string): Promise<TimeclockStudent | null> {
  const { data } = await supabase
    .from('profiles')
    .select('homebase_id, name')
    .eq('pin', pin)
    .maybeSingle()
  return data as TimeclockStudent | null
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

export async function clockIn(homebaseId: number): Promise<void> {
  const { error } = await supabase.from('timeclock_entries').insert({ homebase_id: homebaseId })
  if (error) throw new Error('Failed to clock in')
}

export async function clockOut(entryId: string): Promise<void> {
  const { error } = await supabase
    .from('timeclock_entries')
    .update({ clock_out: new Date().toISOString() })
    .eq('id', entryId)
  if (error) throw new Error('Failed to clock out')
}

export async function startBreak(entryId: string): Promise<void> {
  const { error } = await supabase.from('timeclock_breaks').insert({ entry_id: entryId })
  if (error) throw new Error('Failed to start break')
}

export async function endBreak(breakId: string): Promise<void> {
  const { error } = await supabase
    .from('timeclock_breaks')
    .update({ break_end: new Date().toISOString() })
    .eq('id', breakId)
  if (error) throw new Error('Failed to end break')
}

// Re-export helpers used by the store
export { getInitials, formatTime }
