# ⚡ Deploy to Vercel in 5 Minutes

## What You Need
- Vercel account
- Admin token value (any secure string, e.g., `super-secure-admin-token`)
- 2 random 32-byte hex strings (run commands below)

## Generate Random Strings
```bash
# Copy & paste these into terminal:
openssl rand -hex 32  # For APP_MASTER_KEY
openssl rand -hex 32  # For CRON_SECRET
```

---

## Step 1: Import Repository (2 min)

1. Go to https://vercel.com/new
2. Click **Import Git Repository**
3. Paste: `https://github.com/igormoskvinov26-ops/MES-FormulaD`
4. Select team (your account)
5. Click **Import**

Vercel will auto-detect `vercel.json` and build settings.

---

## Step 2: Set Environment Variables (2 min)

Go to the project in Vercel dashboard → **Settings** → **Environment Variables** (Production)

Add these 5 variables:

```
APP_MASTER_KEY        = [paste first random hex string]
CRON_SECRET           = [paste second random hex string]
ADMIN_API_TOKENS      = super-secure-admin-token
TELEGRAM_DRY_RUN      = false
TZ                    = Europe/Moscow
```

Click **Save**.

---

## Step 3: Add KV Storage (1 min)

1. Go to **Storage** → **Create** → **KV**
2. Select this project (`mes-formulad`)
3. Leave name as default
4. Click **Create**

Vercel automatically injects KV credentials. **Redeploy the project** to apply them.

---

## Step 4: Deploy & Test (30 sec)

1. Go to **Deployments** tab
2. Click **Redeploy** on the latest deployment
3. Wait for build to finish
4. Click the production URL (e.g., `https://mes-formulad.vercel.app`)

**You should see**: Admin panel with control buttons

---

## Step 5: Configure Credentials (30 sec)

1. Paste admin token in top-right field: `super-secure-admin-token`
2. Click ⚙️ **Настройки** (Settings)
3. Enter your:
   - YCLIENTS tokens (in .env or ask)
   - Telegram bot token
   - Company ID & chat ID
4. Click **Сохранить** (Save)

---

## Step 6: Test Publishing (30 sec)

1. Return to dashboard
2. Click **Опубликовать TEST** (Publish Test Story)
3. Check your Telegram TEST chat for the story image

✅ **Done!** The app is live and publishing.

---

## That's It!

Stories will now publish automatically at:
- **09:30** Moscow time - Morning story
- **13:30** Moscow time - Afternoon story  
- **17:30** Moscow time - Evening story
- **21:30** Moscow time - Daily report

(Or publish manually using the dashboard buttons)

---

## If Something Breaks

**Deployment fails**: Check Vercel build logs
**Admin API returns 401**: Redeploy after setting env vars
**Can't see admin panel**: Wait 1 minute, refresh browser, check KV is connected
**Stories not sending**: Check `TELEGRAM_DRY_RUN=false` on Vercel

---

## URLs After Deployment

- **Admin Panel**: https://mes-formulad.vercel.app
- **API Health**: https://mes-formulad.vercel.app/healthz
- **Custom Domain** (optional): app.rublbarber.ru (add in Settings → Domains)

---

**Questions?** See `DEPLOYMENT-STATUS.md` for full guide.
