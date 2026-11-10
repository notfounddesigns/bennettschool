-- Claude AI
-- Execution order
--   1. Extensions
--   2. Schemas
--   3. Config / lookup tables  (no FK deps)
--   4. Core domain tables      (FK deps on config)
--   5. Indexes
--   6. Functions
--   7. Triggers
--   8. Views
--   9. Row Level Security
--  10. Seed data
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. EXTENSIONS
-- ---------------------------------------------------------------------------

create extension if not exists "uuid-ossp";   -- uuid_generate_v4()
create extension if not exists "pgcrypto";    -- crypt() / gen_salt() for PIN hashing
create extension if not exists "postgis";     -- geography type for future geofencing

-- pg_cron is pre-installed on Supabase; enable only if scheduling is needed:
-- create extension if not exists "pg_cron";


-- ---------------------------------------------------------------------------
-- 2. SCHEMAS
-- ---------------------------------------------------------------------------

create schema if not exists config;
create schema if not exists audit;


-- ---------------------------------------------------------------------------
-- 3. CONFIG / LOOKUP TABLES
-- ---------------------------------------------------------------------------

-- ── config.school_config ────────────────────────────────────────────────────
-- Single-row application configuration.
-- Enforced by CHECK (id = 1) so no accidental second row is ever inserted.

create table config.school_config (
    id                      smallint     primary key default 1,
    school_name             text         not null,
    max_daily_hours         numeric(4,2) not null default 8.00,
    max_weekly_hours        numeric(5,2) not null default 40.00,
    required_program_hours  numeric(7,2) not null default 1500.00,
    timezone                text         not null default 'America/Chicago',
    geofence_enabled        boolean      not null default false,
    biometrics_enabled      boolean      not null default false,
    pin_length              smallint     not null default 4,
    pin_max_attempts        smallint     not null default 5,
    pin_lockout_minutes     smallint     not null default 15,
    created_at              timestamptz  not null default now(),
    updated_at              timestamptz  not null default now(),

    constraint chk_school_config_single_row check (id = 1),
    constraint chk_school_config_pin_length check (pin_length between 4 and 8),
    constraint chk_school_config_max_daily  check (max_daily_hours > 0),
    constraint chk_school_config_max_weekly check (max_weekly_hours > 0)
);

comment on table  config.school_config                   is 'Single-row application-wide settings.';
comment on column config.school_config.geofence_enabled  is 'When true, punches require a valid geofence_zone match.';
comment on column config.school_config.biometrics_enabled is 'When true, facial recognition is enforced on punch.';


-- ── config.programs ─────────────────────────────────────────────────────────
-- Cosmetology programs (Cosmetology, Esthetics, Nail Tech, etc.)

create table config.programs (
    id             uuid         primary key default uuid_generate_v4(),
    name           text         not null unique,
    required_hours numeric(7,2) not null,
    description    text,
    is_active      boolean      not null default true,
    created_at     timestamptz  not null default now(),
    updated_at     timestamptz  not null default now(),

    constraint chk_programs_required_hours check (required_hours > 0)
);

comment on table config.programs is 'Cosmetology programs offered by the school.';


-- ── config.punch_types ──────────────────────────────────────────────────────

create table config.punch_types (
    id        smallint generated always as identity primary key,
    code      text     not null unique,
    label     text     not null,
    is_active boolean  not null default true
);

comment on table  config.punch_types      is 'Valid punch event types: IN, OUT, BREAK_START, BREAK_END.';
comment on column config.punch_types.code is 'Machine-readable code used in application logic and Edge Functions.';


-- ── config.break_types ──────────────────────────────────────────────────────

create table config.break_types (
    id          smallint generated always as identity primary key,
    code        text     not null unique,
    label       text     not null,
    is_paid     boolean  not null default false,
    max_minutes smallint,           -- null = no limit enforced
    is_active   boolean  not null default true,

    constraint chk_break_types_max_minutes check (max_minutes is null or max_minutes > 0)
);

comment on table  config.break_types.is_paid is 'Paid breaks do not reduce credited hours.';


-- ---------------------------------------------------------------------------
-- 4. CORE DOMAIN TABLES
-- ---------------------------------------------------------------------------

-- ── public.roles ────────────────────────────────────────────────────────────

create table public.roles (
    id   smallint generated always as identity primary key,
    name text     not null unique
);

comment on table public.roles is 'Application roles: student, admin, super_admin.';


-- ── public.users ────────────────────────────────────────────────────────────
-- Bridge between auth.users (Supabase Auth) and application data.
-- Populated automatically via trigger on auth.users (see section 6).

