-- ChatGPT
-- Notes:
-- - Assumes auth.users exists (managed by Supabase Auth)
-- - Run as a migration in Supabase SQL editor or CLI
-- - Enables pgcrypto for UUID generation / hashing helpers
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- ENUMS
-- ============================================================================

create type public.user_role_code as enum ('student', 'admin');
create type public.student_status as enum ('active', 'inactive', 'graduated', 'suspended');
create type public.enrollment_status as enum ('active', 'completed', 'withdrawn');
create type public.punch_type as enum ('clock_in', 'clock_out', 'break_start', 'break_end');
create type public.punch_source as enum ('kiosk', 'admin', 'api', 'import');
create type public.geofence_mode as enum ('none', 'circle', 'polygon');

-- ============================================================================
-- TABLES
-- ============================================================================

create table public.roles (
    role_id smallserial primary key,
    role_code public.user_role_code not null unique,
    description text
);

create table public.app_users (
    user_id uuid primary key references auth.users(id) on delete cascade,
    role_id smallint not null references public.roles(role_id),
    display_name text not null,
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

create table public.programs (
    program_id bigserial primary key,
    program_name text not null unique,
    required_hours numeric(10,2) not null check (required_hours >= 0),
    active_flag boolean not null default true,
    created_at timestamptz not null default now()
);

create table public.students (
    student_id bigserial primary key,
    user_id uuid not null unique references public.app_users(user_id) on delete cascade,
    student_number text not null unique,
    program_id bigint references public.programs(program_id),
    pin_hash text not null,
    pin_failed_count integer not null default 0 check (pin_failed_count >= 0),
    pin_locked_until timestamptz,
    status public.student_status not null default 'active',
    created_at timestamptz not null default now()
);

create table public.admins (
    admin_id bigserial primary key,
    user_id uuid not null unique references public.app_users(user_id) on delete cascade,
    job_title text,
    created_at timestamptz not null default now()
);

create table public.enrollments (
    enrollment_id bigserial primary key,
    student_id bigint not null references public.students(student_id) on delete cascade,
    program_id bigint not null references public.programs(program_id),
    start_date date not null,
    end_date date,
    status public.enrollment_status not null default 'active',
    created_at timestamptz not null default now(),
    check (end_date is null or end_date >= start_date)
);

create table public.school_locations (
    location_id bigserial primary key,
    location_name text not null,
    address text,
    geofence_mode public.geofence_mode not null default 'none',
    geofence_center_lat numeric(9,6),
    geofence_center_lng numeric(9,6),
    geofence_radius_m numeric(10,2),
    geofence_geojson jsonb,
    is_primary boolean not null default false,
    active_flag boolean not null default true,
    created_at timestamptz not null default now(),
    check (
      geofence_center_lat is null or
      (geofence_center_lat between -90 and 90)
    ),
    check (
      geofence_center_lng is null or
      (geofence_center_lng between -180 and 180)
    ),
    check (
      geofence_radius_m is null or geofence_radius_m >= 0
    )
);

create table public.kiosk_devices (
    device_id bigserial primary key,
    location_id bigint not null references public.school_locations(location_id),
    device_name text not null,
    device_fingerprint text not null unique,
    device_secret_hash text,
    is_active boolean not null default true,
    last_seen_at timestamptz,
    created_at timestamptz not null default now()
);

create table public.time_punches (
    punch_id bigserial primary key,
    student_id bigint not null references public.students(student_id),
    device_id bigint references public.kiosk_devices(device_id),
    punch_type public.punch_type not null,
    occurred_at timestamptz not null default now(),
    source public.punch_source not null default 'kiosk',

    captured_lat numeric(9,6),
    captured_lng numeric(9,6),
    accuracy_m numeric(10,2),

    geofence_passed boolean not null default false,

    created_by_user_id uuid references public.app_users(user_id),
    created_at timestamptz not null default now(),

    voided_at timestamptz,
    voided_by_user_id uuid references public.app_users(user_id),
    void_reason text,

    check (captured_lat is null or captured_lat between -90 and 90),
    check (captured_lng is null or captured_lng between -180 and 180),
    check (accuracy_m is null or accuracy_m >= 0),
    check (
      (voided_at is null and voided_by_user_id is null and void_reason is null)
      or
      (voided_at is not null and voided_by_user_id is not null and void_reason is not null)
    )
);

create table public.punch_snapshots (
    snapshot_id bigserial primary key,
    punch_id bigint not null references public.time_punches(punch_id) on delete cascade,
    storage_bucket text not null,
    storage_path text not null,
    captured_at timestamptz not null default now(),
    capture_source text not null,
    checksum_sha256 text,
    metadata jsonb,
    unique(storage_bucket, storage_path)
);

create table public.audit_log (
    audit_id bigserial primary key,
    actor_user_id uuid references public.app_users(user_id),
    entity_name text not null,
    entity_pk text not null,
    action_type text not null,
    old_data jsonb,
    new_data jsonb,
    created_at timestamptz not null default now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

create index idx_students_status on public.students(status);
create index idx_time_punches_student_occurred on public.time_punches(student_id, occurred_at desc);
create index idx_time_punches_open on public.time_punches(student_id) where voided_at is null;
create index idx_enrollments_student on public.enrollments(student_id);
create index idx_kiosk_devices_location on public.kiosk_devices(location_id);

-- ============================================================================
-- SEED ROLES
-- ============================================================================

insert into public.roles (role_code, description)
values
('student', 'Student user'),
('admin', 'Administrative user')
on conflict do nothing;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Return true if current authenticated user is admin
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
    select exists (
        select 1
        from public.app_users au
        join public.roles r on r.role_id = au.role_id
        where au.user_id = auth.uid()
          and au.is_active = true
          and r.role_code = 'admin'
    );
$$;

-- Return current student_id for logged in user
create or replace function public.current_student_id()
returns bigint
language sql
stable
as $$
    select s.student_id
    from public.students s
    where s.user_id = auth.uid()
    limit 1;
$$;

-- Basic geofence validator (radius mode only for v1)
create or replace function public.validate_geofence(
    p_device_id bigint,
    p_lat numeric,
    p_lng numeric
)
returns boolean
language plpgsql
stable
as $$
declare
    v_mode public.geofence_mode;
    v_center_lat numeric;
    v_center_lng numeric;
    v_radius numeric;
    v_distance numeric;
begin
    select sl.geofence_mode,
           sl.geofence_center_lat,
           sl.geofence_center_lng,
           sl.geofence_radius_m
    into v_mode, v_center_lat, v_center_lng, v_radius
    from public.kiosk_devices kd
    join public.school_locations sl on sl.location_id = kd.location_id
    where kd.device_id = p_device_id;

    if v_mode is null or v_mode = 'none' then
        return true;
    end if;

    if p_lat is null or p_lng is null then
        return false;
    end if;

    if v_mode = 'circle' then
        -- rough meters conversion for local radius check
        v_distance :=
            sqrt(
                power((p_lat - v_center_lat) * 111111, 2) +
                power((p_lng - v_center_lng) * 111111, 2)
            );

        return v_distance <= v_radius;
    end if;

    -- polygon reserved for future
    return true;
end;
$$;

-- Determine if punch sequence is valid
create or replace function public.last_active_punch_type(p_student_id bigint)
returns public.punch_type
language sql
stable
as $$
    select tp.punch_type
    from public.time_punches tp
    where tp.student_id = p_student_id
      and tp.voided_at is null
    order by tp.occurred_at desc, tp.punch_id desc
    limit 1;
$$;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

create or replace function public.trg_validate_time_punch()
returns trigger
language plpgsql
as $$
declare
    v_last public.punch_type;
    v_student_status public.student_status;
    v_device_active boolean;
begin
    -- student must be active
    select status into v_student_status
    from public.students
    where student_id = new.student_id;

    if v_student_status <> 'active' then
        raise exception 'Student is not active';
    end if;

    -- device must be active if supplied
    if new.device_id is not null then
        select is_active into v_device_active
        from public.kiosk_devices
        where device_id = new.device_id;

        if coalesce(v_device_active, false) = false then
            raise exception 'Inactive kiosk device';
        end if;
    end if;

    -- geofence check
    if new.device_id is not null then
        new.geofence_passed :=
            public.validate_geofence(
                new.device_id,
                new.captured_lat,
                new.captured_lng
            );
    else
        new.geofence_passed := true;
    end if;

    if new.geofence_passed = false then
        raise exception 'Outside geofence';
    end if;

    -- sequence validation
    v_last := public.last_active_punch_type(new.student_id);

    if new.punch_type = 'clock_in' then
        if v_last in ('clock_in', 'break_end') then
            raise exception 'Already clocked in';
        end if;
    elsif new.punch_type = 'clock_out' then
        if v_last not in ('clock_in', 'break_end') then
            raise exception 'Cannot clock out without open session';
        end if;
    elsif new.punch_type = 'break_start' then
        if v_last not in ('clock_in', 'break_end') then
            raise exception 'Cannot start break';
        end if;
    elsif new.punch_type = 'break_end' then
        if v_last <> 'break_start' then
            raise exception 'Cannot end break';
        end if;
    end if;

    return new;
end;
$$;

create trigger before_insert_time_punch
before insert on public.time_punches
for each row
execute function public.trg_validate_time_punch();

-- Audit trigger
create or replace function public.trg_audit_generic()
returns trigger
language plpgsql
as $$
begin
    if tg_op = 'INSERT' then
        insert into public.audit_log(actor_user_id, entity_name, entity_pk, action_type, new_data)
        values (auth.uid(), tg_table_name, to_jsonb(new)->>0, 'INSERT', to_jsonb(new));
        return new;
    elsif tg_op = 'UPDATE' then
        insert into public.audit_log(actor_user_id, entity_name, entity_pk, action_type, old_data, new_data)
        values (auth.uid(), tg_table_name, to_jsonb(new)->>0, 'UPDATE', to_jsonb(old), to_jsonb(new));
        return new;
    elsif tg_op = 'DELETE' then
        insert into public.audit_log(actor_user_id, entity_name, entity_pk, action_type, old_data)
        values (auth.uid(), tg_table_name, to_jsonb(old)->>0, 'DELETE', to_jsonb(old));
        return old;
    end if;

    return null;
end;
$$;

create trigger audit_students
after insert or update or delete on public.students
for each row execute function public.trg_audit_generic();

create trigger audit_time_punches
after insert or update or delete on public.time_punches
for each row execute function public.trg_audit_generic();

-- ============================================================================
-- VIEWS
-- ============================================================================

create or replace view public.v_student_current_status as
select
    s.student_id,
    s.student_number,
    au.display_name,
    (
        select tp.punch_type
        from public.time_punches tp
        where tp.student_id = s.student_id
          and tp.voided_at is null
        order by tp.occurred_at desc, tp.punch_id desc
        limit 1
    ) as last_punch_type,
    (
        select tp.occurred_at
        from public.time_punches tp
        where tp.student_id = s.student_id
          and tp.voided_at is null
        order by tp.occurred_at desc, tp.punch_id desc
        limit 1
    ) as last_punch_at
from public.students s
join public.app_users au on au.user_id = s.user_id;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.app_users enable row level security;
alter table public.students enable row level security;
alter table public.admins enable row level security;
alter table public.programs enable row level security;
alter table public.enrollments enable row level security;
alter table public.kiosk_devices enable row level security;
alter table public.school_locations enable row level security;
alter table public.time_punches enable row level security;
alter table public.punch_snapshots enable row level security;
alter table public.audit_log enable row level security;

-- Students can view own app user row
create policy app_users_self_select
on public.app_users
for select
using (user_id = auth.uid() or public.is_admin());

-- Students can view own student row
create policy students_self_select
on public.students
for select
using (user_id = auth.uid() or public.is_admin());

-- Admin full access students
create policy students_admin_all
on public.students
for all
using (public.is_admin())
with check (public.is_admin());

-- Programs readable by authenticated users
create policy programs_read
on public.programs
for select
using (auth.uid() is not null);

-- Time punches: student can read own
create policy punches_self_select
on public.time_punches
for select
using (
    student_id = public.current_student_id()
    or public.is_admin()
);

-- Time punches: admin manage
create policy punches_admin_all
on public.time_punches
for all
using (public.is_admin())
with check (public.is_admin());

-- Enrollments
create policy enrollments_self_select
on public.enrollments
for select
using (
    student_id = public.current_student_id()
    or public.is_admin()
);

create policy enrollments_admin_all
on public.enrollments
for all
using (public.is_admin())
with check (public.is_admin());

-- Audit log admin only
create policy audit_admin_read
on public.audit_log
for select
using (public.is_admin());

-- ============================================================================
-- REVOKE DIRECT PUBLIC INSERT TO PUNCHES (use Edge Function later)
-- ============================================================================

revoke insert on public.time_punches from anon;
revoke insert on public.time_punches from authenticated;

-- ============================================================================
-- COMPLETE
-- ============================================================================