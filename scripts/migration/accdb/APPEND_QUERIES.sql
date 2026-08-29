-- ============================================================================
-- ЗАПРОСЫ НА ДОБАВЛЕНИЕ: локальные таблицы -> связанные таблицы SQL Server
-- ============================================================================
-- Как использовать:
--   Создание -> Конструктор запросов -> закрыть окно "Добавление таблицы"
--   -> Режим SQL -> вставить ОДИН запрос -> Выполнить (!)
--
-- Access сам сообщит: "Добавление N записей" и отдельно предупредит,
-- сколько записей НЕ добавлено из-за нарушений ключа / типов / NULL.
-- Именно эти предупреждения молча терял VBA-макрос.
--
-- Форма LEFT JOIN ... IS NULL используется вместо NOT EXISTS:
-- в Jet/ACE она надёжнее и быстрее на связанных ODBC-таблицах.
--
-- Порядок важен: справочники -> основные -> производство -> качество.
-- ============================================================================


-- ============================================================================
-- ЭТАП 1: СПРАВОЧНИКИ
-- ============================================================================

-- 1. tblRole
INSERT INTO dbo_tblRole ( ID, RoleName, Description, IsActive )
SELECT src.ID, src.RoleName, src.Description, src.IsActive
FROM tblRole AS src LEFT JOIN dbo_tblRole AS dst ON src.ID = dst.ID
WHERE dst.ID IS NULL;


-- 2. tblStatus
INSERT INTO dbo_tblStatus ( id, statusid, statename )
SELECT src.id, src.statusid, src.statename
FROM tblStatus AS src LEFT JOIN dbo_tblStatus AS dst ON src.id = dst.id
WHERE dst.id IS NULL;


-- 3. tblColors
INSERT INTO dbo_tblColors ( id, color )
SELECT src.id, src.color
FROM tblColors AS src LEFT JOIN dbo_tblColors AS dst ON src.id = dst.id
WHERE dst.id IS NULL;


-- 4. tblDiscrepancyList
INSERT INTO dbo_tblDiscrepancyList ( id, discrepancy )
SELECT src.id, src.discrepancy
FROM tblDiscrepancyList AS src LEFT JOIN dbo_tblDiscrepancyList AS dst ON src.id = dst.id
WHERE dst.id IS NULL;


-- ============================================================================
-- ЭТАП 2: ОСНОВНЫЕ СПРАВОЧНЫЕ ДАННЫЕ
-- ============================================================================

-- 5. tblUser
INSERT INTO dbo_tblUser ( ID, Login, PasswordHash, FullName, UserRole, IsActive, Email, Phone )
SELECT src.ID, src.Login, src.PasswordHash, src.FullName, src.UserRole, src.IsActive, src.Email, src.Phone
FROM tblUser AS src LEFT JOIN dbo_tblUser AS dst ON src.ID = dst.ID
WHERE dst.ID IS NULL;


-- 6. tblSpecifications  (без id_assembly - поля нет в целевой таблице)
INSERT INTO dbo_tblSpecifications ( id, specificationName, valid, ModelArticle )
SELECT src.id, src.specificationName, src.valid, src.ModelArticle
FROM tblSpecifications AS src LEFT JOIN dbo_tblSpecifications AS dst ON src.id = dst.id
WHERE dst.id IS NULL;


-- 7. tblComponent
INSERT INTO dbo_tblComponent ( id, ComponentCode, ComponentName, ComponentName_RUS, PointOfPart, StationID, StandardQty, IsMandatory, Supplier )
SELECT src.ID, src.ComponentCode, src.ComponentName, src.ComponentName_RUS, src.PointOfPart, src.StationID, src.StandardQty, src.IsMandatory, src.Supplier
FROM tblComponent AS src LEFT JOIN dbo_tblComponent AS dst ON src.ID = dst.id
WHERE dst.id IS NULL;


-- 8. tblConnections  (локальный ключ "Код" -> серверный "id")
INSERT INTO dbo_tblConnections ( id, [Критические соединения], [Кол-во соединений], Станция, Код_колмплектации, [Станция проверки] )
SELECT src.Код, src.[Критические соединения], src.[Кол-во соединений], src.Станция, src.Код_колмплектации, src.[Станция проверки]
FROM tblConnections AS src LEFT JOIN dbo_tblConnections AS dst ON src.Код = dst.id
WHERE dst.id IS NULL;


-- ============================================================================
-- ЭТАП 3: ПРОИЗВОДСТВЕННЫЕ ДАННЫЕ
-- ============================================================================

