-- ═══════════════════════════════════════════════════════════════════════════
-- Alvin Desk — Relational schema + RLS (run in Supabase SQL Editor)
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- Drop legacy JSON blob table if migrating
drop table if exists public.app_store cascade;

-- ─── Organization (single-tenant; extend for multi-tenant later) ───────────
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Alvin Desk',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.organizations (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Alvin Desk')
on conflict (id) do nothing;

-- ─── Profiles (extends auth.users) ───────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade default '00000000-0000-0000-0000-000000000001',
  email text not null,
  name text not null,
  initials text,
  phone text,
  role text not null check (role in ('admin', 'manager', 'staff')) default 'staff',
  employment_type text not null default 'full-time',
  shift_id text,
  shift_override jsonb,
  joining_date date,
  dob date,
  location_exempt boolean not null default false,
  active boolean not null default true,
  tour_done boolean not null default false,
  manager_perms jsonb,
  manager_modules jsonb,
  panel_visibility jsonb not null default '{"salary":false,"overtime":false,"leaveBalance":false,"salaryCalc":false,"lateDeduction":false}'::jsonb,
  advance_balance jsonb not null default '{"active":false,"total":0,"remaining":0,"monthly":0,"overflow":0}'::jsonb,
  monthly_bonus numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_org_id_idx on public.profiles (org_id);
create index profiles_email_idx on public.profiles (email);
create index profiles_role_idx on public.profiles (role);

create table public.profile_departments (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  department_id text not null,
  primary key (profile_id, department_id)
);

create table public.user_salaries (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  basic numeric not null default 0,
  hra numeric not null default 0,
  transport numeric not null default 0,
  medical numeric not null default 0,
  updated_at timestamptz not null default now()
);

create table public.user_emergency_contacts (
  id text primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  name text not null default '',
  relation text not null default '',
  phone text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index user_emergency_contacts_profile_idx on public.user_emergency_contacts (profile_id);

-- ─── Catalogs ──────────────────────────────────────────────────────────────
create table public.org_settings (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.org_settings (org_id, settings)
values (
  '00000000-0000-0000-0000-000000000001',
  '{"companyName":"Alvin Desk","locationRestriction":false,"locationLat":24.8607,"locationLng":67.0011,"locationRadiusFeet":150,"alertDelayMinutes":30,"gracePeriodMinutes":10,"lateThresholdMinutes":15,"sessionTimeoutMinutes":60,"unusedLeavePolicy":"admin_decide","leaveTrackingPeriod":"yearly","salaryTypeLabels":{"basic":"Basic","hra":"HRA","transport":"Transport","medical":"Medical"}}'::jsonb
)
on conflict (org_id) do nothing;

create table public.departments (
  id text not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  color text not null default '#3b82f6',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, id)
);

create table public.shifts (
  id text not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  start_time text not null,
  end_time text not null,
  color text not null default '#f59e0b',
  hours_per_day numeric not null default 8,
  grace_minutes int,
  break_minutes int default 60,
  overtime_multiplier numeric default 1.5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, id)
);

create table public.department_shifts (
  org_id uuid not null references public.organizations (id) on delete cascade,
  department_id text not null,
  shift_id text not null,
  primary key (org_id, department_id)
);

create table public.leave_types (
  id text not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  annual_limit int not null default 12,
  color text not null default '#3b82f6',
  created_at timestamptz not null default now(),
  primary key (org_id, id)
);

create table public.office_locations (
  id text not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  lat numeric not null,
  lng numeric not null,
  radius_meters numeric not null default 50,
  dept_ids jsonb not null default '[]'::jsonb,
  shift_ids jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (org_id, id)
);

-- ─── Time & attendance ─────────────────────────────────────────────────────
create table public.attendance (
  id text not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  att_date date not null,
  in_time text,
  out_time text,
  status text not null default 'present',
  late boolean not null default false,
  late_minutes int not null default 0,
  half_day boolean not null default false,
  overtime int not null default 0,
  awol boolean not null default false,
  corrected boolean not null default false,
  location_in jsonb,
  location_out jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, id)
);

