import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const HOMEBASE_TOKEN = 'uzhTXFXg1j5P8qDVduNRSEMerF81TX-0AMtfXR_5wmM'
const HOMEBASE_LOCATION = 'e54bb3a8-0641-414e-a763-95fd64ad3521'
const SUPABASE_URL = 'https://wivquwyesxwcysjgtuji.supabase.co'
const SUPABASE_SERVICE_KEY = 'sb_publishable_inqQrSuwsDxQ3WnPPlxHRA_Lz9UDtA1'

const today = new Date();
const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

interface HomeBaseEmployee {
  id: string;
  first_name: string;
  last_name: string;
}

interface HomeBaseTimeCard {
  user_id: string;
  clock_in: string;
  labor: { regular_hours: number };
  approved: boolean;
}

interface HourEntry {
  homebase_id: number;
  type_id: number;
  date: string;
  hours: number;
  verified: boolean;
}

const startTime = performance.now();

function getElapsed(): string {
  const ms = performance.now() - startTime;
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function printProgress(current: number, total: number, label: string): void {
  const pct = Math.round((current / total) * 100);
  const filled = Math.round(pct / 2); // 50 char wide bar
  const bar = '█'.repeat(filled) + '░'.repeat(50 - filled);
  Deno.stdout.writeSync(
    new TextEncoder().encode(`\r[${bar}] ${pct}% | ${current}/${total} | ${label} | ⏱ ${getElapsed()}`)
  );
}

function buildMonthRanges(): { startDate: string; endDate: string; label: string }[] {
  const ranges = []

  for (let i = 0; i < 1; i++) {
    const start = new Date(today.getFullYear(), today.getMonth() - i, 1)
    const end = i === 0
      ? new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2, 23, 59, 59)
      : new Date(today.getFullYear(), today.getMonth() - i + 1, 0, 23, 59, 59)

    ranges.push({
      label:     start.toISOString().slice(0, 7),
      startDate: encodeURIComponent(start.toISOString().split('T')[0] + 'T00:00:00'),
      endDate:   encodeURIComponent(end.toISOString().split('T')[0]   + 'T23:59:59'),
    })
  }
  console.log(ranges);
  return ranges;
}

const rateLimiter = {
  calls: [] as number[],
  limit: 55,

  async throttle() {
    const now = Date.now()
    const oneMinuteAgo = now - 60_000
    this.calls = this.calls.filter(t => t > oneMinuteAgo)

    if (this.calls.length >= this.limit) {
      const waitMs = this.calls[0] - oneMinuteAgo + 100
      console.log(`Rate limit reached. Waiting ${waitMs}ms...`)
      await new Promise(resolve => setTimeout(resolve, waitMs))
      this.calls = this.calls.filter(t => t > Date.now() - 60_000)
    }

    this.calls.push(Date.now())
  }
}

