# Rubl Telegram Admin

Автоматический Telegram-администратор барбершопа **«РублЪ»**: берёт график и
свободные окна мастеров из YCLIENTS, публикует Stories (утро/день/вечер) с
кликабельным CTA «ЗАПИСАТЬСЯ →», а вечером собирает управленческий отчёт и
отправляет его в служебную Telegram-группу.

> **Режим по умолчанию — TEST.** Пока `TELEGRAM_MODE=test`, любая отправка идёт
> только в тестовый контур, а production-назначение технически недоступно.

---

## Этап 1 — результат аудита

На момент старта работ репозиторий, привязанный к сессии
(`igormoskvinov26-ops/MES-FormulaD`), был **полностью пустым** (0 коммитов,
0 веток), других доступных репозиториев не было, а описанный «существующий»
production-проект «РублЪ» физически недоступен из этой сессии. По согласованию
модуль реализован **с нуля** как самостоятельный сервис — без выдуманных
YCLIENTS ID и без моковых данных в production-коде.

| Раздел аудита | Состояние на старте | Реализовано в этом модуле |
|---|---|---|
| Current architecture | отсутствовала | Node 22 + TypeScript, services-слой |
| YCLIENTS integration | отсутствовала | адаптер `services/yclients` (реальные endpoint'ы) |
| Telegram integration | отсутствовала | `services/telegram` (Bot API + Business Stories) |
| Story renderer | отсутствовал | Playwright/Chromium → PNG 1080×1920 |
| Available data | нет | берётся из YCLIENTS по реальным токенам |
| Missing pieces | всё | см. «Недостающие значения» ниже |

### Недостающие значения (нужно предоставить)

Код работает без них (соответствующие функции просто неактивны и честно
показывают статус), но для реальной работы требуются:

- `YCLIENTS_PARTNER_TOKEN`, `YCLIENTS_USER_TOKEN`, `YCLIENTS_COMPANY_ID`
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_TEST_CHAT_ID`
- `TELEGRAM_BUSINESS_CONNECTION_ID` — для Telegram Business Stories
- `BARBER_ARTASH_STAFF_ID`, `BARBER_KSENIA_STAFF_ID`, `BARBER_DMITRIY_STAFF_ID`
  — **реальные** YCLIENTS staff id (не выдумываются)

> Оригинальный логотип уже получен и подключён (`assets/logo/rubl_logo.png`,
> + варианты gold/cream/black и векторный PDF-исходник). Логотип используется
> как есть, только масштабирование/позиционирование (§7).

> Замечание по `work_schedule/2036703`: этот id из веб-интерфейса YCLIENTS
> **не** трактуется автоматически как company/staff/application id — его нужно
> сверить с реальными ответами API перед использованием.

---

## Архитектура

```
src/
  config/      env (валидация + TEST-guard), barbers, templates (+ ctaArea)
  lib/         time (Europe/Moscow), logger (+redaction), lock, retry, fingerprint, errors
  store/       JSON key-value store (locks + story state)
  services/
    yclients/  расписание → работающие сегодня → свободные слоты; дневные показатели
    telegram/  TelegramService: sendMessage/sendPhoto/postStory/editStory/deleteStory/checkBusinessConnection
    stories/   fixed templates → layout по кол-ву слотов → Playwright PNG → state
    reporting/ DailyReport (null-семантика) + CallStatsProvider + компактный TG-формат
    scheduler/ Morning/Day/Evening story jobs + DailyReportJob (lock, MSK cron)
    health.ts  безопасный статус интеграций (без секретов)
  api/         Express: ручные триггеры, preview, /api/admin/integrations/health
  index.ts     запуск API + scheduler
  cli.ts       ручной запуск job'ов (учитывает DRY_RUN)
web/           статичная админ-панель (dashboard + ручное тестирование)
assets/        logo/ (оригинал, НЕ генерируется) + templates/ (фиксированные дизайны)
```

Каждый scheduled job: **lock → данные → валидация → dry-run/publish →
сохранение состояния → release**. Бизнес-логика в сервисах, не в scheduler.

---

## Быстрый старт

```bash
npm install
npm run build
npm run dev               # API + scheduler
```

Открыть админ-панель: `http://localhost:3000/` → кнопка **⚙ Настройки**.

### Токены вводятся в приложении (не в `.env`)

Все секреты (YCLIENTS/Telegram) вводятся на странице **Настройки** и хранятся
**внутри приложения** в зашифрованном файле `data/config.enc` (AES-256-GCM,
ключ в `data/.appkey`, права `0600`, оба в `.gitignore`). Через UI также:

- **мастер подключения YCLIENTS**: логин/пароль → user token, выбор компании,
  подтягивание списка мастеров и привязка их к staff id;
- **автоопределение Telegram chat_id** (добавь бота в группу → «Определить»);
- переключение режима **test/production**, dry-run, расписание, booking URL.

`.env` остаётся необязательным способом задать значения по умолчанию (seed при
первом запуске) — см. `.env.example`. Для production можно задать
`APP_MASTER_KEY`, тогда конфиг шифруется ключом из него, а не из файла `.appkey`.

### Ручной запуск job'ов (учитывает `TELEGRAM_DRY_RUN`)

```bash
npm run cli -- story:morning
npm run cli -- story:day
npm run cli -- story:evening
npm run cli -- report            # сегодня
npm run cli -- report:preview 2026-08-16
```

### Тесты

```bash
npm test        # 40 unit-тестов (edge cases §45)
```

---

## Ключевые гарантии

- **TEST-mode (§31):** при `TELEGRAM_MODE=test` production-назначение недоступно;
  попытка production-публикации → `Production publishing disabled in TEST mode.`
- **DRY-RUN (§32):** `TELEGRAM_DRY_RUN=true` — считает и рендерит, но не отправляет.
- **Часовой пояс (§2):** все бизнес-события считаются по `Europe/Moscow`, а не по
  системному времени сервера.
- **Логотип (§7):** оригинальный SVG только масштабируется/позиционируется,
  никогда не генерируется; при отсутствии файла — нейтральный плейсхолдер.
- **Свежесть слотов (§5):** повторная проверка окон непосредственно перед
  публикацией; прошедшие/занятые/после-сменные/недоступные окна отсекаются.
- **Анти-спам (§14):** fingerprint `staffId+date+slots`; при отсутствии изменений
  дубликат не публикуется, при возможности Story обновляется.
- **Дубли job'ов (§29):** database-lock по ключам `story:{date}:{period}:{staffId}`
  и `daily-report:{date}`.
- **Отчёт (§16/§38):** отсутствующие показатели — `null` и **скрываются**, а не
  заменяются нулём. Средний чек = выручка / оплаченные визиты (§17).
- **Звонки (§22):** источник телефонии не выдумывается — `CallStatsProvider`
  возвращает `null`, блок «ЗВОНКИ» скрыт до подключения реального источника.
- **Безопасность (§34):** секреты только server-side; в логах/ответах/Story не
  попадают (redaction + presence-флаги).

---

## Переход в production

1. Заполнить `TELEGRAM_PRODUCTION_CHAT_ID`.
2. Явно переключить `TELEGRAM_MODE=production` и `TELEGRAM_DRY_RUN=false`.
3. Заменить плейсхолдеры в `assets/templates/*` реальным артворком (фото
   мастеров). Оригинальный логотип уже подключён (`assets/logo/rubl_logo.png`).

Отдельного «production publish» маршрута в API нет — это осознанное требование
безопасности (§31): переключение режима — единственный способ.
