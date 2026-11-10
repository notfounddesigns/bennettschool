import { localDateStr } from './helpers.ts'
import { supabase, proxyClient, restClient } from './supabase.ts'

// Data layer ported from the production portal (C:\dev\bcs\src\lib\api.ts) —
// same tables, views, edge functions and storage bucket.

// ── Types ─────────────────────────────────────────────────────────────────

export interface Student {
  homebase_id: number
  name: string
  role_id: number
}

export interface LoginResult {
  result: 'first_time' | 'ok'
  student: Student
  // auth-login nests its error under `data`; a few paths return a flat `error`.
  data?: { error?: string }
  error?: string
}

export interface HourEntry {
  date: string
  hours: number
}

export interface DeEntry {
  id: number
  date: string
  hours: number
  module: string
  platform: string
  verified: boolean
}

export interface GradeEntry {
  id: number
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
  currentMonthHrs: number
  currentMonthDeHrs: number
  inPersonHrsList: HourEntry[]
  deHrsList: DeEntry[]
  timeclockHrsList: HourEntry[]
  grades: GradeEntry[]
}

export interface MgmtEmployee {
  homebase_id: number
  name: string
  role_id: number
  role_name: string
  total_hrs: number
  hrs_to_graduate: number
  percent_complete: number
}

export interface Role {
  id: number
  role_name: string
}

export interface TimeclockStatusEntry {
  homebase_id: number
  name: string
  date: string
  clock_in: string
  clock_out: string | null
  is_clocked_in: boolean
  on_break: boolean
  break_start: string | null
  break_end: string | null
  worked_hours: number | null
}

export interface MonthlyHours {
  inPerson: number
  de: number
}

export interface PunchPhotos {
  clock_in_photo_path: string | null
  clock_out_photo_path: string | null
  timeclock_breaks: Array<{ break_start_photo_path: string | null; break_end_photo_path: string | null }>
}

export interface TimeclockEntryDetail {
  id: string
  clock_in: string
  clock_out: string | null
  break_id: string | null
  break_start: string | null
  break_end: string | null
}

export interface NeedsReviewBreak {
  id: string
  break_start: string
  break_end: string | null
  auto_closed: boolean
}

export interface NeedsReviewEntry {
  id: string
  homebase_id: number
  student_name: string
  date: string
  clock_in: string
  clock_out: string | null
  hours_worked: number | null
  // The shift itself was auto-closed (student never clocked out).
  auto_closed: boolean
  breaks: NeedsReviewBreak[]
}

export type AuditAction =
  | 'login' | 'logout'
  | 'grade_update'
  | 'grade_remove'
  | 'de_hours_edit'
  | 'de_hours_remove'
  | 'timeclock_edit'
  | 'timeclock_add'
  | 'timeclock_reviewed'
  | 'role_change'
  | 'pin_reset' | 'password_reset' | 'password_clear'
  | 'student_removed' | 'student_reactivated'
  | 'needs_attention_resolved' | 'needs_attention_resolve_all'
  | 'view_as_student'

export interface AuditLogRecord {
  id: string
  actor_id: number | null
  actor_name: string | null
  action: AuditAction
  target_id: string | null
  target_name: string | null
  description: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

// ── Auth (edge functions) ─────────────────────────────────────────────────

export async function loginEmployee(first: string, last: string, password: string): Promise<LoginResult> {
  const res = await proxyClient.post<LoginResult>('/auth-login', {
    first_name: first.toLowerCase(),
    last_name: last.toLowerCase(),
    password,
  })
  const result = res.data
  if (res.status < 200 || res.status >= 300) {
    throw new Error(result?.data?.error ?? result?.error ?? 'Login failed. Please try again.')
  }
  return result
}

export async function setEmployeePassword(homebaseId: number, fullName: string, password: string): Promise<void> {
  const res = await proxyClient.post<{ error?: string }>('/set-password', {
    homebase_id: String(homebaseId),
    password,
    name: fullName,
  })
  if (res.status < 200 || res.status >= 300) {
    throw new Error(res.data?.error ?? 'Could not save password. Please try again.')
  }
}

export async function validateCachedEmployee(homebaseId: number): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('homebase_id')
    .eq('homebase_id', homebaseId)
    .single()
  return !!data
}

