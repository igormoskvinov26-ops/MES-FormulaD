' ============================================================================
' МИГРАЦИЯ ВСЕХ ТАБЛИЦ ОДНИМ ПРОГОНОМ
' Локальные таблицы Access -> связанные таблицы SQL Server (dbo_*)
' ============================================================================
' Запуск: MigrateAll
'
' Отличие от прежних версий: db.Execute вызывается с dbFailOnError.
' Без этого флага Access молча проглатывает отказы сервера (нарушение ключа,
' IDENTITY, несовпадение типов) - отчёт рапортует успех, а записи не доезжают.
' Константа объявлена вручную, ссылка на DAO не нужна.
'
' По каждой таблице пишется: сколько в источнике, сколько на сервере до и
' после, сколько ожидалось вставить и сколько вставилось фактически.
' Расхождение или ошибка сервера видны в отчёте построчно.
' ============================================================================

Option Compare Database
Option Explicit

Private Const dbFailOnError As Long = 128

Private mDb As Object
Private mReport As String
Private mInserted As Long
Private mFailed As Long

' ============================================================================
Sub MigrateAll()
    Dim t0 As Date

    Set mDb = CurrentDb()
    t0 = Now()
    mReport = ""
    mInserted = 0
    mFailed = 0

    Say String(78, "=")
    Say "МИГРАЦИЯ ДАННЫХ В SQL SERVER"
    Say "Начало: " & Format(t0, "dd.mm.yyyy hh:nn:ss")
    Say String(78, "=")
    Say ""

    ' ---------------- ЭТАП 1: СПРАВОЧНИКИ ----------------
    Say "ЭТАП 1: СПРАВОЧНИКИ"
    Say String(78, "-")

    Xfer "tblRole", "dbo_tblRole", "ID", "ID", _
        "INSERT INTO dbo_tblRole ( ID, RoleName, Description, IsActive ) " & _
        "SELECT src.ID, src.RoleName, src.Description, src.IsActive " & _
        "FROM tblRole AS src LEFT JOIN dbo_tblRole AS dst ON src.ID = dst.ID " & _
        "WHERE dst.ID IS NULL"

    Xfer "tblStatus", "dbo_tblStatus", "id", "id", _
        "INSERT INTO dbo_tblStatus ( id, statusid, statename ) " & _
        "SELECT src.id, src.statusid, src.statename " & _
        "FROM tblStatus AS src LEFT JOIN dbo_tblStatus AS dst ON src.id = dst.id " & _
        "WHERE dst.id IS NULL"

    Xfer "tblColors", "dbo_tblColors", "id", "id", _
        "INSERT INTO dbo_tblColors ( id, color ) " & _
        "SELECT src.id, src.color " & _
        "FROM tblColors AS src LEFT JOIN dbo_tblColors AS dst ON src.id = dst.id " & _
        "WHERE dst.id IS NULL"

    Xfer "tblDiscrepancyList", "dbo_tblDiscrepancyList", "id", "id", _
        "INSERT INTO dbo_tblDiscrepancyList ( id, discrepancy ) " & _
        "SELECT src.id, src.discrepancy " & _
        "FROM tblDiscrepancyList AS src LEFT JOIN dbo_tblDiscrepancyList AS dst ON src.id = dst.id " & _
        "WHERE dst.id IS NULL"

    Say ""

    ' ---------------- ЭТАП 2: ОСНОВНЫЕ ДАННЫЕ ----------------
    Say "ЭТАП 2: ОСНОВНЫЕ СПРАВОЧНЫЕ ДАННЫЕ"
    Say String(78, "-")

    Xfer "tblUser", "dbo_tblUser", "ID", "ID", _
        "INSERT INTO dbo_tblUser ( ID, Login, PasswordHash, FullName, UserRole, IsActive, Email, Phone ) " & _
        "SELECT src.ID, src.Login, src.PasswordHash, src.FullName, src.UserRole, src.IsActive, src.Email, src.Phone " & _
        "FROM tblUser AS src LEFT JOIN dbo_tblUser AS dst ON src.ID = dst.ID " & _
        "WHERE dst.ID IS NULL"

    ' без id_assembly - поля нет в целевой таблице
    Xfer "tblSpecifications", "dbo_tblSpecifications", "id", "id", _
        "INSERT INTO dbo_tblSpecifications ( id, specificationName, valid, ModelArticle ) " & _
        "SELECT src.id, src.specificationName, src.valid, src.ModelArticle " & _
        "FROM tblSpecifications AS src LEFT JOIN dbo_tblSpecifications AS dst ON src.id = dst.id " & _
        "WHERE dst.id IS NULL"

    Xfer "tblComponent", "dbo_tblComponent", "ID", "id", _
        "INSERT INTO dbo_tblComponent ( id, ComponentCode, ComponentName, ComponentName_RUS, PointOfPart, StationID, StandardQty, IsMandatory, Supplier ) " & _
        "SELECT src.ID, src.ComponentCode, src.ComponentName, src.ComponentName_RUS, src.PointOfPart, src.StationID, src.StandardQty, src.IsMandatory, src.Supplier " & _
        "FROM tblComponent AS src LEFT JOIN dbo_tblComponent AS dst ON src.ID = dst.id " & _
        "WHERE dst.id IS NULL"

    Xfer "tblConnections", "dbo_tblConnections", "Код", "id", _
        "INSERT INTO dbo_tblConnections ( id, [Критические соединения], [Кол-во соединений], Станция, Код_колмплектации, [Станция проверки] ) " & _
        "SELECT src.Код, src.[Критические соединения], src.[Кол-во соединений], src.Станция, src.Код_колмплектации, src.[Станция проверки] " & _
        "FROM tblConnections AS src LEFT JOIN dbo_tblConnections AS dst ON src.Код = dst.id " & _
        "WHERE dst.id IS NULL"

    Say ""

    ' ---------------- ЭТАП 3: ПРОИЗВОДСТВО ----------------
    Say "ЭТАП 3: ПРОИЗВОДСТВЕННЫЕ ДАННЫЕ"
    Say String(78, "-")

    ' сверка по VIN, а не по ID: серверные ID заняты другими записями,
    ' поэтому join по ID давал ложные совпадения и новые строки не доезжали
    Xfer "tblProductionPlan", "dbo_tblProductionPlan", "VIN", "VIN", _
        "INSERT INTO dbo_tblProductionPlan ( ID, ModelArticle, ModelName, VIN, EngineNumber, Color, PlannedShipmentDate, ValidationStatus, ErrorMessage, StartDate, CompleteDate, plannedstartdate, Status, Specification_id, SpecificationName, ColorID, SEQN, NEWSEQN, statusid, PrintDate, validationdate, shipmentdate, reworkdate, reworkcompletedate, rework_comments, shipment_comments ) " & _
        "SELECT src.ID, src.ModelArticle, Left(src.ModelName,50), src.VIN, src.EngineNumber, src.Color, src.PlannedShipmentDate, src.ValidationStatus, Left(src.ErrorMessage,50), src.StartDate, src.CompleteDate, src.plannedstartdate, src.Status, src.Specification_id, src.SpecificationName, src.ColorID, src.SEQN, src.NEWSEQN, src.statusid, src.PrintDate, src.validationdate, src.shipmentdate, src.reworkdate, src.reworkcompletedate, src.rework_comments, src.shipment_comments " & _
        "FROM tblProductionPlan AS src LEFT JOIN dbo_tblProductionPlan AS dst ON src.VIN = dst.VIN " & _
        "WHERE dst.VIN IS NULL"

    Xfer "tblPlanTemp", "dbo_tblPlanTemp", "TempID", "TempID", _
        "INSERT INTO dbo_tblPlanTemp ( TempID, OriginalID, VIN, ModelArticle, ModelName, Color, EngineNumber, Status, NEWSEQN, DisplaySeq, statusid ) " & _
        "SELECT src.TempID, src.OriginalID, src.VIN, src.ModelArticle, src.ModelName, src.Color, src.EngineNumber, src.Status, src.NEWSEQN, src.DisplaySeq, src.statusid " & _
        "FROM tblPlanTemp AS src LEFT JOIN dbo_tblPlanTemp AS dst ON src.TempID = dst.TempID " & _
        "WHERE dst.TempID IS NULL"

    Xfer "tblProductionOrder", "dbo_tblProductionOrder", "ID", "ID", _
        "INSERT INTO dbo_tblProductionOrder ( ID, PlanID, VIN, EngineNumber, ModelArticle, ModelName, Color, PlannedShipmentDate, OrderStatus, CurrentStation, AssemblyStartTime, AssemblyEndTime ) " & _
        "SELECT src.ID, src.PlanID, src.VIN, src.EngineNumber, src.ModelArticle, src.ModelName, src.Color, src.PlannedShipmentDate, src.OrderStatus, src.CurrentStation, src.AssemblyStartTime, src.AssemblyEndTime " & _
        "FROM tblProductionOrder AS src LEFT JOIN dbo_tblProductionOrder AS dst ON src.ID = dst.ID " & _
        "WHERE dst.ID IS NULL"

    Xfer "tblUpdColor", "dbo_tblUpdColor", "vin", "vin", _
        "INSERT INTO dbo_tblUpdColor ( vin, color ) " & _
        "SELECT src.vin, src.color " & _
        "FROM tblUpdColor AS src LEFT JOIN dbo_tblUpdColor AS dst ON src.vin = dst.vin " & _
        "WHERE dst.vin IS NULL"

    Xfer "tblImportplan", "dbo_tblImportplan", "id", "id", _
        "INSERT INTO dbo_tblImportplan ( F1, арт, название, вин, [номер двс], [цвет согласованный], [готов к отгрузке], [Плановая дата готовности к отгрузке], [Дата отгрузки фактическая], id ) " & _
        "SELECT src.F1, src.арт, src.название, src.вин, src.[номер двс], src.[цвет согласованный], src.[готов к отгрузке], src.[Плановая дата готовности к отгрузке], src.[Дата отгрузки фактическая], src.id " & _
        "FROM tblImportplan AS src LEFT JOIN dbo_tblImportplan AS dst ON src.id = dst.id " & _
        "WHERE dst.id IS NULL"

    Say ""

    ' ---------------- ЭТАП 4: КАЧЕСТВО ----------------
    Say "ЭТАП 4: КОНТРОЛЬ КАЧЕСТВА"
    Say String(78, "-")

    Xfer "tblNCP", "dbo_tblNCP", "ID", "id", _
        "INSERT INTO dbo_tblNCP ( id, StationID, ComponentID, VIN, Quantity, DiscrepancyTypeID, Comment, Status, CreatedBy, CreatedAt, ClosedBy, ClosedAt ) " & _
        "SELECT src.ID, src.StationID, src.ComponentID, src.VIN, src.Quantity, src.DiscrepancyTypeID, Left(src.Comment,50), src.Status, Left(src.CreatedBy,50), src.CreatedAt, Left(src.ClosedBy,50), src.ClosedAt " & _
        "FROM tblNCP AS src LEFT JOIN dbo_tblNCP AS dst ON src.ID = dst.id " & _
        "WHERE dst.id IS NULL"

    Xfer "tblDiscrepancy", "dbo_tblDiscrepancy", "ID", "id", _
        "INSERT INTO dbo_tblDiscrepancy ( id, AssemblyEventID, ComponentID, DiscrepancyType, Comment, WasReplaced, DetectionTime, ResolutionTime, DiscrepancyStatus, NCP_Number, PhotoPath ) " & _
        "SELECT src.ID, src.AssemblyEventID, src.ComponentID, src.DiscrepancyType, Left(src.Comment,250), src.WasReplaced, src.DetectionTime, src.ResolutionTime, src.DiscrepancyStatus, src.NCP_Number, Left(src.PhotoPath,50) " & _
        "FROM tblDiscrepancy AS src LEFT JOIN dbo_tblDiscrepancy AS dst ON src.ID = dst.id " & _
        "WHERE dst.id IS NULL"

    Xfer "tblCrippleRecord", "dbo_tblCrippleRecord", "ID", "ID", _
        "INSERT INTO dbo_tblCrippleRecord ( ID, OrderID, DiscrepancyID, ComponentID, CrippleReason, RegistrationDate, ExpectedResolutionDate, StorageLocation ) " & _
        "SELECT src.ID, src.OrderID, src.DiscrepancyID, src.ComponentID, src.CrippleReason, src.RegistrationDate, src.ExpectedResolutionDate, src.StorageLocation " & _
        "FROM tblCrippleRecord AS src LEFT JOIN dbo_tblCrippleRecord AS dst ON src.ID = dst.ID " & _
        "WHERE dst.ID IS NULL"

    Xfer "tblJobCard", "dbo_tblJobCard", "ID", "ID", _
        "INSERT INTO dbo_tblJobCard ( ID, OrderID, JobCardNumber, PrintDate, CardStatus, BarcodeData ) " & _
        "SELECT src.ID, src.OrderID, src.JobCardNumber, src.PrintDate, src.CardStatus, src.BarcodeData " & _
        "FROM tblJobCard AS src LEFT JOIN dbo_tblJobCard AS dst ON src.ID = dst.ID " & _
        "WHERE dst.ID IS NULL"

    Xfer "tblImportLog", "dbo_tblImportLog", "ID", "ID", _
        "INSERT INTO dbo_tblImportLog ( ID, ImportDate, FileName, ImportedBy, RowsImported, RowsFailed, ErrorDescription, ImportBatchID ) " & _
        "SELECT src.ID, src.ImportDate, Left(src.FileName,50), src.ImportedBy, src.RowsImported, src.RowsFailed, src.ErrorDescription, src.ImportBatchID " & _
        "FROM tblImportLog AS src LEFT JOIN dbo_tblImportLog AS dst ON src.ID = dst.ID " & _
        "WHERE dst.ID IS NULL"

    ' ---------------- ИТОГИ ----------------
    Say ""
    Say String(78, "=")
    Say "ВСТАВЛЕНО ЗАПИСЕЙ: " & mInserted
    Say "ТАБЛИЦ С ПРОБЛЕМАМИ: " & mFailed
    Say "Время: " & Format(Now() - t0, "hh:nn:ss")
    Say "Завершено: " & Format(Now(), "dd.mm.yyyy hh:nn:ss")
    Say String(78, "=")

    If mFailed > 0 Then
        Say ""
        Say "Если таблица отклонена с ошибкой 3xxx про нарушение ключа -"
        Say "скорее всего на сервере колонка ID объявлена как IDENTITY и"
        Say "явная вставка ID запрещена. Тогда либо снять IDENTITY на время"
        Say "переноса, либо не вставлять ID и сверяться по бизнес-ключу (VIN)."
    End If

    WriteReport mReport

    MsgBox "Миграция завершена." & vbCrLf & vbCrLf & _
           "Вставлено записей: " & mInserted & vbCrLf & _
           "Таблиц с проблемами: " & mFailed & vbCrLf & vbCrLf & _
           "Отчёт: MIGRATION_RESULT.txt", _
           IIf(mFailed > 0, vbExclamation, vbInformation), "Результат"
