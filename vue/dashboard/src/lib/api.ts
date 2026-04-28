import { supabase, proxyClient } from './supabase'
import { fmtFloat, nDaysAgo } from './helpers'

// ── Types ─────────────────────────────────────────────────────────────────

export interface Employee {
  id: number
  first_name: string
  last_name: string
  job: { level: string }
}

export interface HoursType {
  id: number
  name: string
}

export interface HourEntry {
  date: string
  hours: number
}

export interface DeEntry {
  date: string
  hours: number
  module: string
  platform: string
  verified: boolean
}

export interface GradeEntry {
  date: string
  project: string
  category: string
  score: number
  notes: string | null
}

export interface StudentDashboard {
  totalHrsAll: number
  hrsToGrad: number
  percentComplete: number
  inPersonHrs: number
  deHrs: number
  inPersonHrsList: HourEntry[]
  deHrsList: DeEntry[]
  grades: GradeEntry[]
}

export interface MgmtEmployee {
  homebase_id: number
  name: string
  in_person_hrs: string
  de_hrs: string
  total_hrs: number
  hrs_to_graduate: number
  percent_complete: number
}

export interface SyncRecord {
  synced_at: string
  date_synced: string
  inserted: number
  synced_by: string | null
}

export interface HomebaseEmployee {
  id: number
  first_name: string
  last_name: string
}

export interface TimeclockStatusEntry {
  name: string
  date: string
  clock_in: string
  clock_out: string | null
  is_clocked_in: boolean
  on_break: boolean
  worked_hours: number | null
}

export interface OverviewStats {
  yesterday: { hours: number; students: number }
  last7Days: { hours: number; students: number }
  mtd: { hours: number; students: number }
}

// ── Auth ──────────────────────────────────────────────────────────────────

export async function loginEmployee(
  first: string,
  last: string,
  password: string,
): Promise<{ result: 'first_time' | 'ok'; employee: Employee }> {
  const { data } = await proxyClient.post<{ result: 'first_time' | 'ok'; employee: Employee; error?: string }>(
    '/auth-login',
    { first_name: first.toLowerCase(), last_name: last.toLowerCase(), password },
  )
  return data
}

export async function setEmployeePassword(
  homebaseId: number,
  fullName: string,
  password: string,
): Promise<void> {
  await proxyClient.post('/set-password', {
    homebase_id: String(homebaseId),
    password,
    name: fullName,
  })
}

export async function validateCachedEmployee(employeeId: number): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('homebase_id')
    .eq('homebase_id', employeeId)
    .single()
  return !!data
}

// ── Dashboard ─────────────────────────────────────────────────────────────

export async function fetchStudentDashboard(employeeUserId: number): Promise<StudentDashboard> {
  const daysAgo7 = nDaysAgo(7)

  const [
    { data: profile, error: profileError },
    { data: hours, error: hoursError },
    { data: gradesData },
  ] = await Promise.all([
    supabase
      .from('profiles_view')
      .select('homebase_id, name, total_hrs, hrs_to_graduate, percent_complete, hours(type_id, hours)')
      .eq('homebase_id', employeeUserId)
      .single(),
    supabase
      .from('hours')
      .select('type_id, hours, date, module, platform, verified')
      .eq('homebase_id', employeeUserId)
      .gte('date', daysAgo7),
    supabase
      .from('grades')
      .select('date, project, category, score, notes')
      .eq('homebase_id', employeeUserId)
      .order('date', { ascending: false }),
  ])

  if (profileError || hoursError) throw new Error('Failed to load dashboard')

  const profileHours = (profile as { hours: Array<{ type_id: number; hours: number }> }).hours ?? []
  const inPersonHrs = profileHours.filter(h => h.type_id === 1).reduce((sum, h) => sum + (h.hours ?? 0), 0)
  const deHrs = profileHours.filter(h => h.type_id === 2).reduce((sum, h) => sum + (h.hours ?? 0), 0)

  const rawHours = (hours as Array<{ type_id: number; hours: number; date: string; module: string; platform: string; verified: boolean }>) ?? []

  const inPersonHrsList: HourEntry[] = rawHours
    .filter(h => h.type_id === 1)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .map(({ date, hours: h }) => ({ date, hours: h }))

  const deHrsList: DeEntry[] = rawHours
    .filter(h => h.type_id === 2)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .map(({ date, hours: h, module, platform, verified }) => ({ date, hours: h, module, platform, verified }))

  const p = profile as { total_hrs: number; hrs_to_graduate: number; percent_complete: number }

  return {
    totalHrsAll: p.total_hrs ?? 0,
    hrsToGrad: p.hrs_to_graduate ?? 0,
    percentComplete: p.percent_complete ?? 0,
    inPersonHrs,
    deHrs,
    inPersonHrsList,
    deHrsList,
    grades: (gradesData as GradeEntry[]) ?? [],
  }
}

// ── Management ────────────────────────────────────────────────────────────

