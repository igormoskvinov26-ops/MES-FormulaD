# 🔄 Передача разработчику — Полное описание работы

## 📊 Что сделано

### 1. Основная архитектура приложения ✅

**Проект:** Rubl Telegram Admin — автоматический публикатор Telegram Stories для барбершопа РублЪ

**Стек:**
- **Backend:** Node.js + Express.js + TypeScript
- **Frontend:** HTML/CSS/JS админ-панель (web/index.html)
- **Хранилище:** Vercel KV (Redis) для продакшена, файлы для локальной разработки
- **Рендеринг:** resvg (SVG → PNG, без браузера)
- **Планировщик:** node-cron + GitHub Actions (внешний pinger для cron)
- **API:** REST с аутентификацией по токену

**Код скомпилирован:**
- TypeScript → JavaScript в папке `dist/`
- Готов к запуску на Node.js ≥20
- Проверено: `npm run build` успешен

---

## 🔑 Токены и чувствительные данные

### Где хранятся токены

#### 1. **Локальная разработка** (`.env` файл)
```
YCLIENTS_PARTNER_TOKEN=Cxex2xMk0P95K65GevxT
YCLIENTS_USER_TOKEN=e95410aecb0678f93185746f9b4f025f
YCLIENTS_COMPANY_ID=2387007
TELEGRAM_BOT_TOKEN=8931331468:AAFz9UPKCtTPCscEB9EMWaFAmTJjZjdrgQY
TELEGRAM_TEST_CHAT_ID=-1004340041715
ADMIN_API_TOKENS=test-token
```

**Статус:** `.env` файл в `.gitignore` (не закоммичен в репозиторий)

#### 2. **Production на Vercel** (Environment Variables)
```
APP_MASTER_KEY=          [32-byte hex] — ключ шифрования
CRON_SECRET=             [32-byte hex] — секрет для cron эндпоинта
ADMIN_API_TOKENS=        [токен администратора]
TELEGRAM_DRY_RUN=false   [важно! включает реальные отправки]
TZ=Europe/Moscow         [часовой пояс]
```

**Статус:** Должны быть установлены вручную в Vercel dashboard

#### 3. **Runtime Settings** (Vercel KV - зашифровано)
После развертывания на Vercel, токены можно сохранить в UI:
- YCLIENTS токены
- Telegram bot token
- Другие учетные данные

Все сохраняется в Vercel KV с шифрованием AES-256-GCM.

---

### Безопасность токенов

#### ✅ Реализовано
- ✅ Все токены читаются **только на сервере** (никогда не отправляются в браузер)
- ✅ Никогда не логируются в plaintext (используется `[redacted]` в логах)
- ✅ Защита от случайных отправок (режим TEST по умолчанию блокирует production)
- ✅ Сохранение в KV с шифрованием AES-256-GCM
- ✅ Admin API защищен токеном `x-admin-token` заголовок
- ✅ Cron эндпоинт защищен `CRON_SECRET`

#### 🔐 Механизм безопасности
Файл: `src/config/settings.ts`
- Токены загружаются один раз при старте
- Хранятся в памяти приложения
- Редакция для логов через `safeConfigSnapshot()`
- Чувствительные данные помечаются как `[redacted]`

---

## 📂 Структура данных

### Конфигурация окружения

Файл: `src/config/env.ts`

```typescript
export const env = {
  yclients: {
    partnerToken: string,      // Из YCLIENTS_PARTNER_TOKEN
    userToken: string,         // Из YCLIENTS_USER_TOKEN
    companyId: string,         // Из YCLIENTS_COMPANY_ID
    apiBase: string,           // Base URL (https://api.yclients.com/api/v1)
  },
  telegram: {
    botToken: string,          // Из TELEGRAM_BOT_TOKEN
    testChatId: string,        // Из TELEGRAM_TEST_CHAT_ID
    productionChatId: string,  // Из TELEGRAM_PRODUCTION_CHAT_ID
    businessConnectionId: string, // Для Stories
    mode: 'test' | 'production', // Режим работы
    dryRun: boolean,           // Сухой запуск (не отправляет)
  },
  bookingUrl: string,          // URL для букирования
  tz: string,                  // Часовой пояс (Europe/Moscow)
  schedule: {
    morning: string,           // HH:mm для утренней истории
    day: string,               // HH:mm для дневной истории
    evening: string,           // HH:mm для вечерней истории
    dailyReport: string,       // HH:mm для дневного отчета
  },
  server: {
    port: number,
    adminTokens: string[],     // Токены администраторов
    schedulerEnabled: boolean,
  },
  barberStaffIds: {
    artash: string,            // ID мастера Арташа в YCLIENTS
    ksenia: string,            // ID мастера Ксении
    dmitriy: string,           // ID мастера Дмитрия
  },
};
```