create index attendance_user_date_idx on public.attendance (org_id, user_id, att_date);

create table public.location_punches (
  id text not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  punch_date date not null,
  punch_type text not null check (punch_type in ('in', 'out')),
  lat numeric,
  lng numeric,
  accuracy numeric,
  distance_meters numeric,
  office_id text,
  within_fence boolean,
  ip text,
  device text,
  punched_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (org_id, id)
);

create table public.leaves (
  id text not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  leave_type_id text not null,
  date_from date not null,
  date_to date not null,
  dates jsonb not null default '[]'::jsonb,
  reason text,
  status text not null default 'pending',
  applied_on date,
  approved_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, id)
);

create table public.corrections (
  id text not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  corr_date date not null,
  req_in text,
  req_out text,
  reason text,
  status text not null default 'pending',
  applied_on date,
  created_at timestamptz not null default now(),
  primary key (org_id, id)
);

create table public.off_days (
  id text not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  off_date date not null,
  name text not null,
  scope text not null default 'all',
  user_ids jsonb not null default '[]'::jsonb,
  dept_ids jsonb not null default '[]'::jsonb,
  shift_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  primary key (org_id, id)
);

create table public.resolved_holidays (
  org_id uuid not null references public.organizations (id) on delete cascade,
  holiday_date date not null,
  primary key (org_id, holiday_date)
);

-- ─── Payroll & salary ──────────────────────────────────────────────────────
create table public.salary_history (
  id text not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  rev_date date not null,
  old_salary jsonb not null,
  new_salary jsonb not null,
  revised_by uuid references public.profiles (id),
  note text,
  created_at timestamptz not null default now(),
  primary key (org_id, id)
);

create table public.salary_schedules (
  id text not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  new_salary jsonb not null,
  effective_at timestamptz not null,
  note text,
  created_by uuid references public.profiles (id),
  applied boolean not null default false,
  applied_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (org_id, id)
);

create table public.payroll_runs (
  id text not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  month text not null,
  status text not null default 'draft',
  processed_at timestamptz,
  processed_by uuid references public.profiles (id),
  locked_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (org_id, id)
);

create table public.payslips (
  id text not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  payroll_run_id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  month text not null,
  earnings jsonb not null default '{}'::jsonb,
  deductions jsonb not null default '{}'::jsonb,
  attendance_summary jsonb not null default '{}'::jsonb,
  gross numeric not null default 0,
  net numeric not null default 0,
  status text not null default 'generated',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (org_id, id)
);

-- ─── Advance salary ────────────────────────────────────────────────────────
create table public.advance_salary_requests (
  id text not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending',
  requested_amount numeric not null,
  approved_amount numeric,
  monthly_deduction numeric not null default 0,
  installments_count int not null default 1,
  deduction_start_date date,
  reason text,
  terms_notes text,
  request_type text not null default 'installment',
  overflow numeric not null default 0,
  remaining_balance numeric not null default 0,
  applied_on date,
  updated_at timestamptz not null default now(),
  staff_confirmed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (org_id, id)
);

create table public.advance_installments (
  id text not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  request_id text not null,
  sequence_num int not null,
  due_month text not null,
  amount numeric not null,
  status text not null default 'scheduled',
  paid_at timestamptz,
  paid_amount numeric not null default 0,
  deleted_at timestamptz,
  primary key (org_id, id)
);

create table public.advance_approvals (
  id text not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  request_id text not null,
  step text,
  action text,
  by_user_id uuid references public.profiles (id),
  role text,
  note text,
  approved_at timestamptz not null default now(),
  primary key (org_id, id)
);

