' ============================================================================
' ДИАГНОСТИКА МИГРАЦИИ: Проверка локальных и связанных таблиц
' ============================================================================
' Назначение: Выявить проблемы перед миграцией
' Результат: Отчет с именами таблиц, типами и количеством записей
' ============================================================================

Option Compare Database
Option Explicit

Sub DiagnosticsCheckTables()
    On Error GoTo ErrorHandler

    Dim db As Object
    Dim tbl As Object
    Dim rs As Object
    Dim reportText As String
    Dim localCount As Long
    Dim linkedCount As Long
    Dim i As Long

    Set db = CurrentDb()

    reportText = ""
    reportText = reportText & "=" & String(80, "=") & vbCrLf
    reportText = reportText & "ДИАГНОСТИКА МИГРАЦИИ ДАННЫХ" & vbCrLf
    reportText = reportText & "Дата: " & Format(Now(), "dd.mm.yyyy hh:mm:ss") & vbCrLf
    reportText = reportText & "=" & String(80, "=") & vbCrLf & vbCrLf

    ' ========================================================================
    ' ПРОВЕРКА ЛОКАЛЬНЫХ ТАБЛИЦ (исходник)
    ' ========================================================================
    reportText = reportText & "ЛОКАЛЬНЫЕ ТАБЛИЦЫ (MES_server.accdb)" & vbCrLf
    reportText = reportText & String(80, "-") & vbCrLf & vbCrLf

    localCount = 0
    For i = 0 To db.TableDefs.Count - 1
        Set tbl = db.TableDefs(i)

        ' Пропустить системные таблицы
        If Not (tbl.Name Like "~*" Or tbl.Name Like "MSys*") Then
            ' Проверить есть ли это таблица (не связанная)
            If (tbl.Attributes And 1) = 0 Then ' не связанная
                Dim recCount As Long
                On Error Resume Next
                Set rs = db.OpenRecordset(tbl.Name)
                If Not rs Is Nothing Then
                    rs.MoveLast
                    recCount = rs.RecordCount
                    rs.Close
                Else
                    recCount = 0
                End If
                On Error GoTo ErrorHandler

                reportText = reportText & tbl.Name & ": " & recCount & " записей"
                If recCount = 0 Then
                    reportText = reportText & " ⚠️  ПУСТО!"
                End If
                reportText = reportText & vbCrLf

                localCount = localCount + recCount
            End If
        End If
    Next i

    reportText = reportText & "────────────────────────────────────────────────────────" & vbCrLf
    reportText = reportText & "ИТОГО ЛОКАЛЬНЫХ ЗАПИСЕЙ: " & localCount & vbCrLf & vbCrLf

    ' ========================================================================
    ' ПРОВЕРКА СВЯЗАННЫХ ТАБЛИЦ (SQL Server)
    ' ========================================================================
    reportText = reportText & "СВЯЗАННЫЕ ТАБЛИЦЫ (SQL Server)" & vbCrLf
    reportText = reportText & String(80, "-") & vbCrLf & vbCrLf

    linkedCount = 0
    Dim linkedFound As Boolean
    linkedFound = False

    For i = 0 To db.TableDefs.Count - 1
        Set tbl = db.TableDefs(i)

        ' Пропустить системные таблицы
        If Not (tbl.Name Like "~*" Or tbl.Name Like "MSys*") Then
            ' Проверить если это связанная таблица
            If (tbl.Attributes And 1) = 1 Then ' связанная
                linkedFound = True
                Dim linkedRecCount As Long
                On Error Resume Next
                Set rs = db.OpenRecordset(tbl.Name)
                If Not rs Is Nothing Then
                    rs.MoveLast
                    linkedRecCount = rs.RecordCount
                    rs.Close
                Else
                    linkedRecCount = 0
                End If
                On Error GoTo ErrorHandler

                reportText = reportText & tbl.Name & ": " & linkedRecCount & " записей"
                If linkedRecCount = 0 Then
                    reportText = reportText & " ⚠️  ПУСТО!"
                End If
                reportText = reportText & vbCrLf
                reportText = reportText & "  Источник: " & tbl.Connect & vbCrLf & vbCrLf

                linkedCount = linkedCount + linkedRecCount
            End If
        End If
    Next i

    If Not linkedFound Then
        reportText = reportText & "❌ СВЯЗАННЫЕ ТАБЛИЦЫ НЕ НАЙДЕНЫ!" & vbCrLf
        reportText = reportText & "Нужно добавить linked таблицы из SQL Server в этом файле." & vbCrLf & vbCrLf
    End If

    reportText = reportText & "────────────────────────────────────────────────────────" & vbCrLf
    reportText = reportText & "ИТОГО ЗАПИСЕЙ В СВЯЗАННЫХ: " & linkedCount & vbCrLf & vbCrLf

    ' ========================================================================
    ' ДИАГНОЗ И РЕКОМЕНДАЦИИ
    ' ========================================================================
    reportText = reportText & vbCrLf
    reportText = reportText & "=" & String(80, "=") & vbCrLf
    reportText = reportText & "ДИАГНОЗ" & vbCrLf
    reportText = reportText & "=" & String(80, "=") & vbCrLf & vbCrLf

    If localCount = 0 Then
        reportText = reportText & "❌ ПРОБЛЕМА: Локальные таблицы ПУСТЫ!" & vbCrLf
        reportText = reportText & "   → Нет данных для миграции" & vbCrLf
        reportText = reportText & "   → Нужно заполнить исходные таблицы данными" & vbCrLf & vbCrLf
    Else
        reportText = reportText & "✅ Локальные таблицы содержат " & localCount & " записей" & vbCrLf & vbCrLf
    End If

    If Not linkedFound Then
        reportText = reportText & "❌ ПРОБЛЕМА: Связанные таблицы НЕ ДОБАВЛЕНЫ!" & vbCrLf
        reportText = reportText & "   → Нужно создать linked таблицы из SQL Server" & vbCrLf
        reportText = reportText & "   → В External Data → New Data Source → From SQL Server" & vbCrLf & vbCrLf
    Else
        If linkedCount = 0 Then
            reportText = reportText & "⚠️  ВНИМАНИЕ: Связанные таблицы найдены, но пусты на SQL Server" & vbCrLf
            reportText = reportText & "   → Это нормально для первой миграции" & vbCrLf & vbCrLf
        Else
            reportText = reportText & "⚠️  Связанные таблицы уже содержат " & linkedCount & " записей" & vbCrLf
            reportText = reportText & "   → Миграция может НЕ перенести дубликаты (WHERE NOT EXISTS)" & vbCrLf & vbCrLf
        End If
    End If

    ' ========================================================================
    ' ИТОГОВЫЕ РЕКОМЕНДАЦИИ
    ' ========================================================================
    reportText = reportText & vbCrLf
    reportText = reportText & "=" & String(80, "=") & vbCrLf
    reportText = reportText & "РЕКОМЕНДАЦИИ" & vbCrLf
    reportText = reportText & "=" & String(80, "=") & vbCrLf & vbCrLf

    If localCount = 0 Then
        reportText = reportText & "1. Убедитесь что данные есть в исходных таблицах" & vbCrLf
        reportText = reportText & "   Откройте каждую таблицу и проверьте наличие записей" & vbCrLf & vbCrLf
    End If

    If Not linkedFound Then
        reportText = reportText & "2. Добавьте связанные таблицы из SQL Server:" & vbCrLf
        reportText = reportText & "   а) External Data tab" & vbCrLf
        reportText = reportText & "   б) New Data Source → From Other Sources → From SQL Server" & vbCrLf
        reportText = reportText & "   в) Подключиться к FormulaD базе" & vbCrLf
        reportText = reportText & "   г) Выбрать нужные таблицы для импорта" & vbCrLf & vbCrLf
    End If

    If localCount > 0 And linkedFound Then
        reportText = reportText & "3. Все условия для миграции выполнены!" & vbCrLf
        reportText = reportText & "   → Запустите MIGRATION_MACRO_FINAL.bas" & vbCrLf & vbCrLf
    End If

    reportText = reportText & vbCrLf
    reportText = reportText & "=" & String(80, "=") & vbCrLf
    reportText = reportText & "Сохранено: " & Format(Now(), "dd.mm.yyyy hh:mm:ss") & vbCrLf
    reportText = reportText & "=" & String(80, "=") & vbCrLf

    SaveDiagnosticReport reportText

    MsgBox "✅ Диагностика завершена!" & vbCrLf & vbCrLf & _
           "Локальных записей: " & localCount & vbCrLf & _
           "Связанные таблицы: " & IIf(linkedFound, "Найдены", "НЕ найдены") & vbCrLf & vbCrLf & _
           "Отчет: DIAGNOSTIC_RESULT.txt", _
           vbInformation, "Диагностика"

    Exit Sub
ErrorHandler:
    MsgBox "Ошибка при диагностике: " & Err.Description, vbCritical
End Sub

Private Sub SaveDiagnosticReport(reportText As String)
    Dim fso As Object
    Dim outputFile As Object
    Dim filePath As String

    Set fso = CreateObject("Scripting.FileSystemObject")
    filePath = Application.CurrentProject.Path & "\DIAGNOSTIC_RESULT.txt"
    Set outputFile = fso.CreateTextFile(filePath, True)
    outputFile.Write reportText
    outputFile.Close

    On Error Resume Next
    Shell "notepad.exe """ & filePath & """"
    On Error GoTo 0
End Sub
