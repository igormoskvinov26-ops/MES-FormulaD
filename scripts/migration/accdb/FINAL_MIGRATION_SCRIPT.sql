-- ============================================================================
-- ФИНАЛЬНЫЙ СКРИПТ МИГРАЦИИ: MES_server.accdb → FormulaD (SQL Server)
-- 18 совпадающих таблиц (из 20 в старой базе)
-- ============================================================================
-- ВАЖНО:
-- 1. Сделайте резервную копию перед запуском
-- 2. Проверьте что все таблицы существуют на SQL Server
-- 3. Этот скрипт пропускает: tblAssemblyEvent, tblStation (не найдены)
-- ============================================================================

SET NOCOUNT ON;

PRINT '=============================================================================';
PRINT 'ФИНАЛЬНАЯ МИГРАЦИЯ ДАННЫХ: MES_server.accdb → FormulaD';
PRINT '=============================================================================';
PRINT 'Дата/время: ' + CONVERT(VARCHAR(20), GETDATE(), 121);
PRINT '';

-- ============================================================================
-- ШАГ 1: ОТКЛЮЧАЕМ FOREIGN KEY ОГРАНИЧЕНИЯ
-- ============================================================================
PRINT 'Шаг 1: Отключаем FOREIGN KEY ограничения...';

ALTER TABLE tblNCP NOCHECK CONSTRAINT ALL;
ALTER TABLE tblDiscrepancy NOCHECK CONSTRAINT ALL;
ALTER TABLE tblCrippleRecord NOCHECK CONSTRAINT ALL;
ALTER TABLE tblImportLog NOCHECK CONSTRAINT ALL;
ALTER TABLE tblJobCard NOCHECK CONSTRAINT ALL;
ALTER TABLE tblProductionOrder NOCHECK CONSTRAINT ALL;
ALTER TABLE tblConnections NOCHECK CONSTRAINT ALL;
ALTER TABLE tblComponent NOCHECK CONSTRAINT ALL;
ALTER TABLE tblPlanTemp NOCHECK CONSTRAINT ALL;

PRINT '✅ Все ограничения отключены.';
PRINT '';

-- ============================================================================
-- ШАГ 2: ВСТАВЛЯЕМ СПРАВОЧНИКИ (без зависимостей)
-- ============================================================================
PRINT 'Шаг 2: Вставляем справочники...';
PRINT '';

-- tblRole
PRINT 'Миграция: tblRole';
INSERT INTO tblRole (ID, RoleName, Description, IsActive)
SELECT ID, RoleName, Description, IsActive
FROM [MES_server.accdb].dbo.tblRole src
WHERE NOT EXISTS (SELECT 1 FROM tblRole dst WHERE dst.ID = src.ID);
PRINT '  Вставлено: ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' записей';

-- tblStatus
PRINT 'Миграция: tblStatus';
INSERT INTO tblStatus (id, statusid, statename)
SELECT id, statusid, statename
FROM [MES_server.accdb].dbo.tblStatus src
WHERE NOT EXISTS (SELECT 1 FROM tblStatus dst WHERE dst.id = src.id);
PRINT '  Вставлено: ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' записей';

-- tblColors
PRINT 'Миграция: tblColors';
INSERT INTO tblColors (id, color, isActive)
SELECT id, color, 1 -- isActive по умолчанию 1 (активен)
FROM [MES_server.accdb].dbo.tblColors src
WHERE NOT EXISTS (SELECT 1 FROM tblColors dst WHERE dst.id = src.id);
PRINT '  Вставлено: ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' записей';

-- tblDiscrepancyList
PRINT 'Миграция: tblDiscrepancyList';
INSERT INTO tblDiscrepancyList (id, discrepancy)
SELECT id, discrepancy
FROM [MES_server.accdb].dbo.tblDiscrepancyList src
WHERE NOT EXISTS (SELECT 1 FROM tblDiscrepancyList dst WHERE dst.id = src.id);
PRINT '  Вставлено: ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' записей';

PRINT '';

-- ============================================================================
-- ШАГ 3: ВСТАВЛЯЕМ ОСНОВНЫЕ СПРАВОЧНЫЕ ДАННЫЕ
-- ============================================================================
PRINT 'Шаг 3: Вставляем основные справочные данные...';
PRINT '';

-- tblUser
PRINT 'Миграция: tblUser';
INSERT INTO tblUser (ID, Login, PasswordHash, FullName, UserRole, IsActive, Email, Phone)
SELECT ID, Login, PasswordHash, FullName, UserRole, IsActive, Email, Phone
FROM [MES_server.accdb].dbo.tblUser src
WHERE NOT EXISTS (SELECT 1 FROM tblUser dst WHERE dst.ID = src.ID);
PRINT '  Вставлено: ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' записей';

