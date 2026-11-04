# 14. Матрица трассируемости: требование → реализация → тест

| | |
|---|---|
| **Назначение** | Показать, какие требования ТЗ ([`../SPECIFICATION.md`](../SPECIFICATION.md), 31 раздел, 36 открытых вопросов, 30 критериев приёмки AT-01…AT-30) реально реализованы в коде, где именно, и чем это проверено. |
| **Для кого** | Веб-разработчик/архитектор, который берёт систему в доработку и должен понять, что уже сделано, а что нет; тестировщик; РП при приёмке. |
| **Проверено по коммиту** | `fc6f055` (ветка `claude/new-session-bizv59`) |
| **Источник правды** | Код (`src/FormulaD.Mes.Api/*.cs`, `apps/web/src/*.tsx`) и тесты (`tests/FormulaD.Mes.Api.Tests/*.cs`, `apps/web/src/*.test.tsx`). Самоотчёты в `docs/IMPLEMENTATION_REPORT.md` и `docs/DEVELOPMENT_PLAN.md` **не** использовались как доказательство. |
| **Что не делалось** | Тесты и сборка не запускались при составлении документа; статус «покрыто тестом» означает «тест с таким именем существует в репозитории», а не «тест сейчас зелёный». Работа против реального SQL Server не проверялась (его нет в среде) — всё, что касается SQL-режима, помечено отдельно. |

## Оглавление