create table public.users (
    id         uuid        primary key references auth.users (id) on delete cascade,
    role_id    smallint    not null references public.roles (id),
    first_name text        not null,
    last_name  text        not null,
    email      text        not null unique,
    is_active  boolean     not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.users is 'Application user profile bridging Supabase auth.users.';


-- ── public.students ─────────────────────────────────────────────────────────

create table public.students (
    id              uuid        primary key default uuid_generate_v4(),
    user_id         uuid        unique references public.users (id) on delete cascade,
    student_number  text        not null unique,
    program_id      uuid        not null references config.programs (id),
    enrollment_date date        not null,
    expected_grad   date,
    is_active       boolean     not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    constraint chk_students_grad_after_enrollment
        check (expected_grad is null or expected_grad > enrollment_date)
);

comment on table public.students is 'Student records. user_id is nullable to allow creation before portal account.';


-- ── public.student_pins ─────────────────────────────────────────────────────
-- Intentionally isolated from students so least-privilege RLS can lock it down.
-- PINs are stored as bcrypt hashes via pgcrypto — never plaintext.

create table public.student_pins (
    id              uuid        primary key default uuid_generate_v4(),
    student_id      uuid        not null unique references public.students (id) on delete cascade,
    pin_hash        text        not null,
    failed_attempts smallint    not null default 0,
    locked_until    timestamptz,
    last_changed_at timestamptz not null default now(),
    created_at      timestamptz not null default now(),

    constraint chk_student_pins_failed_attempts check (failed_attempts >= 0)
);

comment on table  public.student_pins          is 'Bcrypt-hashed kiosk PINs. Never expose via RLS to non-superadmin.';
comment on column public.student_pins.pin_hash is 'crypt(raw_pin, gen_salt(''bf'', 8)) — bcrypt work factor 8.';


-- ── public.kiosk_devices ────────────────────────────────────────────────────

create table public.kiosk_devices (
    id             uuid        primary key default uuid_generate_v4(),
    device_name    text        not null,
    device_token   text        not null unique,  -- SHA-256 hash of issued bearer token
    location_label text,
    is_active      boolean     not null default true,
    last_seen_at   timestamptz,
    created_at     timestamptz not null default now()
);

comment on table  public.kiosk_devices             is 'Registered iPad kiosk devices.';
comment on column public.kiosk_devices.device_token is 'Hashed bearer token sent in x-device-token header.';


-- ── public.geofence_zones ───────────────────────────────────────────────────
-- Future: restrict punch-in to defined geographic boundaries.

create table public.geofence_zones (
    id         uuid                      primary key default uuid_generate_v4(),
    name       text                      not null,
    boundary   geography(POLYGON, 4326),  -- full polygon boundary
    radius_m   numeric(8,2),              -- alternative center+radius (set one or the other)
    is_active  boolean                   not null default true,
    created_at timestamptz               not null default now(),

    constraint chk_geofence_zone_radius check (radius_m is null or radius_m > 0)
);

comment on table public.geofence_zones is 'PostGIS geographic boundaries for future punch-in geofencing.';


-- ── public.time_entries ─────────────────────────────────────────────────────
-- Immutable fact table — one row per kiosk punch event.
-- Admin corrections use is_manual_entry / is_voided flags; rows are never deleted.

create table public.time_entries (
    id                   uuid        primary key default uuid_generate_v4(),
    student_id           uuid        not null references public.students (id),
    punch_type_id        smallint    not null references config.punch_types (id),
    break_type_id        smallint    references config.break_types (id),
    punched_at           timestamptz not null default now(),
    punched_at_local     timestamptz,             -- denormalized local-tz copy; set by trigger
    device_id            uuid        references public.kiosk_devices (id),
    -- Geofencing (future)
    location_lat         double precision,
    location_lng         double precision,
    geofence_zone_id     uuid        references public.geofence_zones (id),
    geofence_status      text,                    -- 'inside' | 'outside' | 'unknown'
    -- Biometrics (future)
    biometric_verified   boolean,
    biometric_confidence numeric(5,4),            -- 0.0000–1.0000
    -- Admin manual entry
    is_manual_entry      boolean     not null default false,
    manual_entry_by      uuid        references public.users (id),
    manual_entry_note    text,
    -- Soft void
    is_voided            boolean     not null default false,
    voided_by            uuid        references public.users (id),
    voided_at            timestamptz,
    voided_reason        text,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now(),

    constraint chk_time_entries_geofence_status check (
        geofence_status is null or
        geofence_status in ('inside', 'outside', 'unknown')
    ),
    constraint chk_time_entries_biometric_confidence check (
        biometric_confidence is null or
        biometric_confidence between 0 and 1
    ),
    constraint chk_time_entries_void_requires_reason check (
        is_voided = false or (voided_by is not null and voided_reason is not null)
    ),
    constraint chk_time_entries_manual_requires_user check (
        is_manual_entry = false or manual_entry_by is not null
    )
);

comment on table  public.time_entries                  is 'Immutable punch events. Corrections via is_voided / is_manual_entry.';
comment on column public.time_entries.punched_at_local is 'Denormalized local-timezone timestamp — set by fn_set_punched_at_local trigger.';
comment on column public.time_entries.break_type_id    is 'Must be set only on BREAK_START / BREAK_END punches (enforced by fn_process_punch).';


-- ── public.time_sessions ────────────────────────────────────────────────────
-- Computed IN→OUT pairs. Maintained by triggers on time_entries.

create table public.time_sessions (
    id                  uuid        primary key default uuid_generate_v4(),
    student_id          uuid        not null references public.students (id),
    clock_in_entry_id   uuid        not null unique references public.time_entries (id),
    clock_out_entry_id  uuid        unique references public.time_entries (id),
    session_date        date        not null,
    clock_in_at         timestamptz not null,
    clock_out_at        timestamptz,
    gross_minutes       integer,
    break_minutes       integer     not null default 0,
    credited_minutes    integer,
    is_open             boolean     not null default true,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),

    constraint chk_time_sessions_clock_out_after_in check (
        clock_out_at is null or clock_out_at > clock_in_at
    ),
    constraint chk_time_sessions_gross_minutes check (
        gross_minutes is null or gross_minutes >= 0
    ),
    constraint chk_time_sessions_break_minutes check (break_minutes >= 0),
    constraint chk_time_sessions_credited_minutes check (
        credited_minutes is null or credited_minutes >= 0
    )
);

