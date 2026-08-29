' ============================================================================
' ЗОНД: почему запись не доезжает на сервер
' ============================================================================
' Запуск: Probe
'
' Отвечает на четыре вопроса:
'   1. Куда реально ведут связанные таблицы dbo_* (строка подключения, база,
'      имя таблицы на сервере). Возможно, они смотрят не в FormulaD.
'   2. Сколько в них строк на самом деле - через SELECT Count(*), а не
'      MoveLast/RecordCount.
'   3. Открывается ли связанная таблица на запись. Если у таблицы на сервере
'      нет уникального индекса, Access делает её доступной только для чтения,
'      и вставка не проходит.
'   4. Что именно отвечает сервер при вставке ОДНОЙ недостающей строки
'      tblProductionPlan - точный номер и текст ошибки.
' ============================================================================

Option Compare Database
Option Explicit

Private Const dbFailOnError As Long = 128
Private Const dbOpenDynaset As Long = 2

Private mDb As Object
Private mRep As String

Sub Probe()
    Set mDb = CurrentDb()
    mRep = ""

    Say String(78, "=")
    Say "ЗОНД МИГРАЦИИ"
    Say "Дата: " & Format(Now(), "dd.mm.yyyy hh:nn:ss")
    Say String(78, "=")
    Say ""

    ProbeLinks
    ProbeProductionPlan

    WriteReport mRep
    MsgBox "Зонд отработал. Отчёт: PROBE_RESULT.txt", vbInformation, "Готово"
End Sub

' ----------------------------------------------------------------------------
' 1-3. Куда ведут связи, сколько строк, доступна ли запись
' ----------------------------------------------------------------------------
Private Sub ProbeLinks()
    Dim td As Object
    Dim i As Long
    Dim n As Long
    Dim linked As Long

    Say "СВЯЗАННЫЕ ТАБЛИЦЫ"
    Say String(78, "-")
    Say ""

    For i = 0 To mDb.TableDefs.Count - 1
        Set td = mDb.TableDefs(i)

        ' связанная = непустая строка подключения (надёжнее, чем Attributes)
        If Len(td.Connect) > 0 Then
            linked = linked + 1
            Say td.Name
            Say "    на сервере: " & td.SourceTableName
            Say "    подключение: " & td.Connect
            Say "    строк: " & CountOf(td.Name)
            Say "    запись разрешена: " & IIf(IsWritable(td.Name), "ДА", "НЕТ - таблица только для чтения")
            Say "    уникальный индекс: " & IIf(HasIndex(td), "есть", "НЕТ - причина запрета записи")
            Say ""
        End If
    Next i

    If linked = 0 Then
        Say "Связанных таблиц нет ни одной."
        Say "Тогда dbo_* - это локальные копии, и данные никуда не уходят."
        Say ""
    End If

    ' локальные таблицы, коротко
    Say "ЛОКАЛЬНЫЕ ТАБЛИЦЫ"
    Say String(78, "-")
    For i = 0 To mDb.TableDefs.Count - 1
        Set td = mDb.TableDefs(i)
        If Len(td.Connect) = 0 Then
            If Left(td.Name, 4) <> "MSys" And Left(td.Name, 1) <> "~" Then
                Say "    " & td.Name & ": " & CountOf(td.Name)
                n = n + 1
            End If
        End If
    Next i
    Say ""
End Sub