// ── PINs ──────────────────────────────────────────────────────────────────

export async function setStudentPin(homebaseId: number, pin: string): Promise<void> {
  const res = await proxyClient.post<{ error?: string }>('/set-pin', { homebase_id: homebaseId, pin })
  if (res.status < 200 || res.status >= 300) throw new Error(res.data?.error ?? 'Failed to set PIN')
}

export async function changeStudentPin(homebaseId: number, currentPin: string, newPin: string): Promise<void> {
  const res = await proxyClient.post<{ error?: string }>('/change-pin', {
    homebase_id: homebaseId,
    current_pin: currentPin,
    new_pin: newPin,
  })
  if (res.status < 200 || res.status >= 300) throw new Error(res.data?.error ?? 'Failed to change PIN')
}

export async function studentHasPin(homebaseId: number): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('pin_hash')
    .eq('homebase_id', homebaseId)
    .maybeSingle()
  return !!(data as { pin_hash: string | null } | null)?.pin_hash
}

// ── Hours helpers ─────────────────────────────────────────────────────────

type HoursRow = { homebase_id: number; date: string; hours: number }
type TimeclockHoursRow = { homebase_id: number; date: string; hours_worked: number }

// In-person hours = legacy `hours` rows merged with `timeclock_entries`, one row
// per date; the timeclock value wins when both exist for the same date.
function mergeInPersonHours(hours: HoursRow[], timeclock: TimeclockHoursRow[]): HourEntry[] {
  const byDate = new Map<string, HourEntry>()
  for (const h of hours) {
    const date = h.date.slice(0, 10)
    byDate.set(date, { date, hours: h.hours })
  }
  for (const t of timeclock) byDate.set(t.date, { date: t.date, hours: t.hours_worked })
  return [...byDate.values()].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

function sumForMonth(rows: Array<{ date: string; hours: number }>, month: string): number {
  return rows.filter(r => r.date.slice(0, 7) === month).reduce((sum, r) => sum + r.hours, 0)
}

// PostgREST caps responses at 1000 rows; page through anything that can exceed it.
async function fetchAllPages<T>(
  build: () => { range: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }> },
): Promise<T[]> {
  const PAGE = 1000
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) throw new Error('Failed to load hours')
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < PAGE) return out
  }
}

// ── Student dashboard ─────────────────────────────────────────────────────

export async function fetchStudentDashboard(homebaseId: number): Promise<StudentDashboard> {
  const [profileRes, hoursRes, timeclockRes, deRes, gradesRes] = await Promise.all([
    supabase
      .from('profiles_view')
      .select('homebase_id, name, total_hrs, hrs_to_graduate, percent_complete')
      .eq('homebase_id', homebaseId)
      .single(),
    supabase.from('hours').select('homebase_id, date, hours').eq('homebase_id', homebaseId).order('date', { ascending: false }),
    supabase.from('timeclock_entries').select('homebase_id, date, hours_worked').eq('homebase_id', homebaseId).order('date', { ascending: false }),
    supabase.from('de_hours').select('id, homebase_id, date, hours, module, platform, verified').eq('homebase_id', homebaseId).order('date', { ascending: false }),
    supabase.from('grades').select('id, date, project, category, score, notes').eq('homebase_id', homebaseId).eq('is_active', true).order('date', { ascending: false }),
  ])

  if (profileRes.error || hoursRes.error || timeclockRes.error || deRes.error || gradesRes.error) {
    throw new Error('Failed to load dashboard')
  }

  const profile = profileRes.data as { total_hrs: number; hrs_to_graduate: number; percent_complete: number } | null
  const inPersonHrsList = mergeInPersonHours(
    (hoursRes.data ?? []) as HoursRow[],
    (timeclockRes.data ?? []) as TimeclockHoursRow[],
  )
  // Matches production: the student view reads every de_hours row (no is_active
  // filter) and hides negative adjustment rows.
  const deHrsList = ((deRes.data ?? []) as DeEntry[])
    .filter(h => h.hours >= 0)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .map(({ id, date, hours, module, platform, verified }) => ({ id, date, hours, module, platform, verified }))

  const thisMonth = localDateStr().slice(0, 7)

  return {
    totalHrsAll: profile?.total_hrs ?? 0,
    hrsToGrad: profile?.hrs_to_graduate ?? 0,
    percentComplete: profile?.percent_complete ?? 0,
    currentMonthHrs: sumForMonth(inPersonHrsList, thisMonth),
    currentMonthDeHrs: sumForMonth(deHrsList, thisMonth),
    inPersonHrsList,
    deHrsList,
    timeclockHrsList: [],
    grades: (gradesRes.data ?? []) as GradeEntry[],
  }
}