-- 9. tblProductionPlan  (сверка по VIN - серверные ID заняты другими записями,
--    join по ID давал ложные совпадения и новые строки не доезжали)
INSERT INTO dbo_tblProductionPlan ( ID, ModelArticle, ModelName, VIN, EngineNumber, Color, PlannedShipmentDate, ValidationStatus, ErrorMessage, StartDate, CompleteDate, plannedstartdate, Status, Specification_id, SpecificationName, ColorID, SEQN, NEWSEQN, statusid, PrintDate, validationdate, shipmentdate, reworkdate, reworkcompletedate, rework_comments, shipment_comments )
SELECT src.ID, src.ModelArticle, src.ModelName, src.VIN, src.EngineNumber, src.Color, src.PlannedShipmentDate, src.ValidationStatus, src.ErrorMessage, src.StartDate, src.CompleteDate, src.plannedstartdate, src.Status, src.Specification_id, src.SpecificationName, src.ColorID, src.SEQN, src.NEWSEQN, src.statusid, src.PrintDate, src.validationdate, src.shipmentdate, src.reworkdate, src.reworkcompletedate, src.rework_comments, src.shipment_comments
FROM tblProductionPlan AS src LEFT JOIN dbo_tblProductionPlan AS dst ON src.VIN = dst.VIN
WHERE dst.VIN IS NULL;
-- Без Left(): ModelName и ErrorMessage на сервере расширены под исходные размеры.


-- 10. tblPlanTemp
INSERT INTO dbo_tblPlanTemp ( TempID, OriginalID, VIN, ModelArticle, ModelName, Color, EngineNumber, Status, NEWSEQN, DisplaySeq, statusid )
SELECT src.TempID, src.OriginalID, src.VIN, src.ModelArticle, src.ModelName, src.Color, src.EngineNumber, src.Status, src.NEWSEQN, src.DisplaySeq, src.statusid
FROM tblPlanTemp AS src LEFT JOIN dbo_tblPlanTemp AS dst ON src.TempID = dst.TempID
WHERE dst.TempID IS NULL;


-- 11. tblProductionOrder
INSERT INTO dbo_tblProductionOrder ( ID, PlanID, VIN, EngineNumber, ModelArticle, ModelName, Color, PlannedShipmentDate, OrderStatus, CurrentStation, AssemblyStartTime, AssemblyEndTime )
SELECT src.ID, src.PlanID, src.VIN, src.EngineNumber, src.ModelArticle, src.ModelName, src.Color, src.PlannedShipmentDate, src.OrderStatus, src.CurrentStation, src.AssemblyStartTime, src.AssemblyEndTime
FROM tblProductionOrder AS src LEFT JOIN dbo_tblProductionOrder AS dst ON src.ID = dst.ID
WHERE dst.ID IS NULL;


-- 12. tblUpdColor  (ключ - vin)
INSERT INTO dbo_tblUpdColor ( vin, color )
SELECT src.vin, src.color
FROM tblUpdColor AS src LEFT JOIN dbo_tblUpdColor AS dst ON src.vin = dst.vin
WHERE dst.vin IS NULL;


-- 13. tblImportplan
INSERT INTO dbo_tblImportplan ( F1, арт, название, вин, [номер двс], [цвет согласованный], [готов к отгрузке], [Плановая дата готовности к отгрузке], [Дата отгрузки фактическая], id )
SELECT src.F1, src.арт, src.название, src.вин, src.[номер двс], src.[цвет согласованный], src.[готов к отгрузке], src.[Плановая дата готовности к отгрузке], src.[Дата отгрузки фактическая], src.id
FROM tblImportplan AS src LEFT JOIN dbo_tblImportplan AS dst ON src.id = dst.id
WHERE dst.id IS NULL;


-- ============================================================================
-- ЭТАП 4: КОНТРОЛЬ КАЧЕСТВА
-- ============================================================================

-- 14. tblNCP
--     id на сервере - IDENTITY: явную вставку не принимает, поэтому колонка
--     не переносится, номер выдаёт сервер. Сверка по VIN.
INSERT INTO dbo_tblNCP ( StationID, ComponentID, VIN, Quantity, DiscrepancyTypeID, Comment, Status, CreatedBy, CreatedAt, ClosedBy, ClosedAt )
SELECT src.StationID, src.ComponentID, src.VIN, src.Quantity, src.DiscrepancyTypeID, src.Comment, src.Status, src.CreatedBy, src.CreatedAt, src.ClosedBy, src.ClosedAt
FROM tblNCP AS src LEFT JOIN dbo_tblNCP AS dst ON src.VIN = dst.VIN
WHERE dst.VIN IS NULL;


-- 15. tblDiscrepancy  (Comment -> 250, PhotoPath -> 50)
INSERT INTO dbo_tblDiscrepancy ( id, AssemblyEventID, ComponentID, DiscrepancyType, Comment, WasReplaced, DetectionTime, ResolutionTime, DiscrepancyStatus, NCP_Number, PhotoPath )
SELECT src.ID, src.AssemblyEventID, src.ComponentID, src.DiscrepancyType, Left(src.Comment,250), src.WasReplaced, src.DetectionTime, src.ResolutionTime, src.DiscrepancyStatus, src.NCP_Number, Left(src.PhotoPath,50)
FROM tblDiscrepancy AS src LEFT JOIN dbo_tblDiscrepancy AS dst ON src.ID = dst.id
WHERE dst.id IS NULL;