' ----------------------------------------------------------------------------
' 4. Вставка ОДНОЙ недостающей строки с показом ответа сервера
' ----------------------------------------------------------------------------
Private Sub ProbeProductionPlan()
    Dim rs As Object
    Dim missingID As Long
    Dim sql As String
    Dim before As Long, after As Long

    Say String(78, "=")
    Say "ТОЧЕЧНАЯ ПРОВЕРКА: tblProductionPlan"
    Say String(78, "=")
    Say ""

    Say "локально: " & CountOf("tblProductionPlan") & _
        "   на сервере: " & CountOf("dbo_tblProductionPlan")
    Say "максимальный ID локально: " & ScalarOf("SELECT Max(ID) AS N FROM tblProductionPlan")
    Say "максимальный ID на сервере: " & ScalarOf("SELECT Max(ID) AS N FROM dbo_tblProductionPlan")
    Say ""

    ' какие ID есть локально, но отсутствуют на сервере
    On Error GoTo NoQuery
    Set rs = mDb.OpenRecordset( _
        "SELECT src.ID, src.VIN FROM tblProductionPlan AS src " & _
        "LEFT JOIN dbo_tblProductionPlan AS dst ON src.ID = dst.ID " & _
        "WHERE dst.ID IS NULL")
    On Error GoTo 0

    If rs.EOF Then
        Say "Недостающих строк нет - по полю ID всё совпадает."
        Say "Значит новая запись либо уже на сервере, либо её ID совпал"
        Say "с ID существующей серверной строки, и сверка по ID лжёт."
        Say "В этом случае сверять надо по VIN."
        rs.Close
        Say ""
        Exit Sub
    End If

    Say "Недостающие на сервере строки:"
    missingID = -1
    Do While Not rs.EOF
        If missingID = -1 Then missingID = rs.Fields("ID").Value
        Say "    ID=" & rs.Fields("ID").Value & "   VIN=" & Nz(rs.Fields("VIN").Value, "(пусто)")
        rs.MoveNext
    Loop
    rs.Close
    Say ""

    ' пробуем вставить ровно одну из них
    Say "Пробная вставка одной строки, ID=" & missingID
    before = CountOf("dbo_tblProductionPlan")

    sql = "INSERT INTO dbo_tblProductionPlan ( ID, ModelArticle, ModelName, VIN, EngineNumber, Color, PlannedShipmentDate, ValidationStatus, ErrorMessage, StartDate, CompleteDate, plannedstartdate, Status, Specification_id, SpecificationName, ColorID, SEQN, NEWSEQN, statusid, PrintDate, validationdate, shipmentdate, reworkdate, reworkcompletedate, rework_comments, shipment_comments ) " & _
          "SELECT src.ID, src.ModelArticle, src.ModelName, src.VIN, src.EngineNumber, src.Color, src.PlannedShipmentDate, src.ValidationStatus, src.ErrorMessage, src.StartDate, src.CompleteDate, src.plannedstartdate, src.Status, src.Specification_id, src.SpecificationName, src.ColorID, src.SEQN, src.NEWSEQN, src.statusid, src.PrintDate, src.validationdate, src.shipmentdate, src.reworkdate, src.reworkcompletedate, src.rework_comments, src.shipment_comments " & _
          "FROM tblProductionPlan AS src WHERE src.ID = " & missingID

    On Error GoTo InsertFailed
    mDb.Execute sql, dbFailOnError
    On Error GoTo 0

    after = CountOf("dbo_tblProductionPlan")
    Say "    RecordsAffected: " & mDb.RecordsAffected
    Say "    строк на сервере: " & before & " -> " & after

    If after > before Then
        Say "    РЕЗУЛЬТАТ: строка вставлена."
    Else
        Say "    РЕЗУЛЬТАТ: ошибки нет, но строка не появилась."
        Say "    Это признак того, что dbo_tblProductionPlan не связана с"
        Say "    сервером, либо связана с другой базой, чем та, что вы смотрите."
        Say "    Сверьте строку подключения выше."
    End If
    Say ""
    Exit Sub

InsertFailed:
    Say "    ОТКАЗ " & Err.Number & ": " & Err.Description
    Say ""
    Say "    Расшифровка:"
    Select Case Err.Number
        Case 3027
            Say "    Таблица открыта только для чтения. У таблицы на сервере"
            Say "    нет уникального индекса - Access не даёт в неё писать."
            Say "    Лечится добавлением первичного ключа на сервере и"
            Say "    обновлением связи в диспетчере связанных таблиц."
        Case 3022
            Say "    Нарушение уникальности: строка с таким ключом уже есть."
        Case 3155, 3146
            Say "    Отказ пришёл от ODBC/SQL Server. Полный текст выше -"
            Say "    в нём сервер называет причину. Частый случай:"
            Say "    'Cannot insert explicit value for identity column' -"
            Say "    колонка ID объявлена IDENTITY и явную вставку не принимает."
        Case Else
            Say "    Смотрите текст ошибки выше."
    End Select
    Say ""
    Exit Sub

NoQuery:
    Say "Запрос сверки не выполнился: " & Err.Number & " - " & Err.Description
    Say ""
End Sub

' ----------------------------------------------------------------------------
' Вспомогательные
' ----------------------------------------------------------------------------
Private Function CountOf(tableName As String) As String
    CountOf = ScalarOf("SELECT Count(*) AS N FROM [" & tableName & "]")
End Function

Private Function ScalarOf(sql As String) As String
    On Error GoTo Failed
    Dim rs As Object
    Set rs = mDb.OpenRecordset(sql)
    ScalarOf = CStr(Nz(rs.Fields("N").Value, 0))
    rs.Close
    Exit Function
Failed:
    ScalarOf = "ошибка " & Err.Number & " (" & Err.Description & ")"
End Function

Private Function IsWritable(tableName As String) As Boolean
    On Error GoTo Failed
    Dim rs As Object
    Set rs = mDb.OpenRecordset("SELECT * FROM [" & tableName & "]", dbOpenDynaset)
    IsWritable = rs.Updatable
    rs.Close
    Exit Function
Failed:
    IsWritable = False
End Function

Private Function HasIndex(td As Object) As Boolean
    On Error GoTo Failed
    HasIndex = (td.Indexes.Count > 0)
    Exit Function
Failed:
    HasIndex = False
End Function

Private Sub Say(text As String)
    mRep = mRep & text & vbCrLf
End Sub

Private Sub WriteReport(text As String)
    Dim fso As Object, f As Object, p As String
    Set fso = CreateObject("Scripting.FileSystemObject")
    p = Application.CurrentProject.Path & "\PROBE_RESULT.txt"
    Set f = fso.CreateTextFile(p, True)
    f.Write text
    f.Close
    On Error Resume Next
    Shell "notepad.exe """ & p & """"
End Sub
