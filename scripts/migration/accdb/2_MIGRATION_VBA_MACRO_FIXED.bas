' ============================================================================
' МИГРАЦИЯ ДАННЫХ: Локальные таблицы Access → Linked таблицы SQL Server
' ============================================================================
' Назначение: Запустить в Access базе (MES_server.accdb)
' Результат: Все 18 таблиц мигрируются в FormulaD на SQL Server
' ============================================================================

Option Compare Database
Option Explicit

Sub MigrateDataToSQLServer()
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

    ' Начало отчета
    reportText = reportText & "=" & String(80, "=") & vbCrLf
    reportText = reportText & "МИГРАЦИЯ ДАННЫХ В SQL SERVER" & vbCrLf
    reportText = reportText & "Начало: " & Format(startTime, "dd.mm.yyyy hh:mm:ss") & vbCrLf
    reportText = reportText & "=" & String(80, "=") & vbCrLf & vbCrLf
    reportText = reportText & "ВНИМАНИЕ: FK ограничения должны быть отключены на SQL Server!" & vbCrLf & vbCrLf

    ' ========================================================================
    ' СПРАВОЧНИКИ
    ' ========================================================================
    reportText = reportText & "ЭТАП 1: СПРАВОЧНИКИ" & vbCrLf
    reportText = reportText & String(80, "-") & vbCrLf & vbCrLf

    ' tblRole
    recordsInserted = MigrateTable(db, "tblRole", _
        "INSERT INTO tblRole (ID, RoleName, Description, IsActive) " & _
        "SELECT ID, RoleName, Description, IsActive FROM tblRole AS src " & _
        "WHERE NOT EXISTS (SELECT 1 FROM tblRole AS dst WHERE dst.ID = src.ID)")
    totalRecords = totalRecords + recordsInserted
    reportText = reportText & "tblRole: " & recordsInserted & " записей" & vbCrLf

    ' tblStatus
    recordsInserted = MigrateTable(db, "tblStatus", _
        "INSERT INTO tblStatus (id, statusid, statename) " & _
        "SELECT id, statusid, statename FROM tblStatus AS src " & _
        "WHERE NOT EXISTS (SELECT 1 FROM tblStatus AS dst WHERE dst.id = src.id)")
    totalRecords = totalRecords + recordsInserted
    reportText = reportText & "tblStatus: " & recordsInserted & " записей" & vbCrLf

    ' tblColors
    recordsInserted = MigrateTable(db, "tblColors", _
        "INSERT INTO tblColors (id, color) " & _
        "SELECT id, color FROM tblColors AS src " & _
        "WHERE NOT EXISTS (SELECT 1 FROM tblColors AS dst WHERE dst.id = src.id)")
    totalRecords = totalRecords + recordsInserted
    reportText = reportText & "tblColors: " & recordsInserted & " записей" & vbCrLf

    ' tblDiscrepancyList
    recordsInserted = MigrateTable(db, "tblDiscrepancyList", _
        "INSERT INTO tblDiscrepancyList (id, discrepancy) " & _
        "SELECT id, discrepancy FROM tblDiscrepancyList AS src " & _
        "WHERE NOT EXISTS (SELECT 1 FROM tblDiscrepancyList AS dst WHERE dst.id = src.id)")
    totalRecords = totalRecords + recordsInserted
    reportText = reportText & "tblDiscrepancyList: " & recordsInserted & " записей" & vbCrLf

    reportText = reportText & vbCrLf

    ' ========================================================================
    ' ОСНОВНЫЕ СПРАВОЧНЫЕ ДАННЫЕ
    ' ========================================================================
    reportText = reportText & "ЭТАП 2: ОСНОВНЫЕ СПРАВОЧНЫЕ ДАННЫЕ" & vbCrLf
    reportText = reportText & String(80, "-") & vbCrLf & vbCrLf

    ' tblUser
    recordsInserted = MigrateTable(db, "tblUser", _
        "INSERT INTO tblUser (ID, Login, PasswordHash, FullName, UserRole, IsActive, Email, Phone) " & _
        "SELECT ID, Login, PasswordHash, FullName, UserRole, IsActive, Email, Phone FROM tblUser AS src " & _
        "WHERE NOT EXISTS (SELECT 1 FROM tblUser AS dst WHERE dst.ID = src.ID)")
    totalRecords = totalRecords + recordsInserted
    reportText = reportText & "tblUser: " & recordsInserted & " записей" & vbCrLf

    ' tblSpecifications
    recordsInserted = MigrateTable(db, "tblSpecifications", _
        "INSERT INTO tblSpecifications (id, specificationName, valid, ModelArticle, id_assembly) " & _
        "SELECT id, specificationName, valid, ModelArticle, id_assembly FROM tblSpecifications AS src " & _
        "WHERE NOT EXISTS (SELECT 1 FROM tblSpecifications AS dst WHERE dst.id = src.id)")
    totalRecords = totalRecords + recordsInserted
    reportText = reportText & "tblSpecifications: " & recordsInserted & " записей" & vbCrLf

    ' tblComponent
    recordsInserted = MigrateTable(db, "tblComponent", _
        "INSERT INTO tblComponent (id, ComponentCode, ComponentName, ComponentName_RUS, PointOfPart, StationID, StandardQty, IsMandatory, Supplier) " & _
        "SELECT ID, ComponentCode, ComponentName, ComponentName_RUS, PointOfPart, StationID, StandardQty, IsMandatory, Supplier FROM tblComponent AS src " & _
        "WHERE NOT EXISTS (SELECT 1 FROM tblComponent AS dst WHERE dst.id = src.ID)")
    totalRecords = totalRecords + recordsInserted
    reportText = reportText & "tblComponent: " & recordsInserted & " записей" & vbCrLf

    reportText = reportText & vbCrLf

    ' ========================================================================
    ' ПРОИЗВОДСТВЕННЫЕ ДАННЫЕ
    ' ========================================================================
    reportText = reportText & "ЭТАП 3: ПРОИЗВОДСТВЕННЫЕ ДАННЫЕ" & vbCrLf
    reportText = reportText & String(80, "-") & vbCrLf & vbCrLf

    ' tblProductionPlan
    recordsInserted = MigrateTable(db, "tblProductionPlan", _
        "INSERT INTO tblProductionPlan (ID, ModelArticle, ModelName, VIN, EngineNumber, Color, PlannedShipmentDate, ValidationStatus, ErrorMessage, StartDate, CompleteDate, " & _
        "plannedstartdate, Status, Specification_id, SpecificationName, ColorID, SEQN, NEWSEQN, statusid, PrintDate, validationdate, shipmentdate, " & _
        "reworkdate, reworkcompletedate, rework_comments, shipment_comments) " & _
        "SELECT ID, ModelArticle, ModelName, VIN, EngineNumber, Color, PlannedShipmentDate, ValidationStatus, ErrorMessage, StartDate, CompleteDate, " & _
        "plannedstartdate, Status, Specification_id, SpecificationName, ColorID, SEQN, NEWSEQN, statusid, PrintDate, validationdate, shipmentdate, " & _
        "reworkdate, reworkcompletedate, rework_comments, shipment_comments FROM tblProductionPlan AS src " & _
        "WHERE NOT EXISTS (SELECT 1 FROM tblProductionPlan AS dst WHERE dst.ID = src.ID)")
    totalRecords = totalRecords + recordsInserted
    reportText = reportText & "tblProductionPlan: " & recordsInserted & " записей" & vbCrLf

    ' tblPlanTemp
    recordsInserted = MigrateTable(db, "tblPlanTemp", _
        "INSERT INTO tblPlanTemp (TempID, OriginalID, VIN, ModelArticle, ModelName, Color, EngineNumber, Status, NEWSEQN, DisplaySeq, statusid) " & _
        "SELECT TempID, OriginalID, VIN, ModelArticle, ModelName, Color, EngineNumber, Status, NEWSEQN, DisplaySeq, statusid FROM tblPlanTemp AS src " & _
        "WHERE NOT EXISTS (SELECT 1 FROM tblPlanTemp AS dst WHERE dst.TempID = src.TempID)")
    totalRecords = totalRecords + recordsInserted
    reportText = reportText & "tblPlanTemp: " & recordsInserted & " записей" & vbCrLf

    ' tblProductionOrder
    recordsInserted = MigrateTable(db, "tblProductionOrder", _
        "INSERT INTO tblProductionOrder (ID, PlanID, VIN, EngineNumber, ModelArticle, ModelName, Color, PlannedShipmentDate, OrderStatus, CurrentStation, AssemblyStartTime, AssemblyEndTime) " & _
        "SELECT ID, PlanID, VIN, EngineNumber, ModelArticle, ModelName, Color, PlannedShipmentDate, OrderStatus, CurrentStation, AssemblyStartTime, AssemblyEndTime FROM tblProductionOrder AS src " & _
        "WHERE NOT EXISTS (SELECT 1 FROM tblProductionOrder AS dst WHERE dst.ID = src.ID)")
    totalRecords = totalRecords + recordsInserted
    reportText = reportText & "tblProductionOrder: " & recordsInserted & " записей" & vbCrLf

    ' tblUpdColor
    recordsInserted = MigrateTable(db, "tblUpdColor", _
        "INSERT INTO tblUpdColor (vin, color) " & _
        "SELECT vin, color FROM tblUpdColor AS src " & _
        "WHERE NOT EXISTS (SELECT 1 FROM tblUpdColor AS dst WHERE dst.vin = src.vin)")
    totalRecords = totalRecords + recordsInserted
    reportText = reportText & "tblUpdColor: " & recordsInserted & " записей" & vbCrLf

    ' tblImportplan
    recordsInserted = MigrateTable(db, "tblImportplan", _
        "INSERT INTO tblImportplan (F1, арт, название, вин, [номер двс], [цвет согласованный], [готов к отгрузке], [Плановая дата готовности к отгрузке], [Дата отгрузки фактическая], id) " & _
        "SELECT F1, арт, название, вин, [номер двс], [цвет согласованный], [готов к отгрузке], [Плановая дата готовности к отгрузке], [Дата отгрузки фактическая], id FROM tblImportplan AS src " & _
        "WHERE NOT EXISTS (SELECT 1 FROM tblImportplan AS dst WHERE dst.id = src.id)")
    totalRecords = totalRecords + recordsInserted
    reportText = reportText & "tblImportplan: " & recordsInserted & " записей" & vbCrLf

    reportText = reportText & vbCrLf

    ' ========================================================================
    ' КОНТРОЛЬ КАЧЕСТВА
    ' ========================================================================
    reportText = reportText & "ЭТАП 4: КОНТРОЛЬ КАЧЕСТВА" & vbCrLf
    reportText = reportText & String(80, "-") & vbCrLf & vbCrLf

    ' tblNCP
    recordsInserted = MigrateTable(db, "tblNCP", _
        "INSERT INTO tblNCP (id, StationID, ComponentID, VIN, Quantity, DiscrepancyTypeID, Comment, Status, CreatedBy, CreatedAt, ClosedBy, ClosedAt) " & _
        "SELECT ID, StationID, ComponentID, VIN, Quantity, DiscrepancyTypeID, LEFT(Comment,50), Status, LEFT(CreatedBy,50), CreatedAt, LEFT(ClosedBy,50), ClosedAt FROM tblNCP AS src " & _
        "WHERE NOT EXISTS (SELECT 1 FROM tblNCP AS dst WHERE dst.id = src.ID)")
    totalRecords = totalRecords + recordsInserted
    reportText = reportText & "tblNCP: " & recordsInserted & " записей" & vbCrLf

    ' tblDiscrepancy
    recordsInserted = MigrateTable(db, "tblDiscrepancy", _
        "INSERT INTO tblDiscrepancy (id, AssemblyEventID, ComponentID, DiscrepancyType, Comment, WasReplaced, DetectionTime, ResolutionTime, DiscrepancyStatus, NCP_Number, PhotoPath) " & _
        "SELECT ID, AssemblyEventID, ComponentID, DiscrepancyType, LEFT(Comment,250), WasReplaced, DetectionTime, ResolutionTime, DiscrepancyStatus, NCP_Number, LEFT(PhotoPath,50) FROM tblDiscrepancy AS src " & _
        "WHERE NOT EXISTS (SELECT 1 FROM tblDiscrepancy AS dst WHERE dst.id = src.ID)")
    totalRecords = totalRecords + recordsInserted
    reportText = reportText & "tblDiscrepancy: " & recordsInserted & " записей" & vbCrLf

    ' tblCrippleRecord
    recordsInserted = MigrateTable(db, "tblCrippleRecord", _
        "INSERT INTO tblCrippleRecord (ID, OrderID, DiscrepancyID, ComponentID, CrippleReason, RegistrationDate, ExpectedResolutionDate, StorageLocation) " & _
        "SELECT ID, OrderID, DiscrepancyID, ComponentID, CrippleReason, RegistrationDate, ExpectedResolutionDate, StorageLocation FROM tblCrippleRecord AS src " & _
        "WHERE NOT EXISTS (SELECT 1 FROM tblCrippleRecord AS dst WHERE dst.ID = src.ID)")
    totalRecords = totalRecords + recordsInserted
    reportText = reportText & "tblCrippleRecord: " & recordsInserted & " записей" & vbCrLf

    ' tblJobCard
    recordsInserted = MigrateTable(db, "tblJobCard", _
        "INSERT INTO tblJobCard (ID, OrderID, JobCardNumber, PrintDate, CardStatus, BarcodeData) " & _
        "SELECT ID, OrderID, JobCardNumber, PrintDate, CardStatus, BarcodeData FROM tblJobCard AS src " & _
        "WHERE NOT EXISTS (SELECT 1 FROM tblJobCard AS dst WHERE dst.ID = src.ID)")
    totalRecords = totalRecords + recordsInserted
    reportText = reportText & "tblJobCard: " & recordsInserted & " записей" & vbCrLf

    ' tblImportLog
    recordsInserted = MigrateTable(db, "tblImportLog", _
        "INSERT INTO tblImportLog (ID, ImportDate, FileName, ImportedBy, RowsImported, RowsFailed, ErrorDescription, ImportBatchID) " & _
        "SELECT ID, ImportDate, LEFT(FileName,50), ImportedBy, RowsImported, RowsFailed, ErrorDescription, ImportBatchID FROM tblImportLog AS src " & _
        "WHERE NOT EXISTS (SELECT 1 FROM tblImportLog AS dst WHERE dst.ID = src.ID)")
    totalRecords = totalRecords + recordsInserted
    reportText = reportText & "tblImportLog: " & recordsInserted & " записей" & vbCrLf

    ' Завершение отчета
    reportText = reportText & vbCrLf
    reportText = reportText & "=" & String(80, "=") & vbCrLf
    reportText = reportText & "ИТОГО МИГРИРОВАНО: " & totalRecords & " записей" & vbCrLf
    reportText = reportText & "Время выполнения: " & Format(Now() - startTime, "hh:mm:ss") & vbCrLf
    reportText = reportText & "Завершено: " & Format(Now(), "dd.mm.yyyy hh:mm:ss") & vbCrLf
    reportText = reportText & "=" & String(80, "=") & vbCrLf

    ' Сохранить отчет
    SaveReport reportText

    ' Показать результат
    MsgBox "✅ Миграция завершена!" & vbCrLf & vbCrLf & _
           "Мигрировано: " & totalRecords & " записей" & vbCrLf & _
           "Время: " & Format(Now() - startTime, "hh:mm:ss") & vbCrLf & vbCrLf & _
           "Отчет сохранен: MIGRATION_RESULT.txt", _
           vbInformation, "Успешно"

    Exit Sub
ErrorHandler:
    MsgBox "Ошибка: " & Err.Description, vbCritical, "Ошибка миграции"
End Sub

' Вспомогательная функция для миграции таблицы
Private Function MigrateTable(db As Object, tableName As String, sql As String) As Long
    On Error GoTo ErrorHandler

    ' Выполнить INSERT
    db.Execute sql

    ' Вернуть количество измененных записей
    MigrateTable = db.RecordsAffected

    Exit Function
ErrorHandler:
    MsgBox "Ошибка при миграции " & tableName & ": " & Err.Description, vbCritical
    MigrateTable = 0
End Function

' Сохранить отчет в файл
Private Sub SaveReport(reportText As String)
    Dim fso As Object
    Dim outputFile As Object
    Dim filePath As String

    Set fso = CreateObject("Scripting.FileSystemObject")
    filePath = Application.CurrentProject.Path & "\MIGRATION_RESULT.txt"
    Set outputFile = fso.CreateTextFile(filePath, True)
    outputFile.Write reportText
    outputFile.Close

    ' Открыть файл
    On Error Resume Next
    Shell "notepad.exe """ & filePath & """"
    On Error GoTo 0
End Sub
