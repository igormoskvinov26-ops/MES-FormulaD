# 📊 Сопоставление типов данных: Access → SQL Server

## Сравнение структур MES_server.accdb ↔ FormulaD (SQL Server)

### ✅ Таблицы которые совпадают в обеих базах (20 таблиц)

| Таблица | Access | SQL Server | Статус |
|---------|--------|-----------|--------|
| tblColors | ✅ | ✅ | Готов к миграции |
| tblComponent | ✅ | ✅ | Готов к миграции |
| tblConnections | ✅ | ✅ | Готов к миграции |
| tblCrippleRecord | ✅ | ✅ | Готов к миграции |
| tblDiscrepancy | ✅ | ✅ | Готов к миграции |
| tblDiscrepancyList | ✅ | ✅ | Готов к миграции |
| tblImportLog | ✅ | ✅ | Готов к миграции |
| tblImportplan | ✅ | ✅ | Готов к миграции |
| tblJobCard | ✅ | ✅ | Готов к миграции |
| tblNCP | ✅ | ✅ | Готов к миграции |
| tblPlanTemp | ✅ | ✅ | Готов к миграции |
| tblProductionOrder | ✅ | ✅ | Готов к миграции |
| tblProductionPlan | ✅ | ✅ | Готов к миграции |
| tblRole | ✅ | ✅ | Готов к миграции |
| tblSpecifications | ✅ | ✅ | Готов к миграции |
| tblStatus | ✅ | ✅ | Готов к миграции |
| tblUpdColor | ✅ | ✅ | Готов к миграции |
| tblUser | ✅ | ✅ | Готов к миграции |

**ВНИМАНИЕ:** Не найдены в выводе SQL Server:
- ❌ tblAssemblyEvent (был в Access, нужна проверка)
- ❌ tblStation (был в Access, нужна проверка)

---

### 📋 Таблицы ТОЛЬКО в SQL Server (новая функциональность)

| Таблица | Назначение |
|---------|-----------|
| tblAddDocs | Дополнительные документы |
| tblChecklist | Чеклист проверок |
| tblControlClass | Классификация контроля |
| tblControlResults | Результаты контроля |
| tblControlType | Типы контроля |
| tblControlVolume | Объемы контроля |
| tblDetermState | Определение состояния |
| tblMaterials | Материалы |
| tblNCP_backup | Резервная копия NCP |
| tblPackinglists | Упаковочные листы |
| tblPL_Lines | Строки упаковочных листов |
| tblProductionPlan_backup | Резервная копия плана производства |
| tblSupplierCategory | Категории поставщиков |
| tblSuppliers | Поставщики |

---

## 🔄 Соответствие полей: Access → SQL Server

### tblColors
```
Access                          SQL Server
─────────────────────────────────────────────
id (Long)                    → id (int)
color (Text, 255)            → color (nvarchar, 50)
                             → isActive (bit) [НОВОЕ]
```

### tblComponent
```
Access                          SQL Server
─────────────────────────────────────────────
ID (Long)                    → id (int)
ComponentCode (Text, 30)     → ComponentCode (nvarchar, 50)
ComponentName (Text, 100)    → ComponentName (nvarchar, 150)
ComponentName_RUS (Text, 255) → ComponentName_RUS (nvarchar, 150)
PointOfPart (Text, 255)      → PointOfPart (nvarchar, 50)
StationID (Other/Integer)    → StationID (int)
StandardQty (Other/Integer)  → StandardQty (int)
IsMandatory (Boolean)        → IsMandatory (bit)
Supplier (Text, 100)         → Supplier (nvarchar, 50)
                             → Код (int) [НОВОЕ]
                             → Критические соединения (nvarchar, 50) [НОВОЕ]
                             → Кол-во соединений (int) [НОВОЕ]
                             → Станция (nvarchar, 50) [НОВОЕ]
                             → Код_колмплектации (nvarchar, 50) [НОВОЕ]
                             → Станция проверки (nchar, 10) [НОВОЕ]
```

### tblConnections
```
Access                          SQL Server
─────────────────────────────────────────────
Код (Long)                   → id (int)
Критические соединения (Text, 255) → Критические соединения (nvarchar, -1/MAX)
Кол-во соединений (Text, 255) → Кол-во соединений (nvarchar, 50)
Станция (Text, 255)          → Станция (nvarchar, 50)
Код_колмплектации (Long, default 0) → Код_колмплектации (int)
Станция проверки (Text, 255) → Станция проверки (nvarchar, 50)
```

### tblDiscrepancy
```
Access                          SQL Server
─────────────────────────────────────────────
ID (Long)                    → id (int)
AssemblyEventID (Long)       → AssemblyEventID (int)
ComponentID (Long)           → ComponentID (int)
DiscrepancyType (Text, 20)   → DiscrepancyType (nvarchar, 50)
Comment (Memo)               → Comment (nvarchar, 250) [УРЕЗАНО!]
WasReplaced (Boolean)        → WasReplaced (bit)
DetectionTime (Date/Time)    → DetectionTime (datetime)
ResolutionTime (Date/Time)   → ResolutionTime (datetime)
DiscrepancyStatus (Text, 15) → DiscrepancyStatus (nvarchar, 50)
NCP_Number (Text, 30)        → NCP_Number (nvarchar, 50)
PhotoPath (Text, 255)        → PhotoPath (nvarchar, 50) [УРЕЗАНО!]
```

