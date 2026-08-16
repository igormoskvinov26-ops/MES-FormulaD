# Deploy — Vercel (`app.rublbarber.ru`)

This app runs on Vercel as a **separate project** in team `rubl1`, on the
subdomain `app.rublbarber.ru`. It does not touch the existing `rublbarber`
project. The wildcard DNS (`*` → Vercel) already routes the subdomain.

The code auto-adapts to serverless:

- **Storage** → Vercel KV (Redis) when `KV_REST_API_URL`/`KV_REST_API_TOKEN`
  are present (settings, Story state, job locks). Locally it uses files.
- **Scheduler** → **Vercel Cron** hits `/api/cron/tick` (there is no always-on
  process). The tick is schedule-aware and idempotent: each job runs once per
  day at/after its configured Europe/Moscow time.
- **Chromium** → `@sparticuz/chromium` (bundled headless build) for Story PNGs.

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

## 6. Cron

`vercel.json` registers one cron: `/api/cron/tick` every 10 minutes. Verify in
Project → **Settings → Cron Jobs**. The endpoint decides which job is due from
the in-app schedule, so you change times in the UI — no `vercel.json` edits.

## Plan requirements & limits

- **Story rendering** needs `maxDuration: 60` and `memory: 1024` (set in
  `vercel.json`) plus a **10-minute cron** → these require the **Vercel Pro**
  plan. On Hobby, functions cap at 10 s and cron is daily-only, so Story
  rendering may time out and the tick can't run every 10 min. The **daily
  report** (no Chromium) works within Hobby limits.
- Cold starts for the Story function are ~2–4 s (Chromium). Acceptable for
  scheduled/manual posting.

## TEST vs PRODUCTION

Stays in TEST mode until you switch **Режим → production** in Settings (and set
a production chat id). In TEST mode any production send is blocked with
`Production publishing disabled in TEST mode.`

## Alternative: always-on host (no rewrite)

If you'd rather not use serverless, the same repo runs as-is on a small
always-on host (Railway/Render/Fly/VPS): `npm ci && npm run build && npm start`.
There node-cron drives the schedule and files persist on disk — no KV needed.
