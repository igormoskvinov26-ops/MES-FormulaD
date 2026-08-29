' ============================================================================
' МИГРАЦИЯ ДАННЫХ: Локальные таблицы Access → Linked таблицы SQL Server (dbo_ версия)
' ============================================================================
' Версия: ИСПРАВЛЕННАЯ - удалены поля которых нет в целевых таблицах
' Назначение: Запустить в Access базе (MES_server.accdb)
' ============================================================================

Option Compare Database
Option Explicit

Sub MigrateDataToSQLServer_Corrected()
    On Error GoTo ErrorHandler

    Dim db As Object
    Dim startTime As Date
    Dim totalRecords As Long
    Dim reportText As String
    Dim recordsInserted As Long

    Set db = CurrentDb()
    startTime = Now()
    totalRecords = 0
    reportText = ""

    reportText = reportText & "=" & String(80, "=") & vbCrLf
    reportText = reportText & "МИГРАЦИЯ ДАННЫХ В SQL SERVER (ИСПРАВЛЕННАЯ ВЕРСИЯ)" & vbCrLf
    reportText = reportText & "Начало: " & Format(startTime, "dd.mm.yyyy hh:mm:ss") & vbCrLf
    reportText = reportText & "=" & String(80, "=") & vbCrLf & vbCrLf

    ' ========================================================================
    ' СПРАВОЧНИКИ
    ' ========================================================================
    reportText = reportText & "ЭТАП 1: СПРАВОЧНИКИ" & vbCrLf
    reportText = reportText & String(80, "-") & vbCrLf & vbCrLf

    recordsInserted = MigrateTable(db, "dbo_tblRole", "tblRole", _
        "INSERT INTO dbo_tblRole (ID, RoleName, Description, IsActive) " & _
        "SELECT ID, RoleName, Description, IsActive FROM tblRole AS src " & _
        "WHERE NOT EXISTS (SELECT 1 FROM dbo_tblRole AS dst WHERE dst.ID = src.ID)")
    totalRecords = totalRecords + recordsInserted
    reportText = reportText & "tblRole → dbo_tblRole: " & recordsInserted & " записей" & vbCrLf

    recordsInserted = MigrateTable(db, "dbo_tblStatus", "tblStatus", _
        "INSERT INTO dbo_tblStatus (id, statusid, statename) " & _
        "SELECT id, statusid, statename FROM tblStatus AS src " & _
        "WHERE NOT EXISTS (SELECT 1 FROM dbo_tblStatus AS dst WHERE dst.id = src.id)")
    totalRecords = totalRecords + recordsInserted
    reportText = reportText & "tblStatus → dbo_tblStatus: " & recordsInserted & " записей" & vbCrLf

    recordsInserted = MigrateTable(db, "dbo_tblColors", "tblColors", _
        "INSERT INTO dbo_tblColors (id, color) " & _
        "SELECT id, color FROM tblColors AS src " & _
        "WHERE NOT EXISTS (SELECT 1 FROM dbo_tblColors AS dst WHERE dst.id = src.id)")
    totalRecords = totalRecords + recordsInserted
    reportText = reportText & "tblColors → dbo_tblColors: " & recordsInserted & " записей" & vbCrLf

    recordsInserted = MigrateTable(db, "dbo_tblDiscrepancyList", "tblDiscrepancyList", _
        "INSERT INTO dbo_tblDiscrepancyList (id, discrepancy) " & _
        "SELECT id, discrepancy FROM tblDiscrepancyList AS src " & _
        "WHERE NOT EXISTS (SELECT 1 FROM dbo_tblDiscrepancyList AS dst WHERE dst.id = src.id)")
    totalRecords = totalRecords + recordsInserted
    reportText = reportText & "tblDiscrepancyList → dbo_tblDiscrepancyList: " & recordsInserted & " записей" & vbCrLf

    reportText = reportText & vbCrLf

    ' ========================================================================
    ' ОСНОВНЫЕ СПРАВОЧНЫЕ ДАННЫЕ
    ' ========================================================================
    reportText = reportText & "ЭТАП 2: ОСНОВНЫЕ СПРАВОЧНЫЕ ДАННЫЕ" & vbCrLf
    reportText = reportText & String(80, "-") & vbCrLf & vbCrLf

    recordsInserted = MigrateTable(db, "dbo_tblUser", "tblUser", _
        "INSERT INTO dbo_tblUser (ID, Login, PasswordHash, FullName, UserRole, IsActive, Email, Phone) " & _
        "SELECT ID, Login, PasswordHash, FullName, UserRole, IsActive, Email, Phone FROM tblUser AS src " & _
        "WHERE NOT EXISTS (SELECT 1 FROM dbo_tblUser AS dst WHERE dst.ID = src.ID)")
    totalRecords = totalRecords + recordsInserted
    reportText = reportText & "tblUser → dbo_tblUser: " & recordsInserted & " записей" & vbCrLf

    ' tblSpecifications БЕЗ id_assembly (поле может не существовать на SQL Server)
    recordsInserted = MigrateTable(db, "dbo_tblSpecifications", "tblSpecifications", _
        "INSERT INTO dbo_tblSpecifications (id, specificationName, valid, ModelArticle) " & _
        "SELECT id, specificationName, valid, ModelArticle FROM tblSpecifications AS src " & _
        "WHERE NOT EXISTS (SELECT 1 FROM dbo_tblSpecifications AS dst WHERE dst.id = src.id)")
    totalRecords = totalRecords + recordsInserted
    reportText = reportText & "tblSpecifications → dbo_tblSpecifications: " & recordsInserted & " записей" & vbCrLf

    recordsInserted = MigrateTable(db, "dbo_tblComponent", "tblComponent", _
        "INSERT INTO dbo_tblComponent (id, ComponentCode, ComponentName, ComponentName_RUS, PointOfPart, StationID, StandardQty, IsMandatory, Supplier) " & _
        "SELECT ID, ComponentCode, ComponentName, ComponentName_RUS, PointOfPart, StationID, StandardQty, IsMandatory, Supplier FROM tblComponent AS src " & _
        "WHERE NOT EXISTS (SELECT 1 FROM dbo_tblComponent AS dst WHERE dst.id = src.ID)")
    totalRecords = totalRecords + recordsInserted
    reportText = reportText & "tblComponent → dbo_tblComponent: " & recordsInserted & " записей" & vbCrLf

    recordsInserted = MigrateTable(db, "dbo_tblConnections", "tblConnections", _
        "INSERT INTO dbo_tblConnections (id, [Критические соединения], [Кол-во соединений], Станция, Код_колмплектации, [Станция проверки]) " & _
        "SELECT Код, [Критические соединения], [Кол-во соединений], Станция, Код_колмплектации, [Станция проверки] FROM tblConnections AS src " & _
        "WHERE NOT EXISTS (SELECT 1 FROM dbo_tblConnections AS dst WHERE dst.id = src.Код)")
    totalRecords = totalRecords + recordsInserted
    reportText = reportText & "tblConnections → dbo_tblConnections: " & recordsInserted & " записей" & vbCrLf

    reportText = reportText & vbCrLf

    ' ========================================================================
    ' ПРОИЗВОДСТВЕННЫЕ ДАННЫЕ
    ' ========================================================================
    reportText = reportText & "ЭТАП 3: ПРОИЗВОДСТВЕННЫЕ ДАННЫЕ" & vbCrLf
    reportText = reportText & String(80, "-") & vbCrLf & vbCrLf

    recordsInserted = MigrateTable(db, "dbo_tblProductionPlan", "tblProductionPlan", _
        "INSERT INTO dbo_tblProductionPlan (ID, ModelArticle, ModelName, VIN, EngineNumber, Color, PlannedShipmentDate, ValidationStatus, ErrorMessage, StartDate, CompleteDate, " & _
        "plannedstartdate, Status, Specification_id, SpecificationName, ColorID, SEQN, NEWSEQN, statusid, PrintDate, validationdate, shipmentdate, " & _
        "reworkdate, reworkcompletedate, rework_comments, shipment_comments) " & _
        "SELECT ID, ModelArticle, ModelName, VIN, EngineNumber, Color, PlannedShipmentDate, ValidationStatus, ErrorMessage, StartDate, CompleteDate, " & _
        "plannedstartdate, Status, Specification_id, SpecificationName, ColorID, SEQN, NEWSEQN, statusid, PrintDate, validationdate, shipmentdate, " & _
        "reworkdate, reworkcompletedate, rework_comments, shipment_comments FROM tblProductionPlan AS src " & _
        "WHERE NOT EXISTS (SELECT 1 FROM dbo_tblProductionPlan AS dst WHERE dst.ID = src.ID)")
    totalRecords = totalRecords + recordsInserted
    reportText = reportText & "tblProductionPlan → dbo_tblProductionPlan: " & recordsInserted & " записей" & vbCrLf

    recordsInserted = MigrateTable(db, "dbo_tblPlanTemp", "tblPlanTemp", _
        "INSERT INTO dbo_tblPlanTemp (TempID, OriginalID, VIN, ModelArticle, ModelName, Color, EngineNumber, Status, NEWSEQN, DisplaySeq, statusid) " & _
        "SELECT TempID, OriginalID, VIN, ModelArticle, ModelName, Color, EngineNumber, Status, NEWSEQN, DisplaySeq, statusid FROM tblPlanTemp AS src " & _
        "WHERE NOT EXISTS (SELECT 1 FROM dbo_tblPlanTemp AS dst WHERE dst.TempID = src.TempID)")
    totalRecords = totalRecords + recordsInserted
    reportText = reportText & "tblPlanTemp → dbo_tblPlanTemp: " & recordsInserted & " записей" & vbCrLf

    recordsInserted = MigrateTable(db, "dbo_tblProductionOrder", "tblProductionOrder", _
        "INSERT INTO dbo_tblProductionOrder (ID, PlanID, VIN, EngineNumber, ModelArticle, ModelName, Color, PlannedShipmentDate, OrderStatus, CurrentStation, AssemblyStartTime, AssemblyEndTime) " & _
        "SELECT ID, PlanID, VIN, EngineNumber, ModelArticle, ModelName, Color, PlannedShipmentDate, OrderStatus, CurrentStation, AssemblyStartTime, AssemblyEndTime FROM tblProductionOrder AS src " & _
        "WHERE NOT EXISTS (SELECT 1 FROM dbo_tblProductionOrder AS dst WHERE dst.ID = src.ID)")
    totalRecords = totalRecords + recordsInserted
    reportText = reportText & "tblProductionOrder → dbo_tblProductionOrder: " & recordsInserted & " записей" & vbCrLf

    recordsInserted = MigrateTable(db, "dbo_tblUpdColor", "tblUpdColor", _
        "INSERT INTO dbo_tblUpdColor (vin, color) " & _
        "SELECT vin, color FROM tblUpdColor AS src " & _
        "WHERE NOT EXISTS (SELECT 1 FROM dbo_tblUpdColor AS dst WHERE dst.vin = src.vin)")
    totalRecords = totalRecords + recordsInserted
    reportText = reportText & "tblUpdColor → dbo_tblUpdColor: " & recordsInserted & " записей" & vbCrLf

    recordsInserted = MigrateTable(db, "dbo_tblImportplan", "tblImportplan", _
        "INSERT INTO dbo_tblImportplan (F1, арт, название, вин, [номер двс], [цвет согласованный], [готов к отгрузке], [Плановая дата готовности к отгрузке], [Дата отгрузки фактическая], id) " & _
        "SELECT F1, арт, название, вин, [номер двс], [цвет согласованный], [готов к отгрузке], [Плановая дата готовности к отгрузке], [Дата отгрузки фактическая], id FROM tblImportplan AS src " & _
        "WHERE NOT EXISTS (SELECT 1 FROM dbo_tblImportplan AS dst WHERE dst.id = src.id)")
    totalRecords = totalRecords + recordsInserted
    reportText = reportText & "tblImportplan → dbo_tblImportplan: " & recordsInserted & " записей" & vbCrLf

    reportText = reportText & vbCrLf

    ' ========================================================================
    ' КОНТРОЛЬ КАЧЕСТВА
    ' ========================================================================
    reportText = reportText & "ЭТАП 4: КОНТРОЛЬ КАЧЕСТВА" & vbCrLf
    reportText = reportText & String(80, "-") & vbCrLf & vbCrLf

    recordsInserted = MigrateTable(db, "dbo_tblNCP", "tblNCP", _
        "INSERT INTO dbo_tblNCP (id, StationID, ComponentID, VIN, Quantity, DiscrepancyTypeID, Comment, Status, CreatedBy, CreatedAt, ClosedBy, ClosedAt) " & _
        "SELECT ID, StationID, ComponentID, VIN, Quantity, DiscrepancyTypeID, LEFT(Comment,50), Status, LEFT(CreatedBy,50), CreatedAt, LEFT(ClosedBy,50), ClosedAt FROM tblNCP AS src " & _
        "WHERE NOT EXISTS (SELECT 1 FROM dbo_tblNCP AS dst WHERE dst.id = src.ID)")
    totalRecords = totalRecords + recordsInserted
    reportText = reportText & "tblNCP → dbo_tblNCP: " & recordsInserted & " записей" & vbCrLf

    recordsInserted = MigrateTable(db, "dbo_tblDiscrepancy", "tblDiscrepancy", _
        "INSERT INTO dbo_tblDiscrepancy (id, AssemblyEventID, ComponentID, DiscrepancyType, Comment, WasReplaced, DetectionTime, ResolutionTime, DiscrepancyStatus, NCP_Number, PhotoPath) " & _
        "SELECT ID, AssemblyEventID, ComponentID, DiscrepancyType, LEFT(Comment,250), WasReplaced, DetectionTime, ResolutionTime, DiscrepancyStatus, NCP_Number, LEFT(PhotoPath,50) FROM tblDiscrepancy AS src " & _
        "WHERE NOT EXISTS (SELECT 1 FROM dbo_tblDiscrepancy AS dst WHERE dst.id = src.ID)")
    totalRecords = totalRecords + recordsInserted
    reportText = reportText & "tblDiscrepancy → dbo_tblDiscrepancy: " & recordsInserted & " записей" & vbCrLf

    recordsInserted = MigrateTable(db, "dbo_tblCrippleRecord", "tblCrippleRecord", _
        "INSERT INTO dbo_tblCrippleRecord (ID, OrderID, DiscrepancyID, ComponentID, CrippleReason, RegistrationDate, ExpectedResolutionDate, StorageLocation) " & _
        "SELECT ID, OrderID, DiscrepancyID, ComponentID, CrippleReason, RegistrationDate, ExpectedResolutionDate, StorageLocation FROM tblCrippleRecord AS src " & _
        "WHERE NOT EXISTS (SELECT 1 FROM dbo_tblCrippleRecord AS dst WHERE dst.ID = src.ID)")
    totalRecords = totalRecords + recordsInserted
    reportText = reportText & "tblCrippleRecord → dbo_tblCrippleRecord: " & recordsInserted & " записей" & vbCrLf

    recordsInserted = MigrateTable(db, "dbo_tblJobCard", "tblJobCard", _
        "INSERT INTO dbo_tblJobCard (ID, OrderID, JobCardNumber, PrintDate, CardStatus, BarcodeData) " & _
        "SELECT ID, OrderID, JobCardNumber, PrintDate, CardStatus, BarcodeData FROM tblJobCard AS src " & _
        "WHERE NOT EXISTS (SELECT 1 FROM dbo_tblJobCard AS dst WHERE dst.ID = src.ID)")
    totalRecords = totalRecords + recordsInserted
    reportText = reportText & "tblJobCard → dbo_tblJobCard: " & recordsInserted & " записей" & vbCrLf

    recordsInserted = MigrateTable(db, "dbo_tblImportLog", "tblImportLog", _
        "INSERT INTO dbo_tblImportLog (ID, ImportDate, FileName, ImportedBy, RowsImported, RowsFailed, ErrorDescription, ImportBatchID) " & _
        "SELECT ID, ImportDate, LEFT(FileName,50), ImportedBy, RowsImported, RowsFailed, ErrorDescription, ImportBatchID FROM tblImportLog AS src " & _
        "WHERE NOT EXISTS (SELECT 1 FROM dbo_tblImportLog AS dst WHERE dst.ID = src.ID)")
    totalRecords = totalRecords + recordsInserted
    reportText = reportText & "tblImportLog → dbo_tblImportLog: " & recordsInserted & " записей" & vbCrLf

    ' Завершение
    reportText = reportText & vbCrLf
    reportText = reportText & "=" & String(80, "=") & vbCrLf
    reportText = reportText & "ИТОГО МИГРИРОВАНО: " & totalRecords & " записей" & vbCrLf
    reportText = reportText & "Время выполнения: " & Format(Now() - startTime, "hh:mm:ss") & vbCrLf
    reportText = reportText & "Завершено: " & Format(Now(), "dd.mm.yyyy hh:mm:ss") & vbCrLf
    reportText = reportText & "=" & String(80, "=") & vbCrLf

    SaveReport reportText

    MsgBox "✅ Миграция завершена!" & vbCrLf & vbCrLf & _
           "Мигрировано: " & totalRecords & " записей" & vbCrLf & _
           "Время: " & Format(Now() - startTime, "hh:mm:ss") & vbCrLf & vbCrLf & _
           "Отчет: MIGRATION_RESULT.txt", _
           vbInformation, "Успешно"

    Exit Sub
ErrorHandler:
    MsgBox "Ошибка: " & Err.Description, vbCritical, "Ошибка миграции"
End Sub

Private Function MigrateTable(db As Object, targetTableName As String, sourceTableName As String, sql As String) As Long
    On Error GoTo ErrHandler

    db.Execute sql
    MigrateTable = db.RecordsAffected

    Exit Function
ErrHandler:
    MsgBox "Ошибка при миграции " & targetTableName & " из " & sourceTableName & ": " & Err.Description, vbCritical
    MigrateTable = 0
End Function

Private Sub SaveReport(reportText As String)
    Dim fso As Object
    Dim outputFile As Object
    Dim filePath As String

    Set fso = CreateObject("Scripting.FileSystemObject")
    filePath = Application.CurrentProject.Path & "\MIGRATION_RESULT.txt"
    Set outputFile = fso.CreateTextFile(filePath, True)
    outputFile.Write reportText
    outputFile.Close

    On Error Resume Next
    Shell "notepad.exe """ & filePath & """"
    On Error GoTo 0
End Sub
