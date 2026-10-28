-- ============================================================================
-- ПОЛНАЯ КОПИЯ FormulaD → FormulaD_TEST (схема + данные)
-- Запускать на SQLACCESS от sysadmin / db_owner обеих баз.
-- tblProductionPlan: данные перезаливаются (TRUNCATE + INSERT).
-- Остальные таблицы: создаются если нет, данные вставляются.
-- ============================================================================

SET NOCOUNT ON;

-- ============================================================================
-- ШАГ 1: Создать недостающие таблицы (без FK — добавим после данных)
-- ============================================================================

DECLARE @tbl NVARCHAR(128);
DECLARE @sql NVARCHAR(MAX);
DECLARE @cols NVARCHAR(MAX);
DECLARE @hasIdentity BIT;

DECLARE tblCur CURSOR LOCAL FAST_FORWARD FOR
    SELECT t.name
    FROM [FormulaD].sys.tables t
    WHERE t.is_ms_shipped = 0 AND t.name <> 'sysdiagrams'
    ORDER BY t.name;

OPEN tblCur;
FETCH NEXT FROM tblCur INTO @tbl;

WHILE @@FETCH_STATUS = 0
BEGIN
    -- Создать таблицу если нет
    IF OBJECT_ID(N'[FormulaD_TEST].[dbo].[' + @tbl + ']', N'U') IS NULL
    BEGIN
        -- Генерируем CREATE TABLE динамически из метаданных
        SET @sql = 'CREATE TABLE [FormulaD_TEST].[dbo].[' + @tbl + '] (';

        SELECT @sql = @sql + STRING_AGG(
            '[' + c.name + '] ' +
            tp.name +
            CASE
                WHEN tp.name IN ('nvarchar','nchar') THEN '(' + CASE WHEN c.max_length = -1 THEN 'MAX' ELSE CAST(c.max_length/2 AS VARCHAR) END + ')'
                WHEN tp.name IN ('varchar','char','varbinary') THEN '(' + CASE WHEN c.max_length = -1 THEN 'MAX' ELSE CAST(c.max_length AS VARCHAR) END + ')'
                WHEN tp.name IN ('decimal','numeric') THEN '(' + CAST(c.precision AS VARCHAR) + ',' + CAST(c.scale AS VARCHAR) + ')'
                ELSE ''
            END +
            CASE WHEN c.is_identity = 1 THEN ' IDENTITY(' + CAST(IDENT_SEED('[FormulaD].[dbo].[' + @tbl + ']') AS VARCHAR) + ',' + CAST(IDENT_INCR('[FormulaD].[dbo].[' + @tbl + ']') AS VARCHAR) + ')' ELSE '' END +
            CASE WHEN tp.name IN ('timestamp','rowversion') THEN '' WHEN c.is_nullable = 1 THEN ' NULL' ELSE ' NOT NULL' END,
            ', ' ) WITHIN GROUP (ORDER BY c.column_id)
        FROM [FormulaD].sys.columns c
        JOIN [FormulaD].sys.types tp ON tp.user_type_id = c.user_type_id
        WHERE c.object_id = OBJECT_ID('[FormulaD].[dbo].[' + @tbl + ']');

        SET @sql = @sql + ');';
        EXEC sp_executesql @sql;
        PRINT 'CREATED: ' + @tbl;
    END
    ELSE
    BEGIN
        PRINT 'EXISTS:  ' + @tbl;
    END

    FETCH NEXT FROM tblCur INTO @tbl;
END

CLOSE tblCur;
DEALLOCATE tblCur;

-- ============================================================================
-- ШАГ 2: Копировать данные
-- ============================================================================
PRINT '';
PRINT '-- Копирование данных...';
PRINT '';

DECLARE dataCur CURSOR LOCAL FAST_FORWARD FOR
    SELECT t.name
    FROM [FormulaD].sys.tables t
    WHERE t.is_ms_shipped = 0 AND t.name <> 'sysdiagrams'
    ORDER BY t.name;

OPEN dataCur;
FETCH NEXT FROM dataCur INTO @tbl;