// ── Management ────────────────────────────────────────────────────────────

export async function fetchEmployeeTable(): Promise<MgmtEmployee[]> {
  const { data, error } = await supabase
    .from('profiles_view')
    .select('homebase_id, name, role_id, role_name, total_hrs, hrs_to_graduate, percent_complete')
    .order('name')
  if (error) throw new Error('Failed to load dashboard')

  return ((data ?? []) as MgmtEmployee[]).map(emp => ({
    homebase_id: emp.homebase_id,
    name: emp.name,
    role_id: emp.role_id,
    role_name: emp.role_name ?? '',
    total_hrs: emp.total_hrs ?? 0,
    hrs_to_graduate: emp.hrs_to_graduate ?? 0,
    percent_complete: emp.percent_complete ?? 0,
  }))
}

export async function fetchCurrentStudents(): Promise<TimeclockStatusEntry[]> {
  const { data, error } = await supabase
    .from('timeclock_status')
    .select('homebase_id, name, date, clock_in, clock_out, is_clocked_in, on_break, break_start, break_end, worked_hours')
    .order('clock_in', { ascending: false })
  if (error) throw new Error('Failed to load timeclock entries')
  return (data ?? []) as TimeclockStatusEntry[]
}

// Current-month in-person and DE hours for every student, keyed by homebase_id.
// Same numbers as production's per-row fetchStudentHours/fetchDeHours, but in a
// handful of queries instead of two per student per render.
export async function fetchCurrentMonthHours(): Promise<Map<number, MonthlyHours>> {
  const thisMonth = localDateStr().slice(0, 7)
  const monthStart = `${thisMonth}-01`

  const [hours, timeclock, de] = await Promise.all([
    fetchAllPages<HoursRow>(() =>
      supabase.from('hours').select('homebase_id, date, hours').gte('date', monthStart).order('date')),
    fetchAllPages<TimeclockHoursRow>(() =>
      supabase.from('timeclock_entries').select('homebase_id, date, hours_worked').gte('date', monthStart).order('date')),
    fetchAllPages<HoursRow>(() =>
      supabase.from('de_hours').select('homebase_id, date, hours').eq('is_active', true).gte('date', monthStart).order('date')),
  ])

  const group = <T extends { homebase_id: number }>(rows: T[]) => {
    const m = new Map<number, T[]>()
    for (const r of rows) {
      const list = m.get(r.homebase_id)
      if (list) list.push(r)
      else m.set(r.homebase_id, [r])
    }
    return m
  }
  const hoursBy = group(hours)
  const tcBy = group(timeclock)
  const deBy = group(de)

  const result = new Map<number, MonthlyHours>()
  for (const id of new Set([...hoursBy.keys(), ...tcBy.keys(), ...deBy.keys()])) {
    const inPerson = mergeInPersonHours(hoursBy.get(id) ?? [], tcBy.get(id) ?? [])
    result.set(id, {
      inPerson: sumForMonth(inPerson, thisMonth),
      de: sumForMonth(deBy.get(id) ?? [], thisMonth),
    })
  }
  return result
}

