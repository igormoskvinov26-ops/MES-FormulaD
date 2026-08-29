# 🚀 Quick Start: Data Migration

## In 5 Minutes

### Step 1: Prepare (1 min)
- [ ] Open MES_server.accdb
- [ ] Verify linked tables exist (External Data → Linked Tables)
- [ ] Create backup of MES_server.accdb

### Step 2: Add VBA Macro (1 min)
- [ ] Alt+F11 to open VBA Editor
- [ ] Insert → Module (new)
- [ ] Copy all code from `MIGRATION_MACRO_FINAL.bas`
- [ ] Paste into module
- [ ] Alt+Q to close editor

### Step 3: Run Migration (1 min)
- [ ] Back in Access, press Alt+F11 again
- [ ] Click inside `MigrateDataToSQLServer` subroutine
- [ ] Press F5 or click Run
- [ ] Click "Run" in dialog

### Step 4: Wait & Check (2 min)
- [ ] Wait for "✅ Миграция завершена!" message
- [ ] Click OK
- [ ] Notepad will open with results
- [ ] Note total record count and any errors

## Done! ✅

Check MIGRATION_RESULT.txt in MES_server.accdb folder for details.

---

## Troubleshooting

**"Linked table not found"**
→ Add linked tables in Access (External Data tab)

**"Permission denied"**
→ Check SQL Server login & permissions

**"Field truncation warning"**
→ Normal for large text fields (see README.md)

**"Run again?"**
→ Safe to run multiple times (won't duplicate data)

---

## Next Steps

1. Verify data in SQL Server (FormulaD database)
2. Compare record counts in MIGRATION_RESULT.txt
3. Test application with new database
4. Keep backup of MES_server.accdb
