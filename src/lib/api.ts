import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY, PROXY, AUTH_HEADERS } from './supabase';
import { fmtFloat } from './helpers';

// ── Types ─────────────────────────────────────────────────────────────────
export interface LoginResult {
  result: 'first_time' | 'ok';
  student: Student;
  // The auth-login function nests its error under `data`; a few paths return a
  // flat `error`. Read both so real messages surface instead of a generic one.
  data?: { error?: string };
  error?: string;
}
export interface Student {
  homebase_id: number;
  name: string;
  role_id: number;
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
  timeclockHrsList: HourEntry[];
  grades: GradeEntry[];
}

export interface MgmtEmployee {
  homebase_id: number;
  name: string;
  role_id: number;
  role_name: string;
  in_person_hrs: number;
  de_hrs: string;
  total_hrs: number;
  legacy_hrs: number;
  hrs_to_graduate: number;
  percent_complete: number;
  hours_list: Array<{ type_id: number; hours: number; date: string; module: string; platform: string; verified: boolean }>;
  hours: Array<{ type_id: number; hours: number; date: string; module: string; platform: string; verified: boolean }>;
}

export interface Role {
  id: number;
  role_name: string;
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
  const [
    { data: profile, error: profileError },
    { data: gradesData },
  ] = await Promise.all([
    supabase
      .from('profiles_view')
      .select(`homebase_id, name, in_person, de_hrs, total_hrs, hrs_to_graduate, percent_complete, hours_list, hours(date, type_id, hours)`)
      .eq('homebase_id', employeeUserId)
      .single(),
    supabase
      .from('grades')
      .select('date, project, category, score, notes')
      .eq('homebase_id', employeeUserId)
      .order('date', { ascending: false }),
  ]);
  
  if (profileError) {
    console.error('Error fetching dashboard summary…', profileError);
    throw new Error('Failed to load dashboard');
  }

  const oldHoursList = (profile?.hours as Array<{ type_id: number; hours: number; date: string; module: string; platform: string; verified: boolean }>) ?? [];
  const newHoursList = (profile?.hours_list as Array<{ type_id: number; hours: number; date: string; module: string; platform: string; verified: boolean }>) ?? [];
  const combinedHrsList = [...oldHoursList, ...newHoursList];
  console.log(combinedHrsList);

  const inPersonHrsList: HourEntry[] = combinedHrsList
    .filter(h => h.type_id !== 2 && h.type_id !== 3)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .map(({ date, hours: h }) => ({ date, hours: h }));

  const deHrsList: DeEntry[] = combinedHrsList
    .filter(h => h.type_id === 2)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .map(({ date, hours: h, module, platform, verified }) => ({ date, hours: h, module, platform, verified }));


  return {
    totalHrsAll: profile?.total_hrs ?? 0,
    hrsToGrad: profile?.hrs_to_graduate ?? 0,
    percentComplete: profile?.percent_complete ?? 0,
    inPersonHrs: profile?.in_person ?? 0,
    deHrs: profile?.de_hrs ?? 0,
    inPersonHrsList,
    deHrsList,
    timeclockHrsList: [],
    grades: (gradesData as GradeEntry[]) ?? [],
  };
}

const EMPLOYEE_SELECT = `homebase_id, name, role_id, role_name, de_hrs, total_hrs, legacy_hrs, hrs_to_graduate, percent_complete, in_person, hours_list, hours(date, type_id, hours, module, platform, verified)`;

type EmployeeRow = {
  homebase_id: number;
  name: string;
  role_id: number;
  role_name: string;
  de_hrs: number;
  total_hrs: number;
  hrs_to_graduate: number;
  percent_complete: number;
  in_person: number | null;
  legacy_hrs: number | null;
  is_active?: boolean;
  hours_list: Array<{ type_id: number; hours: number; date: string; module: string; platform: string; verified: boolean }>;
  hours: Array<{ type_id: number; hours: number; date: string; module: string; platform: string; verified: boolean }>;
};

