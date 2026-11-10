# 04. Справочник API

| | |
|---|---|
| **Назначение** | Полный перечень HTTP-эндпоинтов бэкенда `/api/v1` с параметрами, ответами, ошибками и вызывающими экранами UI. |
| **Для кого** | Разработчик фронтенда и бэкенда; тот, кто пишет интеграцию или тест. |
| **Проверено по коммиту** | `fc6f055` |
| **Источник правды** | [`Program.cs`](../../src/FormulaD.Mes.Api/Program.cs) (маршруты и обработчики), клиент [`apps/web/src/api.ts`](../../apps/web/src/api.ts). Исходы доменных операций — [03-DOMAIN-MODEL.md](03-DOMAIN-MODEL.md). |
| **Итого** | **44 эндпоинта** в `/api/v1` (+ `GET /openapi/v1.json` только в Development, + статика и SPA-fallback). Все 44 регистрируются и в Demo, и в SQL (кроме `dev-auth/login`, он зависит от настройки DevAuth). |

## Оглавление

1. [Общие соглашения](#1-общие-соглашения)
2. [Аутентификация и служебные](#2-аутентификация-и-служебные)
3. [Производственный план](#3-производственный-план)
4. [Несоответствия (NCP)](#4-несоответствия-ncp)
5. [Станции](#5-станции)
6. [Импорт плана](#6-импорт-плана)
7. [Входной контроль](#7-входной-контроль)
8. [Что вне `/api/v1`](#8-что-вне-apiv1)
9. [Расхождения с docs/API_CONTRACT.md](#9-расхождения-с-docsapi_contractmd)
10. [Матрица «экран → эндпоинты»](#10-матрица-экран--эндпоинты)

---

## 1. Общие соглашения

**Базовый путь** — `/api/v1`. Все примеры ниже предполагают `http://localhost:5080` и cookie-сессию:

```bash
# вход (пароль — из DevAuth:Password, в репозитории его нет)
curl -s -c jar.txt -H 'Content-Type: application/json' \
     -d "{\"username\":\"demo-operator\",\"password\":\"$MES_PASSWORD\"}" \
     http://localhost:5080/api/v1/dev-auth/login

# дальше любой защищённый вызов — с cookie
curl -s -b jar.txt 'http://localhost:5080/api/v1/production-plan?page=1&pageSize=25'
```

**Аутентификация.** Cookie `formulad.mes.session`: `HttpOnly`, `SameSite=Strict`, срок 8 часов со скользящим продлением, `Secure` — «как запрос» в Development и всегда вне него. Любой эндпоинт, кроме двух анонимных (`health/live`, `dev-auth/login`), без cookie отвечает **401** (редирект на страницу входа подавлен, возвращается код). Доступ без прав — 403. **Ролей нет:** любой вошедший может вызвать любую операцию. CSRF-защита — только `SameSite=Strict` плюс проверка `Origin` на входе; отдельных antiforgery-токенов нет (осознанное допущение, комментарий `ponytail:` в `Program.cs`).

**Формат ошибок.** `application/problem+json` (`ProblemDetails`): поля `title`, `detail`, `status`. Валидационные отказы — **400** (функция `Problem(title, detail)` в `Program.cs`), «не найдено» — **404**. Необработанное исключение → `UseExceptionHandler` → 500 с ProblemDetails (тело не раскрывает детали; наличие `traceId` — поведение платформы, не проверялось запуском). Клиент `api.ts` превращает любой не-2xx в `ApiError(status, 'Ошибка запроса (N)')` и **не читает тело ошибки**, поэтому тексты `title`/`detail` в UI не показываются; экраны формируют свои сообщения.

**Тело запроса.** JSON, `Content-Type: application/json`. Имена полей — camelCase. Тело, которое не разобралось (пустое, не JSON), даёт 400 силами платформы (minimal API).

**Пагинация.** `page ≥ 1` (по умолчанию 1), `pageSize` 1..100 (по умолчанию 25). Ответ — `{ items, page, pageSize, total }`. Нарушение → 400 «Некорректная страница» / «Некорректный размер страницы». Размер страницы не клампится, а отклоняется.

**Длина VIN.** 1..50 символов; больше → 400 «Некорректный VIN».

**Даты и часовые пояса (T-024).** Все даты — строки ISO **без зоны**, например `2026-10-20T09:00:00`. Используется **локальное время сервера** (= цеховое время завода). DST не действует (московское время, UTC+3, без перехода). API не принимает и не возвращает смещение; UI отображает время «как есть». `datetime` в SQL Server тоже без зоны — совпадает с API.

**Хост.** `AllowedHosts` в `appsettings.json` = `localhost;127.0.0.1;[::1]`: запрос с другим заголовком `Host` (например, по IP машины) будет отклонён платформой (400). Для доступа с другой машины это нужно менять явно.

Условные обозначения столбца «Режим»: **D** — Demo, **S** — SQL; «D+S» — работает в обоих, но поведение может отличаться (см. примечания).

## 2. Аутентификация и служебные

| # | Метод и путь | Доступ | Тело / параметры | Ответ | Ошибки | UI | Режим |
|---|---|---|---|---|---|---|---|
| 1 | `GET /health/live` | анонимно | — | `200 {"status":"ok"}` | — | — | D+S |
| 2 | `POST /dev-auth/login` | анонимно | `{username, password}` | `200 {userName, mode:"dev"}` + cookie | 403 «Доступ запрещён» (не loopback или `Origin` не localhost); 401 «Неверные учётные данные» | `LoginScreen` | D+S |
| 3 | `GET /auth/me` | вход | — | `200 {userName, mode, demo}` | 401 | `App` (при старте) | D+S |
| 4 | `POST /auth/logout` | вход | — | `204` | 401 | `AppHeader` | D+S |

Примечания:

- **#1** не раскрывает ни конфигурации, ни БД, ни хоста.
- **#2 физически отсутствует** (маршрут не регистрируется), если не выполнено **всё сразу**: `DevAuth:Enabled=true`, окружение `Development` и заданы `DevAuth:Username` и `DevAuth:Password`. Пароля по умолчанию нет. Сравнение логина — `Ordinal`, пароля — `FixedTimeEquals`. Проверка loopback: адрес клиента `null` или loopback. Проверка `Origin`: пустой допускается (curl, тесты), иначе хост должен быть loopback или `localhost`.
- **#3** `mode` равен `"dev"`, если вход возможен, иначе `"closed"`. Поле `demo` в ответе всегда `true` (историческое; смысловой нагрузки не несёт).
- Логин кладёт в cookie claims `Name` и `auth_mode=dev`.

## 3. Производственный план

Группа `/production-plan`, весь доступ — только после входа.

| # | Метод и путь | Параметры / тело | Ответ 200 | Ошибки | UI | Режим |
|---|---|---|---|---|---|---|
| 5 | `GET /production-plan/statuses` | — | `(string\|null)[]` — значения `Status` «как есть»; `null` — записи без статуса | — | `PlanScreen` | D+S |
| 6 | `GET /production-plan` | query: `vin?`, `status?`, `statusId?`, `page=1`, `pageSize=25` | `PagedResult<ProductionPlanItem>` | 400: `vin` > 50 символов; `page < 1`; `pageSize` вне 1..100 | `PlanScreen`, `App` (счётчики), `FokScreen`, `ScanTransitionScreen` (очередь), `ReportsScreen` | D+S |
| 7 | `GET /production-plan/{vin}` | — | `ProductionPlanItem` | 400 (длина VIN); 404 «Изделие не найдено» | `PlanScreen`, `FokScreen`, `ScanTransitionScreen`, `StationScreen`, `NcpPrintDialog` | D+S |
| 8 | `POST /production-plan/{vin}/start` | — | обновлённое изделие | 400 «Нельзя запустить»; 404 | `StartScreen` | D+S |
| 9 | `POST /production-plan/{vin}/complete` | — | обновлённое изделие | 400 «Нельзя завершить»; 404 | `CompleteScreen` | D+S |
| 10 | `POST /production-plan/{vin}/fok` | — | обновлённое изделие | 400 «FOK недоступен» (есть неустановленная деталь) или «Нельзя подтвердить FOK» (статус); 404 | `FokScreen` | D+S |
| 11 | `POST /production-plan/{vin}/rework` | — | обновлённое изделие | 400 «Нельзя отправить в Rework»; 404 | `FokScreen` («Отправить в Rework») | D+S |
| 12 | `POST /production-plan/{vin}/rework/finish` | — | обновлённое изделие | 400 «Rework не завершён» (деталь) или «Нельзя завершить Rework» (статус); 404 | `ReworkScreen` | D+S |
| 13 | `POST /production-plan/{vin}/move` | `{toPosition: int}` | изделие после перемещения | 400: `toPosition < 1`, «Нет позиции в плане», «Позиция не найдена»; 404 | `PlanScreen` (режим «Изменить порядок», `MoveDialog`) | D+S |
| 14 | `POST /production-plan/{vin}/print` | — | изделие с новым `printDate` | 404 | `JobCardDialog` | D+S |

Примечания:

- **#6** Параметр `status` (строка) и `statusId` (число) фильтруют **разные колонки**, их можно комбинировать. `status=""` (пустая строка в query) — «без статуса». Сортировка: по `SEQN` по возрастанию, изделия без `SEQN` — в конец, затем по `VIN`. Поиск по VIN: только цифры → по концу, иначе по началу (см. [03 §4.4](03-DOMAIN-MODEL.md#44-поиск-по-vin)). Сортировку и режим поиска изменить параметрами нельзя.
- **#7** маршрут `statuses` (#5) имеет приоритет над `{vin}` как литеральный сегмент; изделие с VIN `statuses` недостижимо по этому пути.
- **#8–#12** Логика и таблица переходов — [03 §3](03-DOMAIN-MODEL.md#3-статусы-изделия-и-переходы). Сообщение при неверном статусе: «Изделие уже в статусе «X», ожидался «Y»» (для #11–#12 — «Изделие в статусе…»).
- **#10, #12** Сначала проверяется длина VIN, потом NCP, потом сам переход. Если у изделия есть неустановленная деталь, а статус неверный, вернётся ошибка про деталь.
- **#13** Тело: `{"toPosition": 24}`. Работает и в SQL (транзакция, `UPDATE [SEQN]`).
- **#14** Разрешено в любом статусе; статус не меняется.

Примеры:

```bash
curl -s -b jar.txt 'http://localhost:5080/api/v1/production-plan?vin=00001&statusId=1'      # поиск по хвосту VIN
curl -s -b jar.txt -X POST http://localhost:5080/api/v1/production-plan/DEMO-VIN-00002/start
curl -s -b jar.txt -H 'Content-Type: application/json' -d '{"toPosition":23}' \
     http://localhost:5080/api/v1/production-plan/DEMO-VIN-00002/move
```

Пример тела изделия (`ProductionPlanItem`):

```json
{
  "vin": "DEMO-VIN-00001", "id": 1001, "seqn": 23,
  "modelArticle": "DEMO-800", "modelName": "Квадроцикл 800 · ДЕМО",
  "engineNumber": "DEMO-ENGINE-01", "color": "Серый",
  "specificationName": "Pathcross 1000 LTD · ДЕМО",
  "status": "in progress", "statusId": 1,
  "printDate": "2026-10-12T00:00:00",
  "plannedStartDate": "2026-10-12T00:00:00", "plannedCompleteDate": "2026-10-13T00:00:00",
  "plannedShipmentDate": "2026-11-15T00:00:00",
  "startDate": "2026-10-20T09:00:00", "completeDate": null, "fokDate": null
}
```

## 4. Несоответствия (NCP)

Группа `/ncp`, только после входа. Типы — `NcpItem`, `ComponentItem` ([03 §2.2](03-DOMAIN-MODEL.md#22-несоответствие--ncpitem)).

| # | Метод и путь | Параметры / тело | Ответ 200 | Ошибки | UI | Режим |
|---|---|---|---|---|---|---|
| 15 | `GET /ncp/types` | — | `string[]` | — | `NcpScreen`, `StationScreen` | D+S |
| 16 | `GET /ncp/stations` | — | `string[]` | — | `NcpScreen`, `StationScreen`, `FokScreen`, `AdminScreen` | D+S |
| 17 | `GET /ncp/components` | — | `ComponentItem[]` | — | `NcpScreen`, `StationScreen`, `AdminScreen` | D+S |
| 18 | `GET /ncp/missing-parts` | query: `vin` (обязателен) | `NcpItem[]` — блокирующие FOK | 400: VIN пуст или > 50 | `FokScreen`, `ReworkScreen` | D+S |
| 19 | `GET /ncp` | query: `vin?`, `status?`, `page`, `pageSize` | `PagedResult<NcpItem>` | 400: VIN, страница, размер | `NcpScreen`, `StationScreen`, `ReworkScreen`, `NcpPrintDialog`, `ReportsScreen` | D+S |
| 20 | `POST /ncp` | `{vin, station, componentCode, quantity, type, operatorComment?}` | созданный `NcpItem` (код **200**, не 201) | 400: VIN; «Компонент не найден»; «Некорректная станция»; «Некорректное количество» (1..9999); «Некорректный тип»; 404 «Изделие не найдено» | `NcpScreen`, `StationScreen` | D+S |
| 21 | `POST /ncp/{id}/part-installed` | `{installed: bool}` | обновлённый `NcpItem` | 404 «Заявка не найдена» | `NcpScreen`, `ReworkScreen` | D+S, **в SQL не меняет данные** |
| 22 | `POST /ncp/{id}/close` | `{engineerComment?: string}` | закрытый `NcpItem` | 400 «Уже закрыто»; 404 «Заявка не найдена» | `NcpScreen`, `ReworkScreen` | D+S |

Примечания:

- **#16** Demo: список `1..11`; SQL: `DISTINCT StationID` из `tblComponent`, при пустом результате — тот же список `1..11`.
- **#19** Сортировка: новые сверху (`CreatedAt DESC, Id DESC`). Фильтр `status`: Demo — точное совпадение строки; SQL — значение `Закрыто` (без учёта регистра) → `Status=2`, **любое другое непустое значение → `Status=1`** (то есть произвольная строка сработает как «Открыто»). Поиск по VIN — по тому же правилу, что и план.
- **#18** Критерий «блокирует» различается по режимам: Demo — любая NCP с `partInstalled=false`; SQL — любая открытая NCP ([03 §4.1](03-DOMAIN-MODEL.md#41-блокировка-fok-незакрытой-деталью)).
- **#20** Порядок проверок: длина VIN → существование VIN → станция → компонент → количество → тип. Первой сработавшей проверкой определяется текст ошибки.
- **#21** В SQL-режиме признака установки нет, метод только пишет событие в журнал ([03 §6.1](03-DOMAIN-MODEL.md#61-ncp-признак-установки-детали)). Тело `{"installed": true}`.
- **#22** Закрытие не требует установленной детали.

```bash
curl -s -b jar.txt -H 'Content-Type: application/json' \
     -d '{"vin":"DEMO-VIN-00001","station":"3","componentCode":"DEMO-CMP-014","quantity":1,"type":"Брак","operatorComment":"задир"}' \
     http://localhost:5080/api/v1/ncp
curl -s -b jar.txt -H 'Content-Type: application/json' -d '{"installed":true}' \
     http://localhost:5080/api/v1/ncp/1/part-installed
```

## 5. Станции

Группа `/stations`, только после входа.

| # | Метод и путь | Параметры / тело | Ответ 200 | Ошибки | UI | Режим |
|---|---|---|---|---|---|---|
| 23 | `GET /stations/{vin}/checks` | — | `{ "<код компонента>": {componentCode, checked, checkedBy, checkedAt} }` | 400 (длина VIN); 404 «Изделие не найдено» | `StationScreen` | D+S |
| 24 | `POST /stations/{vin}/components/{code}/check` | `{checked: bool}` | `ComponentCheck` | 404 «Изделие не найдено»; 400 «Компонент не найден» | `StationScreen` | D+S |

Примечания:

- **#23** Компонент без отметки в ответе отсутствует (это «ещё не проверялся», а не ошибка).
- **#24** Длина VIN в обработчике не проверяется. В SQL-режиме таблица `tblComponentCheck` создаётся приложением при первом обращении ([06](06-DATA-AND-SQL.md)).

## 6. Импорт плана

Группа `/plan-import`, только после входа. Типы — [03 §2.4](03-DOMAIN-MODEL.md#24-импорт-плана).

| # | Метод и путь | Тело | Ответ 200 | Ошибки | UI | Режим |
|---|---|---|---|---|---|---|
| 25 | `GET /plan-import/reference` | — | `{models:[{article,name}], colors:[string], specifications:[string]}` | — | `ImportScreen`, `AdminScreen` | D+S |
| 26 | `POST /plan-import/sessions` | `{rows:[ImportRawRow], source:string}` | `ImportSession` | 400 «Нет строк» (0 строк); 400 «Слишком много строк» (> 500) | `ImportScreen` | D+S |
| 27 | `GET /plan-import/sessions/{id}` | — | `ImportSession` | 404 «Загрузка не найдена» | (нет вызова в UI) | D+S |
| 28 | `PUT /plan-import/sessions/{id}/rows/{rowNumber}` | `ImportRawRow` | `ImportSession` (вся сессия перепроверена) | 404 «Загрузка или строка не найдена» | `ImportScreen` | D+S |
| 29 | `POST /plan-import/sessions/{id}/publish` | — | `{published: int}` | 400 «Нельзя опубликовать» (есть ошибки); 404 «Загрузка не найдена» | `ImportScreen` | D+S |

Примечания:

- **#26** Сессия создаётся **даже если в строках есть ошибки**: ошибки возвращаются построчно в `rows[].errors`. Ответ содержит также `totalCount` и `errorCount`.
- Сессии живут **в памяти процесса** в обоих режимах и пропадают при перезапуске; повторная публикация того же `id` вернёт 404.
- **#29** В SQL публикуется `INSERT`ом в `tblProductionPlan`; `PlannedCompleteDate` в SQL не вставляется ([03 §4.7](03-DOMAIN-MODEL.md#47-импорт-плана)).
- Нормализация сырых строк (разбор CSV/TSV/вставки из Excel) выполняется **на фронтенде** (`importParse.ts`), сервер принимает уже разобранные поля.

Пример тела #26:

```json
{ "source": "paste",
  "rows": [ { "vin": "DEMO-VIN-00099", "modelArticle": "DEMO-800", "engineNumber": "DEMO-ENGINE-99",
              "color": "Серый", "specificationName": "Pathcross 1000 LTD · ДЕМО",
              "plannedStartDate": "2026-11-20", "plannedCompleteDate": null, "plannedShipmentDate": null } ] }
```

## 7. Входной контроль

Группа `/incoming-inspection`, только после входа. Типы — [03 §2.5](03-DOMAIN-MODEL.md#25-входной-контроль). В SQL-режиме нужные таблицы создаются приложением автоматически ([06](06-DATA-AND-SQL.md)).

| # | Метод и путь | Параметры / тело | Ответ 200 | Ошибки | UI |
|---|---|---|---|---|---|
| 30 | `GET /suppliers` | — | `SupplierRef[]` | — | `IncomingInspectionScreen` |
| 31 | `GET /components` | — | `ComponentItem[]` | — | (в UI не вызывается; есть `api.incomingComponents`) |
| 32 | `POST /components` | `{code, name}` | `204` | 400 «Нельзя добавить артикул» (пустые поля или артикул уже есть) | `IncomingInspectionScreen` |
| 33 | `GET /deliveries` | query: `page`, `pageSize` | `PagedResult<Delivery>` (новые сверху) | 400 страница/размер | `IncomingInspectionScreen`, `ReportsScreen` |
| 34 | `POST /deliveries` | `{supplierCode, invoiceNumber, invoiceDate, accompanyingDocument?}` | `Delivery` | 400 «Поставщик не найден»; 400 «Некорректная дата инвойса» (формат `ГГГГ-ММ-ДД` или `ДД.ММ.ГГГГ`) | `IncomingInspectionScreen` |
| 35 | `GET /deliveries/{id}` | — | `Delivery` | 404 «Поставка не найдена» | `IncomingInspectionScreen` |
| 36 | `GET /deliveries/{id}/packages/by-hu/{hu}` | — | `Package` | 404 «Коробка не найдена» | `IncomingInspectionScreen` |
| 37 | `POST /deliveries/{id}/packing-list/sessions` | `{rows:[PackingListRawRow]}` | `PackingListSession` | 400 «Нет строк»; 400 «Слишком много строк» (> 500); 404 «Поставка не найдена» | `IncomingInspectionScreen` |
| 38 | `GET /packing-list/sessions/{sessionId}` | — | `PackingListSession` | 404 «Загрузка не найдена» | (нет вызова в UI) |
| 39 | `PUT /packing-list/sessions/{sessionId}/rows/{rowNumber}` | `PackingListRawRow` | `PackingListSession` | 404 «Загрузка или строка не найдена» | `IncomingInspectionScreen` |
| 40 | `POST /packing-list/sessions/{sessionId}/confirm` | — | `Delivery` | 400 «Нельзя подтвердить» (есть ошибки); 404 «Загрузка не найдена» | `IncomingInspectionScreen` |
| 41 | `POST /packages/{packageId}/rows/{rowId}/result` | `{outcome, quantity, reason?}` | `Package` | 400: «Некорректный результат», «Некорректное количество», «Коробка закрыта», «Превышен объём контроля»; 404 «Коробка или строка не найдена» | `PackageDialog` |
| 42 | `POST /packages/{packageId}/rows/{rowId}/quota` | `{newRequiredQuantity, comment}` | `Package` | 400: «Нужен комментарий», «Коробка закрыта», «Некорректный объём»; 404 | `PackageDialog` |
| 43 | `POST /packages/{packageId}/close` | — | `Package` | 400 «Уже закрыта» / «Нельзя закрыть» (не все строки отработаны); 404 «Коробка не найдена» | `PackageDialog` |
| 44 | `POST /packages/{packageId}/reopen` | `{comment}` | `Package` | 400 «Нужен комментарий» / «Нельзя переоткрыть» (уже открыта); 404 | `PackageDialog` |

Все пути в таблице даны **без префикса** `/api/v1/incoming-inspection`.

Примечания:

- **#34** `invoiceNumber` в обработчике не проверяется; Demo-реализация вызывает `request.InvoiceNumber.Trim()`, поэтому при отсутствии поля ожидается необработанное исключение и 500 (вывод из кода, запуском не проверялось).
- **#41** `outcome` — ровно одна из строк `OK`, `Брак`, `Пересорт`, `Недостача` (регистр важен). Правило «сумма не больше норматива» — [03 §4.8](03-DOMAIN-MODEL.md#48-входной-контроль).
- **#42** Проверка комментария стоит **до** вызова бизнес-метода, поэтому пустой комментарий даёт 400, даже если коробка не найдена.
- **#43** `AlreadyClosed` → «Уже закрыта»; `NotComplete` и любой другой исход → «Нельзя закрыть».
- **#44** Комментарий обязателен (проверка в обработчике). Исход `AlreadyClosed` для переоткрытия в бизнес-методе не используется; «Эта коробка и так открыта» — исход `NotClosed`.
- Статус коробки (`Open`/`Closed`) и поставки (`Open`/`Verified`/`VerifiedWithIssues`) приходят строками.

```bash
curl -s -b jar.txt -H 'Content-Type: application/json' \
     -d '{"supplierCode":"DEMO-SUP-01","invoiceNumber":"INV-100","invoiceDate":"2026-11-01"}' \
     http://localhost:5080/api/v1/incoming-inspection/deliveries
curl -s -b jar.txt -H 'Content-Type: application/json' \
     -d '{"outcome":"OK","quantity":2}' \
     http://localhost:5080/api/v1/incoming-inspection/packages/1/rows/1/result
```

## 8. Что вне `/api/v1`

| Путь | Что | Условие |
|---|---|---|
| `GET /openapi/v1.json` | OpenAPI-описание | только `Development` (`app.MapOpenApi()`) |
| `/`, `/assets/*`, `index.html` | собранный React-фронтенд из `wwwroot` (`UseDefaultFiles`, `UseStaticFiles`) | всегда |
| любой `GET` вне `/api` | SPA-fallback → `index.html` | всегда |
| любой не-`GET` вне `/api`, неизвестный `/api/...` | `404` | всегда |

Служба умеет работать как Windows Service (`UseWindowsService`), поведение при запуске из консоли не меняется.

## 9. Расхождения с docs/API_CONTRACT.md

Документ [`../API_CONTRACT.md`](../API_CONTRACT.md) описывает «MVP 0.1, только GET». Код ушёл далеко вперёд.

### 9.1. Есть в коде, нет в API_CONTRACT.md

| Эндпоинты | Комментарий |
|---|---|
| `POST /production-plan/{vin}/start`, `/complete`, `/fok`, `/rework`, `/rework/finish`, `/move`, `/print` (#8–#14) | Операции записи; контракт прямо запрещает `POST/PUT/PATCH/DELETE` по производственным сущностям |
| Все эндпоинты `/ncp/*` (#15–#22) | Нет в контракте |
| Все эндпоинты `/stations/*` (#23–#24) | Нет в контракте |
| Все эндпоинты `/plan-import/*` (#25–#29) | Нет в контракте |
| Все эндпоинты `/incoming-inspection/*` (#30–#44) | Нет в контракте |
| `POST /auth/logout` (#4) | В контракте упомянут одной фразой («включить logout аналогично»), без описания |
| Параметр `statusId` у `GET /production-plan` | Нет в контракте |
| `GET /openapi/v1.json` | Нет в контракте |

### 9.2. Контракт и код говорят разное

| Пункт | `API_CONTRACT.md` | Код |
|---|---|---|
| Методы | «Production API — только GET», запрещены POST/PUT/PATCH/DELETE | 30+ POST/PUT-маршрутов, в том числе записывающих в SQL |
| Сортировка списка | по `VIN ASC` по умолчанию | по `SEQN`, без `SEQN` — в конец, затем по `VIN` |
| Поиск по VIN | «подстрока» | по началу, а только для цифр — по концу; поиска по середине нет |
| Пример ответа списка | без `seqn`, `specificationName`, `printDate`, `plannedStartDate`, `plannedCompleteDate` | эти поля в `ProductionPlanItem` есть |
| Коды ошибок | 403 «нет полномочий» | 403 возвращает только `dev-auth/login` (не loopback или чужой `Origin`); ролевой модели нет |
| 500 с trace ID | требуется | тело 500 формирует `UseExceptionHandler`/ProblemDetails; наличие `traceId` не проверялось запуском |
| Остальное совпадает | health без аутентификации и без сведений о конфигурации; 404 для VIN; `statuses` как есть, включая NULL; dev-login только локально и без пароля по умолчанию; даты без зоны | — |

### 9.3. В контракте есть, в коде нет

Ничего из перечисленных в контракте эндпоинтов не отсутствует: пункты 1–6 контракта реализованы.

## 10. Матрица «экран → эндпоинты»

По фактическим вызовам `api.*` в `apps/web/src/*.tsx` (без тестов; учтены и вызовы, разнесённые по нескольким строкам). Названия методов — как в `api.ts`.

| Экран (файл) | Методы `api` | Эндпоинты |
|---|---|---|
| Вход (`LoginScreen`) | `login` | #2 |
| Оболочка (`App`) | `me`, `plan` (счётчики по статусам) | #3, #6 |
| Навигация (`AppHeader`) | `logout` | #4 |
| План (`PlanScreen`) | `plan`, `statuses`, `byVin`, `move` | #6, #5, #7, #13 |
| Печать JobCard (`JobCardDialog`) | `print` | #14 |
| Печать NCP-листа (`NcpPrintDialog`) | `byVin`, `ncpList` | #7, #19 |
| Старт (`StartScreen` → `ScanTransitionScreen`) | `start`, `byVin`, `plan` | #8, #7, #6 |
| Станции (`StationScreen`) | `byVin`, `stationChecks`, `setStationCheck`, `ncpStations`, `ncpComponents`, `ncpTypes`, `ncpList`, `ncpCreate` | #7, #23, #24, #16, #17, #15, #19, #20 |
| Завершение (`CompleteScreen` → `ScanTransitionScreen`) | `complete`, `byVin`, `plan` | #9, #7, #6 |
| FOK (`FokScreen`) | `byVin`, `ncpMissingParts`, `fok`, `sendToRework`, `ncpStations`, `plan` | #7, #18, #10, #11, #16, #6 |
| Rework (`ReworkScreen` → `ScanTransitionScreen`) | `finishRework`, `ncpMissingParts`, `ncpList`, `ncpSetPartInstalled`, `ncpClose`, `byVin`, `plan` | #12, #18, #19, #21, #22, #7, #6 |
| Несоответствия (`NcpScreen`) | `ncpList` (через хук `useNcpList`), `ncpClose`, `ncpComponents`, `ncpCreate`, `ncpSetPartInstalled`, `ncpStations`, `ncpTypes` | #19, #22, #17, #20, #21, #16, #15 |
| Импорт плана (`ImportScreen`) | `planImportReference`, `stageImport`, `replaceImportRow`, `publishImport` | #25, #26, #28, #29 |
| Входной контроль (`IncomingInspectionScreen`) | `suppliers`, `deliveries`, `delivery`, `createDelivery`, `addComponent`, `stagePackingList`, `replacePackingListRow`, `confirmPackingList`, `packageByHu` | #30, #33, #35, #34, #32, #37, #39, #40, #36 |
| Коробка (`PackageDialog`) | `recordRowResult`, `increaseQuota`, `closePackage`, `reopenPackage` | #41, #42, #43, #44 |
| Отчётность (`ReportsScreen`) | `plan`, `ncpList`, `deliveries` | #6, #19, #33 |
| Администрирование (`AdminScreen`) | `planImportReference`, `ncpComponents`, `ncpStations`, `suppliers` | #25, #17, #16, #30 |

> Эндпоинты, которые в UI не вызываются: **#27** (`GET /plan-import/sessions/{id}`), **#31** (`GET /incoming-inspection/components`), **#38** (`GET /packing-list/sessions/{sessionId}`) — клиент `api.ts` для #27 и #38 метода не имеет, для #31 метод есть (`incomingComponents`), но экраны его не используют.