### Runtime Settings (сохраняется в KV)

Файл: `src/config/settings.ts`

```typescript
interface RuntimeSettings {
  yclients: {
    partnerToken: string,
    userToken: string,
    companyId: string,
  },
  telegram: {
    botToken: string,
    testChatId: string,
    productionChatId: string,
    businessConnectionId: string,
    mode: 'test' | 'production',
    dryRun: boolean,
  },
  // ... другие настройки
}
```

**Где хранится:**
- **Локально:** `data/.settings.json` (зашифровано с `data/.appkey`)
- **Vercel:** Vercel KV (Redis) с `APP_MASTER_KEY`

---

## 🌐 API эндпоинты

### Public (без аутентификации)
```
GET /healthz                    — Проверка здоровья приложения
GET /                           — Служит статический HTML/CSS/JS админ-панели
```

### Admin API (требуется x-admin-token заголовок)
```
GET  /api/admin/settings        — Получить текущие настройки
POST /api/admin/settings        — Обновить настройки
POST /api/admin/settings/yclients/login — Вход в YCLIENTS
GET  /api/admin/settings/yclients/companies — Получить компании
GET  /api/admin/scheduler/status — Статус планировщика
POST /api/admin/stories/publish-test — Опубликовать тестовую историю сейчас
POST /api/admin/stories/send-report — Отправить отчет сейчас
```

### Cron API (требуется CRON_SECRET в Authorization заголовке)
```
POST /api/cron/tick            — Тик планировщика (вызывается каждые 15 мин)
```

---

## 📋 Токены и их использование в коде

### 1. YCLIENTS токены

**Где используются:**
- Файл: `src/services/yclients/client.ts`
- API запросы для получения информации о мастерах, доступных слотах, бронированиях

**Парок токенов:**
- `YCLIENTS_PARTNER_TOKEN` — токен приложения-партнера
- `YCLIENTS_USER_TOKEN` — пользовательский токен для доступа к данным

**Пример использования:**
```typescript
const response = await fetch(
  `${apiBase}/book_times/${companyId}/`,
  {
    headers: {
      'Authorization': `Bearer ${userToken}`,
      'X-Partner-Token': partnerToken,
    },
  }
);
```

### 2. Telegram bot token

**Где используется:**
- Файл: `src/services/telegram/service.ts`
- Отправка историй и отчетов в Telegram

**Формат:**
```
TELEGRAM_BOT_TOKEN=8931331468:AAFz9UPKCtTPCscEB9EMWaFAmTJjZjdrgQY
```

**Использование:**
```typescript
const telegramApiUrl = `https://api.telegram.org/bot${botToken}/`;
// Запросы типа: postStory, editStory, deleteStory
```

### 3. Admin API токен

**Где используется:**
- Все защищенные административные эндпоинты

**Пример запроса:**
```bash
curl -H "x-admin-token: test-token" http://localhost:3000/api/admin/settings
```

### 4. Cron Secret

**Где используется:**
- GitHub Actions workflow (`.github/workflows/cron.yml`)
- Внешние pingers (cron-job.org, UptimeRobot)

**Использование:**
```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://app.rublbarber.ru/api/cron/tick
```

### 5. APP_MASTER_KEY

**Где используется:**
- Шифрование настроек в Vercel KV

**Механизм:**
```typescript
// src/lib/crypto.ts
import { createCipheriv, createDecipheriv } from 'crypto';

