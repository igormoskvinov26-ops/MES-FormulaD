# Deploy — Vercel (`app.rublbarber.ru`)

This app runs on Vercel as a **separate project** in team `rubl1`, on the
subdomain `app.rublbarber.ru`. It does not touch the existing `rublbarber`
project. The wildcard DNS (`*` → Vercel) already routes the subdomain.

## ⚠️ Do NOT break the existing site (rublbarber.ru)

The production site `rublbarber.ru` is a **different Vercel project from a
different repo**. This module is fully isolated — separate project, build, env
and storage. The only way to affect the live site is domain assignment, so:

- ✅ Create a **NEW** Vercel project from this repo (`MES-FormulaD`). Do **not**
  import this code into the existing `rublbarber` project.
- ✅ Assign this project **only a new subdomain** — `app.rublbarber.ru` (or e.g.
  `slots.rublbarber.ru`). The wildcard `*` already points at Vercel, so it just
  works.
- ❌ **Never** add `rublbarber.ru` or `www.rublbarber.ru` to this project —
  Vercel would move the apex/www away from the live site and break it.
- ❌ Do not edit the `rublbarber` project's settings, env, domains or storage.
- Create a **separate KV store** for this project; don't reuse the live one.

Nothing in this repo can reach the other project on its own — the `vercel.json`
rewrites/cron only apply inside this project.

The code auto-adapts to serverless and **runs on the free Vercel Hobby plan**:

- **Images** → rendered with **resvg** (SVG → PNG, no browser), ~300 ms, well
  under Hobby's 10 s function limit. No Vercel Pro needed. (Set
  `RENDERER=chromium` only if you specifically want the Playwright engine.)
- **Storage** → Vercel KV (Redis) when `KV_REST_API_URL`/`KV_REST_API_TOKEN`
  are present (settings, Story state, job locks). Locally it uses files.
- **Scheduler** → a free external pinger hits `/api/cron/tick` every ~15 min
  (GitHub Actions workflow included, or cron-job.org / UptimeRobot). The tick is
  schedule-aware and idempotent: each job runs once per day at/after its
  configured Europe/Moscow time. (Vercel Cron also works if you're on Pro.)

## 1. Import the repo

Vercel → team **rubl1** → **Add New… → Project → Import Git Repository** →
`igormoskvinov26-ops/MES-FormulaD`. Framework preset is read from `vercel.json`
(Build Command `npm run build`). Deploy once (it will run with defaults).

## 2. Add a KV store

Project → **Storage → Create → KV** → connect to this project. Vercel injects
`KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically. Redeploy so they apply.

## 3. Environment variables

Project → **Settings → Environment Variables** (Production):

| Variable | Value | Why |
|---|---|---|
| `APP_MASTER_KEY` | long random string | encrypts the settings blob in KV |
| `CRON_SECRET` | long random string | secures `/api/cron/tick`; Vercel sends it automatically |
| `ADMIN_API_TOKENS` | a token you choose | **required** — protects the admin API/UI on a public URL |
| `TZ` | `Europe/Moscow` | business timezone |

You do **not** need to set the YCLIENTS/Telegram tokens here — they are entered
in the **Settings** page after deploy and stored (encrypted) in KV. (You *may*
seed them via env if you prefer; the UI can override later.)

Redeploy after setting env vars.

## 4. Domain

Project → **Settings → Domains → Add** → `app.rublbarber.ru`. Because `*` is a
wildcard ALIAS to Vercel, it verifies immediately (no DNS change needed).

## 5. Configure via the UI

Open `https://app.rublbarber.ru`, paste your `ADMIN_API_TOKENS` value into the
**admin token** field (top-right), then **⚙ Настройки**:

1. YCLIENTS: partner token → **Войти** (login/password) → **Загрузить компании**
   → выбрать → **Загрузить мастеров** → привязать staff id → сохранить.
2. Telegram: bot token, **Определить из чата** (chat id), режим `test`, dry-run.
3. Общее: booking URL и расписание (Europe/Moscow).

Then use the dashboard buttons to test (TEST contour only).

## 6. Cron (free, no Vercel Pro)

The schedule is driven by an external pinger calling `/api/cron/tick` every
~15 min. A ready GitHub Actions workflow is included at
`.github/workflows/cron.yml` — add two repo secrets (Settings → Secrets and
variables → Actions):

| Secret | Value |
|---|---|
| `APP_URL` | `https://app.rublbarber.ru` (no trailing slash) |
| `CRON_SECRET` | same value as the Vercel `CRON_SECRET` env var |

Enable Actions for the repo and the workflow runs automatically (also
runnable manually via "Run workflow"). Equivalent free alternatives:
**cron-job.org** or **UptimeRobot** — point them at
`https://app.rublbarber.ru/api/cron/tick` with header
`Authorization: Bearer <CRON_SECRET>`.

The tick chooses which job is due from the in-app schedule, so you change times
in the UI — no code or workflow edits.

> On **Vercel Pro** you can instead add a `crons` block to `vercel.json`
> (`{ "path": "/api/cron/tick", "schedule": "*/10 * * * *" }`) and skip the
> external pinger.

## Limits (Hobby)

- Image rendering is browser-free (resvg), so it fits Hobby's 10 s limit with
  room to spare — no Pro required.
- GitHub-scheduled runs can be delayed a few minutes under load and pause after
  ~60 days of repo inactivity; cron-job.org/UptimeRobot avoid that.

## TEST vs PRODUCTION

Stays in TEST mode until you switch **Режим → production** in Settings (and set
a production chat id). In TEST mode any production send is blocked with
`Production publishing disabled in TEST mode.`

## Alternative: always-on host (no rewrite)

If you'd rather not use serverless, the same repo runs as-is on a small
always-on host (Railway/Render/Fly/VPS): `npm ci && npm run build && npm start`.
There node-cron drives the schedule and files persist on disk — no KV needed.