create table public.advance_audit_logs (
  id text not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  request_id text not null,
  entity_type text,
  field text,
  old_value text,
  new_value text,
  action text,
  changed_by uuid references public.profiles (id),
  role text,
  ip text,
  logged_at timestamptz not null default now(),
  immutable boolean not null default true,
  primary key (org_id, id)
);

-- ─── Comms & audit ─────────────────────────────────────────────────────────
create table public.notifications (
  id text not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  msg text not null,
  read boolean not null default false,
  notif_date date,
  request_id text,
  created_at timestamptz not null default now(),
  primary key (org_id, id)
);

create table public.alerts (
  id text not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  alert_type text not null,
  msg text not null,
  alert_date date not null,
  resolved boolean not null default false,
  resolved_at timestamptz,
  action text,
  created_at timestamptz not null default now(),
  primary key (org_id, id)
);

create table public.announcements (
  id text not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  title text not null,
  msg text not null,
  created_by uuid references public.profiles (id),
  ann_date date,
  target_type text not null default 'all',
  target_dept_ids jsonb not null default '[]'::jsonb,
  seen_by jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  primary key (org_id, id)
);

create table public.audit_log (
  id text not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references public.profiles (id),
  action text not null,
  detail text,
  logged_at timestamptz not null default now(),
  ip text,
  primary key (org_id, id)
);

create table public.audit_archive (
  id text not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references public.profiles (id),
  action text not null,
  detail text,
  logged_at timestamptz not null default now(),
  ip text,
  primary key (org_id, id)
);

create table public.enterprise_audit_logs (
  id text not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  module text,
  entity_type text,
  entity_id text,
  action text,
  field text,
  old_value text,
  new_value text,
  changed_by uuid references public.profiles (id),
  role text,
  ip text,
  device text,
  logged_at timestamptz not null default now(),
  immutable boolean not null default true,
  primary key (org_id, id)
);

create table public.login_activity (
  id text not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references public.profiles (id),
  email text,
  role text,
  logged_at timestamptz not null default now(),
  ip text,
  device text,
  primary key (org_id, id)
);

create table public.password_resets (
  id text not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reset_by uuid references public.profiles (id),
  reset_at timestamptz not null default now(),
  primary key (org_id, id)
);

create table public.history_requests (
  id text not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  date_from date,
  reason text,
  status text not null default 'pending',
  applied_on date,
  created_at timestamptz not null default now(),
  primary key (org_id, id)
);

-- ─── Auto-create profile on signup ─────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, org_id, email, name, initials, role)
  values (
    new.id,
    '00000000-0000-0000-0000-000000000001',
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    upper(left(coalesce(new.raw_user_meta_data->>'name', 'U'), 2)),
    coalesce(new.raw_user_meta_data->>'role', 'staff')
  );
  insert into public.user_salaries (profile_id) values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── updated_at trigger ────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ─── Helper: current user's org ───────────────────────────────────────────
create or replace function public.current_org_id()
returns uuid language sql stable security definer set search_path = public as $$
  select org_id from public.profiles where id = auth.uid() limit 1;
$$;

create or replace function public.is_org_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active = true
  );
$$;

create or replace function public.is_org_manager_or_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'manager') and active = true
  );
$$;

-- ─── Row Level Security ────────────────────────────────────────────────────
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.profile_departments enable row level security;
alter table public.user_salaries enable row level security;
alter table public.user_emergency_contacts enable row level security;
alter table public.org_settings enable row level security;
alter table public.departments enable row level security;
alter table public.shifts enable row level security;
alter table public.department_shifts enable row level security;
alter table public.leave_types enable row level security;
alter table public.office_locations enable row level security;
alter table public.attendance enable row level security;
alter table public.location_punches enable row level security;
alter table public.leaves enable row level security;
alter table public.corrections enable row level security;
alter table public.off_days enable row level security;
alter table public.resolved_holidays enable row level security;
alter table public.salary_history enable row level security;
alter table public.salary_schedules enable row level security;
alter table public.payroll_runs enable row level security;
alter table public.payslips enable row level security;
alter table public.advance_salary_requests enable row level security;
alter table public.advance_installments enable row level security;
alter table public.advance_approvals enable row level security;
alter table public.advance_audit_logs enable row level security;
alter table public.notifications enable row level security;
alter table public.alerts enable row level security;
alter table public.announcements enable row level security;
alter table public.audit_log enable row level security;
alter table public.audit_archive enable row level security;
alter table public.enterprise_audit_logs enable row level security;
alter table public.login_activity enable row level security;
alter table public.password_resets enable row level security;
alter table public.history_requests enable row level security;