export async function fetchDeHours(homebaseId: number): Promise<DeEntry[]> {
  const { data, error } = await supabase
    .from('de_hours')
    .select('*')
    .eq('homebase_id', homebaseId)
    .eq('is_active', true)
    .order('date', { ascending: false })
  if (error) throw new Error('Failed to load DE hours')
  return (data ?? []) as DeEntry[]
}

export async function fetchAllGrades(): Promise<Record<number, GradeEntry[]>> {
  const { data, error } = await supabase
    .from('grades')
    .select('id, homebase_id, date, project, category, score, notes')
    .eq('is_active', true)
    .order('date', { ascending: false })
  if (error) throw new Error('Failed to load grades')
  const result: Record<number, GradeEntry[]> = {}
  for (const row of (data ?? []) as Array<{ homebase_id: number } & GradeEntry>) {
    if (!result[row.homebase_id]) result[row.homebase_id] = []
    result[row.homebase_id].push({
      id: row.id, date: row.date, project: row.project, category: row.category, score: row.score, notes: row.notes,
    })
  }
  return result
}

export async function fetchRoles(): Promise<Role[]> {
  const { data, error } = await supabase.from('roles').select('id, role_name').order('id')
  if (error) throw new Error('Failed to load roles')
  return (data ?? []) as Role[]
}

export async function updateStudentRole(homebaseId: number, roleId: number): Promise<void> {
  const { error } = await supabase.from('profiles').update({ role_id: roleId }).eq('homebase_id', homebaseId)
  if (error) throw new Error('Failed to update role')
}

export async function updateStudentName(homebaseId: number, name: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ name }).eq('homebase_id', homebaseId)
  if (error) throw new Error('Failed to update name')
}

export async function removeStudent(homebaseId: number): Promise<void> {
  const { error } = await supabase.from('profiles').update({ is_active: false }).eq('homebase_id', homebaseId)
  if (error) throw new Error('Failed to remove student')
}

export async function clearStudentPassword(homebaseId: number): Promise<void> {
  const { error } = await supabase.from('profiles').update({ password_hash: null }).eq('homebase_id', homebaseId)
  if (error) throw new Error(error.message)
}

export async function exportStudents(month: number, year: number): Promise<Blob> {
  const res = await proxyClient.get<Blob>('/export-hours', { params: { month, year }, responseType: 'blob' })
  if (res.status < 200 || res.status >= 300) throw new Error('Export failed')
  return res.data
}

// ── Hours / grades writes ─────────────────────────────────────────────────

function throwOnInsertError(status: number): void {
  if (status === 403) throw new Error('You do not have permission to submit hours. Please contact your administrator.')
  if (status === 409) throw new Error('A matching hours entry for this student and date already exists.')
  if (status === 422) throw new Error('Invalid data. Please check your inputs and try again.')
  if (status === 429) throw new Error('Too many requests. Please wait a moment and try again.')
  if (status >= 500) throw new Error('Server error. Please try again later.')
  if (status < 200 || status >= 300) throw new Error('Save failed')
}

export async function submitDeHours(payload: {
  homebase_id: number
  date: string
  hours: string
  module: string
  platform: string
  verified: boolean
}): Promise<void> {
  const res = await restClient.post('/de_hours', payload)
  throwOnInsertError(res.status)
}

export async function submitGradeEntry(payload: {
  homebase_id: number
  date: string
  project: string
  category: string
  score: number
  notes: string | null
}): Promise<void> {
  const res = await restClient.post('/grades', payload)
  if (res.status < 200 || res.status >= 300) throw new Error('Save failed')
}

// Targeted by primary key so a retake sharing date/project/category is untouched.
export async function updateGradeEntry(
  id: number,
  updates: Partial<{ project: string; category: string; score: number }>,
): Promise<void> {
  const { error } = await supabase.from('grades').update(updates).eq('id', id).eq('is_active', true)
  if (error) throw new Error('Failed to update grade entry')
}

// Soft delete: the row stays and drops out of every read path.
export async function removeGradeEntry(id: number): Promise<void> {
  const { error } = await supabase.from('grades').update({ is_active: false }).eq('id', id)
  if (error) throw new Error('Failed to delete grade entry')
}

