// import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const HOMEBASE_TOKEN = 'uzhTXFXg1j5P8qDVduNRSEMerF81TX-0AMtfXR_5wmM'
const HOMEBASE_LOCATION = 'e54bb3a8-0641-414e-a763-95fd64ad3521'
// const SUPABASE_URL = 'https://wivquwyesxwcysjgtuji.supabase.co'
// const SUPABASE_SERVICE_KEY = 'sb_publishable_inqQrSuwsDxQ3WnPPlxHRA_Lz9UDtA1'

try {
  const date = new Date(Date.now()).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })

  console.log(`Syncing labor by employee for ${date}`)

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error({ error: 'Invalid date format. Expected YYYY-MM-DD' }, 400)
  }

  // 1. Fetch Aggregated Labor
  const hbResponse = await fetch(
    `https://api.joinhomebase.com/locations/${HOMEBASE_LOCATION}/labor/by_employee?start_date=${date}&end_date=${date}`,
    {
      headers: {
        'Accept': 'application/vnd.homebase-v1+json',
        'Authorization': `Bearer ${HOMEBASE_TOKEN}`,
      },
    }
  )

  if (!hbResponse.ok) throw new Error(`Homebase API error: ${hbResponse.status}`)
  const laborData = await hbResponse.json()

  if (!laborData || laborData.length === 0) {
    console.error({ result: 'ok', message: `No labor data found for ${date}`, inserted: 0 })
  }

  // 2. Map to your Supabase schema
  const rows = laborData
    .filter((emp: any) => emp.labor.paid_hours > 0) // Only sync people who actually worked
    .map((emp: any) => ({
      homebase_id: emp.user_id,
      name: `${emp.first_name} ${emp.last_name}`,
      date: date,
      hours: emp.labor.paid_hours,
    }))
  
  console.log(rows)
  rows.forEach(r => {
    console.log(`${r.name} - ${r.date} - ${r.hours}`)
  })

  // const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!)

  // 3. Upsert into 'hours'
  // const { error: upsertError } = await supabase
  //   .from('hours')
  //   .upsert(rows)

  // if (upsertError) throw upsertError

  // 4. Log the Sync
  // await supabase.from('sync_log').insert({
  //   date_synced: date,
  //   inserted: rows.length,
  //   synced_by: 'manual',
  // })

  // console.log(`Successfully synced ${rows.length} employee totals for ${date}`)
} catch (err: any) {
  console.error({ err })
}