comment on table public.time_sessions is 'Computed clock-in / clock-out session pairs with credited hour totals.';


-- ── public.break_sessions ───────────────────────────────────────────────────

create table public.break_sessions (
    id                   uuid        primary key default uuid_generate_v4(),
    time_session_id      uuid        not null references public.time_sessions (id) on delete cascade,
    student_id           uuid        not null references public.students (id),
    break_type_id        smallint    not null references config.break_types (id),
    break_start_entry_id uuid        not null unique references public.time_entries (id),
    break_end_entry_id   uuid        unique references public.time_entries (id),
    started_at           timestamptz not null,
    ended_at             timestamptz,
    duration_minutes     integer,
    is_open              boolean     not null default true,
    created_at           timestamptz not null default now(),

    constraint chk_break_sessions_end_after_start check (
        ended_at is null or ended_at > started_at
    ),
    constraint chk_break_sessions_duration check (
        duration_minutes is null or duration_minutes >= 0
    )
);

comment on table public.break_sessions is 'Break pairs nested within a time_session.';


-- ── public.time_entry_snapshots ─────────────────────────────────────────────
-- Future: background photo captures tied to each punch event.

create table public.time_entry_snapshots (
    id             uuid        primary key default uuid_generate_v4(),
    time_entry_id  uuid        not null references public.time_entries (id) on delete cascade,
    storage_path   text        not null,   -- Supabase Storage object path (private bucket)
    captured_at    timestamptz not null default now(),
    match_score    numeric(5,4),           -- facial recognition confidence (future)
    match_status   text,                   -- 'matched' | 'no_match' | 'pending' | 'skipped'
    created_at     timestamptz not null default now(),

    constraint chk_snapshots_match_score check (
        match_score is null or match_score between 0 and 1
    ),
    constraint chk_snapshots_match_status check (
        match_status is null or
        match_status in ('matched', 'no_match', 'pending', 'skipped')
    )
);

comment on table public.time_entry_snapshots is 'Photo snapshots captured at punch time for future facial recognition.';


-- ── public.biometric_templates ──────────────────────────────────────────────
-- Future: facial recognition enrollment templates.

create table public.biometric_templates (
    id             uuid        primary key default uuid_generate_v4(),
    student_id     uuid        not null references public.students (id) on delete cascade,
    template_type  text        not null default 'face',
    storage_path   text        not null,   -- encrypted template in private Storage bucket
    is_primary     boolean     not null default false,
    enrolled_at    timestamptz not null default now(),
    enrolled_by    uuid        references public.users (id),
    is_active      boolean     not null default true,
    created_at     timestamptz not null default now(),

    constraint chk_biometric_template_type check (template_type in ('face'))
);

comment on table public.biometric_templates is 'Facial recognition enrollment templates (future).';


-- ── audit.log ───────────────────────────────────────────────────────────────
-- Append-only audit trail. Rows are never updated or deleted.

create table audit.log (
    id          bigint      primary key generated always as identity,
    schema_name text        not null,
    table_name  text        not null,
    record_id   uuid        not null,
    action      text        not null,
    old_data    jsonb,
    new_data    jsonb,
    changed_by  uuid,                  -- auth.uid() at change time (null = system/trigger)
    changed_at  timestamptz not null default now(),
    ip_address  inet,
    user_agent  text,

    constraint chk_audit_log_action check (action in ('INSERT', 'UPDATE', 'DELETE'))
);

comment on table audit.log is 'Immutable audit trail. Never update or delete rows.';


-- ---------------------------------------------------------------------------
-- 5. INDEXES
-- ---------------------------------------------------------------------------

-- time_entries
create index idx_time_entries_student_punched
    on public.time_entries (student_id, punched_at desc)
    where is_voided = false;

create index idx_time_entries_student_date
    on public.time_entries (student_id, (punched_at::date))
    where is_voided = false;

create index idx_time_entries_punched_at
    on public.time_entries (punched_at desc);

-- time_sessions
create index idx_time_sessions_student_date
    on public.time_sessions (student_id, session_date desc);

