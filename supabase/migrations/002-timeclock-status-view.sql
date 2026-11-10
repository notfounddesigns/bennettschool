-- Fix type mismatch from 001: manual_entry_by and voided_by must be uuid to
-- reference public.users(id) which is uuid, not bigint.
alter table public.time_entries
    drop column if exists manual_entry_by,
    drop column if exists voided_by;

alter table public.time_entries
    add column manual_entry_by uuid references public.users(id),
    add column voided_by       uuid references public.users(id);

-- timeclock_status view — compatible with the dashboard's fetchCurrentStudents query.
-- Exposes session_id so the admin UI can issue targeted punch corrections.
create or replace view public.timeclock_status
with (security_invoker = true)
as
select
    ts.id                                                               as session_id,
    s.id                                                                as homebase_id,
    u.first_name || ' ' || u.last_name                                 as name,
    ts.session_date                                                     as date,
    te_in.punched_at                                                    as clock_in,
    te_out.punched_at                                                   as clock_out,
    ts.is_open                                                          as is_clocked_in,
    (bs.id is not null)                                                 as on_break,
    round(
        coalesce(ts.credited_minutes, ts.gross_minutes, 0)::numeric / 60.0,
        2
    )                                                                   as worked_hours
from       public.time_sessions  ts
join       public.students       s       on s.id  = ts.student_id
join       public.users          u       on u.id  = s.user_id
join       public.time_entries   te_in   on te_in.id  = ts.clock_in_entry_id
left join  public.time_entries   te_out  on te_out.id = ts.clock_out_entry_id
left join  public.break_sessions bs      on bs.time_session_id = ts.id and bs.is_open = true
where      ts.session_date >= current_date - interval '6 days'
  and      te_in.is_voided = false
order by   ts.session_date desc, te_in.punched_at desc;

comment on view public.timeclock_status is
    'Current and recent (6-day) punch sessions. session_id enables admin punch corrections.';
