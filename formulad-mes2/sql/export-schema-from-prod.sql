-- ============================================================================
-- ТОЛЬКО ЧТЕНИЕ МЕТАДАННЫХ. Никаких INSERT/UPDATE/DELETE.
-- Запустить на PROD (SQLACCESS / FormulaD) от любого логина с правом SELECT
-- на sys.tables, sys.columns, sys.indexes и т.д.
-- Результат — готовый DDL для создания всех таблиц на TEST (FormulaD_TEST).
-- Скопировать вывод из вкладки «Сообщения» (Messages), НЕ из «Результаты».
-- ============================================================================

SET NOCOUNT ON;

USE [FormulaD];

PRINT '-- =================================================================';
PRINT '-- DDL сгенерирован из FormulaD (PROD) — только структура, без данных';
PRINT '-- Выполнить на FormulaD_TEST';
PRINT '-- =================================================================';
PRINT '';
PRINT 'USE [FormulaD_TEST];';
PRINT 'GO';
PRINT '';

-- ============================================================================
-- 1. CREATE TABLE для каждой пользовательской таблицы
-- ============================================================================
DECLARE @tableName NVARCHAR(128);
DECLARE @sql NVARCHAR(MAX);

DECLARE tableCursor CURSOR LOCAL FAST_FORWARD FOR
    SELECT t.name
    FROM sys.tables t
    WHERE t.is_ms_shipped = 0 AND t.name <> 'sysdiagrams'
    ORDER BY t.name;

OPEN tableCursor;
FETCH NEXT FROM tableCursor INTO @tableName;

WHILE @@FETCH_STATUS = 0
BEGIN
    -- Проверка: не создавать повторно
    PRINT 'IF OBJECT_ID(N''[dbo].[' + @tableName + ']'', N''U'') IS NULL';
    PRINT 'BEGIN';

    SET @sql = '    CREATE TABLE [dbo].[' + @tableName + '] (';
    PRINT @sql;

    -- Колонки
    DECLARE @colName NVARCHAR(128), @typeName NVARCHAR(128);
    DECLARE @maxLen SMALLINT, @precision TINYINT, @scale TINYINT;
    DECLARE @isNullable BIT, @isIdentity BIT, @identSeed BIGINT, @identIncr BIGINT;
    DECLARE @hasDefault BIT, @defaultDef NVARCHAR(MAX);
    DECLARE @colOrdinal INT, @maxOrdinal INT;
    DECLARE @isRowversion BIT;
    DECLARE @line NVARCHAR(MAX);

    SELECT @maxOrdinal = MAX(c.column_id)
    FROM sys.columns c
    JOIN sys.tables t ON t.object_id = c.object_id
    WHERE t.name = @tableName;

    DECLARE colCursor CURSOR LOCAL FAST_FORWARD FOR
        SELECT
            c.name,
            tp.name,
            c.max_length,
            c.precision,
            c.scale,
            c.is_nullable,
            c.is_identity,
            CAST(CASE WHEN ic.seed_value IS NOT NULL THEN ic.seed_value ELSE 0 END AS bigint),
            CAST(CASE WHEN ic.increment_value IS NOT NULL THEN ic.increment_value ELSE 0 END AS bigint),
            CASE WHEN dc.definition IS NOT NULL THEN 1 ELSE 0 END,
            dc.definition,
            c.column_id,
            CASE WHEN tp.name = 'timestamp' OR (tp.name = 'rowversion') THEN 1 ELSE 0 END
        FROM sys.columns c
        JOIN sys.types tp ON tp.user_type_id = c.user_type_id
        JOIN sys.tables t ON t.object_id = c.object_id
        LEFT JOIN sys.identity_columns ic ON ic.object_id = c.object_id AND ic.column_id = c.column_id
        LEFT JOIN sys.default_constraints dc ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
        WHERE t.name = @tableName
        ORDER BY c.column_id;

    OPEN colCursor;
    FETCH NEXT FROM colCursor INTO @colName, @typeName, @maxLen, @precision, @scale,
        @isNullable, @isIdentity, @identSeed, @identIncr, @hasDefault, @defaultDef, @colOrdinal, @isRowversion;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        SET @line = '        [' + @colName + '] ';

        -- Тип
        IF @isRowversion = 1
            SET @line = @line + 'rowversion';
        ELSE IF @typeName IN ('nvarchar', 'nchar')
            SET @line = @line + @typeName + '(' + CASE WHEN @maxLen = -1 THEN 'MAX' ELSE CAST(@maxLen / 2 AS VARCHAR) END + ')';
        ELSE IF @typeName IN ('varchar', 'char', 'varbinary')
            SET @line = @line + @typeName + '(' + CASE WHEN @maxLen = -1 THEN 'MAX' ELSE CAST(@maxLen AS VARCHAR) END + ')';
        ELSE IF @typeName IN ('decimal', 'numeric')
            SET @line = @line + @typeName + '(' + CAST(@precision AS VARCHAR) + ',' + CAST(@scale AS VARCHAR) + ')';
        ELSE
            SET @line = @line + @typeName;

        -- IDENTITY
        IF @isIdentity = 1
            SET @line = @line + ' IDENTITY(' + CAST(@identSeed AS VARCHAR) + ',' + CAST(@identIncr AS VARCHAR) + ')';

        -- NULL / NOT NULL
        IF @isRowversion = 0
        BEGIN
            IF @isNullable = 1
                SET @line = @line + ' NULL';
            ELSE
                SET @line = @line + ' NOT NULL';
        END

        -- DEFAULT
        IF @hasDefault = 1
            SET @line = @line + ' DEFAULT ' + @defaultDef;

        -- Запятая
        IF @colOrdinal < @maxOrdinal
            SET @line = @line + ',';

        PRINT @line;

        FETCH NEXT FROM colCursor INTO @colName, @typeName, @maxLen, @precision, @scale,
            @isNullable, @isIdentity, @identSeed, @identIncr, @hasDefault, @defaultDef, @colOrdinal, @isRowversion;
    END

    CLOSE colCursor;
    DEALLOCATE colCursor;

    PRINT '    );';
    PRINT 'END';
    PRINT 'GO';
    PRINT '';

    FETCH NEXT FROM tableCursor INTO @tableName;
