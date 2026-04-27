import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const HOMEBASE_TOKEN = 'uzhTXFXg1j5P8qDVduNRSEMerF81TX-0AMtfXR_5wmM'
const HOMEBASE_LOCATION = 'e54bb3a8-0641-414e-a763-95fd64ad3521'

const today = new Date();
const monthsToSync = 48; 

interface HomeBaseLaborEmployee {
  user_id: number;
  first_name: string;
  last_name: string;
  labor: { paid_hours: number };
}

const employeeDataset: Record<string, Record<string, number>> = {};

function buildMonthRanges(numMonths: number) {
  const ranges = [];
  for (let i = 0; i < numMonths; i++) {
    const start = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const end = i === 0 ? today : new Date(today.getFullYear(), today.getMonth() - i + 1, 0);
    ranges.push({
      label: start.toISOString().slice(0, 7),
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
    });
  }
  return ranges.reverse();
}

async function fetchLaborByEmployee(startDate: string, endDate: string): Promise<HomeBaseLaborEmployee[]> {
  const res = await fetch(
    `https://api.joinhomebase.com/locations/${HOMEBASE_LOCATION}/labor/by_employee?start_date=${startDate}&end_date=${endDate}`,
    {
      headers: {
        'Accept': 'application/vnd.homebase-v1+json',
        'Authorization': `Bearer ${HOMEBASE_TOKEN}`,
      },
    }
  );
  if (!res.ok) throw new Error(`Homebase API error: ${res.status}`);
  return await res.json();
}

// ── Execution ──────────────────────────────────────────────────────────────

const ranges = buildMonthRanges(monthsToSync);
console.log(`Syncing ${monthsToSync} months...`);

for (const range of ranges) {
  console.log(`Processing ${range.label}...`);
  const laborData = await fetchLaborByEmployee(range.startDate, range.endDate);
  laborData.forEach(emp => {
    const fullName = `${emp.first_name} ${emp.last_name}`;
    if (!employeeDataset[fullName]) employeeDataset[fullName] = {};
    employeeDataset[fullName][range.label] = emp.labor.paid_hours || 0;
  });
}

// ── CSV Generation ────────────────────────────────────────────────────────

const csvHeader = ["Employee Name", ...ranges.map(r => r.label), "Grand Total"].join(",");
const csvRows = Object.entries(employeeDataset).map(([name, monthlyHours]) => {
  let grandTotal = 0;
  const columns = ranges.map(range => {
    const h = monthlyHours[range.label] || 0;
    grandTotal += h;
    return h.toFixed(2);
  });
  // Wrap name in quotes to handle names with commas
  return `"${name}",${columns.join(",")},${grandTotal.toFixed(2)}`;
});

const csvContent = [csvHeader, ...csvRows].join("\n");
await Deno.writeTextFile("homebase_report.csv", csvContent);

console.log("\nSuccess! Report saved to homebase_report.csv");