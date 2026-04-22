import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY, PROXY, AUTH_HEADERS } from './supabase';
import { fmtFloat, nDaysAgo } from './helpers';

// ── Types ─────────────────────────────────────────────────────────────────

export interface Employee {
  id: number;
  first_name: string;
  last_name: string;
  job: { level: string };
}

export interface HoursType {
  id: number;
  name: string;
}

export interface HourEntry {
  date: string;
  hours: number;
}

export interface DeEntry {
  date: string;
  hours: number;
  module: string;
  platform: string;
  verified: boolean;
}

export interface GradeEntry {
  date: string;
  project: string;
  category: string;
  score: number;
  notes: string | null;
}

export interface StudentDashboard {
  totalHrsAll: number;
  hrsToGrad: number;
  percentComplete: number;
  inPersonHrs: number;
  deHrs: number;
  inPersonHrsList: HourEntry[];
  deHrsList: DeEntry[];
  grades: GradeEntry[];
}

export interface MgmtEmployee {
  homebase_id: number;
  name: string;
  in_person_hrs: string;
  de_hrs: string;
  total_hrs: number;
  hrs_to_graduate: number;
  percent_complete: number;
}

export interface SyncRecord {
  synced_at: string;
  date_synced: string;
  inserted: number;
  synced_by: string | null;
}

export interface HomebaseEmployee {
  id: number;
  first_name: string;
  last_name: string;
}

// ── API functions ─────────────────────────────────────────────────────────

export async function homebaseFetch(path: string): Promise<HomebaseEmployee[]> {
  const res = await fetch(`${PROXY}/homebase${path}`, { headers: AUTH_HEADERS });
  if (!res.ok) throw new Error(`Homebase proxy error: ${res.status}`);
  return res.json() as Promise<HomebaseEmployee[]>;
}

export async function fetchStudentDashboard(employeeUserId: number): Promise<StudentDashboard> {
  const daysAgo7 = nDaysAgo(7);

  const [
    { data: profile, error: profileError },
    { data: hours, error: hoursError },
    { data: gradesData },
  ] = await Promise.all([
    supabase
      .from('profiles_view')
      .select(`homebase_id, name, calc_total_hrs, calc_hrs_to_graduate, calc_percent_complete, hours(type_id, hours)`)
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
  ]);

  if (profileError || hoursError) {
    console.error('Error fetching dashboard summary…', profileError ?? hoursError);
    throw new Error('Failed to load dashboard');
  }

  const profileHours = (profile as { hours: Array<{ type_id: number; hours: number }> }).hours ?? [];

  const inPersonHrs = profileHours
    .filter(h => h.type_id === 1)
    .reduce((sum, h) => sum + (h.hours ?? 0), 0);
  const deHrs = profileHours
    .filter(h => h.type_id === 2)
    .reduce((sum, h) => sum + (h.hours ?? 0), 0);

  const rawHours = (hours as Array<{ type_id: number; hours: number; date: string; module: string; platform: string; verified: boolean }>) ?? [];

  const inPersonHrsList: HourEntry[] = rawHours
    .filter(h => h.type_id === 1)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .map(({ date, hours: h }) => ({ date, hours: h }));

  const deHrsList: DeEntry[] = rawHours
    .filter(h => h.type_id === 2)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .map(({ date, hours: h, module, platform, verified }) => ({ date, hours: h, module, platform, verified }));

  const p = profile as { calc_total_hrs: number; calc_hrs_to_graduate: number; calc_percent_complete: number };

  return {
    totalHrsAll: p.calc_total_hrs ?? 0,
    hrsToGrad: p.calc_hrs_to_graduate ?? 0,
    percentComplete: p.calc_percent_complete ?? 0,
    inPersonHrs,
    deHrs,
    inPersonHrsList,
    deHrsList,
    grades: (gradesData as GradeEntry[]) ?? [],
  };
}

