# Отчёт о реализации — MVP 0.1

**Дата:** 26.10.2026. **Среда проверки:** Linux-контейнер, .NET SDK 10.0.113, Node.js 22.22.0, Chromium (Playwright).
**PROD не затрагивался:** ни одного обращения к `SQLACCESS` или базе `FormulaD`; SQL-клиент в проект не добавлен.

## 1. Что сделано

| Пункт задания | Статус |
|---|---|
| Русскоязычный UI «Производственный план» (таблица, поиск VIN, фильтр статуса, пагинация, состояния) | сделано |
| Карточка VIN только для чтения | сделано |
| API по `docs/API_CONTRACT.md` через `IProductionPlanReader` / `DemoProductionPlanReader` | сделано |
| Dev-аутентификация с секретом из env/user-secrets, cookie-сессия, loopback-only | сделано |
| `401` на защищённых GET без сессии | сделано |
| Health liveness без сведений о БД/хосте | сделано |
| Типизированные DTO, валидация, ProblemDetails, pageSize 1..100 | сделано |
| Демо-данные только из `fixtures/production-plan.demo.json` | сделано |
| Тесты backend/frontend, `.gitignore`, `.env.example`, README | сделано |
| Импорт Excel, старт/завершение, ФОК, NCP, packing lists, печать, реальные учётки | не делалось (вне объёма MVP) |

## 2. Архитектура

- `src/FormulaD.Mes.Api` — один проект ASP.NET Core Minimal API: модели (`Models.cs`), порт чтения
  (`IProductionPlanReader`), демо-адаптер (`DemoProductionPlanReader`), конфигурация и endpoints (`Program.cs`).
  Слои Domain/Application не разнесены по сборкам намеренно — при объёме MVP это дало бы только лишние файлы
  (`docs/ARCHITECTURE.md` это прямо допускает).
- `apps/web` — React + TypeScript + Vite: `api.ts` (HTTP-клиент), `format.ts` (даты и статусы), `LoginScreen`,
  `PlanScreen`, `ProductCard`. Внешних UI-библиотек нет, стили — один `styles.css`.
- `tests/FormulaD.Mes.Api.Tests` — интеграционные тесты поверх `WebApplicationFactory`, без SQL и без Access.

## 3. Безопасность (как реализовано)

- `DataSource` по умолчанию `Demo`. Любое другое значение — исключение при старте (fail-closed), без fallback.
  Проверено тестом `Sql_DataSource_Fails_Closed`.
- Маршрут `POST /api/v1/dev-auth/login` **регистрируется только** при `ASPNETCORE_ENVIRONMENT=Development`,
  `DevAuth:Enabled=true` и заданных логине/пароле. Иначе путь физически отсутствует (`404`), а не скрыт в UI.
- Пароль сравнивается `CryptographicOperations.FixedTimeEquals`; в репозитории и в `appsettings.json` пароля нет.
- Вход разрешён только с loopback-адреса и с loopback-Origin. Cookie: `HttpOnly`, `SameSite=Strict`,
  `Secure` вне Development.
- В API нет ни одного обработчика `POST/PUT/PATCH/DELETE` по производственным данным (есть только `logout`).
- `/api/v1/health/live` возвращает ровно `{"status":"ok"}`.

## 4. Чем проверено (фактические команды и результат)

| Команда | Результат |
|---|---|
| `dotnet build` | Build succeeded, 0 warnings, 0 errors |
| `dotnet test` | **Passed: 22, Failed: 0** |
| `npm run test` (vitest) | **8 passed** (2 файла) |
| `npm run build` (tsc + vite) | успешно, `dist/` собран |
| Ручной smoke через `curl` | health `200 {"status":"ok"}`; план без входа `401`; dev-login `200`; план `200`; `GET /production-plan/NOPE` `404`; `pageSize=101` `400`; `POST /production-plan` `405`; статусы `["FOK","complete","custom_unknown","in progress","planned",null]` |
| E2E в Chromium (Playwright) | вход → таблица из 6 демо-записей → ввод `DEMO-VIN-00004` + Enter → карточка; скриншоты `docs/screenshots/` |

Покрытие тестами: авторизация (401 на всех бизнес-GET), отсутствие dev-login при выключенном режиме, неверный пароль,
пагинация и сортировка по VIN, подстрочный поиск VIN, фильтр статуса, статусы с `null`, карточка и `404`,
`400` на page/pageSize/длинный VIN, отсутствие методов записи, даты без суффикса зоны; на фронте — поиск,
пустая выдача, сетевая ошибка, Enter/сканер, экран входа, формат дат и статусов.

## 5. Соответствие фактам схемы

- `VIN` — единственный ключ маршрутов и поиска; `ID` выводится только справочно.
- `rv` и `shipment_comments` не используются.
- Строки `Status` отдаются как есть; UI подписывает только известные значения, остальные показывает как
  «Другое: `<оригинал>`», `NULL` — «Без статуса». `statusid` только справочно.
- `tblQC_Products` не затрагивается.
- Даты `datetime` отдаются без зоны (`2026-10-20T09:00:00`) и не конвертируются в UTC; пустые — «—».
  Полночь трактуется как «дата без времени» и отображается без `00:00`.

## 6. Известные ограничения и открытые вопросы

1. `SqlProductionPlanReader` не реализован — отдельная задача, только TEST-экземпляр и SELECT-учётка.
2. Политика часовых поясов не согласована (см. `docs/API_CONTRACT.md`); перед PROD требуется решение.
3. Dev-аутентификация — не модель ролей: роли, корпоративный identity-provider и аудит не реализованы.
4. Поиск по подстроке VIN в демо-режиме идёт по памяти; в SQL-версии потребуется индекс/оценка плана запроса.
5. HTTPS локально не настраивался (dev-сертификаты не выпускались); проверка шла по http на loopback.
6. Печать, Excel-импорт, станции, ОТК, NCP/cripple, packing lists — не в объёме.
7. Приёмка цехом не проводилась; MVP 0.1 по `docs/ACCEPTANCE.md` — программная основа, а не рабочая MES.
