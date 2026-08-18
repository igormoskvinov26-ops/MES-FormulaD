# Deployment Status & Quick Start

## ✅ Application Status

The Rubl Telegram Admin application is **fully built and ready for deployment**.

### Verified Components
- ✅ TypeScript compilation: **OK**
- ✅ Web UI (HTML/CSS/JS): **Serving**
- ✅ Express server: **Running**
- ✅ API authentication: **Working** (x-admin-token validation)
- ✅ Health endpoint: **200 OK**
- ✅ Admin routes: **Accessible with token**

### Project Structure
```
MES-FormulaD/
├── src/                    # TypeScript source
│   ├── api/               # Express routes (server, admin, settings, cron)
│   ├── services/          # Core services (stories, reporting, scheduler)
│   ├── config/            # Configuration and environment
│   └── lib/               # Utilities (time, logger, crypto)
├── dist/                  # Compiled JavaScript (ready for Node.js)
├── web/                   # Static HTML/CSS/JS admin UI
├── api/index.js           # Vercel serverless entry point
├── vercel.json            # Vercel configuration
├── package.json           # Dependencies (20+ essential packages)
└── tsconfig.json          # TypeScript compiler settings
```

---

## 🚀 Quick Start: Local Testing

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Local Environment
Copy `.env.example` to `.env` and fill in your credentials:
```bash
# Essential for testing:
TELEGRAM_BOT_TOKEN=8931331468:AAFz9UPKCtTPCscEB9EMWaFAmTJjZjdrgQY
TELEGRAM_TEST_CHAT_ID=-1004340041715
YCLIENTS_PARTNER_TOKEN=Cxex2xMk0P95K65GevxT
YCLIENTS_USER_TOKEN=e95410aecb0678f93185746f9b4f025f
YCLIENTS_COMPANY_ID=2387007
ADMIN_API_TOKENS=test-token
TELEGRAM_DRY_RUN=false
```

### 3. Start the Dev Server
```bash
npm run dev
```

The app starts on `http://localhost:3000`:
- **Web UI**: http://localhost:3000 (admin panel)
- **Health Check**: http://localhost:3000/healthz
- **API**: http://localhost:3000/api/admin/*

### 4. Test the Web UI

#### Option A: Using the Web UI (Easiest)
1. Open http://localhost:3000 in your browser
2. Paste the admin token (`test-token`) in the top-right field
3. Click **⚙️ Настройки** to configure credentials
4. Click **Опубликовать TEST** to publish a test story

#### Option B: Using curl
```bash
# Get admin settings
curl -H "x-admin-token: test-token" http://localhost:3000/api/admin/settings

# Publish a test story (today's date)
curl -X POST http://localhost:3000/api/admin/stories/publish-test \
  -H "x-admin-token: test-token" \
  -H "Content-Type: application/json" \
  -d '{
    "barberSlug": "artash",
    "date": "'$(date -u +%Y-%m-%d)'"
  }'

# Check scheduler health
curl http://localhost:3000/api/admin/scheduler/status \
  -H "x-admin-token: test-token"
```

---

## 📋 Vercel Deployment Checklist

### Pre-Deployment ✅
- [x] Code compiled successfully (`npm run build`)
- [x] All routes tested locally
- [x] API authentication working
- [x] Web UI serving correctly
- [x] Environment variables documented
- [x] Vercel configuration in place (vercel.json)
- [x] GitHub repository connected

### Deployment Steps

#### Step 1: Set Up Vercel Project
Go to https://vercel.com/new and import the GitHub repo:
- Owner: `igormoskvinov26-ops`
- Repo: `MES-FormulaD`
- Team: `rubl1` (or your team)

Vercel will auto-detect build settings from `vercel.json`.

#### Step 2: Configure Environment Variables
After import, go to **Settings → Environment Variables** and add:

| Variable | Value | Why |
|----------|-------|-----|
| `APP_MASTER_KEY` | Random 32-byte hex (run: `openssl rand -hex 32`) | Encrypts sensitive data in KV storage |
| `CRON_SECRET` | Random 32-byte hex (run: `openssl rand -hex 32`) | Secures the cron endpoint |
| `ADMIN_API_TOKENS` | Pick a secure token (e.g., `super-secret-admin-2024`) | Protects admin API on public URL |
| `TELEGRAM_DRY_RUN` | `false` | **CRITICAL**: Enable real Telegram sends |
| `TZ` | `Europe/Moscow` | Business timezone |

**Optional** (can also be set in the Settings UI after deploy):
- `YCLIENTS_PARTNER_TOKEN`
- `YCLIENTS_USER_TOKEN`
- `YCLIENTS_COMPANY_ID`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_TEST_CHAT_ID`

#### Step 3: Connect Vercel KV Storage
1. Go to **Storage → Create → KV**
2. Select the `mes-formulad` project
3. Vercel automatically injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`

After KV is created, **redeploy** the project.

#### Step 4: Deploy
- **Option A**: Click **Deploy** button in Vercel dashboard
- **Option B**: Push to default branch (if GitHub integration is active)
- **Option C**: Run `vercel deploy --prod` from CLI (if authenticated)

Wait for the deployment to complete.

#### Step 5: Verify Deployment
Go to the Vercel dashboard and click the production URL (e.g., `https://mes-formulad.vercel.app`).

You should see:
- ✅ Admin panel HTML loaded
- ✅ Admin token input field (top-right)
- ✅ Control buttons for publishing stories
- ✅ Settings gear icon (⚙️)