-- tblSpecifications
PRINT 'Миграция: tblSpecifications';
INSERT INTO tblSpecifications (id, specificationName, valid, ModelArticle, id_assembly)
SELECT id, specificationName, valid, ModelArticle, Id_assembly
FROM [MES_server.accdb].dbo.tblSpecifications src
WHERE NOT EXISTS (SELECT 1 FROM tblSpecifications dst WHERE dst.id = src.id);
PRINT '  Вставлено: ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' записей';

-- tblComponent
PRINT 'Миграция: tblComponent';
INSERT INTO tblComponent (id, ComponentCode, ComponentName, ComponentName_RUS, PointOfPart, StationID, StandardQty, IsMandatory, Supplier)
SELECT ID, ComponentCode, ComponentName, ComponentName_RUS, PointOfPart, StationID, StandardQty, IsMandatory, Supplier
FROM [MES_server.accdb].dbo.tblComponent src
WHERE NOT EXISTS (SELECT 1 FROM tblComponent dst WHERE dst.id = src.ID);
PRINT '  Вставлено: ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' записей';

-- tblConnections
PRINT 'Миграция: tblConnections';
INSERT INTO tblConnections (id, [Критические соединения], [Кол-во соединений], Станция, Код_колмплектации, [Станция проверки])
SELECT Код, [Критические соединения], [Кол-во соединений], Станция, Код_колмплектации, [Станция проверки]
FROM [MES_server.accdb].dbo.tblConnections src
WHERE NOT EXISTS (SELECT 1 FROM tblConnections dst WHERE dst.id = src.Код);
PRINT '  Вставлено: ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' записей';

PRINT '';

-- ============================================================================
-- ШАГ 4: ВСТАВЛЯЕМ ПРОИЗВОДСТВЕННЫЕ ДАННЫЕ
-- ============================================================================
PRINT 'Шаг 4: Вставляем производственные данные...';
PRINT '';

-- tblProductionPlan
PRINT 'Миграция: tblProductionPlan';
INSERT INTO tblProductionPlan (
    ID, ModelArticle, ModelName, VIN, EngineNumber, Color,
    PlannedShipmentDate, ValidationStatus, ErrorMessage, StartDate, CompleteDate,
    plannedstartdate, Status, Specification_id, SpecificationName, ColorID,
    SEQN, NEWSEQN, statusid, PrintDate, validationdate, shipmentdate,
    reworkdate, reworkcompletedate, rework_comments, shipment_comments
)
SELECT
    ID, ModelArticle, ModelName, VIN, EngineNumber, Color,
    PlannedShipmentDate, ValidationStatus, ErrorMessage, StartDate, CompleteDate,
    plannedstartdate, Status, Specification_id, SpecificationName, ColorID,
    SEQN, NEWSEQN, statusid, PrintDate, validationdate, shipmentdate,
    reworkdate, reworkcompletedate, rework_comments, shipment_comments
FROM [MES_server.accdb].dbo.tblProductionPlan src
WHERE NOT EXISTS (SELECT 1 FROM tblProductionPlan dst WHERE dst.ID = src.ID);
PRINT '  Вставлено: ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' записей';

-- tblPlanTemp
PRINT 'Миграция: tblPlanTemp';
INSERT INTO tblPlanTemp (TempID, OriginalID, VIN, ModelArticle, ModelName, Color, EngineNumber, Status, NEWSEQN, DisplaySeq, statusid)
SELECT TempID, OriginalID, VIN, ModelArticle, ModelName, Color, EngineNumber, Status, NEWSEQN, DisplaySeq, statusid
FROM [MES_server.accdb].dbo.tblPlanTemp src
WHERE NOT EXISTS (SELECT 1 FROM tblPlanTemp dst WHERE dst.TempID = src.TempID);
PRINT '  Вставлено: ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' записей';

-- tblProductionOrder
PRINT 'Миграция: tblProductionOrder';
INSERT INTO tblProductionOrder (ID, PlanID, VIN, EngineNumber, ModelArticle, ModelName, Color, PlannedShipmentDate, OrderStatus, CurrentStation, AssemblyStartTime, AssemblyEndTime)
SELECT ID, PlanID, VIN, EngineNumber, ModelArticle, ModelName, Color, PlannedShipmentDate, OrderStatus, CurrentStation, AssemblyStartTime, AssemblyEndTime
FROM [MES_server.accdb].dbo.tblProductionOrder src
WHERE NOT EXISTS (SELECT 1 FROM tblProductionOrder dst WHERE dst.ID = src.ID);
PRINT '  Вставлено: ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' записей';

