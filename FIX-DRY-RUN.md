# Исправление: TELEGRAM_DRY_RUN должен быть false

## Проблема

По умолчанию `TELEGRAM_DRY_RUN=true`, поэтому приложение не отправляет сообщения в Telegram. Это безопасный режим для разработки, но на Vercel нужно установить `false`.

## Решение

### Вариант 1: Через веб-интерфейс Vercel (быстро)

1. Откройте [https://vercel.com/igormoskvinov26-ops/mes-formulad](https://vercel.com/igormoskvinov26-ops/mes-formulad)
2. **Settings → Environment Variables**
3. Нажмите **Add** (или найдите `TELEGRAM_DRY_RUN` если он уже есть)
4. Заполните:
   - **Name:** `TELEGRAM_DRY_RUN`
   - **Value:** `false`
   - **Environment:** Production
5. Нажмите **Add**
6. Нажмите **Redeploy** (справа вверху)

После редеплоя (1-2 минуты) сообщения начнут отправляться в Telegram.

---

### Вариант 2: Через Vercel CLI (если установлен)

Запустите на своей машине:

```bash
cd MES-FormulaD
vercel env add TELEGRAM_DRY_RUN
# Введите: false
# Выберите: Production

vercel redeploy --prod
```

---

## Проверка

После редеплоя:

1. Откройте `https://app.rublbarber.ru/api/admin/integrations/health`
2. Введите токен в Authorization: Bearer заголовок
3. В ответе должно быть `"dryRun": false`

Или попробуйте отправить тестовое сообщение:

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_ADMIN_API_TOKENS" \
  https://app.rublbarber.ru/api/admin/stories/publish-test?slug=artash
```

Оно должно прийти в тестовый Telegram чат.
