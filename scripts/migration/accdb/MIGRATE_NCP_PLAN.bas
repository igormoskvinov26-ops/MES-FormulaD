' ============================================================================
' RELOAD OF TWO TABLES: tblProductionPlan and tblNCP
' Local Access tables -> linked SQL Server tables (dbo_*)
' Run: MigrateNcpAndPlan
' ============================================================================
' Clears dbo_tblProductionPlan and dbo_tblNCP on the server, then copies all
' rows from the local tables. No other table is touched.
'
' Safety:
'   - refuses to delete when the source table is empty
'   - asks for confirmation with row counts before deleting anything
'   - reports, per column, how many values are too long for the server
'     column BEFORE the transfer, so truncation is never silent
'   - verifies the row count after the transfer
'
' Column names, types and sizes are read from TableDefs, i.e. from the real
' server schema - not hard coded. Text values are cut to the target size,
' dates before 01.01.1753 (outside SQL Server datetime range) become Null.
'
' id is not transferred: it is an IDENTITY counter on the server.
'
' All text here is Latin on purpose: VBA stores string literals in the ANSI
' code page of the Windows system locale, so cyrillic literals turn into ???
' when that locale is not Russian.
' ============================================================================

Option Compare Database
Option Explicit

Private Const dbFailOnError As Long = 128
Private Const dbDate As Long = 8
Private Const dbText As Long = 10

Private mDb As Object
Private mReport As String

' ============================================================================
Sub MigrateNcpAndPlan()
    Dim planSrc As Long, ncpSrc As Long
    Dim planDst As Long, ncpDst As Long
    Dim answer As Long
    Dim okPlan As Boolean, okNcp As Boolean

    Set mDb = CurrentDb()
    mReport = ""

    Say String(78, "=")
    Say "RELOAD: tblProductionPlan, tblNCP"
    Say "Start: " & Format(Now(), "dd.mm.yyyy hh:nn:ss")
    Say String(78, "=")
    Say ""

    ' -------- source must not be empty --------
    planSrc = Counter("SELECT Count(*) AS N FROM [tblProductionPlan]")
    ncpSrc = Counter("SELECT Count(*) AS N FROM [tblNCP]")
    planDst = Counter("SELECT Count(*) AS N FROM [dbo_tblProductionPlan]")
    ncpDst = Counter("SELECT Count(*) AS N FROM [dbo_tblNCP]")

    If planSrc <= 0 Or ncpSrc <= 0 Then
        MsgBox "Aborted. Source tables must not be empty." & vbCrLf & vbCrLf & _
               "tblProductionPlan: " & planSrc & vbCrLf & _
               "tblNCP: " & ncpSrc & vbCrLf & vbCrLf & _
               "Nothing was deleted.", vbCritical, "Aborted"
        Exit Sub
    End If

    ' -------- truncation preflight --------
    Say "TRUNCATION CHECK (before any change)"
    Say String(78, "-")
    Preflight "tblProductionPlan", "dbo_tblProductionPlan"
    Preflight "tblNCP", "dbo_tblNCP"
    Say ""

    ' -------- confirmation --------
    answer = MsgBox("This will DELETE all rows in two server tables and reload them." & vbCrLf & vbCrLf & _
                    "dbo_tblProductionPlan: " & planDst & " rows on server -> replaced by " & planSrc & vbCrLf & _
                    "dbo_tblNCP: " & ncpDst & " rows on server -> replaced by " & ncpSrc & vbCrLf & vbCrLf & _
                    "No other table is touched." & vbCrLf & _
                    "Local Access data is not modified." & vbCrLf & vbCrLf & _
                    "Continue?", _
                    vbYesNo + vbExclamation + vbDefaultButton2, "Confirm reload")

    If answer <> vbYes Then
        Say "Cancelled by user. Nothing was changed."
        WriteReport mReport
        MsgBox "Cancelled. Nothing was changed.", vbInformation, "Cancelled"
        Exit Sub
    End If

    ' -------- reload --------
    Say "RELOAD"
    Say String(78, "-")
    okPlan = Reload("tblProductionPlan", "dbo_tblProductionPlan")
    okNcp = Reload("tblNCP", "dbo_tblNCP")

    ' -------- result --------
    Say String(78, "=")
    Say "tblProductionPlan: " & IIf(okPlan, "OK", "FAILED")
    Say "tblNCP: " & IIf(okNcp, "OK", "FAILED")
    Say "Finished: " & Format(Now(), "dd.mm.yyyy hh:nn:ss")
    Say String(78, "=")

    WriteReport mReport

    If okPlan And okNcp Then
        MsgBox "Done." & vbCrLf & vbCrLf & _
               "dbo_tblProductionPlan: " & Counter("SELECT Count(*) AS N FROM [dbo_tblProductionPlan]") & " rows" & vbCrLf & _
               "dbo_tblNCP: " & Counter("SELECT Count(*) AS N FROM [dbo_tblNCP]") & " rows" & vbCrLf & vbCrLf & _
               "Report: MIGRATION_NCP_PLAN.txt", vbInformation, "Done"
    Else
        MsgBox "Finished with errors. See report: MIGRATION_NCP_PLAN.txt" & vbCrLf & vbCrLf & _
               "Local Access data is intact - the run can be repeated.", _
               vbExclamation, "Errors"
    End If
End Sub

