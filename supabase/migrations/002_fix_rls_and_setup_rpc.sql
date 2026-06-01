-- Run after 001_relational_schema.sql
-- Fixes broken generic RLS policies (tables without user_id column)

-- First-time setup check (no auth required)
create or replace function public.needs_admin_setup()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles
    where role = 'admin' and active = true
  );
$$;

grant execute on function public.needs_admin_setup() to anon, authenticated;

-- Drop broken policies from 001 DO block
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
    execute format('drop policy if exists %I_all_staff on public.%I', t, t);
  end loop;
end $$;

-- Helper: org read for authenticated members
-- Manager/admin write for catalog tables

-- profile_departments
create policy "profile_departments_select" on public.profile_departments
  for select to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = profile_id and p.org_id = public.current_org_id())
  );
create policy "profile_departments_write" on public.profile_departments
  for all to authenticated
  using (public.is_org_manager_or_admin())
  with check (public.is_org_manager_or_admin());

-- user_salaries
create policy "user_salaries_select" on public.user_salaries
  for select to authenticated
  using (
    profile_id = auth.uid()
    or public.is_org_manager_or_admin()
    or exists (select 1 from public.profiles p where p.id = profile_id and p.org_id = public.current_org_id())
  );
create policy "user_salaries_write" on public.user_salaries
  for all to authenticated
  using (public.is_org_manager_or_admin())
  with check (public.is_org_manager_or_admin());

-- user_emergency_contacts
create policy "user_emergency_contacts_select" on public.user_emergency_contacts
  for select to authenticated
  using (profile_id = auth.uid() or public.is_org_manager_or_admin());
create policy "user_emergency_contacts_write" on public.user_emergency_contacts
  for all to authenticated
  using (profile_id = auth.uid() or public.is_org_manager_or_admin())
  with check (profile_id = auth.uid() or public.is_org_manager_or_admin());

-- Catalog tables (org scoped, managers write)
do $$
declare
  t text;
begin
  foreach t in array array[
    'departments','shifts','department_shifts','leave_types','office_locations',
    'off_days','resolved_holidays','payroll_runs','announcements'
  ]
  loop
    execute format($f$
      create policy %I_select on public.%I for select to authenticated
        using (org_id = public.current_org_id());
      create policy %I_write on public.%I for all to authenticated
        using (org_id = public.current_org_id() and public.is_org_manager_or_admin())
        with check (org_id = public.current_org_id() and public.is_org_manager_or_admin());
    $f$, t, t, t, t);
  end loop;
end $$;

-- org_settings (already has policies in 001; ensure select for org members)
drop policy if exists org_settings_select on public.org_settings;
create policy "org_settings_select" on public.org_settings for select to authenticated
  using (org_id = public.current_org_id());

-- Tables with user_id: read org, write own or manager/admin
do $$
declare
  t text;
begin
  foreach t in array array[
    'attendance','location_punches','leaves','corrections',
    'salary_history','salary_schedules','payslips',
    'advance_salary_requests','advance_audit_logs',
    'alerts','history_requests','password_resets'
  ]
  loop
    execute format($f$
      create policy %I_select on public.%I for select to authenticated
        using (org_id = public.current_org_id());
      create policy %I_insert on public.%I for insert to authenticated
        with check (
          org_id = public.current_org_id()
          and (user_id = auth.uid() or public.is_org_manager_or_admin())
        );
      create policy %I_update on public.%I for update to authenticated
        using (
          org_id = public.current_org_id()
          and (user_id = auth.uid() or public.is_org_manager_or_admin())
        );
      create policy %I_delete on public.%I for delete to authenticated
        using (
          org_id = public.current_org_id()
          and public.is_org_manager_or_admin()
        );
    $f$, t, t, t, t, t, t, t, t);
  end loop;
end $$;

-- advance_installments (no user_id)
create policy "advance_installments_select" on public.advance_installments
  for select to authenticated using (org_id = public.current_org_id());
create policy "advance_installments_write" on public.advance_installments
  for all to authenticated
  using (org_id = public.current_org_id() and public.is_org_manager_or_admin())
  with check (org_id = public.current_org_id() and public.is_org_manager_or_admin());

-- advance_approvals
create policy "advance_approvals_select" on public.advance_approvals
  for select to authenticated using (org_id = public.current_org_id());
create policy "advance_approvals_write" on public.advance_approvals
  for all to authenticated
  using (org_id = public.current_org_id() and (by_user_id = auth.uid() or public.is_org_manager_or_admin()))
  with check (org_id = public.current_org_id());

-- audit_log, audit_archive, login_activity
do $$
declare
  t text;
begin
  foreach t in array array['audit_log','audit_archive','login_activity']
  loop
    execute format($f$
      create policy %I_select on public.%I for select to authenticated
        using (
          org_id = public.current_org_id()
          and (public.is_org_manager_or_admin() or user_id = auth.uid())
        );
      create policy %I_write on public.%I for all to authenticated
        using (org_id = public.current_org_id())
        with check (org_id = public.current_org_id());
    $f$, t, t, t, t);
  end loop;
end $$;

create policy "enterprise_audit_logs_select" on public.enterprise_audit_logs
  for select to authenticated
  using (
    org_id = public.current_org_id()
    and (public.is_org_manager_or_admin() or changed_by = auth.uid())
  );
create policy "enterprise_audit_logs_write" on public.enterprise_audit_logs
  for all to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

-- organizations: members can read own org
drop policy if exists organizations_select on public.organizations;
create policy "organizations_select" on public.organizations for select to authenticated
  using (id = public.current_org_id());
