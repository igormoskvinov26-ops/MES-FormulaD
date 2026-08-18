# Vercel Deployment Checklist

## Status
The application code is **ready to deploy**. Follow these steps to get it live on Vercel.

---

## Step 1: Create/Link Vercel Project

### If you haven't already linked the project:
1. Go to https://vercel.com/new
2. Select **Import Git Repository**
3. Paste: `https://github.com/igormoskvinov26-ops/MES-FormulaD`
4. Select team `rubl1` (or your team if different)
5. Click **Import**

Vercel will auto-detect the `vercel.json` and use these build settings:
- **Build Command**: `npm run build`
- **Install Command**: `npm install`
- **Output Directory**: `dist`

### If the project is already linked:
- The `.vercel/project.json` file shows it's already connected
- Just ensure you're in the correct Vercel team and project

---

## Step 2: Add Vercel KV Storage

1. Go to https://vercel.com/dashboard → **Storage** → **Create**
2. Select **KV** (Upstash Redis)
3. Select the `mes-formulad` project
4. Name it `mes-formulad-kv` (or any name)
5. Vercel automatically injects:
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`

After KV is created, **redeploy the project** so these variables take effect:
```bash
vercel deploy --prod
# or redeploy from the Vercel UI
```

---

## Step 3: Set Environment Variables

Go to https://vercel.com/dashboard → **mes-formulad** → **Settings** → **Environment Variables**

Add these variables (Production environment):

| Variable | Value | Example |
|----------|-------|---------|
| `APP_MASTER_KEY` | Long random string (use `openssl rand -hex 32`) | `a1b2c3d4e5f6...` |
| `CRON_SECRET` | Long random string (use `openssl rand -hex 32`) | `x9y8z7w6v5u4...` |
| `ADMIN_API_TOKENS` | A secure token you choose | `your-secret-admin-token-here` |
| `TELEGRAM_DRY_RUN` | `false` | `false` |
| `TZ` | `Europe/Moscow` | `Europe/Moscow` |

**Important**: All other variables (YCLIENTS tokens, Telegram bot token) can be:
- Entered via the **Settings** page in the web UI after deployment (stored encrypted in KV), OR
- Pre-set in the Environment Variables if you prefer (they won't be exposed to the frontend)

For now, add only the 5 required variables above. After deploy, you'll set YCLIENTS/Telegram credentials in the web UI.

---

## Step 4: Generate Random Strings

Run these commands to generate secure random values:

```bash
# For APP_MASTER_KEY
openssl rand -hex 32

# For CRON_SECRET
openssl rand -hex 32
```

Use these values in Step 3 above.

---

## Step 5: Deploy

After setting environment variables, trigger a redeploy:

### Option A: From Vercel UI
1. Go to https://vercel.com/dashboard → **mes-formulad** → **Deployments**
2. Click **Redeploy** on the most recent deployment

### Option B: From the CLI (if logged in)
```bash
vercel deploy --prod
```

### Option C: From GitHub (if GitHub integration is enabled)
- Push to `main` branch (or your configured deploy branch)
- Vercel automatically deploys

---

## Step 6: Verify Deployment

Once deployment completes:

1. Go to https://mes-formulad.vercel.app (or the URL shown in Vercel dashboard)
2. You should see the **Admin Panel** with:
   - Admin Token input field (top-right)
   - Settings button (⚙️)
   - Story control buttons

If you see a 404 or blank page, check:
- Build logs in Vercel dashboard (Settings → Build Logs)
- Environment variables are set
- KV store is connected

---

## Step 7: Configure via the Web UI

1. Open https://mes-formulad.vercel.app
2. **Paste the ADMIN_API_TOKENS value** into the "Admin Token" field (top-right)
3. Click **⚙️ Настройки** (Settings)
4. Set up credentials:
   - **YCLIENTS**: Partner token → Login with credentials → Select company → Map barbers
   - **Telegram**: Bot token → Auto-detect chat ID → Set mode (test) and dry-run
   - **General**: Booking URL and schedule times (Europe/Moscow)

---

## Step 8: Test Story Publishing

Once configured:

1. Go back to the main dashboard
2. Click **Опубликовать TEST** (Publish TEST Story)
3. Verify:
   - Story renders correctly
   - Message sent to Telegram TEST chat
   - No errors in the admin panel

---

## Step 9: Set Up Domain (Optional but Recommended)

To use `app.rublbarber.ru` instead of `vercel.app`:

1. Go to https://vercel.com/dashboard → **mes-formulad** → **Settings** → **Domains**
2. Click **Add**
3. Enter `app.rublbarber.ru`
4. Since `*.rublbarber.ru` already points to Vercel (wildcard DNS), it verifies immediately

---

## Step 10: Set Up Cron (for Automatic Story Publishing)

The app includes scheduled story publishing (morning, afternoon, evening, daily report).

### Option A: GitHub Actions (Recommended, Free)

1. Go to https://github.com/igormoskvinov26-ops/MES-FormulaD/settings/secrets/actions
2. Add two secrets:
   - `APP_URL`: `https://mes-formulad.vercel.app` (or your custom domain)
   - `CRON_SECRET`: Use the same value you set in Vercel Step 3

3. The workflow (`.github/workflows/cron.yml`) will run every 15 minutes
4. Verify in GitHub Actions that runs succeed

### Option B: External Pinger (cron-job.org or UptimeRobot)

If you don't use GitHub Actions:
- Sign up at https://cron-job.org
- Create a job that hits:
  ```
  https://mes-formulad.vercel.app/api/cron/tick
  ```
- Add header: `Authorization: Bearer <CRON_SECRET>`
- Run every 15 minutes

---

## Troubleshooting

### Deployment fails with "Build failed"
- Check Vercel build logs (Settings → Build Logs)
- Ensure Node.js version ≥20 (specified in package.json)
- Run locally: `npm install && npm run build`

### Admin panel shows 401 Unauthorized
- Check that `ADMIN_API_TOKENS` is set in Vercel Environment Variables
- Restart the app (redeploy)
- Paste the correct token in the Admin Token field

### Telegram messages not sending
- Ensure `TELEGRAM_DRY_RUN=false` in Vercel Environment Variables
- Check that bot token and chat ID are correct in the UI
- Verify Telegram bot can post to the chat

### KV store connection fails
- Verify KV store is created and connected to the `mes-formulad` project
- Check that `KV_REST_API_URL` and `KV_REST_API_TOKEN` are auto-injected (view in Environment Variables)
- Redeploy after KV is created

---

## Summary

✅ Code is ready  
⏳ Configure environment variables on Vercel  
⏳ Deploy  
⏳ Test via web UI  
⏳ Set up domain (optional)  
⏳ Enable cron scheduling  

After these steps, the app will publish Stories automatically on the schedule (or manually via the dashboard).