-- tblUpdColor
PRINT 'Миграция: tblUpdColor';
INSERT INTO tblUpdColor (vin, color)
SELECT vin, color
FROM [MES_server.accdb].dbo.tblUpdColor src
WHERE NOT EXISTS (SELECT 1 FROM tblUpdColor dst WHERE dst.vin = src.vin);
PRINT '  Вставлено: ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' записей';

-- tblImportplan
PRINT 'Миграция: tblImportplan';
INSERT INTO tblImportplan (F1, арт, название, вин, [номер двс], [цвет согласованный], [готов к отгрузке], [Плановая дата готовности к отгрузке], [Дата отгрузки фактическая], id)
SELECT F1, арт, название, вин, [номер двс], [цвет согласованный], [готов к отгрузке], [Плановая дата готовности к отгрузке], [Дата отгрузки фактическая], id
FROM [MES_server.accdb].dbo.tblImportplan src
WHERE NOT EXISTS (SELECT 1 FROM tblImportplan dst WHERE dst.id = src.id);
PRINT '  Вставлено: ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' записей';

PRINT '';

-- ============================================================================
-- ШАГ 5: ВСТАВЛЯЕМ ДАННЫЕ КОНТРОЛЯ КАЧЕСТВА (с урезанием полей если нужно)
-- ============================================================================
PRINT 'Шаг 5: Вставляем данные контроля качества...';
PRINT '';

-- tblNCP
PRINT 'Миграция: tblNCP';
INSERT INTO tblNCP (id, StationID, ComponentID, VIN, Quantity, DiscrepancyTypeID, Comment, Status, CreatedBy, CreatedAt, ClosedBy, ClosedAt)
SELECT
    ID, StationID, ComponentID, VIN, Quantity, DiscrepancyTypeID,
    LEFT(Comment, 50) AS Comment,  -- Урезать до 50 символов
    Status, LEFT(CreatedBy, 50) AS CreatedBy, CreatedAt, LEFT(ClosedBy, 50) AS ClosedBy, ClosedAt
FROM [MES_server.accdb].dbo.tblNCP src
WHERE NOT EXISTS (SELECT 1 FROM tblNCP dst WHERE dst.id = src.ID);
PRINT '  Вставлено: ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' записей';

-- tblDiscrepancy
PRINT 'Миграция: tblDiscrepancy';
INSERT INTO tblDiscrepancy (id, AssemblyEventID, ComponentID, DiscrepancyType, Comment, WasReplaced, DetectionTime, ResolutionTime, DiscrepancyStatus, NCP_Number, PhotoPath)
SELECT
    ID, AssemblyEventID, ComponentID, DiscrepancyType,
    LEFT(Comment, 250) AS Comment,  -- Урезать до 250 символов
    WasReplaced, DetectionTime, ResolutionTime, DiscrepancyStatus, NCP_Number,
    LEFT(PhotoPath, 50) AS PhotoPath  -- Урезать до 50 символов
FROM [MES_server.accdb].dbo.tblDiscrepancy src
WHERE NOT EXISTS (SELECT 1 FROM tblDiscrepancy dst WHERE dst.id = src.ID);
PRINT '  Вставлено: ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' записей';

-- tblCrippleRecord
PRINT 'Миграция: tblCrippleRecord';
INSERT INTO tblCrippleRecord (ID, OrderID, DiscrepancyID, ComponentID, CrippleReason, RegistrationDate, ExpectedResolutionDate, StorageLocation)
SELECT ID, OrderID, DiscrepancyID, ComponentID, CrippleReason, RegistrationDate, ExpectedResolutionDate, StorageLocation
FROM [MES_server.accdb].dbo.tblCrippleRecord src
WHERE NOT EXISTS (SELECT 1 FROM tblCrippleRecord dst WHERE dst.ID = src.ID);
PRINT '  Вставлено: ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' записей';

-- tblJobCard
PRINT 'Миграция: tblJobCard';
INSERT INTO tblJobCard (ID, OrderID, JobCardNumber, PrintDate, CardStatus, BarcodeData)
SELECT ID, OrderID, JobCardNumber, PrintDate, CardStatus, BarcodeData
FROM [MES_server.accdb].dbo.tblJobCard src
WHERE NOT EXISTS (SELECT 1 FROM tblJobCard dst WHERE dst.ID = src.ID);
PRINT '  Вставлено: ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' записей';

-- tblImportLog
PRINT 'Миграция: tblImportLog';
INSERT INTO tblImportLog (ID, ImportDate, FileName, ImportedBy, RowsImported, RowsFailed, ErrorDescription, ImportBatchID)
SELECT
    ID, ImportDate,
    LEFT(FileName, 50) AS FileName,  -- Урезать до 50 символов
    ImportedBy, RowsImported, RowsFailed, ErrorDescription, ImportBatchID
