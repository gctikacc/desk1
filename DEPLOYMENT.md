# Deployment — Alvin Desk (Netlify + Supabase)

## Architecture

```
User browser → Netlify (Vite static app) → Supabase REST / Realtime → PostgreSQL
```

All HR data lives in Supabase. The app does **not** use `localStorage` or `sessionStorage` for application data. Supabase Auth stores the session JWT in browser storage (required by `@supabase/supabase-js`).

---

## 1. Supabase (backend)

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor** → run in order:
   - `supabase/migrations/001_relational_schema.sql`
   - `supabase/migrations/002_fix_rls_and_setup_rpc.sql`
3. **Authentication** → Providers → enable **Email** (password).
4. Optional: disable “Confirm email” for internal deployments (Authentication → Providers → Email).
5. **Project Settings → API** → copy:
   - Project URL → `VITE_SUPABASE_URL`
   - `anon` `public` key → `VITE_SUPABASE_ANON_KEY`

See [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) for detail.

---

## 2. GitHub

```bash
cd "c:\Users\Home\Desktop\Low-BP"
git init
git add .
git commit -m "Alvin Desk: Supabase-backed production build"
git branch -M main
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```

Ensure `.env` is **not** committed (listed in `.gitignore`).

---

## 3. Netlify (frontend)

1. [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import from Git** → select the repo.
2. Build settings (or use repo `netlify.toml`):
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
3. **Site configuration → Environment variables** (required):

| Variable | Value |
|----------|--------|
| `VITE_SUPABASE_URL` | `https://YOUR_REF.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Your anon JWT |

4. Deploy. Open the site URL → **Create admin account** (first visit) or sign in.

---

## 4. First run

1. Open the deployed URL.
2. If no admin exists, the login screen shows **Create admin account**.
3. After signup, configure **Settings** (departments, shifts, leave types) — no demo seed data is loaded.

---

## 5. Local development

```bash
cp .env.example .env
# Edit .env with Supabase URL + anon key
npm install
npm run dev
```

App: `http://localhost:5173`