create index idx_time_sessions_open
    on public.time_sessions (student_id)
    where is_open = true;

-- break_sessions
create index idx_break_sessions_time_session
    on public.break_sessions (time_session_id)
    where is_open = true;

-- biometric_templates — only one primary per student per type
create unique index idx_biometric_templates_primary
    on public.biometric_templates (student_id, template_type)
    where is_primary = true;

-- audit.log
create index idx_audit_log_table_record
    on audit.log (schema_name, table_name, record_id);

create index idx_audit_log_changed_at
    on audit.log (changed_at desc);

create index idx_audit_log_changed_by
    on audit.log (changed_by)
    where changed_by is not null;


-- ---------------------------------------------------------------------------
-- 6. FUNCTIONS
-- ---------------------------------------------------------------------------

-- ── fn_set_updated_at ───────────────────────────────────────────────────────
-- Generic before-update trigger to stamp updated_at.

create or replace function public.fn_set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

comment on function public.fn_set_updated_at() is
    'Generic trigger function: stamps updated_at = now() before every UPDATE.';


-- ── fn_set_punched_at_local ─────────────────────────────────────────────────
-- Denormalizes punched_at into the school's local timezone.

create or replace function public.fn_set_punched_at_local()
returns trigger
language plpgsql
as $$
declare
    v_tz text;
begin
    select timezone into v_tz from config.school_config limit 1;
    new.punched_at_local := new.punched_at at time zone v_tz;
    return new;
end;
$$;


-- ── fn_current_role_name ────────────────────────────────────────────────────
-- Returns the role name of the currently authenticated Supabase user.
-- Used in RLS policies.

create or replace function public.fn_current_role_name()
returns text
language sql
security definer
stable
as $$
    select r.name
    from public.users u
    join public.roles r on r.id = u.role_id
    where u.id = auth.uid();
$$;

comment on function public.fn_current_role_name() is
    'Returns the application role name for the current auth.uid(). Used in RLS policies.';


-- ── fn_validate_pin ─────────────────────────────────────────────────────────
-- Called exclusively by the punch-clock Edge Function (service role).
-- Validates student number + raw PIN, manages lockout counter.
-- Returns jsonb: { success, student_id, first_name, last_name } | { success:false, error }

create or replace function public.fn_validate_pin(
    p_student_number text,
    p_raw_pin        text
)
returns jsonb
language plpgsql
security definer
set search_path = public, config
as $$
declare
    v_student record;
    v_config  record;
    v_now     timestamptz := now();
begin
    select pin_max_attempts, pin_lockout_minutes
    into   v_config
    from   config.school_config;

    select
        s.id              as student_id,
        s.is_active       as student_active,
        u.first_name,
        u.last_name,
        sp.id             as pin_id,
        sp.pin_hash,
        sp.failed_attempts,
        sp.locked_until
    into v_student
    from   public.students     s
    join   public.users        u  on u.id  = s.user_id
    join   public.student_pins sp on sp.student_id = s.id
    where  s.student_number = p_student_number;

    if not found then
        return jsonb_build_object('success', false, 'error', 'STUDENT_NOT_FOUND');
    end if;

    if not v_student.student_active then
        return jsonb_build_object('success', false, 'error', 'STUDENT_INACTIVE');
    end if;

    if v_student.locked_until is not null and v_student.locked_until > v_now then
        return jsonb_build_object(
            'success',     false,
            'error',       'PIN_LOCKED',
            'locked_until', v_student.locked_until
        );
    end if;

    -- Verify bcrypt hash
    if v_student.pin_hash = crypt(p_raw_pin, v_student.pin_hash) then
        update public.student_pins
        set    failed_attempts = 0,
               locked_until   = null
        where  id = v_student.pin_id;

        return jsonb_build_object(
            'success',    true,
            'student_id', v_student.student_id,
            'first_name', v_student.first_name,
            'last_name',  v_student.last_name
        );
    else
        update public.student_pins
        set
            failed_attempts = failed_attempts + 1,
            locked_until    = case
                when failed_attempts + 1 >= v_config.pin_max_attempts
                then now() + (v_config.pin_lockout_minutes || ' minutes')::interval
                else locked_until
            end
        where id = v_student.pin_id;

        return jsonb_build_object('success', false, 'error', 'INVALID_PIN');
    end if;
end;
$$;

comment on function public.fn_validate_pin(text, text) is
    'Validates kiosk PIN. Manages failed-attempt lockout. Called only by service-role Edge Functions.';


-- ── fn_process_punch ────────────────────────────────────────────────────────
-- State machine: validates punch transition, inserts time_entry,
-- creates/updates time_session and break_session records.

