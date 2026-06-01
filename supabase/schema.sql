-- ═══════════════════════════════════════════════════════════════════════════
-- Alvin Desk — Supabase schema
-- Paste this entire file in: Supabase Dashboard → SQL → New query → Run
-- ═══════════════════════════════════════════════════════════════════════════

-- Single-row JSON store (same shape as former localStorage `alvin_desk_v2`)
create table if not exists public.app_store (
  id text primary key default 'main',
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists app_store_updated_at_idx on public.app_store (updated_at desc);

comment on table public.app_store is 'Alvin Desk application state (users, attendance, payroll, etc.)';

-- ─── Row Level Security ───────────────────────────────────────────────────
-- ⚠️ DEV-OPEN policies below: any client with the anon key can read/write.
-- Before production: replace with Supabase Auth + user/role policies.

alter table public.app_store enable row level security;

drop policy if exists "app_store_anon_select" on public.app_store;
drop policy if exists "app_store_anon_insert" on public.app_store;
drop policy if exists "app_store_anon_update" on public.app_store;

create policy "app_store_anon_select"
  on public.app_store for select
  to anon, authenticated
  using (true);

create policy "app_store_anon_insert"
  on public.app_store for insert
  to anon, authenticated
  with check (true);

create policy "app_store_anon_update"
  on public.app_store for update
  to anon, authenticated
  using (true)
  with check (true);

-- ─── Realtime (optional — live sync across browsers) ───────────────────────
-- In Supabase Dashboard: Database → Publications → supabase_realtime → add table `app_store`
-- Or run (if not already added):
--   alter publication supabase_realtime add table public.app_store;

-- Demo data is uploaded automatically by the app on first load (or from existing localStorage).