export async function fetchEmployeeTable(): Promise<MgmtEmployee[]> {
  const { data, error } = await supabase
    .from('profiles_view')
    .select(`homebase_id, name, role_id, role_name, calc_total_hrs, calc_hrs_to_graduate, calc_percent_complete, hours`)
    .order('name');

  if (error) throw new Error('Failed to load employees');

  return (data as Array<{
    homebase_id: number;
    name: string;
    role_id: number;
    role_name: string;
    calc_total_hrs: number;
    calc_hrs_to_graduate: number;
    calc_percent_complete: number;
    hours: Array<{ type_id: number; hours: number }>;
  }>)
  .filter(emp => emp.role_id === 1)
  .map(emp => {
    const inPersonHrs = emp.hours
      .filter(h => h.type_id === 1)
      .reduce((sum, h) => sum + (h.hours ?? 0), 0);
    const deHrs = emp.hours
      .filter(h => h.type_id === 2)
      .reduce((sum, h) => sum + (h.hours ?? 0), 0);

    return {
      homebase_id: emp.homebase_id,
      name: emp.name,
      in_person_hrs: fmtFloat(inPersonHrs),
      de_hrs: fmtFloat(deHrs),
      total_hrs: emp.calc_total_hrs ?? 0,
      hrs_to_graduate: emp.calc_hrs_to_graduate ?? 0,
      percent_complete: emp.calc_percent_complete ?? 0,
    };
  });
}

