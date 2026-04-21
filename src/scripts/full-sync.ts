import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const HOMEBASE_TOKEN = 'uzhTXFXg1j5P8qDVduNRSEMerF81TX-0AMtfXR_5wmM'
const HOMEBASE_LOCATION = 'e54bb3a8-0641-414e-a763-95fd64ad3521'
const SUPABASE_URL = 'https://wivquwyesxwcysjgtuji.supabase.co'
const SUPABASE_SERVICE_KEY = 'sb_publishable_inqQrSuwsDxQ3WnPPlxHRA_Lz9UDtA1'


function buildMonthRanges(): { startDate: string; endDate: string }[] {
  const ranges = []
  const now = new Date()

  for (let i = 0; i < 60; i++) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const end = i === 0
      ? new Date(now)
      : new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59)

    ranges.push({
      startDate: encodeURIComponent(start.toISOString().split('T')[0] + 'T00:00:00'),
      endDate:   encodeURIComponent(end.toISOString().split('T')[0]   + 'T23:59:59'),
    })
  }

  return ranges
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

async function fetchTimecards(startDate: string, endDate: string, page = 1): Promise<{ timecards: any[], totalPages: number }> {
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
const ranges = buildMonthRanges()

let totalInserted = 0
const errors: string[] = []
const allTimecards: any[] = []

const { data: existingProfiles } = await supabase
  .from('profiles')
  .select('homebase_id')

const knownIds = new Set(existingProfiles?.map((p: any) => p.homebase_id) ?? [])

console.log(`Starting historical sync for ${ranges.length} months...`)

for (const { startDate, endDate } of ranges) {
  try {
    await rateLimiter.throttle()
    const { timecards: firstPage, totalPages } = await fetchTimecards(startDate, endDate)

    if (!firstPage.length) {
      console.log(`No timecards found for ${decodeURIComponent(startDate).slice(0, 7)}, stopping.`)
      break
    }

    allTimecards.push(...firstPage)

    for (let page = 2; page <= totalPages; page++) {
      await rateLimiter.throttle()
      const { timecards } = await fetchTimecards(startDate, endDate, page)
      allTimecards.push(...timecards)
    }

    const rows = allTimecards
      .filter((tc: any) => tc.user_id != null && knownIds.has(tc.user_id))
      .map((tc: any) => ({
        homebase_id: tc.user_id,
        type_id:     1,
        date:        tc.clock_in.split('T')[0],
        hours:       tc.labor.regular_hours,
        verified:    tc.approved,
      }))

    const { error } = await supabase
      .from('hours')
      .upsert(rows, { onConflict: 'homebase_id,type_id,date', ignoreDuplicates: true })

    if (error) throw error

    totalInserted += rows.length
    console.log(`${decodeURIComponent(startDate).slice(0, 7)}: ${rows.length} rows upserted (total: ${totalInserted})`)

  } catch (err) {
    errors.push(`${decodeURIComponent(startDate).slice(0, 7)}: ${err.message}`)
    console.error(`Error: ${err.message}`)
  }
}

console.log(`\nDone! Total inserted: ${totalInserted}`)
if (errors.length) console.log('Errors:', errors)