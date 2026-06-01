# Production readiness checklist

## Supabase

- [ ] Ran `001_relational_schema.sql` and `002_fix_rls_and_setup_rpc.sql`
- [ ] Email auth enabled; confirm policy matches your org (confirm on/off)
- [ ] RLS enabled on all public tables (default after migrations)
- [ ] First admin created via app setup (not demo accounts)
- [ ] Realtime enabled for `attendance` if multi-device live sync is needed (Database → Replication)
- [ ] Backups / PITR enabled on paid plan if required
- [ ] Service role key **never** in frontend or Git

## Security

- [ ] `.env` not in Git; rotate anon key if it was ever exposed
- [ ] Netlify env vars set for production only
- [ ] Staff passwords created via **Add Staff** (Supabase Auth), not stored in app state
- [ ] Review manager permissions in Staff → Permissions

## Application

- [ ] No `localStorage` / `sessionStorage` for app data (theme is in-memory per session)
- [ ] `npm run build` succeeds
- [ ] Login / logout / refresh retains data from Supabase
- [ ] Second browser or device shows same data after login
- [ ] Create / edit staff, attendance, leave — verify rows in Supabase Table Editor

## Netlify

- [ ] `netlify.toml` present; SPA redirect `/* → /index.html`
- [ ] `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Netlify env
- [ ] Production URL tested end-to-end

## Optional hardening

- [ ] Custom SMTP for auth emails (Supabase → Project Settings → Auth)
- [ ] Custom domain + HTTPS on Netlify
- [ ] Supabase network restrictions / SSO if enterprise