export async function fetchEmployeeTable(): Promise<MgmtEmployee[]> {
  // Single round trip: is_active is read from profiles_view with everything else.
  let rows: EmployeeRow[];
  const { data, error } = await supabase
    .from('profiles_view')
    .select(`${EMPLOYEE_SELECT}, is_active`)
    .order('name');

  if (!error) {
    rows = (data ?? []) as EmployeeRow[];
  } else {
    // The view doesn't expose is_active — fall back to fetching it from profiles.
    const [{ data: viewData, error: viewError }, { data: profileData }] = await Promise.all([
      supabase.from('profiles_view').select(EMPLOYEE_SELECT).order('name'),
      supabase.from('profiles').select('homebase_id, is_active'),
    ]);
    if (viewError) throw new Error('Failed to load employees');
    const activeById = new Map(
      ((profileData ?? []) as Array<{ homebase_id: number; is_active: boolean }>).map(p => [p.homebase_id, p.is_active])
    );
    rows = ((viewData ?? []) as EmployeeRow[]).map(r => ({ ...r, is_active: activeById.get(r.homebase_id) }));
  }

  return rows
  //.filter(emp => emp.role_id !== 3 && emp.is_active !== false)
  .map(emp => {
    return {
      homebase_id: emp.homebase_id,
      name: emp.name,
      role_id: emp.role_id,
      role_name: emp.role_name ?? '',
      in_person_hrs: (emp.in_person ?? 0) + (emp.legacy_hrs ?? 0),
      de_hrs: fmtFloat(emp.de_hrs),
      total_hrs: emp.total_hrs ?? 0,
      legacy_hrs: emp.legacy_hrs ?? 0,
      hrs_to_graduate: emp.hrs_to_graduate ?? 0,
      percent_complete: emp.percent_complete ?? 0,
      hours_list: emp.hours_list ?? [],
      hours: emp.hours ?? []
    };
  });
}

export async function fetchRoles(): Promise<Role[]> {
  const { data, error } = await supabase
    .from('roles')
    .select('id, role_name')
    .order('id');
  if (error) throw new Error('Failed to load roles');
  return (data ?? []) as Role[];
}

export async function updateStudentRole(homebaseId: number, roleId: number): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ role_id: roleId })
    .eq('homebase_id', homebaseId);
  if (error) throw new Error('Failed to update role');
}

export interface TimeclockStatusEntry {
  homebase_id: number;
  name: string;
  date: string;
  clock_in: string;
  clock_out: string | null;
  is_clocked_in: boolean;
  on_break: boolean;
  worked_hours: number | null;
}

export async function fetchCurrentStudents(): Promise<TimeclockStatusEntry[]> {
  const { data, error } = await supabase
    .from('timeclock_status')
    .select(`homebase_id, name, date, clock_in, clock_out, is_clocked_in, on_break, break_start, break_end, worked_hours`)
    .order('clock_in', { ascending: false });

  if (error) throw new Error('Failed to load timeclock entries');

  return (data ?? []) as TimeclockStatusEntry[];
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

export interface OverviewStats {
  yesterday: { hours: number; students: number };
  last7Days: { hours: number; students: number };
  mtd:       { hours: number; students: number };
}

export async function fetchOverviewStats(): Promise<OverviewStats> {
  const now = new Date();

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

  const mtdStartStr = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString().split('T')[0];

  const startDate = mtdStartStr < sevenDaysAgoStr ? mtdStartStr : sevenDaysAgoStr;

  const { data } = await supabase
    .from('timeclock_status')
    .select('worked_hours, date, homebase_id')
    .gte('date', startDate)
    .not('clock_out', 'is', null);

  const rows = (data ?? []) as Array<{ worked_hours: number | null; date: string; homebase_id: number }>;
  rows.forEach(r => { r.date = r.date.split('T')[0]; });
  const yRows  = rows.filter(r => r.date === yesterdayStr);
  const w7Rows = rows.filter(r => r.date >= sevenDaysAgoStr);
  const mRows  = rows.filter(r => r.date >= mtdStartStr);

  const sum  = (a: typeof rows) => a.reduce((s, r) => s + (r.worked_hours ?? 0), 0);
  const uniq = (a: typeof rows) => new Set(a.map(r => r.homebase_id)).size;

  return {
    yesterday: { hours: sum(yRows),  students: uniq(yRows)  },
    last7Days: { hours: sum(w7Rows), students: uniq(w7Rows) },
    mtd:       { hours: sum(mRows),  students: uniq(mRows)  },
  };
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

export async function updateGradeEntry(
  homebaseId: number,
  original: { date: string; project: string; category: string },
  updates: Partial<{ project: string; category: string; score: number }>
): Promise<void> {
  const { error } = await supabase
    .from('grades')
    .update(updates)
    .eq('homebase_id', homebaseId)
    .eq('date', original.date)
    .eq('project', original.project)
    .eq('category', original.category);
  if (error) throw new Error('Failed to update grade entry');
}

// 1780596226798

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
  });
  const result = await res.json() as LoginResult;
  if (!res.ok) throw new Error(result.data?.error ?? result.error ?? 'Login failed. Please try again.');
  return result;
}