// Использует AES-256-GCM
encrypt(plaintext, masterKey) // → зашифрованные данные
decrypt(ciphertext, masterKey) // → расшифрованные данные
```

---

## 🛡️ Безопасность: Что где хранится

| Данные | Локально | Vercel | Логи | Браузер |
|--------|----------|--------|------|---------|
| YCLIENTS токены | ✅ .env | ✅ KV (зашифровано) | ❌ [redacted] | ❌ |
| Telegram bot token | ✅ .env | ✅ KV (зашифровано) | ❌ [redacted] | ❌ |
| APP_MASTER_KEY | ❌ | ✅ env var | ❌ | ❌ |
| CRON_SECRET | ❌ | ✅ env var | ❌ | ❌ |
| Admin API токен | ✅ .env | ✅ env var | ❌ | ❌ |

**Правило:** Никакой чувствительный данный не попадает в браузер, логи или git репозиторий.

---

## 🚀 Процесс развертывания

### Этапы

1. **Локальная разработка**
   - `.env` файл с токенами (не коммитится)
   - `npm run dev` загружает переменные через `--env-file=.env`
   - Settings сохраняются в `data/.settings.json` (локально)

2. **Vercel Production**
   - Environment variables устанавливаются в Vercel dashboard
   - KV хранилище для сохранения settings (зашифровано)
   - Serverless функция в `api/index.js` → `dist/serverless.js`

3. **GitHub Actions Cron**
   - Workflow вызывает `/api/cron/tick` каждые 15 минут
   - Передает `CRON_SECRET` в Authorization заголовке
   - Scheduler выбирает нужную работу и выполняет

---

## 📝 Файлы для установки токенов

### Для разработчика, продолжающего работу

**Необходимые действия при запуске:**

1. **Скопировать `.env.example` → `.env`**
   ```bash
   cp .env.example .env
   ```

2. **Заполнить токены в `.env`:**
   ```
   YCLIENTS_PARTNER_TOKEN=<значение>
   YCLIENTS_USER_TOKEN=<значение>
   YCLIENTS_COMPANY_ID=<значение>
   TELEGRAM_BOT_TOKEN=<значение>
   TELEGRAM_TEST_CHAT_ID=<значение>
   ADMIN_API_TOKENS=<любой токен>
   ```

3. **Локальный запуск:**
   ```bash
   npm install
   npm run build
   npm run dev
   ```

4. **Для Vercel deploy:**
   - Перейти в https://vercel.com/dashboard
   - Установить env vars в Settings → Environment Variables
   - Создать KV хранилище
   - Redeploy

---

## 🔗 Связанные файлы документации

- **DEPLOY-NOW.md** — Быстрое развертывание на Vercel
- **DEPLOYMENT-CHECKLIST.md** — Полный чек-лист с подробными шагами
- **DEPLOYMENT-STATUS.md** — Статус приложения и справочник
- **TEST.md** — Тестирование API эндпоинтов
- **NEXT-STEPS.md** — Дальнейшие шаги разработки
- **FIX-DRY-RUN.md** — Важно: включение реальных отправок

---

## ✅ Статус готовности

### Что готово для продакшена ✅
- ✅ TypeScript код скомпилирован
- ✅ Express API работает
- ✅ Web UI служится
- ✅ Аутентификация работает
- ✅ Vercel конфигурация готова
- ✅ KV интеграция поддерживается
- ✅ Документация полная

### Что нужно сделать разработчику
1. Развернуть на Vercel (5 мин, см. DEPLOY-NOW.md)
2. Установить env vars на Vercel
3. Создать KV хранилище
4. Настроить токены через web UI
5. Включить cron (GitHub Actions или внешний pinger)
6. Тестировать отправку историй

---

## 📞 Поддержка

- **Компиляция падает:** проверить Node.js ≥20, `npm install`, `npm run build`
- **Токены не загружаются:** проверить `.env` файл, переменные окружения
- **API возвращает 401:** проверить admin token в заголовке
- **Истории не отправляются:** проверить TELEGRAM_DRY_RUN=false на Vercel
- **Планировщик не запускается:** проверить SCHEDULER_ENABLED=true

---

## 🎯 Готово к передаче разработчику

**Дата:** 2026-08-19
**Статус:** Production-ready для развертывания на Vercel
**Токены:** Установлены локально в `.env`, готовы к передаче на Vercel
**Документация:** Полная с примерами и troubleshooting

Разработчик может начать с `DEPLOY-NOW.md` для быстрого развертывания.