### tblImportLog
```
Access                          SQL Server
─────────────────────────────────────────────
ID (Long)                    → ID (int)
ImportDate (Date/Time)       → ImportDate (datetime)
FileName (Text, 255)         → FileName (nvarchar, 50) [УРЕЗАНО!]
ImportedBy (Long)            → ImportedBy (int)
RowsImported (Other/Integer) → RowsImported (int)
RowsFailed (Other/Integer)   → RowsFailed (int)
ErrorDescription (Memo)      → ErrorDescription (text/nvarchar(MAX))
ImportBatchID (Text, 30)     → ImportBatchID (nvarchar, 50)
```

### tblNCP
```
Access                          SQL Server
─────────────────────────────────────────────
ID (Long)                    → id (int)
StationID (Long)             → StationID (int)
ComponentID (Long)           → ComponentID (int)
VIN (Text, 20)               → VIN (nvarchar, 50)
Quantity (Long, default 1)   → Quantity (int)
DiscrepancyTypeID (Long)     → DiscrepancyTypeID (int)
Comment (Memo)               → Comment (nvarchar, 50) [УРЕЗАНО!]
Status (Long, default 0)     → Status (int)
CreatedBy (Text, 255)        → CreatedBy (nvarchar, 50) [УРЕЗАНО!]
CreatedAt (Date/Time, default NOW()) → CreatedAt (datetime)
ClosedBy (Text, 255)         → ClosedBy (nvarchar, 50) [УРЕЗАНО!]
ClosedAt (Date/Time)         → ClosedAt (datetime)
```

### tblProductionPlan
```
Access                          SQL Server
─────────────────────────────────────────────
ID (Long)                    → ID (int)
ModelArticle (Text, 30)      → ModelArticle (nvarchar, 50)
ModelName (Text, 100)        → ModelName (nvarchar, 50) [УРЕЗАНО!]
VIN (Text, 20)               → VIN (nvarchar, 50)
EngineNumber (Text, 20)      → EngineNumber (nvarchar, 50)
Color (Text, 50)             → Color (nvarchar, 50)
PlannedShipmentDate (Date/Time) → PlannedShipmentDate (datetime)
ValidationStatus (Text, 15)  → ValidationStatus (nvarchar, 50)
ErrorMessage (Text, 255)     → ErrorMessage (nvarchar, 50) [УРЕЗАНО!]
... [еще 20+ полей]          → ... [совпадают]
                             → FOK_date (datetime) [НОВОЕ]
```

---

## ⚠️ ВАЖНЫЕ ОТЛИЧИЯ

### 1. **Уменьшенные размеры полей в SQL Server**
Некоторые TEXT поля из Access урезаны до nvarchar(50) на SQL Server:
- tblDiscrepancy.Comment: Memo → nvarchar(250)
- tblDiscrepancy.PhotoPath: Text(255) → nvarchar(50)
- tblImportLog.FileName: Text(255) → nvarchar(50)
- tblNCP.Comment: Memo → nvarchar(50)
- tblNCP.CreatedBy: Text(255) → nvarchar(50)
- tblProductionPlan.ModelName: Text(100) → nvarchar(50)

**Решение:** При миграции будут обрезаны данные если превышен размер! Нужна проверка перед миграцией.

### 2. **Новые поля в tblComponent**
Access версия не имеет полей которые есть в SQL Server:
- Код
- Критические соединения
- Кол-во соединений
- Станция
- Код_колмплектации
- Станция проверки

**Решение:** Будут заполнены NULL при миграции.

### 3. **Новые таблицы в SQL Server**
14 новых таблиц в SQL Server базе (расширенная функциональность).

**Решение:** Игнорировать при миграции из Access.

---

## ✅ Готовность к миграции

| Параметр | Статус | Примечание |
|----------|--------|-----------|
| Совпадающие таблицы | ✅ 18 | tblAssemblyEvent и tblStation - не найдены |
| Типы данных | ✅ Совместимы | Нужна проверка размеров |
| Foreign Keys | ⚠️ Проверить | FK_tblNCP_tblProductionPlan по VIN |
| Потеря данных | ⚠️ Возможна | Урезанные поля (50-255 символов) |

---

## 🚀 Следующий шаг

Создам **финальный миграционный скрипт** который:
1. ✅ Отключит FK ограничения
2. ✅ Мигрирует 18 совпадающих таблиц
3. ✅ Обработает NULL для новых полей
4. ✅ Проверит размеры полей
5. ✅ Включит FK обратно

**Готовы ли вы к финальной миграции?**
