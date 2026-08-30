' ============================================================================
' МИГРАЦИЯ ВСЕХ ТАБЛИЦ ОДНИМ ПРОГОНОМ
' Локальные таблицы Access -> связанные таблицы SQL Server (dbo_*)
' Запуск: MigrateAll
' ============================================================================
' id нигде не переносится - на сервере это счётчик IDENTITY.
' Сверка идёт по бизнес-ключам.
'
' Два системных источника отказа ODBC закрыты заранее:
'   1. Усечение строк. Все колонки, суженные на сервере относительно Access
'      (по DATA_TYPE_MAPPING.md), обрезаются через Left().
'   2. Даты вне диапазона. Минимум datetime в SQL Server - 01.01.1753,
'      Access держит 1899 и пустые даты. Одна такая строка рушит вставку
'      целиком, поэтому каждое датное поле проходит через DT().
'
' При отказе печатается не только код 3146, но и настоящий ответ сервера
' из DBEngine.Errors - с именем колонки и значением.
' ============================================================================

Option Compare Database
Option Explicit

Private Const dbFailOnError As Long = 128

Private mDb As Object
Private mReport As String
Private mInserted As Long
Private mFailed As Long

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

    Xfer "tblRole", "dbo_tblRole", "src.RoleName = dst.RoleName", "RoleName", _
        "INSERT INTO dbo_tblRole ( RoleName, Description, IsActive ) " & _
        "SELECT src.RoleName, src.Description, src.IsActive " & _
        "FROM tblRole AS src LEFT JOIN dbo_tblRole AS dst ON src.RoleName = dst.RoleName " & _
        "WHERE dst.RoleName IS NULL"

    Xfer "tblStatus", "dbo_tblStatus", "src.statusid = dst.statusid", "statusid", _
        "INSERT INTO dbo_tblStatus ( statusid, statename ) " & _
        "SELECT src.statusid, src.statename " & _
        "FROM tblStatus AS src LEFT JOIN dbo_tblStatus AS dst ON src.statusid = dst.statusid " & _
        "WHERE dst.statusid IS NULL"

    ' color: Text(255) -> nvarchar(50)
    Xfer "tblColors", "dbo_tblColors", "src.color = dst.color", "color", _
        "INSERT INTO dbo_tblColors ( color ) " & _
        "SELECT Left(src.color,50) " & _
        "FROM tblColors AS src LEFT JOIN dbo_tblColors AS dst ON src.color = dst.color " & _
        "WHERE dst.color IS NULL"

    Xfer "tblDiscrepancyList", "dbo_tblDiscrepancyList", "src.discrepancy = dst.discrepancy", "discrepancy", _
        "INSERT INTO dbo_tblDiscrepancyList ( discrepancy ) " & _
        "SELECT src.discrepancy " & _
        "FROM tblDiscrepancyList AS src LEFT JOIN dbo_tblDiscrepancyList AS dst ON src.discrepancy = dst.discrepancy " & _
        "WHERE dst.discrepancy IS NULL"

    Say ""

    ' ---------------- ЭТАП 2: ОСНОВНЫЕ ДАННЫЕ ----------------
    Say "ЭТАП 2: ОСНОВНЫЕ СПРАВОЧНЫЕ ДАННЫЕ"
    Say String(78, "-")

    Xfer "tblUser", "dbo_tblUser", "src.Login = dst.Login", "Login", _
        "INSERT INTO dbo_tblUser ( Login, PasswordHash, FullName, UserRole, IsActive, Email, Phone ) " & _
        "SELECT src.Login, src.PasswordHash, src.FullName, src.UserRole, src.IsActive, src.Email, src.Phone " & _
        "FROM tblUser AS src LEFT JOIN dbo_tblUser AS dst ON src.Login = dst.Login " & _
        "WHERE dst.Login IS NULL"

    ' без id_assembly - поля нет в целевой таблице
    Xfer "tblSpecifications", "dbo_tblSpecifications", "src.specificationName = dst.specificationName", "specificationName", _
        "INSERT INTO dbo_tblSpecifications ( specificationName, valid, ModelArticle ) " & _
        "SELECT src.specificationName, src.valid, src.ModelArticle " & _
        "FROM tblSpecifications AS src LEFT JOIN dbo_tblSpecifications AS dst ON src.specificationName = dst.specificationName " & _
        "WHERE dst.specificationName IS NULL"

    ' ComponentName_RUS 255->150, PointOfPart 255->50, Supplier 100->50
    Xfer "tblComponent", "dbo_tblComponent", "src.ComponentCode = dst.ComponentCode", "ComponentCode", _
        "INSERT INTO dbo_tblComponent ( ComponentCode, ComponentName, ComponentName_RUS, PointOfPart, StationID, StandardQty, IsMandatory, Supplier ) " & _
        "SELECT src.ComponentCode, src.ComponentName, Left(src.ComponentName_RUS,150), Left(src.PointOfPart,50), src.StationID, src.StandardQty, src.IsMandatory, Left(src.Supplier,50) " & _
        "FROM tblComponent AS src LEFT JOIN dbo_tblComponent AS dst ON src.ComponentCode = dst.ComponentCode " & _
        "WHERE dst.ComponentCode IS NULL"

    ' Кол-во соединений, Станция, Станция проверки: 255->50
    ' ПРОВЕРИТЬ ключ: Код_колмплектации может повторяться
    Xfer "tblConnections", "dbo_tblConnections", _
        "src.[Код_колмплектации] = dst.[Код_колмплектации] AND src.[Станция] = dst.[Станция]", "Код_колмплектации", _
        "INSERT INTO dbo_tblConnections ( [Критические соединения], [Кол-во соединений], [Станция], [Код_колмплектации], [Станция проверки] ) " & _
        "SELECT src.[Критические соединения], Left(src.[Кол-во соединений],50), Left(src.[Станция],50), src.[Код_колмплектации], Left(src.[Станция проверки],50) " & _
        "FROM tblConnections AS src LEFT JOIN dbo_tblConnections AS dst " & _
        "ON src.[Код_колмплектации] = dst.[Код_колмплектации] AND src.[Станция] = dst.[Станция] " & _
        "WHERE dst.[Код_колмплектации] IS NULL"

    Say ""

    ' ---------------- ЭТАП 3: ПРОИЗВОДСТВО ----------------
    Say "ЭТАП 3: ПРОИЗВОДСТВЕННЫЕ ДАННЫЕ"
    Say String(78, "-")

    ' ModelName и ErrorMessage расширены на сервере - не режем
    Xfer "tblProductionPlan", "dbo_tblProductionPlan", "src.VIN = dst.VIN", "VIN", _
        "INSERT INTO dbo_tblProductionPlan ( ModelArticle, ModelName, VIN, EngineNumber, Color, PlannedShipmentDate, ValidationStatus, ErrorMessage, StartDate, CompleteDate, plannedstartdate, Status, Specification_id, SpecificationName, ColorID, SEQN, NEWSEQN, statusid, PrintDate, validationdate, shipmentdate, reworkdate, reworkcompletedate, rework_comments, shipment_comments ) " & _
        "SELECT src.ModelArticle, src.ModelName, src.VIN, src.EngineNumber, src.Color, " & _
        DT("src.PlannedShipmentDate") & ", src.ValidationStatus, src.ErrorMessage, " & _
        DT("src.StartDate") & ", " & DT("src.CompleteDate") & ", " & DT("src.plannedstartdate") & ", " & _
        "src.Status, src.Specification_id, src.SpecificationName, src.ColorID, src.SEQN, src.NEWSEQN, src.statusid, " & _
        DT("src.PrintDate") & ", " & DT("src.validationdate") & ", " & DT("src.shipmentdate") & ", " & _
        DT("src.reworkdate") & ", " & DT("src.reworkcompletedate") & ", " & _
        "src.rework_comments, src.shipment_comments " & _
        "FROM tblProductionPlan AS src LEFT JOIN dbo_tblProductionPlan AS dst ON src.VIN = dst.VIN " & _
        "WHERE dst.VIN IS NULL"

    Xfer "tblPlanTemp", "dbo_tblPlanTemp", "src.VIN = dst.VIN", "VIN", _
        "INSERT INTO dbo_tblPlanTemp ( OriginalID, VIN, ModelArticle, ModelName, Color, EngineNumber, Status, NEWSEQN, DisplaySeq, statusid ) " & _
        "SELECT src.OriginalID, src.VIN, src.ModelArticle, src.ModelName, src.Color, src.EngineNumber, src.Status, src.NEWSEQN, src.DisplaySeq, src.statusid " & _
        "FROM tblPlanTemp AS src LEFT JOIN dbo_tblPlanTemp AS dst ON src.VIN = dst.VIN " & _
        "WHERE dst.VIN IS NULL"

    Xfer "tblProductionOrder", "dbo_tblProductionOrder", "src.VIN = dst.VIN", "VIN", _
        "INSERT INTO dbo_tblProductionOrder ( PlanID, VIN, EngineNumber, ModelArticle, ModelName, Color, PlannedShipmentDate, OrderStatus, CurrentStation, AssemblyStartTime, AssemblyEndTime ) " & _
        "SELECT src.PlanID, src.VIN, src.EngineNumber, src.ModelArticle, src.ModelName, src.Color, " & _
        DT("src.PlannedShipmentDate") & ", src.OrderStatus, src.CurrentStation, " & _
        DT("src.AssemblyStartTime") & ", " & DT("src.AssemblyEndTime") & " " & _
        "FROM tblProductionOrder AS src LEFT JOIN dbo_tblProductionOrder AS dst ON src.VIN = dst.VIN " & _
        "WHERE dst.VIN IS NULL"

    ' в этой таблице id нет вовсе
    Xfer "tblUpdColor", "dbo_tblUpdColor", "src.vin = dst.vin", "vin", _
        "INSERT INTO dbo_tblUpdColor ( vin, color ) " & _
        "SELECT src.vin, src.color " & _
        "FROM tblUpdColor AS src LEFT JOIN dbo_tblUpdColor AS dst ON src.vin = dst.vin " & _
        "WHERE dst.vin IS NULL"

    Xfer "tblImportplan", "dbo_tblImportplan", "src.[вин] = dst.[вин]", "вин", _
        "INSERT INTO dbo_tblImportplan ( F1, [арт], [название], [вин], [номер двс], [цвет согласованный], [готов к отгрузке], [Плановая дата готовности к отгрузке], [Дата отгрузки фактическая] ) " & _
        "SELECT src.F1, src.[арт], src.[название], src.[вин], src.[номер двс], src.[цвет согласованный], src.[готов к отгрузке], " & _
        DT("src.[Плановая дата готовности к отгрузке]") & ", " & DT("src.[Дата отгрузки фактическая]") & " " & _
        "FROM tblImportplan AS src LEFT JOIN dbo_tblImportplan AS dst ON src.[вин] = dst.[вин] " & _
        "WHERE dst.[вин] IS NULL"

    Say ""

    ' ---------------- ЭТАП 4: КАЧЕСТВО ----------------
    Say "ЭТАП 4: КОНТРОЛЬ КАЧЕСТВА"
    Say String(78, "-")

    ' Comment 50, CreatedBy 50, ClosedBy 50
    ' ПРОВЕРИТЬ ключ: если на один VIN бывает несколько NCP, приедет одна
    Xfer "tblNCP", "dbo_tblNCP", "src.VIN = dst.VIN", "VIN", _
        "INSERT INTO dbo_tblNCP ( StationID, ComponentID, VIN, Quantity, DiscrepancyTypeID, Comment, Status, CreatedBy, CreatedAt, ClosedBy, ClosedAt ) " & _
        "SELECT src.StationID, src.ComponentID, src.VIN, src.Quantity, src.DiscrepancyTypeID, " & _
        "Left(src.Comment,50), src.Status, Left(src.CreatedBy,50), " & DT("src.CreatedAt") & ", " & _
        "Left(src.ClosedBy,50), " & DT("src.ClosedAt") & " " & _
        "FROM tblNCP AS src LEFT JOIN dbo_tblNCP AS dst ON src.VIN = dst.VIN " & _
        "WHERE dst.VIN IS NULL"

    ' Comment 250, PhotoPath 50
    ' ПРОВЕРИТЬ ключ: NCP_Number может быть пустым
    Xfer "tblDiscrepancy", "dbo_tblDiscrepancy", _
        "src.NCP_Number = dst.NCP_Number AND src.DetectionTime = dst.DetectionTime", "NCP_Number", _
        "INSERT INTO dbo_tblDiscrepancy ( AssemblyEventID, ComponentID, DiscrepancyType, Comment, WasReplaced, DetectionTime, ResolutionTime, DiscrepancyStatus, NCP_Number, PhotoPath ) " & _
        "SELECT src.AssemblyEventID, src.ComponentID, src.DiscrepancyType, Left(src.Comment,250), src.WasReplaced, " & _
        DT("src.DetectionTime") & ", " & DT("src.ResolutionTime") & ", " & _
        "src.DiscrepancyStatus, src.NCP_Number, Left(src.PhotoPath,50) " & _
        "FROM tblDiscrepancy AS src LEFT JOIN dbo_tblDiscrepancy AS dst " & _
        "ON src.NCP_Number = dst.NCP_Number AND src.DetectionTime = dst.DetectionTime " & _
        "WHERE dst.NCP_Number IS NULL"

    ' ПРОВЕРИТЬ ключ: естественного ключа нет, сверка по паре компонент+дата
    Xfer "tblCrippleRecord", "dbo_tblCrippleRecord", _
        "src.ComponentID = dst.ComponentID AND src.RegistrationDate = dst.RegistrationDate", "ComponentID", _
        "INSERT INTO dbo_tblCrippleRecord ( OrderID, DiscrepancyID, ComponentID, CrippleReason, RegistrationDate, ExpectedResolutionDate, StorageLocation ) " & _
        "SELECT src.OrderID, src.DiscrepancyID, src.ComponentID, src.CrippleReason, " & _
        DT("src.RegistrationDate") & ", " & DT("src.ExpectedResolutionDate") & ", src.StorageLocation " & _
        "FROM tblCrippleRecord AS src LEFT JOIN dbo_tblCrippleRecord AS dst " & _
        "ON src.ComponentID = dst.ComponentID AND src.RegistrationDate = dst.RegistrationDate " & _
        "WHERE dst.ComponentID IS NULL"

    Xfer "tblJobCard", "dbo_tblJobCard", "src.JobCardNumber = dst.JobCardNumber", "JobCardNumber", _
        "INSERT INTO dbo_tblJobCard ( OrderID, JobCardNumber, PrintDate, CardStatus, BarcodeData ) " & _
        "SELECT src.OrderID, src.JobCardNumber, " & DT("src.PrintDate") & ", src.CardStatus, src.BarcodeData " & _
        "FROM tblJobCard AS src LEFT JOIN dbo_tblJobCard AS dst ON src.JobCardNumber = dst.JobCardNumber " & _
        "WHERE dst.JobCardNumber IS NULL"

    ' FileName 255->50
    Xfer "tblImportLog", "dbo_tblImportLog", _
        "src.ImportBatchID = dst.ImportBatchID AND src.ImportDate = dst.ImportDate", "ImportBatchID", _
        "INSERT INTO dbo_tblImportLog ( ImportDate, FileName, ImportedBy, RowsImported, RowsFailed, ErrorDescription, ImportBatchID ) " & _
        "SELECT " & DT("src.ImportDate") & ", Left(src.FileName,50), src.ImportedBy, src.RowsImported, src.RowsFailed, src.ErrorDescription, src.ImportBatchID " & _
        "FROM tblImportLog AS src LEFT JOIN dbo_tblImportLog AS dst " & _
        "ON src.ImportBatchID = dst.ImportBatchID AND src.ImportDate = dst.ImportDate " & _
        "WHERE dst.ImportBatchID IS NULL"

    ' ---------------- ИТОГИ ----------------
    Say ""
    Say String(78, "=")
    Say "ВСТАВЛЕНО ЗАПИСЕЙ: " & mInserted
    Say "ТАБЛИЦ С ПРОБЛЕМАМИ: " & mFailed
    Say "Время: " & Format(Now() - t0, "hh:nn:ss")
    Say "Завершено: " & Format(Now(), "dd.mm.yyyy hh:nn:ss")
    Say String(78, "=")
    Say ""
    Say "id выданы сервером заново. Поля-ссылки (PlanID, ComponentID, OrderID,"
    Say "DiscrepancyID, Specification_id, ColorID) содержат старые номера."

    WriteReport mReport

    MsgBox "Миграция завершена." & vbCrLf & vbCrLf & _
           "Вставлено записей: " & mInserted & vbCrLf & _
           "Таблиц с проблемами: " & mFailed & vbCrLf & vbCrLf & _
           "Отчёт: MIGRATION_RESULT.txt", _
           IIf(mFailed > 0, vbExclamation, vbInformation), "Результат"