WHILE @@FETCH_STATUS = 0
BEGIN
    -- Список колонок (без rowversion/timestamp — они автогенерируемые)
    SELECT @cols = STRING_AGG('[' + c.name + ']', ', ') WITHIN GROUP (ORDER BY c.column_id)
    FROM [FormulaD].sys.columns c
    JOIN [FormulaD].sys.types tp ON tp.user_type_id = c.user_type_id
    WHERE c.object_id = OBJECT_ID('[FormulaD].[dbo].[' + @tbl + ']')
      AND tp.name NOT IN ('timestamp', 'rowversion');

    -- Есть ли IDENTITY
    SELECT @hasIdentity = CASE WHEN EXISTS (
        SELECT 1 FROM [FormulaD].sys.identity_columns ic
        WHERE ic.object_id = OBJECT_ID('[FormulaD].[dbo].[' + @tbl + ']')
    ) THEN 1 ELSE 0 END;

    -- Очистить целевую таблицу
    SET @sql = 'DELETE FROM [FormulaD_TEST].[dbo].[' + @tbl + '];';
    BEGIN TRY
        EXEC sp_executesql @sql;
    END TRY
    BEGIN CATCH
        -- Если DELETE не получается из-за FK, пробуем без — данные добавятся поверх
        PRINT 'WARN: не удалось очистить ' + @tbl + ': ' + ERROR_MESSAGE();
    END CATCH

    -- Копировать
    BEGIN TRY
        IF @hasIdentity = 1
        BEGIN
            SET @sql = 'SET IDENTITY_INSERT [FormulaD_TEST].[dbo].[' + @tbl + '] ON; ' +
                       'INSERT INTO [FormulaD_TEST].[dbo].[' + @tbl + '] (' + @cols + ') ' +
                       'SELECT ' + @cols + ' FROM [FormulaD].[dbo].[' + @tbl + ']; ' +
                       'SET IDENTITY_INSERT [FormulaD_TEST].[dbo].[' + @tbl + '] OFF;';
        END
        ELSE
        BEGIN
            SET @sql = 'INSERT INTO [FormulaD_TEST].[dbo].[' + @tbl + '] (' + @cols + ') ' +
                       'SELECT ' + @cols + ' FROM [FormulaD].[dbo].[' + @tbl + '];';
        END

        EXEC sp_executesql @sql;

        -- Счётчик
        DECLARE @cnt INT;
        SET @sql = 'SELECT @c = COUNT(*) FROM [FormulaD_TEST].[dbo].[' + @tbl + ']';
        EXEC sp_executesql @sql, N'@c INT OUTPUT', @c = @cnt OUTPUT;
        PRINT 'COPIED:  ' + @tbl + ' → ' + CAST(@cnt AS VARCHAR) + ' rows';
    END TRY
    BEGIN CATCH
        PRINT 'ERROR:   ' + @tbl + ': ' + ERROR_MESSAGE();
    END CATCH

    FETCH NEXT FROM dataCur INTO @tbl;
END

CLOSE dataCur;
DEALLOCATE dataCur;

-- ============================================================================
-- ШАГ 3: Добавить PRIMARY KEYS
-- ============================================================================
PRINT '';
PRINT '-- Primary keys...';
PRINT '';

DECLARE @pkName NVARCHAR(128), @pkTable NVARCHAR(128), @pkCols NVARCHAR(MAX);

DECLARE pkCur CURSOR LOCAL FAST_FORWARD FOR
    SELECT i.name, t.name,
        STRING_AGG('[' + c.name + ']', ', ') WITHIN GROUP (ORDER BY ic.key_ordinal)
    FROM [FormulaD].sys.indexes i
    JOIN [FormulaD].sys.tables t ON t.object_id = i.object_id
    JOIN [FormulaD].sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
    JOIN [FormulaD].sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
    WHERE i.is_primary_key = 1 AND t.is_ms_shipped = 0 AND t.name <> 'sysdiagrams'
    GROUP BY i.name, t.name;

OPEN pkCur;
FETCH NEXT FROM pkCur INTO @pkName, @pkTable, @pkCols;

WHILE @@FETCH_STATUS = 0
BEGIN
    IF NOT EXISTS (SELECT 1 FROM [FormulaD_TEST].sys.indexes WHERE name = @pkName)
    BEGIN
        SET @sql = 'ALTER TABLE [FormulaD_TEST].[dbo].[' + @pkTable + '] ADD CONSTRAINT [' + @pkName + '] PRIMARY KEY (' + @pkCols + ');';
        BEGIN TRY
            EXEC sp_executesql @sql;
            PRINT 'PK:      ' + @pkTable + ' (' + @pkCols + ')';
        END TRY
        BEGIN CATCH
            PRINT 'PK ERR:  ' + @pkTable + ': ' + ERROR_MESSAGE();
        END CATCH
    END

    FETCH NEXT FROM pkCur INTO @pkName, @pkTable, @pkCols;