-- 16. tblCrippleRecord
INSERT INTO dbo_tblCrippleRecord ( ID, OrderID, DiscrepancyID, ComponentID, CrippleReason, RegistrationDate, ExpectedResolutionDate, StorageLocation )
SELECT src.ID, src.OrderID, src.DiscrepancyID, src.ComponentID, src.CrippleReason, src.RegistrationDate, src.ExpectedResolutionDate, src.StorageLocation
FROM tblCrippleRecord AS src LEFT JOIN dbo_tblCrippleRecord AS dst ON src.ID = dst.ID
WHERE dst.ID IS NULL;


-- 17. tblJobCard
INSERT INTO dbo_tblJobCard ( ID, OrderID, JobCardNumber, PrintDate, CardStatus, BarcodeData )
SELECT src.ID, src.OrderID, src.JobCardNumber, src.PrintDate, src.CardStatus, src.BarcodeData
FROM tblJobCard AS src LEFT JOIN dbo_tblJobCard AS dst ON src.ID = dst.ID
WHERE dst.ID IS NULL;


-- 18. tblImportLog  (FileName -> 50)
INSERT INTO dbo_tblImportLog ( ID, ImportDate, FileName, ImportedBy, RowsImported, RowsFailed, ErrorDescription, ImportBatchID )
SELECT src.ID, src.ImportDate, Left(src.FileName,50), src.ImportedBy, src.RowsImported, src.RowsFailed, src.ErrorDescription, src.ImportBatchID
FROM tblImportLog AS src LEFT JOIN dbo_tblImportLog AS dst ON src.ID = dst.ID
WHERE dst.ID IS NULL;


-- ============================================================================
-- ПРОВЕРОЧНЫЕ ЗАПРОСЫ (на выборку, ничего не меняют)
-- ============================================================================

-- Что не доехало по tblProductionPlan - ключевой запрос для отладки
SELECT src.ID, src.VIN, src.ModelArticle, src.ModelName
FROM tblProductionPlan AS src LEFT JOIN dbo_tblProductionPlan AS dst ON src.ID = dst.ID
WHERE dst.ID IS NULL;


-- Сверка количества: локально против сервера
SELECT "tblProductionPlan" AS Таблица,
       (SELECT Count(*) FROM tblProductionPlan) AS Локально,
       (SELECT Count(*) FROM dbo_tblProductionPlan) AS НаСервере
UNION ALL SELECT "tblComponent", (SELECT Count(*) FROM tblComponent), (SELECT Count(*) FROM dbo_tblComponent)
UNION ALL SELECT "tblConnections", (SELECT Count(*) FROM tblConnections), (SELECT Count(*) FROM dbo_tblConnections)
UNION ALL SELECT "tblNCP", (SELECT Count(*) FROM tblNCP), (SELECT Count(*) FROM dbo_tblNCP)
UNION ALL SELECT "tblRole", (SELECT Count(*) FROM tblRole), (SELECT Count(*) FROM dbo_tblRole)
UNION ALL SELECT "tblUser", (SELECT Count(*) FROM tblUser), (SELECT Count(*) FROM dbo_tblUser)
UNION ALL SELECT "tblColors", (SELECT Count(*) FROM tblColors), (SELECT Count(*) FROM dbo_tblColors)
UNION ALL SELECT "tblStatus", (SELECT Count(*) FROM tblStatus), (SELECT Count(*) FROM dbo_tblStatus)
UNION ALL SELECT "tblSpecifications", (SELECT Count(*) FROM tblSpecifications), (SELECT Count(*) FROM dbo_tblSpecifications);


-- ============================================================================
-- ЕСЛИ ЗАПРОС ГОВОРИТ "0 записей добавлено", А ЗАПИСИ ЯВНО НЕ ХВАТАЕТ
-- ============================================================================
-- Наиболее вероятная причина: на SQL Server поле ID объявлено как IDENTITY.
-- Тогда явная вставка ID отклоняется, и Access рапортует потерю записей.
--
-- Проверка: открыть dbo_tblProductionPlan в режиме конструктора (или
-- посмотреть на сервере) - если ID это IDENTITY, есть два пути:
--
--   Путь А. Не вставлять ID, пусть сервер выдаёт свой:
--       INSERT INTO dbo_tblProductionPlan ( ModelArticle, ModelName, VIN, ... )
--       SELECT src.ModelArticle, src.ModelName, src.VIN, ...
--       FROM tblProductionPlan AS src LEFT JOIN dbo_tblProductionPlan AS dst
--            ON src.VIN = dst.VIN
--       WHERE dst.VIN IS NULL;
--       (сверка по VIN вместо ID; ссылки по ID придётся пересчитать)
--
--   Путь Б. На сервере разрешить явную вставку - выполнить в SSMS:
--       SET IDENTITY_INSERT dbo.tblProductionPlan ON;
--       -- запустить запрос на добавление из Access
--       SET IDENTITY_INSERT dbo.tblProductionPlan OFF;
--       (IDENTITY_INSERT действует только в рамках одной сессии SSMS,
--        поэтому через Access этот путь не работает - нужен прямой перенос
--        на сервере или временное снятие IDENTITY с колонки)
-- ============================================================================
