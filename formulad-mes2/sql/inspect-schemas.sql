-- Снятие схем таблиц для SQL-реализации оставшихся интерфейсов.
-- Выполнить на TEST-экземпляре (FormulaD_TEST) от любого логина с SELECT.
-- Результат скопировать целиком и передать мне.

USE [FormulaD_TEST];

-- 1. Все колонки нужных таблиц
SELECT
    t.name AS [Table],
    c.name AS [Column],
    tp.name AS [Type],
    CASE WHEN tp.name IN ('nvarchar','nchar','varchar','char','varbinary')
         THEN CASE WHEN c.max_length = -1 THEN 'MAX' ELSE CAST(c.max_length / (CASE WHEN tp.name LIKE 'n%' THEN 2 ELSE 1 END) AS varchar) END
         ELSE NULL END AS [Length],
    c.is_nullable AS [Nullable],
    c.is_identity AS [Identity],
    CASE WHEN pk.column_id IS NOT NULL THEN 1 ELSE 0 END AS [PK],
    c.column_id AS [Ordinal]
FROM sys.tables t
JOIN sys.columns c ON c.object_id = t.object_id
JOIN sys.types tp ON tp.user_type_id = c.user_type_id
LEFT JOIN (
    SELECT ic.object_id, ic.column_id
    FROM sys.index_columns ic
    JOIN sys.indexes i ON i.object_id = ic.object_id AND i.index_id = ic.index_id
    WHERE i.is_primary_key = 1
) pk ON pk.object_id = c.object_id AND pk.column_id = c.column_id
WHERE t.name IN (
    'tblNCP',
    'tblComponent',
    'tblConnections',
    'tblStation',
    'tblImportplan',
    'tblPlanTemp',
    'tblPL_Lines',
    'tblSupplier',
    'tblSuppliers',
    'tblInspection',
    'tblCrippleRecord'
)
ORDER BY t.name, c.column_id;

-- 2. FK-связи этих таблиц
SELECT
    fk.name AS [FK],
    OBJECT_NAME(fk.parent_object_id) AS [ChildTable],
    cp.name AS [ChildColumn],
    OBJECT_NAME(fk.referenced_object_id) AS [ParentTable],
    cr.name AS [ParentColumn]
FROM sys.foreign_keys fk
JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
JOIN sys.columns cp ON cp.object_id = fkc.parent_object_id AND cp.column_id = fkc.parent_column_id
JOIN sys.columns cr ON cr.object_id = fkc.referenced_object_id AND cr.column_id = fkc.referenced_column_id
WHERE OBJECT_NAME(fk.parent_object_id) IN (
    'tblNCP','tblComponent','tblConnections','tblStation',
    'tblImportplan','tblPlanTemp','tblPL_Lines','tblCrippleRecord'
)
   OR OBJECT_NAME(fk.referenced_object_id) IN (
    'tblNCP','tblComponent','tblConnections','tblStation',
    'tblImportplan','tblPlanTemp','tblPL_Lines','tblCrippleRecord'
)
ORDER BY [ChildTable], [FK];

-- 3. Индексы
SELECT
    t.name AS [Table],
    i.name AS [Index],
    i.type_desc AS [Type],
    i.is_unique AS [Unique],
    STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal) AS [Columns]
FROM sys.tables t
JOIN sys.indexes i ON i.object_id = t.object_id
JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE t.name IN (
    'tblNCP','tblComponent','tblConnections','tblStation',
    'tblImportplan','tblPlanTemp','tblPL_Lines','tblCrippleRecord'
)
GROUP BY t.name, i.name, i.type_desc, i.is_unique
ORDER BY t.name, i.name;

-- 4. Число строк (примерное, без блокировок)
SELECT
    t.name AS [Table],
    p.rows AS [RowCount]
FROM sys.tables t
JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0,1)
WHERE t.name IN (
    'tblNCP','tblComponent','tblConnections','tblStation',
    'tblImportplan','tblPlanTemp','tblPL_Lines','tblSupplier',
    'tblSuppliers','tblInspection','tblCrippleRecord'
)
ORDER BY t.name;

-- 5. Полный список таблиц в базе (на случай если название отличается)
SELECT t.name AS [Table], p.rows AS [RowCount]
FROM sys.tables t
JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0,1)
ORDER BY t.name;