END

CLOSE pkCur;
DEALLOCATE pkCur;

-- ============================================================================
-- ШАГ 4: Добавить UNIQUE constraints
-- ============================================================================
PRINT '';
PRINT '-- Unique constraints...';
PRINT '';

DECLARE @uqName NVARCHAR(128), @uqTable NVARCHAR(128), @uqCols NVARCHAR(MAX);

DECLARE uqCur CURSOR LOCAL FAST_FORWARD FOR
    SELECT i.name, t.name,
        STRING_AGG('[' + c.name + ']', ', ') WITHIN GROUP (ORDER BY ic.key_ordinal)
    FROM [FormulaD].sys.indexes i
    JOIN [FormulaD].sys.tables t ON t.object_id = i.object_id
    JOIN [FormulaD].sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
    JOIN [FormulaD].sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
    WHERE i.is_unique_constraint = 1 AND t.is_ms_shipped = 0 AND t.name <> 'sysdiagrams'
    GROUP BY i.name, t.name;

OPEN uqCur;
FETCH NEXT FROM uqCur INTO @uqName, @uqTable, @uqCols;

WHILE @@FETCH_STATUS = 0
BEGIN
    IF NOT EXISTS (SELECT 1 FROM [FormulaD_TEST].sys.indexes WHERE name = @uqName)
    BEGIN
        SET @sql = 'ALTER TABLE [FormulaD_TEST].[dbo].[' + @uqTable + '] ADD CONSTRAINT [' + @uqName + '] UNIQUE (' + @uqCols + ');';
        BEGIN TRY
            EXEC sp_executesql @sql;
            PRINT 'UQ:      ' + @uqTable + ' (' + @uqCols + ')';
        END TRY
        BEGIN CATCH
            PRINT 'UQ ERR:  ' + @uqTable + ': ' + ERROR_MESSAGE();
        END CATCH
    END

    FETCH NEXT FROM uqCur INTO @uqName, @uqTable, @uqCols;
END

CLOSE uqCur;
DEALLOCATE uqCur;

-- ============================================================================
-- ШАГ 5: Добавить FOREIGN KEYS
-- ============================================================================
PRINT '';
PRINT '-- Foreign keys...';
PRINT '';

DECLARE @fkName NVARCHAR(128), @fkChild NVARCHAR(128), @fkChildCol NVARCHAR(128);
DECLARE @fkParent NVARCHAR(128), @fkParentCol NVARCHAR(128);

DECLARE fkCur CURSOR LOCAL FAST_FORWARD FOR
    SELECT fk.name,
        OBJECT_NAME(fk.parent_object_id, DB_ID('FormulaD')),
        cp.name,
        OBJECT_NAME(fk.referenced_object_id, DB_ID('FormulaD')),
        cr.name
    FROM [FormulaD].sys.foreign_keys fk
    JOIN [FormulaD].sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
    JOIN [FormulaD].sys.columns cp ON cp.object_id = fkc.parent_object_id AND cp.column_id = fkc.parent_column_id
    JOIN [FormulaD].sys.columns cr ON cr.object_id = fkc.referenced_object_id AND cr.column_id = fkc.referenced_column_id
    JOIN [FormulaD].sys.tables t ON t.object_id = fk.parent_object_id
    WHERE t.is_ms_shipped = 0
    ORDER BY fk.name;

OPEN fkCur;
FETCH NEXT FROM fkCur INTO @fkName, @fkChild, @fkChildCol, @fkParent, @fkParentCol;

