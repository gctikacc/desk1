# Supabase setup — Alvin Desk

## Environment variables

Create `.env` from `.env.example`:

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Yes | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Yes | Anon (public) JWT from API settings |

Vite exposes only variables prefixed with `VITE_`.

**Note:** Supabase Auth keeps the session in browser `localStorage` internally. Application data (staff, attendance, payroll, etc.) is **only** in PostgreSQL via the API — not in app-level storage.

---

## Database migrations

In **SQL Editor**, run **in order**:

1. `supabase/migrations/001_relational_schema.sql` — tables, indexes, triggers, base RLS  
2. `supabase/migrations/002_fix_rls_and_setup_rpc.sql` — fixes policies + `needs_admin_setup()` RPC  

### Schema overview

| Area | Tables |
|------|--------|
| Org & users | `organizations`, `profiles`, `profile_departments`, `user_salaries`, `user_emergency_contacts` |
| Catalog | `org_settings`, `departments`, `shifts`, `department_shifts`, `leave_types`, `office_locations` |
| Time | `attendance`, `location_punches`, `leaves`, `corrections`, `off_days`, `resolved_holidays` |
| Payroll | `salary_history`, `salary_schedules`, `payroll_runs`, `payslips` |
| Advance | `advance_salary_requests`, `advance_installments`, `advance_approvals`, `advance_audit_logs` |
| Comms | `notifications`, `alerts`, `announcements` |
| Audit | `audit_log`, `audit_archive`, `enterprise_audit_logs`, `login_activity`, `password_resets`, `history_requests` |

Default organization id: `00000000-0000-0000-0000-000000000001`

New auth users get a `profiles` row via trigger `handle_new_user()` (role from signup metadata).

---

## Authentication

1. **Authentication → Providers → Email** — enable email/password.  
2. First visit: app calls `needs_admin_setup()` (no login). If true, show **Create admin account**.  
3. **Add Staff** (admin): `signUpStaff()` creates Auth user + profile; set departments/salary in the form.  

---

## App data layer

| File | Role |
|------|------|
| `lib/supabase/client.js` | Supabase JS client |
| `lib/db/loadStore.js` | Load all tables → in-memory `store` |
| `lib/db/persistStore.js` | Debounced upsert/sync to Supabase |
| `lib/db/mappers.js` | Row ↔ legacy store shape |
| `lib/db/index.js` | `initStore`, `updateStore`, `flushStore` |
| `lib/auth/supabaseAuth.js` | Login, signup, session |

---

## Realtime (optional)

For live attendance updates across tabs:

```sql
alter publication supabase_realtime add table public.attendance;
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Red banner “Database: …” | Run both SQL migrations; check URL/key in `.env` |
| Empty data after login | RLS: user must have `profiles` row; check Table Editor |
| “Profile missing” on login | Run migrations; confirm trigger on `auth.users` |
| Email confirm required | Confirm email or disable in Auth settings |
| CORS / network errors | Use correct `VITE_SUPABASE_URL`; redeploy Netlify after env change |

---

## Deploy

See [DEPLOYMENT.md](./DEPLOYMENT.md) for GitHub + Netlify steps.