' ============================================================================
' Report values that will not fit into the server columns
' ============================================================================
Private Sub Preflight(srcTable As String, dstTable As String)
    Dim srcTd As Object, dstTd As Object
    Dim i As Long, n As Long, total As Long
    Dim nm As String

    On Error GoTo Failed

    Set srcTd = mDb.TableDefs(srcTable)
    Set dstTd = mDb.TableDefs(dstTable)

    Say srcTable & " -> " & dstTable

    For i = 0 To dstTd.Fields.Count - 1
        nm = dstTd.Fields(i).Name
        If LCase$(nm) <> "id" And HasField(srcTd, nm) Then
            If dstTd.Fields(i).Type = dbText And dstTd.Fields(i).Size > 0 Then
                n = Counter("SELECT Count(*) AS N FROM [" & srcTable & "] " & _
                            "WHERE Len([" & nm & "]) > " & dstTd.Fields(i).Size)
                If n > 0 Then
                    Say "    " & nm & ": " & n & " value(s) longer than " & _
                        dstTd.Fields(i).Size & " - will be cut"
                    total = total + n
                End If
            End If
        End If
    Next i

    If total = 0 Then Say "    no truncation"
    Say ""
    Exit Sub

Failed:
    Say "    preflight error " & Err.Number & ": " & Err.Description
    Say ""
End Sub

' ============================================================================
' Delete everything on the server side, then copy all source rows
' ============================================================================
Private Function Reload(srcTable As String, dstTable As String) As Boolean
    Dim srcTd As Object, dstTd As Object
    Dim cols As String, vals As String, nm As String
    Dim i As Long
    Dim srcN As Long, afterDel As Long, afterIns As Long
    Dim sql As String

    Reload = False
    Say srcTable & " -> " & dstTable

    srcN = Counter("SELECT Count(*) AS N FROM [" & srcTable & "]")
    If srcN <= 0 Then
        Say "    source is empty - skipped, server table left untouched"
        Say ""
        Exit Function
    End If

    Set srcTd = mDb.TableDefs(srcTable)
    Set dstTd = mDb.TableDefs(dstTable)

    ' build the column list from the real schema
    For i = 0 To dstTd.Fields.Count - 1
        nm = dstTd.Fields(i).Name
        If LCase$(nm) <> "id" And HasField(srcTd, nm) Then
            If Len(cols) > 0 Then
                cols = cols & ", "
                vals = vals & ", "
            End If
            cols = cols & "[" & nm & "]"
            vals = vals & ValueExpr(dstTd.Fields(i), nm)
        End If
    Next i

    If Len(cols) = 0 Then
        Say "    no common columns - skipped"
        Say ""
        Exit Function
    End If

    ' ---- delete ----
    On Error GoTo DeleteFailed
    mDb.Execute "DELETE FROM [" & dstTable & "]", dbFailOnError
    On Error GoTo 0

    afterDel = Counter("SELECT Count(*) AS N FROM [" & dstTable & "]")
    If afterDel <> 0 Then
        Say "    delete did not empty the table, " & afterDel & " row(s) left - insert skipped"
        Say ""
        Exit Function
    End If
    Say "    server table cleared"

    ' ---- insert ----
    sql = "INSERT INTO [" & dstTable & "] ( " & cols & " ) " & _
          "SELECT " & vals & " FROM [" & srcTable & "] AS src"

    On Error GoTo InsertFailed
    mDb.Execute sql, dbFailOnError
    On Error GoTo 0

    afterIns = Counter("SELECT Count(*) AS N FROM [" & dstTable & "]")
    Say "    source: " & srcN & "   inserted: " & afterIns

    If afterIns = srcN Then
        Reload = True
    Else
        Say "    COUNT MISMATCH - expected " & srcN
    End If
    Say ""
    Exit Function

DeleteFailed:
    Say "    DELETE failed " & Err.Number & ": " & Err.Description
    Say OdbcDetail()
    Say "    server table left as it was"
    Say ""
    Exit Function

InsertFailed:
    Say "    INSERT failed " & Err.Number & ": " & Err.Description
    Say OdbcDetail()
    Say "    server table is now EMPTY - fix the error and run again"
    Say "    local Access data is intact"
    Say ""
End Function

' ============================================================================
' Value expression: cut text to the target size, guard the datetime range
' ============================================================================
Private Function ValueExpr(dstFld As Object, nm As String) As String
    Select Case dstFld.Type
        Case dbDate
            ValueExpr = "IIf(src.[" & nm & "]<#1/1/1753#,Null,src.[" & nm & "])"
        Case dbText
            If dstFld.Size > 0 Then
                ValueExpr = "Left(src.[" & nm & "]," & dstFld.Size & ")"
            Else
                ValueExpr = "src.[" & nm & "]"
            End If
        Case Else
            ValueExpr = "src.[" & nm & "]"
    End Select
End Function

Private Function HasField(td As Object, nm As String) As Boolean
    Dim f As Object

    On Error Resume Next
    Set f = Nothing
    Set f = td.Fields(nm)
    HasField = Not (f Is Nothing)
End Function

' Error 3146 is only Access's wrapper - the server message is in DBEngine.Errors
Private Function OdbcDetail() As String
    Dim e As Object, s As String

    On Error Resume Next
    For Each e In Application.DBEngine.Errors
        s = s & "        [" & e.Number & "] " & e.Description & vbCrLf
    Next
    If Len(s) = 0 Then s = "        (no detail)" & vbCrLf

    OdbcDetail = "    Server said:" & vbCrLf & s
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
    p = Application.CurrentProject.Path & "\MIGRATION_NCP_PLAN.txt"
    Set f = fso.CreateTextFile(p, True, True)
    f.Write text
    f.Close

    On Error Resume Next
    Shell "notepad.exe """ & p & """"
End Sub
