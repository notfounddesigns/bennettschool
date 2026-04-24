import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';


const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const SUPABASE_URL = 'https://wivquwyesxwcysjgtuji.supabase.co'
const SUPABASE_SERVICE_KEY = 'sb_publishable_inqQrSuwsDxQ3WnPPlxHRA_Lz9UDtA1'
const TEMPLATE_BUCKET = 'templates';
const TEMPLATE_FILE  = 'students_export.xlsx';
const DATA_ROW = 7; // 1-indexed row where student rows begin in the template

type HourRow = { homebase_id: number; type_id: number; date: string; hours: number };

const now = new Date();
const year = parseInt(String(now.getUTCFullYear()));
const month = parseInt(String(now.getUTCMonth() + 1)); // 1–12

const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
const today = now.toISOString().slice(0, 10);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function fetchAllPages(query: () => ReturnType<typeof supabase.from>['select']): Promise<HourRow[]> {
  const PAGE = 1000;
  const results: HourRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await (query() as any).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    results.push(...(data as HourRow[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return results;
}

const [
  { data: studentsData, error: studentsError },
  { data: currentMonthHours, error: currentMonthError },
] = await Promise.all([
  supabase
    .from('profiles_view')
    .select('homebase_id, name, role_id')
    .eq('role_id', 1)
    .order('name'),

  // Current month hours (in-person + DE), up to today
  supabase
    .from('hours')
    .select('homebase_id, type_id, date, hours')
    .gte('date', firstDay)
    .lte('date', today),
]);

if (studentsError || currentMonthError) {
  console.log('Failed to fetch data');
}

// All hours before this month — paginated to avoid the 1000-row default cap
const allPriorHoursList = await fetchAllPages(() =>
  supabase
    .from('hours')
    .select('homebase_id, type_id, hours, date')
    .lt('date', firstDay)
    .order('date')
);

const currentMonthHoursList = (currentMonthHours ?? []) as HourRow[];
const monthPrefix = `${year}-${String(month).padStart(2, '0')}-`;

const rows = (studentsData as Array<{ homebase_id: number; name: string }>).map(student => {
  const id = student.homebase_id;
  const sh = currentMonthHoursList.filter(h => h.homebase_id === id);
  const shPrior = allPriorHoursList.filter(h => h.homebase_id === id);

  // Columns B–AF: in-person hours per calendar day (blank when zero)
  const days = Array.from({ length: 31 }, (_, i) => {
    const dateStr = `${monthPrefix}${String(i + 1).padStart(2, '0')}`;
    const hrs = sh
      .filter(h => h.type_id === 1 && h.date.substring(0, h.date.indexOf('T')) === dateStr)
      .reduce((s, h) => s + h.hours, 0);
    return hrs > 0 ? hrs : '';
  });

  const { curMonthInPersonHrs, curMonthDeHrs, curMonthHrs } = sh.reduce(
    (acc, s) => {
      if (s.type_id === 1) acc.curMonthInPersonHrs += s.hours;
      if (s.type_id === 2) acc.curMonthDeHrs += s.hours;
      acc.curMonthHrs += s.hours;
      return acc;
    },
    { curMonthInPersonHrs: 0, curMonthDeHrs: 0, curMonthHrs: 0 }
  );

  // AI – Previous Total (all hours before this month)
  console.log(shPrior)
  const prevTotal = shPrior
    .reduce((s, h) => s + h.hours, 0);

  // AJ – Overall Total
  const overallTotal = prevTotal + curMonthHrs;

  return [
    student.name,
    ...days,
    curMonthDeHrs    || '',
    curMonthInPersonHrs || '',
    prevTotal    || '',
    overallTotal || '',
  ];
});

console.log(rows[0])

// const buf = await Deno.readFile(TEMPLATE_PATH);
// const wb = XLSX.read(buf, { type: 'array', cellStyles: true });
// Load template from Storage
const { data: templateBlob } = await supabase.storage
  .from(TEMPLATE_BUCKET)
  .download(TEMPLATE_FILE);

let wb: XLSX.WorkBook;

if (!templateBlob) {
  console.log('no template found');
  // No template yet — generate a plain workbook as fallback
  const headers = [
    'Student Name',
    ...Array.from({ length: 31 }, (_, i) => i + 1),
    'Monthly DE Hour Total',
    'Monthly Total',
    "Previous Month's Total",
    'Overall Total',
  ];
  wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, 'Students');
} else {
  const buf = await templateBlob.arrayBuffer();
  wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellStyles: true });
  const ws = wb.Sheets[wb.SheetNames[0]];

  // Patch the month/year header cells
  ws['A3'] = { v: `Month: ${MONTH_NAMES[month - 1]}`, t: 's' };
  ws['C3'] = { v: `Year: ${year}`, t: 's' };

  // Write student rows starting at A7
  XLSX.utils.sheet_add_aoa(ws, rows, { origin: `A${DATA_ROW}` });
}

XLSX.writeFile(wb, `bennett_${MONTH_NAMES[month - 1].toLowerCase()}_${year}.xlsx`, { compression: true });