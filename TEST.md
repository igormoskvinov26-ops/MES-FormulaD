# Testing — Telegram Stories & Reports

This guide walks through testing the Telegram Stories and daily reports integration after deployment to Vercel.

## Prerequisites

Before testing, ensure:

1. ✅ **App is deployed to Vercel** as described in [DEPLOY.md](DEPLOY.md)
   - NEW separate project in team `rubl1`
   - NEW subdomain `app.rublbarber.ru` assigned
   - NEW KV store connected
   - All environment variables set (see below)

2. ✅ **Environment variables are configured** (Vercel → Project Settings → Environment Variables):
   - `ADMIN_API_TOKENS`: a token you choose (required for admin API access)
   - `YCLIENTS_USER_TOKEN`: obtained via POST /api/v1/auth with manager login/password
   - `TELEGRAM_BOT_TOKEN`: from BotFather
   - `TELEGRAM_TEST_CHAT_ID`: a chat where the bot will send test messages

3. ✅ **Bot has permission to send messages**
   - If sending to a group, add bot to the group and grant message permissions
   - If sending to a personal chat, simply send a message from that user to the bot first

## Test 1: Health Check

Verify integrations are configured:

```bash
curl -H "Authorization: Bearer YOUR_ADMIN_API_TOKENS" \
  https://app.rublbarber.ru/api/admin/integrations/health
```

Expected response:
```json
{
  "yclients": { "ok": true, "configured": true, "message": "..." },
  "telegram": { "ok": true, "configured": true, "mode": "test", "dryRun": false }
}
```

If either shows `ok: false`, check environment variables and Telegram bot token validity.

## Test 2: Story Preview (Design Only)

Preview a Story with manual slots (doesn't hit YCLIENTS, doesn't send to Telegram):

```bash
curl -H "Authorization: Bearer YOUR_ADMIN_API_TOKENS" \
  'https://app.rublbarber.ru/api/admin/stories/preview?slug=artash&slots=10:00,10:30,11:00' \
  -o artash_preview.png
```

This renders the exact PNG that would be published. Check layout, fonts, slots placement.

## Test 3: Today's Schedule

Check real YCLIENTS data for today (no publish yet):

```bash
curl -H "Authorization: Bearer YOUR_ADMIN_API_TOKENS" \
  https://app.rublbarber.ru/api/admin/today
```

Expected response shows working staff, shifts, and free slots:
```json
{
  "date": "2026-08-17",
  "configured": true,
  "barbers": [
    {
      "slug": "artash",
      "displayName": "Арташ",
      "worksToday": true,
      "shift": "10:00–20:00",
      "slots": ["10:00", "10:30", "11:00", ...],
      "shouldPublish": true
    },
    ...
  ]
}
```

## Test 4: Publish Test Story

Send a test Story to `TELEGRAM_TEST_CHAT_ID`:

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_ADMIN_API_TOKENS" \
  -H "Content-Type: application/json" \
  -d '{"slug": "artash", "period": "morning"}' \
  https://app.rublbarber.ru/api/admin/stories/publish-test
```

Expected response:
```json
{
  "ok": true,
  "result": {
    "barberSlug": "artash",
    "sent": true,
    "storyId": "1234567890:...",
    "date": "2026-08-17"
  }
}
```

**Check Telegram**: You should see a Story appear in the test chat with:
- Арташ's photo (barber on left)
- Free slots on the right
- Gold "ЗАПИСАТЬСЯ →" button pointing to booking URL

## Test 5: Test Report

Send a test daily report to `TELEGRAM_TEST_CHAT_ID`:

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_ADMIN_API_TOKENS" \
  https://app.rublbarber.ru/api/admin/report/send-test
```

Expected response:
```json
{
  "ok": true,
  "mode": "test",
  "dryRun": false,
  "send": { "ok": true, "messageId": 123 },
  "text": "ОТЧЕТ: Вторник 17 августа\nЛ..."
}
```

**Check Telegram**: You should see a text message with the daily summary (requires manager/admin YCLIENTS token for full data).

## Test 6: Story Status

Check which Stories have been published today:

```bash
curl -H "Authorization: Bearer YOUR_ADMIN_API_TOKENS" \
  https://app.rublbarber.ru/api/admin/stories/status
```

Response shows all barbers' Story states for today:
```json
{
  "date": "2026-08-17",
  "stories": [
    { "barberSlug": "artash", "storyId": "...", "publishedAt": "2026-08-17T09:30:00Z", "period": "morning" },
    ...
  ]
}
```

## Test 7: Delete Test Story

Remove a test Story to re-run the test:

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_ADMIN_API_TOKENS" \
  -d '{"slug": "artash"}' \
  https://app.rublbarber.ru/api/admin/stories/delete-test
```

## Troubleshooting

### 401 Unauthorized
- Verify `Authorization: Bearer YOUR_ADMIN_API_TOKENS` header matches Vercel env var exactly

### Telegram: "401 Unauthorized"
- Check `TELEGRAM_BOT_TOKEN` is valid (get from BotFather, format: `123456789:ABCdefGHIJklmnoPQRstuvWXYZabCdEFg`)
- Test token directly: `curl https://api.telegram.org/bot<TOKEN>/getMe`

### Telegram: "bot was not found" or "400 Bad Request"
- Verify bot is added to test chat or the test chat ID is correct
- Send a message from the test chat to the bot first if it's a group

### YCLIENTS: "403 Forbidden"
- Partner-level token is enough for Stories (book_times, book_dates)
- Daily report needs manager/admin token (records/analytics endpoints)
- See `.env.example` for details

### Story looks wrong (slots in wrong place, button misaligned)
- Template config may need tuning — see `src/config/templates.ts`
- Check `ctaArea` and `slotsSafeArea` coordinates
- Use `/stories/preview` with manual slots to debug layout

## Next Steps

After successful testing:

1. ✅ Once Stories work correctly, add bot as admin to the production group
2. ✅ Switch `TELEGRAM_MODE` from `test` to `production` in Vercel Settings
3. ✅ Set `TELEGRAM_PRODUCTION_CHAT_ID` in env vars
4. ✅ Enable cron via GitHub Actions (workflow at `.github/workflows/cron.yml`)

> **Safety**: Production switch is one-way. Ensure test Stories look correct before switching.