export async function fetchEmployeeTable(): Promise<MgmtEmployee[]> {
  const { data, error } = await supabase
    .from('profiles_view')
    .select('homebase_id, name, role_id, role_name, total_hrs, hrs_to_graduate, percent_complete, hours')
    .order('name')

  if (error) throw new Error('Failed to load employees')

  return (data as Array<{
    homebase_id: number
    name: string
    role_id: number
    total_hrs: number
    hrs_to_graduate: number
    percent_complete: number
    hours: Array<{ type_id: number; hours: number }>
  }>)
    .filter(emp => emp.role_id === 1)
    .map(emp => {
      const inPersonHrs = emp.hours.filter(h => h.type_id !== 2).reduce((sum, h) => sum + (h.hours ?? 0), 0)
      const deHrs = emp.hours.filter(h => h.type_id === 2).reduce((sum, h) => sum + (h.hours ?? 0), 0)
      return {
        homebase_id: emp.homebase_id,
        name: emp.name,
        in_person_hrs: fmtFloat(inPersonHrs),
        de_hrs: fmtFloat(deHrs),
        total_hrs: emp.total_hrs ?? 0,
        hrs_to_graduate: emp.hrs_to_graduate ?? 0,
        percent_complete: emp.percent_complete ?? 0,
      }
    })
}

export async function fetchCurrentStudents(): Promise<TimeclockStatusEntry[]> {
  const { data, error } = await supabase
    .from('timeclock_status')
    .select('name, date, clock_in, clock_out, is_clocked_in, on_break, worked_hours')
    .order('clock_in', { ascending: false })
  if (error) throw new Error('Failed to load timeclock entries')
  return (data ?? []) as TimeclockStatusEntry[]
}

export async function fetchLastSync(): Promise<SyncRecord | null> {
  const { data } = await supabase
    .from('sync_log')
    .select('synced_at, date_synced, inserted, synced_by')
    .order('date_synced', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data as SyncRecord | null
}

export async function fetchOverviewStats(): Promise<OverviewStats> {
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]
  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0]
  const mtdStartStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const startDate = mtdStartStr < sevenDaysAgoStr ? mtdStartStr : sevenDaysAgoStr

  const { data } = await supabase
    .from('hours')
    .select('hours, date, type_id, homebase_id')
    .neq('type_id', 2)
    .gte('date', startDate)

  const rows = (data ?? []) as Array<{ hours: number; date: string; homebase_id: number }>
  rows.forEach(r => { r.date = r.date.split('T')[0] })

  const yRows = rows.filter(r => r.date === yesterdayStr)
  const w7Rows = rows.filter(r => r.date >= sevenDaysAgoStr)
  const mRows = rows.filter(r => r.date >= mtdStartStr)
  const sum = (a: typeof rows) => a.reduce((s, r) => s + (r.hours ?? 0), 0)
  const uniq = (a: typeof rows) => new Set(a.map(r => r.homebase_id)).size

  return {
    yesterday: { hours: sum(yRows), students: uniq(yRows) },
    last7Days: { hours: sum(w7Rows), students: uniq(w7Rows) },
    mtd: { hours: sum(mRows), students: uniq(mRows) },
  }
}

export async function loadStudents(): Promise<HomebaseEmployee[]> {
  const params = new URLSearchParams({ resource: 'employees' })
  const { data } = await proxyClient.get<HomebaseEmployee[]>(`/homebase?${params}`)
  return data
}

export async function syncHoursByDate(date: string, synced_by: string): Promise<{ inserted: number }> {
  const { data } = await proxyClient.post<{ result: string; inserted?: number; error?: string }>(
    '/sync-hours-by-date',
    { date },
  )
  if (data.result !== 'ok') throw new Error(data.error ?? 'Sync failed')

  await supabase.from('sync_log').insert({ date_synced: date, inserted: data.inserted ?? 0, synced_by }).throwOnError()

  return { inserted: data.inserted ?? 0 }
}

export async function submitHours(payload: {
  homebase_id: number
  type_id: number
  date: string
  hours: string
  module: string
  platform: string
  verified: boolean
}): Promise<void> {
  const { error } = await supabase.from('hours').insert({ ...payload, hours: parseFloat(payload.hours) })
  if (error?.code === '23505') throw new Error('A matching hours entry for this student and date already exists.')
  if (error) throw new Error('Save failed')
}

export async function submitGradeEntry(payload: {
  homebase_id: number
  date: string
  project: string
  category: string
  score: number
  notes: string | null
}): Promise<void> {
  const { error } = await supabase.from('grades').insert(payload)
  if (error) throw new Error('Save failed')
}

export async function exportStudents(month: number, year: number): Promise<Blob> {
  const { data } = await proxyClient.get<Blob>(`/export-students?month=${month}&year=${year}`, {
    responseType: 'blob',
  })
  return data
}

export async function setStudentPin(homebaseId: number, pin: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ pin }).eq('homebase_id', homebaseId)
  if (error) throw new Error('Failed to set PIN')
}

export function subscribeToTimeclock(onChanged: () => void) {
  return supabase
    .channel('timeclock-watch')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'timeclock_entries' }, onChanged)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'timeclock_breaks' }, onChanged)
    .subscribe()
}
