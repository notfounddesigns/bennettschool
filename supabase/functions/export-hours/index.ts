import * as XLSX from 'npm:xlsx';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// The service role is required: monthly_hours_view reads tables the anon role
// cannot, and under RLS a publishable key returns zero rows rather than an
// error — an empty spreadsheet with no indication anything went wrong.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://wivquwyesxwcysjgtuji.supabase.co';
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!SUPABASE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const TEMPLATE_BUCKET = 'templates';
const TEMPLATE_FILE  = 'students_export.xlsx';
const DATA_ROW = 7;                // 1-indexed row where student rows begin
const DAY_COLUMNS = 31;            // Columns B–AF
const STUDENT_ROLE_ID = 1;

// Mirrors the cutover in monthly_hours_view. Used only for error messages —
// the view is what enforces it.
const TRACKING_START = '2026-07-01';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const pad = (n: number) => String(n).padStart(2, '0');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * One row of public.monthly_hours_view. Every total is already rounded and
 * scoped to the month by the view; day_hours holds 31 slots of in-person hours
 * (columns B–AF) with null wherever the cell should be blank.
 */
type MonthlyHoursRow = {
  homebase_id: number;
  name: string;
  role_id: number;
  month_start: string;
  de_hours: number | string | null;
  in_person_hours: number | string | null;
  prev_total_hours: number | string | null;
  overall_total_hours: number | string | null;
  day_hours: Array<number | string | null> | null;
};

/** An error carrying the status code the client should see. */
class HttpError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sheet cells are blank rather than zero, and PostgREST can hand numerics back
 * as strings, so coerce on the way into the workbook.
 */
function cell(v: number | string | null | undefined): number | '' {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : '';
}

/**
 * Month/year resolution, in priority order:
 *   ?period=2025-03
 *   ?month=3&year=2025   (or the same keys in a JSON body on POST)
 *   defaults to the current UTC month/year
 */
function resolvePeriod(
  params: Record<string, unknown>,
): { month: number; year: number } | { error: string } {
  const now = new Date();
  let month = now.getUTCMonth() + 1;
  let year = now.getUTCFullYear();

  const period = params.period;
  if (typeof period === 'string' && period !== '') {
    const match = /^(\d{4})-(\d{1,2})$/.exec(period);
    if (!match) return { error: `Invalid period "${period}". Expected YYYY-MM.` };
    year = Number(match[1]);
    month = Number(match[2]);
  } else {
    if (params.month !== undefined && params.month !== null && params.month !== '') {
      month = Number(params.month);
    }
    if (params.year !== undefined && params.year !== null && params.year !== '') {
      year = Number(params.year);
    }
  }

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return { error: `Invalid month "${params.month}". Expected 1-12.` };
  }
  if (!Number.isInteger(year) || year < 1900 || year > 9999) {
    return { error: `Invalid year "${params.year}". Expected a 4-digit year.` };
  }

  return { month, year };
}

// ---------------------------------------------------------------------------
// Workbook
// ---------------------------------------------------------------------------

export async function buildWorkbook(month: number, year: number): Promise<XLSX.WorkBook> {
  const monthStart = `${year}-${pad(month)}-01`;

  console.log(`Building ${MONTH_NAMES[month - 1]} ${year} (month_start ${monthStart})`);

  // --- Fetch -------------------------------------------------------------
  //
  // All aggregation lives in monthly_hours_view: the 2026-07-01 tracking
  // cutover, timeclock_entries superseding `hours`, soft-deleted rows, the
  // running prior total, and the per-day breakdown. One row per student, so
  // there is nothing to page through.

  const { data, error } = await supabase
    .from('monthly_hours_view')
    .select('name, de_hours, in_person_hours, prev_total_hours, overall_total_hours, day_hours')
    .eq('month_start', monthStart)
    .eq('role_id', STUDENT_ROLE_ID)
    .order('name');

  if (error) throw new Error(`Failed to fetch monthly hours: ${error.message}`);

  const students = (data ?? []) as MonthlyHoursRow[];
  if (students.length === 0) {
    throw new HttpError(
      `No hours recorded for ${MONTH_NAMES[month - 1]} ${year}. ` +
      `Tracked months run from ${TRACKING_START} to the current month; ` +
      `anything earlier is covered by each student's legacy_hours total.`,
      404,
    );
  }

  // --- Rows --------------------------------------------------------------

  const rows = students.map(s => [
    s.name,
    // B–AF. Padded to a fixed width so a short array can never shift the
    // total columns left.
    ...Array.from({ length: DAY_COLUMNS }, (_, i) => cell(s.day_hours?.[i])),
    cell(s.de_hours),             // AG – Monthly DE total
    cell(s.in_person_hours),      // AH – Monthly in-person total
    cell(s.prev_total_hours),     // AI – Cumulative through end of prior month
    cell(s.overall_total_hours),  // AJ – Overall total
  ]);

  // --- Sheet -------------------------------------------------------------

  const { data: templateBlob } = await supabase.storage
    .from(TEMPLATE_BUCKET)
    .download(TEMPLATE_FILE);

  if (!templateBlob) {
    console.log('no template found — falling back to a plain workbook');
    const headers = [
      'Student Name',
      ...Array.from({ length: DAY_COLUMNS }, (_, i) => i + 1),
      'Monthly DE Hour Total',
      'Monthly Total',
      "Previous Month's Total",
      'Overall Total',
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, 'Students');
    return wb;
  }

  const buf = await templateBlob.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellStyles: true });
  const ws = wb.Sheets[wb.SheetNames[0]];

  // Patch the month/year header cells
  ws['A3'] = { v: `Month: ${MONTH_NAMES[month - 1]}`, t: 's' };
  ws['C3'] = { v: `Year: ${year}`, t: 's' };

  // Write student rows starting at A7
  XLSX.utils.sheet_add_aoa(ws, rows, { origin: `A${DATA_ROW}` });
  return wb;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const url = new URL(req.url);
    const params: Record<string, unknown> = Object.fromEntries(url.searchParams);

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      Object.assign(params, body);
    }

    const period = resolvePeriod(params);
    if ('error' in period) {
      return new Response(JSON.stringify({ error: period.error }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const { month, year } = period;
    const wb = await buildWorkbook(month, year);

    // In-memory write — the edge runtime has no writable filesystem
    const out = XLSX.write(wb, {
      type: 'array',
      bookType: 'xlsx',
      compression: true,
      cellStyles: true,
    }) as ArrayBuffer;

    const filename = `bennett_${MONTH_NAMES[month - 1].toLowerCase()}_${year}.xlsx`;

    return new Response(out, {
      headers: {
        ...CORS_HEADERS,
        'Content-Type': XLSX_MIME,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error(err);
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
