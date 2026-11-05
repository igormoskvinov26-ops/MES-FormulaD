# 06. Данные и SQL

| | |
|---|---|
| **Назначение** | Описать, откуда бэкенд берёт данные: демо-фикстуры и SQL-режим; какие таблицы и колонки задействованы; как построены запросы; как устроена защита от подключения к PROD; зачем нужен каждый файл в `sql/`. |
| **Для кого** | Разработчик, который меняет данные, пишет SQL или включает режим `DataSource=Sql` на тестовой базе. |
| **Проверено по коммиту** | `fc6f055` |
| **Источник правды** | [`SqlOptions.cs`](../../src/FormulaD.Mes.Api/SqlOptions.cs), [`ProductionPlanSql.cs`](../../src/FormulaD.Mes.Api/ProductionPlanSql.cs), классы `Sql*.cs`, [`fixtures/`](../../fixtures/), [`sql/`](../../sql/). Контракт на колонки — [`../DB_CONTRACT.md`](../DB_CONTRACT.md). |

> ## Постоянное жёсткое ограничение
>
> **Приложение никогда не подключается к PROD: ни к серверу `SQLACCESS` как к производственному контуру, ни к базе `FormulaD`.** Допустима только отдельная тестовая база **`FormulaD_TEST`**. Это не этап и не пожелание, а постоянный запрет. В репозитории не должно быть строк подключения, паролей и секретов. Как именно код его обеспечивает и **где его защита заканчивается** — [раздел 3](#3-защита-от-prod).

## Оглавление

1. [Два режима данных](#1-два-режима-данных)
2. [Demo-данные](#2-demo-данные)
3. [Защита от PROD](#3-защита-от-prod)
4. [Два подключения и права](#4-два-подключения-и-права)
5. [SQL-режим: таблицы и колонки](#5-sql-режим-таблицы-и-колонки)
6. [Как строятся запросы](#6-как-строятся-запросы)
7. [Скрипты `sql/`](#7-скрипты-sql)
8. [Соответствие docs/DB_CONTRACT.md и кода](#8-соответствие-docsdb_contractmd-и-кода)
9. [Ограничения TEST-режима](#9-ограничения-test-режима)
10. [Как включить SQL-режим на TEST](#10-как-включить-sql-режим-на-test)

---

## 1. Два режима данных

| | **Demo** (по умолчанию) | **Sql** (только TEST) |
|---|---|---|
| Включение | `DataSource=Demo` или ключ не задан | `DataSource=Sql` + `Sql:IsTestEnvironment=true` + `Sql:ConnectionString` |
| Хранилище | JSON-фикстуры, затем память процесса | таблицы SQL Server |
| Перезапуск | данные возвращаются к фикстурам | данные сохраняются в базе |
| Секреты | не нужны | строка подключения (user-secrets / env), **не в репозитории** |
| Запись | в памяти, безопасна | реальная запись в TEST (UPDATE/INSERT/MERGE/CREATE TABLE) |
| Для чего | разработка, демонстрация, тесты, [тестовый стенд](../../stand/stand.sh) | проверка на реальной схеме и данных TEST |

[`stand.sh`](../../stand/stand.sh) жёстко задаёт `DataSource=Demo` и сбрасывает переменные `Sql__ConnectionString` и `Sql__IsTestEnvironment`: подключиться к SQL через стенд нельзя.

## 2. Demo-данные

Все фикстуры — JSON-массивы в [`fixtures/`](../../fixtures/); записи **синтетические**, имена помечены `· ДЕМО`, VIN вида `DEMO-VIN-0000N`. В csproj каждая подключена как `Content … CopyToOutputDirectory`, при запуске лежит в `bin/…/fixtures/`. Пути переопределяются ключами `Demo:*FixturePath` ([05 §9](05-BACKEND-GUIDE.md#9-конфигурация)). Загрузка ленивая; пустой или нечитаемый файл → `InvalidOperationException`. JSON читается с `JsonSerializerDefaults.Web` и `PropertyNameCaseInsensitive`.

| Файл | Записей | Форма записи | Кто читает |
|---|---|---|---|
| `production-plan.demo.json` | 6 | `ProductionPlanItem` (camelCase) | `DemoProductionPlanReader` |
| `ncp.demo.json` | 5 | `NcpItem` | `DemoNcpStore` |
| `components.demo.json` | 8 | `{code, name, station}` | `DemoNcpStore` (справочник NCP и станций); **отдельная копия** в `DemoIncomingInspectionStore` |
| `models.demo.json` | 3 | `{article, name}` | `DemoPlanImport` |
| `colors.demo.json` | 12 | строка | `DemoPlanImport` |
| `specifications.demo.json` | 2 | строка | `DemoPlanImport` |
| `suppliers.demo.json` | 3 | `{code, name, isParentPlant}` | `DemoIncomingInspectionStore` |
| `inspection-quotas.demo.json` | 2 | `{componentCode, percent, fixedCount}` | `DemoIncomingInspectionStore` |

### 2.1. План (`production-plan.demo.json`)

Набор подобран так, чтобы каждая запись демонстрировала сценарий:

| VIN | `seqn` | `status` / `statusId` | Модель, цвет | Сценарий |
|---|---|---|---|---|
| `DEMO-VIN-00001` | 23 | `in progress` / 1 | DEMO-800, Серый | В работе; **две открытые NCP** без детали → после завершения заблокирует FOK |
| `DEMO-VIN-00002` | 24 | `planned` / 0 | DEMO-800, Красный | Ожидает запуска (для экрана «Старт», перестановки) |
| `DEMO-VIN-00003` | 25 | `complete` / 2 | DEMO-1000, Чёрный | Готов к FOK: единственная NCP закрыта и деталь установлена |
| `DEMO-VIN-00004` | 26 | `FOK` / 3 | DEMO-800, Белый | Конечное состояние |
| `DEMO-VIN-00005` | `null` | `null` / `null` | DEMO-700, без цвета | Вне очереди и без статуса: проверка `NULL` в плане и перестановке (`NoPosition`) |
| `DEMO-VIN-00006` | 28 | `custom_unknown` / 88 | без модели, Синий | **Неизвестный статус**: UI не должен падать; открытая NCP (пересорт) |

В фикстуре **нет изделий в статусе 4 (Rework)**: экран Rework в демо пуст, пока какое-нибудь изделие не отправят в Rework. В UI кнопка «Отправить в Rework» (экран FOK) появляется только у изделия, заблокированного неустановленной деталью, то есть сначала доведите `DEMO-VIN-00001` до статуса 2 («Завершение»), отсканируйте его на экране FOK и нажмите кнопку. `DEMO-VIN-00003` не заблокирован, поэтому в Rework его можно отправить только прямым вызовом `POST /production-plan/DEMO-VIN-00003/rework`.

Нумерация `seqn` намеренно с «дыркой» (нет 27): перестановка сохраняет набор номеров ([03 §4.3](03-DOMAIN-MODEL.md#43-перестановка-очереди)).

### 2.2. NCP (`ncp.demo.json`)

| Номер | VIN | Станция | Компонент | Кол-во | Тип | Статус | Деталь установлена |
|---|---|---|---|---|---|---|---|
| NC-2026-0001 | `…00001` | 3 | `DEMO-CMP-014` | 1 | Брак | Открыто | нет |
| NC-2026-0002 | `…00001` | 5 | `DEMO-CMP-207` | 1 | Недостача | Открыто | нет |
| NC-2026-0003 | `…00003` | 3 | `DEMO-CMP-031` | 2 | Брак | Закрыто | да |
| NC-2026-0004 | `…00004` | 7 | `DEMO-CMP-112` | 1 | Брак | Закрыто | да |
| NC-2026-0005 | `…00006` | 6 | `DEMO-CMP-088` | 1 | Пересорт | Открыто | нет |

Номера новых заявок продолжают нумерацию (`NC-{год}-{id:D4}`, `id = max+1`).

### 2.3. Справочники

- **Компоненты (8):** `DEMO-CMP-014`, `-031` → станция 3; `-088`, `-510` → станция 6; `-112` → 7; `-207` → 5; `-301` → 9; `-402` → 11. Станций без компонентов (1, 2, 4, 8, 10) в демо нет: на экране «Станции» они серые и без списка.
- **Станции:** фиксированный список `1..11` в коде (`DemoNcpStore.Stations`), не фикстура.
- **Типы NCP:** `Брак`, `Пересорт`, `Недостача`, `Прочее` — константа в коде (`DemoNcpStore.Types`).
- **Модели (3):** `DEMO-700`, `DEMO-800`, `DEMO-1000`. **Цвета (12)**, **комплектации (2)**.
- **Поставщики (3):** `DEMO-SUP-01`, `DEMO-SUP-02` (материнский завод, `isParentPlant=true`), `DEMO-SUP-03`.
- **Нормативы контроля (2):** `DEMO-CMP-014` — 25 %; `DEMO-CMP-402` — фиксированно 2 шт. Для остальных артикулов действует норматив по умолчанию 100 % ([03 §4.8](03-DOMAIN-MODEL.md#48-входной-контроль)).
- **Поставки и коробки:** фикстуры нет; поставки создаются в работе приложения (в Demo — в памяти).

### 2.4. Правила для новых фикстур

Помечайте записи `· ДЕМО` и префиксом `DEMO-`, не вносите реальные VIN, номера двигателей, имена и контрагентов (раздел «Безопасность»: логи и данные не должны содержать реальных идентификаторов). Рецепт добавления новой фикстуры — [05 §12.4](05-BACKEND-GUIDE.md#124-добавить-справочник-фикстуру).

## 3. Защита от PROD

Логика целиком в [`SqlOptions.Create`](../../src/FormulaD.Mes.Api/SqlOptions.cs). Вызывается **только** при `DataSource=Sql`, до регистрации любых SQL-сервисов. **Соединение при проверке не открывается**: проверяется только текст настроек. Принцип — fail-closed: любая неполная или подозрительная настройка = исключение при старте, без отката на Demo и без отката на PROD.

### 3.1. Точная последовательность проверок

| № | Проверка | Условие отказа | Сообщение (суть) |
|---|---|---|---|
| 1 | Флаг тестовой среды | `Sql:IsTestEnvironment` не равен `true` (`GetValue("Sql:IsTestEnvironment", false)`) | «DataSource='Sql' требует явного подтверждения тестовой среды… PROD-подключение этим приложением не поддерживается» |
| 2 | Строка подключения задана | `Sql:ConnectionString` пуста или из пробелов | «Не задана Sql:ConnectionString… в репозитории строк подключения нет» |
| 3 | Разбор строки | `new SqlConnectionStringBuilder(connectionString)` | при синтаксически неверной строке исключение разбора (`ArgumentException`), **не** обёрнутое в своё сообщение |
| 4 | **Запрещённая база** | `Initial Catalog` равен (без учёта регистра) одному из `ForbiddenDatabases = ["FormulaD"]` | «База '…' является рабочей и запрещена. Используйте отдельную обезличенную TEST-базу» |
| 5 | База указана | `Initial Catalog` пуст | «В строке подключения не указана база данных (Initial Catalog)» |
| 6 | **Запрещённый логин** | `User ID` равен (без учёта регистра) одному из `ForbiddenLogins = ["sa", "sa1"]` | «Учётная запись '…' административная. Требуется отдельный TEST-логин только с правом SELECT» |

Порядок важен только для сообщений: сначала проверяется запрещённая база, потом пустая, потом логин. Имена запрещённых баз и логинов — **константы в коде** (`private static readonly string[]`), не конфигурация: изменить их без перекомпиляции нельзя.

Проверки в тестах: [`SqlOptionsTests`](../../tests/FormulaD.Mes.Api.Tests/SqlReaderTests.cs) (`Requires_Explicit_Test_Environment_Marker`, `Requires_Connection_String_From_Secrets`, `Rejects_Prod_Database_And_Admin_Logins`, `Accepts_Test_Instance_And_Forces_ReadOnly_Intent`) и [`ApiTests`](../../tests/FormulaD.Mes.Api.Tests/ApiTests.cs) (`Sql_DataSource_Without_Test_Marker_Fails_Closed`, `Unknown_DataSource_Fails_Closed`).

### 3.2. Что делает код после успешной проверки

1. `ApplicationName = "FormulaD.Mes.Api"`.
2. `ConnectTimeout = min(ConnectTimeout или 5, 15)` секунд.
3. Фиксируется **строка записи** (`WriteConnectionString`): исходная строка с этими двумя правками.
4. Затем к ней добавляется `ApplicationIntent=ReadOnly` и `ApplicationName="FormulaD.Mes.Api (read-only)"` — получается **строка чтения** (`ConnectionString`).
5. `CommandTimeoutSeconds` берётся из `Sql:CommandTimeoutSeconds` (по умолчанию 15).

В лог при старте попадает только имя источника (`Источник данных: Sql`): хост, база и логин не логируются.

### 3.3. Чего эта защита НЕ делает

Важно понимать границы: защита — **проверка текста**, а не гарантия на уровне сервера.

- **Хост не проверяется.** Раньше проверялось имя хоста, это убрано сознательно (комментарий `ponytail:` в `Validate`): тестовая база живёт на том же экземпляре SQL Server, что и PROD. Тест `Accepts_Prod_Host_With_Test_Database` фиксирует: `Server=SQLACCESS;Database=FormulaD_TEST;…` **допускается**. Оставшиеся барьеры — имя базы, логин и флаг.
- **Не проверяются права логина.** Логин с доступом к обеим базам технически мог бы читать `FormulaD`; приложение этого не делает, поскольку не содержит запросов с межбазовыми обращениями и не принимает имя базы из пользовательского ввода. Настоящая гарантия — отдельный TEST-логин без прав на `FormulaD` (см. `sql/create-test-db.sql`), а не код.
- **Интегрированная безопасность.** При `Integrated Security=true` поле `User ID` пустое, проверка `ForbiddenLogins` проходит. Для такого сценария ограничения на административную учётную запись нет.
- **`ApplicationIntent=ReadOnly`** — подсказка маршрутизации (имеет эффект, например, для групп доступности), а не запрет записи. См. [раздел 4](#4-два-подключения-и-права).
- **Имя базы сравнивается как строка** без учёта регистра: `formulad` отклоняется, `FormulaD_TEST` — нет. Любое другое имя, в том числе указывающее на PROD под псевдонимом, код не распознает.

> **Расхождение с README и docs/SECURITY_AND_DEPLOYMENT.md.** README (раздел «Режим SQL») утверждает, что «PROD-хост `SQLACCESS`, база `FormulaD` и админские логины (`sa`, `sa1`) отклоняются на старте». В коде отклоняются **только база и логины**; хост `SQLACCESS` допустим при базе `FormulaD_TEST`.

## 4. Два подключения и права

`SqlOptions` хранит две строки: `ConnectionString` (чтение, `ApplicationIntent=ReadOnly`) и `WriteConnectionString` (запись). **Логин и пароль у них одинаковые** — берутся из единственного `Sql:ConnectionString`. Разделение «читатель/писатель» на уровне прав в коде не реализовано.

Следствия:

- Если в `Sql:ConnectionString` указан логин **только с `SELECT`** (как в `create-test-db.sql`: `mes_reader`, роль `db_datareader`), то чтение работает, а **любая запись падает с ошибкой прав** (переходы статусов, перестановка, NCP, импорт, отметки станций, печать).
- Чтобы запись работала, в строку подключения нужно подставить логин с правами записи — `mes_writer` из [`create-writer-login.sql`](../../sql/create-writer-login.sql) — и тогда он же будет использоваться и для чтения.
- Тестовые фабрики `SqlConfiguredFactory` и `SqlAttemptFactory` используют логин `mes_reader` в примере строки; реально к базе они не подключаются.

> **Расхождение с README.** README утверждает: «Приложение не содержит кода изменения данных; гарантию даёт TEST-логин только с правом `SELECT`». В коде запись есть (`UPDATE`, `INSERT`, `MERGE`, `CREATE TABLE`); при логине `SELECT`-only она не сработает, но это следствие прав, а не отсутствия кода. Описание службы в `deploy/install-service.bat` («read-only») тоже устарело.

Права, которые выдаёт `create-writer-login.sql` (минимально необходимые для текущего кода):

| Объект | Права |
|---|---|
| `tblProductionPlan` | `SELECT`; `UPDATE` колонок `statusid, Status, StartDate, CompleteDate, FOK_date, reworkdate, reworkcompletedate, PrintDate, SEQN`; `INSERT` |
| `tblNCP` | `SELECT`, `INSERT`; `UPDATE` колонок `Status, ClosedBy, ClosedAt, Comment` |
| `tblComponent` | `SELECT`, `INSERT` (добавление артикула из входного контроля) |
| `tblDiscrepancyList` | `SELECT` |
| `tblComponentCheck` | `SELECT`, `INSERT`; `UPDATE` колонок `Checked, CheckedBy, CheckedAt` |
| `tblIncomingSupplier`, `tblInspectionQuota`, `tblIncomingDelivery` | `SELECT`, `INSERT` |
| `tblIncomingPackage` | `SELECT`, `INSERT`; `UPDATE` колонок `Status, ClosedAt, ClosedBy` |
| `tblIncomingPackingRow` | `SELECT`, `INSERT`; `UPDATE` колонок `RequiredQuantity, OkQuantity, DefectQuantity, MismatchQuantity, ShortageQuantity, DiscrepancyReason` |

Скрипт отдельно предупреждает: автосоздаваемые таблицы (`tblComponentCheck`, `tblIncoming*`, `tblInspectionQuota`) создаются приложением, поэтому `GRANT` на них выполняется **после первого запуска**. `CREATE TABLE` требует прав DDL (`db_ddladmin`/`db_owner`), которых у `mes_writer` нет, поэтому первое обращение к этим модулям должно выполняться логином с DDL-правами либо таблицы создаются заранее администратором.

## 5. SQL-режим: таблицы и колонки

### 5.1. Обзор

| Таблица | Происхождение | Читает | Пишет |
|---|---|---|---|
| `dbo.tblProductionPlan` | существующая (схема из AS-IS) | `SqlProductionPlanReader`, `SqlPlanImport` (справочники), все остальные для проверки VIN | `SqlPlanTransitions`, `SqlPlanOrderEditor`, `SqlJobCardPrinter`, `SqlPlanPublisher` |
| `dbo.tblNCP` | существующая | `SqlNcpStore` | `SqlNcpStore` |
| `dbo.tblComponent` | существующая | `SqlNcpStore`, `SqlStationChecks` (проверка кода), `SqlIncomingInspection` | `SqlIncomingInspection` (INSERT нового артикула) |
| `dbo.tblDiscrepancyList` | существующая | `SqlNcpStore` | — |
| `dbo.tblComponentCheck` | **создаётся приложением** | `SqlStationChecks` | `SqlStationChecks` |
| `dbo.tblIncomingSupplier`, `tblInspectionQuota`, `tblIncomingDelivery`, `tblIncomingPackage`, `tblIncomingPackingRow` | **создаются приложением** | `SqlIncomingInspection` | `SqlIncomingInspection` |

Сессии загрузки (импорт плана и Packing List) и журнал событий в SQL **не хранятся** — только память процесса.

### 5.2. `dbo.tblProductionPlan`

**Чтение — белый список колонок** (`ProductionPlanSql.Columns`):
`VIN, ID, SEQN, ModelArticle, ModelName, EngineNumber, Color, SpecificationName, Status, statusid, PrintDate, plannedstartdate, PlannedShipmentDate, StartDate, CompleteDate, FOK_date`.

Соответствие DTO: `statusid → StatusId`, `FOK_date → FokDate`, `plannedstartdate → PlannedStartDate`, `PlannedShipmentDate → PlannedShipmentDate` **и** `PlannedCompleteDate`. Колонки `rv`, `shipment_comments`, `ErrorMessage` в список не входят (тест `Column_Whitelist_Excludes_Rowversion_And_Noise_Columns`).

**Запись:**

| Операция | Колонки |
|---|---|
| Переход статуса | `statusid`, `Status`, плюс одна колонка даты: `StartDate` (запуск), `CompleteDate` (завершение), `FOK_date` (FOK), `reworkdate` (в Rework), `reworkcompletedate` (конец Rework) |
| Перестановка | `SEQN` (в транзакции) |
| Печать | `PrintDate` |
| Публикация импорта | `INSERT` колонок `VIN, SEQN, ModelArticle, ModelName, EngineNumber, Color, SpecificationName, Status, statusid, plannedstartdate, PlannedShipmentDate` (значения `Status='planned'`, `statusid=0`) |

Колонки `reworkdate` и `reworkcompletedate` **пишутся, но не читаются** (в белом списке их нет).

Ключ — `VIN` (`nvarchar(50)`, PK, кластерный индекс). `SEQN` без индекса ([`ProductionPlanSql.OrderBy`](../../src/FormulaD.Mes.Api/ProductionPlanSql.cs), комментарий `ponytail:`).

### 5.3. `dbo.tblNCP` и справочники

Схема NCP известна только по комментарию в `SqlNcpStore.cs` (точная схема не обследована):

| Колонка | Тип / смысл |
|---|---|
| `id` | `int` PK identity |
| `VIN` | `nvarchar(50)`, FK → `tblProductionPlan.VIN` |
| `StationID` | `int` (в реальных данных, по комментарию кода, всегда `NULL`) |
| `ComponentID` | `int`, FK → `tblComponent.id` |
| `Quantity` | `int` |
| `DiscrepancyTypeID` | `int`, FK → `tblDiscrepancyList.id` |
| `Comment` | `nvarchar(50)` |
| `Status` | `int`: `1` — открыто, `2` — закрыто |
| `CreatedBy`, `CreatedAt`, `ClosedBy`, `ClosedAt` | кто и когда |

Справочники: `tblComponent(id, ComponentCode, ComponentName, StationID)`, `tblDiscrepancyList(id, discrepancy)`. Запрос списка NCP использует `LEFT JOIN` на оба. Номер заявки в SQL — вычисляемый `NC-{id}`.

Станции в SQL: `SELECT DISTINCT CAST([StationID] AS NVARCHAR(10)) FROM [dbo].[tblComponent] WHERE [StationID] IS NOT NULL`; пусто → запасной список `1..11`.

> `SqlIncomingInspection.GetComponentsAsync` читает из `tblComponent` колонку **`[Station]`**, а `SqlNcpStore` — **`[StationID]`**. Одна из выборок, вероятно, неверна (не подтверждено кодом, какая именно): сверьте со схемой TEST (`inspect-schemas.sql`).

### 5.4. Таблицы, которые создаёт приложение

`tblComponentCheck` (`SqlStationChecks.EnsureTableAsync`): `id int identity PK`, `VIN nvarchar(50)`, `ComponentCode nvarchar(50)`, `Checked bit`, `CheckedBy nvarchar(50) NULL`, `CheckedAt datetime NULL`, `UNIQUE(VIN, ComponentCode)`. Запись — `MERGE` (upsert одной строки).

Входной контроль (`SqlIncomingInspection.EnsureTablesAsync`, один пакет `IF OBJECT_ID … CREATE TABLE`):

| Таблица | Колонки |
|---|---|
| `tblIncomingSupplier` | `Code nvarchar(50) PK`, `Name nvarchar(200)`, `IsParentPlant bit` |
| `tblInspectionQuota` | `ComponentCode nvarchar(50) PK`, `Percent int NULL`, `FixedCount int NULL` |
| `tblIncomingDelivery` | `Id nvarchar(32) PK`, `SupplierCode`, `SupplierName`, `InvoiceNumber nvarchar(100)`, `InvoiceDate datetime`, `AccompanyingDocument nvarchar(200) NULL`, `CreatedAt`, `CreatedBy` |
| `tblIncomingPackage` | `Id int identity PK`, `DeliveryId` FK → `tblIncomingDelivery`, `HuNumber nvarchar(100)`, `Status nvarchar(20)` (`Open`/`Closed`, по умолчанию `Open`), `ClosedAt`, `ClosedBy` |
| `tblIncomingPackingRow` | `Id int identity PK`, `PackageId` FK → `tblIncomingPackage`, `ComponentCode`, `ComponentName`, `PlannedQuantity int`, `NetWeight`/`GrossWeight decimal(18,4) NULL`, `Batch nvarchar(100) NULL`, `RequiredQuantity int`, `OkQuantity`/`DefectQuantity`/`MismatchQuantity`/`ShortageQuantity int` (по умолчанию 0), `DiscrepancyReason nvarchar(500) NULL` |

Таблицы поставщиков и нормативов в SQL изначально **пусты**: наполнять `INSERT`ом (UI справочников нет; экран «Администрирование» только читает). Пока таблица поставщиков пуста, создать поставку нельзя (`SupplierNotFound`).

### 5.5. Справочники импорта плана в SQL

`SqlPlanImport.GetReferenceAsync` выбирает **`SELECT DISTINCT`** из `tblProductionPlan`: модели (`ModelArticle`, `ModelName`), цвета, комплектации (непустые). Отдельных таблиц справочников нет: допустимыми становятся значения, которые уже встречаются в плане, и список растёт вместе с данными (комментарий `ponytail:`). Следствие: **новую модель или цвет через импорт добавить нельзя** — они отклоняются как «отсутствует в справочнике».

## 6. Как строятся запросы

Правила (комментарий в `ProductionPlanSql.cs`, проверяются тестами `ProductionPlanSqlTests`):

1. **Явный белый список колонок**, никакого `SELECT *`.
2. **Только параметры**; значения пользователя в текст запроса не подставляются. Исключение по форме, но не по смыслу: имя колонки даты в `SqlPlanTransitions.TransitionAsync` подставляется из строковых литералов внутри кода, не из ввода.
3. **Без `NOLOCK`**: «грязные» состояния плана опасны.
4. **Пагинация** `OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`, `@offset = (page - 1) * pageSize`.
5. **Общее число строк** тем же запросом — `COUNT(*) OVER() AS [TotalRows]` (без второго обращения к базе).
6. **Сортировка** плана: `CASE WHEN [SEQN] IS NULL THEN 1 ELSE 0 END, [SEQN] ASC, [VIN] ASC` — строки без порядка в конец, `VIN` — устойчивый разрыв ничьей. Сортировка NCP: `CreatedAt DESC, id DESC`.
7. **Фильтры собираются фиксированными фрагментами** (`ProductionPlanSql.Page(filterByVin, filterByStatus, statusIsNull, filterByStatusId)`), а не конкатенацией условий пользователя:
   - по VIN — `[VIN] LIKE @vin ESCAPE '\'`;
   - по строковому статусу — `[Status] = @status` или `[Status] IS NULL` (пустая строка);
   - по числовому — `[statusid] = @statusId`.
8. **Поиск по VIN** (`VinSearch.IsSuffixSearch`): только цифры → шаблон `'%' + escaped` (по концу, **скан таблицы**, принятое решение: ручной ввод редкий); иначе `escaped + '%'` (по началу, префиксный `LIKE` использует кластерный индекс по `VIN`, путь сканера). Спецсимволы `\`, `%`, `_`, `[` экранируются (`ProductionPlanSql.Escape`), так что `%` из ввода не становится маской. Параметр `@vin` — `NVARCHAR(101)`. Апгрейд для быстрого поиска по хвосту — вычисляемая колонка `REVERSE(VIN)` с индексом (это изменение схемы; нужна согласованная миграция на TEST).
9. **Карточка по VIN** — `WHERE [VIN] = @vin` (точное совпадение по PK).
10. **Статусы** — `SELECT DISTINCT [Status] … ORDER BY [Status]`.
11. Таймаут команды — `Sql:CommandTimeoutSeconds`.

Записи:

- Переход: `UPDATE … SET statusid, Status, <дата> = @now WHERE [VIN] = @vin AND [statusid] = @fromStatusId` — условие по исходному статусу делает переход атомарным; если затронуто 0 строк, повторным чтением определяется `VinNotFound` или `WrongStatus`.
- Перестановка и публикация — транзакция (`BeginTransactionAsync`), откат при исключении.
- Дата — `DateTime.Now` приложения (не `GETDATE()` сервера).

## 7. Скрипты `sql/`

Все скрипты запускает **человек** (SSMS/sqlcmd) с нужными правами. Приложение их не выполняет и не читает.

| Файл | Строк | Назначение | Где и кем | Предупреждения |
|---|---|---|---|---|
| [`create-test-db.sql`](../../sql/create-test-db.sql) | 90 | Создаёт `FormulaD_TEST`, логин и пользователя `mes_reader` (роль `db_datareader`), копирует схему и данные `tblProductionPlan` из `FormulaD`, печатает пример строки запуска | на экземпляре PROD под логином с правами `CREATE DATABASE/LOGIN` | **Содержит открытый пароль логина и печатает его в строке подключения** (значение здесь не приводится). Это нарушает правило «секретов в репозитории нет»: пароль нужно сменить и вынести из скрипта. Копирует **реальные данные** PROD (не обезличенные) |
| [`copy-prod-to-test.sql`](../../sql/copy-prod-to-test.sql) | 353 | Полная копия `FormulaD → FormulaD_TEST` (схема всех таблиц и данные), затем PK | sysadmin/db_owner обеих баз | Читает из PROD, **пишет только в TEST** (`DELETE FROM [FormulaD_TEST]…` перед вставкой; шапка говорит «TRUNCATE», код делает `DELETE`). Копирует реальные производственные данные, а раздел безопасности требует «обезличенную/синтетическую» TEST-базу |
| [`export-schema-from-prod.sql`](../../sql/export-schema-from-prod.sql) | 326 | Печатает DDL всех пользовательских таблиц PROD (только метаданные) для создания их на TEST | под логином с `SELECT` на системные представления PROD | Только чтение метаданных; содержит `USE [FormulaD]` — это скрипт администратора, а не код приложения |
| [`create-writer-login.sql`](../../sql/create-writer-login.sql) | 69 | Логин `mes_writer` на TEST и минимальные `GRANT` для текущего кода (таблица в [разделе 4](#4-два-подключения-и-права)) | sysadmin на TEST | Пароль в скрипте — заглушка `CHANGE_ME`, **заменить перед запуском**; права на автосоздаваемые таблицы выдавать после первого запуска приложения |
| [`inspect-schemas.sql`](../../sql/inspect-schemas.sql) | 99 | Снимает колонки, FK и т. д. таблиц `tblNCP, tblComponent, tblConnections, tblStation, tblImportplan, tblPlanTemp, tblPL_Lines, tblSupplier(s), tblInspection, tblCrippleRecord` для проектирования SQL-реализаций | на `FormulaD_TEST` любым логином с `SELECT` | Только чтение. Результат нужен, чтобы сверить схемы, описанные в комментариях кода как «не обследованные» |
| [`readonly_templates.sql`](../../sql/readonly_templates.sql) | 28 | Исторические шаблоны трёх `SELECT` (карточка, страница, статусы) | справочно | **Устарел**: сортирует по `VIN`, а не по `SEQN`, и не содержит ряда нынешних колонок. Источник правды — `ProductionPlanSql.cs` |

> Эти скрипты — единственное место в репозитории, где фигурирует `[FormulaD]` как источник данных, и это допустимо только потому, что их запускает администратор вручную. **Приложение к `FormulaD` не подключается.**

## 8. Соответствие docs/DB_CONTRACT.md и кода

[`../DB_CONTRACT.md`](../DB_CONTRACT.md) описывает «только чтение» и колонки `tblProductionPlan`, подтверждённые метаданными.

| Пункт DB_CONTRACT | Что в коде |
|---|---|
| Типы и nullable колонок `tblProductionPlan` | Маппер `SqlProductionPlanReader.Map` читает nullable-колонки через `IsDBNull`; `VIN` и `ID` — обязательные (`GetString`, `GetInt32`) |
| `SEQN` — «возможно, после проверки» | Используется: порядок плана и перестановка |
| `SpecificationName` — «возможно» | Читается |
| `PrintDate` — «нет» | **Читается и пишется** (печать JobCard) |
| `plannedstartdate` — «необязательно» | Читается; вставляется при импорте |
| `reworkdate`, `reworkcompletedate` — «нет» | **Пишутся** при переходах Rework (не читаются) |
| `Status`, `statusid` | Читаются; пишутся при переходах |
| `FOK_date`, `StartDate`, `CompleteDate`, `PlannedShipmentDate` | Читаются; первые три пишутся при переходах |
| Не использовать `NOLOCK`, не `SELECT *`, параметры, пагинация 1..100 | Соблюдено (тесты `ProductionPlanSqlTests`) |
| «Не делать JOIN на `tblQC_Products`» | Не нарушено: таких JOIN нет |
| «`tblNCP` пока не выводим» | **Устарело:** NCP читаются и пишутся (`SqlNcpStore`) |
| «Отдельный TEST login только с SELECT… запись технически невозможна» | **Не выполняется архитектурно:** код содержит запись; невозможность записи обеспечивается только правами логина ([раздел 4](#4-два-подключения-и-права)) |
| «`NEWSEQN`, `shipmentdate`, `validationdate`, `ValidationStatus`, `ErrorMessage`, `rv`, `Specification_id`, `ColorID`» | В коде не используются |
| «`tblImportplan` и `tblPlanTemp` — реальные общие SQL-таблицы» | Код их не использует: импорт хранит сессии в памяти и публикует напрямую в `tblProductionPlan` |

## 9. Ограничения TEST-режима

1. Только база `FormulaD_TEST` (или иная, не называющаяся `FormulaD`), только не-`sa`/`sa1` логин, обязательный `Sql:IsTestEnvironment=true`.
2. Запись возможна только с логином, которому выданы права ([раздел 4](#4-два-подключения-и-права)); при `SELECT`-only логине — только чтение.
3. Журнал событий, сессии импорта и Packing List — в памяти: после перезапуска исчезают.
4. NCP: нет признака «деталь установлена» и отдельного комментария инженера ([03 §6.1](03-DOMAIN-MODEL.md#61-ncp-признак-установки-детали)).
5. `PlannedCompleteDate` читается из `PlannedShipmentDate` и при импорте не сохраняется ([03 §6.4](03-DOMAIN-MODEL.md#64-дата-план-завершения)).
6. Справочники импорта — только значения, уже встречающиеся в плане.
7. Таблицы входного контроля и отметок станций создаются приложением и требуют DDL-прав при первом обращении; поставщики и нормативы нужно заводить вручную.
8. Литерал `Status='rework'` для реальной базы не подтверждён.
9. Часовые пояса: `datetime` без зоны, время записи — часы машины приложения.
10. Нет автотестов SQL-реализаций против живой базы; проверка только вручную на TEST.

## 10. Как включить SQL-режим на TEST

Только на отдельной тестовой базе, и только если администратор подтвердил, что она не PROD. Значения в `<…>` вводите вручную; в файлы репозитория их **не записывайте**.

1. **База и логин** (делает администратор): создать `FormulaD_TEST` и логин **без прав на `FormulaD`**. Скрипты `create-test-db.sql` и `create-writer-login.sql` — основа, но пароли в них нужно заменить.
2. **Секреты** (на машине разработчика, не в git):
   ```bash
   dotnet user-secrets set "Sql:ConnectionString" \
     "Server=<test-host>;Database=FormulaD_TEST;User ID=<login>;Password=<password>;Encrypt=True" \
     --project src/FormulaD.Mes.Api
   dotnet user-secrets set "DevAuth:Password" "<локальный пароль>" --project src/FormulaD.Mes.Api
   ```
3. **Запуск:**
   ```bash
   cd src/FormulaD.Mes.Api
   DataSource=Sql Sql__IsTestEnvironment=true \
   DevAuth__Enabled=true DevAuth__Username=demo-operator \
   ASPNETCORE_ENVIRONMENT=Development dotnet run
   ```
   В логе должно быть `Источник данных: Sql`. Если проверка не пройдена, приложение не стартует и сообщение укажет, какое условие нарушено ([раздел 3.1](#31-точная-последовательность-проверок)).
4. **Первые обращения** к станциям и входному контролю создадут таблицы (нужны DDL-права). После этого выдайте `GRANT` на них из `create-writer-login.sql`.
5. **Проверка:** `GET /api/v1/production-plan` возвращает строки TEST; сравните с Access на контрольных обезличенных примерах (раздел «Следующий этап TEST» документа `SECURITY_AND_DEPLOYMENT.md`).
6. **Перед записью** убедитесь, что логин в `Sql:ConnectionString` — именно тестовый логин с нужными правами: любая операция записи (переход статуса, перестановка, NCP, импорт) изменит реальные строки TEST.