End Sub

' ============================================================================
' Дата в диапазоне SQL Server: всё раньше 01.01.1753 уходит как Null
' ============================================================================
Private Function DT(col As String) As String
    DT = "IIf(" & col & "<#1/1/1753#,Null," & col & ")"
End Function

' ============================================================================
' Выполнить один INSERT с полным контролем результата
'   joinCond - условие сверки, например "src.VIN = dst.VIN"
'   nullCol  - колонка приёмника для проверки IS NULL
' ============================================================================
Private Sub Xfer(srcTable As String, dstTable As String, _
                 joinCond As String, nullCol As String, sql As String)
    Dim srcN As Long, dstBefore As Long, dstAfter As Long
    Dim expected As Long, actual As Long

    srcN = Counter("SELECT Count(*) AS N FROM [" & srcTable & "]")
    dstBefore = Counter("SELECT Count(*) AS N FROM [" & dstTable & "]")
    expected = Counter("SELECT Count(*) AS N FROM [" & srcTable & "] AS src " & _
                       "LEFT JOIN [" & dstTable & "] AS dst ON " & joinCond & " " & _
                       "WHERE dst.[" & nullCol & "] IS NULL")

    On Error GoTo Failed
    mDb.Execute sql, dbFailOnError
    On Error GoTo 0

    dstAfter = Counter("SELECT Count(*) AS N FROM [" & dstTable & "]")
    actual = dstAfter - dstBefore
    mInserted = mInserted + actual

    Say srcTable & " -> " & dstTable
    Say "    источник: " & srcN & "   на сервере: " & dstBefore & " -> " & dstAfter
    Say "    ожидалось: " & expected & "   вставлено: " & actual

    If expected < 0 Then
        mFailed = mFailed + 1
        Say "    ВНИМАНИЕ: счётчик сверки не сработал - проверьте условие сверки"
    ElseIf actual < expected Then
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
    Say OdbcDetail()
    Say ""
End Sub

' Ошибка 3146 - обёртка Access. Настоящий ответ сервера с именем колонки и
' значением лежит в DBEngine.Errors.
Private Function OdbcDetail() As String
    Dim e As Object, s As String

    On Error Resume Next
    For Each e In Application.DBEngine.Errors
        s = s & "        [" & e.Number & "] " & e.Description & vbCrLf
    Next
    If Len(s) = 0 Then s = "        (детализация недоступна)" & vbCrLf

    OdbcDetail = "    Ответ сервера:" & vbCrLf & s
End Function

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
    ' третий параметр True - Unicode, иначе кириллица уходит вопросиками
    Set f = fso.CreateTextFile(p, True, True)
    f.Write text
    f.Close

    On Error Resume Next
    Shell "notepad.exe """ & p & """"
End Sub
