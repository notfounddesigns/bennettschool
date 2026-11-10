import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function errResp(message: string, status = 400) {
  return new Response(JSON.stringify({ result: 'error', error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return errResp('Unauthorized', 401)

    // Verify caller identity and role via their JWT
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return errResp('Unauthorized', 401)

    const { data: roleName } = await userClient.rpc('fn_current_role_name')
    if (!['admin', 'super_admin'].includes(roleName)) return errResp('Forbidden', 403)

    // Parse body
    const body = await req.json() as {
      session_id: number
      field: 'clock_in' | 'clock_out'
      new_time: string
    }
    const { session_id, field, new_time } = body

    if (!session_id || !field || !new_time) return errResp('Missing required fields')
    if (field !== 'clock_in' && field !== 'clock_out') return errResp('Invalid field')

    const newTimeDate = new Date(new_time)
    if (isNaN(newTimeDate.getTime())) return errResp('Invalid new_time')

    // Service-role client — bypasses RLS and the REVOKE on time_entries
    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Fetch the session
    const { data: session, error: sessionErr } = await db
      .from('time_sessions')
      .select('id, student_id, clock_in_entry_id, clock_out_entry_id, clock_in_at, clock_out_at, is_open')
      .eq('id', session_id)
      .single()

    if (sessionErr || !session) return errResp('Session not found', 404)

    const isClockIn = field === 'clock_in'
    const oldEntryId = isClockIn ? session.clock_in_entry_id : session.clock_out_entry_id

    if (!isClockIn && !session.clock_out_entry_id) {
      return errResp('No clock-out entry exists on this session')
    }

    // Fetch original entry to copy punch_type and break_type_id
    const { data: oldEntry } = await db
      .from('time_entries')
      .select('punch_type, break_type_id')
      .eq('id', oldEntryId)
      .single()

    if (!oldEntry) return errResp('Original entry not found', 404)

    // Insert corrected entry.
    // is_manual_entry = true bypasses trg_prevent_backdating.
    const { data: newEntry, error: insertErr } = await db
      .from('time_entries')
      .insert({
        student_id: session.student_id,
        punch_type: oldEntry.punch_type,
        break_type_id: oldEntry.break_type_id ?? null,
        source: 'admin',
        punched_at: new_time,
        is_manual_entry: true,
        manual_entry_by: user.id,
        manual_entry_note: `Admin correction — original entry id: ${oldEntryId}`,
      })
      .select('id')
      .single()

    if (insertErr || !newEntry) {
      return errResp(`Failed to insert corrected entry: ${insertErr?.message}`)
    }

    // Void the original entry
    const { error: voidErr } = await db
      .from('time_entries')
      .update({
        is_voided: true,
        voided_by: user.id,
        voided_at: new Date().toISOString(),
        voided_reason: `Corrected by admin ${user.id} — replacement entry id: ${newEntry.id}`,
      })
      .eq('id', oldEntryId)

    if (voidErr) return errResp(`Failed to void original entry: ${voidErr.message}`)

    // Update time_session to point to corrected entry
    const sessionUpdate: Record<string, unknown> = isClockIn
      ? { clock_in_entry_id: newEntry.id, clock_in_at: new_time }
      : { clock_out_entry_id: newEntry.id, clock_out_at: new_time }

    // Recalculate gross_minutes when session is already closed
    if (!session.is_open) {
      const clockInMs = isClockIn
        ? newTimeDate.getTime()
        : new Date(session.clock_in_at).getTime()
      const clockOutMs = isClockIn
        ? new Date(session.clock_out_at).getTime()
        : newTimeDate.getTime()
      sessionUpdate.gross_minutes = Math.round((clockOutMs - clockInMs) / 60_000)
    }

    const { error: updateErr } = await db
      .from('time_sessions')
      .update(sessionUpdate)
      .eq('id', session_id)

    if (updateErr) return errResp(`Failed to update session: ${updateErr.message}`)

    return new Response(JSON.stringify({ result: 'ok', entry_id: newEntry.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('override-punch error:', err)
    return new Response(JSON.stringify({ result: 'error', error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