-- Profiles
create policy "profiles_select" on public.profiles for select to authenticated
  using (org_id = public.current_org_id());
create policy "profiles_update_own" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_org_admin());
create policy "profiles_insert_admin" on public.profiles for insert to authenticated
  with check (public.is_org_admin());
create policy "profiles_update_admin" on public.profiles for update to authenticated
  using (public.is_org_admin());

-- Generic org-scoped policies (repeat pattern)
do $$
declare
  t text;
begin
  foreach t in array array[
    'profile_departments','user_salaries','user_emergency_contacts','org_settings',
    'departments','shifts','department_shifts','leave_types','office_locations',
    'attendance','location_punches','leaves','corrections','off_days','resolved_holidays',
    'salary_history','salary_schedules','payroll_runs','payslips',
    'advance_salary_requests','advance_installments','advance_approvals','advance_audit_logs',
    'notifications','alerts','announcements','audit_log','audit_archive',
    'enterprise_audit_logs','login_activity','password_resets','history_requests'
  ]
  loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format('create policy %I_select on public.%I for select to authenticated using (org_id = public.current_org_id())', t, t);
    execute format('drop policy if exists %I_all_staff on public.%I', t, t);
    execute format('create policy %I_all_staff on public.%I for all to authenticated using (org_id = public.current_org_id()) with check (org_id = public.current_org_id() and (public.is_org_manager_or_admin() or user_id = auth.uid()))', t, t);
  end loop;
end $$;

-- Tables without user_id: manager/admin only for writes
create policy "org_settings_select" on public.org_settings for select to authenticated
  using (org_id = public.current_org_id());
create policy "org_settings_write" on public.org_settings for all to authenticated
  using (org_id = public.current_org_id() and public.is_org_manager_or_admin())
  with check (org_id = public.current_org_id() and public.is_org_manager_or_admin());

create policy "departments_write" on public.departments for all to authenticated
  using (org_id = public.current_org_id() and public.is_org_manager_or_admin())
  with check (org_id = public.current_org_id() and public.is_org_manager_or_admin());

create policy "shifts_write" on public.shifts for all to authenticated
  using (org_id = public.current_org_id() and public.is_org_manager_or_admin())
  with check (org_id = public.current_org_id() and public.is_org_manager_or_admin());

-- Notifications: users read own; managers read all in org
drop policy if exists notifications_all_staff on public.notifications;
create policy "notifications_select" on public.notifications for select to authenticated
  using (org_id = public.current_org_id() and (user_id = auth.uid() or public.is_org_manager_or_admin()));
create policy "notifications_write" on public.notifications for all to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

-- Attendance: staff insert/update own; managers all
drop policy if exists attendance_all_staff on public.attendance;
create policy "attendance_select" on public.attendance for select to authenticated
  using (org_id = public.current_org_id());
create policy "attendance_write" on public.attendance for all to authenticated
  using (org_id = public.current_org_id() and (user_id = auth.uid() or public.is_org_manager_or_admin()))
  with check (org_id = public.current_org_id() and (user_id = auth.uid() or public.is_org_manager_or_admin()));

-- Enable Realtime on key tables (optional)
-- alter publication supabase_realtime add table public.attendance, public.notifications, public.leaves;