export async function updateDeHoursEntry(
  id: number,
  updates: Partial<{ hours: number; module: string; platform: string; verified: boolean; is_active: boolean }>,
): Promise<void> {
  const { error } = await supabase.from('de_hours').update(updates).eq('id', id)
  if (error) throw new Error('Failed to update DE hours entry')
}

// ── Timeclock (management) ────────────────────────────────────────────────

const PUNCH_PHOTOS_BUCKET = 'punch-photos'

export async function fetchPunchPhotos(homebaseId: number, clockIn: string): Promise<PunchPhotos | null> {
  const { data, error } = await supabase
    .from('timeclock_entries')
    .select('clock_in_photo_path, clock_out_photo_path, timeclock_breaks(break_start_photo_path, break_end_photo_path)')
    .eq('homebase_id', homebaseId)
    .eq('clock_in', clockIn)
    .maybeSingle()
  if (error || !data) return null
  return data as unknown as PunchPhotos
}

export async function getPunchPhotoUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(PUNCH_PHOTOS_BUCKET).createSignedUrl(path, 3600)
  if (error) return null
  return data?.signedUrl ?? null
}

export async function fetchTimeclockEntryDetail(homebaseId: number, clockIn: string): Promise<TimeclockEntryDetail | null> {
  const { data, error } = await supabase
    .from('timeclock_entries')
    .select('id, clock_in, clock_out, timeclock_breaks(id, break_start, break_end)')
    .eq('homebase_id', homebaseId)
    .eq('clock_in', clockIn)
    .order('clock_in', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  const entry = data as {
    id: string
    clock_in: string
    clock_out: string | null
    timeclock_breaks: Array<{ id: string; break_start: string; break_end: string | null }>
  }
  const brk = [...entry.timeclock_breaks].sort((a, b) => a.break_start.localeCompare(b.break_start))[0] ?? null
  return {
    id: entry.id,
    clock_in: entry.clock_in,
    clock_out: entry.clock_out,
    break_id: brk?.id ?? null,
    break_start: brk?.break_start ?? null,
    break_end: brk?.break_end ?? null,
  }
}

export async function updateTimeclockEntryById(
  entryId: string,
  updates: { clock_in?: string; clock_out?: string | null },
): Promise<void> {
  const { error } = await supabase.from('timeclock_entries').update(updates).eq('id', entryId)
  if (error) throw new Error('Failed to update timeclock entry')
}

// Create or update the entry's break. Clearing a break isn't supported — the
// breaks table has no delete policy and break_start is NOT NULL.
export async function upsertTimeclockBreak(
  entryId: string,
  breakId: string | null,
  breakStart: string | null,
  breakEnd: string | null,
): Promise<void> {
  if (!breakStart || !breakEnd) return
  if (breakId) {
    const { error } = await supabase
      .from('timeclock_breaks')
      .update({ break_start: breakStart, break_end: breakEnd })
      .eq('id', breakId)
    if (error) throw new Error('Failed to update break')
  } else {
    const { error } = await supabase
      .from('timeclock_breaks')
      .insert({ entry_id: entryId, break_start: breakStart, break_end: breakEnd })
    if (error) throw new Error('Failed to add break')
  }
}

export async function addTimeclockEntry(params: {
  homebase_id: number
  date: string
  clock_in: string
  clock_out: string
  break_start?: string | null
  break_end?: string | null
}): Promise<void> {
  const { data, error } = await supabase
    .from('timeclock_entries')
    .insert({ homebase_id: params.homebase_id, date: params.date, clock_in: params.clock_in, clock_out: params.clock_out })
    .select('id')
    .single()
  if (error || !data) throw new Error('Failed to add timeclock entry')

  if (params.break_start && params.break_end) {
    const { error: breakError } = await supabase
      .from('timeclock_breaks')
      .insert({ entry_id: (data as { id: string }).id, break_start: params.break_start, break_end: params.break_end })
    if (breakError) throw new Error('Failed to add break')
  }
}

export function subscribeToTimeclock(onChanged: () => void) {
  return supabase
    .channel('timeclock-watch')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'timeclock_entries' }, onChanged)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'timeclock_breaks' }, onChanged)
    .subscribe()
}