FROM [MES_server.accdb].dbo.tblImportLog src
WHERE NOT EXISTS (SELECT 1 FROM tblImportLog dst WHERE dst.ID = src.ID);
PRINT '  Вставлено: ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' записей';

PRINT '';

-- ============================================================================
-- ШАГ 6: ВКЛЮЧАЕМ FOREIGN KEY ОГРАНИЧЕНИЯ ОБРАТНО
-- ============================================================================
PRINT 'Шаг 6: Включаем FOREIGN KEY ограничения обратно...';

ALTER TABLE tblNCP CHECK CONSTRAINT ALL;
ALTER TABLE tblDiscrepancy CHECK CONSTRAINT ALL;
ALTER TABLE tblCrippleRecord CHECK CONSTRAINT ALL;
ALTER TABLE tblImportLog CHECK CONSTRAINT ALL;
ALTER TABLE tblJobCard CHECK CONSTRAINT ALL;
ALTER TABLE tblProductionOrder CHECK CONSTRAINT ALL;
ALTER TABLE tblConnections CHECK CONSTRAINT ALL;
ALTER TABLE tblComponent CHECK CONSTRAINT ALL;
ALTER TABLE tblPlanTemp CHECK CONSTRAINT ALL;

PRINT '✅ Все ограничения включены.';
PRINT '';

-- ============================================================================
-- ШАГ 7: ОБНОВЛЯЕМ IDENTITY СЧЕТЧИКИ
-- ============================================================================
PRINT 'Шаг 7: Обновляем IDENTITY счетчики...';
PRINT '';

-- Сброс identity для всех таблиц
EXEC sp_MSForEachTable @command1='DBCC CHECKIDENT (''[?]'') WITH REPAIR_ALLOW_DATA_LOSS'
WHERE name NOT LIKE 'tbl%' OR name LIKE 'sys%';

PRINT '✅ IDENTITY счетчики обновлены.';
PRINT '';

-- ============================================================================
-- ШАГ 8: ПРОВЕРКА РЕЗУЛЬТАТОВ
-- ============================================================================
PRINT 'Шаг 8: Проверка результатов миграции...';
PRINT '';

SELECT
    'tblColors' AS TableName, COUNT(*) AS RecordCount FROM tblColors
UNION ALL
SELECT 'tblComponent', COUNT(*) FROM tblComponent
UNION ALL
SELECT 'tblConnections', COUNT(*) FROM tblConnections
UNION ALL
SELECT 'tblCrippleRecord', COUNT(*) FROM tblCrippleRecord
UNION ALL
SELECT 'tblDiscrepancy', COUNT(*) FROM tblDiscrepancy
UNION ALL
SELECT 'tblDiscrepancyList', COUNT(*) FROM tblDiscrepancyList
UNION ALL
SELECT 'tblImportLog', COUNT(*) FROM tblImportLog
UNION ALL
SELECT 'tblImportplan', COUNT(*) FROM tblImportplan
UNION ALL
SELECT 'tblJobCard', COUNT(*) FROM tblJobCard
UNION ALL
SELECT 'tblNCP', COUNT(*) FROM tblNCP
UNION ALL
SELECT 'tblPlanTemp', COUNT(*) FROM tblPlanTemp
UNION ALL
SELECT 'tblProductionOrder', COUNT(*) FROM tblProductionOrder
UNION ALL
SELECT 'tblProductionPlan', COUNT(*) FROM tblProductionPlan
UNION ALL
SELECT 'tblRole', COUNT(*) FROM tblRole
UNION ALL
SELECT 'tblSpecifications', COUNT(*) FROM tblSpecifications
UNION ALL
SELECT 'tblStatus', COUNT(*) FROM tblStatus
UNION ALL
SELECT 'tblUpdColor', COUNT(*) FROM tblUpdColor
UNION ALL
SELECT 'tblUser', COUNT(*) FROM tblUser
ORDER BY TableName;

PRINT '';
PRINT '=============================================================================';
PRINT '✅ МИГРАЦИЯ ЗАВЕРШЕНА УСПЕШНО!';
PRINT '=============================================================================';
PRINT 'Дата/время: ' + CONVERT(VARCHAR(20), GETDATE(), 121);
PRINT '';
PRINT 'ПРОПУЩЕНЫ (не найдены в целевой базе):';
PRINT '  • tblAssemblyEvent';
PRINT '  • tblStation';
PRINT '';
PRINT 'ВНИМАНИЕ: Некоторые поля были урезаны (Comment, PhotoPath, FileName)';
PRINT 'Проверьте данные на предмет потери информации!';
PRINT '';

SET NOCOUNT OFF;