create or replace function public.fn_process_punch(
    p_student_id  uuid,
    p_punch_code  text,
    p_break_code  text             default null,
    p_device_id   uuid             default null,
    p_lat         double precision default null,
    p_lng         double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, config
as $$
declare
    v_punch_type   record;
    v_break_type   record;
    v_open_session record;
    v_open_break   record;
    v_entry_id     uuid;
    v_session_id   uuid;
begin
    -- Resolve punch type
    select id into v_punch_type
    from   config.punch_types
    where  code = p_punch_code and is_active;

    if not found then
        return jsonb_build_object('success', false, 'error', 'INVALID_PUNCH_TYPE');
    end if;

    -- Resolve break type when provided
    if p_break_code is not null then
        select id into v_break_type
        from   config.break_types
        where  code = p_break_code and is_active;

        if not found then
            return jsonb_build_object('success', false, 'error', 'INVALID_BREAK_TYPE');
        end if;
    end if;

    -- Check for an existing open session
    select * into v_open_session
    from   public.time_sessions
    where  student_id = p_student_id and is_open = true
    limit  1;

    -- ── State machine ─────────────────────────────────────────────────────
    case p_punch_code

        when 'IN' then
            if found then
                return jsonb_build_object('success', false, 'error', 'ALREADY_CLOCKED_IN');
            end if;

        when 'OUT' then
            if not found then
                return jsonb_build_object('success', false, 'error', 'NOT_CLOCKED_IN');
            end if;
            select * into v_open_break
            from   public.break_sessions
            where  time_session_id = v_open_session.id and is_open = true;
            if found then
                return jsonb_build_object('success', false, 'error', 'BREAK_STILL_OPEN');
            end if;

        when 'BREAK_START' then
            if not found then
                return jsonb_build_object('success', false, 'error', 'NOT_CLOCKED_IN');
            end if;
            if p_break_code is null then
                return jsonb_build_object('success', false, 'error', 'BREAK_TYPE_REQUIRED');
            end if;
            select * into v_open_break
            from   public.break_sessions
            where  time_session_id = v_open_session.id and is_open = true;
            if found then
                return jsonb_build_object('success', false, 'error', 'BREAK_ALREADY_OPEN');
            end if;

        when 'BREAK_END' then
            if not found then
                return jsonb_build_object('success', false, 'error', 'NOT_CLOCKED_IN');
            end if;
            select * into v_open_break
            from   public.break_sessions
            where  time_session_id = v_open_session.id and is_open = true;
            if not found then
                return jsonb_build_object('success', false, 'error', 'NO_OPEN_BREAK');
            end if;

        else
            return jsonb_build_object('success', false, 'error', 'UNKNOWN_PUNCH_CODE');
    end case;

    -- ── Insert time_entry ─────────────────────────────────────────────────
    insert into public.time_entries (
        student_id,
        punch_type_id,
        break_type_id,
        device_id,
        location_lat,
        location_lng
    ) values (
        p_student_id,
        v_punch_type.id,
        v_break_type.id,   -- null if not a break punch
        p_device_id,
        p_lat,
        p_lng
    )
    returning id into v_entry_id;

    -- ── Mutate session / break records ────────────────────────────────────
    case p_punch_code

        when 'IN' then
            insert into public.time_sessions (
                student_id,
                clock_in_entry_id,
                session_date,
                clock_in_at
            ) values (
                p_student_id,
                v_entry_id,
                current_date,
                now()
            )
            returning id into v_session_id;

        when 'OUT' then
            update public.time_sessions
            set
                clock_out_entry_id = v_entry_id,
                clock_out_at       = now(),
                gross_minutes      = extract(epoch from (now() - clock_in_at))::integer / 60,
                is_open            = false   -- triggers fn_calc_credited_minutes
            where id = v_open_session.id
            returning id into v_session_id;

        when 'BREAK_START' then
            insert into public.break_sessions (
                time_session_id,
                student_id,
                break_type_id,
                break_start_entry_id,
                started_at
            ) values (
                v_open_session.id,
                p_student_id,
                v_break_type.id,
                v_entry_id,
                now()
            );
            v_session_id := v_open_session.id;

        when 'BREAK_END' then
            update public.break_sessions
            set
                break_end_entry_id = v_entry_id,
                ended_at           = now(),
                duration_minutes   = extract(epoch from (now() - started_at))::integer / 60,
                is_open            = false
            where id = v_open_break.id;
            v_session_id := v_open_session.id;

    end case;

    return jsonb_build_object(
        'success',    true,
        'entry_id',   v_entry_id,
        'session_id', v_session_id,
        'punch_code', p_punch_code,
        'punched_at', now()
    );
end;
$$;

comment on function public.fn_process_punch(uuid, text, text, uuid, double precision, double precision) is
    'Core punch state machine. Called exclusively by punch-clock Edge Function via service role.';


-- ── fn_calc_credited_minutes ────────────────────────────────────────────────
-- Trigger function: recalculates break_minutes and credited_minutes
-- when a time_session is closed (is_open flips false).

create or replace function public.fn_calc_credited_minutes()
returns trigger
language plpgsql
as $$
declare
    v_unpaid_break_mins integer;
begin
    if new.is_open = false and old.is_open = true then
        select coalesce(sum(bs.duration_minutes), 0)
        into   v_unpaid_break_mins
        from   public.break_sessions bs
        join   config.break_types    bt on bt.id = bs.break_type_id
        where  bs.time_session_id  = new.id
          and  bt.is_paid          = false
          and  bs.duration_minutes is not null;

        new.break_minutes    := v_unpaid_break_mins;
        new.credited_minutes := greatest(0, new.gross_minutes - v_unpaid_break_mins);
    end if;
    return new;
end;
$$;


-- ── fn_prevent_punch_backdating ─────────────────────────────────────────────
-- Kiosk punches cannot be backdated beyond 5 minutes.
-- Manual admin entries (is_manual_entry = true) bypass this check.

create or replace function public.fn_prevent_punch_backdating()
returns trigger
language plpgsql
as $$
begin
    if new.is_manual_entry = false
       and new.punched_at < now() - interval '5 minutes' then
        raise exception
            'Kiosk punches cannot be backdated. Use a manual admin entry instead.'
            using errcode = 'P0001';
    end if;
    return new;
end;
$$;


-- ── fn_audit_log ────────────────────────────────────────────────────────────
-- Appends a row to audit.log for INSERT / UPDATE / DELETE on watched tables.

create or replace function audit.fn_audit_log()
returns trigger
language plpgsql
security definer
as $$
begin
    insert into audit.log (
        schema_name,
        table_name,
        record_id,
        action,
        old_data,
        new_data,
        changed_by
    ) values (
        tg_table_schema,
        tg_table_name,
        coalesce(
            case when tg_op != 'DELETE' then (row_to_json(new) ->> 'id')::uuid end,
            (row_to_json(old) ->> 'id')::uuid
        ),
        tg_op,
        case when tg_op != 'INSERT' then to_jsonb(old) end,
        case when tg_op != 'DELETE' then to_jsonb(new) end,
        auth.uid()
    );
    return coalesce(new, old);
end;
$$;


-- ── fn_admin_set_pin ────────────────────────────────────────────────────────
-- Admin RPC to create or replace a student's PIN.
-- Exposed via supabase.rpc('fn_admin_set_pin', { ... }).

create or replace function public.fn_admin_set_pin(
    p_student_id uuid,
    p_raw_pin    text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if public.fn_current_role_name() not in ('admin', 'super_admin') then
        raise exception 'Unauthorized: admin role required.'
            using errcode = '42501';
    end if;

    if length(p_raw_pin) < 4 or length(p_raw_pin) > 8 then
        raise exception 'PIN must be between 4 and 8 digits.'
            using errcode = 'P0001';
    end if;

    insert into public.student_pins (student_id, pin_hash)
    values (p_student_id, crypt(p_raw_pin, gen_salt('bf', 8)))
    on conflict (student_id) do update
        set pin_hash        = excluded.pin_hash,
            failed_attempts = 0,
            locked_until    = null,
            last_changed_at = now();
end;
$$;

comment on function public.fn_admin_set_pin(uuid, text) is
    'Admin-only RPC: creates or replaces a student PIN hash. Resets lockout on change.';


-- ---------------------------------------------------------------------------
-- 7. TRIGGERS
-- ---------------------------------------------------------------------------

-- updated_at stamps
create trigger trg_updated_at_school_config
    before update on config.school_config
    for each row execute function public.fn_set_updated_at();

create trigger trg_updated_at_programs
    before update on config.programs
    for each row execute function public.fn_set_updated_at();

create trigger trg_updated_at_users
    before update on public.users
    for each row execute function public.fn_set_updated_at();

create trigger trg_updated_at_students
    before update on public.students
    for each row execute function public.fn_set_updated_at();

create trigger trg_updated_at_time_entries
    before update on public.time_entries
    for each row execute function public.fn_set_updated_at();

create trigger trg_updated_at_time_sessions
    before update on public.time_sessions
    for each row execute function public.fn_set_updated_at();

-- Denormalize local timestamp on insert
create trigger trg_punched_at_local
    before insert on public.time_entries
    for each row execute function public.fn_set_punched_at_local();

-- Backdate prevention on kiosk inserts
create trigger trg_prevent_backdating
    before insert on public.time_entries
    for each row execute function public.fn_prevent_punch_backdating();

-- Credited minutes recalculation on session close
create trigger trg_calc_credited_minutes
    before update on public.time_sessions
    for each row execute function public.fn_calc_credited_minutes();

-- Audit triggers
create trigger trg_audit_time_entries
    after insert or update or delete on public.time_entries
    for each row execute function audit.fn_audit_log();

create trigger trg_audit_time_sessions
    after insert or update or delete on public.time_sessions
    for each row execute function audit.fn_audit_log();

create trigger trg_audit_students
    after insert or update or delete on public.students
    for each row execute function audit.fn_audit_log();

create trigger trg_audit_student_pins
    after insert or update or delete on public.student_pins
    for each row execute function audit.fn_audit_log();

create trigger trg_audit_users
    after insert or update or delete on public.users
    for each row execute function audit.fn_audit_log();


-- ---------------------------------------------------------------------------
-- 8. VIEWS
-- ---------------------------------------------------------------------------

-- ── v_student_hours_summary ─────────────────────────────────────────────────
-- Aggregated credited hours per student vs their program requirement.
-- Used by student portal and admin reports.

create or replace view public.v_student_hours_summary
with (security_invoker = true)    -- respects caller's RLS context
as
select
    s.id                                                         as student_id,
    s.student_number,
    u.first_name,
    u.last_name,
    p.name                                                       as program_name,
    p.required_hours,
    coalesce(sum(ts.credited_minutes), 0)::numeric / 60         as total_credited_hours,
    p.required_hours
        - coalesce(sum(ts.credited_minutes), 0)::numeric / 60   as remaining_hours,
    round(
        coalesce(sum(ts.credited_minutes), 0)::numeric
        / nullif(p.required_hours * 60, 0) * 100,
        2
    )                                                            as completion_pct,
    count(ts.id)                                                 as total_sessions
from       public.students     s
join       public.users        u  on u.id  = s.user_id
join       config.programs     p  on p.id  = s.program_id
left join  public.time_sessions ts
           on  ts.student_id = s.id
           and ts.is_open    = false
group by   s.id, s.student_number, u.first_name, u.last_name,
           p.name, p.required_hours;

comment on view public.v_student_hours_summary is
    'Per-student credited hours vs program requirement. Respects RLS (security_invoker).';


-- ── v_active_sessions ───────────────────────────────────────────────────────
-- Students currently clocked in (open sessions). Used by kiosk status screen.

create or replace view public.v_active_sessions
with (security_invoker = true)
as
select
    ts.id                                                        as session_id,
    ts.student_id,
    s.student_number,
    u.first_name,
    u.last_name,
    ts.clock_in_at,
    extract(epoch from (now() - ts.clock_in_at))::integer / 60  as minutes_elapsed,
    (bs.id is not null)                                          as on_break,
    bs.started_at                                                as break_started_at,
    bt.label                                                     as break_type_label
from       public.time_sessions  ts
join       public.students       s   on s.id  = ts.student_id
join       public.users          u   on u.id  = s.user_id
left join  public.break_sessions bs  on bs.time_session_id = ts.id and bs.is_open = true
left join  config.break_types    bt  on bt.id = bs.break_type_id
where      ts.is_open = true;

comment on view public.v_active_sessions is
    'Currently clocked-in students. Includes break status.';


-- ---------------------------------------------------------------------------
-- 9. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------

alter table public.users              enable row level security;
alter table public.students           enable row level security;
alter table public.student_pins       enable row level security;
alter table public.time_entries       enable row level security;
alter table public.time_sessions      enable row level security;
alter table public.break_sessions     enable row level security;
alter table public.kiosk_devices      enable row level security;
alter table public.biometric_templates enable row level security;
alter table public.time_entry_snapshots enable row level security;
alter table audit.log                 enable row level security;

-- ── public.users ────────────────────────────────────────────────────────────

create policy "users: read own row"
    on public.users for select
    using (id = auth.uid());

create policy "users: admin full access"
    on public.users for all
    using (public.fn_current_role_name() in ('admin', 'super_admin'));

-- ── public.students ─────────────────────────────────────────────────────────

create policy "students: read own row"
    on public.students for select
    using (user_id = auth.uid());

create policy "students: admin full access"
    on public.students for all
    using (public.fn_current_role_name() in ('admin', 'super_admin'));

-- ── public.student_pins ─────────────────────────────────────────────────────
-- No direct client access. fn_validate_pin and fn_admin_set_pin are
-- SECURITY DEFINER and run as the table owner, bypassing RLS.

create policy "pins: super_admin only"
    on public.student_pins for all
    using (public.fn_current_role_name() = 'super_admin');

-- ── public.time_entries ─────────────────────────────────────────────────────

create policy "time_entries: read own"
    on public.time_entries for select
    using (
        student_id = (
            select id from public.students where user_id = auth.uid()
        )
    );

create policy "time_entries: admin full access"
    on public.time_entries for all
    using (public.fn_current_role_name() in ('admin', 'super_admin'));

-- ── public.time_sessions ────────────────────────────────────────────────────

create policy "time_sessions: read own"
    on public.time_sessions for select
    using (
        student_id = (
            select id from public.students where user_id = auth.uid()
        )
    );

create policy "time_sessions: admin full access"
    on public.time_sessions for all
    using (public.fn_current_role_name() in ('admin', 'super_admin'));

-- ── public.break_sessions ───────────────────────────────────────────────────

create policy "break_sessions: read own"
    on public.break_sessions for select
    using (
        student_id = (
            select id from public.students where user_id = auth.uid()
        )
    );

create policy "break_sessions: admin full access"
    on public.break_sessions for all
    using (public.fn_current_role_name() in ('admin', 'super_admin'));

-- ── public.kiosk_devices ────────────────────────────────────────────────────

create policy "kiosk_devices: admin full access"
    on public.kiosk_devices for all
    using (public.fn_current_role_name() in ('admin', 'super_admin'));

-- ── public.biometric_templates ──────────────────────────────────────────────

create policy "biometric_templates: read own"
    on public.biometric_templates for select
    using (
        student_id = (
            select id from public.students where user_id = auth.uid()
        )
    );

create policy "biometric_templates: admin full access"
    on public.biometric_templates for all
    using (public.fn_current_role_name() in ('admin', 'super_admin'));

-- ── public.time_entry_snapshots ─────────────────────────────────────────────

create policy "snapshots: admin full access"
    on public.time_entry_snapshots for all
    using (public.fn_current_role_name() in ('admin', 'super_admin'));

-- ── audit.log ───────────────────────────────────────────────────────────────
-- Admins can read; nobody can write directly (writes go via trigger only).

create policy "audit_log: admin read"
    on audit.log for select
    using (public.fn_current_role_name() in ('admin', 'super_admin'));


-- ---------------------------------------------------------------------------
-- 10. SEED DATA
-- ---------------------------------------------------------------------------

-- Config (single row)
insert into config.school_config (id, school_name, timezone)
values (1, 'Cosmetology School', 'America/Chicago')
on conflict (id) do nothing;

-- Programs
insert into config.programs (name, required_hours, description) values
    ('Cosmetology',    1500.00, 'Full cosmetology program'),
    ('Esthetics',       600.00, 'Skin care and esthetics program'),
    ('Nail Technology', 300.00, 'Nail care and technology program'),
    ('Barbering',      1000.00, 'Professional barbering program')
on conflict (name) do nothing;

-- Punch types
insert into config.punch_types (code, label) values
    ('IN',          'Clock In'),
    ('OUT',         'Clock Out'),
    ('BREAK_START', 'Break Start'),
    ('BREAK_END',   'Break End')
on conflict (code) do nothing;

-- Break types
insert into config.break_types (code, label, is_paid, max_minutes) values
    ('LUNCH_PAID',    'Paid Lunch',     true,  30),
    ('LUNCH_UNPAID',  'Unpaid Lunch',   false, 60),
    ('PERSONAL',      'Personal Break', false, 15)
on conflict (code) do nothing;

-- Application roles
insert into public.roles (name) values
    ('student'),
    ('admin'),
    ('super_admin')
on conflict (name) do nothing;


commit;


-- =============================================================================
-- ROLLBACK SCRIPT (run manually if needed — do NOT include in auto-migration)
-- Save separately as: 20240001000000_initial_timeclock_schema.down.sql
-- =============================================================================
--
-- begin;
--
-- drop view  if exists public.v_active_sessions;
-- drop view  if exists public.v_student_hours_summary;
--
-- drop trigger if exists trg_audit_users          on public.users;
-- drop trigger if exists trg_audit_student_pins   on public.student_pins;
-- drop trigger if exists trg_audit_students        on public.students;
-- drop trigger if exists trg_audit_time_sessions   on public.time_sessions;
-- drop trigger if exists trg_audit_time_entries    on public.time_entries;
-- drop trigger if exists trg_calc_credited_minutes on public.time_sessions;
-- drop trigger if exists trg_prevent_backdating    on public.time_entries;
-- drop trigger if exists trg_punched_at_local      on public.time_entries;
-- drop trigger if exists trg_updated_at_time_sessions on public.time_sessions;
-- drop trigger if exists trg_updated_at_time_entries  on public.time_entries;
-- drop trigger if exists trg_updated_at_students      on public.students;
-- drop trigger if exists trg_updated_at_users         on public.users;
-- drop trigger if exists trg_updated_at_programs      on config.programs;
-- drop trigger if exists trg_updated_at_school_config on config.school_config;
--
-- drop function if exists public.fn_admin_set_pin(uuid, text);
-- drop function if exists audit.fn_audit_log();
-- drop function if exists public.fn_prevent_punch_backdating();
-- drop function if exists public.fn_calc_credited_minutes();
-- drop function if exists public.fn_process_punch(uuid, text, text, uuid, double precision, double precision);
-- drop function if exists public.fn_validate_pin(text, text);
-- drop function if exists public.fn_current_role_name();
-- drop function if exists public.fn_set_punched_at_local();
-- drop function if exists public.fn_set_updated_at();
--
-- drop table if exists public.biometric_templates;
-- drop table if exists public.time_entry_snapshots;
-- drop table if exists public.break_sessions;
-- drop table if exists public.time_sessions;
-- drop table if exists public.time_entries;
-- drop table if exists public.geofence_zones;
-- drop table if exists public.kiosk_devices;
-- drop table if exists public.student_pins;
-- drop table if exists public.students;
-- drop table if exists public.users;
-- drop table if exists public.roles;
-- drop table if exists audit.log;
-- drop table if exists config.break_types;
-- drop table if exists config.punch_types;
-- drop table if exists config.programs;
-- drop table if exists config.school_config;
--
-- drop schema if exists audit;
-- drop schema if exists config;
--
-- commit;