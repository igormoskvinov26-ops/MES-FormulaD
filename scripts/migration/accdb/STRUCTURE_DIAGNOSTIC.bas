' ============================================================================
' ДИАГНОСТИКА СТРУКТУРЫ: Проверка полей в каждой таблице
' ============================================================================
' Назначение: Показать точные имена полей в локальных и связанных таблицах
' ============================================================================

Option Compare Database
Option Explicit

Sub DiagnosticTableStructure()
    On Error GoTo ErrorHandler

    Dim db As Object
    Dim tbl As Object
    Dim fld As Object
    Dim reportText As String

    Set db = CurrentDb()

    reportText = ""
    reportText = reportText & "=" & String(80, "=") & vbCrLf
    reportText = reportText & "ДИАГНОСТИКА СТРУКТУРЫ ТАБЛИЦ" & vbCrLf
    reportText = reportText & "Дата: " & Format(Now(), "dd.mm.yyyy hh:mm:ss") & vbCrLf
    reportText = reportText & "=" & String(80, "=") & vbCrLf & vbCrLf

    ' Таблицы для проверки
    Dim tablesToCheck() As String
    tablesToCheck = Split("tblSpecifications,dbo_tblSpecifications,tblProductionPlan,dbo_tblProductionPlan,tblComponent,dbo_tblComponent,tblUser,dbo_tblUser", ",")

    Dim i As Integer
    For i = LBound(tablesToCheck) To UBound(tablesToCheck)
        Dim tableName As String
        tableName = Trim(tablesToCheck(i))

        On Error Resume Next
        Set tbl = db.TableDefs(tableName)
        On Error GoTo ErrorHandler

        If Not tbl Is Nothing Then
            reportText = reportText & "ТАБЛИЦА: " & tableName & vbCrLf
            reportText = reportText & String(80, "-") & vbCrLf

            Dim j As Integer
            Dim fieldInfo As String

            For j = 0 To tbl.Fields.Count - 1
                Set fld = tbl.Fields(j)
                fieldInfo = fld.Name

                ' Добавить информацию о типе
                Select Case fld.Type
                    Case 1: fieldInfo = fieldInfo & " (Boolean)"
                    Case 2: fieldInfo = fieldInfo & " (Byte)"
                    Case 3: fieldInfo = fieldInfo & " (Integer)"
                    Case 4: fieldInfo = fieldInfo & " (Long)"
                    Case 5: fieldInfo = fieldInfo & " (Currency)"
                    Case 6: fieldInfo = fieldInfo & " (Single)"
                    Case 7: fieldInfo = fieldInfo & " (Double)"
                    Case 8: fieldInfo = fieldInfo & " (Date/Time)"
                    Case 10: fieldInfo = fieldInfo & " (Text, " & fld.Size & ")"
                    Case 12: fieldInfo = fieldInfo & " (Memo)"
                    Case 15: fieldInfo = fieldInfo & " (GUID)"
                    Case Else: fieldInfo = fieldInfo & " (Type: " & fld.Type & ")"
                End Select

                ' Добавить информацию о ключе
                If fld.Attributes And 1 Then
                    fieldInfo = fieldInfo & " [PRIMARY KEY]"
                End If

                reportText = reportText & "  • " & fieldInfo & vbCrLf
            Next j

            reportText = reportText & vbCrLf & vbCrLf
        Else
            reportText = reportText & "❌ ТАБЛИЦА НЕ НАЙДЕНА: " & tableName & vbCrLf & vbCrLf
        End If
    Next i

    ' ========================================================================
    ' КЛЮЧЕВЫЕ РАЗЛИЧИЯ
    ' ========================================================================
    reportText = reportText & vbCrLf
    reportText = reportText & "=" & String(80, "=") & vbCrLf
    reportText = reportText & "АНАЛИЗ РАЗЛИЧИЙ" & vbCrLf
    reportText = reportText & "=" & String(80, "=") & vbCrLf & vbCrLf

    reportText = reportText & "Сравните поля между локальными и dbo_ таблицами:" & vbCrLf
    reportText = reportText & "- Проверьте что ВСЕ поля из локальной таблицы есть в dbo_ таблице" & vbCrLf
    reportText = reportText & "- Если поля имеют разные имена - нужно обновить макрос" & vbCrLf
    reportText = reportText & "- Если поле отсутствует в целевой таблице - исключите его из INSERT" & vbCrLf & vbCrLf

    reportText = reportText & "Например, если в локальной tblSpecifications есть поле 'id_assembly'" & vbCrLf
    reportText = reportText & "но в dbo_tblSpecifications его нет - удалите это поле из INSERT команды:" & vbCrLf
    reportText = reportText & vbCrLf
    reportText = reportText & "  -- БЫЛО:" & vbCrLf
    reportText = reportText & "  INSERT INTO dbo_tblSpecifications (id, specificationName, valid, ModelArticle, id_assembly)" & vbCrLf
    reportText = reportText & vbCrLf
    reportText = reportText & "  -- СТАЛО:" & vbCrLf
    reportText = reportText & "  INSERT INTO dbo_tblSpecifications (id, specificationName, valid, ModelArticle)" & vbCrLf
    reportText = reportText & vbCrLf

    SaveStructureReport reportText

    MsgBox "✅ Диагностика структуры завершена!" & vbCrLf & vbCrLf & _
           "Отчет: STRUCTURE_DIAGNOSTIC.txt" & vbCrLf & vbCrLf & _
           "Сравните поля в локальных и dbo_ таблицах!", _
           vbInformation, "Диагностика"

    Exit Sub
ErrorHandler:
    MsgBox "Ошибка: " & Err.Description, vbCritical
End Sub

Private Sub SaveStructureReport(reportText As String)
    Dim fso As Object
    Dim outputFile As Object
    Dim filePath As String

    Set fso = CreateObject("Scripting.FileSystemObject")
    filePath = Application.CurrentProject.Path & "\STRUCTURE_DIAGNOSTIC.txt"
    Set outputFile = fso.CreateTextFile(filePath, True)
    outputFile.Write reportText
    outputFile.Close

    On Error Resume Next
    Shell "notepad.exe """ & filePath & """"
    On Error GoTo 0
End Sub