WHILE @@FETCH_STATUS = 0
BEGIN
    IF NOT EXISTS (SELECT 1 FROM [FormulaD_TEST].sys.foreign_keys WHERE name = @fkName)
    BEGIN
        SET @sql = 'ALTER TABLE [FormulaD_TEST].[dbo].[' + @fkChild + '] ADD CONSTRAINT [' + @fkName + '] ' +
                   'FOREIGN KEY ([' + @fkChildCol + ']) REFERENCES [FormulaD_TEST].[dbo].[' + @fkParent + '] ([' + @fkParentCol + ']);';
        BEGIN TRY
            EXEC sp_executesql @sql;
            PRINT 'FK:      ' + @fkChild + '.' + @fkChildCol + ' → ' + @fkParent + '.' + @fkParentCol;
        END TRY
        BEGIN CATCH
            PRINT 'FK ERR:  ' + @fkName + ': ' + ERROR_MESSAGE();
        END CATCH
    END

    FETCH NEXT FROM fkCur INTO @fkName, @fkChild, @fkChildCol, @fkParent, @fkParentCol;
END

CLOSE fkCur;
DEALLOCATE fkCur;

-- ============================================================================
-- ШАГ 6: Индексы (не PK, не UQ)
-- ============================================================================
PRINT '';
PRINT '-- Indexes...';
PRINT '';

DECLARE @ixName NVARCHAR(128), @ixTable NVARCHAR(128), @ixCols NVARCHAR(MAX), @ixUnique BIT;

DECLARE ixCur CURSOR LOCAL FAST_FORWARD FOR
    SELECT i.name, t.name,
        STRING_AGG('[' + c.name + ']', ', ') WITHIN GROUP (ORDER BY ic.key_ordinal),
        i.is_unique
    FROM [FormulaD].sys.indexes i
    JOIN [FormulaD].sys.tables t ON t.object_id = i.object_id
    JOIN [FormulaD].sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
    JOIN [FormulaD].sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
    WHERE i.is_primary_key = 0 AND i.is_unique_constraint = 0
      AND i.type IN (1,2) AND i.name IS NOT NULL
      AND t.is_ms_shipped = 0 AND t.name <> 'sysdiagrams'
    GROUP BY i.name, t.name, i.is_unique;

OPEN ixCur;
FETCH NEXT FROM ixCur INTO @ixName, @ixTable, @ixCols, @ixUnique;

WHILE @@FETCH_STATUS = 0
BEGIN
    IF NOT EXISTS (SELECT 1 FROM [FormulaD_TEST].sys.indexes WHERE name = @ixName)
    BEGIN
        SET @sql = 'CREATE ' + CASE WHEN @ixUnique = 1 THEN 'UNIQUE ' ELSE '' END +
                   'NONCLUSTERED INDEX [' + @ixName + '] ON [FormulaD_TEST].[dbo].[' + @ixTable + '] (' + @ixCols + ');';
        BEGIN TRY
            EXEC sp_executesql @sql;
            PRINT 'IX:      ' + @ixTable + '.' + @ixName;
        END TRY
        BEGIN CATCH
            PRINT 'IX ERR:  ' + @ixName + ': ' + ERROR_MESSAGE();
        END CATCH
    END

    FETCH NEXT FROM ixCur INTO @ixName, @ixTable, @ixCols, @ixUnique;
END

CLOSE ixCur;
DEALLOCATE ixCur;

-- ============================================================================
-- ШАГ 7: Обновить права mes_writer
-- ============================================================================
PRINT '';
PRINT '-- Обновление прав mes_writer...';

IF EXISTS (SELECT 1 FROM [FormulaD_TEST].sys.database_principals WHERE name = N'mes_writer')
BEGIN
    DECLARE grantCur CURSOR LOCAL FAST_FORWARD FOR
        SELECT t.name
        FROM [FormulaD_TEST].sys.tables t
        WHERE t.is_ms_shipped = 0 AND t.name <> 'sysdiagrams';

    OPEN grantCur;
    FETCH NEXT FROM grantCur INTO @tbl;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        SET @sql = 'USE [FormulaD_TEST]; GRANT SELECT ON [dbo].[' + @tbl + '] TO [mes_writer];';
        BEGIN TRY
            EXEC sp_executesql @sql;
        END TRY
        BEGIN CATCH
            PRINT 'GRANT ERR: ' + @tbl + ': ' + ERROR_MESSAGE();
        END CATCH
        FETCH NEXT FROM grantCur INTO @tbl;
    END
    CLOSE grantCur;
    DEALLOCATE grantCur;
    PRINT 'SELECT granted on all tables to mes_writer.';
END

PRINT '';
PRINT '-- ============================================================';
PRINT '-- ГОТОВО. FormulaD_TEST теперь содержит полную копию FormulaD.';
PRINT '-- ============================================================';