If you see 404 or blank page:
- Check **Build Logs** in Vercel dashboard
- Verify all environment variables are set
- Ensure KV store is connected

#### Step 6: Configure via UI
1. Paste your `ADMIN_API_TOKENS` value into the admin token field
2. Click ⚙️ to open Settings
3. Enter your credentials:
   - YCLIENTS: partner token, login/password, select company, map barbers
   - Telegram: bot token, chat ID, mode (test), dry-run setting
   - General: booking URL, schedule times

#### Step 7: Test Story Publishing
1. Return to the dashboard
2. Click **Опубликовать TEST** (Publish TEST Story)
3. Verify story appears in your Telegram TEST chat
4. Check that no errors appear in the admin panel

#### Step 8: Domain Assignment (Optional)
For custom domain `app.rublbarber.ru`:
1. Go to **Settings → Domains**
2. Add `app.rublbarber.ru`
3. DNS will resolve automatically (wildcard alias already configured)

---

## 📡 API Endpoints Summary

All admin endpoints require the `x-admin-token` header.

### Core Endpoints
```
GET  /healthz                              # Health check (no auth)
GET  /api/admin/settings                   # Get current settings
POST /api/admin/settings                   # Update settings
GET  /api/admin/scheduler/status           # Scheduler status
POST /api/admin/stories/publish-test       # Publish test story (now)
POST /api/admin/stories/send-report        # Send daily report (now)
```

### Cron Endpoints (Auth via CRON_SECRET)
```
POST /api/cron/tick                        # Tick scheduler (every 15 min)
```

---

## 🔐 Security

- ✅ All secrets read server-side only
- ✅ Admin API protected by token
- ✅ Cron endpoint secured with CRON_SECRET
- ✅ Settings encrypted at rest in KV
- ✅ Telegram tokens never logged
- ✅ TEST mode prevents accidental production sends
- ✅ DRY_RUN mode allows safe testing

---

## 🐛 Troubleshooting

### Build Fails on Vercel
- Check Node.js version (requires ≥20)
- Verify `npm run build` works locally
- Check build logs in Vercel dashboard

### Admin API Returns 401
- Verify `ADMIN_API_TOKENS` is set in Vercel
- Check that the token value matches what you paste in the UI
- Redeploy after changing env vars

### Stories Not Publishing to Telegram
- Ensure `TELEGRAM_DRY_RUN=false` on Vercel
- Check bot token and chat ID are correct
- Verify bot has permission to post in the chat
- Check Vercel function logs

### Scheduler Not Running
- Verify `SCHEDULER_ENABLED=true` (default)
- Check that cron endpoint is being called (GitHub Actions workflow)
- For Vercel Pro: cron can run directly on Vercel (no external pinger needed)

### Can't Access Admin Panel
- Check that the Vercel URL is accessible (no 404)
- Verify static files are deployed (web/ directory)
- Check KV store is connected

---

## 📝 Environment Variables Reference

### Required on Vercel
- `APP_MASTER_KEY` - Encryption key for KV storage
- `CRON_SECRET` - Secret for cron endpoint
- `ADMIN_API_TOKENS` - Comma-separated admin tokens
- `TELEGRAM_DRY_RUN=false` - Enable real Telegram sends

### Optional (Can Set in UI)
- `YCLIENTS_PARTNER_TOKEN` - YCLIENTS API access
- `YCLIENTS_USER_TOKEN` - YCLIENTS API access
- `YCLIENTS_COMPANY_ID` - РублЪ company ID
- `TELEGRAM_BOT_TOKEN` - Telegram bot API token
- `TELEGRAM_TEST_CHAT_ID` - Test chat for stories
- `TELEGRAM_PRODUCTION_CHAT_ID` - Production chat (switch in UI)
- `TELEGRAM_MODE` - `test` (default) or `production`

### Defaults
- `TZ=Europe/Moscow` (business timezone)
- `PORT=3000` (only local)
- `SCHEDULER_ENABLED=true`
- `STORY_*_TIME` - Morning/afternoon/evening/report times (HH:mm format)

---

## ✨ Next Steps

1. **Deploy to Vercel** (5 min) — Follow "Deployment Steps" above
2. **Test Story Publishing** (2 min) — Click button, check Telegram
3. **Enable Cron** (5 min) — GitHub Actions or external pinger
4. **Go Live** (1 min) — Switch Telegram mode to `production` in Settings

Total time: **~15 minutes** from now to live stories publishing!

---

## 📞 Support

- **Local dev issues**: Check `.env` file, run `npm run build`, check logs
- **Vercel issues**: Check build logs in Vercel dashboard
- **Telegram issues**: Verify bot token, chat ID, dry-run setting
- **Cron issues**: Check GitHub Actions workflow status

---

## ✅ Deliverables Completed

- ✅ TypeScript project scaffold with full tooling
- ✅ YCLIENTS API integration (barbers, availability)
- ✅ Telegram Stories publishing system
- ✅ Daily management reports
- ✅ Background scheduler with Europe/Moscow timezone support
- ✅ Admin web UI for testing and configuration
- ✅ Vercel serverless deployment setup
- ✅ AES-256-GCM encrypted settings storage
- ✅ Complete documentation and deployment guide
- ✅ Ready for production deployment

The application is **production-ready** and waiting for your Vercel deployment!