END

CLOSE tableCursor;
DEALLOCATE tableCursor;

-- ============================================================================
-- 2. PRIMARY KEY
-- ============================================================================
PRINT '-- =================================================================';
PRINT '-- PRIMARY KEYS';
PRINT '-- =================================================================';
PRINT '';

DECLARE @pkName NVARCHAR(128), @pkTable NVARCHAR(128), @pkCols NVARCHAR(MAX);

DECLARE pkCursor CURSOR LOCAL FAST_FORWARD FOR
    SELECT
        i.name,
        t.name,
        STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal)
    FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
    JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
    WHERE i.is_primary_key = 1 AND t.is_ms_shipped = 0 AND t.name <> 'sysdiagrams'
    GROUP BY i.name, t.name
    ORDER BY t.name;

OPEN pkCursor;
FETCH NEXT FROM pkCursor INTO @pkName, @pkTable, @pkCols;

WHILE @@FETCH_STATUS = 0
BEGIN
    PRINT 'IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N''' + @pkName + ''')';
    PRINT '    ALTER TABLE [dbo].[' + @pkTable + '] ADD CONSTRAINT [' + @pkName + '] PRIMARY KEY ([' +
        REPLACE(@pkCols, ', ', '], [') + ']);';
    PRINT 'GO';
    PRINT '';
    FETCH NEXT FROM pkCursor INTO @pkName, @pkTable, @pkCols;
END

CLOSE pkCursor;
DEALLOCATE pkCursor;

-- ============================================================================
-- 3. UNIQUE CONSTRAINTS
-- ============================================================================
PRINT '-- =================================================================';
PRINT '-- UNIQUE CONSTRAINTS';
PRINT '-- =================================================================';
PRINT '';

DECLARE @uqName NVARCHAR(128), @uqTable NVARCHAR(128), @uqCols NVARCHAR(MAX);

DECLARE uqCursor CURSOR LOCAL FAST_FORWARD FOR
    SELECT
        i.name,
        t.name,
        STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal)
    FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
    JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
    WHERE i.is_unique_constraint = 1 AND t.is_ms_shipped = 0 AND t.name <> 'sysdiagrams'
    GROUP BY i.name, t.name
    ORDER BY t.name;

OPEN uqCursor;
FETCH NEXT FROM uqCursor INTO @uqName, @uqTable, @uqCols;

WHILE @@FETCH_STATUS = 0
BEGIN
    PRINT 'IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N''' + @uqName + ''')';
    PRINT '    ALTER TABLE [dbo].[' + @uqTable + '] ADD CONSTRAINT [' + @uqName + '] UNIQUE ([' +
        REPLACE(@uqCols, ', ', '], [') + ']);';
    PRINT 'GO';
    PRINT '';
    FETCH NEXT FROM uqCursor INTO @uqName, @uqTable, @uqCols;
END

CLOSE uqCursor;
DEALLOCATE uqCursor;

-- ============================================================================
-- 4. FOREIGN KEYS
-- ============================================================================
PRINT '-- =================================================================';
PRINT '-- FOREIGN KEYS';
PRINT '-- =================================================================';
PRINT '';

DECLARE @fkName NVARCHAR(128), @fkChild NVARCHAR(128), @fkChildCol NVARCHAR(128);
DECLARE @fkParent NVARCHAR(128), @fkParentCol NVARCHAR(128);
DECLARE @fkDeleteAction NVARCHAR(20), @fkUpdateAction NVARCHAR(20);

DECLARE fkCursor CURSOR LOCAL FAST_FORWARD FOR
    SELECT
        fk.name,
        OBJECT_NAME(fk.parent_object_id),
        cp.name,
        OBJECT_NAME(fk.referenced_object_id),
        cr.name,
        fk.delete_referential_action_desc,
        fk.update_referential_action_desc
    FROM sys.foreign_keys fk
    JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
    JOIN sys.columns cp ON cp.object_id = fkc.parent_object_id AND cp.column_id = fkc.parent_column_id
    JOIN sys.columns cr ON cr.object_id = fkc.referenced_object_id AND cr.column_id = fkc.referenced_column_id
    JOIN sys.tables t ON t.object_id = fk.parent_object_id
    WHERE t.is_ms_shipped = 0 AND t.name <> 'sysdiagrams'
    ORDER BY fk.name;

OPEN fkCursor;
FETCH NEXT FROM fkCursor INTO @fkName, @fkChild, @fkChildCol, @fkParent, @fkParentCol, @fkDeleteAction, @fkUpdateAction;

WHILE @@FETCH_STATUS = 0
BEGIN
    SET @line = 'IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N''' + @fkName + ''')';
    PRINT @line;
    SET @line = '    ALTER TABLE [dbo].[' + @fkChild + '] ADD CONSTRAINT [' + @fkName + ']';
    PRINT @line;
    SET @line = '        FOREIGN KEY ([' + @fkChildCol + ']) REFERENCES [dbo].[' + @fkParent + '] ([' + @fkParentCol + '])';
    IF @fkDeleteAction <> 'NO_ACTION'
        SET @line = @line + ' ON DELETE ' + REPLACE(@fkDeleteAction, '_', ' ');
    IF @fkUpdateAction <> 'NO_ACTION'
        SET @line = @line + ' ON UPDATE ' + REPLACE(@fkUpdateAction, '_', ' ');
    SET @line = @line + ';';
    PRINT @line;
    PRINT 'GO';
    PRINT '';

    FETCH NEXT FROM fkCursor INTO @fkName, @fkChild, @fkChildCol, @fkParent, @fkParentCol, @fkDeleteAction, @fkUpdateAction;
END

CLOSE fkCursor;
DEALLOCATE fkCursor;

-- ============================================================================
-- 5. NON-CLUSTERED INDEXES (не PK, не UNIQUE constraint)
-- ============================================================================
PRINT '-- =================================================================';
PRINT '-- INDEXES';
PRINT '-- =================================================================';
PRINT '';

DECLARE @ixName NVARCHAR(128), @ixTable NVARCHAR(128), @ixCols NVARCHAR(MAX), @ixUnique BIT;

DECLARE ixCursor CURSOR LOCAL FAST_FORWARD FOR
    SELECT
        i.name,
        t.name,
        STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal),
        i.is_unique
    FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
    JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
    WHERE i.is_primary_key = 0
      AND i.is_unique_constraint = 0
      AND i.type IN (1, 2) -- CLUSTERED or NONCLUSTERED
      AND t.is_ms_shipped = 0
      AND t.name <> 'sysdiagrams'
      AND i.name IS NOT NULL
    GROUP BY i.name, t.name, i.is_unique, i.type
    ORDER BY t.name, i.name;

OPEN ixCursor;
FETCH NEXT FROM ixCursor INTO @ixName, @ixTable, @ixCols, @ixUnique;

WHILE @@FETCH_STATUS = 0
BEGIN
    PRINT 'IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N''' + @ixName + ''')';
    SET @line = '    CREATE ';
    IF @ixUnique = 1 SET @line = @line + 'UNIQUE ';
    SET @line = @line + 'NONCLUSTERED INDEX [' + @ixName + '] ON [dbo].[' + @ixTable + '] ([' +
        REPLACE(@ixCols, ', ', '], [') + ']);';
    PRINT @line;
    PRINT 'GO';
    PRINT '';
    FETCH NEXT FROM ixCursor INTO @ixName, @ixTable, @ixCols, @ixUnique;
END

CLOSE ixCursor;
DEALLOCATE ixCursor;

PRINT '-- =================================================================';
PRINT '-- ГОТОВО. Выполнить этот вывод на FormulaD_TEST.';
PRINT '-- =================================================================';