1. [Как читать](#1-как-читать)
2. [Матрица по разделам ТЗ (1–28)](#2-матрица-по-разделам-тз-128)
3. [Критерии приёмки AT-01…AT-30](#3-критерии-приёмки-at-01at-30)
4. [Как код отвечает на открытые вопросы (В-xx)](#4-как-код-отвечает-на-открытые-вопросы-в-xx)
5. [Реализовано, но нет в спецификации](#5-реализовано-но-нет-в-спецификации)
6. [Расхождения кода со спецификацией](#6-расхождения-кода-со-спецификацией)
7. [Сводная статистика](#7-сводная-статистика)

Связанные документы справочника: [03-DOMAIN-MODEL](03-DOMAIN-MODEL.md) (статусы, правила), [04-API-REFERENCE](04-API-REFERENCE.md) (эндпоинты), [05-BACKEND-GUIDE](05-BACKEND-GUIDE.md), [06-DATA-AND-SQL](06-DATA-AND-SQL.md), [07-FRONTEND-GUIDE](07-FRONTEND-GUIDE.md), [15-LEGACY-DOCS-MAP](15-LEGACY-DOCS-MAP.md).

## 1. Как читать

**Статусы**

| Статус | Значение |
|---|---|
| **Реализовано** | Поведение есть в коде и отражено в UI; для основного сценария есть тест |
| **Частично** | Есть часть требования; чего именно нет — в примечании |
| **Не реализовано** | В коде нет |
| **Вне MVP** | В самой спецификации помечено **[Б]** (будущий этап) или явно решено не делать (решение РП, см. [раздел 6](#6-расхождения-кода-со-спецификацией)) |
| **Неясно** | Спецификация не даёт проверяемого требования или код не позволяет это подтвердить |

Пометки ТЗ: **[С]** согласовано, **[П]** проектная рекомендация, **[В-xx]** открытый вопрос, **[Б]** будущий этап.

**Два режима данных.** Приложение работает в `DataSource=Demo` (данные в памяти, из `fixtures/*.json`) или `DataSource=Sql` (только отдельная TEST-база, см. [06-DATA-AND-SQL](06-DATA-AND-SQL.md)). Если не сказано иное, «реализовано» значит «в Demo». Для SQL-режима в столбце «Код» указан `Sql*.cs`, но он **ни разу не выполнялся против живого SQL Server** (подтверждено в `docs/IMPLEMENTATION_REPORT.md`, п. 6.1; в среде составления документа SQL Server нет).

**Сокращения путей.** Бэкенд — `src/FormulaD.Mes.Api/` (далее `Api/`), фронтенд — `apps/web/src/` (далее `web/`), тесты бэкенда — `tests/FormulaD.Mes.Api.Tests/` (далее `T/`). Тесты фронтенда лежат рядом с экранами (`web/*.test.tsx`).

## 2. Матрица по разделам ТЗ (1–28)

### Раздел 1. Назначение, границы, потоки

| № | Требование | Статус | Код | Тест | Примечание |
|---|---|---|---|---|---|
| 1.1 | Поток 1: план из Excel-выгрузки 1С или вставкой из Excel | Частично | `web/ImportScreen.tsx`, `web/importParse.ts` (`parseDelimitedRows`) | `web/ImportScreen.test.tsx` «вставка диапазона и проверка…» | Файл — только CSV/TSV (`.xlsx` не разбирается: пакет `xlsx` отклонён из-за уязвимостей). Вставка диапазона из Excel работает |
| 1.2 | Поток 2: проверка/исправление во временной области, управление последовательностью, перенос в основной план | Частично | `Api/PlanImport.cs` (`DemoPlanImport`), `Api/SqlPlanImport.cs`, `Api/SqlPlanPublisher.cs` | `T/PlanImportTests.cs` | Временная область — словарь сессий **в памяти процесса** даже в SQL-режиме (`SqlPlanImport._sessions`); перестановки строк «Поднять/Опустить» во временном списке нет (см. раздел 7) |
| 1.3 | Поток 3: печать индивидуальных и групповых JobCard с QR | Реализовано | `web/JobCard.tsx`, `web/JobCardDialog.tsx`, `web/Qr.tsx`, `Api/Program.cs` (`POST /production-plan/{vin}/print`) | `web/JobCardDialog.test.tsx`, `web/PlanScreen.test.tsx`, `T/JobCardPrintTests.cs` | Макет бланка не согласован (раздел 8, В-12); в бланке нет списка операций по станциям, который есть в бумажной «Карте сборки» (см. `docs/PRINTED_CARDS.md`) |
| 1.4 | Поток 4: скан JobCard для запуска, станций, завершения, FOK | Реализовано | `web/ScanTransitionScreen.tsx` (Старт/Завершение/Rework), `web/FokScreen.tsx`, `web/StationScreen.tsx` | `web/StartScreen.test.tsx`, `web/FokScreen.test.tsx`, `web/StationScreen.test.tsx` | QR кодирует **VIN** (`Qr value={item.vin}`); сканер работает как клавиатура |
| 1.5 | Поток 5: контроль комплектующих, отметки операций, брак/пересорт/недостача | Реализовано | `Api/StationChecks.cs`, `Api/Ncp.cs`, `web/StationScreen.tsx`, `web/NcpScreen.tsx` | `T/StationChecksTests.cs`, `T/NcpTests.cs` | — |
| 1.6 | Поток 6: NCP-листы (на деталь и сводный), работа с незакрытыми позициями и Rework | Реализовано | `web/NcpSheet.tsx`, `web/NcpSummarySheet.tsx`, `web/NcpPrintDialog.tsx`, `web/ReworkScreen.tsx` | `web/NcpScreen.test.tsx` «печать NCP-листа…», `web/PlanScreen.test.tsx` «карточка изделия открывает печать сводного NCP-листа», `web/ReworkScreen.test.tsx` | Печать — через системный диалог браузера; принтеры/копии не настраиваются (В-21) |
| 1.7 | Поток 7: поставки, Packing List, проверка упаковок с нормативом, результат и закрытие | Частично | `Api/IncomingInspection.cs`, `Api/SqlIncomingInspection.cs`, `web/IncomingInspectionScreen.tsx`, `web/PackageDialog.tsx` | `T/IncomingInspectionTests.cs`, `web/IncomingInspectionScreen.test.tsx` | Результат вводится вручную (список «OK/Брак/Пересорт/Недостача» + количество); **сканирования артикула «первый скан — жёлтый, второй — OK» нет** (см. раздел 21) |
| 1.8 | Поток 8: учёт инспектора/оператора, времени и хода проверки; операционные представления и печатные формы | Частично | `Api/EventLog.cs`, поля `CreatedBy`/`ClosedBy`/`CheckedBy` в `Api/Ncp.cs`, `Api/StationChecks.cs` | `T/EventLogTests.cs` | Журнал событий хранится **в памяти** (`InMemoryEventLog`) даже в SQL-режиме и **не имеет эндпоинта чтения/экрана**; идентификатор — имя из dev-входа |
| 1.9 | Цех: минимум действий, работа со сканером, крупные индикаторы, **визуальные и звуковые** подтверждения | Частично | Фокус на поле скана: `web/ScanTransitionScreen.tsx`, `web/FokScreen.tsx` | `web/StartScreen.test.tsx` | Визуальные подтверждения есть. **Звука нет вообще** (в `web/` нет `Audio`/звуковых файлов). Сенсорный ввод и большой экран не прорабатывались (`docs/IMPLEMENTATION_REPORT.md`, п. 6.8) |
| 1.10 | [Б] Red Table/Green Table как процесс, автоматические решения по браку, генерация VIN в MES | Вне MVP | — | — | Помечено [Б] в ТЗ; сохранены данные (NCP, `PartInstalled`) |

### Раздел 2. Производственная структура и рабочие места

| № | Требование | Статус | Код | Тест | Примечание |
|---|---|---|---|---|---|
| 2.1 | 11 станций (СТ1–СТ11), не зашивать «10» | Реализовано | Demo: `Api/Ncp.cs` `DemoNcpStore.Stations` = `"1".."11"`; SQL: `Api/SqlNcpStore.cs` `GetStationsAsync` (`SELECT DISTINCT StationID FROM tblComponent`) | `T/NcpTests.cs` `Types_And_Stations_Are_Fixed_Lists` | В Demo список зашит константой (не «данные», как просит [П] 2.3); в SQL — из справочника компонентов |
| 2.2 | Экран участка: станции, местоположение, состояние проверок; отметки с исполнителем и временем | Реализовано | `web/StationScreen.tsx`, `Api/StationChecks.cs` (`ComponentCheck.CheckedBy/CheckedAt`) | `web/StationScreen.test.tsx`, `T/StationChecksTests.cs` | Нет разделения «какой набор станций открыт на каком рабочем месте» (В-02) |
| 2.3 | [П] Станции, участки, очерёдность, позиции ОТК — как данные, не константы | Частично | см. 2.1 | — | Только список станций; участков, очерёдности и ОТК-позиций как данных нет |
| 2.4 | [П] Топология СТ1–СТ4 → ОТК → СТ5–СТ7 → ОТК → … → FOK | Не реализовано | — | — | Лента на FOK (`web/FokScreen.tsx`, `routeSteps`) рисует станции и шаг FOK, но ОТК-точек нет; **все станции захардкожены состоянием `done`** независимо от реальных отметок — см. [раздел 6](#6-расхождения-кода-со-спецификацией) |

### Раздел 3. Роли и участники

| № | Требование | Статус | Код | Тест | Примечание |
|---|---|---|---|---|---|
| 3.1 | Система фиксирует идентификатор пользователя и время действий | Частично | `user.Identity?.Name` в `Api/Program.cs`; `EventLogEntry.UserName/OccurredAt` | `T/EventLogTests.cs`, `T/LifecycleTests.cs` `Auth_Me_Returns_Current_User` | Пользователь — один dev-логин; персональных учёток нет |
| 3.2 | Закрывать NCP в Rework может любой пользователь с доступом к окну | Реализовано | `POST /ncp/{id}/close` без проверки ролей (`Api/Program.cs`) | `T/NcpTests.cs` `Close_Sets_Status_And_Engineer_Comment_Without_Requiring_Part_Installed` | Ограничений «только начальник ОТК» нет — как и требует ТЗ |
| 3.3 | [П] Матрица разрешений (планирование/цех/ОТК/склад/Rework/админ) | Не реализовано | — | — | Ролевой модели нет; все авторизованные видят и делают всё (В-04). Авторизация — только dev (`DevAuth`, cookie `formulad.mes.session`, 8 ч, loopback) |
| 3.4 | Персональный QR инспектора в контрольных точках | Не реализовано | — | — | Сущности «инспектор» нет (см. раздел 12) |

### Раздел 4. Данные изделия и идентификаторы

| № | Требование | Статус | Код | Тест | Примечание |
|---|---|---|---|---|---|
| 4.1 | Изделие — в `tblProductionPlan`, без дублирующей таблицы; VIN — ключ | Реализовано | `Api/Models.cs` `ProductionPlanItem`; `Api/ProductionPlanSql.cs`; `Api/SqlProductionPlanReader.cs` | `T/ApiTests.cs` `Card_By_Vin_And_404`, `T/SqlReaderTests.cs` | В SQL-режиме запросы идут к `[dbo].[tblProductionPlan]` |
| 4.2 | Различать производственный номер, VIN, номер двигателя, номер шасси | Частично | `ProductionPlanItem.Id`, `.Vin`, `.EngineNumber`; JobCard показывает «Производственный номер» = `Id` | `web/JobCardDialog.test.tsx` | **Номера шасси нет** ни в модели, ни в UI. Производственный номер — поле `ID` таблицы, генерации в MES нет (В-05, В-10) |
| 4.3 | `rowversion` для конкурентных изменений | Не реализовано | — | `T/SqlReaderTests.cs` `Column_Whitelist_Excludes_Rowversion_And_Noise_Columns` (подтверждает, что колонка **исключена**) | Защиты от потерянных обновлений нет (AT-30) |
| 4.4 | Постепенное сосуществование Access и веб-интерфейса на общей БД | Неясно | `Api/SqlOptions.cs`, `Api/Sql*.cs`, `sql/*.sql` | `T/SqlReaderTests.cs` (конфигурация, тексты запросов) | Код к общей TEST-базе подключается, но совместимость с Access на живой БД не проверялась |

### Раздел 5. Статусы 0–4 и переходы

| № | Требование | Статус | Код | Тест | Примечание |
|---|---|---|---|---|---|
| 5.1 | Статусы 0–4 с названиями; неизвестные значения не ломают UI | Реализовано | `web/format.ts` (`statusCodeLabel`, `statusBadge`, `rowState`) | `web/format.test.ts` «классифицирует известный статус и сохраняет оригинал неизвестного», `T/ApiTests.cs` `Statuses_Include_Null_From_Source` | Названия в UI: «Запланировано», «В работе», «Производство завершено», «FOK пройден», «Rework» |
| 5.2 | Запуск ищет только 0, завершение — только 1, FOK — только 2; ошибочный статус не проходит | Реализовано | `IPlanTransitions` (`Api/PlanTransitions.cs`, `Api/DemoProductionPlanReader.cs`, `Api/SqlPlanTransitions.cs`: `UPDATE … WHERE statusid = @from`) | `T/StartTests.cs` `Start_Rejects_Items_Not_In_Status_0`, `T/CompleteTests.cs` `Complete_Rejects_Items_Not_In_Status_1`, `T/FokTests.cs` `Fok_Rejects_Items_Not_In_Status_2` | Ответ — `400` ProblemDetails с понятным текстом |
| 5.3 | Rework: `2 → 4`, затем `4 → 2` вручную; `4 → 3` автоматически нельзя | Реализовано | `POST /production-plan/{vin}/rework`, `…/rework/finish` | `T/ReworkTests.cs` (все), `T/LifecycleTests.cs` `Rework_Then_Fok_Works` | Прямого `1 → 4` нет (В-07 решено как `2 → 4`) |
| 5.4 | NCP сам по себе ≠ неустановленная деталь; Final OK недоступен при неустановленной обязательной детали; красный знак на экранах | Частично | `INcpReader.GetMissingRequiredPartsAsync` (`Api/Ncp.cs`, `Api/SqlNcpStore.cs`); бейдж `ncp-missing` в `web/NcpDetails.tsx`, `web/NcpScreen.tsx` | `T/FokTests.cs` `Fok_Is_Blocked_By_Missing_Part_…`, `T/NcpTests.cs` `PartInstalled_Is_Separate_From_Status` | Блокировка есть. **Красный знак показывается только на экранах NCP, FOK, Rework и Станции**; в таблице плана и карточке изделия (`web/ProductCard.tsx`) его нет. В **SQL-режиме** признака `PartInstalled` в схеме нет: блокирует любая открытая NCP (`Status = 1`) — см. раздел 6 |

### Раздел 6. Загрузка производственного плана

| № | Требование | Статус | Код | Тест | Примечание |
|---|---|---|---|---|---|
| 6.1a | Два равноправных способа: файл и вставка диапазона | Частично | `web/ImportScreen.tsx` (`handleFile`, поле вставки), `web/importParse.ts` | `web/ImportScreen.test.tsx` | Файл — только CSV/TSV |
| 6.1b | Данные сначала во временную область; прямой публикации нет | Реализовано | `POST /plan-import/sessions` → `IPlanImport.StageAsync` | `T/PlanImportTests.cs` `Valid_Row_Stages_Without_Errors` | Область — словарь в памяти (`DemoPlanImport`, `SqlPlanImport`); физической `production_plan_temp` нет |
| 6.1c | [П] Сессия импорта: номер, пользователь, источник, счётчики | Частично | `ImportSession(CreatedBy, Source, …)` в `Api/PlanImport.cs` | `T/PlanImportTests.cs` | Номер сессии, автор, источник (`file`/`paste`) есть; времени создания и счётчиков принятых/ошибочных в модели не выявлено (не подтверждено кодом) |
| 6.2a | Проверки: VIN, длина VIN, двигатель и длина, цвет, комплектация, обязательные поля | Реализовано | `Api/PlanImport.cs` (проверки в строках ~237–312) | `T/PlanImportTests.cs` `Missing_Vin_Is_Reported`, `Unknown_Color_Model_And_Bad_Date_Are_Reported` | «Длина» проверяется только как «не длиннее 50» — точные длины в ТЗ не заданы (В-06). Проверяется также модель по справочнику и разбор дат |
| 6.2b | Для каждой ошибочной строки — **все** ошибки текстом; подсветка | Реализовано | `ImportRowResult.Errors` (список), `web/ImportScreen.tsx` (подсветка `import-row-error`) | `T/PlanImportTests.cs`, `web/ImportScreen.test.tsx` «строка с ошибками подсвечена, ошибки перечислены…» | — |
| 6.2c | Исправление в строке или через справочник + автоперепроверка | Реализовано | `PUT /plan-import/sessions/{id}/rows/{n}`; выпадающие списки справочников в `web/ImportScreen.tsx` | `T/PlanImportTests.cs` `Edit_Row_Fixes_Error_And_Revalidates`, `web/ImportScreen.test.tsx` «исправление строки через выпадающий список…» | Добавления значения прямо в справочник из импорта нет (только выбор существующего) |
| 6.2d | [П] Дубли в загрузке, конфликт с планом, недопустимые форматы | Реализовано | `Api/PlanImport.cs` («VIN повторяется в этой загрузке», «VIN уже есть в производственном плане», «Номер двигателя повторяется…») | `T/PlanImportTests.cs` `Existing_Vin_Is_An_Error_Not_An_Update`, `Duplicate_Vin_Within_Batch_Is_Reported_On_Both_Rows` | Совместимость пар «модель–комплектация–цвет» не проверяется |
| 6.3a | Кнопка «Загрузить производственный план» доступна только при нуле ошибок | Реализовано | `web/ImportScreen.tsx` (кнопка), `IPlanImport.PublishAsync` | `T/PlanImportTests.cs` `Publish_Is_Blocked_While_Errors_Remain`, `web/ImportScreen.test.tsx` | — |
| 6.3b | Строки добавляются в конец очереди с сохранением порядка; показать число и время | Частично | `IPlanPublisher.PublishAsync` (`Api/DemoProductionPlanReader.cs`, `Api/SqlPlanPublisher.cs`) | `T/PlanImportTests.cs` `Publish_Appends_To_End_Of_Queue_And_Prevents_Double_Publish`, `web/ImportScreen.test.tsx` «публикация без ошибок…» | Добавление в конец и число — есть. **Визуального выделения новых строк и показа времени загрузки** подтвердить по коду не удалось |
| 6.3c | [П] Перенос одной транзакцией; повторное нажатие не создаёт дублей | Реализовано | `SqlPlanPublisher` (`BeginTransactionAsync`); защита от повторной публикации сессии | `T/PlanImportTests.cs` `…Prevents_Double_Publish` | Транзакция проверена только чтением кода |

### Раздел 7. Изменение порядка выпуска

| № | Требование | Статус | Код | Тест | Примечание |
|---|---|---|---|---|---|
| 7.1 | Во временном плане — «Поднять»/«Опустить» | Не реализовано | — | — | В `web/ImportScreen.tsx` управления порядком строк нет |
| 7.2 | В основном плане режим «Редактировать последовательность»: шаг вверх/вниз и ввод номера позиции, без дублей номеров | Реализовано | `web/PlanScreen.tsx` (режим «Изменить порядок», стрелки, `Alt+↑/↓`, `F2`), `web/MoveDialog.tsx`, `POST /production-plan/{vin}/move` (`IPlanOrderEditor`: `DemoProductionPlanReader.MoveAsync`, `SqlPlanOrderEditor`) | `T/ApiTests.cs` `Move_Up_Swaps_With_Neighbour_And_Keeps_Numbering`, `Move_Far_Shifts_Whole_Range` | Название режима — «Изменить порядок» |
| 7.3 | Завершение двумя явными действиями «Сохранить новую последовательность» / «Отменить изменение» (откат к состоянию на входе) | Вне MVP | — | — | **Осознанное решение РП 27.10.2026**: остаётся немедленное сохранение каждого шага (`docs/SPEC_GAP_ANALYSIS.md`, `docs/REORDER_DESIGN.md`). Это отступление от [С] раздела 7 |
| 7.4 | [П] Защита от конфликтующих перестановок (версия плана) | Не реализовано | — | — | Нет rowversion (см. 4.3) |
| 7.5 | [В-11] Ограничения по статусам перестановки | Неясно | `MoveAsync` не проверяет статус | `T/ApiTests.cs` `Move_Rejects_Bad_Input` | Перемещать можно изделие **любого статуса**, лишь бы у него была позиция (`Seqn`) |

### Раздел 8. JobCard и групповая печать

| № | Требование | Статус | Код | Тест | Примечание |
|---|---|---|---|---|---|
| 8.1 | Двойной щелчок по строке открывает JobCard с QR | Реализовано | `web/PlanScreen.tsx` (`onDoubleClick`), `web/JobCardDialog.tsx`, `web/JobCard.tsx` | `web/PlanScreen.test.tsx` «двойной клик по строке сразу открывает JobCard одного изделия», `web/JobCardDialog.test.tsx` | — |
| 8.2 | Флажки, «Выбрать первые 12», «Печать выбранных» | Реализовано | `web/PlanScreen.tsx` (`selectFirstBatch`, `printSelected`) | `web/PlanScreen.test.tsx` ««Выбрать первые 12» запрашивает очередь заново…», «отмеченные флажком изделия…» | «Первые 12» берутся из свежего запроса первой страницы плана без фильтров |
| 8.3 | [П] Состав полей JobCard | Частично | `web/JobCard.tsx` | `web/JobCardDialog.test.tsx` «показывает поля изделия и QR» | Выводятся: производственный номер, модель, комплектация, цвет, № двигателя, позиция плана, QR, время формирования. Шасси нет; макет не согласован (В-12) |
| 8.4 | [П] Повторная печать не создаёт нового изделия | Реализовано | `POST /production-plan/{vin}/print` ставит только `PrintDate`, статус не меняет | `T/JobCardPrintTests.cs` `Print_Does_Not_Change_Status`, `Print_Sets_PrintDate_Regardless_Of_Status` | — |

### Раздел 9. Общая механика сканирования

| № | Требование | Статус | Код | Тест | Примечание |
|---|---|---|---|---|---|
| 9.1 | Крупное поле ввода с постоянным фокусом, найденное изделие, нижний список подходящих | Реализовано | `web/ScanTransitionScreen.tsx` (`inputRef`, `focusInput`, список «ожидают»), `web/FokScreen.tsx` | `web/StartScreen.test.tsx` «показывает список ожидающих запуска (statusId=0)» | — |
| 9.2 | Первый скан — поиск, второй скан того же QR или кнопка — подтверждение | Реализовано | `ScanTransitionScreen.onSubmit`, `FokScreen.onSubmit` | `web/StartScreen.test.tsx` «первый скан показывает карточку, второй скан того же VIN подтверждает переход», «кнопка подтверждения тоже работает» | На FOK второй скан открывает ещё и диалог подтверждения (реализовано после ТЗ) |
| 9.3 | Позитивный сигнал поиска и звук запущенного двигателя при успехе | Не реализовано | — | — | Звуков в проекте нет |
| 9.4 | Ошибка (не распознано, другое изделие, неверный статус) — переход не выполняется, причина показана, фокус возвращается | Реализовано | `ScanTransitionScreen.lookup`/`confirm` (`setMessage`, `focusInput`) | `web/StartScreen.test.tsx` «изделие в неподходящем статусе показывает ошибку…», «неизвестный VIN даёт понятную ошибку…» | — |
| 9.5 | [П] Таймаут режима ожидания второго скана; защита от повторной обработки | Не реализовано | — | — | Таймаута нет (В-13); отмена карточки кнопкой «Отмена» есть |

### Раздел 10. Запуск изделия (0 → 1)

| № | Требование | Статус | Код | Тест | Примечание |
|---|---|---|---|---|---|
| 10.1 | Экран учитывает только статус 0; `0 → 1`; фиксируются исполнитель и время | Реализовано | `POST /production-plan/{vin}/start` → `IPlanTransitions.StartAsync` (Demo/Sql), `web/StartScreen.tsx` | `T/StartTests.cs` `Start_Transitions_Status_0_To_1_And_Sets_StartDate`, `Pending_Start_List_Filters_By_StatusId_Not_Status_String` | Исполнитель и время — в журнале событий (в памяти) и в `StartDate` |
| 10.2 | Повторный запуск не перезапускает и не сбрасывает события | Реализовано | `WrongStatus` → `400` | `T/StartTests.cs` `Repeated_Start_Does_Not_Restart_And_Keeps_Original_StartDate`, `T/LifecycleTests.cs` `Double_Start_Does_Not_Change_Status` | — |
| 10.3 | [В-14] Доп. проверка комплектности перед `0 → 1` | Не реализовано | — | — | Проверки нет |

### Раздел 11. Работа по станциям

| № | Требование | Статус | Код | Тест | Примечание |
|---|---|---|---|---|---|
| 11.1a | Визуальная линия станций, выбранный VIN, комплектующие станции | Реализовано | `web/StationScreen.tsx` (`.station-line`, `.station-detail`) | `web/StationScreen.test.tsx` «после поиска VIN показывает линию станций…», «клик по станции показывает привязанные компоненты» | — |
| 11.1b | [П] Цвета станции: серый/синий/зелёный/жёлтый/красный | Реализовано | `StationScreen.stationState`, `.station-grey…red` в `web/styles.css`, `web/f7-components.css` | `web/StationScreen.test.tsx` «…незакрытая NCP красит станцию красным» | Красный приоритетнее любого другого состояния (кроме случая «станция открыта» — тогда сначала красный, потом синий) |
| 11.1c | Поиск изделия на станции: скан, ввод, выбор из списка | Частично | `web/StationScreen.tsx` (поле VIN) | `web/StationScreen.test.tsx` | Скан/ввод есть; выбора из списка изделий на линии на экране «Станции» нет |
| 11.2a | Ленточный список компонентов; «Проверено всё», «Снять проверку», отметка по строке | Реализовано | `web/StationScreen.tsx` (`toggleCheck`, `checkAll`), `POST /stations/{vin}/components/{code}/check` | `web/StationScreen.test.tsx` «отметка компонента…», ««Проверено всё» отмечает каждый компонент станции», `T/StationChecksTests.cs` | Отметка хранит кто и когда |
| 11.2b | «Зафиксировать расхождение» из контекста станции с готовыми VIN/станцией/компонентом | Реализовано | `web/StationScreen.tsx` → `web/NcpCreateDialog.tsx` (`defaultVin/defaultStation/defaultComponentCode`) | `web/StationScreen.test.tsx` ««Зафиксировать расхождение» открывает форму NCP…» | — |
| 11.2c | [П] Разделять «проверено», «установлено» и «нет открытых NCP» | Реализовано | `ComponentCheck` (проверка) отдельно от `NcpItem.PartInstalled` и `NcpItem.Status` | `T/NcpTests.cs` `PartInstalled_Is_Separate_From_Status` | «Проверено всё» не снимает блокировку FOK |
| 11.3 | Предупреждение сопровождает изделие по маршруту; история не стирается | Частично | NCP привязан к VIN и не зависит от станции; журнал событий | — | Предупреждение видно на экранах NCP/FOK/Rework/Станции, но не на планах и карточках (см. 5.4). История — в памяти процесса |
| 11.4 | [В-15] Что завершает станцию | Неясно | `StationScreen.stationState`: «зелёная» = все компоненты отмечены и нет открытой NCP на станции | — | Выбрана рабочая формула на клиенте; серверного состояния «станция завершена» нет |

### Раздел 12. ОТК, инспекторы, контрольные точки

| № | Требование | Статус | Код | Тест | Примечание |
|---|---|---|---|---|---|
| 12.1 | Скан VIN → открыть точку → скан персонального QR инспектора; фиксация инспектора, времени, результата, процента | Не реализовано | — | — | Сущностей «инспектор», «контрольная точка», «процент готовности» в коде нет. В SQL-схеме есть таблицы `tblQC_*` (`docs/AS_IS_FACTS.md`), приложение к ним не обращается |
| 12.2 | Контрольные точки на схеме линии с историей | Не реализовано | — | — | — |

### Раздел 13. Завершение сборки (1 → 2)

| № | Требование | Статус | Код | Тест | Примечание |
|---|---|---|---|---|---|
| 13.1 | Экран допускает только статус 1; механика как у запуска; результат — `2` | Реализовано | `POST /production-plan/{vin}/complete`, `web/CompleteScreen.tsx` (на `ScanTransitionScreen`) | `T/CompleteTests.cs` | **У `CompleteScreen.tsx` нет собственного frontend-теста** (покрывается общей механикой `ScanTransitionScreen`, проверяемой через Start/Rework) |
| 13.2 | Незакрытые вопросы не теряют изделие; возможна отправка в Rework | Реализовано | «Отправить в Rework» на `web/FokScreen.tsx` при блокировке, `POST …/rework` | `web/FokScreen.test.tsx` «заблокированное изделие можно отправить в Rework…» | Отправка идёт со статуса 2, не при завершении (В-19) |
| 13.3 | [П] Автоблокирования завершения по ОТК/NCP не добавлять | Реализовано | `Complete` не проверяет NCP | `T/CompleteTests.cs` `Complete_Is_Not_Blocked_By_Open_Ncp` | Поведение соответствует ТЗ |

### Раздел 14. NCP: регистрация

| № | Требование | Статус | Код | Тест | Примечание |
|---|---|---|---|---|---|
| 14.1 | Причины: брак, пересорт, недостача; VIN, станция, компонент станции, количество, комментарий | Реализовано | `CreateNcpRequest`, `DemoNcpStore.CreateAsync`, `web/NcpCreateDialog.tsx`; типы `["Брак","Пересорт","Недостача","Прочее"]` | `T/NcpTests.cs` `Create_Succeeds_With_Valid_Data_And_Appears_In_List`, `Create_Rejects_Invalid_Input_With_400`, `web/NcpScreen.test.tsx` «форма регистрации валидна только при выбранном компоненте и количестве» | Тип «Прочее» в ТЗ отсутствует (см. раздел 5) |
| 14.2 | VIN: сканом, вручную или выбором из списка линии | Частично | `web/NcpCreateDialog.tsx` (ввод VIN), `web/StationScreen.tsx` (контекст) | `web/NcpScreen.test.tsx` | Выбора из списка изделий на линии в форме нет |
| 14.3 | Сохранение в существующую таблицу NCP; операторский и инженерный комментарии | Реализовано | `NcpItem.OperatorComment/EngineerComment`; SQL — `[dbo].[tblNCP]` (`Api/SqlNcpStore.cs`) | `T/NcpTests.cs` | Физическая схема `tblNCP` в SQL-режиме не обследована (комментарий в `Api/Ncp.cs`) |
| 14.4 | Отдельный ответ «установлена ли правильная деталь» — самостоятельное состояние | Реализовано (Demo) / Частично (SQL) | `POST /ncp/{id}/part-installed`, `NcpItem.PartInstalled` | `T/NcpTests.cs` `PartInstalled_Is_Separate_From_Status`, `web/NcpScreen.test.tsx` «отмечает деталь установленной, не меняя статус заявки» | В SQL **колонки нет**: `SetPartInstalledAsync` отображает признак на `Status` («installed=false reopens (Status=1)»), т.е. раздельность теряется |
| 14.5 | Поздняя установка на любой станции; первичная запись не уничтожается | Реализовано | `part-installed` и `close` не удаляют запись; закрытая NCP остаётся в списке | `T/NcpTests.cs` `Close_Sets_Status_…_Without_Requiring_Part_Installed` | — |
| 14.6 | Красный знак «требуется доустановка» на всех экранах изделия | Частично | см. 5.4 | — | Не на плане и карточке изделия |
| 14.7 | [В-20] Несколько NCP на одну пару артикул/станция; частичная замена 1 из 3 | Неясно | `Quantity` — одно число | — | Ограничений уникальности нет; учёта частичной замены нет |

### Раздел 15. NCP-листы

| № | Требование | Статус | Код | Тест | Примечание |
|---|---|---|---|---|---|
| 15.1 | Индивидуальный NCP-лист на деталь (номер, станция, VIN, расхождение, количество) | Реализовано | `web/NcpSheet.tsx`, `web/NcpPrintDialog.tsx` (`mode="individual"`) | `web/NcpScreen.test.tsx` «печать NCP-листа подгружает модель по VIN и показывает бланк для Red Table» | — |
| 15.2 | Сводный NCP-лист по VIN со всех станций | Реализовано | `web/NcpSummarySheet.tsx`, `web/NcpPrintDialog.tsx` (`mode="summary"`) | `web/PlanScreen.test.tsx` «карточка изделия открывает печать сводного NCP-листа по VIN» | Кнопка в карточке изделия называется «NCP-лист» |
| 15.3 | [Б] Автоматизация Red/Green Table | Вне MVP | — | — | По ТЗ вне объёма |
| 15.4 | [В-21] Образцы форм, копии, принтеры, идентификация детали | Неясно | — | — | Автопечати нет — только по кнопке |

### Раздел 16. Контроль доустановки и индикация риска

| № | Требование | Статус | Код | Тест | Примечание |
|---|---|---|---|---|---|
| 16.1 | Final OK недоступен для изделия с обязательной, но не поставленной деталью | Реализовано (Demo) / Частично (SQL) | `Program.cs` (`POST …/fok` вызывает `GetMissingRequiredPartsAsync`), `DemoNcpStore` (`!PartInstalled`) / `SqlNcpStore` (`Status = 1`) | `T/FokTests.cs` `Fok_Is_Blocked_By_Missing_Part_Even_Though_Status_Is_Eligible`, `Fok_Unblocks_After_Part_Installed_Is_Confirmed`, `web/FokScreen.test.tsx` | В SQL блокирует любая **открытая** NCP, а не неустановленная деталь |
| 16.2 | Не вводить правило «любая историческая NCP запрещает FOK» | Реализовано | блокируют только записи с `!PartInstalled` (Demo) | `T/FokTests.cs` `Fok_Unblocks_After_Part_Installed_Is_Confirmed` | В Demo закрытая NCP **без** отметки установки всё равно блокирует (критерий — `PartInstalled`, не статус) — это согласуется с В-22/В-23 «как решено кодом» |
| 16.3 | [П] Вычисляемый признак `HasMissingRequiredPart`, одинаковый на всех экранах | Частично | эндпоинт `GET /ncp/missing-parts?vin=` | `T/FokTests.cs` `Missing_Parts_Endpoint_Lists_Blocking_Ncp_For_Proactive_Ui_Check` | Используют FOK и Rework; план/карточка — нет |

### Раздел 17. Rework Zone

| № | Требование | Статус | Код | Тест | Примечание |
|---|---|---|---|---|---|
| 17.1 | Статус 4; отдельный экран изделий в Rework: VIN, причина попадания, открытые NCP, прогресс | Частично | `web/ReworkScreen.tsx` (`ReworkNcpPanel`: «Всего NCP / Устранено / Осталось», список NCP) | `web/ReworkScreen.test.tsx` «показывает список NCP изделия и счётчик «всего/устранено»…» | Отдельной колонки «причина попадания в Rework» нет; список изделий — тот же «очередной» список общей механики |
| 17.2 | В окне Rework: открыть NCP, установить деталь, закрыть NCP | Реализовано | `ReworkNcpPanel` → `web/NcpDetails.tsx` | `web/ReworkScreen.test.tsx` «отметка установки детали прямо в окне Rework снимает блокировку без повторного скана» | — |
| 17.3 | Кнопка перевода `4 → 2`; после неё изделие доступно на FOK, но FOK не пройден | Реализовано | `POST …/rework/finish` | `T/ReworkTests.cs` `Finish_Rework_Succeeds_When_No_Missing_Parts`, `T/LifecycleTests.cs` `Rework_Then_Fok_Works`, `web/ReworkScreen.test.tsx` ««Завершить Rework» переводит изделие в статус 2» | — |
| 17.4 | [П] `4 → 2` повторно проверяет отсутствие недоустановленных деталей, перечисляет препятствия | Реализовано | `rework/finish` проверяет `GetMissingRequiredPartsAsync`, ответ с номерами NCP | `T/ReworkTests.cs` `Finish_Rework_Is_Blocked_By_Missing_Part_And_Unblocks_After_Install`, `web/ReworkScreen.test.tsx` «открытая NCP видна сразу и блокирует «Завершить Rework»…» | — |

### Раздел 18. Final OK / FOK

| № | Требование | Статус | Код | Тест | Примечание |
|---|---|---|---|---|---|
| 18.1 | Экран обрабатывает статус 2; скан-поиск + подтверждение; `2 → 3`; пользователь и время | Реализовано | `web/FokScreen.tsx`, `POST …/fok` | `T/FokTests.cs` `Fok_Rejects_Items_Not_In_Status_2`, `Fok_Succeeds_When_No_Missing_Parts`, `web/FokScreen.test.tsx` «изделие без незакрытых деталей разрешает подтверждение» | Подтверждение на экране FOK проходит через диалог (добавлено после ТЗ) |
| 18.2 | Изделия в 4 недоступны для FOK; при недоставленной детали FOK невозможен | Реализовано | `statusId` проверяется переходом; блокировка по NCP | `T/FokTests.cs`, `T/ReworkTests.cs` | — |
| 18.3 | [П] Перед подтверждением показать VIN, модель, финальные проверки, предупреждения и причину отказа | Частично | `web/FokScreen.tsx` (панель изделия, баннер причины, список недостающих деталей) | `web/FokScreen.test.tsx` «незакрытая обязательная деталь видна СРАЗУ при сканировании…» | «Финальных проверок/тестов FOK» нет — состав не определён (В-24) |

### Раздел 19. Входной контроль: создание поставки

| № | Требование | Статус | Код | Тест | Примечание |
|---|---|---|---|---|---|
| 19.1 | Поставка: поставщик из справочника (признак «материнский завод»), инвойс, дата | Реализовано | `POST /incoming-inspection/deliveries`, `GET …/suppliers`, `web/DeliveryCreateDialog.tsx` | `T/IncomingInspectionTests.cs` `Suppliers_List_Includes_Parent_Plant_Flag`, `Create_Delivery_Starts_Open_With_No_Packages`, `Create_Delivery_With_Unknown_Supplier_Is_Rejected`, `web/IncomingInspectionScreen.test.tsx` «список поставок показывает статус и позволяет создать новую» | — |
| 19.2 | Packing List вставкой из Excel без обязательного файла | Реализовано | `POST …/packing-list/sessions`, `web/IncomingInspectionScreen.tsx` (поле вставки), `web/importParse.ts` (`parsePackingListRows`) | `T/IncomingInspectionTests.cs` `Confirm_Groups_Rows_Into_Packages_By_Hu_And_Snapshots_Quota`, `web/IncomingInspectionScreen.test.tsx` «подтверждённая загрузка создаёт коробку в списке» | — |
| 19.3 | Поля PL: артикул, наименование, количество, вес нетто/брутто, номер упаковки, партия… | Реализовано | `PACKING_LIST_COLUMNS` в `web/importParse.ts`, `PackingListRow` | `T/IncomingInspectionTests.cs` | Вес нетто/брутто и партия принимаются; обязательность отдельных полей и «завод/категория поставщика/документы» в строке не выявлены |
| 19.4 | Неизвестный артикул: жёлтая строка, «Не найдено», добавление в справочник | Частично | ошибка «не найден в справочнике» (`Api/IncomingInspection.cs`), `POST …/components`, кнопка добавления в `web/IncomingInspectionScreen.tsx` (через `window.prompt`) | `T/IncomingInspectionTests.cs` `Unknown_Article_Is_Reported_And_Blocks_Staging`, `Adding_Unknown_Article_To_Catalog_Unblocks_Staging` | Подсветка и действие есть; метка «Не найдено» и именно жёлтый цвет в UI не подтверждены; ввод наименования — системный `prompt()` |
| 19.5 | [В-25/В-26] Ключ поставки, соответствие внешнего артикула внутреннему | Неясно | `Delivery.Id` | — | Справочника соответствий нет |

### Раздел 20. Упаковки и открытие коробки

| № | Требование | Статус | Код | Тест | Примечание |
|---|---|---|---|---|---|
| 20.1 | Открыть коробку сканом HU или двойным щелчком | Реализовано | `GET …/packages/by-hu/{hu}`, `web/IncomingInspectionScreen.tsx` (`onScan`, двойной клик по строке) | `T/IncomingInspectionTests.cs` `Scan_Opens_Package_By_Hu_Within_Delivery`, `web/IncomingInspectionScreen.test.tsx` «двойной клик по коробке открывает диалог…» | Ошибка «Коробка не найдена в этой поставке» |
| 20.2 | Отличать подсветку «найдена» от постоянной окраски «проверена» | Частично | цветовые бейджи статуса коробки (`badge-ok`, `badge-warn`) | — | Отдельной временной подсветки «найденной» коробки по коду не выявлено |
| 20.3 | Закрытая коробка остаётся доступной и уходит в конец списка | Неясно | `web/IncomingInspectionScreen.tsx` выводит `delivery.packages` в порядке данных | — | Сортировки «закрытые вниз» в UI/API не подтверждено кодом |

### Раздел 21. Проверка строк и подтверждение сканером

| № | Требование | Статус | Код | Тест | Примечание |
|---|---|---|---|---|---|
| 21.1 | Первое сканирование артикула выделяет строку жёлтым; повторное — OK; альтернативно вручную | Частично | `web/PackageDialog.tsx` (`recordRowResult`: список исходов + количество) | `web/IncomingInspectionScreen.test.tsx` «запись результата OK обновляет счётчик…» | Реализован только **ручной** ввод результата. Сканирования артикула в диалоге коробки нет (в `PackageDialog.tsx` нет поля скана) |
| 21.2 | Окраска строк по результату; счётчики «всего/проверено/OK/не OK» | Реализовано | `PackageRow` (`CheckedQuantity`, `IsComplete`, `HasIssues`) | `T/IncomingInspectionTests.cs` `Recording_Ok_Result_Accumulates_And_Caps_At_Required_Quantity` | — |
| 21.3 | Агрегированный учёт по строке: план, к проверке, проверено, OK, брак, пересорт, недостача | Реализовано | `Api/IncomingInspection.cs` (`OkQuantity`, `DefectQuantity`, `MismatchQuantity`, `ShortageQuantity`) | `T/IncomingInspectionTests.cs` `Shortage_Counts_Toward_Completeness_Without_Being_Ok` | Дефект не переносится автоматически на остальные штуки |
| 21.4 | Брак/пересорт/недостача: причина и количество; недостача ≠ пересорт | Реализовано | `POST …/rows/{rowId}/result` (исход, количество, причина) | `T/IncomingInspectionTests.cs` | Причина — свободный текст; справочника уточняющих причин нет (В-20) |

### Раздел 22. Норматив и объём контроля

| № | Требование | Статус | Код | Тест | Примечание |
|---|---|---|---|---|---|
| 22.1 | Норматив в справочнике артикулов; по умолчанию 100 %; проценты или штуки | Реализовано | `InspectionQuotaRef(ComponentCode, Percent, FixedCount)`, `fixtures/inspection-quotas.demo.json`, SQL `tblInspectionQuota` | `T/IncomingInspectionTests.cs` `Confirm_Groups_Rows_Into_Packages_By_Hu_And_Snapshots_Quota` | — |
| 22.2 | Число штук к проверке; округление процента вверх | Реализовано | `Math.Ceiling(plannedQuantity * percent / 100.0)` в `Api/IncomingInspection.cs` | `T/IncomingInspectionTests.cs` | — |
| 22.3 | Брак не повышает норматив автоматически; действие «Увеличить объём контроля» | Реализовано | `POST …/rows/{rowId}/quota`, кнопка «Увеличить объём» в `web/PackageDialog.tsx` | `T/IncomingInspectionTests.cs` `Increase_Quota_Requires_Comment_And_Larger_Value` | Новое значение > текущего и ≤ плана; комментарий обязателен |
| 22.4 | [П] Норматив — снимок на момент начала проверки | Реализовано | снимок при подтверждении Packing List | `T/IncomingInspectionTests.cs` `Confirm_Groups_Rows_Into_Packages_By_Hu_And_Snapshots_Quota` | — |

### Раздел 23. Закрытие упаковки и поставки

| № | Требование | Статус | Код | Тест | Примечание |
|---|---|---|---|---|---|
| 23.1 | Кнопка «Проверка завершена — закрыть коробку» при отработанных строках | Реализовано | `POST …/packages/{id}/close`, `web/PackageDialog.tsx` | `T/IncomingInspectionTests.cs` `Close_Package_Requires_Completeness`, `web/IncomingInspectionScreen.test.tsx` «…закрытие блокируется, пока не отработаны все строки» | — |
| 23.2 | Зелёная — без проблем; предупреждающий цвет — с браком/недостачей, но «проверена» | Реализовано | `Package.HasIssues`; классы `badge-ok`/`badge-warn` | `T/IncomingInspectionTests.cs` `Close_Package_Clean_Marks_No_Issues_…`, `Close_Package_With_Defect_Marks_Delivery_Verified_With_Issues` | — |
| 23.3 | Все коробки закрыты → поставка «Проверена»; различать «без замечаний» и «с замечаниями» | Реализовано | `DeliveryStatus` (`Verified`, `VerifiedWithIssues`), `DELIVERY_STATUS_LABEL` в `web/IncomingInspectionScreen.tsx` | `T/IncomingInspectionTests.cs` | — |
| 23.4 | [П/В-32] Повторное открытие закрытой коробки с аудитом | Реализовано | `POST …/packages/{id}/reopen` (комментарий обязателен), `web/PackageDialog.tsx` | `T/IncomingInspectionTests.cs` `Closed_Package_Rejects_New_Results_Until_Reopened` | Прав на переоткрытие нет (любой авторизованный) |
| 23.5 | [В-31] Недостача при норме 100 % | Реализовано | `Shortage_*` считается в завершённость (`CheckedQuantity` включает недостачу) | `T/IncomingInspectionTests.cs` `Shortage_Counts_Toward_Completeness_Without_Being_Ok` | Код реализует рекомендованный ответ «да, закрыть можно» |

### Раздел 24. Судьба несоответствующих материалов

| № | Требование | Статус | Код | Тест | Примечание |
|---|---|---|---|---|---|
| 24.1 | Решение по браку — вручную; карантин/ремонт/списание/возврат не автоматизируются | Реализовано | автоматизации нет; фиксируются причина, количество, автор | — | Соответствует ТЗ |
| 24.2 | Не допускать забракованные детали в производство | Не реализовано | — | — | Способ связи с остатками/выдачей не согласован (В-33); есть лишь пометка не-OK результата |

### Раздел 25. Журналы и прослеживаемость

| № | Требование | Статус | Код | Тест | Примечание |
|---|---|---|---|---|---|
| 25.1 | Для проверок и операций сохраняются пользователь и время; история NCP остаётся | Частично | `IEventLog.Record(...)` вызывается в Demo/Sql-реализациях; поля `CreatedBy/ClosedBy/CheckedBy` | `T/EventLogTests.cs` | `InMemoryEventLog` — память процесса, **не переживает перезапуск** и в SQL-режиме; **ни одного HTTP-эндпоинта и экрана для чтения журнала нет** (подтверждено поиском по `Program.cs`) |
| 25.2 | [П] Типы событий (загрузка, перестановка, печать, запуск, … поставка закрыта/переоткрыта) | Реализовано | `eventLog.Record` в `DemoProductionPlanReader`, `DemoNcpStore`, `DemoStationChecks`, `DemoPlanImport`, `DemoIncomingInspectionStore` и `Sql*` | `T/EventLogTests.cs` | Записи пишутся, но не читаются снаружи (см. 25.1) |
| 25.3 | [П] Транзакции и `rowversion` против потери обновлений | Частично | транзакции в `SqlPlanPublisher`, `SqlPlanOrderEditor`, `SqlIncomingInspection` | — | `rowversion` не используется (4.3) |
| 25.4 | [В-34] Срок хранения, электронные подписи | Неясно | — | — | — |

### Раздел 26. Отчётность, поиск, печатные формы

| № | Требование | Статус | Код | Тест | Примечание |
|---|---|---|---|---|---|
| 26.1 | JobCard одного и пакетно; NCP-лист на деталь; сводный; список производства по статусам; экран Rework; поставки и коробки с итогами | Реализовано | см. разделы 8, 15, 17, 20–23; `web/PlanScreen.tsx` (плитки по статусам и фильтр) | см. соответствующие разделы | — |
| 26.2 | [П] Дополнительные сводки | Частично | `web/ReportsScreen.tsx` (план, NCP по типам, входной контроль) | `web/ReportsScreen.test.tsx` «показывает сводки по плану, NCP и входному контролю» | Только агрегаты по существующим данным; отчётов за период, занятости станций, причин брака по поставщикам нет — сознательно (В-35) |
| 26.3 | [В-35] Выгрузки Excel/PDF, рассылка | Не реализовано | — | — | Не согласовано |

### Раздел 27. Технологические условия и миграция

| № | Требование | Статус | Код | Тест | Примечание |
|---|---|---|---|---|---|
| 27.1 | Использовать действующие таблицы; не дублировать изделие | Реализовано | запросы к `tblProductionPlan`, `tblNCP`, `tblComponent`, `tblComponentCheck`; новые `tblIncoming*`, `tblInspectionQuota`, `tblDiscrepancyList` (`Api/Sql*.cs`) | `T/SqlReaderTests.cs`, `T/*Tests.cs` «…Routes_Exist_In_Sql_Mode…» | Таблицы входного контроля — новые для проекта (в AS-IS их нет); создаются скриптами в `sql/` (см. [06-DATA-AND-SQL](06-DATA-AND-SQL.md)) |
| 27.2 | [П] Принципы: единые проверки, транзакции, индексируемый поиск, запрет двойного проведения, аудит, тестовый контур | Частично | `Api/VinSearch.cs`; параметризованные запросы; `SqlOptions` (fail-closed) | `T/SqlReaderTests.cs` | Аудит — см. 25.1; единой бизнес-логики с Access нет |
| 27.3 | [В-36] Какие формы Access остаются, где работает версия, сканеры/принтеры | Неясно | — | — | Вне кода |

### Раздел 28. Сценарии ошибок и граничные случаи

Первая часть раздела — **[С]**: ошибка не переводит объект в новый статус, причина показана, фокус возвращается. Вторая — список из 15 случаев для проработки **[П]**.

| № | Требование / случай | Статус | Код | Тест | Примечание |
|---|---|---|---|---|---|
| 28.0 | [С] Ошибка не меняет статус молча; показана причина; фокус на поле скана | Реализовано | `ScanTransitionScreen`, `FokScreen`, обработка `ProblemDetails` | `web/StartScreen.test.tsx`, `T/*Tests.cs` («Rejects_Items_Not_In_Status_…») | — |
| 28.1 | Повторная загрузка плана / VIN уже в SQL | Реализовано | «VIN уже есть в производственном плане» | `T/PlanImportTests.cs` `Existing_Vin_Is_An_Error_Not_An_Update` | Всегда ошибка, не обновление (В-09) |
| 28.2 | Одновременные правки порядка/NCP двумя пользователями | Не реализовано | — | — | Нет версионирования |
| 28.3 | Повторный скан после успешного запуска/закрытия/FOK | Реализовано | неверный статус → `400` | `T/StartTests.cs` `Repeated_Start_Does_Not_Restart_…` | — |
| 28.4 | Подтверждение сканом другого изделия | Реализовано | второй скан срабатывает только при совпадении VIN с найденным (`ScanTransitionScreen.onSubmit`) | `web/StartScreen.test.tsx` | Иной VIN запускает новый поиск |
| 28.5 | Сбой связи после первого скана | Частично | запись выполняется только на втором шаге; ошибка сети — «Нет связи с сервером» | `web/App.test.tsx` «показывает «Нет связи с сервером»…» | Сценариев восстановления нет |
| 28.6 | NCP на деталь не той станции/комплектации | Реализовано (Demo) | `CreateNcpOutcome.InvalidStation/ComponentNotFound` | `T/NcpTests.cs` `Create_Rejects_Invalid_Input_With_400` | — |
| 28.7 | Недостача нескольких одинаковых + частичная доустановка | Неясно | — | — | См. 14.7 |
| 28.8 | Несколько NCP с разными причинами по одному артикулу | Реализовано | ограничений нет | — | — |
| 28.9 | Rework без открытых позиций; ошибочная NCP | Частично | `rework/finish` проходит, если препятствий нет | `T/ReworkTests.cs` `Finish_Rework_Succeeds_When_No_Missing_Parts` | Отмены ошибочной NCP нет |
| 28.10 | Коробка с несколькими одинаковыми артикулами | Неясно | — | — | В-28 |
| 28.11 | Брак при выборочном контроле → ручное увеличение норматива | Реализовано | см. 22.3 | `T/IncomingInspectionTests.cs` `Increase_Quota_Requires_Comment_And_Larger_Value` | — |
| 28.12 | Норма 100 % и недовоз | Реализовано | см. 23.5 | `T/IncomingInspectionTests.cs` `Shortage_Counts_Toward_Completeness_Without_Being_Ok` | — |
| 28.13 | Скан артикула, которого нет в коробке и справочнике | Не реализовано | — | — | Сканирования артикулов нет (21.1) |
| 28.14 | Повторное открытие коробки, исправление результата | Реализовано | `reopen` с комментарием | `T/IncomingInspectionTests.cs` `Closed_Package_Rejects_New_Results_Until_Reopened` | — |
| 28.15 | Поставка проверена, но содержит проблемные коробки | Реализовано | `VerifiedWithIssues` | `T/IncomingInspectionTests.cs` `Close_Package_With_Defect_Marks_Delivery_Verified_With_Issues` | — |

### Разделы 29–31 (мета-разделы)

| Раздел | Содержание | Как учтён |
|---|---|---|
| 29 | Критерии приёмки AT-01…AT-30 | Разобраны в [разделе 3](#3-критерии-приёмки-at-01at-30) |
| 30 | Реестр открытых вопросов | Разобран в [разделе 4](#4-как-код-отвечает-на-открытые-вопросы-в-xx) |
| 31 | Что намеренно не объявлено согласованным | Список ограничений; в статистику не включён. Все 10 пунктов в коде действительно отсутствуют как «согласованные решения» (полный макет JobCard/NCP, длины идентификаторов, маршрут 11 станций с тестами ОТК/FOK, права на переоткрытие, процент готовности, карантин, складские остатки, расширенная аналитика) |

## 3. Критерии приёмки AT-01…AT-30

Статус AT определён по подтверждённому покрытию соответствующего требования, а не по «ощущению».

| AT | Суть | Статус | Где в коде | Тест | Примечание |
|---|---|---|---|---|---|
| AT-01 | Excel-выгрузка появляется во временном списке, основной план не меняется | Частично | `web/ImportScreen.tsx`, `IPlanImport.StageAsync` | `T/PlanImportTests.cs` `Valid_Row_Stages_Without_Errors` | Файл — CSV/TSV; не `.xlsx` |
| AT-02 | Вставленный диапазон попадает в тот же список и проходит ту же валидацию | Реализовано | `web/ImportScreen.tsx`, `web/importParse.ts` | `web/ImportScreen.test.tsx` «вставка диапазона и проверка…» | — |
| AT-03 | Для строки с ошибочными VIN/двигателем/цветом — подсветка и **все** ошибки | Реализовано | `Api/PlanImport.cs` | `T/PlanImportTests.cs` `Unknown_Color_Model_And_Bad_Date_Are_Reported`, `web/ImportScreen.test.tsx` «строка с ошибками подсвечена…» | — |
| AT-04 | Правка/справочник → повторная проверка; пока есть ошибка, публикация недоступна | Реализовано | `PUT …/rows/{n}`, `Publish_Is_Blocked_While_Errors_Remain` | `T/PlanImportTests.cs` `Edit_Row_Fixes_Error_And_Revalidates`, `Publish_Is_Blocked_While_Errors_Remain` | — |
| AT-05 | При нуле ошибок строки добавляются в конец очереди; показано число и время | Частично | `PublishAsync` | `T/PlanImportTests.cs` `Publish_Appends_To_End_Of_Queue_…`, `web/ImportScreen.test.tsx` «публикация без ошибок…» | Время добавления в UI не подтверждено (6.3b) |
| AT-06 | «Поднять/Опустить» во временной таблице; перенос в основном плане сдвигает без дублей | Частично | перенос — `MoveAsync`/`MoveDialog` | `T/ApiTests.cs` `Move_Far_Shifts_Whole_Range` | Часть про временную таблицу не реализована (7.1) |
| AT-07 | «Отменить изменение» / «Сохранить новую последовательность» | Вне MVP | — | — | Решение РП: немедленное сохранение (7.3) |
| AT-08 | Двойной клик → JobCard с QR; «Выбрать первые 12»; «Печать выбранных» | Реализовано | `web/PlanScreen.tsx`, `web/JobCardDialog.tsx` | `web/PlanScreen.test.tsx` (3 теста) | — |
| AT-09 | Статус 0: первый скан показывает, второй/кнопка → 1 + время | Реализовано | `ScanTransitionScreen`, `POST …/start` | `web/StartScreen.test.tsx` «первый скан показывает карточку, второй скан того же VIN подтверждает переход», `T/StartTests.cs` | — |
| AT-10 | Второй скан другого VIN — ошибка, возможность нового скана | Реализовано | `ScanTransitionScreen.onSubmit` | `web/StartScreen.test.tsx` | Отдельного теста именно «другой VIN вторым сканом» не найдено; поведение следует из кода `onSubmit` |
| AT-11 | Завершение не трогает статус 0 или 2; изделие 1 → 2 | Реализовано | `POST …/complete` | `T/CompleteTests.cs` `Complete_Rejects_Items_Not_In_Status_1`, `Complete_Transitions_Status_1_To_2_And_Sets_CompleteDate` | — |
| AT-12 | Статус 2 без недоставленных деталей → скан и FOK → 3 | Реализовано | `POST …/fok` | `T/FokTests.cs` `Fok_Succeeds_When_No_Missing_Parts`, `web/FokScreen.test.tsx` | — |
| AT-13 | На станции найти VIN и зарегистрировать NCP «недостача», кол-во 2, комментарий, время, пользователь | Реализовано | `web/StationScreen.tsx` → `NcpCreateDialog` | `web/StationScreen.test.tsx` ««Зафиксировать расхождение» открывает форму NCP…», `T/NcpTests.cs` `Create_Succeeds_…` | — |
| AT-14 | Индивидуальный NCP-лист; сводный лист изделия | Реализовано | `NcpSheet`, `NcpSummarySheet` | `web/NcpScreen.test.tsx`, `web/PlanScreen.test.tsx` | — |
| AT-15 | После NCP без доустановки — красный знак на экранах изделия и запрет FOK | Частично | см. 5.4 | `T/FokTests.cs` | Запрет — да; знак — не на всех экранах |
| AT-16 | После доустановки NCP сохраняется, признак меняется | Реализовано | `POST …/part-installed` | `T/NcpTests.cs` `PartInstalled_Is_Separate_From_Status`, `T/FokTests.cs` `Fok_Unblocks_After_Part_Installed_Is_Confirmed` | — |
| AT-17 | Изделие в Rework (4) показывает открытые позиции; пользователь окна закрывает NCP | Реализовано | `web/ReworkScreen.tsx` | `web/ReworkScreen.test.tsx` | — |
| AT-18 | После ручного завершения Rework → 2 и в очереди FOK; 3 автоматически нет | Реализовано | `rework/finish` | `T/LifecycleTests.cs` `Rework_Then_Fok_Works`, `T/ReworkTests.cs` | — |
| AT-19 | Поставка с поставщиком/инвойсом; Packing List вставкой | Реализовано | `DeliveryCreateDialog`, `IncomingInspectionScreen` | `T/IncomingInspectionTests.cs` `Create_Delivery_Starts_Open_With_No_Packages`, `web/IncomingInspectionScreen.test.tsx` | — |
| AT-20 | Неизвестный артикул — жёлтый, «Не найдено», добавление в справочник | Частично | см. 19.4 | `T/IncomingInspectionTests.cs` `Unknown_Article_*` | Метка и цвет в UI не подтверждены |
| AT-21 | Коробка по скану HU или двойному клику; виден состав и задания | Реализовано | см. 20.1 | `T/IncomingInspectionTests.cs` `Scan_Opens_Package_By_Hu_Within_Delivery`, `web/IncomingInspectionScreen.test.tsx` | — |
| AT-22 | Первый скан артикула — жёлтая строка; второй — OK с пользователем/временем/количествами | Не реализовано | — | — | Реализован ручной ввод результата (21.1) |
| AT-23 | Норма 25 % от 20 → 5; брак 1 → 4 OK / 1 не OK | Реализовано | `Math.Ceiling`, агрегаты строки | `T/IncomingInspectionTests.cs` `Recording_Ok_Result_Accumulates_And_Caps_At_Required_Quantity` | Тест на конкретные «25 % от 20» не найден — по именам тестов проверяется накопление и потолок |
| AT-24 | Брак не повышает норматив; «Увеличить объём контроля» по решению | Реализовано | см. 22.3 | `T/IncomingInspectionTests.cs` `Increase_Quota_Requires_Comment_And_Larger_Value` | — |
| AT-25 | 18 вместо 20 → недостача 2, не пересорт | Реализовано | `ShortageQuantity` | `T/IncomingInspectionTests.cs` `Shortage_Counts_Toward_Completeness_Without_Being_Ok` | — |
| AT-26 | Коробка доступна к закрытию после обработки строк; закрытая уходит вниз, остаётся доступной | Частично | `close` — да; «вниз списка» не подтверждено | `T/IncomingInspectionTests.cs` `Close_Package_Requires_Completeness` | См. 20.3 |
| AT-27 | Закрытая без проблем — зелёная; с проблемами — предупреждающий цвет | Реализовано | `badge-ok`/`badge-warn` | `T/IncomingInspectionTests.cs` `Close_Package_Clean_…`, `Close_Package_With_Defect_…` | — |
| AT-28 | Все коробки закрыты → «Проверена», с отдельной видимостью замечаний | Реализовано | `DeliveryStatus` | `T/IncomingInspectionTests.cs` | — |
| AT-29 | [П] Двойной «Публиковать»/второй скан/«Закрыть коробку» не дублируют события | Частично | публикация защищена; переходы по `WHERE statusid = @from` | `T/PlanImportTests.cs` `…Prevents_Double_Publish`, `T/StartTests.cs` `Repeated_Start_…` | Для повторного «закрыть коробку» отдельной защиты/теста не найдено |
| AT-30 | [П] Конфликтующие правки двух пользователей не перезаписывают тихо | Не реализовано | — | — | Нет `rowversion`/версий |

## 4. Как код отвечает на открытые вопросы (В-xx)

В ТЗ 36 открытых вопросов. Ниже — те, на которые код (или решения РП в документах) **уже дал рабочий ответ**; остальные остаются открытыми.

| Вопрос | Ответ кода по факту | Источник |
|---|---|---|
| В-05 / В-10 производственный номер | Показывается поле `ID` таблицы как «Производственный номер»; генерации в MES нет | `web/JobCard.tsx` |
| В-07 вход в Rework | Только `2 → 4` | `Api/SqlPlanTransitions.cs` (`SendToReworkAsync`: from 2 to 4) |
| В-09 дубль VIN при импорте | Всегда ошибка, обновления нет | `Api/PlanImport.cs`, `T/PlanImportTests.cs` |
| В-11 перестановка по статусам | Ограничений нет | `DemoProductionPlanReader.MoveAsync` |
| В-12 содержимое QR | VIN | `web/Qr.tsx` (комментарий в коде) |
| В-13 таймаут второго скана | Нет таймаута; есть «Отмена» | `web/ScanTransitionScreen.tsx` |
| В-15 завершение станции | «Все компоненты отмечены и нет открытой NCP на станции» (расчёт на клиенте) | `web/StationScreen.tsx` `stationState` |
| В-19 перевод в Rework | Кнопка на экране FOK при блокировке, со статуса 2 | `web/FokScreen.tsx` |
| В-22 / В-23 критерий риска и закрытия Rework | Критерий — флаг `PartInstalled` (Demo) / открытая NCP (SQL), а не статус заявки; закрытие Rework проверяет то же самое | `Api/Ncp.cs`, `Api/SqlNcpStore.cs`, `rework/finish` |
| В-30 кто увеличивает норму | Любой авторизованный; обязательны комментарий и значение > текущего | `Api/IncomingInspection.cs` |
| В-31 недостача при 100 % | Закрыть коробку можно: недостача входит в «проверено» | `PackageRow.CheckedQuantity` |
| В-32 переоткрытие | Разрешено любому, комментарий обязателен | `POST …/reopen` |
| В-04 права | Ролей нет | `Api/Program.cs` |
| В-14, В-16, В-17, В-18, В-24, В-26, В-27, В-28, В-29, В-33, В-34, В-35, В-36 | Код ответа не даёт | — |

## 5. Реализовано, но нет в спецификации

| Что | Где | Комментарий |
|---|---|---|
| Журнал событий общего вида `IEventLog` | `Api/EventLog.cs` | В ТЗ — только рекомендация типов событий ([П] раздел 25) |
| Тип NCP «Прочее» | `Api/Ncp.cs` `Types` | ТЗ называет три причины |
| Экран «Отчётность» | `web/ReportsScreen.tsx` | В ТЗ — перечень «полезных сводок» без утверждённого состава |
| Экран «Администрирование» (справочники только на чтение) | `web/AdminScreen.tsx` | В ТЗ — «администратор справочников» как роль, экрана нет |
| Выбор колонок таблицы плана («Поля», раскладка в `localStorage`) | `web/ColumnPicker.tsx`, `web/useColumnPrefs.ts` | Требование UI из `docs/UI_DECISIONS.md` |
| Плитки сводки по статусам и фильтр по ним | `web/PlanScreen.tsx` | Вариант «список производства по статусам» |
| Поиск VIN по началу/по последним цифрам | `Api/VinSearch.cs` | Решение РП (`docs/IMPLEMENTATION_REPORT.md`, п. 6.4) |
| Dev-аутентификация (cookie, loopback, Origin-check) | `Api/Program.cs` | ТЗ [В-04] авторизацию не определяет |
| Fail-closed защита SQL-режима (запрет базы `FormulaD`, логинов `sa`/`sa1`, флаг `Sql:IsTestEnvironment`) | `Api/SqlOptions.cs` | Постоянное ограничение проекта, не требование ТЗ |
| Диалог подтверждения FOK и кнопка «Отправить в Rework» прямо на FOK | `web/FokScreen.tsx` | Реализация [В-19]; диалог добавлен позже |
| Служба Windows (`UseWindowsService`) и `deploy/install-service.bat` | `Api/Program.cs`, `deploy/` | Эксплуатационная часть, ТЗ не упоминает |
| Скрипты стенда `stand/stand.sh` | `stand/` | Эксплуатационная часть |
| F7-редизайн: тема светлая/тёмная, сворачиваемый сайдбар | `web/f7-components.css`, `web/AppHeader.tsx`, `web/styles.css` | Интерфейсное решение, не требование ТЗ |
| Диалог переноса на позицию `MoveDialog` с предпросмотром, `Alt+↑/↓`, `F2` | `web/MoveDialog.tsx`, `web/PlanScreen.tsx` | Детализация раздела 7 |

## 6. Расхождения кода со спецификацией

### 6.1 Осознанные решения (зафиксированы в документах)

| # | Что | Решение |
|---|---|---|
| 1 | Перестановка плана: немедленное сохранение вместо «Сохранить/Отменить» (раздел 7 [С]) | РП 27.10.2026: остаётся текущая реализация. `docs/SPEC_GAP_ANALYSIS.md`, `docs/REORDER_DESIGN.md` |
| 2 | Завершение сборки не блокируется NCP | Соответствует [П] раздела 13; тест `Complete_Is_Not_Blocked_By_Open_Ncp` |

### 6.2 Неосознанные расхождения и дефекты (найдены при составлении)

| # | Расхождение | Где | Влияние |
|---|---|---|---|
| 1 | **Лента станций на FOK всегда «все выполнены»**: `state: 'done' as const` для каждой станции, реальные отметки/NCP не учитываются | `web/FokScreen.tsx`, `routeSteps` | Оператор видит успех там, где его может не быть. Лента не соответствует разделам 11, 16 |
| 2 | **SQL-режим не воспроизводит правило «деталь установлена»**: колонки `PartInstalled` нет, `GetMissingRequiredPartsAsync` берёт открытые NCP (`Status = 1`), `SetPartInstalledAsync` меняет `Status` | `Api/SqlNcpStore.cs` | В SQL блокировка FOK и Rework зависит от статуса заявки, а не от факта установки — противоречит разделу 16 и тесту `PartInstalled_Is_Separate_From_Status` (тест — на Demo) |
| 3 | **Журнал событий не доступен и не персистентен**, но документы описывают его как работающий («кто, когда и что изменил») | `Api/EventLog.cs`, `Api/Program.cs` | Требования раздела 25 выполнены только записью в память; для аудита непригоден |
| 4 | **Красный знак незакрытой доустановки не показывается в плане и карточке изделия** | `web/PlanScreen.tsx`, `web/ProductCard.tsx` | Раздел 16: знак должен быть на всех экранах |
| 5 | **Временные области импорта (план, Packing List) живут в памяти** даже в SQL-режиме | `Api/SqlPlanImport.cs`, `Api/SqlIncomingInspection.cs` | Перезапуск API теряет незавершённую загрузку; физических `production_plan_temp`/`tblPL_Lines_TEMP` нет |
| 6 | **Проверка артикула сканером в коробке не реализована**, хотя раздел 21 и AT-22 описывают это как основной сценарий | `web/PackageDialog.tsx` | Входной контроль работает только с ручным вводом |
| 7 | **«Поднять/Опустить» во временном плане отсутствуют** | `web/ImportScreen.tsx` | Раздел 7 первая часть, AT-06 частично |
| 8 | **Звуковых подтверждений нет** | — | Раздел 9, шаги 3 и 5; раздел 1 |
| 9 | **Нет номера шасси и `rowversion`** | `Api/Models.cs` | Раздел 4; AT-30 |
| 10 | **Ролей и персональных учёток нет** | `Api/Program.cs` | Разделы 3, 12; все операции доступны любому авторизованному |
| 11 | **Прозрачность по `.xlsx`**: файл Excel не разбирается, только CSV/TSV | `web/importParse.ts` | Раздел 6.1 («выбор Excel-файла») |
| 12 | **Нет frontend-теста для `CompleteScreen`** | `web/CompleteScreen.tsx` | Покрытие только через общий `ScanTransitionScreen` |
| 13 | `Move` разрешён для любого статуса (в том числе уже запущенных и прошедших FOK) | `DemoProductionPlanReader.MoveAsync`, `SqlPlanOrderEditor` | Раздел 7 [П] советует блокировать, но не утверждено (В-11) |

## 7. Сводная статистика

Подсчёт — по столбцу «Статус» таблиц разделов 1–28 (раздел 2 настоящего документа) и по таблице AT. Комбинированные статусы вида «Реализовано (Demo) / Частично (SQL)» учтены как **Частично**, так как полноценной реализации в SQL-режиме нет.

<!-- STATS-BEGIN -->
СТАТИСТИКА_ЗАГЛУШКА
<!-- STATS-END -->

**Как пользоваться этой матрицей при доработке.** Начинайте с расхождений [6.2](#62-неосознанные-расхождения-и-дефекты-найдены-при-составлении): пункты 1, 2 и 4 влияют на достоверность того, что видит оператор, пункты 5–8 — на соответствие основным сценариям ТЗ. Перед изменением правил статусов и блокировок прочтите [03-DOMAIN-MODEL](03-DOMAIN-MODEL.md); при добавлении эндпоинтов — [04-API-REFERENCE](04-API-REFERENCE.md) и [05-BACKEND-GUIDE](05-BACKEND-GUIDE.md).
