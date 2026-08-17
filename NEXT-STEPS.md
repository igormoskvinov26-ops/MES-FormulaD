# Next Steps: Complete Testing & Production Setup

The deployment is **live and ready**. Now complete these steps to test and enable production Stories.

## Step 1: Verify Current Vercel Deployment

Visit Vercel and check environment variables are set:

1. Open https://vercel.com/igormoskvinov26-ops/mes-formulad
2. Go to **Settings → Environment Variables**
3. Verify these are present:
   - `ADMIN_API_TOKENS` — your admin token (e.g., `demo-token`)
   - `YCLIENTS_USER_TOKEN` — from earlier
   - `YCLIENTS_PARTNER_TOKEN` — from earlier
   - `YCLIENTS_COMPANY_ID` — if needed
   - `TELEGRAM_BOT_TOKEN` — from BotFather
   - `TELEGRAM_TEST_CHAT_ID` — test chat ID
   - `TELEGRAM_DRY_RUN` — should be `false` for real sends

If any are missing, add them now.

## Step 2: Test with Curl

Use today's date in `YYYY-MM-DD` format (e.g., `2026-08-17`):

### Health Check
```bash
curl -H "x-admin-token: YOUR_ADMIN_TOKEN" \
  https://mes-formulad.vercel.app/api/admin/integrations/health
```

Expected: Shows `yclients: ok` and `telegram: ok`

### Publish Test Story
```bash
curl -X POST \
  -H "x-admin-token: YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"slug": "artash", "period": "morning"}' \
  https://mes-formulad.vercel.app/api/admin/stories/publish-test
```

**⚠️ CRITICAL**: Do NOT include a `date` parameter or use past dates. The endpoint requires today's date.

Expected: Story appears in your test Telegram chat with:
- Barber's photo (left side)
- Available time slots (right side)
- "ЗАПИСАТЬСЯ →" button

## Step 3: Check Today's Real Data

Verify YCLIENTS is properly configured:

```bash
curl -H "x-admin-token: YOUR_ADMIN_TOKEN" \
  https://mes-formulad.vercel.app/api/admin/today
```

Expected response shows working barbers with real shift times and available slots.

## Step 4: Once Test Story Works → Production Setup

When Stories send successfully to your test chat:

1. **Add bot to production Telegram group**
   - Open your barbershop group
   - Add the bot (`@YOUR_BOT_NAME`)
   - Ensure bot has message posting permission

2. **Get production chat ID**
   - Ask someone in the group to send a message
   - Forward a message to `@userinfobot`
   - Note the chat ID (looks like `-1001234567890`)

3. **Set production env vars on Vercel**
   - `TELEGRAM_PRODUCTION_CHAT_ID` = the chat ID from step 2
   - `TELEGRAM_MODE` = `production` (switch from `test`)

4. **Enable scheduled Stories (GitHub Actions)**
   - Uncomment the cron workflow:
     ```bash
     # From repo root:
     sed -i 's/# - cron:/- cron:/' .github/workflows/cron.yml
     git add .github/workflows/cron.yml
     git commit -m "enable: cron-triggered stories"
     git push
     ```
   - GitHub Actions will run every 15 minutes and trigger Stories at scheduled times

## Troubleshooting

### "Unauthorized" on any endpoint
- Check `x-admin-token` header matches `ADMIN_API_TOKENS` in Vercel
- Don't use `Authorization: Bearer` — use `-H "x-admin-token: TOKEN"`

### "Story date must be today"
- Don't pass a `date` parameter
- Or ensure date is today's date in `YYYY-MM-DD` format (e.g., `2026-08-17`)

### Story doesn't appear in Telegram
1. Check `TELEGRAM_DRY_RUN` is set to `false` (not `true`)
2. Verify `TELEGRAM_BOT_TOKEN` is correct
3. Verify `TELEGRAM_TEST_CHAT_ID` is correct (check with `@userinfobot`)
4. Ensure bot has permission to post messages in the chat
5. Check health endpoint: `curl https://mes-formulad.vercel.app/api/admin/integrations/health`

### YCLIENTS errors
- Verify tokens in Vercel env vars match what you obtained from manager login
- User token format: `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` (32 hex chars)
- Partner token format: alphanumeric string

## Reference

- **API Docs**: See [TEST.md](TEST.md) for all endpoints
- **Configuration**: [DEPLOY.md](DEPLOY.md) for details
- **Code**: Stories code in `src/services/stories/`