export async function setEmployeePassword(
  homebaseId: number,
  fullName: string,
  password: string,
): Promise<void> {
  const res = await fetch(`${PROXY}/set-password`, {
    method: 'POST',
    headers: AUTH_HEADERS,
    body: JSON.stringify({ homebase_id: String(homebaseId), password, name: fullName }),
  });
  const data = await res.json() as { error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Could not save password. Please try again.');
}

export async function clearStudentPassword(homebaseId: number): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ password_hash: null })
    .eq('homebase_id', homebaseId);
  if (error) throw new Error(error.message);
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
  const res = await fetch(`${PROXY}/verify-pin`, {
    method: 'POST',
    headers: AUTH_HEADERS,
    body: JSON.stringify({ pin }),
  });
  if (!res.ok) return null;
  const data = await res.json() as { student: TimeclockStudent | null };
  return data.student;
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

const PUNCH_PHOTOS_BUCKET = 'punch-photos';

export async function uploadPunchPhoto(homebaseId: number, photo: Blob): Promise<string | null> {
  const path = `${homebaseId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from(PUNCH_PHOTOS_BUCKET)
    .upload(path, photo, { contentType: 'image/jpeg' });
  if (error) return null;
  return path;
}

export interface PunchPhotos {
  clock_in_photo_path: string | null;
  clock_out_photo_path: string | null;
  timeclock_breaks: Array<{ break_start_photo_path: string | null; break_end_photo_path: string | null }>;
}

export async function fetchPunchPhotos(homebaseId: number, clockIn: string): Promise<PunchPhotos | null> {
  const { data, error } = await supabase
    .from('timeclock_entries')
    .select('clock_in_photo_path, clock_out_photo_path, timeclock_breaks(break_start_photo_path, break_end_photo_path)')
    .eq('homebase_id', homebaseId)
    .eq('clock_in', clockIn)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as PunchPhotos;
}

export async function getPunchPhotoUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(PUNCH_PHOTOS_BUCKET)
    .createSignedUrl(path, 3600);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function clockIn(homebaseId: number, photoPath: string | null): Promise<void> {
  const { error } = await supabase
    .from('timeclock_entries')
    .insert({ homebase_id: homebaseId, clock_in_photo_path: photoPath });
  if (error) throw new Error('Failed to clock in');
}

export async function clockOut(entryId: string, photoPath: string | null): Promise<void> {
  const { error } = await supabase
    .from('timeclock_entries')
    .update({ clock_out: new Date().toISOString(), clock_out_photo_path: photoPath })
    .eq('id', entryId);
  if (error) throw new Error('Failed to clock out');
}

export async function startBreak(entryId: string, photoPath: string | null): Promise<void> {
  const { error } = await supabase
    .from('timeclock_breaks')
    .insert({ entry_id: entryId, break_start_photo_path: photoPath });
  if (error) throw new Error('Failed to start break');
}

export async function endBreak(breakId: string, photoPath: string | null): Promise<void> {
  const { error } = await supabase
    .from('timeclock_breaks')
    .update({ break_end: new Date().toISOString(), break_end_photo_path: photoPath })
    .eq('id', breakId);
  if (error) throw new Error('Failed to end break');
}

export async function setStudentPin(homebaseId: number, pin: string): Promise<void> {
  const res = await fetch(`${PROXY}/set-pin`, {
    method: 'POST',
    headers: AUTH_HEADERS,
    body: JSON.stringify({ homebase_id: homebaseId, pin }),
  });
  const data = await res.json() as { error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Failed to set PIN');
}

export async function studentHasPin(homebaseId: number): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('pin_hash')
    .eq('homebase_id', homebaseId)
    .maybeSingle();
  return !!(data as { pin_hash: string | null } | null)?.pin_hash;
}

export async function changeStudentPin(homebaseId: number, currentPin: string, newPin: string): Promise<void> {
  const res = await fetch(`${PROXY}/change-pin`, {
    method: 'POST',
    headers: AUTH_HEADERS,
    body: JSON.stringify({ homebase_id: homebaseId, current_pin: currentPin, new_pin: newPin }),
  });
  const data = await res.json() as { error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Failed to change PIN');
}

export async function updateStudentName(homebaseId: number, name: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ name })
    .eq('homebase_id', homebaseId);
  if (error) throw new Error('Failed to update name');
}

export async function removeStudent(homebaseId: number): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ is_active: false })
    .eq('homebase_id', homebaseId);
  if (error) throw new Error('Failed to remove student');
}

export async function updateTimeclockEntry(
  homebaseId: number,
  originalClockIn: string,
  updates: { clock_in?: string; clock_out?: string | null }
): Promise<void> {
  const { error } = await supabase
    .from('timeclock_entries')
    .update(updates)
    .eq('homebase_id', homebaseId)
    .eq('clock_in', originalClockIn);
  if (error) throw new Error('Failed to update timeclock entry');
}

export interface TimeclockEntryDetail {
  id: string;
  clock_in: string;
  clock_out: string | null;
  break_id: string | null;
  break_start: string | null;
  break_end: string | null;
}

export async function fetchTimeclockEntryDetail(
  homebaseId: number,
  clockIn: string
): Promise<TimeclockEntryDetail | null> {
  const { data, error } = await supabase
    .from('timeclock_entries')
    .select('id, clock_in, clock_out, timeclock_breaks(id, break_start, break_end)')
    .eq('homebase_id', homebaseId)
    .eq('clock_in', clockIn)
    .order('clock_in', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const entry = data as {
    id: string;
    clock_in: string;
    clock_out: string | null;
    timeclock_breaks: Array<{ id: string; break_start: string; break_end: string | null }>;
  };
  const brk = [...entry.timeclock_breaks].sort((a, b) => a.break_start.localeCompare(b.break_start))[0] ?? null;
  return {
    id: entry.id,
    clock_in: entry.clock_in,
    clock_out: entry.clock_out,
    break_id: brk?.id ?? null,
    break_start: brk?.break_start ?? null,
    break_end: brk?.break_end ?? null,
  };
}

export async function updateTimeclockEntryById(
  entryId: string,
  updates: { clock_in?: string; clock_out?: string | null }
): Promise<void> {
  const { error } = await supabase
    .from('timeclock_entries')
    .update(updates)
    .eq('id', entryId);
  if (error) throw new Error('Failed to update timeclock entry');
}

// Create or update the break for an entry. Clearing a break (empty values) is
// not supported — the breaks table has no delete policy and break_start is NOT NULL.
export async function upsertTimeclockBreak(
  entryId: string,
  breakId: string | null,
  breakStart: string | null,
  breakEnd: string | null
): Promise<void> {
  if (!breakStart || !breakEnd) return;
  if (breakId) {
    const { error } = await supabase
      .from('timeclock_breaks')
      .update({ break_start: breakStart, break_end: breakEnd })
      .eq('id', breakId);
    if (error) throw new Error('Failed to update break');
  } else {
    const { error } = await supabase
      .from('timeclock_breaks')
      .insert({ entry_id: entryId, break_start: breakStart, break_end: breakEnd });
    if (error) throw new Error('Failed to add break');
  }
}

export async function addTimeclockEntry(params: {
  homebase_id: number;
  date: string;
  clock_in: string;
  clock_out: string;
  break_start?: string | null;
  break_end?: string | null;
}): Promise<void> {
  const { data, error } = await supabase
    .from('timeclock_entries')
    .insert({
      homebase_id: params.homebase_id,
      date: params.date,
      clock_in: params.clock_in,
      clock_out: params.clock_out,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error('Failed to add timeclock entry');

  if (params.break_start && params.break_end) {
    const { error: breakError } = await supabase
      .from('timeclock_breaks')
      .insert({
        entry_id: (data as { id: string }).id,
        break_start: params.break_start,
        break_end: params.break_end,
      });
    if (breakError) throw new Error('Failed to add break');
  }
}

export async function fetchAllGrades(): Promise<Record<number, GradeEntry[]>> {
  const { data, error } = await supabase
    .from('grades')
    .select('homebase_id, date, project, category, score, notes')
    .order('date', { ascending: false });
  if (error) throw new Error('Failed to load grades');
  const result: Record<number, GradeEntry[]> = {};
  for (const row of (data ?? []) as Array<{ homebase_id: number } & GradeEntry>) {
    if (!result[row.homebase_id]) result[row.homebase_id] = [];
    result[row.homebase_id].push({ date: row.date, project: row.project, category: row.category, score: row.score, notes: row.notes });
  }
  return result;
}

export async function fetchDeHoursByDate(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('hours')
    .select('homebase_id, date, hours')
    .eq('type_id', 2);
  if (error) throw new Error('Failed to load DE hours');
  const result: Record<string, number> = {};
  for (const row of (data ?? []) as Array<{ homebase_id: number; date: string; hours: number }>) {
    const key = `${row.homebase_id}|${row.date.split('T')[0]}`;
    result[key] = (result[key] ?? 0) + (row.hours ?? 0);
  }
  return result;
}

// ── Compare view ──────────────────────────────────────────────────────────────

export interface CompareRow {
  homebase_id: number;
  name: string;
  date: string;
  internal_hours: number;
  external_hours: number;
  diff: number;
}

export async function fetchCompareData(): Promise<CompareRow[]> {
  const [{ data: tcData, error: tcError }, { data: hrData, error: hrError }, { data: profileData }] = await Promise.all([
    supabase
      .from('timeclock_status')
      .select('homebase_id, name, date, worked_hours'),
    supabase
      .from('hours')
      .select('homebase_id, date, hours')
      .eq('type_id', 1),
    supabase
      .from('profiles_view')
      .select('homebase_id, name')
      .eq('role_id', 1),
  ]);

  if (tcError) throw new Error('Failed to load timeclock data');
  if (hrError) throw new Error('Failed to load hours data');

  type TcRow = { homebase_id: number; name: string; date: string; worked_hours: number | null };
  type HrRow = { homebase_id: number; date: string; hours: number };

  const nameMap = new Map<number, string>();
  for (const p of (profileData ?? []) as Array<{ homebase_id: number; name: string }>) {
    nameMap.set(p.homebase_id, p.name);
  }
  for (const row of (tcData ?? []) as TcRow[]) {
    if (!nameMap.has(row.homebase_id)) nameMap.set(row.homebase_id, row.name);
  }

  const tcMap = new Map<string, number>();
  for (const row of (tcData ?? []) as TcRow[]) {
    const key = `${row.homebase_id}|${row.date}`;
    tcMap.set(key, (tcMap.get(key) ?? 0) + (row.worked_hours ?? 0));
  }

  const hrMap = new Map<string, number>();
  const hrIds = new Set<string>();
  for (const row of (hrData ?? []) as HrRow[]) {
    const key = `${row.homebase_id}|${row.date.split('T')[0]}`;
    hrMap.set(key, (hrMap.get(key) ?? 0) + (row.hours ?? 0));
    hrIds.add(key);
  }

  const today = new Date().toISOString().split('T')[0];
  const allKeys = new Set([...tcMap.keys(), ...hrIds]);
  const rows: CompareRow[] = [];

  for (const key of allKeys) {
    const [id_str, date] = key.split('|');
    if (date === today) continue;
    const internal = tcMap.get(key) ?? 0;
    if (internal === 0) continue;
    const homebase_id = parseInt(id_str);
    const external = hrMap.get(key) ?? 0;
    const name = nameMap.get(homebase_id) ?? `Employee ${homebase_id}`;
    rows.push({
      homebase_id,
      name,
      date,
      internal_hours: Math.round(internal * 100) / 100,
      external_hours: Math.round(external * 100) / 100,
      diff: Math.round((internal - external) * 100) / 100,
    });
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name) || a.date.localeCompare(b.date));
}

export function subscribeToTimeclock(onChanged: () => void) {
  return supabase
    .channel('timeclock-watch')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'timeclock_entries' }, onChanged)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'timeclock_breaks' }, onChanged)
    .subscribe();
}

// ── Needs Attention items ─────────────────────────────────────────────────

export type NeedsAttentionType =
  | 'no_clock_in'
  | 'no_clock_out'
  | 'no_break_end'
  | 'no_timepunch_image'
  | 'timepunch_image_mismatch';

export interface NeedsAttentionRecord {
  id: string;
  homebase_id: number;
  student_name: string;
  date: string;
  type: NeedsAttentionType;
  is_resolved: boolean;
  description: string | null;
  created_at: string;
  resolved_at: string | null;
}

export async function fetchNeedsAttentionItems(): Promise<NeedsAttentionRecord[]> {
  const { data, error } = await supabase
    .from('needs_attention_items')
    .select('id, homebase_id, student_name, date, type, is_resolved, description, created_at, resolved_at')
    .order('date', { ascending: false });
  if (error) throw new Error('Failed to load needs attention items');
  return (data ?? []) as NeedsAttentionRecord[];
}

export async function createNeedsAttentionItem(payload: {
  homebase_id: number;
  student_name: string;
  date: string;
  type: NeedsAttentionType;
  description?: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from('needs_attention_items')
    .insert({ ...payload, description: payload.description ?? null });
  if (error) throw new Error('Failed to create needs attention item');
}

export async function updateNeedsAttentionItem(
  id: string,
  updates: Partial<{ type: NeedsAttentionType; description: string | null; is_resolved: boolean }>
): Promise<void> {
  const body: typeof updates & { resolved_at?: string | null } = { ...updates };
  if ('is_resolved' in updates) {
    body.resolved_at = updates.is_resolved ? new Date().toISOString() : null;
  }
  const { error } = await supabase
    .from('needs_attention_items')
    .update(body)
    .eq('id', id);
  if (error) throw new Error('Failed to update needs attention item');
}

export async function deleteNeedsAttentionItem(id: string): Promise<void> {
  const { error } = await supabase
    .from('needs_attention_items')
    .delete()
    .eq('id', id);
  if (error) throw new Error('Failed to delete needs attention item');
}

export type AuditAction =
  | 'login' | 'logout'
  | 'grade_update'
  | 'timeclock_edit'
  | 'timeclock_add'
  | 'role_change'
  | 'pin_reset' | 'password_reset' | 'password_clear'
  | 'student_removed' | 'student_reactivated'
  | 'needs_attention_resolved' | 'needs_attention_resolve_all'
  | 'view_as_student';

export interface AuditLogRecord {
  id: string;
  actor_id: number | null;
  actor_name: string | null;
  action: AuditAction;
  target_id: string | null;
  target_name: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export async function fetchAuditLog(limit = 200): Promise<AuditLogRecord[]> {
  const { data, error } = await supabase
    .from('audit_log')
    .select('id, actor_id, actor_name, action, target_id, target_name, description, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error('Failed to load audit log');
  return (data ?? []) as AuditLogRecord[];
}

export async function logAuditEvent(entry: {
  actor_id: number | null;
  actor_name: string | null;
  action: AuditAction;
  target_id?: string | number | null;
  target_name?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  const { error } = await supabase.from('audit_log').insert({
    actor_id: entry.actor_id,
    actor_name: entry.actor_name,
    action: entry.action,
    target_id: entry.target_id != null ? String(entry.target_id) : null,
    target_name: entry.target_name ?? null,
    description: entry.description ?? null,
    metadata: entry.metadata ?? null,
  });
  if (error) throw new Error('Failed to write audit log entry');
}