End Sub

' ============================================================================
' Выполнить один INSERT с полным контролем результата
' ============================================================================
Private Sub Xfer(srcTable As String, dstTable As String, _
                srcKey As String, dstKey As String, sql As String)
    Dim srcN As Long, dstBefore As Long, dstAfter As Long
    Dim expected As Long, actual As Long

    srcN = Counter("SELECT Count(*) AS N FROM [" & srcTable & "]")
    dstBefore = Counter("SELECT Count(*) AS N FROM [" & dstTable & "]")
    expected = Counter("SELECT Count(*) AS N FROM [" & srcTable & "] AS src " & _
                       "LEFT JOIN [" & dstTable & "] AS dst ON src.[" & srcKey & "] = dst.[" & dstKey & "] " & _
                       "WHERE dst.[" & dstKey & "] IS NULL")

    On Error GoTo Failed
    mDb.Execute sql, dbFailOnError
    On Error GoTo 0

    dstAfter = Counter("SELECT Count(*) AS N FROM [" & dstTable & "]")
    actual = dstAfter - dstBefore
    mInserted = mInserted + actual

    Say srcTable & " -> " & dstTable
    Say "    источник: " & srcN & "   на сервере: " & dstBefore & " -> " & dstAfter
    Say "    ожидалось: " & expected & "   вставлено: " & actual

    If actual < expected Then
        mFailed = mFailed + 1
        Say "    ВНИМАНИЕ: вставлено меньше ожидаемого"
    End If
    Say ""
    Exit Sub

Failed:
    mFailed = mFailed + 1
    Say srcTable & " -> " & dstTable
    Say "    источник: " & srcN & "   на сервере: " & dstBefore
    Say "    ожидалось: " & expected & "   вставлено: 0"
    Say "    ОШИБКА " & Err.Number & ": " & Err.Description
    Say ""
End Sub

Private Function Counter(sql As String) As Long
    On Error GoTo Failed
    Dim rs As Object
    Set rs = mDb.OpenRecordset(sql)
    Counter = Nz(rs.Fields("N").Value, 0)
    rs.Close
    Exit Function
Failed:
    Counter = -1
End Function

Private Sub Say(text As String)
    mReport = mReport & text & vbCrLf
End Sub

Private Sub WriteReport(text As String)
    Dim fso As Object, f As Object, p As String

    Set fso = CreateObject("Scripting.FileSystemObject")
    p = Application.CurrentProject.Path & "\MIGRATION_RESULT.txt"
    Set f = fso.CreateTextFile(p, True)
    f.Write text
    f.Close

    On Error Resume Next
    Shell "notepad.exe """ & p & """"
End Sub