export async function fetchLastSync(): Promise<SyncRecord | null> {
  const { data } = await supabase
    .from('sync_log')
    .select('synced_at, date_synced, inserted, synced_by')
    .order('date_synced', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as SyncRecord | null;
}

export async function loadStudents(): Promise<HomebaseEmployee[]> {
  const params = new URLSearchParams({ resource: 'employees' });
  return homebaseFetch(`?${params}`);
}

export async function syncHoursByDate(
  date: string,
  synced_by: string,
): Promise<{ inserted: number }> {
  const res = await fetch(`${PROXY}/sync-hours-by-date`, {
    method: 'POST',
    headers: AUTH_HEADERS,
    body: JSON.stringify({ date }),
  });
  const resp = await res.json() as { result: string; inserted?: number; error?: string };
  if (!res.ok || resp.result !== 'ok') {
    throw new Error(resp.error ?? 'Sync failed');
  }

  // Log the sync
  await fetch(`${SUPABASE_URL}/rest/v1/sync_log`, {
    method: 'POST',
    headers: { ...AUTH_HEADERS, apikey: SUPABASE_ANON_KEY, Prefer: 'return=minimal' },
    body: JSON.stringify({
      date_synced: date,
      inserted: resp.inserted ?? 0,
      synced_by,
    }),
  }).catch(() => {});

  return { inserted: resp.inserted ?? 0 };
}

export async function submitHours(payload: {
  homebase_id: number;
  type_id: number;
  date: string;
  hours: string;
  module: string;
  platform: string;
  verified: boolean;
}): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/hours`, {
    method: 'POST',
    headers: { ...AUTH_HEADERS, apikey: SUPABASE_ANON_KEY, Prefer: 'return=minimal' },
    body: JSON.stringify({ ...payload}),
  });
  // handle these response statuses: 403, 422, 429, 500 and 501 with specific messages
  if (res.status === 403) {
    throw new Error('You do not have permission to submit hours. Please contact your administrator.');
  }
  if (res.status === 409) {
    throw new Error('A matching hours entry for this student and date already exists.');
  }
  if (res.status === 422) {
    throw new Error('Invalid data. Please check your inputs and try again.');
  }
  if (res.status === 429) {
    throw new Error('Too many requests. Please wait a moment and try again.');
  }
  if (res.status >= 500) {
    throw new Error('Server error. Please try again later.');
  }
  if (!res.ok) throw new Error('Save failed');
}

export async function submitGradeEntry(payload: {
  homebase_id: number;
  date: string;
  project: string;
  category: string;
  score: number;
  notes: string | null;
}): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/grades`, {
    method: 'POST',
    headers: { ...AUTH_HEADERS, apikey: SUPABASE_ANON_KEY, Prefer: 'return=minimal' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Save failed');
}

export async function loginEmployee(
  first: string,
  last: string,
  password: string,
): Promise<{ result: 'first_time' | 'ok'; employee: Employee }> {
  const res = await fetch(`${PROXY}/auth-login`, {
    method: 'POST',
    headers: AUTH_HEADERS,
    body: JSON.stringify({
      first_name: first.toLowerCase(),
      last_name: last.toLowerCase(),
      password,
    }),
  });
  const data = await res.json() as { result: 'first_time' | 'ok'; employee: Employee; error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Login failed. Please try again.');
  return data;
}

export async function setEmployeePassword(
  homebseId: number,
  fullName: string,
  password: string,
): Promise<void> {
  const res = await fetch(`${PROXY}/set-password`, {
    method: 'POST',
    headers: AUTH_HEADERS,
    body: JSON.stringify({ homebase_id: String(homebseId), password, name: fullName }),
  });
  const data = await res.json() as { error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Could not save password. Please try again.');
}

export async function exportStudents(month: number, year: number): Promise<Blob> {
  const res = await fetch(`${PROXY}/export-students?month=${month}&year=${year}`, { headers: AUTH_HEADERS });
  if (!res.ok) throw new Error('Export failed');
  return res.blob();
}

export async function validateCachedEmployee(employeeId: number): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('homebase_id')
    .eq('homebase_id', employeeId)
    .single();
  return !!data;
}

// ── Timeclock types ───────────────────────────────────────────────────────────

export interface TimeclockStudent {
  homebase_id: number;
  name: string;
}

export interface ActiveBreak {
  id: string;
  break_start: string;
}

export interface ActiveSession {
  id: string;
  clock_in: string;
  activeBreak: ActiveBreak | null;
}

// ── Timeclock API ─────────────────────────────────────────────────────────────

export async function getStudentByPin(pin: string): Promise<TimeclockStudent | null> {
  const { data } = await supabase
    .from('profiles')
    .select('homebase_id, name')
    .eq('pin', pin)
    .maybeSingle();
  return data as TimeclockStudent | null;
}

export async function getActiveSession(homebaseId: number): Promise<ActiveSession | null> {
  const { data, error } = await supabase
    .from('timeclock_entries')
    .select('id, clock_in, timeclock_breaks(id, break_start, break_end)')
    .eq('homebase_id', homebaseId)
    .is('clock_out', null)
    .order('clock_in', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error('Failed to fetch session');
  if (!data) return null;

  const entry = data as {
    id: string;
    clock_in: string;
    timeclock_breaks: Array<{ id: string; break_start: string; break_end: string | null }>;
  };

  const openBreak = entry.timeclock_breaks.find(b => !b.break_end) ?? null;

  return {
    id: entry.id,
    clock_in: entry.clock_in,
    activeBreak: openBreak ? { id: openBreak.id, break_start: openBreak.break_start } : null,
  };
}

export async function clockIn(homebaseId: number): Promise<void> {
  const { error } = await supabase
    .from('timeclock_entries')
    .insert({ homebase_id: homebaseId });
  if (error) throw new Error('Failed to clock in');
}

export async function clockOut(entryId: string): Promise<void> {
  const { error } = await supabase
    .from('timeclock_entries')
    .update({ clock_out: new Date().toISOString() })
    .eq('id', entryId);
  if (error) throw new Error('Failed to clock out');
}

export async function startBreak(entryId: string): Promise<void> {
  const { error } = await supabase
    .from('timeclock_breaks')
    .insert({ entry_id: entryId });
  if (error) throw new Error('Failed to start break');
}

export async function endBreak(breakId: string): Promise<void> {
  const { error } = await supabase
    .from('timeclock_breaks')
    .update({ break_end: new Date().toISOString() })
    .eq('id', breakId);
  if (error) throw new Error('Failed to end break');
}

export async function setStudentPin(homebaseId: number, pin: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ pin })
    .eq('homebase_id', homebaseId);
  if (error) throw new Error('Failed to set PIN');
}