// ── Needs Review (entries the nightly job auto-closed) ────────────────────

type NeedsReviewRow = {
  id: string
  homebase_id: number
  date: string
  clock_in: string
  clock_out: string | null
  hours_worked: number | null
  auto_closed: boolean
  timeclock_breaks: NeedsReviewBreak[] | null
}

const NEEDS_REVIEW_SELECT =
  'id, homebase_id, date, clock_in, clock_out, hours_worked, auto_closed, timeclock_breaks(id, break_start, break_end, auto_closed)'

// An entry needs review when its shift or any of its breaks was auto-closed.
export async function fetchNeedsReviewEntries(): Promise<NeedsReviewEntry[]> {
  const { data: flaggedBreaks, error: flaggedBreakError } = await supabase
    .from('timeclock_breaks')
    .select('entry_id')
    .eq('auto_closed', true)
  if (flaggedBreakError) throw new Error('Failed to load entries needing review')

  const breakEntryIds = [...new Set(((flaggedBreaks ?? []) as Array<{ entry_id: string }>).map(b => b.entry_id))]

  const [{ data: autoClosedRows, error: entryError }, { data: breakParentRows, error: parentError }] = await Promise.all([
    supabase.from('timeclock_entries').select(NEEDS_REVIEW_SELECT).eq('auto_closed', true),
    breakEntryIds.length > 0
      ? supabase.from('timeclock_entries').select(NEEDS_REVIEW_SELECT).in('id', breakEntryIds)
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ])
  if (entryError || parentError) throw new Error('Failed to load entries needing review')

  const rows = new Map<string, NeedsReviewRow>()
  for (const row of [
    ...((autoClosedRows ?? []) as unknown as NeedsReviewRow[]),
    ...((breakParentRows ?? []) as unknown as NeedsReviewRow[]),
  ]) {
    rows.set(row.id, row)
  }
  if (rows.size === 0) return []

  const names = new Map<number, string>()
  const { data: profileRows } = await supabase
    .from('profiles_view')
    .select('homebase_id, name')
    .in('homebase_id', [...new Set([...rows.values()].map(r => r.homebase_id))])
  for (const p of (profileRows ?? []) as Array<{ homebase_id: number; name: string }>) {
    names.set(p.homebase_id, p.name)
  }

  return [...rows.values()]
    .map(row => ({
      id: row.id,
      homebase_id: row.homebase_id,
      student_name: names.get(row.homebase_id) ?? `Student ${row.homebase_id}`,
      date: String(row.date).slice(0, 10),
      clock_in: row.clock_in,
      clock_out: row.clock_out,
      hours_worked: row.hours_worked,
      auto_closed: row.auto_closed,
      breaks: [...(row.timeclock_breaks ?? [])].sort((a, b) => a.break_start.localeCompare(b.break_start)),
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || a.student_name.localeCompare(b.student_name))
}

// Clearing the flags is what "reviewed" means. Only auto_closed is touched, so
// the hours-recalculation triggers (which watch clock_in/clock_out) stay quiet.
export async function clearAutoClosedFlags(entryId: string): Promise<void> {
  const { error } = await supabase.from('timeclock_entries').update({ auto_closed: false }).eq('id', entryId)
  if (error) throw new Error('Failed to clear the auto-fixed flag')

  const { error: breakError } = await supabase
    .from('timeclock_breaks')
    .update({ auto_closed: false })
    .eq('entry_id', entryId)
    .eq('auto_closed', true)
  if (breakError) throw new Error('Failed to clear the auto-fixed flag')
}

// ── Audit log ─────────────────────────────────────────────────────────────

export async function fetchAuditLog(limit = 200): Promise<AuditLogRecord[]> {
  const { data, error } = await supabase
    .from('audit_log')
    .select('id, actor_id, actor_name, action, target_id, target_name, description, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error('Failed to load audit log')
  return (data ?? []) as AuditLogRecord[]
}

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