async function fetchHomebaseEmployees(): Promise<HomeBaseEmployee[]> {
  const employees: HomeBaseEmployee[] = [];
  let page = 1;

  while (true) {
    await rateLimiter.throttle();
    const res = await fetch(
      `https://app.joinhomebase.com/api/public/locations/${HOMEBASE_LOCATION}/employees?page=${page}&per_page=100`,
      {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${HOMEBASE_TOKEN}`,
        },
      }
    );

    if (!res.ok) throw new Error(`Homebase employees API error: ${res.status} ${res.statusText}`);

    const total = parseInt(res.headers.get('Total') ?? '1');
    const perPage = parseInt(res.headers.get('Per-Page') ?? '100');
    const totalPages = Math.ceil(total / perPage);
    const data = await res.json();

    employees.push(...data);

    if (page >= totalPages) break;
    page++;
  }

  return employees;
}

async function fetchTimecards(startDate: string, endDate: string, page = 1) {
  const res = await fetch(
    `https://app.joinhomebase.com/api/public/locations/${HOMEBASE_LOCATION}/timecards?page=${page}&per_page=100&start_date=${startDate}&end_date=${endDate}&date_filter=clock_in`,
    {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${HOMEBASE_TOKEN}`,
      },
    }
  )

  if (!res.ok) throw new Error(`Homebase API error: ${res.status} ${res.statusText}`)

  const total = parseInt(res.headers.get('Total') ?? '1')
  const perPage = parseInt(res.headers.get('Per-Page') ?? '100')
  const totalPages = Math.ceil(total / perPage)
  const timecards = await res.json()

  return { timecards, totalPages }
}


const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// // ── Step 1: Sync profiles ─────────────────────────────────────────────────────

console.log('Fetching Homebase employees...');
const homebaseEmployees = await fetchHomebaseEmployees();
console.log(`Found ${homebaseEmployees.length} Homebase employees.`);

console.log('Fetching Supabase profiles...');
const { data: existingProfiles, error: profilesError } = await supabase
  .from('profiles')
  .select('homebase_id');

if (profilesError) throw new Error(`Failed to fetch profiles: ${profilesError.message}`);

const existingIds = new Set((existingProfiles ?? []).map((p: { homebase_id: number }) => p.homebase_id));

const missingEmployees = homebaseEmployees.filter(e => !existingIds.has(Number(e.id)));

if (missingEmployees.length > 0) {
  console.log(`Inserting ${missingEmployees.length} missing profile(s)...`);
  const newProfiles = missingEmployees.map(e => ({
    homebase_id: Number(e.id),
    name: `${e.first_name} ${e.last_name}`.trim(),
  }));

  const { error: insertProfilesError } = await supabase
    .from('profiles')
    .insert(newProfiles);

  if (insertProfilesError) throw new Error(`Failed to insert profiles: ${insertProfilesError.message}`);
  console.log(`Inserted ${missingEmployees.length} new profile(s).`);
} else {
  console.log('No missing profiles — all Homebase employees are already in Supabase.');
}

// Re-fetch all known profile IDs (includes any we just inserted) so we can
// filter out timecards for employees who no longer exist in profiles (e.g. terminated).
const { data: allProfiles, error: allProfilesError } = await supabase
  .from('profiles')
  .select('homebase_id');

if (allProfilesError) throw new Error(`Failed to re-fetch profiles: ${allProfilesError.message}`);

const knownProfileIds = new Set((allProfiles ?? []).map((p: { homebase_id: number }) => p.homebase_id));

// // ── Step 2: Sync hours into hours_new ────────────────────────────────────────

const ranges = buildMonthRanges()
const errors: string[] = []

let grandTotalTimecards = 0;
let grandTotalHours = 0;

console.log(`\nStarting historical sync for ${ranges.length} months...`)

for (let i = 0; i < ranges.length; i++) {
  const { startDate, endDate, label } = ranges[i];
  try {
    await rateLimiter.throttle()
    const { timecards: firstPage, totalPages } = await fetchTimecards(startDate, endDate)

    if (!firstPage.length) {
      console.log(`\nNo timecards found for ${label}, stopping.`)
      break
    }

    const allTimecards = [...firstPage];

    for (let page = 2; page <= totalPages; page++) {
      await rateLimiter.throttle()
      const { timecards } = await fetchTimecards(startDate, endDate, page)
      allTimecards.push(...timecards)
    }

    const monthEntries: HourEntry[] = allTimecards
      .filter((tc: HomeBaseTimeCard) => knownProfileIds.has(Number(tc.user_id)))
      .map((tc: HomeBaseTimeCard) => ({
        homebase_id: Number(tc.user_id),
        type_id:     1,
        date:        tc.clock_in.split('T')[0],
        hours:       tc.labor.regular_hours,
        verified:    tc.approved,
      }));

    const skipped = allTimecards.length - monthEntries.length;
    if (skipped > 0) console.log(`\n  Skipped ${skipped} timecard(s) for unknown employees in ${label}`);
    
    if (i === 0) {
      console.log(`${monthEntries[0].homebase_id} - ${monthEntries[0].hours}`)
      console.log(`${monthEntries[1].homebase_id} - ${monthEntries[1].hours}`)
      console.log(`${monthEntries[2].homebase_id} - ${monthEntries[2].hours}`)
    }

    // const { error: insertError } = await supabase
    //   .from('hours_new')
    //   .insert(monthEntries);

    // if (insertError) throw new Error(`Insert failed for ${label}: ${insertError.message}`);

    grandTotalTimecards += monthEntries.length;
    grandTotalHours += monthEntries.reduce((sum, e) => sum + e.hours, 0);

  } catch (err: any) {
    errors.push(`${label}: ${err.message}`)
    console.error(`\nError: ${err.message}`)
  }

  printProgress(i + 1, ranges.length, label);
}

console.log(`\n\n====== GRAND TOTAL ======`);
console.log(`Timecards inserted: ${grandTotalTimecards}`);
console.log(`Total hours:        ${grandTotalHours.toFixed(2)}`);

if (errors.length) {
  console.log(`\nErrors (${errors.length}):`);
  errors.forEach(e => console.log(` - ${e}`));
}
